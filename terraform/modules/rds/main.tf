# RDS module: PostgreSQL database in the private subnets, reachable only from
# within the VPC (see docs/04-database.md, docs/05-aws-architecture.md, and
# docs/06-terraform.md "RDS Module"). The database is never publicly accessible.

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${var.name_prefix}-db-subnet-group"
  }
}

# Security group: allow PostgreSQL (5432) only from the configured CIDR blocks
# (the VPC), so private workloads such as the EKS nodes can connect while the
# database stays unreachable from the internet.
resource "aws_security_group" "this" {
  name        = "${var.name_prefix}-rds"
  description = "Allow PostgreSQL access from within the VPC"
  vpc_id      = var.vpc_id

  ingress {
    description = "PostgreSQL from allowed CIDR blocks"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name_prefix}-rds"
  }
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name_prefix}-postgres"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.this.id]

  backup_retention_period   = var.backup_retention_period
  multi_az                  = var.multi_az
  publicly_accessible       = false
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.final_snapshot_identifier

  tags = {
    Name = "${var.name_prefix}-postgres"
  }

  # The master password is set ONCE at creation from the value in SSM Parameter
  # Store (the canonical, write-once source of truth — see docs/16-deployment.md
  # "Database password"). Ignoring later changes makes it structurally impossible
  # for a subsequent `terraform apply` to silently reset the live master password
  # (e.g. if the SSM value were tampered with). Rotation is therefore a deliberate
  # out-of-band runbook, never a side effect of apply.
  lifecycle {
    ignore_changes = [password]
  }
}
