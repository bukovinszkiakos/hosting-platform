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

    public async Task<BuildJobState> GetBuildJobStateAsync(
        Guid deploymentId, CancellationToken cancellationToken = default)
    {
        var job = await _kubernetes.BatchV1.ReadNamespacedJobAsync(
            BuildJobNaming.JobName(deploymentId), BuildJobNaming.Namespace,
            cancellationToken: cancellationToken);

        return MapState(job.Status);
    }

    // Maps a Kubernetes V1JobStatus to a BuildJobState. Terminal states are taken
    // from the Job conditions (the authoritative completion signal); otherwise the
    // active pod count distinguishes a running build from one not started yet.
    private static BuildJobState MapState(V1JobStatus? status)
    {
        if (status is null)
        {
            return BuildJobState.Pending;
        }

        if (HasTrueCondition(status, "Failed"))
        {
            return BuildJobState.Failed;
        }

        if (HasTrueCondition(status, "Complete"))
        {
            return BuildJobState.Succeeded;
        }

        return status.Active.GetValueOrDefault() > 0
            ? BuildJobState.Running
            : BuildJobState.Pending;
    }

    private static bool HasTrueCondition(V1JobStatus status, string type) =>
        status.Conditions?.Any(c =>
            string.Equals(c.Type, type, StringComparison.Ordinal) &&
            string.Equals(c.Status, "True", StringComparison.Ordinal)) ?? false;

    public async Task<string> GetBuildJobLogsAsync(
        Guid deploymentId, CancellationToken cancellationToken = default)
    {
        var pods = await _kubernetes.CoreV1.ListNamespacedPodAsync(
            BuildJobNaming.Namespace,
            labelSelector: BuildJobNaming.DeploymentLabelSelector(deploymentId),
            cancellationToken: cancellationToken);

        var pod = pods.Items.FirstOrDefault();
        if (pod is null)
        {
            return string.Empty;
        }

        await using var stream = await _kubernetes.CoreV1.ReadNamespacedPodLogAsync(
            pod.Metadata.Name, BuildJobNaming.Namespace, cancellationToken: cancellationToken);
        using var reader = new StreamReader(stream);
        return await reader.ReadToEndAsync(cancellationToken);
    }
}
