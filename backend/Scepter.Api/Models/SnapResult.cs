using Scepter.Api.Native;

namespace Scepter.Api.Models;

public sealed record RectDto(int Left, int Top, int Right, int Bottom, int Width, int Height)
{
    public static RectDto FromRect(RECT r) => new(r.Left, r.Top, r.Right, r.Bottom, r.Width, r.Height);
}

public sealed record SnapResult(
    bool Success,
    string WindowTitle,
    RectDto? AppliedRect,
    string Message,
    string? ProcessName = null,
    long? Handle = null
);

public sealed record ActiveWindowInfo(
    long Handle,
    string Title,
    string ProcessName,
    string ClassName,
    RectDto? Bounds,
    bool IsLockedTarget
);

