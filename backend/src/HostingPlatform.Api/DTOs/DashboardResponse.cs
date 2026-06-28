namespace HostingPlatform.Api.DTOs;

public record DashboardResponse(
    int ProjectsCount,
    int DeploymentsCount,
    int OnlineProjects,
    int FailedProjects);
