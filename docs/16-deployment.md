# 16-deployment.md

# Deployment

How the platform is deployed to AWS. Two workflows exist under
`.github/workflows/`:

* **`ci.yml`** — Continuous Integration (build/lint/validate) on every push and
  pull request. See `11-repository-structure.md`.
* **`deploy.yml`** — Continuous **Deployment**, **manual only**
  (`workflow_dispatch`). It deploys the **application** to an already-provisioned
  EKS cluster. It never runs automatically.

Deployment is deliberately split into a **one-time manual bootstrap** (provision
infrastructure, build images, install cluster add-ons, create config/secret) and
a **repeatable automated app deploy** (`deploy.yml`). Infrastructure provisioning
is not automated: `terraform apply` is state-sensitive and high-blast-radius, so
it stays a deliberate manual operation run by an operator who controls the state.

---

# Deployment order

```text
Bootstrap (manual, one-time / infrequent)
  1. Terraform remote state           (terraform/backend/, then enable the S3 backend)
  2. terraform apply <environment>    (VPC, EKS, RDS, S3, CloudFront, IAM + Pod Identity)
  3. AWS Load Balancer Controller     (Helm install; uses the Terraform-provisioned role)
  4. ACM certificate                  (for ALB HTTPS; requires a domain)
  5. Build & push images to ECR       (backend + frontend)
  6. Create ConfigMap + Secret        (from Terraform outputs; see the *.example.yaml)
  7. Apply the database schema         (dotnet ef / one-off migration Job)

Repeatable (automated — deploy.yml, workflow_dispatch)
  8. Apply namespace / service account / RBAC
  9. Apply Services + Deployments (with the supplied image URIs) + frontend HPA
 10. Wait for the rollout
 11. Apply the Ingress (ACM cert injected from a secret)
 12. Print a deployment summary
```

The application deploy (steps 8–12) is what `deploy.yml` automates. Steps 1–7 are
the manual bootstrap described below.

---

# Required GitHub Secrets

Set these at the repository level, or (preferred) on the `dev` / `prod` GitHub
**Environments** so production can require a reviewer:

| Secret | Purpose |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | IAM credentials the workflow deploys with |
| `AWS_SECRET_ACCESS_KEY` | " |
| `AWS_REGION` | AWS region of the cluster (e.g. `eu-central-1`) |
| `ACM_CERTIFICATE_ARN` | ACM certificate ARN injected into the ALB Ingress for HTTPS |

The workflow validates all four are present before doing anything and fails early
with a clear message if any is missing. The IAM principal needs permission to
`eks:DescribeCluster` / update kubeconfig and to act on the cluster (map it to a
Kubernetes group with the needed RBAC, e.g. via an access entry or `aws-auth`).

> **Security note (future hardening):** the workflow uses long-lived access keys
> via GitHub Secrets, as requested. The recommended production approach is GitHub
> OIDC federation (`aws-actions/configure-aws-credentials` with `role-to-assume`
> and an IAM OIDC provider), which removes stored long-lived keys. This is
> deferred because it requires an IAM OIDC provider + role that are not yet in
> Terraform.

---

# Bootstrap requirements (manual, one-time)

These are performed once per AWS account/environment before the first `deploy.yml`
run. They are intentionally **not** automated (state safety, external
dependencies, and image build/publish being a deliberate operator step — no
automated image publishing pipeline yet).

1. **Terraform remote state** — apply `terraform/backend/` with local state to
   create the state bucket, then uncomment the `backend "s3"` block in the
   environment and `terraform init -migrate-state` (see `06-terraform.md`
   "Enablement Sequence"). Remote state must be active before any real
   `terraform apply`.
2. **Provision infrastructure** — `terraform apply` the environment
   (`terraform/environments/<env>`), providing `TF_VAR_db_password`. Record the
   outputs (`terraform output`): `eks_cluster_name`, `s3_bucket_name`,
   `cloudfront_distribution_id`, `cloudfront_domain_name`, `rds_database_endpoint`.
3. **AWS Load Balancer Controller** — install via Helm into `kube-system`; it uses
   the IAM role Terraform created (Pod Identity). Without it the Ingress cannot
   create an ALB (see `07-kubernetes.md` "Ingress").
4. **ACM certificate** — request/validate an ACM certificate for your domain and
   put its ARN in the `ACM_CERTIFICATE_ARN` secret (the ALB terminates HTTPS;
   Secure cookies require it).
5. **Container images** — the backend and frontend are containerized in-repo via
   `backend/Dockerfile` and `frontend/Dockerfile` (see "Container images" below).
   Build both images, push them to a registry (ECR intended), then pass the image
   URIs as `deploy.yml` inputs. Creating the ECR repositories and pushing the
   images are still manual: no ECR resource is defined in Terraform and no
   automated image build/push pipeline exists yet (both are future enhancements).
6. **ConfigMap + Secret** — create `backend-config` / `frontend-config` and
   `backend-secrets` in the `hosting-platform` namespace from the Terraform
   outputs and the DB connection string, using
   `k8s/base/configmap.example.yaml` and `k8s/secrets/secret.example.yaml` as
   templates. `deploy.yml` verifies these exist and fails early if not.
7. **Database schema** — RDS lives in private subnets and there is no
   auto-migrate on startup, so apply migrations manually (`dotnet ef database
   update` via a bastion/port-forward, or a one-off in-cluster migration Job).

---

# Container images

Both applications ship as container images built from multi-stage Dockerfiles that
live next to their source:

```text
backend/Dockerfile     +  backend/.dockerignore
frontend/Dockerfile    +  frontend/.dockerignore
```

## Architecture

Both images use a **multi-stage** build: a heavy build stage compiles the app, and
a minimal runtime stage carries only the published output. Both run as a
**non-root** user and expose the same ports the Kubernetes manifests and Services
expect, so the images are drop-in for `k8s/backend` and `k8s/frontend`.

* **Backend** (`backend/Dockerfile`)
  * *Build stage* — `mcr.microsoft.com/dotnet/sdk:8.0` restores (project file
    first, for layer caching) and `dotnet publish -c Release` (framework-dependent,
    `UseAppHost=false`).
  * *Runtime stage* — `mcr.microsoft.com/dotnet/aspnet:8.0-jammy-chiseled-extra`,
    a minimal, shell-less, non-root image (`USER $APP_UID`, uid 1654). The
    `-extra` variant bundles ICU + tzdata so culture-sensitive behaviour matches a
    normal machine (the plain chiseled image would silently switch to
    globalization-invariant mode).
  * *Port* — Kestrel listens on **8080** (the .NET 8 container default), matching
    `k8s/backend/deployment.yaml` (`containerPort: 8080`) and `service.yaml`
    (`targetPort: 8080`). Entrypoint: `dotnet HostingPlatform.Api.dll`.

* **Frontend** (`frontend/Dockerfile`)
  * Uses Next.js **standalone output** (`output: "standalone"` in
    `next.config.ts`): `next build` traces only the files and dependencies the
    server needs into `.next/standalone`, so the runtime image ships a small
    self-contained server instead of the full dependency tree.
  * *Stages* — `deps` (`npm ci`, cached on lockfile), `build` (`npm run build`),
    `final` (`node:20-alpine`, runs as the non-root `node` user, copies only
    `public/`, `.next/standalone` and `.next/static`).
  * *Port* — the standalone server binds `0.0.0.0:3000` (`ENV HOSTNAME=0.0.0.0`,
    `ENV PORT=3000`), matching `k8s/frontend/deployment.yaml` (`containerPort:
    3000`) and `service.yaml` (`targetPort: 3000`). Start command: `node server.js`.

## Local build commands

```bash
# From the repository root. The build context is each app's own directory.
docker build -t hosting-platform-backend:local  backend/
docker build -t hosting-platform-frontend:local frontend/

# Optional smoke test (no AWS needed):
#   frontend — serves on http://localhost:3000
docker run --rm -p 3000:3000 hosting-platform-frontend:local
#   backend  — needs a reachable Postgres and the schema applied; then GET /healthz -> 200
docker run --rm -p 8080:8080 \
  -e ASPNETCORE_ENVIRONMENT=Production \
  -e "ConnectionStrings__DefaultConnection=Host=<host>;Port=5432;Database=hostingplatform;Username=<u>;Password=<p>" \
  hosting-platform-backend:local
```

The images take **no build-time configuration**: all runtime config comes from the
environment (the backend reads `ASPNETCORE_ENVIRONMENT`, the connection string and
`AWS__*` from the ConfigMap/Secret; the frontend uses same-origin `/api`). To tag
for ECR, retag the built image with the ECR URI and push (repo creation + push are
manual — see bootstrap step 5).

## Assumptions and limitations

* **`output: "standalone"` was added to `next.config.ts`.** It is a packaging
  option only — routing, rewrites and rendering are unchanged.
* **No image optimization dependency (`sharp`) is bundled.** The app does not rely
  on server-side `next/image` optimization; if that changes, add `sharp` and
  rebuild.
* **Data Protection keys are ephemeral in the container** (no key persistence
  configured), consistent with the documented single-replica MVP behaviour
  (`07-kubernetes.md` "Backend Replicas"): a restart logs users out.
* The images are **framework-dependent** (not self-contained / trimmed / ReadyToRun)
  to keep the build simple and avoid altering runtime behaviour.

---

# Running a deployment

Actions → **Deploy (manual)** → *Run workflow*, then provide:

* **environment** — `dev` or `prod`
* **backend_image** — full image URI (e.g. `…dkr.ecr.<region>.amazonaws.com/hosting-platform-backend:<tag>`)
* **frontend_image** — full image URI

The workflow configures kubectl for `hosting-platform-<env>-eks`, applies the
manifests, waits for the backend and frontend rollouts, applies the Ingress, and
writes a summary (including the ALB hostname once provisioned).

---

# Rollback strategy

* **Fast rollback** — `kubectl -n hosting-platform rollout undo deployment/backend`
  (and `deployment/frontend`) reverts to the previous ReplicaSet/image.
* **Re-deploy a known-good image** — re-run `deploy.yml` with the previous image
  URIs.
* **Infrastructure** — Terraform changes are reverted manually (revert the code
  and `terraform apply`, or restore from the RDS final snapshot for the database).
  Production RDS has `deletion_protection` and a final snapshot (see
  `06-terraform.md`).

---

# Limitations

* **App deploy only.** `deploy.yml` does not provision infrastructure, build
  images, install the load balancer controller, create the ConfigMap/Secret, or
  run migrations — those are the manual bootstrap above.
* **Long-lived AWS keys** (OIDC recommended later — see the security note).
* **Single-replica backend.** The backend has no HPA (in-memory queue +
  ephemeral Data Protection keys); see `07-kubernetes.md` "Backend Replicas".
* **Migrations are manual** and must be applied before/with a deploy that changes
  the schema.
* **Verified locally by structure only.** The workflow's live behavior (kubectl
  access, ALB provisioning, rollout) can only be confirmed against a real cluster.
