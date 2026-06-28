namespace HostingPlatform.Api.Services;

// The observed state of a build Job in the cluster, derived from its V1JobStatus.
public enum BuildJobState
{
    // The Job exists but no pod is running yet.
    Pending,

    // A build pod is currently running.
    Running,

    // The Job completed successfully.
    Succeeded,

    // The Job failed.
    Failed,
}
