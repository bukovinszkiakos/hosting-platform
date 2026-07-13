terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # use_lockfile enables S3 native state locking (Terraform >= 1.11), so no
  # DynamoDB table is required (see docs/06-terraform.md "Remote State").
  backend "s3" {
    bucket       = "hosting-platform-tfstate"
    key          = "dev/terraform.tfstate"
    region       = "eu-central-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "hosting-platform"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

locals {
  # Resource naming pattern: hosting-platform-{environment}-{resource}
  # (see docs/12 "Terraform Conventions").
  name_prefix = "hosting-platform-${var.environment}"
}

module "vpc" {
  source = "../../modules/vpc"

  name_prefix = local.name_prefix
  vpc_cidr    = var.vpc_cidr
  az_count    = var.az_count
}

module "eks" {
  source = "../../modules/eks"

  name_prefix        = local.name_prefix
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  # Explicit sizing — module defaults must not decide cost (docs/12 "Development
  # Environment Values"). Two nodes are the functional minimum: a build Job
  # requests 1000m CPU, which does not fit on a single t3.medium next to the
  # backend (500m), frontend (250m) and system pods, and there is no cluster
  # autoscaler to add a node on demand (min/max only bound manual resizing —
  # see docs/07-kubernetes.md "Node Capacity").
  node_instance_types = ["t3.medium"]
  node_desired_size   = 2
  node_min_size       = 1
  node_max_size       = 3
}

module "rds" {
  source = "../../modules/rds"

  name_prefix         = local.name_prefix
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  allowed_cidr_blocks = [var.vpc_cidr]
  db_password         = var.db_password
}

module "s3" {
  source = "../../modules/s3"

  bucket_name = var.hosting_bucket_name

  # Dev is ephemeral: allow 'terraform destroy' to remove the hosting bucket even
  # when it still holds published site objects (mirrors ecr force_delete and rds
  # skip_final_snapshot). Prevents BucketNotEmpty teardown failures.
  force_destroy = true
}

module "cloudfront" {
  source = "../../modules/cloudfront"

  bucket_name                 = module.s3.bucket_name
  bucket_regional_domain_name = module.s3.bucket_regional_domain_name
}

module "iam" {
  source = "../../modules/iam"

  name_prefix                = local.name_prefix
  hosting_bucket_arn         = module.s3.bucket_arn
  cloudfront_distribution_id = module.cloudfront.cloudfront_distribution_id
  eks_cluster_name           = module.eks.cluster_name
}

module "ecr" {
  source = "../../modules/ecr"

  name_prefix = local.name_prefix

  # Dev is ephemeral: allow 'terraform destroy' to remove repositories that still
  # hold images (mirrors the RDS skip_final_snapshot posture).
  force_delete = true
}

# The platform is served over HTTPS on this distribution's default
# *.cloudfront.net domain — no custom domain or ACM certificate required.
# Disabled until the ALB exists (set alb_dns_name in terraform.tfvars after the
# first deploy, then re-apply); see docs/16-deployment.md "HTTPS via the
# CloudFront default domain". The dormant modules/acm module remains available
# if custom-domain support is ever reintroduced.
module "cloudfront_platform" {
  source = "../../modules/cloudfront-platform"

  name_prefix  = local.name_prefix
  alb_dns_name = var.alb_dns_name
}
