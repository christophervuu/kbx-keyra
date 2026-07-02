# Deployment Architecture

This document defines the deployment subsystem architecture for KeyRa under the FS-081 environment model: **SANDBOX control plane** with **DEV / PREPROD / PROD runtime planes** in separate AWS accounts.

This document supersedes earlier DEV/QA/PROD-only assumptions and codifies artifact relay, promotion, rollback, and runtime-local execution contracts.

---

## 1) Purpose and Scope

**Purpose:**
- Define control-plane vs runtime-plane responsibilities for deployment
- Define DynamoDB/S3 storage model for immutable artifacts and environment-local active pointers
- Document deploy/promote/rollback semantics for SANDBOX → DEV → PREPROD → PROD
- Codify same-artifact promotion invariants and pointer-only rollback behavior
- Define staleness semantics and API route responsibilities
- Define MVP transfer and network assumptions (direct payload push, internal allowlisted HTTPS)

**Scope:**
- Deployments and DeploymentCurrent persistence contracts
- Deployment artifact payload contract
- Control-plane orchestration behavior
- Runtime ingestion/activation behavior
- Staleness behavior and history/current APIs
- Server-preview implications for runtime-local execution

**Out of scope:**
- AuthN/AuthZ hardening for internal deploy/preview endpoints
- Approval workflows for PROD promotion
- CI/CD pipeline and provisioning automation design
- Multi-tenant deployment isolation

---

## 2) Environment Model and Plane Boundaries

## 2.1 Account topology

| Plane | Environment | Account Name | Account ID |
|---|---|---|---|
| Control plane | SANDBOX | `kbxt-platform-integrations-qa` | `503561435751` |
| Runtime plane | DEV | `kbxt-b2b-integrations-dev` | `897699593484` |
| Runtime plane | PREPROD | `kbxt-b2b-integrations-pre-prod` | `527737084689` |
| Runtime plane | PROD | `kbxt-b2b-integrations-prod` | `410618142059` |

## 2.2 Responsibility split

**SANDBOX control plane owns:**
- Authoring/save/version workflows
- Artifact creation/registry metadata (`artifactId`, hash, provenance)
- Deploy and promotion orchestration to runtime environments
- Cross-environment rollout status and audit coordination

**Runtime planes (DEV/PREPROD/PROD) own:**
- Internal deploy ingestion endpoint
- Local immutable artifact persistence
- Local active pointer store (`mappingId -> artifactId`)
- Runtime execution (generic mapping Lambda) and server preview execution
- Environment-local deploy/promote/rollback history

**Hard boundary:** runtime execution must never read sandbox deployment state at request time.

---

## 3) Deployment Artifact Model

Each immutable artifact includes:
- `artifactId` (globally unique; stable across promotions)
- `artifactHash` (content hash)
- `mappingId`
- `sourceDescriptor`:
  - `sourceType` (`revision` | `version`)
  - `sourceNumber`
  - `sourceConfigHash`
- `engineVersion`
- `mappingConfig` (full executable snapshot)
- `schemaRefs` with immutable provenance metadata (including commit identity where available)
- optional `enrichmentRefs` metadata for FS-093 compatibility (`[{ alias, schemaId, required }]`)
- `createdAt` and control-plane provenance metadata

Artifact invariants:
- Artifacts are immutable and never overwritten.
- Promotion reuses the same artifact identity (`artifactId` + `artifactHash`).
- Rollback repoints active pointer to existing artifact identity.

---

## 4) DynamoDB Table Definitions

### Deployments (history)

| Attribute | Key | Type | Description |
|-----------|-----|------|-------------|
| `mappingId` | PK | String (UUID) | Parent mapping |
| `environmentDeployedAt` | SK | String | `{ENV}#{ISO8601}` for time-ordered range scans |
| `environment` | — | String | `DEV` / `PREPROD` / `PROD` |
| `sourceType` | — | String | `revision` / `version` |
| `sourceNumber` | — | Number | Revision or version number |
| `artifactId` | — | String | Deployed artifact identity |
| `artifactHash` | — | String | Content hash |
| `configS3Key` | — | String | Local runtime artifact object key |
| `deployedAt` | — | String | ISO 8601 |
| `deployedBy` | — | String | User/system identifier |
| `promotedFrom` | — | String | Prior runtime environment on promotion |
| `rollbackOf` | — | String | Historical `environmentDeployedAt` reference |
| `cdmSchemaTraceability` | — | Array (optional) | Referenced CDM schema provenance entries |

Table env variable: `DEPLOYMENTS_TABLE` (default: `keyra-deployments`).

### DeploymentCurrent (active pointer)

| Attribute | Key | Type | Description |
|-----------|-----|------|-------------|
| `mappingIdEnvironment` | PK | String | `{mappingId}#{ENV}` |
| `mappingId` | — | String | Parent mapping |
| `environment` | — | String | `DEV` / `PREPROD` / `PROD` |
| `artifactId` | — | String | Active artifact identity |
| `artifactHash` | — | String | Active artifact hash |
| `sourceType` | — | String | `revision` / `version` |
| `sourceNumber` | — | Number | Active source number |
| `deployedAt` | — | String | ISO 8601 |
| `configS3Key` | — | String | Local active artifact object key |

Table env variable: `DEPLOYMENT_CURRENT_TABLE` (default: `keyra-deployment-current`).

---

## 5) S3 Artifact Layout

Bucket: configured via `STORAGE_BUCKET` in each runtime account.

| Key Pattern | Content | Mutability |
|-------------|---------|------------|
| `deployments/{mappingId}/{ENV}/{artifactId}.json` | Runtime artifact payload `{ config, metadata }` | Immutable |

Notes:
- Artifact object key identity should be stable for the same `artifactId` in an environment.
- Rollback reuses existing object key; no content rewrite.
- FS-079 traceability remains dual-location (`DeploymentItem` + artifact metadata).

---

## 6) Deployability and Promotion Rules

| Source Type | DEV | PREPROD | PROD |
|-------------|-----|---------|------|
| `revision`  | ✅ Allowed | ❌ `REVISION_NOT_DEPLOYABLE_TO_ENV` | ❌ `REVISION_NOT_DEPLOYABLE_TO_ENV` |
| `version`   | ✅ Allowed | ✅ Allowed | ✅ Allowed |

Promotion rules:
- Promotion requires source current deployment to be `sourceType=version`.
- Sequential path: DEV → PREPROD → PROD.
- Promotion must preserve artifact identity (no payload regeneration).

Rollback rules:
- Rollback is pointer-only and append-only in history.
- If target artifact is not locally available, runtime returns `ARTIFACT_NOT_PRESENT`.
- Runtime does not auto-import rollback artifacts in MVP.

---

## 7) Transfer, Payload, and Retry Contracts (MVP)

### 7.1 Canonical transfer mechanism

For FS-081 MVP, SANDBOX control plane performs **direct payload push**:
- SANDBOX POSTs full artifact payload in runtime deploy API request body.
- Signed pull URL flow is deferred to a later enhancement.

### 7.2 Payload-size limit

FS-083 Rev 2 establishes an explicit MVP hard limit:
- maximum deploy/promote artifact payload: **5 MB raw JSON request body**
- control-plane must fail fast before runtime call when payload exceeds limit

Error contract:
- control-plane preflight rejection: `PAYLOAD_TOO_LARGE` (HTTP 413)
- runtime ingestion rejection (defense-in-depth): `DEPLOY_ARTIFACT_TOO_LARGE` (HTTP 413)
- both errors must include actionable guidance to reduce artifact size

### 7.3 Idempotent retries

Retries are client-driven and keyed by `artifactId`/`snapshotId`:
- Repeated delivery of identical artifact to same environment must be safe.
- Runtime responses for duplicate-safe retries must be deterministic.
- Promotion uses the same transfer path as deploy: full artifact payload is pushed every time (no `hasArtifact` preflight optimization in MVP).

### 7.4 Timeout reconciliation via status polling

FS-083 Rev 2 canonicalizes reconciliation for ambiguous timeout outcomes:
- if control-plane deploy/promote/rollback request times out, control plane must poll runtime status endpoint
- callbacks/event bridge are out of scope for MVP

Canonical reconciliation states:
- `not_found`
- `received`
- `stored`
- `activated`
- `failed`

Interpretation baseline:
- `stored`/`activated` -> reconcile orchestration as success
- `failed`/`not_found` -> reconcile orchestration as failure with deterministic error details

### 7.5 Network assumption (MVP)

- Runtime deploy/preview endpoints are HTTPS and reachable from SANDBOX.
- Access model for this phase: internal public endpoint allowlisting.
- Private connectivity patterns (VPC-to-VPC/private link) are out of scope for MVP.

---

## 8) Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `REVISION_NOT_DEPLOYABLE_TO_ENV` | 400 | Revision deploy attempted to PREPROD or PROD |
| `PROMOTION_REQUIRES_VERSION` | 400 | Promote attempted from revision-backed source |
| `SOURCE_NOT_FOUND` | 404 | Referenced revision/version not found |
| `SNAPSHOT_INTEGRITY_ERROR` | 500 | Artifact/snapshot integrity mismatch |
| `DEPLOY_BLOCKED_CDM_SCHEMA_STATE` | 409 | CDM deploy guardrail block |
| `PAYLOAD_TOO_LARGE` | 413 | Control-plane preflight payload-size rejection (FS-083, 5 MB limit) |
| `DEPLOY_ARTIFACT_TOO_LARGE` | 413 | Runtime ingestion payload-size rejection |
| `ARTIFACT_NOT_PRESENT` | 409 | Requested rollback artifact not present locally |

---

## 9) API Route Responsibilities

All control-plane deployment routes remain under `/mappings/:mappingId/`.

| Method | Route | Plane | Description |
|---|---|---|---|
| `POST` | `/mappings/:mappingId/deploy` | Control plane | Orchestrate deploy to selected runtime environment |
| `POST` | `/mappings/:mappingId/promote` | Control plane | Orchestrate same-artifact promotion to next runtime environment |
| `POST` | `/mappings/:mappingId/rollback` | Control plane | Orchestrate rollback request in selected runtime environment |
| `GET` | `/mappings/:mappingId/deployments` | Control plane | Return deployment history view |
| `GET` | `/mappings/:mappingId/deployments/current` | Control plane | Return current pointers for DEV/PREPROD/PROD |
| `GET` | `/mappings/:mappingId/deploy-context` | Control plane | Return aggregate deployment bootstrap payload (mapping/project metadata + per-environment status) for SANDBOX-first deployment UI |

Runtime-plane internal endpoints (not public product API):
- Deploy ingestion endpoint (artifact push + validation + activation)
- Runtime rollback endpoint (pointer-only rollback to local artifact)
- Runtime preview endpoint (execute active local artifact)
- Runtime status endpoint for timeout reconciliation polling

### Request/response environment model

- Runtime target enums: `DEV | PREPROD | PROD`
- Control-plane-only enum/context: `SANDBOX`

Migration compatibility:
- Legacy stored raw environment value `QA` may remain in historical records for audit.
- Domain/presentation layers normalize `QA -> PREPROD`.

---

## 10) Staleness Computation

Staleness remains a pure function in `src/lib/deployment/staleness.ts`.

Definitions:
- `current`: deployed source matches latest artifact of deployed source type
- `stale`: newer revision/version exists beyond deployed source number
- `not-deployed`: no current deployment for environment

Environment status shape is now `{ DEV, PREPROD, PROD }`.

---

## 11) Promotion and Rollback Semantics

### Promotion

1. Control plane resolves source runtime current deployment.
2. Validates promotable source (`sourceType=version`).
3. Relays same artifact payload (`artifactId`/`artifactHash`) to target runtime deploy ingestion endpoint.
4. Target runtime verifies integrity, persists artifact locally (if absent), updates local active pointer, appends history.

### Rollback

1. Control plane requests rollback in target runtime by deployment history identity.
2. Runtime verifies referenced artifact exists locally.
3. Runtime appends rollback event (`rollbackOf`) and repoints active pointer.
4. If missing locally: return `ARTIFACT_NOT_PRESENT` with remediation (deploy/promote artifact explicitly, then retry rollback).

---

## 12) Server Preview Implications

- Preview is routed by control plane to selected runtime environment.
- Runtime preview executes using local active pointer + local artifact only.
- Preview response includes environment + artifact identity metadata.
- Runtime preview with no active deployment returns deterministic `not-deployed` error.

---

## 13) Retention Policy Baseline

- Retention policy is configurable per environment.
- MVP default: retain all artifacts locally.
- Long-term infinite retention is not required by architecture.
- Rollback guarantees apply to artifacts retained within configured rollback window.

---

## 14) Control-Plane Orchestration State Model (FS-083)

Control plane maintains orchestration records separate from runtime-local deployment history.

Canonical orchestration status values:
- `queued`
- `in_progress`
- `retrying`
- `succeeded`
- `failed`
- `timed_out`

Minimum orchestration record fields:
- `orchestrationId`
- `mappingId`
- `operationType` (`deploy|promote|rollback|preview`)
- `targetEnvironment`
- optional `sourceEnvironment`
- optional `artifactId`
- `status`
- `attemptCount`
- optional `lastErrorCode`
- optional `lastErrorMessage`
- `requestedBy`
- `requestedAt`
- optional `completedAt`

This model is control-plane audit/state metadata and does not replace runtime-local active pointer or history tables.

---

## 15) Environment Configuration Ownership (FS-083)

Canonical configuration source for runtime endpoint routing is a **persisted control-plane admin settings record**.

Fallback behavior:
- environment variables may be used as bootstrap/local-dev fallback
- env-var fallback is not the long-term canonical source of truth

Environment routing config includes per-runtime-environment:
- `runtimeApiBaseUrl`
- route paths (`deploy`, `rollback`, `preview`, `status`)
- timeout settings
- retry policy settings

---

## 16) Module Architecture

```
src/lib/persistence/
  deployments.ts            Deployment CRUD and active-pointer operations
  config.ts                 deployment key builders
  types.ts                  Deployment item/current item/environment contracts
  s3/
    deployment-snapshot.ts  Runtime artifact persistence helper

src/lib/deployment/
  staleness.ts              Pure status computation helpers

src/lambda/deployment/
  deploy-mapping.ts         Control-plane deploy orchestration
  promote-deployment.ts     Control-plane promotion orchestration
  rollback-deployment.ts    Control-plane rollback orchestration
  list-deployments.ts       History query endpoint
  get-current-deployments.ts Current pointers endpoint
```

---

## 17) Cross-References

- `forge/architecture/backend-api.md`
- `forge/architecture/infrastructure.md`
- `forge/architecture/persistence-model.md`
- `forge/active/FS-081/spec.md`

---

## 18) Runtime Bootstrap Stack Contract (FS-082)

FS-082 defines a reusable per-runtime-account bootstrap stack implemented via root `template.yaml`.

### 18.1 Runtime bootstrap resources (per environment)

Minimum resources provisioned in each runtime account (`DEV`, `PREPROD`, `PROD`):

1. API: `AWS::Serverless::HttpApi` (internal runtime API)
2. Lambda handlers:
   - deploy/rollback write-path handler
   - runtime execute handler
   - status/health read-path handler
3. DynamoDB:
   - `ActiveSnapshotsTable` (current pointer per mapping)
   - `DeploymentHistoryTable` (append-only deploy/rollback events)
4. S3:
   - runtime artifacts bucket for immutable snapshot and schema payload objects
5. Logging/IAM:
   - explicit CloudWatch LogGroups with retention parameter
   - least-privilege lambda execution roles

### 18.2 Runtime bootstrap data model

`ActiveSnapshotsTable` (runtime lookup path):
- PK: `mappingId`
- canonical fields: `activeSnapshotId`, `snapshotHash`, `activatedAt`, `activatedBy`, `sourceType`, `sourceNumber`, optional schema bundle reference metadata
- access pattern: O(1) by `mappingId` for execute/status

`DeploymentHistoryTable` (runtime audit path):
- PK: `mappingId`
- SK: `eventAt` (ISO8601 sortable)
- canonical fields: `eventType` (`deploy|rollback`), `snapshotId`, `snapshotHash`, `requestedBy`, `sourceType`, `sourceNumber`, optional `rollbackOf`, `requestId`
- access pattern: mapping-scoped descending history query
- index policy: no GSI in MVP; add only when concrete query requirements appear

### 18.3 Runtime artifact/object layout

Runtime-local S3 prefixes:
- snapshots: `runtime/snapshots/{mappingId}/{snapshotId}.json`
- schemas: `runtime/schemas/{mappingId}/{snapshotId}/{schemaRole}-{schemaId}.json`

Invariants:
- snapshot objects are immutable and never overwritten
- deploy is idempotent for same `snapshotId` + hash; mismatch is rejected
- deploy always copies required schema payloads into runtime-local storage for that deployed artifact set
- runtime execution must not depend on SANDBOX or GitHub schema reads

### 18.4 Runtime internal API routes

Runtime internal route surface (not public product API):
- `POST /internal/deploy`
- `POST /internal/rollback`
- `POST /internal/execute`
- `GET /internal/health`
- `GET /internal/status/{mappingId}`

Responsibilities:
- deploy: validate integrity, write immutable artifacts, update active pointer, append history
- rollback: repoint pointer to existing local snapshot, append rollback event only
- execute: resolve local pointer/artifacts and run generic mapping runtime
- health/status: readiness and active-snapshot visibility

### 18.5 Runtime bootstrap operational defaults

- API type: `HttpApi` for MVP runtime stack
- deploy transport: direct request-body payload relay only in MVP
- log retention default: 30 days (including prod unless org policy overrides)
- data durability defaults: DynamoDB/S3 resources use retain-oriented update/delete policies in template

---

## 19) FS-093 enrichment snapshot compatibility addendum

FS-093 requires deployment snapshot compatibility for multi-input mappings without changing deployment workflow shape.

Snapshot/deploy metadata compatibility requirements:

- Deployment artifact metadata should carry enrichment reference context when present:
  - primary source schema ref
  - target schema ref
  - enrichment schema refs
  - enrichment alias
  - required flag

Runtime execution compatibility note:

- Runtime execution payload contract may include both primary `sourceData` and named enrichment payload map `externalSources`.
- Runtime still executes from local deployed artifacts only; no runtime external connector calls are introduced.

Contract intent:

- This metadata is additive and forward-compatible.
- Deployment page UX redesign is out of scope for FS-093; artifact metadata completeness prevents future blocker for enrichment-aware deployment inspection.

## 20) FS-096 project value-table snapshot compatibility addendum

FS-096 requires deployment/runtime compatibility for project value-table pinned references without changing deploy/promote/rollback workflow shape.

Snapshot/artifact compatibility requirements:

- Deployment artifacts include mapping config with embedded project value-table refs (`valueTableRef`) and pinned `resolvedEntries` per rule.
- Artifact identity/hash is computed over deterministic mapping payload (no non-deterministic timestamp fields in artifact body).

Immutability + promotion + rollback invariants:

- Deploy snapshot immutability: post-deploy table edits/revisions must not alter existing deployed snapshots.
- Promote reuses identical artifact identity/data (no repack/re-resolve of table rows during promote).
- Rollback restores the exact previously embedded table data via prior snapshot pointer.

Runtime execute invariant:

- Runtime execute continues resolving active local snapshot only.
- Runtime execute must not fetch project value-table storage (DynamoDB/S3/project APIs).
- Missing project `resolvedEntries` in snapshot payload is treated as deterministic snapshot integrity failure.

## 22) FS-102 Value Mapping snapshot/deploy compatibility addendum

FS-102 extends FS-096 snapshot invariants from project value tables to scoped Value Mapping (global + project link/overlay) without changing immutable artifact principles.

Snapshot compatibility requirements:

- Deployment artifacts embed resolved effective value-mapping bindings required for execution:
  - source mapping/value-map identity metadata
  - pinned global revision (when applicable)
  - project overlay revision (when applicable)
  - direction
  - resolved match mode
  - resolved fallback behavior
  - effective executable rows
- Snapshot payload is the runtime source of truth; no mutable library reads at runtime.

Determinism invariants:

- Post-deploy global map edits, overlay edits, or default changes must not alter already deployed behavior.
- Promote reuses the same artifact identity/data for value-mapping bindings.
- Rollback restores the exact prior value-mapping behavior from prior snapshot pointer.

Deployment gate compatibility requirements:

- New deployment is blocked when mapping dependency state is `needs-review` or `invalid`.
- Gate evaluation is deterministic from persisted dependency/readiness state; no implicit auto-versioning is triggered by deploy path.

Import/export and promotion compatibility note:

- FS-102 promotion, portable export/import, and duplication workflows are authoring-time data-shaping operations and do not alter deployment runtime invariants.
- Deploy/promote/rollback continue to execute against immutable snapshot-embedded effective value-map bindings only.

## 21) FS-100 runtime execute compatibility addendum

FS-100 finalizes runtime execute request/response compatibility behavior without implicit shape detection.

Request contract compatibility:

- Canonical request supports `mappingId`, `sourceData`, optional `enrichmentInputs`, optional `executionContext`, and explicit `responseMode` (`legacy | canonical`).
- Legacy caller compatibility is retained via `externalSources` alias mapping to canonical enrichment inputs.
- `responseMode` must be explicit when canonical shape is required; unsupported values are rejected with deterministic validation error semantics.

Response contract compatibility:

- `responseMode='canonical'` returns canonical runtime response shape with metadata/provenance fields.
- Default runtime response remains explicit legacy wrapper including `compatibility.mode='legacy'` + embedded canonical payload.
- No implicit runtime response-shape auto-detection is allowed.

UI/bootstrap implications:

- Deployment UI bootstrap contract is aggregate `GET /mappings/:mappingId/deploy-context`.
- Deployment history/current endpoints remain separate runtime/read models; deploy-context is authoritative page bootstrap surface for the canonical four-stage pipeline UX.
