using HostingPlatform.Api.Data;
using HostingPlatform.Api.DTOs;
using HostingPlatform.Api.Entities;
using HostingPlatform.Api.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace HostingPlatform.Api.Services;

public class ProjectService : IProjectService
{
    // A newly created project has no deployment yet (see docs/02-features).
    // "Draft" is distinct from the deployment statuses so dashboard counts stay correct.
    private const string InitialStatus = "Draft";

    private readonly AppDbContext _context;
    private readonly IS3Service _s3;
    private readonly ICloudFrontService _cloudFront;
    private readonly ILogger<ProjectService> _logger;

    public ProjectService(
        AppDbContext context,
        IS3Service s3,
        ICloudFrontService cloudFront,
        ILogger<ProjectService> logger)
    {
        _context = context;
        _s3 = s3;
        _cloudFront = cloudFront;
        _logger = logger;
    }

    public async Task<IReadOnlyList<ProjectResponse>> GetProjectsAsync(Guid userId)
    {
        var projects = await _context.Projects
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.UpdatedAt)
            .ToListAsync();

        return projects.Select(ToResponse).ToList();
    }

    public async Task<ProjectResponse> GetProjectAsync(Guid userId, Guid projectId)
    {
        var project = await FindOwnedAsync(userId, projectId);
        return ToResponse(project);
    }

    public async Task<ProjectResponse> CreateProjectAsync(Guid userId, CreateProjectRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new ValidationException("Project name is required");
        }

        var now = DateTime.UtcNow;
        var project = new Project
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = request.Name,
            RepositoryUrl = request.RepositoryUrl ?? string.Empty,
            CurrentStatus = InitialStatus,
            CreatedAt = now,
            UpdatedAt = now
        };

        _context.Projects.Add(project);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Project {ProjectId} created for user {UserId}", project.Id, userId);

        return ToResponse(project);
    }

    public async Task<ProjectResponse> UpdateProjectAsync(Guid userId, Guid projectId, UpdateProjectRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new ValidationException("Project name is required");
        }

        var project = await FindOwnedAsync(userId, projectId);

        project.Name = request.Name;
        project.RepositoryUrl = request.RepositoryUrl ?? string.Empty;
        project.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return ToResponse(project);
    }

    public async Task DeleteProjectAsync(Guid userId, Guid projectId)
    {
        var project = await FindOwnedAsync(userId, projectId);

        // Remove the published site so a deleted project is no longer served
        // (docs/02-features.md "Delete Project"). Best-effort: a storage/CDN error
        // must not block the user's deletion, so it is logged rather than thrown.
        // Deployment history rows are removed by the cascading FK (see migration).
        try
        {
            await _s3.DeleteSiteAsync(userId, projectId);
            await _cloudFront.InvalidateProjectAsync(userId, projectId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Failed to remove published files for project {ProjectId}; deleting the record anyway",
                projectId);
        }

        _context.Projects.Remove(project);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Project {ProjectId} deleted for user {UserId}", projectId, userId);
    }

    // Loads a project the user owns, or throws NotFound. Not-owned projects are
    // treated as not found so the API does not reveal that they exist.
    private async Task<Project> FindOwnedAsync(Guid userId, Guid projectId)
    {
        var project = await _context.Projects
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId);

        if (project is null)
        {
            throw new NotFoundException("Project not found");
        }

        return project;
    }

    private static ProjectResponse ToResponse(Project project) => new(
        project.Id,
        project.Name,
        project.RepositoryUrl,
        project.WebsiteUrl,
        project.CurrentStatus,
        project.CreatedAt,
        project.UpdatedAt);
}
