# SPEC

## Title

Phase 1 Persistent Storage Model — DynamoDB Tables and S3 Object Layout

---

## ID

FS-058

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

Rev: 1

---

## Summary

Define and implement the Phase 1 persistence layer for KeyRa — DynamoDB table definitions (Projects, Mappings, SchemaMetadata, SchemaNodes, MappingVersions), S3 object layout for schema content and mapping version payloads, and a typed data-access module that encapsulates all storage operations. This spec establishes the storage contract consumed by FS-057 (API handlers) and FS-056 (schema ingestion), providing clear separation between metadata (DynamoDB) and blob content (S3), versioning behavior for mapping saves, and the access patterns required by Phase 1 UI flows.

---

## Problem

Phase 0 persists all data in browser localStorage. Phase 1 requires a serverless backend, but no DynamoDB table schemas, S3 layout conventions, or shared data-access modules exist in the repository. FS-057 (API surface) and FS-056 (schema ingestion) both assume a persistence layer exists but neither owns the storage model definition. Without a standalone, well-typed persistence module, handlers will reimplement low-level DynamoDB/S3 operations ad-hoc, creating inconsistency and migration risk.

---

## Goal

After this spec is implemented:

1. All Phase 1 DynamoDB tables are defined with typed item schemas, key structures, and GSIs.
2. An S3 key-pattern convention is established for schema content and mapping version blobs.
3. A shared `src/lib/persistence/` module exports typed CRUD helpers for each entity — Projects, Mappings, SchemaMetadata, SchemaNodes, MappingVersions.
4. S3 helpers for schema content and mapping config read/write are exported.
5. All Phase 1 access patterns are covered by the module's public API.
6. Clear metadata-vs-blob rules prevent domain confusion.
7. Mapping version auto-increment behavior is encapsulated in the persistence module.
8. The module works against DynamoDB Local + LocalStack S3 for development.

---

## Assumptions

- DynamoDB tables use on-demand (pay-per-request) billing mode.
- One AWS account for Phase 1; no multi-tenant isolation at the table level.
- Table names are configurable via environment variables (e.g., `PROJECTS_TABLE`, `MAPPINGS_TABLE`) for environment portability.
- S3 bucket name is configurable via `STORAGE_BUCKET` environment variable.
- AWS SDK v3 is already available in the project (used by `src/lib/ai/`).
- No auth/identity context is required in persistence calls for Phase 1.
- `MappingVersions` is a separate DynamoDB table (decision made here; resolves FS-057 Q5).
- Items in DynamoDB respect the 400KB limit; bulk content goes to S3.

---

## Current Context

### Existing Backend Structure

Per `forge/architecture/project-structure.md`:
- `src/lambda/ai/` — AI handlers (only existing Lambda code)
- `src/lib/ai/` — Shared AI runtime (prompt-registry, model-client, etc.)

No persistence module exists. The AI runtime's `prompt-registry.ts` contains a DynamoDB adapter pattern that can serve as a convention reference:
- Typed client wrapper
- Configurable table name via env var
- In-memory caching (not needed for CRUD persistence, but similar structural patterns)

### Product Spec Data Model (Section 15)

The product spec defines 7 DynamoDB tables. This spec implements the Phase 1 subset:

| Table | Phase 1 | Notes |
|-------|---------|-------|
| Projects | Yes | |
| Mappings | Yes | |
| SchemaMetadata | Yes | |
| SchemaNodes | Yes | Consumed by FS-056 ingestion and FS-057 query |
| MappingVersions | Yes | New table (not in product spec as separate, but referenced) |
| Deployments | No | Future deployment spec |
| Templates | No | Future |
| MappingMemory | No | Future AI/RAG spec |
| PromptRegistry | No | Already implemented in `src/lib/ai/prompt-registry.ts` |

### Related In-Progress Specs

- **FS-055** (HttpAdapter) — client-side consumer; no storage concerns
- **FS-056** (Schema Ingestion) — writes SchemaMetadata + SchemaNodes + S3 content; will import from this module
- **FS-057** (Backend API Surface) — all handlers consume this module for DynamoDB/S3 operations

---

## Scope

### In Scope

1. **TypeScript item type definitions** for all 5 tables (Projects, Mappings, SchemaMetadata, SchemaNodes, MappingVersions)
2. **DynamoDB table configuration** — key schemas, GSI definitions, attribute types (as code constants/types, not IaC)
3. **S3 key-pattern constants** and helper functions
4. **Shared DynamoDB client wrapper** — configured from env vars, reusable across modules
5. **Shared S3 client wrapper** — configured from env vars
6. **Entity-specific data-access modules**:
   - `projects.ts` — create, get, list, update, delete
   - `mappings.ts` — create, get, list-by-project, update, delete, duplicate
   - `schema-metadata.ts` — create, get, list, update-status, delete
   - `schema-nodes.ts` — batch-write, query-by-schema, query-by-path-contains, delete-by-schema
   - `mapping-versions.ts` — save (with auto-prune at 50), list-by-mapping, get-by-version
7. **S3 content helpers**:
   - `schema-content.ts` — put-original, put-processed, get-content, delete-content
   - `mapping-config.ts` — put-config, get-config, delete-config, put-version-snapshot, get-version-snapshot
8. **Versioning logic** — mapping version auto-increment on update, version snapshot to S3
9. **Unit tests** for all data-access modules (mocked DynamoDB/S3 clients)
10. **Integration test harness** against DynamoDB Local + LocalStack S3

### Out of Scope

1. **Lambda handlers** — FS-057 owns handler implementation
2. **Schema parsing/ingestion logic** — FS-056 owns pipeline
3. **OpenSearch integration** — FS-056 owns indexing
4. **API Gateway / routing** — FS-057 owns
5. **IaC / CDK / CloudFormation templates** — separate infrastructure concern
6. **Authentication / authorization** — future spec
7. **Deployment tables** — future spec
8. **Optimistic concurrency / conflict detection** — future spec (simple last-write-wins for Phase 1)

---

## Non-Goals

- This spec does not define REST endpoints or request/response envelopes.
- This spec does not implement schema parsing or tree generation.
- This spec does not implement multi-region replication or cross-account access.
- This spec does not define table capacity planning or auto-scaling policies.

---

## Relevant Areas

- `src/lib/persistence/` (new — all persistence module code)
- `src/lib/persistence/types.ts` (new — DynamoDB item types)
- `src/lib/persistence/clients.ts` (new — DynamoDB/S3 client singletons)
- `src/lib/persistence/projects.ts` (new)
- `src/lib/persistence/mappings.ts` (new)
- `src/lib/persistence/schema-metadata.ts` (new)
- `src/lib/persistence/schema-nodes.ts` (new)
- `src/lib/persistence/mapping-versions.ts` (new)
- `src/lib/persistence/s3/schema-content.ts` (new)
- `src/lib/persistence/s3/mapping-config.ts` (new)
- `src/lib/persistence/index.ts` (new — barrel exports)
- `tests/lib/persistence/` (new — unit tests)
- `tests/integration/persistence/` (new — integration tests)
- `forge/architecture/persistence-model.md` (new)
- `forge/architecture/project-structure.md` (update)
- `forge/architecture/INDEX.md` (update)

---

## Dependencies / Blockers

- AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`) must be available as project dependencies (already present per FS-031).
- DynamoDB Local and LocalStack must be available for integration testing (developer setup responsibility; this spec documents the configuration).
- No hard dependency on other specs — FS-056/FS-057 depend on this spec, not the reverse.

---

## Constraints

- All item types must exactly align with `ui/src/lib/types/domain.ts` shapes so FS-057 handlers can pass persistence results through to the `HttpAdapter` without transformation.
- DynamoDB item sizes must stay under 400KB; any content exceeding this limit is stored in S3 with a key reference in the DynamoDB item.
- S3 key patterns must use the conventions from the product spec Section 15.2.
- All timestamp fields must be ISO 8601 strings.
- All IDs must be UUID v4 format (generated via `crypto.randomUUID()` or equivalent).
- Module must be free of UI imports — only `src/engine/types/` and `src/lib/` are allowed import targets.
- TypeScript strict mode.
- No runtime dependencies on Lambda/API Gateway types — the module is a pure persistence library.

---

## Proposed Behavior

### User Flow

This module has no direct user interaction. It is consumed by Lambda handlers (FS-057) and the ingestion pipeline (FS-056).

### System Behavior

#### DynamoDB Table Definitions

**Projects Table** (`PROJECTS_TABLE` env var)

| Attribute | Key | Type |
|-----------|-----|------|
| `projectId` | PK | String (UUID) |
| `name` | — | String |
| `description` | — | String |
| `slug` | — | String |
| `schemaRefs` | — | List of `{ schemaId, type, commitSha? }` |
| `tags` | — | List of Strings |
| `createdAt` | — | String (ISO 8601) |
| `updatedAt` | — | String (ISO 8601) |

No GSIs required for Phase 1 (full-table scan for list; scale is small).

---

**Mappings Table** (`MAPPINGS_TABLE` env var)

| Attribute | Key | Type |
|-----------|-----|------|
| `mappingId` | PK | String (UUID) |
| `projectId` | — | String (UUID) |
| `name` | — | String |
| `version` | — | Number |
| `sourceSchemaId` | — | String (UUID, optional) |
| `targetSchemaId` | — | String (UUID, optional) |
| `status` | — | String (`draft` / `ready` / `has-errors`) |
| `ruleCount` | — | Number |
| `coverage` | — | Number (0–100) |
| `configS3Key` | — | String |
| `createdAt` | — | String (ISO 8601) |
| `updatedAt` | — | String (ISO 8601) |

GSI: `projectId-index` — PK=`projectId`, projects all attributes.

---

**SchemaMetadata Table** (`SCHEMA_METADATA_TABLE` env var)

| Attribute | Key | Type |
|-----------|-----|------|
| `schemaId` | PK | String (UUID) |
| `name` | — | String |
| `format` | — | String (`json-schema` / `xsd`) |
| `fieldCount` | — | Number |
| `origin` | — | String (`cdm` / `published` / `local`) |
| `status` | — | String (`ingesting` / `ready` / `error`) |
| `scope` | — | String (`global` / `project`) |
| `description` | — | String (optional) |
| `inferred` | — | Boolean (optional) |
| `syncStatus` | — | String (`synced` / `not-synced` / `local-changes`) |
| `source` | — | Map (`{ type: 'upload' }` or `{ type: 'github', repo, branch, path, commitSha? }`) |
| `createdAt` | — | String (ISO 8601) |
| `updatedAt` | — | String (ISO 8601) |

No GSIs required for Phase 1 (full-table scan for list).

---

**SchemaNodes Table** (`SCHEMA_NODES_TABLE` env var)

| Attribute | Key | Type |
|-----------|-----|------|
| `schemaId` | PK | String (UUID) |
| `path` | SK | String (dot-notation) |
| `fieldName` | — | String |
| `type` | — | String |
| `description` | — | String |
| `depth` | — | Number |
| `isArray` | — | Boolean |
| `isRequired` | — | Boolean |
| `parentPath` | — | String |
| `childCount` | — | Number |
| `subtreeFieldCount` | — | Number |
| `embeddingText` | — | String |

GSIs:
- `fieldName-index` — PK=`fieldName`, SK=`schemaId#path`
- `parentPath-index` — PK=`schemaId`, SK=`parentPath`

---

**MappingVersions Table** (`MAPPING_VERSIONS_TABLE` env var)

| Attribute | Key | Type |
|-----------|-----|------|
| `mappingId` | PK | String (UUID) |
| `version` | SK | Number |
| `savedAt` | — | String (ISO 8601) |
| `savedBy` | — | String |
| `ruleCount` | — | Number |
| `configS3Key` | — | String (S3 key for version snapshot) |

---

#### S3 Object Layout

Bucket: `STORAGE_BUCKET` env var

| Key Pattern | Content | When Written |
|-------------|---------|--------------|
| `schemas/{schemaId}/original.{ext}` | Original uploaded file (`.json` / `.xsd`) | On schema create |
| `schemas/{schemaId}/content.json` | Processed/normalized schema content | After ingestion |
| `mappings/{mappingId}/config.json` | Current mapping config (full `MappingConfig`) | On create/update |
| `mappings/{mappingId}/versions/v{N}.json` | Full `MappingConfig` snapshot at version N | On version save |

---

#### Access Pattern Coverage

| Access Pattern | DynamoDB Operation | Module Method |
|---|---|---|
| List all projects | `Scan` on Projects | `projects.list()` |
| Get single project | `GetItem` on Projects by `projectId` | `projects.get(id)` |
| Create project | `PutItem` on Projects | `projects.create(input)` |
| Update project | `UpdateItem` on Projects | `projects.update(id, fields)` |
| Delete project | `DeleteItem` on Projects | `projects.delete(id)` |
| List mappings by project | `Query` on `projectId-index` | `mappings.listByProject(projectId)` |
| Get mapping metadata | `GetItem` on Mappings by `mappingId` | `mappings.get(id)` |
| Create mapping | `PutItem` on Mappings + S3 put | `mappings.create(input)` |
| Update mapping | `UpdateItem` on Mappings + S3 put | `mappings.update(id, fields, config)` |
| Delete mapping | `DeleteItem` on Mappings + S3 delete | `mappings.delete(id)` |
| Save mapping version | `PutItem` on MappingVersions + S3 put + prune | `mappingVersions.save(mappingId, entry)` |
| List mapping versions | `Query` on MappingVersions, descending | `mappingVersions.list(mappingId)` |
| Get specific version | `GetItem` on MappingVersions | `mappingVersions.get(mappingId, version)` |
| Get schema metadata | `GetItem` on SchemaMetadata | `schemaMetadata.get(id)` |
| List all schemas | `Scan` on SchemaMetadata | `schemaMetadata.list()` |
| Create schema metadata | `PutItem` on SchemaMetadata | `schemaMetadata.create(input)` |
| Update schema status | `UpdateItem` on SchemaMetadata | `schemaMetadata.updateStatus(id, status, fieldCount?)` |
| Delete schema metadata | `DeleteItem` on SchemaMetadata | `schemaMetadata.delete(id)` |
| Batch write schema nodes | `BatchWriteItem` (25/batch) | `schemaNodes.batchWrite(schemaId, nodes[])` |
| Query nodes by schema | `Query` by `schemaId` PK | `schemaNodes.listBySchema(schemaId)` |
| Query nodes containing string | `Scan` with `contains` filter | `schemaNodes.queryContains(schemaId, query)` |
| Delete all nodes for schema | `Query` + batch `DeleteItem` | `schemaNodes.deleteBySchema(schemaId)` |

---

#### Metadata vs Blob Rules

| Data Category | Storage | Rule |
|---|---|---|
| Entity metadata (names, dates, IDs, counts, status) | DynamoDB | Always in DynamoDB item |
| Schema content (JSON/XSD body) | S3 | Always in S3 (may exceed 400KB) |
| Mapping config (rules, schema refs, options) | S3 | Always in S3 via `configS3Key` reference |
| Version snapshots (full config at point in time) | S3 | Always in S3 |
| Schema tree nodes (path, type, required, etc.) | DynamoDB | Individual items for query support |
| Mapping version metadata (version#, date, ruleCount) | DynamoDB | Small records, query-optimized |

---

#### Versioning Behavior

1. **Mapping version increment:** When `mappings.update()` is called, the module increments `version` by 1 atomically using DynamoDB `UpdateExpression` with `SET version = version + :one`.
2. **Version snapshot:** The caller (FS-057 handler) decides whether to also call `mappingVersions.save()` — the persistence module provides the operation but does not force it on every update.
3. **Version prune:** `mappingVersions.save()` queries existing versions for the mapping. If count exceeds 50, the oldest entries (by version number) are deleted from DynamoDB and their S3 snapshots are removed.
4. **MappingVersionEntry.config:** Stored entirely in S3 at `mappings/{mappingId}/versions/v{N}.json`. The DynamoDB item stores a `configS3Key` reference.
5. **Version identity:** Numeric, monotonically increasing per mapping. Never reused after deletion.

### Failure / Edge Behavior

| Scenario | Behavior |
|---|---|
| DynamoDB `ConditionalCheckFailedException` on create (duplicate ID) | Retry with new UUID (extremely unlikely with v4 UUID) |
| S3 `PutObject` fails after DynamoDB write | Throw — caller (handler) should return 503. No automatic rollback (eventual consistency acceptable for Phase 1). |
| `BatchWriteItem` partial failure | Retry unprocessed items with exponential backoff (max 3 retries). Throw after exhaustion. |
| `Get` on non-existent item | Return `null` — caller decides whether to throw 404. |
| `Delete` on non-existent item | No-op (DynamoDB `DeleteItem` is idempotent). |
| Version prune fails | Log warning, do not fail the save operation. |
| S3 `GetObject` for schema content returns `NoSuchKey` | Return `null` — caller decides error handling. |

---

## Acceptance Examples

### AE-01 — Create and retrieve a project via persistence module

**Given**
- DynamoDB Projects table is empty

**When**
- `projects.create({ name: "Test Project", description: "Desc", slug: "test-project", schemaRefs: [], tags: ["demo"] })` is called

**Then**
- Returns a `ProjectItem` with generated UUID `projectId`, `createdAt`/`updatedAt` set to current ISO timestamp
- `projects.get(projectId)` returns the same item
- `projects.list()` includes the item

### AE-02 — Create mapping with S3 config storage

**Given**
- A project exists with `projectId: "proj-1"`

**When**
- `mappings.create({ projectId: "proj-1", name: "Invoice Map", sourceSchemaId: "s-1", targetSchemaId: "s-2", config: { rules: [], config: {...} } })` is called

**Then**
- Returns `MappingItem` with generated `mappingId`, `version: 1`, `configS3Key: "mappings/{mappingId}/config.json"`
- S3 object at that key contains the full `MappingConfig` JSON
- `mappings.listByProject("proj-1")` includes the mapping

### AE-03 — Update mapping auto-increments version

**Given**
- Mapping `"map-1"` exists with `version: 3`

**When**
- `mappings.update("map-1", { ruleCount: 5, status: "ready", coverage: 80 }, newConfig)` is called

**Then**
- DynamoDB item has `version: 4`, `updatedAt` refreshed
- S3 config object is overwritten with `newConfig`
- Returned metadata reflects `version: 4`

### AE-04 — Save mapping version with S3 snapshot

**Given**
- Mapping `"map-1"` exists

**When**
- `mappingVersions.save("map-1", { version: 4, savedBy: "user-1", ruleCount: 5, config: fullMappingConfig })` is called

**Then**
- DynamoDB `MappingVersions` item created: `mappingId="map-1"`, `version=4`, `savedAt` set, `configS3Key="mappings/map-1/versions/v4.json"`
- S3 object at that key contains `fullMappingConfig` JSON
- `mappingVersions.list("map-1")` includes the entry

### AE-05 — Version prune at 50

**Given**
- Mapping `"map-1"` already has 50 version entries (versions 1–50)

**When**
- `mappingVersions.save("map-1", { version: 51, ... })` is called

**Then**
- Version 51 is saved successfully
- Version 1 (oldest) is deleted from DynamoDB and its S3 snapshot removed
- `mappingVersions.list("map-1")` returns 50 entries (versions 2–51)

### AE-06 — Batch write schema nodes

**Given**
- Schema `"schema-1"` has been created in SchemaMetadata

**When**
- `schemaNodes.batchWrite("schema-1", nodes)` is called with 75 SchemaNode items

**Then**
- All 75 items are written (3 BatchWriteItem calls of 25 each)
- `schemaNodes.listBySchema("schema-1")` returns all 75 nodes

### AE-07 — Query schema nodes with contains filter

**Given**
- Schema `"schema-1"` has nodes with paths including "Address.PostalCode", "Address.City", "Name.FirstName"

**When**
- `schemaNodes.queryContains("schema-1", "Address")` is called

**Then**
- Returns nodes with "Address" in their `path` or `fieldName`
- Maximum 50 results returned

### AE-08 — Schema content S3 round-trip

**Given**
- Schema `"schema-1"` metadata exists

**When**
- `schemaContent.putOriginal("schema-1", rawContent, "json")` stores the original
- `schemaContent.putProcessed("schema-1", processedContent)` stores processed content
- `schemaContent.get("schema-1")` is called

**Then**
- Returns the processed content JSON
- `schemaContent.getOriginal("schema-1")` returns the raw content

### AE-09 — Delete mapping cascades to S3

**Given**
- Mapping `"map-1"` exists with config in S3 and 3 version snapshots

**When**
- `mappings.delete("map-1")` is called

**Then**
- DynamoDB Mappings item is deleted
- S3 object `mappings/map-1/config.json` is deleted
- (Version cleanup is caller's responsibility — not auto-cascaded in delete)

### AE-10 — Get non-existent item returns null

**Given**
- No project with id `"nonexistent"`

**When**
- `projects.get("nonexistent")` is called

**Then**
- Returns `null` (not an error)

### AE-11 — Environment variable configuration

**Given**
- Environment variables set: `PROJECTS_TABLE=keyra-projects-dev`, `STORAGE_BUCKET=keyra-storage-dev`

**When**
- The persistence module initializes

**Then**
- All DynamoDB operations target `keyra-projects-dev` table
- All S3 operations target `keyra-storage-dev` bucket

### AE-12 — Type alignment with domain.ts

**Given**
- `ProjectItem` type from persistence module

**When**
- Compared to `Project` from `ui/src/lib/types/domain.ts`

**Then**
- All fields present in `Project` are present in `ProjectItem` with compatible types
- Persistence module exports a `toProjectMetadata(item)` converter that produces the exact `ProjectMetadata` shape

---

## Open Questions

- none

All questions resolved in Rev 1 refinement (see Change Log).

---

## Verification Strategy

- **Unit tests** for each data-access module: mock `@aws-sdk/lib-dynamodb` `DynamoDBDocumentClient` commands and `@aws-sdk/client-s3` `S3Client` commands. Verify correct command parameters, marshalling, and return value transformation. Cover AE-01 through AE-12.
- **Integration tests** against DynamoDB Local + LocalStack S3: create tables programmatically, run full CRUD cycles, verify persistence. Cover AE-01 through AE-09.
- **Type compatibility tests**: compile-time assertions that persistence item types satisfy domain type contracts (using `satisfies` or conditional type checks).
- **TypeScript strict mode**: `tsc --noEmit` passes for all persistence module code.

---

## Task Generation Notes

All tasks are `Agent: task` (pure backend/infrastructure work — no React components).

Suggested decomposition:

1. **T-01: Persistence types and client setup** — item type definitions, DynamoDB/S3 client singletons, env var configuration, table name constants. Foundation for everything.
2. **T-02: Projects data-access module** — `projects.ts` with create/get/list/update/delete. Lower complexity, validates patterns.
3. **T-03: Mappings data-access module** — `mappings.ts` with create/get/list-by-project/update/delete/duplicate. Includes version auto-increment and S3 config storage.
4. **T-04: SchemaMetadata data-access module** — `schema-metadata.ts` with create/get/list/update-status/delete.
5. **T-05: SchemaNodes data-access module** — `schema-nodes.ts` with batch-write/list-by-schema/query-contains/delete-by-schema. Handles BatchWriteItem batching and retries.
6. **T-06: MappingVersions data-access module** — `mapping-versions.ts` with save (including prune at 50)/list/get. S3 version snapshot storage.
7. **T-07: S3 content helpers** — `s3/schema-content.ts` and `s3/mapping-config.ts`. Pure S3 operations with typed wrappers.
8. **T-08: Integration test harness and tests** — docker-compose setup, table creation scripts, integration tests covering all modules against real DynamoDB Local + LocalStack.
9. **T-09: Architecture document and project-structure update** — create `forge/architecture/persistence-model.md`, update `INDEX.md` and `project-structure.md`.

Sequencing: T-01 first. T-02 through T-07 can proceed in parallel after T-01. T-08 after T-02–T-07. T-09 can proceed any time after T-01.

---

## Change Log

- Rev 1 — 2026-05-14
  - Initial draft
  - Q1 resolved: export explicit converters (`toProjectMetadata(item)`, etc.) that strip internal fields. Item types are supersets of domain types with internal-only additions like `configS3Key`.
  - Q2 resolved: `mappings.delete()` does NOT cascade. Handler orchestrates version/snapshot cleanup — keeps persistence layer narrow and predictable.
  - Q3 resolved: `schemaNodes.queryContains()` uses Query on PK (`schemaId`) + FilterExpression with `contains`. No full-table Scan.
  - Q4 resolved: provide `docker-compose.test.yml` for DynamoDB Local + LocalStack; document it; do not require in CI initially.
