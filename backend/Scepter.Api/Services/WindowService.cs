using System.Diagnostics;
using System.Runtime.InteropServices;
using Scepter.Api.Models;
using Scepter.Api.Native;

namespace Scepter.Api.Services;

/// <summary>
/// Manages locking onto native desktop windows and snapping/resizing them via Win32 P/Invoke.
/// </summary>
public sealed class WindowService : IWindowService
{
    private readonly ForegroundTracker _tracker;
    private readonly ILogger<WindowService> _logger;
    private readonly object _targetLock = new();
    private IntPtr _lockedTarget = IntPtr.Zero;

    public WindowService(ForegroundTracker tracker, ILogger<WindowService> logger)
    {
        _tracker = tracker;
        _logger = logger;
    }

    public ActiveWindowInfo GetActiveTargetWindow()
    {
        EnsureWindowsSupported();

        IntPtr target = ResolveCurrentTarget(out bool isLocked);
        if (target == IntPtr.Zero)
        {
            return new ActiveWindowInfo(
                Handle: 0,
                Title: "No eligible desktop window",
                ProcessName: "none",
                ClassName: string.Empty,
                Bounds: null,
                IsLockedTarget: false
            );
        }

        string title = NativeMethods.GetWindowTitle(target);
        string className = NativeMethods.GetWindowClass(target);
        string processName = GetProcessName(target);
        RectDto? bounds = NativeMethods.GetWindowRect(target, out RECT rect)
            ? RectDto.FromRect(rect)
            : null;

        return new ActiveWindowInfo(
            Handle: target.ToInt64(),
            Title: title,
            ProcessName: processName,
            ClassName: className,
            Bounds: bounds,
            IsLockedTarget: isLocked
        );
    }

    public IReadOnlyList<ActiveWindowInfo> GetRecentWindows()
    {
        EnsureWindowsSupported();

        IntPtr currentTarget = ResolveCurrentTarget(out _);
        var stack = _tracker.GetEligibleWindowStack();
        var list = new List<ActiveWindowInfo>(stack.Count);

        foreach (IntPtr hWnd in stack)
        {
            string title = NativeMethods.GetWindowTitle(hWnd);
            string className = NativeMethods.GetWindowClass(hWnd);
            string processName = GetProcessName(hWnd);
            RectDto? bounds = NativeMethods.GetWindowRect(hWnd, out RECT rect)
                ? RectDto.FromRect(rect)
                : null;

            list.Add(new ActiveWindowInfo(
                Handle: hWnd.ToInt64(),
                Title: title,
                ProcessName: processName,
                ClassName: className,
                Bounds: bounds,
                IsLockedTarget: hWnd == currentTarget
            ));
        }

        return list;
    }

    public SnapResult CycleWindow(CycleRequest request)
    {
        EnsureWindowsSupported();

        IntPtr currentTarget = ResolveCurrentTarget(out _);
        IntPtr nextTarget;

        if (request.Handle.HasValue && request.Handle.Value != 0)
        {
            var requestedHwnd = new IntPtr(request.Handle.Value);
            nextTarget = _tracker.IsEligibleTargetWindow(requestedHwnd)
                ? requestedHwnd
                : _tracker.CycleTargetWindow(currentTarget, forward: true);
        }
        else
        {
            bool forward = !string.Equals(request.Direction, "prev", StringComparison.OrdinalIgnoreCase) &&
                           !string.Equals(request.Direction, "previous", StringComparison.OrdinalIgnoreCase);

            // Push current foreground window to the bottom of Z-order when cycling forward (like Alt+Esc / Alt+Tab)
            if (forward && currentTarget != IntPtr.Zero && NativeMethods.IsWindow(currentTarget))
            {
                NativeMethods.SetWindowPos(
                    currentTarget,
                    NativeMethods.HWND_BOTTOM,
                    0, 0, 0, 0,
                    NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE | NativeMethods.SWP_NOACTIVATE);
            }

            nextTarget = _tracker.CycleTargetWindow(currentTarget, forward);
        }

        if (nextTarget == IntPtr.Zero)
        {
            return new SnapResult(
                Success: false,
                WindowTitle: string.Empty,
                AppliedRect: null,
                Message: "No eligible desktop windows available to cycle."
            );
        }

        lock (_targetLock)
        {
            _lockedTarget = nextTarget;
        }

        // Bring the newly selected target window to the foreground so the user immediately sees it
        NativeMethods.ForceForegroundWindow(nextTarget);
        NativeMethods.GetWindowRect(nextTarget, out RECT rect);

        string title = NativeMethods.GetWindowTitle(nextTarget);
        string processName = GetProcessName(nextTarget);

        _logger.LogInformation("Cycled active target window to '{Title}' ({Process}, HWND 0x{Hwnd:X}).",
            title, processName, nextTarget.ToInt64());

        return new SnapResult(
            Success: true,
            WindowTitle: title,
            AppliedRect: RectDto.FromRect(rect),
            Message: $"Switched target to '{title}'.",
            ProcessName: processName,
            Handle: nextTarget.ToInt64()
        );
    }

    public SnapResult GrabWindow(GrabRequest request)
    {
        EnsureWindowsSupported();

        double clampedX = Math.Clamp(request.X, 0.0, 1.0);
        double clampedY = Math.Clamp(request.Y, 0.0, 1.0);

        // Determine the monitor work area to map normalized [0..1] coordinates into physical screen pixels.
        // Prefer the monitor of the last active eligible window (or primary monitor fallback).
        IntPtr referenceWindow = _tracker.GetLastEligibleWindow();
        MONITORINFO monitorInfo = GetMonitorInfoForWindowOrPrimary(referenceWindow);
        RECT screenBounds = monitorInfo.rcMonitor;

        int pixelX = screenBounds.Left + (int)Math.Round(clampedX * (screenBounds.Width - 1));
        int pixelY = screenBounds.Top + (int)Math.Round(clampedY * (screenBounds.Height - 1));

        IntPtr hitHwnd = NativeMethods.WindowFromPoint(new POINT(pixelX, pixelY));
        IntPtr rootHwnd = hitHwnd != IntPtr.Zero
            ? NativeMethods.GetAncestor(hitHwnd, NativeMethods.GA_ROOT)
            : IntPtr.Zero;

        string hitTitle = NativeMethods.GetWindowTitle(rootHwnd);
        bool usedFallback = false;

        // Ignore Scepter's own HUD browser window or any protected/invalid desktop window
        if (rootHwnd == IntPtr.Zero || !_tracker.IsEligibleTargetWindow(rootHwnd))
        {
            usedFallback = true;
            rootHwnd = _tracker.GetLastEligibleWindow();
        }

        if (rootHwnd == IntPtr.Zero)
        {
            _logger.LogWarning("Grab at ({X:F2}, {Y:F2}) -> ({Px}, {Py}px) found no eligible target window.",
                clampedX, clampedY, pixelX, pixelY);

            return new SnapResult(
                Success: false,
                WindowTitle: string.Empty,
                AppliedRect: null,
                Message: "No eligible desktop window available to grab."
            );
        }

        lock (_targetLock)
        {
            _lockedTarget = rootHwnd;
        }

        _tracker.RecordWindow(rootHwnd);

        string targetTitle = NativeMethods.GetWindowTitle(rootHwnd);
        string processName = GetProcessName(rootHwnd);
        NativeMethods.GetWindowRect(rootHwnd, out RECT currentRect);

        _logger.LogInformation(
            "Grabbed window '{Title}' (PID process: {Process}, HWND: 0x{Hwnd:X}, fallback={UsedFallback}, hit='{HitTitle}') at ({Px}, {Py}).",
            targetTitle, processName, rootHwnd.ToInt64(), usedFallback, hitTitle, pixelX, pixelY);

        return new SnapResult(
            Success: true,
            WindowTitle: targetTitle,
            AppliedRect: RectDto.FromRect(currentRect),
            Message: usedFallback
                ? $"Locked onto last active window '{targetTitle}' (ignored HUD/desktop under cursor)."
                : $"Locked onto '{targetTitle}'.",
            ProcessName: processName,
            Handle: rootHwnd.ToInt64()
        );
    }

    public SnapResult MoveWindow(MoveRequest request)
    {
        EnsureWindowsSupported();

        IntPtr target = ResolveCurrentTarget(out _);
        if (target == IntPtr.Zero)
        {
            return new SnapResult(false, string.Empty, null, "No window locked to move.");
        }

        string title = NativeMethods.GetWindowTitle(target);
        string processName = GetProcessName(target);

        if (_tracker.IsProtectedOrInvalidWindow(target) || _tracker.IsSelfWindow(target))
        {
            return new SnapResult(false, title, null, "Cannot move protected window.");
        }

        // If window is currently maximized or minimized, restore it so it can move freely
        if (NativeMethods.IsZoomed(target) || NativeMethods.IsIconic(target))
        {
            NativeMethods.ShowWindow(target, NativeMethods.SW_RESTORE);
        }

        if (!NativeMethods.GetWindowRect(target, out RECT currentRect))
        {
            return new SnapResult(false, title, null, "Failed to get current window rect.");
        }

        MONITORINFO monitorInfo = GetMonitorInfoForWindowOrPrimary(target);
        RECT screenBounds = monitorInfo.rcMonitor;

        int newX, newY;

        // If delta is provided, apply delta directly to current position
        if (Math.Abs(request.DeltaX) > 0.0001 || Math.Abs(request.DeltaY) > 0.0001)
        {
            int dxPixels = (int)Math.Round(request.DeltaX * screenBounds.Width);
            int dyPixels = (int)Math.Round(request.DeltaY * screenBounds.Height);
            newX = currentRect.Left + dxPixels;
            newY = currentRect.Top + dyPixels;
        }
        else
        {
            // Center the window around the normalized hand cursor coordinates
            double clampedX = Math.Clamp(request.X, 0.0, 1.0);
            double clampedY = Math.Clamp(request.Y, 0.0, 1.0);
            int cursorPixelX = screenBounds.Left + (int)Math.Round(clampedX * screenBounds.Width);
            int cursorPixelY = screenBounds.Top + (int)Math.Round(clampedY * screenBounds.Height);

            newX = cursorPixelX - (currentRect.Width / 2);
            newY = cursorPixelY - 30; // offset slightly so hand grabs near top/titlebar
        }

        // Clamp so the window never completely disappears offscreen
        newX = Math.Clamp(newX, screenBounds.Left - currentRect.Width + 100, screenBounds.Right - 100);
        newY = Math.Clamp(newY, screenBounds.Top, screenBounds.Bottom - 60);

        uint flags = NativeMethods.SWP_NOSIZE | NativeMethods.SWP_NOZORDER | NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_ASYNCWINDOWPOS;
        NativeMethods.SetWindowPos(target, IntPtr.Zero, newX, newY, 0, 0, flags);

        var applied = new RECT(newX, newY, newX + currentRect.Width, newY + currentRect.Height);
        return new SnapResult(
            Success: true,
            WindowTitle: title,
            AppliedRect: RectDto.FromRect(applied),
            Message: "Moved window.",
            ProcessName: processName,
            Handle: target.ToInt64()
        );
    }

    public SnapResult SnapWindow(SnapRequest request)
    {
        EnsureWindowsSupported();

        IntPtr target = ResolveCurrentTarget(out _);
        if (target == IntPtr.Zero)
        {
            return new SnapResult(
                Success: false,
                WindowTitle: string.Empty,
                AppliedRect: null,
                Message: "No eligible target window found to snap."
            );
        }

        string title = NativeMethods.GetWindowTitle(target);
        string processName = GetProcessName(target);

        if (_tracker.IsProtectedOrInvalidWindow(target) || _tracker.IsSelfWindow(target))
        {
            return new SnapResult(
                Success: false,
                WindowTitle: title,
                AppliedRect: null,
                Message: $"Refused to move protected or self window '{title}'."
            );
        }

        // Restore first if maximized or minimized so SetWindowPos works reliably
        if (NativeMethods.IsZoomed(target) || NativeMethods.IsIconic(target))
        {
            NativeMethods.ShowWindow(target, NativeMethods.SW_RESTORE);
        }

        // Top zone maximizes the window cleanly on its current monitor
        if (request.Position == SnapPosition.Top)
        {
            bool maxOk = NativeMethods.ShowWindow(target, NativeMethods.SW_MAXIMIZE);
            int err = Marshal.GetLastWin32Error();
            NativeMethods.GetWindowRect(target, out RECT maxRect);

            _logger.LogInformation("Maximized window '{Title}' (HWND 0x{Hwnd:X}). Result={Result}",
                title, target.ToInt64(), maxOk);

            return new SnapResult(
                Success: true,
                WindowTitle: title,
                AppliedRect: RectDto.FromRect(maxRect),
                Message: maxOk ? $"Maximized '{title}'." : $"ShowWindow(SW_MAXIMIZE) completed (Win32 code {err}).",
                ProcessName: processName,
                Handle: target.ToInt64()
            );
        }

        MONITORINFO monitorInfo = GetTargetMonitorInfo(target, request.Position == SnapPosition.NextMonitor);
        RECT workArea = monitorInfo.rcWork;

        SnapPosition effectivePosition = request.Position == SnapPosition.NextMonitor
            ? SnapPosition.Left
            : request.Position;

        double effectiveRatio = request.Position == SnapPosition.NextMonitor
            ? 1.0
            : request.Ratio;

        RECT desiredVisibleRect = request.Position == SnapPosition.NextMonitor
            ? workArea
            : SnapCalculator.CalculateTargetRect(workArea, effectivePosition, effectiveRatio);

        // Compensate for Windows 10/11 DWM invisible resize borders so windows sit flush with zero gaps
        RECT compensatedRect = ApplyDwmBorderCompensation(target, desiredVisibleRect);

        uint flags = NativeMethods.SWP_NOZORDER | NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_SHOWWINDOW;
        bool moved = NativeMethods.SetWindowPos(
            target,
            IntPtr.Zero,
            compensatedRect.Left,
            compensatedRect.Top,
            compensatedRect.Width,
            compensatedRect.Height,
            flags);

        if (!moved)
        {
            int win32Error = Marshal.GetLastWin32Error();
            string errorMsg = $"SetWindowPos failed for '{title}' with Win32 error {win32Error}.";
            _logger.LogWarning("Snap failed: {Error}", errorMsg);

            return new SnapResult(
                Success: false,
                WindowTitle: title,
                AppliedRect: null,
                Message: errorMsg,
                ProcessName: processName,
                Handle: target.ToInt64()
            );
        }

        _logger.LogInformation(
            "Snapped window '{Title}' to {Position} (ratio {Ratio:F2}) -> Visible {VisibleRect}, Compensated {CompRect}.",
            title, request.Position, request.Ratio, desiredVisibleRect, compensatedRect);

        return new SnapResult(
            Success: true,
            WindowTitle: title,
            AppliedRect: RectDto.FromRect(desiredVisibleRect),
            Message: $"Snapped '{title}' to {request.Position}.",
            ProcessName: processName,
            Handle: target.ToInt64()
        );
    }

    public SnapResult ResizeWindow(ResizeRequest request)
    {
        EnsureWindowsSupported();

        IntPtr target = ResolveCurrentTarget(out _);
        if (target == IntPtr.Zero)
        {
            return new SnapResult(
                Success: false,
                WindowTitle: string.Empty,
                AppliedRect: null,
                Message: "No eligible target window found to resize."
            );
        }

        string title = NativeMethods.GetWindowTitle(target);
        string processName = GetProcessName(target);

        if (NativeMethods.IsZoomed(target) || NativeMethods.IsIconic(target))
        {
            NativeMethods.ShowWindow(target, NativeMethods.SW_RESTORE);
        }

        if (!NativeMethods.GetWindowRect(target, out RECT currentRect))
        {
            int err = Marshal.GetLastWin32Error();
            return new SnapResult(false, title, null, $"GetWindowRect failed (Win32 error {err}).", processName, target.ToInt64());
        }

        MONITORINFO monitorInfo = GetMonitorInfoForWindowOrPrimary(target);
        RECT desiredRect = SnapCalculator.CalculateResizedRect(currentRect, monitorInfo.rcWork, request.ScaleFactor);
        RECT compensated = ApplyDwmBorderCompensation(target, desiredRect);

        bool ok = NativeMethods.SetWindowPos(
            target,
            IntPtr.Zero,
            compensated.Left,
            compensated.Top,
            compensated.Width,
            compensated.Height,
            NativeMethods.SWP_NOZORDER | NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_SHOWWINDOW);

        if (!ok)
        {
            int err = Marshal.GetLastWin32Error();
            return new SnapResult(false, title, null, $"SetWindowPos failed with Win32 error {err}.", processName, target.ToInt64());
        }

        return new SnapResult(
            Success: true,
            WindowTitle: title,
            AppliedRect: RectDto.FromRect(desiredRect),
            Message: $"Resized '{title}' by {request.ScaleFactor:F2}x.",
            ProcessName: processName,
            Handle: target.ToInt64()
        );
    }

    private IntPtr ResolveCurrentTarget(out bool isLocked)
    {
        lock (_targetLock)
        {
            if (_lockedTarget != IntPtr.Zero && _tracker.IsEligibleTargetWindow(_lockedTarget))
            {
                isLocked = true;
                return _lockedTarget;
            }
            _lockedTarget = IntPtr.Zero;
        }

        isLocked = false;
        return _tracker.GetLastEligibleWindow();
    }

    private static RECT ApplyDwmBorderCompensation(IntPtr hWnd, RECT desiredVisibleRect)
    {
        if (NativeMethods.GetWindowRect(hWnd, out RECT windowRect))
        {
            int hr = NativeMethods.DwmGetWindowAttribute(
                hWnd,
                NativeMethods.DWMWA_EXTENDED_FRAME_BOUNDS,
                out RECT frameBounds,
                Marshal.SizeOf<RECT>());

            if (hr == 0)
            {
                return SnapCalculator.CompensateInvisibleBorders(desiredVisibleRect, windowRect, frameBounds);
            }
        }

        return desiredVisibleRect;
    }

    private static MONITORINFO GetMonitorInfoForWindowOrPrimary(IntPtr hWnd)
    {
        IntPtr hMonitor = hWnd != IntPtr.Zero
            ? NativeMethods.MonitorFromWindow(hWnd, NativeMethods.MONITOR_DEFAULTTONEAREST)
            : NativeMethods.MonitorFromPoint(new POINT(0, 0), NativeMethods.MONITOR_DEFAULTTOPRIMARY);

        var mi = MONITORINFO.Create();
        if (!NativeMethods.GetMonitorInfo(hMonitor, ref mi))
        {
            // Safe fallback to 1920x1080 work area if GetMonitorInfo ever fails
            mi.rcMonitor = new RECT(0, 0, 1920, 1080);
            mi.rcWork = new RECT(0, 0, 1920, 1040);
        }
        return mi;
    }

    private static MONITORINFO GetTargetMonitorInfo(IntPtr hWnd, bool nextMonitor)
    {
        if (!nextMonitor)
        {
            return GetMonitorInfoForWindowOrPrimary(hWnd);
        }

        IntPtr currentMonitor = NativeMethods.MonitorFromWindow(hWnd, NativeMethods.MONITOR_DEFAULTTONEAREST);
        var monitors = new List<IntPtr>();

        NativeMethods.EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMon, IntPtr _, ref RECT _, IntPtr _) =>
        {
            monitors.Add(hMon);
            return true;
        }, IntPtr.Zero);

        if (monitors.Count > 1)
        {
            int idx = monitors.IndexOf(currentMonitor);
            IntPtr nextMon = monitors[(idx + 1) % monitors.Count];
            var mi = MONITORINFO.Create();
            if (NativeMethods.GetMonitorInfo(nextMon, ref mi))
            {
                return mi;
            }
        }

        return GetMonitorInfoForWindowOrPrimary(hWnd);
    }

    private static string GetProcessName(IntPtr hWnd)
    {
        try
        {
            NativeMethods.GetWindowThreadProcessId(hWnd, out uint pid);
            if (pid == 0) return "unknown";
            using var proc = Process.GetProcessById((int)pid);
            return proc.ProcessName;
        }
        catch
        {
            return "unknown";
        }
    }

    private static void EnsureWindowsSupported()
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("Scepter Win32 window management requires Windows 10/11.");
        }
    }
}

