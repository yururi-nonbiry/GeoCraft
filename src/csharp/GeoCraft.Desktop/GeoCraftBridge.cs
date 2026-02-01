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
                 // Handle 'ok' or status reports similarly to main.ts if needed, or just raw
                 Broadcast("serial-data", data);
            };
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
             // TODO: Implement queueing logic from main.ts
             _serialService.Write(gcode + "\n");
        }
        
        public void PauseGcode() { }
        public void ResumeGcode() { }
        public void StopGcode() { }
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
                 _mainWindow.webView.CoreWebView2.PostWebMessageAsJson(json);
            });
        }
    }
}
