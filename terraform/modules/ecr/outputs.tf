output "repository_urls" {
  description = "Map of application name to ECR repository URI (account.dkr.ecr.<region>.amazonaws.com/<name>), used to tag and push images."
  value       = { for name, repo in aws_ecr_repository.this : name => repo.repository_url }
}

output "repository_arns" {
  description = "Map of application name to ECR repository ARN."
  value       = { for name, repo in aws_ecr_repository.this : name => repo.arn }
}

output "repository_names" {
  description = "Map of application name to ECR repository name."
  value       = { for name, repo in aws_ecr_repository.this : name => repo.name }
}
