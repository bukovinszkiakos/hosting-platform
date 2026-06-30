# 08-api.md

# API Design

# Overview

The platform uses REST API-based communication.

The frontend communicates exclusively with the ASP.NET Core Web API.

The API uses JSON as its data format.

Protected endpoints are accessed through session-based authentication.

---

# Base URL

```text
/api
```

---

# Authentication API

# Register

Creates a new user account.

## Endpoint

```http
POST /api/auth/register
```

## Request

```json
{
  "displayName": "John Doe",
  "email": "john@example.com",
  "password": "Password123!"
}
```

## Response

```json
{
  "message": "Registration successful"
}
```

---

# Login

Authenticates a user.

## Endpoint

```http
POST /api/auth/login
```

## Request

```json
{
  "email": "john@example.com",
  "password": "Password123!"
}
```

## Response

```json
{
  "message": "Login successful"
}
```

The backend creates a session and sets an HttpOnly cookie.

---

# Logout

Logs the user out.

## Endpoint

```http
POST /api/auth/logout
```

## Response

```json
{
  "message": "Logout successful"
}
```

---

# Get Current User

Returns information about the currently authenticated user.

## Endpoint

```http
GET /api/auth/me
```

## Response

```json
{
  "id": "guid",
  "displayName": "John Doe",
  "email": "john@example.com",
  "role": "User"
}
```

`role` is the user's effective (highest-privilege) role. A user always has the
`User` role and may additionally have `Admin`; an admin is reported as `Admin`.
The same projection is used by `GET /api/profile` and `GET /api/admin/users`.

---

# Profile API

# Get Profile

## Endpoint

```http
GET /api/profile
```

## Response

```json
{
  "displayName": "John Doe",
  "email": "john@example.com",
  "role": "User",
  "createdAt": "2026-06-17T12:00:00Z",
  "projectsCount": 5,
  "deploymentsCount": 18
}
```

`role` and `createdAt` are included so the Profile page (see
`09-frontend-pages.md`) can display all required user information from a
single endpoint.

---

# Update Profile

## Endpoint

```http
PUT /api/profile
```

## Request

```json
{
  "displayName": "John Doe",
  "email": "john@example.com"
}
```

## Response

```json
{
  "message": "Profile updated"
}
```

---

# Project API

# Get Projects

Returns all projects owned by the authenticated user.

## Endpoint

```http
GET /api/projects
```

---

# Get Project

## Endpoint

```http
GET /api/projects/{id}
```

---

# Create Project

## Endpoint

```http
POST /api/projects
```

## Request

```json
{
  "name": "Portfolio Website",
  "repositoryUrl": "https://github.com/user/portfolio"
}
```

---

# Update Project

## Endpoint

```http
PUT /api/projects/{id}
```

## Request

```json
{
  "name": "Portfolio Website",
  "repositoryUrl": "https://github.com/user/new-portfolio"
}
```

---

# Delete Project

## Endpoint

```http
DELETE /api/projects/{id}
```

The project and all related deployment history records are removed. The
project's published files are also deleted from S3 and its CloudFront cache is
invalidated, so the site is no longer served (see `02-features.md` "Delete
Project"). Storage/CDN cleanup is best-effort: a transient failure is logged and
does not block deletion of the record.

---

# Deployment API

# Create Deployment

Starts a new deployment.

## Endpoint

```http
POST /api/projects/{id}/deploy
```

## Response

```json
{
  "deploymentId": "guid",
  "status": "Pending"
}
```

---

# Get Project Deployments

Returns all deployments belonging to a project.

## Endpoint

```http
GET /api/projects/{id}/deployments
```

---

# Get Deployment

## Endpoint

```http
GET /api/deployments/{id}
```

## Response

```json
{
  "id": "guid",
  "status": "Online",
  "startedAt": "2026-06-17T12:00:00Z",
  "finishedAt": "2026-06-17T12:02:00Z",
  "buildSummary": "Build completed successfully",
  "errorMessage": null
}
```

---

# Get Deployment Logs

Returns the stored log messages for a deployment.

## Endpoint

```http
GET /api/deployments/{id}/logs
```

## Response

```json
[
  {
    "message": "Build Started",
    "createdAt": "2026-06-17T12:00:00Z"
  }
]
```

---

# Dashboard API

# Get Dashboard

Returns dashboard statistics.

## Endpoint

```http
GET /api/dashboard
```

## Response

```json
{
  "projectsCount": 5,
  "deploymentsCount": 18,
  "onlineProjects": 4,
  "failedProjects": 1
}
```

---

# Admin API

Accessible only to users with the Admin role.

# Get Users

## Endpoint

```http
GET /api/admin/users
```

---

# Get Projects

## Endpoint

```http
GET /api/admin/projects
```

---

# Get Deployments

## Endpoint

```http
GET /api/admin/deployments
```

---

# Error Responses

All error responses use the standardized shape defined in
`12-technical-decisions-and-conventions.md`:

```json
{
  "message": "...",
  "errors": []
}
```

# Validation Error

```json
{
  "message": "Validation failed",
  "errors": [
    "Project name is required",
    "Repository URL is invalid"
  ]
}
```

---

# Unauthorized

```json
{
  "message": "Unauthorized",
  "errors": []
}
```

---

# Forbidden

```json
{
  "message": "Forbidden",
  "errors": []
}
```

---

# Not Found

```json
{
  "message": "Resource not found",
  "errors": []
}
```

---

# Deployment Failed

```json
{
  "message": "Build failed",
  "errors": [
    "package.json not found"
  ]
}
```

---

# Future API Extensions

Future versions may include:

* GitHub OAuth
* Webhook API
* Custom Domain API
* Deployment Statistics API
* Tier Management API
* Billing API
