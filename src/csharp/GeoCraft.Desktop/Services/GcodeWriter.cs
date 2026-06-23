using System;
using System.Globalization;
using System.Text;

namespace GeoCraft.Desktop.Services
{
    public class GcodeWriter
    {
        private readonly StringBuilder _sb = new StringBuilder();

        public void WriteHeader(string header)
        {
            _sb.AppendLine("%");
            _sb.AppendLine("O0001");
            if (!string.IsNullOrWhiteSpace(header))
            {
                _sb.AppendLine(header);
            }
        }

        public void WriteFooter(string footer)
        {
            _sb.AppendLine("M05");
            if (!string.IsNullOrWhiteSpace(footer))
            {
                _sb.AppendLine(footer);
            }
            else
            {
                _sb.AppendLine("M30");
            }
            _sb.AppendLine("%");
        }

        public void SpindleOn(int speed)
        {
            _sb.AppendLine($"M03 S{speed}");
        }

        public void RapidMove(double? x = null, double? y = null, double? z = null)
        {
            BuildCommand("G00", x, y, z, null);
        }

        public void LinearMove(double? x = null, double? y = null, double? z = null, double? feed = null)
        {
            BuildCommand("G01", x, y, z, feed);
        }

        public void ArcMove(string code, double x, double y, double i, double j, double feed)
        {
            _sb.AppendLine($"{code} X{Format(x)} Y{Format(y)} I{Format(i)} J{Format(j)} F{Format(feed)}");
        }

        private void BuildCommand(string prefix, double? x, double? y, double? z, double? feed)
        {
            var cmd = prefix;
            if (x.HasValue) cmd += $" X{Format(x.Value)}";
            if (y.HasValue) cmd += $" Y{Format(y.Value)}";
            if (z.HasValue) cmd += $" Z{Format(z.Value)}";
            if (feed.HasValue) cmd += $" F{Format(feed.Value)}";
            _sb.AppendLine(cmd);
        }

        private string Format(double val)
        {
            return val.ToString("F3", CultureInfo.InvariantCulture);
        }

        public override string ToString()
        {
            return _sb.ToString();
        }
    }
}
