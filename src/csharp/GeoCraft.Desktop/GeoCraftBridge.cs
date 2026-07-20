using System;
using System.Runtime.InteropServices;
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
            if (line == "ok" || line.StartsWith("error"))
            {
                if (_isSending && !_isPaused)
                {
                    SendNextLine();
                }
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

        private void SendNextLine()
        {
            lock (_stateLock)
            {
                if (!_isSending) return;
                if (_isPaused) return;

                if (_gcodeQueue.Count == 0)
                {
                    _isSending = false;
                    Broadcast("gcode-progress", new { sent = _sentLines, total = _totalLines, status = "finished" });
                    return;
                }

                string line = _gcodeQueue.Dequeue();
                
                // Skip empty lines or comments to speed up, but count them as sent
                while (string.IsNullOrWhiteSpace(line) || line.StartsWith(";"))
                {
                    _sentLines++;
                    if (_gcodeQueue.Count == 0)
                    {
                        _isSending = false;
                        Broadcast("gcode-progress", new { sent = _sentLines, total = _totalLines, status = "finished" });
                        return;
                    }
                    line = _gcodeQueue.Dequeue();
                }

                _serialService.Write(line + "\n");
                _sentLines++;

                Broadcast("gcode-progress", new { sent = _sentLines, total = _totalLines, status = "sending" });
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
                  var geometry = JsonConvert.DeserializeObject<List<double[]>>(geometryJson);
                  return _contourService.GenerateContour(toolDiameter, geometry, side, stockToLeave);
             });
        }

        public string GeneratePocketPath(string paramsJson) {
             return ExecuteSafe(() => {
                 dynamic p = JsonConvert.DeserializeObject(paramsJson);
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

        public string Generate3dRoughingPath(string paramsJson) {
            return ExecuteSafe(() => {
                dynamic p = JsonConvert.DeserializeObject(paramsJson);
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
                 if (r != null && r.status == "success")
                 {
                     // Show Save Dialog
                     return _mainWindow.Dispatcher.Invoke<object>(() => {
                         var dialog = new Microsoft.Win32.SaveFileDialog();
                         dialog.Filter = "G-Code|*.nc;*.gcode|All Files|*.*";
                         if (dialog.ShowDialog() == true)
                         {
                             System.IO.File.WriteAllText(dialog.FileName, (string)r.gcode);
                             return new { status = "success", filePath = dialog.FileName };
                         }
                         return new { status = "canceled" };
                     });
                 }
                 return result;
             });
        }

        public string GenerateDrillGcode(string paramsJson) { 
            return ExecuteSafe(() => new { status = "error", message = "Not implemented" }); 
        }
        
        // --- Serial Port Stubs ---
        public string ListSerialPorts()
        {
             return ExecuteSafe(() => _serialService.ListPorts());
        }
        
        public string ConnectSerial(string path, int baudRate) { 
            return ExecuteSafe(() => _serialService.Connect(path, baudRate));
        }

        public string DisconnectSerial() { 
            return ExecuteSafe(() => _serialService.Disconnect());
        }

        public void SendGcode(string gcode) { 
             ExecuteSafeVoid(() => {
                 lock (_stateLock)
                 {
                     _gcodeQueue.Clear();
                     var lines = gcode.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                     foreach (var line in lines)
                     {
                         _gcodeQueue.Enqueue(line.Trim());
                     }

                     _totalLines = _gcodeQueue.Count;
                     _sentLines = 0;
                     _isSending = true;
                     _isPaused = false;

                     if (_totalLines > 0)
                     {
                         SendNextLine();
                     }
                     else
                     {
                         _isSending = false;
                         Broadcast("gcode-progress", new { sent = 0, total = 0, status = "finished" });
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
                        // Grbl feed hold command '!'
                        _serialService.Write("!\n");
                        Broadcast("gcode-progress", new { sent = _sentLines, total = _totalLines, status = "paused" });
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
                        // Grbl cycle start command '~'
                        _serialService.Write("~\n");
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
                        _isSending = false;
                        _isPaused = false;
                        _gcodeQueue.Clear();
                        // Grbl reset command (ctrl-x)
                        _serialService.Write("\x18");
                        Broadcast("gcode-progress", new { sent = _sentLines, total = _totalLines, status = "idle" });
                    }
                }
            });
        }

        public void Jog(string axis, double direction, double step) {
             ExecuteSafeVoid(() => {
                 string cmd = $"$J=G91 {axis}{step * direction} F1000\n";
                 _serialService.Write(cmd);
             });
        }

        public void SetZero() {
             ExecuteSafeVoid(() => {
                 _serialService.Write("G10 L20 P1 X0 Y0 Z0\n");
             });
        }

        public void RequestGrblSettings() {
             ExecuteSafeVoid(() => {
                 _serialService.Write("$$\n");
             });
        }

        public void SaveGrblSettings(double stepsX, double stepsY, double stepsZ, bool invertX, bool invertY, bool invertZ) {
             ExecuteSafeVoid(() => {
                 int mask = (invertX ? 1 : 0) | (invertY ? 2 : 0) | (invertZ ? 4 : 0);
                 _serialService.Write($"$100={stepsX}\n");
                 _serialService.Write($"$101={stepsY}\n");
                 _serialService.Write($"$102={stepsZ}\n");
                 _serialService.Write($"$3={mask}\n");
             });
        }

        // --- Helper to Emit Events ---
        private void Broadcast(string type, object payload)
        {
            var json = JsonConvert.SerializeObject(new { type, payload });
            _mainWindow.Dispatcher.Invoke(() => {
                 // WebView2 PostWebMessage
                 if (_mainWindow.webView?.CoreWebView2 != null)
                 {
                     _mainWindow.webView.CoreWebView2.PostWebMessageAsJson(json);
                 }
            });
        }
    }
}
