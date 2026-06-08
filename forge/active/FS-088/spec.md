# SPEC

## Title

Redesign Create Mapping into a single-page setup workspace

---

## ID

FS-088

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

Replace the current 3-step Create Mapping wizard with a full single-page setup experience that matches the redesigned Dashboard and Project Overview visual system. The new page must allow users to enter mapping details, choose source/target schemas, add new schemas in-place, review a simple schema summary, and choose how to start (blank or auto-map suggestions) before entering the editor. This keeps mapping creation fast while making the setup context visible and understandable.

---

## Problem

The current Create Mapping flow (`CreateMappingPage.tsx`) is a narrow wizard card with three sequential steps (name, source, target) and skip behavior. It was sufficient for early Phase 0, but now feels disconnected from the updated app surfaces and does not provide enough setup context before entering the Mapping Editor.

Users currently cannot see both schema selections side-by-side, compare basic schema stats at creation time, add new source/target schemas inline in context, or choose creation mode in a clear way aligned with available AI suggestion workflows.

---

## Goal

Deliver a dedicated Create Mapping page that:
- aligns with the Dashboard/Project Overview design language,
- presents setup sections in one screen,
- supports mapping details + schema selection + schema creation + start mode selection,
- validates required inputs before create,
- routes users cleanly to Mapping Editor for either blank creation or suggestion-assisted review.

---

## Assumptions

- Existing route remains `/projects/:projectId/mappings/new`.
- Existing schema add/upload flows in projects components (`SchemaUploadDialog`, related adapter methods) can be reused for in-page add-source/add-target actions.
- Existing adapter and backend support `POST /mappings` with required fields (`projectId`, `name`) and optional schema refs.
- Existing AI suggestion endpoints exist (`/ai/auto-map`) but create-time orchestration may require additional UI wiring.
- Business Context must be persisted as mapping metadata in this spec via `businessContext?: string` (or existing `description` only if semantics are clearly equivalent and non-blurry).

---

## Current Context

Repository-grounded context:
- `ui/src/features/projects/components/CreateMappingPage.tsx` currently implements a 3-step wizard (`Name`, `Source Schema`, `Target Schema`) using `StepIndicator` and `max-w-lg` card layout.
- Current schema selectors support a skip option (`__skip__`) and group linked schemas ahead of others.
- Current create flow calls `adapter.createMapping({ projectId, name, sourceSchemaRef?, targetSchemaRef? })` then navigates to Mapping Editor.
- Existing add-schema surfaces already exist in projects feature (`SchemaUploadDialog`, `SchemaLinkPicker`, `LinkedSchemasDialog`) and should be reused rather than creating a new schema-creation infrastructure.
- Dashboard and Project Overview have moved to full-page, dark-theme, card-based compositions (`HomeDashboardPage`, `ProjectOverviewPage`, `ProjectHeader`) and are the style baseline for this redesign.
- Related in-progress specs reviewed: FS-086 (Project Overview simplification) and FS-087 (shared schema library semantics). This spec should remain aligned with FS-087 canonical shared-schema behavior.

---

## Scope

### In Scope

- Replace wizard UI with a single-page Create Mapping layout containing:
  1. Page header
  2. Mapping Details
  3. Schema Selection (source + target cards)
  4. Schema Summary
  5. Start From
  6. Footer actions
- Add required `Mapping Name` and optional multiline `Business Context` field.
- Render source and target schema cards side-by-side with selector + basic schema info:
  - name
  - total field count
  - required field count
  - format
  - origin
- Add in-card schema actions:
  - `+ Add new source schema`
  - `+ Add new target schema`
- Reuse existing schema upload/link behavior in modal/drawer style without navigating away.
- After successful add-schema action, auto-select new schema in relevant selector and refresh card/summary.
- Add simple schema summary section with only:
  - source fields
  - source required fields
  - target fields
  - target required fields
- Add Start From options:
  - Blank mapping
  - Auto-map suggestions
- Footer buttons:
  - Cancel
  - Primary action label changes by start mode
- Validation: block create unless Mapping Name, Source Schema, Target Schema, and Start From are selected.
- Create behavior:
  - Blank mapping -> create and navigate editor
  - Auto-map suggestions -> create, trigger suggestion path when supported, navigate editor with suggestions available for review
- If auto-map-at-create is not currently supportable through existing callable path, expose explicit disabled/future state; do not fabricate suggestions.

### Out of Scope

- Tags on Create Mapping page.
- Array/repeating-group stats.
- Likely direct matches.
- Readiness/sync/deployment-ready badges in schema cards or schema summary.
- Template-based mapping initialization option.
- Rule editing, preview/testing, diagnostics, expression-building UI on this page.
- Deployment actions from Create Mapping page.

---

## Non-Goals

- Redesigning Mapping Editor itself.
- Introducing new AI acceptance semantics (AI suggestions must remain review-only until explicitly accepted).
- Re-architecting schema ingestion backend.
- Reworking deployment flows.

---

## Relevant Areas

- `ui/src/features/projects/components/CreateMappingPage.tsx`
- `ui/src/features/projects/components/__tests__/CreateMappingPage.test.tsx`
- `ui/src/features/projects/types.ts`
- `ui/src/lib/types/domain.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/local-storage-adapter.ts`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/features/projects/components/SchemaUploadDialog.tsx`
- `ui/src/features/projects/components/SchemaLinkPicker.tsx`
- `ui/src/features/mappings/components/MappingEditorPage.tsx` ?
- `ui/src/routes/pages/CreateMapping.tsx`
- `src/lambda/mapping/create-mapping.ts` ?
- `src/lib/persistence/types.ts` ?
- `forge/architecture/ui-application.md`
- `forge/architecture/backend-api.md` ?
- `forge/architecture/INDEX.md`

---

## Dependencies / Blockers

- Depends on existing schema creation/upload behavior availability from project surfaces for in-place reuse.
- Depends on existing schema creation/upload behavior availability from project surfaces for in-place reuse.
- Auto-map create flow depends on wiring mappingId-based pending suggestion session semantics; Phase 0 may use navigation-state fallback temporarily, but target contract is mapping-level and re-entry safe.

---

## Constraints

- Must visually match redesigned Dashboard/Project Overview patterns (dark theme, spacing, card structure, border style, typography, page width behavior, button hierarchy, input styling).
- Must avoid navigation away from Create Mapping for add-schema actions.
- Must not regress current route behavior and cancel navigation.
- Must preserve deterministic no-fake behavior for AI: suggestions are generated only through real callable path and remain non-accepted by default.
- Canonical auto-map handoff is mapping-level pending suggestion state (not navigation-only state), with re-entry-safe detection by mappingId.
- Required field count must come from normalized schema summary data (metadata first, then normalized parsed nodes, else `—`); Create Mapping page must not implement raw JSON Schema/XSD required parsing.
- Must remain compatible with FS-087 shared schema model (no scope-based schema availability behavior).

---

## Proposed Behavior

### User Flow

1. User navigates to `/projects/:projectId/mappings/new`.
2. User sees full-page header:
   - Title: `Create Mapping`
   - Subtitle: `Set up the mapping details and choose the schemas you want to map between.`
3. User enters Mapping Name (required) and optional Business Context.
4. User selects Source and Target schemas from side-by-side cards; each card displays selected schema details.
5. User can click `+ Add new source schema` or `+ Add new target schema` directly inside each card, complete add flow in modal/drawer, and return with new schema auto-selected.
6. User sees simple Schema Summary values update as source/target selections change.
7. User selects Start From mode:
   - Blank mapping
   - Auto-map suggestions
8. Footer primary button updates label based on selected mode:
   - `Create Mapping`
   - `Create & Generate Suggestions`
9. User submits:
   - Blank mode: mapping created, navigates to editor.
   - Auto-map mode: mapping created, suggestions generation path executed when available, navigates to editor where suggestions are reviewable.

### System Behavior

- Create Mapping page is rendered as a full dedicated page layout, not wizard step-card flow.
- State model includes:
  - `name` (required)
  - `businessContext` (optional)
  - `sourceSchemaId` (required)
  - `targetSchemaId` (required)
  - `startMode` (required: `blank` | `auto-map`)
- Required-field validation shows inline messages in existing app style.
- Schema cards pull from shared schema list and selected schema metadata.
- Required field counts for summary are derived from normalized schema summary data in this order:
  1. `requiredFieldCount` from existing schema metadata when available,
  2. derived count from normalized parsed schema nodes (required leaf nodes),
  3. `—` when unavailable.
- Create Mapping page must not implement raw JSON Schema/XSD required-count parsing logic directly.
- Add-schema action reuses existing upload/link implementation and, on success, refreshes source list + auto-selects newly created schema in invoking card.
- Create call continues to use canonical adapter create pathway.
- Business Context persistence behavior:
  - Persist immediately as mapping metadata (`businessContext?: string`) as the preferred contract.
  - Existing `description` may be used only if it is already established and semantically equivalent.
  - UI-only storage is temporary fallback only when backend/model changes block implementation, and must be captured as explicit technical debt follow-up.
- Auto-map mode behavior:
  - Canonical behavior creates mapping with no committed generated rules, creates/triggers mapping-level pending suggestion session keyed by `mappingId`, then routes to editor.
  - Mapping Editor detects pending session/suggestions by mappingId and opens review mode.
  - Phase 0 may use navigation state as temporary local-only fallback, but target contract is mappingId-based and re-entry safe.
  - If callable path is unavailable/feature-gated in current mode, option remains disabled (or explicitly hidden behind future state) with clear copy.

### Failure / Edge Behavior

- If schemas fail to load, schema selectors render graceful loading/error state and block create until valid selections are present.
- If add-schema action fails, keep user on page and show non-destructive error state; existing selections remain unchanged.
- If create mapping request fails, show inline submit error and keep entered form values.
- If auto-map generation fails after mapping creation, mapping remains valid and editor opens with explicit non-blocking pending-session failure/empty suggestion messaging (no fake suggestions).
- If schema metadata is partial, display available values and fallback placeholders without advanced warnings/badges.

---

## Acceptance Examples

### AE-01 — Full-page create mapping layout replaces wizard

**Given**
- user opens create mapping route

**When**
- page renders

**Then**
- 3-step wizard UI is not rendered
- page renders full setup sections in a single-page layout

### AE-02 — Header matches new page pattern

**Given**
- create mapping page loads

**When**
- header is shown

**Then**
- title is `Create Mapping`
- subtitle communicates setup purpose
- visual style matches redesigned Dashboard/Project Overview conventions

### AE-03 — Mapping details section supports required name + optional business context

**Given**
- user is in Mapping Details

**When**
- user enters values

**Then**
- Mapping Name is required
- Business Context is optional multiline text
- placeholder and helper copy support business-use description intent

### AE-04 — Source/Target schema cards are visible together

**Given**
- schema list is available

**When**
- page renders schema selection

**Then**
- Source Schema and Target Schema cards appear side-by-side (or stacked responsively)
- both cards remain visible in same page context

### AE-05 — Selected schema card summary includes only basic fields

**Given**
- schema selected in either card

**When**
- summary region renders

**Then**
- shows name, total fields, required fields, format, origin
- does not show readiness/sync/likely matches/array stats unless invalid selection messaging is required

### AE-06 — Add new source schema from source card

**Given**
- user clicks `+ Add new source schema`

**When**
- add-schema flow completes successfully

**Then**
- page does not navigate away
- new schema is auto-selected as source
- source card and summary update immediately

### AE-07 — Add new target schema from target card

**Given**
- user clicks `+ Add new target schema`

**When**
- add-schema flow completes successfully

**Then**
- page does not navigate away
- new schema is auto-selected as target
- target card and summary update immediately

### AE-08 — Schema summary section remains intentionally simple

**Given**
- source and target schemas are selected

**When**
- schema summary renders

**Then**
- only source fields, source required fields, target fields, target required fields are shown
- no readiness, likely matches, array stats, deployment or AI-analysis surfaces are shown

### AE-09 — Start From options are limited to blank and auto-map suggestions

**Given**
- user reaches Start From section

**When**
- options render

**Then**
- only `Blank mapping` and `Auto-map suggestions` are available
- template option is not shown

### AE-10 — Footer primary label changes by mode

**Given**
- start mode is selected

**When**
- footer renders

**Then**
- blank mode shows `Create Mapping`
- auto-map mode shows `Create & Generate Suggestions`

### AE-11 — Required validation blocks create

**Given**
- one or more required inputs missing (name/source/target/start mode)

**When**
- user attempts submit

**Then**
- create is blocked
- inline validation messages are shown in consistent app style

### AE-12 — Blank mode creates mapping and navigates to editor

**Given**
- required fields valid and `Blank mapping` selected

**When**
- user submits

**Then**
- mapping is created with no generated rules
- app navigates to Mapping Editor route

### AE-13 — Auto-map mode creates mapping and triggers suggestions when supported

**Given**
- required fields valid and `Auto-map suggestions` selected
- callable suggestion path is available

**When**
- user submits

**Then**
- mapping is created
- mapping-level pending suggestion session is created/triggered for `mappingId`
- app navigates to Mapping Editor, which detects pending session by `mappingId` and opens review context

### AE-13a — Auto-map re-entry is mappingId-safe

**Given**
- mapping was created with auto-map mode and has pending suggestion session state

**When**
- user re-opens Mapping Editor for that mapping later (fresh navigation/reload)

**Then**
- editor can recover pending suggestion review state via mappingId-based contract
- behavior does not depend solely on transient navigation state

### AE-14 — Unsupported auto-map-at-create is handled explicitly

**Given**
- auto-map post-create callable path is unavailable/gated

**When**
- page renders Start From options

**Then**
- option is disabled or explicitly marked future
- no fake suggestion generation occurs

### AE-15 — AI suggestions remain non-committed by default

**Given**
- auto-map suggestions are generated

**When**
- editor opens

**Then**
- suggestions are review artifacts
- suggestions are not auto-accepted into committed mapping rules

### AE-17 — Required field count source precedence is honored

**Given**
- selected schema has mixed availability of summary sources

**When**
- required field count is rendered on schema cards/summary

**Then**
- UI uses normalized schema summary source precedence:
  1) metadata `requiredFieldCount` when present
  2) normalized parsed-node required leaf count
  3) `—` fallback when unavailable
- no raw JSON Schema/XSD required-count parsing is implemented inside Create Mapping page

### AE-16 — Page excludes explicitly out-of-scope feature surfaces

**Given**
- create mapping page loads

**When**
- user inspects UI sections

**Then**
- no tags, template mode, deploy actions, diagnostics/test-lab/rule-builder surfaces are present

---

## Open Questions

- none

---

## Verification Strategy

- Component tests for `CreateMappingPage` covering AE-01 through AE-12, AE-16, and AE-17.
- Integration-oriented UI tests for add-schema in-card flow and auto-selection (AE-06, AE-07).
- UI integration tests for Start From mode branching, button labels, and submission payload behavior (AE-10 to AE-14, AE-13a).
- Adapter/backend tests covering businessContext create payload + storage/read-back behavior.
- Auto-map create-time orchestration tests covering mappingId-based pending-session handoff and non-auto-accept semantics.
- Quality gates for touched areas:
  - UI: lint + typecheck + targeted Vitest
  - Backend (if touched): lint + typecheck + targeted lambda/api tests

---

## Task Generation Notes

- Split tasks by execution domain:
  - UI tasks for layout, interactions, validation, add-schema UX, create flow branching, and UI tests.
  - Task-agent tasks for domain contract/model/backend changes (business context persistence + create-time mappingId-based suggestion-session orchestration contract).
- Keep create-page redesign atomic from backend contract updates where possible; use explicit gated fallback only when backend path is not yet available.
- Include explicit architecture update task because this spec changes documented Create Mapping behavior within existing UI subsystem and may extend backend create-mapping contract.
- Ensure task sequencing isolates risk:
  1) UI structural replacement,
  2) schema card + add flow integration,
  3) start-mode + submission behavior,
  4) contract updates (if required),
  5) tests,
  6) architecture updates.

---

## Change Log

- Rev 1 — 2026-06-07
  - Initial draft
- Rev 2 — 2026-06-08
  - Resolved Q1: Business Context must persist immediately as mapping metadata (`businessContext?: string` preferred; `description` only if semantically equivalent). UI-only retention is temporary fallback only with explicit technical-debt follow-up.
  - Resolved Q2: Canonical auto-map-at-create handoff is mappingId-based pending suggestion session state with re-entry-safe editor detection; navigation state is temporary Phase 0 fallback only.
  - Resolved Q3: Required-field counts must use normalized schema summary source precedence (metadata `requiredFieldCount` -> normalized parsed-node required-leaf count -> `—`) and must not parse raw JSON Schema/XSD in Create Mapping page.
