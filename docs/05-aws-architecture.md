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
├── DynamoDB
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

---

# NAT Gateway

Provides internet access for resources running inside private subnets.

Examples:

* Accessing GitHub repositories
* Downloading npm packages
* Downloading Docker images

Kubernetes Build Jobs access external services through the NAT Gateway.

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

---

# Terraform Backend

Terraform state is not stored locally.

## Backend Components

### S3 Bucket

Stores Terraform state files.

### DynamoDB Table

Provides state locking functionality.

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
