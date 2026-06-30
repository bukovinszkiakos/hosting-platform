using k8s;

namespace HostingPlatform.Api.Extensions;

public static class KubernetesClientExtensions
{
    // Registers the Kubernetes client for in-cluster use (see docs/07-kubernetes.md
    // and docs/12). Exposed as Lazy<IKubernetes> so the in-cluster configuration is
    // read only when the cluster is actually called (build Job creation/monitoring),
    // not when a consumer is constructed. This keeps deployment read/create endpoints
    // working outside a cluster (e.g. local dev), where only an actual build needs it.
    //
    // PublicationOnly: a failed InClusterConfig() (e.g. running outside a cluster) is
    // not cached, so it is retried on the next attempt rather than poisoning the singleton.
    public static IServiceCollection AddKubernetesClient(this IServiceCollection services)
    {
        services.AddSingleton(_ => new Lazy<IKubernetes>(
            () => new Kubernetes(KubernetesClientConfiguration.InClusterConfig()),
            LazyThreadSafetyMode.PublicationOnly));
        return services;
    }
}
