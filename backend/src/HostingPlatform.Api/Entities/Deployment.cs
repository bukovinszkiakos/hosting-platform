namespace HostingPlatform.Api.Entities;

public class Deployment
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime StartedAt { get; set; }
    public DateTime? FinishedAt { get; set; }
    public string? BuildSummary { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime CreatedAt { get; set; }

    public Project Project { get; set; } = null!;
    public ICollection<DeploymentLog> DeploymentLogs { get; set; } = [];
}
