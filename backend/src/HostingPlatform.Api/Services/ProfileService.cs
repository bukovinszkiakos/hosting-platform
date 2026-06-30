using System.Security.Claims;
using HostingPlatform.Api.Data;
using HostingPlatform.Api.DTOs;
using HostingPlatform.Api.Entities;
using HostingPlatform.Api.Exceptions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace HostingPlatform.Api.Services;

public class ProfileService : IProfileService
{
    private readonly UserManager<User> _userManager;
    private readonly AppDbContext _context;

    public ProfileService(UserManager<User> userManager, AppDbContext context)
    {
        _userManager = userManager;
        _context = context;
    }

    public async Task<ProfileResponse> GetProfileAsync(ClaimsPrincipal principal)
    {
        var user = await _userManager.GetUserAsync(principal);
        if (user is null)
        {
            throw new UnauthorizedException();
        }

        var roles = await _userManager.GetRolesAsync(user);

        var projectsCount = await _context.Projects
            .CountAsync(p => p.UserId == user.Id);
        var deploymentsCount = await _context.Deployments
            .CountAsync(d => d.Project.UserId == user.Id);

        return new ProfileResponse(
            user.DisplayName,
            user.Email ?? string.Empty,
            RoleNames.Primary(roles),
            user.CreatedAt,
            projectsCount,
            deploymentsCount);
    }

    public async Task UpdateProfileAsync(ClaimsPrincipal principal, UpdateProfileRequest request)
    {
        var user = await _userManager.GetUserAsync(principal);
        if (user is null)
        {
            throw new UnauthorizedException();
        }

        user.DisplayName = request.DisplayName;

        // UserName mirrors Email (set at registration) and login authenticates by
        // UserName, so the two must change together to keep the account reachable.
        if (!string.Equals(user.Email, request.Email, StringComparison.OrdinalIgnoreCase))
        {
            var emailResult = await _userManager.SetEmailAsync(user, request.Email);
            if (!emailResult.Succeeded)
            {
                throw new ValidationException(emailResult.Errors.Select(e => e.Description));
            }

            var userNameResult = await _userManager.SetUserNameAsync(user, request.Email);
            if (!userNameResult.Succeeded)
            {
                throw new ValidationException(userNameResult.Errors.Select(e => e.Description));
            }
        }

        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            throw new ValidationException(result.Errors.Select(e => e.Description));
        }
    }
}
