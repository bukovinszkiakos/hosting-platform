# ECR module: private container registries for the platform's own application
# images (backend + frontend), pushed during bootstrap and consumed by the
# Kubernetes Deployments (see docs/05-aws-architecture.md "ECR",
# docs/06-terraform.md "ECR Module" and docs/16-deployment.md "Container images").
#
# One repository per application, named {name_prefix}-{app}
# (e.g. hosting-platform-dev-backend). Each environment owns its own
# repositories, keeping every environment independently reproducible from a fresh
# AWS account. The EKS node role already carries AmazonEC2ContainerRegistryReadOnly
# (see the EKS module), so nodes can pull these images without extra IAM.

locals {
  # The platform ships two images; both repositories are configured identically.
  repositories = toset(["backend", "frontend"])
}

resource "aws_ecr_repository" "this" {
  for_each = local.repositories

  name                 = "${var.name_prefix}-${each.key}"
  image_tag_mutability = var.image_tag_mutability
  force_delete         = var.force_delete

  # Scan images for known CVEs automatically on every push.
  image_scanning_configuration {
    scan_on_push = var.scan_on_push
  }

  # ECR encrypts at rest by default; AES256 keeps this simple and free (matches
  # the S3 module). KMS is a future hardening if a customer-managed key is needed.
  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name = "${var.name_prefix}-${each.key}"
  }
}

# Lifecycle policy: bound storage growth while keeping enough recent images for
# rollback. Untagged images (superseded manifests, failed pushes) are expired
# quickly; then only the most recent tagged/any images are retained.
#
# ECR requires the tagStatus="any" rule to have the highest rule priority
# (evaluated last), so the untagged cleanup runs first.
resource "aws_ecr_lifecycle_policy" "this" {
  for_each = aws_ecr_repository.this

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after ${var.untagged_image_expiry_days} day(s)."
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = var.untagged_image_expiry_days
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep only the ${var.max_image_count} most recent images."
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.max_image_count
        }
        action = { type = "expire" }
      },
    ]
  })
}
