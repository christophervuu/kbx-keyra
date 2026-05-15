# Persistence Integration Tests (FS-058 T-08)

These tests validate the persistence module against **real local services**:

- DynamoDB Local (port `8000`)
- LocalStack S3 (port `4566`)

## Prerequisites

- Docker Desktop (or compatible Docker runtime) running
- Ports `8000` and `4566` available

## Start local services

```bash
docker compose -f docker-compose.test.yml up -d
```

## Run integration tests

```bash
pnpm run test:integration:persistence
```

This script sets `RUN_PERSISTENCE_INTEGRATION=1` and runs:

- `tests/integration/persistence/projects.integration.test.ts`
- `tests/integration/persistence/mappings.integration.test.ts`
- `tests/integration/persistence/schema-metadata.integration.test.ts`
- `tests/integration/persistence/schema-nodes.integration.test.ts`
- `tests/integration/persistence/mapping-versions.integration.test.ts`
- `tests/integration/persistence/s3-content.integration.test.ts`

## Notes / limitations

- DynamoDB Local behavior can differ from AWS DynamoDB in edge cases (throughput/throttling behavior, service internals).
- LocalStack S3 behavior is close but not identical to AWS S3 for all advanced features.
- Tests are isolated using unique table/bucket names per run and explicit cleanup.
