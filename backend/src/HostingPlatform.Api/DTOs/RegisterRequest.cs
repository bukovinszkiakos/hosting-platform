using System.ComponentModel.DataAnnotations;

namespace HostingPlatform.Api.DTOs;

public record RegisterRequest(
    [StringLength(150)] string DisplayName,
    string Email,
    string Password);
