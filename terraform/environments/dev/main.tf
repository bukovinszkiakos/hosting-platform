terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment after backend resources are provisioned (see terraform/backend/)
  # backend "s3" {
  #   bucket         = "hosting-platform-tfstate"
  #   key            = "dev/terraform.tfstate"
  #   region         = "eu-central-1"
  #   dynamodb_table = "hosting-platform-tfstate-lock"
  #   encrypt        = true
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
}

module "cloudfront" {
  source = "../../modules/cloudfront"

  bucket_name = module.s3.bucket_name
}

module "iam" {
  source = "../../modules/iam"

  name_prefix                = local.name_prefix
  hosting_bucket_arn         = module.s3.bucket_arn
  cloudfront_distribution_id = module.cloudfront.cloudfront_distribution_id
}
