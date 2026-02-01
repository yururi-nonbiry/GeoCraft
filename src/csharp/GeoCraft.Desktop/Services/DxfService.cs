using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using GeoCraft.Desktop.Models;
using IxMilia.Dxf;
using IxMilia.Dxf.Entities;

namespace GeoCraft.Desktop.Services
{
    public class DxfService
    {
        public DxfResult ParseDxf(string filePath)
        {
            var result = new DxfResult();
            try
            {
                if (!File.Exists(filePath))
                {
                    result.status = "error";
                    result.message = "File not found.";
                    return result;
                }

                var dxfFile = DxfFile.Load(filePath);
                foreach (var entity in dxfFile.Entities)
                {
                    if (entity is DxfLine line)
                    {
                        result.segments.Add(new List<double[]>
                        {
                            new[] { line.P1.X, line.P1.Y, line.P1.Z },
                            new[] { line.P2.X, line.P2.Y, line.P2.Z }
                        });
                    }
                    else if (entity is DxfLwPolyline poly)
                    {
                        ProcessLwPolyline(poly, result);
                    }
                    else if (entity is DxfCircle circle)
                    {
                        var center = new[] { circle.Center.X, circle.Center.Y, circle.Center.Z };
                        result.drill_points.Add(center);
                        result.arcs.Add(new DxfArcData
                        {
                            center = center,
                            radius = circle.Radius,
                            start_angle = 0,
                            end_angle = 360
                        });
                    }
                    else if (entity is DxfArc arc)
                    {
                        result.arcs.Add(new DxfArcData
                        {
                            center = new[] { arc.Center.X, arc.Center.Y, arc.Center.Z },
                            radius = arc.Radius,
                            start_angle = arc.StartAngle,
                            end_angle = arc.EndAngle
                        });
                    }
                    else if (entity is DxfPolyline oldPoly)
                    {
                         // Treat same as LwPolyline but usually no bulge? 
                         // Just segments
                         var verts = oldPoly.Vertices;
                         for(int i=0; i<verts.Count-1; i++)
                         {
                             result.segments.Add(new List<double[]> {
                                 new[] { verts[i].Location.X, verts[i].Location.Y, verts[i].Location.Z },
                                 new[] { verts[i+1].Location.X, verts[i+1].Location.Y, verts[i+1].Location.Z }
                             });
                         }
                         if (oldPoly.IsClosed && verts.Count > 1)
                         {
                             result.segments.Add(new List<double[]> {
                                 new[] { verts.Last().Location.X, verts.Last().Location.Y, verts.Last().Location.Z },
                                 new[] { verts[0].Location.X, verts[0].Location.Y, verts[0].Location.Z }
                             });
                         }
                    }
                    else if (entity is DxfSpline spline)
                    {
                        // Needs flattening. IxMilia doesn't have built-in flattening?
                        // Simple approximation for now or skip.
                        // TODO: Implement Spline flattening
                    }
                }
            }
            catch (Exception ex)
            {
                result.status = "error";
                result.message = ex.Message;
            }
            return result;
        }

        private void ProcessLwPolyline(DxfLwPolyline poly, DxfResult result)
        {
            var vertices = poly.Vertices;
            int count = vertices.Count;
            if (count < 2) return;

            for (int i = 0; i < count; i++)
            {
                int nextIdx = (i + 1) % count;
                if (nextIdx == 0 && !poly.IsClosed) break;

                var v1 = vertices[i];
                var v2 = vertices[nextIdx];
                
                var start = new[] { v1.X, v1.Y, poly.Elevation };
                var end = new[] { v2.X, v2.Y, poly.Elevation };

                result.segments.Add(new List<double[]> { start, end });

                if (Math.Abs(v1.Bulge) > 1e-8)
                {
                    var arc = BulgeToArc(start, end, v1.Bulge, poly.Elevation);
                    if (arc != null)
                    {
                        result.arcs.Add(arc);
                    }
                }
            }
        }

        private DxfArcData? BulgeToArc(double[] start, double[] end, double bulge, double elevation)
        {
            double dx = end[0] - start[0];
            double dy = end[1] - start[1];
            double chord = Math.Sqrt(dx*dx + dy*dy);
            if (chord < 1e-8) return null;

            double theta = 4 * Math.Atan(bulge);
            double radius = chord / (2 * Math.Abs(Math.Sin(theta / 2)));
            if (radius <= 0) return null;

            double midX = (start[0] + end[0]) / 2;
            double midY = (start[1] + end[1]) / 2;
            double dirX = dx / chord;
            double dirY = dy / chord;
            double perpX = -dirY;
            double perpY = dirX;

            double sagitta = Math.Sqrt(Math.Max(0, radius * radius - (chord / 2) * (chord / 2)));
            double sign = bulge > 0 ? 1 : -1;

            double centerX = midX + perpX * sagitta * sign;
            double centerY = midY + perpY * sagitta * sign;

            double startAngle = Math.Atan2(start[1] - centerY, start[0] - centerX) * 180.0 / Math.PI;
            double endAngle = Math.Atan2(end[1] - centerY, end[0] - centerX) * 180.0 / Math.PI;

            if (sign > 0 && endAngle <= startAngle) endAngle += 360;
            else if (sign < 0 && endAngle >= startAngle) endAngle -= 360;

            return new DxfArcData
            {
                center = new[] { centerX, centerY, elevation },
                radius = radius,
                start_angle = startAngle,
                end_angle = endAngle
            };
        }
    }
}
