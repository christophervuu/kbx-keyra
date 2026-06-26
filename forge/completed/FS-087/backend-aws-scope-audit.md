# FS-087 Backend/AWS Schema Scope & Ownership Audit (T-02)

Date: 2026-06-08  
Spec: `forge/active/FS-087/spec.md` (Rev 2)  
Task: `forge/active/FS-087/tasks/T-02.md`

## Purpose

Audit backend handlers, persistence contracts, and AWS integration surfaces for schema scope and `projectId`-ownership assumptions.

Required coverage from T-02:
- API routes + Lambda handlers
- DynamoDB PK/SK + GSI patterns
- Lambda query/access patterns
- S3 key conventions
- OpenSearch filters
- GitHub integration behavior
- Deployment snapshot dependencies
- IAM/environment assumptions

---

## Executive Verdict

### Backend requirement check (FS-087 Rev 2, AE-12a)

**PASS (with remediation required):** Current schema persistence and retrieval paths do **not** require `projectId` ownership for cross-project schema availability at the storage/query layer.

- Schema metadata PK is `schemaId` (not `projectId`)
- Schema nodes PK is `schemaId` (not `projectId`)
- S3 schema content keys are `schemas/{schemaId}/...` (not project-scoped)
- OpenSearch query filter is `schemaId` term (not project-scoped)

However, scope/linkage contracts still encode legacy behavior and must be remediated:
- `scope` remains persisted and returned across schema handlers/types
- Project linkage remains `schemaRefs`-canonical (not `linkedSchemaIds`)
- Legacy origins (`local`, `published`) still appear in backend contracts

---

## Audit Findings Matrix

| ID | Area | Evidence | Coupling Type | Risk | Action | Follow-on |
|---|---|---|---|---|---|---|
| B01 | DynamoDB schema ownership | `SchemaMetadataTable` PK=`schemaId`; `SchemaNodesTable` PK=`schemaId`, SK=`path` (`template.yaml`) | **No `projectId` ownership coupling** | Low | **ignore** (retain architecture) | none |
| B02 | DynamoDB mapping/project linkage | `MappingsTable` has `projectId-index` for mappings only; projects store `schemaRefs[]` (`template.yaml`, `project/*`) | Linkage only (not schema ownership) | Medium (legacy model drift) | **migrate** to canonical `linkedSchemaIds` with read-time bridge | T-03/T-04/T-08 |
| B03 | Schema metadata contract | `src/lib/persistence/types.ts` includes `SchemaScope`, required `scope`, `SchemaOrigin='cdm|published|local'` | Legacy compatibility fields still authoritative | High | `scope`: **retain as metadata** (deprecated) then reduce behavioral use; origin: **rename** (`local/published -> uploaded` canonical) | T-03/T-08 |
| B04 | Schema metadata writes | `schema-metadata.create()` requires `input.scope`; `create-schema.ts` writes scope via `asSchemaScope`; `link-cdm-schema.ts` hardcodes `scope:'project'` | Scope write-path still active | High | **remove** behavioral dependence; optionally keep optional legacy field for compatibility only | T-03/T-04 |
| B05 | Schema list/get routes | `list-schemas.ts` scans full table; `get-schema.ts` gets by `schemaId`; neither filters by project | No ownership coupling in read path | Low | **ignore** for ownership; **remove** `scope` from authority in payload contract | T-04/T-08 |
| B06 | Schema query route | `query-schema-nodes.ts` validates schema by `schemaId`, OpenSearch via `searchSchemaNodes(schemaId, ...)`; degraded fallback query by PK `schemaId` | No project ownership coupling | Low | **ignore** for ownership | none |
| B07 | OpenSearch filter semantics | `src/lib/schema/opensearch/query.ts` adds `term: { schemaId }`; optional filters only `type/isArray/depth` | No project/scope filter coupling | Low | **ignore** | none |
| B08 | S3 schema keying | Schema content key is `schemas/{schemaId}/content.{json|xsd}` across handlers (`create/get/delete/link/sync`) | No project ownership coupling | Low | **ignore** | none |
| B09 | API route coupling | `/schemas` and `/schemas/{id}` are project-agnostic; `/schemas/cdm/link` requires `projectId` only to attach project link | Project linkage call required, but not schema ownership | Medium | **retain as metadata** (project-link operation); add canonical `linkedSchemaIds` behavior | T-04 |
| B10 | Project detail materialization | `project/get-project.ts` loads schemas from `project.schemaRefs` only | Relevance list coupling (expected), but legacy field canonical | Medium | **migrate** to `linkedSchemaIds` canonical + read-time normalize `schemaRefs` | T-03/T-04/T-08 |
| B11 | Unlink/delete guard semantics | `delete-schema.ts` blocks delete by project refs scan only; no in-project mapping dependency list | Missing FS-087 AE-05a hard-block semantics | High | **remove** old guard behavior and **migrate** to dependency-aware unlink/delete contracts | T-04 |
| B12 | GitHub integration metadata | `link-cdm-schema.ts` + `sync-cdm-schema.ts` use source repo/branch/path/sha; non-CDM path conventions are metadata only | No scope enforcement via GitHub path | Low | **retain as metadata** | none |
| B13 | Deployment snapshot dependency | `deployments.ts` stores mapping config snapshot + explicit schema refs/provenance; no scope field read | Scope-independent explicit-reference model already present | Low | **ignore** | none |
| B14 | IAM/env assumptions | Globals provide `SCHEMAS_TABLE`, `SCHEMA_NODES_TABLE`, `CONTENT_BUCKET`, `OPENSEARCH_ENDPOINT`; no scope/project ownership env gates | No infra-level ownership coupling | Low | **ignore** | none |
| B15 | Legacy origin taxonomy in deployment guard | `cdm-deploy-guard.ts` type includes `origin: 'cdm'|'published'|'local'` | Contract drift vs canonical `uploaded` | Medium | **rename** with compatibility normalization | T-03/T-08/T-09 |

---

## ProjectId Ownership Coupling Matrix (Required)

| Surface | Inspected | Finding |
|---|---|---|
| DynamoDB PK/SK | `SchemaMetadataTable`, `SchemaNodesTable` | **Unaffected** — schema data keyed by `schemaId`, not `projectId` |
| DynamoDB GSI | Schema tables + `MappingsTable projectId-index` | **Unaffected for schema ownership** — `projectId-index` is mapping list access only |
| Lambda query/access patterns | `schema/list/get/query/*`, `project/get-project.ts`, mapping schema-content loaders | **Mostly unaffected** — schema retrieval is id-based; project linkage still legacy canonical (`schemaRefs`) |
| API route behavior | `/schemas*`, `/projects/:id`, `/schemas/cdm/link` | **Partially changed required** — keep shared schema APIs; update project-link semantics to canonical `linkedSchemaIds` |
| S3 key conventions | `schemas/{schemaId}/...` | **Unaffected** |
| OpenSearch filters | term filter on `schemaId` only | **Unaffected** |

Conclusion: no key/index/query blocker that forces immediate one-time storage migration for shared access.

---

## AWS Area Status: Changed vs Unaffected (Required)

| AWS/Integration Area | Status | Rationale |
|---|---|---|
| DynamoDB table keys/indexes for schema access | **Unaffected** | Already schemaId-centric; no project ownership keys for schema entities |
| S3 schema object keying | **Unaffected** | Already schemaId-centric |
| OpenSearch schema search/index filtering | **Unaffected** | Filters by schemaId/type/depth/isArray only |
| GitHub CDM integration | **Changed (contract-level only)** | Keep existing path/repo metadata; remove any scope-authoritative assumptions in linked schema semantics |
| Deployment snapshots/runtime deploy model | **Unaffected** | Explicit schema refs/provenance already scope-independent |
| IAM / env variables / resource wiring | **Unaffected** | No scope- or project-ownership enforcement in env/resource model |

---

## Compatibility & Migration Strategy Recommendation

### Recommended strategy (AE-15)

**Read-time compatibility first; no mandatory one-time backfill for ownership safety.**

Why:
- Ownership safety is already provided by schemaId-based PK/S3/OpenSearch access paths.
- No schema access path inspected requires `projectId` key migration.

### Required compatibility remediations

1. **Project linkage canonicalization**
   - Canonical: `linkedSchemaIds: string[]`
   - Read-time normalize legacy `schemaRefs -> linkedSchemaIds`
   - New writes should stop relying on rich `schemaRefs` for linkage

2. **Origin canonicalization**
   - Canonical: `uploaded`
   - Read-time normalize `local` and `published` to `uploaded`
   - Do not persist new `origin: local`

3. **Scope de-authoritization**
   - Legacy `scope` may remain in records during transition
   - Scope must not drive access behavior in backend logic

4. **Unlink/delete dependency guard alignment**
   - Implement hard-block for unlink when active mappings in same project reference schema
   - Return dependent mapping IDs/details

---

## Architecture Documentation Drift Notes

Code currently diverges from some architecture text in `persistence-model.md` and `backend-api.md` regarding canonical schema origin/scope vocabulary and project linkage evolution.

No architecture docs updated in T-02 (audit task). Planned architecture update remains in T-10.

---

## Task Acceptance Check Closure (T-02)

- Backend/AWS scope assumption matrix complete and reviewable: **Yes**
- `projectId` ownership coupling matrix complete (PK/SK, GSI, Lambda queries, API routes, S3 keys, OpenSearch filters): **Yes**
- Every discovered dependency mapped to action (`remove|ignore|migrate|rename|retain as metadata`): **Yes**
- Audit explicitly states AWS infra changes required or not: **Yes** (infra-level key/index/resource changes not required)
