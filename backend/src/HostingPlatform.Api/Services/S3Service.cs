using Amazon.S3;
using Amazon.S3.Model;
using HostingPlatform.Api.Configuration;
using Microsoft.Extensions.Options;

namespace HostingPlatform.Api.Services;

public class S3Service : IS3Service
{
    private readonly IAmazonS3 _s3;
    private readonly AwsSettings _aws;

    public S3Service(IAmazonS3 s3, IOptions<AwsSettings> aws)
    {
        _s3 = s3;
        _aws = aws.Value;
    }

    // Published files live under "{userId}/{projectId}/" in the shared bucket
    // (see docs/05-aws-architecture.md "S3 Storage").
    public string GetSiteKeyPrefix(Guid userId, Guid projectId) => $"{userId}/{projectId}/";

    public async Task UploadFileAsync(
        string key, Stream content, string contentType, CancellationToken cancellationToken = default)
    {
        var request = new PutObjectRequest
        {
            BucketName = _aws.BucketName,
            Key = key,
            InputStream = content,
            ContentType = contentType,
            AutoCloseStream = false,
        };

        await _s3.PutObjectAsync(request, cancellationToken);
    }

    public async Task DeleteSiteAsync(
        Guid userId, Guid projectId, CancellationToken cancellationToken = default)
    {
        var prefix = GetSiteKeyPrefix(userId, projectId);
        string? continuationToken = null;

        // List and delete in pages: a published site can contain more than the
        // 1000 keys a single ListObjectsV2 / DeleteObjects call handles.
        do
        {
            var listed = await _s3.ListObjectsV2Async(new ListObjectsV2Request
            {
                BucketName = _aws.BucketName,
                Prefix = prefix,
                ContinuationToken = continuationToken,
            }, cancellationToken);

            var keys = listed.S3Objects;
            if (keys is { Count: > 0 })
            {
                await _s3.DeleteObjectsAsync(new DeleteObjectsRequest
                {
                    BucketName = _aws.BucketName,
                    Objects = keys.Select(o => new KeyVersion { Key = o.Key }).ToList(),
                }, cancellationToken);
            }

            continuationToken = listed.IsTruncated == true ? listed.NextContinuationToken : null;
        }
        while (continuationToken is not null);
    }
}
