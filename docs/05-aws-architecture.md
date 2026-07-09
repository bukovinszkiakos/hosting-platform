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
├── ECR
│
├── ACM (ALB certificate)
│
├── IAM
│
└── Terraform State Bucket
```

> **Route53** hosts the DNS zone for the platform's custom domain. It is an AWS
> service but is **not** created by Terraform (see "HTTPS and Custom Domain" and
> `06-terraform.md` "ACM Module" for the boundary), so it is not shown above.

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

# ECR

## Technology

* Amazon Elastic Container Registry (ECR)

## Purpose

Private container registries for the platform's own application images (the
backend API and the frontend). Images are built and pushed during bootstrap and
pulled by the backend and frontend Kubernetes Deployments.

One repository per application, per environment
(`hosting-platform-{environment}-backend` and
`hosting-platform-{environment}-frontend`), so each environment is independently
reproducible. Repositories are created by Terraform (see `06-terraform.md` "ECR
Module"). Image scanning runs on push, and a lifecycle policy bounds storage by
retaining only recent images.

The EKS node group role carries `AmazonEC2ContainerRegistryReadOnly`, so nodes
pull these images directly; pulls to nodes in the private subnets egress through
the NAT Gateway.

> These registries hold the *platform's* images. Generated user websites are not
> containers — they are static files stored in S3 and served through CloudFront.

---

# HTTPS and Custom Domain

The platform's own web endpoint (frontend + `/api`) is served over **HTTPS
terminated at the Application Load Balancer**. HTTPS is mandatory, not optional:
the backend issues `Secure` session cookies in Production, which browsers drop over
plain HTTP, so serving the app over HTTP would silently break authentication. The
ALB's HTTP listener redirects to HTTPS.

## Certificate

HTTPS at the ALB needs an **ACM certificate in the ALB's region** (not
`us-east-1`, which is only for CloudFront). The certificate is **DNS-validated**
and provisioned by Terraform (see `06-terraform.md` "ACM Module"): Terraform
creates the certificate and the Route53 validation records and waits until the
certificate is issued. DNS validation means the certificate **auto-renews** with no
operator action as long as the validation records remain.

## Domain and DNS

A custom domain is required (an ACM public certificate cannot be issued for an
AWS-owned `*.elb.amazonaws.com` name). The domain and its Route53 **public hosted
zone** are an operator prerequisite:

* **Domain registration** and **registrar → Route53 nameserver delegation** are
  external, one-time, manual steps (a domain is a purchase; delegation is done at
  the registrar). Terraform consumes the existing hosted zone via a data source.
* After the first deployment creates the ALB, an **alias record** for the domain is
  pointed at the ALB. The ALB is created by the AWS Load Balancer Controller (not
  Terraform), so this record is added once, post-deploy (see
  `16-deployment.md` "HTTPS, certificates and DNS"; `external-dns` is the future
  automation).

## Relationship to CloudFront

This is separate from the **published user sites**, which are served by CloudFront
over HTTPS using its default `*.cloudfront.net` certificate. Only the platform's own
endpoint uses the ACM certificate + custom domain described here.

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
ALB for the Ingress. The controller itself is installed once via its Helm chart
(`scripts/deployment/install-alb-controller.sh`), reusing this role through Pod
Identity — see `16-deployment.md` "AWS Load Balancer Controller".

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
* `external-dns` to manage the ALB Route53 alias record automatically (today it is
  a one-time manual record — see "HTTPS and Custom Domain")
* Terraform-managed Route53 hosted zone (today the zone + registrar delegation are
  a manual prerequisite)
* CloudWatch Monitoring
* Advanced Auto Scaling
* Multiple Environments (Dev / Stage / Prod)
