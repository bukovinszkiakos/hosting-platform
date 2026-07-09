using System.ComponentModel.DataAnnotations;

namespace HostingPlatform.Api.DTOs;

public record RegisterRequest(
    [StringLength(150)] string DisplayName,
    [EmailAddress][StringLength(256)] string Email,
    [StringLength(128)] string Password);
