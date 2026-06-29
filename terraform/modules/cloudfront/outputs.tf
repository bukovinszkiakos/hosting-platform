output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution (e.g. dxxxx.cloudfront.net)."
  value       = aws_cloudfront_distribution.this.domain_name
}

# Practical addition beyond the documented output: the backend needs the
# distribution ID to issue cache invalidations (see AwsSettings.CloudFrontDistributionId).
output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution (used for cache invalidation)."
  value       = aws_cloudfront_distribution.this.id
}
