using System.ComponentModel.DataAnnotations;

namespace HostingPlatform.Api.DTOs;

public record UpdateProjectRequest(
    [StringLength(150)] string Name,
    [StringLength(2048)] string RepositoryUrl);
