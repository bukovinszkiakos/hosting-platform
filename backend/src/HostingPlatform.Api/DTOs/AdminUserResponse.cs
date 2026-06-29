namespace HostingPlatform.Api.DTOs;

public record AdminUserResponse(
    Guid Id,
    string DisplayName,
    string Email,
    string Role,
    DateTime CreatedAt);
