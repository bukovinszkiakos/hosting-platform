using k8s.Models;

namespace HostingPlatform.Api.Services;

// Generates the Kubernetes Job specification used to build and publish a deployment.
public interface IBuildJobSpecFactory
{
    V1Job Create(BuildJobParameters parameters);
}
