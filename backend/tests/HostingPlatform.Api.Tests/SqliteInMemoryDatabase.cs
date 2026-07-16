using HostingPlatform.Api.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace HostingPlatform.Api.Tests;

// A throwaway relational database for service tests. SQLite's in-memory database
// lives only as long as its connection is open, so this owns a single open
// connection and hands out fresh AppDbContext instances over it. Using separate
// contexts to seed, act and assert avoids EF change-tracking hiding persistence
// bugs (the "assert" context reads what was actually written).
//
// Testcontainers/Postgres is intentionally not used at this stage: the model has
// no Postgres-specific mapping, so SQLite faithfully exercises the LINQ queries
// and relational behaviour these tests assert. See the strategy on issue #50.
public sealed class SqliteInMemoryDatabase : IDisposable
{
    private readonly SqliteConnection _connection;

    public SqliteInMemoryDatabase()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        using var context = CreateContext();
        context.Database.EnsureCreated();
    }

    public AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;

        return new AppDbContext(options);
    }

    public void Dispose() => _connection.Dispose();
}
