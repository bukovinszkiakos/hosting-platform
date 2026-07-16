using HostingPlatform.Api.Configuration;
using HostingPlatform.Api.Services;
using k8s.Models;
using Microsoft.Extensions.Options;
using Xunit;

namespace HostingPlatform.Api.Tests;

public class BuildJobSpecFactoryTests
{
    private static readonly Guid DeploymentId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid ProjectId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid UserId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private static V1Job CreateJob()
    {
        var aws = Options.Create(new AwsSettings
        {
            Region = "eu-central-1",
            BucketName = "hosting-bucket",
            CloudFrontDistributionId = "DIST123",
        });

        var factory = new BuildJobSpecFactory(aws);
        return factory.Create(new BuildJobParameters(
            DeploymentId, ProjectId, UserId, "https://github.com/acme/site"));
    }

    [Fact]
    public void Create_sets_name_namespace_and_labels()
    {
        var job = CreateJob();

        Assert.Equal($"build-{DeploymentId}", job.Metadata.Name);
        Assert.Equal("hosting-platform", job.Metadata.NamespaceProperty);
        Assert.Equal("hosting-platform-build", job.Metadata.Labels["app"]);
        Assert.Equal(DeploymentId.ToString(), job.Metadata.Labels["deployment-id"]);
    }

    [Fact]
    public void Create_uses_single_attempt_and_cleanup_policy()
    {
        var spec = CreateJob().Spec;

        Assert.Equal(0, spec.BackoffLimit); // one attempt; a failed build fails the deployment
        Assert.Equal(3600, spec.TtlSecondsAfterFinished);
        Assert.Equal(600, spec.ActiveDeadlineSeconds);
    }

    [Fact]
    public void Create_hardens_the_build_pod()
    {
        var pod = CreateJob().Spec.Template.Spec;

        Assert.Equal("Never", pod.RestartPolicy);
        Assert.Equal("hosting-platform", pod.ServiceAccountName);
        // The build runs untrusted repo code; the Kubernetes API token must not be mounted.
        Assert.False(pod.AutomountServiceAccountToken);
    }

    [Fact]
    public void Create_injects_the_build_environment()
    {
        var container = Assert.Single(CreateJob().Spec.Template.Spec.Containers);
        var env = container.Env.ToDictionary(e => e.Name, e => e.Value);

        Assert.Equal("node:20-slim", container.Image);
        Assert.Equal("hosting-bucket", env["S3_BUCKET"]);
        Assert.Equal("eu-central-1", env["AWS_REGION"]);
        Assert.Equal("DIST123", env["CLOUDFRONT_DISTRIBUTION_ID"]);
        Assert.Equal("https://github.com/acme/site", env["REPOSITORY_URL"]);
        Assert.Equal(UserId.ToString(), env["USER_ID"]);
        Assert.Equal(ProjectId.ToString(), env["PROJECT_ID"]);
        Assert.Equal(DeploymentId.ToString(), env["DEPLOYMENT_ID"]);
    }
}
