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
- If target artifact is not locally available, runtime returns `artifact_not_available_for_rollback`.
- Runtime does not auto-import rollback artifacts in MVP.

---

## 7) Transfer, Payload, and Retry Contracts (MVP)

### 7.1 Canonical transfer mechanism

For FS-081 MVP, SANDBOX control plane performs **direct payload push**:
- SANDBOX POSTs full artifact payload in runtime deploy API request body.
- Signed pull URL flow is deferred to a later enhancement.

### 7.2 Payload-size limit

Runtime deploy ingestion API enforces configured maximum payload size:
- Oversize payloads are rejected with deterministic actionable diagnostics.
- Recommended stable code: `DEPLOY_ARTIFACT_TOO_LARGE` (HTTP 413).

### 7.3 Idempotent retries

Retries are client-driven and keyed by `artifactId`/`snapshotId`:
- Repeated delivery of identical artifact to same environment must be safe.
- Runtime responses for duplicate-safe retries must be deterministic.

### 7.4 Network assumption (MVP)

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
| `DEPLOY_ARTIFACT_TOO_LARGE` | 413 | Direct artifact payload exceeds configured size |
| `artifact_not_available_for_rollback` | 409 | Requested rollback artifact not present locally |

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

Runtime-plane internal endpoints (not public product API):
- Deploy ingestion endpoint (artifact push + validation + activation)
- Runtime preview endpoint (execute active local artifact)

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
4. If missing locally: return `artifact_not_available_for_rollback` with remediation (redeploy/promote artifact explicitly).

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

## 14) Module Architecture

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

## 15) Cross-References

- `forge/architecture/backend-api.md`
- `forge/architecture/infrastructure.md`
- `forge/architecture/persistence-model.md`
- `forge/active/FS-081/spec.md`
