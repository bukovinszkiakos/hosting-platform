using k8s;
using k8s.Models;

namespace HostingPlatform.Api.Services;

// Creates the Kubernetes build Job for a deployment (see docs/10-deployment-workflow.md
// Step 4). The Job specification itself is produced by IBuildJobSpecFactory (Task 25);
// this service is only responsible for submitting it to the cluster.
public class KubernetesJobService : IKubernetesJobService
{
    private readonly IKubernetes _kubernetes;
    private readonly IBuildJobSpecFactory _specFactory;
    private readonly ILogger<KubernetesJobService> _logger;

    public KubernetesJobService(
        IKubernetes kubernetes,
        IBuildJobSpecFactory specFactory,
        ILogger<KubernetesJobService> logger)
    {
        _kubernetes = kubernetes;
        _specFactory = specFactory;
        _logger = logger;
    }

    public async Task<V1Job> CreateBuildJobAsync(
        BuildJobParameters parameters, CancellationToken cancellationToken = default)
    {
        var job = _specFactory.Create(parameters);

        var created = await _kubernetes.BatchV1.CreateNamespacedJobAsync(
            job, job.Metadata.NamespaceProperty, cancellationToken: cancellationToken);

        _logger.LogInformation(
            "Created build Job {JobName} for deployment {DeploymentId}",
            created.Metadata.Name, parameters.DeploymentId);

        return created;
    }
}
