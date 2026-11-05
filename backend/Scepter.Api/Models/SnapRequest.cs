namespace Scepter.Api.Models;

public sealed record SnapRequest(
    SnapPosition Position,
    double Ratio = 0.5
);

public sealed record ResizeRequest(
    double ScaleFactor
);

public sealed record CycleRequest(
    string Direction = "next",
    long? Handle = null
);


