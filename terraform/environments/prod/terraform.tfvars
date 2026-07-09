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
