aws_region  = "eu-central-1"
environment = "dev"

vpc_cidr = "10.0.0.0/16"
az_count = 2

hosting_bucket_name = "hosting-platform-dev-sites"

# Set after the first deploy, once the Ingress has created the ALB
# (kubectl -n hosting-platform get ingress hosting-platform), then re-apply to
# create the platform CloudFront distribution — its *.cloudfront.net domain is
# the platform's public HTTPS URL. See docs/16-deployment.md "HTTPS via the
# CloudFront default domain".
# alb_dns_name = "k8s-<...>.elb.amazonaws.com"
