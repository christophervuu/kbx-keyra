# SPEC

## Title

Redesign Project Overview into mapping-first workspace aligned to FS-084 app shell style

---

## ID

FS-085  
Assigned sequentially. `FS` = Feature Spec.

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-06  
Last Updated: 2026-06-06  
Type: cross-cutting

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

Redesign the Project Overview page so it matches the FS-084 dark sidebar app-shell style and prioritizes mappings as the main workspace function. The page should move from dense project administration layout toward a clear hierarchy: project identity, mappings-first table, and secondary right-rail context for deployment activity and schemas. Breadcrumbs must be standardized to hierarchy-based patterns across Project, Mapping, and Mapping Deployment pages, while preserving current routing constraints. Success is reduced visual noise, clearer mapping actions, and a faster path to opening/creating/deploying mappings in support of TTFSM.

---

## Problem

Current Project Overview composition still reflects older dashboard information architecture and overemphasizes secondary content. It includes competing sections (continue card, tags, summary strip, full schema management grid) that dilute the core user task of opening/creating/managing mappings. Deployment status presentation is fragmented (environment badges and stale wording) and action clusters are icon-dense. Breadcrumb behavior is currently path-derived and can produce structurally awkward or misleading navigation segments (e.g., clickable intermediate paths that are not real routes).

---

## Goal

Provide a mapping-focused Project Overview workspace with Dashboard-consistent styling, explicit hierarchy, and standardized breadcrumbs so users can immediately understand project context, select the right mapping action, and access deployment/schema context without losing focus.

---

## Assumptions

- Existing route paths remain unchanged (`/projects/:projectId`, `/projects/:projectId/mappings/:mappingId`, `/projects/:projectId/mappings/:mappingId/deploy`, `/projects/:projectId/deployments`).
- Project Deployments route may remain lightweight/placeholder; this spec only requires navigation cleanup and right-rail CTA wiring.
- Existing deployment APIs for per-mapping current/history remain as-is; no new backend deployment activity endpoint is required.
- Existing project/mapping/schema data models remain reusable; UI derives new display states from existing fields where possible.
- FS-084 app-shell/sidebar work is already available and should be reused.

---

## Current Context

Repository findings relevant to this work:

- `ui/src/features/projects/components/ProjectOverviewPage.tsx` currently renders header + summary row + mappings section + full schema management section in a single-column stack.
- `ProjectHeader.tsx` currently shows inline editable tags in default overview, which conflicts with requested tag de-emphasis.
- `MappingListSection.tsx` currently includes a "Continue where you left off" card and a table header that dedicates three Deploy columns (`DEV/QA/PROD` via `colSpan={3}`).
- `MappingRow.tsx` currently renders stale as visible label and uses icon-dense row actions (edit/test/deploy/duplicate/delete) rather than simplified visible actions.
- `ProjectSummaryRow.tsx` currently renders stale/ready deployment placeholder metrics and a full-width horizontal stats treatment targeted for removal/compaction.
- `SchemaManagementSection.tsx` currently renders as a large default card grid in the main content flow.
- Breadcrumbs are currently path-derived in `ui/src/components/layout/Breadcrumbs.tsx` and link all intermediate segments, including non-real routes.
- Architecture coverage already exists for UI shell/routing/project surfaces in `forge/architecture/ui-application.md`; this is architecture impact on an existing subsystem (no new subsystem doc required).

Related in-progress specs checked in `forge/active/`:
- FS-019, FS-081, FS-082, FS-083 are active but not direct blockers for this UI redesign.

---

## Scope

### In Scope

- Redesign Project Overview hierarchy and visual composition to align with FS-084 shell/dashboard style.
- Simplify project header to name, description, created/modified dates, summary line, and primary actions.
- Remove/hide low-value default sections (continue card, visible tags/add tag control, full-width stats strip, duplicate create actions, dense action clusters).
- Make Mappings panel the dominant main column, with table columns: Name, Source → Target, Rules, Coverage, Status, Deployment, Last Modified, Actions.
- Wire mappings search now (name and/or source/target schema); defer new status-filter work unless existing primitives are trivial to reuse.
- Move current deployment state into mapping-row Deployment cell; prefer compact single deployment label/state for overview.
- Simplify mapping row visible actions using status-based next actions:
  - Draft: Open primary, hide Deploy
  - Ready: Open + Deploy
  - Has Errors: Fix primary, hide Deploy
- Avoid disabled Deploy buttons on Project Overview for this iteration.
- Add right rail with Deployment Activity card and compact Schemas card.
- Implement polished deployment-activity empty state when no data source exists.
- Keep project-level actions available: Create Mapping, Add Schema, View Deployments, Manage Schemas.
- Standardize breadcrumbs across Project, Mapping, Mapping Deployment, and Project Deployments surfaces to hierarchy-based patterns.
- Preserve desktop-first side-by-side layout and responsive stack behavior for narrower widths.

### Out of Scope

- Backend implementation of a real project-level deployment activity feed.
- Inline deployment execution from Project Overview rows.
- New deployment runtime/orchestration behavior.
- Mapping Editor redesign beyond breadcrumb/title consistency touches.
- Full schema sync/publish workflow changes.
- New project tags product behavior (filtering/organization).
- New standalone deployment dashboard route creation if not already present.

---

## Non-Goals

- Implementing deploy/promote/rollback execution directly from Project Overview.
- Building AI suggestions, smart fixes, diagnostics expansion, or automap enhancements.
- Replacing the existing design system or introducing a new one.
- Broad mobile-first redesign beyond requested responsive behavior.

---

## Relevant Areas

- `ui/src/features/projects/components/ProjectOverviewPage.tsx`
- `ui/src/features/projects/components/ProjectHeader.tsx`
- `ui/src/features/projects/components/ProjectSummaryRow.tsx`
- `ui/src/features/projects/components/MappingListSection.tsx`
- `ui/src/features/projects/components/MappingRow.tsx`
- `ui/src/features/projects/components/SchemaManagementSection.tsx`
- `ui/src/features/projects/hooks/use-project-overview.ts`
- `ui/src/features/projects/types.ts`
- `ui/src/components/layout/Breadcrumbs.tsx`
- `ui/src/components/layout/BreadcrumbContext.tsx` ?
- `ui/src/routes/paths.ts`
- `ui/src/routes/pages/ProjectOverview.tsx`
- `ui/src/routes/pages/MappingEditor.tsx`
- `ui/src/routes/pages/MappingDeployment.tsx`
- `ui/src/routes/pages/ProjectDeployments.tsx`
- `ui/src/components/layout/layout.test.tsx`
- `ui/src/features/projects/components/__tests__/*` ?
- `forge/architecture/ui-application.md`
- `forge/architecture/INDEX.md`

---

## Dependencies / Blockers

- Depends on existing FS-084 shell conventions being present and stable.
- No hard blocker on FS-081/082/083 backend completion because this spec explicitly allows placeholder deployment-activity content.

---

## Constraints

- Must preserve existing route paths and route ownership.
- Must not introduce backend dependencies for deployment activity feed where none currently exist.
- Must keep mappings as the dominant visual/interaction area.
- Must keep schemas and deployment context visible but secondary.
- Must avoid duplicate primary Create Mapping actions.
- Must not expose tag chips/Add tag UI in default Project Overview.
- Must use display wording "Changed since deploy" or "Out of date" instead of exposing "stale" as the primary user-facing label.
- Must keep "Deploy" action as navigation to deployment page, not execution.
- Must align visual style with FS-084 app shell (dark workspace, subtle borders, rounded panels, muted secondary text, blue primary action treatment).

---

## Proposed Behavior

### User Flow

1. User opens Project Overview and sees hierarchy-first layout: breadcrumb, compact project header, mappings-dominant main column, right rail with deployment activity + schemas.
2. User immediately scans/searches mappings and uses Open or Deploy navigation actions from row-level actions.
3. User reads deployment state directly within each mapping row and uses right-rail Deployment Activity for recent context.
4. User accesses schema context from compact right-rail schema rows and clicks Manage schemas to open deeper schema management surface (via simplest compatible interaction).
5. User navigates across Project/Mapping/Deployment pages with consistent hierarchy-based breadcrumbs.

### System Behavior

- Project header shows project identity metadata and compact summary line (`{mappings} mappings · {schemas} schemas · {errors} errors`).
- Default overview no longer renders continue-card, visible tag controls, or large schema grid as primary content.
- Mapping table renders operational columns with one compact Deployment column (state summary label) and a search control (name/source/target matching).
- Mapping deploy-state derivation maps backend/internal stale semantics to user-friendly labels (e.g., `Changed since deploy`).
- Row actions are status-based and show the next useful action without disabled Deploy states:
  - `draft` -> Open primary, no Deploy
  - `ready` -> Open + Deploy
  - `has-errors` -> Fix primary (to editor), no Deploy
  - Less-common actions remain in overflow.
- Right rail renders Deployment Activity card with deterministic empty placeholder if no data exists.
- Right rail renders compact schema list rows with origin + format + field count and Manage schemas CTA.
- Manage schemas action uses this priority:
  1. Scroll to existing full schema management section lower on Project Overview.
  2. If default visibility conflicts with compact redesign, keep section collapsed by default and expand inline from Manage schemas.
  3. Do not introduce drawer/new route unless that pattern already exists in current codebase.
- Breadcrumb rendering becomes hierarchy-driven with explicit label mapping for static segments (`Projects`, `Mappings`, `Deployment`, `Deployments`) and controlled clickability for non-route segments; `Projects` is non-clickable until `/projects` exists.

### Failure / Edge Behavior

- If deployment activity data is unavailable, Deployment Activity card shows polished empty state copy and functional View deployments CTA.
- If mapping has never been deployed, Deployment cell shows `Not deployed`.
- If mapping has deployment-invalid status or errors, row actions should surface `Fix` (navigate to editor) and hide Deploy rather than showing disabled Deploy.
- If schema metadata is partially unavailable, schema row still renders name with fallback metadata labels without breaking panel layout.
- If right rail cannot fit at narrower widths, it stacks below mappings while preserving panel order and action visibility.

---

## Acceptance Examples

### AE-01 — Project overview hierarchy matches dashboard-aligned workspace

**Given**
- user opens `/projects/:projectId`

**When**
- Project Overview loads

**Then**
- page uses FS-084-aligned dark workspace visual style
- project header appears before content
- mappings panel is visually dominant in main column
- right rail is secondary and contains deployment activity + schemas

### AE-02 — Simplified project header with compact summary

**Given**
- project has name, description, created/updated timestamps, mapping/schema/error counts

**When**
- header renders

**Then**
- name, description, dates, and compact summary line are visible
- primary actions include Create Mapping and Add Schema (+ overflow)
- default tag chip/add-tag UI is not shown

### AE-03 — Low-value legacy sections are removed from default view

**Given**
- prior overview contained continue card, stats strip, dense duplicate controls, large schema grid

**When**
- redesigned overview renders

**Then**
- continue card is removed
- full-width stats strip is removed/replaced by compact summary
- duplicate Create Mapping CTA is removed
- schema management is not shown as the large default main content block

### AE-04 — Mapping table is primary operational surface

**Given**
- project has mappings

**When**
- mappings section renders

**Then**
- table columns include Name, Source → Target, Rules, Coverage, Status, Deployment, Last Modified, Actions
- table supports search by mapping name and/or source/target schema
- status filter is deferred unless existing filter primitives are already easy to reuse
- mappings are the dominant interaction surface of the page

### AE-05 — Deployment state is shown in mapping row and stale wording is normalized

**Given**
- mapping has deployment state (deployed/not deployed/changed since deploy/deploying/blocked)

**When**
- row renders

**Then**
- Deployment column shows compact state in-row
- user-facing label does not rely on the word `stale`
- changed-after-deploy state appears as `Changed since deploy` or `Out of date`

### AE-06 — Mapping row actions are simplified and deploy is navigational

**Given**
- mapping row is visible

**When**
- user uses row actions

**Then**
- Draft rows: Open is primary and Deploy is hidden
- Ready rows: Open and Deploy are visible
- Has Errors rows: Fix is primary and Deploy is hidden
- Open/Fix navigate to mapping editor (Fix may land in diagnostics-focused context if already supported)
- Deploy navigates to mapping deployment page
- no inline deployment is executed from Project Overview

### AE-07 — Right rail deployment activity card provides clear empty state and navigation

**Given**
- no deployment activity feed data exists

**When**
- right rail renders

**Then**
- Deployment Activity card shows polished empty message and guidance text
- View deployments CTA navigates to project deployments route if available

### AE-08 — Right rail schemas card is compact and informative

**Given**
- project has linked schemas

**When**
- right rail schemas card renders

**Then**
- card shows linked schema count and origin summary
- schema rows show name, origin (e.g., CDM/Local), format label (`JSON` not `JSON Schema`), and field count
- Manage schemas action opens deeper schema management via the simplest compatible existing path

### AE-09 — Breadcrumbs follow app hierarchy, not page-title style

**Given**
- user navigates project/mapping/deployment surfaces

**When**
- breadcrumbs render

**Then**
- hierarchy patterns are:
  - `Home / Projects / {projectName}`
  - `Home / Projects / {projectName} / Mappings / {mappingName}`
  - `Home / Projects / {projectName} / Mappings / {mappingName} / Deployment`
  - `Home / Projects / {projectName} / Deployments`
- breadcrumb segments answer structural location and avoid misleading links for non-real routes
- `Projects` segment is rendered as non-clickable until a real `/projects` route exists

### AE-10 — Responsive behavior preserves hierarchy

**Given**
- viewport narrows below desktop side-by-side threshold

**When**
- overview layout reflows

**Then**
- right rail stacks below mappings
- mapping table remains usable (horizontal scroll or existing responsive handling)
- sidebar behavior remains consistent with FS-084 shell

---

## Open Questions

- none

---

## Verification Strategy

- Automated UI/component tests for Project Overview composition and behavior:
  - AE-01, AE-02, AE-03, AE-04, AE-05, AE-06, AE-07, AE-08, AE-10
- Automated layout/breadcrumb tests for hierarchy and clickability rules:
  - AE-09
- Manual verification:
  - visual hierarchy and style alignment versus FS-084 shell/dashboard direction
  - desktop and narrower-width responsive behavior
  - row action navigation correctness (Open/Deploy)
  - deployment activity placeholder quality and schema card compactness
- Quality gates:
  - `pnpm --filter ui test`
  - `pnpm --filter ui typecheck`
  - `pnpm --filter ui lint` (if configured)

---

## Task Generation Notes

- Decompose into separate UI tasks for: breadcrumb standardization, header/overview hierarchy cleanup, mapping table+row behavior (including status-based actions and search), right-rail cards/manage-schemas behavior, and regression test updates.
- Keep architecture update as an explicit standalone task (`Agent: task`) updating existing `forge/architecture/ui-application.md` and `INDEX.md`.
- Do not create a new architecture document; this is an update to existing UI subsystem coverage.
- Questions for deploy gating/manage-schemas/search scope/breadcrumb clickability are resolved in Rev 2 and reflected in tasks.

---

## Change Log

- Rev 1 — 2026-06-06
  - Initial draft
- Rev 2 — 2026-06-06
  - Resolved Q1 with status-based row actions: Draft=Open, Ready=Open+Deploy, Has Errors=Fix; hide Deploy when not useful; no disabled Deploy buttons.
  - Resolved Q2 with Manage schemas priority: scroll-to-existing section first, otherwise collapsed-inline expand; no new drawer/route unless already established.
  - Resolved Q3 by scoping to search now and deferring status filter unless existing primitives are easy to reuse.
  - Resolved Q4 by making `Projects` breadcrumb non-clickable until a real `/projects` route exists.

---

## Supersession Note

FS-085 captured an interim Project Overview direction that used a right-rail default (Deployment Activity + Schemas) and related layout assumptions.

That default is **superseded by FS-086** as the current canonical baseline for `/projects/:projectId`:

- single-column mappings-first workspace
- no right rail
- no Project Overview Deployment Activity card
- no always-visible schema section/grid in default view
- linked schemas accessed on-demand from the project-summary interaction

FS-085 remains historical planning context and should not be treated as the current default layout contract.
