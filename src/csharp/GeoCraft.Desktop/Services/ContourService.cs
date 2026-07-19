using System;
using System.Collections.Generic;
using System.Linq;
using NetTopologySuite.Geometries;
using NetTopologySuite.Operation.Buffer;
using GeoCraft.Desktop.Models;

namespace GeoCraft.Desktop.Services
{
    public class ContourService
    {
        private GeometryFactory _factory = new GeometryFactory();

        public object GenerateContour(double toolDiameter, List<double[]> geometryData, string side, double stockToLeave = 0.0)
        {
             if (geometryData == null || geometryData.Count < 3)
            {
                return new { status = "error", message = "Invalid geometry. At least 3 points required." };
            }

            try
            {
                var coordinates = geometryData.Select(p => new Coordinate(p[0], p[1])).ToArray();
                // Ensure closed
                if (!coordinates[0].Equals2D(coordinates.Last()))
                {
                    coordinates = coordinates.Concat(new[] { coordinates[0] }).ToArray();
                }

                var polygon = _factory.CreatePolygon(coordinates);
                if (!polygon.IsValid)
                {
                     return new { status = "error", message = "Invalid polygon geometry." };
                }

                double toolRadius = toolDiameter / 2.0;
                double offsetDistance = side == "outer" ? (toolRadius + stockToLeave) : -(toolRadius + stockToLeave);

                var bufferParams = new BufferParameters();
                bufferParams.EndCapStyle = EndCapStyle.Round;
                bufferParams.JoinStyle = JoinStyle.Round;

                var offsetGeometry = polygon.Buffer(offsetDistance, bufferParams);

                // オフセットにより形状が分裂すること（くびれ部分がツール径より狭い等）があるため、
                // 分裂した全ての断片を切削可能な範囲として返す（最初の1つだけに絞らない）。
                List<List<double[]>> resultPaths = new List<List<double[]>>();

                if (offsetGeometry is Polygon p)
                {
                    resultPaths.Add(p.ExteriorRing.Coordinates.Select(c => new[] { c.X, c.Y }).ToList());
                }
                else if (offsetGeometry is MultiPolygon mp)
                {
                    for (int i = 0; i < mp.NumGeometries; i++)
                    {
                        var poly = (Polygon)mp.GetGeometryN(i);
                        resultPaths.Add(poly.ExteriorRing.Coordinates.Select(c => new[] { c.X, c.Y }).ToList());
                    }
                }
                else if (offsetGeometry is LineString ls)
                {
                    resultPaths.Add(ls.Coordinates.Select(c => new[] { c.X, c.Y }).ToList());
                }

                if (resultPaths.Count == 0)
                {
                    return new { status = "error", message = "ジオメトリが工具径に対して小さすぎるため、輪郭パスを生成できません。" };
                }

                return new { status = "success", toolpaths = resultPaths };
            }
            catch (Exception ex)
            {
                return new { status = "error", message = ex.Message };
            }
        }
    }
}
