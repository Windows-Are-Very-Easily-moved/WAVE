using System.Runtime.InteropServices;

namespace Scepter.Api.Native;

[StructLayout(LayoutKind.Sequential)]
public struct WINDOWPLACEMENT
{
    public int length;
    public int flags;
    public int showCmd;
    public POINT ptMinPosition;
    public POINT ptMaxPosition;
    public RECT rcNormalPosition;

    public static WINDOWPLACEMENT Create()
    {
        return new WINDOWPLACEMENT
        {
            length = Marshal.SizeOf<WINDOWPLACEMENT>()
        };
    }
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
public struct MONITORINFOEX
{
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string szDevice;

    public static MONITORINFOEX Create()
    {
        return new MONITORINFOEX
        {
            cbSize = Marshal.SizeOf<MONITORINFOEX>(),
            szDevice = string.Empty
        };
    }
}

/// <summary>
/// Additive P/Invoke declarations specifically for Wave Scenes.
/// Existing declarations in NativeMethods.cs are preserved untouched.
/// </summary>
public static class SceneNativeMethods
{
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPlacement(IntPtr hWnd, [In] ref WINDOWPLACEMENT lpwndpl);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX lpmi);

    [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
    private static extern int GetWindowLong32(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

    public static int GetWindowLong(IntPtr hWnd, int nIndex)
    {
        if (IntPtr.Size == 8)
        {
            return (int)GetWindowLongPtr64(hWnd, nIndex).ToInt64();
        }
        return GetWindowLong32(hWnd, nIndex);
    }
}
