# 11-repository-structure.md

# Repository Structure

# Overview

The project follows a monorepo architecture.

The entire platform is stored within a single Git repository.

Goals:

* Simplified development
* Simplified CI/CD
* Easy documentation management
* AI-friendly project structure

---

# High Level Structure

```text id="98t4ja"
hosting-platform/
├── docs/
├── frontend/
├── backend/
├── terraform/
├── k8s/
├── scripts/
└── .github/
```

---

# Docs

Project documentation.

```text id="tq0q4f"
docs/
├── 01-project-overview.md
├── 02-features.md
├── 03-architecture.md
├── 04-database.md
├── 05-aws-architecture.md
├── 06-terraform.md
├── 07-kubernetes.md
├── 08-api.md
├── 09-frontend-pages.md
├── 10-deployment-workflow.md
├── 11-repository-structure.md
├── 12-technical-decisions-and-conventions.md
├── 13-implementation-task-sequence.md
├── 14-post-mvp-polish.md
└── 15-demo.md
```

---

# Frontend

Next.js application.

```text id="w5c4sr"
frontend/
├── src/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── services/
│   ├── types/
│   └── hooks/
└── public/
```

---

# Frontend App Router

```text id="s3dbgm"
app/
├── page.tsx
├── login/
├── register/
├── home/
├── dashboard/
├── projects/
├── projects/[id]/
├── deployments/[id]/
├── profile/
└── admin/
```

---

# Backend

ASP.NET Core Web API.

```text id="pl3g1h"
backend/
├── HostingPlatform.sln
└── src/
    └── HostingPlatform.Api/
        ├── Controllers/
        ├── Services/
        ├── Entities/
        ├── DTOs/
        ├── Middleware/
        ├── Exceptions/
        ├── Configuration/
        ├── Extensions/
        └── Data/
```

> Note: The Repository pattern will not be used. Services communicate directly with Entity Framework Core through `AppDbContext`.

---

# Controllers

```text id="zlkcgt"
Controllers/
├── AuthController
├── ProfileController
├── ProjectsController
├── DeploymentsController
├── DashboardController
└── AdminController
```

---

# Services

```text id="w3wpg7"
Services/
├── AuthService
├── ProfileService
├── ProjectService
├── DeploymentService
├── DashboardService
├── AdminService
├── KubernetesJobService
├── BuildJobSpecFactory
├── DeploymentBuildWorker   # hosted background service (build orchestration)
├── DeploymentQueue
├── S3Service
└── CloudFrontService
```

> Each service has a matching `I…` interface. Small build-support types
> (`BuildJobParameters`, `BuildJobState`, `BuildJobNaming`, `BuildJobEnvironment`,
> `DeploymentStatus`) also live here.

---

# Terraform

Infrastructure as Code.

```text id="rg7vuk"
terraform/
├── environments/
├── modules/
└── backend/
```

---

# Terraform Environments

```text id="7jgj5d"
environments/
├── dev/
└── prod/
```

---

# Terraform Modules

```text id="pjyjlwm"
modules/
├── vpc/
├── eks/
├── rds/
├── s3/
├── cloudfront/
└── iam/
```

---

# Kubernetes

Kubernetes manifests.

```text id="fyolgb"
k8s/
├── base/
├── frontend/
├── backend/
├── jobs/
├── ingress/
├── hpa/
└── secrets/
```

---

# Frontend Kubernetes Resources

```text id="bgufzw"
frontend/
├── deployment.yaml
└── service.yaml
```

---

# Backend Kubernetes Resources

```text id="wupygp"
backend/
├── deployment.yaml
└── service.yaml
```

---

# Build Job Resources

```text id="v5mkk3"
jobs/
└── build-job.yaml
```

---

# Ingress Resources

```text id="r83h3l"
ingress/
└── alb-ingress.yaml
```

---

# HPA Resources

```text id="n3lb77"
hpa/
└── frontend-hpa.yaml
```

> Only the frontend has an HPA. The backend runs as a single replica during the
> MVP (in-memory queue + ephemeral Data Protection keys); see
> `07-kubernetes.md` "Backend Replicas".

---

# Scripts

Utility scripts.

```text id="9i2q4m"
scripts/
├── local-dev/
├── deployment/
└── terraform/
```

---

# GitHub Workflows

```text id="xvvgqx"
.github/
└── workflows/
    └── ci.yml
```

---

# CI Pipeline

`ci.yml` runs on every push and pull request. It only builds/validates the
project (Continuous Integration); deployment to AWS is intentionally a separate,
manually triggered workflow (not yet implemented). The workflow runs four
independent jobs in parallel:

```text id="m4qfki"
backend      -> dotnet restore + build (-warnaserror), NuGet cache
frontend     -> npm ci + ESLint + tsc --noEmit + next build, npm cache
terraform    -> terraform fmt -check + validate (backend, dev, prod)
kubernetes   -> kubeconform schema validation of k8s/ (no cluster needed)
```

Any failing step fails its job and the overall check. See `docs/07-kubernetes.md`
for what Kubernetes validation can and cannot cover without a cluster.

---

# Future Repository Extensions

Future versions may include:

* Helm Charts
* ArgoCD
* GitOps
* Monitoring Stack
* Logging Stack
* Multi Environment Support
