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

The backend creates a Kubernetes Job.

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
