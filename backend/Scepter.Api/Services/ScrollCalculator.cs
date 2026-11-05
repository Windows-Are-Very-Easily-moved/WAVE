using Scepter.Api.Native;

namespace Scepter.Api.Services;

/// <summary>
/// Pure, platform-independent math for scroll wheel delta clamping and normalized-to-pixel screen coordinate mapping.
/// Shared by both <see cref="WindowService"/> (/api/window/grab) and <see cref="InputService"/> (/api/input/scroll)
/// and unit-tested without Win32 dependencies.
/// </summary>
public static class ScrollCalculator
{
    public const int DefaultMaxScrollDelta = 1200;

    /// <summary>
    /// Clamps a signed wheel delta to [-maxAbsDelta, +maxAbsDelta] (default +-1200).
    /// </summary>
    public static int ClampDelta(int delta, int maxAbsDelta = DefaultMaxScrollDelta)
    {
        int limit = Math.Max(1, Math.Abs(maxAbsDelta));
        return Math.Clamp(delta, -limit, limit);
    }

    /// <summary>
    /// Converts normalized [0..1] coordinates into physical screen pixel coordinates within <paramref name="screenBounds"/>.
    /// Uses the exact same formula as /api/window/grab:
    /// pixelX = Left + Round(Clamp(x, 0, 1) * (Width - 1))
    /// pixelY = Top  + Round(Clamp(y, 0, 1) * (Height - 1))
    /// </summary>
    public static POINT NormalizedToScreenPixels(double x, double y, RECT screenBounds)
    {
        double clampedX = Math.Clamp(x, 0.0, 1.0);
        double clampedY = Math.Clamp(y, 0.0, 1.0);

        int spanX = Math.Max(0, screenBounds.Width - 1);
        int spanY = Math.Max(0, screenBounds.Height - 1);

        int pixelX = screenBounds.Left + (int)Math.Round(clampedX * spanX);
        int pixelY = screenBounds.Top + (int)Math.Round(clampedY * spanY);

        return new POINT(pixelX, pixelY);
    }

    /// <summary>
    /// Validates whether a <paramref name="delta"/> and optional <paramref name="begin"/>/<paramref name="x"/>/<paramref name="y"/>
    /// form a valid scroll request.
    /// - Delta must be present.
    /// - A delta of 0 is valid when begin == true; when begin == false, delta must be non-zero.
    /// - If X or Y are provided, both must be finite numbers in [0..1].
    /// </summary>
    public static bool TryValidateScrollRequest(
        int? delta,
        bool begin,
        double? x,
        double? y,
        out string? errorMessage)
    {
        if (!delta.HasValue)
        {
            errorMessage = "Missing or invalid 'delta'. Provide an integer wheel delta.";
            return false;
        }

        if (!begin && delta.Value == 0)
        {
            errorMessage = "Scroll 'delta' cannot be 0 unless 'begin' is true.";
            return false;
        }

        if (x.HasValue != y.HasValue)
        {
            errorMessage = "Both 'x' and 'y' must be provided together when specifying cursor coordinates.";
            return false;
        }

        if (x.HasValue && y.HasValue)
        {
            if (double.IsNaN(x.Value) || double.IsInfinity(x.Value) ||
                double.IsNaN(y.Value) || double.IsInfinity(y.Value) ||
                x.Value < 0.0 || x.Value > 1.0 ||
                y.Value < 0.0 || y.Value > 1.0)
            {
                errorMessage = "Coordinates 'x' and 'y' must be finite numbers between 0.0 and 1.0.";
                return false;
            }
        }

        errorMessage = null;
        return true;
    }
}

