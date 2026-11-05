namespace Scepter.Api.Models;

/// <summary>
/// Request payload for POST /api/input/scroll.
/// </summary>
/// <param name="Delta">Signed mouse wheel delta (positive = scroll up, negative = scroll down). Clamped to +-1200 per request.</param>
/// <param name="Begin">True on the initial frame when the user enters the V-sign SCROLLING state.</param>
/// <param name="X">Normalized [0..1] horizontal hand position (mirrored) used when Begin is true to jump the cursor.</param>
/// <param name="Y">Normalized [0..1] vertical hand position used when Begin is true to jump the cursor.</param>
public sealed record ScrollRequest(
    int? Delta = null,
    bool Begin = false,
    double? X = null,
    double? Y = null
);

public sealed record ScrollResponse(
    bool Success
);

