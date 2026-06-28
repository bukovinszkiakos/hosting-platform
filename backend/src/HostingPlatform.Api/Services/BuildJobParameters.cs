namespace HostingPlatform.Api.Services;

// Inputs required to generate a build Job specification for a single deployment
// (see docs/10-deployment-workflow.md Step 4 - the Job receives DeploymentId,
// RepositoryUrl and ProjectId). UserId is also included because the S3 destination
// path is /user-id/project-id/ (docs/10-deployment-workflow.md Step 10).
public record BuildJobParameters(
    Guid DeploymentId,
    Guid ProjectId,
    Guid UserId,
    string RepositoryUrl);
