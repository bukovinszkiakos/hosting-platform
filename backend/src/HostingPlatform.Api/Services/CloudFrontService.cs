using Amazon.CloudFront;
using Amazon.CloudFront.Model;
using HostingPlatform.Api.Configuration;
using Microsoft.Extensions.Options;

namespace HostingPlatform.Api.Services;

public class CloudFrontService : ICloudFrontService
{
    private readonly IAmazonCloudFront _cloudFront;
    private readonly AwsSettings _aws;

    public CloudFrontService(IAmazonCloudFront cloudFront, IOptions<AwsSettings> aws)
    {
        _cloudFront = cloudFront;
        _aws = aws.Value;
    }

    // See docs/10-deployment-workflow.md Step 12.
    public string GetPublicUrl(Guid userId, Guid projectId) =>
        $"https://{_aws.CloudFrontDomain}/{userId}/{projectId}";

    // See docs/10-deployment-workflow.md Step 11. The path matches the project's
    // S3 key prefix, so every published file for the project is invalidated.
    public async Task InvalidateProjectAsync(
        Guid userId, Guid projectId, CancellationToken cancellationToken = default)
    {
        var path = $"/{userId}/{projectId}/*";

        var request = new CreateInvalidationRequest
        {
            DistributionId = _aws.CloudFrontDistributionId,
            InvalidationBatch = new InvalidationBatch
            {
                // Unique per request, as required by CloudFront.
                CallerReference = Guid.NewGuid().ToString("N"),
                Paths = new Paths
                {
                    Quantity = 1,
                    Items = [path],
                },
            },
        };

        await _cloudFront.CreateInvalidationAsync(request, cancellationToken);
    }
}
