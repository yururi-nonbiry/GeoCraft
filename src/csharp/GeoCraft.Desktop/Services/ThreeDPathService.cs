using System;
using System.Collections.Generic;
using System.Linq;
using g3;
using NetTopologySuite.Geometries;
using NetTopologySuite.Operation.Buffer;
using GeoCraft.Desktop.Models;

namespace GeoCraft.Desktop.Services
{
    public class ThreeDPathService
    {
        private GeometryFactory _factory = new GeometryFactory();

        public object GenerateToolpath(string stockPath, string targetPath, double sliceHeight, double toolDiameter, double stepoverRatio, Action<int, int> onProgress = null)
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
            var toolpaths = new List<object>();

            int totalSlices = Math.Max(1, (int)Math.Ceiling((zTop - zBottom) / sliceHeight));
            int sliceIndex = 0;

            double z = zTop - sliceHeight;
            while (z > zBottom + 1e-6)
            {
                sliceIndex++;
                onProgress?.Invoke(sliceIndex, totalSlices);

                var stockArea = SliceToUnion(stockMesh, stockBounds, z);
                if (stockArea == null || stockArea.IsEmpty)
                {
                    z -= sliceHeight;
                    continue;
                }

                var targetArea = SliceToUnion(targetMesh, targetBounds, z);
                Geometry removalArea = (targetArea != null && !targetArea.IsEmpty)
                    ? stockArea.Difference(targetArea)
                    : stockArea;

                if (!removalArea.IsEmpty)
                {
                    foreach (var path in OffsetInward(removalArea, toolDiameter, stepover))
                    {
                        toolpaths.Add(new
                        {
                            type = "line",
                            points = path.Select(p => new[] { p[0], p[1], z }).ToList()
                        });
                    }
                }

                z -= sliceHeight;
            }

            return new { status = "success", toolpaths };
        }

        private Geometry SliceToUnion(DMesh3 mesh, AxisAlignedBox3d bounds, double z)
        {
            if (z <= bounds.Min.z || z >= bounds.Max.z) return null;

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
