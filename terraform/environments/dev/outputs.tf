output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = module.vpc.private_subnet_ids
}

output "eks_cluster_name" {
  description = "Name of the EKS cluster"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "API server endpoint of the EKS cluster"
  value       = module.eks.cluster_endpoint
}

output "eks_node_group_name" {
  description = "Name of the EKS managed node group"
  value       = module.eks.node_group_name
}

output "rds_database_endpoint" {
  description = "Connection endpoint of the RDS PostgreSQL instance"
  value       = module.rds.database_endpoint
}

output "rds_database_name" {
  description = "Name of the RDS PostgreSQL database"
  value       = module.rds.database_name
}

output "rds_database_username" {
  description = "Master username of the RDS PostgreSQL database (used to build the backend connection string during bootstrap)"
  value       = module.rds.database_username
}

output "s3_bucket_name" {
  description = "Name of the S3 hosting bucket"
  value       = module.s3.bucket_name
}

output "s3_bucket_arn" {
  description = "ARN of the S3 hosting bucket"
  value       = module.s3.bucket_arn
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = module.cloudfront.cloudfront_domain_name
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution (used for cache invalidation)"
  value       = module.cloudfront.cloudfront_distribution_id
}

output "backend_role_arn" {
  description = "ARN of the backend service IAM role"
  value       = module.iam.backend_role_arn
}

output "ecr_backend_repository_url" {
  description = "URI of the backend ECR repository (tag/push images here; pass as deploy.yml backend_image)"
  value       = module.ecr.repository_urls["backend"]
}

output "ecr_frontend_repository_url" {
  description = "URI of the frontend ECR repository (tag/push images here; pass as deploy.yml frontend_image)"
  value       = module.ecr.repository_urls["frontend"]
}

output "platform_cloudfront_domain_name" {
  description = "Default *.cloudfront.net domain of the platform distribution — the platform's public HTTPS URL (null until alb_dns_name is set post-first-deploy)"
  value       = module.cloudfront_platform.domain_name
}

output "platform_cloudfront_distribution_id" {
  description = "ID of the platform CloudFront distribution (null until alb_dns_name is set)"
  value       = module.cloudfront_platform.distribution_id
}

output "aws_region" {
  description = "AWS region of this environment (used by the config/secret bootstrap script)"
  value       = var.aws_region
}
