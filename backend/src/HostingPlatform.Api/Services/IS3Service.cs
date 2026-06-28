namespace HostingPlatform.Api.Services;

// Uploads published static-site files to the shared S3 bucket and generates the
// per-project key prefix (see docs/05-aws-architecture.md "S3 Storage").
public interface IS3Service
{
    // Generates the S3 key prefix (bucket path) for a project's published files:
    // "{userId}/{projectId}/".
    string GetSiteKeyPrefix(Guid userId, Guid projectId);

    // Uploads a single object to the shared site bucket under the given key.
    Task UploadFileAsync(string key, Stream content, string contentType, CancellationToken cancellationToken = default);
}
