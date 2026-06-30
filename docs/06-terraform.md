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

## DynamoDB Lock

Purpose:

* State locking
* Preventing concurrent modifications

---

# VPC Module

## Responsibilities

* Create VPC
* Create Public Subnets
* Create Private Subnets
* Create Internet Gateway
* Create NAT Gateway
* Create Route Tables

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
