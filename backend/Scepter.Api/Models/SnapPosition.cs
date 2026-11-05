using System.Text.Json.Serialization;

namespace Scepter.Api.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum SnapPosition
{
    Left,
    Right,
    Top,
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
    NextMonitor
}

