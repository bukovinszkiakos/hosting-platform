using System.ComponentModel.DataAnnotations;

namespace HostingPlatform.Api.DTOs;

public record UpdateProfileRequest(
    [StringLength(150)] string DisplayName,
    [EmailAddress][StringLength(256)] string Email);
