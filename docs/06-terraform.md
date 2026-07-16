# 06-terraform.md

# Terraform Architecture

# Overview

The entire AWS infrastructure is created and managed using Terraform.

The goal is to establish a modular, reusable, and maintainable Infrastructure as Code architecture.

All AWS resources are provisioned through Terraform.

---

# Terraform Principles

The project follows the following principles:

* Infrastructure as Code
* Modular architecture
* Environment-specific configuration
* Remote State management
* Variable Validation
* Outputs for communication between modules

---

# Repository Structure

```text id="y3ndcm"
terraform/
├── environments
│
│ ├── dev
│ │ ├── main.tf
│ │ ├── variables.tf
│ │ ├── terraform.tfvars
│ │ └── outputs.tf
│ │
│ └── prod
│   ├── main.tf
│   ├── variables.tf
│   ├── terraform.tfvars
│   └── outputs.tf
│
├── modules
│
│ ├── vpc
│ ├── eks
│ ├── rds
│ ├── s3
│ ├── cloudfront
│ ├── cloudfront-platform
│ ├── ecr
│ ├── acm          (dormant — kept for future custom-domain support)
│ └── iam
│
└── backend
```

---

# Root Module Responsibilities

The environment-specific `main.tf` files are responsible only for invoking modules.

Example:

```hcl id="g5ttt4"
module "vpc"
module "eks"
module "rds"
module "s3"
module "cloudfront"
module "cloudfront_platform"
module "ecr"
module "iam"
```

The actual infrastructure resources are defined inside the modules.

---

# Module Structure

Every module follows the same structure.

Example:

```text id="0vc2lz"
modules/vpc
├── main.tf
├── variables.tf
└── outputs.tf
```

---

# Variables

Each module contains its own `variables.tf` file.

Variables must include:

* Type definitions
* Descriptions
* Validation rules

Example:

```hcl id="xj4m7v"
variable "vpc_cidr"
```

Validation examples:

* CIDR format validation
* Empty value prevention
* Allowed range validation

---

# Outputs

Each module contains an `outputs.tf` file.

Outputs are used for:

* Connecting modules together
* Exporting infrastructure information

Examples:

* vpc_id
* private_subnet_ids
* eks_cluster_name
* rds_endpoint
* bucket_name

---

# Remote State

Terraform state is not stored locally.

## S3 Backend

Purpose:

* Store Terraform state files.
* State locking via S3 native locking (`use_lockfile`, Terraform >= 1.11), which
  prevents concurrent modifications without a separate DynamoDB table.

## Enablement Sequence

Remote state must be enabled before the first production apply (otherwise state,
including the RDS password, stays in a local file with no locking). Because the
backend bucket must exist before it can hold state:

1. Create the state bucket: `scripts/terraform/bootstrap-remote-state.sh` (runs
   `terraform apply` in `terraform/backend/` with local state; idempotent).
2. Uncomment the `backend "s3"` block in each environment (`use_lockfile = true`),
   using the bucket name/region the script prints.
3. Run `terraform init -migrate-state` per environment to move local state into S3.

The state bucket has versioning + encryption + a public-access block, and
`prevent_destroy` so it cannot be deleted accidentally. `terraform/backend/` itself
uses **local state** (it cannot hold its own state in the bucket it creates). See
`terraform/README.md` "Remote state bootstrap" for the full operator runbook,
including recovery and intentional teardown.

---

# VPC Module

## Responsibilities

* Create VPC
* Create Public Subnets
* Create Private Subnets
* Create Internet Gateway
* Create NAT Gateway
* Create Route Tables
* Create an S3 Gateway VPC Endpoint (free; keeps S3 traffic off the NAT Gateway)

## Outputs

* vpc_id
* public_subnet_ids
* private_subnet_ids

---

# EKS Module

## Responsibilities

* Create EKS Cluster
* Create Managed Node Group
* Create Cluster IAM Roles
* Enable the EKS Pod Identity Agent addon
* Enable the Metrics Server addon (community add-on; supplies the
  `metrics.k8s.io` API the frontend HPA scales on — see `07-kubernetes.md`
  "Horizontal Pod Autoscaler"; runs on the existing nodes, no additional AWS
  cost)

The API endpoint has both private and public access enabled. The cluster's
authentication mode is set explicitly to `API_AND_CONFIG_MAP`: the CI deploy role
(GitHub OIDC) is granted cluster access via an **EKS access entry** created by the
IAM module (`modules/iam/github-oidc.tf`), which access entries require — clusters
created through the API/Terraform would otherwise default to `CONFIG_MAP`, where
access entries are rejected. The cluster creator retains admin access
(`bootstrap_cluster_creator_admin_permissions = true`).
`kubernetes_version`
defaults to an EKS standard-support release (currently `1.34`) to avoid
extended-support pricing; verify the standard-support range at deploy time.
`cluster_endpoint_public_access_cidrs` defaults to open (dev); in **prod** the
environment declares it as a **required variable with no default**, so a
production apply must explicitly list trusted administration CIDRs — the
documented hardening cannot be skipped silently.

The node group has **no autoscaler** (no Cluster Autoscaler/Karpenter): min/max
sizes only bound manual resizing, so node capacity is effectively static (see
`07-kubernetes.md` "Node Capacity"). Each environment sets its node sizing
explicitly rather than relying on module defaults.

## Inputs

* vpc_id
* private_subnet_ids

## Outputs

* cluster_name
* cluster_endpoint
* node_group_name

---

# RDS Module

## Responsibilities

* Create PostgreSQL Database
* Create Subnet Group
* Create Security Group

Production hardening is available through variables (wired in the prod
environment): `deletion_protection`, `final_snapshot_identifier` (required when
`skip_final_snapshot = false`), and `max_allocated_storage` (storage autoscaling
cap). Dev leaves these at their cheaper defaults.

## Master password

The instance has `lifecycle { ignore_changes = [password] }`. The master
password is set **once at creation** from `var.db_password` (which `up.sh`
injects from the write-once SSM `SecureString` — see `16-deployment.md`
"Database password") and Terraform never modifies it again, so a later
`terraform apply` can never silently reset the live credential. Rotation is a
deliberate out-of-band runbook, not a side effect of apply.

## Outputs

* database_endpoint
* database_name
* database_username (non-secret; used to build the backend connection string during
  the config/secret bootstrap — see `16-deployment.md`)

Each environment additionally exposes an `aws_region` output; together with the
RDS/S3/CloudFront outputs it lets `scripts/deployment/bootstrap-config.sh` fill the
ConfigMaps/Secret without hand-copying. The database **password** is deliberately
not an output (it would be printed in plaintext); it is supplied out-of-band.

---

# S3 Module

## Responsibilities

* Create Hosting Bucket
* Enforce server-side encryption (AES256)
* Block all public access (the bucket is private; the CloudFront OAC read policy
  is defined in the CloudFront module because it needs the distribution ARN)

## force_destroy

The `force_destroy` variable (default `false`) lets `terraform destroy` remove
the bucket even when it still holds published site objects. It is `true` in
`dev` (ephemeral — mirrors ECR `force_delete` and RDS `skip_final_snapshot`, so
teardown never fails with `BucketNotEmpty`) and `false` in `prod` (published
content must never be deleted silently). See `16-deployment.md` "Teardown order".

## Outputs

* bucket_name
* bucket_arn
* bucket_regional_domain_name

---

# CloudFront Module

## Responsibilities

* Create CloudFront Distribution
* Configure the S3 Origin with Origin Access Control (OAC) so CloudFront reads
  the private bucket via SigV4-signed requests
* Attach the OAC bucket policy to the hosting bucket (defined here, not in the S3
  module, so it can reference this distribution's ARN without a dependency cycle)
* Attach a CloudFront Function that rewrites directory requests to `index.html`
  (sites are served under `/{userId}/{projectId}/`, where `default_root_object`
  does not apply)

## Inputs

* bucket_name
* bucket_regional_domain_name (from the s3 module — not a data-source lookup, which
  would fail at plan time while the bucket does not exist yet)
* bucket_arn (from the s3 module — used by the OAC bucket policy)

## Outputs

* cloudfront_domain_name
* cloudfront_distribution_id

---

# ECR Module

## Responsibilities

* Create one private ECR repository per application (backend + frontend), named
  `{name_prefix}-backend` and `{name_prefix}-frontend`
* Enable image vulnerability scanning on push
* Enforce a lifecycle policy that bounds storage growth

## Inputs

* name_prefix

Behaviour is tunable through variables with production-safe defaults:
`scan_on_push` (default `true`), `image_tag_mutability` (default `IMMUTABLE`),
`max_image_count` (default `10`), `untagged_image_expiry_days` (default `1`), and
`force_delete` (default `false`; the dev environment sets it `true` so
`terraform destroy` can remove repositories that still hold images).

## Outputs

* repository_urls (map: `backend` / `frontend` -> repository URI)
* repository_arns
* repository_names

## Design notes

* **Per-environment repositories.** Each environment owns its own repositories
  (`hosting-platform-dev-*`, `hosting-platform-prod-*`), so a fresh AWS account
  can stand up either environment independently. This matches the naming
  convention used by every other resource.
* **Immutable tags.** A deployed tag always maps to exactly one image, which
  makes rollbacks and audits unambiguous. Push each build under a unique tag
  (e.g. the Git commit SHA) rather than reusing a moving tag.
* **Scan on push.** ECR basic scanning runs automatically on every push, so known
  CVEs surface without a separate pipeline step.
* **Lifecycle policy.** Two rules keep storage bounded:
  1. expire **untagged** images after `untagged_image_expiry_days` (default 1);
  2. keep only the `max_image_count` most recent images (default 10).
  Ten images gives comfortable rollback headroom for a small project while
  preventing unbounded growth. ECR requires the `tagStatus = "any"` rule to have
  the highest priority (evaluated last), so untagged cleanup runs first.
* **Pulls.** The EKS node role already has `AmazonEC2ContainerRegistryReadOnly`
  (EKS module), so no additional IAM is required for the cluster to pull images.

The GitHub Actions deploy workflow assumes these repositories already exist and
only builds/tags/pushes images to them (image build/push is not yet automated —
see `16-deployment.md`).

---

# CloudFront Platform Module

The HTTPS entry point for the **platform itself** — a second CloudFront
distribution whose default `*.cloudfront.net` domain is the platform's public
URL, with the ALB as its HTTP origin. This is what lets the platform run
without a custom domain or certificate (see `05-aws-architecture.md` "HTTPS
Without a Custom Domain" and `16-deployment.md` "HTTPS via the CloudFront
default domain").

## Responsibilities

* Create the platform CloudFront distribution (default CloudFront certificate,
  `redirect-to-https`)
* Pass all traffic through uncached (managed `CachingDisabled` cache policy +
  `AllViewer` origin request policy, all HTTP methods) to the ALB origin over
  HTTP

## Inputs

* name_prefix
* alb_dns_name (empty — the default — disables the module; validated to end in
  `.elb.amazonaws.com` when set)
* price_class (default `PriceClass_100`)

## Outputs

* domain_name (null when disabled) — the platform's public HTTPS URL
* distribution_id (null when disabled)

## Design notes

* **Gated on `alb_dns_name` (two-phase apply).** The ALB is created by the AWS
  Load Balancer Controller when the Ingress is first applied, so its DNS name is
  unknown on the initial `terraform apply`. Apply once with the default, run the
  first deploy, then write the ALB hostname into the gitignored
  `environments/<env>/alb_dns_name.auto.tfvars` (Terraform auto-loads it; `up.sh`
  Phase 8 does this) and apply again. A teardown/re-bootstrap produces a new ALB
  hostname, so this step repeats per environment lifetime.
* **Separate from the user-sites distribution.** User sites occupy the path root
  of theirs (`/{userId}/{projectId}`), which would collide with the platform
  frontend at `/`; a distribution has no fixed cost, so separation is free.
* **`PriceClass_100` even in prod.** With caching disabled the distribution is a
  TLS terminator, not a CDN — wider edge coverage buys little.

---

# ACM Module (dormant)

**Not wired into any environment.** The platform serves HTTPS on the CloudFront
default domain instead (CloudFront Platform Module above), so no custom domain
or certificate is required. The module is kept in the repository because it
costs nothing and preserves the re-enable path for custom-domain support.

When dormant it documents (and on re-enable would provide): a DNS-validated ACM
certificate created through an existing Route53 hosted zone, gated on
`domain_name` (empty creates nothing). To reintroduce a custom domain: re-add
the module call plus `domain_name`/`hosted_zone_name` variables in the
environment, attach the certificate to the platform CloudFront distribution as
an alias (CloudFront certificates are issued in `us-east-1`) or to an ALB HTTPS
listener (regional), and point a Route53 alias record at the chosen entry
point — see `16-deployment.md` "Reintroducing a custom domain".

Domain registration and the Route53 hosted zone + registrar NS delegation were
always intentionally outside Terraform and would remain manual steps.

---

# IAM Module

## Responsibilities

* Backend Service IAM Role (S3 + CloudFront, least privilege)
* EKS Pod Identity association binding that role to the `hosting-platform`
  Kubernetes service account
* AWS Load Balancer Controller IAM Role + Pod Identity association (bound to the
  `aws-load-balancer-controller` service account in `kube-system`), so the
  controller can provision the ALB for the Ingress. Its policy is the official
  controller policy (`alb-controller-iam-policy.json`, corresponding to controller
  `v2.11.x`) and must be kept in sync with the installed controller version. The
  controller itself is installed out-of-band via Helm
  (`scripts/deployment/install-alb-controller.sh`), not by Terraform — see
  `16-deployment.md` "AWS Load Balancer Controller".

(The EKS cluster and node-group IAM roles are created in the EKS module, since
a cluster cannot be created without them.)

## Inputs

* hosting_bucket_arn
* cloudfront_distribution_id
* eks_cluster_name

Permissions follow the Principle of Least Privilege. The backend role is never
attached to the node group; pods receive it only through the Pod Identity
association and the `hosting-platform` service account.

---

# Environment Strategy

# Dev

Development environment.

## Characteristics

* Smaller resources
* Lower costs

---

# Prod

Production environment.

## Characteristics

* Stable configuration
* Optimized for production usage

---

# Future Improvements

Future versions may include:

* Custom domain support: re-enable the dormant ACM module, add a Route53 hosted
  zone and an alias on the platform CloudFront distribution (see "ACM Module
  (dormant)")
* Restricting the ALB origin to CloudFront via the
  `com.amazonaws.global.cloudfront.origin-facing` managed prefix list
* AWS Secrets Manager
* CloudWatch
* Advanced Auto Scaling
* Multi-Region AWS Support
* **RDS security group scoped to the EKS security group** instead of the VPC
  CIDR (tighter than the current private-subnet + VPC-CIDR isolation; deferred to
  avoid cross-module coupling for marginal MVP benefit).
* **Highly available NAT** (one NAT Gateway per AZ) for production resilience;
  the MVP uses a single NAT Gateway for cost.
