# SPEC

## Title

FS-078 — Consistent CDM UX Across Project Overview / Schema Library / Schema Detail

---

## ID

FS-078

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-02  
Last Updated: 2026-06-02  
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Unify CDM status language, origin labeling, and read-only action behavior across Project Overview, Schema Library, and Schema Detail so the same schema record is interpreted the same way everywhere. This spec standardizes visible labels, status indicators, allowed/disallowed actions, and list/detail state handling for CDM-origin schemas. Success means users can reliably trust CDM provenance and sync state without cross-screen contradictions.

---

## Problem

CDM schemas currently render inconsistent origin labels, sync-state copy, and action affordances across surfaces. A schema can appear to be in different states or allow different actions depending on where it is viewed, creating confusion and potential deployment/maintenance risk.

---

## Goal

Establish one canonical CDM UX contract across Project Overview, Schema Library, and Schema Detail:

1. Same origin label and badge meaning on every surface.
2. Same sync-state indicators for the same schema record.
3. Same CDM action policy by surface context.
4. Schema Detail strictly read-only for CDM schemas.
5. Consistent loading/empty/error states for CDM list/detail flows.

---

## Assumptions

- FS-076 (CDM foundation) and FS-077 (CDM re-sync re-ingestion) define underlying CDM data and re-sync behavior contracts.
- `origin='cdm'` remains the canonical record-level provenance marker.
- Backend/API will expose canonical CDM `syncStatus` values only (`synced`, `update-available`, `sync-failed`).
- Existing non-CDM behavior remains unchanged unless explicitly needed to preserve shared-component compatibility.

---

## Current Context

- Related active specs already exist and are in draft: `forge/active/FS-076/spec.md` and `forge/active/FS-077/spec.md`.
- Existing UI code has divergent status/origin/action logic across:
  - `ui/src/features/projects/components/SchemaCard.tsx`
  - `ui/src/features/schemas/components/SchemaLibraryCard.tsx`
  - `ui/src/features/schemas/components/SchemaGitStatus.tsx`
  - `ui/src/features/schemas/components/SchemaActions.tsx`
  - `ui/src/features/schemas/components/SchemaDetailPage.tsx`
- Current status vocab in UI types/components still includes legacy values (`not-synced`, `local-changes`) in key paths, which conflicts with CDM-specific states introduced by FS-076/FS-077.
- Architecture coverage exists for this subsystem area (`forge/architecture/ui-application.md`, `forge/architecture/backend-api.md`), so no new architecture document bootstrap is required.

---

## Scope

### In Scope

- Canonical CDM origin label across all three surfaces: `CDM (KBXT/KBX-Canonicals)`.
- Canonical CDM sync indicators across all three surfaces:
  - `✓ Synced`
  - `⚠ Update available`
  - `⚠ Sync failed`
- Canonical CDM action policy by surface:
  - **Project Overview:** View, Re-sync, Unlink
  - **Schema Detail:** View, Re-sync
  - **Schema Library:** navigation-first (no inline Re-sync action on cards)
- CDM disallowed actions: Edit, Replace, Remove, Publish, Promote to Global.
- Mixed disallowed-action strategy:
  - hide in dense card/table contexts
  - disable + tooltip where discoverability/learnability is important
- Strict read-only Schema Detail behavior for CDM origin.
- Standardized loading/empty/error states for CDM list/detail/re-sync flows.
- Backend canonical normalization of legacy sync statuses so UI renders canonical enum only.

### Out of Scope

- Global visual redesign or typography/color-system overhaul.
- Broad non-CDM action-policy harmonization.
- Adding deploy actions into Mapping Editor.
- Backend re-ingestion internals already covered by FS-077 (this spec consumes resulting status signals).

---

## Non-Goals

- Replacing existing schema information architecture beyond CDM consistency requirements.
- Redesigning permissions/auth models.
- Introducing new CDM lifecycle actions beyond View/Re-sync/Unlink.

---

## Relevant Areas

- `ui/src/lib/types/domain.ts`
- `ui/src/features/projects/components/SchemaCard.tsx`
- `ui/src/features/projects/components/SchemaManagementSection.tsx` ?
- `ui/src/features/schemas/types.ts`
- `ui/src/features/schemas/components/SchemaLibraryCard.tsx`
- `ui/src/features/schemas/components/SchemaLibraryPage.tsx` ?
- `ui/src/features/schemas/components/SchemaGitStatus.tsx`
- `ui/src/features/schemas/components/SchemaActions.tsx`
- `ui/src/features/schemas/components/SchemaDetailPage.tsx`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/http-adapter.ts` ?
- `src/lambda/schema/*.ts` (canonical status normalization)
- `tests/ui/**` and `ui/src/features/**/__tests__/*.test.tsx`
- `tests/lambda/schema/**/*.test.ts` ?
- `forge/architecture/ui-application.md`
- `forge/architecture/backend-api.md`

---

## Dependencies / Blockers

- Depends on CDM foundational contract availability from FS-076.
- Depends on re-sync result/status semantics from FS-077.
- Backend status normalization must land before UI fully enforces canonical enum rendering.

---

## Constraints

- Accessibility requirements from product spec apply (including icon+text status readability).
- Labels must remain concise and explainable.
- No deploy actions added in Mapping Editor.
- Disallowed CDM actions must be hidden/disabled with clear rationale according to the mixed strategy.
- Schema Detail for CDM must not permit metadata/content mutation.
- Unlink remains project-contextual only (Project Overview), not Schema Detail.

---

## Proposed Behavior

### User Flow

1. User views a CDM schema in Project Overview, Schema Library, or Schema Detail.
2. User sees the same origin label and status badge text on each surface for the same record.
3. User interacts with actions according to surface policy:
   - Project Overview: View, Re-sync, Unlink
   - Schema Detail: View, Re-sync
   - Schema Library: navigate to detail/project context for actions
4. On Schema Detail, editing/replacement/publish/promote/remove affordances are blocked by read-only policy.
5. On Re-sync invocation (Project Overview or Schema Detail), status transitions and feedback follow the same copy and semantics.

### System Behavior

- Introduce/align shared CDM presentation contract in UI domain types and rendering helpers:
  - canonical origin display text for `origin='cdm'`
  - canonical mapping from canonical backend `syncStatus` enum to UI badge text/icon
  - canonical action-gating predicate by origin + surface context
- Backend responses normalize legacy/transitional statuses to canonical CDM enum before sending to UI.
- UI render paths consume canonical enum only (no local legacy mapping branch logic).
- Re-sync action is surfaced consistently in Project Overview and Schema Detail; Schema Library remains navigation-first.

### Failure / Edge Behavior

- Loading: each CDM-aware list/detail/re-sync surface uses consistent loading affordances and copy.
- Empty: if no CDM schemas are linked/present, empty-state copy is consistent and action-oriented.
- Error: failed CDM fetch/re-sync states render consistent error messaging and retry affordance where available.
- If backend encounters unknown legacy status values, it deterministically normalizes to canonical `sync-failed` for UI safety and consistency.

---

## Acceptance Examples

### AE-01 — Origin label consistency across all schema surfaces

**Given**
- A schema record with `origin='cdm'`

**When**
- The record is viewed in Project Overview, Schema Library, and Schema Detail

**Then**
- Each surface shows `CDM (KBXT/KBX-Canonicals)` as origin label/badge text
- No surface uses conflicting CDM origin copy

### AE-02 — Sync status consistency for same record

**Given**
- A CDM schema with sync status `update-available`

**When**
- The schema is rendered on Project Overview, Schema Library, and Schema Detail

**Then**
- Each surface shows `⚠ Update available`
- UI does not render legacy labels like `Not synced` / `Local changes` for CDM records

### AE-03 — CDM disallowed actions are blocked uniformly

**Given**
- A CDM schema is visible on schema-related surfaces

**When**
- Action controls are rendered

**Then**
- Edit, Replace, Remove, Publish, and Promote to Global are not available as executable actions
- Dense cards/tables hide disallowed actions
- Discoverability-oriented locations use disabled affordances with explanatory tooltips

### AE-04 — CDM allowed actions match surface context

**Given**
- A CDM schema is visible in Project Overview, Schema Library, and Schema Detail

**When**
- Actions are rendered

**Then**
- Project Overview exposes View, Re-sync, and Unlink
- Schema Detail exposes View and Re-sync only (no Unlink)
- Schema Library remains navigation-first with no inline Re-sync action on cards

### AE-05 — Schema Detail is strictly read-only for CDM

**Given**
- A user opens Schema Detail for a CDM schema

**When**
- Detail sections and actions render

**Then**
- Inline metadata editing is unavailable
- Tree edit mode and replace-file flows are unavailable
- Page communicates read-only CDM context clearly

### AE-06 — Standardized loading/empty/error state copy for CDM list/detail

**Given**
- CDM data is loading, empty, or failed for list/detail/re-sync flows

**When**
- UI renders transient/error states

**Then**
- Loading/empty/error states use standardized CDM-specific copy and layout patterns
- Retry affordance appears consistently on recoverable errors

### AE-07 — Re-sync action works consistently where surfaced

**Given**
- A CDM schema supports manual re-sync

**When**
- User triggers Re-sync from Project Overview or Schema Detail

**Then**
- Action labeling and pending/success/failure feedback are consistent
- Post-action status badge reflects backend result consistently across surfaces

---

## Open Questions

- none

---

## Verification Strategy

- **UI component tests**
  - AE-01/AE-02: assert canonical origin/status text across `SchemaCard`, `SchemaLibraryCard`, `SchemaGitStatus`/detail sections.
  - AE-03/AE-04/AE-05: action gating and read-only enforcement tests in `SchemaActions` + `SchemaDetailPage` + Project Overview schema section tests.
  - AE-06/AE-07: loading/empty/error/re-sync feedback tests in list/detail surfaces.
- **Adapter/API contract tests**
  - AE-02/AE-07: canonical status contract tests ensuring UI sees canonical enum only.
- **Backend tests (targeted if needed for mapping layer)**
  - verify schema list/detail/sync endpoints normalize legacy values and expose canonical CDM `syncStatus` values.
- **Quality gates**
  - typecheck + lint for touched UI/backend files.
  - targeted test suites for updated schema/project components and schema-related API contracts.

---

## Task Generation Notes

- This is cross-cutting and must be split by execution domain:
  - `ui-task`: UI rendering, action gating, surface-level state handling.
  - `task`: backend/API canonical status normalization, cross-surface verification, and architecture document updates.
- Decompose to keep backend contract alignment isolated before/alongside UI consistency rollout.
- Include explicit architecture update task because this spec changes behavior within existing UI/API architecture documents (`ui-application.md`, `backend-api.md`).

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Q1: Schema Library remains navigation-first; Re-sync is surfaced in Schema Detail and Project Overview context.
  - Resolved Q2: Mixed disallowed-action strategy adopted (hide in dense surfaces, disabled+tooltip where discoverability matters).
  - Resolved Q3: Legacy status normalization is backend-owned; UI renders canonical enum only.
  - Resolved Q4: Unlink is Project Overview only; not available in Schema Detail.

- Rev 1 — 2026-06-02
  - Initial draft
  - Added canonical CDM label/status/action policy requirements across Project Overview, Schema Library, and Schema Detail
  - Added standardized CDM loading/empty/error-state requirement and explicit read-only enforcement for Schema Detail
