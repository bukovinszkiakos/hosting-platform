using HostingPlatform.Api.Data;
using HostingPlatform.Api.DTOs;
using HostingPlatform.Api.Entities;
using HostingPlatform.Api.Exceptions;
using HostingPlatform.Api.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace HostingPlatform.Api.Tests;

public class ProjectServiceTests
{
    private static readonly Guid OwnerId = Guid.Parse("30000000-0000-0000-0000-000000000001");
    private static readonly Guid OtherUserId = Guid.Parse("30000000-0000-0000-0000-000000000002");

    private static void SeedUser(AppDbContext db, Guid id, string email)
    {
        db.Users.Add(new User { Id = id, UserName = email, Email = email });
        db.SaveChanges();
    }

    private static Guid SeedProject(AppDbContext db, Guid ownerId)
    {
        var id = Guid.NewGuid();
        db.Projects.Add(new Project
        {
            Id = id,
            UserId = ownerId,
            Name = "Site",
            RepositoryUrl = "https://github.com/acme/site",
            CurrentStatus = "Draft",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        db.SaveChanges();
        return id;
    }

    private static ProjectService CreateService(
        AppDbContext db, FakeS3Service? s3 = null, FakeCloudFrontService? cloudFront = null)
        => new(db, s3 ?? new FakeS3Service(), cloudFront ?? new FakeCloudFrontService(),
            NullLogger<ProjectService>.Instance);

    [Fact]
    public async Task CreateProject_persists_with_draft_status()
    {
        using var sut = new SqliteInMemoryDatabase();
        using (var seed = sut.CreateContext()) SeedUser(seed, OwnerId, "owner@example.com");

        ProjectResponse result;
        using (var db = sut.CreateContext())
        {
            result = await CreateService(db).CreateProjectAsync(
                OwnerId, new CreateProjectRequest("My Site", "https://github.com/acme/site"));
        }

        Assert.Equal("Draft", result.CurrentStatus);
        Assert.Equal("My Site", result.Name);
        using var verify = sut.CreateContext();
        Assert.Single(verify.Projects.ToList());
    }

    [Fact]
    public async Task CreateProject_rejects_a_blank_name()
    {
        using var sut = new SqliteInMemoryDatabase();
        using var db = sut.CreateContext();

        await Assert.ThrowsAsync<ValidationException>(() => CreateService(db)
            .CreateProjectAsync(OwnerId, new CreateProjectRequest("   ", "https://github.com/acme/site")));
    }

    [Theory]
    [InlineData("http://github.com/acme/site")] // not HTTPS
    [InlineData("https://gitlab.com/acme/site")] // not github.com
    [InlineData("not-a-url")]
    public async Task CreateProject_rejects_a_non_github_https_repository(string url)
    {
        using var sut = new SqliteInMemoryDatabase();
        using var db = sut.CreateContext();

        await Assert.ThrowsAsync<ValidationException>(() => CreateService(db)
            .CreateProjectAsync(OwnerId, new CreateProjectRequest("Site", url)));
    }

    [Fact]
    public async Task GetProject_treats_another_users_project_as_not_found()
    {
        using var sut = new SqliteInMemoryDatabase();
        Guid projectId;
        using (var seed = sut.CreateContext())
        {
            SeedUser(seed, OwnerId, "owner@example.com");
            projectId = SeedProject(seed, OwnerId);
        }

        using var db = sut.CreateContext();

        // Cross-tenant access is reported as NotFound so existence is not leaked.
        await Assert.ThrowsAsync<NotFoundException>(
            () => CreateService(db).GetProjectAsync(OtherUserId, projectId));
    }

    [Fact]
    public async Task DeleteProject_removes_the_record_even_when_storage_cleanup_fails()
    {
        using var sut = new SqliteInMemoryDatabase();
        Guid projectId;
        using (var seed = sut.CreateContext())
        {
            SeedUser(seed, OwnerId, "owner@example.com");
            projectId = SeedProject(seed, OwnerId);
        }

        var s3 = new FakeS3Service { ThrowOnDelete = true };
        using (var db = sut.CreateContext())
        {
            await CreateService(db, s3).DeleteProjectAsync(OwnerId, projectId);
        }

        Assert.Equal(1, s3.DeleteCalls); // cleanup was attempted...
        using var verify = sut.CreateContext();
        Assert.Empty(verify.Projects.ToList()); // ...and the record was deleted anyway
    }
}
