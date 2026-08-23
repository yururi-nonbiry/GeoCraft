using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using g3;
using NetTopologySuite.Geometries;
using NetTopologySuite.Operation.Buffer;
using GeoCraft.Desktop.Models;

namespace GeoCraft.Desktop.Services
{
    public class ThreeDPathService
    {
        private GeometryFactory _factory = new GeometryFactory();

        public object GenerateToolpath(string stockPath, string targetPath, double sliceHeight, double toolDiameter, double stepoverRatio, Action<int, int>? onProgress = null)
        {
            if (string.IsNullOrEmpty(stockPath) || string.IsNullOrEmpty(targetPath))
            {
                return new { status = "error", message = "材料と加工後形状のSTLファイルを指定してください。" };
            }
            if (sliceHeight <= 0)
            {
                return new { status = "error", message = "スライス厚は0より大きい値を指定してください。" };
            }
            if (toolDiameter <= 0)
            {
                return new { status = "error", message = "工具径は0より大きい値を指定してください。" };
            }
            if (stepoverRatio <= 0 || stepoverRatio > 1)
            {
                return new { status = "error", message = "ステップオーバー率は0より大きく1以下の値を指定してください。" };
            }

            DMesh3 stockMesh = StandardMeshReader.ReadMesh(stockPath);
            DMesh3 targetMesh = StandardMeshReader.ReadMesh(targetPath);

            if (stockMesh == null || stockMesh.TriangleCount == 0)
            {
                return new { status = "error", message = "材料STLの読み込みに失敗しました。" };
            }
            if (targetMesh == null || targetMesh.TriangleCount == 0)
            {
                return new { status = "error", message = "加工後形状STLの読み込みに失敗しました。" };
            }

            AxisAlignedBox3d stockBounds = stockMesh.GetBounds();
            AxisAlignedBox3d targetBounds = targetMesh.GetBounds();

            double zTop = stockBounds.Max.z;
            double zBottom = targetBounds.Min.z;

            if (zTop <= zBottom)
            {
                return new { status = "error", message = "材料と加工後形状の高さの関係が不正です。材料の上面が加工後形状の下面より高い必要があります。" };
            }

            double stepover = toolDiameter * stepoverRatio;

            var zLevels = new List<double>();
            for (double zLevel = zTop - sliceHeight; zLevel > zBottom + 1e-6; zLevel -= sliceHeight)
            {
                zLevels.Add(zLevel);
            }

            int totalSlices = zLevels.Count;
            var sliceResults = new List<object>?[totalSlices];
            int completedSlices = 0;

            // 各スライスは独立して計算できるため並列化する。SliceToUnionは呼び出しのたびに
            // メッシュを複製してからカットするため元のメッシュを変更せず、スレッド間で
            // stockMesh/targetMeshを安全に共有できる。
            Parallel.For(0, totalSlices, i =>
            {
                double z = zLevels[i];
                var stockArea = SliceToUnion(stockMesh, stockBounds, z);
                if (stockArea != null && !stockArea.IsEmpty)
                {
                    var targetArea = SliceToUnion(targetMesh, targetBounds, z);
                    Geometry removalArea = (targetArea != null && !targetArea.IsEmpty)
                        ? stockArea.Difference(targetArea)
                        : stockArea;

                    if (!removalArea.IsEmpty)
                    {
                        var slicePaths = new List<object>();
                        foreach (var path in OffsetInward(removalArea, toolDiameter, stepover))
                        {
                            slicePaths.Add(new
                            {
                                type = "line",
                                points = path.Select(p => new[] { p[0], p[1], z }).ToList()
                            });
                        }
                        sliceResults[i] = slicePaths;
                    }
                }

                int done = Interlocked.Increment(ref completedSlices);
                onProgress?.Invoke(done, totalSlices);
            });

            var toolpaths = new List<object>();
            foreach (var slice in sliceResults)
            {
                if (slice != null) toolpaths.AddRange(slice);
            }

            return new { status = "success", toolpaths };
        }

        private Geometry? SliceToUnion(DMesh3 sourceMesh, AxisAlignedBox3d bounds, double z)
        {
            if (z <= bounds.Min.z || z >= bounds.Max.z) return null;

            // MeshPlaneCutは渡されたメッシュを直接カットして変更するため、呼び出しごとに
            // 複製してから使う。元メッシュ(stockMesh/targetMesh)を変更しないことで、
            // 他のスライスの計算結果に影響を与えず、並列実行でも安全になる。
            var mesh = new DMesh3(sourceMesh, false, true, true, true);
            var cut = new MeshPlaneCut(mesh, new Vector3d(0, 0, z), new Vector3d(0, 0, 1));
            if (!cut.Cut()) return null;

            var polygons = new List<Polygon>();
            foreach (var loop in cut.CutLoops)
            {
                var curve = loop.ToCurve(mesh);
                var coords = curve.Vertices.Select(v => new Coordinate(v.x, v.y)).ToList();
                if (coords.Count < 3) continue;
                if (!coords[0].Equals2D(coords[coords.Count - 1])) coords.Add(coords[0]);

                try
                {
                    var poly = _factory.CreatePolygon(coords.ToArray());
                    if (!poly.IsValid)
                    {
                        var fixedGeom = poly.Buffer(0);
                        if (fixedGeom is Polygon fp) poly = fp;
                        else continue;
                    }
                    if (poly.Area > 1e-6) polygons.Add(poly);
                }
                catch
                {
                    // Skip degenerate loops
                }
            }

            if (polygons.Count == 0) return null;

            // 各ループは外形か穴かをここでは判別できないため、対称差(XOR/偶奇規則)で合成する。
            // ネストしたループは外形→穴→島…の順に交互に加算/減算され、正しい「穴あき断面」になる。
            Geometry union = polygons[0];
            for (int i = 1; i < polygons.Count; i++) union = union.SymmetricDifference(polygons[i]);
            return union;
        }

        private List<List<double[]>> OffsetInward(Geometry area, double toolDiameter, double stepover)
        {
            var allPaths = new List<List<double[]>>();
            var bufferParams = new BufferParameters { EndCapStyle = EndCapStyle.Flat, JoinStyle = JoinStyle.Mitre };

            double currentOffset = -(toolDiameter / 2.0);
            while (true)
            {
                var offsetGeometry = area.Buffer(currentOffset, bufferParams);
                if (offsetGeometry.IsEmpty) break;

                var polygons = new List<Polygon>();
                if (offsetGeometry is Polygon p) polygons.Add(p);
                else if (offsetGeometry is MultiPolygon mp)
                {
                    for (int i = 0; i < mp.NumGeometries; i++) polygons.Add((Polygon)mp.GetGeometryN(i));
                }

                if (polygons.Count == 0) break;

                foreach (var poly in polygons)
                {
                    allPaths.Add(poly.ExteriorRing.Coordinates.Select(c => new[] { c.X, c.Y }).ToList());
                    foreach (var hole in poly.InteriorRings)
                    {
                        allPaths.Add(hole.Coordinates.Select(c => new[] { c.X, c.Y }).ToList());
                    }
                }

                currentOffset -= stepover;
            }
            return allPaths;
        }
    }
}
