using Scepter.Api.Models;
using Scepter.Api.Native;
using Scepter.Api.Services;

namespace Scepter.Api.Tests;

public class SnapCalculatorTests
{
    private static readonly RECT StandardWorkArea = new(0, 0, 1920, 1040);

    [Fact]
    public void CalculateTargetRect_Left_DefaultHalfRatio()
    {
        RECT result = SnapCalculator.CalculateTargetRect(StandardWorkArea, SnapPosition.Left, 0.5);

        Assert.Equal(new RECT(0, 0, 960, 1040), result);
        Assert.Equal(960, result.Width);
        Assert.Equal(1040, result.Height);
    }

    [Fact]
    public void CalculateTargetRect_Right_DefaultHalfRatio()
    {
        RECT result = SnapCalculator.CalculateTargetRect(StandardWorkArea, SnapPosition.Right, 0.5);

        Assert.Equal(new RECT(960, 0, 1920, 1040), result);
        Assert.Equal(960, result.Width);
        Assert.Equal(1040, result.Height);
    }

    [Theory]
    [InlineData(0.25, 0, 0, 480, 1040)]
    [InlineData(0.60, 0, 0, 1152, 1040)]
    [InlineData(0.05, 0, 0, 384, 1040)] // Clamped to MinRatio (0.20)
    [InlineData(0.95, 0, 0, 1536, 1040)] // Clamped to MaxRatio (0.80)
    public void CalculateTargetRect_Left_WithCustomAndClampedRatios(
        double ratio, int expectedLeft, int expectedTop, int expectedRight, int expectedBottom)
    {
        RECT result = SnapCalculator.CalculateTargetRect(StandardWorkArea, SnapPosition.Left, ratio);
        Assert.Equal(new RECT(expectedLeft, expectedTop, expectedRight, expectedBottom), result);
    }

    [Fact]
    public void CalculateTargetRect_Right_WithCustomRatio()
    {
        RECT result = SnapCalculator.CalculateTargetRect(StandardWorkArea, SnapPosition.Right, 0.25);
        Assert.Equal(new RECT(1440, 0, 1920, 1040), result);
    }

    [Fact]
    public void CalculateTargetRect_Top_FillsEntireWorkArea()
    {
        RECT result = SnapCalculator.CalculateTargetRect(StandardWorkArea, SnapPosition.Top, 0.5);
        Assert.Equal(StandardWorkArea, result);
    }

    [Fact]
    public void CalculateTargetRect_FourCorners_ProduceExactQuarters()
    {
        RECT topLeft = SnapCalculator.CalculateTargetRect(StandardWorkArea, SnapPosition.TopLeft, 0.5);
        RECT topRight = SnapCalculator.CalculateTargetRect(StandardWorkArea, SnapPosition.TopRight, 0.5);
        RECT bottomLeft = SnapCalculator.CalculateTargetRect(StandardWorkArea, SnapPosition.BottomLeft, 0.5);
        RECT bottomRight = SnapCalculator.CalculateTargetRect(StandardWorkArea, SnapPosition.BottomRight, 0.5);

        Assert.Equal(new RECT(0, 0, 960, 520), topLeft);
        Assert.Equal(new RECT(960, 0, 1920, 520), topRight);
        Assert.Equal(new RECT(0, 520, 960, 1040), bottomLeft);
        Assert.Equal(new RECT(960, 520, 1920, 1040), bottomRight);
    }

    [Fact]
    public void CalculateTargetRect_SecondaryMonitorWithNegativeCoordinates()
    {
        // Secondary monitor to the left of primary: [-1920, 0, 0, 1040]
        var leftMonitorWorkArea = new RECT(-1920, 0, 0, 1040);

        RECT leftHalf = SnapCalculator.CalculateTargetRect(leftMonitorWorkArea, SnapPosition.Left, 0.5);
        RECT rightHalf = SnapCalculator.CalculateTargetRect(leftMonitorWorkArea, SnapPosition.Right, 0.5);

        Assert.Equal(new RECT(-1920, 0, -960, 1040), leftHalf);
        Assert.Equal(new RECT(-960, 0, 0, 1040), rightHalf);
    }

    [Fact]
    public void CompensateInvisibleBorders_ExpandsTargetRectByDwmMargins()
    {
        var desiredVisible = new RECT(0, 0, 960, 1040);
        // Typical Windows 10/11 window has 7px invisible left/right/bottom resize border and 0px top border
        var windowRect = new RECT(100, 100, 900, 700);
        var extendedFrame = new RECT(107, 100, 893, 693);

        RECT compensated = SnapCalculator.CompensateInvisibleBorders(desiredVisible, windowRect, extendedFrame);

        Assert.Equal(new RECT(-7, 0, 967, 1047), compensated);
    }

    [Fact]
    public void CalculateResizedRect_ScalesProportionallyAndClampsToWorkArea()
    {
        var current = new RECT(460, 220, 1460, 820); // 1000x600 centered at (960, 520)
        RECT scaledUp = SnapCalculator.CalculateResizedRect(current, StandardWorkArea, 1.2);

        Assert.Equal(1200, scaledUp.Width);
        Assert.Equal(720, scaledUp.Height);
        Assert.Equal(360, scaledUp.Left);
        Assert.Equal(160, scaledUp.Top);
    }
}

