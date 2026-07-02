using HostingPlatform.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace HostingPlatform.Api.Services;

// Drives the deployment build lifecycle. Consumes deployment ids from the
// in-process queue and, for each one, creates the Kubernetes build Job, polls it
// to completion, collects its logs, and advances the deployment status
// (see docs/10-deployment-workflow.md "Deployment Orchestration").
//
// Registered as a hosted service (singleton), so it only depends on singletons
// and resolves scoped services (AppDbContext, IDeploymentService, ...) per
// deployment through IServiceScopeFactory.
public class DeploymentBuildWorker : BackgroundService
{
    // How often the build Job is polled, and how long a build may run before it
    // is treated as failed. Mirrors the constant style used by BuildJobSpecFactory.
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan BuildTimeout = TimeSpan.FromMinutes(10);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IDeploymentQueue _queue;
    private readonly ILogger<DeploymentBuildWorker> _logger;

    public DeploymentBuildWorker(
        IServiceScopeFactory scopeFactory,
        IDeploymentQueue queue,
        ILogger<DeploymentBuildWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _queue = queue;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await RecoverInterruptedDeploymentsAsync(stoppingToken);

        await foreach (var deploymentId in _queue.DequeueAllAsync(stoppingToken))
        {
            await ProcessAsync(deploymentId, stoppingToken);
        }
    }

    // The in-memory queue does not survive a restart, so any deployment still in a
    // non-terminal state belongs to a previous process that was interrupted (e.g. a
    // pod restart) and can never make progress. Mark these Failed on startup rather
    // than leave them stuck (see docs/10-deployment-workflow.md "Deployment
    // Orchestration"). Interrupted deployments are not requeued.
    private async Task RecoverInterruptedDeploymentsAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var provider = scope.ServiceProvider;
        var db = provider.GetRequiredService<AppDbContext>();
        var deployments = provider.GetRequiredService<IDeploymentService>();

        var interruptedIds = await db.Deployments
            .Where(d => d.Status == DeploymentStatus.Pending
                     || d.Status == DeploymentStatus.Building
                     || d.Status == DeploymentStatus.Deploying)
            .Select(d => d.Id)
            .ToListAsync(cancellationToken);

        if (interruptedIds.Count == 0)
        {
            return;
        }

        foreach (var deploymentId in interruptedIds)
        {
            try
            {
                await deployments.UpdateStatusAsync(
                    deploymentId, DeploymentStatus.Failed,
                    errorMessage: "Deployment interrupted by a service restart");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Could not recover interrupted deployment {DeploymentId}", deploymentId);
            }
        }

        _logger.LogInformation(
            "Recovered {Count} interrupted deployment(s) on startup", interruptedIds.Count);
    }

    private async Task ProcessAsync(Guid deploymentId, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var provider = scope.ServiceProvider;
        var db = provider.GetRequiredService<AppDbContext>();
        var deployments = provider.GetRequiredService<IDeploymentService>();
        var jobs = provider.GetRequiredService<IKubernetesJobService>();
        var cloudFront = provider.GetRequiredService<ICloudFrontService>();

        var deployment = await db.Deployments
            .Include(d => d.Project)
            .FirstOrDefaultAsync(d => d.Id == deploymentId, cancellationToken);
        if (deployment is null)
        {
            _logger.LogWarning("Build worker skipped unknown deployment {DeploymentId}", deploymentId);
            return;
        }

        var project = deployment.Project;

        try
        {
            await deployments.UpdateStatusAsync(deploymentId, DeploymentStatus.Building);

            await jobs.CreateBuildJobAsync(
                new BuildJobParameters(deploymentId, project.Id, project.UserId, project.RepositoryUrl),
                cancellationToken);

            var state = await WaitForCompletionAsync(jobs, deploymentId, cancellationToken);

            await TryCollectLogsAsync(deployments, deploymentId, cancellationToken);

            if (state == BuildJobState.Succeeded)
            {
                // A single build Job performs both build and publish (S3 + CloudFront),
                // so Deploying is a short finalization step before Online.
                await deployments.UpdateStatusAsync(deploymentId, DeploymentStatus.Deploying);
                var websiteUrl = cloudFront.GetPublicUrl(project.UserId, project.Id);
                await deployments.UpdateStatusAsync(
                    deploymentId,
                    DeploymentStatus.Online,
                    buildSummary: "Build completed successfully",
                    websiteUrl: websiteUrl);

                _logger.LogInformation("Deployment {DeploymentId} is Online", deploymentId);
            }
            else
            {
                var message = state is null
                    ? $"Build did not complete within {BuildTimeout.TotalMinutes:0} minutes"
                    : "Build process failed";
                await deployments.UpdateStatusAsync(
                    deploymentId, DeploymentStatus.Failed, errorMessage: message);

                _logger.LogWarning("Deployment {DeploymentId} failed: {Message}", deploymentId, message);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Application is shutting down; leave the deployment to be retried later.
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Build orchestration failed for deployment {DeploymentId}", deploymentId);
            await TryMarkFailedAsync(deployments, deploymentId, "Deployment failed: " + ex.Message);
        }
    }

    // Polls the build Job until it reaches a terminal state. Returns the terminal
    // BuildJobState, or null if the build timed out.
    private static async Task<BuildJobState?> WaitForCompletionAsync(
        IKubernetesJobService jobs, Guid deploymentId, CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow + BuildTimeout;

        while (true)
        {
            var state = await jobs.GetBuildJobStateAsync(deploymentId, cancellationToken);
            if (state is BuildJobState.Succeeded or BuildJobState.Failed)
            {
                return state;
            }

            if (DateTime.UtcNow >= deadline)
            {
                return null;
            }

            await Task.Delay(PollInterval, cancellationToken);
        }
    }

    // Log collection is best-effort: a failure here must not prevent the
    // deployment's final status from being recorded.
    private async Task TryCollectLogsAsync(
        IDeploymentService deployments, Guid deploymentId, CancellationToken cancellationToken)
    {
        try
        {
            await deployments.CollectBuildLogsAsync(deploymentId, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to collect build logs for deployment {DeploymentId}", deploymentId);
        }
    }

    private async Task TryMarkFailedAsync(
        IDeploymentService deployments, Guid deploymentId, string message)
    {
        try
        {
            await deployments.UpdateStatusAsync(deploymentId, DeploymentStatus.Failed, errorMessage: message);
        }
        catch (Exception ex)
        {
            // The deployment may already be in a terminal state, or the failure may be
            // transient; log and move on rather than crash the worker loop.
            _logger.LogWarning(ex, "Could not mark deployment {DeploymentId} as Failed", deploymentId);
        }
    }
}
