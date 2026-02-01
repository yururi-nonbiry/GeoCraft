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

        public object GeneratePocket(List<double[]> geometryData, double toolDiameter, double stepover)
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

                var mainPoly = _factory.CreatePolygon(coordinates);
                if (!mainPoly.IsValid)
                {
                     mainPoly = (Polygon)mainPoly.Buffer(0);
                     if (!mainPoly.IsValid) return new { status = "error", message = "Invalid polygon geometry." };
                }

                List<List<double[]>> allPaths = new List<List<double[]>>();
                double currentOffset = -(toolDiameter / 2.0); // Start inside

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
                         // Python only took exterior. What about holes?
                         // Python: path = list(poly.exterior.coords). Holes ignored? Yes.
                    }

                    currentOffset -= stepover;
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
