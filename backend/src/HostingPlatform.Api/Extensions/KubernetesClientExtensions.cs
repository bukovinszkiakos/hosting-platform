using k8s;

namespace HostingPlatform.Api.Extensions;

public static class KubernetesClientExtensions
{
    // Registers the Kubernetes client for in-cluster use (see docs/07-kubernetes.md
    // and docs/12). Resolved lazily as a singleton: the in-cluster configuration is
    // only read the first time IKubernetes is used (build job creation, Task 26), so
    // the backend still starts when running outside a cluster (e.g. local dev).
    public static IServiceCollection AddKubernetesClient(this IServiceCollection services)
    {
        services.AddSingleton<IKubernetes>(_ =>
            new Kubernetes(KubernetesClientConfiguration.InClusterConfig()));
        return services;
    }
}
