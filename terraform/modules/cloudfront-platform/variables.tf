variable "name_prefix" {
  type        = string
  description = "Resource naming prefix (hosting-platform-{environment})"
}

variable "alb_dns_name" {
  type        = string
  description = "DNS name of the platform ALB (from `kubectl -n hosting-platform get ingress` after the first deploy). Empty (default) disables the distribution so the environment applies cleanly before the ALB exists."
  default     = ""

  validation {
    condition     = var.alb_dns_name == "" || can(regex("\\.elb\\.amazonaws\\.com$", var.alb_dns_name))
    error_message = "alb_dns_name must be an ALB DNS name ending in .elb.amazonaws.com (hostname only, no scheme or trailing slash)."
  }
}

variable "price_class" {
  type        = string
  description = "CloudFront price class for the platform distribution"
  default     = "PriceClass_100"
}
