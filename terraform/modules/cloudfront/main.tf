# CloudFront module: CDN + HTTPS delivery for the static websites stored in the
# S3 hosting bucket (see docs/05-aws-architecture.md "CloudFront" and
# docs/06-terraform.md "CloudFront Module"). Users access published sites through
# the CloudFront domain.
#
# The S3 bucket is public-read (see the S3 module), so it is used as a plain S3
# REST origin without Origin Access Control. Locking the origin to CloudFront via
# OAC is a future hardening, tracked alongside the S3 module.

locals {
  origin_id = "s3-${var.bucket_name}"

  # CloudFront Function names allow only [a-zA-Z0-9-_]; bucket names may contain
  # dots, so normalize them out.
  index_rewrite_function_name = "${replace(var.bucket_name, ".", "-")}-index-rewrite"
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

# Resolve the bucket's regional domain name from just its name (the documented
# module input). Read at plan time, so it is not evaluated by terraform validate.
data "aws_s3_bucket" "hosting" {
  bucket = var.bucket_name
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
    origin_id   = local.origin_id
    domain_name = data.aws_s3_bucket.hosting.bucket_regional_domain_name

    # Empty origin access identity: the bucket is public, so no OAI is used.
    s3_origin_config {
      origin_access_identity = ""
    }
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
