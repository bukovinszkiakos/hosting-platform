output "bucket_name" {
  description = "Name of the S3 hosting bucket."
  value       = aws_s3_bucket.hosting.bucket
}

output "bucket_arn" {
  description = "ARN of the S3 hosting bucket."
  value       = aws_s3_bucket.hosting.arn
}
