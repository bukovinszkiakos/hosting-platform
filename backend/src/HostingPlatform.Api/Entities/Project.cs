namespace HostingPlatform.Api.Entities;

public class Project
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RepositoryUrl { get; set; } = string.Empty;
    public string? WebsiteUrl { get; set; }
    public string CurrentStatus { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public User User { get; set; } = null!;
    public ICollection<Deployment> Deployments { get; set; } = [];
}
