# Terraform

Infrastructure as Code for the Hosting Platform (see `docs/05-aws-architecture.md`
and `docs/06-terraform.md`).

## Layout

```text
terraform/
├── backend/                 # Remote state bootstrap: S3 state bucket (S3 native locking, no DynamoDB)
├── modules/                 # Reusable modules
│   ├── vpc/                 # VPC, public/private subnets, IGW, NAT, route tables
│   ├── eks/                 # EKS cluster, managed node group, cluster/node IAM roles, Pod Identity Agent addon
│   ├── rds/                 # PostgreSQL, subnet group, security group
│   ├── s3/                  # Static-site hosting bucket + public-read policy
│   ├── cloudfront/          # CDN/HTTPS distribution + index.html rewrite function
│   ├── ecr/                 # Backend + frontend container image repositories (scan on push, lifecycle policy)
│   ├── acm/                 # DNS-validated ACM certificate for the ALB HTTPS listener (gated on domain_name)
│   └── iam/                 # Backend + ALB Controller IAM roles (least privilege) + Pod Identity associations
└── environments/
    ├── dev/                 # Cost-minimized development environment
    └── prod/                # Production-sized environment
```

## Environments

Both environments compose the same modules; they differ only in variables:

| Setting              | dev                  | prod                  |
| -------------------- | -------------------- | --------------------- |
| VPC CIDR             | `10.0.0.0/16`        | `10.1.0.0/16`         |
| Availability Zones   | 2                    | 3                     |
| EKS nodes            | 1–3 × `t3.medium`    | 2–5 × `t3.large`      |
| RDS                  | `db.t3.micro`, single-AZ, 1-day backups, no final snapshot | `db.t3.small`, Multi-AZ, 7-day backups, final snapshot, deletion protection, storage autoscaling |
| CloudFront price     | `PriceClass_100`     | `PriceClass_All`      |

## Deploy

The database password is **never committed**. Provide it out-of-band:

```bash
export TF_VAR_db_password="<strong-password>"
```

`hosting_bucket_name` in `terraform.tfvars` must be globally unique across all of
AWS S3 — adjust it if the default name is taken.

To enable HTTPS on the platform's ALB endpoint, set `domain_name` and
`hosted_zone_name` in `terraform.tfvars` (an existing public Route53 hosted zone is
required — see `docs/16-deployment.md` "HTTPS, certificates and DNS"). Left empty
(the default), the ACM module is a no-op and the environment still applies.

### 1. Bootstrap remote state (once per AWS account)

```bash
cd terraform/backend
terraform init
terraform apply        # creates the S3 state bucket (state locking uses S3 use_lockfile)
```

### 2. Enable the S3 backend

Uncomment the `backend "s3"` block in `environments/<env>/main.tf` (it is left
commented so the configuration can be validated locally before the state bucket
exists).

### 3. Apply an environment

```bash
cd terraform/environments/dev      # or prod
terraform init
terraform plan
terraform apply
```

## Validate

No AWS credentials required:

```bash
terraform fmt -recursive -check
terraform -chdir=environments/dev validate
terraform -chdir=environments/prod validate
```
