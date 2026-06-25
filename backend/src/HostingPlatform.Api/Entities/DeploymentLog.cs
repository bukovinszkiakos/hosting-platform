namespace HostingPlatform.Api.Entities;

// TODO: PROVISIONAL SCHEMA — doc 04 does not define a DeploymentLogs table.
// All fields below are inferred from doc 12 ("Build Logs: Stored in DeploymentLog records").
// Confirm the required fields and update doc 04 BEFORE creating the initial migration in Task 12.
public class DeploymentLog
{
    public Guid Id { get; set; }
    public Guid DeploymentId { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }

    public Deployment Deployment { get; set; } = null!;
}
