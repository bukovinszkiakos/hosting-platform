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

# One-command deploy (`up.sh`)

`scripts/deployment/up.sh <env>` is the **official supported workflow**. It
**orchestrates** the bootstrap steps below in the required order with real waits
and fail-fast handling — it does not replace them: Terraform stays the
infrastructure source of truth and `deploy.yml` stays the deployment mechanism;
`up.sh` only sequences them. It reuses `install-alb-controller.sh` and
`bootstrap-config.sh` rather than duplicating their logic.

Phases: **0** preflight (tools, AWS auth, region, state bucket, DB password) →
**1** `terraform apply` (infra) → **2** ALB controller → **3** build+push images
(tagged by git SHA; skipped if the tag already exists) → **4** ConfigMaps+Secret
→ **5** verify the Terraform-managed OIDC deploy-role access entry → **6** trigger+watch
`deploy.yml` (via `gh`; prints manual dispatch if `gh` is absent) → **7** wait
for the ALB → **8** second `terraform apply` (platform CloudFront) → **9** verify
+ summary (prints the public URL). It is **idempotent** — re-running after a
failure resumes cleanly; there is no rollback (nothing is auto-destroyed).

* **`up.sh dev`** — full bootstrap, empty account → live platform.
* **`up.sh dev --app`** — application-only redeploy (build+push a new image,
  trigger `deploy.yml`, verify); skips infra/controller/config/CloudFront. Errors
  out if the environment does not already exist.

Prerequisites: `aws`, `terraform` ≥ 1.11, `kubectl`, `helm`, `docker` (buildx),
and `gh` (authenticated) for the fully-automated Phase 6.

Companion commands: `status.sh <env>` (health dashboard + public URL),
`logs.sh <backend|frontend|migrations|build --latest>`, `destroy.sh <env>`.

## Database password (SSM Parameter Store, write-once)

The RDS master password is stored **once** in **SSM Parameter Store as a
`SecureString`** at `/hosting-platform/<env>/db_password` — the canonical source
of truth. On the first `up.sh` run (no parameter yet) you are prompted once and
the value is created **write-once** (`put-parameter` **without** `--overwrite`,
so an existing parameter is never modified). On every later run `up.sh` reads it
back and injects the same value into both Terraform (`TF_VAR_db_password`) and
`bootstrap-config.sh` (`DB_PASSWORD`) — read once per run, never exported into
your interactive shell, never written to disk or Git.

The RDS instance uses `lifecycle { ignore_changes = [password] }`, so a
`terraform apply` can **never** silently reset the live master password (even if
the SSM value were tampered with). Consequence: password **rotation is a
deliberate out-of-band runbook** (change it in RDS → update the SSM parameter →
`bootstrap-config.sh` → restart the backend), never a side effect of apply. Cost
is $0 (standard-tier SecureString + the free AWS-managed `aws/ssm` KMS key).

## `alb_dns_name.auto.tfvars` (machine-managed)

The two-phase apply's ALB hostname lives in
`terraform/environments/<env>/alb_dns_name.auto.tfvars`, which Terraform
auto-loads and `up.sh` writes: empty in Phase 1 (so the platform CloudFront
module is skipped before the ALB exists) and the discovered hostname in Phase 8.
It is **gitignored** — the human-edited `terraform.tfvars` stays clean and the
machine-managed value never lands in Git. Do not edit `terraform.tfvars`'s
`alb_dns_name` by hand anymore.

---

# Deployment order

```text
Bootstrap (manual, one-time / infrequent)
  1. Terraform remote state           (terraform/backend/, then enable the S3 backend)
  2. terraform apply <environment>    (VPC, EKS, RDS, S3, CloudFront, ECR, IAM + Pod Identity)
  3. AWS Load Balancer Controller     (scripts/deployment/install-alb-controller.sh; Helm chart, reuses the Terraform role + Pod Identity)
  4. Build & push images to ECR       (repositories created by Terraform in step 2; build/tag/push backend + frontend)
  5. Create ConfigMap + Secret        (scripts/deployment/bootstrap-config.sh; from Terraform outputs)
  6. CI deploy principal              (IAM user + EKS access entry + GitHub secrets — see "CI deploy principal" below)

Repeatable (automated — deploy.yml, workflow_dispatch)
  7. Apply namespace / service account / RBAC
  8. Run the database migration Job   (backend image + `migrate`; applied and awaited before rollout)
  9. Apply Services + Deployments (with the supplied image URIs) + frontend HPA
 10. Wait for the rollout
 11. Apply the Ingress (HTTP-only listener; the ALB is created on the first apply)
 12. Print a deployment summary

After the first deploy (one-time per environment lifetime): the new ALB's
hostname is written to `alb_dns_name.auto.tfvars` and `terraform apply` runs
again — this creates the platform CloudFront distribution, whose default
*.cloudfront.net domain is the platform's public HTTPS URL. `up.sh` does both
automatically (Phases 7–8); the manual equivalent is below (see "HTTPS via the CloudFront
default domain").
```

The application deploy (steps 7–12) is what `deploy.yml` automates — including the
database migration (step 8), which runs as an idempotent one-off Job before the
rollout (see "Database migrations" below). Steps 1–6 are the manual bootstrap
described below; step 6 (CI deploy principal) is a prerequisite of the first
`deploy.yml` run — without the access entry every `kubectl` call in the workflow
fails with an authorization error. The post-first-deploy CloudFront apply exists
because the ALB is created by the AWS Load Balancer Controller when the Ingress
is first applied, so its DNS name cannot be known during the initial
`terraform apply` (see "HTTPS via the CloudFront default domain").

---

# Flow diagrams

## End-to-end bootstrap + first deployment

```text
Developer
    ↓
Remote state bootstrap                    (step 1 — scripts/terraform/bootstrap-remote-state.sh)
    ↓
terraform apply                           (step 2 — alb_dns_name still unset)
    ↓
AWS infrastructure                        (VPC, EKS, RDS, S3, CloudFront for user sites, ECR, IAM)
    ↓
Install ALB Controller                    (step 3 — scripts/deployment/install-alb-controller.sh)
    ↓
Build & push images                       (step 4 — docker build/tag/push to ECR)
    ↓
bootstrap-config.sh                       (step 5 — ConfigMaps + Secret)
    ↓
Configure GitHub secrets                  (step 6 — CI deploy principal + 3 secrets)
    ↓
Run deploy.yml                            (steps 7–12 — migrations, rollout, Ingress)
    ↓
ALB created                               (hostname printed in the deploy summary)
    ↓
Copy ALB hostname into alb_dns_name       (terraform.tfvars)
    ↓
terraform apply                           (second apply — ~5 min CloudFront rollout)
    ↓
Platform CloudFront created
    ↓
Platform available at https://<cloudfront-domain>
```

## Runtime request flow (the platform)

```text
User
    ↓ HTTPS   (default *.cloudfront.net certificate)
Platform CloudFront
    ↓ HTTP    (caching disabled — pass-through origin)
Application Load Balancer
    ↓
Kubernetes Ingress
   ↙        ↘
Frontend    Backend
(/)         (/api)
```

## Publishing flow (hosted user websites)

```text
GitHub Repository
    ↓  (clone + build)
Build Job                                 (Kubernetes Job in the cluster)
    ↓  (aws s3 sync + invalidation)
S3
    ↓
User Website CloudFront
    ↓ HTTPS
Visitor                                   (https://<cloudfront-domain>/{userId}/{projectId})
```

---

# Required GitHub Secrets

Set these on the `dev` / `prod` GitHub **Environments** so production can require a
reviewer. The Environment names must be **exactly `dev` and `prod`** — `deploy.yml`
sets `environment: ${{ inputs.environment }}`, so environment-scoped secrets are
only picked up when the names match the workflow's input values. Because each
environment has its **own** deploy role (dev and prod produce different
`AWS_ROLE_ARN` values — the OIDC trust is scoped per environment), `AWS_ROLE_ARN`
must be environment-scoped; a single repository-level value only works if you deploy
just one environment:

| Secret | Purpose |
| --- | --- |
| `AWS_ROLE_ARN` | ARN of the GitHub Actions deploy role assumed via OIDC. Take it from the `github_actions_role_arn` Terraform output. |
| `AWS_REGION` | AWS region of the cluster (e.g. `eu-central-1`) |

The workflow authenticates with **GitHub OIDC** (no long-lived AWS keys): it
requests a short-lived OIDC token (`id-token: write`) and `configure-aws-credentials`
assumes `AWS_ROLE_ARN`, receiving temporary credentials scoped to that run. The
workflow validates both secrets are present before doing anything and fails early
with a clear message if either is missing.

The deploy role, its IAM OIDC provider, and its EKS access entry (cluster access)
are all created by Terraform (`terraform/modules/iam/github-oidc.tf`) during the
environment `apply` — no manual IAM user or access-entry step is required (see the
former bootstrap step 6, now retired, below).

---

# Bootstrap requirements (manual, one-time)

These are performed once per AWS account/environment before the first `deploy.yml`
run. They are intentionally **not** automated (state safety and external
dependencies). Application **image build/publish is automated**: on every push to
`main`, the CI `images` job (`.github/workflows/ci.yml`) builds and pushes
SHA-tagged backend/frontend images to the **dev** ECR repositories, after all
validation jobs pass. `up.sh` still builds/pushes locally for bootstrap and
ad-hoc redeploys; `deploy.yml` consumes an image URI from either path.

1. **Terraform remote state** — run `scripts/terraform/bootstrap-remote-state.sh`
   to create the state bucket (idempotent), then uncomment the `backend "s3"` block
   in each environment and `terraform init -migrate-state` (see `06-terraform.md`
   "Enablement Sequence" and `terraform/README.md` "Remote state bootstrap" for the
   full runbook + recovery). Remote state must be active before any real
   `terraform apply`.
2. **Provision infrastructure** — `terraform apply` the environment
   (`terraform/environments/<env>`), providing `TF_VAR_db_password`. This also
   creates the ECR repositories (step 4). Record the outputs
   (`terraform output`): `eks_cluster_name`, `s3_bucket_name`,
   `cloudfront_distribution_id`, `cloudfront_domain_name`, `rds_database_endpoint`,
   `ecr_backend_repository_url`, `ecr_frontend_repository_url`. (The
   `platform_cloudfront_domain_name` / `platform_cloudfront_distribution_id`
   outputs are `null` on this first apply — they are populated by the
   post-first-deploy apply that sets `alb_dns_name`; see "HTTPS via the
   CloudFront default domain".)

   > **Billing starts here.** From the moment this apply finishes, the always-on
   > resources (EKS control plane, NAT Gateway, nodes, RDS, ALB after the first
   > deploy) accrue cost — roughly **~$7/day (~$210–220/month) for idle dev**.
   > Plan to complete the remaining bootstrap steps and the first deploy in one
   > sitting, and **tear the environment down after the demo** — see "Cost and
   > teardown" below. Idle time, not usage, is the dominant cost.
3. **AWS Load Balancer Controller** — run
   `scripts/deployment/install-alb-controller.sh <env>`. It installs the controller
   via its Helm chart into `kube-system`, reusing the IAM role + Pod Identity
   association Terraform already created. Without it the Ingress cannot create an
   ALB (see `07-kubernetes.md` "Ingress" and "AWS Load Balancer Controller" below).
4. **Container images** — the backend and frontend are containerized in-repo via
   `backend/Dockerfile` and `frontend/Dockerfile` (see "Container images" below).
   The ECR repositories are created by Terraform in step 2 (see `06-terraform.md`
   "ECR Module"); take their URIs from the `ecr_backend_repository_url` /
   `ecr_frontend_repository_url` outputs. Build both images **for
   `linux/amd64`** (the EKS nodes are x86_64 `t3.*` instances — on Apple
   Silicon/ARM hosts pass `docker build --platform linux/amd64`, otherwise the
   pods crash-loop with `exec format error`; see "Local build commands" below),
   authenticate Docker to ECR (`aws ecr get-login-password | docker login ...` —
   see "Pushing to ECR" below; the first push fails with `no basic auth
   credentials` otherwise), tag them for those repositories, push, then pass the
   image URIs as `deploy.yml` inputs. Building, tagging and pushing the images
   is still manual — no automated image build/push pipeline exists yet (a future
   enhancement).
5. **ConfigMap + Secret** — create `backend-config` / `frontend-config` and
   `backend-secrets` in the `hosting-platform` namespace by running
   `scripts/deployment/bootstrap-config.sh <env>` with `DB_PASSWORD` set. It fills
   the non-secret values from the Terraform outputs and the connection string from
   `DB_PASSWORD`, and applies all three objects idempotently. `deploy.yml` verifies
   they exist and fails early if not. See "Configuration and secrets bootstrap".
6. **CI deploy principal — now managed by Terraform (GitHub OIDC).** This step is
   **retired**: `deploy.yml` authenticates via GitHub OIDC and assumes the
   `hosting-platform-<env>-github-actions` role, which Terraform creates in step 2
   along with the account-global IAM OIDC provider and the role's EKS access entry
   (`terraform/modules/iam/github-oidc.tf`). IAM authentication alone grants **no**
   Kubernetes permissions, so the role is mapped to the cluster via an EKS access
   entry with `AmazonEKSClusterAdminPolicy` — the same authorization the former
   IAM user had; Terraform now owns it.

   The only manual action is setting the GitHub secrets once:

   ```bash
   # From the environment directory after `terraform apply`:
   terraform output -raw github_actions_role_arn   # -> set as the AWS_ROLE_ARN secret
   # AWS_REGION -> your cluster region, e.g. eu-central-1
   ```

   `AmazonEKSClusterAdminPolicy` is deliberately broad: the workflow applies
   cluster-scoped objects (the namespace) and RBAC Roles/RoleBindings, which
   narrower access policies cannot create without escalation privileges. Scoping
   the deploy role's Kubernetes access down (a dedicated access policy or namespace
   scope plus a separate namespace-creation step) is a future hardening. The OIDC
   trust is already tightly scoped at the AWS layer: only this repository's `dev`/
   `prod` GitHub Environment jobs can assume the matching role.

> **Database schema** — no longer a manual bootstrap step. Migrations are applied
> in-cluster by the migration Job that `deploy.yml` runs before every rollout (see
> "Database migrations" below). The bootstrap only has to ensure the ConfigMap and
> Secret (step 5) exist, since the Job reads the connection string from them.

---

# AWS Load Balancer Controller

The ALB Ingress (`k8s/ingress/alb-ingress.yaml`) only provisions an Application
Load Balancer if the **AWS Load Balancer Controller** is running in the cluster.
Installing it is a one-time cluster bootstrap step.

## Installation method

The controller is installed via its **official Helm chart** (`eks/aws-load-balancer-controller`),
wrapped in `scripts/deployment/install-alb-controller.sh` for repeatability. Helm
is AWS's recommended install path: the chart bundles the controller's CRDs
(`TargetGroupBinding`, `IngressClassParams`) and generates the admission webhook's
self-signed certificate, so no cert-manager or hand-maintained manifests are
needed.

It is deliberately **not** installed through Terraform. Doing so would pull the
`helm`/`kubernetes` providers into the infrastructure apply and make their provider
configuration depend on the EKS cluster created in the same apply — a fragile
pattern (init/plan ordering, destroy edge cases) that the project intentionally
avoids (the IAM module already notes "no extra Terraform provider required"). Keeping
the install as an idempotent script preserves that simplicity while still being
repeatable.

## Prerequisites

* `helm`, `aws`, and `kubectl` on PATH, with AWS credentials for the account.
* The environment already `terraform apply`-ed — the script reads `eks_cluster_name`,
  `aws_region` and `vpc_id` from `terraform output`, and the **IAM role + Pod
  Identity association** for `kube-system/aws-load-balancer-controller` are created
  by the Terraform IAM module.
* The **EKS Pod Identity Agent** addon (enabled in the Terraform EKS module) must be
  active — it is what injects the role's credentials into the controller pods.

## Installation procedure

```bash
scripts/deployment/install-alb-controller.sh dev   # or prod
```

The script points kubectl at the cluster, adds/updates the `eks` Helm repo, and runs
`helm upgrade --install` with `clusterName`, `region` and `vpcId` set explicitly
(so the controller does not rely on IMDS auto-discovery) and `--wait`.

## Pod Identity integration

The Terraform IAM module creates the controller's IAM role and an
`aws_eks_pod_identity_association` binding it to the `kube-system/aws-load-balancer-controller`
service account. The Helm chart therefore just **creates that service account by
name** (`serviceAccount.create=true`, `serviceAccount.name=aws-load-balancer-controller`)
and it must **not** carry an IRSA `eks.amazonaws.com/role-arn` annotation — the Pod
Identity Agent supplies the credentials. The script sets no such annotation.

## Upgrade considerations

* The chart version is pinned in the script (`CHART_VERSION`, currently `1.11.0` /
  controller `v2.11.x`) and **must stay in sync with the IAM policy** in
  `terraform/modules/iam/alb-controller-iam-policy.json`. When bumping the
  controller, update that policy file from the matching upstream `iam_policy.json`
  **and** the script's `CHART_VERSION` together, then `terraform apply` (policy) and
  re-run the script (controller).
* Helm does **not** upgrade CRDs automatically on `helm upgrade`. If a new version
  changes the CRDs, apply the chart's updated CRDs manually first (see the upstream
  release notes).

## Operational procedure

* **Re-run / repair:** `install-alb-controller.sh` is idempotent (`upgrade
  --install`); re-run it to converge the release.
* **Verify:** `kubectl -n kube-system get deployment aws-load-balancer-controller`
  and `kubectl -n kube-system logs deploy/aws-load-balancer-controller`.
* **Uninstall:** `helm -n kube-system uninstall aws-load-balancer-controller`
  (leaves the Terraform-managed IAM role/association intact).

## Future improvements

* If/when the controller is offered as a first-party **EKS managed add-on**
  (`aws_eks_addon`), it could replace the Helm step and move fully into Terraform
  without extra providers.
* A GitOps installer (Argo CD/Flux) could manage the controller declaratively
  alongside other cluster add-ons.

---

# Configuration and secrets bootstrap

The application reads all runtime configuration from three Kubernetes objects in
the `hosting-platform` namespace. They must exist **before** the first deploy —
`deploy.yml` verifies them and fails early if any is missing (it never creates
them, so it holds no secret values and stays idempotent).

| Object | Kind | Holds |
| --- | --- | --- |
| `backend-config` | ConfigMap | Non-secret backend config (env, AWS region/bucket/CloudFront, cookie settings) |
| `frontend-config` | ConfigMap | Non-secret frontend config (`NODE_ENV`) |
| `backend-secrets` | Secret | The database connection string (sensitive) |

These map to the backend's configuration via the ASP.NET Core `__` convention
(e.g. `AWS__BucketName` → `AWS:BucketName`); the Deployments consume them with
`envFrom` (see `k8s/backend/deployment.yaml`).

## Bootstrap strategy — the script

Run the idempotent helper once per environment:

```bash
export DB_PASSWORD='<rds-master-password>'   # same value as TF_VAR_db_password
scripts/deployment/bootstrap-config.sh dev   # or prod
```

It reads the non-secret values straight from `terraform output` for that
environment, builds the connection string, points kubectl at the environment's EKS
cluster, applies `k8s/base/namespace.yaml`, and applies all three objects with
`kubectl create ... --dry-run=client -o yaml | kubectl apply -f -`. Re-running it
updates the values in place. The `k8s/base/configmap.example.yaml` and
`k8s/secrets/secret.example.yaml` files remain as the reference/fallback templates.

## Which values come from Terraform outputs

`backend-config` is populated entirely from `terraform output` (of
`terraform/environments/<env>`):

| Config key | Terraform output |
| --- | --- |
| `AWS__Region` | `aws_region` |
| `AWS__BucketName` | `s3_bucket_name` |
| `AWS__CloudFrontDistributionId` | `cloudfront_distribution_id` |
| `AWS__CloudFrontDomain` | `cloudfront_domain_name` |
| `ASPNETCORE_ENVIRONMENT`, `Authentication__*` | fixed literals (app defaults) |

`backend-secrets` is built from Terraform outputs **plus** the password:
`rds_database_endpoint` (split into host/port), `rds_database_name`,
`rds_database_username`, and `DB_PASSWORD`.

## Which values must be supplied manually (and why)

Only the **database password** (`DB_PASSWORD`). It is deliberately **not** a
Terraform output: exposing it via `terraform output` would print it in plaintext
and make it trivial to capture in logs/CI. Its canonical store is the write-once
**SSM `SecureString`** at `/hosting-platform/<env>/db_password` (see "Database
password" above); `up.sh` reads it once and passes the same value to Terraform
(`TF_VAR_db_password`) and to this script (`DB_PASSWORD`). It only ever lands in
the Kubernetes Secret — never on disk, never in Git. `.gitignore` also blocks
committing real `k8s/secrets/*.yaml` / `k8s/base/configmap.yaml` files as
defense-in-depth.

**Password characters:** use letters, digits and the symbols
`! # $ % ^ & * ( ) _ + . , : ? ~ -` only. RDS forbids `/`, `@`, `"` and
spaces, and `;`, `'` or `=` would silently corrupt the Npgsql connection string
the script builds (a literal `=` mis-parses as a key/value separator). Both the
Terraform `db_password` variable and `bootstrap-config.sh` validate this and
fail fast on a disallowed character.

**Master user (accepted MVP limitation):** the connection string uses the RDS
**master** username — the application and the migration Job run with full
database-owner rights, and the app credential cannot be rotated independently of
the admin credential. Acceptable while the MVP has a single database and no
untrusted users; a dedicated least-privilege application role (and later Secrets
Manager + ESO, below) is the production fix.

## Operational procedure

* **Rotate the DB password (deliberate, out-of-band):** because the RDS instance
  uses `lifecycle { ignore_changes = [password] }`, `terraform apply` will not
  change it — rotation is intentional and manual. Change it in RDS
  (`aws rds modify-db-instance --master-user-password …`), **overwrite the SSM
  parameter** (`aws ssm put-parameter --name /hosting-platform/<env>/db_password
  --type SecureString --value … --overwrite`), re-run `bootstrap-config.sh` (or
  `up.sh <env> --app` after it), then restart the backend
  (`kubectl -n hosting-platform rollout restart deployment/backend`) so it picks
  up the new Secret. This is the *only* time the write-once SSM value is
  overwritten.
* **Change an AWS value** (e.g. a new bucket/CloudFront after a Terraform change):
  re-run the script; it re-reads the outputs and updates `backend-config`.

## Future production improvements

* **AWS Secrets Manager + External Secrets Operator (ESO).** Store the connection
  string (or discrete credentials) in Secrets Manager and have ESO sync it into a
  Kubernetes Secret, so no human handles the password and rotation is automatic.
  Deferred for the MVP: it adds a controller, IAM, and Secrets Manager resources.
* **Terraform-managed Secret/ConfigMap** via the Kubernetes provider. Natural since
  the DB password is already in Terraform state, but it couples app config to the
  infra apply and adds provider/namespace-ordering wiring — heavier than the MVP
  needs. The script keeps config bootstrap in the deploy lane, matching the
  documented "Kubernetes objects are applied outside Terraform" separation.

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

The EKS node group runs on **x86_64** (`t3.*` instances), so every image pushed
to ECR must be built for `linux/amd64`. On an x86_64 host this is the default;
on **Apple Silicon or any other ARM64 host** the platform must be forced with
`--platform linux/amd64` — an ARM image builds and pushes cleanly but the pods
then crash-loop with `exec format error`. The commands below always pass the
flag so they are correct on any host. (Only exception: an image built purely
for a local smoke test on an ARM machine may be built natively.)

```bash
# From the repository root. The build context is each app's own directory.
docker build --platform linux/amd64 -t hosting-platform-backend:local  backend/
docker build --platform linux/amd64 -t hosting-platform-frontend:local frontend/

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
`AWS__*` from the ConfigMap/Secret; the frontend uses same-origin `/api`). The ECR
repositories are created by Terraform (see `06-terraform.md` "ECR Module"); retag
the built image with the repository URI (from the `ecr_*_repository_url` outputs)
and push. Repositories use immutable tags, so push each build under a unique tag
(e.g. the Git commit SHA). Tagging and pushing are manual — see bootstrap step 4.

## Pushing to ECR

Docker must **authenticate to ECR before the first push** — ECR is a private
registry, and an unauthenticated `docker push` fails with
`no basic auth credentials`. Exchange your AWS credentials for a registry token
(valid ~12 hours; re-run after it expires):

```bash
AWS_REGION=<region>                      # e.g. eu-central-1, the environment's region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
```

Then tag and push (repository URIs come from the `ecr_backend_repository_url` /
`ecr_frontend_repository_url` Terraform outputs; use a unique tag — the
repositories are immutable):

```bash
TAG=$(git rev-parse --short HEAD)

docker tag hosting-platform-backend:local  "<ecr_backend_repository_url>:${TAG}"
docker tag hosting-platform-frontend:local "<ecr_frontend_repository_url>:${TAG}"
docker push "<ecr_backend_repository_url>:${TAG}"
docker push "<ecr_frontend_repository_url>:${TAG}"
```

These full URIs (including the tag) are what `deploy.yml` takes as its
`backend_image` / `frontend_image` inputs.

## Assumptions and limitations

* **`output: "standalone"` was added to `next.config.ts`.** It is a packaging
  option only — routing, rewrites and rendering are unchanged.
* **No image optimization dependency (`sharp`) is bundled.** The app does not rely
  on server-side `next/image` optimization; if that changes, add `sharp` and
  rebuild.
* **Data Protection keys are persisted to the database** (`PersistKeysToDbContext`),
  so authentication cookies survive backend restarts and redeploys and are
  shareable across replicas (`07-kubernetes.md` "Backend Replicas").
* The images are **framework-dependent** (not self-contained / trimmed / ReadyToRun)
  to keep the build simple and avoid altering runtime behaviour.

---

# HTTPS via the CloudFront default domain

## Architecture

The platform runs entirely on **AWS-managed endpoints — no custom domain, no
Route53 zone, no ACM certificate**. Its public entry point is a dedicated
CloudFront distribution (`terraform/modules/cloudfront-platform`) that fronts
the ALB and serves HTTPS on its default `*.cloudfront.net` domain:

```text
Browser ──HTTPS──> dxxxxxxxx.cloudfront.net ──HTTP──> ALB ──> Ingress
                   (default CloudFront cert)                   ├─ /api → backend
                                                               └─ /    → frontend
```

HTTPS is still **mandatory** and still works: the backend issues `Secure`
session cookies in Production, which browsers drop over plain HTTP — but the
browser-facing connection is HTTPS (CloudFront), so cookies and login behave
exactly as before. Only the CloudFront→ALB origin hop is plain HTTP (see
"Limitations"). This is the AWS-native way to get valid, auto-renewed TLS with
no domain purchase: ACM **cannot** issue a certificate for an AWS-owned
`*.elb.amazonaws.com` name, so the ALB itself has an **HTTP-only listener**
(`k8s/ingress/alb-ingress.yaml`) and no certificate annotation.

Published user sites are unchanged and independent: they were already served
from the *other* CloudFront distribution's default domain
(`https://<cloudfront_domain_name>/{userId}/{projectId}`).

## The platform distribution

Created by the `cloudfront-platform` Terraform module, deliberately **separate**
from the user-sites distribution (user sites occupy the path root of theirs,
which would collide with the platform frontend at `/`; a distribution has no
fixed cost, so the separation is free). Configuration highlights:

* **Origin:** the ALB DNS name, `origin_protocol_policy = "http-only"`.
* **No caching:** managed `CachingDisabled` cache policy + `AllViewer` origin
  request policy — every request (headers, cookies, query strings) passes
  through to the app; all HTTP methods allowed.
* **`viewer_protocol_policy = "redirect-to-https"`** — plain-HTTP visits to the
  CloudFront domain are redirected.
* **Default CloudFront certificate** — valid TLS, renewed by AWS, zero config.

## Two-phase bootstrap (why `alb_dns_name` exists)

The ALB is created by the AWS Load Balancer Controller when the Ingress is
first applied — its DNS name is unknown during the initial `terraform apply`.
The module is therefore gated on the `alb_dns_name` variable (default `""` =
not created), the same pattern the dormant ACM module used for `domain_name`:

1. Initial `terraform apply` (with `alb_dns_name` unset) — everything except the
   platform distribution is created.
2. First `deploy.yml` run applies the Ingress; the controller provisions the ALB.
3. Read the ALB hostname (deploy summary, or
   `kubectl -n hosting-platform get ingress hosting-platform`), write
   `alb_dns_name = "<that hostname>"` into the environment's
   `alb_dns_name.auto.tfvars` (gitignored; `up.sh` does this in Phase 8), and
   `terraform apply` again (~5 min while CloudFront deploys globally).
4. `terraform output -raw platform_cloudfront_domain_name` is now the platform's
   public HTTPS URL: `https://dxxxxxxxx.cloudfront.net`.

This replaces the old post-deploy step (the Route53 ALB alias record) — the
manual-step count is unchanged. The ALB hostname is stable across redeploys as
long as the Ingress is not deleted; a **teardown + re-bootstrap produces a new
ALB hostname**, so step 3 is repeated each environment lifetime (see "Cost and
teardown").

## Direct ALB access (accepted limitation)

The ALB stays internet-facing, so its raw hostname also serves the app — over
plain HTTP, bypassing CloudFront. This is an accepted MVP trade-off (documented
in "Limitations" alongside no-WAF/no-rate-limiting) rather than a security
hole:

* Session cookies are **host-only** to the CloudFront domain (no `Domain`
  attribute) — a browser never sends them to the ALB hostname.
* Cookies are `Secure`, so login simply does not work over the HTTP path; the
  bypass exposes only what an unauthenticated visitor sees anyway.

The production fix — a Terraform-managed security group admitting only the
`com.amazonaws.global.cloudfront.origin-facing` managed prefix list, attached
via the `alb.ingress.kubernetes.io/security-groups` annotation — is deliberately
deferred to keep the networking simple.

## Reintroducing a custom domain (future)

The ACM module (`terraform/modules/acm`) is kept **dormant** in the repo. To
offer a custom domain later: re-add the module call +
`domain_name`/`hosted_zone_name` variables in the environment, attach the
certificate as an alias on the platform CloudFront distribution (certificates
for CloudFront are issued in `us-east-1`) or on an ALB HTTPS listener, and point
a Route53 alias at the chosen entry point. Nothing in the application code
assumes any hostname, so no app changes would be needed.

---

# Database migrations

## Strategy

Schema changes are applied by a **one-off Kubernetes Job that runs the backend
image itself** (`k8s/jobs/migrate-job.yaml`). The backend has a dedicated startup
path — `dotnet HostingPlatform.Api.dll migrate` (see `backend/.../Program.cs`) —
that applies pending EF Core migrations (`Database.Migrate()`) and exits without
starting the web server. The Job runs that command as a Pod, using the same
`backend-config` / `backend-secrets` the app uses (so it gets the same RDS
connection string).

Why this approach (and not the alternatives):

* **Reuses the release image.** The migrations are compiled into the backend
  assembly, so the Job runs the *exact* image being deployed — the schema can
  never drift from the code. No separate SDK image, `dotnet ef` tooling, or
  migration-bundle artifact is needed (the chiseled runtime image has no SDK).
* **Not on app startup.** The app never migrates automatically on boot, so
  ordinary pod restarts and (future) multiple replicas never race to migrate and
  never apply schema changes as a side effect of scaling.
* **Single runner, no race.** Exactly one Job Pod runs the migration; EF Core also
  wraps each migration in a transaction and records it in `__EFMigrationsHistory`,
  so re-runs are **idempotent** no-ops.
* **Fits the cluster and the workflow.** It is a plain `batch/v1` Job in the
  existing namespace, run by the existing deploy pipeline.

## How it runs (first and subsequent deploys)

`deploy.yml` runs the Job **before** the application rollout, on every deploy:

1. delete any previous `db-migrate` Job (Jobs are immutable), then apply
   `migrate-job.yaml` with the deployed **backend image URI** substituted in;
2. wait for the Job to reach `Complete` (polling its conditions, so a `Failed`
   Job ends the deploy immediately and dumps the Job logs);
3. only then apply the Services/Deployments and wait for the rollout.

* **First deployment** — the database is empty. The Job applies `InitialCreate`,
  creating the full schema. The backend then starts and seeds the Identity roles
  (`User`, `Admin`) against the now-existing tables. Without this ordering the
  backend would crash on startup (role seeding needs the schema).
* **Subsequent deployments** — the Job applies only migrations added since the
  last deploy; if there are none, it is a no-op and the deploy proceeds. Because
  the Job uses the new image, code and schema are always rolled out together.

## Manual / bootstrap procedure

The same Job can be run by hand (e.g. to apply a schema change without a full
deploy, or during bootstrap verification):

```bash
kubectl -n hosting-platform delete job db-migrate --ignore-not-found
sed 's#image: "PLACEHOLDER".*#image: "<backend-image-uri>"#' \
  k8s/jobs/migrate-job.yaml | kubectl apply -f -
kubectl -n hosting-platform wait --for=condition=complete job/db-migrate --timeout=300s
kubectl -n hosting-platform logs job/db-migrate
```

As a last-resort fallback, migrations can still be applied with
`dotnet ef database update` over a bastion/port-forward to the private RDS
instance, but the in-cluster Job is the supported path.

## Rollback considerations

* EF Core migrations are **not auto-reverted**. A code rollback (`rollout undo` or
  re-deploying a previous image) reverts the application but **not** the schema.
* Prefer **backward-compatible ("expand/contract") migrations**: additive changes
  first, so the previous app version keeps working against the new schema and a
  code rollback is safe without a schema rollback. It also covers the window
  between the migration Job completing and the new backend pod starting (the
  backend uses `strategy: Recreate`, so old and new pods never overlap — but the
  **old** pod runs against the **new** schema during that window).
* For a destructive schema change that must be undone, roll back deliberately with
  a new "down" migration (authored and applied as a normal forward migration) or
  restore RDS from a snapshot — never hand-edit an applied migration
  (`12-...` "Migrations").

---

# Running a deployment

Actions → **Deploy (manual)** → *Run workflow*, then provide:

* **environment** — `dev` or `prod`
* **backend_image** — full image URI (e.g. `…dkr.ecr.<region>.amazonaws.com/hosting-platform-<env>-backend:<tag>`)
* **frontend_image** — full image URI

The workflow configures kubectl for `hosting-platform-<env>-eks`, applies the base
resources, runs the database migration Job to completion, applies the manifests,
waits for the backend and frontend rollouts, applies the Ingress, and writes a
summary (including the ALB hostname once provisioned — that hostname is the
CloudFront **origin**, not the public URL; the platform URL is the
`platform_cloudfront_domain_name` Terraform output).

---

# Post-deploy verification

Run once after the first deployment (and after any node group / AMI change):

* **Pods cannot reach the node's instance metadata service (IMDS).** Build Jobs
  execute untrusted repository code; if a pod can reach IMDS it can steal the
  **node role's** credentials (ECR pull, CNI, worker policies). The EKS module's
  node launch template asserts IMDSv2-required with hop limit 1 (`metadata_options`),
  which blocks pods, rather than relying on the inherited AMI default. Verify it
  still holds after any node group / AMI change:

  ```bash
  kubectl -n hosting-platform run imds-check --rm -i --restart=Never \
    --image=curlimages/curl --command -- \
    curl -sS -m 3 http://169.254.169.254/latest/meta-data/
  # EXPECTED: the request times out / fails. If metadata is returned, pods can
  # reach IMDS — set metadata_options (IMDSv2 required, hop limit 1) on the
  # node group before allowing any untrusted build.
  ```

* **App and ALB health**: `kubectl -n hosting-platform get pods`, then — after
  the post-first-deploy apply that creates the platform distribution — open the
  frontend root (`https://<platform-cloudfront-domain>/`) and an API route
  (`https://<platform-cloudfront-domain>/api/auth/me` → `401` when
  unauthenticated is the expected healthy response). Validate login **through
  the CloudFront URL only** — against the raw ALB hostname the app loads over
  plain HTTP but login silently fails (`Secure` cookies are dropped; see "HTTPS
  via the CloudFront default domain"). `/healthz` itself is not routed through
  the Ingress — only the ALB target-group health checker and the Kubernetes
  probes call it on the pods directly.
* **End-to-end build**: deploy a known-good public repository and confirm the
  published CloudFront URL serves it (see `15-demo.md` "Full AWS demo").

---

# First administrator (one-time bootstrap)

Registration only ever grants the `User` role, and there is no self-promotion in
the app — so the first `Admin` must be promoted **directly in the database**.
In AWS this cannot be done from your machine: **RDS is private** (private
subnets, VPC-only security group), and the backend image is chiseled (no shell
to `exec` into). The supported path is a **temporary PostgreSQL client pod
inside the cluster**, which can reach RDS because it runs in the VPC.

This is a one-time bootstrap operation: do it once per environment, after the
first deploy and after registering your own account through the UI.

1. Read the connection values from the Secret the backend uses:

   ```bash
   kubectl -n hosting-platform get secret backend-secrets \
     -o jsonpath='{.data.ConnectionStrings__DefaultConnection}' | base64 -d; echo
   # -> Host=<rds-host>;Port=5432;Database=hostingplatform;Username=hostingplatform;Password=<password>
   ```

2. Launch a temporary psql pod with those values (it is deleted automatically
   when you exit — `--rm`):

   ```bash
   kubectl -n hosting-platform run psql-admin --rm -it --restart=Never \
     --image=postgres:16 --env PGPASSWORD='<password>' -- \
     psql -h <rds-host> -p 5432 -U hostingplatform -d hostingplatform
   ```

3. Promote your account (idempotent):

   ```sql
   INSERT INTO "AspNetUserRoles" ("UserId","RoleId")
   SELECT u."Id", r."Id" FROM "AspNetUsers" u, "AspNetRoles" r
   WHERE u."Email" = 'YOUR_EMAIL' AND r."Name" = 'Admin'
   ON CONFLICT DO NOTHING;
   ```

4. Exit psql (the pod is removed), then **sign out and back in** — roles are
   read at sign-in — and open `/admin`.

Notes: the password briefly exists in the pod's environment and your shell
history — clear the history line if that matters to you
(`history -d $(history 1 | awk '{print $1}')`). Further admins can be promoted
the same way; a proper admin-management UI is future work.

---

# Rollback strategy

## Backend deploys are brief outages by design (Recreate)

The backend Deployment uses `strategy: Recreate`, not a rolling update: the old
pod is terminated **before** the new one starts. Consequences to have in mind
during any deploy or incident:

* Every backend deploy causes a **short API outage** (seconds — until the new
  pod passes its readiness probe). This is intentional.
* If a backend rollout **fails** (bad image, crash-loop), there is **no old pod
  still serving** — the API is down until you intervene. `deploy.yml` turns red
  at the rollout-wait step, but it does not revert anything.
* Recovery is manual: `kubectl -n hosting-platform rollout undo
  deployment/backend`, or re-run `deploy.yml` with the last known-good image URI.

Why this trade-off is accepted: a rolling update would briefly run **two**
backend pods, which violates the single-replica invariant the MVP depends on —
the new pod's startup recovery would mark deployments `Failed` while the old pod
is still driving them. Correctness of the deployment pipeline is prioritized over
a few seconds of deploy-time availability. The frontend is unaffected (stateless,
rolling update, HPA-managed).

## Rollback options

* **Fast rollback** — `kubectl -n hosting-platform rollout undo deployment/backend`
  (and `deployment/frontend`) reverts to the previous ReplicaSet/image.
* **Re-deploy a known-good image** — re-run `deploy.yml` with the previous image
  URIs.
* **Infrastructure** — Terraform changes are reverted manually (revert the code
  and `terraform apply`, or restore from the RDS final snapshot for the database).
  Production RDS has `deletion_protection` and a final snapshot (see
  `06-terraform.md`).

---

# Cost and teardown

This is a portfolio/MVP project running on EKS, which has a **high fixed cost
floor that no tuning removes**: the EKS control plane (~$73/mo), the NAT Gateway
(~$38/mo), two nodes (~$70/mo), RDS and the ALB together idle at roughly
**~$7/day (~$210–220/month)** in `dev` — regardless of traffic. Idle time, not
usage, is the dominant cost.

## Destroy between demos (primary cost strategy)

The single most effective cost optimization is **not to leave the environment
running**. The `dev` environment is intentionally **disposable** — RDS has
`deletion_protection = false` and `skip_final_snapshot = true`, and ECR uses
`force_delete = true` (see `06-terraform.md`) — precisely so it can be destroyed
after a demonstration and re-bootstrapped (~30 minutes) when next needed.
Treat "demo, then destroy the same day" as the normal workflow; leaving `dev`
up between demos costs ~$210/month for near-zero traffic.

## Teardown order (avoid orphaned, still-billing resources)

**The ALB — and the security groups it uses — are created by the AWS Load
Balancer Controller, not by Terraform.** They live in the Terraform-managed VPC
but are absent from Terraform state, so `terraform destroy` has no dependency
edge to them: run alone, it races ahead of AWS's asynchronous ALB teardown and
fails with `DependencyViolation` on the subnets / Internet Gateway / VPC, leaves
the ALB **still billing (~$20/month)**, and orphans the controller's security
groups. The fix is ordering + waiting, which Terraform cannot express for
resources it does not manage.

### Supported path — `destroy.sh` (one command)

```bash
scripts/deployment/destroy.sh dev            # add --auto-approve to skip the prompt
```

The script automates the correct order with real waits so no manual AWS cleanup
is needed: it deletes the Ingress (so the controller removes the ALB and its own
SGs), **waits** for the ALB to actually disappear (deleting it directly as a
fallback if the controller is already gone), sweeps the controller's leftover
security groups (tag-scoped to `elbv2.k8s.aws/cluster`, so Terraform-managed SGs
are never touched), empties the hosting bucket, runs `terraform destroy`, and
verifies nothing billable survived. It is idempotent and recovers from a
half-destroyed environment. A stale S3 state lock is detected and reported; pass
`--force-unlock` to release it (never done silently — unsafe if another run is
active). The hosting bucket also has `force_destroy = true` in `dev` (see
`06-terraform.md` "S3 Module"), so `terraform destroy` removes it even if it
still holds published sites; `prod` keeps `force_destroy = false`.

### Manual fallback (if the script is unavailable)

```bash
# 1. Delete the Ingress; the controller then deletes the ALB it created.
kubectl -n hosting-platform delete ingress hosting-platform

# 2. Wait until the ALB is actually gone (no ELBv2 load balancers remain).
#    Re-run until it returns an empty list:
aws elbv2 describe-load-balancers --region "$AWS_REGION" \
  --query "LoadBalancers[].LoadBalancerName" --output text

# 3. Delete any leftover controller security groups (tagged for the cluster):
aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=<vpc-id>" \
  "Name=tag:elbv2.k8s.aws/cluster,Values=hosting-platform-dev-eks" \
  --query "SecurityGroups[].GroupId" --output text

# 4. Only now destroy the infrastructure.
terraform -chdir=terraform/environments/dev destroy
```

`terraform destroy` also removes the **platform CloudFront distribution**
(expect the destroy to take ~5–15 minutes longer — CloudFront disables and then
deletes it). Between deleting the Ingress and the destroy the distribution
briefly points at a dead origin; that is harmless. After a re-bootstrap the new
Ingress produces a **new ALB hostname**, so the post-first-deploy step (set
`alb_dns_name` in `terraform.tfvars`, `terraform apply`) is repeated each
environment lifetime — see "HTTPS via the CloudFront default domain".

(If you also want to remove the AWS Load Balancer Controller and the remote-state
bucket, see `07-kubernetes.md` / `06-terraform.md`; the state bucket has
`prevent_destroy` and is meant to persist across teardowns.)

## Do not apply the `prod` environment in a personal account

`terraform/environments/prod/` is a **reference configuration** — 3× t3.large
nodes, Multi-AZ RDS, CloudFront `PriceClass_All` — which idles at roughly
**$400–450/month**. It exists to show a production-shaped setup; it should
**not** be applied in a personal AWS account. Deploy and demo `dev` only.

## Keep EKS on a standard-support version

The control plane is $0.10/hr on **standard support**. If the cluster's
Kubernetes version ages out of standard support into **extended support**, that
jumps to ~$0.60/hr — a silent **~6× increase (~$73 → ~$438/month)**. The version
is pinned in the EKS module (`kubernetes_version`, currently `1.34`); verify it
is still within standard support before each deploy and upgrade before it lapses
(see `06-terraform.md` "EKS Module").

---

# Limitations

* **App deploy only.** `deploy.yml` does not provision infrastructure, build
  images, install the load balancer controller, or create the ConfigMap/Secret —
  those are the manual bootstrap above. It *does* apply database migrations, via
  the pre-rollout migration Job (see "Database migrations").
* **No custom domain.** The platform lives on an AWS-generated
  `*.cloudfront.net` URL (and user sites on the other distribution's default
  domain) — a deliberate cost decision; the dormant ACM module documents the
  re-enable path (see "HTTPS via the CloudFront default domain").
* **The ALB is directly reachable over plain HTTP**, bypassing CloudFront.
  Accepted: session cookies are host-only to the CloudFront domain and `Secure`,
  so the bypass exposes only unauthenticated content; the CloudFront
  origin-facing prefix-list security group is the deferred production fix (see
  "Direct ALB access").
* **The CloudFront→ALB origin hop is unencrypted HTTP** (ACM cannot cover
  `*.elb.amazonaws.com`, so the ALB has no HTTPS listener). Browser→CloudFront
  is always HTTPS.
* **The app connects as the RDS master user** — accepted MVP limitation; see
  "Configuration and secrets bootstrap".
* **Single-replica backend.** The backend has no HPA (in-memory deployment
  queue); see `07-kubernetes.md` "Backend Replicas". Data Protection keys are
  persisted to the database, so they no longer constrain replica count.
* **Backend deploys briefly interrupt the API** (`strategy: Recreate`), and a
  failed backend rollout leaves no old pod serving — see "Rollback strategy".
* **Migrations are not auto-reverted.** They are applied automatically before each
  rollout (idempotent Job), but a code rollback does not roll back the schema —
  prefer backward-compatible migrations (see "Database migrations").
* **Verified locally by structure only.** The workflow's live behavior (kubectl
  access, ALB provisioning, rollout) can only be confirmed against a real cluster.
