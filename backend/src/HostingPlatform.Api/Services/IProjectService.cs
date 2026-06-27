using HostingPlatform.Api.DTOs;

namespace HostingPlatform.Api.Services;

public interface IProjectService
{
    Task<IReadOnlyList<ProjectResponse>> GetProjectsAsync(Guid userId);
    Task<ProjectResponse> GetProjectAsync(Guid userId, Guid projectId);
    Task<ProjectResponse> CreateProjectAsync(Guid userId, CreateProjectRequest request);
    Task<ProjectResponse> UpdateProjectAsync(Guid userId, Guid projectId, UpdateProjectRequest request);
    Task DeleteProjectAsync(Guid userId, Guid projectId);
}
