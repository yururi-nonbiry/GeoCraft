using System;
using System.IO;

namespace GeoCraft.Desktop.Services
{
    public static class LogService
    {
        private static readonly string LogFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app.log");
        private static readonly object LogLock = new object();

        public static void Log(string message)
        {
            lock (LogLock)
            {
                try
                {
                    string logLine = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} [{Environment.CurrentManagedThreadId}] {message}{Environment.NewLine}";
                    File.AppendAllText(LogFilePath, logLine);
                    System.Diagnostics.Debug.Write(logLine);
                }
                catch { }
            }
        }
    }
}
