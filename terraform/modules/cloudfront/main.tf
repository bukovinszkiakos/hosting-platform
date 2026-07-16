# CloudFront module: CDN + HTTPS delivery for the static websites stored in the
# S3 hosting bucket (see docs/05-aws-architecture.md "CloudFront" and
# docs/06-terraform.md "CloudFront Module"). Users access published sites through
# the CloudFront domain.
#
# The S3 bucket is private (see the S3 module); CloudFront reads it via Origin
# Access Control (OAC), signing each origin request with SigV4. The bucket policy
# that grants this read is defined HERE, not in the S3 module, because it must
# reference this distribution's ARN — defining it here keeps the module
# dependency one-directional (s3 -> cloudfront) and avoids a cycle.

locals {
  origin_id = "s3-${var.bucket_name}"

  # CloudFront Function / OAC names allow only [a-zA-Z0-9-_]; bucket names may
  # contain dots, so normalize them out.
  index_rewrite_function_name = "${replace(var.bucket_name, ".", "-")}-index-rewrite"
  oac_name                    = "${replace(var.bucket_name, ".", "-")}-oac"
}

# Origin Access Control: CloudFront signs (SigV4) every request to the S3 origin
# as the CloudFront service principal, so the bucket can stay fully private.
resource "aws_cloudfront_origin_access_control" "this" {
  name                              = local.oac_name
  description                       = "OAC for ${var.bucket_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Rewrites directory-style requests to the per-site index.html. Sites are served
# under /{userId}/{projectId}/, where default_root_object does not apply and the
# S3 REST origin returns no index document (see index-rewrite.js).
resource "aws_cloudfront_function" "index_rewrite" {
  name    = local.index_rewrite_function_name
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite directory requests to index.html for ${var.bucket_name}"
  publish = true
  code    = file("${path.module}/index-rewrite.js")
}

# AWS-managed cache policy tuned for static content; avoids the deprecated
# forwarded_values block.
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Static site delivery for ${var.bucket_name}"
  default_root_object = "index.html"
  price_class         = var.price_class

  origin {
    origin_id                = local.origin_id
    domain_name              = var.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  default_cache_behavior {
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.index_rewrite.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # HTTPS via the default *.cloudfront.net certificate (custom domains / ACM are
  # a documented future item).
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.bucket_name}-cdn"
  }
}

# Bucket policy granting this distribution read access via OAC. Scoped to the
# CloudFront service principal AND this distribution's ARN (AWS:SourceArn), so no
# other distribution or account can read the private bucket (confused-deputy
# protection). Lives here rather than in the S3 module to avoid a dependency cycle.
resource "aws_s3_bucket_policy" "hosting" {
  bucket = var.bucket_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontServicePrincipalReadOnly"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${var.bucket_arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.this.arn
        }
      }
    }]
  })
}
