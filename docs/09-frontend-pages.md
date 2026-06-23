# 09-frontend-pages.md

# Frontend Architecture

# Overview

The frontend is built as a Next.js App Router application.

Its goals are:

* Providing a simple user experience
* Managing projects
* Starting deployment workflows
* Monitoring deployment statuses
* Accessing platform functionality

The frontend communicates exclusively with the Backend API.

---

# Frontend Goals

The platform should not feel like an admin panel.

It should provide the experience of a modern SaaS product.

Goals:

* Ease of use
* Fast onboarding
* Clear deployment workflow
* Easy-to-follow deployment statuses

---

# Route Structure

```text id="2hqlf0"
/
/login
/register
/home
/dashboard
/projects
/projects/[id]
/deployments/[id]
/profile
/admin
```

---

# Public Pages

The following pages are accessible without authentication:

```text id="lg44it"
/
/login
/register
```

---

# Landing Page

## Route

```text id="7vmz9r"
/
```

The landing page introduces the platform.

---

## Hero Section

Example:

```text id="7gyrg2"
Deploy Your Website In Minutes

Publish your static website directly from GitHub
without managing AWS infrastructure.
```

---

## How It Works Section

Steps:

```text id="4mpbkt"
1. Add Repository
2. Deploy
3. Get Public URL
```

---

## Features Section

Examples:

```text id="9xijw3"
GitHub Integration
Automatic Build Process
Cloud Hosting
Deployment Tracking
AWS Powered Infrastructure
```

---

## Call To Action

Buttons:

```text id="ijedgl"
Get Started
Login
```

---

# Authentication Pages

# Login

## Route

```text id="fphn29"
/login
```

## Fields

```text id="fgsc8z"
Email
Password
```

---

# Register

## Route

```text id="v6qit9"
/register
```

## Fields

```text id="2vf7gj"
Display Name
Email
Password
```

---

# Home Page

## Route

```text id="z53vfr"
/home
```

The Home page serves as the user's starting page.

It is not a statistics dashboard.

---

## Welcome Section

Example:

```text id="pxjlwm"
Welcome Back, John
```

---

## Quick Actions

Buttons:

```text id="17p4e0"
Create Project
View Projects
```

---

## Getting Started

Onboarding checklist:

```text id="sy41to"
✓ Account Created
✓ Logged In
□ First Project Created
□ First Deployment
□ Website Published
```

---

## Recent Projects

Displays the most recently modified projects.

---

## Recent Deployments

Displays the most recent deployments.

---

# Dashboard Page

## Route

```text id="6i9z1v"
/dashboard
```

The Dashboard is a statistics and analytics page.

---

## Statistics Cards

Displayed information:

```text id="nse6dr"
Projects Count
Deployments Count
Online Projects
Failed Deployments
```

---

## Charts (Future)

Potential future extensions:

```text id="d08hz0"
Deployments Over Time
Project Activity
```

---

# Projects Page

## Route

```text id="7zrf9d"
/projects
```

Displays all projects owned by the user.

---

## Project List

Each project displays:

```text id="d4mbb2"
Project Name
Repository URL
Current Status
Website URL
Last Deployment
```

---

## Actions

Buttons:

```text id="yq7fc4"
Deploy
Edit
Delete
```

---

## Create Project

Can be implemented as a modal or a dedicated form.

Fields:

```text id="63h6pk"
Project Name
Repository URL
```

---

# Project Details Page

## Route

```text id="jlwmv4"
/projects/[id]
```

Displays detailed information about a selected project.

---

## Project Information

Displayed information:

```text id="64yl3x"
Project Name
Repository URL
Website URL
Current Status
```

---

## Deployment History

List:

```text id="b0dd4x"
Deploy #1
Deploy #2
Deploy #3
```

---

## Project Actions

```text id="6v3rsi"
Deploy
Edit
Delete
```

---

# Deployment Details Page

## Route

```text id="4gg7oa"
/deployments/[id]
```

Displays deployment details.

---

## Deployment Information

Displayed information:

```text id="awp7h0"
Status
Started At
Finished At
Build Summary
```

Example:

```text id="4w4v1s"
Build completed successfully
```

---

## Error Information

Example:

```text id="s0cqyt"
Build failed

package.json not found
```

---

# Profile Page

## Route

```text id="tq0vh7"
/profile
```

---

## User Information

Displayed information:

```text id="mr9q5e"
Display Name
Email
Role
Created At
```

---

## Profile Statistics

```text id="gmp4mh"
Projects Count
Deployments Count
```

---

## Edit Profile

Editable fields:

```text id="s6v8jw"
Display Name
Email
```

---

# Admin Page

## Route

```text id="sh7n0r"
/admin
```

Accessible only to users with the Admin role.

---

## User Statistics

```text id="jsab68"
Total Users
```

---

## Project Statistics

```text id="j0v7r8"
Total Projects
```

---

## Deployment Statistics

```text id="p5xysq"
Total Deployments
Online Deployments
Failed Deployments
```

---

# Navigation

## Regular User

```text id="mjofq6"
Home
Projects
Dashboard
Profile
```

---

## Admin

```text id="9w5g8r"
Home
Projects
Dashboard
Profile
Admin
```

---

# Layout Structure

Protected pages use a shared layout.

Structure:

```text id="3z22xg"
Sidebar
Top Navigation
Page Content
```

---

# Future Frontend Features

Future versions may include:

* Dark Mode
* Deployment Charts
* GitHub OAuth Login
* Custom Domains
* Deployment Analytics
* Billing Pages
* Tier Management
