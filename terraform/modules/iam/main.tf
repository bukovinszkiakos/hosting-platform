# IAM module: the Backend Service IAM role (see docs/06-terraform.md "IAM Module").
#
# The EKS cluster and node-group roles are created in the EKS module (they are
# required to create the cluster and cannot be deferred); this module owns the
# distinct Backend Service role.
#
# Trust uses EKS Pod Identity (pods.eks.amazonaws.com) rather than IRSA, so no
# OIDC provider / extra Terraform provider is required. The role is bound to the
# platform's Kubernetes service account by the aws_eks_pod_identity_association
# below; the Pod Identity Agent addon that makes it effective is enabled in the
# EKS module.
#
# Permissions follow least privilege: scoped to the single hosting bucket and
# the single CloudFront distribution.

data "aws_caller_identity" "current" {}

locals {
  cloudfront_distribution_arn = "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${var.cloudfront_distribution_id}"
}

resource "aws_iam_role" "backend" {
  name = "${var.name_prefix}-backend"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "pods.eks.amazonaws.com" }
      Action    = ["sts:AssumeRole", "sts:TagSession"]
    }]
  })

  tags = {
    Name = "${var.name_prefix}-backend"
  }
}

resource "aws_iam_role_policy" "backend" {
  name = "${var.name_prefix}-backend"
  role = aws_iam_role.backend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "HostingBucketObjects"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = "${var.hosting_bucket_arn}/*"
      },
      {
        Sid      = "HostingBucketList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = var.hosting_bucket_arn
      },
      {
        Sid    = "CloudFrontInvalidation"
        Effect = "Allow"
        Action = [
          "cloudfront:CreateInvalidation",
          "cloudfront:GetInvalidation",
          "cloudfront:ListInvalidations",
        ]
        Resource = local.cloudfront_distribution_arn
      },
    ]
  })
}

# Binds the backend role to the platform's Kubernetes service account via EKS
# Pod Identity. Any pod that uses this service account - the backend Deployment
# and the per-deployment build Jobs - assumes the role and inherits its S3 and
# CloudFront permissions, without granting anything to the node role. The Pod
# Identity Agent addon is enabled in the EKS module.
resource "aws_eks_pod_identity_association" "backend" {
  cluster_name    = var.eks_cluster_name
  namespace       = var.service_account_namespace
  service_account = var.service_account_name
  role_arn        = aws_iam_role.backend.arn

  tags = {
    Name = "${var.name_prefix}-backend"
  }
}

# ---------------------------------------------------------------------------
# AWS Load Balancer Controller role
# ---------------------------------------------------------------------------
# The ALB Ingress (k8s/ingress/alb-ingress.yaml) is provisioned by the AWS Load
# Balancer Controller, which needs IAM permissions to create/manage ALBs, target
# groups and listeners. Same architecture as the backend role: Pod Identity binds
# this role to the controller's service account (kube-system/aws-load-balancer-
# controller), so nothing is granted to the node role.
#
# The controller itself is installed at deploy time (Helm); this only provisions
# its IAM prerequisites. alb-controller-iam-policy.json is the official policy for
# the pinned controller version (see docs/07-kubernetes.md) and must be kept in
# sync with the installed controller version.

resource "aws_iam_role" "alb_controller" {
  name = "${var.name_prefix}-alb-controller"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "pods.eks.amazonaws.com" }
      Action    = ["sts:AssumeRole", "sts:TagSession"]
    }]
  })

  tags = {
    Name = "${var.name_prefix}-alb-controller"
  }
}

resource "aws_iam_role_policy" "alb_controller" {
  name   = "${var.name_prefix}-alb-controller"
  role   = aws_iam_role.alb_controller.id
  policy = file("${path.module}/alb-controller-iam-policy.json")
}

resource "aws_eks_pod_identity_association" "alb_controller" {
  cluster_name    = var.eks_cluster_name
  namespace       = var.alb_controller_service_account_namespace
  service_account = var.alb_controller_service_account_name
  role_arn        = aws_iam_role.alb_controller.arn

  tags = {
    Name = "${var.name_prefix}-alb-controller"
  }
}
