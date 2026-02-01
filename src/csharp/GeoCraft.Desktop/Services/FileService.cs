using System;
using Microsoft.Win32;

namespace GeoCraft.Desktop.Services
{
    public class FileService
    {
        public object OpenFile(string fileType)
        {
            var dialog = new OpenFileDialog();
            switch (fileType.ToLower())
            {
                case "dxf":
                    dialog.Filter = "DXF Files|*.dxf";
                    break;
                case "stl":
                    dialog.Filter = "STL Files|*.stl";
                    break;
                case "svg":
                    dialog.Filter = "SVG Files|*.svg";
                    break;
                default:
                    dialog.Filter = "All Files|*.*";
                    break;
            }

            if (dialog.ShowDialog() == true)
            {
                return new { status = "success", filePath = dialog.FileName };
            }
            return new { status = "canceled" };
        }
    }
}
