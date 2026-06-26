namespace HostingPlatform.Api.Configuration;

public class AuthenticationSettings
{
    public string CookieName { get; set; } = string.Empty;
    public int ExpireDays { get; set; } = 7;
}
