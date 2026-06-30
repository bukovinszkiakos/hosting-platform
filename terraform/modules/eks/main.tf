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

  vpc_config {
    subnet_ids = var.private_subnet_ids
  }

  # The cluster policy must be attached before the cluster is created.
  depends_on = [aws_iam_role_policy_attachment.cluster]

  tags = {
    Name = "${var.name_prefix}-eks"
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
