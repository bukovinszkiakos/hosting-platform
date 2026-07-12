output "bucket_name" {
  description = "Name of the S3 hosting bucket."
  value       = aws_s3_bucket.hosting.bucket
}

output "bucket_arn" {
  description = "ARN of the S3 hosting bucket."
  value       = aws_s3_bucket.hosting.arn
}

output "bucket_regional_domain_name" {
  description = "Regional domain name of the S3 hosting bucket (used as the CloudFront origin)."
  value       = aws_s3_bucket.hosting.bucket_regional_domain_name
}
