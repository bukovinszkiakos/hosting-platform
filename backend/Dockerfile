# Multi-stage production image for the ASP.NET Core Web API.
# Build context is the backend/ directory:  docker build -t hosting-platform-backend backend/
#
# Stage 1 (build): the full .NET 8 SDK restores and publishes the app.
# Stage 2 (final): the app is copied onto the chiseled ASP.NET runtime — a
# minimal, non-root, shell-less image (smallest official production base). The
# "-extra" variant bundles ICU + tzdata so culture-sensitive behaviour is
# identical to a normal machine (the plain chiseled image would fall back to
# globalization-invariant mode and change behaviour).

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore first, using only the project file, so the restore layer is cached and
# reused when only source files change.
COPY src/HostingPlatform.Api/HostingPlatform.Api.csproj src/HostingPlatform.Api/
RUN dotnet restore src/HostingPlatform.Api/HostingPlatform.Api.csproj

# Copy the rest of the source and publish a framework-dependent build.
# UseAppHost=false skips the native launcher; the app is started via `dotnet <dll>`.
COPY src/ src/
RUN dotnet publish src/HostingPlatform.Api/HostingPlatform.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false

# ---------------------------------------------------------------------------
# Final (runtime) stage
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:8.0-jammy-chiseled-extra AS final
WORKDIR /app

COPY --from=build /app/publish .

# Run as the non-root user that the .NET base image provides (APP_UID=64198).
USER $APP_UID

# Kestrel listens on 8080 by default in the .NET 8 container images, matching
# k8s/backend/deployment.yaml (containerPort 8080) and service.yaml (targetPort 8080).
EXPOSE 8080

ENTRYPOINT ["dotnet", "HostingPlatform.Api.dll"]
