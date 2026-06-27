namespace HostingPlatform.Api.DTOs;

public record ProjectResponse(
    Guid Id,
    string Name,
    string RepositoryUrl,
    string? WebsiteUrl,
    string CurrentStatus,
    DateTime CreatedAt,
    DateTime UpdatedAt);
