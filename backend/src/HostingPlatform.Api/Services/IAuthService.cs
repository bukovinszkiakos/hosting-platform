using System.Security.Claims;
using HostingPlatform.Api.DTOs;

namespace HostingPlatform.Api.Services;

public interface IAuthService
{
    Task RegisterAsync(RegisterRequest request);
    Task LoginAsync(LoginRequest request);
    Task LogoutAsync();
    Task<CurrentUserResponse> GetCurrentUserAsync(ClaimsPrincipal principal);
}
