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
- Shared handler module conventions under `src/lambda/shared/`

Out of scope:
- Detailed AI runtime internals under `src/lib/ai/` (covered by `ai-runtime.md`)
- Deployment/GitHub/Activity/Preview/Auth architecture
- IaC resource authoring details (covered by `infrastructure.md`)

---

## 2) Route Table (Phase 1)

Phase 1 exposes 21 routes. Logical Lambda names follow the naming conventions documented in `infrastructure.md` (`{Verb}{Resource}Function`).

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
| GET | `/schemas/:id` | `src/lambda/schema/get-schema.ts` | `GetSchemaFunction` | Get schema detail |
| DELETE | `/schemas/:id` | `src/lambda/schema/delete-schema.ts` | `DeleteSchemaFunction` | Delete schema (conflict when referenced) |
| POST | `/schemas/:id/query` | `src/lambda/schema/query-schema-nodes.ts` | `QuerySchemaNodesFunction` | Query schema nodes (OpenSearch-first, max 50; gated PK-scoped degraded fallback) |

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
- Main fields: `name`, `description`, `slug`, `schemaRefs[]`, `tags[]`, timestamps

#### `MAPPINGS_TABLE`
- PK: `mappingId` (String)
- GSI: `projectId-index` (PK=`projectId`)
- Main fields: `projectId`, `name`, `revision`, `latestVersion`, `configHash`, legacy `version` alias, `status`, `sourceSchemaId`, `targetSchemaId`, `ruleCount`, `coverage`, `configS3Key`, timestamps

#### `MAPPING_REVISIONS_TABLE`
- PK: `mappingId` (String), SK: `revision` (Number)
- Main fields: `savedAt`, `savedBy`, `ruleCount`, `configS3Key`, `configHash`

#### `SCHEMAS_TABLE`
- PK: `schemaId` (String)
- Main fields: `name`, `format`, `fieldCount`, `origin`, `status`, `scope`, `description`, `inferred`, `syncStatus`, `source`, timestamps

#### `SCHEMA_NODES_TABLE`
- PK: `schemaId` (String), SK: `path` (String)
- Main fields: `fieldName`, `type`, optional `description`, plus ingestion metadata fields

#### `MAPPING_VERSIONS_TABLE`
- PK: `mappingId` (String), SK: `version` (Number)
- Main fields: `revisionNumber`, `createdAt`, `createdBy`

### 7.2 Handler-to-table mapping

| Handler | DynamoDB patterns |
|---|---|
| `project/create-project` | put project item |
| `project/list-projects` | scan projects + scan mappings (counts) |
| `project/get-project` | get project + query mappings by `projectId-index` + get schema metadata for refs |
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
| `schema/list-schemas` | scan schemas |
| `schema/get-schema` | get schema metadata |
| `schema/delete-schema` | get schema + scan/query project refs + delete schema + delete schema nodes |
| `schema/query-schema-nodes` | get schema + OpenSearch query via `searchSchemaNodes`; on explicit degraded gate, fallback to PK-scoped schemaId query + in-memory substring filter |

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

---

## 11) AI Handler API Conventions (FS-066 Addendum)

This architecture primarily covers non-AI handlers, but Phase 2 introduced cross-cutting API conventions that AI handlers now follow consistently:

- AI handlers (`src/lambda/ai/{explain-rule,suggest-expression,auto-map}.ts`) are thin request/response shells and delegate invocation to shared runtime (`invokeAI(...)`).
- AI handler failures are normalized through `normalizeAIError(...)` into canonical backend error envelope semantics before returning `errorResponse(...)`.
- AI handler responses use the same canonical error envelope contract in Section 5 (`code`, `message`, `statusCode`, `retryable`, `requestId`).
- Browser clients must access AI via backend API routes only (UI -> `ApiAdapter`/`HttpAdapter` -> API Gateway -> Lambda). Direct browser-side provider invocation is prohibited by repository guardrails.

Canonical FS-066 normalization behavior used by AI handlers:

- `VALIDATION_ERROR`/`LIMIT_EXCEEDED` -> `VALIDATION_ERROR` (400)
- `PROMPT_NOT_FOUND` -> `RESOURCE_NOT_FOUND` (404)
- `TIMEOUT` -> `TIMEOUT` (504, retryable)
- rate-limit and transient provider/runtime classes -> `SERVICE_UNAVAILABLE` (503, retryable)
- remaining provider/config/parse/internal classes -> `INTERNAL_ERROR` (500)

## 12) Cross-References

- `forge/architecture/phase-1-readiness.md` — backend boundary and Phase 1 constraints
- `forge/architecture/project-structure.md` — canonical repo structure and lambda locations
- `forge/architecture/ai-runtime.md` — AI Lambda architecture (separate scope)
- `forge/architecture/persistence-model.md` — authoritative persistence model decisions
- `forge/architecture/infrastructure.md` — resource inventory and environment mapping
- `forge/active/FS-057/spec.md` — behavior-level acceptance and error envelope contract
