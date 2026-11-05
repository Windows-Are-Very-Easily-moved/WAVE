using System.Runtime.InteropServices;
using Scepter.Api.Native;
using Scepter.Api.Services;

namespace Scepter.Api.Tests;

public class ScrollCalculatorTests
{
    private static readonly RECT PrimaryMonitorBounds = new(0, 0, 1920, 1080);

    [Theory]
    [InlineData(0, 0)]
    [InlineData(120, 120)]
    [InlineData(-240, -240)]
    [InlineData(1200, 1200)]
    [InlineData(-1200, -1200)]
    [InlineData(2500, 1200)]
    [InlineData(-4800, -1200)]
    public void ClampDelta_ClampsToDefaultPlusMinus1200(int input, int expected)
    {
        int clamped = ScrollCalculator.ClampDelta(input);
        Assert.Equal(expected, clamped);
    }

    [Fact]
    public void ClampDelta_SupportsCustomMaxDelta()
    {
        Assert.Equal(600, ScrollCalculator.ClampDelta(950, 600));
        Assert.Equal(-600, ScrollCalculator.ClampDelta(-950, 600));
    }

    [Theory]
    [InlineData(0.0, 0.0, 0, 0)]
    [InlineData(1.0, 1.0, 1919, 1079)]
    [InlineData(0.5, 0.5, 960, 540)]
    [InlineData(-0.25, 1.4, 0, 1079)] // Clamped to [0..1]
    public void NormalizedToScreenPixels_MapsPrimaryMonitorCorrectly(
        double normX, double normY, int expectedX, int expectedY)
    {
        POINT pt = ScrollCalculator.NormalizedToScreenPixels(normX, normY, PrimaryMonitorBounds);
        Assert.Equal(expectedX, pt.X);
        Assert.Equal(expectedY, pt.Y);
    }

    [Fact]
    public void NormalizedToScreenPixels_MapsNegativeSecondaryMonitorCoordinates()
    {
        var leftMonitor = new RECT(-1920, 0, 0, 1080);

        POINT origin = ScrollCalculator.NormalizedToScreenPixels(0.0, 0.0, leftMonitor);
        POINT center = ScrollCalculator.NormalizedToScreenPixels(0.5, 0.5, leftMonitor);
        POINT bottomRight = ScrollCalculator.NormalizedToScreenPixels(1.0, 1.0, leftMonitor);

        Assert.Equal(new POINT(-1920, 0), origin);
        Assert.Equal(new POINT(-960, 540), center);
        Assert.Equal(new POINT(-1, 1079), bottomRight);
    }

    [Fact]
    public void TryValidateScrollRequest_ValidatesMissingAndZeroDeltaAndCoordinates()
    {
        // Missing delta is invalid
        Assert.False(ScrollCalculator.TryValidateScrollRequest(null, false, null, null, out string? err1));
        Assert.NotNull(err1);

        // Delta 0 without begin=true is invalid
        Assert.False(ScrollCalculator.TryValidateScrollRequest(0, false, null, null, out string? err2));
        Assert.NotNull(err2);

        // Delta 0 with begin=true is valid
        Assert.True(ScrollCalculator.TryValidateScrollRequest(0, true, 0.5, 0.5, out string? err3));
        Assert.Null(err3);

        // Non-zero delta during scroll stream is valid
        Assert.True(ScrollCalculator.TryValidateScrollRequest(-180, false, null, null, out string? err4));
        Assert.Null(err4);

        // Out-of-bounds or incomplete coordinates are invalid
        Assert.False(ScrollCalculator.TryValidateScrollRequest(0, true, 1.5, 0.5, out _));
        Assert.False(ScrollCalculator.TryValidateScrollRequest(0, true, 0.5, null, out _));
        Assert.False(ScrollCalculator.TryValidateScrollRequest(0, true, double.NaN, 0.5, out _));
    }

    [Fact]
    public void NativeInputStruct_HasExactWin32SizeForSendInput()
    {
        int expectedSize = Environment.Is64BitProcess ? 40 : 28;
        int actualSize = Marshal.SizeOf<INPUT>();
        Assert.Equal(expectedSize, actualSize);
    }
}
