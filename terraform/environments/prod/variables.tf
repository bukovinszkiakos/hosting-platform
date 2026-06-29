variable "aws_region" {
  type        = string
  description = "AWS region to deploy resources"

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]$", var.aws_region))
    error_message = "aws_region must be a valid AWS region identifier (e.g. eu-central-1)."
  }
}

variable "environment" {
  type        = string
  description = "Environment name"

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be 'dev' or 'prod'."
  }
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a valid IPv4 CIDR block (e.g. 10.1.0.0/16)."
  }
}

variable "az_count" {
  type        = number
  description = "Number of Availability Zones to spread subnets across"
  default     = 3

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be between 2 and 3."
  }
}

variable "db_password" {
  type        = string
  description = "Master password for the RDS PostgreSQL database. Provide via TF_VAR_db_password; never commit it."
  sensitive   = true

  validation {
    condition     = length(var.db_password) >= 8
    error_message = "db_password must be at least 8 characters."
  }
}

variable "hosting_bucket_name" {
  type        = string
  description = "Globally unique name of the S3 hosting bucket for generated static websites"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.hosting_bucket_name))
    error_message = "hosting_bucket_name must be a valid S3 bucket name."
  }
}
