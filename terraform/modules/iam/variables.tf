variable "name_prefix" {
  type        = string
  description = "Prefix applied to IAM resource names (e.g. hosting-platform-dev)."

  validation {
    condition     = length(var.name_prefix) > 0
    error_message = "name_prefix must not be empty."
  }
}

variable "hosting_bucket_arn" {
  type        = string
  description = "ARN of the S3 hosting bucket the backend uploads static sites to."

  validation {
    condition     = can(regex("^arn:aws:s3:::", var.hosting_bucket_arn))
    error_message = "hosting_bucket_arn must be a valid S3 bucket ARN (arn:aws:s3:::...)."
  }
}

variable "cloudfront_distribution_id" {
  type        = string
  description = "ID of the CloudFront distribution the backend invalidates after a deployment."

  validation {
    condition     = length(var.cloudfront_distribution_id) > 0
    error_message = "cloudfront_distribution_id must not be empty."
  }
}

variable "eks_cluster_name" {
  type        = string
  description = "Name of the EKS cluster the Pod Identity association is created in."

  validation {
    condition     = length(var.eks_cluster_name) > 0
    error_message = "eks_cluster_name must not be empty."
  }
}

variable "service_account_namespace" {
  type        = string
  description = "Kubernetes namespace of the service account bound to the backend role."
  default     = "hosting-platform"
}

variable "service_account_name" {
  type        = string
  description = "Kubernetes service account bound to the backend role via Pod Identity."
  default     = "hosting-platform"
}

variable "alb_controller_service_account_namespace" {
  type        = string
  description = "Namespace of the AWS Load Balancer Controller service account (Helm installs it in kube-system by default)."
  default     = "kube-system"
}

variable "alb_controller_service_account_name" {
  type        = string
  description = "Service account name of the AWS Load Balancer Controller, bound to its role via Pod Identity."
  default     = "aws-load-balancer-controller"
}

# --- GitHub Actions OIDC (deploy workflow) ---------------------------------

variable "environment" {
  type        = string
  description = "Environment name (dev/prod); used in the GitHub OIDC trust subject so this env's deploy role can only be assumed by the matching GitHub Environment."

  validation {
    condition     = length(var.environment) > 0
    error_message = "environment must not be empty."
  }
}

variable "github_repository" {
  type        = string
  description = "GitHub repository in owner/repo form allowed to assume the deploy role via OIDC (e.g. bukovinszkiakos/hosting-platform)."

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repository))
    error_message = "github_repository must be in 'owner/repo' form."
  }
}

variable "create_github_oidc_provider" {
  type        = string
  description = "Whether to create the account-global GitHub OIDC provider. Set false in an environment sharing an account where it already exists, and pass github_oidc_provider_arn instead."
  default     = true
}

variable "github_oidc_provider_arn" {
  type        = string
  description = "ARN of an existing GitHub OIDC provider to use when create_github_oidc_provider is false. Ignored otherwise."
  default     = ""
}
