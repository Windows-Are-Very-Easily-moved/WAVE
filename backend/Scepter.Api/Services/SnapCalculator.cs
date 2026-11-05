using Scepter.Api.Models;
using Scepter.Api.Native;

namespace Scepter.Api.Services;

/// <summary>
/// Pure functions for computing target window rectangles and invisible border compensation.
/// Completely decoupled from Win32 P/Invoke so it can be unit-tested on any platform.
/// </summary>
public static class SnapCalculator
{
    public const double MinRatio = 0.2;
    public const double MaxRatio = 0.8;

    /// <summary>
    /// Computes the desired visible rectangle within <paramref name="workArea"/> for the given <paramref name="position"/> and <paramref name="ratio"/>.
    /// </summary>
    public static RECT CalculateTargetRect(RECT workArea, SnapPosition position, double ratio = 0.5)
    {
        double clampedRatio = Math.Clamp(ratio, MinRatio, MaxRatio);
        int width = workArea.Width;
        int height = workArea.Height;

        int splitWidth = (int)Math.Round(width * clampedRatio);
        int halfHeight = height / 2;

        return position switch
        {
            SnapPosition.Left => new RECT(
                workArea.Left,
                workArea.Top,
                workArea.Left + splitWidth,
                workArea.Bottom),

            SnapPosition.Right => new RECT(
                workArea.Right - splitWidth,
                workArea.Top,
                workArea.Right,
                workArea.Bottom),

            SnapPosition.Top or SnapPosition.NextMonitor => new RECT(
                workArea.Left,
                workArea.Top,
                workArea.Right,
                workArea.Bottom),

            SnapPosition.TopLeft => new RECT(
                workArea.Left,
                workArea.Top,
                workArea.Left + splitWidth,
                workArea.Top + halfHeight),

            SnapPosition.TopRight => new RECT(
                workArea.Right - splitWidth,
                workArea.Top,
                workArea.Right,
                workArea.Top + halfHeight),

            SnapPosition.BottomLeft => new RECT(
                workArea.Left,
                workArea.Top + halfHeight,
                workArea.Left + splitWidth,
                workArea.Bottom),

            SnapPosition.BottomRight => new RECT(
                workArea.Right - splitWidth,
                workArea.Top + halfHeight,
                workArea.Right,
                workArea.Bottom),

            _ => workArea
        };
    }

    /// <summary>
    /// Compensates for Windows 10/11 invisible resize borders (drop shadow / DWM extended frame).
    /// <paramref name="windowRect"/> is from GetWindowRect (includes invisible borders).
    /// <paramref name="extendedFrameBounds"/> is from DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS) (actual visible bounds).
    /// Expands <paramref name="desiredVisibleRect"/> by the border deltas so the visible frame sits flush with <paramref name="desiredVisibleRect"/>.
    /// </summary>
    public static RECT CompensateInvisibleBorders(RECT desiredVisibleRect, RECT windowRect, RECT extendedFrameBounds)
    {
        // Typically:
        // extendedFrameBounds.Left > windowRect.Left (e.g., +7px)
        // extendedFrameBounds.Top >= windowRect.Top (usually 0px)
        // extendedFrameBounds.Right < windowRect.Right (e.g., -7px)
        // extendedFrameBounds.Bottom < windowRect.Bottom (e.g., -7px)
        int leftMargin = extendedFrameBounds.Left - windowRect.Left;
        int topMargin = extendedFrameBounds.Top - windowRect.Top;
        int rightMargin = windowRect.Right - extendedFrameBounds.Right;
        int bottomMargin = windowRect.Bottom - extendedFrameBounds.Bottom;

        // Sanity guard against bogus DWM data
        if (leftMargin < 0 || leftMargin > 64 ||
            topMargin < 0 || topMargin > 64 ||
            rightMargin < 0 || rightMargin > 64 ||
            bottomMargin < 0 || bottomMargin > 64)
        {
            return desiredVisibleRect;
        }

        return new RECT(
            desiredVisibleRect.Left - leftMargin,
            desiredVisibleRect.Top - topMargin,
            desiredVisibleRect.Right + rightMargin,
            desiredVisibleRect.Bottom + bottomMargin
        );
    }

    /// <summary>
    /// Computes a proportionally resized rectangle centered around the current window center, clamped to the monitor work area.
    /// </summary>
    public static RECT CalculateResizedRect(RECT currentRect, RECT workArea, double scaleFactor)
    {
        double clampedScale = Math.Clamp(scaleFactor, 0.35, 2.5);
        int centerX = currentRect.Left + currentRect.Width / 2;
        int centerY = currentRect.Top + currentRect.Height / 2;

        int newWidth = Math.Clamp((int)Math.Round(currentRect.Width * clampedScale), 320, workArea.Width);
        int newHeight = Math.Clamp((int)Math.Round(currentRect.Height * clampedScale), 240, workArea.Height);

        int left = Math.Clamp(centerX - newWidth / 2, workArea.Left, workArea.Right - newWidth);
        int top = Math.Clamp(centerY - newHeight / 2, workArea.Top, workArea.Bottom - newHeight);

        return new RECT(left, top, left + newWidth, top + newHeight);
    }
}

