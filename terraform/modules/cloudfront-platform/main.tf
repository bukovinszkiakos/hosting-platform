# CloudFront-platform module: HTTPS entry point for the PLATFORM itself (the
# Next.js frontend + API behind the ALB), served on the distribution's default
# *.cloudfront.net domain so no custom domain or ACM certificate is required
# (see docs/05-aws-architecture.md "HTTPS Without a Custom Domain" and
# docs/16-deployment.md "HTTPS via the CloudFront default domain").
#
# This is deliberately a SECOND distribution, separate from the user-sites
# distribution (modules/cloudfront): user sites occupy the path root
# (/{userId}/{projectId}) of their distribution, which would collide with the
# platform frontend at /. A distribution has no fixed cost, so the separation
# is free.
#
# Traffic flow:  browser --HTTPS--> *.cloudfront.net --HTTP--> ALB --> Ingress.
# TLS terminates at CloudFront (default certificate); the CloudFront->ALB hop is
# plain HTTP — an accepted MVP trade-off, documented in docs/16-deployment.md
# "Limitations".
#
# Chicken-and-egg gating: the ALB is created by the AWS Load Balancer Controller
# when the Ingress is first applied, so its DNS name is unknown on the initial
# `terraform apply`. The whole module is therefore gated on var.alb_dns_name
# (same pattern as the dormant ACM module's domain_name gate): apply with the
# default "" first, run the first deploy, then set alb_dns_name in
# terraform.tfvars and apply again to create the distribution.

locals {
  enabled   = var.alb_dns_name != ""
  origin_id = "alb-${var.name_prefix}"
}

# AWS-managed policies for dynamic (non-cacheable) content behind a load
# balancer: never cache, and forward all headers (including Host), cookies and
# query strings to the origin.
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

resource "aws_cloudfront_distribution" "this" {
  count = local.enabled ? 1 : 0

  enabled         = true
  is_ipv6_enabled = true
  comment         = "Platform entry point for ${var.name_prefix} (ALB origin)"
  price_class     = var.price_class

  origin {
    origin_id   = local.origin_id
    domain_name = var.alb_dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only" # the ALB has no certificate; TLS ends at CloudFront
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"

    # The platform is a dynamic app (session cookies, JSON API): allow every
    # HTTP method and disable caching entirely.
    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD"]

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # HTTPS via the default *.cloudfront.net certificate — the whole point of this
  # module: valid, auto-renewed TLS with no domain purchase.
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.name_prefix}-platform-cdn"
  }
}
