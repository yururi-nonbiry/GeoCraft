using System;
using System.Collections.Generic;
using System.Diagnostics;
using Newtonsoft.Json;

namespace GeoCraft.Desktop.Services
{
    public class GcodeService
    {
        private class GcodeGenerateParams
        {
            public List<ToolpathSegmentDto> toolpaths = new List<ToolpathSegmentDto>();
            public double feedRate;
            public double? rpm;
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
            var sw = Stopwatch.StartNew();
            try
            {
                // toolpathsは3Dラフィングだと数万点規模になり得るため、dynamic/JObjectでの
                // 逐点アクセスは遅くUIスレッドを長時間ブロックしてしまう。型付きデシリアライズで
                // 高速化する(挙動はdynamic版と同一に保つ)。
                var p = JsonConvert.DeserializeObject<GcodeGenerateParams>(paramsJson) ?? new GcodeGenerateParams();
                LogService.Log($"GenerateGcode: deserialize done at {sw.ElapsedMilliseconds}ms, toolpaths={p.toolpaths.Count}, jsonLen={paramsJson.Length}");
                var toolpaths = p.toolpaths;
                double feedRate = p.feedRate;
                // 安全高さ/退避高さは常にZ+方向(材料から離れる向き)、切込み深さは常にZ-方向(材料に向かう向き)
                // でなければならない。符号を取り違えた値が渡ると退避のつもりが逆に材料側へ動いてしまうため、
                // 呼び出し元(UI/保存済みプロジェクト)の値によらずここで符号を強制する。
                double safeZ = Math.Abs(p.safeZ);
                double stepDown = -Math.Abs(p.stepDown);
                double retractZ = Math.Abs(p.retractZ ?? 2.0);
                int spindleSpeed = (int)(p.rpm ?? 1000);

                GcodeWriter writer = new GcodeWriter();
                writer.WriteHeader("G90 G21 G17");
                writer.SpindleOn(spindleSpeed);
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
                    if (currentXy == null || !IsClose(currentXy, start) || !IsSameZ(currentXy, start))
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

                LogService.Log($"GenerateGcode: segments built at {sw.ElapsedMilliseconds}ms, calling writer.ToString()");
                string gcode = writer.ToString();
                LogService.Log($"GenerateGcode: done at {sw.ElapsedMilliseconds}ms, gcodeLen={gcode.Length}");

                return new { status = "success", gcode };

            }
            catch (Exception ex)
            {
                LogService.Log($"GenerateGcode: failed at {sw.ElapsedMilliseconds}ms: {ex.Message}");
                return new { status = "error", message = ex.Message };
            }
        }

        private class DrillGcodeParams
        {
            public List<double[]> drillPoints = new List<double[]>();
            public double feedRate;
            public double? rpm;
            public double safeZ;
            public double stepDown;
            public double? retractZ;
            public double? peckQ;
        }

        public object GenerateDrillGcode(string paramsJson)
        {
            try
            {
                var p = JsonConvert.DeserializeObject<DrillGcodeParams>(paramsJson) ?? new DrillGcodeParams();
                var points = p.drillPoints;
                if (points.Count == 0)
                {
                    return new { status = "error", message = "ドリル点がありません" };
                }

                double feedRate = p.feedRate;
                double safeZ = Math.Abs(p.safeZ);
                // stepDownは輪郭/ポケット同様、絶対Z座標として扱う(work Z0=表面、負値が掘り込み深さ)。
                // 符号を取り違えると退避が材料側へ動く事故になるため、safeZ/retractZ同様ここで符号を強制する。
                double targetZ = -Math.Abs(p.stepDown);
                double retractZ = Math.Abs(p.retractZ ?? 2.0);
                double peckDepth = Math.Abs(p.peckQ ?? 0.0);
                int spindleSpeed = (int)(p.rpm ?? 1000);

                GcodeWriter writer = new GcodeWriter();
                writer.WriteHeader("G90 G21 G17");
                writer.SpindleOn(spindleSpeed);
                writer.RapidMove(z: safeZ);

                foreach (var point in points)
                {
                    if (point == null || point.Length < 2) continue;
                    double x = point[0];
                    double y = point[1];
                    double surfaceZ = point.Length > 2 ? point[2] : 0.0;

                    writer.RapidMove(x: x, y: y);
                    writer.RapidMove(z: retractZ);

                    // peckQが未指定/0の場合は1回のみの単純ドリル(増分=全深さ)として扱う。
                    double increment = peckDepth > 1e-6 ? peckDepth : (surfaceZ - targetZ);
                    double currentZ = surfaceZ;
                    while (currentZ - targetZ > 1e-6)
                    {
                        double nextZ = Math.Max(currentZ - increment, targetZ);
                        writer.LinearMove(z: nextZ, feed: feedRate);
                        currentZ = nextZ;
                        // 底に到達していなければ切粉排出のため一旦退避してから再度送り込む。
                        if (currentZ - targetZ > 1e-6)
                        {
                            writer.RapidMove(z: retractZ);
                        }
                    }

                    writer.RapidMove(z: safeZ);
                }

                writer.WriteFooter(null);
                string gcode = writer.ToString();
                return new { status = "success", gcode };
            }
            catch (Exception ex)
            {
                LogService.Log($"GenerateDrillGcode: failed: {ex.Message}");
                return new { status = "error", message = ex.Message };
            }
        }

        private bool IsClose(double[] p1, double[]? p2)
        {
            if (p2 == null) return false;
            return Math.Abs(p1[0] - p2[0]) < 1e-4 && Math.Abs(p1[1] - p2[1]) < 1e-4;
        }

        // 3Dラフィングは複数のZレイヤーを別セグメントとして生成するため、XYが一致していても
        // Zが異なる場合は連続パスとみなさず退避させる必要がある。座標に深さ情報を持たない
        // 2D輪郭/ポケットパス(要素数2)は従来通りXYのみで判定する。
        private bool IsSameZ(double[] p1, double[]? p2)
        {
            if (p1.Length <= 2 || p2 == null || p2.Length <= 2) return true;
            return Math.Abs(p1[2] - p2[2]) < 1e-4;
        }
    }
}
