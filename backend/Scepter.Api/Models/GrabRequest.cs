namespace Scepter.Api.Models;

public sealed record GrabRequest(
    double X,
    double Y
);

public sealed record MoveRequest(
    double X,
    double Y,
    double DeltaX = 0,
    double DeltaY = 0
);


