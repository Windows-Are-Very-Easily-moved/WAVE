using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Scepter.Api.Models;
using Scepter.Api.Services;
using Xunit;

namespace Scepter.Api.Tests;

public sealed class SceneServiceStorageTests : IDisposable
{
    private readonly string _testStorageFile;

    public SceneServiceStorageTests()
    {
        _testStorageFile = Path.Combine(Path.GetTempPath(), $"wave_scenes_test_{Guid.NewGuid():N}.json");
    }

    public void Dispose()
    {
        try
        {
            if (File.Exists(_testStorageFile))
            {
                File.Delete(_testStorageFile);
            }
        }
        catch
        {
            // Ignore temp file cleanup errors
        }
    }

    private SceneService CreateTestService()
    {
        var config = new ConfigurationBuilder().Build();
        var tracker = new ForegroundTracker(config, NullLogger<ForegroundTracker>.Instance);
        return new SceneService(tracker, config, NullLogger<SceneService>.Instance, _testStorageFile);
    }

    [Fact]
    public void Storage_EnforcesUniqueGestures_AndRejectsDuplicates()
    {
        var service = CreateTestService();

        // Capture scene with 3 fingers
        service.CaptureScene(new CaptureSceneRequest("Coding Layout", 3));

        // Attempting to assign 3 fingers to a second scene must throw DuplicateGestureException
        var ex = Assert.Throws<DuplicateGestureException>(() =>
        {
            service.CaptureScene(new CaptureSceneRequest("Design Layout", 3));
        });

        Assert.Contains("already assigned", ex.Message);

        // Assigning 4 fingers to second scene succeeds
        var second = service.CaptureScene(new CaptureSceneRequest("Design Layout", 4));
        Assert.Equal(4, second.GestureFingers);

        // Updating second scene back to 3 fingers throws DuplicateGestureException
        Assert.Throws<DuplicateGestureException>(() =>
        {
            service.UpdateScene(second.Id, new UpdateSceneRequest(null, 3));
        });

        // Updating second scene with its own gesture (4) succeeds
        var updated = service.UpdateScene(second.Id, new UpdateSceneRequest("Updated Design", 4));
        Assert.NotNull(updated);
        Assert.Equal("Updated Design", updated.Name);
    }

    [Fact]
    public void Storage_ValidatesGestureFingersValues()
    {
        var service = CreateTestService();

        // 5 fingers is invalid (only 3 or 4 allowed)
        Assert.Throws<ArgumentException>(() =>
        {
            service.CaptureScene(new CaptureSceneRequest("Invalid", 5));
        });

        // 2 fingers is invalid
        Assert.Throws<ArgumentException>(() =>
        {
            service.CaptureScene(new CaptureSceneRequest("Invalid", 2));
        });
    }

    [Fact]
    public void Storage_SupportsDelete_AndFreesGestureAssignment()
    {
        var service = CreateTestService();

        var scene = service.CaptureScene(new CaptureSceneRequest("To Delete", 3));
        Assert.Single(service.GetScenes());

        // Delete the scene
        bool deleted = service.DeleteScene(scene.Id);
        Assert.True(deleted);
        Assert.Empty(service.GetScenes());

        // Now gesture 3 can be reused by another scene
        var newScene = service.CaptureScene(new CaptureSceneRequest("New Layout", 3));
        Assert.Equal(3, newScene.GestureFingers);
    }

    [Fact]
    public void Storage_EnforcesMaxSceneLimitOf20()
    {
        var service = CreateTestService();

        for (int i = 1; i <= SceneService.MaxScenes; i++)
        {
            service.CaptureScene(new CaptureSceneRequest($"Scene {i}", null));
        }

        Assert.Equal(20, service.GetScenes().Count);

        // 21st scene must throw InvalidOperationException
        var ex = Assert.Throws<InvalidOperationException>(() =>
        {
            service.CaptureScene(new CaptureSceneRequest("Scene 21", null));
        });

        Assert.Contains("Maximum scene limit", ex.Message);
    }
}
