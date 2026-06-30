namespace HostingPlatform.Api.Entities;

// A single stored log line for a deployment (see docs/04-database.md
// "DeploymentLogs Table" and docs/12 "Build Logs"). Build pod output is collected
// and persisted as DeploymentLog records by the build worker.
public class DeploymentLog
{
    public Guid Id { get; set; }
    public Guid DeploymentId { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }

    public Deployment Deployment { get; set; } = null!;
}
