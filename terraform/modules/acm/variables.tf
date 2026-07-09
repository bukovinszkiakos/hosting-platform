variable "domain_name" {
  type        = string
  description = "Fully-qualified domain for the platform's public HTTPS endpoint (e.g. app.example.com). Empty disables ACM/DNS: no certificate is created and the environment still applies."
  default     = ""

  validation {
    condition     = var.domain_name == "" || can(regex("^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$", var.domain_name))
    error_message = "domain_name must be empty or a valid lowercase FQDN (e.g. app.example.com)."
  }

  validation {
    condition     = var.domain_name == "" || var.hosted_zone_name != ""
    error_message = "hosted_zone_name is required when domain_name is set."
  }
}

variable "hosted_zone_name" {
  type        = string
  description = "Name of the existing public Route53 hosted zone authoritative for domain_name (e.g. example.com). Required when domain_name is set."
  default     = ""

  validation {
    condition     = var.hosted_zone_name == "" || can(regex("^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$", var.hosted_zone_name))
    error_message = "hosted_zone_name must be empty or a valid lowercase domain (e.g. example.com)."
  }
}

variable "subject_alternative_names" {
  type        = list(string)
  description = "Optional additional names (SANs) to include on the certificate."
  default     = []
}
