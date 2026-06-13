# SPEC

## Title

Redesign Schema Detail with inferred schema review workflow

---

## ID

FS-090

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

Redesign Schema Detail into a clearer two-column workspace focused on schema readiness, field editing, and safe usage decisions. The primary product change is an actionable inferred-schema review workflow that replaces the current vague “may be incomplete” warning with issue-driven review actions and explicit review completion behavior. The redesign also introduces first-class Sample Payloads, clarifies metadata (data format vs source kind), modernizes actions/edit semantics, and removes legacy sync/publish terminology from this surface.

---

## Problem

Schema Detail currently mixes outdated lifecycle concepts with unclear schema-readiness guidance. Users cannot quickly answer whether a schema is safe to use, why inferred schemas are uncertain, or what to do next. Important context (usage and sample payload provenance) is buried or missing, field type cues are inconsistent with current KeyRa conventions, and action placement is fragmented.

This creates avoidable confusion in mapping setup and increases time to first successful mapping (TTFSM), especially for inferred schemas created from a single sample payload.

---

## Goal

Deliver a Schema Detail experience that makes readiness, editability, usage, and review actions immediately clear, with explicit inferred-schema uncertainty handling and sample payload visibility. Ensure CDM schemas remain read-only, remove GitHub sync/publish actions from this phase, and align visual/system behavior with current Dashboard, Project Overview, Schema Library, and Create Mapping model contracts.

---

## Assumptions

- FS-087/FS-089 canonical schema metadata contracts (`ownership`, `readonly`, `dataFormat`, `sourceKind`, readiness `status`) remain baseline.
- FS-088 Create Mapping selector behavior (`needs_review` warning-selectable, `error` visible/non-selectable) remains unchanged by this spec.
- Existing schema parsing/editor infrastructure in `ui/src/features/schemas/` can be extended rather than replaced.
- Sample payload storage can be introduced as metadata/content references without full mapping-test pairing in this phase.
- CDM schemas continue to be system-managed and immutable in normal user flows.
- Rev 1 inference warnings are limited to deterministic categories already derivable from current parsing/inference outputs.

---

## Current Context

- Architecture index and relevant docs loaded: `ui-application.md`, `backend-api.md`, `persistence-model.md`.
- Existing UI architecture still documents legacy Schema Detail elements (inferred banner + Git/source action model) that this spec supersedes.
- Active related specs: `FS-087` (shared schema model), `FS-088` (Create Mapping workspace), `FS-089` (Schema Library simplification + metadata normalization).
- Existing architecture coverage already exists for impacted subsystems (UI schema surfaces, backend schema APIs, persistence metadata models); no new architecture document is required.
- Next available spec folder after scanning `forge/active/` and `forge/completed/` is `FS-090`.

---

## Scope

### In Scope

- Schema Detail information architecture redesign:
  - fixed breadcrumb using schema name,
  - summary-first header,
  - two-column desktop layout with right sidebar,
  - single-column responsive stacking order.
- Header/metadata model refinement:
  - CDM badge placement,
  - explicit status + format + field count + updated date,
  - separate data format vs source kind semantics.
- Inferred-schema review/readiness workflow:
  - actionable issues panel,
  - issue-to-field focus/filter actions,
  - mark-as-reviewed confirmation and status/review-state transitions.
- Field review model additions:
  - field-level inference warnings and confirmation markers,
  - issue aggregation for panel counts.
- Field tree/editor UX updates:
  - explicit type labels (`STR`, `NUM`, `BOOL`, `ARR`, `OBJ`),
  - remove depth dropdown,
  - show-issues filtering,
  - save/cancel edit model with persistent local-edit banner.
- Sample Payloads section and behavior:
  - sidebar placement,
  - initial inference payload capture,
  - add-sample flow with schema diff + explicit mutate confirmation,
  - non-mutating “save sample only” path,
  - storage model for future mapping-test reuse.
- Usage section repositioning to sidebar with source/target usage context.
- Action model cleanup:
  - top-level `Edit Schema` + overflow menu,
  - rename `Replace file` -> `Replace schema`,
  - remove sync/re-sync/publish/promote actions from this phase.
- Error and empty-state handling updates for fields/sample/usage.
- Tests/fixtures coverage updates for review status, CDM read-only, sample payload persistence, action visibility, and type labels.
- Architecture updates to existing docs for finalized contracts.

### Out of Scope

- Reintroducing GitHub sync/publish workflows.
- Editing CDM schema content.
- Full schema versioning/approval workflow.
- Automatic schema mutation on sample upload without user confirmation.
- Full mapping test case pairing UX for source/target samples.
- Mapping Editor redesign.

---

## Non-Goals

- Making inferred schemas perfect before use.
- Introducing deployment behavior into Schema Detail.
- Redefining global shared-schema semantics from FS-087/FS-089.
- Changing Create Mapping readiness gating rules beyond existing contracts.

---

## Relevant Areas

- `ui/src/features/schemas/components/SchemaDetailPage.tsx`
- `ui/src/features/schemas/components/SchemaTreeView.tsx`
- `ui/src/features/schemas/components/SchemaActions.tsx`
- `ui/src/features/schemas/components/SchemaUsageSection.tsx`
- `ui/src/features/schemas/components/InferredSchemaBanner.tsx` (to be replaced/refactored)
- `ui/src/features/schemas/hooks/use-schema-detail.ts`
- `ui/src/features/schemas/hooks/use-schema-editor.ts`
- `ui/src/lib/types/domain.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/local-storage-adapter.ts`
- `ui/src/lib/api/http-adapter.ts`
- `src/lambda/schema/create-schema.ts`
- `src/lambda/schema/get-schema.ts`
- `src/lambda/schema/update-* ?`
- `src/lib/persistence/schema-metadata.ts`
- `src/lib/persistence/types.ts`
- `forge/architecture/ui-application.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/persistence-model.md`
- `forge/architecture/INDEX.md`

---

## Dependencies / Blockers

- Depends on FS-089 metadata baseline remaining canonical.
- Depends on existing schema parser/editor hooks supporting issue-focused field filtering.
- Backend storage contract for sample payload records must be finalized before HTTP adapter implementation is completed.

---

## Constraints

- Desktop layout must be two-column; responsive fallback must use defined stacked order.
- Breadcrumb must use schema name, not raw schema ID.
- Header must not use `Uploaded`/`Inferred` as primary format badges.
- CDM schemas must not enter edit mode.
- Save/Cancel replaces Re-sync semantics for user-editable schemas.
- Sync/Re-sync/Publish/Promote terminology/actions are removed on Schema Detail in this phase.
- Sample payload addition must never mutate schema automatically.
- Existing schema usability rules (`needs_review` selectable with warning; `error` non-selectable) remain compatible.
- Missing descriptions are non-blocking readiness recommendations only.
- Mark-as-reviewed is available immediately with explicit confirmation.
- Rev 1 add-sample decisions support only: `Apply all suggested updates` or `Save sample only` (no partial field selection UI).
- Inferred schemas must retain at least one inference provenance sample (`usedForInference=true`) in Rev 1.

---

## Proposed Behavior

### User Flow

1. User opens Schema Detail and sees:
   - breadcrumb with schema name,
   - header with schema status + format + field count + updated date,
   - readiness/review panel (when applicable),
   - field work area,
   - sidebar with metadata, sample payloads, usage, actions.
2. If schema is inferred and unreviewed, user sees issue counts and can jump directly to affected fields.
3. User edits field properties and saves or cancels local changes.
4. User can mark schema reviewed with confirmation even if non-blocking issues remain.
5. User can inspect/add sample payloads, review diffs, and decide whether to update schema or save sample only.
6. CDM schema users can view/read/search/usage/raw but cannot edit/replace/delete.

### System Behavior

- Metadata contract separates:
  - `dataFormat: json|xml`
  - `sourceKind: json_schema|xsd|inferred_from_json|inferred_from_xml`
  - `status: ready|processing|needs_review|error`
  - `reviewState: not_required|unreviewed|partially_reviewed|reviewed`
- Field-level review metadata captures inference warnings and confirmations.
- Rev 1 deterministic warning set includes:
  - low sample evidence,
  - type ambiguity/conflict,
  - optionality uncertainty,
  - empty object / unknown array-item shape,
  - field-name quality warnings (only when already detected by current inference outputs).
- Missing descriptions contribute to issue counts but do not block readiness transitions.
- Readiness panel issue counts are derived from field-level review metadata + schema-level completeness checks.
- `Mark as reviewed` transition:
  - sets `reviewState = reviewed`,
  - sets `status = ready` unless blocking structural errors exist,
  - preserves inferred lineage (`sourceKind`) and records `reviewedAt`.
- `reviewState` is persisted as canonical state (not only derived), with `reviewedAt` for auditability; derived summaries may be cached for UI speed.
- Save in edit mode:
  - persists schema edits,
  - recalculates field counts and issue totals,
  - updates `updatedAt`,
  - recalculates readiness status/review summary.
- Initial inferred payload is persisted as first sample (`usedForInference=true`).
- Sample payload storage uses DynamoDB metadata + S3 payload blobs.
  - Metadata fields include: `sampleId`, `schemaId`, `dataFormat`, `usedForInference`, `createdAt`, optional `createdBy`, `sizeBytes`, `hash`, optional summary.
  - S3 key strategy: `schemas/{schemaId}/samples/{sampleId}/payload.{json|xml}`.
- Add-sample flow computes diff evidence (additions/type conflicts/required-evidence deltas) and requires explicit user action for schema mutation.
- Rev 1 add-sample actions are restricted to:
  - `Apply all suggested schema updates`, or
  - `Save sample only`.
- Replace-schema preserves sample payloads by default and marks sample compatibility state (`unknown`, `compatible`, `mismatch` when evaluated).

### Failure / Edge Behavior

- Parse failure sets `status=error` and shows actionable error panel with allowed actions by ownership.
- No fields state surfaces parse-empty guidance.
- No usage state indicates schema not yet used.
- No sample payloads state appears for formal uploaded schemas; inferred schemas should always have at least one sample unless data corruption/migration anomaly occurs.
- Deletion of inference provenance sample (`usedForInference=true`) is disallowed in Rev 1.
- If sample data format mismatches schema format, add-sample flow fails validation with clear message and no mutation.

---

## Acceptance Examples

### AE-01 — Breadcrumb resolves to schema name

**Given**
- schema detail route for schema ID exists

**When**
- page renders breadcrumb

**Then**
- breadcrumb label shows schema name (not raw ID)

### AE-02 — Header emphasizes readiness + format metadata

**Given**
- schema detail loads successfully

**When**
- header renders

**Then**
- it shows name, status, `JSON|XML`, field count, and updated date
- CDM badge appears left of name for CDM schemas

### AE-03 — Desktop and responsive layout order is deterministic

**Given**
- desktop viewport and narrow viewport

**When**
- schema detail layout renders

**Then**
- desktop uses two columns with sidebar sections
- narrow view stacks: Header -> Review -> Sample Payloads -> Fields -> Usage -> Metadata

### AE-04 — Inferred review panel lists actionable issues

**Given**
- inferred schema with unresolved warnings

**When**
- review panel renders

**Then**
- issue rows include counts + review action
- selecting an issue focuses/filters relevant fields

### AE-05 — Mark as reviewed explicit transition

**Given**
- inferred schema has unresolved non-blocking issues

**When**
- user confirms “Mark as Ready”

**Then**
- `reviewState=reviewed`
- `status=ready` unless blocking errors remain
- unresolved non-blocking issues are summarized in confirmation copy

### AE-06 — Field tree type labels are explicit

**Given**
- field tree renders

**When**
- fields are displayed

**Then**
- primary type indicator uses `STR|NUM|BOOL|ARR|OBJ`
- depth dropdown is absent

### AE-07 — Edit mode uses local Save/Cancel model

**Given**
- user schema enters edit mode

**When**
- user edits fields

**Then**
- persistent banner states edits are local until save
- actions are `Save` and `Cancel` (no Re-sync)

### AE-08 — CDM schemas remain read-only

**Given**
- schema ownership is CDM/readonly

**When**
- schema detail actions render

**Then**
- edit/replace/delete/save actions are unavailable
- view/search/raw/usage remain available

### AE-09 — Sample payloads are first-class and inference-safe

**Given**
- inferred schema created from uploaded sample

**When**
- detail page loads

**Then**
- initial sample appears as used-for-inference
- add-sample flow compares new sample and requires explicit mutation confirmation

### AE-10 — Usage surfaces near top-level decision context

**Given**
- schema has project/mapping usage

**When**
- detail page renders

**Then**
- usage appears in sidebar (or elevated responsive position)
- mapping usage indicates source/target role

### AE-11 — Legacy GitHub sync action vocabulary is removed

**Given**
- schema detail actions are visible

**When**
- user opens action surfaces

**Then**
- Sync to GitHub/Re-sync/Publish/Promote actions are absent
- overflow menu contains `View raw`, `Replace schema` (user only), `Delete schema` (user only)

### AE-12 — Error schema panel is actionable

**Given**
- schema parse failure occurs

**When**
- detail page renders

**Then**
- error panel shows reason and allowed remediation actions by ownership

---

## Open Questions

- none

---

## Verification Strategy

- UI unit/integration coverage for:
  - breadcrumb/header/layout behavior (AE-01, AE-02, AE-03),
  - review panel issue interactions + mark-reviewed flow (AE-04, AE-05),
  - type label rendering and toolbar controls (AE-06),
  - edit mode save/cancel banner and controls (AE-07),
  - CDM read-only gating and action visibility (AE-08, AE-11),
  - sample payload section/add-diff behavior (AE-09),
  - usage placement/role labeling (AE-10),
  - error panel behavior (AE-12).
- Adapter/backend tests for:
  - schema metadata/readiness transitions,
  - persisted sample payload metadata/content references,
  - non-mutating add-sample default behavior,
  - replace-schema/read-only restrictions.
- Regression checks:
  - lint/typecheck/unit suites for touched backend and UI workspaces.

---

## Task Generation Notes

- This is cross-cutting and requires both `ui-task` and `task` assignments.
- Keep UI layout/action refactor tasks separate from backend/persistence contract tasks.
- Include an explicit architecture update task (`Agent: task`) updating existing docs (`ui-application.md`, `backend-api.md`, `persistence-model.md`, `INDEX.md`) because existing subsystem contracts change.
- No new architecture document should be created; existing schema/UI/API/persistence architecture coverage is sufficient.
- Sequence should establish backend contracts before final UI wiring that depends on sample/review metadata.

---

## Change Log

- Rev 1 — 2026-06-08
  - Initial draft
- Rev 2 — 2026-06-08
  - Resolved Q1–Q8 with explicit product decisions:
    - deterministic Rev 1 warning categories only,
    - missing descriptions are non-blocking,
    - `reviewState` + `reviewedAt` persisted explicitly,
    - add-sample supports apply-all or save-only (no partial selection),
    - sample storage uses DynamoDB metadata + S3 blobs with canonical key pattern,
    - inference provenance sample cannot be deleted in Rev 1,
    - replace-schema preserves samples and tracks compatibility state,
    - mark-as-reviewed available immediately with confirmation.
