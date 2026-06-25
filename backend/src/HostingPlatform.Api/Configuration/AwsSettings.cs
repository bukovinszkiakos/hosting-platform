namespace HostingPlatform.Api.Configuration;

public class AwsSettings
{
    public string Region { get; set; } = string.Empty;
    public string BucketName { get; set; } = string.Empty;
    public string CloudFrontDistributionId { get; set; } = string.Empty;
}
