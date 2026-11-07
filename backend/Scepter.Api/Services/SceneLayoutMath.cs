using Scepter.Api.Models;
using Scepter.Api.Native;

namespace Scepter.Api.Services;

public sealed record MonitorWorkAreaInfo(
    string DeviceName,
    RECT MonitorBounds,
    RECT WorkArea,
    bool IsPrimary
);

/// <summary>
/// Pure layout calculation logic for converting window bounds between physical pixels and
/// normalized monitor work-area fractions, clamping coordinates, and resolving monitor fallbacks.
/// Contains no Win32 P/Invoke dependencies and is 100% unit-tested.
/// </summary>
public static class SceneLayoutMath
{
    public const double MinFractionalSize = 0.05; // Minimum 5% of monitor width/height

    public static WindowFractionalRect ClampFractionalRect(WindowFractionalRect frac)
    {
        double w = Math.Clamp(frac.W, MinFractionalSize, 1.0);
        double h = Math.Clamp(frac.H, MinFractionalSize, 1.0);
        double x = Math.Clamp(frac.X, 0.0, Math.Max(0.0, 1.0 - w));
        double y = Math.Clamp(frac.Y, 0.0, Math.Max(0.0, 1.0 - h));
        return new WindowFractionalRect(
            Math.Round(x, 4),
            Math.Round(y, 4),
            Math.Round(w, 4),
            Math.Round(h, 4)
        );
    }

    /// <summary>
    /// Converts a physical window rectangle into fractional [0..1] coordinates relative to a monitor work area.
    /// </summary>
    public static WindowFractionalRect PixelsToFractional(RECT windowBounds, RECT workArea)
    {
        int workW = Math.Max(1, workArea.Width);
        int workH = Math.Max(1, workArea.Height);

        double w = (double)windowBounds.Width / workW;
        double h = (double)windowBounds.Height / workH;

        w = Math.Clamp(w, MinFractionalSize, 1.0);
        h = Math.Clamp(h, MinFractionalSize, 1.0);

        double x = (double)(windowBounds.Left - workArea.Left) / workW;
        double y = (double)(windowBounds.Top - workArea.Top) / workH;

        x = Math.Clamp(x, 0.0, Math.Max(0.0, 1.0 - w));
        y = Math.Clamp(y, 0.0, Math.Max(0.0, 1.0 - h));

        return new WindowFractionalRect(
            Math.Round(x, 4),
            Math.Round(y, 4),
            Math.Round(w, 4),
            Math.Round(h, 4)
        );
    }

    /// <summary>
    /// Converts normalized fractional [0..1] coordinates into physical pixel bounds within a target monitor work area.
    /// </summary>
    public static RECT FractionalToPixels(WindowFractionalRect frac, RECT workArea)
    {
        int workW = Math.Max(1, workArea.Width);
        int workH = Math.Max(1, workArea.Height);

        double clampedW = Math.Clamp(frac.W, MinFractionalSize, 1.0);
        double clampedH = Math.Clamp(frac.H, MinFractionalSize, 1.0);

        double maxX = Math.Max(0.0, 1.0 - clampedW);
        double maxY = Math.Max(0.0, 1.0 - clampedH);

        double clampedX = Math.Clamp(frac.X, 0.0, maxX);
        double clampedY = Math.Clamp(frac.Y, 0.0, maxY);

        int left = workArea.Left + (int)Math.Round(clampedX * workW);
        int top = workArea.Top + (int)Math.Round(clampedY * workH);
        int width = Math.Max(50, (int)Math.Round(clampedW * workW));
        int height = Math.Max(50, (int)Math.Round(clampedH * workH));

        // Ensure right and bottom do not spill past work area boundary due to rounding
        if (left + width > workArea.Right)
        {
            left = Math.Max(workArea.Left, workArea.Right - width);
        }
        if (top + height > workArea.Bottom)
        {
            top = Math.Max(workArea.Top, workArea.Bottom - height);
        }

        return new RECT(left, top, left + width, top + height);
    }

    /// <summary>
    /// Resolves the target monitor for a scene window. If the saved monitor is missing (e.g., unplugged or different PC),
    /// falls back safely to the primary monitor.
    /// </summary>
    public static MonitorWorkAreaInfo ResolveTargetMonitor(
        string? savedDeviceName,
        IReadOnlyList<MonitorWorkAreaInfo> availableMonitors)
    {
        if (availableMonitors == null || availableMonitors.Count == 0)
        {
            // Default 1920x1080 work area fallback if no monitors could be queried
            var defaultRect = new RECT(0, 0, 1920, 1040);
            return new MonitorWorkAreaInfo(@"\\.\DISPLAY1", new RECT(0, 0, 1920, 1080), defaultRect, true);
        }

        if (!string.IsNullOrWhiteSpace(savedDeviceName))
        {
            var match = availableMonitors.FirstOrDefault(m =>
                string.Equals(m.DeviceName, savedDeviceName, StringComparison.OrdinalIgnoreCase));
            if (match != null)
            {
                return match;
            }
        }

        // Primary monitor fallback
        var primary = availableMonitors.FirstOrDefault(m => m.IsPrimary);
        return primary ?? availableMonitors[0];
    }
}

