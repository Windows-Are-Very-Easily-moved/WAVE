using Scepter.Api.Models;
using Scepter.Api.Native;
using Scepter.Api.Services;
using Xunit;

namespace Scepter.Api.Tests;

public sealed class SceneLayoutMathTests
{
    private static readonly RECT StandardWorkArea1080p = new(0, 0, 1920, 1040);
    private static readonly RECT WorkArea1440p = new(0, 0, 2560, 1400);
    private static readonly RECT WorkAreaSecondaryMonitor = new(1920, 0, 3840, 1080); // Secondary 1080p to the right

    [Fact]
    public void PixelsToFractional_ConvertsAccurately_ForStandardSnapHalves()
    {
        // Left half: [0, 0, 960, 1040]
        var leftHalfPixels = new RECT(0, 0, 960, 1040);
        var leftFrac = SceneLayoutMath.PixelsToFractional(leftHalfPixels, StandardWorkArea1080p);

        Assert.Equal(0.0, leftFrac.X);
        Assert.Equal(0.0, leftFrac.Y);
        Assert.Equal(0.5, leftFrac.W);
        Assert.Equal(1.0, leftFrac.H);

        // Right half: [960, 0, 1920, 1040]
        var rightHalfPixels = new RECT(960, 0, 1920, 1040);
        var rightFrac = SceneLayoutMath.PixelsToFractional(rightHalfPixels, StandardWorkArea1080p);

        Assert.Equal(0.5, rightFrac.X);
        Assert.Equal(0.0, rightFrac.Y);
        Assert.Equal(0.5, rightFrac.W);
        Assert.Equal(1.0, rightFrac.H);
    }

    [Fact]
    public void FractionalToPixels_MapsToCorrectPhysicalCoordinates_AcrossResolutions()
    {
        var quarterFrac = new WindowFractionalRect(0.5, 0.5, 0.5, 0.5); // Bottom-right quadrant

        // On 1080p
        var pixels1080 = SceneLayoutMath.FractionalToPixels(quarterFrac, StandardWorkArea1080p);
        Assert.Equal(960, pixels1080.Left);
        Assert.Equal(520, pixels1080.Top);
        Assert.Equal(1920, pixels1080.Right);
        Assert.Equal(1040, pixels1080.Bottom);

        // On 1440p
        var pixels1440 = SceneLayoutMath.FractionalToPixels(quarterFrac, WorkArea1440p);
        Assert.Equal(1280, pixels1440.Left);
        Assert.Equal(700, pixels1440.Top);
        Assert.Equal(2560, pixels1440.Right);
        Assert.Equal(1400, pixels1440.Bottom);

        // On secondary monitor with non-zero Left origin (1920)
        var pixelsSec = SceneLayoutMath.FractionalToPixels(quarterFrac, WorkAreaSecondaryMonitor);
        Assert.Equal(1920 + 960, pixelsSec.Left);
        Assert.Equal(540, pixelsSec.Top);
        Assert.Equal(3840, pixelsSec.Right);
        Assert.Equal(1080, pixelsSec.Bottom);
    }

    [Fact]
    public void RoundTrip_PreservesCoordinates_WithinOnePixelTolerance()
    {
        var originalPixels = new RECT(120, 80, 1140, 880);
        var fractional = SceneLayoutMath.PixelsToFractional(originalPixels, StandardWorkArea1080p);
        var restoredPixels = SceneLayoutMath.FractionalToPixels(fractional, StandardWorkArea1080p);

        Assert.InRange(Math.Abs(restoredPixels.Left - originalPixels.Left), 0, 1);
        Assert.InRange(Math.Abs(restoredPixels.Top - originalPixels.Top), 0, 1);
        Assert.InRange(Math.Abs(restoredPixels.Width - originalPixels.Width), 0, 2);
        Assert.InRange(Math.Abs(restoredPixels.Height - originalPixels.Height), 0, 2);
    }

    [Fact]
    public void FractionalToPixels_ClampsOutOfBoundsAndZeroValuesSafely()
    {
        // Negative / extreme position and size
        var extremeFrac = new WindowFractionalRect(-0.2, 1.5, 2.0, 0.001);
        var clamped = SceneLayoutMath.FractionalToPixels(extremeFrac, StandardWorkArea1080p);

        // Left and top must stay within work area
        Assert.True(clamped.Left >= StandardWorkArea1080p.Left);
        Assert.True(clamped.Top >= StandardWorkArea1080p.Top);
        Assert.True(clamped.Right <= StandardWorkArea1080p.Right);
        Assert.True(clamped.Bottom <= StandardWorkArea1080p.Bottom);

        // Minimum width and height must be enforced
        Assert.True(clamped.Width >= 50);
        Assert.True(clamped.Height >= 50);
    }

    [Fact]
    public void ResolveTargetMonitor_FindsMatchingMonitor_OrFallsBackToPrimary()
    {
        var primaryMon = new MonitorWorkAreaInfo(@"\\.\DISPLAY1", new RECT(0, 0, 1920, 1080), StandardWorkArea1080p, true);
        var secondaryMon = new MonitorWorkAreaInfo(@"\\.\DISPLAY2", new RECT(1920, 0, 3840, 1080), WorkAreaSecondaryMonitor, false);
        var monitors = new List<MonitorWorkAreaInfo> { primaryMon, secondaryMon };

        // 1. Matches existing secondary monitor
        var match = SceneLayoutMath.ResolveTargetMonitor(@"\\.\DISPLAY2", monitors);
        Assert.Equal(@"\\.\DISPLAY2", match.DeviceName);

        // 2. Missing monitor falls back to primary
        var missingFallback = SceneLayoutMath.ResolveTargetMonitor(@"\\.\DISPLAY_DISCONNECTED", monitors);
        Assert.Equal(@"\\.\DISPLAY1", missingFallback.DeviceName);
        Assert.True(missingFallback.IsPrimary);

        // 3. Null or whitespace device name falls back to primary
        var nullFallback = SceneLayoutMath.ResolveTargetMonitor(null, monitors);
        Assert.Equal(@"\\.\DISPLAY1", nullFallback.DeviceName);

        // 4. Empty monitors list returns safe default without throwing
        var emptyFallback = SceneLayoutMath.ResolveTargetMonitor(@"\\.\DISPLAY1", Array.Empty<MonitorWorkAreaInfo>());
        Assert.NotNull(emptyFallback);
        Assert.Equal(1920, emptyFallback.WorkArea.Width);
    }
}
