using HostingPlatform.Api.Data;
using HostingPlatform.Api.DTOs;
using Microsoft.EntityFrameworkCore;

namespace HostingPlatform.Api.Services;

public class DashboardService : IDashboardService
{
    private readonly AppDbContext _context;

    public DashboardService(AppDbContext context)
    {
        _context = context;
    }

    // Aggregates the authenticated user's projects and deployments for the
    // dashboard statistics (see docs/08-api.md "Get Dashboard"). Online/failed
    // counts use the project's current status (which mirrors its latest deployment).
    public async Task<DashboardResponse> GetDashboardAsync(Guid userId)
    {
        var projects = _context.Projects.Where(p => p.UserId == userId);

        var projectsCount = await projects.CountAsync();
        var onlineProjects = await projects.CountAsync(p => p.CurrentStatus == DeploymentStatus.Online);
        var failedProjects = await projects.CountAsync(p => p.CurrentStatus == DeploymentStatus.Failed);
        var deploymentsCount = await _context.Deployments.CountAsync(d => d.Project.UserId == userId);

        return new DashboardResponse(projectsCount, deploymentsCount, onlineProjects, failedProjects);
    }
}
