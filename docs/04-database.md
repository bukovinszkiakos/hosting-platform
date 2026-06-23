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
```

## Relationships

* A User can own multiple Projects.
* A Project can have multiple Deployments.
* A Deployment always belongs to a single Project.

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
| Role         | VARCHAR   | User or Admin      |
| CreatedAt    | TIMESTAMP | Creation timestamp |

## Example

```text
Id: 1
Email: john@example.com
DisplayName: John
Role: User
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
