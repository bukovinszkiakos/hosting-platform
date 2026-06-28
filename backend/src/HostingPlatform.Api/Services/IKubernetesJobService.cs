using k8s.Models;

namespace HostingPlatform.Api.Services;

// Creates build Jobs in the Kubernetes cluster for deployments.
public interface IKubernetesJobService
{
    Task<V1Job> CreateBuildJobAsync(BuildJobParameters parameters, CancellationToken cancellationToken = default);
}
