using System.ComponentModel.DataAnnotations;

namespace HostingPlatform.Api.DTOs;

public record LoginRequest(
    [EmailAddress][StringLength(256)] string Email,
    [StringLength(128)] string Password);
