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

## Quick Start — deploy to AWS

Four commands run the whole platform lifecycle. Prerequisites: `aws` (authenticated),
`terraform` ≥ 1.11, `kubectl`, `helm`, `docker` (with buildx), and the GitHub CLI
`gh` (`gh auth login`). The Terraform remote-state bucket must already exist
(`scripts/terraform/bootstrap-remote-state.sh` — one-time).

```bash
git clone <repo> && cd hosting-platform

# 1. Deploy everything (empty account → live platform). First run only: you are
#    prompted once for a DB master password, stored write-once in SSM Parameter
#    Store (SecureString) and reused automatically on every later run.
scripts/deployment/up.sh dev

# 2. Daily loop — ship a code change (build+push new image, redeploy, verify):
scripts/deployment/up.sh dev --app

# 3. Check health / find the public URL:
scripts/deployment/status.sh dev

# 4. Tail logs (backend | frontend | migrations | build --latest):
scripts/deployment/logs.sh backend

# 5. Tear it all down (no manual AWS cleanup):
scripts/deployment/destroy.sh dev
```

`up.sh` orchestrates the documented bootstrap end-to-end — `terraform apply`,
the ALB controller, image build/push, config, the EKS access entry, triggering
`deploy.yml`, waiting for the ALB, and the second `terraform apply` that creates
the platform CloudFront distribution — then prints the public URL. Terraform
stays the infrastructure source of truth and GitHub Actions stays the deploy
mechanism; `up.sh` only sequences them. See
[`docs/16-deployment.md`](docs/16-deployment.md) for the full internals, the SSM
password design, and `alb_dns_name.auto.tfvars`.

> 💸 Idle `dev` costs ~$210/mo. Run `scripts/deployment/destroy.sh dev` when done.

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

## Continuous Integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs these same checks on
every push and pull request, as four parallel jobs: **backend** (restore +
build), **frontend** (ESLint + `tsc --noEmit` + build), **terraform** (`fmt
-check` + `validate` for the backend/dev/prod configs), and **kubernetes**
(`kubeconform` schema validation of `k8s/`). NuGet and npm downloads are cached.
CI is build/validate only. Deployment is a separate, **manual** workflow.

## Deployment

The supported path is the [Quick Start](#quick-start--deploy-to-aws) above:
`scripts/deployment/up.sh dev` orchestrates the whole bootstrap, and
`destroy.sh dev` tears it down. Under the hood, the application deploy itself is
a manual (`workflow_dispatch`) GitHub Actions workflow
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) that applies the
Kubernetes manifests to the EKS cluster and waits for the rollout — `up.sh`
triggers and watches it. The platform is served over HTTPS on its CloudFront
distribution's default `*.cloudfront.net` domain (no custom domain required).

See [`docs/16-deployment.md`](docs/16-deployment.md) for the full process — the
`up.sh` phases, the SSM write-once password design, `alb_dns_name.auto.tfvars`,
required GitHub Secrets, deployment order, rollback, and limitations.
