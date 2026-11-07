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
        // Phase 2 will implement full matching and restoration.
        // For Phase 1 baseline, returns clean summary.
        var scene = GetSceneById(id);
        if (scene == null) return null;

        return new SceneApplyResult(
            Scene: ToSummaryDto(scene),
            Restored: Array.Empty<RestoredWindowInfo>(),
            Missing: Array.Empty<MissingWindowInfo>(),
            Failed: Array.Empty<FailedWindowInfo>(),
            DurationMs: 0
        );
    }

    public bool UndoLastApply()
    {
        // Phase 2 will implement full undo restoration.
        return false;
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
