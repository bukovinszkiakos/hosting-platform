using HostingPlatform.Api.Configuration;
using HostingPlatform.Api.Data;
using HostingPlatform.Api.Entities;
using HostingPlatform.Api.Extensions;
using HostingPlatform.Api.Middleware;
using HostingPlatform.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<AwsSettings>(builder.Configuration.GetSection("AWS"));
builder.Services.Configure<AuthenticationSettings>(builder.Configuration.GetSection("Authentication"));

var authSettings = builder.Configuration.GetSection("Authentication").Get<AuthenticationSettings>()
    ?? new AuthenticationSettings();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddIdentity<User, IdentityRole<Guid>>(options =>
    {
        options.User.RequireUniqueEmail = true;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = string.IsNullOrWhiteSpace(authSettings.CookieName)
        ? "HostingPlatform.Auth"
        : authSettings.CookieName;
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = builder.Environment.IsProduction()
        ? CookieSecurePolicy.Always
        : CookieSecurePolicy.SameAsRequest;
    options.ExpireTimeSpan = TimeSpan.FromDays(authSettings.ExpireDays);
    options.SlidingExpiration = true;

    // JSON API: return status codes instead of redirecting to a login/access-denied page.
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        context.Response.ContentType = "application/json";
        return context.Response.WriteAsync("{\"message\":\"Unauthorized\",\"errors\":[]}");
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        context.Response.ContentType = "application/json";
        return context.Response.WriteAsync("{\"message\":\"Forbidden\",\"errors\":[]}");
    };
});

builder.Services.AddAuthorization();

builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IProfileService, ProfileService>();
builder.Services.AddScoped<IProjectService, ProjectService>();
builder.Services.AddScoped<IDeploymentService, DeploymentService>();

// In-process build orchestration: deployments are queued on creation and driven
// through their lifecycle by a background worker (docs/10 "Deployment Orchestration").
builder.Services.AddSingleton<IDeploymentQueue, DeploymentQueue>();
builder.Services.AddHostedService<DeploymentBuildWorker>();
builder.Services.AddScoped<IDashboardService, DashboardService>();
builder.Services.AddScoped<IAdminService, AdminService>();

// Stateless build Job specification generator (Task 25); consumed by the
// Kubernetes Job creation service in Task 26.
builder.Services.AddSingleton<IBuildJobSpecFactory, BuildJobSpecFactory>();
builder.Services.AddScoped<IKubernetesJobService, KubernetesJobService>();

builder.Services.AddKubernetesClient();

builder.Services.AddS3Client();
builder.Services.AddScoped<IS3Service, S3Service>();

builder.Services.AddCloudFrontClient();
builder.Services.AddScoped<ICloudFrontService, CloudFrontService>();

builder.Services.AddControllers();

// Minimal liveness/readiness signal. Mapped anonymously at /healthz below; used by
// the Kubernetes probes and the ALB target-group health check (see
// docs/07-kubernetes.md "Health Checks").
builder.Services.AddHealthChecks();

// Make automatic model validation / binding 400s return the documented
// { message, errors[] } shape instead of the default RFC7807 ProblemDetails, so
// the error contract is identical to ValidationException (see GlobalExceptionMiddleware
// and docs/08-api.md, docs/12 "Validation Errors").
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var errors = context.ModelState
            .SelectMany(entry => entry.Value!.Errors)
            .Select(error => string.IsNullOrWhiteSpace(error.ErrorMessage)
                ? "The request is invalid."
                : error.ErrorMessage)
            .Distinct()
            .ToArray();

        return new BadRequestObjectResult(new { message = "Validation failed", errors });
    };

    // Don't wrap other framework client errors (e.g. 415 Unsupported Media Type)
    // in ProblemDetails either; keep responses free of the RFC7807 shape.
    options.SuppressMapClientErrors = true;
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// One-off database migration mode: `dotnet HostingPlatform.Api.dll migrate` applies
// any pending EF Core migrations and exits WITHOUT starting the web server. It is run
// by the database migration Job before the app rolls out (see k8s/jobs/migrate-job.yaml
// and docs/16-deployment.md "Database migrations"). Normal startup never migrates
// automatically — schema changes are applied only by this explicit, single-run step,
// so pods never race to migrate and the schema is guaranteed to exist before the app
// (which seeds Identity roles on startup) begins serving.
if (args.Contains("migrate"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    return;
}

await app.SeedRolesAsync();

app.UseMiddleware<GlobalExceptionMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthentication();
app.UseAuthorization();

// Anonymous health endpoint (no authentication) for Kubernetes probes and the ALB
// health check. Returns 200 when the app is up.
app.MapHealthChecks("/healthz").AllowAnonymous();

app.MapControllers();

app.Run();
