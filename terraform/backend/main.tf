# Provisions the remote-state backend resources: the S3 bucket that stores
# Terraform state. State locking uses S3 native locking (use_lockfile, Terraform
# >= 1.11), so no DynamoDB lock table is required (see docs/06-terraform.md
# "Remote State"). Apply this with local state first, then enable the S3 backend
# blocks in the environments and run `terraform init -migrate-state`.
terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_s3_bucket" "tfstate" {
  bucket = var.bucket_name

  # This bucket holds ALL Terraform state (every environment). Guard it against
  # accidental deletion — a stray `terraform destroy` here would orphan every
  # environment's state. Intentionally tearing it down requires removing this block
  # first (see terraform/README.md "Remote state bootstrap" -> recovery/teardown).
  # Versioning (below) additionally allows recovering a previous state object.
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name        = var.bucket_name
    Project     = "hosting-platform"
    Environment = "global"
    ManagedBy   = "Terraform"
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
