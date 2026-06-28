using HostingPlatform.Api.DTOs;

namespace HostingPlatform.Api.Services;

public interface IDashboardService
{
    Task<DashboardResponse> GetDashboardAsync(Guid userId);
}
