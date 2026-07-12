terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment after backend resources are provisioned (see terraform/backend/).
  # use_lockfile enables S3 native state locking (Terraform >= 1.11), so no
  # DynamoDB table is required (see docs/06-terraform.md "Remote State").
  # backend "s3" {
  #   bucket       = "hosting-platform-tfstate"
  #   key          = "prod/terraform.tfstate"
  #   region       = "eu-central-1"
  #   use_lockfile = true
  #   encrypt      = true
  # }
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

  # Production headroom.
  node_instance_types = ["t3.large"]
  node_desired_size   = 3
  node_min_size       = 2
  node_max_size       = 5

  # Required, no default: production must explicitly restrict the public EKS
  # API endpoint to trusted administration CIDRs (docs/06-terraform.md
  # "EKS Module"). Supplied via terraform.tfvars at apply time.
  cluster_endpoint_public_access_cidrs = var.cluster_endpoint_public_access_cidrs
}

module "rds" {
  source = "../../modules/rds"

  name_prefix         = local.name_prefix
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  allowed_cidr_blocks = [var.vpc_cidr]
  db_password         = var.db_password

  # Production durability/availability (dev relies on the cheaper defaults).
  instance_class            = "db.t3.small"
  allocated_storage         = 50
  max_allocated_storage     = 100
  backup_retention_period   = 7
  multi_az                  = true
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name_prefix}-final"
}

module "s3" {
  source = "../../modules/s3"

  bucket_name = var.hosting_bucket_name
}

module "cloudfront" {
  source = "../../modules/cloudfront"

  bucket_name                 = module.s3.bucket_name
  bucket_regional_domain_name = module.s3.bucket_regional_domain_name

  # Serve from all edge locations in production.
  price_class = "PriceClass_All"
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

  # Production keeps the safe defaults: immutable tags, scan on push, and
  # force_delete off so repositories are never destroyed while holding images.
}

# The platform is served over HTTPS on this distribution's default
# *.cloudfront.net domain — no custom domain or ACM certificate required.
# Disabled until the ALB exists (set alb_dns_name in terraform.tfvars after the
# first deploy, then re-apply); see docs/16-deployment.md "HTTPS via the
# CloudFront default domain". The dormant modules/acm module remains available
# if custom-domain support is ever reintroduced. Price class stays at the
# default PriceClass_100: with caching disabled this distribution is a TLS
# terminator in front of the ALB, so wider edge coverage buys little.
module "cloudfront_platform" {
  source = "../../modules/cloudfront-platform"

  name_prefix  = local.name_prefix
  alb_dns_name = var.alb_dns_name
}
