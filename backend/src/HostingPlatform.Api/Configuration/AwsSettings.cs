namespace HostingPlatform.Api.Configuration;

public class AwsSettings
{
    public string Region { get; set; } = string.Empty;
    public string BucketName { get; set; } = string.Empty;
    public string CloudFrontDistributionId { get; set; } = string.Empty;

    // CloudFront distribution domain (e.g. "d111abc.cloudfront.net"), used to build
    // public website URLs. Assigned by AWS, so it is provided via configuration.
    public string CloudFrontDomain { get; set; } = string.Empty;
}
