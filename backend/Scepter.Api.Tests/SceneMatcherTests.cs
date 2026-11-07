using Scepter.Api.Models;
using Scepter.Api.Services;
using Xunit;

namespace Scepter.Api.Tests;

public sealed class SceneMatcherTests
{
    [Fact]
    public void MatchWindows_StandardApps_MatchesProcessAndClass()
    {
        var savedWindows = new List<SceneWindow>
        {
            new() { ProcessName = "notepad", ClassName = "Notepad", TitleHint = "Untitled - Notepad", ZOrder = 0 },
            new() { ProcessName = "chrome", ClassName = "Chrome_WidgetWin_1", TitleHint = "GitHub - Google Chrome", ZOrder = 1 }
        };

        var openCandidates = new List<OpenWindowCandidate>
        {
            new(new IntPtr(100), "spotify", "Chrome_WidgetWin_1", "Spotify Free", 0),
            new(new IntPtr(101), "chrome", "Chrome_WidgetWin_1", "GitHub - Google Chrome", 1),
            new(new IntPtr(102), "notepad", "Notepad", "Untitled - Notepad", 2)
        };

        var result = SceneMatcher.MatchWindows(savedWindows, openCandidates);

        Assert.Equal(2, result.Matched.Count);
        Assert.Empty(result.Missing);

        var notepadMatch = result.Matched.First(m => m.Target.ProcessName == "notepad");
        Assert.Equal(new IntPtr(102), notepadMatch.Candidate.Handle);

        var chromeMatch = result.Matched.First(m => m.Target.ProcessName == "chrome");
        Assert.Equal(new IntPtr(101), chromeMatch.Candidate.Handle);
    }

    [Fact]
    public void MatchWindows_DisambiguatesSameApp_ByTitleSimilarity()
    {
        var savedWindows = new List<SceneWindow>
        {
            new() { ProcessName = "notepad", ClassName = "Notepad", TitleHint = "ProjectNotes.md", ZOrder = 0 },
            new() { ProcessName = "notepad", ClassName = "Notepad", TitleHint = "ShoppingList.txt", ZOrder = 1 }
        };

        var openCandidates = new List<OpenWindowCandidate>
        {
            // Reverse order in open candidates
            new(new IntPtr(201), "notepad", "Notepad", "ShoppingList.txt - Notepad", 0),
            new(new IntPtr(202), "notepad", "Notepad", "ProjectNotes.md - Notepad", 1)
        };

        var result = SceneMatcher.MatchWindows(savedWindows, openCandidates);

        Assert.Equal(2, result.Matched.Count);
        Assert.Empty(result.Missing);

        var notesMatch = result.Matched.First(m => m.Target.TitleHint == "ProjectNotes.md");
        Assert.Equal(new IntPtr(202), notesMatch.Candidate.Handle);

        var shoppingMatch = result.Matched.First(m => m.Target.TitleHint == "ShoppingList.txt");
        Assert.Equal(new IntPtr(201), shoppingMatch.Candidate.Handle);
    }

    [Fact]
    public void MatchWindows_DisambiguatesSameApp_WithoutTitles_BySavedZOrder()
    {
        var savedWindows = new List<SceneWindow>
        {
            new() { ProcessName = "cmd", ClassName = "ConsoleWindowClass", TitleHint = "", ZOrder = 0 },
            new() { ProcessName = "cmd", ClassName = "ConsoleWindowClass", TitleHint = "", ZOrder = 1 }
        };

        var openCandidates = new List<OpenWindowCandidate>
        {
            new(new IntPtr(301), "cmd", "ConsoleWindowClass", "Command Prompt", 0),
            new(new IntPtr(302), "cmd", "ConsoleWindowClass", "Command Prompt", 1)
        };

        var result = SceneMatcher.MatchWindows(savedWindows, openCandidates);

        Assert.Equal(2, result.Matched.Count);
        Assert.Empty(result.Missing);

        // Neither candidate should be matched more than once
        var matchedHandles = result.Matched.Select(m => m.Candidate.Handle).ToHashSet();
        Assert.Equal(2, matchedHandles.Count);
    }

    [Fact]
    public void MatchWindows_UwpApps_MatchesByTitle()
    {
        var savedWindows = new List<SceneWindow>
        {
            new()
            {
                ProcessName = SceneMatcher.UwpFrameHostProcess,
                ClassName = SceneMatcher.UwpFrameHostClass,
                TitleHint = "Calculator",
                ZOrder = 0
            }
        };

        var openCandidates = new List<OpenWindowCandidate>
        {
            new(new IntPtr(401), "ApplicationFrameHost", "ApplicationFrameWindow", "Settings", 0),
            new(new IntPtr(402), "ApplicationFrameHost", "ApplicationFrameWindow", "Calculator", 1),
            new(new IntPtr(403), "ApplicationFrameHost", "ApplicationFrameWindow", "Weather", 2)
        };

        var result = SceneMatcher.MatchWindows(savedWindows, openCandidates);

        Assert.Single(result.Matched);
        Assert.Empty(result.Missing);
        Assert.Equal(new IntPtr(402), result.Matched[0].Candidate.Handle);
    }

    [Fact]
    public void MatchWindows_ReportsMissingAppsCleanly()
    {
        var savedWindows = new List<SceneWindow>
        {
            new() { ProcessName = "code", ClassName = "Chrome_WidgetWin_1", TitleHint = "Visual Studio Code", ZOrder = 0 },
            new() { ProcessName = "notepad", ClassName = "Notepad", TitleHint = "Notes", ZOrder = 1 }
        };

        var openCandidates = new List<OpenWindowCandidate>
        {
            new(new IntPtr(501), "notepad", "Notepad", "Notes", 0)
        };

        var result = SceneMatcher.MatchWindows(savedWindows, openCandidates);

        Assert.Single(result.Matched);
        Assert.Equal("notepad", result.Matched[0].Target.ProcessName);

        Assert.Single(result.Missing);
        Assert.Equal("code", result.Missing[0].ProcessName);
    }

    [Fact]
    public void MatchWindows_HandlesEmptyInputs_WithoutThrowing()
    {
        var emptySavedResult = SceneMatcher.MatchWindows(Array.Empty<SceneWindow>(), new List<OpenWindowCandidate>
        {
            new(new IntPtr(1), "notepad", "Notepad", "Notepad", 0)
        });
        Assert.Empty(emptySavedResult.Matched);
        Assert.Empty(emptySavedResult.Missing);

        var savedWindows = new List<SceneWindow> { new() { ProcessName = "notepad" } };
        var emptyCandidatesResult = SceneMatcher.MatchWindows(savedWindows, Array.Empty<OpenWindowCandidate>());
        Assert.Empty(emptyCandidatesResult.Matched);
        Assert.Single(emptyCandidatesResult.Missing);
    }
}

