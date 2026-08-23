using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace GeoCraft.Desktop.Services
{
    public class GcodeService
    {
        private class GcodeGenerateParams
        {
            public List<ToolpathSegmentDto> toolpaths = new List<ToolpathSegmentDto>();
            public double feedRate;
            public double safeZ;
            public double stepDown;
            public double? retractZ;
        }

        private class ToolpathSegmentDto
        {
            public string? type;
            public List<double[]>? points;
            public double[]? end;
            public double[]? center;
            public string? direction;
        }

        public object GenerateGcode(string paramsJson)
        {
            try
            {
                // toolpathsは3Dラフィングだと数万点規模になり得るため、dynamic/JObjectでの
                // 逐点アクセスは遅くUIスレッドを長時間ブロックしてしまう。型付きデシリアライズで
                // 高速化する(挙動はdynamic版と同一に保つ)。
                var p = JsonConvert.DeserializeObject<GcodeGenerateParams>(paramsJson) ?? new GcodeGenerateParams();
                var toolpaths = p.toolpaths;
                double feedRate = p.feedRate;
                double safeZ = p.safeZ;
                double stepDown = p.stepDown;
                double retractZ = p.retractZ ?? 2.0;

                GcodeWriter writer = new GcodeWriter();
                writer.WriteHeader("G90 G21 G17");
                writer.SpindleOn(1000);
                writer.RapidMove(z: safeZ);

                double[]? currentXy = null;
                bool isCutting = false;

                foreach (var segment in toolpaths)
                {
                    var points = segment.points;
                    if (points == null || points.Count == 0) continue;

                    var start = points[0];
                    // 3Dラフィングパスの点は[x, y, z]でスライスごとの実際の深さを持つ。
                    // 2D輪郭/ポケットパスは[x, y]のみのため、その場合はマシン設定のstepDownを深さとして使う。
                    double startZ = start.Length > 2 ? start[2] : stepDown;
                    if (currentXy == null || !IsClose(currentXy, start))
                    {
                        if (isCutting)
                        {
                            writer.RapidMove(z: retractZ);
                            isCutting = false;
                        }
                        writer.RapidMove(x: start[0], y: start[1]);
                        writer.LinearMove(z: startZ, feed: feedRate / 2);
                        isCutting = true;
                    }
                    else if (!isCutting)
                    {
                        writer.LinearMove(z: startZ, feed: feedRate / 2);
                        isCutting = true;
                    }

                    if (segment.type == "arc")
                    {
                         var end = segment.end;
                         var center = segment.center;
                         if (end == null || center == null) continue;

                         double i = center[0] - start[0];
                         double j = center[1] - start[1];
                         string code = segment.direction == "cw" ? "G02" : "G03";

                         writer.ArcMove(code, end[0], end[1], i, j, feedRate);
                         currentXy = end;
                    }
                    else // line
                    {
                        for (int k = 1; k < points.Count; k++)
                        {
                            var pt = points[k];
                            double? z = pt.Length > 2 ? pt[2] : (double?)null;
                            writer.LinearMove(x: pt[0], y: pt[1], z: z, feed: feedRate);
                            currentXy = pt;
                        }
                    }
                }

                if (isCutting)
                {
                    writer.RapidMove(z: safeZ);
                }

                writer.WriteFooter(null);

                return new { status = "success", gcode = writer.ToString() };

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

        private bool IsClose(double[] p1, double[]? p2)
        {
            if (p2 == null) return false;
            return Math.Abs(p1[0] - p2[0]) < 1e-4 && Math.Abs(p1[1] - p2[1]) < 1e-4;
        }
    }
}
