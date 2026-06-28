using k8s.Models;

namespace HostingPlatform.Api.Services;

// Creates and monitors build Jobs in the Kubernetes cluster for deployments.
public interface IKubernetesJobService
{
    Task<V1Job> CreateBuildJobAsync(BuildJobParameters parameters, CancellationToken cancellationToken = default);

    // Retrieves the current state of the build Job for the given deployment.
    Task<BuildJobState> GetBuildJobStateAsync(Guid deploymentId, CancellationToken cancellationToken = default);
}
