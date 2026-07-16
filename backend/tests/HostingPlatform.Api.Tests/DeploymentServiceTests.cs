using HostingPlatform.Api.Data;
using HostingPlatform.Api.Entities;
using HostingPlatform.Api.Exceptions;
using HostingPlatform.Api.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace HostingPlatform.Api.Tests;

public class DeploymentServiceTests
{
    private static readonly Guid OwnerId = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private static readonly Guid OtherUserId = Guid.Parse("10000000-0000-0000-0000-000000000002");
    private static readonly Guid ProjectId = Guid.Parse("20000000-0000-0000-0000-000000000001");

    private static void SeedProject(AppDbContext db, string repositoryUrl = "https://github.com/acme/site")
    {
        db.Users.Add(new User { Id = OwnerId, UserName = "owner@example.com", Email = "owner@example.com" });
        db.Projects.Add(new Project
        {
            Id = ProjectId,
            UserId = OwnerId,
            Name = "Site",
            RepositoryUrl = repositoryUrl,
            CurrentStatus = "Draft",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        db.SaveChanges();
    }

    private static void SeedDeployment(AppDbContext db, Guid deploymentId, string status)
    {
        db.Deployments.Add(new Deployment
        {
            Id = deploymentId,
            ProjectId = ProjectId,
            Status = status,
            StartedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
        });
        db.SaveChanges();
    }

    private static DeploymentService CreateService(AppDbContext db, FakeDeploymentQueue queue)
        => new(db, new FakeKubernetesJobService(), queue, NullLogger<DeploymentService>.Instance);

    [Fact]
    public async Task CreateDeployment_persists_pending_deployment_and_enqueues_it()
    {
        using var sut = new SqliteInMemoryDatabase();
        using (var seed = sut.CreateContext()) SeedProject(seed);

        var queue = new FakeDeploymentQueue();
        using (var db = sut.CreateContext())
        {
            var result = await CreateService(db, queue).CreateDeploymentAsync(OwnerId, ProjectId);
            Assert.Equal(DeploymentStatus.Pending, result.Status);
        }

        var enqueued = Assert.Single(queue.Enqueued);
        using var verify = sut.CreateContext();
        var deployment = Assert.Single(verify.Deployments.ToList());
        Assert.Equal(DeploymentStatus.Pending, deployment.Status);
        Assert.Equal(enqueued, deployment.Id);
        Assert.Equal(DeploymentStatus.Pending, verify.Projects.Single().CurrentStatus);
    }

    [Fact]
    public async Task CreateDeployment_throws_NotFound_for_project_owned_by_another_user()
    {
        using var sut = new SqliteInMemoryDatabase();
        using (var seed = sut.CreateContext()) SeedProject(seed);

        using var db = sut.CreateContext();
        var queue = new FakeDeploymentQueue();

        await Assert.ThrowsAsync<NotFoundException>(
            () => CreateService(db, queue).CreateDeploymentAsync(OtherUserId, ProjectId));
        Assert.Empty(queue.Enqueued);
    }

    [Fact]
    public async Task CreateDeployment_throws_Validation_when_repository_url_missing()
    {
        using var sut = new SqliteInMemoryDatabase();
        using (var seed = sut.CreateContext()) SeedProject(seed, repositoryUrl: "");

        using var db = sut.CreateContext();

        await Assert.ThrowsAsync<ValidationException>(
            () => CreateService(db, new FakeDeploymentQueue()).CreateDeploymentAsync(OwnerId, ProjectId));
    }

    [Fact]
    public async Task CreateDeployment_rejects_a_second_deployment_while_one_is_active()
    {
        using var sut = new SqliteInMemoryDatabase();
        using (var seed = sut.CreateContext())
        {
            SeedProject(seed);
            SeedDeployment(seed, Guid.NewGuid(), DeploymentStatus.Building);
        }

        using var db = sut.CreateContext();
        var queue = new FakeDeploymentQueue();

        await Assert.ThrowsAsync<ValidationException>(
            () => CreateService(db, queue).CreateDeploymentAsync(OwnerId, ProjectId));
        Assert.Empty(queue.Enqueued);
    }

    [Fact]
    public async Task UpdateStatus_rejects_an_invalid_transition()
    {
        using var sut = new SqliteInMemoryDatabase();
        var deploymentId = Guid.NewGuid();
        using (var seed = sut.CreateContext())
        {
            SeedProject(seed);
            SeedDeployment(seed, deploymentId, DeploymentStatus.Pending);
        }

        using var db = sut.CreateContext();
        var service = CreateService(db, new FakeDeploymentQueue());

        // Pending -> Online is illegal (must pass through Building/Deploying).
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.UpdateStatusAsync(deploymentId, DeploymentStatus.Online));
    }

    [Fact]
    public async Task UpdateStatus_applies_a_valid_transition_and_syncs_the_project()
    {
        using var sut = new SqliteInMemoryDatabase();
        var deploymentId = Guid.NewGuid();
        using (var seed = sut.CreateContext())
        {
            SeedProject(seed);
            SeedDeployment(seed, deploymentId, DeploymentStatus.Pending);
        }

        using (var db = sut.CreateContext())
        {
            var result = await CreateService(db, new FakeDeploymentQueue())
                .UpdateStatusAsync(deploymentId, DeploymentStatus.Building);
            Assert.Equal(DeploymentStatus.Building, result.Status);
        }

        using var verify = sut.CreateContext();
        Assert.Equal(DeploymentStatus.Building, verify.Deployments.Single().Status);
        Assert.Equal(DeploymentStatus.Building, verify.Projects.Single().CurrentStatus);
    }
}
