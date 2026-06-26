namespace HostingPlatform.Api.DTOs;

public record CurrentUserResponse(Guid Id, string DisplayName, string Email, string Role);
