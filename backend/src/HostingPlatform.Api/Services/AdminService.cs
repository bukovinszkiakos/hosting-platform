using HostingPlatform.Api.Data;
using HostingPlatform.Api.DTOs;
using HostingPlatform.Api.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace HostingPlatform.Api.Services;

// Read-only, platform-wide views for administrators (see docs/08-api.md
// "Admin API"). All endpoints are gated to the Admin role at the controller.
public class AdminService : IAdminService
{
    private readonly AppDbContext _context;
    private readonly UserManager<User> _userManager;

    public AdminService(AppDbContext context, UserManager<User> userManager)
    {
        _context = context;
        _userManager = userManager;
    }

    public async Task<IReadOnlyList<AdminUserResponse>> GetUsersAsync()
    {
        var users = await _userManager.Users
            .OrderByDescending(u => u.CreatedAt)
            .ToListAsync();

        // Roles live in the Identity join tables; the admin user count is small,
        // so resolving each user's role individually is acceptable here.
        var result = new List<AdminUserResponse>(users.Count);
        foreach (var user in users)
        {
            var roles = await _userManager.GetRolesAsync(user);
            result.Add(new AdminUserResponse(
                user.Id,
                user.DisplayName,
                user.Email ?? string.Empty,
                RoleNames.Primary(roles),
                user.CreatedAt));
        }

        return result;
    }

    public async Task<IReadOnlyList<AdminProjectResponse>> GetProjectsAsync()
    {
        var projects = await _context.Projects
            .Include(p => p.User)
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync();

        return projects
            .Select(p => new AdminProjectResponse(
                p.Id,
                p.Name,
                p.RepositoryUrl,
                p.CurrentStatus,
                p.User.Email ?? string.Empty,
                p.CreatedAt))
            .ToList();
    }

    public async Task<IReadOnlyList<DeploymentResponse>> GetDeploymentsAsync()
    {
        var deployments = await _context.Deployments
            .OrderByDescending(d => d.StartedAt)
            .ToListAsync();

        return deployments
            .Select(d => new DeploymentResponse(
                d.Id,
                d.Status,
                d.StartedAt,
                d.FinishedAt,
                d.BuildSummary,
                d.ErrorMessage))
            .ToList();
    }
}
