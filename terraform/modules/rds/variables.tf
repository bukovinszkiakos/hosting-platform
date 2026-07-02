variable "name_prefix" {
  type        = string
  description = "Prefix applied to RDS resource names (e.g. hosting-platform-dev)."

  validation {
    condition     = length(var.name_prefix) > 0
    error_message = "name_prefix must not be empty."
  }
}

variable "vpc_id" {
  type        = string
  description = "ID of the VPC the database security group belongs to."

  validation {
    condition     = length(var.vpc_id) > 0
    error_message = "vpc_id must not be empty."
  }
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for the DB subnet group. RDS requires subnets in at least two AZs."

  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "private_subnet_ids must contain at least two subnets (RDS requires two AZs)."
  }
}

variable "allowed_cidr_blocks" {
  type        = list(string)
  description = "CIDR blocks allowed to reach PostgreSQL (5432). Typically the VPC CIDR so private workloads can connect."
  default     = []
}

variable "db_name" {
  type        = string
  description = "Name of the initial PostgreSQL database."
  default     = "hostingplatform"

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]*$", var.db_name))
    error_message = "db_name must start with a letter and contain only letters, digits, and underscores."
  }
}

variable "db_username" {
  type        = string
  description = "Master username for the PostgreSQL database."
  default     = "hostingplatform"

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]*$", var.db_username))
    error_message = "db_username must start with a letter and contain only letters, digits, and underscores."
  }
}

variable "db_password" {
  type        = string
  description = "Master password for the PostgreSQL database. Provide out-of-band (e.g. TF_VAR_db_password); never commit it."
  sensitive   = true

  validation {
    condition     = length(var.db_password) >= 8
    error_message = "db_password must be at least 8 characters."
  }
}

variable "engine_version" {
  type        = string
  description = "PostgreSQL engine version (major version 16 to match the rest of the platform)."
  default     = "16"
}

variable "instance_class" {
  type        = string
  description = "RDS instance class."
  default     = "db.t3.micro"
}

variable "allocated_storage" {
  type        = number
  description = "Allocated storage in GiB."
  default     = 20

  validation {
    condition     = var.allocated_storage >= 20
    error_message = "allocated_storage must be at least 20 GiB (RDS PostgreSQL minimum)."
  }
}

variable "backup_retention_period" {
  type        = number
  description = "Days to retain automated backups. 1 keeps dev costs low; production should retain several days. 0 disables automated backups."
  default     = 1

  validation {
    condition     = var.backup_retention_period >= 0 && var.backup_retention_period <= 35
    error_message = "backup_retention_period must be between 0 and 35 days."
  }
}

variable "multi_az" {
  type        = bool
  description = "Whether to run the database as Multi-AZ. Disabled by default to keep dev costs low."
  default     = false
}

variable "skip_final_snapshot" {
  type        = bool
  description = "Skip the final snapshot on deletion. True for dev; production should set this to false."
  default     = true
}

variable "deletion_protection" {
  type        = bool
  description = "Prevent the database from being deleted. Disabled for dev; production should enable it."
  default     = false
}

variable "final_snapshot_identifier" {
  type        = string
  description = "Name of the final snapshot taken on deletion. Required when skip_final_snapshot is false (production)."
  default     = null
}

variable "max_allocated_storage" {
  type        = number
  description = "Upper limit (GiB) for RDS storage autoscaling. null disables autoscaling (dev); production sets a cap above allocated_storage."
  default     = null
}
