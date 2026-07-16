using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using HostingPlatform.Api.Entities;

namespace HostingPlatform.Api.Data;

// Implements IDataProtectionKeyContext so the ASP.NET Data Protection key ring is
// persisted to this database (see Program.cs PersistKeysToDbContext). Without a
// persistent key ring the keys are regenerated on every container start, which
// invalidates all issued auth cookies on each deploy/restart.
public class AppDbContext : IdentityDbContext<User, IdentityRole<Guid>, Guid>, IDataProtectionKeyContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Deployment> Deployments => Set<Deployment>();
    public DbSet<DeploymentLog> DeploymentLogs => Set<DeploymentLog>();

    // Backing store for the Data Protection key ring.
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
    }
}
