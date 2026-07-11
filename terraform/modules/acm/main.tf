# ACM module: a DNS-validated ACM certificate for the platform's own public HTTPS
# endpoint (the ALB Ingress), validated through an existing Route53 hosted zone.
#
# DORMANT — not wired into any environment. The platform is served over HTTPS on
# the default *.cloudfront.net domain of the platform CloudFront distribution
# instead (modules/cloudfront-platform), so no custom domain or certificate is
# required (see docs/16-deployment.md "HTTPS via the CloudFront default domain").
# The module is kept, unused, to make custom-domain support easy to reintroduce:
# re-add the module call plus domain_name/hosted_zone_name variables in the
# environment, put the certificate on the CloudFront distribution (or an ALB
# HTTPS listener), and point a Route53 alias at the chosen entry point.
#
# The certificate is regional (same region as the ALB) — unlike the CloudFront
# distribution for user sites, which uses its own default *.cloudfront.net cert.
#
# Scope boundary (kept intentionally OUT of Terraform, see the docs):
#   * Domain registration — an external purchase, not IaC.
#   * The Route53 hosted zone + registrar NS delegation — a one-time manual step;
#     this module consumes the existing zone via a data source so a single
#     `terraform apply` can create AND validate the certificate.
#   * The ALB alias A/AAAA record — the ALB is created by the AWS Load Balancer
#     Controller after the app deploys, so its hostname is not known at infra-apply
#     time; that record is added once, post-deploy (external-dns is the future
#     automation).
#
# The whole module is gated on var.domain_name: when it is empty, nothing is
# created (certificate_arn output is null) so the environment still applies cleanly
# before a domain is available.

locals {
  enabled = var.domain_name != ""
}

data "aws_route53_zone" "this" {
  count = local.enabled ? 1 : 0

  name         = var.hosted_zone_name
  private_zone = false
}

resource "aws_acm_certificate" "this" {
  count = local.enabled ? 1 : 0

  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  # Replace the certificate without a window where the ALB has none attached.
  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = var.domain_name
  }
}

# One Route53 record per validation option (the domain + any SANs). ACM auto-renews
# a DNS-validated certificate as long as these records remain in place.
resource "aws_route53_record" "validation" {
  for_each = {
    for dvo in(local.enabled ? aws_acm_certificate.this[0].domain_validation_options : []) :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = data.aws_route53_zone.this[0].zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

# Blocks until ACM reports the certificate ISSUED, so the certificate_arn output is
# only produced once the certificate is actually usable by the ALB.
resource "aws_acm_certificate_validation" "this" {
  count = local.enabled ? 1 : 0

  certificate_arn         = aws_acm_certificate.this[0].arn
  validation_record_fqdns = [for record in aws_route53_record.validation : record.fqdn]
}
