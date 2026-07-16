# ---------------------------------------------------------------------------
# GitHub Actions OIDC federation for the deploy workflow (.github/workflows/deploy.yml)
# ---------------------------------------------------------------------------
# Replaces the long-lived IAM user access keys (the AWS_ACCESS_KEY_ID /
# AWS_SECRET_ACCESS_KEY GitHub secrets) with short-lived credentials obtained via
# GitHub's OIDC provider. The workflow presents a signed OIDC token and AWS STS
# exchanges it for temporary credentials by assuming the role below
# (sts:AssumeRoleWithWebIdentity) — nothing long-lived is ever stored.
#
# Authorization has the same two layers the IAM user had:
#   * AWS/IAM layer      — the role may call eks:DescribeCluster (all that
#     `aws eks update-kubeconfig` needs) and push images to this environment's ECR
#     repositories (the CI "images" job in .github/workflows/ci.yml builds and
#     pushes on main). Every other action the deploy workflow performs is
#     `kubectl`, which IAM does not authorize.
#   * Kubernetes layer   — an EKS access entry maps the role to
#     AmazonEKSClusterAdminPolicy, exactly as the IAM user was mapped before
#     (previously the manual `aws eks create-access-entry` in docs/16 bootstrap
#     step 6). Cluster-admin is retained deliberately: the workflow creates the
#     namespace and RBAC Roles/RoleBindings, which narrower access policies cannot
#     do without escalation. Scoping this down is separate future work and is
#     intentionally out of scope for the OIDC migration.

data "aws_region" "current" {}

# The OIDC provider is account-global (one per issuer URL per AWS account). It is
# created by default; in an account that already has a GitHub OIDC provider (e.g. a
# second environment sharing the account), set create_github_oidc_provider = false
# and pass the existing provider ARN via github_oidc_provider_arn instead.
resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # GitHub's OIDC root CA thumbprint. AWS validates this provider against its own
  # trusted-CA store and no longer relies on this value, but the API still requires
  # a non-empty list; this is the long-published GitHub thumbprint.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = {
    Name = "${var.name_prefix}-github-actions"
  }
}

locals {
  # When not creating the provider, use the ARN passed in, or fall back to the
  # standard account-global GitHub provider ARN (its path is fixed by the issuer
  # URL), so callers only need to flip create_github_oidc_provider = false.
  existing_github_oidc_provider_arn = var.github_oidc_provider_arn != "" ? var.github_oidc_provider_arn : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
  github_oidc_provider_arn          = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : local.existing_github_oidc_provider_arn
  eks_cluster_arn                   = "arn:aws:eks:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:cluster/${var.eks_cluster_name}"

  # This environment's ECR repositories (hosting-platform-<env>-backend/-frontend).
  # Wildcard on the name_prefix covers both without wiring the ecr module in.
  ecr_repository_arn_pattern = "arn:aws:ecr:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:repository/${var.name_prefix}-*"
}

resource "aws_iam_role" "github_actions" {
  name = "${var.name_prefix}-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.github_oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        # The token audience must be sts.amazonaws.com (set by
        # aws-actions/configure-aws-credentials).
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        # Restrict to this repository AND the matching GitHub Environment. deploy.yml
        # sets `environment: dev|prod`, so the token subject is
        # `repo:<owner>/<repo>:environment:<env>`. This environment's role can
        # therefore only be assumed by that environment's deploy job — a workflow on
        # another branch, environment, or repository cannot assume it.
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:${var.environment}"
        }
      }
    }]
  })

  tags = {
    Name = "${var.name_prefix}-github-actions"
  }
}

# Least privilege at the IAM layer:
#   * eks:DescribeCluster — all `aws eks update-kubeconfig` (deploy.yml) needs.
#   * ECR push — the CI "images" job builds and pushes to this environment's
#     repositories. GetAuthorizationToken is not resource-scopeable (docker login),
#     so it is granted on "*"; the layer/image writes are scoped to the repos.
resource "aws_iam_role_policy" "github_actions" {
  name = "${var.name_prefix}-github-actions"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DescribeClusterForKubeconfig"
        Effect   = "Allow"
        Action   = "eks:DescribeCluster"
        Resource = local.eks_cluster_arn
      },
      {
        Sid      = "EcrAuthToken"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "EcrPushToHostingRepos"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
        ]
        Resource = local.ecr_repository_arn_pattern
      },
    ]
  })
}

# Kubernetes-layer authorization for the role, managed as code. Replaces the manual
# `aws eks create-access-entry` / `associate-access-policy` for the IAM user
# (docs/16 bootstrap step 6). The cluster's authentication_mode is
# API_AND_CONFIG_MAP (see the EKS module), so access entries are honored.
resource "aws_eks_access_entry" "github_actions" {
  cluster_name  = var.eks_cluster_name
  principal_arn = aws_iam_role.github_actions.arn
  type          = "STANDARD"

  tags = {
    Name = "${var.name_prefix}-github-actions"
  }
}

resource "aws_eks_access_policy_association" "github_actions" {
  cluster_name  = var.eks_cluster_name
  principal_arn = aws_iam_role.github_actions.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.github_actions]
}
