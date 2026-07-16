using HostingPlatform.Api.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HostingPlatform.Api.Tests;

public class DataProtectionPersistenceTests
{
    // Proves the key ring is persisted to the database and shared across process
    // lifetimes: a payload protected by one provider instance can be unprotected by
    // a completely separate provider instance backed by the same database. Before
    // the fix (default in-memory keys) the second instance would generate its own
    // keys and fail to unprotect — which is exactly the "logged out on every
    // restart" bug this change fixes.
    [Fact]
    public void Key_ring_persisted_to_db_is_shared_across_provider_instances()
    {
        using var db = new SqliteInMemoryDatabase();

        string payload;
        using (var services = BuildProviderServices(db))
        {
            payload = services.GetRequiredService<IDataProtectionProvider>()
                .CreateProtector("auth-cookie")
                .Protect("user-session-42");
        }

        using (var services = BuildProviderServices(db))
        {
            var recovered = services.GetRequiredService<IDataProtectionProvider>()
                .CreateProtector("auth-cookie")
                .Unprotect(payload);

            Assert.Equal("user-session-42", recovered);
        }
    }

    // A fresh service provider whose Data Protection key ring is backed by the
    // shared in-memory database — mirrors the Program.cs registration.
    private static ServiceProvider BuildProviderServices(SqliteInMemoryDatabase db)
    {
        var services = new ServiceCollection();
        services.AddDbContext<AppDbContext>(options => options.UseSqlite(db.Connection));
        services.AddDataProtection()
            .SetApplicationName("HostingPlatform")
            .PersistKeysToDbContext<AppDbContext>();
        return services.BuildServiceProvider();
    }
}
