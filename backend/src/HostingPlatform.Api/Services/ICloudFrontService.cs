namespace HostingPlatform.Api.Services;

// Generates public website URLs and refreshes the CloudFront cache for a project
// (see docs/10-deployment-workflow.md Steps 11-12).
public interface ICloudFrontService
{
    // Public website URL for a project: "https://{domain}/{userId}/{projectId}".
    string GetPublicUrl(Guid userId, Guid projectId);

    // Invalidates the project's cached files so the latest deployment is served.
    Task InvalidateProjectAsync(Guid userId, Guid projectId, CancellationToken cancellationToken = default);
}
