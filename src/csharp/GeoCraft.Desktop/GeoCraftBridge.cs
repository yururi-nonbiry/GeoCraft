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

        private void ProcessReceivedLine(string line)
        {
            if (line == "ok" || line.StartsWith("error"))
            {
                if (_isSending && !_isPaused)
                {
                    SendNextLine();
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

        public string GetSettings()
        {
            // TODO: Implement actual settings loading
            return JsonConvert.SerializeObject(new { test = "Settings from C#" });
        }

        public void SaveSettings(string settingsJson)
        {
            // TODO: Implement settings saving
            System.Diagnostics.Debug.WriteLine($"Saving settings: {settingsJson}");
        }

        public string ParseDxfFile(string filePath) {
             return JsonConvert.SerializeObject(_dxfService.ParseDxf(filePath));
        }

        public string ParseSvgFile(string filePath) { return JsonConvert.SerializeObject(new { status = "error", message = "Not implemented" }); }
        
        public string GenerateContourPath(double toolDiameter, string geometryJson, string side) {
             try {
                var geometry = JsonConvert.DeserializeObject<List<double[]>>(geometryJson);
                if (geometry == null) return JsonConvert.SerializeObject(new { status = "error", message = "Invalid geometry" });
                return JsonConvert.SerializeObject(_contourService.GenerateContour(toolDiameter, geometry, side));
             } catch (Exception ex) {
                return JsonConvert.SerializeObject(new { status = "error", message = ex.Message });
             }
        }

        public string GeneratePocketPath(string paramsJson) {
             try {
                 dynamic p = JsonConvert.DeserializeObject(paramsJson);
                 List<double[]> geometry = p.geometry.ToObject<List<double[]>>();
                 double toolDiameter = p.toolDiameter;
                 double stepover = p.stepover;
                 return JsonConvert.SerializeObject(_pocketService.GeneratePocket(geometry, toolDiameter, stepover));
             } catch (Exception ex) {
                 return JsonConvert.SerializeObject(new { status = "error", message = ex.Message });
             }
        }
        
        public string OpenFile(string fileType) { 
            return JsonConvert.SerializeObject(_mainWindow.Dispatcher.Invoke<object>(() => _fileService.OpenFile(fileType)));
        }
        
        public string Generate3dRoughingPath(string paramsJson) { return JsonConvert.SerializeObject(new { status = "error", message = "Not implemented" }); }
        public string FitArcsToToolpath(string toolpathJson, string arcsJson) { return JsonConvert.SerializeObject(new { status = "error", message = "Not implemented" }); }
        
        public string GenerateGcode(string paramsJson) { 
             object result = _gcodeService.GenerateGcode(paramsJson);
             dynamic r = result;
             if (r != null && r.status == "success")
             {
                 // Show Save Dialog
                 return JsonConvert.SerializeObject(_mainWindow.Dispatcher.Invoke<object>(() => {
                     var dialog = new Microsoft.Win32.SaveFileDialog();
                     dialog.Filter = "G-Code|*.nc;*.gcode|All Files|*.*";
                     if (dialog.ShowDialog() == true)
                     {
                         System.IO.File.WriteAllText(dialog.FileName, (string)r.gcode);
                          return new { status = "success", filePath = dialog.FileName };
                     }
                     return new { status = "canceled" };
                 }));
             }
             return JsonConvert.SerializeObject(result);
        }

        public string GenerateDrillGcode(string paramsJson) { return JsonConvert.SerializeObject(new { status = "error", message = "Not implemented" }); }
        
        // --- Serial Port Stubs ---
        public string ListSerialPorts()
        {
             return JsonConvert.SerializeObject(_serialService.ListPorts());
        }
        
        public string ConnectSerial(string path, int baudRate) { 
            return JsonConvert.SerializeObject(_serialService.Connect(path, baudRate));
        }

        public string DisconnectSerial() { 
            return JsonConvert.SerializeObject(_serialService.Disconnect());
        }

        public void SendGcode(string gcode) { 
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
        }
        
        public void PauseGcode() { 
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
        }

        public void ResumeGcode() { 
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
        }

        public void StopGcode() { 
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
        }

        public void Jog(string axis, double direction, double step) {
             string cmd = $"$J=G91 {axis}{step * direction} F1000\n";
             _serialService.Write(cmd);
        }

        public void SetZero() {
             _serialService.Write("G10 L20 P1 X0 Y0 Z0\n");
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
