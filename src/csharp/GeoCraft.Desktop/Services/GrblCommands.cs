namespace GeoCraft.Desktop.Services
{
    // Raw Grbl protocol command strings, kept in one place so the wire format
    // isn't duplicated across every bridge method that talks to the controller.
    public static class GrblCommands
    {
        public const string SoftReset = "\x18";
        public const string FeedHold = "!\n";
        public const string CycleStart = "~\n";
        public const string RequestSettings = "$$\n";
        public const string SpindleOff = "M05\n";
        public const string Unlock = "$X\n";

        public static string SetZero() => "G10 L20 P1 X0 Y0 Z0\n";

        public static string SpindleOn(double speed) => $"M03 S{speed}\n";

        public static string Jog(string axis, double direction, double step, double feedRate = 1000) =>
            $"$J=G91 {axis}{step * direction} F{feedRate}\n";

        public static string SetStepsPerMm(int axisSettingId, double steps) => $"${axisSettingId}={steps}\n";

        public static string SetDirectionInvertMask(int mask) => $"$3={mask}\n";
    }
}
