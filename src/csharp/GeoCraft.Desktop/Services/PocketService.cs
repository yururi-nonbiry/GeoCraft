using System;
using System.Collections.Generic;
using System.Linq;
using NetTopologySuite.Geometries;
using NetTopologySuite.Operation.Buffer;
using GeoCraft.Desktop.Models;

namespace GeoCraft.Desktop.Services
{
    public class PocketService
    {
        private GeometryFactory _factory = new GeometryFactory();

        private LinearRing ToClosedRing(List<double[]> points)
        {
            var coordinates = points.Select(p => new Coordinate(p[0], p[1])).ToArray();
            if (!coordinates[0].Equals2D(coordinates.Last()))
            {
                coordinates = coordinates.Concat(new[] { coordinates[0] }).ToArray();
            }
            return _factory.CreateLinearRing(coordinates);
        }

        public object GeneratePocket(List<double[]> geometryData, double toolDiameter, double stepover, double stockToLeave = 0.0, List<List<double[]>> holes = null)
        {
             if (stepover <= 0)
             {
                 return new { status = "error", message = "Stepover must be greater than zero." };
             }

             if (geometryData == null || geometryData.Count < 3)
            {
                return new { status = "error", message = "Invalid geometry. At least 3 points required." };
            }

            try
            {
                var shell = ToClosedRing(geometryData);
                var holeRings = (holes ?? new List<List<double[]>>())
                    .Where(h => h != null && h.Count >= 3)
                    .Select(ToClosedRing)
                    .ToArray();

                var mainPoly = _factory.CreatePolygon(shell, holeRings);
                if (!mainPoly.IsValid)
                {
                     var fixedGeom = mainPoly.Buffer(0);
                     if (fixedGeom is Polygon poly)
                     {
                         mainPoly = poly;
                     }
                     else if (fixedGeom is MultiPolygon mp && mp.NumGeometries > 0)
                     {
                         mainPoly = (Polygon)mp.GetGeometryN(0);
                     }
                     else
                     {
                         return new { status = "error", message = "Invalid polygon geometry." };
                     }
                }

                List<List<double[]>> allPaths = new List<List<double[]>>();
                double currentOffset = -((toolDiameter / 2.0) + stockToLeave); // Start inside

                var bufferParams = new BufferParameters();
                bufferParams.EndCapStyle = EndCapStyle.Flat; // Python used default? Python join_style=2 (MITRE). NTS default is ROUND.
                bufferParams.JoinStyle = JoinStyle.Mitre; 

                while (true)
                {
                    var offsetGeometry = mainPoly.Buffer(currentOffset, bufferParams);

                    if (offsetGeometry.IsEmpty) break;

                    List<Polygon> polygons = new List<Polygon>();
                    if (offsetGeometry is Polygon p) polygons.Add(p);
                    else if (offsetGeometry is MultiPolygon mp) 
                    {
                        for(int i=0; i<mp.NumGeometries; i++) polygons.Add((Polygon)mp.GetGeometryN(i));
                    }

                    foreach (var poly in polygons)
                    {
                         allPaths.Add(poly.ExteriorRing.Coordinates.Select(c => new[] { c.X, c.Y }).ToList());
                         for (int i = 0; i < poly.NumInteriorRings; i++)
                         {
                             allPaths.Add(poly.GetInteriorRingN(i).Coordinates.Select(c => new[] { c.X, c.Y }).ToList());
                         }
                    }

                    currentOffset -= stepover;
                }

                if (allPaths.Count == 0)
                {
                    return new { status = "error", message = "ジオメトリが工具径に対して小さすぎるため、ポケットパスを生成できません。" };
                }

                return new { status = "success", toolpaths = allPaths };
            }
            catch (Exception ex)
            {
                return new { status = "error", message = ex.Message };
            }
        }
    }
}
