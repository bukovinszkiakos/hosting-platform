using System.Security.Claims;
using HostingPlatform.Api.DTOs;
using HostingPlatform.Api.Entities;
using HostingPlatform.Api.Exceptions;
using Microsoft.AspNetCore.Identity;

namespace HostingPlatform.Api.Services;

public class AuthService : IAuthService
{
    // Default role assigned to newly registered users. The "User" and "Admin"
    // roles are seeded separately (see Task 16). A shared role constants type can
    // be introduced when admin authorization is implemented.
    private const string DefaultRole = "User";

    private readonly UserManager<User> _userManager;
    private readonly SignInManager<User> _signInManager;

    public AuthService(UserManager<User> userManager, SignInManager<User> signInManager)
    {
        _userManager = userManager;
        _signInManager = signInManager;
    }

    public async Task RegisterAsync(RegisterRequest request)
    {
        var user = new User
        {
            UserName = request.Email,
            Email = request.Email,
            DisplayName = request.DisplayName,
            CreatedAt = DateTime.UtcNow
        };

        var result = await _userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            throw new ValidationException(result.Errors.Select(e => e.Description));
        }

        var roleResult = await _userManager.AddToRoleAsync(user, DefaultRole);
        if (!roleResult.Succeeded)
        {
            // Missing role is a server-side misconfiguration, not a user error.
            throw new InvalidOperationException(
                "Failed to assign default role: " +
                string.Join(", ", roleResult.Errors.Select(e => e.Description)));
        }
    }

    public async Task LoginAsync(LoginRequest request)
    {
        // UserName equals Email, so sign in by the provided email. A failed result
        // is returned uniformly to avoid revealing whether the email exists.
        var result = await _signInManager.PasswordSignInAsync(
            request.Email, request.Password, isPersistent: true, lockoutOnFailure: false);

        if (!result.Succeeded)
        {
            throw new UnauthorizedException("Invalid email or password");
        }
    }

    public Task LogoutAsync() => _signInManager.SignOutAsync();

    public async Task<CurrentUserResponse> GetCurrentUserAsync(ClaimsPrincipal principal)
    {
        var user = await _userManager.GetUserAsync(principal);
        if (user is null)
        {
            throw new UnauthorizedException();
        }

        var roles = await _userManager.GetRolesAsync(user);

        return new CurrentUserResponse(
            user.Id,
            user.DisplayName,
            user.Email ?? string.Empty,
            roles.FirstOrDefault() ?? string.Empty);
    }
}
