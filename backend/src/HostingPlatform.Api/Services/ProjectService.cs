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

    public ProjectService(AppDbContext context)
    {
        _context = context;
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

        _context.Projects.Remove(project);
        await _context.SaveChangesAsync();
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
