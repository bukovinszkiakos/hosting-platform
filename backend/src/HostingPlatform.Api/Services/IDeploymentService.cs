using HostingPlatform.Api.DTOs;

namespace HostingPlatform.Api.Services;

public interface IDeploymentService
{
    Task<DeploymentResponse> CreateDeploymentAsync(Guid userId, Guid projectId);
    Task<IReadOnlyList<DeploymentResponse>> GetProjectDeploymentsAsync(Guid userId, Guid projectId);
    Task<DeploymentResponse> GetDeploymentAsync(Guid userId, Guid deploymentId);
    Task<IReadOnlyList<DeploymentLogResponse>> GetDeploymentLogsAsync(Guid userId, Guid deploymentId);

    // Advances a deployment through its lifecycle. Invoked by the build/monitoring
    // pipeline (later tasks), not directly by users. Enforces valid transitions.
    Task<DeploymentResponse> UpdateStatusAsync(
        Guid deploymentId, string newStatus, string? buildSummary = null, string? errorMessage = null);

    // Collects the build pod's logs from the cluster and persists them as a
    // DeploymentLog record. Invoked by the build/monitoring pipeline, not by users.
    Task CollectBuildLogsAsync(Guid deploymentId, CancellationToken cancellationToken = default);
}
