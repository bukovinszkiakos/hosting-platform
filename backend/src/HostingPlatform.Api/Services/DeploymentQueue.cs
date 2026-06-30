using System.Threading.Channels;

namespace HostingPlatform.Api.Services;

// In-memory deployment queue backed by an unbounded channel. Registered as a
// singleton: producers (DeploymentService) enqueue ids; the single
// DeploymentBuildWorker drains them. No external infrastructure is used (MVP).
public class DeploymentQueue : IDeploymentQueue
{
    private readonly Channel<Guid> _channel =
        Channel.CreateUnbounded<Guid>(new UnboundedChannelOptions { SingleReader = true });

    public void Enqueue(Guid deploymentId) => _channel.Writer.TryWrite(deploymentId);

    public IAsyncEnumerable<Guid> DequeueAllAsync(CancellationToken cancellationToken) =>
        _channel.Reader.ReadAllAsync(cancellationToken);
}
