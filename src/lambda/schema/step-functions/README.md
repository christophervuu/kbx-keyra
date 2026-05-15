# Schema Ingestion Step Functions (FS-056 T-07)

This folder contains the ASL definition for large-schema ingestion orchestration:

- `schema-ingestion.asl.json`

## State Machine Overview

Happy path flow:

1. `ParseSchema`
2. `ChunkNodes`
3. `HasBatches` (Choice)
4. `ProcessBatches` (Map, max concurrency 10)
5. `AggregateResults`
6. `UpdateMetadata`
7. `BuildSuccessOutput`

Error flow:

- Any task state failure is caught and routed to `HandleError` → `BuildErrorOutput`.

## Input Contract

The state machine expects this input shape:

```json
{
  "schemaId": "<uuid>",
  "s3Key": "schemas/<schemaId>/original.json",
  "format": "json-schema"
}
```

## Batch Reference Contract (Parse → Map)

`ParseSchema` returns `batchReferences`, where each entry MUST follow:

```json
{
  "batchIndex": 0,
  "s3Key": "schemas/<schemaId>/batches/batch-0.json",
  "schemaId": "<uuid>",
  "nodeCount": 500
}
```

This contract must align with T-08 worker input expectations.

## Output Contract

Success:

```json
{
  "schemaId": "<uuid>",
  "status": "ready",
  "fieldCount": 23000
}
```

Failure:

```json
{
  "schemaId": "<uuid>",
  "status": "error",
  "fieldCount": 0
}
```

## Timeouts and Concurrency

- State machine `TimeoutSeconds`: `600` (10 minutes)
- Per-task `TimeoutSeconds`: `120` (2 minutes)
- `ProcessBatches.MaxConcurrency`: `10`

## Placeholder Lambda ARNs

Replace placeholders before deployment:

- `__PARSE_SCHEMA_LAMBDA_ARN__`
- `__PROCESS_BATCH_LAMBDA_ARN__`
- `__AGGREGATE_RESULTS_LAMBDA_ARN__`
- `__UPDATE_METADATA_LAMBDA_ARN__`
- `__HANDLE_ERROR_LAMBDA_ARN__`

## Manual Deployment Example

```bash
aws stepfunctions create-state-machine \
  --name keyra-schema-ingestion \
  --definition file://src/lambda/schema/step-functions/schema-ingestion.asl.json \
  --role-arn <STEP_FUNCTIONS_EXECUTION_ROLE_ARN>
```

For updates:

```bash
aws stepfunctions update-state-machine \
  --state-machine-arn <STATE_MACHINE_ARN> \
  --definition file://src/lambda/schema/step-functions/schema-ingestion.asl.json
```

## IAM Requirements (minimum)

Execution role permissions should include:

- `lambda:InvokeFunction` for all Lambda resources referenced in task states
- CloudWatch Logs permissions for Step Functions execution logging (if enabled)
