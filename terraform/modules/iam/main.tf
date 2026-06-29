# IAM module: the Backend Service IAM role (see docs/06-terraform.md "IAM Module").
#
# The EKS cluster and node-group roles are created in the EKS module (they are
# required to create the cluster and cannot be deferred); this module owns the
# distinct Backend Service role.
#
# Trust uses EKS Pod Identity (pods.eks.amazonaws.com) rather than IRSA, so no
# OIDC provider / extra Terraform provider is required. At runtime the role is
# bound to the backend's Kubernetes service account via the EKS Pod Identity
# Agent addon and a pod identity association (Kubernetes manifests / Task 50).
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
