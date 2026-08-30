using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;
using Newtonsoft.Json;

using GeoCraft.Desktop.Services;
using GeoCraft.Desktop.Models;
using System.Collections.Generic;

namespace GeoCraft.Desktop
{
    [ClassInterface(ClassInterfaceType.AutoDual)]
    [ComVisible(true)]
    public class GeoCraftBridge
    {
        private MainWindow _mainWindow;
        private DxfService _dxfService;
        private ContourService _contourService;
        private PocketService _pocketService;
        private FileService _fileService;
        private SerialService _serialService;
        private GcodeService _gcodeService;
        private ThreeDPathService _threeDPathService;

        // G-Code Queue Control Fields
        private Queue<string> _gcodeQueue = new Queue<string>();
        private int _totalLines = 0;
        private int _sentLines = 0;
        private bool _isSending = false;
        private bool _isPaused = false;
        private string _receivedBuffer = "";
        private readonly object _stateLock = new object();

        // Grbl's serial RX buffer is 128 bytes; streaming one line at a time and waiting
        // for each "ok" before sending the next leaves Grbl's motion planner with only a
        // single move queued, forcing it to decelerate to a stop between every line. Using
        // Grbl's character-counting protocol (keep the RX buffer topped up with several
        // lines in flight) lets Grbl plan ahead and run moves without stalling.
        private const int GrblRxBufferSize = 127;
        private Queue<int> _sentLineLengths = new Queue<int>();
        private int _unacknowledgedBytes = 0;

        // Grbl doesn't push status reports on its own; it only replies to the
        // real-time '?' query. Poll periodically while connected so WPos/MPos/
        // machine state keep updating in the UI.
        private System.Timers.Timer? _statusPollTimer;
        // WCO (work coordinate offset) is only included in some status reports,
        // so remember the last one seen to reconstruct whichever of MPos/WPos
        // a given report omitted.
        private double[] _lastWco = new double[3];
        // Last known machine position, used to preflight-check jog/G-code moves
        // against the soft limit (MPos must not go below 0 on any axis) below.
        private double[] _lastMpos = new double[3];
        // The soft limit is only meaningful once the machine origin (MPos zero)
        // has actually been established via a successful $H homing cycle, so
        // jog/G-code moves are only restricted while this is true. Cleared on
        // alarm, disconnect, or soft-reset since position trust is lost then.
        private bool _homed = false;
        private bool _awaitingHomeConfirm = false;

        // Set by ProbeZ while a G38.2 probe move is in flight; consumed by the next
        // "ok"/"error"/ALARM line to decide whether to apply the plate-thickness offset
        // and retract, or to report a probe failure.
        private bool _awaitingProbeConfirm = false;
        private double _probeZOffset = 0;
        private double _probeRetract = 5;

        public GeoCraftBridge(MainWindow mainWindow)
        {
            _mainWindow = mainWindow;
            _dxfService = new DxfService();
            _contourService = new ContourService();
            _pocketService = new PocketService();
            _fileService = new FileService();
            _serialService = new SerialService();
            _gcodeService = new GcodeService();
            _threeDPathService = new ThreeDPathService();

            _serialService.OnDataReceived += (data) => {
                 // Broadcast serial data to frontend
                 Broadcast("serial-data", data);

                 // Process for G-code streaming queue
                 lock (_stateLock)
                 {
                     _receivedBuffer += data;
                     while (_receivedBuffer.Contains("\n"))
                     {
                         int index = _receivedBuffer.IndexOf('\n');
                         string line = _receivedBuffer.Substring(0, index).Trim();
                         _receivedBuffer = _receivedBuffer.Substring(index + 1);

                         ProcessReceivedLine(line);
                     }
                 }
            };
        }

        private string ExecuteSafe(Func<object> action)
        {
            try
            {
                var result = action();
                return JsonConvert.SerializeObject(result);
            }
            catch (Exception ex)
            {
                LogService.Log($"Error in bridge execution: {ex.Message}\n{ex.StackTrace}");
                return JsonConvert.SerializeObject(new { status = "error", message = ex.Message });
            }
        }

        // WebView2のホストオブジェクトメソッドはデフォルトでUIスレッド上で実行されるため、
        // GenerateToolpathのような重い処理をそのまま呼ぶとアプリ全体が応答なしになる。
        // Task<string>を返すメソッドはJS側からPromiseとして扱われ、Task完了時に解決されるため、
        // ここでTask.Runしてバックグラウンドスレッドに逃がすことでUIスレッドを解放できる。
        private Task<string> ExecuteSafeAsync(Func<object> action)
        {
            return Task.Run(() => ExecuteSafe(action));
        }

        private void ExecuteSafeVoid(Action action)
        {
            try
            {
                action();
            }
            catch (Exception ex)
            {
                LogService.Log($"Error in bridge void execution: {ex.Message}\n{ex.StackTrace}");
            }
        }

        private void ProcessReceivedLine(string line)
        {
            if (line.StartsWith("<") && line.EndsWith(">"))
            {
                ProcessStatusReport(line);
            }
            else if (line == "ok" || line.StartsWith("error"))
            {
                if (_awaitingHomeConfirm)
                {
                    _awaitingHomeConfirm = false;
                    if (line == "ok")
                    {
                        _homed = true;
                        Broadcast("serial-data", "[安全] 機械原点を設定しました。MPos<0への移動を制限します。");
                    }
                    else
                    {
                        Broadcast("serial-data", "[安全] 機械原点の設定に失敗しました。安全制限は無効のままです。");
                    }
                }
                if (_awaitingProbeConfirm)
                {
                    _awaitingProbeConfirm = false;
                    if (line == "ok")
                    {
                        // The probe move stopped exactly at the trigger point, so the current
                        // position becomes the new work Z origin, offset by the plate thickness.
                        _serialService.Write(GrblCommands.SetWorkZ(_probeZOffset));
                        _serialService.Write(GrblCommands.RetractZ(_probeRetract));
                        Broadcast("serial-data", "[プローブ] Z軸原点を設定しました。");
                        Broadcast("probe-result", new { success = true });
                    }
                    else
                    {
                        Broadcast("serial-data", "[プローブ] センサーに接触しないまま移動量の上限に達しました。Z軸原点は変更していません。");
                        Broadcast("probe-result", new { success = false });
                    }
                }
                // An "ok"/"error" acknowledges the oldest line still in Grbl's RX buffer,
                // regardless of whether streaming is currently paused — the buffer accounting
                // must stay accurate so a subsequent Resume knows how much room is really free.
                if (_sentLineLengths.Count > 0)
                {
                    _unacknowledgedBytes -= _sentLineLengths.Dequeue();
                }
                if (_isSending && !_isPaused)
                {
                    SendNextLine();
                }
            }
            else if (line.StartsWith("ALARM"))
            {
                _homed = false;
                _awaitingHomeConfirm = false;
                if (_awaitingProbeConfirm)
                {
                    _awaitingProbeConfirm = false;
                    Broadcast("serial-data", "[プローブ] アラームが発生したため中止しました。配線を確認し、必要ならアラーム解除($X)を行ってください。");
                    Broadcast("probe-result", new { success = false });
                }
                if (_isSending)
                {
                    // Grbl stops acknowledging queued lines once it enters an alarm
                    // lockout, so without this the streaming loop would wait forever
                    // for "ok"s that never arrive — the job silently freezes mid-way
                    // with no error/finished broadcast and the UI stuck on "sending".
                    _isSending = false;
                    _isPaused = false;
                    _gcodeQueue.Clear();
                    _sentLineLengths.Clear();
                    _unacknowledgedBytes = 0;
                    BroadcastGcodeProgress("error");
                }
                Broadcast("serial-data", "[安全] アラームにより原点情報が無効になりました。再度「機械原点リセット」を行ってください。");
            }
            else if (line.StartsWith("$") && line.Contains("="))
            {
                try
                {
                    var parts = line.Substring(1).Split('=');
                    if (parts.Length == 2 && int.TryParse(parts[0], out int id) && double.TryParse(parts[1], out double val))
                    {
                        Broadcast("grbl-setting", new { id = id, value = val });
                    }
                }
                catch (Exception ex)
                {
                    LogService.Log($"Error parsing Grbl setting line '{line}': {ex.Message}");
                }
            }
        }

        // Parses a Grbl real-time status report, e.g.
        // "<Idle|MPos:0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000>"
        private void ProcessStatusReport(string line)
        {
            try
            {
                string inner = line.Substring(1, line.Length - 2);
                var fields = inner.Split('|');
                if (fields.Length == 0) return;

                string state = fields[0];
                double[]? mpos = null;
                double[]? wpos = null;

                for (int i = 1; i < fields.Length; i++)
                {
                    var kv = fields[i].Split(new[] { ':' }, 2);
                    if (kv.Length != 2) continue;

                    switch (kv[0])
                    {
                        case "MPos":
                            mpos = ParseTriple(kv[1]);
                            break;
                        case "WPos":
                            wpos = ParseTriple(kv[1]);
                            break;
                        case "WCO":
                            _lastWco = ParseTriple(kv[1]) ?? _lastWco;
                            break;
                    }
                }

                if (mpos == null && wpos == null) return;

                if (mpos == null)
                    mpos = new[] { wpos![0] + _lastWco[0], wpos[1] + _lastWco[1], wpos[2] + _lastWco[2] };
                if (wpos == null)
                    wpos = new[] { mpos[0] - _lastWco[0], mpos[1] - _lastWco[1], mpos[2] - _lastWco[2] };

                _lastMpos = mpos;

                Broadcast("serial-status", new
                {
                    status = state,
                    mpos = new { x = mpos[0], y = mpos[1], z = mpos[2] },
                    wpos = new { x = wpos[0], y = wpos[1], z = wpos[2] },
                    homed = _homed
                });
            }
            catch (Exception ex)
            {
                LogService.Log($"Error parsing status report '{line}': {ex.Message}");
            }
        }

        private static double[]? ParseTriple(string s)
        {
            var parts = s.Split(',');
            if (parts.Length < 3) return null;
            if (double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out double x) &&
                double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out double y) &&
                double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out double z))
            {
                return new[] { x, y, z };
            }
            return null;
        }

        private void StartStatusPolling()
        {
            StopStatusPolling();
            _statusPollTimer = new System.Timers.Timer(250);
            _statusPollTimer.Elapsed += (s, e) => _serialService.Write("?");
            _statusPollTimer.AutoReset = true;
            _statusPollTimer.Start();
        }

        private void StopStatusPolling()
        {
            _statusPollTimer?.Stop();
            _statusPollTimer?.Dispose();
            _statusPollTimer = null;
        }

        private void SendNextLine()
        {
            lock (_stateLock)
            {
                if (!_isSending) return;
                if (_isPaused) return;

                // Keep pushing lines into Grbl's RX buffer as long as there's room, instead of
                // sending one line and waiting for its "ok" — see _sentLineLengths comment.
                while (_gcodeQueue.Count > 0)
                {
                    string line = _gcodeQueue.Peek();

                    // Skip empty lines or comments to speed up; they were never sent to Grbl,
                    // so they don't consume buffer space or wait for an acknowledgment.
                    if (string.IsNullOrWhiteSpace(line) || line.StartsWith(";"))
                    {
                        _gcodeQueue.Dequeue();
                        _sentLines++;
                        continue;
                    }

                    int lineBytes = line.Length + 1; // +1 for the newline Grbl counts toward its buffer
                    if (_sentLineLengths.Count > 0 && _unacknowledgedBytes + lineBytes > GrblRxBufferSize)
                    {
                        // Buffer would overflow; stop and wait for pending "ok"s to free space.
                        break;
                    }

                    _gcodeQueue.Dequeue();
                    _serialService.Write(line + "\n");
                    _sentLineLengths.Enqueue(lineBytes);
                    _unacknowledgedBytes += lineBytes;
                    _sentLines++;
                }

                if (_gcodeQueue.Count == 0 && _sentLineLengths.Count == 0)
                {
                    _isSending = false;
                    BroadcastGcodeProgress("finished");
                }
                else
                {
                    BroadcastGcodeProgress("sending");
                }
            }
        }

        private string GetSettingsFilePath()
        {
            string dir = System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "GeoCraft");
            System.IO.Directory.CreateDirectory(dir);
            return System.IO.Path.Combine(dir, "settings.json");
        }

        public string GetSettings()
        {
            return ExecuteSafe(() => {
                string filePath = GetSettingsFilePath();
                if (System.IO.File.Exists(filePath))
                {
                    string content = System.IO.File.ReadAllText(filePath);
                    return JsonConvert.DeserializeObject<object>(content) ?? new object();
                }
                return new object();
            });
        }

        public void SaveSettings(string settingsJson)
        {
            ExecuteSafeVoid(() => {
                string filePath = GetSettingsFilePath();
                System.IO.File.WriteAllText(filePath, settingsJson);
                LogService.Log($"Saved settings to {filePath}");
            });
        }

        public string ParseDxfFile(string filePath) {
             return ExecuteSafe(() => _dxfService.ParseDxf(filePath));
        }

        public string ParseSvgFile(string filePath) { 
             return ExecuteSafe(() => new { status = "error", message = "Not implemented" }); 
        }

        public string GenerateContourPath(double toolDiameter, string geometryJson, string side, double stockToLeave = 0.0) {
             return ExecuteSafe(() => {
                  var geometry = JsonConvert.DeserializeObject<List<double[]>>(geometryJson) ?? new List<double[]>();
                  return _contourService.GenerateContour(toolDiameter, geometry, side, stockToLeave);
             });
        }

        public string GeneratePocketPath(string paramsJson) {
             return ExecuteSafe(() => {
                 dynamic p = JsonConvert.DeserializeObject(paramsJson)!;
                 List<double[]> geometry = p.geometry.ToObject<List<double[]>>();
                 double toolDiameter = p.toolDiameter;
                 double stepover = p.stepover;
                 double stockToLeave = p.stockToLeave ?? 0.0;
                 List<List<double[]>> holes = p.holes != null ? p.holes.ToObject<List<List<double[]>>>() : new List<List<double[]>>();
                 return _pocketService.GeneratePocket(geometry, toolDiameter, stepover, stockToLeave, holes);
             });
        }
        
        public string OpenFile(string fileType) {
            return ExecuteSafe(() => _mainWindow.Dispatcher.Invoke<object>(() => _fileService.OpenFile(fileType)));
        }

        public string ReadFileAsBase64(string filePath) {
            return ExecuteSafe(() => _fileService.ReadFileAsBase64(filePath));
        }

        public string WriteTempStlFile(string base64Data) {
            return ExecuteSafe(() => _fileService.WriteTempStlFile(base64Data));
        }

        public string SaveProject(string projectJson) {
            return ExecuteSafe(() => _mainWindow.Dispatcher.Invoke<object>(() => _fileService.SaveProject(projectJson)));
        }

        public string OpenProject() {
            return ExecuteSafe(() => _mainWindow.Dispatcher.Invoke<object>(() => _fileService.OpenProject()));
        }

        public Task<string> Generate3dRoughingPath(string paramsJson) {
            return ExecuteSafeAsync(() => {
                dynamic p = JsonConvert.DeserializeObject(paramsJson)!;
                string stockPath = p.stockPath;
                string targetPath = p.targetPath;
                double sliceHeight = p.sliceHeight;
                double toolDiameter = p.toolDiameter;
                double stepoverRatio = p.stepoverRatio;
                return _threeDPathService.GenerateToolpath(stockPath, targetPath, sliceHeight, toolDiameter, stepoverRatio,
                    (current, total) => Broadcast("path-progress", new { current, total }));
            });
        }

        public string FitArcsToToolpath(string toolpathJson, string arcsJson) { 
            return ExecuteSafe(() => new { status = "error", message = "Not implemented" }); 
        }
        
        public string GenerateGcode(string paramsJson) { 
             return ExecuteSafe(() => {
                 object result = _gcodeService.GenerateGcode(paramsJson);
                 dynamic r = result;
                 if (r != null && r!.status == "success")
                 {
                     // Show Save Dialog
                     return _mainWindow.Dispatcher.Invoke<object>(() => {
                         var dialog = new Microsoft.Win32.SaveFileDialog();
                         dialog.Filter = "G-Code|*.nc;*.gcode|All Files|*.*";
                         if (dialog.ShowDialog() == true)
                         {
                             System.IO.File.WriteAllText(dialog.FileName, (string)r!.gcode);
                             return new { status = "success", filePath = dialog.FileName };
                         }
                         return new { status = "canceled" };
                     });
                 }
                 return result;
             });
        }

        public string GenerateGcodeForTransfer(string paramsJson) {
             var sw = System.Diagnostics.Stopwatch.StartNew();
             LogService.Log("GenerateGcodeForTransfer: entered (COM call landed on UI thread)");
             var result = ExecuteSafe(() => _gcodeService.GenerateGcode(paramsJson));
             LogService.Log($"GenerateGcodeForTransfer: returning at {sw.ElapsedMilliseconds}ms, resultJsonLen={result.Length}");
             return result;
        }

        public string GenerateDrillGcode(string paramsJson) {
             return ExecuteSafe(() => {
                 object result = _gcodeService.GenerateDrillGcode(paramsJson);
                 dynamic r = result;
                 if (r != null && r!.status == "success")
                 {
                     // Show Save Dialog
                     return _mainWindow.Dispatcher.Invoke<object>(() => {
                         var dialog = new Microsoft.Win32.SaveFileDialog();
                         dialog.Filter = "G-Code|*.nc;*.gcode|All Files|*.*";
                         if (dialog.ShowDialog() == true)
                         {
                             System.IO.File.WriteAllText(dialog.FileName, (string)r!.gcode);
                             return new { status = "success", filePath = dialog.FileName };
                         }
                         return new { status = "canceled" };
                     });
                 }
                 return result;
             });
        }
        
        // --- Serial Port Stubs ---
        public string ListSerialPorts()
        {
             return ExecuteSafe(() => _serialService.ListPorts());
        }
        
        public string ConnectSerial(string path, int baudRate) {
            return ExecuteSafe(() => {
                var result = _serialService.Connect(path, baudRate);
                dynamic r = result;
                if (r != null && r!.status == "success")
                {
                    StartStatusPolling();
                }
                return result;
            });
        }

        public string DisconnectSerial() {
            return ExecuteSafe(() => {
                StopStatusPolling();
                _homed = false;
                _awaitingHomeConfirm = false;
                _awaitingProbeConfirm = false;
                return _serialService.Disconnect();
            });
        }

        public void SendGcode(string gcode) {
             ExecuteSafeVoid(() => {
                 lock (_stateLock)
                 {
                     var lines = gcode.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);

                     if (_homed)
                     {
                         var (ok, message) = ValidateSoftLimits(lines);
                         if (!ok)
                         {
                             Broadcast("serial-data", $"[安全] {message}");
                             BroadcastGcodeProgress("error");
                             return;
                         }
                     }

                     _gcodeQueue.Clear();
                     foreach (var line in lines)
                     {
                         _gcodeQueue.Enqueue(line.Trim());
                     }

                     _totalLines = _gcodeQueue.Count;
                     _sentLines = 0;
                     _isSending = true;
                     _isPaused = false;
                     _sentLineLengths.Clear();
                     _unacknowledgedBytes = 0;

                     if (_totalLines > 0)
                     {
                         SendNextLine();
                     }
                     else
                     {
                         _isSending = false;
                         BroadcastGcodeProgress("finished");
                     }
                 }
             });
        }
        
        public void PauseGcode() {
            ExecuteSafeVoid(() => {
                lock (_stateLock)
                {
                    if (_isSending && !_isPaused)
                    {
                        _isPaused = true;
                        _serialService.Write(GrblCommands.FeedHold);
                        BroadcastGcodeProgress("paused");
                    }
                }
            });
        }

        public void ResumeGcode() {
            ExecuteSafeVoid(() => {
                lock (_stateLock)
                {
                    if (_isSending && _isPaused)
                    {
                        _isPaused = false;
                        _serialService.Write(GrblCommands.CycleStart);
                        SendNextLine();
                    }
                }
            });
        }

        public void StopGcode() {
            ExecuteSafeVoid(() => {
                lock (_stateLock)
                {
                    if (_isSending)
                    {
                        ResetAndClearQueue();
                    }
                }
            });
        }

        public void EmergencyStop() {
            ExecuteSafeVoid(() => {
                lock (_stateLock)
                {
                    // Always reset, regardless of whether a G-code job is currently streaming
                    // (jogging, spindle-only, etc.) — the soft reset halts motion and turns off
                    // the spindle/coolant unconditionally.
                    ResetAndClearQueue();
                }
            });
        }

        // Grbl soft-reset (ctrl-x): clears the pending queue and halts all motion.
        // Shared by StopGcode (only while a job is streaming) and EmergencyStop (always).
        private void ResetAndClearQueue()
        {
            _isSending = false;
            _isPaused = false;
            _gcodeQueue.Clear();
            _sentLineLengths.Clear();
            _unacknowledgedBytes = 0;
            // A soft reset discards Grbl's motion plan; re-homing is required
            // before the soft limit can trust MPos again.
            _homed = false;
            _awaitingHomeConfirm = false;
            _awaitingProbeConfirm = false;
            _serialService.Write(GrblCommands.SoftReset);
            BroadcastGcodeProgress("idle");
            // A soft reset halts the spindle unconditionally, so the frontend's
            // spindle-on indicator must follow even outside an explicit SpindleOff call.
            Broadcast("spindle-status", new { on = false });
        }

        public void Jog(string axis, double direction, double step) {
             ExecuteSafeVoid(() => {
                 if (_homed)
                 {
                     int axisIndex = AxisIndex(axis);
                     if (axisIndex >= 0)
                     {
                         double predicted = _lastMpos[axisIndex] + step * direction;
                         if (predicted < -1e-3)
                         {
                             Broadcast("serial-data", $"[安全] {axis}軸が原点(MPos=0)を下回るためジョグを中止しました。");
                             return;
                         }
                     }
                 }
                 _serialService.Write(GrblCommands.Jog(axis, direction, step));
             });
        }

        public void SetZero() {
             ExecuteSafeVoid(() => {
                 _serialService.Write(GrblCommands.SetZero());
             });
        }

        public void ResetMachineOrigin() {
             ExecuteSafeVoid(() => {
                 _homed = false;
                 _awaitingHomeConfirm = true;
                 _serialService.Write("$H\n");
             });
        }

        // Touch-plate Z probe: drives down (relative move) until the probe input
        // triggers, then sets the current position to plateThickness in the work
        // Z coordinate and retracts. See the "ok"/ALARM handling in
        // ProcessReceivedLine for how the result is applied.
        public void ProbeZ(double feedRate, double maxTravel, double plateThickness, double retract) {
             ExecuteSafeVoid(() => {
                 double travel = Math.Abs(maxTravel);
                 if (_homed && _lastMpos[2] - travel < -1e-3)
                 {
                     Broadcast("serial-data", "[安全] Z軸が原点(MPos=0)を下回るためプローブを中止しました。移動量の上限を確認してください。");
                     Broadcast("probe-result", new { success = false });
                     return;
                 }
                 _probeZOffset = plateThickness;
                 _probeRetract = Math.Abs(retract);
                 _awaitingProbeConfirm = true;
                 _serialService.Write(GrblCommands.ProbeZ(feedRate, -travel));
             });
        }

        // Clears Grbl's Alarm lock (e.g. after a soft-reset with homing/hard-limits
        // enabled, or a limit-switch trip) so subsequent jog/G-code commands are
        // accepted again. Position trust is not restored by this alone — homing is
        // still required, so _homed is left false.
        public void UnlockAlarm() {
             ExecuteSafeVoid(() => {
                 lock (_stateLock)
                 {
                     _homed = false;
                     _awaitingHomeConfirm = false;
                     _serialService.Write(GrblCommands.Unlock);
                     Broadcast("serial-data", "[安全] アラーム解除($X)を送信しました。位置情報は未確定のため、再度「機械原点リセット」を行ってください。");
                 }
             });
        }

        private static int AxisIndex(string axis) => axis?.ToUpperInvariant() switch
        {
            "X" => 0,
            "Y" => 1,
            "Z" => 2,
            _ => -1
        };

        // Scans a full G-code program before it's queued, tracking the running
        // (work-coordinate) tool position through modal G90/G91 and X/Y/Z words,
        // and rejects the job if any move would drive MPos below 0 on any axis.
        // This mirrors the app's own G-code output (always G90, explicit arc
        // endpoints) closely enough to be a useful safety net; it does not
        // interpret G92 or unit changes, so those are skipped rather than
        // mis-tracked.
        private (bool ok, string? message) ValidateSoftLimits(string[] lines)
        {
            double[] pos = new[] { _lastMpos[0] - _lastWco[0], _lastMpos[1] - _lastWco[1], _lastMpos[2] - _lastWco[2] };
            bool absolute = true;

            for (int lineNo = 0; lineNo < lines.Length; lineNo++)
            {
                string line = StripComment(lines[lineNo]).ToUpperInvariant();
                if (string.IsNullOrWhiteSpace(line)) continue;
                if (line.Contains("G91")) absolute = false;
                if (line.Contains("G90")) absolute = true;
                if (line.Contains("G92")) continue;

                double[] target = (double[])pos.Clone();
                bool moved = false;
                foreach (Match m in Regex.Matches(line, @"([XYZ])(-?\d*\.?\d+)"))
                {
                    int axisIndex = AxisIndex(m.Groups[1].Value);
                    double val = double.Parse(m.Groups[2].Value, NumberStyles.Float, CultureInfo.InvariantCulture);
                    target[axisIndex] = absolute ? val : pos[axisIndex] + val;
                    moved = true;
                }
                if (!moved) continue;

                for (int axisIndex = 0; axisIndex < 3; axisIndex++)
                {
                    double predictedMpos = target[axisIndex] + _lastWco[axisIndex];
                    if (predictedMpos < -1e-3)
                    {
                        string axisName = axisIndex == 0 ? "X" : axisIndex == 1 ? "Y" : "Z";
                        return (false, $"{lineNo + 1}行目: {axisName}軸が原点(MPos=0)を下回ります(予測値 {predictedMpos:F3})。安全のため送信を中止しました。");
                    }
                }
                pos = target;
            }
            return (true, null);
        }

        private static string StripComment(string line)
        {
            int semi = line.IndexOf(';');
            if (semi >= 0) line = line.Substring(0, semi);
            return Regex.Replace(line, @"\([^)]*\)", "");
        }

        public void SpindleOn(double speed) {
             ExecuteSafeVoid(() => {
                 _serialService.Write(GrblCommands.SpindleOn(speed));
                 Broadcast("spindle-status", new { on = true });
             });
        }

        public void SpindleOff() {
             ExecuteSafeVoid(() => {
                 _serialService.Write(GrblCommands.SpindleOff);
                 Broadcast("spindle-status", new { on = false });
             });
        }

        public void RequestGrblSettings() {
             ExecuteSafeVoid(() => {
                 _serialService.Write(GrblCommands.RequestSettings);
             });
        }

        public void SaveGrblSettings(double stepsX, double stepsY, double stepsZ, bool invertX, bool invertY, bool invertZ) {
             ExecuteSafeVoid(() => {
                 int mask = (invertX ? 1 : 0) | (invertY ? 2 : 0) | (invertZ ? 4 : 0);
                 _serialService.Write(GrblCommands.SetStepsPerMm(100, stepsX));
                 _serialService.Write(GrblCommands.SetStepsPerMm(101, stepsY));
                 _serialService.Write(GrblCommands.SetStepsPerMm(102, stepsZ));
                 _serialService.Write(GrblCommands.SetDirectionInvertMask(mask));
             });
        }

        // --- Helper to Emit Events ---
        private void BroadcastGcodeProgress(string status)
        {
            Broadcast("gcode-progress", new { sent = _sentLines, total = _totalLines, status });
        }

        private void Broadcast(string type, object payload)
        {
            var json = JsonConvert.SerializeObject(new { type, payload });
            // BeginInvoke (non-blocking): Broadcast is called from Parallel.For worker threads
            // (e.g. path-progress). A blocking Invoke here would make each worker wait for the
            // UI thread's dispatcher queue, and since the host-object call itself may be running
            // on that same UI thread, a blocking Invoke risks a cross-thread deadlock.
            _mainWindow.Dispatcher.BeginInvoke(() => {
                 // WebView2 PostWebMessage
                 if (_mainWindow.webView?.CoreWebView2 != null)
                 {
                     _mainWindow.webView.CoreWebView2.PostWebMessageAsJson(json);
                 }
            });
        }
    }
}
