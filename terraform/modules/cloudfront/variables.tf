variable "bucket_name" {
  type        = string
  description = "Name of the S3 hosting bucket used as the CloudFront origin."

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "bucket_name must be a valid S3 bucket name."
  }
}

variable "bucket_regional_domain_name" {
  type        = string
  description = "Regional domain name of the S3 hosting bucket (the CloudFront origin). Pass the s3 module's bucket_regional_domain_name output — a data-source lookup by name would fail at plan time while the bucket does not exist yet."
}

variable "bucket_arn" {
  type        = string
  description = "ARN of the S3 hosting bucket (the s3 module's bucket_arn output). Used by the OAC bucket policy defined in this module to grant CloudFront read access."
}

variable "price_class" {
  type        = string
  description = "CloudFront price class. PriceClass_100 (US/EU edges) keeps dev costs lowest."
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}
