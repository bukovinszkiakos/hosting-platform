namespace HostingPlatform.Api.Services;

// In-process queue of deployment ids awaiting build orchestration. Implemented
// with an in-memory channel (no external queue/broker); see the
// DeploymentBuildWorker that consumes it and docs/10-deployment-workflow.md
// "Deployment Orchestration".
public interface IDeploymentQueue
{
    // Queues a created (Pending) deployment for processing. Returns immediately.
    void Enqueue(Guid deploymentId);

    // Streams queued deployment ids until the application stops.
    IAsyncEnumerable<Guid> DequeueAllAsync(CancellationToken cancellationToken);
}
