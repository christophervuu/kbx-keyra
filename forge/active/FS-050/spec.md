# SPEC

## Title

Refine Project Overview UX and Information Architecture

---

## ID

FS-050

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-12
Last Updated: 2026-05-13
Type: ui

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Refine the KeyRa 2.0 Project Overview page to serve as a clear single-project operational hub that prioritizes mappings as the primary action surface, presents schemas as a managed secondary resource, provides read-only deployment visibility, and replaces raw UUIDs in navigation chrome with human-readable project names. The page should help users quickly answer: what mappings exist, which need attention, what is deployed or stale, which schemas are attached, and where to go next. Sections whose backend data pipeline is deferred should use stable placeholder/scaffold states. All changes optimize for TTFSM (Time to First Successful Mapping).

---

## Problem

The current Project Overview page (FS-013) has several UX and IA issues:

1. **Breadcrumbs display raw UUIDs** — the URL-derived breadcrumb shows the project's internal ID (e.g., `abc-123-uuid`) rather than the human-readable project name. This makes navigation confusing for non-technical users.
2. **Mappings are not the primary surface** — mappings appear as Section C (after metadata and schemas), despite being the most important action surface for TTFSM. Users must scroll past schemas to reach their primary work.
3. **No project-level status summary** — there is no compact summary that lets users quickly scan project health (mapping count, error count, deployment status). Users must visually inspect each mapping row to assess project state.
4. **Deployment visibility is limited** — DEV/QA/PROD badges on mapping rows always show "Not deployed" in Phase 0, and there is no project-level deployment summary. When deployment data arrives, the page has no aggregation surface.
5. **Schema section competes visually with mappings** — the schema grid uses the same visual weight as the mapping table, despite schemas being a supporting resource rather than the primary action surface.
6. **Project actions are in a dedicated section** — primary actions like "Create Mapping" and "Add Schema" are placed in a separate Section D at the bottom, far from where users make decisions.
7. **No "continue where you left off" affordance** — users returning to a project cannot quickly identify the mapping they most recently edited.
8. **No scanability shortcuts** — users cannot quickly triage the project without reading every mapping row.

---

## Goal

After this spec is implemented:

1. Breadcrumbs and page headers display the project name, not raw UUIDs.
2. Mappings are the primary content area — promoted above schemas in visual hierarchy and page position.
3. A compact summary/status row provides at-a-glance project health metrics.
4. The project header includes primary actions (Create Mapping, Add Schema, etc.) near the page title.
5. Mapping rows/cards expose strong read-only deploy signals for DEV/QA/PROD environments.
6. Schema management remains on the page but is visually secondary to mappings.
7. Read-only deployment visibility is present without inline deploy/promote/rollback actions.
8. Empty states, loading states, and placeholder/scaffold states are defined for all sections.
9. The page supports a "recently edited mapping" affordance to help users resume work quickly.
10. The IA structure is stable even when some sections are initially placeholder-only.

---

## Assumptions

- The existing `features/projects/` module structure and component conventions remain stable.
- The `ApiAdapter` interface does not change — this spec consumes existing adapter methods only.
- Phase 0 deploy statuses remain hardcoded to `'not-deployed'` — the UI renders them correctly but values are not meaningful until backend wiring exists.
- The `useProjectOverview` hook provides all data currently needed; this spec extends it but does not replace it.
- Project names are unique enough to be human-readable in breadcrumbs (no disambiguation needed).
- Breadcrumb name resolution is a UI-side concern — project data is already loaded by the page component.
- "Recently edited mapping" can be derived from `localStorage` recent activity data (established in FS-049).
- Schema acquisition paths (Link CDM, Link Published, Upload New) are already implemented via `SchemaLinkPicker` and `SchemaUploadDialog`.

---

## Current Context

### Existing Project Overview Page (FS-013)

The Project Overview is implemented in `ui/src/features/projects/` with four sequential sections:

- **Section A** — `ProjectMetadataSection`: inline-editable project name, description, tags, read-only dates
- **Section B** — `SchemaManagementSection`: schema card grid with Upload/Link buttons, remove confirmation
- **Section C** — `MappingListSection`: sortable mapping table with Create Mapping CTA, delete/duplicate actions
- **Section D** — `ProjectActionsSection`: Create Mapping, Add Schema, Duplicate Project, Export/Import placeholders, Project Settings link, Delete Project

The page uses `useProjectOverview(projectId)` hook which loads project detail, schemas (via `schemaRefs`), and mappings. Deploy statuses are hardcoded to `'not-deployed'`.

### Breadcrumbs (FS-008)

`Breadcrumbs.tsx` in `ui/src/components/layout/` derives breadcrumb segments from `location.pathname`. Dynamic segments (route params) display the raw parameter value. There is no mechanism to override labels with entity names.

### Navigation

Routes are centralized in `PATHS` (`ui/src/routes/paths.ts`). The Project Overview route is `/projects/:projectId`. Mapping rows construct editor and deploy paths via inline string interpolation.

### Related In-Progress Specs

- **FS-049** (completed): Refined Home Dashboard IA — introduced `useRecentActivity` hook with `keyra:recent-activity` localStorage tracking, "Continue Where You Left Off" section, "Needs Attention" scaffold. This spec can leverage the same `useRecentActivity` hook for "recently edited mapping" affordances.

### Domain Types

- `MappingRowData`: `mappingId, name, sourceSchemaName, targetSchemaName, ruleCount, coverage, status, devDeploy, qaDeploy, prodDeploy, updatedAt`
- `SchemaCardData`: `schemaId, name, format, origin, scope, fieldCount, syncStatus, isInferred`
- `DeployStatus`: `'deployed' | 'stale' | 'not-deployed' | 'deploying'`
- `MappingStatus`: `'draft' | 'ready' | 'has-errors'`

---

## Scope

### In Scope

1. **Breadcrumb name resolution** — introduce a mechanism for pages to supply human-readable labels for dynamic breadcrumb segments; apply to Project Overview page
2. **Restructure page layout** — promote mappings to the primary content area; move schemas below; absorb primary actions into the page header area
3. **Project header refinement** — page title shows project name, metadata (dates, tags) near title, primary action buttons in header
4. **Summary/status row** — compact horizontal summary of project health metrics (total mappings, total schemas, mappings with errors, deployment status counts)
5. **Mapping section enhancements** — "recently edited" indicator, enhanced status/deploy badges, clear navigation to editor and deploy pages
6. **Schema section refinement** — visually secondary treatment, preserved three acquisition paths, clear origin/scope/sync communication
7. **Read-only deployment visibility** — project-level deployment summary (scaffold-friendly), mapping-row deploy indicators, link to project deployment dashboard
8. **Empty and placeholder states** — no-mappings, no-schemas, loading, placeholder states for deferred features (deployment summary, activity, etc.)
9. **Test updates** — update existing tests, add tests for new components and layout

### Out of Scope

- Inline deploy, promote, or rollback actions on the Project Overview page
- Changes to the Mapping Editor or Mapping Deployment pages
- Changes to the Schema Library or Schema Detail pages
- Backend deployment status wiring (Phase 0 stays hardcoded)
- ApiAdapter interface changes
- Changes to the NavBar or global navigation
- Changes to the Home Dashboard (covered by FS-049)
- Real-time or polling-based data refresh
- Project-level deployment dashboard page (referenced as link target but not created)

---

## Non-Goals

- This spec does not turn the Project Overview into a deployment console — deploy actions belong on dedicated deployment pages.
- This spec does not add deployment execution capabilities (deploy, promote, rollback).
- This spec does not implement backend-dependent deployment status wiring.
- This spec does not redesign the Mapping Editor's save/deploy workflow.
- This spec does not implement breadcrumb name resolution for all pages globally — only Project Overview is addressed; other pages may adopt the pattern in future specs.

---

## Relevant Areas

- `ui/src/components/layout/Breadcrumbs.tsx` (breadcrumb name resolution)
- `ui/src/components/layout/AppLayout.tsx` (breadcrumb context provider placement)
- `ui/src/features/projects/components/ProjectOverviewPage.tsx` (primary work area)
- `ui/src/features/projects/components/ProjectMetadataSection.tsx` (header refinement)
- `ui/src/features/projects/components/MappingRow.tsx` (mapping row enhancements)
- `ui/src/features/projects/components/MappingListSection.tsx` (promoted primary section)
- `ui/src/features/projects/components/SchemaManagementSection.tsx` (secondary treatment)
- `ui/src/features/projects/components/SchemaCard.tsx` (badge refinement)
- `ui/src/features/projects/components/ProjectActionsSection.tsx` (absorbed into header)
- `ui/src/features/projects/hooks/use-project-overview.ts` (data derivation extensions)
- `ui/src/features/projects/types.ts` (new view model types)
- `ui/src/features/projects/components/__tests__/` (test updates)
- `ui/src/routes/paths.ts` ?
- `forge/architecture/project-structure.md` (update if new files created)

---

## Dependencies / Blockers

- FS-049 (completed) — leverages `useRecentActivity` hook pattern for recently edited mapping affordance
- FS-013 (completed) — baseline Project Overview implementation

---

## Constraints

- Must preserve existing routing structure (`/projects/:projectId`).
- Must not add deploy, promote, or rollback actions to the Project Overview.
- Must not modify the `ApiAdapter` interface.
- Must work with existing adapter methods and localStorage data.
- Must preserve inline editing for project metadata (name, description, tags).
- Must preserve schema acquisition paths (Link CDM, Link Published, Upload New).
- Must preserve `data-testid="page-project-overview"` on the root element.
- Desktop-first layout (1024px minimum, 1280px+ optimized).
- TypeScript strict mode; zero lint/typecheck errors.
- Phase 0 deploy statuses remain hardcoded to `'not-deployed'`.
- Breadcrumb name resolution must not introduce additional API calls — the page already loads project data.
- Save and Deploy remain distinct workflows; the page must not conflate them.

---

## Proposed Behavior

### User Flow

When a user navigates to a Project Overview (`/projects/:projectId`):

1. **Loading state** — skeleton shows the target layout structure (header + summary row + mappings area + schemas area)
2. **Breadcrumb** — shows `Home > Projects > {Project Name}` (or `Home > Projects > Loading...` while data loads)
3. **Page header** — displays project name as the page title, with description and metadata below, and primary action buttons (Create Mapping, Add Schema, Open Deployments, Project Settings) in the header area
4. **Summary/status row** — compact horizontal row showing: total mappings, total schemas, mappings with errors, deployment status summary (scaffold)
5. **Mappings section (primary)** — the main content area with:
   - "Recently edited" indicator on the most recently edited mapping (if identifiable)
   - Sortable table with enhanced status/deploy signals
   - Create Mapping button as prominent CTA
   - Navigation to Mapping Editor and Mapping Deployment pages per row
6. **Schemas section (secondary)** — below mappings, with:
   - Schema cards showing origin, scope, sync status, field count
   - Upload Schema and Link Schema entry points
   - Visually lighter treatment than the mappings section
7. **Deployment visibility (read-only)** — integrated into:
   - Summary row deployment counts (scaffold)
   - Mapping row DEV/QA/PROD badges
   - Link to project deployment dashboard
8. **Empty states** — contextual empty states for no-mappings and no-schemas

### Page Structure

```
+------------------------------------------------------------------------+
| NavBar (unchanged)                                                      |
+------------------------------------------------------------------------+
| Breadcrumbs: Home > Projects > {Project Name}                          |
+------------------------------------------------------------------------+
| PAGE HEADER                                                             |
| {Project Name}                    [Create Mapping] [Add Schema] [...]   |
| {description}  |  Created {date}  |  Updated {date}  |  {tags}        |
+------------------------------------------------------------------------+
| SUMMARY ROW                                                             |
| [N Mappings] [N Schemas] [N Errors] [Deploy: scaffold] [Deploy link]   |
+------------------------------------------------------------------------+
|                                                                         |
| MAPPINGS (primary section)                                              |
| +--------------------------------------------------------------------+ |
| | Recently edited: "Order Transform" - 2 hours ago          [Resume] | |
| +--------------------------------------------------------------------+ |
| | Name | Source>Target | Rules | Coverage | Status | DEV QA PROD | ...| |
| | ...  | ...          | ...   | ...      | ...    | ... ... ...  | ...| |
| +--------------------------------------------------------------------+ |
| | [+ Create Mapping]                                                 | |
| +--------------------------------------------------------------------+ |
|                                                                         |
| SCHEMAS (secondary section)                                             |
| +--------------------------------------------------------------------+ |
| | [Upload Schema] [Link Schema]                                      | |
| | +----------+ +----------+ +----------+                            | |
| | | Schema 1 | | Schema 2 | | Schema 3 |                            | |
| | +----------+ +----------+ +----------+                            | |
| +--------------------------------------------------------------------+ |
|                                                                         |
| PROJECT ACTIONS (compact footer)                                        |
| Duplicate Project | Delete Project                                      |
+------------------------------------------------------------------------+
```

### System Behavior

#### Breadcrumb Name Resolution

A new `BreadcrumbContext` provides a mechanism for pages to supply custom labels for dynamic route segments:

- `useBreadcrumbLabel(segmentValue, label)` — hook called by page components to register a human-readable label for a URL segment
- `Breadcrumbs.tsx` reads from the context and substitutes registered labels for matching segments
- When project data is loading, the breadcrumb shows "Loading..." for the project segment
- When project data is loaded, the breadcrumb shows the project name
- Raw IDs remain in the URL — only the display label is overridden
- The context is placed in `AppLayout.tsx` so all routed pages can use it

This pattern is extensible to other pages (mapping names, schema names) in future specs without requiring changes to the Breadcrumbs component.

#### Project Header

The header area consolidates project identity and primary actions:

- **Title row**: project name (large heading, inline-editable on click) + primary action buttons
- **Metadata row**: description (inline-editable) + created date + updated date + tags (inline-editable)
- **Primary actions**: Create Mapping (primary button), Add Schema (secondary), Open Deployments (secondary link), overflow menu (...) containing: Project Settings, Duplicate Project, Export Project (disabled/placeholder)
- The current `ProjectMetadataSection` and `ProjectActionsSection` are consolidated into this header pattern
- `Delete Project` moves to Project Settings or into the overflow menu's danger zone

#### Summary/Status Row

A compact horizontal row of metric indicators below the header:

| Metric | Source | Treatment |
|---|---|---|
| Total Mappings | `mappings.length` | Count badge |
| Total Schemas | `schemas.length` | Count badge |
| Mappings with Errors | derived from `mappings` where `status === 'has-errors'` | Red-accent count, "0" shows green |
| Stale Deployments | scaffold placeholder (Phase 0) | Muted "—" |
| Ready to Deploy | scaffold placeholder (Phase 0) | Muted "—" |

The row also includes a "View Deployments" link navigating to `/projects/:projectId/deployments`.

When all metrics are zero (new project), the row shows zeros with neutral styling. The row is always visible — it serves as an orientation landmark.

#### Mappings Section (Primary)

This section is the primary content area, occupying the most prominent page position:

**Recently Edited Affordance:**
- If the user has recently edited a mapping in this project (determined from `keyra:recent-activity` localStorage data), show a subtle "Continue where you left off" card at the top of the section
- The card shows the mapping name, relative timestamp, and a "Resume" link to the Mapping Editor
- If no recent activity exists for this project's mappings, the affordance is hidden
- Maximum of one recent mapping shown
- Use "Continue where you left off" or "Recently opened" copy — not "Recently edited" — because the signal source is user navigation, not data modification (Q2 resolution)

**Table Presentation:**
- Use table layout (not cards) for the mappings section — tables are better for scanning many items with comparable attributes
- Preserve current sortable columns: Name, Rules, Coverage, Status, Last Modified
- Enhance the deploy columns with clearer badges

**Status Signals:**
- `ready` — green filled badge
- `draft` — slate/gray badge
- `has-errors` — red filled badge with emphasis

**Deploy Badges (Read-Only):**
- DEV/QA/PROD badges per row, showing `deployed` (green), `stale` (amber), `not-deployed` (muted gray), `deploying` (blue spinner)
- In Phase 0, all show "Not deployed" — use a condensed "Not deployed" label when all three are `not-deployed` (same pattern as FS-049 ProjectCard)
- When any environment has a non-default status, show individual badges
- Badges are read-only indicators — clicking navigates to the mapping's deployment page, not a deploy action

**Row Actions:**
- Edit (link to Mapping Editor)
- Deploy (link to Mapping Deployment page)
- Test (link to Test Lab)
- More menu: Duplicate, Delete

**Create Mapping CTA:**
- Prominent "Create Mapping" button at the bottom of the mapping list, or within the empty state

#### Schema Section (Secondary)

This section is visually secondary to mappings:

**Visual Treatment:**
- Lighter heading weight or smaller section header compared to mappings
- Collapsible section (expanded by default, collapsible for power users with many schemas)
- Use a compact grid or list view (current grid layout is acceptable but should use smaller cards if many schemas)

**Schema Cards:**
- Each card shows: name, format badge (JSON Schema / XSD), origin badge (CDM / Published / Local), scope badge (Global / Project), field count, sync status indicator
- Origin badge uses color-coded treatment:
  - CDM — blue
  - Published — purple
  - Local — gray
- Sync status: synced (green check), not-synced (amber warning), local-changes (amber), N/A for local uploads
- Inferred schema warning maintained

**Acquisition Entry Points:**
- "Upload Schema" button — opens `SchemaUploadDialog`
- "Link Schema" button — opens `SchemaLinkPicker`
- These buttons appear in the section header row, not in a separate actions section
- The three acquisition paths are preserved:
  - Link CDM schema — via Link Schema picker (filtered to CDM origin)
  - Link published schema — via Link Schema picker (filtered to published origin)
  - Upload new schema — via Upload Schema dialog (supports JSON Schema, XSD, sample data inference)

**Schema-Mapping Relationship:**
- Schema cards should indicate how many mappings reference them (e.g., "Used by 2 mappings")
- Remove confirmation continues to warn about mapping references

#### Deployment Visibility (Read-Only)

Deployment visibility is distributed across multiple surfaces, all read-only:

1. **Summary row** — stale deployment count and ready-to-deploy count as scaffold placeholders
2. **Mapping rows** — DEV/QA/PROD badges per mapping
3. **Deployments link** — "View Deployments" link to `/projects/:projectId/deployments` in summary row and optionally in header actions
4. **No inline deploy controls** — clicking a deploy badge navigates to the mapping's deployment page; there are no deploy/promote/rollback buttons on this page

#### Project Actions (Compact)

The current `ProjectActionsSection` content is redistributed:

- **Create Mapping** and **Add Schema** → moved to page header primary actions
- **Open Deployments** → moved to page header secondary actions / summary row link
- **Project Settings** → moved to page header overflow menu
- **Duplicate Project** → moved to page header overflow menu
- **Export Project** → moved to page header overflow menu (disabled placeholder)
- **Delete Project** → moved to page header overflow menu (danger zone) or accessible via Project Settings page
- The standalone `ProjectActionsSection` component is either retired or reduced to a minimal footer containing only destructive/secondary actions (Duplicate, Delete) with less visual weight

### Failure / Edge Behavior

- **Loading state**: Skeleton renders the target layout: header skeleton + summary row skeleton + mapping table skeleton + schema grid skeleton. The breadcrumb shows "Loading..." for the project name segment.
- **Error state**: Error banner replaces main content with retry. Breadcrumb falls back to showing the raw project ID.
- **Not found state**: Not-found component renders. Breadcrumb shows the raw project ID.
- **No mappings**: The mappings section shows an empty state with "No mappings yet" message and a "Create Mapping" CTA button. The summary row shows "0 Mappings". The "recently edited" affordance is hidden.
- **No schemas**: The schemas section shows an empty state with "No schemas attached" message and Upload/Link CTA buttons. The summary row shows "0 Schemas".
- **All deploys not-deployed**: Deploy badges show condensed "Not deployed" per mapping row. Summary row deploy counts show scaffold placeholders.
- **Breadcrumb during loading**: Shows "Loading..." as the project name segment. Updates to the actual name once data resolves.
- **Breadcrumb on error/not-found**: Falls back to displaying the raw `projectId` parameter.
- **No recent activity for project**: The "recently edited" affordance is hidden entirely.
- **localStorage unavailable**: Recent activity features gracefully degrade — no errors, no affordance shown.

---

## Acceptance Examples

### AE-01 — Breadcrumb shows project name instead of UUID

**Given**
- A project exists with `projectId: "abc-123-uuid"` and `name: "Order Processing"`

**When**
- User navigates to `/projects/abc-123-uuid`
- Project data loads successfully

**Then**
- Breadcrumb displays: `Home > Projects > Order Processing`
- The URL still shows `/projects/abc-123-uuid`

### AE-02 — Breadcrumb shows loading state while data loads

**Given**
- A project exists with `projectId: "abc-123-uuid"`

**When**
- User navigates to `/projects/abc-123-uuid`
- Project data is still loading

**Then**
- Breadcrumb displays: `Home > Projects > Loading...`
- Once data loads, it updates to: `Home > Projects > Order Processing`

### AE-03 — Breadcrumb falls back to raw ID on error

**Given**
- Navigation to `/projects/abc-123-uuid`
- Project data fails to load

**When**
- The error state renders

**Then**
- Breadcrumb displays: `Home > Projects > abc-123-uuid` (raw ID fallback)

### AE-04 — Page header shows project identity and primary actions

**Given**
- Project "Order Processing" has 5 mappings and 3 schemas

**When**
- User views the Project Overview

**Then**
- The page title is "Order Processing" (editable on click)
- Description is visible and editable
- Created and updated dates are shown
- Tags are visible and editable
- Primary actions are in the header area: "Create Mapping" (primary), "Add Schema" (secondary)
- An overflow menu contains: Open Deployments, Project Settings, Duplicate Project, Export Project (disabled)

### AE-05 — Summary status row shows project health at a glance

**Given**
- Project has 5 mappings: 3 ready, 1 draft, 1 has-errors
- Project has 3 schemas attached

**When**
- User views the Project Overview

**Then**
- Summary row shows: "5 Mappings", "3 Schemas", "1 Error" (red accent)
- Stale deployments and ready-to-deploy show scaffold placeholder values (muted "—")
- A "View Deployments" link is visible

### AE-06 — Mappings section is the primary content area

**Given**
- Project has 3 mappings and 2 schemas

**When**
- User views the loaded Project Overview page

**Then**
- The mappings section appears before the schemas section in the page layout
- The mappings section has a more prominent heading/visual treatment than schemas
- A sortable table displays the mapping data

### AE-07 — Mapping rows show condensed deploy summary in Phase 0

**Given**
- All mapping deploy statuses are `'not-deployed'`

**When**
- Mapping rows render

**Then**
- Instead of three separate DEV/QA/PROD "Not deployed" badges, each row shows a single muted "Not deployed" label
- When deploy statuses become non-default, individual environment badges appear

### AE-08 — Mapping rows show status badges with visual emphasis

**Given**
- A mapping has `status: 'has-errors'`
- Another mapping has `status: 'ready'`

**When**
- Mapping rows render

**Then**
- The "has-errors" mapping shows a red filled badge
- The "ready" mapping shows a green filled badge
- The "draft" mapping shows a slate/gray badge

### AE-09 — Recently edited mapping affordance

**Given**
- User previously edited mapping "Order Transform" in this project
- `keyra:recent-activity` contains an entry for this mapping

**When**
- User views the Project Overview

**Then**
- A "Continue where you left off" card appears at the top of the mappings section
- The card shows: "Order Transform", relative timestamp (e.g., "2 hours ago"), "Resume" link
- Clicking "Resume" navigates to the Mapping Editor

### AE-10 — Recently edited affordance hidden when no recent activity

**Given**
- No entries in `keyra:recent-activity` match mappings in this project

**When**
- User views the Project Overview

**Then**
- No "Continue where you left off" card appears in the mappings section
- The mapping table renders without the affordance

### AE-11 — No-mappings empty state

**Given**
- Project has 0 mappings

**When**
- User views the Project Overview

**Then**
- The mappings section shows an empty state: icon, "No mappings yet" heading, descriptive subtext, "Create Mapping" CTA button
- Summary row shows "0 Mappings"
- "Continue editing" affordance is hidden

### AE-12 — No-schemas empty state

**Given**
- Project has 0 schemas attached

**When**
- User views the Project Overview

**Then**
- The schemas section shows an empty state: icon, "No schemas attached" heading, descriptive subtext, "Upload Schema" and "Link Schema" CTA buttons
- Summary row shows "0 Schemas"

### AE-13 — Schema cards show origin, scope, and sync badges

**Given**
- Project has schemas with different origins: one CDM, one Published, one Local

**When**
- User views the schemas section

**Then**
- Each schema card shows a color-coded origin badge (CDM=blue, Published=purple, Local=gray)
- Each card shows a scope badge (Global/Project)
- Sync status is indicated (synced/not-synced/local-changes) where applicable
- Field count is displayed

### AE-14 — Deploy badge navigates to mapping deployment page

**Given**
- A mapping row has a DEV deploy badge

**When**
- User clicks the DEV badge (or the deploy action)

**Then**
- User is navigated to `/projects/:projectId/mappings/:mappingId/deploy`
- No deploy action is executed inline

### AE-15 — Loading skeleton reflects target layout

**Given**
- User navigates to a Project Overview

**When**
- Data is loading

**Then**
- A skeleton renders showing: header area, summary row, mappings table area, schemas area
- Breadcrumb shows "Loading..." for the project name
- The skeleton layout matches the loaded page structure

### AE-16 — Primary actions in header area

**Given**
- Project Overview is loaded

**When**
- User looks at the header area

**Then**
- "Create Mapping" button is visible as a primary action
- "Add Schema" button is visible as a secondary action
- An overflow menu (...) is visible containing additional actions
- No separate "Project Actions" section exists at the bottom of the page (or it is minimal)

### AE-17 — Mapping row actions include Test Lab link

**Given**
- A mapping row is displayed

**When**
- User clicks the Test action on the row

**Then**
- User is navigated to `/projects/:projectId/mappings/:mappingId/test-lab`

### AE-18 — Summary row shows zero-error positive state

**Given**
- Project has 3 mappings, all with `status: 'ready'`

**When**
- User views the summary row

**Then**
- The error count shows "0 Errors" with neutral or positive styling (no red accent)
- Mapping count and schema count display normally

---

## Open Questions

- none

---

## Verification Strategy

All acceptance examples should be covered by automated tests unless noted:

- **AE-01, AE-02, AE-03**: Component tests for breadcrumb name resolution (Breadcrumbs component + BreadcrumbContext)
- **AE-04, AE-16**: Component tests for `ProjectOverviewPage` header area (title, actions, overflow menu)
- **AE-05, AE-18**: Component tests for summary/status row component
- **AE-06**: Component test verifying mappings section precedes schemas section in DOM order
- **AE-07, AE-08**: Component tests for `MappingRow` deploy badges and status badges
- **AE-09, AE-10**: Component tests for recently edited mapping affordance
- **AE-11, AE-12**: Component tests for empty states
- **AE-13**: Component tests for `SchemaCard` badges (origin, scope, sync)
- **AE-14, AE-17**: Component tests verifying navigation links (no deploy action triggers)
- **AE-15**: Component test for skeleton layout structure

Verification commands:
- `cd ui && pnpm typecheck` — zero errors
- `cd ui && pnpm lint` — zero errors
- `cd ui && pnpm test` — all tests pass including new/updated project feature tests

---

## Task Generation Notes

This spec decomposes into 8 tasks. All are `Agent: ui-task` except the architecture update which is `Agent: task`.

1. **T-01: Add breadcrumb name resolution infrastructure** — Create `BreadcrumbContext` + `useBreadcrumbLabel` hook in `ui/src/components/layout/`. Update `Breadcrumbs.tsx` to read from context. Update `AppLayout.tsx` to provide context. Apply in `ProjectOverviewPage` to display project name. This is a shared infrastructure change that enables T-02 and benefits future pages.

2. **T-02: Restructure page layout and header** — Consolidate `ProjectMetadataSection` and `ProjectActionsSection` into a refined header pattern. Promote mappings above schemas. Add overflow menu for secondary/tertiary actions. Restructure `ProjectOverviewPage.tsx` layout. Depends on T-01 (breadcrumb wiring).

3. **T-03: Add project-level summary/status row** — New `ProjectSummaryRow` component showing mapping count, schema count, error count, deployment scaffold counts, and "View Deployments" link. Wire into page layout. Depends on T-02 (layout placement).

4. **T-04: Enhance mapping section with status signals and recently-edited affordance** — Update `MappingRow` with condensed deploy badges, enhanced status badges, Test Lab action. Add recently-edited mapping card using `useRecentActivity`. Update `MappingListSection` with the affordance and visual primary treatment. Independent of T-03 but integrates into T-02 layout.

5. **T-05: Refine schema section as secondary surface** — Update `SchemaManagementSection` and `SchemaCard` with lighter visual treatment, enhanced origin/scope/sync badges, and "used by N mappings" indicator. Independent of T-03/T-04.

6. **T-06: Define empty and placeholder states** — Update empty states for no-mappings, no-schemas. Add loading skeleton reflecting target layout. Add placeholder treatment for deployment summary scaffold values. Depends on T-02 (layout structure) and T-03 (summary row).

7. **T-07: Update tests for refined Project Overview** — Update all existing project feature tests. Add new tests for `BreadcrumbContext`, `ProjectSummaryRow`, recently-edited affordance, enhanced badges, empty states, and layout structure. Depends on T-01 through T-06.

8. **T-08: Update project-structure.md** — Reflect new files added to `features/projects/` and `components/layout/`. Agent: task. Depends on T-07 (all implementation complete).

Parallelization: T-04 and T-05 are independent of each other and can be developed in parallel. T-01 is the foundation. T-02 depends on T-01. T-03 depends on T-02. T-06 depends on T-02 + T-03. T-07 is the verification gate. T-08 is the architecture update.

---

## Change Log

- Rev 2 — 2026-05-13
  - All open questions resolved (Q1–Q4):
    - Q1 resolved: Use `BreadcrumbContext` + `useBreadcrumbLabel` (React Context). Keep the provider narrowly scoped and stable to avoid unnecessary re-renders. Context is the right architectural choice for extensibility — KeyRa has multiple routes with async name resolution (project, mapping, schema) and the context pattern keeps breadcrumb concerns co-located with the route that owns the data.
    - Q2 resolved: Use `useRecentActivity` for "recently edited / continue where you left off." It reflects user workflow (what the current user was editing) rather than generic object modification timestamps (`updatedAt`). Frame UI copy as "Continue where you left off" / "Recently opened" to match the signal source. Consistent with Home Dashboard pattern.
    - Q3 resolved: Retire `ProjectActionsSection`. Absorb normal actions into the page header. Place Delete Project in the header overflow menu. If stronger discoverability for Delete is desired later, it can move to a dedicated danger zone in Project Settings. Do not retain a broad actions section just to house Delete — that preserves structure for implementation convenience, not user experience.
    - Q4 resolved: Schemas should eventually be collapsible, but defer the interaction for now. Keep the section always visible with lighter visual weight and clear separation beneath mappings. Design the section header as if collapsibility may come later (title row, count, reserved chevron space) so the change can be added without redesign.
  - No scope or acceptance example changes — all resolutions align with the original spec recommendations
- Rev 1 — 2026-05-12
  - Initial draft
