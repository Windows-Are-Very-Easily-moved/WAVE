using Microsoft.AspNetCore.Mvc;
using Scepter.Api.Models;
using Scepter.Api.Services;

namespace Scepter.Api.Controllers;

[ApiController]
[Route("api/input")]
public sealed class InputController : ControllerBase
{
    private readonly IInputService _inputService;

    public InputController(IInputService inputService)
    {
        _inputService = inputService;
    }

    [HttpPost("scroll")]
    public ActionResult<ScrollResponse> Scroll([FromBody] ScrollRequest? request)
    {
        if (!OperatingSystem.IsWindows())
        {
            return StatusCode(StatusCodes.Status501NotImplemented, new
            {
                success = false,
                error = "PlatformNotSupported",
                message = "Win32 scroll injection is only supported on Windows 10/11."
            });
        }

        string? validationError = null;
        if (request is null ||
            !ScrollCalculator.TryValidateScrollRequest(
                request.Delta,
                request.Begin,
                request.X,
                request.Y,
                out validationError))
        {
            return BadRequest(new
            {
                success = false,
                error = "InvalidScrollRequest",
                message = validationError ?? "Invalid scroll request body."
            });
        }

        var response = _inputService.Scroll(request);
        return Ok(response);
    }
}
