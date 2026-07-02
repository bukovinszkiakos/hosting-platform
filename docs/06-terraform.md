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

1. `terraform apply` the `terraform/backend/` config with local state to create
   the state bucket.
2. Uncomment the `backend "s3"` block in each environment (`use_lockfile = true`).
3. Run `terraform init -migrate-state` to move local state into S3.

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
`cluster_endpoint_public_access_cidrs` (default open) should be restricted to
trusted administration locations in production.

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

# IAM Module

## Responsibilities

* Backend Service IAM Role (S3 + CloudFront, least privilege)
* EKS Pod Identity association binding that role to the `hosting-platform`
  Kubernetes service account
* AWS Load Balancer Controller IAM Role + Pod Identity association (bound to the
  `aws-load-balancer-controller` service account in `kube-system`), so the
  controller can provision the ALB for the Ingress. Its policy is the official
  controller policy (`alb-controller-iam-policy.json`, pinned to controller
  v3.4.0) and must be kept in sync with the installed controller version.

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

* Route53
* ACM Certificates
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
