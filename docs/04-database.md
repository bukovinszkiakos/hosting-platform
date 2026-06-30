# 04-database.md

# Database Design

# Overview

The platform uses a PostgreSQL database hosted on AWS RDS.

The database stores only the metadata required for platform operations.

Generated website files are not stored in the database and are instead stored in AWS S3.

---

# Entity Relationship Overview

```text
User
 │
 └── Projects
      │
      └── Deployments
           │
           └── DeploymentLogs
```

## Relationships

* A User can own multiple Projects.
* A Project can have multiple Deployments.
* A Deployment always belongs to a single Project.
* A Deployment can have multiple DeploymentLogs.
* A DeploymentLog always belongs to a single Deployment.

---

# Users Table

Stores platform users.

## Fields

| Field        | Type      | Description        |
| ------------ | --------- | ------------------ |
| Id           | UUID      | Unique identifier  |
| Email        | VARCHAR   | User email address |
| PasswordHash | VARCHAR   | Encrypted password |
| DisplayName  | VARCHAR   | Display name       |
| CreatedAt    | TIMESTAMP | Creation timestamp |

> Roles (User / Admin) are not stored as a column on the Users table. They are managed by ASP.NET Core Identity in the `AspNetRoles` and `AspNetUserRoles` tables.

## Example

```text
Id: 1
Email: john@example.com
DisplayName: John
```

---

# Projects Table

Stores user projects.

## Fields

| Field         | Type      | Description                 |
| ------------- | --------- | --------------------------- |
| Id            | UUID      | Unique identifier           |
| UserId        | UUID      | Project owner               |
| Name          | VARCHAR   | Project name                |
| RepositoryUrl | VARCHAR   | GitHub repository URL       |
| WebsiteUrl    | VARCHAR   | Public website URL          |
| CurrentStatus | VARCHAR   | Current status              |
| CreatedAt     | TIMESTAMP | Creation timestamp          |
| UpdatedAt     | TIMESTAMP | Last modification timestamp |

> `CurrentStatus` mirrors the project's latest deployment status (see Deployment
> Status Values below). A newly created project that has never been deployed has
> the status `Draft`.

## Example

```text
Name: Portfolio Website

RepositoryUrl:
https://github.com/user/portfolio

WebsiteUrl:
https://d123.cloudfront.net

CurrentStatus:
Online
```

---

# Deployments Table

Stores deployment history.

Each deployment is stored as a separate record.

This allows deployment history to be displayed and tracked.

## Fields

| Field        | Type      | Description                |
| ------------ | --------- | -------------------------- |
| Id           | UUID      | Unique identifier          |
| ProjectId    | UUID      | Related project            |
| Status       | VARCHAR   | Deployment status          |
| StartedAt    | TIMESTAMP | Deployment start time      |
| FinishedAt   | TIMESTAMP | Deployment completion time |
| BuildSummary | TEXT      | Build summary              |
| ErrorMessage | TEXT      | Error message              |
| CreatedAt    | TIMESTAMP | Record creation time       |

---

# Deployment Status Values

The system uses the following deployment states:

* Pending
* Building
* Deploying
* Online
* Failed

## Example

```text
Status:
Online

BuildSummary:
Build completed successfully

ErrorMessage:
NULL
```

or

```text
Status:
Failed

BuildSummary:
Build failed

ErrorMessage:
package.json not found
```

---

# DeploymentLogs Table

Stores simple log messages produced during a deployment.

> Note: This table is part of the applied initial migration. Build pod output is
> collected and stored as `DeploymentLog` records by the deployment build worker
> (see doc 10 "Deployment Orchestration" and doc 12 "Build Logs").

## Fields

| Field        | Type      | Description          |
| ------------ | --------- | -------------------- |
| Id           | UUID      | Unique identifier    |
| DeploymentId | UUID      | Related deployment   |
| Message      | TEXT      | Log message          |
| CreatedAt    | TIMESTAMP | Record creation time |

---

# Data Ownership Rules

## User

Users can only access their own projects and deployments.

---

## Admin

Administrators can:

* View all users
* View all projects
* View all deployments

---

# Stored Data

The database stores:

* Users
* Projects
* Deployment history
* Deployment statuses
* Error messages

---

# Not Stored In Database

The following data is not stored in the database:

* Generated website files
* HTML files
* JavaScript files
* CSS files
* Images

These files are stored in AWS S3.

---

# Future Database Extensions

The platform can later be extended with:

* GitHub OAuth integrations
* Custom domains
* Deployment statistics
* Subscription tiers
* Audit logs
* Usage reports
