output "domain_name" {
  description = "Default *.cloudfront.net domain of the platform distribution — the platform's public HTTPS URL (null until alb_dns_name is set)"
  value       = local.enabled ? aws_cloudfront_distribution.this[0].domain_name : null
}

output "distribution_id" {
  description = "ID of the platform CloudFront distribution (null until alb_dns_name is set)"
  value       = local.enabled ? aws_cloudfront_distribution.this[0].id : null
}
