using Scepter.Api.Models;

namespace Scepter.Api.Services;

public sealed record OpenWindowCandidate(
    IntPtr Handle,
    string ProcessName,
    string ClassName,
    string Title,
    int ZOrder
);

public sealed record WindowMatch(
    SceneWindow Target,
    OpenWindowCandidate Candidate
);

public sealed record MatchResult(
    IReadOnlyList<WindowMatch> Matched,
    IReadOnlyList<SceneWindow> Missing
);

/// <summary>
/// Pure matching engine for associating saved SceneWindow records with currently open top-level desktop windows.
/// Implements matching priority rules:
/// 1. Process name + Class name matching
/// 2. UWP App matching (ApplicationFrameHost matched primarily by title)
/// 3. Title similarity tiebreaking for same-app windows
/// 4. Z-order preservation for multiple instances of the same app
/// 5. Strict single-match guarantee (no candidate window matched more than once)
/// </summary>
public static class SceneMatcher
{
    public const string UwpFrameHostProcess = "ApplicationFrameHost";
    public const string UwpFrameHostClass = "ApplicationFrameWindow";

    public static MatchResult MatchWindows(
        IReadOnlyList<SceneWindow> savedWindows,
        IReadOnlyList<OpenWindowCandidate> openCandidates)
    {
        if (savedWindows == null || savedWindows.Count == 0)
        {
            return new MatchResult(Array.Empty<WindowMatch>(), Array.Empty<SceneWindow>());
        }

        if (openCandidates == null || openCandidates.Count == 0)
        {
            return new MatchResult(Array.Empty<WindowMatch>(), savedWindows.ToList());
        }

        var matched = new List<WindowMatch>();
        var missing = new List<SceneWindow>();
        var usedHandles = new HashSet<IntPtr>();

        // Sort saved windows by saved Z-order ascending (front-to-back priority)
        var orderedSaved = savedWindows.OrderBy(w => w.ZOrder).ToList();

        foreach (var saved in orderedSaved)
        {
            bool isUwp = string.Equals(saved.ProcessName, UwpFrameHostProcess, StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(saved.ClassName, UwpFrameHostClass, StringComparison.OrdinalIgnoreCase);

            OpenWindowCandidate? bestMatch = null;
            double bestScore = -1.0;

            foreach (var candidate in openCandidates)
            {
                if (usedHandles.Contains(candidate.Handle)) continue;

                double score = CalculateMatchScore(saved, candidate, isUwp);
                if (score > bestScore && score >= 0.5) // Minimum 0.5 threshold to qualify as a valid match
                {
                    bestScore = score;
                    bestMatch = candidate;
                }
            }

            if (bestMatch != null)
            {
                usedHandles.Add(bestMatch.Handle);
                matched.Add(new WindowMatch(saved, bestMatch));
            }
            else
            {
                missing.Add(saved);
            }
        }

        return new MatchResult(matched, missing);
    }

    private static double CalculateMatchScore(SceneWindow saved, OpenWindowCandidate candidate, bool isUwp)
    {
        if (isUwp)
        {
            // For UWP apps, process is often ApplicationFrameHost and class is ApplicationFrameWindow for all UWP apps.
            // Match primarily by window title.
            bool candidateIsUwp = string.Equals(candidate.ProcessName, UwpFrameHostProcess, StringComparison.OrdinalIgnoreCase) ||
                                  string.Equals(candidate.ClassName, UwpFrameHostClass, StringComparison.OrdinalIgnoreCase);

            if (!candidateIsUwp) return 0.0;

            double titleSim = ComputeTitleSimilarity(saved.TitleHint, candidate.Title);
            return titleSim >= 0.4 ? 0.7 + (titleSim * 0.3) : 0.0;
        }

        // Standard Win32 apps: process name is the primary identifier
        bool processMatch = string.Equals(saved.ProcessName, candidate.ProcessName, StringComparison.OrdinalIgnoreCase);
        if (!processMatch) return 0.0;

        double score = 0.6; // Base score for exact process match

        bool classMatch = string.Equals(saved.ClassName, candidate.ClassName, StringComparison.OrdinalIgnoreCase);
        if (classMatch)
        {
            score += 0.2; // Process + Class match
        }

        double sim = ComputeTitleSimilarity(saved.TitleHint, candidate.Title);
        score += sim * 0.2; // Title similarity tiebreaker

        return score;
    }

    /// <summary>
    /// Computes a normalized title similarity score [0..1].
    /// Compares trimmed lowercase prefixes, substring containment, and token overlap.
    /// </summary>
    public static double ComputeTitleSimilarity(string? savedTitle, string? candidateTitle)
    {
        string s1 = (savedTitle ?? string.Empty).Trim();
        string s2 = (candidateTitle ?? string.Empty).Trim();

        if (string.IsNullOrEmpty(s1) && string.IsNullOrEmpty(s2)) return 1.0;
        if (string.IsNullOrEmpty(s1) || string.IsNullOrEmpty(s2)) return 0.0;

        if (string.Equals(s1, s2, StringComparison.OrdinalIgnoreCase)) return 1.0;

        // Substring containment (e.g. "document1.txt - Notepad" vs "Notepad")
        if (s1.Contains(s2, StringComparison.OrdinalIgnoreCase) || s2.Contains(s1, StringComparison.OrdinalIgnoreCase))
        {
            return 0.85;
        }

        // Token overlap
        var tokens1 = s1.Split(new[] { ' ', '-', '_', '.', '—', '|' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                        .Select(t => t.ToLowerInvariant())
                        .ToHashSet();

        var tokens2 = s2.Split(new[] { ' ', '-', '_', '.', '—', '|' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                        .Select(t => t.ToLowerInvariant())
                        .ToHashSet();

        if (tokens1.Count == 0 || tokens2.Count == 0) return 0.0;

        int common = tokens1.Count(t => tokens2.Contains(t));
        int total = Math.Max(tokens1.Count, tokens2.Count);

        return (double)common / total;
    }
}
