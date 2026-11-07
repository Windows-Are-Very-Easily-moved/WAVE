using System.Text.Json.Serialization;

namespace Scepter.Api.Models;

public static class SceneWindowState
{
    public const string Normal = "normal";
    public const string Maximized = "maximized";
    public const string Minimized = "minimized";
}

public sealed record WindowFractionalRect(
    [property: JsonPropertyName("x")] double X,
    [property: JsonPropertyName("y")] double Y,
    [property: JsonPropertyName("w")] double W,
    [property: JsonPropertyName("h")] double H
);

public sealed class SceneWindow
{
    public long? Handle { get; set; }
    public string ProcessName { get; set; } = string.Empty;
    public string ClassName { get; set; } = string.Empty;
    public string TitleHint { get; set; } = string.Empty;
    public string? ExecutablePath { get; set; }
    public string MonitorDeviceName { get; set; } = string.Empty;
    public WindowFractionalRect Rect { get; set; } = new(0, 0, 1, 1);
    public string State { get; set; } = SceneWindowState.Normal;
    public int ZOrder { get; set; }
}

public sealed class Scene
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public int? GestureFingers { get; set; } // 3 | 4 | null
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<SceneWindow> Windows { get; set; } = new();
}

public sealed record OpenWindowCandidateDto(
    long Handle,
    string ProcessName,
    string ClassName,
    string Title,
    string? ExecutablePath,
    string MonitorDeviceName,
    WindowFractionalRect Rect,
    string State,
    int ZOrder
);

public sealed record SelectedSceneWindowInput(
    long? Handle,
    string ProcessName,
    string? ClassName,
    string? TitleHint,
    string? ExecutablePath,
    string? MonitorDeviceName,
    WindowFractionalRect Rect,
    string? State
);

public sealed record CaptureSceneRequest(
    string? Name,
    int? GestureFingers,
    IReadOnlyList<SelectedSceneWindowInput>? SelectedWindows = null
);

public sealed record UpdateSceneRequest(
    string? Name,
    int? GestureFingers,
    IReadOnlyList<SelectedSceneWindowInput>? SelectedWindows = null
);

public sealed record SceneWindowSummaryDto(
    string ProcessName,
    WindowFractionalRect Rect,
    string State,
    string? TitleHint = null,
    string? ExecutablePath = null,
    string? ClassName = null,
    long? Handle = null
);

public sealed record SceneSummaryDto(
    Guid Id,
    string Name,
    int? GestureFingers,
    DateTimeOffset CreatedAt,
    int WindowCount,
    IReadOnlyList<SceneWindowSummaryDto> Windows
);

public sealed record SceneApplyResult(
    SceneSummaryDto Scene,
    IReadOnlyList<RestoredWindowInfo> Restored,
    IReadOnlyList<MissingWindowInfo> Missing,
    IReadOnlyList<FailedWindowInfo> Failed,
    long DurationMs
);

public sealed record RestoredWindowInfo(
    string ProcessName,
    string ClassName,
    string? TitleHint,
    WindowFractionalRect Rect
);

public sealed record MissingWindowInfo(
    string ProcessName,
    string ClassName,
    string? TitleHint
);

public sealed record FailedWindowInfo(
    string ProcessName,
    string ClassName,
    string? TitleHint,
    string Reason
);

