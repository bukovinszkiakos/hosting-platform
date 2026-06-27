namespace HostingPlatform.Api.Services;

// Deployment status values and the allowed lifecycle transitions
// (see docs/10-deployment-workflow.md). Centralized to avoid magic strings.
public static class DeploymentStatus
{
    public const string Pending = "Pending";
    public const string Building = "Building";
    public const string Deploying = "Deploying";
    public const string Online = "Online";
    public const string Failed = "Failed";

    // Pending -> Building -> Deploying -> Online, with Failed reachable from any
    // non-terminal state. Online and Failed are terminal.
    private static readonly Dictionary<string, string[]> Allowed = new()
    {
        [Pending] = [Building, Failed],
        [Building] = [Deploying, Failed],
        [Deploying] = [Online, Failed],
        [Online] = [],
        [Failed] = [],
    };

    public static bool IsValid(string status) => Allowed.ContainsKey(status);

    public static bool IsTerminal(string status) => status is Online or Failed;

    public static bool CanTransition(string from, string to) =>
        Allowed.TryGetValue(from, out var next) && next.Contains(to);
}
