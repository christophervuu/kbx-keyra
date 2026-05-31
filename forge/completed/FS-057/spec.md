# SPEC

## Title

Phase 1 Backend API Surface — Project, Mapping, and Schema CRUD

---

## ID

FS-057

---

## Metadata

Owner: @christophervuu  
Reviewers: TBD  
Created: 2026-05-14  
Last Updated: 2026-05-14  
Type: backend

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Define and implement the Phase 1 backend API surface — API Gateway routes and Lambda handlers for project CRUD, mapping CRUD, schema create/get/list/delete, and schema query. This is the server-side complement to FS-055 (HttpAdapter). The API returns a normalized error envelope compatible with the UI's `AppError`/`AsyncState` retry model. Large schema ingestion uses an async kickoff pattern with status polling. Routes align to the product spec's published API map (Section 16) for the CRUD subset.

---

## Problem

The UI currently operates against `LocalStorageAdapter` for all persistence. FS-055 introduces an `HttpAdapter` that expects backend endpoints to exist. No backend Lambda handlers or API Gateway routes exist for project, mapping, or schema CRUD. Without these endpoints, the UI cannot leave local-only mode, blocking TTFSM for multi-user and persistent workflows.

---

## Goal

When the backend stack is deployed, the API Gateway serves a REST surface for project/mapping/schema CRUD and schema query that:

1. Matches the route paths and HTTP methods from the product spec's API map (Section 16) for the Phase 1 subset.
2. Returns domain objects in shapes that `HttpAdapter` (FS-055) can pass through directly to the UI.
3. Returns a standardized error envelope that `toAppError()` can normalize without special-casing.
4. Handles schema ingestion kickoff with an immediate metadata response and status polling for large schemas.
5. Provides DynamoDB-backed persistence with immediate read-after-write consistency.

---

## Assumptions

- DynamoDB is the primary data store for metadata; S3 stores bulk content (schema bodies, mapping configs) as documented in `specs/PRODUCT-TECHNICAL.md` Section 15.
- Phase 1 list endpoints return full arrays (no pagination) — matching the UI's current `ApiAdapter` contract.
- Auth/authz is out of scope for this spec. Future Cognito authorizer will be added at the API Gateway layer without changing Lambda handler logic.
- The mapping engine (`src/engine/`) is available for import in Lambda handlers for validation and coverage computation.
- Schemas with fewer than 500 fields are ingested inline; larger schemas require Step Function orchestration (async pattern).
- ID generation uses UUIDs (v4) generated server-side.
- Versioning for mappings is server-managed: `version` auto-increments on `updateMapping`.
- `HttpAdapter` (FS-055) is the expected consumer — response shapes must match `ui/src/lib/types/domain.ts` exactly.

---

## Current Context

### Existing Backend Surface

Only `src/lambda/ai/` handlers exist today (explain-rule, suggest-expression, auto-map). These establish conventions:
- `APIGatewayProxyEvent`/`APIGatewayProxyResult` interfaces (locally defined)
- `handler()` export as entry point
- `jsonResponse()` utility for status + JSON body
- `parseRequestBody()` for safe body parsing
- JSON error responses with `error` field

### Planned but Not Implemented

`src/lambda/` has no `schema/`, `mapping/`, `project/` subdirectories yet. The product spec (Section 14.3) defines the intended Lambda inventory.

### Data Model (Product Spec Section 15)

- **Projects** table: `projectId` PK, name, description, slug, schemaRefs, tags, timestamps
- **Mappings** table: `mappingId` PK, projectId, name, version, status, ruleCount, coverage, configS3Key, timestamps. GSI: `projectId-index`
- **SchemaMetadata** table: `schemaId` PK, name, format, fieldCount, origin, status, source, timestamps
- **SchemaNodes** table: `schemaId` PK, `path` SK — tree nodes for search
- S3: schema content (JSON/XSD bodies), mapping config JSON

### Error Model Target

The UI's `AppError` shape:
```typescript
interface AppError {
  message: string;
  code?: string;
  statusCode?: number;
  retryable: boolean;
}
```

`toAppError()` extracts `code`, `statusCode`, and `retryable` from error objects. The backend must return a JSON envelope that the HttpAdapter can throw as an Error with these enrichments.

### Relationship to FS-055

FS-055 defines the client (`HttpAdapter`). This spec (FS-057) defines the server. FS-055's endpoint mapping table is the contract:

| Method | HTTP | Path |
|---|---|---|
| `listSchemas()` | GET | `/schemas` |
| `getSchema(id)` | GET | `/schemas/:id` |
| `createSchema(input)` | POST | `/schemas` |
| `deleteSchema(id)` | DELETE | `/schemas/:id` |
| `querySchemaNodes(schemaId, query)` | POST | `/schemas/:id/query` |
| `listMappings(projectId)` | GET | `/projects/:projectId/mappings` |
| `getMapping(id)` | GET | `/mappings/:id` |
| `createMapping(input)` | POST | `/mappings` |
| `updateMapping(id, config)` | PUT | `/mappings/:id` |
| `deleteMapping(id)` | DELETE | `/mappings/:id` |
| `duplicateMapping(id, newName)` | POST | `/mappings/:id/duplicate` |
| `listMappingVersions(mappingId)` | GET | `/mappings/:mappingId/versions` |
| `getMappingVersion(mappingId, v)` | GET | `/mappings/:mappingId/versions/:version` |
| `saveMappingVersion(mappingId, entry)` | POST | `/mappings/:mappingId/versions` |
| `listProjects()` | GET | `/projects` |
| `getProject(id)` | GET | `/projects/:id` |
| `createProject(input)` | POST | `/projects` |
| `updateProject(id, input)` | PUT | `/projects/:id` |
| `deleteProject(id)` | DELETE | `/projects/:id` |

---

## Scope

### In Scope

- API Gateway resource/method definitions for all routes in the table above
- Lambda handler implementations for:
  - Project CRUD (5 handlers)
  - Mapping CRUD + duplicate (6 handlers)
  - Mapping version CRUD (3 handlers)
  - Schema create/get/list/delete (4 handlers)
  - Schema query (1 handler)
- Shared DynamoDB client utilities (get/put/query/delete/update)
- Shared S3 client utilities (putObject/getObject/deleteObject)
- Shared handler utilities: response builder, request parsing, input validation, error formatting
- Standardized error envelope returned by all handlers
- Schema ingestion: inline for small schemas, async kickoff + `status: 'ingesting'` for large
- `SchemaIngestStatus` lifecycle: `ingesting` → `ready` | `error`
- Mapping version auto-increment on update
- Optimistic concurrency on `updateMapping`: reject with 409 if request `version` does not match stored version
- Mapping `status` and `coverage` recomputation on update (using engine `validate()`)
- `ProjectDetail` response that embeds `mappings` array and `schemas` array (lightweight SchemaMetadata resolved from `schemaRefs`)
- Referential integrity enforcement: delete project fails if mappings exist; delete schema warns/blocks if referenced
- CORS headers on all responses

### Out of Scope

- AI endpoints (`/ai/*`) — separate spec
- GitHub endpoints (`/github/*`, `/schemas/link-cdm`, etc.) — separate spec
- Deployment endpoints (`/mappings/:id/deploy`, promote, rollback, diff) — separate spec
- Activity feed (`/activity`) — separate spec
- Preview (`/mappings/:id/preview`) — separate spec
- Template endpoints — deferred
- Authentication/authorization — future Cognito layer
- Pagination for list endpoints — future enhancement
- Full conflict resolution beyond version mismatch rejection — future spec
- Infrastructure-as-code (CDK/SAM/Terraform) — separate concern
- OpenSearch integration for schema query — Phase 1 uses DynamoDB scan with `contains` filter as initial implementation; OpenSearch upgrade is future

---

## Non-Goals

- This spec does not define the HttpAdapter client implementation — that is FS-055.
- This spec does not introduce multi-tenant isolation or user scoping.
- This spec does not define the full schema ingestion pipeline (embedding, vector indexing) — only the synchronous portion and async kickoff.
- This spec does not redesign the `ApiAdapter` interface or domain types.

---

## Relevant Areas

- `src/lambda/schema/` — new schema handler directory
- `src/lambda/mapping/` — new mapping handler directory
- `src/lambda/project/` — new project handler directory
- `src/lambda/shared/` — new shared utilities directory
- `src/engine/` — imported for validation/coverage in mapping update
- `src/engine/types/` — shared domain types
- `ui/src/lib/types/domain.ts` — response shape reference (read-only)
- `specs/PRODUCT-TECHNICAL.md` Sections 14.3, 15, 16 — architecture reference

---

## Dependencies / Blockers

- FS-055 (HttpAdapter) defines the client contract these endpoints must satisfy. Not a hard blocker but must stay aligned.
- DynamoDB tables and S3 bucket must be provisioned (can be local via DynamoDB Local + LocalStack for development).
- No blocking dependency on other specs.

---

## Constraints

- Response body shapes must exactly match types in `ui/src/lib/types/domain.ts` — the HttpAdapter passes them through without transformation.
- Error responses must follow the standardized envelope so `HttpAdapter` → `toAppError()` produces correct `AppError` instances.
- Lambda handlers must be individually deployable (one handler per Lambda function).
- Handlers must not import from `ui/` — only from `src/engine/`, `src/lib/`, and `src/lambda/shared/`.
- Must preserve engine purity: Lambda handlers call engine functions but engine remains free of I/O.
- All timestamps must be ISO 8601 strings.
- All IDs must be UUID v4 format.
- CORS must allow `*` origin in Phase 1 (tightened later).
- Maximum response time target: 500ms for CRUD operations; 2s for schema query.

---

## Proposed Behavior

### User Flow

Users interact with the UI which calls the HttpAdapter. The backend:
1. Receives API Gateway proxy events
2. Validates input
3. Performs DynamoDB/S3 operations
4. Returns typed domain responses

Users experience immediate saves and loads. Schema uploads of large files return metadata immediately with `status: 'ingesting'`; the UI polls or re-fetches to see `status: 'ready'`.

### System Behavior

#### Error Envelope

All error responses follow this shape:

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

Standard error codes:
| Code | HTTP Status | Retryable | When |
|------|-------------|-----------|------|
| `VALIDATION_ERROR` | 400 | false | Invalid input (missing required fields, bad format) |
| `RESOURCE_NOT_FOUND` | 404 | false | Entity does not exist |
| `CONFLICT` | 409 | false | Referential integrity violation or version mismatch (optimistic concurrency) |
| `INTERNAL_ERROR` | 500 | true | Unexpected server failure |
| `SERVICE_UNAVAILABLE` | 503 | true | DynamoDB/S3 throttling or transient failure |

#### Project CRUD

- **POST /projects**: Generate UUID `projectId`, set `createdAt`/`updatedAt`, write to DynamoDB. Return `ProjectMetadata`.
- **GET /projects**: Scan Projects table, compute `mappingCount` and `schemaCount` per project. Return `ProjectMetadata[]`.
- **GET /projects/:id**: Read project, query Mappings GSI for embedded `mappings` array, batch-get SchemaMetadata for each `schemaRef` to embed `schemas` array. Return `ProjectDetail`.
- **PUT /projects/:id**: Merge-update fields, update `updatedAt`. Return `ProjectMetadata`.
- **DELETE /projects/:id**: Check for existing mappings (query GSI). If mappings exist, return 409 CONFLICT. Otherwise delete.

#### Mapping CRUD

- **POST /mappings**: Generate UUID `mappingId`, set `version: 1`, compute initial `status`/`coverage`/`ruleCount` from input config (if rules provided), write metadata to DynamoDB + config to S3. Return `MappingMetadata`.
- **GET /mappings/:id**: Read metadata from DynamoDB + config from S3. Return `MappingConfig`.
- **PUT /mappings/:id**: Read existing metadata (404 if not found). Check `version` in request body matches stored version — if mismatch, return 409 CONFLICT (optimistic concurrency). Overwrite config in S3, increment `version`, recompute `status`/`coverage`/`ruleCount` using engine `validate()`, update DynamoDB. Return `MappingMetadata`.
- **DELETE /mappings/:id**: Delete from DynamoDB + S3.
- **POST /mappings/:id/duplicate**: Read existing, generate new `mappingId`, reset `version: 1`, set new `name` from body, write new. Return `MappingMetadata`.
- **GET /projects/:projectId/mappings**: Query Mappings `projectId-index`. Return `MappingMetadata[]`.

#### Mapping Versions

- **GET /mappings/:mappingId/versions**: Query MappingVersions by `mappingId`, sort descending. Return `MappingVersionEntry[]` (max 50).
- **GET /mappings/:mappingId/versions/:version**: Get specific version entry. Return `MappingVersionEntry`.
- **POST /mappings/:mappingId/versions**: Write version entry. Prune if > 50 entries. Return `void` (204).

#### Schema CRUD

- **POST /schemas**: Generate UUID `schemaId`. For small schemas (< 500 field count after quick parse): parse content, compute `fieldCount`, write metadata to DynamoDB + content to S3, set `status: 'ready'`. For large schemas: write metadata with `status: 'ingesting'`, store raw content in S3, kick off Step Function (or async process). Return `SchemaMetadata` in both cases.
- **GET /schemas**: Scan SchemaMetadata table. Return `SchemaMetadata[]`.
- **GET /schemas/:id**: Read metadata from DynamoDB + content from S3. Return `SchemaDetail`.
- **DELETE /schemas/:id**: Check if schema is referenced by any project's `schemaRefs`. If referenced, return 409 CONFLICT with referencing project IDs. Otherwise delete metadata from DynamoDB + content from S3.

#### Schema Query

- **POST /schemas/:id/query**: Phase 1 implementation queries `SchemaNodes` table with a `contains` filter on `path` and `fieldName` fields. Returns up to 50 `SchemaSearchResult` items. Future: OpenSearch vector + keyword hybrid search.

Request body:
```json
{ "query": "postal" }
```

Response:
```json
[
  {
    "path": "ShipmentOrder.Parties.Buyer.Address.PostalCode",
    "fieldName": "PostalCode",
    "type": "string",
    "description": "Buyer postal code"
  }
]
```

### Failure / Edge Behavior

| Scenario | Behavior |
|---|---|
| Missing required field in request body | 400 with `VALIDATION_ERROR` code listing missing fields |
| Malformed JSON body | 400 with `VALIDATION_ERROR` code: "Invalid JSON in request body" |
| Entity not found on get/update/delete | 404 with `RESOURCE_NOT_FOUND` code |
| Delete project that has mappings | 409 with `CONFLICT` code: "Cannot delete project with existing mappings" |
| Delete schema referenced by a project | 409 with `CONFLICT` code: "Schema is referenced by projects: [ids]" |
| DynamoDB throttle or transient error | 503 with `SERVICE_UNAVAILABLE`, `retryable: true` |
| Unhandled exception in handler | 500 with `INTERNAL_ERROR`, `retryable: true`, generic message (no stack traces) |
| Schema too large for inline ingestion | 200 with `status: 'ingesting'` in returned metadata — not an error |
| Schema query with no results | 200 with empty array `[]` |
| Duplicate mapping where source not found | 404 with `RESOURCE_NOT_FOUND` |
| Update mapping with stale version | 409 with `CONFLICT` code: "Version mismatch: expected N, got M" |

---

## Acceptance Examples

### AE-01 — Create and retrieve a project

**Given**
- Backend is running with empty tables

**When**
- POST `/projects` with `{ "name": "My Project", "description": "Test", "slug": "my-project", "tags": ["demo"] }`

**Then**
- Response 201 with body matching `ProjectMetadata` shape
- `projectId` is a valid UUID
- `mappingCount` is 0, `schemaCount` is 0
- GET `/projects/:id` returns `ProjectDetail` with empty `mappings` array and empty `schemas` array

### AE-02 — Create, update, and get a mapping

**Given**
- A project exists with `projectId: "proj-1"`

**When**
- POST `/mappings` with `{ "projectId": "proj-1", "name": "Invoice Map", "sourceSchemaRef": {...}, "targetSchemaRef": {...}, "rules": [] }`
- PUT `/mappings/:id` with full `MappingConfig` including 3 rules

**Then**
- Create returns `MappingMetadata` with `version: 1`, `ruleCount: 0`
- Update returns `MappingMetadata` with `version: 2`, `ruleCount: 3`
- GET `/mappings/:id` returns full `MappingConfig` with version 2

### AE-03 — Create schema with immediate ingestion

**Given**
- A valid JSON Schema with 50 fields

**When**
- POST `/schemas` with `{ "name": "Small Schema", "format": "json-schema", "origin": "local", "content": {...} }`

**Then**
- Response 201 with `SchemaMetadata` where `status: 'ready'`, `fieldCount: 50`
- GET `/schemas/:id` returns `SchemaDetail` with full content

### AE-04 — Create schema that triggers async ingestion

**Given**
- A JSON Schema with 1000+ fields

**When**
- POST `/schemas` with the large schema content

**Then**
- Response 201 with `SchemaMetadata` where `status: 'ingesting'`
- Subsequent GET `/schemas/:id` eventually returns `status: 'ready'` (after async processing completes)

### AE-05 — Error envelope on not-found

**Given**
- No project with id `"nonexistent-uuid"`

**When**
- GET `/projects/nonexistent-uuid`

**Then**
- Response 404 with body:
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Project with id 'nonexistent-uuid' not found",
    "statusCode": 404,
    "retryable": false
  }
}
```

### AE-06 — Referential integrity on project delete

**Given**
- Project `"proj-1"` exists with 2 mappings

**When**
- DELETE `/projects/proj-1`

**Then**
- Response 409 with body:
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Cannot delete project with existing mappings. Delete mappings first.",
    "statusCode": 409,
    "retryable": false
  }
}
```

### AE-07 — Duplicate mapping

**Given**
- Mapping `"map-1"` exists with name "Invoice Map", version 5, 10 rules

**When**
- POST `/mappings/map-1/duplicate` with `{ "name": "Invoice Map (Copy)" }`

**Then**
- Response 201 with new `MappingMetadata`: new `mappingId`, `name: "Invoice Map (Copy)"`, `version: 1`, `ruleCount: 10`
- Original mapping unchanged

### AE-08 — Schema query returns matching nodes

**Given**
- Schema `"schema-1"` has been ingested with nodes including paths containing "Address"

**When**
- POST `/schemas/schema-1/query` with `{ "query": "Address" }`

**Then**
- Response 200 with array of `SchemaSearchResult` matching the query
- Each result has `path`, `fieldName`, `type`, and optional `description`

### AE-09 — List mappings scoped to project

**Given**
- Project `"proj-1"` has 3 mappings
- Project `"proj-2"` has 1 mapping

**When**
- GET `/projects/proj-1/mappings`

**Then**
- Response 200 with exactly 3 `MappingMetadata` items, all with `projectId: "proj-1"`

### AE-10 — Mapping version lifecycle

**Given**
- Mapping `"map-1"` exists

**When**
- POST `/mappings/map-1/versions` with a `MappingVersionEntry` (version 1)
- POST `/mappings/map-1/versions` with a `MappingVersionEntry` (version 2)
- GET `/mappings/map-1/versions`

**Then**
- List returns 2 entries, sorted descending by version
- GET `/mappings/map-1/versions/1` returns the first entry

### AE-11 — CORS headers present on all responses

**Given**
- Any valid request to any endpoint

**When**
- Response is returned

**Then**
- Response includes `Access-Control-Allow-Origin: *`
- Response includes `Content-Type: application/json`

### AE-12 — Validation error for missing required field

**Given**
- POST `/projects` with `{ "description": "No name" }` (missing required `name`)

**When**
- Request is processed

**Then**
- Response 400 with:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required field: name",
    "statusCode": 400,
    "retryable": false
  }
}
```

### AE-13 — Optimistic concurrency on mapping update

**Given**
- Mapping `"map-1"` exists with `version: 3`

**When**
- PUT `/mappings/map-1` with `MappingConfig` where `version: 2` (stale)

**Then**
- Response 409 with:
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Version mismatch: expected 3, got 2. Reload and retry.",
    "statusCode": 409,
    "retryable": false
  }
}
```

### AE-14 — getProject embeds lightweight schema metadata

**Given**
- Project `"proj-1"` has `schemaRefs` containing 2 schema IDs
- Both schemas exist in SchemaMetadata table

**When**
- GET `/projects/proj-1`

**Then**
- Response 200 with `ProjectDetail` including:
  - `mappings: MappingMetadata[]` (as before)
  - `schemas: SchemaMetadata[]` with 2 entries containing `schemaId`, `name`, `format`, `origin`, `status`, `fieldCount`, `syncStatus` (no content)

---

## Open Questions

- none

### Resolved (Rev 2)

- `Q1.` **Reject with 409.** Client must delete mappings first. Silent cascade-delete is too destructive for a BA-facing system. No future cascade action planned for Phase 1.
- `Q2.` **Fail with 409.** Do not auto-remove references. Auto-removing would create hidden scope changes and potentially break mappings unexpectedly.
- `Q3.` **Quick structural pre-parse for field count.** Field count is the actual scaling dimension. File size is only a rough proxy. For JSON Schema: count `"properties"` keys recursively. For XSD: count `<xs:element` occurrences.
- `Q4.` **Yes — optimistic concurrency.** `updateMapping` returns 409 CONFLICT if the `version` in the request body does not match the current stored version. Phase 1 introduces real persistence and multi-session behavior; without this, one session can silently overwrite another.
- `Q5.` **Separate MappingVersions table.** Keeps access patterns cleaner and avoids overloading the hot metadata table. PK=`mappingId`, SK=`version` (Number).
- `Q6.` **Embed lightweight schema metadata.** `getProject` returns `ProjectDetail` with embedded `schemas: SchemaMetadata[]` (resolved from `schemaRefs`). Returning only IDs forces immediate fan-out calls and slows Project Overview. Does NOT include full schema content.

---

## Verification Strategy

- **Unit tests** per Lambda handler: mock DynamoDB/S3 clients, verify correct operations and response shapes. Cover AE-01 through AE-14.
- **Integration tests** against DynamoDB Local + LocalStack S3: verify end-to-end persistence and retrieval for all CRUD flows.
- **Error envelope tests**: verify every error code produces the standardized envelope shape.
- **TypeScript strict mode**: `tsc --noEmit` passes for all handler code.
- **Contract tests**: validate response JSON against domain type definitions (runtime schema validation or snapshot tests).
- **Performance**: CRUD operations complete within 500ms against DynamoDB Local in integration tests.

---

## Task Generation Notes

All tasks are `Agent: task` (backend work — no React components).

Suggested decomposition:

1. **Shared Lambda utilities** — response builder, request parser, input validator, error formatter, DynamoDB/S3 client wrappers. Foundation for all handlers.
2. **Project CRUD handlers** — 5 handlers with DynamoDB operations. Lower complexity, good starting point.
3. **Mapping CRUD handlers** — 6 handlers including S3 config storage and engine integration for status/coverage recomputation.
4. **Mapping version handlers** — 3 handlers for version history persistence.
5. **Schema CRUD handlers** — 4 handlers including async ingestion kickoff logic.
6. **Schema query handler** — 1 handler with DynamoDB scan/filter.
7. **Integration tests** — end-to-end tests against DynamoDB Local covering all endpoints.
8. **Architecture document** — create `forge/architecture/backend-api.md` and update INDEX.

Sequencing: T-01 first (shared utilities). T-02–T-06 can proceed in parallel after T-01. T-07 after T-02–T-06. T-08 can proceed any time.

---

## Change Log

- Rev 2 — 2026-05-14
  - Resolved all 6 open questions:
    - Q1: Confirmed reject-with-409 for project delete (no cascade)
    - Q2: Confirmed fail-with-409 for schema delete (no auto-removal of refs)
    - Q3: Confirmed quick pre-parse for field count estimation (not file size)
    - Q4: Added optimistic concurrency on updateMapping (409 on version mismatch)
    - Q5: Confirmed separate MappingVersions table
    - Q6: Added embedded schema metadata in getProject response
  - Added AE-13 (optimistic concurrency conflict) and AE-14 (embedded schema metadata)
  - Moved optimistic concurrency from Out of Scope to In Scope
  - Updated Proposed Behavior for mapping update and project get
- Rev 1 — 2026-05-14
  - Initial draft
