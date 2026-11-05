using System.Runtime.InteropServices;
using Scepter.Api.Models;
using Scepter.Api.Native;

namespace Scepter.Api.Services;

/// <summary>
/// Injects native Win32 mouse cursor positioning (SetCursorPos) and vertical wheel scrolling (SendInput)
/// for W.A.V.E's V-sign scroll gesture.
/// </summary>
public sealed class InputService : IInputService
{
    private readonly ForegroundTracker _tracker;
    private readonly ILogger<InputService> _logger;
    private readonly bool _moveCursorToHand;
    private readonly int _maxScrollDelta;

    public InputService(
        ForegroundTracker tracker,
        IConfiguration configuration,
        ILogger<InputService> logger)
    {
        _tracker = tracker;
        _logger = logger;
        _moveCursorToHand = configuration.GetValue<bool?>("Scepter:MoveCursorToHand")
            ?? configuration.GetValue<bool?>("Scepter:Scroll:MoveCursorToHand")
            ?? true;
        _maxScrollDelta = configuration.GetValue<int?>("Scepter:MaxScrollDelta")
            ?? configuration.GetValue<int?>("Scepter:Scroll:MaxScrollDelta")
            ?? ScrollCalculator.DefaultMaxScrollDelta;
    }

    public ScrollResponse Scroll(ScrollRequest request)
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("W.A.V.E Win32 input injection requires Windows 10/11.");
        }

        int rawDelta = request.Delta ?? 0;
        int clampedDelta = ScrollCalculator.ClampDelta(rawDelta, _maxScrollDelta);

        if (request.Begin)
        {
            if (_moveCursorToHand && request.X.HasValue && request.Y.HasValue)
            {
                IntPtr referenceWindow = _tracker.GetLastEligibleWindow();
                MONITORINFO monitorInfo = GetMonitorInfoForWindowOrPrimary(referenceWindow);
                POINT targetPixel = ScrollCalculator.NormalizedToScreenPixels(
                    request.X.Value,
                    request.Y.Value,
                    monitorInfo.rcMonitor);

                bool moved = NativeMethods.SetCursorPos(targetPixel.X, targetPixel.Y);
                _logger.LogInformation(
                    "V-sign scroll session started at ({NormX:F2}, {NormY:F2}) -> cursor moved to ({Px}, {Py}px) (ok={Moved}).",
                    request.X.Value, request.Y.Value, targetPixel.X, targetPixel.Y, moved);
            }
            else
            {
                _logger.LogInformation(
                    "V-sign scroll session started (MoveCursorToHand={MoveCursor}, coordsProvided={HasCoords}).",
                    _moveCursorToHand, request.X.HasValue && request.Y.HasValue);
            }
        }

        if (clampedDelta != 0)
        {
            var input = new INPUT
            {
                type = NativeMethods.INPUT_MOUSE,
                U = new INPUTUNION
                {
                    mi = new MOUSEINPUT
                    {
                        dx = 0,
                        dy = 0,
                        mouseData = clampedDelta,
                        dwFlags = NativeMethods.MOUSEEVENTF_WHEEL,
                        time = 0,
                        dwExtraInfo = IntPtr.Zero
                    }
                }
            };

            int cbSize = Marshal.SizeOf<INPUT>();
            uint sent = NativeMethods.SendInput(1, [input], cbSize);

            if (sent == 0)
            {
                int win32Err = Marshal.GetLastWin32Error();
                _logger.LogDebug(
                    "SendInput(MOUSEEVENTF_WHEEL, delta={Delta}, cbSize={Size}) returned 0 (Win32 error {Error}).",
                    clampedDelta, cbSize, win32Err);
            }
            else
            {
                _logger.LogDebug(
                    "Injected wheel scroll delta={Delta} (raw={RawDelta}, cbSize={Size}).",
                    clampedDelta, rawDelta, cbSize);
            }
        }

        return new ScrollResponse(Success: true);
    }

    private static MONITORINFO GetMonitorInfoForWindowOrPrimary(IntPtr hWnd)
    {
        IntPtr hMonitor = hWnd != IntPtr.Zero
            ? NativeMethods.MonitorFromWindow(hWnd, NativeMethods.MONITOR_DEFAULTTONEAREST)
            : NativeMethods.MonitorFromPoint(new POINT(0, 0), NativeMethods.MONITOR_DEFAULTTOPRIMARY);

        var mi = MONITORINFO.Create();
        if (!NativeMethods.GetMonitorInfo(hMonitor, ref mi))
        {
            mi.rcMonitor = new RECT(0, 0, 1920, 1080);
            mi.rcWork = new RECT(0, 0, 1920, 1040);
        }
        return mi;
    }
}
