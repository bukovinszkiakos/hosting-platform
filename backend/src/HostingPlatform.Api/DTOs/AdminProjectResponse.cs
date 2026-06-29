namespace HostingPlatform.Api.DTOs;

public record AdminProjectResponse(
    Guid Id,
    string Name,
    string RepositoryUrl,
    string CurrentStatus,
    string OwnerEmail,
    DateTime CreatedAt);
