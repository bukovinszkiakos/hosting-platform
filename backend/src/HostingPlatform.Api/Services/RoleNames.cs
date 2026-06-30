namespace HostingPlatform.Api.Services;

// The platform's role names and how a user's role set is projected to the single
// "role" the API exposes (CurrentUserResponse, ProfileResponse, AdminUserResponse).
// A user always has the "User" role and may additionally have "Admin"; the display
// role uses Admin precedence so an admin is correctly shown — and gated in the UI —
// as "Admin" rather than whichever role happens to come first.
public static class RoleNames
{
    public const string User = "User";
    public const string Admin = "Admin";

    public static string Primary(IEnumerable<string> roles) =>
        roles.Contains(Admin) ? Admin : roles.FirstOrDefault() ?? string.Empty;
}
