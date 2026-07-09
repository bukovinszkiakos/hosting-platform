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
│ ├── ecr
│ ├── acm
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
module "ecr"
module "acm"
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

The API endpoint has both private and public access enabled. `kubernetes_version`
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
* Create Bucket Policies
* Configure Public Access Settings

## Outputs

* bucket_name
* bucket_arn

---

# CloudFront Module

## Responsibilities

* Create CloudFront Distribution
* Configure S3 Origin
* Attach a CloudFront Function that rewrites directory requests to `index.html`
  (sites are served under `/{userId}/{projectId}/`, where `default_root_object`
  does not apply)

## Inputs

* bucket_name

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

# ACM Module

## Responsibilities

* Create a **DNS-validated ACM certificate** for the platform's public HTTPS
  endpoint (the ALB Ingress), in the ALB's region
* Create the Route53 validation records in an existing hosted zone
* Wait (`aws_acm_certificate_validation`) until the certificate is issued

## Inputs

* domain_name (empty disables the module — no certificate is created)
* hosted_zone_name (the existing public Route53 zone authoritative for the domain;
  required when `domain_name` is set)
* subject_alternative_names (optional)

## Outputs

* certificate_arn (null when disabled) — set as the `ACM_CERTIFICATE_ARN` GitHub
  secret; the deploy workflow injects it into the ALB Ingress
* domain_name
* hosted_zone_id

## Design notes

* **Gated on `domain_name`.** With no domain (the default in both environments),
  the module creates nothing and the environment still applies cleanly. Set
  `domain_name` + `hosted_zone_name` in `terraform.tfvars` to enable HTTPS.
* **DNS validation, so it auto-renews.** As long as the Route53 validation records
  remain, ACM renews the certificate automatically — no operator action and no
  expiry outage (see `16-deployment.md` "Renewal").
* **Regional certificate.** It lives in the ALB's region (unlike the CloudFront
  distribution for user sites, which uses its own default certificate), so no
  `us-east-1` provider alias is needed.

## Scope boundary — what is intentionally NOT in Terraform

* **Domain registration** — an external purchase, not IaC.
* **The Route53 hosted zone + registrar NS delegation** — a one-time manual
  prerequisite. The module consumes the existing zone via a data source so a single
  `terraform apply` can both create and validate the certificate (creating the zone
  in the same apply would force a two-phase apply: create zone → delegate at the
  registrar → then validation can pass).
* **The ALB alias record** — the ALB is created by the AWS Load Balancer Controller
  after the app deploys, so its hostname is unknown at infra-apply time; the record
  is added once, post-deploy (`external-dns` is the future automation). See
  `16-deployment.md` "HTTPS, certificates and DNS".

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

* Terraform-managed Route53 hosted zone (today the zone + registrar NS delegation
  are a manual prerequisite; ACM certificate issuance/validation is already managed
  by the ACM module)
* `external-dns` to manage the ALB Route53 alias record automatically
* AWS Secrets Manager
* CloudWatch
* Advanced Auto Scaling
* Multi-Region AWS Support
* **RDS security group scoped to the EKS security group** instead of the VPC
  CIDR (tighter than the current private-subnet + VPC-CIDR isolation; deferred to
  avoid cross-module coupling for marginal MVP benefit).
* **CloudFront Origin Access Control (OAC)** to lock the S3 bucket to CloudFront
  only. Deferred because the hosted content is intentionally public static sites,
  so OAC's benefit is marginal for the MVP.
* **Highly available NAT** (one NAT Gateway per AZ) for production resilience;
  the MVP uses a single NAT Gateway for cost.
