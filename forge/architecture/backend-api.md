# Backend API Architecture

This document defines the Phase 1 backend API architecture — Lambda handler patterns, DynamoDB/S3 access conventions, error envelope standard, and API Gateway configuration.

Agents must load this document before implementing or modifying Lambda handlers.

---

## 1) Purpose and Scope

The Phase 1 backend API provides persistent CRUD for projects, mappings, schemas, and schema query. It is consumed by the `HttpAdapter` (FS-055) which passes response bodies directly to the UI without transformation.

**In scope:** Project, Mapping, Schema CRUD + Schema Query  
**Out of scope:** AI, GitHub, Deployment, Activity, Preview, Templates, Authentication

---

## 2) Route Table

| Method | Path | Handler File | Description |
|--------|------|-------------|-------------|
| POST | `/projects` | `src/lambda/project/create-project.ts` | Create project |
| GET | `/projects` | `src/lambda/project/list-projects.ts` | List all projects |
| GET | `/projects/:id` | `src/lambda/project/get-project.ts` | Get project detail |
| PUT | `/projects/:id` | `src/lambda/project/update-project.ts` | Update project |
| DELETE | `/projects/:id` | `src/lambda/project/delete-project.ts` | Delete project |
| POST | `/mappings` | `src/lambda/mapping/create-mapping.ts` | Create mapping |
| GET | `/mappings/:id` | `src/lambda/mapping/get-mapping.ts` | Get mapping config |
| PUT | `/mappings/:id` | `src/lambda/mapping/update-mapping.ts` | Update mapping |
| DELETE | `/mappings/:id` | `src/lambda/mapping/delete-mapping.ts` | Delete mapping |
| POST | `/mappings/:id/duplicate` | `src/lambda/mapping/duplicate-mapping.ts` | Duplicate mapping |
| GET | `/projects/:projectId/mappings` | `src/lambda/mapping/list-mappings.ts` | List project mappings |
| GET | `/mappings/:mappingId/versions` | `src/lambda/mapping/list-versions.ts` | List mapping versions |
| GET | `/mappings/:mappingId/versions/:version` | `src/lambda/mapping/get-version.ts` | Get specific version |
| POST | `/mappings/:mappingId/versions` | `src/lambda/mapping/save-version.ts` | Save version entry |
| POST | `/schemas` | `src/lambda/schema/create-schema.ts` | Create/ingest schema |
| GET | `/schemas` | `src/lambda/schema/list-schemas.ts` | List all schemas |
| GET | `/schemas/:id` | `src/lambda/schema/get-schema.ts` | Get schema detail |
| DELETE | `/schemas/:id` | `src/lambda/schema/delete-schema.ts` | Delete schema |
| POST | `/schemas/:id/query` | `src/lambda/schema/query-schema-nodes.ts` | Search schema nodes |

---

## 3) Handler Conventions

### Entry Point

Every handler exports a single async function:

```typescript
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from '../shared/types';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // ...
}
```

### Import Rules

- Handlers import utilities from `../shared/`
- Handlers may import from `../../engine/` for validation/coverage computation
- Handlers must NOT import from `../../lib/ai/` (AI runtime is separate)
- Handlers must NOT import from `ui/` under any circumstance
- Handlers must NOT import from each other (no cross-handler dependencies)

### Single Responsibility

One handler per Lambda function. One file per handler. Each handler:
1. Parses and validates input
2. Performs DynamoDB/S3 operations
3. Returns a typed response

No orchestration of multiple handlers within a single handler.

---

## 4) Error Envelope

All error responses use this shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "statusCode": 400,
    "retryable": false
  }
}
```

### Standard Error Codes

| Code | HTTP Status | Retryable | When Used |
|------|-------------|-----------|-----------|
| `VALIDATION_ERROR` | 400 | false | Missing required fields, invalid format, bad input |
| `RESOURCE_NOT_FOUND` | 404 | false | Entity does not exist |
| `CONFLICT` | 409 | false | Referential integrity violation |
| `INTERNAL_ERROR` | 500 | true | Unexpected server failure |
| `SERVICE_UNAVAILABLE` | 503 | true | DynamoDB/S3 throttling or transient failure |

### Compatibility

This envelope is consumed by `HttpAdapter` → `toAppError()` which extracts `code`, `statusCode`, `message`, and `retryable` into the UI's `AppError` type.

---

## 5) DynamoDB Tables

### Projects

| Key | Type | Role |
|-----|------|------|
| `projectId` | String | Partition Key |

Fields: name, description, slug, schemaRefs (List), tags (List), createdAt, updatedAt

### Mappings

| Key | Type | Role |
|-----|------|------|
| `mappingId` | String | Partition Key |

GSI `projectId-index`: PK=`projectId`

Fields: projectId, name, version, status, sourceSchemaId, targetSchemaId, ruleCount, coverage, configS3Key, createdAt, updatedAt

### SchemaMetadata

| Key | Type | Role |
|-----|------|------|
| `schemaId` | String | Partition Key |

Fields: name, format, fieldCount, origin, status, scope, description, inferred, syncStatus, source (Map), createdAt, updatedAt

### SchemaNodes

| Key | Type | Role |
|-----|------|------|
| `schemaId` | String | Partition Key |
| `path` | String | Sort Key |

Fields: fieldName, type, description, depth, parentPath, isArray, isRequired, childCount

### MappingVersions

| Key | Type | Role |
|-----|------|------|
| `mappingId` | String | Partition Key |
| `version` | Number | Sort Key |

Fields: savedAt, savedBy, ruleCount, config (Map — full MappingConfig snapshot)

---

## 6) S3 Storage

### Key Patterns

| Content Type | S3 Key Pattern | Content Format |
|---|---|---|
| Schema content | `schemas/{schemaId}/content.json` or `.xsd` | JSON object or XML string |
| Mapping config | `mappings/{mappingId}/config.json` | Full MappingConfig JSON |

### Bucket

Single content bucket. Name configured via `CONTENT_BUCKET` environment variable.

---

## 7) Environment Variables

| Variable | Description |
|----------|-------------|
| `PROJECTS_TABLE` | DynamoDB Projects table name |
| `MAPPINGS_TABLE` | DynamoDB Mappings table name |
| `SCHEMAS_TABLE` | DynamoDB SchemaMetadata table name |
| `SCHEMA_NODES_TABLE` | DynamoDB SchemaNodes table name |
| `MAPPING_VERSIONS_TABLE` | DynamoDB MappingVersions table name |
| `CONTENT_BUCKET` | S3 bucket for schema/mapping content |
| `AWS_REGION` | AWS region (set by Lambda runtime) |

---

## 8) Shared Utilities (`src/lambda/shared/`)

| Module | Exports | Purpose |
|--------|---------|---------|
| `response.ts` | `jsonResponse()`, `errorResponse()` | Standard response builders with CORS |
| `request.ts` | `parseBody()`, `parsePathParam()`, `parseQueryParam()` | Safe input extraction |
| `validation.ts` | `requireFields()` | Input validation with error generation |
| `errors.ts` | `notFound()`, `conflict()`, `validationError()`, `internalError()`, `serviceUnavailable()` | Typed error constructors |
| `dynamo.ts` | `getItem()`, `putItem()`, `query()`, `scan()`, `deleteItem()`, `updateItem()` | DynamoDB DocumentClient wrappers |
| `s3.ts` | `putObject()`, `getObject()`, `deleteObject()` | S3 client wrappers |
| `types.ts` | `APIGatewayProxyEvent`, `APIGatewayProxyResult` | Shared Lambda types |
| `index.ts` | barrel | Re-exports all utilities |

---

## 9) Testing Approach

### Unit Tests

- Mock DynamoDB and S3 clients
- Test each handler in isolation
- Verify correct DynamoDB operations called with correct parameters
- Verify response shapes and status codes
- Location: `tests/lambda/unit/`

### Integration Tests

- Use DynamoDB Local (port 8000)
- Mock S3 with `aws-sdk-client-mock` or equivalent
- Create real tables with correct schemas
- Test complete CRUD flows end-to-end
- Verify referential integrity across entities
- Location: `tests/lambda/integration/`

---

## 10) CORS Configuration

All responses include:
```
Content-Type: application/json
Access-Control-Allow-Origin: *
```

API Gateway should be configured with OPTIONS preflight handlers returning:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## Cross-References

- `forge/architecture/phase-1-readiness.md` — Phase 0 → Phase 1 boundary analysis
- `forge/architecture/project-structure.md` — repository file layout
- `forge/architecture/ai-runtime.md` — AI Lambda conventions (separate concern)
- `specs/PRODUCT-TECHNICAL.md` Sections 14, 15, 16 — backend architecture and data model reference
- `ui/src/lib/types/domain.ts` — response shape definitions
- `ui/src/lib/state/app-error.ts` — error model target
