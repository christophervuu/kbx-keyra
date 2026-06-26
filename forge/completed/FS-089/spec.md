# SPEC

## Title

Simplify Schema Library and auto-load CDM models

---

## ID

FS-089

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-08  
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

This spec updates KeyRa’s Schema Library to a simplified model where CDM schemas are automatically available and user-created schemas are added only through upload/paste flows. The UI removes legacy scope and GitHub sync/publish concepts, introduces a card/list toggle, and standardizes schema metadata display around readiness, format, field count, usage, and updated date. Create Mapping must immediately allow selecting CDM schemas without any prior link/add step. CDM remains read-only while user-created schemas keep current edit/replace/delete behavior where supported.

---

## Problem

Schema Library and Add Schema flows still expose an older lifecycle (link CDM, publish/sync, global/local/project distinctions) that no longer matches the current product model. This causes friction in schema discovery and mapping setup, especially when users need standard CDM models quickly. It also conflates schema ownership, format, and derivation in card presentation, which makes schema readiness harder to interpret.

---

## Goal

Deliver a single, simplified schema model and UX where:
- CDM schemas are pre-available and selectable everywhere schemas are chosen,
- Add Schema is only for user-created schemas,
- legacy scope/sync/publish terminology is removed from Schema Library surfaces,
- cards and list rows emphasize operational readiness and schema utility metadata.

---

## Assumptions

- FS-087 shared-schema direction remains the canonical baseline (no user-facing scope model).
- Existing schema storage layer (local/demo and Phase 1 DynamoDB/S3 paths) remains in place.
- CDM data can be seeded/bootstrapped for current phase without introducing a new external runtime dependency.
- Current Create Mapping schema selectors can consume expanded schema metadata without route redesign.
- GitHub sync/publish lifecycle for schemas is intentionally out of scope in this phase.

---

## Current Context

Repository and architecture context loaded before drafting:
- `forge/architecture/ui-application.md`, `backend-api.md`, `persistence-model.md`, and `schema-ingestion.md` currently still document CDM sync terminology and historical schema metadata compatibility fields (`scope`, `syncStatus`, legacy origin aliases).
- Active specs `FS-087` (shared schema model) and `FS-088` (Create Mapping redesign) are in progress and directly related.
- Architecture docs already cover existing subsystems needed for this change (UI schema surfaces, backend schema APIs, persistence model); no new subsystem architecture document is required.
- Highest existing spec folder across active/completed is `FS-088`; next available is `FS-089`.

---

## Scope

### In Scope

- Schema metadata contract refinement for:
  - ownership (`cdm|user`),
  - data format (`json|xml`),
  - source kind (`json_schema|xsd|inferred_from_json|inferred_from_xml`),
  - schema status (`ready|processing|needs_review|error`),
  - read-only/CDM markers,
  - inferred review lifecycle metadata (`reviewedAt`, future `reviewedBy`).
- CDM schema default availability in schema list (bootstrap/seed path appropriate for current phase).
- Schema Library UI updates:
  - header copy,
  - card/list view toggle,
  - filters (ownership/format/status),
  - explicit sort direction options,
  - removal of scope/sync/publish terminology.
- Schema card/list presentation updates:
  - CDM badge placement,
  - status prominence,
  - format + field count,
  - used-by count,
  - updated date,
  - duplicate-name disambiguator,
  - zero-field contextual handling.
- Add Schema modal simplification to upload/paste for user-created schemas only.
- Create Mapping schema selector behavior update to include CDM schemas immediately.
- Schema Detail ownership-aware behavior (CDM read-only; metadata distinction between data format and source kind).
- Automated coverage/fixtures for key contract and UI behavior changes.
- Architecture documentation updates for impacted existing subsystems.

### Out of Scope

- Reintroducing or implementing GitHub publish/sync workflow in Schema Library UI.
- Creating a separate CDM-only page.
- CDM duplication into editable user-created schemas (deferred to follow-up spec).
- Approval/version governance flows for schema lifecycle.
- Editing CDM schemas directly.
- Deploy behavior changes tied to schema management.

---

## Non-Goals

- Implementing full CDM governance/admin controls.
- Redesigning unrelated mapping editor/test/deployment surfaces.
- Replacing schema ingestion architecture beyond required metadata/status compatibility for this phase.
- Building a new tenancy/access-control model for schemas.

---

## Relevant Areas

- `ui/src/features/schemas/**/*`
- `ui/src/features/projects/**/*` (schema selectors, add-schema entry points)
- `ui/src/features/mappings/**/*` (Create Mapping selectors)
- `ui/src/lib/types/domain.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/local-storage-adapter.ts`
- `ui/src/lib/api/http-adapter.ts`
- `src/lambda/schema/*.ts`
- `src/lib/persistence/schema-metadata.ts`
- `src/lib/persistence/types.ts`
- `forge/architecture/ui-application.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/persistence-model.md`

---

## Dependencies / Blockers

- Alignment dependency on FS-087 shared-schema model decisions.
- Potential sequencing dependency with FS-088 Create Mapping implementation if selector components are shared.

---

## Constraints

- No user-facing `Global/Local/Project-level/Published` schema scope terminology.
- No user-facing sync/publish actions or sync-status badge vocabulary in Schema Library cards/list rows.
- CDM schemas must remain read-only in normal user flows.
- Card/list primary metadata must use `JSON/XML` data format labels, not derivation labels.
- Must preserve existing user-created schema ingestion paths (upload/paste, including inferred from sample data).
- Must support both local/demo and backend-backed execution modes with consistent UX contract.
- CDM records are system-managed and non-removable in this phase.
- Card/List mode persistence uses localStorage key `keyra.schemas.viewMode` in this phase.

---

## Proposed Behavior

### User Flow

1. User opens Schema Library and sees both CDM and user-created schemas in one library.
2. User can switch between Card and List views without leaving the page.
3. User filters by ownership, format, and status; sorts with explicit direction labels.
4. User clicks Add Schema and can only upload/paste user-created schemas.
5. User opens Create Mapping and can select CDM schemas immediately.
6. User opens Schema Detail:
   - CDM schemas are view/read-only,
   - user-created schemas retain editable/manageable actions where supported.

### System Behavior

- CDM canonical source strategy is mode-aware with one contract:
  - backend mode (Phase 1+): versioned seed manifest (`cdm-manifest.json`) drives S3 + DynamoDB seeded records,
  - local/demo mode (Phase 0): bundled read-only fixture set in UI adapter.
- CDM ingest strategy is hybrid:
  - bootstrap metadata for all CDM schemas at startup (`schemaId`, `name`, `ownership`, `dataFormat`, `sourceKind`, `status`, `fieldCount`, `updatedAt`),
  - lazy-load full schema payload/tree on detail/editor/selector demand.
- Schema metadata stores separate fields for ownership, data format, source kind, and schema status.
- Card/list rendering uses:
  - optional CDM badge,
  - status under name,
  - `JSON|XML · {fieldCount or contextual empty copy}`,
  - used-by count,
  - updated date.
- Source kind remains available for Schema Detail metadata, not primary card/list format display.
- Duplicate display names use disambiguator priority:
  1) namespace/source domain,
  2) version,
  3) short stable ID suffix,
  4) filename stem fallback when namespace/version absent.
- Card/List view preference persists in localStorage using `keyra.schemas.viewMode = "card" | "list"`.
- Create Mapping selectors render schema status with selection rules:
  - `needs_review`: selectable with warning (soft gate),
  - `error`: visible but non-selectable.
- Inferred schemas retain immutable `sourceKind` and may transition `needs_review -> ready` via explicit user action (`Mark as Reviewed`), recording `reviewedAt` (and `reviewedBy` when auth exists).
- Schema Detail always shows both format and source-kind labels (e.g., `Data format: XML`, `Schema source: XSD`).

### Failure / Edge Behavior

- No schemas available: show CDM load issue empty state and Add Schema CTA.
- CDM filter empty: show system-issue guidance copy.
- User-created filter empty: show creation guidance copy.
- Parse failures remain visible with `Error` status and diagnostic detail path.
- Error schemas are visible to all users but non-selectable for mapping; remediation CTA differs by ownership:
  - user-created: replace/edit/re-upload path,
  - CDM: contact platform/support path.
- 0-field schemas are never shown as healthy baseline without status context (`No fields detected`, `Needs Review`, `Processing`, or `Error` context).

---

## Acceptance Examples

### AE-01 — CDM schemas are available by default

**Given**
- app initializes schema data

**When**
- user opens Schema Library

**Then**
- CDM schemas are already present without manual add/link action

### AE-02 — Add Schema is user-created only

**Given**
- user opens Add Schema modal

**When**
- modal content is rendered

**Then**
- only Upload File and Paste Content paths are available
- no Link CDM/Published/Sync actions are shown

### AE-03 — Scope and sync/publish vocabulary is removed

**Given**
- user browses Schema Library cards/list

**When**
- schema metadata/actions render

**Then**
- no Global/Local/Project-level/Published or Synced/Needs Sync vocabulary is displayed

### AE-04 — Card metadata shows status, format, counts, usage, updated

**Given**
- schema card renders

**When**
- metadata rows render

**Then**
- card shows schema name, status, data format, field count, used-by count, and updated date
- source/derivation kind is not shown as primary format label

### AE-05 — CDM badge and read-only behavior are enforced

**Given**
- schema is ownership `cdm`

**When**
- card/list/detail/actions render

**Then**
- CDM badge appears to the left of schema name
- edit/replace/delete actions are unavailable in normal user actions

### AE-06 — Card/List toggle works with session persistence

**Given**
- user toggles view mode

**When**
- user navigates within session and returns

**Then**
- selected Card/List mode is retained via localStorage (`keyra.schemas.viewMode`)

### AE-07 — Filters and sort options align to simplified model

**Given**
- user uses filter/sort controls

**When**
- controls are opened

**Then**
- filters include ownership, format, and status only
- sort options include explicit direction labels

### AE-08 — Inferred schemas display format correctly

**Given**
- schema source kind is inferred from JSON/XML

**When**
- card/list row renders format label

**Then**
- format shows JSON or XML (not “Inferred”)
- status can represent inferred readiness (`Needs Review`)

### AE-09 — Create Mapping can select CDM immediately

**Given**
- user opens schema selector in Create Mapping

**When**
- selector list loads

**Then**
- CDM schemas are listed and selectable when status allows

### AE-09a — Needs Review is warning-selectable and Error is blocked

**Given**
- schema selector contains `needs_review` and `error` schemas

**When**
- user attempts selection

**Then**
- `needs_review` schemas are selectable with visible warning
- `error` schemas remain visible but are non-selectable

### AE-10 — Duplicate schema names are disambiguated

**Given**
- two schemas share the same display name

**When**
- card/list rows render

**Then**
- each row includes a visible disambiguator to distinguish records

### AE-11 — 0-field schemas include contextual status messaging

**Given**
- schema has zero detected fields

**When**
- card/list metadata renders

**Then**
- UI uses contextual messaging (`No fields detected` and/or status context)
- schema is not presented as healthy by default

### AE-12 — Metadata classification by input kind remains correct

**Given**
- user creates schemas from JSON Schema, XSD, sample JSON, and sample XML

**When**
- metadata records are created

**Then**
- dataFormat/sourceKind/status fields map correctly for each input type

### AE-13 — Inferred schema review transition preserves lineage

**Given**
- schema has `sourceKind = inferred_from_json|inferred_from_xml` and `status = needs_review`

**When**
- user performs explicit review completion action (`Mark as Reviewed`)

**Then**
- status transitions to `ready`
- sourceKind remains inferred
- `reviewedAt` is recorded

---

## Open Questions

- none

---

## Verification Strategy

- UI unit/integration tests for Schema Library card/list render paths, filters, sorting, and toggle behavior (AE-03 through AE-11).
- UI tests for Add Schema modal option set and user-created-only flows (AE-02, AE-12).
- Create Mapping selector tests for immediate CDM visibility and status gating behavior (AE-09).
- Create Mapping selector tests for `needs_review` warning-selectable and `error` non-selectable behavior (AE-09a).
- Backend/adapter tests for metadata contract updates and CDM default seed availability (AE-01, AE-12).
- Permission/action tests asserting CDM read-only restrictions in detail/actions (AE-05).
- Tests for inferred review transition (`needs_review -> ready`) preserving source kind and writing `reviewedAt` (AE-13).
- Fixture/seed tests to ensure baseline CDM presence in default schema lists (AE-01).
- Quality gates: typecheck + lint + targeted suites in touched UI/backend areas.

---

## Task Generation Notes

- Split execution by domain:
  - `task` for metadata contract updates, seed/bootstrap, backend/API behavior, and architecture updates.
  - `ui-task` for Schema Library, Add Schema modal, Schema Detail UI permissions, and Create Mapping selector updates.
- Keep card/list presentation and toolbar/filter controls as separate UI tasks to isolate regression risk.
- Include explicit architecture update task for `ui-application.md`, `backend-api.md`, and `persistence-model.md` because this spec materially changes schema UX contract and metadata semantics.
- Keep tests split by affected surface (schema library UI, add flow, mapping selector, backend metadata/seed fixtures).

---

## Change Log

- Rev 1 — 2026-06-08
  - Initial draft
- Rev 2 — 2026-06-08
  - Resolved Q1: canonical CDM source is a versioned backend seed manifest (`cdm-manifest.json`) in backend mode, with bundled read-only fixtures in local/demo mode.
  - Resolved Q2: adopted hybrid ingest strategy (startup metadata bootstrap for all CDM schemas + lazy full payload/tree loading).
  - Resolved Q3: CDM duplication is out of scope for FS-089 and deferred.
  - Resolved Q4: CDM schemas are system-managed and non-removable in this phase.
  - Resolved Q5: duplicate-name disambiguator priority set to namespace/domain -> version -> short stable ID, with filename fallback.
  - Resolved Q6: Card/List preference persists in localStorage with key `keyra.schemas.viewMode`.
  - Resolved Q7: `needs_review` schemas are selectable with warning (soft gate) in Create Mapping.
  - Resolved Q8: `error` schemas remain visible to all users but are non-selectable.
  - Resolved Q9: inferred schemas can be explicitly marked reviewed (`needs_review -> ready`) while preserving immutable inferred source kind and recording `reviewedAt`.
  - Resolved Q10: Schema Detail explicitly shows both data format and schema source kind (including XML + XSD distinction).
