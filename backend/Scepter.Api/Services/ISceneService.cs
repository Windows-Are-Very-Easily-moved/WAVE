using Scepter.Api.Models;

namespace Scepter.Api.Services;

public interface ISceneService
{
    IReadOnlyList<SceneSummaryDto> GetScenes();
    Scene? GetSceneById(Guid id);
    SceneSummaryDto CaptureScene(CaptureSceneRequest request);
    SceneSummaryDto? UpdateScene(Guid id, UpdateSceneRequest request);
    bool DeleteScene(Guid id);
    SceneApplyResult? ApplyScene(Guid id);
    bool UndoLastApply();
    bool HasUndo { get; }
}

