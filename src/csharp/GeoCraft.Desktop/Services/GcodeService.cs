using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;

namespace GeoCraft.Desktop.Services
{
    public class GcodeService
    {
        public object GenerateGcode(string paramsJson)
        {
            try
            {
                dynamic p = JObject.Parse(paramsJson);
                var toolpaths = p.toolpaths;
                double feedRate = p.feedRate;
                double safeZ = p.safeZ;
                double stepDown = p.stepDown;

                StringBuilder sb = new StringBuilder();
                sb.AppendLine("%");
                sb.AppendLine("O0001");
                sb.AppendLine("G90 G21 G17");
                sb.AppendLine("M03 S1000");
                sb.AppendLine($"G00 Z{Format(safeZ)}");

                double[] currentXy = null;
                bool isCutting = false;

                foreach (var segment in toolpaths)
                {
                    string? type = (string?)segment.type;
                    var pointsToken = segment.points as JArray;
                    if (pointsToken == null) continue;

                    var points = pointsToken.Select(pt => pt.ToObject<double[]>()).Where(p => p != null).Select(p => p!).ToList();
                    
                    if (points.Count == 0) continue;

                    var start = points[0];
                    if (currentXy == null || !IsClose(currentXy, start))
                    {
                        if (isCutting)
                        {
                            sb.AppendLine($"G00 Z{Format(safeZ)}");
                            isCutting = false;
                        }
                        sb.AppendLine($"G00 X{Format(start[0])} Y{Format(start[1])}");
                        sb.AppendLine($"G01 Z{Format(stepDown)} F{Format(feedRate / 2)}");
                        isCutting = true;
                    } 
                    else if (!isCutting)
                    {
                        sb.AppendLine($"G01 Z{Format(stepDown)} F{Format(feedRate / 2)}");
                        isCutting = true;
                    }

                    if (type == "arc")
                    {
                         // Handle Arc
                         // Frontend sends: { type: 'arc', start, end, center, direction }
                         // But wait, the paramsJson might have toolpaths as list of segments.
                         var end = segment.end.ToObject<double[]>();
                         var center = segment.center.ToObject<double[]>();
                         string direction = segment.direction;
                         
                         double i = center[0] - start[0];
                         double j = center[1] - start[1];
                         string code = direction == "cw" ? "G02" : "G03";
                         
                         sb.AppendLine($"{code} X{Format(end[0])} Y{Format(end[1])} I{Format(i)} J{Format(j)} F{Format(feedRate)}");
                         currentXy = end;
                    }
                    else // line
                    {
                        for (int k = 1; k < points.Count; k++)
                        {
                            var pt = points[k];
                            sb.AppendLine($"G01 X{Format(pt[0])} Y{Format(pt[1])} F{Format(feedRate)}");
                            currentXy = pt;
                        }
                    }
                }

                if (isCutting)
                {
                    sb.AppendLine($"G00 Z{Format(safeZ)}");
                }

                sb.AppendLine("M05");
                sb.AppendLine("M30");
                sb.AppendLine("%");

                // Save to file? Original python returned gcode string, and main.ts saved it.
                // The main.ts called dialog.showSaveDialog.
                // Here I can return the gcode string, and let the bridge handle saving?
                // Or I can handle saving here.
                // The Bridge stub calling GenerateGcode currently expects to return JSON status.
                // And main.ts logic: "ipcMain.handle... callPython... showSaveDialog... writeFileSync"
                
                // My Bridge stub signature: `GenerateGcode(string paramsJson)`.
                // I should replicate main.ts logic: Generate string -> Show Save Dialog -> Save.
                // So this service should return the string, and Bridge will show dialog.
                
                return new { status = "success", gcode = sb.ToString() };

            }
            catch (Exception ex)
            {
                return new { status = "error", message = ex.Message };
            }
        }

        public object GenerateDrillGcode(string paramsJson)
        {
             // TODO: Implement Drill GCode
             return new { status = "error", message = "Not implemented yet" };
        }

        private string Format(double val)
        {
            return val.ToString("F3", CultureInfo.InvariantCulture);
        }


        private bool IsClose(double[] p1, double[]? p2)
        {
            if (p2 == null) return false;
            return Math.Abs(p1[0] - p2[0]) < 1e-4 && Math.Abs(p1[1] - p2[1]) < 1e-4;
        }
    }
}
