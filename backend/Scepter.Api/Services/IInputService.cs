using Scepter.Api.Models;

namespace Scepter.Api.Services;

public interface IInputService
{
    ScrollResponse Scroll(ScrollRequest request);
}
