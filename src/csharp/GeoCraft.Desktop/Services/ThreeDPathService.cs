using System;
using System.Collections.Generic;
using System.Diagnostics;
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
            var removalAreas = new Geometry?[totalSlices];
            var sliceResults = new List<object>?[totalSlices];
            int completedSlices = 0;
            // 除去領域の計算(フェーズ1)・貫通領域の判定(フェーズ2)・パス生成(フェーズ3)の
            // 3段階分の進捗を合わせて報告する。フェーズ2は逐次処理で時間がかかることがあるため、
            // ここで進捗を報告しないと画面が固まったように見えてしまう。
            int progressTotal = totalSlices * 3;

            var stopwatch = Stopwatch.StartNew();
            LogService.Log($"GenerateToolpath: start, {totalSlices} slices");

            // フェーズ1: 各スライスの除去領域(stockArea - targetArea)を求める。スライスごとに独立して
            // 計算できるため並列化する。SliceToUnionは呼び出しのたびにメッシュを複製してからカットする
            // ため元のメッシュを変更せず、スレッド間でstockMesh/targetMeshを安全に共有できる。
            Parallel.For(0, totalSlices, i =>
            {
                try
                {
                    double z = zLevels[i];
                    var stockArea = SliceToUnion(stockMesh, stockBounds, z);
                    if (stockArea != null && !stockArea.IsEmpty)
                    {
                        var targetArea = SliceToUnion(targetMesh, targetBounds, z);
                        Geometry removalArea = (targetArea != null && !targetArea.IsEmpty)
                            ? stockArea.Difference(targetArea)
                            : stockArea;

                        if (!removalArea.IsEmpty) removalAreas[i] = removalArea;
                    }
                }
                catch (Exception ex)
                {
                    // 1スライスの幾何演算(NTSのBuffer/Difference等)が失敗しても、他の正常なスライスの
                    // 結果やGenerateToolpath全体の完了を妨げないよう、このスライスだけ空扱いにして続行する。
                    LogService.Log($"GenerateToolpath: slice {i} removal-area failed: {ex.Message}");
                }

                int done = Interlocked.Increment(ref completedSlices);
                onProgress?.Invoke(done, progressTotal);
            });

            LogService.Log($"GenerateToolpath: removal areas done in {stopwatch.ElapsedMilliseconds}ms");

            // フェーズ2: 最も深いレベル(zBottom側)から浅い方へ積算し、「このレベルから最深部まで
            // ずっと除去領域が続いている」領域(=貫通していて、輪郭さえ切り離せばスクラップとして
            // 分離できるため内部を全部削る必要がない領域)を求める。各レベルの結果が1つ深いレベルの
            // 結果に依存するため、このフェーズだけは逐次処理する(演算自体は多角形の交差のみで軽い)。
            var throughRegions = new Geometry?[totalSlices];
            for (int i = totalSlices - 1; i >= 0; i--)
            {
                try
                {
                    var removalArea = removalAreas[i];
                    if (removalArea != null)
                    {
                        if (i == totalSlices - 1)
                        {
                            throughRegions[i] = removalArea;
                        }
                        else
                        {
                            var below = throughRegions[i + 1];
                            if (below != null && !below.IsEmpty)
                            {
                                var through = removalArea.Intersection(below);
                                if (!through.IsEmpty) throughRegions[i] = through;
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    LogService.Log($"GenerateToolpath: slice {i} through-region failed: {ex.Message}");
                }

                // フェーズ2は依存関係上逐次処理になるため、ここで進捗を報告しないとフェーズ1完了後
                // 画面の進捗バーが止まって見え(実際には計算中でも)ユーザーにはフリーズしたように映る。
                int done = Interlocked.Increment(ref completedSlices);
                onProgress?.Invoke(done, progressTotal);
            }

            LogService.Log($"GenerateToolpath: through regions done in {stopwatch.ElapsedMilliseconds}ms");

            // フェーズ3: 貫通領域は境界を1周切削するだけにとどめ(内部のクリアランスは省略)、それ以外
            // (最終形状として底が残るポケット)は従来通り同心オフセットで内部まで全面クリアする。
            // フェーズ1で求めた除去領域とフェーズ2の貫通領域が確定していれば各スライスは独立なので
            // 再び並列化できる。
            Parallel.For(0, totalSlices, i =>
            {
                try
                {
                    var removalArea = removalAreas[i];
                    if (removalArea != null)
                    {
                        double z = zLevels[i];
                        var through = throughRegions[i];
                        var hasThrough = through != null && !through.IsEmpty;
                        var remainder = hasThrough ? removalArea.Difference(through!) : removalArea;

                        var slicePaths = new List<object>();
                        if (hasThrough)
                        {
                            foreach (var path in OffsetInward(through!, toolDiameter, stepover, boundaryOnly: true))
                            {
                                slicePaths.Add(new
                                {
                                    type = "line",
                                    points = path.Select(p => new[] { p[0], p[1], z }).ToList()
                                });
                            }
                        }
                        if (!remainder.IsEmpty)
                        {
                            foreach (var path in OffsetInward(remainder, toolDiameter, stepover))
                            {
                                slicePaths.Add(new
                                {
                                    type = "line",
                                    points = path.Select(p => new[] { p[0], p[1], z }).ToList()
                                });
                            }
                        }
                        if (slicePaths.Count > 0) sliceResults[i] = slicePaths;
                    }
                }
                catch (Exception ex)
                {
                    LogService.Log($"GenerateToolpath: slice {i} path-gen failed: {ex.Message}");
                }

                int done = Interlocked.Increment(ref completedSlices);
                onProgress?.Invoke(done, progressTotal);
            });

            LogService.Log($"GenerateToolpath: all slices done in {stopwatch.ElapsedMilliseconds}ms, building result");

            var toolpaths = new List<object>();
            foreach (var slice in sliceResults)
            {
                if (slice != null) toolpaths.AddRange(slice);
            }

            LogService.Log($"GenerateToolpath: returning {toolpaths.Count} toolpath segments, total {stopwatch.ElapsedMilliseconds}ms");

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

        // boundaryOnly=trueの場合、工具径ぶんの最初の1周分だけを返し、以降の内側への
        // オフセット(内部の全面クリアランス)は行わない。貫通領域は輪郭さえ切削すれば
        // スクラップとして分離できるため、内部を削る時間を省くのに使う。
        private List<List<double[]>> OffsetInward(Geometry area, double toolDiameter, double stepover, bool boundaryOnly = false)
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

                if (boundaryOnly) break;
                currentOffset -= stepover;
            }
            return allPaths;
        }
    }
}
