namespace HostingPlatform.Api.Services;

// Single source of truth for how build Jobs are named and namespaced, so that
// Job creation (BuildJobSpecFactory) and monitoring (KubernetesJobService) always
// agree on the same Job. The namespace is the platform's single namespace
// (docs/07-kubernetes.md).
public static class BuildJobNaming
{
    public const string Namespace = "hosting-platform";

    // Label applied to the Job and its pods so they can be found by deployment.
    public const string DeploymentIdLabel = "deployment-id";

    private const string NamePrefix = "build-";

    // One build Job per deployment, named after the deployment id.
    public static string JobName(Guid deploymentId) => NamePrefix + deploymentId;

    // Selector for the build pod(s) belonging to a deployment.
    public static string DeploymentLabelSelector(Guid deploymentId) =>
        $"{DeploymentIdLabel}={deploymentId}";
}
