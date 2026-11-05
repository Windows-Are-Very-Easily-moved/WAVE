using Scepter.Api.Native;

namespace Scepter.Api.Services;

/// <summary>
/// Background service that samples the foreground window and keeps an ordered history of the last N
/// valid, non-Scepter windows. This ensures Scepter always knows the last active real window even
/// when the user interacts with or focuses the Scepter HUD browser window.
/// </summary>
public sealed class ForegroundTracker : BackgroundService
{
    private readonly ILogger<ForegroundTracker> _logger;
    private readonly string _selfTitleMatch;
    private readonly int _capacity;
    private readonly object _lock = new();
    private readonly LinkedList<IntPtr> _recentWindows = new();

    private static readonly HashSet<string> ProtectedClasses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Progman",
        "WorkerW",
        "Shell_TrayWnd",
        "Shell_SecondaryTrayWnd",
        "Windows.UI.Core.CoreWindow",
        "XamlExplorerHostIslandWindow"
    };

    public ForegroundTracker(IConfiguration configuration, ILogger<ForegroundTracker> logger)
    {
        _logger = logger;
        _selfTitleMatch = configuration["Scepter:SelfWindowTitleMatch"] ?? "Scepter HUD";
        _capacity = configuration.GetValue("Scepter:HistoryCapacity", 10);
    }

    public string SelfTitleMatch => _selfTitleMatch;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!OperatingSystem.IsWindows())
        {
            _logger.LogWarning("ForegroundTracker is disabled because the host OS is not Windows.");
            return;
        }

        // Seed history with existing visible top-level windows so we have a fallback immediately on startup
        SeedVisibleWindows();

        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(150));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                IntPtr fg = NativeMethods.GetForegroundWindow();
                if (fg != IntPtr.Zero)
                {
                    IntPtr root = NativeMethods.GetAncestor(fg, NativeMethods.GA_ROOT);
                    if (root != IntPtr.Zero && IsEligibleTargetWindow(root))
                    {
                        RecordWindow(root);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Error polling foreground window.");
            }
        }
    }

    public void RecordWindow(IntPtr hWnd)
    {
        if (hWnd == IntPtr.Zero || !IsEligibleTargetWindow(hWnd)) return;

        lock (_lock)
        {
            if (_recentWindows.First?.Value == hWnd)
                return;

            _recentWindows.Remove(hWnd);
            _recentWindows.AddFirst(hWnd);

            while (_recentWindows.Count > _capacity)
            {
                _recentWindows.RemoveLast();
            }
        }
    }

    /// <summary>
    /// Returns the most recently active non-Scepter window that is still valid and eligible.
    /// </summary>
    public IntPtr GetLastEligibleWindow()
    {
        if (!OperatingSystem.IsWindows()) return IntPtr.Zero;

        lock (_lock)
        {
            var node = _recentWindows.First;
            while (node != null)
            {
                var next = node.Next;
                if (IsEligibleTargetWindow(node.Value))
                {
                    return node.Value;
                }
                _recentWindows.Remove(node);
                node = next;
            }
        }

        // Fallback: re-scan desktop top-level windows in Z-order
        SeedVisibleWindows();

        lock (_lock)
        {
            return _recentWindows.First?.Value ?? IntPtr.Zero;
        }
    }

    public bool IsSelfWindow(IntPtr hWnd)
    {
        if (hWnd == IntPtr.Zero) return false;
        string title = NativeMethods.GetWindowTitle(hWnd);
        if (string.IsNullOrWhiteSpace(title)) return false;

        return title.Contains(_selfTitleMatch, StringComparison.OrdinalIgnoreCase) ||
               title.Contains("Picture in picture", StringComparison.OrdinalIgnoreCase) ||
               title.Contains("Picture-in-Picture", StringComparison.OrdinalIgnoreCase);
    }

    public bool IsProtectedOrInvalidWindow(IntPtr hWnd)
    {
        if (hWnd == IntPtr.Zero || !NativeMethods.IsWindow(hWnd))
            return true;

        if (hWnd == NativeMethods.GetShellWindow() || hWnd == NativeMethods.GetDesktopWindow())
            return true;

        if (!NativeMethods.IsWindowVisible(hWnd) || NativeMethods.IsWindowCloaked(hWnd))
            return true;

        string className = NativeMethods.GetWindowClass(hWnd);
        if (string.IsNullOrWhiteSpace(className) || ProtectedClasses.Contains(className))
            return true;

        string title = NativeMethods.GetWindowTitle(hWnd);
        if (string.IsNullOrWhiteSpace(title))
            return true;

        if (!NativeMethods.IsIconic(hWnd))
        {
            if (!NativeMethods.GetWindowRect(hWnd, out RECT rect) || rect.Width <= 0 || rect.Height <= 0)
                return true;
        }

        return false;
    }

    public bool IsEligibleTargetWindow(IntPtr hWnd)
    {
        return !IsProtectedOrInvalidWindow(hWnd) && !IsSelfWindow(hWnd);
    }

    /// <summary>
    /// Returns the ordered list of recent eligible windows (most recent first),
    /// enriched with any additional visible desktop windows not yet in the history.
    /// </summary>
    public IReadOnlyList<IntPtr> GetEligibleWindowStack()
    {
        if (!OperatingSystem.IsWindows()) return Array.Empty<IntPtr>();

        var result = new List<IntPtr>();
        var seen = new HashSet<IntPtr>();

        lock (_lock)
        {
            var node = _recentWindows.First;
            while (node != null)
            {
                var next = node.Next;
                if (IsEligibleTargetWindow(node.Value))
                {
                    if (seen.Add(node.Value))
                    {
                        result.Add(node.Value);
                    }
                }
                else
                {
                    _recentWindows.Remove(node);
                }
                node = next;
            }
        }

        // Also discover any other visible desktop windows so cycling covers all open apps
        NativeMethods.EnumInteractiveWindows((hWnd, _) =>
        {
            if (result.Count < _capacity && IsEligibleTargetWindow(hWnd) && seen.Add(hWnd))
            {
                result.Add(hWnd);
            }
            return true;
        });

        return result;
    }

    /// <summary>
    /// Rotates the tracked window list by moving the first window to the back (Next)
    /// or bringing the last window to the front (Previous), and returns the newly selected window handle.
    /// </summary>
    public IntPtr CycleTargetWindow(IntPtr currentTarget, bool forward = true)
    {
        var stack = GetEligibleWindowStack();
        if (stack.Count == 0) return IntPtr.Zero;
        if (stack.Count == 1) return stack[0];

        int currentIndex = -1;
        for (int i = 0; i < stack.Count; i++)
        {
            if (stack[i] == currentTarget)
            {
                currentIndex = i;
                break;
            }
        }

        int nextIndex;
        if (currentIndex < 0)
        {
            nextIndex = 0;
        }
        else if (forward)
        {
            nextIndex = (currentIndex + 1) % stack.Count;
        }
        else
        {
            nextIndex = (currentIndex - 1 + stack.Count) % stack.Count;
        }

        IntPtr chosen = stack[nextIndex];

        lock (_lock)
        {
            _recentWindows.Clear();
            // Rebuild ordered list starting from chosen so sequential cycles walk cleanly through the stack
            for (int i = 0; i < stack.Count; i++)
            {
                int idx = (nextIndex + i) % stack.Count;
                _recentWindows.AddLast(stack[idx]);
            }
        }

        return chosen;
    }

    private void SeedVisibleWindows()
    {
        if (!OperatingSystem.IsWindows()) return;

        var discovered = new List<IntPtr>();
        NativeMethods.EnumInteractiveWindows((hWnd, _) =>
        {
            if (IsEligibleTargetWindow(hWnd))
            {
                discovered.Add(hWnd);
            }
            return true;
        });

        lock (_lock)
        {
            // Add in reverse so top-most Z-order ends up first
            for (int i = Math.Min(discovered.Count, _capacity) - 1; i >= 0; i--)
            {
                var hWnd = discovered[i];
                if (!_recentWindows.Contains(hWnd))
                {
                    _recentWindows.AddFirst(hWnd);
                }
            }
        }
    }
}

