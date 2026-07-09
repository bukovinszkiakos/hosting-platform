# 02-features.md

# User Roles

## User

The standard platform user.

### Permissions

* Create own projects
* Edit own projects
* Delete own projects
* Start deployments
* View deployment statuses
* View own deployment errors and logs

---

## Admin

The platform administrator.

### Permissions

* View all users
* View all projects
* View all deployments
* View platform-level statistics

---

# Authentication Features

## Register

Users can create a new account.

---

## Login

Users can sign in to the platform.

---

## Logout

Users can sign out of the platform.

---

# Project Management Features

## Create Project

Users can create a new project.

### Required Information

* Project Name

Creating a project does not automatically trigger a deployment.

---

## Edit Project

Users can modify:

* Project Name
* GitHub Repository URL

---

## Delete Project

Users can delete a project.

The deletion process includes:

* Removing database records
* Removing static files stored in AWS S3
* Removing the public website URL

---

## List Projects

Users can view all of their projects.

---

# Repository Management Features

## Add Repository

Users can provide a GitHub repository URL for a project.

The MVP supports public GitHub repositories only.

---

## Update Repository

Users can update the repository URL.

---

# Deployment Features

## Create Deployment

Users can manually start a deployment using a Deploy button.

---

## Deployment Workflow

1. Repository validation
2. Repository cloning
3. Build process execution
4. Build artifact generation
5. AWS S3 upload
6. CloudFront refresh
7. Public URL generation

---

## Deployment Statuses

A deployment can move through the following states:

* Pending
* Building
* Deploying
* Online
* Failed

---

## Redeploy

Users can restart the deployment process for an existing project.

---

## Deployment History

Each project can have multiple deployments.

Users can view previous deployments.

---

## Deployment Logs

The MVP stores simple deployment logs.

Examples:

* Build Started
* Build Completed
* Build Failed
* Error Message

---

# Dashboard Features

For each project, the dashboard displays:

* Project Name
* GitHub Repository URL
* Current Status
* Website URL
* Last Deployment Date

### Available Actions

* Deploy
* Edit
* Delete

---

# Supported Project Types

The MVP supports static website hosting only.

Examples:

* HTML
* CSS
* JavaScript
* React
* Vue
* Vite
* Angular

> **Known limitation:** for single-page apps with client-side routing, refreshing
> or deep-linking a client route returns an error (only the site root URL works
> reliably). This is a limitation of the shared CloudFront distribution — see
> `05-aws-architecture.md` "CloudFront".

---

# Future Features

Planned future enhancements:

* Automatic redeployment using GitHub Webhooks
* Private GitHub repository support
* Custom domains
* Deployment statistics
* Multiple deployment plans (Free / Pro / Enterprise)
* Containerized application hosting
