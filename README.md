# Hosting Platform

A SaaS static-website hosting platform: a user connects a public GitHub
repository, clicks Deploy, and the site is built in a Kubernetes Job and
published to S3 + CloudFront. See [`docs/`](docs/) for the full, authoritative
specification (the `docs` directory is the source of truth).

- Backend: .NET 8 / ASP.NET Core Web API, EF Core, ASP.NET Core Identity, PostgreSQL
- Frontend: Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui
- Infrastructure: Terraform, AWS (EKS, RDS, S3, CloudFront), Kubernetes

To run a guided demo (local walkthrough + full AWS demo steps), see
[`docs/15-demo.md`](docs/15-demo.md).

## Prerequisites

- .NET 8 SDK
- Node.js 20+
- Docker (for the local PostgreSQL container)

## Run locally (clean checkout)

### 1. Start PostgreSQL

```bash
docker compose -f scripts/local-dev/docker-compose.yml up -d
```

### 2. Backend (http://localhost:5165)

```bash
cd backend/src/HostingPlatform.Api

# Connection string is kept out of the repo via user-secrets (UserSecretsId is
# already set in the .csproj, so `dotnet user-secrets init` is not needed).
dotnet user-secrets set "ConnectionStrings:DefaultConnection" \
  "Host=localhost;Port=5432;Database=hostingplatform;Username=hostingplatform;Password=localdev"

# Apply EF Core migrations (from backend/)
cd ..
dotnet tool restore
dotnet ef database update --project src/HostingPlatform.Api/HostingPlatform.Api.csproj

# Run the API (Development profile, Swagger at /swagger)
dotnet run --project src/HostingPlatform.Api
```

More detail: [`scripts/local-dev/README.md`](scripts/local-dev/README.md).

### 3. Frontend (http://localhost:3000)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The Next dev server proxies `/api/*` to the backend
(`http://localhost:5165` by default; override with `BACKEND_ORIGIN`), so the app
uses same-origin requests and **no CORS configuration is required** — the same
model as production, where the ALB ingress routes `/api` to the backend. If your
backend runs on a different port, set `BACKEND_ORIGIN` before `npm run dev`.

## What works locally vs. what needs AWS

Everything except the actual build runs locally: registration, login/session
cookies, projects, dashboard, profile, admin, and the deployment lifecycle
(status transitions, log storage).

Starting a deployment **enqueues** it and the background worker drives it, but
creating the build Kubernetes Job requires a real EKS cluster. Locally a
deployment therefore progresses `Pending -> Building -> Failed`, with the
in-cluster-config error recorded on the deployment. To exercise a real build,
deploy the backend into EKS (see `docs/07-kubernetes.md` and `docs/10-deployment-workflow.md`).

## Configuration

| Where | Setting | Local | Production |
| --- | --- | --- | --- |
| Backend | `ConnectionStrings:DefaultConnection` | user-secrets | Kubernetes Secret |
| Backend | `AWS:Region` / `BucketName` / `CloudFrontDistributionId` / `CloudFrontDomain` | unset (build needs a cluster) | ConfigMap, from Terraform outputs |
| Frontend | `BACKEND_ORIGIN` (dev proxy target) | `http://localhost:5165` | n/a (ingress routes `/api`) |

Example Kubernetes ConfigMap/Secret are in
[`k8s/base/configmap.example.yaml`](k8s/base/configmap.example.yaml) and
[`k8s/secrets/secret.example.yaml`](k8s/secrets/secret.example.yaml).

## Infrastructure

Terraform lives in [`terraform/`](terraform/) (dev + prod environments). Validate
locally with `terraform fmt` and `terraform validate`; see
[`terraform/README.md`](terraform/README.md). Applying infrastructure requires AWS
credentials and is out of scope for local development.

## Tests / checks

```bash
# Backend
cd backend && dotnet build

# Frontend
cd frontend && npm run lint && npx tsc --noEmit && npm run build

# Terraform
cd terraform && terraform fmt -recursive -check
(cd environments/dev && terraform init -backend=false && terraform validate)
```
