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
  0. Domain + Route53 hosted zone     (register a domain; create a public hosted zone; delegate registrar NS -> Route53)
  1. Terraform remote state           (terraform/backend/, then enable the S3 backend)
  2. terraform apply <environment>    (VPC, EKS, RDS, S3, CloudFront, ECR, ACM cert, IAM + Pod Identity)
  3. Set ACM_CERTIFICATE_ARN secret   (from the acm_certificate_arn Terraform output)
  4. AWS Load Balancer Controller     (scripts/deployment/install-alb-controller.sh; Helm chart, reuses the Terraform role + Pod Identity)
  5. Build & push images to ECR       (repositories created by Terraform in step 2; build/tag/push backend + frontend)
  6. Create ConfigMap + Secret        (scripts/deployment/bootstrap-config.sh; from Terraform outputs)

Repeatable (automated — deploy.yml, workflow_dispatch)
  7. Apply namespace / service account / RBAC
  8. Run the database migration Job   (backend image + `migrate`; applied and awaited before rollout)
  9. Apply Services + Deployments (with the supplied image URIs) + frontend HPA
 10. Wait for the rollout
 11. Apply the Ingress (ACM cert injected from the secret)
 12. Print a deployment summary

After the first deploy (one-time): point a Route53 alias record for the domain at
the provisioned ALB (see "HTTPS, certificates and DNS").
```

The application deploy (steps 7–12) is what `deploy.yml` automates — including the
database migration (step 8), which runs as an idempotent one-off Job before the
rollout (see "Database migrations" below). Steps 0–6 are the manual bootstrap
described below; step 0 (domain + hosted zone) is a prerequisite of step 2 so the
ACM certificate can be DNS-validated.

---

# Required GitHub Secrets

Set these at the repository level, or (preferred) on the `dev` / `prod` GitHub
**Environments** so production can require a reviewer:

| Secret | Purpose |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | IAM credentials the workflow deploys with |
| `AWS_SECRET_ACCESS_KEY` | " |
| `AWS_REGION` | AWS region of the cluster (e.g. `eu-central-1`) |
| `ACM_CERTIFICATE_ARN` | ACM certificate ARN injected into the ALB Ingress for HTTPS — take it from the `acm_certificate_arn` Terraform output (see "HTTPS, certificates and DNS") |

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

0. **Domain + Route53 hosted zone** — register a domain, create a **public Route53
   hosted zone** for it, and delegate the registrar's nameservers to that zone.
   Set `domain_name` (e.g. `app.example.com`) and `hosted_zone_name` (e.g.
   `example.com`) in the environment `terraform.tfvars`. This is a prerequisite of
   the ACM certificate created in step 2; the domain/zone stay manual on purpose
   (see "HTTPS, certificates and DNS").
1. **Terraform remote state** — apply `terraform/backend/` with local state to
   create the state bucket, then uncomment the `backend "s3"` block in the
   environment and `terraform init -migrate-state` (see `06-terraform.md`
   "Enablement Sequence"). Remote state must be active before any real
   `terraform apply`.
2. **Provision infrastructure** — `terraform apply` the environment
   (`terraform/environments/<env>`), providing `TF_VAR_db_password`. This also
   creates the ECR repositories (step 5) and — when `domain_name` is set (step 0) —
   the DNS-validated **ACM certificate** for the ALB. Record the outputs
   (`terraform output`): `eks_cluster_name`, `s3_bucket_name`,
   `cloudfront_distribution_id`, `cloudfront_domain_name`, `rds_database_endpoint`,
   `ecr_backend_repository_url`, `ecr_frontend_repository_url`,
   `acm_certificate_arn`.
3. **ACM certificate secret** — the certificate itself is created by Terraform in
   step 2 (ACM module). Put the `acm_certificate_arn` output value in the
   `ACM_CERTIFICATE_ARN` GitHub secret; `deploy.yml` injects it into the ALB Ingress
   (the ALB terminates HTTPS; Secure cookies require it). See "HTTPS, certificates
   and DNS".
4. **AWS Load Balancer Controller** — run
   `scripts/deployment/install-alb-controller.sh <env>`. It installs the controller
   via its Helm chart into `kube-system`, reusing the IAM role + Pod Identity
   association Terraform already created. Without it the Ingress cannot create an
   ALB (see `07-kubernetes.md` "Ingress" and "AWS Load Balancer Controller" below).
5. **Container images** — the backend and frontend are containerized in-repo via
   `backend/Dockerfile` and `frontend/Dockerfile` (see "Container images" below).
   The ECR repositories are created by Terraform in step 2 (see `06-terraform.md`
   "ECR Module"); take their URIs from the `ecr_backend_repository_url` /
   `ecr_frontend_repository_url` outputs. Build both images, tag them for those
   repositories, push, then pass the image URIs as `deploy.yml` inputs. Building,
   tagging and pushing the images is still manual — no automated image build/push
   pipeline exists yet (a future enhancement).
6. **ConfigMap + Secret** — create `backend-config` / `frontend-config` and
   `backend-secrets` in the `hosting-platform` namespace by running
   `scripts/deployment/bootstrap-config.sh <env>` with `DB_PASSWORD` set. It fills
   the non-secret values from the Terraform outputs and the connection string from
   `DB_PASSWORD`, and applies all three objects idempotently. `deploy.yml` verifies
   they exist and fails early if not. See "Configuration and secrets bootstrap".
> **Database schema** — no longer a manual bootstrap step. Migrations are applied
> in-cluster by the migration Job that `deploy.yml` runs before every rollout (see
> "Database migrations" below). The bootstrap only has to ensure the ConfigMap and
> Secret (step 6) exist, since the Job reads the connection string from them.

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
and make it trivial to capture in logs/CI. It is supplied out-of-band (the same
value as `TF_VAR_db_password`) and only ever lands in the Kubernetes Secret — never
on disk, never in Git. `.gitignore` also blocks committing real
`k8s/secrets/*.yaml` / `k8s/base/configmap.yaml` files as defense-in-depth.

## Operational procedure

* **Rotate the DB password:** change it in RDS, re-run the script with the new
  `DB_PASSWORD`, then restart the backend (`kubectl -n hosting-platform rollout
  restart deployment/backend`) so it picks up the new Secret.
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
`AWS__*` from the ConfigMap/Secret; the frontend uses same-origin `/api`). The ECR
repositories are created by Terraform (see `06-terraform.md` "ECR Module"); retag
the built image with the repository URI (from the `ecr_*_repository_url` outputs)
and push. Repositories use immutable tags, so push each build under a unique tag
(e.g. the Git commit SHA). Tagging and pushing are manual — see bootstrap step 5.

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

# HTTPS, certificates and DNS

## Architecture

The platform's own endpoint is served over **HTTPS terminated at the ALB**, with
the HTTP listener redirecting to HTTPS (`k8s/ingress/alb-ingress.yaml`:
`listen-ports`, `ssl-redirect`). HTTPS is **mandatory**: the backend issues
`Secure` session cookies in Production, which browsers drop over plain HTTP, so
without HTTPS authentication silently breaks. The ALB presents an **ACM
certificate** supplied via the `alb.ingress.kubernetes.io/certificate-arn`
annotation, which `deploy.yml` fills from the `ACM_CERTIFICATE_ARN` secret at
apply time. (Published user sites are separate — CloudFront serves them over HTTPS
with its own default certificate.)

## ACM certificate process

The certificate is **created and DNS-validated by Terraform** (ACM module, see
`06-terraform.md`), not by hand in the console:

* Set `domain_name` + `hosted_zone_name` in the environment `terraform.tfvars`.
* `terraform apply` creates the certificate, writes the Route53 validation records
  into the hosted zone, and waits until the certificate is **Issued**.
* Read the ARN from the `acm_certificate_arn` output and store it in the
  `ACM_CERTIFICATE_ARN` GitHub secret.

The certificate is **regional** (issued in the ALB's region, e.g. `eu-central-1`) —
not `us-east-1`, which is only for CloudFront.

## Domain requirements

A **custom domain is required** — ACM cannot issue a public certificate for an
AWS-owned `*.elb.amazonaws.com` name. Registering the domain is an external
purchase and is intentionally **not** managed by Terraform.

## DNS configuration

* **Hosted zone (manual, one-time).** Create a **public Route53 hosted zone** for
  the domain and delegate the registrar's nameservers to it. Terraform reads this
  zone via a data source; keeping zone creation + registrar delegation manual lets
  a single `terraform apply` both create and validate the certificate (a
  Terraform-created zone would need a two-phase apply: create zone → delegate NS →
  then validation can pass). This is a deliberate MVP boundary.
* **Validation records (automatic).** Terraform manages the ACM `_acme`-style
  CNAME validation records in the zone.
* **ALB alias record (manual, one-time, post-deploy).** After the first deploy
  creates the ALB, add a Route53 **A/AAAA alias** record for `domain_name`
  pointing at the ALB (its hostname is in the deploy summary, or
  `kubectl -n hosting-platform get ingress hosting-platform`). This is manual
  because the ALB is created by the AWS Load Balancer Controller, not Terraform, so
  its hostname is unknown at infra-apply time. The ALB hostname is stable across
  redeploys (as long as the Ingress is not deleted), so this is a one-time step.
  Automating it with **`external-dns`** is the documented future improvement.

## ALB integration

`deploy.yml` applies the Ingress last, substituting the real ARN:
`sed "s#REPLACE_WITH_ACM_CERTIFICATE_ARN#${ACM_CERTIFICATE_ARN}#" ... | kubectl apply`.
The Ingress carries no host rule, so it also answers on the raw ALB hostname during
testing; the ACM certificate is presented on the HTTPS listener regardless.

## Bootstrap sequence (HTTPS-specific)

1. Register the domain; create the public hosted zone; delegate registrar NS.
2. Set `domain_name` + `hosted_zone_name`; `terraform apply`; the certificate is
   issued.
3. Put `acm_certificate_arn` into the `ACM_CERTIFICATE_ARN` secret.
4. First `deploy.yml` run provisions the ALB and applies the Ingress with the cert.
5. Add the Route53 alias record → ALB. HTTPS on the custom domain is now live.

## Operational procedure and renewal

* **Renewal is automatic.** DNS-validated ACM certificates renew themselves as long
  as the validation records (managed by Terraform) remain in the zone. There is no
  expiry step to run and no cron.
* **Changing the domain** — update `domain_name`/`hosted_zone_name`, `terraform
  apply`, update the `ACM_CERTIFICATE_ARN` secret and the alias record, and
  re-run `deploy.yml`.
* **No manual AWS Console steps** are required for the certificate itself; the only
  manual actions are the domain purchase, the hosted zone + registrar delegation,
  and the one-time ALB alias record — all outside the certificate lifecycle.

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
  code rollback is safe without a schema rollback. This also covers the brief
  window during a rollout where an old and a new pod may both run.
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
summary (including the ALB hostname once provisioned).

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
  images, install the load balancer controller, or create the ConfigMap/Secret —
  those are the manual bootstrap above. It *does* apply database migrations, via
  the pre-rollout migration Job (see "Database migrations").
* **Long-lived AWS keys** (OIDC recommended later — see the security note).
* **Single-replica backend.** The backend has no HPA (in-memory queue +
  ephemeral Data Protection keys); see `07-kubernetes.md` "Backend Replicas".
* **Migrations are not auto-reverted.** They are applied automatically before each
  rollout (idempotent Job), but a code rollback does not roll back the schema —
  prefer backward-compatible migrations (see "Database migrations").
* **Verified locally by structure only.** The workflow's live behavior (kubectl
  access, ALB provisioning, rollout) can only be confirmed against a real cluster.
