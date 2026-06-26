# SPEC

## Title

Simplify Project Overview into full-width mapping workspace after dashboard/sidebar redesign

---

## ID

FS-086  
Assigned sequentially. `FS` = Feature Spec.

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-06  
Last Updated: 2026-06-06  
Type: ui

If unknown during early drafting, use `TBD`.

`Type` indicates the primary execution domain. Used to route tasks to the correct agent (`task` or `ui-task`). Cross-cutting specs may produce tasks of mixed types — declare the type per task in that case.

---

## Status

draft

- `draft` = initial spec created, not yet refined
- `refining` = questions, tradeoffs, or repo grounding still being resolved
- `ready` = refined enough for reliable task generation and planning review
- `in_progress` = one or more tasks are being executed
- `completed` = implementation and verification finished
- `archived` = retired, replaced, or no longer relevant

This status tracks the overall lifecycle of the change, not just document editing.

This spec becomes part of the planning package together with its derived task set.

---

## Revision

Rev: 2

Rev bump required when any of the following materially change:

- intended behavior
- scope boundaries
- acceptance examples
- verification expectations
- materially affected system areas

See `Change Log` for revision history.

---

## Summary

Simplify the Project Overview page so the mapping table gets full usable width and the page feels like a focused mapping workspace instead of an administrative dashboard. Remove the right rail (Deployment Activity + Schemas cards) and remove the always-visible bottom schema section from the default layout. Keep schema access available via a lightweight linked-schemas interaction from the project summary, while preserving Create Mapping / Add Schema flows and current deploy navigation behavior from mapping rows.

---

## Problem

After the recent dashboard/sidebar and Project Overview redesign, the right rail consumes too much horizontal space and makes the mapping table harder to use: Source → Target wraps too aggressively, row content truncates, and the Actions column loses room. This directly hurts the core Project Overview task (open/create/review/deploy mappings) and increases friction against TTFSM (Time to First Successful Mapping). Secondary information (deployment activity and schema management cards) currently competes with the primary workflow.

---

## Goal

Deliver a simpler Project Overview that prioritizes mappings by default: breadcrumb + project header + full-width mappings section, with schemas available on-demand through a lightweight interaction. The page should preserve existing mapping/deploy navigation behavior and core actions, while improving mapping row readability and reducing visual clutter.

---

## Assumptions

- Existing data-fetching hooks for project, mappings, deployment metadata, and linked schemas remain reusable.
- Existing Create Mapping and Add Schema actions/flows already exist and can be reused without backend changes.
- Existing deploy route/navigation for mappings remains unchanged.
- A shared modal/dialog primitive likely already exists in the UI component stack and should be reused rather than introducing a new modal system.
- This change is UI/layout composition only; no schema data model or deployment orchestration model change is required.

---

## Current Context

Repository findings:

- `ui/src/features/projects/components/ProjectOverviewPage.tsx` currently renders a two-column layout with a right rail containing `Deployment Activity` and `Schemas` cards.
- `ProjectOverviewPage.tsx` also keeps a full `SchemaManagementSection` lower on the page as the default management surface.
- `MappingListSection.tsx` and `MappingRow.tsx` currently drive the mappings table and row actions; this is the primary surface impacted by available width.
- `ProjectHeader.tsx` and project summary text already carry metadata/action controls and can host the linked-schema interaction trigger.
- `ui-application.md` already has architecture coverage for Project Overview patterns (including FS-085’s mappings-first + right rail contracts), so this spec updates an existing subsystem architecture document rather than introducing a new subsystem.

Related in-progress specs checked (`forge/active`): FS-019, FS-081, FS-082, FS-083, FS-085.  
Most relevant overlap is FS-085 (Project Overview with right rail). FS-086 intentionally supersedes that layout direction for this iteration by removing right rail/default schema grid and emphasizing full-width mappings.

---

## Scope

### In Scope

- Remove Project Overview right rail from default layout.
- Remove Project Overview Deployment Activity card from this page.
- Remove always-visible bottom schema card grid/section from default page state.
- Convert Project Overview to single-column main flow:
  1. Breadcrumb
  2. Project header
  3. Full-width mappings section
- Keep linked schemas accessible via lightweight interaction from project summary (`{N} linked schemas`) with this implementation order:
  1. existing shared Dialog/modal component,
  2. existing accessible third-party/wrapper modal already used by the app,
  3. minimal inline expansion fallback if no modal primitive is available.
- Do not introduce a new custom modal infrastructure in this spec.
- In linked schemas interaction, show compact list rows with:
  - schema name
  - origin if useful (e.g., CDM, Uploaded)
  - simplified format label (JSON/XML/XSD/Inferred JSON/Inferred XML)
  - field count
  - usage count
- Preserve Create Mapping and Add Schema actions in project header.
- If linked schemas interaction includes Add Schema button, it must invoke the same existing Add Schema behavior.
- Preserve row-level Deployment column visibility and Deploy navigation behavior.
- Keep simplified row action behavior:
  - Draft → Open primary, hide Deploy
  - Ready → Open + Deploy
  - Has Errors → Fix primary (if supported) else Open; hide Deploy
- Avoid inline deployment execution and avoid disabled Deploy buttons in this iteration.
- Maintain standardized breadcrumb pattern: `Home / Projects / {projectName}` with non-clickable `Projects` segment when `/projects` route does not exist.
- Improve mapping table readability by using full available width and reducing avoidable truncation/wrapping.

### Out of Scope

- Mapping Editor redesign.
- Real deployment activity feed/tracking on Project Overview.
- Inline deploy/promote/rollback actions on Project Overview.
- New full project deployment dashboard.
- Schema GitHub sync behavior changes.
- Global/project schema data-model simplification.
- Backend API/Lambda/data-layer changes for this spec.

---

## Non-Goals

- Reworking deployment orchestration or environment promotion semantics.
- Introducing new schema creation/linking workflows.
- Redesigning schema library/detail pages.
- Changing routes or ownership of mapping deployment pages.

---

## Relevant Areas

- `ui/src/features/projects/components/ProjectOverviewPage.tsx`
- `ui/src/features/projects/components/ProjectHeader.tsx`
- `ui/src/features/projects/components/ProjectSummaryRow.tsx` ?
- `ui/src/features/projects/components/MappingListSection.tsx`
- `ui/src/features/projects/components/MappingRow.tsx`
- `ui/src/features/projects/components/SchemaManagementSection.tsx`
- `ui/src/features/projects/components/__tests__/ProjectOverviewPage.test.tsx`
- `ui/src/features/projects/components/__tests__/MappingListSection.test.tsx`
- `ui/src/features/projects/components/__tests__/ProjectSummaryRow.test.tsx` ?
- `ui/src/components/layout/Breadcrumbs.tsx`
- `ui/src/components/layout/layout.test.tsx` ?
- `forge/architecture/ui-application.md`
- `forge/architecture/INDEX.md`

---

## Dependencies / Blockers

- Depends on existing FS-084/FS-085-era shell and Project Overview components already present in `ui/`.
- No backend blocker expected; this spec explicitly removes deployment activity surface instead of requiring new deployment APIs.

---

## Constraints

- Must preserve existing Create Mapping and Add Schema flows.
- Must preserve mapping row Deploy as navigation to Mapping Deployment page only (no inline deploy).
- Must preserve row-level Deployment column in mappings table.
- Must not show Deployment Activity card or placeholders on Project Overview.
- Must not show always-visible bottom schema card grid on default Project Overview.
- Must keep schema access discoverable from project summary via lightweight interaction.
- Must use simplified user-facing schema format labels (e.g., JSON not JSON Schema).
- Must stay visually consistent with current dashboard/sidebar dark-theme design language.
- Must avoid route changes unless strictly required for existing behavior parity.

---

## Proposed Behavior

### User Flow

1. User opens Project Overview.
2. User sees breadcrumb, project header, and a full-width Mappings section as the dominant workspace.
3. User scans/searches mappings with improved horizontal room and visible row actions.
4. User clicks `{N} linked schemas` in summary to open a lightweight schemas list (modal preferred).
5. User can click Add Schema from header (and optionally from schemas interaction) to enter existing add/link flow.
6. User clicks Deploy on eligible mapping rows and is navigated to Mapping Deployment page.

### System Behavior

- Project Overview layout becomes single-column after header; right rail is removed.
- Deployment Activity and right-rail Schemas cards are removed from default page composition.
- Always-visible lower schema card grid is removed from default page composition.
- Linked schemas become an on-demand UI surface, populated from existing linked schema data.
- Linked schemas list uses compact textual rows (not large cards).
- JSON schemas are displayed with `JSON` label; avoid `JSON Schema` in this surface.
- Linked schemas interaction should reuse canonical app modal/dialog behavior where available, including expected accessibility behaviors (focus trap, Escape close, keyboard-reachable actions, accessible title/label, and focus return to linked-schemas trigger on close).
- Mapping row actions obey status gating described in scope and keep Deploy as route navigation only.
- Breadcrumb remains `Home / Projects / {projectName}` and respects route-reality clickability rule for `Projects`.

### Failure / Edge Behavior

- If project has zero linked schemas, interaction still opens and shows empty-state copy with Add Schema CTA.
- If linked schema metadata is partial, list still renders name with available fallback values (`Unknown format`, `0 fields`, `Not used`).
- If modal pattern is unavailable in current component stack, fallback to compact inline expansion without changing data model.
- Backdrop-click close behavior should match whichever existing modal primitive is reused.
- If no `/projects` route exists, `Projects` breadcrumb text is rendered but non-clickable.

---

## Acceptance Examples

### AE-01 — Project Overview has no right rail

**Given**
- user opens `/projects/:projectId`

**When**
- Project Overview renders

**Then**
- no right rail is shown
- no `Deployment Activity` card is shown
- no right-rail `Schemas` card is shown

### AE-02 — Full-width mappings workspace

**Given**
- Project Overview contains mappings

**When**
- mappings section renders

**Then**
- mappings table uses full available content width
- Source → Target and Actions columns remain readable/usable
- rows are not unnecessarily width-constrained by side rail layout

### AE-03 — Bottom schema grid not shown by default

**Given**
- project has linked schemas

**When**
- Project Overview loads

**Then**
- always-visible bottom schema card grid is not rendered in default view

### AE-04 — Linked schemas accessible via lightweight interaction

**Given**
- project summary displays `N linked schemas`

**When**
- user clicks linked schema count

**Then**
- user can view linked schemas in a lightweight surface (modal preferred, drawer/inline acceptable)
- each schema shows name, origin (if useful), format, field count, and usage count
- schema labels use simplified format names (e.g., `JSON`, not `JSON Schema`)

### AE-05 — Row actions preserve deploy-navigation rules

**Given**
- mappings with statuses Draft, Ready, and Has Errors exist

**When**
- rows render in Project Overview

**Then**
- Draft row shows Open and hides Deploy
- Ready row shows Open and Deploy
- Has Errors row shows Fix if supported, otherwise Open; hides Deploy
- clicking Deploy navigates to Mapping Deployment page (no inline deployment)

### AE-06 — Header actions remain intact

**Given**
- user is on Project Overview

**When**
- user clicks Create Mapping or Add Schema

**Then**
- existing create mapping flow opens
- existing add/link schema flow opens

### AE-07 — Breadcrumb pattern preserved

**Given**
- Project Overview breadcrumb is shown

**When**
- breadcrumb renders

**Then**
- pattern is `Home / Projects / {projectName}`
- if `/projects` route does not exist, `Projects` segment is non-clickable

---

## Open Questions

- none

---

## Verification Strategy

- Automated UI component tests:
  - Cover AE-01/AE-03 with ProjectOverview layout assertions (right rail and default schema grid absent).
  - Cover AE-02 with table structure/readability-oriented assertions (column presence and no side-rail wrapper).
  - Cover AE-04 with linked schema interaction open/close, content rows, and simplified format labels.
  - Cover AE-05 with row action visibility by status and Deploy navigation intent.
  - Cover AE-06 with Create Mapping/Add Schema callback/route behavior.
  - Cover AE-07 with breadcrumb pattern and non-clickable `Projects` when route absent.
- Manual visual QA in running UI for spacing/readability and dark-theme consistency at desktop widths.
- Standard quality gates for touched UI package: lint, typecheck, targeted tests (or full UI test suite per repo norms).

---

## Task Generation Notes

- Decompose into UI composition + interaction + behavior + tests, then architecture-documentation update.
- Keep row-action logic and deployment navigation verification separated from layout/container refactor to reduce risk.
- Include explicit architecture update task (`Agent: task`) for `forge/architecture/ui-application.md` and `INDEX.md` because this spec materially changes documented Project Overview architecture (removes right rail/default schema section from default state).
- Include explicit housekeeping task (`Agent: task`) to retire/supersede FS-085 right-rail references across active spec notes and architecture/UI reference docs so future agents do not reintroduce outdated layout assumptions.
- If implementation chooses non-modal fallback for linked schemas, ensure acceptance language remains satisfied and document rationale in task notes.

---

## Change Log

Each revision entry should state what changed and why.

- Rev 1 — 2026-06-06
  - Initial draft
- Rev 2 — 2026-06-06
  - Resolved Q1: explicit housekeeping task is required to retire/supersede FS-085 right-rail Project Overview direction in planning/docs.
  - Resolved Q2: linked schemas interaction must reuse canonical existing modal/dialog primitive where available, with defined fallback order and accessibility expectations.
  - Resolved Q3: `Has Errors` row action behavior clarified to prefer `Fix` only if already supported; otherwise `Open` is accepted fallback, with `Deploy` hidden.
