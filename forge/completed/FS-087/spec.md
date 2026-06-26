# SPEC

## Title

Simplify KeyRa schema scope into a shared Schema Library with project-linked schemas

---

## ID

FS-087

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-07  
Last Updated: 2026-06-08  
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

KeyRa currently models schemas with a product-visible scope distinction (global vs project/local), which is creating unnecessary user and implementation complexity. This spec replaces that model with a shared Schema Library where all schemas are available to all projects, while projects maintain linked schema references for relevance and filtering. The change includes a required cross-stack audit (UI, adapters, backend Lambdas, persistence, AWS integrations, GitHub sync, and deployments) and a compatibility strategy so legacy scope fields do not continue to drive user-facing access behavior.

---

## Problem

Current schema behavior and UI language expose scope/access concepts (Global, Project-Level, Local) that users must understand even though the practical product need is simple reuse: schemas should be discoverable and selectable across projects.

Repository context confirms scope assumptions are embedded across the stack:
- UI domain/API types still define `SchemaScope = 'global' | 'project'` and `SchemaMetadata.scope`.
- Local storage adapter defaults schema scope to `global` and supports updating scope.
- Backend schema metadata models and Lambda handlers include `scope`, with create/link flows explicitly setting it.
- Architecture docs and project-structure entries still reference scope badges and scope-based filters.

This increases cognitive load, adds branching paths in upload/link/mapping flows, and creates migration risk as backend architecture evolves.

---

## Goal

Adopt a single schema availability model:
- all schemas live in one shared Schema Library,
- every project can access every schema,
- projects retain linked schema lists for project relevance,
- mappings continue to store explicit source/target schema references.

The resulting product language and behavior must remove schema access-scope as a user concept while preserving origin/format/sync distinctions and backward compatibility during transition.

---

## Assumptions

- Existing schema IDs remain stable and remain the canonical mapping reference target.
- Canonical project linkage target is `linkedSchemaIds: string[]`, with read-time compatibility for legacy `schemaRefs`.
- Current backend route surface remains the implementation boundary (no net-new auth/tenancy work in this spec).
- CDM schemas remain read-only by origin and continue using existing CDM GitHub integration contracts.
- Runtime deployment snapshots should continue to rely on explicit schema IDs and artifact provenance, not schema scope.
- Backend impact must be assumed possible until audit proves otherwise; no pre-emptive backend unaffected assumption is allowed.

---

## Current Context

Grounded repository findings relevant to this change:
- Active specs include FS-086 (Project Overview simplification) and other deployment specs; no active spec currently covers full schema scope-model simplification.
- `forge/architecture/INDEX.md` references schema-related coverage in `ui-application.md`, `backend-api.md`, `persistence-model.md`, `schema-ingestion.md`, `deployments.md`, and `infrastructure.md`.
- `ui/src/lib/types/domain.ts` and `src/lib/persistence/types.ts` both still expose schema scope types and `SchemaMetadata.scope`.
- `src/lambda/schema/create-schema.ts`, `list-schemas.ts`, `get-schema.ts`, `link-cdm-schema.ts`, and `project/get-project.ts` still use scope-bearing schema metadata payloads.
- Project linkage currently uses `project.schemaRefs` and project detail materialization loads schemas through those refs; this spec moves canonical linkage toward `linkedSchemaIds` with compatibility normalization.
- Project structure docs still describe scope badges, scope filters, and scope-specific language in schema UI surfaces.

---

## Scope

### In Scope

- Cross-stack audit of schema scope assumptions before implementation (frontend, adapters/types, backend Lambdas/APIs, DynamoDB/S3/OpenSearch/GitHub/deployments/IAM config assumptions).
- Replace user-facing scope model with shared Schema Library + linked schemas semantics.
- Update shared types/contracts so schema scope no longer drives availability rules.
- Preserve and normalize project-linked schema references as the relevance model.
- Update Add Schema / Link Schema / Upload Schema / Create Mapping behaviors to shared-library semantics.
- Ensure mapping source/target schema references remain explicit and stable.
- Add compatibility normalization/migration handling for legacy localStorage/backend records containing scope fields.
- Enforce unlink guardrail: hard-block unlink when active mappings in the same project reference that schema.
- Update architecture docs for affected existing subsystems.

### Out of Scope

- DSL grammar/function behavior changes unrelated to schema reference resolution.
- Permissions/authorization/tenancy models.
- Full redesign of Schema Library beyond required model/label/flow changes.
- Replacing CDM/non-CDM repository model.
- Introducing entirely new GitHub sync capabilities that do not already exist.

---

## Non-Goals

- Remove CDM origin.
- Remove uploaded schema concept.
- Remove schema-project linking.
- Remove mapping `sourceSchemaRef` / `targetSchemaRef` semantics.
- Redesign unrelated dashboard/deployment UX.
- Re-architect mapping engine internals.

---

## Relevant Areas

- `ui/src/lib/types/domain.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/local-storage-adapter.ts`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/features/schemas/**/*`
- `ui/src/features/projects/**/*`
- `ui/src/features/mappings/**/*` (schema selectors and mapping creation flows)
- `src/lib/persistence/types.ts`
- `src/lib/persistence/schema-metadata.ts`
- `src/lib/persistence/projects.ts`
- `src/lambda/schema/create-schema.ts`
- `src/lambda/schema/list-schemas.ts`
- `src/lambda/schema/get-schema.ts`
- `src/lambda/schema/delete-schema.ts`
- `src/lambda/schema/link-cdm-schema.ts`
- `src/lambda/project/get-project.ts`
- `src/lambda/mapping/create-mapping.ts` ?
- `src/lambda/mapping/update-mapping.ts` ?
- `forge/architecture/ui-application.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/persistence-model.md`
- `forge/architecture/schema-ingestion.md`
- `forge/architecture/deployments.md` ?
- `forge/architecture/infrastructure.md` ?

---

## Dependencies / Blockers

- Depends on completion of Phase 1 audit tasks to finalize implementation deltas safely.
- Requires agreement on canonical legacy-to-new origin mapping (especially `local` / project-scoped historical records).
- Requires decision on whether `project.schemaRefs` remains canonical or a new `linkedSchemaIds` field is introduced/adapted.

---

## Constraints

- Must maintain backward compatibility for existing records during rollout.
- Must avoid breaking mapping resolution for existing mappings.
- Must preserve CDM read-only behavior and sync status semantics.
- Must keep API contracts stable enough for staged UI/backend rollout where feasible.
- Must not rely on scope for access control semantics in UI or backend behavior after migration.
- Must not persist new schema records with `origin: local` after rollout; canonical migrated value is `uploaded`.

---

## Proposed Behavior

### User Flow

1. User opens Schema Library and sees all schemas in KeyRa.
2. User opens a project and sees project-linked schemas as a relevance list (not availability boundary).
3. User chooses Add Schema from project:
   - can link existing schemas from shared library,
   - or upload new schema which is created in shared library and auto-linked to current project.
4. User creates/edits mapping and can select source/target from all schemas, with linked schemas prioritized/highlighted.
5. If user selects non-linked schema in mapping flow, system can link it to the project automatically (or prompt, per final UX task decision).
6. Unlinking a schema from a project removes relevance link only; schema remains in library.
7. If active mappings in that project reference the schema, unlink is hard-blocked and UI shows dependent mappings that must be updated or removed first.

### System Behavior

- Schema availability becomes global/shared by default; project linkage is metadata for relevance.
- Project records use `linkedSchemaIds: string[]` as canonical linkage.
- Legacy `schemaRefs` are normalized to `linkedSchemaIds` at read time for compatibility; new writes should avoid rich `schemaRefs` for project linkage except temporary bridge needs.
- Schema metadata model retains origin (`cdm|uploaded|inferred`) and format (`json|xml|xsd`) without exposing access scope.
- Legacy scope-bearing records are normalized at read time (Phase 0 localStorage + backend compatibility path) so scope does not affect behavior.
- Legacy origin normalization defaults: `local -> uploaded`, `cdm -> cdm`, `inferred -> inferred` (when detectable), `published -> uploaded` (or synced-uploaded equivalent based on metadata).
- `local` is retained only as read-time compatibility alias and must not be used for new persisted records post-change.
- API responses no longer require clients to branch on global/project/local access scope.
- Mappings keep explicit `sourceSchemaRef` / `targetSchemaRef` IDs unchanged.
- Deployment snapshot behavior remains schema-ID/provenance driven; no access-scope dependency.
- Existing GitHub non-CDM path conventions (including project-oriented folder structures) may remain as internal source/storage metadata and must not determine schema access scope.
- Default rollout strategy is read-time compatibility first; one-time migration/backfill is required only if audit identifies key/index/query constraints that make shared access unsafe.

### Failure / Edge Behavior

- If a project has zero linked schemas, project linked-schema surfaces show empty state with Add Schema CTA.
- If legacy records have malformed or unknown scope values, normalization treats schema as shared and logs/flags migration diagnostics where available.
- If unlink is attempted for schema currently used by one or more mappings in that project, UI/backend hard-blocks unlink and returns dependent mapping references.
- If backend/audit finds no required AWS infrastructure changes, results are documented explicitly rather than assumed.

---

## Acceptance Examples

### AE-01 — Schema Library lists all schemas

**Given**
- schemas exist with mixed historical scope values

**When**
- user opens Schema Library

**Then**
- all schemas are visible in one shared list
- no scope-based availability filtering applies

### AE-02 — Project linked schemas are relevance-only

**Given**
- project A has linked schemas subset of library

**When**
- user opens Project Overview linked schemas view

**Then**
- only linked schemas are shown there
- user can still access/search all schemas when linking or mapping

### AE-03 — Create Mapping can select any schema

**Given**
- schema exists in shared library but is not linked to current project

**When**
- user opens source/target schema picker in mapping flow

**Then**
- schema is selectable
- selection remains explicit by schema ID

### AE-04 — Upload from project creates shared schema and links project

**Given**
- user uploads schema from project context

**When**
- upload succeeds

**Then**
- schema is created in shared library
- schema is linked to current project

### AE-05 — Unlink does not delete schema

**Given**
- schema is linked to project and exists in library

**When**
- user unlinks schema from project

**Then**
- link is removed from project relevance list
- schema remains available in shared library

### AE-05a — Unlink hard-block when mappings still reference schema

**Given**
- schema is linked to project and at least one active mapping in that same project references it as source or target

**When**
- user attempts to unlink the schema from project

**Then**
- unlink is blocked
- response/UI identifies dependent mappings
- user is instructed to update/delete those mappings first
- schema remains in shared library

### AE-06 — Existing mappings remain resolvable

**Given**
- mapping references existing source/target schema IDs

**When**
- scope simplification migration/normalization is applied

**Then**
- mapping schema references still resolve correctly

### AE-07 — Scope labels removed from UI

**Given**
- schema cards/badges/details are rendered

**When**
- user views schema surfaces

**Then**
- labels do not show Global, Project, or Local as access scope concepts

### AE-08 — JSON label simplified

**Given**
- JSON Schema-backed schema metadata

**When**
- format is rendered in UI

**Then**
- label is `JSON` (not `JSON Schema`)

### AE-09 — Origin semantics preserved

**Given**
- schema originates from CDM or user upload or inference

**When**
- schema metadata is displayed

**Then**
- origin remains visible as CDM / Uploaded / Inferred

### AE-09a — Legacy local origin migrates to uploaded

**Given**
- legacy schema records with `origin: local`

**When**
- records are loaded via compatibility normalization or rewritten

**Then**
- canonical origin is `uploaded`
- UI never shows `Local` as a schema category

### AE-10 — Legacy scope fields do not drive access behavior

**Given**
- stored records still include `scope` or equivalent legacy fields

**When**
- UI/backend loads schemas

**Then**
- records are treated as shared for availability
- legacy fields are ignored or mapped for compatibility only

### AE-11 — Backend scope assumptions are audited and resolved

**Given**
- Lambda/API code paths with schema scope assumptions

**When**
- audit is completed

**Then**
- each dependency is marked as updated or explicitly unaffected

### AE-12 — DynamoDB/S3/OpenSearch/GitHub dependencies are audited

**Given**
- persistence and integration layers may encode scope assumptions

**When**
- audit is completed

**Then**
- required remediations are documented and implemented (or explicitly none)

### AE-12a — Audit explicitly covers projectId ownership patterns

**Given**
- potential backend schema ownership assumptions may be encoded via `projectId`

**When**
- backend/storage audit runs

**Then**
- audit explicitly inspects DynamoDB PK/SK and GSIs, Lambda query/access patterns, API route behavior, S3 key conventions, and OpenSearch filters for project-ownership coupling
- each finding is marked as changed, tolerated with compatibility, or unaffected with rationale

### AE-13 — Deployment snapshots remain explicit-reference based

**Given**
- deployment snapshot is created from mapping

**When**
- snapshot is persisted

**Then**
- schema references are locked by explicit identifiers/provenance
- no project/global access-scope dependency is required

### AE-14 — Existing global and project-scoped records normalize to shared

**Given**
- existing records contain `global` and `project` scope values

**When**
- migration/normalization runs

**Then**
- both classes become shared library entries
- project links are preserved where known

### AE-15 — Read-time compatibility default, migration only when audit requires

**Given**
- current rollout with Phase 0/small dataset assumptions

**When**
- audit confirms schemas can be read/listed across projects without key/index migration

**Then**
- rollout uses read-time normalization without mandatory one-time backfill
- migration script is only introduced when audit finds unsafe key/index/query constraints

---

## Open Questions

- none

---

## Verification Strategy

- Automated backend/unit tests for schema handlers and persistence normalization logic covering AE-01, AE-05, AE-06, AE-10, AE-11, AE-12, AE-14.
- Automated UI/component/integration tests covering schema list/detail badges/copy, project linked-schema views, add/link/upload flows, and mapping schema selectors for AE-02, AE-03, AE-04, AE-07, AE-08, AE-09.
- End-to-end/manual checks for cross-surface behavior (Schema Library, Project Overview, Create Mapping) and migration compatibility scenarios.
- Regression verification for deployment snapshot creation path to confirm AE-13.
- Required quality gates: lint + typecheck + targeted test suites in touched backend/UI packages.

---

## Task Generation Notes

- Follow phased execution:
  1) audit,
  2) model/type contract update,
  3) frontend behavior and terminology update,
  4) backend/AWS/integration remediations,
  5) verification + architecture updates.
- Keep UI tasks (`Agent: ui-task`) separate from backend/model/architecture tasks (`Agent: task`).
- Include one explicit architecture update task for existing docs (`ui-application.md`, `backend-api.md`, `persistence-model.md`, and related docs as needed).
- Migration/compatibility work should be isolated so rollback risk is controlled.

---

## Change Log

- Rev 1 — 2026-06-07
  - Initial draft
- Rev 2 — 2026-06-08
  - Resolved Q1: backend must be explicitly audited for `projectId` ownership assumptions in DynamoDB keys/GSIs, Lambda query/access patterns, API routes, S3 keying, and OpenSearch filters; no unaffected assumption allowed before audit.
  - Resolved Q2: canonical project linkage set to `linkedSchemaIds: string[]`; legacy `schemaRefs` normalized at read time and avoided for new linkage writes except temporary compatibility bridge.
  - Resolved Q3: canonical migration maps `origin: local` to `uploaded`; `local` retained only as read-time compatibility alias and removed from new persisted origin values/UI categories.
  - Resolved Q4: unlink behavior set to hard-block when active project mappings reference the schema, with dependent mapping visibility.
  - Resolved Q5: existing non-CDM GitHub path conventions may remain as internal storage/source metadata and must not imply access scope.
  - Resolved Q6: default rollout strategy is read-time compatibility; one-time migration/backfill required only if audit finds key/index/query constraints that make it unsafe.
