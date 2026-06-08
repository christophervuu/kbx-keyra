# Persistence Model

This document defines the Phase 1 persistence layer architecture for KeyRa — DynamoDB table schemas, S3 object layout, access patterns, and the `src/lib/persistence/` module structure.

This is the authoritative reference for storage model decisions. If other specs (FS-056, FS-057) conflict with this document, this document governs.

---

## 1) Purpose and Scope

Purpose:
- Define the DynamoDB table schemas and key structures for Phase 1 entities
- Establish S3 object layout conventions for bulk content
- Document all access patterns and their DynamoDB operation mappings
- Codify metadata-vs-blob storage rules
- Describe the versioning model for mappings
- Define the `src/lib/persistence/` module architecture

Scope:
- Projects, Mappings, SchemaMetadata, SchemaNodes, MappingRevisions, MappingVersions tables
- S3 key patterns for schema content and mapping configs
- Shared data-access module structure

Out of scope:
- Templates table (future spec)
- MappingMemory table (future AI/RAG spec)
- PromptRegistry table (already implemented in `src/lib/ai/prompt-registry.ts`)
- OpenSearch Serverless (covered by FS-056 architecture)
- IaC / CloudFormation / CDK definitions

Note: Deployments table is now in scope and documented in `forge/architecture/deployments.md`.

---

## 2) DynamoDB Table Definitions

### Projects

| Attribute | Key | Type | Description |
|-----------|-----|------|-------------|
| `projectId` | PK | String (UUID) | Unique project identifier |
| `name` | — | String | Display name |
| `description` | — | String | Project description |
| `slug` | — | String | URL-safe identifier |
| `linkedSchemaIds` | — | List | Canonical FS-087 project-linked schema IDs (`string[]`) |
| `schemaRefs` | — | List | Compatibility bridge `[{ schemaId, type, commitSha? }]` (non-authoritative) |
| `tags` | — | List | String tags for filtering |
| `createdAt` | — | String | ISO 8601 |
| `updatedAt` | — | String | ISO 8601 |

No GSIs. List operation uses Scan (acceptable for Phase 1 scale).

---

### Mappings

| Attribute | Key | Type | Description |
|-----------|-----|------|-------------|
| `mappingId` | PK | String (UUID) | Unique mapping identifier |
| `projectId` | — | String (UUID) | Parent project |
| `name` | — | String | Display name |
| `revision` | — | Number | Current latest saved revision number (monotonic per mapping) |
| `latestVersion` | — | Number \\| Null | Latest milestone version number; null when no version exists |
| `configHash` | — | String | SHA-256 hash of latest saved config (normalized for no-op detection) |
| `version` | — | Number | Legacy compatibility alias mirroring `revision` |
| `sourceSchemaId` | — | String (UUID) | Source schema reference |
| `targetSchemaId` | — | String (UUID) | Target schema reference |
| `status` | — | String | `draft` / `ready` / `has-errors` |
| `ruleCount` | — | Number | Count of mapping rules |
| `coverage` | — | Number | Percentage (0–100) of required target fields mapped |
| `configS3Key` | — | String | S3 key for full mapping config JSON |
| `createdAt` | — | String | ISO 8601 |
| `updatedAt` | — | String | ISO 8601 |

GSI: `projectId-index` — PK=`projectId`, projects all attributes. Used by `listByProject`.

---

### SchemaMetadata

| Attribute | Key | Type | Description |
|-----------|-----|------|-------------|
| `schemaId` | PK | String (UUID) | Unique schema identifier |
| `name` | — | String | Display name |
| `format` | — | String | `json-schema` / `xsd` |
| `fieldCount` | — | Number | Total leaf fields |
| `origin` | — | String | Canonical `cdm` / `uploaded` / `inferred` (legacy `published|local` normalize to `uploaded`) |
| `status` | — | String | `ingesting` / `ready` / `error` |
| `scope` | — | String | Compatibility-only metadata (`global` / `project`), non-authoritative for access |
| `description` | — | String | Optional description |
| `inferred` | — | Boolean | Whether schema was inferred from sample |
| `syncStatus` | — | String | Canonical `synced` / `update-available` / `sync-failed` (legacy values normalize at read boundaries) |
| `source` | — | Map | `{ type: 'upload' }` or `{ type: 'github', repo, branch, path, commitSha? }` |
| `createdAt` | — | String | ISO 8601 |
| `updatedAt` | — | String | ISO 8601 |

No GSIs. List operation uses Scan (acceptable for Phase 1 scale).

---

### SchemaNodes

| Attribute | Key | Type | Description |
|-----------|-----|------|-------------|
| `schemaId` | PK | String (UUID) | Parent schema |
| `path` | SK | String | Full dot-notation path |
| `fieldName` | — | String | Leaf field name |
| `type` | — | String | Data type |
| `description` | — | String | From schema or AI-generated |
| `depth` | — | Number | Nesting level |
| `isArray` | — | Boolean | Whether node is an array |
| `isRequired` | — | Boolean | Whether parent marks required |
| `parentPath` | — | String | Path of parent node |
| `childCount` | — | Number | Direct children count |
| `subtreeFieldCount` | — | Number | Total leaf fields in subtree |
| `embeddingText` | — | String | Natural-language description for embedding |

GSIs:
- `fieldName-index` — PK=`fieldName`, SK=`schemaId#path`
- `parentPath-index` — PK=`schemaId`, SK=`parentPath`

---

### MappingRevisions

| Attribute | Key | Type | Description |
|-----------|-----|------|-------------|
| `mappingId` | PK | String (UUID) | Parent mapping |
| `revision` | SK | Number | Revision number |
| `savedAt` | — | String | ISO 8601 |
| `savedBy` | — | String | User who saved |
| `ruleCount` | — | Number | Rule count at this version |
| `configS3Key` | — | String | S3 key for revision config snapshot |
| `configHash` | — | String | SHA-256 config hash used for no-op detection |

---

### MappingVersions

| Attribute | Key | Type | Description |
|-----------|-----|------|-------------|
| `mappingId` | PK | String (UUID) | Parent mapping |
| `version` | SK | Number | Milestone version number |
| `revisionNumber` | — | Number | Revision pointer this version references |
| `createdAt` | — | String | ISO 8601 |
| `createdBy` | — | String | User who created the version |

---

## 3) S3 Object Layout

Bucket: configured via `STORAGE_BUCKET` environment variable.

| Key Pattern | Content | Content-Type |
|-------------|---------|--------------|
| `schemas/{schemaId}/original.json` | Original JSON Schema file | `application/json` |
| `schemas/{schemaId}/original.xsd` | Original XSD file | `application/xml` |
| `schemas/{schemaId}/content.json` | Processed/normalized schema | `application/json` |
| `mappings/{mappingId}/config.json` | Current mapping config | `application/json` |
| `mappings/{mappingId}/revisions/r{N}.json` | Revision N config snapshot | `application/json` |

Rules:
- Schema content is always stored in S3 (may exceed DynamoDB's 400KB limit).
- Mapping configs are always stored in S3 (full `MappingConfig` with rules can be large).
- DynamoDB items reference S3 objects via `configS3Key` fields.
- Revision snapshots are immutable once written.
- Versions do not store separate config blobs; versions reference revisions by `revisionNumber`.

---

## FS-087 compatibility and ownership addendum

Canonical storage semantics after FS-087:

- Schema availability is shared across projects; schema ownership is not encoded by `projectId` in schema tables.
- Project relevance linkage is canonicalized via `linkedSchemaIds`; legacy `schemaRefs` remains a bridge for staged compatibility.
- Legacy schema fields remain permissible in persisted records only for compatibility:
  - `origin: local|published` normalize to canonical `uploaded` at read boundaries.
  - `scope` is non-authoritative metadata and must not drive access behavior.

Audit-confirmed unaffected ownership/index surfaces:

- `SchemaMetadata` PK (`schemaId`) and `SchemaNodes` PK/SK (`schemaId`, `path`) require no migration for cross-project shared access.
- Existing mapping `projectId-index` remains mapping-list access only and does not encode schema ownership.
- S3 and OpenSearch schema storage/indexing remain schemaId-scoped and require no FS-087 key/index migration.

## 4) Access Patterns

| Pattern | Operation | Table/Index | Method |
|---------|-----------|-------------|--------|
| List all projects | Scan | Projects | `projects.list()` |
| Get project by ID | GetItem | Projects | `projects.get(id)` |
| Create project | PutItem | Projects | `projects.create(input)` |
| Update project fields | UpdateItem | Projects | `projects.update(id, fields)` |
| Delete project | DeleteItem | Projects | `projects.delete(id)` |
| List mappings by project | Query | Mappings / `projectId-index` | `mappings.listByProject(projectId)` |
| Get mapping by ID | GetItem | Mappings | `mappings.get(id)` |
| Create mapping | PutItem + S3 Put | Mappings | `mappings.create(input)` |
| Update mapping (revision++) | UpdateItem + S3 Put | Mappings | `mappings.update(id, fields, config)` |
| Delete mapping | DeleteItem + S3 Delete | Mappings | `mappings.delete(id)` |
| Duplicate mapping | GetItem + PutItem + S3 | Mappings | `mappings.duplicate(id, name)` |
| List schemas | Scan | SchemaMetadata | `schemaMetadata.list()` |
| Get schema metadata | GetItem | SchemaMetadata | `schemaMetadata.get(id)` |
| Create schema metadata | PutItem | SchemaMetadata | `schemaMetadata.create(input)` |
| Update schema status | UpdateItem | SchemaMetadata | `schemaMetadata.updateStatus(id, status)` |
| Delete schema metadata | DeleteItem | SchemaMetadata | `schemaMetadata.delete(id)` |
| Batch write schema nodes | BatchWriteItem | SchemaNodes | `schemaNodes.batchWrite(id, nodes)` |
| List nodes by schema | Query (PK) | SchemaNodes | `schemaNodes.listBySchema(id)` |
| Query nodes (text search) | Query (PK) + Filter | SchemaNodes | `schemaNodes.queryContains(id, q)` |
| Delete all nodes for schema | Query + BatchWrite(Delete) | SchemaNodes | `schemaNodes.deleteBySchema(id)` |
| Save mapping revision | PutItem + S3 Put + no-op hash check + selective prune | MappingRevisions | `mappingRevisions.save(id, entry)` |
| List revisions (descending) | Query (desc) | MappingRevisions | `mappingRevisions.list(id)` |
| Get specific revision | GetItem | MappingRevisions | `mappingRevisions.get(id, revision)` |
| Get revision config | GetItem + S3 Get | MappingRevisions | `mappingRevisions.getConfig(id, revision)` |
| Create mapping version | PutItem | MappingVersions | `mappingVersions.create(id, { revisionNumber, createdBy })` |
| List versions (descending) | Query (desc) | MappingVersions | `mappingVersions.list(id)` |
| Get specific version | GetItem | MappingVersions | `mappingVersions.get(id, version)` |

---

## 5) Metadata vs Blob Rules

| Data Category | Storage | Rationale |
|---|---|---|
| Entity metadata (names, IDs, dates, counts, status) | DynamoDB | Small, queryable, indexed |
| Schema content (JSON/XSD body) | S3 | May exceed 400KB; not queried directly |
| Mapping config (rules, schema refs, options) | S3 | Can be large; only loaded on demand |
| Revision snapshots | S3 | Immutable bulk content, loaded by revision lookup |
| Schema tree nodes | DynamoDB | Individual items for query/filter support |
| Revision metadata (revision#, date, hash, S3 key) | DynamoDB | Small, queryable by mapping+revision |
| Version metadata (version#, revision pointer, date) | DynamoDB | Small, queryable by mapping+version |

Decision rule: if the data is < 1KB and needs to be queried/filtered, it goes in DynamoDB. If it's potentially large or only loaded as a whole, it goes in S3 with a key reference in DynamoDB.

---

## 6) Draft / Revision / Version Model

### Three-tier semantics

- **Draft**: client-side autosave only (not persisted in backend tables).
- **Revision**: explicit save checkpoint, stored as metadata in `MappingRevisions` + immutable snapshot in S3.
- **Version**: explicit milestone, stored in `MappingVersions`, referencing one revision via `revisionNumber`.

### Revision creation and no-op detection

- `PUT /mappings/:id` creates a new revision only when the config hash differs from the latest revision hash.
- Hash is SHA-256 over normalized config JSON (`computeConfigHash`), enabling no-op save suppression.
- On successful revision save:
  - `Mappings.revision` (and legacy `version`) increments
  - `Mappings.configHash` updates
  - snapshot written to `mappings/{mappingId}/revisions/r{N}.json`

### Version creation semantics

- `POST /mappings/:id/versions` creates a version row with monotonic `version` and pointer `revisionNumber`.
- Version creation may perform an implicit save first (creating a new revision) when unsaved changes exist.
- Versions do not duplicate config in S3; reads resolve through the pointed revision.

### Revision prune behavior

- Retain newest 50 **unversioned** revisions per mapping.
- Revisions referenced by any version are never pruned.
- Prune failures are logged and do not fail the save path.

---

## 7) Module Architecture

```
src/lib/persistence/
  index.ts              Barrel exports
  types.ts              DynamoDB item type definitions + input types + converters
  clients.ts            DynamoDB Document Client + S3 Client singletons
  config.ts             Table names, bucket name, S3 key builders
  hash.ts               Stable JSON SHA-256 hashing utility for config no-op detection
  projects.ts           Projects entity operations
  mappings.ts           Mappings entity operations (includes S3 config I/O)
  schema-metadata.ts    SchemaMetadata entity operations
  schema-nodes.ts       SchemaNodes batch/query operations
  mapping-revisions.ts  MappingRevisions operations (save/list/get/getConfig + selective prune)
  mapping-versions.ts   MappingVersions operations (create/list/get + compatibility shims)
  s3/
    index.ts            S3 helper barrel
    schema-content.ts   Schema original + processed content helpers
    mapping-config.ts   Mapping config put/get/delete helpers
```

Rules:
- No imports from `ui/` — persistence module is backend-only.
- Import from `src/engine/types/` is allowed for shared type definitions.
- Import from `src/lib/persistence/` by Lambda handlers and other `src/lib/` modules.
- Each entity module is independently importable.
- Clients are singletons (reused across Lambda invocations within the same container).
- Item types are supersets of domain types with internal-only fields (e.g., `configS3Key`). Explicit converter functions (`toProjectMetadata()`, `toMappingMetadata()`, etc.) strip internal fields to produce exact domain shapes.
- Entity delete methods are narrow (single entity only). Cascade orchestration (e.g., deleting version history when deleting a mapping) is the calling handler's responsibility.

---

## 8) Environment Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `AWS_REGION` | AWS region for SDK clients | `us-east-1` |
| `DYNAMODB_ENDPOINT` | Override endpoint (DynamoDB Local) | none (use AWS default) |
| `S3_ENDPOINT` | Override endpoint (LocalStack) | none (use AWS default) |
| `PROJECTS_TABLE` | Projects table name | `keyra-projects` |
| `MAPPINGS_TABLE` | Mappings table name | `keyra-mappings` |
| `SCHEMA_METADATA_TABLE` | SchemaMetadata table name | `keyra-schema-metadata` |
| `SCHEMA_NODES_TABLE` | SchemaNodes table name | `keyra-schema-nodes` |
| `MAPPING_REVISIONS_TABLE` | MappingRevisions table name | `keyra-mapping-revisions` |
| `MAPPING_VERSIONS_TABLE` | MappingVersions table name | `keyra-mapping-versions` |
| `STORAGE_BUCKET` | S3 bucket name | `keyra-storage` |

For local development, set `DYNAMODB_ENDPOINT=http://localhost:8000` and `S3_ENDPOINT=http://localhost:4566`.

---

## 9) Constraints and Limits

- DynamoDB item size limit: 400KB. All bulk content stored in S3.
- `BatchWriteItem` limit: 25 items per call. Module handles chunking.
- `BatchWriteItem` unprocessed items: retry with exponential backoff (3 attempts).
- Scan-based list operations: acceptable for Phase 1 scale (< 100 projects, < 500 schemas). Must be revisited if scale increases.
- Schema query (`queryContains`): uses DynamoDB Query + FilterExpression. Maximum 50 results. Future: OpenSearch for full-text and vector search.
- All timestamps: ISO 8601 strings.
- All IDs: UUID v4.
- No multi-tenant isolation at table level for Phase 1.

---

## 10) Cross-References

- Product spec data model: `specs/PRODUCT-TECHNICAL.md` Section 15
- Backend API handlers: FS-057
- Revision/version model update: FS-063
- **Deployment subsystem**: `forge/architecture/deployments.md` (Deployments + DeploymentCurrent tables, snapshot S3 layout, staleness computation)
- Schema ingestion pipeline: FS-056
- HttpAdapter (client): FS-055
- Phase 1 readiness baseline: `forge/architecture/phase-1-readiness.md`
- Project structure: `forge/architecture/project-structure.md`
