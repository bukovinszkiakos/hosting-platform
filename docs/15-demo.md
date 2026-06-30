# 15-demo.md

# Demonstration Guide

How to run and demonstrate the Hosting Platform. For full setup details see the
root [`README.md`](../README.md) and [`scripts/local-dev/README.md`](../scripts/local-dev/README.md).

There are two ways to demo:

- **Local demo** (no AWS) — shows the entire app and the deployment lifecycle up
  to the build step. Recommended for a walkthrough.
- **Full AWS demo** (real EKS/S3/CloudFront) — shows a real build publishing a
  live site. Requires the infrastructure to be provisioned (see "Full AWS demo").

---

# Local demo

## 1. Start everything

```bash
# Database
docker compose -f scripts/local-dev/docker-compose.yml up -d

# Backend (http://localhost:5165, Swagger at /swagger)
cd backend/src/HostingPlatform.Api
dotnet user-secrets set "ConnectionStrings:DefaultConnection" \
  "Host=localhost;Port=5432;Database=hostingplatform;Username=hostingplatform;Password=localdev"
cd .. && dotnet tool restore && \
  dotnet ef database update --project src/HostingPlatform.Api/HostingPlatform.Api.csproj
dotnet run --project src/HostingPlatform.Api

# Frontend (http://localhost:3000) — in a second terminal
cd frontend && npm install && npm run dev
```

Open **http://localhost:3000**.

## 2. Walkthrough script

1. **Landing page** (`/`) — the value proposition, "How It Works", features.
2. **Register** (`/register`) — create an account → auto sign-in → lands on `/home`.
   - Show validation: try a weak password (e.g. `weak`) → inline error list
     (the unified `{message, errors}` contract).
3. **Home** (`/home`) — welcome, quick actions, Getting Started checklist.
4. **Create a project** (`/projects` → New project) — name + a public GitHub URL →
   appears with status **Draft**.
5. **Project details** (`/projects/[id]`) — info card, Edit, deployment history.
6. **Deploy** — click Deploy. The deployment is created and the background worker
   drives it **Pending → Building → Failed** *(locally; see note below)*. Open the
   deployment to show status, timestamps, and the recorded error.
7. **Dashboard** (`/dashboard`) — stat cards (Projects, Deployments, Online
   Projects, Failed Projects).
8. **Profile** (`/profile`) — account info, statistics, edit display name/email.
9. **Admin** (`/admin`) — optional; requires the Admin role (see below). Shows
   platform-wide users, projects, and deployment statistics.

> **Why deployments end in `Failed` locally:** the build runs as a Kubernetes Job,
> which needs a real EKS cluster. Locally the request succeeds and the lifecycle
> runs, but creating the Job fails (no in-cluster config), so the deployment is
> recorded as `Failed` with the reason. This is expected and demonstrates the full
> orchestration + error handling. A real build is shown in the AWS demo.

## 3. Demoing the Admin role

Registration grants the `User` role and there is no self-promotion in the UI.
Promote your account in the local database (local Postgres only):

```bash
PGPASSWORD=localdev psql -h localhost -p 5432 -U hostingplatform -d hostingplatform -c \
"INSERT INTO \"AspNetUserRoles\" (\"UserId\",\"RoleId\") \
 SELECT u.\"Id\", r.\"Id\" FROM \"AspNetUsers\" u, \"AspNetRoles\" r \
 WHERE u.\"Email\"='YOUR_EMAIL' AND r.\"Name\"='Admin' ON CONFLICT DO NOTHING;"
```

Sign out (clear the `HostingPlatform.Auth` cookie) and sign back in, then open `/admin`.

## 4. Known demo caveats

These are tracked in [`14-post-mvp-polish.md`](14-post-mvp-polish.md):

- **No Logout button** in the UI yet — to re-test auth, clear the
  `HostingPlatform.Auth` cookie in DevTools.
- A deployment in `Building` does not auto-refresh; reload to see the final status.

## 5. Reset / stop

```bash
# stop dev servers, then:
docker compose -f scripts/local-dev/docker-compose.yml down      # keep data
docker compose -f scripts/local-dev/docker-compose.yml down -v   # wipe data
```

---

# Full AWS demo (requires a real AWS environment)

This cannot be exercised locally. To show a real build publishing a live site:

1. **Provision infrastructure** (see [`../terraform/README.md`](../terraform/README.md)):
   bootstrap remote state, then `terraform apply` an environment (creates VPC, EKS,
   RDS, S3, CloudFront, IAM + Pod Identity).
2. **Build & push images** for the backend and frontend to ECR; set the image URIs
   in the Kubernetes Deployments.
3. **Apply Kubernetes manifests** (`k8s/`): namespace, the `hosting-platform`
   ServiceAccount, ConfigMap + Secret (from Terraform outputs — see
   `k8s/base/configmap.example.yaml`, `k8s/secrets/secret.example.yaml`),
   Deployments, Services, Ingress, HPAs.
4. **Apply the database schema** to RDS (`dotnet ef database update`, or a one-off
   migration Job) — there is no auto-migrate on startup.
5. **Demo**: open the platform via the ALB Ingress hostname, create a project with a
   real public GitHub repo, click Deploy, and watch it reach **Online**; open the
   generated CloudFront URL (`https://<domain>/<userId>/<projectId>`) to show the
   live site.

> Items requiring real AWS to verify: the build Job (clone → build → `aws s3 sync`
> → CloudFront invalidation), EKS Pod Identity credential resolution, S3
> upload/delete, and CloudFront serving + the index.html rewrite function.
