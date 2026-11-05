using System.Runtime.InteropServices;

namespace Scepter.Api.Native;

[StructLayout(LayoutKind.Sequential)]
public struct POINT
{
    public int X;
    public int Y;

    public POINT(int x, int y)
    {
        X = x;
        Y = y;
    }
}

[StructLayout(LayoutKind.Sequential)]
public struct RECT : IEquatable<RECT>
{
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;

    public RECT(int left, int top, int right, int bottom)
    {
        Left = left;
        Top = top;
        Right = right;
        Bottom = bottom;
    }

    public int Width => Right - Left;
    public int Height => Bottom - Top;

    public bool Equals(RECT other) =>
        Left == other.Left && Top == other.Top && Right == other.Right && Bottom == other.Bottom;

    public override bool Equals(object? obj) => obj is RECT other && Equals(other);

    public override int GetHashCode() => HashCode.Combine(Left, Top, Right, Bottom);

    public override string ToString() => $"[{Left}, {Top}, {Right}, {Bottom} ({Width}x{Height})]";
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
public struct MONITORINFO
{
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;

    public static MONITORINFO Create()
    {
        return new MONITORINFO
        {
            cbSize = Marshal.SizeOf<MONITORINFO>()
        };
    }
}

/// <summary>
/// Win32 INPUT structure for SendInput (user32.dll).
/// On 64-bit Windows, sizeof(INPUT) must be exactly 40 bytes (4-byte type + 4-byte pad + 32-byte union).
/// On 32-bit Windows, sizeof(INPUT) is 28 bytes (4-byte type + 24-byte union).
/// </summary>
[StructLayout(LayoutKind.Sequential)]
public struct INPUT
{
    public uint type;
    public INPUTUNION U;

    public static int Size => Marshal.SizeOf<INPUT>();
}

[StructLayout(LayoutKind.Explicit)]
public struct INPUTUNION
{
    [FieldOffset(0)]
    public MOUSEINPUT mi;

    [FieldOffset(0)]
    public KEYBDINPUT ki;

    [FieldOffset(0)]
    public HARDWAREINPUT hi;
}

[StructLayout(LayoutKind.Sequential)]
public struct MOUSEINPUT
{
    public int dx;
    public int dy;
    /// <summary>
    /// For MOUSEEVENTF_WHEEL (0x0800), contains the signed wheel movement delta
    /// (positive = forward/up away from user, negative = backward/down toward user; 120 = 1 standard notch).
    /// </summary>
    public int mouseData;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
}

[StructLayout(LayoutKind.Sequential)]
public struct KEYBDINPUT
{
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
}

[StructLayout(LayoutKind.Sequential)]
public struct HARDWAREINPUT
{
    public uint uMsg;
    public ushort wParamL;
    public ushort wParamH;
}


