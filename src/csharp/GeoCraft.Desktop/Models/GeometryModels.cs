using System.Collections.Generic;

namespace GeoCraft.Desktop.Models
{
    public class DxfResult
    {
        public string status { get; set; } = "success";
        public string? message { get; set; }
        public List<List<double[]>> segments { get; set; } = new();
        public List<DxfArcData> arcs { get; set; } = new();
        public List<double[]> drill_points { get; set; } = new();
    }

    public class DxfArcData
    {
        public double[] center { get; set; } = new double[3];
        public double radius { get; set; }
        public double start_angle { get; set; }
        public double end_angle { get; set; }
    }
}
