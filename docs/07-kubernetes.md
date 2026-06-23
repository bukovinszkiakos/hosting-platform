# 07-kubernetes.md

# Kubernetes Architecture

# Overview

The platform applications run inside an Amazon EKS Kubernetes environment.

Kubernetes is responsible for:

* Running applications
* Executing deployment workflows
* Providing scalability
* Ensuring high availability

---

# Namespace Strategy

The MVP uses a single namespace.

Namespace:

```text
hosting-platform
```

All platform components run within this namespace.

---

# Kubernetes Components

The cluster contains the following main components:

```text
hosting-platform
├── Frontend Deployment
├── Backend Deployment
├── Frontend Service
├── Backend Service
├── Build Jobs
├── ConfigMaps
├── Secrets
├── Ingress
└── HPA
```

---

# Frontend Deployment

## Technology

* Next.js

## Deployment Type

* Kubernetes Deployment

## Responsibilities

* Serving the web interface
* Displaying dashboards
* API communication

---

# Frontend Service

## Service Type

```text
ClusterIP
```

The frontend is accessible only through the Ingress.

---

# Frontend Resources

## Requests

```text
CPU: 250m
Memory: 256Mi
```

## Limits

```text
CPU: 500m
Memory: 512Mi
```

---

# Backend Deployment

## Technology

* ASP.NET Core Web API

## Deployment Type

* Kubernetes Deployment

## Responsibilities

* Authentication
* Project Management
* Deployment Management
* AWS Integration
* Kubernetes Job Creation

---

# Backend Service

## Service Type

```text
ClusterIP
```

The backend is accessible only through the Ingress.

---

# Backend Resources

## Requests

```text
CPU: 500m
Memory: 512Mi
```

## Limits

```text
CPU: 1000m
Memory: 1Gi
```

---

# Build Jobs

Whenever a deployment is started, the backend creates a Kubernetes Job.

Each deployment runs as a separate Job.

---

# Build Job Responsibilities

The Job:

1. Clones the GitHub repository
2. Detects the framework
3. Installs required dependencies
4. Builds the application
5. Uploads the generated output to S3

---

# Build Image

The default image used by the Job:

```text
node:20
```

---

# Build Process Example

```bash
git clone
npm install
npm run build
aws s3 sync
```

---

# Build Job Resources

## Requests

```text
CPU: 1000m
Memory: 1Gi
```

## Limits

```text
CPU: 2000m
Memory: 2Gi
```

---

# ConfigMaps

ConfigMaps store non-sensitive configuration values.

Examples:

* API URL
* Environment Configuration
* CloudFront URL

---

# Secrets

Kubernetes Secrets store sensitive data.

Examples:

* Database Connection String
* Session Secret
* AWS Access Configuration

Future versions may migrate to AWS Secrets Manager.

---

# Ingress

The platform publishes applications using the AWS ALB Ingress Controller.

## Architecture

```text
Internet
    ↓
Application Load Balancer
    ↓
Ingress
   ↙     ↘
Frontend   Backend
Service    Service
```

---

# Horizontal Pod Autoscaler

Both frontend and backend deployments use HPA.

## Responsibilities

* Automatic scaling based on workload
* Efficient resource utilization

---

# Frontend HPA

```text
Min Replicas: 1
Max Replicas: 3
```

---

# Backend HPA

```text
Min Replicas: 1
Max Replicas: 3
```

---

# Scaling Strategy

## Normal Operation

```text
Frontend: 1 Replica
Backend: 1 Replica
```

## High Load

```text
Frontend: 3 Replicas
Backend: 3 Replicas
```

---

# Security Principles

The Kubernetes environment follows the following principles:

* ClusterIP services
* Ingress-based public access
* Secrets for sensitive data
* Namespace isolation
* Principle of Least Privilege

---

# Future Kubernetes Extensions

Future versions may include:

* AWS Secrets Manager Integration
* Monitoring Stack
* Logging Stack
* Multiple Namespaces
* Multi-Tenant Architecture
* Advanced Autoscaling
