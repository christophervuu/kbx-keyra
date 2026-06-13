# SPEC

## Title

Create KeyRa runtime environment bootstrap via `template.yaml`

---

## ID

FS-082

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-03  
Last Updated: 2026-06-03  
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Define a deployable, reusable IaC stack (`template.yaml`) that bootstraps the KeyRa runtime footprint in each target runtime AWS account (Dev, Preprod, Prod). The stack must provide local snapshot/schema storage, active snapshot pointer tracking, deploy/rollback APIs, and generic mapping execution without cross-account role assumption. Scope is intentionally minimal for MVP but structured for later hardening.

---

## Problem

The deployment model now requires sandbox/control-plane orchestration to call a thin deployment API in each target environment, but there is no finalized per-environment runtime bootstrap contract. Without a consistent template and resource contract, environments risk drift, unclear runtime behavior, and non-deterministic rollout/update operations.

---

## Goal

Produce a concrete, implementation-ready runtime bootstrap specification that defines:
- exact AWS resources per runtime environment,
- naming/parameterization conventions,
- `template.yaml` shape,
- runtime env vars and stack outputs,
- DynamoDB and S3 storage contracts,
- API routes and Lambda responsibilities,
- MVP observability baseline,
- stack deployment/update workflow,
- explicit non-goals, assumptions, risks, and open questions.

---

## Assumptions

- Sandbox control plane invokes runtime APIs in target accounts; runtime accounts do not AssumeRole back to sandbox.
- Runtime accounts for this phase are:
  - Dev: `kbxt-b2b-integrations-dev` (`897699593484`)
  - Preprod: `kbxt-b2b-integrations-pre-prod` (`527737084689`)
  - Prod: `kbxt-b2b-integrations-prod` (`410618142059`)
- Authorization/security hardening is intentionally deferred for this phase.
- Runtime execution must resolve snapshots and schemas from local resources inside the target account.
- Existing architecture coverage is in `deployments.md`, `infrastructure.md`, and `backend-api.md`; this spec extends those subsystems (no brand-new architecture document needed).

---

## Current Context

- FS-081 defines Sandbox control plane + Dev/Preprod/Prod runtime model and removes runtime QA semantics.
- `forge/architecture/infrastructure.md` already establishes SAM as canonical IaC and root `template.yaml` pattern.
- `forge/architecture/deployments.md` documents deployment history/current models for main app APIs, but not the dedicated per-environment runtime bootstrap stack contract requested here.
- `forge/architecture/backend-api.md` defines route/error conventions that runtime deployment APIs should follow.
- In-progress specs relevant to this area:
  - `forge/active/FS-081/` (deployment model architecture)
  - `forge/active/FS-019/` is unrelated.

---

## Scope

### In Scope

- Runtime bootstrap stack resources per target environment using SAM/CloudFormation `template.yaml`.
- Resource naming and parameterization strategy for repeatable multi-account deployment.
- DynamoDB design for active snapshot pointer and deployment history.
- S3 bucket/prefix strategy for immutable mapping snapshots and runtime schema payloads.
- API Gateway routes for deploy, rollback, execute, health/status.
- Lambda split of responsibilities (deploy/rollback vs runtime execute).
- Required Lambda environment variables and stack outputs.
- MVP logging/observability baseline.
- Deployment/update workflow for the runtime stack itself.
- Acceptance-oriented implementation tasks split across infra/backend domains.

### Out of Scope

- AuthN/AuthZ, WAF, API keys, IAM condition hardening, VPC lockdown specifics.
- Cross-account role-assumption-based deployment orchestration.
- Full CI/CD pipeline design.
- Runtime business workflow redesign outside deploy/rollback/execute runtime stack surface.
- Advanced observability (dashboards/alarms/tracing strategy) beyond MVP baseline.

---

## Non-Goals

- Implementing final security posture for runtime APIs.
- Building a full control-plane orchestration service in this spec.
- Replacing existing core deployment subsystem behavior outside runtime bootstrap boundary.
- Introducing multi-region HA/DR in this phase.

---

## Relevant Areas

- `template.yaml` (root)
- `samconfig.toml` ?
- `src/lambda/deployment/*`
- `src/lambda/runtime/*` ?
- `src/lib/persistence/deployments.ts`
- `src/lib/persistence/types.ts`
- `forge/architecture/deployments.md`
- `forge/architecture/infrastructure.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/phase-1-readiness.md`

---

## Dependencies / Blockers

- Depends on FS-081 environment model decisions (`SANDBOX` control plane, runtime `DEV|PREPROD|PROD`).
- Depends on network reachability pattern from sandbox to per-environment internal API endpoints.
- No hard blocker from active FS-019.

---

## Constraints

- Must work without cross-account role assumption.
- Stack footprint must remain small but production-minded.
- Runtime execution path cannot depend on sandbox state reads at runtime.
- Snapshot artifacts must be immutable once stored locally.
- Rollback must be pointer-based and history append-only.
- Template must be parameterized for reuse across all three runtime accounts.

---

## Proposed Behavior

### User Flow

1. Platform operator deploys the same runtime `template.yaml` into Dev, Preprod, and Prod accounts using environment-specific parameters.
2. Sandbox/control plane calls runtime `POST /internal/deploy` in target account with artifact payload/metadata.
3. Runtime deploy handler stores immutable snapshot/schema payloads locally, appends deployment history, updates active snapshot pointer.
4. Runtime execution calls use generic executor (`POST /internal/execute` or internal invoke path) that resolves the active snapshot pointer and executes mapping locally.
5. Rollback requests (`POST /internal/rollback`) repoint active pointer to a prior deployed snapshot and append rollback event.
6. Operators use health/status endpoints for environment-level readiness checks.

### System Behavior

#### A) Exact AWS resources per target environment

`template.yaml` provisions, at minimum:

1. **API Layer**
   - `AWS::Serverless::HttpApi` for thin internal runtime API (MVP decision).

2. **Compute Layer**
   - `DeployHandlerFunction` (handles deploy and rollback write flows).
   - `RuntimeExecuteFunction` (generic mapping runtime executor).
   - `StatusFunction` (health/status read-only checks; may be combined with deploy handler for MVP, but separate logical handler preferred).

3. **Persistence Layer**
   - `ActiveSnapshotsTable` (`AWS::DynamoDB::Table`): mutable pointer per mapping.
   - `DeploymentHistoryTable` (`AWS::DynamoDB::Table`): append-only per-mapping deployment/rollback events.

4. **Object Storage Layer**
   - `RuntimeArtifactsBucket` (`AWS::S3::Bucket`) for immutable snapshots and optional schema payload objects.

5. **IAM + Logging**
   - Least-privilege execution roles for Lambdas.
   - Explicit CloudWatch LogGroups with retention parameter.

Recommended data-protection defaults in template:
- DynamoDB: `DeletionPolicy: Retain`, `UpdateReplacePolicy: Retain`.
- S3: versioning enabled, server-side encryption enabled, public access block enabled, retain on stack delete for non-ephemeral envs.

#### B) Naming and parameterization strategy

Parameters:
- `EnvironmentName` (`dev|preprod|prod`)
- `ServiceName` (default `keyra-runtime`)
- `LogRetentionDays` (default `30`, including prod for MVP unless org policy overrides)
- `ArtifactsBucketName` (optional override; default derived)
- `ApiStageName` (default `internal`)
- `SnapshotsPrefix` (default `runtime/snapshots/`)
- `SchemasPrefix` (default `runtime/schemas/`)

Naming pattern:
- Tables: `${EnvironmentName}-${ServiceName}-active-snapshots`, `${EnvironmentName}-${ServiceName}-deployment-history`
- Bucket: `${EnvironmentName}-${ServiceName}-${AWS::AccountId}` (or override)
- Lambdas: `${EnvironmentName}-${ServiceName}-deploy`, `...-execute`, `...-status`
- API: `${EnvironmentName}-${ServiceName}-api`

#### C) `template.yaml` shape and scope

Top-level structure:
- `Parameters` (env and naming controls)
- `Globals` (Lambda runtime, timeout, memory, env var defaults)
- `Resources`
  - API
  - Lambdas + IAM policies
  - DynamoDB tables
  - S3 bucket
  - Log groups
- `Outputs` (API URL, resource names/ARNs)

Template should avoid auth resources in this phase and focus only on runtime bootstrap primitives.

#### D) Required environment variables and stack outputs

Lambda environment variables (minimum):
- `ACTIVE_SNAPSHOTS_TABLE`
- `DEPLOYMENT_HISTORY_TABLE`
- `RUNTIME_ARTIFACTS_BUCKET`
- `SNAPSHOTS_PREFIX`
- `SCHEMAS_PREFIX`
- `ENVIRONMENT_NAME`
- `LOG_LEVEL`

Stack outputs (minimum):
- `RuntimeApiUrl`
- `RuntimeApiId`
- `ActiveSnapshotsTableName`
- `DeploymentHistoryTableName`
- `RuntimeArtifactsBucketName`
- `DeployHandlerFunctionArn`
- `RuntimeExecuteFunctionArn`
- `StatusFunctionArn`

#### E) DynamoDB table designs

1. **ActiveSnapshotsTable**
   - PK: `mappingId` (String)
   - Attributes:
     - `activeSnapshotId` (String)
     - `snapshotHash` (String)
     - `activatedAt` (ISO timestamp)
     - `activatedBy` (String; e.g., `control-plane`)
     - `sourceType` (`revision|version`)
     - `sourceNumber` (Number)
     - `schemaBundleRef` (String, optional)
   - Access pattern: O(1) lookup by mappingId during execute/status.

2. **DeploymentHistoryTable**
   - PK: `mappingId` (String)
   - SK: `eventAt` (String, ISO8601 sortable)
   - Attributes:
     - `eventType` (`deploy|rollback`)
     - `snapshotId` (String)
     - `snapshotHash` (String)
     - `requestedBy` (String)
     - `sourceType`, `sourceNumber`
     - `rollbackOf` (String, optional)
     - `requestId` (String)
   - Access patterns:
     - list history by mapping (descending by SK)
     - resolve rollback candidate by mapping + event time/snapshot metadata in app logic
   - Index strategy: no GSI in MVP; add only if a concrete query requirement emerges.

#### F) S3 bucket/prefix strategy

Bucket contains immutable objects:
- Snapshots: `${SnapshotsPrefix}{mappingId}/{snapshotId}.json`
- Schemas (required local payload set): `${SchemasPrefix}{mappingId}/{snapshotId}/{schemaRole}-{schemaId}.json`

Rules:
- Snapshot objects are immutable: never overwritten.
- Deploy of same `snapshotId` should be idempotent (same hash accepted, mismatch rejected).
- Deploy operation always copies required schema payloads into runtime-local S3 for the deployed artifact set.
- Schema payloads do not need to be inlined into snapshot JSON, but runtime must resolve them locally.
- Runtime execution must not depend on sandbox or GitHub for schema retrieval.

#### G) API routes

Minimum internal routes:
- `POST /internal/deploy`
- `POST /internal/rollback`
- `POST /internal/execute`
- `GET /internal/health`
- `GET /internal/status/{mappingId}`

Route intent:
- `deploy`: ingest + validate + store immutable objects + update pointer + append history.
- `rollback`: verify prior snapshot exists locally + repoint pointer + append rollback history.
- `execute`: runtime execution using local active pointer/snapshot.
- `health`: liveness/readiness surface.
- `status`: returns active snapshot metadata + recent history summary for mapping.

MVP transport decision:
- `POST /internal/deploy` uses direct request body payload relay only.
- Signed URL pull transport is out of scope for this phase.

#### H) Lambda responsibilities and separation

- **DeployHandlerFunction**
  - Owns deploy + rollback write-side orchestration.
  - Validates snapshot integrity (`snapshotId` + hash).
  - Writes S3 objects and DynamoDB pointer/history.
  - Must not execute mappings.

- **RuntimeExecuteFunction**
  - Owns execution path only.
  - Resolves active pointer from `ActiveSnapshotsTable` and loads snapshot/schema from local bucket.
  - Executes mapping via engine and returns output/diagnostics.
  - Must not mutate deployment state.

- **StatusFunction**
  - Read-only health/status APIs.
  - Returns dependency checks (Dynamo/S3 access), active pointer status, and latest event metadata.

#### I) MVP logging/observability expectations

- Structured JSON logs for all handlers including: `requestId`, `mappingId`, `snapshotId`, `eventType`, `outcome`, `durationMs`.
- CloudWatch LogGroups with configurable retention.
- Basic embedded metrics/counters (or structured log counters) for:
  - deploy success/failure
  - rollback success/failure
  - execute success/failure
  - pointer-missing execute attempts
- Correlation: response should include requestId in success header and error envelope.

#### J) Deployment and update workflow for runtime stack

Per target account:
1. `sam validate`
2. `sam build`
3. `sam deploy --stack-name <env>-keyra-runtime --parameter-overrides EnvironmentName=<env> ...`
4. Verify stack outputs and smoke-check health endpoint.

Update guidance:
- Use CloudFormation changesets for non-trivial updates.
- Preserve data resources (`Retain`) to avoid accidental state loss.
- Roll forward preferred; rollback stack updates only with explicit data impact review.

### Failure / Edge Behavior

- Hash mismatch on deploy request returns deterministic validation error; no pointer update.
- Duplicate deploy for same `snapshotId` with same hash is idempotent success.
- Rollback request for unknown local snapshot returns deterministic not-found error.
- Execute when no active snapshot exists returns deterministic not-deployed error.
- Partial write failure (e.g., S3 write succeeds, Dynamo update fails) must fail safely and surface retryable/internal classification.

---

## Acceptance Examples

### AE-01 — Runtime stack deploys consistently per target environment

**Given**
- `template.yaml` and env-specific parameter values

**When**
- Stack is deployed into Dev, Preprod, and Prod target accounts

**Then**
- Each account has API, Lambdas, DynamoDB tables, and S3 bucket/prefix contract created with consistent naming and outputs

### AE-02 — Deploy API stores immutable snapshot and updates active pointer

**Given**
- Runtime stack is deployed and receives a valid deploy request

**When**
- `POST /internal/deploy` is called with snapshot metadata and payload

**Then**
- Snapshot is written immutably to S3
- Active pointer for mapping is updated in `ActiveSnapshotsTable`
- Append-only event is written to `DeploymentHistoryTable`

### AE-03 — Rollback API repoints pointer without mutating artifacts

**Given**
- Mapping has previously deployed snapshots

**When**
- `POST /internal/rollback` targets an existing snapshot

**Then**
- Active pointer changes to target snapshot
- New rollback event is appended in history
- Existing S3 snapshot objects are unchanged

### AE-04 — Execute API uses only local runtime resources

**Given**
- Active snapshot exists for mapping in local runtime account

**When**
- `POST /internal/execute` is invoked

**Then**
- Runtime resolves pointer and snapshot from local DynamoDB/S3 only
- Mapping executes via generic runtime Lambda
- No sandbox-state runtime read dependency occurs

### AE-05 — Status/health surfaces environment readiness

**Given**
- Runtime stack is deployed

**When**
- `GET /internal/health` and `GET /internal/status/{mappingId}` are called

**Then**
- Health route returns liveness/readiness indicators
- Status route returns active snapshot pointer and recent deployment metadata (or not-deployed state)

### AE-06 — Logging baseline enables deploy/execute incident triage

**Given**
- Deploy, rollback, and execute calls are performed

**When**
- Logs are inspected in CloudWatch

**Then**
- Each request is traceable by requestId with mapping/snapshot identifiers and outcome fields

### AE-07 — Runtime stack update preserves deployment state resources

**Given**
- Runtime stack already contains deployment history and active pointers

**When**
- Stack template is updated with non-destructive changes

**Then**
- DynamoDB/S3 state remains intact and outputs remain usable by control-plane callers

---

## Open Questions

- none

---

## Verification Strategy

- **Automated infra validation (AE-01, AE-07):**
  - `sam validate`, `cfn-lint` (if enabled), template unit/assertion checks.
  - Post-deploy assertions via AWS CLI: stack outputs, resource existence, naming.
- **API + persistence integration tests (AE-02, AE-03, AE-04, AE-05):**
  - Integration tests for deploy/rollback/execute/status flows.
  - Deterministic error-path tests (hash mismatch, not-deployed, missing snapshot).
- **Observability checks (AE-06):**
  - Manual verification of structured logs and request correlation fields.
- **Quality gates:**
  - typecheck, lint, targeted backend tests, and runtime bootstrap smoke script per environment.

---

## Task Generation Notes

- This spec is cross-cutting with distinct **infrastructure** and **backend** tracks; tasks must stay domain-pure.
- Include explicit architecture update task because this spec materially updates deployment/infrastructure/backend architecture references.
- Sequence recommendation:
  1. Architecture alignment.
  2. IaC template/resource contract.
  3. Backend persistence + handlers.
  4. Verification automation/runbook.
- Acceptance checks in tasks must include environment-verifiable commands (stack outputs + endpoint smoke checks).

---

## Change Log

- Rev 1 — 2026-06-03
  - Initial draft for runtime environment bootstrap via reusable `template.yaml` across Dev/Preprod/Prod accounts.
  - Defined AWS resources, naming/parameterization, table/storage models, API routes, Lambda responsibilities, observability baseline, and update workflow.
- Rev 2 — 2026-06-03
  - Resolved Q1: selected `AWS::Serverless::HttpApi` for MVP runtime API.
  - Resolved Q2: selected direct request body payload relay only for deploy transport in MVP.
  - Resolved Q3: deferred `DeploymentHistoryTable` GSI; PK/SK model is sufficient for current concrete queries.
  - Resolved Q4: deploy always copies required schema payloads into runtime-local S3 per deployed artifact set; runtime execution does not depend on sandbox/GitHub.
  - Resolved Q5: set MVP log retention default to 30 days, including prod unless org policy overrides.
