using Microsoft.AspNetCore.Mvc;
using Scepter.Api.Models;
using Scepter.Api.Services;

namespace Scepter.Api.Controllers;

[ApiController]
[Route("api/window")]
public sealed class WindowController : ControllerBase
{
    private readonly IWindowService _windowService;

    public WindowController(IWindowService windowService)
    {
        _windowService = windowService;
    }

    [HttpGet("/health")]
    [HttpGet("health")]
    public IActionResult GetHealth()
    {
        return Ok(new
        {
            status = "ok",
            platform = OperatingSystem.IsWindows() ? "windows" : "unsupported",
            timestamp = DateTimeOffset.UtcNow
        });
    }

    [HttpGet("active")]
    public ActionResult<ActiveWindowInfo> GetActiveWindow()
    {
        if (!OperatingSystem.IsWindows())
        {
            return StatusCode(StatusCodes.Status501NotImplemented, new
            {
                error = "PlatformNotSupported",
                message = "Win32 window actions are only supported on Windows 10/11."
            });
        }

        return Ok(_windowService.GetActiveTargetWindow());
    }

    [HttpGet("list")]
    public ActionResult<IReadOnlyList<ActiveWindowInfo>> GetRecentWindows()
    {
        if (!OperatingSystem.IsWindows())
        {
            return StatusCode(StatusCodes.Status501NotImplemented, new
            {
                error = "PlatformNotSupported",
                message = "Win32 window actions are only supported on Windows 10/11."
            });
        }

        return Ok(_windowService.GetRecentWindows());
    }

    [HttpPost("cycle")]
    public ActionResult<SnapResult> CycleWindow([FromBody] CycleRequest? request)
    {
        if (!OperatingSystem.IsWindows())
        {
            return StatusCode(StatusCodes.Status501NotImplemented, new SnapResult(
                Success: false,
                WindowTitle: string.Empty,
                AppliedRect: null,
                Message: "Win32 window actions are only supported on Windows 10/11."
            ));
        }

        var result = _windowService.CycleWindow(request ?? new CycleRequest());
        return Ok(result);
    }

    [HttpPost("grab")]
    public ActionResult<SnapResult> GrabWindow([FromBody] GrabRequest request)
    {
        if (!OperatingSystem.IsWindows())
        {
            return StatusCode(StatusCodes.Status501NotImplemented, new SnapResult(
                Success: false,
                WindowTitle: string.Empty,
                AppliedRect: null,
                Message: "Win32 window actions are only supported on Windows 10/11."
            ));
        }

        var result = _windowService.GrabWindow(request);
        return Ok(result);
    }

    [HttpPost("move")]
    public ActionResult<SnapResult> MoveWindow([FromBody] MoveRequest request)
    {
        if (!OperatingSystem.IsWindows())
        {
            return StatusCode(StatusCodes.Status501NotImplemented, new SnapResult(
                Success: false,
                WindowTitle: string.Empty,
                AppliedRect: null,
                Message: "Win32 window actions are only supported on Windows 10/11."
            ));
        }

        var result = _windowService.MoveWindow(request);
        return Ok(result);
    }

    [HttpPost("snap")]
    public ActionResult<SnapResult> SnapWindow([FromBody] SnapRequest request)
    {
        if (!OperatingSystem.IsWindows())
        {
            return StatusCode(StatusCodes.Status501NotImplemented, new SnapResult(
                Success: false,
                WindowTitle: string.Empty,
                AppliedRect: null,
                Message: "Win32 window actions are only supported on Windows 10/11."
            ));
        }

        var result = _windowService.SnapWindow(request);
        return Ok(result);
    }

    [HttpPost("resize")]
    public ActionResult<SnapResult> ResizeWindow([FromBody] ResizeRequest request)
    {
        if (!OperatingSystem.IsWindows())
        {
            return StatusCode(StatusCodes.Status501NotImplemented, new SnapResult(
                Success: false,
                WindowTitle: string.Empty,
                AppliedRect: null,
                Message: "Win32 window actions are only supported on Windows 10/11."
            ));
        }

        var result = _windowService.ResizeWindow(request);
        return Ok(result);
    }
}

