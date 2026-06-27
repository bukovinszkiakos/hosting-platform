namespace HostingPlatform.Api.DTOs;

public record DeploymentResponse(
    Guid Id,
    string Status,
    DateTime StartedAt,
    DateTime? FinishedAt,
    string? BuildSummary,
    string? ErrorMessage);
