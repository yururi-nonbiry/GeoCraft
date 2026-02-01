using System;
using System.IO.Ports;
using System.Linq;

namespace GeoCraft.Desktop.Services
{
    public class SerialService
    {
        private SerialPort? _port;
        public event Action<string>? OnDataReceived;

        public object ListPorts()
        {
            return new { status = "success", ports = SerialPort.GetPortNames().Select(p => new { path = p }).ToArray() };
        }

        public object Connect(string portName, int baudRate)
        {
            if (_port != null && _port.IsOpen)
            {
                return new { status = "error", message = "Port already open." };
            }

            try
            {
                _port = new SerialPort(portName, baudRate);
                _port.DataReceived += Port_DataReceived;
                _port.Open();
                return new { status = "success", message = (string?)null };
            }
            catch (Exception ex)
            {
                _port = null;
                return new { status = "error", message = ex.Message };
            }
        }

        public object Disconnect()
        {
            if (_port == null) return new { status = "success", message = (string?)null };
            try
            {
                if (_port.IsOpen)
                {
                    _port.DataReceived -= Port_DataReceived;
                    _port.Close();
                }
                _port = null;
                return new { status = "success", message = (string?)null };
            }
            catch (Exception ex)
            {
                return new { status = "error", message = ex.Message };
            }
        }

        public void Write(string data)
        {
            if (_port != null && _port.IsOpen)
            {
                _port.Write(data);
            }
        }

        private void Port_DataReceived(object sender, SerialDataReceivedEventArgs e)
        {
            if (_port != null && _port.IsOpen)
            {
                try {
                    string data = _port.ReadExisting();
                    OnDataReceived?.Invoke(data);
                } catch {}
            }
        }
    }
}
