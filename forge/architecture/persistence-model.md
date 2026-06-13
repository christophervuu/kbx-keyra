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
- OpenSearch serving/indexing architecture (decommissioned for runtime retrieval in FS-091; retained only as historical context where referenced)
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
| `enrichmentSources` | — | List | Canonical enrichment input metadata list (`[{ alias, schemaId, required, description? }]`) |
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
| `dataFormat` | — | String | Canonical data format `json` / `xml` (separate from source derivation kind) |
| `sourceKind` | — | String | Canonical source kind `json_schema` / `xsd` / `inferred_from_json` / `inferred_from_xml` |
| `fieldCount` | — | Number | Total leaf fields |
| `origin` | — | String | Canonical `cdm` / `uploaded` / `inferred` (legacy `published|local` normalize to `uploaded`) |
| `ownership` | — | String | Canonical ownership `cdm` / `user` |
| `readonly` | — | Boolean | Ownership-aligned mutability marker (CDM defaults true) |
| `status` | — | String | Canonical readiness status `processing` / `ready` / `needs_review` / `error` (legacy `ingesting` normalizes to `processing`) |
| `reviewState` | — | String | Persisted review workflow state `not_required` / `unreviewed` / `partially_reviewed` / `reviewed` |
| `scope` | — | String | Compatibility-only metadata (`global` / `project`), non-authoritative for access |
| `description` | — | String | Optional description |
| `inferred` | — | Boolean | Whether schema was inferred from sample |
| `reviewedAt` | — | String | Optional ISO 8601 inferred-review completion timestamp |
| `reviewedBy` | — | String | Optional reviewer identity (auth-enabled environments) |
| `reviewIssues` | — | List | Optional deterministic issue summaries `[{ code, count, blocking }]` for inferred review UI |
| `inferenceIssueCounts` | — | Map | Optional deterministic issue count cache used to derive review summaries |
| `samplePayloadCount` | — | Number | Total persisted sample payload metadata records for the schema |
| `samplePayloads` | — | List | Sample payload metadata list (`sampleId`, `dataFormat`, `contentRef`, `usedForInference`, provenance, timestamps, compatibility) |
| `isCdm` | — | Boolean | Optional convenience flag aligned with canonical ownership |
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
| `embeddingText` | — | String | Natural-language description used for retrieval context and lexical enrichment |
| `embedding` | — | List<Number> (optional) | Optional per-node vector used for bounded in-Lambda rerank (FS-091 phase decision) |
| `fieldNameNormalized` | — | String (optional) | Normalized lexical retrieval signal |
| `pathTokens` | — | List<String> (optional) | Tokenized path/field lexical retrieval signal |

GSIs:
- `fieldName-index` — PK=`fieldName`, SK=`schemaId#path`
- `parentPath-index` — PK=`schemaId`, SK=`parentPath`

FS-091 retrieval control decisions:

- Canonical serving mode is `RAG_RETRIEVER=dynamodb`.
- Environment default caps are:
  - DEV: `lexicalCap=120`, `rerankCap=80`, `topK=12`, `contextExpansionCap=24`
  - QA: `lexicalCap=150`, `rerankCap=100`, `topK=15`, `contextExpansionCap=30`
  - PROD: `lexicalCap=180`, `rerankCap=120`, `topK=18`, `contextExpansionCap=36`
- Guardrail relationship: `rerankCap <= lexicalCap`, `topK << rerankCap`, bounded context expansion.
- Tuning scope decision (FS-091 Rev 2): global defaults with environment-level overrides only (no per-project/per-schema tuning presets).
- Shadow parity cutover gates: average `Jaccard@10 >= 0.70`, average `NDCG@10 delta >= -0.10`.

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
| `schemas/{schemaId}/samples/{sampleId}/payload.json` | Persisted JSON sample payload blob | `application/json` |
| `schemas/{schemaId}/samples/{sampleId}/payload.xml` | Persisted XML sample payload blob | `application/xml` |
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

## FS-089 schema metadata addendum

FS-089 formalizes schema metadata separation and readiness semantics used across Schema Library, Add Schema, Schema Detail, and Create Mapping selectors.

Canonical storage/read-model expectations:

- `dataFormat` and `sourceKind` are independent metadata facets:
  - `dataFormat` supports user-facing `JSON/XML` labeling.
  - `sourceKind` retains derivation/source lineage semantics.
- `ownership` and `readonly` are explicit fields; CDM defaults are `ownership=cdm` and `readonly=true`.
- inferred lineage readiness is explicit via `status=needs_review` and review transition metadata (`reviewedAt`, optional `reviewedBy`).

Input-kind persistence expectations:

- JSON Schema -> `dataFormat=json`, `sourceKind=json_schema`, `status=ready`.
- XSD -> `dataFormat=xml`, `sourceKind=xsd`, `status=ready`.
- sample JSON -> `dataFormat=json`, `sourceKind=inferred_from_json`, `status=needs_review`.
- sample XML -> `dataFormat=xml`, `sourceKind=inferred_from_xml`, `status=needs_review`.

Compatibility posture remains unchanged:

- legacy `scope` and origin aliases remain tolerated for transition, but canonical behavior is driven by ownership/readiness/source-kind fields.

Audit-confirmed unaffected ownership/index surfaces:

- `SchemaMetadata` PK (`schemaId`) and `SchemaNodes` PK/SK (`schemaId`, `path`) require no migration for cross-project shared access.
- Existing mapping `projectId-index` remains mapping-list access only and does not encode schema ownership.
- S3 schema storage and Dynamo retrieval records remain schemaId-scoped and require no FS-087 key/index migration.

## FS-090 inferred review + sample payload addendum

FS-090 extends schema persistence with explicit inferred-review state and first-class sample payload lifecycle metadata.

Canonical schema-review persistence requirements:

- `reviewState` is persisted canonical state (not derivation-only cache).
- `reviewedAt` is persisted when explicit mark-reviewed transition occurs.
- Deterministic inferred issue summaries may be persisted as:
  - `reviewIssues[]` summary rows (`code`, `count`, `blocking`)
  - `inferenceIssueCounts` map for deterministic aggregation replay.

Canonical sample payload persistence requirements:

- Initial inferred upload is persisted as first sample metadata with `usedForInference=true`.
- Added samples are persisted as metadata in `SchemaMetadata.samplePayloads[]` plus payload blob in S3.
- Metadata fields include:
  - `sampleId`, `schemaId`, `name`
  - `dataFormat`
  - `contentRef`
  - `usedForInference`
  - `source` (`initial_upload` | `added_sample`)
  - optional `sizeBytes`, optional `hash`, optional `summary`
  - optional `compatibility` (`unknown` | `compatible` | `mismatch`)
  - `createdAt`, optional `createdBy`

Mutation-gating persistence rule:

- Sample persistence and schema-content mutation are separate operations.
- Saving a sample does not mutate schema content/nodes unless explicit apply-all mutation path is requested.

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

## FS-092 Mapping Editor persistence addendum

FS-092 introduces additive persistence semantics for editor UX state while preserving revision/version compatibility.

Mapping-config additive editor preferences:

- `MappingConfig.config.editorPreferences` is the canonical additive container for mapping-level editor state.
- FS-092 in-use field:
  - `defaultSelectedSampleId?: string`
- Compatibility rule: persisted mapping configs without `editorPreferences` remain valid; readers must treat missing preference keys as unset defaults.

Selected-sample persistence layering (explicit precedence):

1. per-user last-selected sample for mapping (client preference storage)
2. mapping-level `defaultSelectedSampleId`
3. schema default sample (`usedForInference=true`)
4. none

Storage-boundary contract for FS-092 sample selection:

- Mapping-level default sample is persisted in mapping config (`config.editorPreferences.defaultSelectedSampleId`) and therefore participates in Save/revision/version snapshots.
- Per-user last-selected sample override is persisted as client preference state (`keyra:mappings:last-selected-sample:{mappingId}`) and is intentionally not part of backend mapping revisions.

Advanced Mode preference persistence:

- Advanced Mode visibility is persisted as per-user global client preference (`keyra:mappings:advanced-mode`).
- This preference is intentionally outside mapping config and revision/version persistence to avoid cross-user coupling.

Suggestion/workspace persistence boundary (FS-092 carries forward FS-048 model):

- Auto-map suggestion review state remains session-scoped client persistence (`keyra:automap-suggestions:{mappingId}`), section-keyed.
- Suggestion lifecycle states (`suggested|accepted|edited|dismissed|stale`) are review-state artifacts and are not persisted in mapping backend entities unless/when accepted edits produce rule changes.

No FS-092 table/key migration requirement:

- DynamoDB PK/SK models for `Mappings`, `MappingRevisions`, and `MappingVersions` are unchanged.
- S3 key layouts for mapping configs/revisions are unchanged.
- FS-092 persistence changes are additive payload fields + client preference keys only.

## FS-093 enrichment mapping persistence addendum

FS-093 introduces multi-input mapping persistence contracts for enrichment payloads.

Canonical enrichment definition model:

- Mapping records/config persist `enrichmentSources[]` as canonical enrichment declarations.
- Each canonical entry persists:
  - `alias` (stable expression identifier)
  - `schemaId`
  - `required` (default `true`)
  - optional `description`

Compatibility model:

- `config.externalSources` remains compatibility metadata for legacy and engine-reference continuity.
- Persistence/read normalization rules:
  - if `enrichmentSources` exists, it is canonical; `config.externalSources` is derived/unioned compatibility data.
  - if only legacy `config.externalSources` exists, mapping normalizes to schema-less legacy enrichment aliases.
  - if neither exists, enrichment model defaults to `enrichmentSources: []` and `config.externalSources: []` compatibility behavior.

Schema dependency persistence contract:

- Enrichment `schemaId` references are mapping dependencies equivalent to source/target references for usage analysis and delete guardrails.
- Schema delete guard checks must include enrichment references.

Preview/test sample persistence contract:

- Canonical preview/test persistence shape is versioned input sets:
  - `name`
  - `sourceData`
  - `externalSources`
  - optional `expectedOutput`
- Legacy single-source sample payloads migrate/normalize to versioned input sets with `externalSources: {}`.

Revision/version snapshot compatibility:

- Mapping revisions/versions continue to snapshot full config in S3; FS-093 enrichment fields are additive and included in those snapshots.
- No PK/SK table-key migration is required for FS-093; change is payload-shape evolution within existing records.

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
- Schema query serving path is DynamoDB-only post-FS-091: lexical candidate generation + optional bounded in-Lambda rerank + deterministic caps (max API result 50).
- All timestamps: ISO 8601 strings.
- All IDs: UUID v4.
- No multi-tenant isolation at table level for Phase 1.

---

## 10) Cross-References

- Product spec data model: `specs/PRODUCT-TECHNICAL.md` Section 15
- Backend API handlers: FS-057
- Revision/version model update: FS-063
- **Deployment subsystem**: `forge/architecture/deployments.md` (Deployments + DeploymentCurrent tables, snapshot S3 layout, staleness computation)
- Schema ingestion/retrieval pipeline: FS-056 baseline + FS-091 Dynamo-only retrieval cutover
- HttpAdapter (client): FS-055
- Phase 1 readiness baseline: `forge/architecture/phase-1-readiness.md`
- Project structure: `forge/architecture/project-structure.md`
