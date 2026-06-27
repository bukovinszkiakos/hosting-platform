namespace HostingPlatform.Api.DTOs;

public record ProfileResponse(
    string DisplayName,
    string Email,
    string Role,
    DateTime CreatedAt,
    int ProjectsCount,
    int DeploymentsCount);
