# 03-architecture.md

# System Architecture

# Overview

The platform is a cloud-native static website hosting solution that enables users to automatically publish static websites by providing a public GitHub repository.

The infrastructure runs on AWS and is managed through Terraform, while the application components operate within a Kubernetes environment.

---

# High Level Architecture

```text
User
 │
 ▼
Next.js Frontend
 │
 ▼
ASP.NET Core Web API
 │
 ├── PostgreSQL (RDS)
 │
 ├── Kubernetes API
 │
 └── AWS SDK
 │
 ▼
 S3
 │
 ▼
 CloudFront
```

---

# Main Components

# Frontend

## Technology

* Next.js

## Responsibilities

* User Registration
* User Login
* Dashboard
* Project Management
* Deployment Execution
* Deployment Status Monitoring
* Deployment Log Visualization

The frontend communicates exclusively with the Backend API.

---

# Backend API

## Technology

* ASP.NET Core Web API

## Responsibilities

* User Management
* Authentication
* Project Management
* Deployment Management
* Deployment Orchestration (in-process background worker)
* GitHub Repository Validation
* Kubernetes Job Creation
* AWS Resource Management
* Deployment Status Tracking

The backend serves as the central component of the platform.

---

# Database

## Technology

* PostgreSQL (AWS RDS)

## Stored Data

* Users
* Projects
* Deployments
* Deployment Logs
* Public URLs

The database stores only metadata.

Generated website files are not stored in the database.

---

# Object Storage

## Technology

* AWS S3

## Purpose

Storage of generated static website files.

The MVP uses a shared bucket.

Example:

```text
hosting-platform
├── user1/
│   ├── project1/
│   └── project2/
└── user2/
    └── project1/
```

---

# Public Website Delivery

## Technology

* AWS CloudFront

## Responsibilities

* Public website access
* HTTPS support
* Caching
* CDN functionality
* Directory-to-`index.html` rewrite via a CloudFront Function (sites are served
  under `/{userId}/{projectId}/`)

Users access published websites through a CloudFront URL.

---

# Kubernetes Architecture

# Frontend Deployment

## Deployment Type

* Kubernetes Deployment

## Purpose

Running the Next.js application.

---

# Backend Deployment

## Deployment Type

* Kubernetes Deployment

## Purpose

Running the ASP.NET Core API.

---

# Build Jobs

## Resource Type

* Kubernetes Job

## Purpose

Building GitHub repositories.

Each deployment runs as a separate Job.

The Job automatically terminates after completion.

---

# Deployment Workflow

## Step 1

The user starts a deployment.

## Step 2

The Backend API validates:

* Whether the repository exists
* Whether the repository is public
* Whether the project type is supported

## Step 3

The Backend saves the deployment as `Pending` and queues it. An in-process
background worker then creates the Kubernetes Build Job and drives the
deployment through its lifecycle (see `10-deployment-workflow.md`).

## Step 4

The Build Job:

* Clones the repository
* Detects the framework
* Executes the build process

Example:

```bash
npm install
npm run build
```

## Step 5

Generated build files are uploaded to AWS S3.

## Step 6

The CloudFront cache is refreshed.

## Step 7

The deployment status changes to Online.

## Step 8

The user receives the public website URL.

---

# Framework Detection

The MVP automatically detects supported frameworks.

## Supported Frameworks

* React
* Vue
* Vite
* Angular
* Static HTML

Detection is based on repository contents.

---

# Authentication Flow

The platform uses session-based authentication.

After a successful login, the backend creates a secure HttpOnly cookie that identifies the user's session.

## Cookie Security Settings

* HttpOnly
* Secure
* SameSite

## Flow

```text
Login
 ↓
Session Created
 ↓
HttpOnly Cookie
 ↓
Authenticated Requests
```

The frontend does not store authentication information in Local Storage or Session Storage.

The backend identifies the user through the session on every request.

Session expiration is configurable and the session is terminated upon logout.

---

# Infrastructure

Infrastructure is managed using Terraform.

## Main Infrastructure Components

* VPC
* EKS
* RDS
* S3
* CloudFront
* IAM

All infrastructure is defined as Infrastructure as Code.

---

# Future Expansion

The platform can later be extended with:

* Private GitHub Repository Support
* Automatic Deployment via GitHub Webhooks
* Custom Domains
* Deployment Statistics
* Multiple Deployment Plans
* Containerized Application Hosting
