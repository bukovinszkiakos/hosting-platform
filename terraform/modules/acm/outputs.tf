output "certificate_arn" {
  description = "ARN of the validated ACM certificate for the platform domain (attach to the chosen HTTPS entry point when re-enabling custom-domain support), or null when no domain is configured."
  value       = local.enabled ? aws_acm_certificate_validation.this[0].certificate_arn : null
}

output "domain_name" {
  description = "The platform domain the certificate covers (empty when not configured)."
  value       = var.domain_name
}

output "hosted_zone_id" {
  description = "Route53 hosted zone ID used for DNS validation and for the post-deploy ALB alias record, or null when no domain is configured."
  value       = local.enabled ? data.aws_route53_zone.this[0].zone_id : null
}
