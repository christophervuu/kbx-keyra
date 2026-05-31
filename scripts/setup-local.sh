#!/usr/bin/env bash
set -euo pipefail

# FS-062 T-08 local environment bootstrap.
# Prerequisites:
# - Docker Desktop / Docker Engine running
# - aws CLI v2 installed
#
# Usage:
#   docker compose up -d
#   ./scripts/setup-local.sh
#
# Linux note:
# - `host.docker.internal` may require additional Docker host networking setup.

DDB_ENDPOINT="http://localhost:8000"
S3_ENDPOINT="http://localhost:4566"
BUCKET_NAME="dev-keyra-storage-local"

PROJECTS_TABLE="dev-keyra-projects"
MAPPINGS_TABLE="dev-keyra-mappings"
SCHEMA_METADATA_TABLE="dev-keyra-schema-metadata"
SCHEMA_NODES_TABLE="dev-keyra-schema-nodes"
MAPPING_VERSIONS_TABLE="dev-keyra-mapping-versions"

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-local}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-local}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
}

wait_for_dynamodb() {
  echo "Checking DynamoDB Local on ${DDB_ENDPOINT}..."
  for _ in {1..30}; do
    if aws dynamodb list-tables --endpoint-url "$DDB_ENDPOINT" >/dev/null 2>&1; then
      echo "DynamoDB Local is reachable."
      return 0
    fi
    sleep 1
  done

  echo "DynamoDB Local is not reachable at ${DDB_ENDPOINT}."
  echo "Start services first: docker compose up -d"
  exit 1
}

wait_for_localstack_s3() {
  echo "Checking LocalStack S3 on ${S3_ENDPOINT}..."
  for _ in {1..30}; do
    if aws s3 ls --endpoint-url "$S3_ENDPOINT" >/dev/null 2>&1; then
      echo "LocalStack S3 is reachable."
      return 0
    fi
    sleep 1
  done

  echo "LocalStack S3 is not reachable at ${S3_ENDPOINT}."
  echo "Start services first: docker compose up -d"
  exit 1
}

table_exists() {
  local table_name="$1"
  aws dynamodb describe-table \
    --table-name "$table_name" \
    --endpoint-url "$DDB_ENDPOINT" >/dev/null 2>&1
}

create_projects_table() {
  if table_exists "$PROJECTS_TABLE"; then
    echo "[exists] $PROJECTS_TABLE"
    return
  fi

  aws dynamodb create-table \
    --table-name "$PROJECTS_TABLE" \
    --attribute-definitions AttributeName=projectId,AttributeType=S \
    --key-schema AttributeName=projectId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --endpoint-url "$DDB_ENDPOINT" >/dev/null

  echo "[created] $PROJECTS_TABLE"
}

create_mappings_table() {
  if table_exists "$MAPPINGS_TABLE"; then
    echo "[exists] $MAPPINGS_TABLE"
    return
  fi

  aws dynamodb create-table \
    --table-name "$MAPPINGS_TABLE" \
    --attribute-definitions \
      AttributeName=mappingId,AttributeType=S \
      AttributeName=projectId,AttributeType=S \
    --key-schema AttributeName=mappingId,KeyType=HASH \
    --global-secondary-indexes \
      '[{"IndexName":"projectId-index","KeySchema":[{"AttributeName":"projectId","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
    --billing-mode PAY_PER_REQUEST \
    --endpoint-url "$DDB_ENDPOINT" >/dev/null

  echo "[created] $MAPPINGS_TABLE"
}

create_schema_metadata_table() {
  if table_exists "$SCHEMA_METADATA_TABLE"; then
    echo "[exists] $SCHEMA_METADATA_TABLE"
    return
  fi

  aws dynamodb create-table \
    --table-name "$SCHEMA_METADATA_TABLE" \
    --attribute-definitions AttributeName=schemaId,AttributeType=S \
    --key-schema AttributeName=schemaId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --endpoint-url "$DDB_ENDPOINT" >/dev/null

  echo "[created] $SCHEMA_METADATA_TABLE"
}

create_schema_nodes_table() {
  if table_exists "$SCHEMA_NODES_TABLE"; then
    echo "[exists] $SCHEMA_NODES_TABLE"
    return
  fi

  aws dynamodb create-table \
    --table-name "$SCHEMA_NODES_TABLE" \
    --attribute-definitions \
      AttributeName=schemaId,AttributeType=S \
      AttributeName=path,AttributeType=S \
      AttributeName=fieldName,AttributeType=S \
      AttributeName=schemaIdPath,AttributeType=S \
      AttributeName=parentPath,AttributeType=S \
    --key-schema \
      AttributeName=schemaId,KeyType=HASH \
      AttributeName=path,KeyType=RANGE \
    --global-secondary-indexes \
      '[{"IndexName":"fieldName-index","KeySchema":[{"AttributeName":"fieldName","KeyType":"HASH"},{"AttributeName":"schemaIdPath","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},{"IndexName":"parentPath-index","KeySchema":[{"AttributeName":"schemaId","KeyType":"HASH"},{"AttributeName":"parentPath","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
    --billing-mode PAY_PER_REQUEST \
    --endpoint-url "$DDB_ENDPOINT" >/dev/null

  echo "[created] $SCHEMA_NODES_TABLE"
}

create_mapping_versions_table() {
  if table_exists "$MAPPING_VERSIONS_TABLE"; then
    echo "[exists] $MAPPING_VERSIONS_TABLE"
    return
  fi

  aws dynamodb create-table \
    --table-name "$MAPPING_VERSIONS_TABLE" \
    --attribute-definitions \
      AttributeName=mappingId,AttributeType=S \
      AttributeName=version,AttributeType=N \
    --key-schema \
      AttributeName=mappingId,KeyType=HASH \
      AttributeName=version,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    --endpoint-url "$DDB_ENDPOINT" >/dev/null

  echo "[created] $MAPPING_VERSIONS_TABLE"
}

bucket_exists() {
  aws s3api head-bucket \
    --bucket "$BUCKET_NAME" \
    --endpoint-url "$S3_ENDPOINT" >/dev/null 2>&1
}

create_bucket() {
  if bucket_exists; then
    echo "[exists] s3://$BUCKET_NAME"
    return
  fi

  aws s3 mb "s3://$BUCKET_NAME" --endpoint-url "$S3_ENDPOINT" >/dev/null
  echo "[created] s3://$BUCKET_NAME"
}

main() {
  require_command aws

  wait_for_dynamodb
  wait_for_localstack_s3

  create_projects_table
  create_mappings_table
  create_schema_metadata_table
  create_schema_nodes_table
  create_mapping_versions_table
  create_bucket

  echo
  echo "Local setup complete."
  echo "Verify DynamoDB tables: aws dynamodb list-tables --endpoint-url $DDB_ENDPOINT"
  echo "Verify S3 buckets:      aws s3 ls --endpoint-url $S3_ENDPOINT"
}

main
