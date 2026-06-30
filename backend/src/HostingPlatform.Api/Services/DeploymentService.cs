using HostingPlatform.Api.Data;
using HostingPlatform.Api.DTOs;
using HostingPlatform.Api.Entities;
using HostingPlatform.Api.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace HostingPlatform.Api.Services;

public class DeploymentService : IDeploymentService
{
    private readonly AppDbContext _context;
    private readonly IKubernetesJobService _kubernetesJobService;
    private readonly IDeploymentQueue _queue;
    private readonly ILogger<DeploymentService> _logger;

    public DeploymentService(
        AppDbContext context,
        IKubernetesJobService kubernetesJobService,
        IDeploymentQueue queue,
        ILogger<DeploymentService> logger)
    {
        _context = context;
        _kubernetesJobService = kubernetesJobService;
        _queue = queue;
        _logger = logger;
    }

    public async Task<DeploymentResponse> CreateDeploymentAsync(Guid userId, Guid projectId)
    {
        var project = await _context.Projects
            .FirstOrDefaultAsync(p => p.Id == projectId && p.UserId == userId);
        if (project is null)
        {
            throw new NotFoundException("Project not found");
        }

        if (string.IsNullOrWhiteSpace(project.RepositoryUrl))
        {
            throw new ValidationException("Repository URL is required");
        }

        var now = DateTime.UtcNow;
        var deployment = new Deployment
        {
            Id = Guid.NewGuid(),
            ProjectId = project.Id,
            Status = DeploymentStatus.Pending,
            StartedAt = now,
            CreatedAt = now
        };

        _context.Deployments.Add(deployment);

        // The project reflects the status of its latest deployment.
        project.CurrentStatus = DeploymentStatus.Pending;
        project.UpdatedAt = now;

        await _context.SaveChangesAsync();

        // Hand the deployment to the background build worker (see DeploymentBuildWorker).
        _queue.Enqueue(deployment.Id);

        _logger.LogInformation(
            "Deployment {DeploymentId} created for project {ProjectId} and queued for build",
            deployment.Id, project.Id);

        return ToResponse(deployment);
    }

    public async Task<IReadOnlyList<DeploymentResponse>> GetProjectDeploymentsAsync(Guid userId, Guid projectId)
    {
        var projectExists = await _context.Projects
            .AnyAsync(p => p.Id == projectId && p.UserId == userId);
        if (!projectExists)
        {
            throw new NotFoundException("Project not found");
        }

        var deployments = await _context.Deployments
            .Where(d => d.ProjectId == projectId)
            .OrderByDescending(d => d.StartedAt)
            .ToListAsync();

        return deployments.Select(ToResponse).ToList();
    }

    public async Task<DeploymentResponse> GetDeploymentAsync(Guid userId, Guid deploymentId)
    {
        var deployment = await FindOwnedAsync(userId, deploymentId);
        return ToResponse(deployment);
    }

    public async Task<IReadOnlyList<DeploymentLogResponse>> GetDeploymentLogsAsync(Guid userId, Guid deploymentId)
    {
        await FindOwnedAsync(userId, deploymentId);

        var logs = await _context.DeploymentLogs
            .Where(l => l.DeploymentId == deploymentId)
            .OrderBy(l => l.CreatedAt)
            .ToListAsync();

        return logs.Select(l => new DeploymentLogResponse(l.Message, l.CreatedAt)).ToList();
    }

    public async Task<DeploymentResponse> UpdateStatusAsync(
        Guid deploymentId, string newStatus, string? buildSummary = null,
        string? errorMessage = null, string? websiteUrl = null)
    {
        if (!DeploymentStatus.IsValid(newStatus))
        {
            throw new InvalidOperationException($"Unknown deployment status '{newStatus}'.");
        }

        var deployment = await _context.Deployments
            .Include(d => d.Project)
            .FirstOrDefaultAsync(d => d.Id == deploymentId);
        if (deployment is null)
        {
            throw new NotFoundException("Deployment not found");
        }

        if (!DeploymentStatus.CanTransition(deployment.Status, newStatus))
        {
            throw new InvalidOperationException(
                $"Invalid deployment status transition from '{deployment.Status}' to '{newStatus}'.");
        }

        deployment.Status = newStatus;
        if (buildSummary is not null) deployment.BuildSummary = buildSummary;
        if (errorMessage is not null) deployment.ErrorMessage = errorMessage;
        if (DeploymentStatus.IsTerminal(newStatus)) deployment.FinishedAt = DateTime.UtcNow;

        // Keep the project's status in sync with its latest deployment.
        deployment.Project.CurrentStatus = newStatus;
        deployment.Project.UpdatedAt = DateTime.UtcNow;
        if (websiteUrl is not null) deployment.Project.WebsiteUrl = websiteUrl;

        await _context.SaveChangesAsync();

        return ToResponse(deployment);
    }

    public async Task CollectBuildLogsAsync(Guid deploymentId, CancellationToken cancellationToken = default)
    {
        var logs = await _kubernetesJobService.GetBuildJobLogsAsync(deploymentId, cancellationToken);
        if (string.IsNullOrWhiteSpace(logs))
        {
            return;
        }

        _context.DeploymentLogs.Add(new DeploymentLog
        {
            Id = Guid.NewGuid(),
            DeploymentId = deploymentId,
            Message = logs,
            CreatedAt = DateTime.UtcNow
        });

        await _context.SaveChangesAsync(cancellationToken);
    }

    // Loads a deployment the user owns (via its project), or throws NotFound.
    private async Task<Deployment> FindOwnedAsync(Guid userId, Guid deploymentId)
    {
        var deployment = await _context.Deployments
            .FirstOrDefaultAsync(d => d.Id == deploymentId && d.Project.UserId == userId);
        if (deployment is null)
        {
            throw new NotFoundException("Deployment not found");
        }
        return deployment;
    }

    private static DeploymentResponse ToResponse(Deployment d) => new(
        d.Id,
        d.Status,
        d.StartedAt,
        d.FinishedAt,
        d.BuildSummary,
        d.ErrorMessage);
}
