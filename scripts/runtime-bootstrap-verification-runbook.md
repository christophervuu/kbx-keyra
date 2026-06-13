# FS-082 Runtime Bootstrap Verification Runbook

This runbook defines deterministic operator checks for validating runtime bootstrap stack deployment/update safety and endpoint readiness for `dev`, `preprod`, and `prod` runtime accounts.

Scope: FS-082 `template.yaml` runtime stack contracts (`/internal/deploy|rollback|execute|health|status`, ActiveSnapshots/DeploymentHistory tables, RuntimeArtifacts bucket, requestId-correlated logs).

---

## 1) Prerequisites

Required tools:

- AWS CLI v2
- SAM CLI
- `jq`
- network path to runtime internal API endpoint(s)

Required shell variables:

```bash
export AWS_REGION=us-east-1
export SERVICE_NAME=keyra-runtime
export API_STAGE=internal
export SNAPSHOTS_PREFIX=runtime/snapshots/
export SCHEMAS_PREFIX=runtime/schemas/
```

Environment/account mapping:

| Environment | Account ID | Suggested profile | Stack name |
|---|---:|---|---|
| dev | 897699593484 | `kbx-dev` | `dev-keyra-runtime` |
| preprod | 527737084689 | `kbx-preprod` | `preprod-keyra-runtime` |
| prod | 410618142059 | `kbx-prod` | `prod-keyra-runtime` |

---

## 2) Deploy/Update Verification (per environment)

Run these steps once for each env (`dev`, `preprod`, `prod`).

### 2.1 Validate/build template

```bash
sam validate --region "$AWS_REGION"
sam build
```

Pass criteria:

- `sam validate` exits `0`
- `sam build` exits `0`

### 2.2 Confirm AWS identity matches target runtime account

```bash
export ENV_NAME=dev
export AWS_PROFILE=kbx-dev

aws sts get-caller-identity --profile "$AWS_PROFILE"
```

Pass criteria:

- Returned `Account` equals target account for `ENV_NAME`

### 2.3 Deploy stack (create or update)

```bash
export STACK_NAME="${ENV_NAME}-keyra-runtime"

sam deploy \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    EnvironmentName="$ENV_NAME" \
    ServiceName="$SERVICE_NAME" \
    ApiStageName="$API_STAGE" \
    SnapshotsPrefix="$SNAPSHOTS_PREFIX" \
    SchemasPrefix="$SCHEMAS_PREFIX"
```

Pass criteria:

- Deploy exits `0`
- Stack status ends at `CREATE_COMPLETE` or `UPDATE_COMPLETE`

### 2.4 Verify required outputs are present and non-empty

```bash
aws cloudformation describe-stacks \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[].{Key:OutputKey,Value:OutputValue}' \
  --output table
```

Required outputs:

- `RuntimeApiUrl`
- `RuntimeApiId`
- `ActiveSnapshotsTableName`
- `DeploymentHistoryTableName`
- `RuntimeArtifactsBucketName`
- `DeployHandlerFunctionArn`
- `RuntimeExecuteFunctionArn`
- `StatusFunctionArn`

Pass criteria:

- Each required output exists
- Each output value is non-empty

### 2.5 Verify resource existence from outputs

```bash
RUNTIME_API_URL=$(aws cloudformation describe-stacks --region "$AWS_REGION" --profile "$AWS_PROFILE" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='RuntimeApiUrl'].OutputValue" --output text)
ACTIVE_TABLE=$(aws cloudformation describe-stacks --region "$AWS_REGION" --profile "$AWS_PROFILE" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='ActiveSnapshotsTableName'].OutputValue" --output text)
HISTORY_TABLE=$(aws cloudformation describe-stacks --region "$AWS_REGION" --profile "$AWS_PROFILE" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='DeploymentHistoryTableName'].OutputValue" --output text)
RUNTIME_BUCKET=$(aws cloudformation describe-stacks --region "$AWS_REGION" --profile "$AWS_PROFILE" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='RuntimeArtifactsBucketName'].OutputValue" --output text)

aws dynamodb describe-table --region "$AWS_REGION" --profile "$AWS_PROFILE" --table-name "$ACTIVE_TABLE" --query 'Table.TableStatus'
aws dynamodb describe-table --region "$AWS_REGION" --profile "$AWS_PROFILE" --table-name "$HISTORY_TABLE" --query 'Table.TableStatus'
aws s3api head-bucket --region "$AWS_REGION" --profile "$AWS_PROFILE" --bucket "$RUNTIME_BUCKET"
```

Pass criteria:

- both DynamoDB statuses are `"ACTIVE"`
- `head-bucket` exits `0`

### 2.6 Non-destructive update safety check

Re-run deploy with identical parameters:

```bash
sam deploy \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    EnvironmentName="$ENV_NAME" \
    ServiceName="$SERVICE_NAME" \
    ApiStageName="$API_STAGE" \
    SnapshotsPrefix="$SNAPSHOTS_PREFIX" \
    SchemasPrefix="$SCHEMAS_PREFIX"
```

Pass criteria:

- Command exits `0` (including empty changeset)
- Required outputs remain resolvable/non-empty
- Existing runtime data remains queryable (no table/bucket replacement side effects)

---

## 3) Endpoint Smoke Checks (per environment)

Use unique IDs for each run:

```bash
export MAPPING_ID="smoke-map-$(date +%s)"
export SNAPSHOT_ID="smoke-snapshot-1"
```

### 3.1 Health endpoint

```bash
curl -sS -i "$RUNTIME_API_URL/internal/health"
```

Pass criteria:

- HTTP `200`
- JSON includes readiness fields (`dynamo`, `s3`)
- response header includes `x-request-id`

### 3.2 Status endpoint before deploy

```bash
curl -sS -i "$RUNTIME_API_URL/internal/status/$MAPPING_ID"
```

Pass criteria:

- HTTP `200`
- payload indicates `not-deployed` + `activeSnapshot: null`
- response header includes `x-request-id`

### 3.3 Deploy endpoint

```bash
curl -sS -i -X POST "$RUNTIME_API_URL/internal/deploy" \
  -H 'content-type: application/json' \
  --data-raw "{
    \"mappingId\": \"$MAPPING_ID\",
    \"snapshotId\": \"$SNAPSHOT_ID\",
    \"snapshotHash\": \"smoke-hash-1\",
    \"sourceType\": \"version\",
    \"sourceNumber\": 1,
    \"requestedBy\": \"runtime-smoke\",
    \"snapshotPayload\": {
      \"mappingConfig\": {
        \"name\": \"Smoke Mapping\",
        \"version\": 1,
        \"engineVersion\": \"1.0.0\",
        \"config\": {},
        \"rules\": [{
          \"target\": \"Order.Amount\",
          \"type\": \"number\",
          \"expression\": \"source(\\\"amount\\\")\"
        }]
      }
    }
  }"
```

Pass criteria:

- HTTP `201`
- response body contains `mappingId`, `snapshotId`, `activeSnapshot`, `historyEvent`
- response header includes `x-request-id`

### 3.4 Execute endpoint

```bash
curl -sS -i -X POST "$RUNTIME_API_URL/internal/execute" \
  -H 'content-type: application/json' \
  --data-raw "{
    \"mappingId\": \"$MAPPING_ID\",
    \"sourceData\": { \"amount\": 42 }
  }"
```

Pass criteria:

- HTTP `200`
- payload includes `output` and `snapshotId`
- response header includes `x-request-id`

### 3.5 Status endpoint after deploy

```bash
curl -sS -i "$RUNTIME_API_URL/internal/status/$MAPPING_ID"
```

Pass criteria:

- HTTP `200`
- payload indicates deployed state with non-null active snapshot

### 3.6 Rollback endpoint (to same snapshot for smoke)

```bash
curl -sS -i -X POST "$RUNTIME_API_URL/internal/rollback" \
  -H 'content-type: application/json' \
  --data-raw "{
    \"mappingId\": \"$MAPPING_ID\",
    \"snapshotId\": \"$SNAPSHOT_ID\",
    \"requestedBy\": \"runtime-smoke\"
  }"
```

Pass criteria:

- HTTP `201`
- payload includes rollback history event and active pointer
- response header includes `x-request-id`

---

## 4) CloudWatch Log Correlation Checks

Validate FS-082 structured fields for deploy/rollback/execute/status handlers.

Log groups:

- `/aws/lambda/${ENV_NAME}-${SERVICE_NAME}-deploy`
- `/aws/lambda/${ENV_NAME}-${SERVICE_NAME}-rollback`
- `/aws/lambda/${ENV_NAME}-${SERVICE_NAME}-execute`
- `/aws/lambda/${ENV_NAME}-${SERVICE_NAME}-status`

Commands:

```bash
aws logs tail "/aws/lambda/${ENV_NAME}-${SERVICE_NAME}-deploy" --since 15m --profile "$AWS_PROFILE" --region "$AWS_REGION"
aws logs tail "/aws/lambda/${ENV_NAME}-${SERVICE_NAME}-rollback" --since 15m --profile "$AWS_PROFILE" --region "$AWS_REGION"
aws logs tail "/aws/lambda/${ENV_NAME}-${SERVICE_NAME}-execute" --since 15m --profile "$AWS_PROFILE" --region "$AWS_REGION"
aws logs tail "/aws/lambda/${ENV_NAME}-${SERVICE_NAME}-status" --since 15m --profile "$AWS_PROFILE" --region "$AWS_REGION"
```

Pass criteria:

- Each path includes JSON log lines containing:
  - `requestId`
  - `mappingId` (when applicable)
  - `snapshotId` (when applicable)
  - `outcome`
  - `durationMs`
  - `eventType`
- Request IDs from HTTP responses can be found in corresponding log lines.

---

## 5) Failure/Blocker Handling

If endpoint checks fail from workstation path:

- Confirm allowlist/network path to runtime internal API.
- Re-run smoke checks from approved bastion/VPN context.
- Record environment, request IDs, and failing command output.

If stack deploy/update fails:

- Capture CloudFormation events:

```bash
aws cloudformation describe-stack-events \
  --stack-name "$STACK_NAME" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --max-items 50
```

---

## 6) Dry-Run Capture (this session)

Dry-run target: `dev`

Executed:

```bash
aws sts get-caller-identity
```

Observed result:

- **Failed**: `NoCredentials` / unable to locate credentials in this execution environment.

Implication:

- Runtime-account deploy/update/endpoint smoke checks could not be executed in this session.
- Runbook commands are ready; operator with runtime account credentials must execute Section 2–4 and record outcomes.
