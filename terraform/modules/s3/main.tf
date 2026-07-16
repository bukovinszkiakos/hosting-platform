# S3 module: shared hosting bucket for generated static website files, stored
# under {userId}/{projectId}/ keys by the backend (see docs/05-aws-architecture.md
# "S3 Storage" and docs/06-terraform.md "S3 Module").
#
# The bucket is PRIVATE: it has no public access and no bucket policy of its own.
# Objects are served only through CloudFront, which reads them with Origin Access
# Control (OAC). The read-granting bucket policy is defined in the CloudFront
# module because it must reference that distribution's ARN (see
# modules/cloudfront/main.tf); the backend writes objects via its IAM role, not a
# bucket policy.

resource "aws_s3_bucket" "hosting" {
  bucket = var.bucket_name

  # When true, 'terraform destroy' empties and removes the bucket even if it still
  # holds published site objects (see variable docs). Gated per environment.
  force_destroy = var.force_destroy

  tags = {
    Name = var.bucket_name
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "hosting" {
  bucket = aws_s3_bucket.hosting.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block all public access. The OAC bucket policy (in the CloudFront module) grants
# read only to the CloudFront service principal, scoped to the distribution ARN —
# that policy is not "public", so restrict_public_buckets/block_public_policy do
# not reject it.
resource "aws_s3_bucket_public_access_block" "hosting" {
  bucket = aws_s3_bucket.hosting.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}
