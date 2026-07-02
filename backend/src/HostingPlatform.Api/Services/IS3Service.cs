namespace HostingPlatform.Api.Services;

// Uploads published static-site files to the shared S3 bucket and generates the
// per-project key prefix (see docs/05-aws-architecture.md "S3 Storage").
public interface IS3Service
{
    // Generates the S3 key prefix (bucket path) for a project's published files:
    // "{userId}/{projectId}/".
    string GetSiteKeyPrefix(Guid userId, Guid projectId);

    // Removes all published files for a project (every object under its
    // "{userId}/{projectId}/" prefix). Used when a project is deleted
    // (see docs/02-features.md "Delete Project").
    Task DeleteSiteAsync(Guid userId, Guid projectId, CancellationToken cancellationToken = default);
}
