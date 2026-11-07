using Microsoft.AspNetCore.Mvc;
using Scepter.Api.Models;
using Scepter.Api.Services;

namespace Scepter.Api.Controllers;

[ApiController]
[Route("api/scenes")]
public sealed class ScenesController : ControllerBase
{
    private readonly ISceneService _sceneService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ScenesController> _logger;

    public ScenesController(
        ISceneService sceneService,
        IConfiguration configuration,
        ILogger<ScenesController> logger)
    {
        _sceneService = sceneService;
        _configuration = configuration;
        _logger = logger;
    }

    private bool IsScenesFeatureEnabled()
    {
        // Default true per specification
        string? val = _configuration["Wave:Scenes:Enabled"];
        if (bool.TryParse(val, out bool enabled))
        {
            return enabled;
        }
        return true;
    }

    private IActionResult? CheckPreconditions()
    {
        if (!IsScenesFeatureEnabled())
        {
            return NotFound(new
            {
                success = false,
                error = "FeatureDisabled",
                message = "Wave Scenes feature is disabled by configuration (Wave:Scenes:Enabled = false)."
            });
        }

        if (!OperatingSystem.IsWindows())
        {
            return StatusCode(StatusCodes.Status501NotImplemented, new
            {
                success = false,
                error = "PlatformNotSupported",
                message = "Win32 window scene operations are only supported on Windows 10/11."
            });
        }

        return null;
    }

    [HttpGet]
    public IActionResult GetScenes()
    {
        var check = CheckPreconditions();
        if (check != null) return check;

        return Ok(_sceneService.GetScenes());
    }

    [HttpGet("open-windows")]
    public IActionResult GetOpenWindows()
    {
        var check = CheckPreconditions();
        if (check != null) return check;

        return Ok(_sceneService.GetOpenWindows());
    }

    [HttpGet("{id:guid}")]
    public IActionResult GetScene(Guid id)
    {
        var check = CheckPreconditions();
        if (check != null) return check;

        var scene = _sceneService.GetSceneById(id);
        if (scene == null)
        {
            return NotFound(new
            {
                success = false,
                error = "SceneNotFound",
                message = $"Scene with ID '{id}' was not found."
            });
        }

        return Ok(scene);
    }

    [HttpPost]
    public IActionResult CaptureScene([FromBody] CaptureSceneRequest? request)
    {
        var check = CheckPreconditions();
        if (check != null) return check;

        try
        {
            var summary = _sceneService.CaptureScene(request ?? new CaptureSceneRequest(null, null));
            return CreatedAtAction(nameof(GetScene), new { id = summary.Id }, summary);
        }
        catch (DuplicateGestureException ex)
        {
            return Conflict(new
            {
                success = false,
                error = "DuplicateGesture",
                message = ex.Message
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new
            {
                success = false,
                error = "SceneLimitReached",
                message = ex.Message
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new
            {
                success = false,
                error = "InvalidArgument",
                message = ex.Message
            });
        }
    }

    [HttpPut("{id:guid}")]
    public IActionResult UpdateScene(Guid id, [FromBody] UpdateSceneRequest? request)
    {
        var check = CheckPreconditions();
        if (check != null) return check;

        if (request == null)
        {
            return BadRequest(new
            {
                success = false,
                error = "InvalidRequest",
                message = "Update request body is required."
            });
        }

        try
        {
            var updated = _sceneService.UpdateScene(id, request);
            if (updated == null)
            {
                return NotFound(new
                {
                    success = false,
                    error = "SceneNotFound",
                    message = $"Scene with ID '{id}' was not found."
                });
            }

            return Ok(updated);
        }
        catch (DuplicateGestureException ex)
        {
            return Conflict(new
            {
                success = false,
                error = "DuplicateGesture",
                message = ex.Message
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new
            {
                success = false,
                error = "InvalidArgument",
                message = ex.Message
            });
        }
    }

    [HttpDelete("{id:guid}")]
    public IActionResult DeleteScene(Guid id)
    {
        var check = CheckPreconditions();
        if (check != null) return check;

        bool deleted = _sceneService.DeleteScene(id);
        if (!deleted)
        {
            return NotFound(new
            {
                success = false,
                error = "SceneNotFound",
                message = $"Scene with ID '{id}' was not found."
            });
        }

        return Ok(new
        {
            success = true,
            id = id,
            message = "Scene deleted successfully."
        });
    }

    [HttpPost("{id:guid}/apply")]
    public IActionResult ApplyScene(Guid id)
    {
        var check = CheckPreconditions();
        if (check != null) return check;

        var result = _sceneService.ApplyScene(id);
        if (result == null)
        {
            return NotFound(new
            {
                success = false,
                error = "SceneNotFound",
                message = $"Scene with ID '{id}' was not found."
            });
        }

        return Ok(result);
    }

    [HttpPost("undo")]
    public IActionResult Undo()
    {
        var check = CheckPreconditions();
        if (check != null) return check;

        bool undone = _sceneService.UndoLastApply();
        if (!undone)
        {
            return BadRequest(new
            {
                success = false,
                error = "NoUndoAvailable",
                message = "No prior scene restoration is available to undo."
            });
        }

        return Ok(new
        {
            success = true,
            message = "Previous window layout restored successfully."
        });
    }
}
