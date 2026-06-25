using Microsoft.AspNetCore.Identity;

namespace HostingPlatform.Api.Entities;

public class User : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }

    public ICollection<Project> Projects { get; set; } = [];
}
