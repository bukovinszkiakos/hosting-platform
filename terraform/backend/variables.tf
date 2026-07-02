variable "aws_region" {
  type        = string
  description = "AWS region for the Terraform backend resources"
  default     = "eu-central-1"

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]$", var.aws_region))
    error_message = "aws_region must be a valid AWS region identifier (e.g. eu-central-1)."
  }
}

variable "bucket_name" {
  type        = string
  description = "Name of the S3 bucket for Terraform state storage"
  default     = "hosting-platform-tfstate"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "bucket_name must be a valid S3 bucket name (lowercase letters, numbers, hyphens)."
  }
}
