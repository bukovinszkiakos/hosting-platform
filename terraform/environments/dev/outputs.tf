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

output "s3_bucket_name" {
  description = "Name of the S3 hosting bucket"
  value       = module.s3.bucket_name
}

output "s3_bucket_arn" {
  description = "ARN of the S3 hosting bucket"
  value       = module.s3.bucket_arn
}

# Further outputs are added as modules are implemented (Tasks 48–49)
