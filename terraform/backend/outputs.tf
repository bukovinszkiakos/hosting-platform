output "bucket_name" {
  description = "Name of the S3 bucket used for Terraform state"
  value       = aws_s3_bucket.tfstate.bucket
}

output "bucket_arn" {
  description = "ARN of the S3 bucket used for Terraform state"
  value       = aws_s3_bucket.tfstate.arn
}

output "region" {
  description = "AWS region of the state bucket (use in each environment's backend \"s3\" block)"
  value       = var.aws_region
}
