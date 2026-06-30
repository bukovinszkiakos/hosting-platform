# Local Development

This directory contains tooling for running the Hosting Platform locally.

## PostgreSQL (Docker Compose)

Local development uses a **PostgreSQL 16** container. This is a development
convenience only — it is **not** part of the production architecture. Production
uses Amazon RDS PostgreSQL (see `docs/05-aws-architecture.md`), provisioned via
Terraform. The application is unaware of how PostgreSQL is hosted: it reads the
connection string from `ConnectionStrings:DefaultConnection`, which comes from
`dotnet user-secrets` locally and from a Kubernetes Secret in production.

To avoid drift, production should run the same PostgreSQL major version (16).

### Start / stop

```bash
# Start (from the repository root)
docker compose -f scripts/local-dev/docker-compose.yml up -d

# Stop (keeps data)
docker compose -f scripts/local-dev/docker-compose.yml down

# Stop and delete all data
docker compose -f scripts/local-dev/docker-compose.yml down -v
```

The container exposes PostgreSQL on `localhost:5432` with database, user, and
password all set for local development only:

| Setting  | Value            |
| -------- | ---------------- |
| Database | `hostingplatform`|
| User     | `hostingplatform`|
| Password | `localdev`       |

## Backend connection string (user-secrets)

The connection string is stored outside the repository via .NET user-secrets so
it is never committed:

```bash
cd backend/src/HostingPlatform.Api
# UserSecretsId is already set in the .csproj, so `dotnet user-secrets init` is not needed.
dotnet user-secrets set "ConnectionStrings:DefaultConnection" \
  "Host=localhost;Port=5432;Database=hostingplatform;Username=hostingplatform;Password=localdev"
```

## Applying migrations

With the container running and the connection string set:

```bash
cd backend
dotnet tool restore        # restores the pinned dotnet-ef tool (first time only)
dotnet ef database update --project src/HostingPlatform.Api/HostingPlatform.Api.csproj
```

## Running the backend

```bash
# From backend/ — Development profile, Swagger UI at http://localhost:5165/swagger
dotnet run --project src/HostingPlatform.Api
```

Roles (`User`, `Admin`) are seeded at startup, so the API needs the database to
be running and migrated before it will start.

## Running the frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

The Next dev server proxies `/api/*` to the backend (default
`http://localhost:5165`, override with `BACKEND_ORIGIN`), so the browser only
talks to `:3000` and no CORS setup is required. This mirrors production, where
the ALB ingress routes `/api` to the backend.

## What needs a real cluster

Everything except the actual build runs locally. Starting a deployment enqueues
it and the background worker drives the status lifecycle, but creating the build
Kubernetes Job requires a real EKS cluster — so locally a deployment progresses
`Pending -> Building -> Failed` (the in-cluster-config error is recorded on the
deployment). This is expected outside a cluster.
