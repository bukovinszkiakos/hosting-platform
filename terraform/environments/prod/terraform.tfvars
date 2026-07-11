aws_region  = "eu-central-1"
environment = "prod"

vpc_cidr = "10.1.0.0/16"
az_count = 3

hosting_bucket_name = "hosting-platform-prod-sites"

# REQUIRED at apply time (no default): trusted administration CIDRs for the
# public EKS API endpoint, e.g. your office/VPN egress IP. Deliberately not
# committed with a real value — set it here or via
# TF_VAR_cluster_endpoint_public_access_cidrs.
# cluster_endpoint_public_access_cidrs = ["203.0.113.10/32"]

# Set after the first deploy, once the Ingress has created the ALB
# (kubectl -n hosting-platform get ingress hosting-platform), then re-apply to
# create the platform CloudFront distribution — its *.cloudfront.net domain is
# the platform's public HTTPS URL. See docs/16-deployment.md "HTTPS via the
# CloudFront default domain".
# alb_dns_name = "k8s-<...>.elb.amazonaws.com"
