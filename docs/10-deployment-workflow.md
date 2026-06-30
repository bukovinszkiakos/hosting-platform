# 10-deployment-workflow.md

# Deployment Workflow

# Overview

The deployment workflow is responsible for automatically publishing a website from a GitHub repository.

The entire process is fully automated.

The user only needs to provide a repository URL and start a deployment.

---

# High Level Flow

```text
User
 │
 ▼
Deploy Button
 │
 ▼
Backend API
 │
 ▼
Repository Validation
 │
 ▼
Kubernetes Job
 │
 ▼
Git Clone
 │
 ▼
Framework Detection
 │
 ▼
Build
 │
 ▼
S3 Upload
 │
 ▼
CloudFront Refresh
 │
 ▼
Deployment Completed
```

---

# Step 1 - User Starts Deployment

The user clicks the Deploy button on the Project Details page.

## Route

```text
/projects/{id}
```

## Action

```text
Deploy
```

The frontend calls:

```http
POST /api/projects/{id}/deploy
```

---

# Step 2 - Deployment Record Creation

The backend creates a new Deployment record.

## Initial Status

```text
Pending
```

The following data is stored:

* Deployment Id
* Project Id
* StartedAt
* Status

---

# Step 3 - Repository Validation

The backend validates:

## Repository Exists

Whether the GitHub repository exists.

---

## Repository Is Public

The MVP supports public repositories only.

---

## Repository URL Valid

Whether the provided URL is a valid GitHub repository.

---

## Project Accessible

Whether the repository can be accessed and cloned.

---

# Step 4 - Create Kubernetes Job

After the deployment record is created, the backend queues it for processing.
A background worker then creates the Kubernetes Job (see "Deployment
Orchestration" below).

The Job receives:

```text
DeploymentId
RepositoryUrl
ProjectId
```

The deployment status changes to:

```text
Building
```

---

# Step 5 - Clone Repository

The Build Job executes:

```bash
git clone repository-url
```

The repository is cloned into a temporary workspace.

---

# Step 6 - Framework Detection

The platform automatically detects the project type.

## Supported Frameworks

```text
React
Vue
Vite
Angular
Static HTML
```

---

## Detection Rules

### React

```text
package.json
react dependency
```

---

### Vite

```text
package.json
vite dependency
```

---

### Angular

```text
@angular/core
```

---

### Static HTML

```text
index.html
```

---

# Step 7 - Build Validation

The platform validates:

## package.json

Whether the file exists.

---

## Build Script

Whether a build script exists.

Example:

```json
{
  "scripts": {
    "build": "vite build"
  }
}
```

If validation fails:

```text
Failed
```

status is assigned.

---

# Step 8 - Install Dependencies

Example:

```bash
npm install
```

---

# Step 9 - Build Project

Example:

```bash
npm run build
```

The build process generates static files.

Examples:

```text
dist/
build/
out/
```

---

# Step 10 - Upload To S3

The Build Job uploads the generated files.

Example:

```bash
aws s3 sync
```

Destination:

```text
hosting-platform
/user-id/project-id/
```

---

# Step 11 - CloudFront Invalidation

The platform refreshes the CloudFront cache.

Purpose:

```text
Invalidate Cache
```

This ensures the latest version is served.

---

# Step 12 - Generate Public URL

The platform generates a public website URL.

Example:

```text
https://xxxxx.cloudfront.net/user-id/project-id
```

The URL is stored in the Project record.

This URL points at a "directory" rather than a file. A CloudFront Function
rewrites such requests to the site's `index.html`
(`/user-id/project-id` -> `/user-id/project-id/index.html`), so the published
site loads at the stored URL (see `05-aws-architecture.md` "CloudFront").

---

# Step 13 - Complete Deployment

If deployment succeeds:

```text
Online
```

status is assigned.

Updated fields:

* FinishedAt
* BuildSummary
* WebsiteUrl

---

# Failure Handling

An error may occur at any stage of the workflow.

In such cases:

```text
Failed
```

status is assigned.

---

# Example Failure Reasons

## Repository Not Found

```text
Repository not found
```

---

## Repository Is Private

```text
Private repositories are not supported
```

---

## Unsupported Framework

```text
Unsupported project type
```

---

## Missing Build Script

```text
Build script not found
```

---

## npm Install Failed

```text
Dependency installation failed
```

---

## Build Failed

```text
Build process failed
```

---

# Deployment Status Lifecycle

```text
Pending
 │
 ▼
Building
 │
 ▼
Deploying
 │
 ▼
Online
```

If an error occurs:

```text
Pending
 │
 ▼
Building
 │
 ▼
Failed
```

---

# Deployment Orchestration

Steps 4–13 are **not** executed inline by the request that creates the
deployment. The `POST /api/projects/{id}/deploy` handler only creates the
`Pending` deployment record and returns `201` immediately. The build lifecycle
is then driven asynchronously by an in-process background worker.

## Components

* **DeploymentQueue** – an in-memory queue (`System.Threading.Channels`) of
  deployment ids awaiting processing, registered as a singleton. No external
  broker (Redis, SQS, RabbitMQ, …) is used.
* **DeploymentBuildWorker** – a hosted `BackgroundService` that drains the
  queue and orchestrates one deployment at a time. It does not contain build
  logic of its own; it reuses the existing `DeploymentService`,
  `KubernetesJobService` and `CloudFrontService`.

## Flow

```text
CreateDeploymentAsync()                 (Pending record saved)
  → DeploymentQueue.Enqueue(deploymentId)
  → return 201

DeploymentBuildWorker dequeues deploymentId
  → UpdateStatus(Building)
  → KubernetesJobService.CreateBuildJob()        (Step 4)
  → poll GetBuildJobState() until terminal        (Steps 5–11 run inside the Job)
  → CollectBuildLogs()                            (best effort)
  → on success: UpdateStatus(Deploying)
                UpdateStatus(Online) + WebsiteUrl (Steps 12–13)
  → on failure or timeout: UpdateStatus(Failed)
```

The build Job itself performs the git clone, framework detection, build, S3
upload and CloudFront invalidation (Steps 5–11). The Job runs under the
`hosting-platform` service account, which is bound to the Backend Service IAM
role via EKS Pod Identity; this is what authorizes the Job's `aws s3 sync` and
`aws cloudfront create-invalidation` calls (see `07-kubernetes.md`). The worker
only creates the Job, polls it to completion, collects its logs, and records the
resulting status. On success the public URL is produced by
`CloudFrontService.GetPublicUrl` (`https://{domain}/{userId}/{projectId}`) and
stored on the project (Step 12).

## MVP Limitations

* The queue is in-memory and per-pod: a deployment is processed by the same
  backend pod that accepted the request. If that pod restarts mid-build, the
  deployment is left in `Building` and is not automatically retried.
* Deployments are processed one at a time per pod.
* A failed build is not retried (`backoffLimit: 0`); it becomes a `Failed`
  deployment.

These trade-offs keep the MVP free of additional infrastructure. Durable
queuing and automatic retry are listed under Future Enhancements.

---

# Redeployment Workflow

Users can start a new deployment at any time.

Previous deployment records remain stored.

Each new deployment creates a new Deployment record.

Example:

```text
Deploy #1
Deploy #2
Deploy #3
```

---

# Future Enhancements

Future versions may include:

* GitHub Webhooks
* Automatic Redeploy
* Branch Selection
* Build Configuration
* Deployment Rollback
* Build Cache
* Multi Framework Support
* Container Deployments
* Durable deployment queue with automatic retry
