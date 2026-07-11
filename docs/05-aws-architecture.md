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
├── CloudFront (user sites)
│
├── CloudFront (platform entry point, fronting the ALB)
│
├── ECR
│
├── IAM
│
└── Terraform State Bucket
```

> **No Route53, no ACM, no custom domain.** The platform runs entirely on
> AWS-managed endpoints: both CloudFront distributions serve HTTPS on their
> default `*.cloudfront.net` domains (see "HTTPS Without a Custom Domain"). The
> dormant ACM Terraform module is retained for future custom-domain support.

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

> **Known limitation — must be addressed before real users.** Because every
> hosted site lives under a path on the **same CloudFront domain, all tenant
> sites share a single web origin**. Any hosted site's JavaScript therefore runs
> same-origin with every other hosted site, enabling cross-tenant tampering with
> `localStorage`/service workers and convincing phishing between tenants. There
> is no platform authentication on this origin, so the blast radius is limited
> today, but this is acceptable only while the platform has no untrusted users.
> The standard fix (used by Netlify/Vercel/GitHub Pages) is a **subdomain per
> site**, which requires a custom domain + wildcard certificate and is planned
> alongside custom-domain support.

> **Known limitation — SPA deep links.** The rewrite function maps any
> extension-less path to `{path}/index.html`. For a single-page app using
> client-side routing (React Router, Vue Router, Angular Router), refreshing or
> deep-linking a client route (e.g. `/{userId}/{projectId}/about`) resolves to
> `.../about/index.html`, which does not exist in S3 — the visitor gets a raw
> XML error instead of the app. On a dedicated distribution this is fixed with a
> custom error response to the site's `index.html`, but on the **shared**
> distribution there is no per-site error target, so this cannot be fixed in the
> current model. SPAs load correctly at their root URL; only client-route
> refresh/deep-linking is affected. The fix arrives with per-site subdomains.

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

# HTTPS Without a Custom Domain

The platform's own web endpoint (frontend + `/api`) is served over **HTTPS
terminated at a dedicated CloudFront distribution** on its default
`*.cloudfront.net` domain, with the ALB as the distribution's HTTP origin
(`terraform/modules/cloudfront-platform`). HTTPS is mandatory, not optional:
the backend issues `Secure` session cookies in Production, which browsers drop
over plain HTTP, so serving the app over HTTP would silently break
authentication. The browser-facing hop is always HTTPS.

## Why CloudFront and not the ALB

An ACM public certificate **cannot** be issued for an AWS-owned
`*.elb.amazonaws.com` name, so the raw ALB hostname can never serve valid
HTTPS — and buying a domain is a cost this project deliberately avoids. The
CloudFront default certificate provides valid, AWS-renewed TLS for free. The
ALB therefore exposes an **HTTP-only listener** and is reached only by
CloudFront (the direct-HTTP bypass is an accepted, documented limitation — see
`16-deployment.md` "Direct ALB access").

## Distribution shape

The platform distribution does **no caching** (managed `CachingDisabled` +
`AllViewer` policies, all HTTP methods) — it is purely the TLS entry point in
front of the ALB. Because the ALB only exists after the first deploy (the AWS
Load Balancer Controller creates it), the distribution is created by a second
`terraform apply` once `alb_dns_name` is known — see `16-deployment.md` "HTTPS
via the CloudFront default domain".

## Relationship to the user-sites CloudFront

Published user sites are served by the **other** CloudFront distribution, also
on its default `*.cloudfront.net` certificate — that was already the case and is
unchanged. The two distributions stay separate because user sites occupy the
path root of theirs (`/{userId}/{projectId}`), which would collide with the
platform frontend at `/`.

## Custom domain (future)

A custom domain (with the dormant ACM module, a Route53 zone, and an alias on
the platform distribution) remains a documented future enhancement; nothing in
the application code assumes any hostname.

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
* Custom domain support (re-enable the dormant ACM module; Route53 hosted zone +
  alias on the platform CloudFront distribution — see "HTTPS Without a Custom
  Domain")
* Restricting the ALB to CloudFront via the origin-facing managed prefix list
* CloudWatch Monitoring
* Advanced Auto Scaling
* Multiple Environments (Dev / Stage / Prod)
