using Microsoft.AspNetCore.Identity;

namespace HostingPlatform.Api.Extensions;

public static class IdentitySeedExtensions
{
    // Roles defined in docs/12 (Authorization). Seeded so that registration,
    // which assigns the "User" role, succeeds on a fresh database.
    private static readonly string[] Roles = ["User", "Admin"];

    public static async Task SeedRolesAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();

        foreach (var role in Roles)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole<Guid>(role));
            }
        }
    }
}
