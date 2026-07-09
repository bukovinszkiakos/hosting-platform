# Terraform

Infrastructure as Code for the Hosting Platform (see `docs/05-aws-architecture.md`
and `docs/06-terraform.md`).

## Layout

```text
terraform/
├── backend/                 # Remote state bootstrap: S3 state bucket (S3 native locking, no DynamoDB)
├── modules/                 # Reusable modules
│   ├── vpc/                 # VPC, public/private subnets, IGW, NAT, route tables
│   ├── eks/                 # EKS cluster, managed node group, cluster/node IAM roles, Pod Identity Agent addon
│   ├── rds/                 # PostgreSQL, subnet group, security group
│   ├── s3/                  # Static-site hosting bucket + public-read policy
│   ├── cloudfront/          # CDN/HTTPS distribution + index.html rewrite function
│   ├── ecr/                 # Backend + frontend container image repositories (scan on push, lifecycle policy)
│   ├── acm/                 # DNS-validated ACM certificate for the ALB HTTPS listener (gated on domain_name)
│   └── iam/                 # Backend + ALB Controller IAM roles (least privilege) + Pod Identity associations
└── environments/
    ├── dev/                 # Cost-minimized development environment
    └── prod/                # Production-sized environment
```

## Environments

Both environments compose the same modules; they differ only in variables:

| Setting              | dev                  | prod                  |
| -------------------- | -------------------- | --------------------- |
| VPC CIDR             | `10.0.0.0/16`        | `10.1.0.0/16`         |
| Availability Zones   | 2                    | 3                     |
| EKS nodes            | `t3.medium`, 2 desired (1–3) | `t3.large`, 3 desired (2–5) |
| RDS                  | `db.t3.micro`, single-AZ, 1-day backups, no final snapshot | `db.t3.small`, Multi-AZ, 7-day backups, final snapshot, deletion protection, storage autoscaling |
| CloudFront price     | `PriceClass_100`     | `PriceClass_All`      |
| Approx. idle cost    | ~$7/day (~$210–220/mo) | ~$400–450/mo         |

> **`prod` is a reference configuration** — do not apply it in a personal AWS
> account (~$400–450/month). Deploy and demo `dev` only. See
> `docs/16-deployment.md` "Cost and teardown".

## Deploy

The database password is **never committed**. Provide it out-of-band:

```bash
export TF_VAR_db_password="<strong-password>"
```

Use letters, digits and `!#$%^&*()_+=.,:?~-` only — RDS forbids `/ @ "` and
spaces, and `; '` would corrupt the connection string that
`scripts/deployment/bootstrap-config.sh` builds. Both the variable validation and
the script enforce this.

`hosting_bucket_name` in `terraform.tfvars` must be globally unique across all of
AWS S3 — adjust it if the default name is taken.

To enable HTTPS on the platform's ALB endpoint, set `domain_name` and
`hosted_zone_name` in `terraform.tfvars` (an existing public Route53 hosted zone is
required — see `docs/16-deployment.md` "HTTPS, certificates and DNS"). Left empty
(the default), the ACM module is a no-op and the environment still applies.

**Prod only:** `cluster_endpoint_public_access_cidrs` is a required variable with
no default — a production apply must explicitly list the trusted administration
CIDRs allowed to reach the public EKS API endpoint (see the commented example in
`environments/prod/terraform.tfvars`). Dev keeps the open default.

Node counts are **static**: there is no Cluster Autoscaler/Karpenter, so the node
group min/max only bound manual resizing (see `docs/07-kubernetes.md` "Node
Capacity"). Dev explicitly runs 2 × t3.medium — the minimum on which a build Job
(1000m CPU) can schedule next to the apps.

### 1. Bootstrap remote state (once per AWS account)

Create the S3 bucket that stores Terraform state. State locking uses S3 native
locking (`use_lockfile`), so no DynamoDB table is needed.

```bash
# From the repository root:
scripts/terraform/bootstrap-remote-state.sh
```

The script runs `terraform init` + `apply` in `terraform/backend/` and then prints
the exact backend block + migrate command for the next step. (Equivalent manual
run: `terraform -chdir=terraform/backend init && terraform -chdir=terraform/backend
apply`.)

Notes:

* `terraform/backend/` uses **local state** — it cannot store its own state in the
  bucket it is creating (chicken-and-egg). This is expected; the bucket changes
  rarely. Keep the local `terraform/backend/terraform.tfstate` (it is gitignored,
  never committed).
* Creating the bucket is **idempotent** — re-running the script is safe.
* The bucket has `prevent_destroy` set, so Terraform will refuse to delete it (it
  holds every environment's state). See "Recovery / teardown" below.

### 2. Enable the S3 backend and migrate state (once per environment)

For each environment (`dev`, then `prod`):

1. In `environments/<env>/main.tf`, uncomment the `backend "s3"` block (left
   commented so the config validates locally before the bucket exists). It must
   read exactly (only the `key` differs per environment):

   ```hcl
   backend "s3" {
     bucket       = "hosting-platform-tfstate"   # the bucket_name from step 1
     key          = "<env>/terraform.tfstate"
     region       = "eu-central-1"
     use_lockfile = true
     encrypt      = true
   }
   ```

2. Migrate the environment's local state into the bucket:

   ```bash
   terraform -chdir=terraform/environments/<env> init -migrate-state
   # answer "yes" to copy existing state to the S3 backend
   ```

If you changed `bucket_name`/`aws_region` in step 1, use those values in the block.

### 3. Apply an environment

```bash
cd terraform/environments/dev      # or prod
terraform init
terraform plan
terraform apply
```

### Recovery / teardown

* **Bucket name already taken** (S3 names are global): set a unique `bucket_name`
  (`TF_VAR_bucket_name` or edit `terraform/backend/variables.tf`) and re-run, then
  use that name in every `backend "s3"` block.
* **`bootstrap-remote-state.sh` interrupted:** just re-run it — bucket creation is
  idempotent and any missing sub-resources (versioning/encryption/public-access
  block) are reconciled.
* **Lost local `terraform/backend/terraform.tfstate` but the bucket exists:** don't
  re-apply blindly (Terraform would try to recreate an existing bucket and fail).
  Re-import it: `terraform -chdir=terraform/backend import
  aws_s3_bucket.tfstate hosting-platform-tfstate`, then `apply` to reconcile.
* **Corrupted/rolled-back environment state:** the bucket has versioning enabled —
  restore a previous version of `<env>/terraform.tfstate` from S3.
* **Intentional teardown of the state bucket:** remove the `prevent_destroy` block
  in `terraform/backend/main.tf` first (it is deliberately guarded), then
  `terraform -chdir=terraform/backend destroy`. Do this only after every
  environment has been destroyed.

> **Destroying an environment:** the ALB is created by the AWS Load Balancer
> Controller, **not** Terraform, so `terraform destroy` will not remove it —
> delete the Kubernetes Ingress and wait for the ALB to disappear **before**
> running destroy, or it keeps billing and can block the VPC teardown. This is a
> portfolio project: destroy `dev` between demos (it is designed to be
> disposable) rather than leaving it idling at ~$7/day. Full runbook:
> `docs/16-deployment.md` "Cost and teardown".

## Validate

No AWS credentials required:

```bash
terraform fmt -recursive -check
terraform -chdir=environments/dev validate
terraform -chdir=environments/prod validate
```
