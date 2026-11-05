using Scepter.Api.Models;

namespace Scepter.Api.Services;

public interface IWindowService
{
    ActiveWindowInfo GetActiveTargetWindow();
    IReadOnlyList<ActiveWindowInfo> GetRecentWindows();
    SnapResult GrabWindow(GrabRequest request);
    SnapResult MoveWindow(MoveRequest request);
    SnapResult SnapWindow(SnapRequest request);
    SnapResult ResizeWindow(ResizeRequest request);
    SnapResult CycleWindow(CycleRequest request);
}


