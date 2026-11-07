using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Scepter.Api.Models;
using Scepter.Api.Native;

namespace Scepter.Api.Services;

public sealed class DuplicateGestureException : Exception
{
    public DuplicateGestureException(string message) : base(message) { }
}

public sealed class SceneService : ISceneService
{
    public const int MaxScenes = 20;
    public const int MaxWindowsPerScene = 12;
    public const int MaxNameLength = 60;

    private readonly ForegroundTracker _tracker;
    private readonly IConfiguration _configuration;
    private readonly ILogger<SceneService> _logger;
    private readonly string _storageFilePath;
    private readonly object _storageLock = new();

    private List<Scene> _scenes = new();
    private bool _loaded = false;

    // Phase 2 undo buffer: snapshot of windows before apply
    private readonly object _undoLock = new();
    private List<(IntPtr Hwnd, RECT Rect, int ShowCmd)>? _lastApplySnapshot = null;

    public SceneService(
        ForegroundTracker tracker,
        IConfiguration configuration,
        ILogger<SceneService> logger,
        string? customStoragePath = null)
    {
        _tracker = tracker;
        _configuration = configuration;
        _logger = logger;

        if (!string.IsNullOrWhiteSpace(customStoragePath))
        {
            _storageFilePath = customStoragePath;
        }
        else
        {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string waveDir = Path.Combine(appData, "WAVE");
            _storageFilePath = Path.Combine(waveDir, "scenes.json");
        }
    }

    public bool HasUndo
    {
        get
        {
            lock (_undoLock)
            {
                return _lastApplySnapshot != null && _lastApplySnapshot.Count > 0;
            }
        }
    }

    public IReadOnlyList<SceneSummaryDto> GetScenes()
    {
        EnsureLoaded();
        lock (_storageLock)
        {
            return _scenes.Select(ToSummaryDto).ToList();
        }
    }

    public Scene? GetSceneById(Guid id)
    {
        EnsureLoaded();
        lock (_storageLock)
        {
            return _scenes.FirstOrDefault(s => s.Id == id);
        }
    }

    public SceneSummaryDto CaptureScene(CaptureSceneRequest request)
    {
        EnsureLoaded();

        string name = (request.Name ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            name = $"Scene {DateTime.Now:MMM d, HH:mm}";
        }
        if (name.Length > MaxNameLength)
        {
            name = name.Substring(0, MaxNameLength).Trim();
        }

        ValidateGestureFingers(request.GestureFingers, excludeSceneId: null);

        var capturedWindows = CaptureCurrentDesktopWindows();

        var scene = new Scene
        {
            Id = Guid.NewGuid(),
            Name = name,
            GestureFingers = request.GestureFingers,
            CreatedAt = DateTimeOffset.UtcNow,
            Windows = capturedWindows
        };

        lock (_storageLock)
        {
            if (_scenes.Count >= MaxScenes)
            {
                throw new InvalidOperationException($"Maximum scene limit of {MaxScenes} reached. Please delete a scene before creating a new one.");
            }

            _scenes.Add(scene);
            SaveScenesToDisk();
        }

        _logger.LogInformation("Captured and saved scene '{SceneName}' (ID: {SceneId}) with {WindowCount} window(s). Gesture: {Gesture}",
            scene.Name, scene.Id, scene.Windows.Count, scene.GestureFingers?.ToString() ?? "none");

        return ToSummaryDto(scene);
    }

    public SceneSummaryDto? UpdateScene(Guid id, UpdateSceneRequest request)
    {
        EnsureLoaded();

        lock (_storageLock)
        {
            var scene = _scenes.FirstOrDefault(s => s.Id == id);
            if (scene == null) return null;

            if (request.Name != null)
            {
                string newName = request.Name.Trim();
                if (string.IsNullOrWhiteSpace(newName))
                {
                    throw new ArgumentException("Scene name cannot be empty.");
                }
                if (newName.Length > MaxNameLength)
                {
                    newName = newName.Substring(0, MaxNameLength).Trim();
                }
                scene.Name = newName;
            }

            if (request.GestureFingers != null || request.GestureFingers == null)
            {
                ValidateGestureFingers(request.GestureFingers, excludeSceneId: id);
                scene.GestureFingers = request.GestureFingers;
            }

            SaveScenesToDisk();
            _logger.LogInformation("Updated scene '{SceneName}' (ID: {SceneId}). Gesture: {Gesture}",
                scene.Name, scene.Id, scene.GestureFingers?.ToString() ?? "none");

            return ToSummaryDto(scene);
        }
    }

    public bool DeleteScene(Guid id)
    {
        EnsureLoaded();

        lock (_storageLock)
        {
            int index = _scenes.FindIndex(s => s.Id == id);
            if (index < 0) return false;

            var removed = _scenes[index];
            _scenes.RemoveAt(index);
            SaveScenesToDisk();

            _logger.LogInformation("Deleted scene '{SceneName}' (ID: {SceneId}).", removed.Name, id);
            return true;
        }
    }

    public SceneApplyResult? ApplyScene(Guid id)
    {
        var sw = Stopwatch.StartNew();
        var scene = GetSceneById(id);
        if (scene == null) return null;

        var restored = new List<RestoredWindowInfo>();
        var missing = new List<MissingWindowInfo>();
        var failed = new List<FailedWindowInfo>();

        if (!OperatingSystem.IsWindows())
        {
            return new SceneApplyResult(
                Scene: ToSummaryDto(scene),
                Restored: restored,
                Missing: missing,
                Failed: new[] { new FailedWindowInfo("all", "all", null, "Win32 actions only supported on Windows.") },
                DurationMs: sw.ElapsedMilliseconds
            );
        }

        var candidates = GetOpenCandidateWindows();
        var matchResult = SceneMatcher.MatchWindows(scene.Windows, candidates);

        var monitors = GetAvailableMonitors();

        // 1. Snapshot current layout of matched windows for 1-level undo
        lock (_undoLock)
        {
            _lastApplySnapshot = new List<(IntPtr Hwnd, RECT Rect, int ShowCmd)>();
            foreach (var match in matchResult.Matched)
            {
                IntPtr hWnd = match.Candidate.Handle;
                if (!NativeMethods.IsWindow(hWnd)) continue;

                var placement = WINDOWPLACEMENT.Create();
                int showCmd = NativeMethods.SW_SHOWNORMAL;
                if (SceneNativeMethods.GetWindowPlacement(hWnd, ref placement))
                {
                    showCmd = placement.showCmd;
                }

                RECT currentRect = placement.rcNormalPosition;
                if (NativeMethods.GetWindowRect(hWnd, out RECT wr) && wr.Width > 0 && wr.Height > 0)
                {
                    currentRect = wr;
                }

                _lastApplySnapshot.Add((hWnd, currentRect, showCmd));
            }
        }

        var successfullyPlaced = new List<(IntPtr Hwnd, int ZOrder)>();

        // 2. Position matched windows
        foreach (var match in matchResult.Matched)
        {
            IntPtr hWnd = match.Candidate.Handle;
            var target = match.Target;

            if (!NativeMethods.IsWindow(hWnd))
            {
                missing.Add(new MissingWindowInfo(target.ProcessName, target.ClassName, target.TitleHint));
                continue;
            }

            if (_tracker.IsProtectedOrInvalidWindow(hWnd) || _tracker.IsSelfWindow(hWnd))
            {
                failed.Add(new FailedWindowInfo(target.ProcessName, target.ClassName, target.TitleHint, "Protected or self window."));
                continue;
            }

            try
            {
                // Restore first so SetWindowPos and coordinates apply cleanly
                if (NativeMethods.IsZoomed(hWnd) || NativeMethods.IsIconic(hWnd))
                {
                    NativeMethods.ShowWindow(hWnd, NativeMethods.SW_RESTORE);
                }

                var targetMonitor = SceneLayoutMath.ResolveTargetMonitor(target.MonitorDeviceName, monitors);
                RECT desiredVisibleRect = SceneLayoutMath.FractionalToPixels(target.Rect, targetMonitor.WorkArea);

                // Compensate invisible resize borders
                RECT compensatedRect = desiredVisibleRect;
                if (NativeMethods.GetWindowRect(hWnd, out RECT currentRect))
                {
                    int hr = NativeMethods.DwmGetWindowAttribute(
                        hWnd,
                        NativeMethods.DWMWA_EXTENDED_FRAME_BOUNDS,
                        out RECT frameBounds,
                        Marshal.SizeOf<RECT>());

                    if (hr == 0)
                    {
                        compensatedRect = SnapCalculator.CompensateInvisibleBorders(desiredVisibleRect, currentRect, frameBounds);
                    }
                }

                uint flags = NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_NOZORDER | NativeMethods.SWP_SHOWWINDOW;
                bool moved = NativeMethods.SetWindowPos(
                    hWnd,
                    IntPtr.Zero,
                    compensatedRect.Left,
                    compensatedRect.Top,
                    compensatedRect.Width,
                    compensatedRect.Height,
                    flags);

                if (!moved)
                {
                    int err = Marshal.GetLastWin32Error();
                    failed.Add(new FailedWindowInfo(target.ProcessName, target.ClassName, target.TitleHint, $"SetWindowPos failed (Win32 error: {err}). Window may be elevated."));
                    continue;
                }

                // Apply maximized or minimized state if saved
                if (string.Equals(target.State, SceneWindowState.Maximized, StringComparison.OrdinalIgnoreCase))
                {
                    NativeMethods.ShowWindow(hWnd, NativeMethods.SW_SHOWMAXIMIZED);
                }
                else if (string.Equals(target.State, SceneWindowState.Minimized, StringComparison.OrdinalIgnoreCase))
                {
                    NativeMethods.ShowWindow(hWnd, NativeMethods.SW_SHOWMINIMIZED);
                }

                successfullyPlaced.Add((hWnd, target.ZOrder));
                restored.Add(new RestoredWindowInfo(target.ProcessName, target.ClassName, target.TitleHint, target.Rect));
            }
            catch (Exception ex)
            {
                failed.Add(new FailedWindowInfo(target.ProcessName, target.ClassName, target.TitleHint, ex.Message));
            }
        }

        // 3. Apply Z-Order back-to-front without focus stealing (SWP_NOACTIVATE)
        foreach (var item in successfullyPlaced.OrderByDescending(p => p.ZOrder))
        {
            NativeMethods.SetWindowPos(
                item.Hwnd,
                NativeMethods.HWND_TOP,
                0, 0, 0, 0,
                NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE | NativeMethods.SWP_NOACTIVATE);
        }

        // 4. Missing windows
        foreach (var miss in matchResult.Missing)
        {
            missing.Add(new MissingWindowInfo(miss.ProcessName, miss.ClassName, miss.TitleHint));
        }

        sw.Stop();
        _logger.LogInformation("Applied scene '{SceneName}' (ID: {SceneId}) in {ElapsedMs}ms. Restored: {RestoredCount}, Missing: {MissingCount}, Failed: {FailedCount}.",
            scene.Name, scene.Id, sw.ElapsedMilliseconds, restored.Count, missing.Count, failed.Count);

        return new SceneApplyResult(
            Scene: ToSummaryDto(scene),
            Restored: restored,
            Missing: missing,
            Failed: failed,
            DurationMs: sw.ElapsedMilliseconds
        );
    }

    public bool UndoLastApply()
    {
        if (!OperatingSystem.IsWindows()) return false;

        List<(IntPtr Hwnd, RECT Rect, int ShowCmd)> snapshot;
        lock (_undoLock)
        {
            if (_lastApplySnapshot == null || _lastApplySnapshot.Count == 0)
            {
                return false;
            }
            snapshot = new List<(IntPtr Hwnd, RECT Rect, int ShowCmd)>(_lastApplySnapshot);
            _lastApplySnapshot = null;
        }

        int restoredCount = 0;
        foreach (var item in snapshot)
        {
            if (!NativeMethods.IsWindow(item.Hwnd)) continue;

            if (NativeMethods.IsZoomed(item.Hwnd) || NativeMethods.IsIconic(item.Hwnd))
            {
                NativeMethods.ShowWindow(item.Hwnd, NativeMethods.SW_RESTORE);
            }

            uint flags = NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_NOZORDER | NativeMethods.SWP_SHOWWINDOW;
            NativeMethods.SetWindowPos(
                item.Hwnd,
                IntPtr.Zero,
                item.Rect.Left,
                item.Rect.Top,
                item.Rect.Width,
                item.Rect.Height,
                flags);

            if (item.ShowCmd == NativeMethods.SW_SHOWMAXIMIZED)
            {
                NativeMethods.ShowWindow(item.Hwnd, NativeMethods.SW_SHOWMAXIMIZED);
            }
            else if (item.ShowCmd == NativeMethods.SW_SHOWMINIMIZED)
            {
                NativeMethods.ShowWindow(item.Hwnd, NativeMethods.SW_SHOWMINIMIZED);
            }

            restoredCount++;
        }

        _logger.LogInformation("Undid last scene apply, restored {Count} window(s) to previous layout.", restoredCount);
        return restoredCount > 0;
    }

    private List<OpenWindowCandidate> GetOpenCandidateWindows()
    {
        var candidates = new List<OpenWindowCandidate>();
        if (!OperatingSystem.IsWindows()) return candidates;

        int zOrder = 0;
        NativeMethods.EnumInteractiveWindows((hWnd, _) =>
        {
            if (hWnd == IntPtr.Zero || !NativeMethods.IsWindow(hWnd)) return true;
            if (!NativeMethods.IsWindowVisible(hWnd) && !NativeMethods.IsIconic(hWnd)) return true;
            if (NativeMethods.IsWindowCloaked(hWnd)) return true;
            if (_tracker.IsSelfWindow(hWnd)) return true;

            int exStyle = SceneNativeMethods.GetWindowLong(hWnd, NativeMethods.GWL_EXSTYLE);
            if ((exStyle & NativeMethods.WS_EX_TOOLWINDOW) != 0) return true;

            string className = NativeMethods.GetWindowClass(hWnd);
            if (string.IsNullOrWhiteSpace(className) ||
                string.Equals(className, "Progman", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(className, "Shell_TrayWnd", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(className, "Shell_SecondaryTrayWnd", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(className, "WorkerW", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            string title = NativeMethods.GetWindowTitle(hWnd);
            string processName = GetProcessName(hWnd);

            candidates.Add(new OpenWindowCandidate(hWnd, processName, className, title, zOrder++));
            return true;
        });

        return candidates;
    }

    // --- Internal Capture Logic ---

    private List<SceneWindow> CaptureCurrentDesktopWindows()
    {
        var windows = new List<SceneWindow>();
        if (!OperatingSystem.IsWindows()) return windows;

        var availableMonitors = GetAvailableMonitors();
        int zOrder = 0;

        NativeMethods.EnumInteractiveWindows((hWnd, _) =>
        {
            if (windows.Count >= MaxWindowsPerScene) return false; // Stop enumeration once capped

            if (hWnd == IntPtr.Zero || !NativeMethods.IsWindow(hWnd)) return true;
            if (!NativeMethods.IsWindowVisible(hWnd)) return true;
            if (NativeMethods.IsWindowCloaked(hWnd)) return true;
            if (_tracker.IsSelfWindow(hWnd)) return true;

            // Filter tool windows (WS_EX_TOOLWINDOW)
            int exStyle = SceneNativeMethods.GetWindowLong(hWnd, NativeMethods.GWL_EXSTYLE);
            if ((exStyle & NativeMethods.WS_EX_TOOLWINDOW) != 0) return true;

            // Filter shell and protected desktop windows
            string className = NativeMethods.GetWindowClass(hWnd);
            if (string.IsNullOrWhiteSpace(className) ||
                string.Equals(className, "Progman", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(className, "Shell_TrayWnd", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(className, "Shell_SecondaryTrayWnd", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(className, "WorkerW", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            // Window placement
            var placement = WINDOWPLACEMENT.Create();
            bool hasPlacement = SceneNativeMethods.GetWindowPlacement(hWnd, ref placement);
            if (!hasPlacement) return true;

            string windowState = SceneWindowState.Normal;
            if (placement.showCmd == NativeMethods.SW_SHOWMAXIMIZED)
            {
                windowState = SceneWindowState.Maximized;
            }
            else if (placement.showCmd == NativeMethods.SW_SHOWMINIMIZED || NativeMethods.IsIconic(hWnd))
            {
                windowState = SceneWindowState.Minimized;
            }

            // Extended frame bounds (visible rect) or normal position from placement
            RECT visibleRect;
            int hr = NativeMethods.DwmGetWindowAttribute(
                hWnd,
                NativeMethods.DWMWA_EXTENDED_FRAME_BOUNDS,
                out RECT dwmRect,
                Marshal.SizeOf<RECT>());

            if (hr == 0 && dwmRect.Width > 0 && dwmRect.Height > 0)
            {
                visibleRect = dwmRect;
            }
            else if (NativeMethods.GetWindowRect(hWnd, out RECT winRect) && winRect.Width > 0 && winRect.Height > 0)
            {
                visibleRect = winRect;
            }
            else if (placement.rcNormalPosition.Width > 0 && placement.rcNormalPosition.Height > 0)
            {
                visibleRect = placement.rcNormalPosition;
            }
            else
            {
                return true; // Ignore zero-size invisible artifacts
            }

            // Query monitor info
            IntPtr hMonitor = NativeMethods.MonitorFromWindow(hWnd, NativeMethods.MONITOR_DEFAULTTONEAREST);
            var monitorInfo = MONITORINFOEX.Create();
            string monitorDeviceName = @"\\.\DISPLAY1";
            RECT workArea = new RECT(0, 0, 1920, 1040);

            if (hMonitor != IntPtr.Zero && SceneNativeMethods.GetMonitorInfo(hMonitor, ref monitorInfo))
            {
                monitorDeviceName = monitorInfo.szDevice;
                workArea = monitorInfo.rcWork;
            }
            else
            {
                var fallback = SceneLayoutMath.ResolveTargetMonitor(null, availableMonitors);
                monitorDeviceName = fallback.DeviceName;
                workArea = fallback.WorkArea;
            }

            var fractionalRect = SceneLayoutMath.PixelsToFractional(visibleRect, workArea);

            string title = NativeMethods.GetWindowTitle(hWnd);
            string processName = GetProcessName(hWnd);

            // Log window titles only at Debug for privacy protection
            _logger.LogDebug("Captured window '{Title}' (process: {Process}, class: {Class}, state: {State}) on {Monitor} at {Rect}",
                title, processName, className, windowState, monitorDeviceName, fractionalRect);

            // Save title hint for matching (safe prefix or generic title)
            string titleHint = title.Length > 120 ? title.Substring(0, 120) : title;

            windows.Add(new SceneWindow
            {
                ProcessName = processName,
                ClassName = className,
                TitleHint = titleHint,
                MonitorDeviceName = monitorDeviceName,
                Rect = fractionalRect,
                State = windowState,
                ZOrder = zOrder++
            });

            return true;
        });

        return windows;
    }

    private static string GetProcessName(IntPtr hWnd)
    {
        try
        {
            NativeMethods.GetWindowThreadProcessId(hWnd, out uint pid);
            if (pid != 0)
            {
                using var proc = Process.GetProcessById((int)pid);
                return proc.ProcessName;
            }
        }
        catch
        {
            // Process may have exited or is elevated
        }
        return "unknown";
    }

    public IReadOnlyList<MonitorWorkAreaInfo> GetAvailableMonitors()
    {
        var list = new List<MonitorWorkAreaInfo>();
        if (!OperatingSystem.IsWindows()) return list;

        NativeMethods.EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMon, IntPtr _, ref RECT _, IntPtr _) =>
        {
            var mi = MONITORINFOEX.Create();
            if (SceneNativeMethods.GetMonitorInfo(hMon, ref mi))
            {
                bool isPrimary = (mi.dwFlags & 1) != 0;
                list.Add(new MonitorWorkAreaInfo(mi.szDevice, mi.rcMonitor, mi.rcWork, isPrimary));
            }
            return true;
        }, IntPtr.Zero);

        return list;
    }

    private void ValidateGestureFingers(int? fingers, Guid? excludeSceneId)
    {
        if (!fingers.HasValue) return;

        if (fingers.Value != 3 && fingers.Value != 4)
        {
            throw new ArgumentException("Gesture fingers assignment must be either 3 or 4.");
        }

        var duplicate = _scenes.FirstOrDefault(s =>
            s.GestureFingers == fingers.Value &&
            (!excludeSceneId.HasValue || s.Id != excludeSceneId.Value));

        if (duplicate != null)
        {
            throw new DuplicateGestureException($"Gesture '{fingers.Value} fingers' is already assigned to scene '{duplicate.Name}'.");
        }
    }

    private static SceneSummaryDto ToSummaryDto(Scene scene)
    {
        var windowSummaries = scene.Windows
            .Select(w => new SceneWindowSummaryDto(w.ProcessName, w.Rect, w.State))
            .ToList();

        return new SceneSummaryDto(
            scene.Id,
            scene.Name,
            scene.GestureFingers,
            scene.CreatedAt,
            scene.Windows.Count,
            windowSummaries
        );
    }

    // --- Thread-Safe Atomic Persistence ---

    private void EnsureLoaded()
    {
        if (_loaded) return;

        lock (_storageLock)
        {
            if (_loaded) return;

            try
            {
                if (File.Exists(_storageFilePath))
                {
                    string json = File.ReadAllText(_storageFilePath);
                    var list = JsonSerializer.Deserialize<List<Scene>>(json, new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });

                    _scenes = list ?? new List<Scene>();
                    _logger.LogInformation("Loaded {Count} scene(s) from {FilePath}.", _scenes.Count, _storageFilePath);
                }
                else
                {
                    _scenes = new List<Scene>();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to read scenes from {FilePath}. Initializing empty list.", _storageFilePath);
                _scenes = new List<Scene>();
            }

            _loaded = true;
        }
    }

    private void SaveScenesToDisk()
    {
        try
        {
            string? dir = Path.GetDirectoryName(_storageFilePath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            string tmpPath = _storageFilePath + ".tmp." + Guid.NewGuid().ToString("N");
            var options = new JsonSerializerOptions
            {
                WriteIndented = true,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            };

            string json = JsonSerializer.Serialize(_scenes, options);
            File.WriteAllText(tmpPath, json);

            File.Move(tmpPath, _storageFilePath, overwrite: true);
            _logger.LogDebug("Atomically saved {Count} scene(s) to {FilePath}.", _scenes.Count, _storageFilePath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to atomically save scenes to {FilePath}.", _storageFilePath);
            throw;
        }
    }
}
