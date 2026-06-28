using HostingPlatform.Api.Configuration;
using k8s.Models;
using Microsoft.Extensions.Options;

namespace HostingPlatform.Api.Services;

// Generates the Kubernetes Job specification for a deployment's build
// (see docs/07-kubernetes.md "Build Jobs" and docs/10-deployment-workflow.md).
// This is generation only; creating the Job in the cluster is Task 26
// (KubernetesJobService).
public class BuildJobSpecFactory : IBuildJobSpecFactory
{
    // Default build image (docs/07-kubernetes.md "Build Image"). The image is also
    // expected to provide git and the AWS CLI v2 (docs/12 "Build Environment"),
    // which the build script below relies on.
    private const string BuildImage = "node:20-slim";

    private const string ContainerName = "build";

    // Build Job resources (docs/07-kubernetes.md "Build Job Resources").
    private const string CpuRequest = "1000m";
    private const string MemoryRequest = "1Gi";
    private const string CpuLimit = "2000m";
    private const string MemoryLimit = "2Gi";

    // Each deployment is a single attempt; a failed build becomes a Failed deployment
    // rather than being retried (docs/10-deployment-workflow.md "Failure Handling").
    private const int BackoffLimit = 0;

    // Automatically remove finished Jobs to avoid accumulation (1 hour).
    private const int TtlSecondsAfterFinished = 3600;

    private readonly AwsSettings _aws;

    public BuildJobSpecFactory(IOptions<AwsSettings> aws)
    {
        _aws = aws.Value;
    }

    public V1Job Create(BuildJobParameters parameters)
    {
        var jobName = BuildJobNaming.JobName(parameters.DeploymentId);

        // Labels let later tasks (monitoring, log collection) find the Job and its pods.
        var labels = new Dictionary<string, string>
        {
            ["app"] = "hosting-platform-build",
            [BuildJobNaming.DeploymentIdLabel] = parameters.DeploymentId.ToString(),
        };

        var container = new V1Container
        {
            Name = ContainerName,
            Image = BuildImage,
            Command = ["/bin/sh", "-c"],
            Args = [BuildScript],
            Env = BuildJobEnvironment.Build(parameters, _aws),
            Resources = new V1ResourceRequirements
            {
                Requests = new Dictionary<string, ResourceQuantity>
                {
                    ["cpu"] = new(CpuRequest),
                    ["memory"] = new(MemoryRequest),
                },
                Limits = new Dictionary<string, ResourceQuantity>
                {
                    ["cpu"] = new(CpuLimit),
                    ["memory"] = new(MemoryLimit),
                },
            },
        };

        return new V1Job
        {
            ApiVersion = "batch/v1",
            Kind = "Job",
            Metadata = new V1ObjectMeta
            {
                Name = jobName,
                NamespaceProperty = BuildJobNaming.Namespace,
                Labels = labels,
            },
            Spec = new V1JobSpec
            {
                BackoffLimit = BackoffLimit,
                TtlSecondsAfterFinished = TtlSecondsAfterFinished,
                Template = new V1PodTemplateSpec
                {
                    Metadata = new V1ObjectMeta { Labels = labels },
                    Spec = new V1PodSpec
                    {
                        RestartPolicy = "Never",
                        Containers = [container],
                    },
                },
            },
        };
    }

    // The documented build process (docs/10-deployment-workflow.md Steps 5-11),
    // reading the values defined in BuildJobEnvironment.
    private const string BuildScript =
        """
        set -e
        git clone --depth 1 "$REPOSITORY_URL" /workspace
        cd /workspace
        if [ -f package.json ]; then
          npm install
          npm run build
        fi
        OUTPUT=.
        for dir in dist build out; do
          if [ -d "$dir" ]; then OUTPUT="$dir"; break; fi
        done
        aws s3 sync "$OUTPUT" "s3://$S3_BUCKET/$USER_ID/$PROJECT_ID/" --delete --exclude ".git/*"
        aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --paths "/$USER_ID/$PROJECT_ID/*"
        """;
}
