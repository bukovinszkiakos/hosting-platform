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

All platform components run within this namespace. The namespace itself is
defined as a manifest (`k8s/base/namespace.yaml`) so the manifests are
self-contained; apply it before the others.

---

# Kubernetes Components

The cluster contains the following main components:

```text
hosting-platform
├── Namespace
├── Frontend Deployment
├── Backend Deployment
├── Frontend Service
├── Backend Service
├── Build Jobs
├── Database Migration Job (one-off)
├── ServiceAccount
├── RBAC (Role + RoleBinding for the backend)
├── ConfigMaps
├── Secrets
├── Ingress
└── HPA (frontend only)
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

Whenever a deployment is started, the backend's in-process build worker creates
a Kubernetes Job (see `10-deployment-workflow.md` "Deployment Orchestration").

Each deployment runs as a separate Job. The Job sets `backoffLimit: 0` (no retry),
`ttlSecondsAfterFinished: 3600` (auto-cleanup) and `activeDeadlineSeconds: 600`
(Kubernetes terminates a build that exceeds 10 minutes so it cannot publish after
the deployment has been marked `Failed`).

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
node:20-slim
```

`node:20-slim` does not include `git` or the AWS CLI v2, so the build script
installs both at container start before cloning and publishing. Because of this
runtime install (`apt-get`), the build container currently **runs as root**
while executing untrusted repository code.

A **prebuilt, non-root build image** (ECR) remains a planned future improvement;
it would remove the root requirement, cut ~150 MB of per-build NAT traffic and
1–2 minutes of install latency, and drop the build-time dependency on the
Debian/AWS CLI mirrors.

---

# Build Process Example

```bash
apt-get install -y git curl unzip   # node:20-slim lacks these
install AWS CLI v2
git clone
npm install                          # only when package.json exists
npm run build                        # output must be dist/, build/ or out/ — otherwise the build fails
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

# Database Migration Job

Database schema changes are applied by a one-off Job (`k8s/jobs/migrate-job.yaml`),
**not** on application startup. The Job runs the backend image with the `migrate`
argument (`dotnet HostingPlatform.Api.dll migrate`), which applies pending EF Core
migrations and exits; it reads the RDS connection string from the same
`backend-secrets`/`backend-config` the backend uses.

`deploy.yml` runs this Job to completion **before** rolling out the application, on
every deploy, so the schema always exists and matches the code before the backend
starts (the backend seeds Identity roles on startup and would fail against a
missing schema). Migrations are idempotent, so the Job is a safe no-op when there
is nothing to apply. The Job sets `restartPolicy: Never`, `backoffLimit: 1`,
`activeDeadlineSeconds: 300`, and `ttlSecondsAfterFinished: 600`, and runs with
`automountServiceAccountToken: false` (it needs only the database, not the
Kubernetes API or AWS). See `16-deployment.md` "Database migrations" for the full
procedure and rollback considerations.

---

# ConfigMaps

ConfigMaps store non-sensitive configuration values.

Examples:

* Environment configuration (`ASPNETCORE_ENVIRONMENT`, `NODE_ENV`)
* AWS region / bucket / CloudFront distribution + domain
* Cookie settings

`backend-config` and `frontend-config` are created during bootstrap, before the
first deploy, from the Terraform outputs — see `16-deployment.md` "Configuration
and secrets bootstrap". `deploy.yml` verifies they exist and never creates them.

---

# Secrets

Kubernetes Secrets store sensitive data. The only Secret today is
`backend-secrets`, holding the database connection string.

It is created during bootstrap by `scripts/deployment/bootstrap-config.sh`, which
builds the connection string from the Terraform outputs plus the `DB_PASSWORD`
supplied out-of-band; the password is never written to disk or committed to Git
(see `16-deployment.md` "Configuration and secrets bootstrap" and `.gitignore`).

Future versions may move secrets to **AWS Secrets Manager** with the **External
Secrets Operator** syncing them into the cluster, removing manual handling of the
password.

---

# Service Account and AWS Access

A single service account is used by the workloads that call AWS:

```text
hosting-platform
```

The backend Deployment and every build Job run under this service account.

It is bound to the Backend Service IAM role through an **EKS Pod Identity**
association (defined in the Terraform IAM module). The EKS Pod Identity Agent
addon resolves AWS credentials for pods using this service account, so:

* The build Job can run `aws s3 sync` and `aws cloudfront create-invalidation`.
* No AWS permissions are attached to the node group role.

No IRSA `role-arn` annotation is required; Pod Identity uses the association
rather than the service account annotation.

Build pods set `automountServiceAccountToken: false`: the build container runs
untrusted repository code (`npm install` executes arbitrary scripts) and never
calls the Kubernetes API, so the default API token is not mounted. Pod Identity
injects its own credential token separately, so AWS access is unaffected.

> **Known security limitation — must be addressed before real users.** The
> backend Deployment and the build Jobs currently share this single service
> account and IAM role. Build Jobs execute **untrusted repository code**
> (`npm install` runs arbitrary scripts), and EKS Pod Identity delivers the
> role's AWS credentials to *any process in the pod* — including that untrusted
> code. The role has write/delete access to the **entire hosting bucket** and
> CloudFront invalidation rights, so a malicious build can read, overwrite or
> delete **every user's published site** and issue unbounded invalidations. The
> Kubernetes-API side is neutralized (`automountServiceAccountToken: false` —
> the build container has no API token), but the AWS side is not. This is
> accepted only while the platform has no untrusted users. Before opening the
> platform to real users, build Jobs must get a dedicated service account and a
> minimal, build-only IAM role with per-project session policies scoping S3
> access to `{userId}/{projectId}/`.

---

# RBAC

The backend drives the deployment pipeline through the Kubernetes API (creating
build Jobs, reading Job status, listing build pods, reading pod logs), so the
`hosting-platform` service account is granted a **namespaced Role + RoleBinding**
(`k8s/base/rbac.yaml`) with only those permissions:

```text
batch/jobs   : create, get
pods         : list
pods/log     : get
```

No cluster-wide permissions and no delete are granted (finished Jobs are removed
by `ttlSecondsAfterFinished`). Because build pods run with
`automountServiceAccountToken: false`, untrusted build code cannot use these
permissions.

---

# Ingress

The platform publishes applications using the AWS ALB Ingress Controller.

The **AWS Load Balancer Controller** must be installed in the cluster for the
Ingress to provision an Application Load Balancer. It is installed once via its
Helm chart, wrapped in `scripts/deployment/install-alb-controller.sh` (see
`16-deployment.md` "AWS Load Balancer Controller"). Its IAM permissions are
provisioned by Terraform (IAM module): a dedicated role bound to the
`aws-load-balancer-controller` service account (`kube-system`) through an EKS Pod
Identity association — the same approach as the backend service account, so no
permissions are attached to the node group and the Helm-created service account
needs no IRSA annotation. The role's policy is pinned to a specific controller
version (currently `v2.11.x`), so the installed controller version must match.

## HTTPS

The ALB terminates **HTTPS**, and the HTTP listener redirects to it
(`listen-ports` + `ssl-redirect` annotations). This is required, not optional:
the backend runs in Production mode and issues `Secure` session cookies, which
browsers drop over plain HTTP — so serving the app over HTTP would silently break
authentication. HTTPS on the ALB needs an **ACM certificate** (and therefore a
domain), supplied via the `certificate-arn` annotation. This makes a domain + ACM
a production prerequisite for the application endpoint (published sites already
get HTTPS via CloudFront).

The ACM certificate is DNS-validated and created by Terraform (see
`06-terraform.md` "ACM Module"); its ARN is stored in the `ACM_CERTIFICATE_ARN`
secret and `deploy.yml` injects it into this annotation at apply time. The domain's
Route53 hosted zone and the post-deploy alias record pointing at the ALB are manual
one-time steps — see `16-deployment.md` "HTTPS, certificates and DNS".

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

# Health Checks

The backend exposes an anonymous `GET /healthz` endpoint (ASP.NET Core health
checks) that returns 200 when the app is up. It is used by two independent
checkers:

* **Kubernetes probes** — the backend's readiness and liveness probes are HTTP
  `GET /healthz` (not bare TCP), so a pod is only considered healthy once the app
  actually responds.
* **ALB target-group health check** — the backend has no `/` route, so the ALB's
  default `/` health check would fail and the target group would return `503`.
  The backend Service sets `alb.ingress.kubernetes.io/healthcheck-path: /healthz`
  so the ALB checks the right endpoint.

The frontend serves `/` (200), so it keeps TCP probes and the ALB default check.

---

# Horizontal Pod Autoscaler

Only the **frontend** uses an HPA. The frontend is stateless and scales freely.

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

# Backend Replicas

The backend runs as a **single replica** with **no HPA** during the MVP. Its
deployment queue is in-memory and per-pod, and its ASP.NET Core Data Protection
keys are ephemeral, so multiple replicas would:

* lose deployments queued on a pod that scales down, and
* be unable to decrypt each other's authentication cookies.

A backend HPA (and multi-replica operation) should be re-enabled only once the
deployment queue is durable and Data Protection keys are persisted (see
"MVP Limitations" in `10-deployment-workflow.md`). A single-replica restart still
logs users out (ephemeral keys) and marks any in-flight deployment `Failed` via
startup recovery — accepted MVP trade-offs.

The single replica also serves as the platform's **effective deployment
concurrency limit**: the worker processes one deployment at a time per pod, so
exactly one build Job runs at a time cluster-wide. This is currently the only
global cap on build resource consumption (there is no per-user quota or rate
limit — projects per user are unlimited). Scaling the backend out would silently
remove this throttle, so explicit build-concurrency/quota controls must be
introduced together with any multi-replica backend.

---

# Node Capacity

Worker-node count is **effectively static**: no Cluster Autoscaler or Karpenter
is installed, so the managed node group never scales itself — the Terraform
min/max sizes only bound *manual* resizing. Consequences:

* The frontend HPA can only scale into existing node capacity; pods that do not
  fit remain `Pending`.
* A build Job pod that cannot be scheduled stays `Pending` until the Job's
  `activeDeadlineSeconds` / the worker's poll timeout expires, and the
  deployment is marked `Failed`.

This is why dev runs **2 nodes** (a build Job's 1000m CPU request does not fit
on a single t3.medium next to the apps and system pods — see docs/12
"Development Environment Values"). Node autoscaling is a future enhancement.

---

# Scaling Strategy

## Normal Operation

```text
Frontend: 1 Replica
Backend: 1 Replica (fixed)
```

## High Load

```text
Frontend: up to 3 Replicas
Backend: 1 Replica (fixed until durable queue + persisted keys)
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
* **Pod security hardening** for the app pods (an explicit `securityContext`:
  `runAsNonRoot`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem`).
  The application images already run as a non-root user (see `16-deployment.md`
  "Container images"), so declaring the `securityContext` is the remaining step;
  it is deferred because `readOnlyRootFilesystem` in particular must be validated
  against the running images (a read-only root can prevent a pod from starting),
  and build containers legitimately need to write and install packages at runtime.
* **Dedicated build service account + per-project IAM session policies** (see
  "Service Account and AWS Access").
* **Durable deployment queue + persisted Data Protection keys**, which together
  allow re-enabling a backend HPA / multi-replica backend.
