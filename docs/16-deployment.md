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
dependencies, and no container build pipeline yet).

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
5. **Container images** — the app is **not yet containerized in-repo** (no
   Dockerfiles, no ECR in Terraform). Build the backend and frontend images and
   push them to a registry (ECR intended), then pass the image URIs as
   `deploy.yml` inputs. Automating image build/push (Dockerfiles + ECR) is a
   future enhancement.
6. **ConfigMap + Secret** — create `backend-config` / `frontend-config` and
   `backend-secrets` in the `hosting-platform` namespace from the Terraform
   outputs and the DB connection string, using
   `k8s/base/configmap.example.yaml` and `k8s/secrets/secret.example.yaml` as
   templates. `deploy.yml` verifies these exist and fails early if not.
7. **Database schema** — RDS lives in private subnets and there is no
   auto-migrate on startup, so apply migrations manually (`dotnet ef database
   update` via a bastion/port-forward, or a one-off in-cluster migration Job).

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
