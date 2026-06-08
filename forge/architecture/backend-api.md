# Backend API Architecture

This document defines the Phase 1 backend API architecture — Lambda handler conventions, API Gateway route surface, DynamoDB/S3 access patterns, error envelope contract, shared utilities, and test strategy.

Agents must load this document before implementing or modifying non-AI Lambda handlers in `src/lambda/{shared,project,mapping,schema}/`.

---

## 1) Purpose and Scope

Purpose:
- Define the stable backend API architecture for FS-057 Phase 1 CRUD/query behavior.
- Capture conventions and constraints needed for safe handler implementation.
- Provide a single reference for route-to-handler mapping, storage mappings, and error semantics.

Scope:
- Project CRUD endpoints
- Mapping CRUD + duplicate endpoints
- Mapping revision + version endpoints
- Schema create/get/list/delete + schema query endpoints
- CDM read-only browse/link/sync endpoints (`KBXT/KBX-Canonicals` CommonDataModels scope)
- Shared handler module conventions under `src/lambda/shared/`

Out of scope:
- Detailed AI runtime internals under `src/lib/ai/` (covered by `ai-runtime.md`)
- Published-schema GitHub write flows and full Auth architecture hardening details
- IaC resource authoring details (covered by `infrastructure.md`)

Deployment/preview architecture contracts are covered via addenda in this document.

---

## 2) Route Table (Phase 1)

Phase 1 exposes 24 routes in this architecture slice (including FS-076 CDM read-only integration). Logical Lambda names follow the naming conventions documented in `infrastructure.md` (`{Verb}{Resource}Function`).

| Method | Path | Handler File | Lambda Name (logical) | Description |
|---|---|---|---|---|
| POST | `/projects` | `src/lambda/project/create-project.ts` | `CreateProjectFunction` | Create project |
| GET | `/projects` | `src/lambda/project/list-projects.ts` | `ListProjectsFunction` | List projects |
| GET | `/projects/:id` | `src/lambda/project/get-project.ts` | `GetProjectFunction` | Get project detail (embeds mappings + schemas) |
| PUT | `/projects/:id` | `src/lambda/project/update-project.ts` | `UpdateProjectFunction` | Update project |
| DELETE | `/projects/:id` | `src/lambda/project/delete-project.ts` | `DeleteProjectFunction` | Delete project (conflict when mappings exist) |
| POST | `/mappings` | `src/lambda/mapping/create-mapping.ts` | `CreateMappingFunction` | Create mapping |
| GET | `/mappings/:id` | `src/lambda/mapping/get-mapping.ts` | `GetMappingFunction` | Get mapping config |
| PUT | `/mappings/:id` | `src/lambda/mapping/update-mapping.ts` | `UpdateMappingFunction` | Update mapping (optimistic concurrency) |
| DELETE | `/mappings/:id` | `src/lambda/mapping/delete-mapping.ts` | `DeleteMappingFunction` | Delete mapping |
| POST | `/mappings/:id/duplicate` | `src/lambda/mapping/duplicate-mapping.ts` | `DuplicateMappingFunction` | Duplicate mapping |
| GET | `/projects/:projectId/mappings` | `src/lambda/mapping/list-mappings.ts` | `ListMappingsFunction` | List mappings for project |
| GET | `/mappings/:mappingId/revisions` | `src/lambda/mapping/list-revisions.ts` | `ListMappingRevisionsFunction` | List mapping revisions (desc) |
| GET | `/mappings/:mappingId/revisions/:revision` | `src/lambda/mapping/get-revision.ts` | `GetMappingRevisionFunction` | Get specific mapping revision (includes config) |
| GET | `/mappings/:mappingId/versions` | `src/lambda/mapping/list-versions.ts` | `ListMappingVersionsFunction` | List mapping versions (desc) |
| GET | `/mappings/:mappingId/versions/:version` | `src/lambda/mapping/get-version.ts` | `GetMappingVersionFunction` | Get specific mapping version |
| POST | `/mappings/:mappingId/versions` | `src/lambda/mapping/create-version.ts` (`save-version.ts` shim) | `CreateMappingVersionFunction` | Create version milestone from latest revision (supports implicit save) |
| POST | `/schemas` | `src/lambda/schema/create-schema.ts` | `CreateSchemaFunction` | Create schema (inline or ingesting kickoff) |
| GET | `/schemas` | `src/lambda/schema/list-schemas.ts` | `ListSchemasFunction` | List schemas |
| GET | `/schemas/cdm` | `src/lambda/schema/list-cdm-schemas.ts` | `ListCdmSchemasFunction` | List one directory level of CDM entries under fixed CommonDataModels root |
| POST | `/schemas/cdm/link` | `src/lambda/schema/link-cdm-schema.ts` | `LinkCdmSchemaFunction` | Link CDM schema file to project with canonical source metadata; idempotent for duplicate same-project repo/branch/path |
| GET | `/schemas/:id` | `src/lambda/schema/get-schema.ts` | `GetSchemaFunction` | Get schema detail |
| DELETE | `/schemas/:id` | `src/lambda/schema/delete-schema.ts` | `DeleteSchemaFunction` | Delete schema (conflict when referenced) |
| POST | `/schemas/:id/query` | `src/lambda/schema/query-schema-nodes.ts` | `QuerySchemaNodesFunction` | Query schema nodes (OpenSearch-first, max 50; gated PK-scoped degraded fallback) |
| POST | `/schemas/:id/sync-cdm` | `src/lambda/schema/sync-cdm-schema.ts` | `SyncCdmSchemaFunction` | Explicit manual CDM re-sync (updates content/metadata only when upstream changed) |
| GET | `/schemas/:id/sync-cdm` | `src/lambda/schema/sync-cdm-schema.ts` | `SyncCdmSchemaFunction` | Lightweight CDM status-refresh read (`update-available` without content mutation) |

---

## 3) API Gateway and CORS Conventions

### Proxy Integration Style
- API Gateway invokes one Lambda per route.
- Handlers use API Gateway proxy event/response shapes from `src/lambda/shared/types.ts`.

### CORS Response Contract
All JSON responses use `src/lambda/shared/response.ts` helpers and include:

```http
Content-Type: application/json
Access-Control-Allow-Origin: *
```

OPTIONS preflight behavior should allow:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## 4) Lambda Handler Conventions

### Entry-point signature

```ts
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from '../shared/types.js';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // parse, validate, read/write, return response
}
```

### Import boundaries
- Use shared utilities from `../shared/`.
- Engine usage is allowed where needed (e.g., mapping validation/coverage recomputation).
- Do not import from `ui/`.
- Do not import from other handler files.
- Keep AI runtime concerns isolated to `src/lambda/ai/`.

### Single responsibility
Each handler file implements exactly one route surface and is independently deployable.

### Response helpers
- Success: `jsonResponse(statusCode, body, requestId?)`
- Error: `errorResponse(code, message, statusCode, retryable, requestId?)`

---

## 5) Standard Error Envelope

All non-success responses must follow:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Project with id 'abc-123' not found",
    "statusCode": 404,
    "retryable": false,
    "requestId": "req-a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

### Request Correlation ID

All handlers generate a `requestId` (UUID) at invocation start or resolve one in shared error helpers when missing. Correlation is surfaced in both error and success paths:

- Error envelope body: `error.requestId`
- Success response header: `x-request-id`

Purpose:
- correlate user-visible failures with backend logs and traces
- support diagnosis of transient failures across retries
- preserve request lineage from API Gateway/Lambda to UI `AppError`

### Standard codes

| Code | HTTP Status | Retryable | Usage |
|---|---:|---:|---|
| `VALIDATION_ERROR` | 400 | false | malformed JSON, missing required field, invalid param/body value |
| `RESOURCE_NOT_FOUND` | 404 | false | requested project/mapping/schema/version/content absent |
| `CONFLICT` | 409 | false | referential integrity block, optimistic concurrency mismatch |
| `INTERNAL_ERROR` | 500 | true | unexpected handler failure |
| `INVALID_MODEL_OUTPUT` | 500 | false | AI response failed runtime structured-output validation |
| `SERVICE_UNAVAILABLE` | 503 | true | transient DynamoDB/S3 service issue (e.g., throttling) |
| `TIMEOUT` | 504 | true | lambda/downstream timeout condition |

This envelope matches FS-057 spec behavior and is consumed by `HttpAdapter` error normalization.

### Error Resilience Flow (FS-059)

Phase 1 resilience spans backend handlers and UI async state, with the following end-to-end flow:

1. **Handler failure path**
   - Handler catches/constructs an app error and returns `errorResponse(...)`.
   - Envelope includes `code`, `message`, `statusCode`, `retryable`, `requestId`.

2. **Transport path (API Gateway → HTTP client)**
   - `ui/src/lib/api/http-client.ts` parses backend error envelope.
   - Envelope fields normalize to `HttpClientError` (`statusCode`, `code`, `retryable`, `requestId`).
   - Fallback classification is applied only when envelope fields are missing/malformed.

3. **Retry orchestration**
   - `retryWithBackoff` in `ui/src/lib/api/retry.ts` wraps HTTP calls.
   - Bounded retries: max attempts = 3, exponential delay from 500ms base + jitter, max delay 5000ms.
   - Current client auto-retry status set: `500`, `503`, `504`; network/timeout retries are constrained to `GET`.
   - Non-retryable failures (`400`, `404`, `409`, etc.) surface immediately.

4. **UI error normalization and state**
   - `toAppError()` maps thrown client errors into `AppError` (including optional `requestId`).
   - `useAsyncState` enters `{ status: 'error', error, retryable }` and exposes `retry()` for the last operation.

5. **User recovery surface**
   - `ErrorBanner` renders retry affordance when `retryable: true`.
   - Retry re-executes the prior async operation; on success, state returns to success and error UI clears.

6. **Optimistic mutation contract**
   - Mutations capture a pre-change snapshot.
   - Apply optimistic UI update immediately.
   - On success, optimistic state is confirmed.
   - On failure after retries, rollback restores exact snapshot; error surfaces to user.

This contract is the canonical resilience behavior for Phase 1 CRUD surfaces.

---

## 6) Shared Utility Structure (`src/lambda/shared/`)

| File | Exports (primary) | Responsibility |
|---|---|---|
| `types.ts` | `APIGatewayProxyEvent`, `APIGatewayProxyResult` | Shared transport types |
| `response.ts` | `JSON_HEADERS`, `jsonResponse`, `errorResponse` | JSON + CORS response builders |
| `request.ts` | `parseBody`, `parsePathParam`, `parseQueryParam` | Safe request parsing |
| `validation.ts` | `requireFields` | Required-field validation helper |
| `errors.ts` | `ERROR_CODES`, error constructors (`notFound`, `conflict`, etc.) | Standard app-error constructors |
| `dynamo.ts` | client + `getItem/putItem/query/scan/updateItem/deleteItem` wrappers | DynamoDB access + throttle mapping |
| `s3.ts` | client + `putObject/getObject/deleteObject` wrappers | S3 access + NoSuchKey/transient mapping |
| `index.ts` | barrel re-exports | Single import surface for handlers |

---

## 7) DynamoDB Tables and Access Patterns

### 7.1 Table schemas (as used by handlers)

#### `PROJECTS_TABLE`
- PK: `projectId` (String)
- Main fields: `name`, `description`, `slug`, canonical `linkedSchemaIds[]`, compatibility `schemaRefs[]`, `tags[]`, timestamps

#### `MAPPINGS_TABLE`
- PK: `mappingId` (String)
- GSI: `projectId-index` (PK=`projectId`)
- Main fields: `projectId`, `name`, `revision`, `latestVersion`, `configHash`, legacy `version` alias, `status`, `sourceSchemaId`, `targetSchemaId`, `ruleCount`, `coverage`, `configS3Key`, timestamps

#### `MAPPING_REVISIONS_TABLE`
- PK: `mappingId` (String), SK: `revision` (Number)
- Main fields: `savedAt`, `savedBy`, `ruleCount`, `configS3Key`, `configHash`

#### `SCHEMAS_TABLE`
- PK: `schemaId` (String)
- Main fields: `name`, `format`, `fieldCount`, canonical `origin` (`cdm|uploaded|inferred`), `status`, compatibility `scope?` (non-authoritative), `description`, `inferred`, canonical `syncStatus` (`synced|update-available|sync-failed`), `source`, timestamps

#### `SCHEMA_NODES_TABLE`
- PK: `schemaId` (String), SK: `path` (String)
- Main fields: `fieldName`, `type`, optional `description`, plus ingestion metadata fields

#### `MAPPING_VERSIONS_TABLE`
- PK: `mappingId` (String), SK: `version` (Number)
- Main fields: `revisionNumber`, `createdAt`, `createdBy`

### FS-087 schema-access and compatibility addendum

Canonical FS-087 model across schema/project handlers:

- Schema availability is shared across projects; project linkage is relevance metadata only.
- Canonical project linkage is `linkedSchemaIds: string[]`.
- Legacy `schemaRefs` is retained as compatibility/read-time bridge and must not be treated as the long-term authoritative access model.
- Canonical schema origins are `cdm | uploaded | inferred`; legacy aliases (`local`, `published`) are normalized to `uploaded` at read boundaries.
- Legacy `scope` may remain in records as compatibility metadata, but must not drive access filtering or ownership logic.

Audit-confirmed unaffected backend/AWS ownership surfaces (FS-087 T-02/T-09):

- DynamoDB schema-entity ownership remains `schemaId`-centric (no `projectId` ownership key requirement).
- S3 schema keying remains `schemas/{schemaId}/...` and scope-independent.
- OpenSearch schema query/index filter remains `schemaId`-term based; no scope/project ownership filter.
- Deployment snapshot/deploy guard behavior remains explicit schema-reference/provenance based (`sourceSchemaId`/`targetSchemaId` + optional `cdmSchemaTraceability`) and scope-independent.

### 7.2 Handler-to-table mapping

| Handler | DynamoDB patterns |
|---|---|
| `project/create-project` | put project item |
| `project/list-projects` | scan projects + scan mappings (counts) |
| `project/get-project` | get project + query mappings by `projectId-index` + get schema metadata by canonical `linkedSchemaIds` (with read-time fallback from legacy refs) |
| `project/update-project` | update project fields |
| `project/delete-project` | query mappings by `projectId-index`, conflict-or-delete |
| `mapping/create-mapping` | put mapping metadata |
| `mapping/get-mapping` | get mapping metadata |
| `mapping/update-mapping` | get mapping + optimistic concurrency check + update metadata |
| `mapping/delete-mapping` | delete mapping metadata |
| `mapping/duplicate-mapping` | get source + put duplicated metadata |
| `mapping/list-mappings` | query by `projectId-index` |
| `mapping/list-revisions` | query revisions by `mappingId` descending |
| `mapping/get-revision` | get revision item by `mappingId` + `revision` |
| `mapping/list-versions` | query by `mappingId` descending |
| `mapping/get-version` | get item by `mappingId` + `version` |
| `mapping/create-version` | query latest version + put milestone item (optional implicit save path writes revision + mapping metadata) |
| `mapping/save-version` | compatibility shim delegating to `create-version` |
| `schema/create-schema` | put schema metadata; inline mode puts schema nodes |
| `schema/list-schemas` | scan schemas (shared-library list; no scope-based access filtering) |
| `schema/list-cdm-schemas` | root-guarded optional path validation + one-level GitHub read-only listing under CommonDataModels |
| `schema/link-cdm-schema` | validate root-scoped CDM file path + project, fetch GitHub file/commit (read-only), persist/project CDM source metadata, and attach to project |
| `schema/get-schema` | get schema metadata |
| `schema/delete-schema` | get schema + guard references across canonical `linkedSchemaIds` + compatibility refs + mapping references + delete schema + delete schema nodes |
| `schema/query-schema-nodes` | get schema + OpenSearch query via `searchSchemaNodes`; on explicit degraded gate, fallback to PK-scoped schemaId query + in-memory substring filter |
| `schema/sync-cdm-schema` | read linked source metadata, perform GitHub read-only compare/fetch, persist sync status and optional content/commitSha updates |

---

## 8) S3 Content Storage Conventions

Bucket is configured by `CONTENT_BUCKET`.

| Content | Key pattern | Content-Type |
|---|---|---|
| Mapping config | `mappings/{mappingId}/config.json` | `application/json` |
| Mapping revision snapshot | `mappings/{mappingId}/revisions/r{revision}.json` | `application/json` |
| Schema content | `schemas/{schemaId}/content.json` (json-schema) | `application/json` |
| Schema content | `schemas/{schemaId}/content.xsd` (xsd) | `application/xml` |

Notes:
- Mapping metadata stores `configS3Key` to locate current config.
- Revision items store `configS3Key` for immutable revision snapshots.
- Version items reference revisions via `revisionNumber` (no separate version S3 blob).
- Schema detail reads metadata from DynamoDB and content from S3.

---

## 9) Environment Variable Conventions

### Required by handlers

| Variable | Purpose |
|---|---|
| `PROJECTS_TABLE` | Projects table name |
| `MAPPINGS_TABLE` | Mappings table name |
| `SCHEMAS_TABLE` | Schema metadata table name |
| `SCHEMA_NODES_TABLE` | Schema nodes table name |
| `MAPPING_REVISIONS_TABLE` | Mapping revisions table name |
| `MAPPING_VERSIONS_TABLE` | Mapping versions table name |
| `CONTENT_BUCKET` | S3 bucket for mapping/schema content |

### Runtime/environment defaults

| Variable | Purpose |
|---|---|
| `AWS_REGION` | Lambda runtime region |
| `DYNAMODB_ENDPOINT` / `AWS_ENDPOINT_URL_DYNAMODB` | local DynamoDB override for integration/local runs |
| `SCHEMA_QUERY_DEGRADED_FALLBACK` | optional explicit degraded-mode gate for schema query Dynamo fallback when OpenSearch path fails |

The naming above reflects the currently implemented lambda surface. Infrastructure/persistence docs may define broader environment contracts for future modules.

---

## 10) Testing Approach

### Unit tests
- Location: `tests/lambda/{shared,project,mapping,schema}/`
- Pattern: mock shared helpers or AWS SDK wrappers; assert status codes, envelope shape, and side effects.

### Integration tests (FS-057)
- Location: `tests/lambda/integration/fs-057-api.test.ts`
- Uses DynamoDB Local for real table interactions.
- Uses mocked S3 client for content storage behavior.
- Gated by `RUN_DYNAMODB_LOCAL_INTEGRATION=1`.

### Verification commands used in this area
- `npm run typecheck`
- scoped vitest suites for touched lambda domains
- `npm run test:integration` (when DynamoDB Local is available)
- `npm run test:phase2:deterministic-gate` (FS-075 deterministic acceptance baseline; includes AE-07 Phase 1 non-regression suites)

### FS-075 Phase 2 acceptance gate (cross-cutting)

FS-075 adds a CI-enforced acceptance path that combines backend AI safety checks with Phase 1 regression coverage:

- PR required gate runs:
  - `npm run test:phase2:deterministic-gate`
  - `npm run test:phase2:prompt-eval:pr` (warning-budget policy)
- Pre-release gate runs:
  - `npm run test:phase2:deterministic-gate`
  - `npm run test:phase2:prompt-eval:release` (strict hard-fail policy unless explicitly waived)

The deterministic gate matrix now includes explicit AE-07 checks for:
- persistence model non-regression (`tests/lib/persistence/*.test.ts`)
- schema ingestion/query non-regression (`tests/integration/schema-ingestion/inline-path.test.ts`, `tests/integration/schema-ingestion/step-functions-path.test.ts`, `tests/lambda/schema/query-schema-nodes.test.ts`)
- adapter parity non-regression (`ui/src/lib/api/http-adapter.test.ts`, `ui/src/lib/api/local-storage-adapter.test.ts`)

---

## 11) AI Handler API Conventions (FS-066/FS-067/FS-071 Addendum)

This architecture primarily covers non-AI handlers, but Phase 2 introduced cross-cutting API conventions that AI handlers now follow consistently:

FS-074 cross-feature hardening clarification:

- AI suggestion endpoints are suggestion/review contracts only; they do not return implicit commit instructions or mutate mapping state as part of generation/refresh/retry/failure handling.
- Apply-eligibility guard metadata (`readyToApply`, validation diagnostics, stale-guard snapshots where applicable) is part of the API contract so the UI can enforce explicit accept/edit/dismiss semantics.
- Invalid/stale apply attempts must surface as explicit blocked outcomes (or conflict envelopes for stale snapshot mismatches), never as silent fallback apply paths.

- AI handlers (`src/lambda/ai/{explain-rule,suggest-expression,smart-fix,auto-map}.ts`) are thin request/response shells and delegate invocation to shared runtime (`invokeAI(...)`).
- Current canonical backend AI route surface used by the UI adapter includes `/ai/explain-rule`, `/ai/suggest-expression`, `/ai/auto-map`, `/ai/smart-fix`, and `/ai/validate-mappings` (endpoint rollout may be phased; temporary gating should use canonical error semantics).
- AI handler failures are normalized through `normalizeAIError(...)` into canonical backend error envelope semantics before returning `errorResponse(...)`.
- AI handler responses use the same canonical error envelope contract in Section 5 (`code`, `message`, `statusCode`, `retryable`, `requestId`).
- Request-lineage continuity is required end-to-end: `requestId` is preserved from handler envelope/header to UI client error normalization; optional `correlationId` may be propagated for cross-layer audit joins.
- Browser clients must access AI via backend API routes only (UI -> `ApiAdapter`/`HttpAdapter` -> API Gateway -> Lambda). Direct browser-side provider invocation is prohibited by repository guardrails.
- UI canonical adapter policy for AI is `HttpAdapter` in backend mode and deterministic offline-unavailable behavior in `LocalStorageAdapter`; temporary backend capability gaps should surface as standardized `FEATURE_NOT_ENABLED` to UI clients (no hybrid/browser provider fallback).

Canonical AI normalization behavior used by AI handlers (FS-066 baseline + FS-067 updates):

- `VALIDATION_ERROR`/`LIMIT_EXCEEDED` -> `VALIDATION_ERROR` (400)
- `PROMPT_NOT_FOUND` -> `RESOURCE_NOT_FOUND` (404)
- `INVALID_MODEL_OUTPUT` -> `INVALID_MODEL_OUTPUT` (500, non-retryable)
- `TIMEOUT` -> `TIMEOUT` (504, retryable)
- rate-limit and transient provider/runtime classes -> `SERVICE_UNAVAILABLE` (503, retryable)
- remaining provider/config/parse/internal classes -> `INTERNAL_ERROR` (500)

### Suggest Expression endpoint contract (FS-070)

`POST /ai/suggest-expression`

Canonical request payload:

```json
{
  "mappingId": "map_123",
  "instruction": "Use invoice currency and fallback to USD",
  "targetPath": "Order.Header.Currency",
  "targetType": "string",
  "targetDescription": "Optional target-field guidance"
}
```

Canonical success payload:

```json
{
  "success": true,
  "data": {
    "expression": "default(source(\"Invoice.CurrencyCode\"), \"USD\")",
    "explanation": "Uses source currency and falls back to USD.",
    "validation": {
      "valid": true,
      "diagnostics": []
    },
    "readyToApply": true,
    "context": {
      "sourceNodeCount": 120,
      "includedNodeCount": 87,
      "truncated": true,
      "approxTokenCount": 7900,
      "byteLength": 64000
    }
  }
}
```

Failure/edge semantics:

- Backend owns schema-context retrieval and prompt-variable assembly; clients do not send full `sourceContext` blobs.
- Missing/invalid mapping/target context returns canonical client errors (validation/not-found envelope classes).
- Provider/runtime failures return normalized canonical envelopes (`TIMEOUT`, `SERVICE_UNAVAILABLE`, etc.) via shared AI error normalization.
- Model output contract failures return `INVALID_MODEL_OUTPUT` (500, non-retryable).
- Validation-invalid generated expressions are returned as successful suggestion responses with:
  - `validation.valid: false`
  - diagnostics populated
  - `readyToApply: false`
  (UI must treat these as reviewable-but-not-apply-ready, not transport errors.)

### Smart Fix endpoint contract (FS-071)

`POST /ai/smart-fix`

Canonical request payload:

```json
{
  "mappingId": "map_123",
  "ruleIndex": 4,
  "targetPath": "Order.Header.Currency",
  "targetType": "string",
  "failingExpression": "source(\"Invoice.Currency\")",
  "diagnostics": [
    {
      "code": "TYPE_MISMATCH",
      "severity": "error",
      "message": "Expression returns number but target expects string"
    }
  ],
  "diagnosticScope": "all",
  "ruleVersion": 12,
  "ruleHash": "fnv1a-91e713ad"
}
```

Canonical success payload:

```json
{
  "success": true,
  "data": {
    "originalExpression": "source(\"Invoice.Currency\")",
    "suggestedExpression": "default(source(\"Invoice.CurrencyCode\"), \"USD\")",
    "explanation": "Switches to the string currency code and adds USD fallback.",
    "validation": {
      "valid": true,
      "diagnostics": []
    },
    "readyToApply": true,
    "diagnosticsScopeApplied": "all",
    "context": {
      "truncated": false,
      "approxTokenCount": 420,
      "byteLength": 1960,
      "totalDiagnosticCount": 2,
      "includedDiagnosticCount": 2,
      "sourceNodeCount": 120,
      "includedSourceNodeCount": 52,
      "targetNodeCount": 70,
      "includedTargetNodeCount": 30
    },
    "applyGuard": {
      "ruleVersion": 12,
      "ruleHash": "fnv1a-91e713ad"
    }
  }
}
```

Failure/edge semantics:

- Missing or invalid Smart Fix identity fields (`mappingId`, `ruleIndex`, `targetPath`, `failingExpression`, diagnostics payload shape) return canonical `VALIDATION_ERROR` (400).
- Diagnostic scope defaults to `all`; `diagnosticScope=single` requires a valid `selectedDiagnosticIndex`.
- Context assembly is backend-owned and bounded (~64KB / ~8k token-equivalent), prioritizing latest/high-severity diagnostics first when truncation is required.
- Smart Fix suggestions are always validated by backend engine validation before response success payload is returned.
- Validation-invalid suggestions are returned as successful review payloads with `validation.valid: false` and `readyToApply: false`.
- Rule snapshot conflicts use hard stale protection:
  - `ruleVersion` mismatch or `ruleHash` mismatch returns canonical `CONFLICT` (409)
  - UI must block direct apply and offer re-run on latest rule.
- Model output contract failures return `INVALID_MODEL_OUTPUT` (500, non-retryable).
- Provider/runtime failures return normalized canonical envelopes (`TIMEOUT`, `SERVICE_UNAVAILABLE`, etc.).

### Validate Mappings endpoint contract (FS-072)

`POST /ai/validate-mappings`

Canonical request payload (V1):

```json
{
  "mappingId": "map_123",
  "sampleData": {
    "contentType": "application/json",
    "content": "{\"invoice\":{\"currency\":\"USD\"}}"
  }
}
```

Canonical success payload:

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalIssues": 2,
      "errors": 1,
      "warnings": 1,
      "info": 0
    },
    "issues": [
      {
        "id": "issue_1",
        "category": "correctness",
        "severity": "error",
        "description": "Potential null-path access without fallback.",
        "recommendation": "Wrap with default(...).",
        "affectedRules": [
          {
            "ruleIndex": 3,
            "targetPath": "Order.Header.Currency"
          }
        ]
      }
    ],
    "meta": {
      "generatedAt": "2026-06-02T12:00:00.000Z"
    }
  }
}
```

Failure/edge semantics:

- V1 is **single-mapping only**; batch requests are rejected with canonical `VALIDATION_ERROR` (400).
- Optional `sampleData` is bounded and validated at request boundary:
  - allowed content types: JSON/XML text only (`application/json`, `application/xml`, `text/xml`)
  - max payload size: 1 MB
  - oversized payloads are rejected with clear `VALIDATION_ERROR` (no silent truncation)
- Backend owns mapping/schema context retrieval and request assembly for runtime invocation.
- Structured output is mandatory; invalid contract/enum output returns `INVALID_MODEL_OUTPUT` (500, non-retryable).
- Canonical V1 enums are backend-enforced:
  - `issues[].category`: `correctness | completeness | maintainability | risk`
  - `issues[].severity`: `info | warning | error`
- `affectedRules[]` is expected to include stable rule references (`ruleIndex`, `targetPath`, or both) for UI navigation.
- Runtime/provider/timeout failures use shared normalization (`TIMEOUT`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`) via `normalizeAIError(...)`.
- AI validation report semantics are additive/advisory only; deterministic engine diagnostics remain authoritative for validation correctness gates.

## 12) Cross-References

- `forge/architecture/phase-1-readiness.md` — backend boundary and Phase 1 constraints
- `forge/architecture/project-structure.md` — canonical repo structure and lambda locations
- `forge/architecture/ai-runtime.md` — AI Lambda architecture (separate scope)
- `forge/architecture/persistence-model.md` — authoritative persistence model decisions
- `forge/architecture/infrastructure.md` — resource inventory and environment mapping
- `forge/active/FS-057/spec.md` — behavior-level acceptance and error envelope contract

---

## 13) CDM Read-Only Integration Addendum (FS-076)

FS-076 introduces a constrained GitHub integration slice for canonical CDM schemas.

### Fixed scope and browse semantics

- Repository: `KBXT/KBX-Canonicals`
- Repository ID: `1052821334`
- Root: `JSONSchemas/CommonDataModels`
- Root guard rejects out-of-scope/traversal paths deterministically before upstream calls.
- Browse is one directory level per request; client drives navigation by requesting child paths.

### Link metadata contract (AE-02)

Successful CDM link persists canonical source metadata:

- `origin: 'cdm'`
- `repo: 'KBXT/KBX-Canonicals'`
- `repoId: 1052821334`
- `branch`, `path`, `commitSha`

`repoId` is also projected for query/index usage (`sourceRepoId`) to support filtering/reporting.

Duplicate link attempts within the same project for the same `repo+branch+path` are idempotent success.

### Sync semantics (AE-03/AE-04/AE-05/AE-06)

- `POST /schemas/:id/sync-cdm` is manual-only explicit re-sync.
- `GET /schemas/:id/sync-cdm` is lightweight status-refresh read.
- Status-refresh can set/return `update-available` without content mutation.
- GitHub read failures persist `sync-failed` and surface canonical actionable service-unavailable semantics.

### UI-consumption CDM status contract (FS-078)

At the API boundary consumed by UI schema surfaces, CDM `syncStatus` semantics are canonicalized to:

- `synced`
- `update-available`
- `sync-failed`

Contract requirements:

- Backend normalization owns legacy/transitional mapping before response emission.
- UI-facing schema payloads (`GET /schemas`, `GET /schemas/:id`, project-embedded schema records, and CDM sync responses) must not require UI-only reinterpretation of legacy status strings.
- Unknown/unexpected legacy values must normalize deterministically to `sync-failed` for safe, consistent cross-surface rendering.
- This normalization guarantees one badge vocabulary across Project Overview, Schema Library, and Schema Detail and prevents legacy labels (`not-synced`, `local-changes`) from reappearing for CDM records.

### No-write GitHub invariant (AE-09)

CDM browse/link/sync flows must use GitHub read endpoints only.

- Forbidden in CDM flow paths: content/ref/tree write operations.
- Regression tests assert no write-style endpoint usage patterns in these handlers.

---

## 14) Deployment Guardrail Addendum (FS-079)

FS-079 adds backend-enforced deploy-context gating for CDM-referenced mappings.

### Guard enforcement scope

- Applied to deployment entrypoints:
  - `POST /mappings/:mappingId/deploy`
  - `POST /mappings/:mappingId/promote`
- Not applied to save/edit/version-create flows (`Save ≠ Deploy` remains true).
- Guard executes before any deployment persistence write call.

### Blocking envelope contract

When one or more referenced CDM schemas are not deployable, handlers return:

- HTTP `409`
- `error.code = DEPLOY_BLOCKED_CDM_SCHEMA_STATE`
- standard envelope fields (`message`, `statusCode`, `retryable`, `requestId`)
- `error.details.issues[]` with per-schema entries:
  - `schemaId`
  - optional `schemaName`
  - `referenceRole` (`source` | `target`)
  - `reason` (stable enum)
  - `remediationKey`

Stable reason taxonomy:
- `unsynced`
- `update-failed`
- `metadata-incomplete`
- `ingest-not-ready`
- `schema-missing`

Blocking semantics:
- all issues are returned in one response (no first-failure short-circuit)
- when blocked, deploy/promote handlers perform no deployment create writes
- non-CDM referenced schemas are ignored by this guardrail

### Successful deploy/promote traceability contract

On successful deploy/promote with referenced CDM schemas, traceability is persisted in both locations:

1. Deployment item metadata (`DeploymentItem.cdmSchemaTraceability[]`)
2. Snapshot body metadata (`metadata.cdmSchemaTraceability[]`)

Each traceability entry includes:
- `schemaId`
- optional `schemaName`
- `referenceRole` (`source` | `target`)
- `repo`
- `path`
- `commitSha`

This dual-location contract provides immutable snapshot provenance plus query-friendly record-level traceability.

---

## 15) CDM GitHub Resilience Addendum (FS-080)

FS-080 codifies canonical backend resilience behavior for CDM GitHub **read** operations used by:

- `GET /schemas/cdm` (browse)
- `POST /schemas/cdm/link` (link/read + ingest)
- `POST /schemas/:id/sync-cdm` and `GET /schemas/:id/sync-cdm` (manual re-sync / status-refresh read)

### Canonical backend-owned failure taxonomy

CDM GitHub read failures are normalized by backend into deterministic classes and stable error codes:

| Failure class | Error code | Typical upstream conditions | Retryable |
|---|---|---|---:|
| `rate-limited` | `CDM_RATE_LIMITED` | GitHub 429 / explicit upstream rate-limit signals | true |
| `unauthorized-forbidden` | `CDM_UNAUTHORIZED_FORBIDDEN` | GitHub 401/403 or credential scope denial | false |
| `not-found-path-mismatch` | `CDM_NOT_FOUND_PATH_MISMATCH` | 404/not-found for canonical repo/path target | false |
| `timeout-transient` | `CDM_TIMEOUT_TRANSIENT` | timeout/network/transient 5xx class failures | true |

Contract requirements:

- Backend owns normalization and emits canonical class metadata in error envelope details.
- UI owns user-facing copy mapping keyed by backend class.
- Unknown/ambiguous upstream failure states must fail safely as retryable transient (`timeout-transient`) rather than silently succeeding.

### Retry/backoff contract for CDM GitHub read operations

CDM GitHub reads use bounded automatic retries with exponential backoff + jitter.

- Scope: GitHub-read portions of browse/link/sync only.
- Bounded attempts (no unbounded loops).
- Backoff shape: exponential growth with configured cap and jitter.
- Tunables:
  - `CDM_GITHUB_READ_MAX_ATTEMPTS`
  - `CDM_GITHUB_READ_BASE_DELAY_MS`
  - `CDM_GITHUB_READ_MAX_DELAY_MS`
  - `CDM_GITHUB_READ_JITTER_MS`

Terminal outcomes are always explicit success or explicit failure envelope; there is no success fallthrough on terminal failure.

### Browse cache and stale-grace contract

CDM browse (`GET /schemas/cdm`) includes bounded listing cache fallback semantics:

- Cache key scope: repo + branch + path (within fixed `JSONSchemas/CommonDataModels` guard).
- TTL defaults:
  - local: `30s`
  - dev: `60s`
  - prod: `300s`
- Outage-only stale grace beyond TTL is allowed with explicit degraded signaling.
- Recommended prod stale grace upper bound: `15 minutes` max staleness.

Safety constraints:

- Cache fallback never masks sync-status truth (`synced` / `update-available` / `sync-failed`) for schema records.
- Cache beyond stale grace is treated as failure (not usable fallback).
- Path/root constraints are unchanged by cache behavior.

### Error envelope details and headers for resilience semantics

When CDM resilience failures are returned, backend error envelopes may include:

- `error.details.failureClass`
- `error.details.retryCount`
- `error.details.retryAfterSeconds` (when available)

Rate-limited responses propagate retry timing hints:

- response header: `retry-after` (when upstream metadata is available)
- mirrored numeric detail: `retryAfterSeconds` for UI timing guidance

This extends the standard envelope without changing canonical envelope shape.

### Sync explicit-failure invariant

`POST /schemas/:id/sync-cdm` must never report success for terminal GitHub read failure paths.

- Terminal sync failure returns explicit failure envelope with normalized CDM failure taxonomy.
- Failure remains visible to user via persisted/returned sync-failed outcomes.
- Structured terminal-failure telemetry is emitted with request lineage fields.

### Observability contract for incident triage

CDM GitHub read logic emits structured telemetry for both per-attempt and terminal events.

Canonical event names:

- `cdm-github-read-attempt`
- `cdm-github-read-terminal`

Required fields for debugging/tracing:

- `operation`
- repository/path context (`repo`, `path`)
- `statusCode`
- `retryCount`
- `failureClass`
- `retryAfter` (if present)
- request lineage (`requestId`, optional `correlationId`)
- terminal decision/summary fields (success/failure classification)

---

## 16) Runtime Deployment Model Addendum (FS-081)

FS-081 introduces a control-plane/runtime-plane split for deployments:

- **Control plane:** SANDBOX (`kbxt-platform-integrations-qa`, account `503561435751`)
- **Runtime planes:** DEV (`897699593484`), PREPROD (`527737084689`), PROD (`410618142059`)

### 16.1 Canonical environment model

- Runtime deployment targets: `DEV | PREPROD | PROD`
- Control-plane context (non-runtime target): `SANDBOX`

Legacy-compatibility policy:
- persisted historical `QA` values may remain in raw records for audit fidelity
- domain/presentation normalization maps `QA -> PREPROD` for behavior and UI rendering

### 16.2 Deployment route responsibilities under FS-081

Control-plane routes (public KeyRa API surface):

- `POST /mappings/:mappingId/deploy`
- `POST /mappings/:mappingId/promote`
- `POST /mappings/:mappingId/rollback`
- `GET /mappings/:mappingId/deployments`
- `GET /mappings/:mappingId/deployments/current`

Control-plane handlers orchestrate delivery to runtime environments; runtime activation/execution remains environment-local.

Runtime internal endpoints (not part of public product route table):

- internal deploy ingestion endpoint (artifact push/verify/activate)
- internal runtime preview endpoint (execute currently active local artifact)

### 16.3 Transfer and retry contract (MVP)

Canonical transfer for this phase:
- SANDBOX control-plane POSTs full deployment artifact payload directly in runtime deploy request body.
- Signed URL pull transfer is deferred.

Payload guardrail:
- runtime deploy ingestion must enforce configured max payload size
- oversize must fail with deterministic actionable diagnostic (recommended code: `DEPLOY_ARTIFACT_TOO_LARGE`, HTTP 413)

Retry contract:
- retries are client-driven and idempotent by `artifactId`/`snapshotId`
- repeated delivery of identical artifact to same runtime environment must be safe and deterministic

### 16.4 Promotion and rollback contract

Promotion:
- preserves same artifact identity (`artifactId` + hash) from source runtime to target runtime
- does not regenerate payload during DEV->PREPROD or PREPROD->PROD promotion

Rollback:
- pointer-only reassignment in target runtime
- append-only rollback history event (`rollbackOf` linkage)
- no artifact content mutation/deletion
- if artifact missing locally in target runtime: return `ARTIFACT_NOT_PRESENT` (HTTP 409), no implicit auto-import in MVP

### 16.5 Runtime-local execution and preview invariant

For both business execution and server preview:
- runtime environment resolves active pointer and artifact from local resources only
- no runtime dependency on SANDBOX deployment state at request execution time

Preview response contract should include runtime provenance:
- `environment`
- artifact identity metadata (artifact id/hash and deployed source metadata as available)

### 16.6 Network assumption (MVP)

- Runtime deploy/preview endpoints are HTTPS and reachable from SANDBOX.
- Access model for this phase: internal public endpoint allowlisting.
- Private connectivity topology (e.g., private link/VPC peering) is deferred.

---

## 17) Runtime Bootstrap Internal API Contract (FS-082)

FS-082 codifies the runtime-environment bootstrap API surface used by SANDBOX orchestration and runtime execution.

### 17.1 Route surface (runtime internal)

These routes are internal runtime endpoints and are not part of the public product API table in Section 2:

| Method | Path | Responsibility |
|---|---|---|
| `POST` | `/internal/deploy` | Validate deploy payload, persist immutable snapshot/schema objects locally, update active pointer, append history |
| `POST` | `/internal/rollback` | Validate rollback target exists locally, repoint active pointer, append rollback event |
| `POST` | `/internal/execute` | Resolve active pointer/snapshot from local runtime resources and execute mapping |
| `GET` | `/internal/health` | Liveness/readiness probe for runtime dependencies |
| `GET` | `/internal/status/{mappingId}` | Active snapshot pointer + recent deployment metadata or deterministic not-deployed state |

### 17.2 Handler separation of concerns

- Deploy/rollback handler is write-path only (artifact persistence + pointer/history updates).
- Runtime execute handler is read/compute only (no deployment-state mutations).
- Status/health handler is read-only diagnostics/metadata surface.

This separation keeps deployment mutations isolated from execution path behavior.

### 17.3 Runtime internal error semantics

Runtime internal APIs use the canonical error envelope from Section 5.

Expected deterministic failure classes in this slice include:
- deploy hash/integrity mismatch -> validation/conflict style deterministic error (no pointer update)
- deploy payload too large -> `DEPLOY_ARTIFACT_TOO_LARGE` (`413`)
- rollback target snapshot missing locally -> `ARTIFACT_NOT_PRESENT` (`409`)
- execute/status with no active pointer -> deterministic not-deployed/not-found style error contract

All paths preserve request correlation via `requestId` in headers/envelope.

### 17.4 Runtime-local execution invariant

For `/internal/execute` and runtime preview behavior:
- pointer resolution and artifact/schema retrieval are local to the runtime environment
- no runtime fetch of SANDBOX deployment state is allowed
- schema payloads required for execution are pre-copied during deploy into runtime-local S3

### 17.5 MVP transport and indexing decisions

- deploy transport: direct request-body payload relay only for MVP
- history indexing: `DeploymentHistoryTable` uses PK/SK access only in MVP; no speculative GSI

---

## 18) Control-Plane Remote Orchestration Contract Addendum (FS-083)

FS-083 Rev 2 codifies the orchestration contract between SANDBOX control plane and runtime internal APIs.

### 18.1 Orchestration status model

Control-plane deployment orchestration tracks explicit state per operation:

- `queued`
- `in_progress`
- `retrying`
- `succeeded`
- `failed`
- `timed_out`

Minimum orchestration metadata includes:
- `orchestrationId`
- `mappingId`
- `operationType` (`deploy|promote|rollback|preview`)
- `targetEnvironment`
- optional `sourceEnvironment`
- optional `artifactId`
- `attemptCount`
- optional `lastErrorCode`
- optional `lastErrorMessage`
- request/actor timestamps

### 18.2 Promote contract (same artifact, full payload)

Promotion must:
- preserve artifact identity (`artifactId` + `artifactHash`)
- send full artifact payload on every promote request (same path as deploy)
- avoid any `hasArtifact` preflight split flow in MVP

Runtime may treat already-present matching artifact as idempotent storage no-op.

### 18.3 Payload-size enforcement (MVP hard limit)

FS-083 establishes an explicit payload cap:
- **5 MB max raw JSON body** for deploy/promote artifact request payloads

Error semantics:
- control-plane preflight oversize rejection: `PAYLOAD_TOO_LARGE` (`413`)
- runtime defense-in-depth oversize rejection: `DEPLOY_ARTIFACT_TOO_LARGE` (`413`)

### 18.4 Timeout reconciliation strategy

On ambiguous timeout outcomes, canonical reconciliation is runtime status polling.

- control plane polls runtime status endpoint (`GET /internal/status/{mappingId}` or equivalent runtime status query)
- callback/event-bridge mechanisms are out of scope in MVP
- status vocabulary for reconciliation: `not_found`, `received`, `stored`, `activated`, `failed`

Interpretation baseline:
- `stored` or `activated` -> reconcile as success
- `failed` or `not_found` -> reconcile as failure

### 18.5 Rollback locality rule

Rollback is permitted only for artifacts already present in target runtime local storage.

- missing local artifact -> `ARTIFACT_NOT_PRESENT` (`409`)
- no on-demand artifact import in MVP
- control plane should return remediation guidance (deploy/promote artifact first, then retry rollback)

### 18.6 Environment configuration ownership

Canonical source of runtime endpoint routing config is a persisted control-plane admin settings record.

Fallback:
- environment variables may bootstrap local/dev or initial setup
- env-var reads are fallback behavior, not canonical long-term source of truth

### 18.7 QA/PREPROD compatibility policy

For legacy records:
- raw persisted value `QA` may remain at-rest for audit fidelity
- API/domain presentation normalizes `QA -> PREPROD` for runtime behavior/UI consistency
- optional audit/detail surfaces may disclose historical label context where needed
