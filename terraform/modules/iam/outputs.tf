output "backend_role_arn" {
  description = "ARN of the backend service IAM role (bound to the backend's Kubernetes service account via Pod Identity)."
  value       = aws_iam_role.backend.arn
}

output "backend_role_name" {
  description = "Name of the backend service IAM role."
  value       = aws_iam_role.backend.name
}

output "alb_controller_role_arn" {
  description = "ARN of the AWS Load Balancer Controller IAM role (bound to its service account via Pod Identity)."
  value       = aws_iam_role.alb_controller.arn
}

output "alb_controller_role_name" {
  description = "Name of the AWS Load Balancer Controller IAM role."
  value       = aws_iam_role.alb_controller.name
}
