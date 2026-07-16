using HostingPlatform.Api.Services;
using k8s.Models;

namespace HostingPlatform.Api.Tests;

// Minimal hand-rolled test doubles. No mocking library is used: these interfaces
// are tiny and the tests only need to record a call or force a failure, which a
// few lines express more clearly than a mock framework.

internal sealed class FakeDeploymentQueue : IDeploymentQueue
{
    public List<Guid> Enqueued { get; } = [];

    public void Enqueue(Guid deploymentId) => Enqueued.Add(deploymentId);

    public IAsyncEnumerable<Guid> DequeueAllAsync(CancellationToken cancellationToken)
        => throw new NotSupportedException("Not exercised by these tests.");
}

internal sealed class FakeKubernetesJobService : IKubernetesJobService
{
    public Task<V1Job> CreateBuildJobAsync(BuildJobParameters parameters, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Not exercised by these tests.");

    public Task<BuildJobState> GetBuildJobStateAsync(Guid deploymentId, CancellationToken cancellationToken = default)
        => throw new NotSupportedException("Not exercised by these tests.");

    public Task<string> GetBuildJobLogsAsync(Guid deploymentId, CancellationToken cancellationToken = default)
        => Task.FromResult(string.Empty);
}

internal sealed class FakeS3Service : IS3Service
{
    public bool ThrowOnDelete { get; init; }
    public int DeleteCalls { get; private set; }

    public string GetSiteKeyPrefix(Guid userId, Guid projectId) => $"{userId}/{projectId}/";

    public Task DeleteSiteAsync(Guid userId, Guid projectId, CancellationToken cancellationToken = default)
    {
        DeleteCalls++;
        if (ThrowOnDelete)
        {
            throw new InvalidOperationException("S3 unavailable");
        }

        return Task.CompletedTask;
    }
}

internal sealed class FakeCloudFrontService : ICloudFrontService
{
    public string GetPublicUrl(Guid userId, Guid projectId) => $"https://cdn.example/{userId}/{projectId}";

    public Task InvalidateProjectAsync(Guid userId, Guid projectId, CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}
