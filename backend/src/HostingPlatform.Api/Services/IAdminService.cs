using HostingPlatform.Api.DTOs;

namespace HostingPlatform.Api.Services;

public interface IAdminService
{
    Task<IReadOnlyList<AdminUserResponse>> GetUsersAsync();
    Task<IReadOnlyList<AdminProjectResponse>> GetProjectsAsync();
    Task<IReadOnlyList<DeploymentResponse>> GetDeploymentsAsync();
}
