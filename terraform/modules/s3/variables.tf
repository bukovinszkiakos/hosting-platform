variable "bucket_name" {
  type        = string
  description = "Globally unique name of the S3 hosting bucket for generated static website files."

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "bucket_name must be a valid S3 bucket name (3-63 chars: lowercase letters, numbers, hyphens, dots)."
  }
}

variable "force_destroy" {
  type        = bool
  description = "Allow 'terraform destroy' to delete the bucket even when it still holds published site objects. Enable in ephemeral environments (dev) so teardown never fails with BucketNotEmpty; keep disabled in prod so published content is never silently deleted."
  default     = false
}
