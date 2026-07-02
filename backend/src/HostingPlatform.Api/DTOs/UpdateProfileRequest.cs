using System.ComponentModel.DataAnnotations;

namespace HostingPlatform.Api.DTOs;

public record UpdateProfileRequest(
    [StringLength(150)] string DisplayName,
    string Email);
