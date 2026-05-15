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
- Mapping version endpoints
- Schema create/get/list/delete + schema query endpoints
- Shared handler module conventions under `src/lambda/shared/`

Out of scope:
- AI endpoints under `src/lambda/ai/` (covered by `ai-runtime.md`)
- Deployment/GitHub/Activity/Preview/Auth architecture
- IaC resource authoring details (covered by `infrastructure.md`)

---

## 2) Route Table (Phase 1)

Phase 1 exposes 19 routes. Logical Lambda names follow the naming conventions documented in `infrastructure.md` (`{Verb}{Resource}Function`).

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
| GET | `/mappings/:mappingId/versions` | `src/lambda/mapping/list-versions.ts` | `ListMappingVersionsFunction` | List mapping versions (desc) |
| GET | `/mappings/:mappingId/versions/:version` | `src/lambda/mapping/get-version.ts` | `GetMappingVersionFunction` | Get specific mapping version |
| POST | `/mappings/:mappingId/versions` | `src/lambda/mapping/save-version.ts` | `SaveMappingVersionFunction` | Save mapping version entry (prune >50) |
| POST | `/schemas` | `src/lambda/schema/create-schema.ts` | `CreateSchemaFunction` | Create schema (inline or ingesting kickoff) |
| GET | `/schemas` | `src/lambda/schema/list-schemas.ts` | `ListSchemasFunction` | List schemas |
| GET | `/schemas/:id` | `src/lambda/schema/get-schema.ts` | `GetSchemaFunction` | Get schema detail |
| DELETE | `/schemas/:id` | `src/lambda/schema/delete-schema.ts` | `DeleteSchemaFunction` | Delete schema (conflict when referenced) |
| POST | `/schemas/:id/query` | `src/lambda/schema/query-schema-nodes.ts` | `QuerySchemaNodesFunction` | Query schema nodes (DynamoDB substring match, max 50) |

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
- Success: `jsonResponse(statusCode, body)`
- Error: `errorResponse(code, message, statusCode, retryable)`

---

## 5) Standard Error Envelope

All non-success responses must follow:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Project with id 'abc-123' not found",
    "statusCode": 404,
    "retryable": false
  }
}
```

### Standard codes

| Code | HTTP Status | Retryable | Usage |
|---|---:|---:|---|
| `VALIDATION_ERROR` | 400 | false | malformed JSON, missing required field, invalid param/body value |
| `RESOURCE_NOT_FOUND` | 404 | false | requested project/mapping/schema/version/content absent |
| `CONFLICT` | 409 | false | referential integrity block, optimistic concurrency mismatch |
| `INTERNAL_ERROR` | 500 | true | unexpected handler failure |
| `SERVICE_UNAVAILABLE` | 503 | true | transient DynamoDB/S3 service issue (e.g., throttling) |

This envelope matches FS-057 spec behavior and is consumed by `HttpAdapter` error normalization.

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
- Main fields: `projectId`, `name`, `version`, `status`, `sourceSchemaId`, `targetSchemaId`, `ruleCount`, `coverage`, `configS3Key`, timestamps

#### `SCHEMAS_TABLE`
- PK: `schemaId` (String)
- Main fields: `name`, `format`, `fieldCount`, `origin`, `status`, `scope`, `description`, `inferred`, `syncStatus`, `source`, timestamps

#### `SCHEMA_NODES_TABLE`
- PK: `schemaId` (String), SK: `path` (String)
- Main fields: `fieldName`, `type`, optional `description`, plus ingestion metadata fields

#### `MAPPING_VERSIONS_TABLE`
- PK: `mappingId` (String), SK: `version` (Number)
- Main fields: `savedAt`, `savedBy`, `ruleCount`, `config`

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
| `mapping/list-versions` | query by `mappingId` descending |
| `mapping/get-version` | get item by `mappingId` + `version` |
| `mapping/save-version` | put version + query versions + prune oldest beyond 50 |
| `schema/create-schema` | put schema metadata; inline mode puts schema nodes |
| `schema/list-schemas` | scan schemas |
| `schema/get-schema` | get schema metadata |
| `schema/delete-schema` | get schema + scan/query project refs + delete schema + delete schema nodes |
| `schema/query-schema-nodes` | get schema + query schema nodes by `schemaId` then in-memory substring filter on `path`/`fieldName` |

---

## 8) S3 Content Storage Conventions

Bucket is configured by `CONTENT_BUCKET`.

| Content | Key pattern | Content-Type |
|---|---|---|
| Mapping config | `mappings/{mappingId}/config.json` | `application/json` |
| Schema content | `schemas/{schemaId}/content.json` (json-schema) | `application/json` |
| Schema content | `schemas/{schemaId}/content.xsd` (xsd) | `application/xml` |

Notes:
- Mapping metadata stores `configS3Key` to locate current config.
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
| `MAPPING_VERSIONS_TABLE` | Mapping versions table name |
| `CONTENT_BUCKET` | S3 bucket for mapping/schema content |

### Runtime/environment defaults

| Variable | Purpose |
|---|---|
| `AWS_REGION` | Lambda runtime region |
| `DYNAMODB_ENDPOINT` / `AWS_ENDPOINT_URL_DYNAMODB` | local DynamoDB override for integration/local runs |

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

## 11) Cross-References

- `forge/architecture/phase-1-readiness.md` — backend boundary and Phase 1 constraints
- `forge/architecture/project-structure.md` — canonical repo structure and lambda locations
- `forge/architecture/ai-runtime.md` — AI Lambda architecture (separate scope)
- `forge/architecture/persistence-model.md` — authoritative persistence model decisions
- `forge/architecture/infrastructure.md` — resource inventory and environment mapping
- `forge/active/FS-057/spec.md` — behavior-level acceptance and error envelope contract
