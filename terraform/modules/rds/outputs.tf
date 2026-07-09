output "database_endpoint" {
  description = "Connection endpoint of the PostgreSQL instance (address:port)."
  value       = aws_db_instance.this.endpoint
}

output "database_name" {
  description = "Name of the initial PostgreSQL database."
  value       = aws_db_instance.this.db_name
}

output "database_username" {
  description = "Master username of the PostgreSQL database (non-secret; used to build the connection string during bootstrap)."
  value       = aws_db_instance.this.username
}
