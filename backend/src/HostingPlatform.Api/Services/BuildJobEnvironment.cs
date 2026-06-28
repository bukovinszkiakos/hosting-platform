using HostingPlatform.Api.Configuration;
using k8s.Models;

namespace HostingPlatform.Api.Services;

// Environment variable definitions passed to the build container.
// The build script (see BuildJobSpecFactory) reads these to clone the repository,
// upload the build output to S3, and invalidate CloudFront
// (see docs/10-deployment-workflow.md Steps 5-11).
public static class BuildJobEnvironment
{
    public const string DeploymentId = "DEPLOYMENT_ID";
    public const string ProjectId = "PROJECT_ID";
    public const string UserId = "USER_ID";
    public const string RepositoryUrl = "REPOSITORY_URL";
    public const string S3Bucket = "S3_BUCKET";
    public const string AwsRegion = "AWS_REGION";
    public const string CloudFrontDistributionId = "CLOUDFRONT_DISTRIBUTION_ID";

    public static List<V1EnvVar> Build(BuildJobParameters parameters, AwsSettings aws) =>
    [
        new() { Name = DeploymentId, Value = parameters.DeploymentId.ToString() },
        new() { Name = ProjectId, Value = parameters.ProjectId.ToString() },
        new() { Name = UserId, Value = parameters.UserId.ToString() },
        new() { Name = RepositoryUrl, Value = parameters.RepositoryUrl },
        new() { Name = S3Bucket, Value = aws.BucketName },
        new() { Name = AwsRegion, Value = aws.Region },
        new() { Name = CloudFrontDistributionId, Value = aws.CloudFrontDistributionId },
    ];
}
