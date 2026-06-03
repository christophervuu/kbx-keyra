# Deployment Architecture

This document defines the Phase 1 deployment subsystem architecture for KeyRa — DynamoDB table schemas, S3 snapshot layout, API routes, deployability rules, staleness computation, promotion/rollback semantics, and module structure.

This document was authored after T-01 and T-02 of FS-064 and reflects implemented decisions.

---

## 1) Purpose and Scope

**Purpose:**
- Define the DynamoDB table schemas and key structures for deployment history and current-deployment tracking
- Establish S3 snapshot layout for immutable deployment config copies
- Document the five deployment API routes and their validation rules
- Codify the deployability matrix (which source types can target which environments)
- Define staleness computation semantics for revision-backed and version-backed deployments
- Describe promotion and rollback semantics
- Document the `src/lib/persistence/deployments.ts` and `src/lib/deployment/staleness.ts` module architecture

**Scope:**
- Deployments and DeploymentCurrent DynamoDB tables
- S3 deployment snapshot storage
- Lambda handlers: deploy, promote, rollback, list, current
- Staleness module for computing `current` / `stale` / `not-deployed` status
- UI adapter methods consuming these APIs

**Out of scope:**
- Approval workflows for QA/PROD promotion
- CI/CD pipeline integration or webhook triggers
- Multi-tenant deployment isolation
- Automated deployment on version creation

---

## 2) DynamoDB Table Definitions

### Deployments (history)

| Attribute | Key | Type | Description |
|-----------|-----|------|-------------|
| `mappingId` | PK | String (UUID) | Parent mapping |
| `environmentDeployedAt` | SK | String | `{ENV}#{ISO8601}` — composite sort key enabling time-ordered range scans per environment |
| `environment` | — | String | `DEV` / `QA` / `PROD` |
| `sourceType` | — | String | `revision` / `version` |
| `sourceNumber` | — | Number | Revision number or version number of the deployed artifact |
| `configS3Key` | — | String | S3 key of the deployed config snapshot |
| `configHash` | — | String | SHA-256 of config content |
| `deployedAt` | — | String | ISO 8601 |
| `deployedBy` | — | String | User identifier (`"system"` for programmatic deploys in Phase 1) |
| `cdmSchemaTraceability` | — | Array (optional) | FS-079 traceability entries for referenced CDM schemas (`schemaId`, optional `schemaName`, `referenceRole`, `repo`, `path`, `commitSha`) |
| `promotedFrom` | — | String | Environment promoted from — absent if direct deploy |
| `rollbackOf` | — | String | SK (`environmentDeployedAt`) of the deployment this entry rolls back — absent if not a rollback |

Table name env variable: `DEPLOYMENTS_TABLE` (default: `keyra-deployments`).

No GSIs. History queries use PK=`mappingId` with optional SK `begins_with('{ENV}#')` to filter by environment.

---

### DeploymentCurrent (denormalized current pointer)

| Attribute | Key | Type | Description |
|-----------|-----|------|-------------|
| `mappingIdEnvironment` | PK | String | `{mappingId}#{ENV}` — composite key for O(1) current-deployment lookup |
| `mappingId` | — | String (UUID) | Parent mapping |
| `environment` | — | String | `DEV` / `QA` / `PROD` |
| `deployedAt` | — | String | ISO 8601 of the current deployment |
| `sourceType` | — | String | `revision` / `version` |
| `sourceNumber` | — | Number | Current deployed number |
| `configHash` | — | String | For staleness comparison |
| `configS3Key` | — | String | S3 key of the current deployed snapshot |

Table name env variable: `DEPLOYMENT_CURRENT_TABLE` (default: `keyra-deployment-current`).

This table is a mutable pointer updated on every deploy/promote/rollback. It enables O(1) current-deployment lookups without scanning history.

---

## 3) S3 Snapshot Layout

Bucket: configured via `STORAGE_BUCKET` environment variable.

| Key Pattern | Content | Mutability |
|-------------|---------|------------|
| `deployments/{mappingId}/{ENV}/{deployedAt}.json` | Deployment snapshot payload `{ config, metadata }`; FS-079 metadata may include `cdmSchemaTraceability[]` | Immutable — never overwritten or deleted |

Key builder: `deploymentSnapshotKey(mappingId, environment, deployedAt)` in `src/lib/persistence/config.ts`.

Snapshot copies are written from the revision's or version's existing S3 object at deploy time via `src/lib/persistence/s3/deployment-snapshot.ts`. Once written, they are never mutated — rollback replays a snapshot by referencing its key rather than modifying it.

FS-079 dual-location traceability rule:
- when a deploy/promote succeeds with referenced CDM schemas, traceability is written to:
  1. `DeploymentItem.cdmSchemaTraceability`
  2. snapshot body metadata (`metadata.cdmSchemaTraceability`)

---

## 4) Deployability Rules Matrix

| Source Type | DEV | QA | PROD |
|-------------|-----|----|------|
| `revision`  | ✅ Allowed | ❌ `REVISION_NOT_DEPLOYABLE_TO_ENV` | ❌ `REVISION_NOT_DEPLOYABLE_TO_ENV` |
| `version`   | ✅ Allowed | ✅ Allowed | ✅ Allowed |

Enforced at the API layer in `deploy-mapping.ts`. The persistence layer accepts any valid input and does not re-validate environment rules.

**Promotion rules:**
- Promotion is only available when the current deployment in `fromEnvironment` has `sourceType=version`.
- Attempting to promote a revision-backed deployment returns 400 `PROMOTION_REQUIRES_VERSION`.
- Promotion path is sequential: DEV→QA, QA→PROD. Skipping environments (e.g., DEV→PROD) is not validated in Phase 1 but is architecturally unsupported.

**Rollback rules:**
- Rollback is always allowed regardless of source type.
- Rollback replays an existing snapshot by creating a new `DeploymentItem` with `rollbackOf` pointing to the historical entry's `environmentDeployedAt` SK value.
- No snapshot is written; the new entry re-uses the original `configS3Key`.

---

## 5) Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `REVISION_NOT_DEPLOYABLE_TO_ENV` | 400 | Deploy of a revision was attempted to QA or PROD |
| `PROMOTION_REQUIRES_VERSION` | 400 | Promote was attempted on a revision-backed deployment |
| `SOURCE_NOT_FOUND` | 404 | Referenced revision or version does not exist |
| `SNAPSHOT_INTEGRITY_ERROR` | 500 | Version config snapshot is missing from S3 (should not occur under normal operation) |
| `DEPLOY_BLOCKED_CDM_SCHEMA_STATE` | 409 | Deploy/promote blocked because one or more referenced CDM schemas are not deployable (FS-079) |

### FS-079 CDM deploy-context guardrail

Deploy and promote handlers run a CDM pre-check before any deployment create writes.

Enforcement points:
- `src/lambda/deployment/deploy-mapping.ts`
- `src/lambda/deployment/promote-deployment.ts`

Shared guard:
- `src/lambda/deployment/cdm-deploy-guard.ts`

Guard output contract:
- `issues[]` with per-schema:
  - `schemaId`
  - optional `schemaName`
  - `referenceRole` (`source` | `target`)
  - `reason`
  - `remediationKey`

Stable reason taxonomy:
- `unsynced`
- `update-failed`
- `metadata-incomplete`
- `ingest-not-ready`
- `schema-missing`

Blocking semantics:
- all issues are returned in one response (no first-failure short-circuit)
- any issue blocks deploy/promote and no deployment persistence write occurs
- non-CDM referenced schemas are ignored by this guard

---

## 6) API Routes

All deployment routes are under the `/mappings/:mappingId/` prefix.

| Method | Route | Handler | Description |
|--------|-------|---------|-------------|
| `POST` | `/mappings/:mappingId/deploy` | `src/lambda/deployment/deploy-mapping.ts` | Create a deployment snapshot for a revision or version |
| `POST` | `/mappings/:mappingId/promote` | `src/lambda/deployment/promote-deployment.ts` | Promote a version-backed deployment from one env to the next |
| `POST` | `/mappings/:mappingId/rollback` | `src/lambda/deployment/rollback-deployment.ts` | Roll back to a historical snapshot |
| `GET` | `/mappings/:mappingId/deployments` | `src/lambda/deployment/list-deployments.ts` | List deployment history (optional `?environment=` filter) |
| `GET` | `/mappings/:mappingId/deployments/current` | `src/lambda/deployment/get-current-deployments.ts` | Get current deployment for all three environments |

### Request / Response Shapes

**POST /deploy** body:
```json
{ "environment": "DEV|QA|PROD", "sourceType": "revision|version", "sourceNumber": 5 }
```
Response: `201` with the created `DeploymentItem`.

**POST /promote** body:
```json
{ "fromEnvironment": "DEV", "toEnvironment": "QA" }
```
Response: `201` with the promoted `DeploymentItem`.

**POST /rollback** body:
```json
{ "environment": "PROD", "deploymentSK": "PROD#2026-01-01T10:00:00.000Z" }
```
Response: `201` with the rollback `DeploymentItem`.

**GET /deployments** query params: `?environment=DEV` (optional).
Response: `200` with `DeploymentItem[]` sorted descending by `deployedAt`.

**GET /deployments/current**
Response: `200` with `{ DEV: DeploymentCurrentItem | null, QA: ..., PROD: ... }`.

---

## 7) Staleness Computation

Staleness status is computed by `src/lib/deployment/staleness.ts`. This module is backend-only and has no dependencies on DynamoDB or S3.

### Definitions

- **`current`**: deployed source matches the latest artifact of its type.
- **`stale`**: a newer revision or version exists beyond what was deployed.
- **`not-deployed`**: no deployment record exists for that environment.

### Revision-stale (DEV only in practice)

```
stale when: mapping.revision > deployment.sourceNumber
```
A newer save has been committed since the deployed revision was created.

### Version-stale (any environment)

```
stale when: mapping.latestVersion > deployment.sourceNumber
```
A newer version milestone has been created since the deployed version was promoted or deployed.

### API function signatures

```ts
function computeStaleness(
  deployment: DeploymentStalenessInput | null,  // { sourceType, sourceNumber }
  mapping: MappingStalenessInput,               // { revision, latestVersion }
): DeploymentStatus   // 'current' | 'stale' | 'not-deployed'

function computeAllEnvironments(
  currentDeployments: CurrentDeploymentsInput,  // { DEV?, QA?, PROD? }
  mapping: MappingStalenessInput,
): EnvironmentDeploymentStatus   // { DEV, QA, PROD }
```

The `GET /deployments/current` handler returns raw `DeploymentCurrentItem` data. Staleness annotation is applied by the HTTP adapter (`HttpAdapter`) on the client side using the mapping's `revision` and `latestVersion` fields. The `LocalStorageAdapter` performs the same computation inline.

---

## 8) Promotion Semantics

Promotion creates a new deployment record in the target environment referencing the same version as the source environment's current deployment.

Steps:
1. Read current deployment from `DeploymentCurrent` for `fromEnvironment`.
2. Validate `sourceType === 'version'` — reject with `PROMOTION_REQUIRES_VERSION` otherwise.
3. Fetch the version config snapshot from S3 using `configS3Key` of the source deployment.
4. Call `deployments.create()` for `toEnvironment` with `promotedFrom` set.
5. Return the new deployment record.

The promoted deployment gets a fresh `configS3Key` at the new environment path (`deployments/{mappingId}/{TO_ENV}/{timestamp}.json`). Both the source and target deployment entries share the same `configHash`.

---

## 9) Rollback Semantics

Rollback creates a new deployment record in the target environment using the snapshot of a historical deployment — without writing a new S3 object.

Steps:
1. Parse `deploymentSK` from the request body (format: `{ENV}#{ISO8601}`).
2. Look up the referenced `DeploymentItem` by `mappingId` + `environmentDeployedAt`.
3. Create a new `DeploymentItem` with:
   - Same `sourceType`, `sourceNumber`, `configS3Key`, `configHash`
   - `rollbackOf` set to the referenced entry's `environmentDeployedAt`
   - Fresh `deployedAt` timestamp
4. Update `DeploymentCurrent` to point to the new entry.
5. Return the new deployment record.

The original historical entry is never modified. Rollback is append-only.

---

## 10) Module Architecture

### Persistence module

```
src/lib/persistence/
  deployments.ts            Deployment CRUD — create, getCurrent, getCurrentAll, listHistory
  config.ts                 deploymentSnapshotKey(), deploymentHistorySortKey(), deploymentCurrentKey()
  types.ts                  DeploymentItem, DeploymentCurrentItem, CreateDeploymentInput, DeploymentEnvironment
  s3/
    deployment-snapshot.ts  Write deployment snapshot payload (`{ config, metadata }`) to S3 at deployments/{mappingId}/{ENV}/{ts}.json
```

**Key functions in `deployments.ts`:**

| Function | Description |
|----------|-------------|
| `create(input)` | Writes DeploymentItem + DeploymentCurrentItem + S3 snapshot atomically; persists optional `cdmSchemaTraceability` to both item and snapshot metadata |
| `getCurrent(mappingId, env)` | Returns `DeploymentCurrentItem \| null` for a single environment |
| `getCurrentAll(mappingId)` | Returns `{ DEV, QA, PROD }` current items (parallel reads) |
| `listHistory(mappingId, env?, limit?)` | Paginated query on Deployments table, descending by SK |

### Staleness module

```
src/lib/deployment/
  index.ts        Barrel export
  staleness.ts    computeStaleness(), computeAllEnvironments()
```

The staleness module is pure (no I/O), enabling use in both Lambda handlers and client-side adapters.

### Lambda handlers

```
src/lambda/deployment/
  index.ts                    Barrel export
  deploy-mapping.ts           POST /mappings/:mappingId/deploy
  promote-deployment.ts       POST /mappings/:mappingId/promote
  rollback-deployment.ts      POST /mappings/:mappingId/rollback
  list-deployments.ts         GET  /mappings/:mappingId/deployments
  get-current-deployments.ts  GET  /mappings/:mappingId/deployments/current
```

All handlers follow the shared Lambda conventions established in `src/lambda/shared/` (response envelope, error helpers, path param extraction, body parsing).

### UI adapter methods

Defined in `ui/src/lib/api/types.ts` (`ApiAdapter` interface):

| Method | Description |
|--------|-------------|
| `deployMapping(mappingId, { environment, sourceType, sourceNumber })` | Calls `POST /deploy` |
| `promoteDeployment(mappingId, { fromEnvironment, toEnvironment })` | Calls `POST /promote` |
| `rollbackDeployment(mappingId, { environment, deploymentSK })` | Calls `POST /rollback` |
| `listDeployments(mappingId, { environment? })` | Calls `GET /deployments` |
| `getCurrentDeployments(mappingId)` | Calls `GET /deployments/current`; HTTP adapter computes staleness client-side |

---

## 11) Environment Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `DEPLOYMENTS_TABLE` | Deployments table name | `keyra-deployments` |
| `DEPLOYMENT_CURRENT_TABLE` | DeploymentCurrent table name | `keyra-deployment-current` |
| `STORAGE_BUCKET` | S3 bucket name (shared with schemas/mappings) | `keyra-storage` |

---

## 12) Access Patterns

| Pattern | Operation | Table | Notes |
|---------|-----------|-------|-------|
| Create deployment | PutItem × 2 + S3 Put | Deployments + DeploymentCurrent | Transactional-style: history then current |
| Get current deployment (single env) | GetItem | DeploymentCurrent | PK = `{mappingId}#{ENV}` |
| Get current deployments (all envs) | GetItem × 3 (parallel) | DeploymentCurrent | One read per environment |
| List deployment history (all envs) | Query (PK) | Deployments | SK range scan descending |
| List deployment history (one env) | Query (PK + `begins_with`) | Deployments | SK prefix `{ENV}#` |
| Promote deployment | GetItem + PutItem × 2 + S3 Put | DeploymentCurrent → Deployments + Current | Read source current, create target record |
| Rollback | GetItem (history) + PutItem × 2 | Deployments → Deployments + Current | No new S3 write — reuses existing snapshot key |

---

## 13) Constraints and Limits

- Deployment history is append-only. No history entries are deleted in Phase 1.
- Rollback never mutates existing records or S3 objects.
- `deployedBy` is hardcoded to `"system"` in Phase 1 (no authenticated user context available at handler level yet).
- Parallel `getCurrentAll` reads are fire-and-forget; if one fails the handler surfaces a 500. This is acceptable for Phase 1.
- No pagination token exposed from `listDeployments` in the HTTP API. Phase 1 scale assumption: < 100 deployments per mapping per environment.

---

## 14) Cross-References

- Revision/version model: `forge/architecture/persistence-model.md` §6
- Backend API handler conventions: `forge/architecture/backend-api.md`
- Infrastructure (SAM template): `forge/architecture/infrastructure.md`
- FS-064 spec: `forge/active/FS-064/spec.md`
- Phase 1 persistence module: `src/lib/persistence/`
- Staleness module: `src/lib/deployment/staleness.ts`
