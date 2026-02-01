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

        public object GenerateContour(double toolDiameter, List<double[]> geometryData, string side)
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
                double offsetDistance = side == "outer" ? toolRadius : -toolRadius;

                var bufferParams = new BufferParameters();
                bufferParams.EndCapStyle = EndCapStyle.Round;
                bufferParams.JoinStyle = JoinStyle.Round;

                var offsetGeometry = polygon.Buffer(offsetDistance, bufferParams);

                List<double[]> resultPath = new List<double[]>();

                if (offsetGeometry is Polygon p)
                {
                    resultPath = p.ExteriorRing.Coordinates.Select(c => new[] { c.X, c.Y }).ToList();
                }
                else if (offsetGeometry is MultiPolygon mp)
                {
                    // Take largest? or first? Python took first.
                    resultPath = mp.Geometries[0].Coordinates.Select(c => new[] { c.X, c.Y }).ToList();
                }
                else if (offsetGeometry is LineString ls)
                {
                    resultPath = ls.Coordinates.Select(c => new[] { c.X, c.Y }).ToList();
                }

                return new { status = "success", toolpath = resultPath };
            }
            catch (Exception ex)
            {
                return new { status = "error", message = ex.Message };
            }
        }
    }
}
