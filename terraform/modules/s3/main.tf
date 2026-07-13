# S3 module: shared hosting bucket for generated static website files, stored
# under {userId}/{projectId}/ keys by the backend (see docs/05-aws-architecture.md
# "S3 Storage" and docs/06-terraform.md "S3 Module").
#
# Objects are public website content delivered through CloudFront, so the bucket
# grants public read via a bucket policy (the backend sets no per-object ACLs).
# Restricting access to CloudFront only (Origin Access Control) is a future
# hardening: its bucket policy needs the CloudFront distribution ARN, which is
# created in the CloudFront module (Task 48).

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

# Allow a public-read bucket policy while keeping ACL-based public access
# disabled (the platform does not use object ACLs).
resource "aws_s3_bucket_public_access_block" "hosting" {
  bucket = aws_s3_bucket.hosting.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "hosting" {
  bucket = aws_s3_bucket.hosting.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadGetObject"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.hosting.arn}/*"
    }]
  })

  # The public-access block must permit public bucket policies before this
  # policy can be applied.
  depends_on = [aws_s3_bucket_public_access_block.hosting]
}
