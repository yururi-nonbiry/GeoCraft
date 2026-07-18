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

        public object ReadFileAsBase64(string filePath)
        {
            byte[] bytes = System.IO.File.ReadAllBytes(filePath);
            return new { status = "success", data = Convert.ToBase64String(bytes) };
        }

        public object WriteTempStlFile(string base64Data)
        {
            byte[] bytes = Convert.FromBase64String(base64Data);
            string tempPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"geocraft_{Guid.NewGuid():N}.stl");
            System.IO.File.WriteAllBytes(tempPath, bytes);
            return new { status = "success", filePath = tempPath };
        }

        public object SaveProject(string projectJson)
        {
            var dialog = new SaveFileDialog();
            dialog.Filter = "GeoCraft Project|*.gcproj|All Files|*.*";
            dialog.DefaultExt = "gcproj";
            if (dialog.ShowDialog() == true)
            {
                System.IO.File.WriteAllText(dialog.FileName, projectJson);
                return new { status = "success", filePath = dialog.FileName };
            }
            return new { status = "canceled" };
        }

        public object OpenProject()
        {
            var dialog = new OpenFileDialog();
            dialog.Filter = "GeoCraft Project|*.gcproj|All Files|*.*";
            if (dialog.ShowDialog() == true)
            {
                string content = System.IO.File.ReadAllText(dialog.FileName);
                return new { status = "success", data = content, filePath = dialog.FileName };
            }
            return new { status = "canceled" };
        }
    }
}
