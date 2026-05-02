# SPEC

## Title

Home Dashboard

---

## ID

FS-014

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-01
Last Updated: 2026-05-01
Type: ui

---

## Status

completed

---

## Revision

Rev: 1

---

## Summary

Build the Home Dashboard (`/`) — the application's landing page showing an overview of all projects with summary metrics, a searchable/sortable/filterable project list, deploy status badges, and entry points for creating projects and navigating to the Schema Library. Phase 0 scope: all data from `LocalStorageAdapter`, deploy badges read-only ("Not deployed"), activity feed and deployments tab are structural placeholders only.

---

## Problem

The application's landing page (`/`) currently shows a "Coming Soon" placeholder. Users have no at-a-glance overview of their projects, no way to discover existing projects, and no central entry point for navigation. The only way to access projects is by typing URLs directly.

---

## Goal

Deliver a fully functional Home Dashboard that:

1. Shows summary metrics (project, mapping, schema counts; mapping status breakdown).
2. Lists all projects with search, sort, and filter controls.
3. Supports both card grid and table view toggles.
4. Provides prominent "Create Project" call-to-action.
5. Shows deploy status badges on each project (read-only in Phase 0).
6. Handles empty, loading, and error states gracefully.
7. Establishes structural slots for future Deployments tab and Activity feed.
8. Links to the Schema Library with schema count.
9. Renders within 500ms for up to 50 projects / 200 mappings.

---

## Assumptions

- Routes already registered in React Router (FS-008): `/` renders the Home Dashboard.
- `ApiAdapter` provides `listProjects()`, `listMappings(projectId)`, `listSchemas()`.
- `ProjectMetadata` includes `mappingCount?` and `schemaCount?` fields (optional — may need to be computed by loading mappings if not populated).
- Shared primitives `Button`, `Card`, `PageHeader`, `StatusBadge` are available from `ui/src/components/`.
- `useAsyncState()` hook is available for data loading lifecycle.
- FS-013 (Project Overview & CRUD) establishes project/mapping/schema data in localStorage — dashboard reads that data.
- `MappingStatus` type is `'draft' | 'ready' | 'has-errors'`.
- `DeployStatus` type is `'deployed' | 'stale' | 'not-deployed' | 'deploying'` — Phase 0 always uses `'not-deployed'`.

---

## Current Context

The `HomeDashboard` route page at `ui/src/routes/pages/HomeDashboard.tsx` renders a placeholder. The `features/home/` directory does not exist.

The `LocalStorageAdapter.listProjects()` returns `ProjectMetadata[]` with fields: `projectId`, `name`, `description`, `slug`, `updatedAt`. Note: `mappingCount` and `schemaCount` are optional fields on `ProjectMetadata` — the current `LocalStorageAdapter.listProjects()` returns them without these fields populated. To get mapping counts, we need to either: (a) call `listMappings(projectId)` per project, or (b) enhance `listProjects()` to include counts.

`listSchemas()` returns all schemas globally.

`StatusBadge` component accepts `DeployStatus` and renders a colored dot + label. It's already styled for the deploy badge spec: ● green (deployed), ◐ orange (stale), ○ gray (not-deployed), ◌ yellow (deploying).

`useAsyncState()` provides `execute(promise)`, `refresh(promise)`, `reset()`, `markStale()` and the `AsyncState<T>` discriminated union.

---

## Scope

### In Scope

- Home Dashboard page (`/`) replacing placeholder
- Overview metrics bar (project count, mapping count, schema count, status breakdown)
- Project list with search, sort, filter
- Table view and card grid view with toggle
- Create Project CTA
- Deploy status badges per project (always "not-deployed" in Phase 0)
- Empty state (no projects)
- Loading state (skeleton)
- Error state (retry)
- Deployments tab placeholder
- Activity feed placeholder
- Schema Library navigation link with count
- Feature module at `ui/src/features/home/`
- `useDashboardData` hook for data loading and aggregation
- Performance: renders within 500ms for 50 projects

### Out of Scope

- Activity feed implementation (Phase 1+)
- Deployments tab content (Phase 4)
- Project deletion from dashboard (done from Project Overview — FS-013)
- Backend aggregation or server-side filtering
- Mobile/responsive layout (desktop-first only)
- Real deployment data or badge values

---

## Non-Goals

- This is not a project management page — it provides overview and navigation only.
- This does not duplicate FS-013's project CRUD capabilities — the dashboard links to the Project Overview for detailed management.
- This does not implement real-time updates or polling — data refreshes on mount and manual retry only.

---

## Relevant Areas

- `ui/src/features/home/` (new feature directory)
- `ui/src/routes/pages/HomeDashboard.tsx` (replace placeholder)
- `ui/src/lib/api/types.ts` (ApiAdapter — consumed)
- `ui/src/lib/api/local-storage-adapter.ts` (consumed; may need `listProjects` enhancement for counts)
- `ui/src/lib/types/domain.ts` (ProjectMetadata, MappingMetadata, MappingStatus, DeployStatus)
- `ui/src/components/` (Button, Card, PageHeader, StatusBadge)
- `ui/src/hooks/use-async-state.ts` (data loading)
- `ui/src/routes/paths.ts` (PATHS for navigation)

---

## Dependencies / Blockers

- FS-008 (UI Scaffold) must be complete — provides routing, adapter, shared primitives, AsyncState.
- FS-013 (Project Overview & CRUD) should be complete — creates the project/mapping data in storage that the dashboard reads. Dashboard can render with empty state if FS-013 is not yet done.

---

## Constraints

- No backend dependency. All data from `LocalStorageAdapter` via `useAdapter()`.
- Must integrate with FS-008's app shell (mounted at `/` route inside `AppLayout`).
- Deploy badges are read-only and always show "Not deployed" in Phase 0.
- Activity feed and Deployments tab are non-functional placeholders.
- TypeScript strict mode, zero lint/typecheck errors.
- Tailwind CSS 4 for all styling.
- No external state management library (Phase 0 rules).
- Desktop-first: optimized for 1280px+, minimum 1024px.
- Render performance: < 500ms with 50 projects and 200 mappings in localStorage.
- Search/filter is client-side and must be instant (< 50ms) for up to 100 items.

---

## Proposed Behavior

### User Flow

1. **Landing**: User navigates to `/`. Dashboard loads project, mapping, and schema data.
2. **Metrics bar**: User sees at-a-glance summary: "5 Projects • 12 Mappings • 8 Schemas" and status breakdown "3 Ready • 2 Draft • 1 Has Errors".
3. **Project list**: User sees all projects in card grid (default) or table view. Each project shows: name, description (truncated), mapping count, last modified, deploy badges.
4. **Search**: User types in search box — list filters instantly to matching project names/descriptions.
5. **Sort**: User selects sort criteria (name, last modified, mapping count) — list reorders.
6. **Filter**: User selects status filter — list shows only projects whose worst-status mapping matches.
7. **Navigation**: User clicks a project card/row → navigates to `/projects/:projectId`.
8. **Create**: User clicks "Create Project" → navigates to `/projects/new`.
9. **Schema Library**: User clicks "Schema Library" link → navigates to `/schemas`.
10. **View toggle**: User switches between card grid and table views; preference persists in localStorage.
11. **Placeholders**: User sees "Deployments" and "Activity" tabs with placeholder messaging.

### System Behavior

- **Data loading**: On mount, execute three adapter calls in parallel:
  - `listProjects()` → `ProjectMetadata[]`
  - `listSchemas()` → `SchemaMetadata[]` (for total count)
  - For each project, derive mapping count and worst-status from stored data
- **Metrics computation**: Aggregate across all projects:
  - Total project count = `projects.length`
  - Total mapping count = sum of `project.mappingCount` or derived
  - Total schema count = `schemas.length`
  - Status breakdown: count mappings by status across all projects
  - Deploy metrics: all show 0 deployed in Phase 0
- **Project worst-status derivation**: A project's effective status is the "worst" of its mappings:
  - If any mapping has `'has-errors'` → project shows "Has Errors"
  - Else if any has `'draft'` → project shows "Draft"
  - Else if all are `'ready'` → project shows "Ready"
  - If no mappings → "No Mappings" (neutral)
- **Search**: Filter `projects` by case-insensitive substring match on `name` or `description`
- **Sort**: Client-side sort on the filtered list. Available: name (alpha asc/desc), updatedAt (date asc/desc), mappingCount (numeric asc/desc)
- **Filter**: When a status filter is active, only projects with that worst-status are shown
- **View preference**: Store `'grid' | 'table'` in `localStorage` key `keyra:dashboard:viewMode`. Default: `'grid'`
- **Deploy badges**: Each project shows DEV/QA/PROD `StatusBadge` components with `status="not-deployed"` for all three

### Failure / Edge Behavior

- **Empty state** (no projects): Hide metrics bar (or show all zeros gracefully). Show welcoming empty state with illustration + "No projects yet" + "Create your first project to start mapping data." + "Create Your First Project" button.
- **Loading**: Show skeleton cards/rows matching the expected layout. Metrics bar shows pulsing placeholders.
- **Error**: Show error banner at top with "Failed to load dashboard data" + retry button. If previously loaded data exists (stale state), keep it visible below the banner.
- **Partial data**: If `listProjects()` succeeds but individual mapping counts fail, show "—" for mapping count on affected projects. Do not block the entire dashboard.
- **Large dataset**: With 50+ projects, the client-side filter/sort should remain responsive. No virtualization needed at Phase 0 scale.

---

## Acceptance Examples

### AE-01 — Dashboard loads with projects and metrics

**Given**
- 3 projects exist in localStorage
- Project A has 4 mappings (2 ready, 1 draft, 1 has-errors)
- Project B has 2 mappings (2 ready)
- Project C has 0 mappings
- 5 schemas exist

**When**
- User navigates to `/`

**Then**
- Metrics bar shows: "3 Projects • 6 Mappings • 5 Schemas"
- Status breakdown shows: "2 Ready • 1 Draft • 1 Has Errors"
- Project A card shows "4 mappings", worst-status "Has Errors" badge
- Project B card shows "2 mappings", worst-status "Ready" badge
- Project C card shows "0 mappings", no status badge (or "No Mappings")
- All deploy badges show "○ Not deployed"

### AE-02 — Search filters projects

**Given**
- Projects: "Order Processing", "User Management", "Payment Gateway"

**When**
- User types "order" in search input

**Then**
- Only "Order Processing" is visible
- Other projects are hidden
- Metrics bar does NOT change (shows global totals, not filtered totals)

### AE-03 — Sort by last modified

**Given**
- Project A modified today, Project B modified yesterday, Project C modified last week

**When**
- Sort is set to "Last Modified" descending (default)

**Then**
- Order: Project A, Project B, Project C

**When**
- User clicks to toggle to ascending

**Then**
- Order: Project C, Project B, Project A

### AE-04 — Filter by status

**Given**
- Project A worst-status "has-errors", Project B "ready", Project C no mappings

**When**
- User selects "Has Errors" filter

**Then**
- Only Project A visible
- Clear filter shows all projects again

### AE-05 — Empty state (no projects)

**Given**
- No projects exist in localStorage

**When**
- User navigates to `/`

**Then**
- No metrics bar (or shows all zeros)
- Empty state: icon + "No projects yet" + "Create your first project to start mapping data." + "Create Your First Project" button
- "Create Your First Project" button navigates to `/projects/new`

### AE-06 — Create Project navigation

**Given**
- Dashboard is loaded

**When**
- User clicks "Create Project" button in header

**Then**
- Navigates to `/projects/new`

### AE-07 — Project card click navigates to Project Overview

**Given**
- Project "Order Processing" exists with ID "proj-123"

**When**
- User clicks the "Order Processing" card/row

**Then**
- Navigates to `/projects/proj-123`

### AE-08 — View toggle between grid and table

**Given**
- Dashboard is loaded in default grid view

**When**
- User clicks the table view toggle

**Then**
- Project list switches to table layout (columns: Name, Description, Mappings, Status, Deploy Badges, Last Modified)
- View preference stored in `localStorage` key `keyra:dashboard:viewMode`

**When**
- User reloads the page

**Then**
- Table view is restored from localStorage preference

### AE-09 — Loading state

**Given**
- Data is loading from localStorage

**When**
- Page renders during loading

**Then**
- Skeleton cards (or rows) shown with `animate-pulse`
- Metrics bar shows placeholder blocks
- No error messages

### AE-10 — Error state with retry

**Given**
- `listProjects()` throws an error

**When**
- Page renders

**Then**
- Error banner: "Failed to load dashboard data" with "Retry" button
- Clicking "Retry" re-executes the data load
- On success: error banner removed, data shown

### AE-11 — Schema Library link

**Given**
- 8 schemas exist in storage

**When**
- Dashboard is loaded

**Then**
- Schema Library link/card shows "Schema Library" with "8 schemas" count
- Clicking navigates to `/schemas`

### AE-12 — Placeholder tabs

**Given**
- Dashboard is loaded

**When**
- User clicks "Deployments" tab

**Then**
- Shows "Deployment tracking available when backend is connected (Phase 4)."

**When**
- User clicks "Activity" tab

**Then**
- Shows "Activity feed available when backend is connected (Phase 1+)."

---

## Open Questions

- none

---

## Verification Strategy

- **Unit tests**: `useDashboardData` hook tested with mock adapter — covers AE-01 (metrics computation, worst-status derivation).
- **Unit tests**: Search/filter/sort utility functions tested — covers AE-02, AE-03, AE-04.
- **Component tests**: Dashboard page renders with mock data, empty state, loading state, error state — covers AE-01, AE-05, AE-09, AE-10.
- **Component tests**: View toggle persists preference — covers AE-08.
- **Component tests**: Navigation triggers on card click and button click — covers AE-06, AE-07.
- **Typecheck**: `tsc --noEmit` passes for all touched files.
- **Build**: `vite build` succeeds without errors.
- **Lint**: Zero ESLint errors.
- **Performance**: Manual verification that dashboard renders within 500ms with 50 projects (can seed test data in localStorage).

---

## Task Generation Notes

This is a `ui` type spec. All tasks are `ui-task` agent.

Recommended decomposition:

1. **Feature scaffolding & types** — Create `features/home/` structure, view-model types, barrel files.
2. **useDashboardData hook** — Data loading, aggregation, metrics computation, worst-status derivation.
3. **Metrics bar component** — Summary cards rendering counts and status breakdown.
4. **Project list with search/sort/filter** — Core list component with controls. Includes both grid and table renderers.
5. **Project card component** — Individual project card for grid view.
6. **Project table row** — Row component for table view.
7. **View toggle** — Grid/table toggle with localStorage persistence.
8. **Empty state** — Welcoming empty state when no projects.
9. **Loading/error states** — Skeleton and error banner.
10. **Placeholder tabs (Deployments + Activity)** — Tab structure with placeholder content.
11. **Page assembly** — Compose all components, replace route placeholder, wire navigation.

Sequencing: T-01 first, then T-02 (parallel with T-08, T-09, T-10), then T-03–T-07 (depend on T-02), then T-11 (depends on all).

---

## Change Log

- Rev 1 — 2026-05-01
  - Initial draft
