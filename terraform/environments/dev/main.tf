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

module "vpc" {
  source = "../../modules/vpc"

  name_prefix = "hosting-platform-${var.environment}"
  vpc_cidr    = var.vpc_cidr
  az_count    = var.az_count
}

# Further module invocations are added as modules are implemented (Tasks 45–49)
