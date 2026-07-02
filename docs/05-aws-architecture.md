# 05-aws-architecture.md

# AWS Architecture

# Overview

The platform runs on AWS infrastructure managed through Terraform using an Infrastructure as Code approach.

The AWS environment is responsible for:

* Running platform applications
* Storing static websites
* Supporting deployment workflows
* Storing metadata
* Securely managing Terraform state

---

# High Level AWS Architecture

```text id="cly0ib"
AWS
├── VPC
│
├── Public Subnets
│   ├── Application Load Balancer
│   └── NAT Gateway
│
├── Private Subnets
│   ├── EKS Cluster
│   └── RDS PostgreSQL
│
├── S3
│
├── CloudFront
│
├── IAM
│
└── Terraform State Bucket
```

---

# VPC

The entire infrastructure runs inside a dedicated Virtual Private Cloud (VPC).

## Responsibilities

* Network isolation
* Resource separation
* Secure communication

---

# Public Subnets

Public subnets have internet connectivity.

## Responsibilities

* Hosting the Application Load Balancer
* Hosting the NAT Gateway

Kubernetes workloads do not run inside public subnets.

---

# Private Subnets

Private subnets are not directly accessible from the internet.

## Responsibilities

* Running EKS worker nodes
* Running the PostgreSQL database

This architecture helps protect both the application and the database.

---

# EKS Cluster

## Technology

* Amazon EKS

## Responsibilities

* Running the frontend
* Running the backend
* Running build jobs

The Kubernetes cluster is the primary runtime environment of the platform.

---

# Frontend Deployment

The Next.js application runs as a Kubernetes Deployment.

## Responsibilities

* Providing the web interface
* Displaying dashboards
* Initiating API requests

---

# Backend Deployment

The ASP.NET Core Web API runs as a Kubernetes Deployment.

## Responsibilities

* Authentication
* Project management
* Deployment management
* AWS integration
* Kubernetes Job creation

---

# Build Jobs

During deployment execution, the backend creates Kubernetes Jobs.

## Responsibilities

1. Clone the repository
2. Detect the framework
3. Execute the build process
4. Upload build artifacts to S3

The Job automatically terminates after successful completion.

---

# PostgreSQL Database

## Technology

* Amazon RDS PostgreSQL

## Stores

* Users
* Projects
* Deployments
* Build errors
* Deployment history

The database is accessible only within private subnets.

---

# S3 Storage

## Technology

* Amazon S3

## Purpose

Storage of generated static website files.

The MVP uses a shared bucket.

Example:

```text id="g6c2qn"
hosting-platform
├── user1/
│   ├── project1/
│   └── project2/
└── user2/
    └── project1/
```

---

# CloudFront

## Technology

* Amazon CloudFront

## Responsibilities

* HTTPS support
* CDN functionality
* Static website delivery

Users access published websites through CloudFront URLs.

Because each site is served under `/{userId}/{projectId}/` (not the distribution
root), a CloudFront Function rewrites directory requests to the site's
`index.html`, so the public URL resolves correctly:

```text
/{userId}/{projectId}      -> /{userId}/{projectId}/index.html
/{userId}/{projectId}/     -> /{userId}/{projectId}/index.html
```

---

# NAT Gateway

Provides internet access for resources running inside private subnets.

Examples:

* Accessing GitHub repositories
* Downloading npm packages
* Downloading Docker images

Kubernetes Build Jobs access external services through the NAT Gateway.

An S3 **Gateway VPC Endpoint** routes S3 traffic (for example a build job's
`aws s3 sync`) directly to S3 via the private route table instead of through the
NAT Gateway. Gateway endpoints are free, so this reduces NAT data-processing cost
with no additional charge.

---

# IAM

AWS Identity and Access Management roles are configured for the platform.

Examples:

* EKS Role
* Node Group Role
* Backend Service Role

Roles follow the Principle of Least Privilege.

The Backend Service Role (S3 + CloudFront access) is granted to pods through an
**EKS Pod Identity** association with the `hosting-platform` Kubernetes service
account, which the backend and the build Jobs run under. The node group role
carries no S3 or CloudFront permissions.

The **AWS Load Balancer Controller** role is granted the same way: a Pod Identity
association with the `aws-load-balancer-controller` service account (in
`kube-system`) gives the controller the permissions it needs to provision the
ALB for the Ingress. The controller itself is installed at deploy time (Helm).

---

# Terraform Backend

Terraform state is not stored locally.

## Backend Components

### S3 Bucket

Stores Terraform state files. State locking uses S3 native locking
(`use_lockfile`, Terraform >= 1.11), so no separate DynamoDB lock table is
required.

This ensures safe Terraform operations.

---

# Security Principles

The platform follows the following principles:

* Workloads run in private subnets
* RDS is not directly accessible from the internet
* Least Privilege IAM permissions
* Protected Terraform state
* HTTPS through CloudFront

---

# Future AWS Extensions

Future versions may include:

* AWS Secrets Manager
* Route53
* Custom Domains
* CloudWatch Monitoring
* Advanced Auto Scaling
* Multiple Environments (Dev / Stage / Prod)
