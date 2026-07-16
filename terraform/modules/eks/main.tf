# EKS module: cluster + managed node group running in the private subnets (see
# docs/05-aws-architecture.md and docs/06-terraform.md "EKS Module").
#
# The cluster and node-group IAM roles are created here because the EKS module's
# documented responsibility includes "Create Cluster IAM Roles", and a cluster /
# node group cannot be created without them (role_arn / node_role_arn are
# required). The IAM module (Task 49) owns the separate Backend Service roles.

# ---------------------------------------------------------------------------
# Cluster IAM role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "cluster" {
  name = "${var.name_prefix}-eks-cluster"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "cluster" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

# ---------------------------------------------------------------------------
# Node group IAM role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "node" {
  name = "${var.name_prefix}-eks-node"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Minimum managed policies required by EKS worker nodes.
resource "aws_iam_role_policy_attachment" "node" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
  ])

  role       = aws_iam_role.node.name
  policy_arn = each.value
}

# ---------------------------------------------------------------------------
# Cluster
# ---------------------------------------------------------------------------

resource "aws_eks_cluster" "this" {
  name     = "${var.name_prefix}-eks"
  role_arn = aws_iam_role.cluster.arn
  version  = var.kubernetes_version

  # EKS access entries need API_AND_CONFIG_MAP (or API) authentication — the CI
  # deploy role (GitHub OIDC) is granted cluster access via an EKS access entry
  # created by the IAM module (modules/iam/github-oidc.tf), which is REJECTED on a
  # CONFIG_MAP cluster. Clusters created through the API/SDK (i.e. Terraform)
  # default to CONFIG_MAP, so the mode must be set explicitly. The cluster creator
  # keeps admin access (bootstrap_cluster_creator_admin_permissions is the API
  # default, stated here for clarity).
  access_config {
    authentication_mode                         = "API_AND_CONFIG_MAP"
    bootstrap_cluster_creator_admin_permissions = true
  }

  vpc_config {
    subnet_ids = var.private_subnet_ids

    # Enable the private API endpoint so in-VPC traffic reaches the API server
    # privately. The public endpoint stays enabled so administrators can run
    # kubectl/helm during deployment; restrict public_access_cidrs to trusted
    # locations in production (defaults to open — see variables).
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = var.cluster_endpoint_public_access_cidrs
  }

  # The cluster policy must be attached before the cluster is created.
  depends_on = [aws_iam_role_policy_attachment.cluster]

  tags = {
    Name = "${var.name_prefix}-eks"
  }
}

# ---------------------------------------------------------------------------
# Node launch template (IMDSv2 enforcement)
# ---------------------------------------------------------------------------
# aws_eks_node_group has no metadata_options argument, so requiring IMDSv2 on the
# worker instances must go through a launch template (the AWS-documented method).
# The template sets ONLY the metadata options: with no image_id, instance_type or
# user_data, EKS still selects the EKS-optimized AMI and generates the node
# bootstrap user data as usual, so this stays a minimal, metadata-only override.

resource "aws_launch_template" "node" {
  name = "${var.name_prefix}-node"

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required" # IMDSv2 only — reject token-less IMDSv1 requests

    # Hop limit 1: node-level components (kubelet, VPC CNI, kube-proxy, the Pod
    # Identity Agent) run in the host network namespace and still reach IMDS, but
    # pods in their own namespace cannot. Build Jobs run untrusted repository
    # code, so blocking them from stealing the node role's credentials is the
    # point (see docs/16-deployment.md "Post-deploy verification"). Pods receive
    # AWS credentials from EKS Pod Identity, not IMDS, so nothing in-cluster
    # depends on pod IMDS access.
    http_put_response_hop_limit = 1
  }

  tags = {
    Name = "${var.name_prefix}-node"
  }
}

# ---------------------------------------------------------------------------
# Managed node group
# ---------------------------------------------------------------------------

resource "aws_eks_node_group" "this" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.name_prefix}-ng"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.private_subnet_ids
  instance_types  = var.node_instance_types

  # Enforce IMDSv2 on the worker instances. The launch template omits the
  # instance type, so instance_types above still governs sizing.
  launch_template {
    id      = aws_launch_template.node.id
    version = aws_launch_template.node.latest_version
  }

  scaling_config {
    desired_size = var.node_desired_size
    min_size     = var.node_min_size
    max_size     = var.node_max_size
  }

  # Node policies must be attached before the nodes join the cluster.
  depends_on = [aws_iam_role_policy_attachment.node]

  tags = {
    Name = "${var.name_prefix}-ng"
  }
}

# ---------------------------------------------------------------------------
# EKS Pod Identity Agent
# ---------------------------------------------------------------------------
# Runs the agent that lets pods assume IAM roles via Pod Identity associations.
# The Backend Service role is associated with the platform service account in
# the IAM module (Task 49); this addon makes that association effective at
# runtime. See docs/06-terraform.md and docs/07-kubernetes.md.

resource "aws_eks_addon" "pod_identity_agent" {
  cluster_name = aws_eks_cluster.this.name
  addon_name   = "eks-pod-identity-agent"

  # The agent runs as pods on the worker nodes, so the node group must exist.
  depends_on = [aws_eks_node_group.this]

  tags = {
    Name = "${var.name_prefix}-pod-identity-agent"
  }
}

# ---------------------------------------------------------------------------
# Metrics Server
# ---------------------------------------------------------------------------
# Community EKS add-on providing the resource-metrics API (metrics.k8s.io) that
# the frontend HPA (k8s/hpa/frontend-hpa.yaml) reads pod CPU utilization from.
# Without it the HPA reports <unknown> and never scales. It runs as a small
# deployment on the existing worker nodes — the add-on itself is free, so there
# is no additional AWS cost. See docs/07-kubernetes.md "Horizontal Pod
# Autoscaler".

resource "aws_eks_addon" "metrics_server" {
  cluster_name = aws_eks_cluster.this.name
  addon_name   = "metrics-server"

  # Runs as pods on the worker nodes, so the node group must exist.
  depends_on = [aws_eks_node_group.this]

  tags = {
    Name = "${var.name_prefix}-metrics-server"
  }
}
