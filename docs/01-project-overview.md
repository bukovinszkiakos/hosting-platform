# 01-project-overview.md

# Project Name

Static Website Hosting Platform

# Project Overview

The goal of this project is to create a Software as a Service (SaaS) based static website hosting platform.

The platform enables users to automatically publish static websites in a cloud environment by simply providing a public GitHub repository, without requiring knowledge of AWS, deployment processes, or infrastructure management.

The user provides a GitHub repository URL and starts a deployment process. The system automatically builds and publishes the website, making it accessible through a public URL.

---

# Problem Statement

Today, publishing a static website typically requires developers or users to understand several cloud and deployment technologies, such as:

* AWS S3
* CloudFront
* DNS
* CI/CD pipelines
* Hosting configuration

The purpose of the platform is to abstract these technical details and simplify the deployment process.

---

# Target Audience

The primary target audience includes:

* Developers
* Students
* Junior Developers
* Freelancers
* Portfolio Website Creators

The platform is designed to support the deployment of any static website.

---

# MVP Scope

The first version of the platform will support only static website hosting.

Examples:

* HTML/CSS/JavaScript
* React
* Vue
* Vite
* Angular

The MVP does not support backend applications or containerized services.

The platform can later be extended into a full application hosting platform.

---

# Core Workflow

1. The user creates a project.
2. The user provides a public GitHub repository URL.
3. The user starts the deployment process.
4. The system clones the repository.
5. The system builds the application.
6. The generated build files are uploaded to AWS S3.
7. The website is published through CloudFront.
8. The user receives a public URL.

---

# High Level Goals

* Provide a simple deployment experience
* Build a cloud-native architecture
* Use Terraform-based Infrastructure as Code
* Use Kubernetes-based build workflows
* Integrate AWS services
* Ensure future extensibility

---

# Future Vision

The platform can be extended in the future with:

* Automatic redeployment using GitHub Webhooks
* Custom domain support
* Usage statistics and analytics
* Private GitHub repository support
* Containerized application hosting
* Multiple deployment tiers
