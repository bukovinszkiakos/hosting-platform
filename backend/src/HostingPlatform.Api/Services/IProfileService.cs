using System.Security.Claims;
using HostingPlatform.Api.DTOs;

namespace HostingPlatform.Api.Services;

public interface IProfileService
{
    Task<ProfileResponse> GetProfileAsync(ClaimsPrincipal principal);
    Task UpdateProfileAsync(ClaimsPrincipal principal, UpdateProfileRequest request);
}
