variable "name_prefix" {
  type        = string
  description = "Prefix applied to ECR repository names (e.g. hosting-platform-dev); repositories are {name_prefix}-backend and {name_prefix}-frontend."

  validation {
    condition     = length(var.name_prefix) > 0
    error_message = "name_prefix must not be empty."
  }
}

variable "scan_on_push" {
  type        = bool
  description = "Run a vulnerability scan automatically each time an image is pushed."
  default     = true
}

variable "image_tag_mutability" {
  type        = string
  description = "IMMUTABLE prevents overwriting an existing tag (recommended so a deployed tag always maps to one exact image); MUTABLE allows overwriting."
  default     = "IMMUTABLE"

  validation {
    condition     = contains(["IMMUTABLE", "MUTABLE"], var.image_tag_mutability)
    error_message = "image_tag_mutability must be 'IMMUTABLE' or 'MUTABLE'."
  }
}

variable "max_image_count" {
  type        = number
  description = "Number of most-recent images to retain per repository; older images are expired by the lifecycle policy."
  default     = 10

  validation {
    condition     = var.max_image_count >= 1
    error_message = "max_image_count must be at least 1."
  }
}

variable "untagged_image_expiry_days" {
  type        = number
  description = "Days after which untagged images (superseded manifests, failed pushes) are expired."
  default     = 1

  validation {
    condition     = var.untagged_image_expiry_days >= 1
    error_message = "untagged_image_expiry_days must be at least 1."
  }
}

variable "force_delete" {
  type        = bool
  description = "Allow 'terraform destroy' to delete a repository that still contains images. Safe to enable in ephemeral environments; leave off in production."
  default     = false
}
