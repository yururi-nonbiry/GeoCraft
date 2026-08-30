using System;
using System.IO.Ports;
using System.Linq;

namespace GeoCraft.Desktop.Services
{
    public class SerialService : IDisposable
    {
        private SerialPort? _port;
        public event Action<string>? OnDataReceived;

        // Write() is called concurrently from several threads (the 250ms status-poll
        // timer, the G-code streaming loop re-entered from the port's own receive
        // thread, and direct UI-triggered commands). SerialPort isn't safe to write
        // from multiple threads at once — unsynchronized calls can corrupt or drop
        // bytes on the wire, which silently stalls G-code streaming (a lost "ok")
        // and freezes status polling (a lost "?" reply). All port access is
        // serialized through this lock to keep writes atomic.
        private readonly object _portLock = new object();

        public object ListPorts()
        {
            return new { status = "success", ports = SerialPort.GetPortNames().Select(p => new { path = p }).ToArray() };
        }

        public object Connect(string portName, int baudRate)
        {
            lock (_portLock)
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
        }

        public object Disconnect()
        {
            lock (_portLock)
            {
                if (_port == null) return new { status = "success", message = (string?)null };
                try
                {
                    if (_port.IsOpen)
                    {
                        _port.DataReceived -= Port_DataReceived;
                        _port.Close();
                    }
                    _port.Dispose();
                    _port = null;
                    return new { status = "success", message = (string?)null };
                }
                catch (Exception ex)
                {
                    return new { status = "error", message = ex.Message };
                }
            }
        }

        public void Write(string data)
        {
            lock (_portLock)
            {
                if (_port != null && _port.IsOpen)
                {
                    _port.Write(data);
                }
            }
        }

        private void Port_DataReceived(object sender, SerialDataReceivedEventArgs e)
        {
            string? data = null;
            lock (_portLock)
            {
                if (_port != null && _port.IsOpen)
                {
                    try { data = _port.ReadExisting(); } catch { }
                }
            }
            // Invoked outside the lock: the subscriber (GeoCraftBridge) does real work
            // here, including calling back into Write() to send the next queued
            // G-code line. Holding _portLock through that would needlessly block the
            // status-poll timer's "?" writes for the duration.
            if (data != null) OnDataReceived?.Invoke(data);
        }

        public void Dispose()
        {
            Dispose(true);
            GC.SuppressFinalize(this);
        }

        protected virtual void Dispose(bool disposing)
        {
            if (disposing)
            {
                lock (_portLock)
                {
                    if (_port != null)
                    {
                        try
                        {
                            if (_port.IsOpen)
                            {
                                _port.DataReceived -= Port_DataReceived;
                                _port.Close();
                            }
                        }
                        catch { }
                        _port.Dispose();
                        _port = null;
                    }
                }
            }
        }
    }
}
