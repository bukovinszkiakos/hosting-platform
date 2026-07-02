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
    // Default build image (docs/07-kubernetes.md "Build Image"). node:20-slim does
    // not ship git or the AWS CLI v2, so the build script installs both at container
    // start (docs/12 "Build Environment"). A prebuilt image is a future optimization.
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

    // Kubernetes terminates the Job if the build exceeds this wall-clock limit
    // (10 minutes, matching DeploymentBuildWorker.BuildTimeout). This guarantees a
    // timed-out build cannot keep running and publish to S3/CloudFront after the
    // deployment has already been marked Failed (docs/10-deployment-workflow.md).
    private const long BuildDeadlineSeconds = 600;

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
                ActiveDeadlineSeconds = BuildDeadlineSeconds,
                Template = new V1PodTemplateSpec
                {
                    Metadata = new V1ObjectMeta { Labels = labels },
                    Spec = new V1PodSpec
                    {
                        RestartPolicy = "Never",
                        // Bound to the Backend Service IAM role via EKS Pod Identity, so
                        // the build script can upload to S3 and invalidate CloudFront.
                        ServiceAccountName = BuildJobNaming.ServiceAccountName,
                        // The build container never calls the Kubernetes API, so the
                        // default API token is not mounted (it would only be attack
                        // surface for untrusted repo code). Pod Identity injects its own
                        // token separately, so AWS access is unaffected.
                        AutomountServiceAccountToken = false,
                        Containers = [container],
                    },
                },
            },
        };
    }

    // The documented build process (docs/10-deployment-workflow.md Steps 5-11),
    // reading the values defined in BuildJobEnvironment.
    //
    // node:20-slim (Debian) ships without git or the AWS CLI, so both are installed
    // first. The AWS CLI v2 archive is selected per architecture so the script works
    // on x86_64 and Graviton nodes alike.
    private const string BuildScript =
        """
        set -e
        apt-get update
        apt-get install -y --no-install-recommends git curl unzip ca-certificates
        curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscliv2.zip
        unzip -q /tmp/awscliv2.zip -d /tmp
        /tmp/aws/install
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
