# SPEC

## Title

Refine Home Dashboard Information Architecture and Layout

---

## ID

FS-049

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-12
Last Updated: 2026-05-12
Type: ui

---

## Status

completed

---

## Revision

Rev: 1

---

## Summary

Refine the KeyRa 2.0 Home Dashboard information architecture to prioritize projects as the primary action surface, add lightweight "Needs Attention" and "Continue Where You Left Off" sections to optimize TTFSM, move Activity to a secondary rail, remove the DashboardTabs shell (separating Deployments to its own future page), and eliminate the dedicated Schema Library card since top-level navigation already covers it. Sections whose backend implementation is not yet available may use placeholder/scaffold states while preserving the target IA structure.

---

## Problem

The current Home Dashboard (FS-014) uses a three-tab shell (Projects / Deployments / Activity) that treats these areas as peer-level concerns. In practice:

1. **Projects are the primary action surface** but are buried behind a tab that must be selected.
2. **Deployments and Activity are placeholder tabs** that show empty-state messaging, wasting visual real estate and implying parity with projects.
3. **Schema Library has a dedicated card** at the bottom of the page, but is already accessible through top-level navigation — creating redundant navigation.
4. **There is no "Continue Where You Left Off"** section, forcing users to scan the project list to find their most recent work. This directly hurts TTFSM.
5. **There is no "Needs Attention"** summary, so users cannot quickly identify projects or mappings that require action (errors, stale deployments, etc.).
6. **Deployment management is conflated with the Home overview**, but Deployments has dedicated workflow significance and should be treated as its own page in the future.

---

## Goal

After this spec is implemented:

1. The Home Dashboard presents projects as the primary content area without a tab shell.
2. A "Continue Where You Left Off" section near the top helps users quickly resume recent work, directly reducing TTFSM.
3. A "Needs Attention" summary area near the top surfaces items requiring follow-up (errors, stale deployments, etc.) — scaffolded initially.
4. Activity appears as a secondary section in a right-side rail — placeholder-friendly until backend event support exists.
5. The Schema Library card is removed; schema count remains as a lightweight metric in the overview bar.
6. The DashboardTabs component is retired; Deployments content is deferred to a future dedicated page.
7. Project cards show stronger status and deploy visibility with clearer visual differentiation.
8. The overview metrics bar retains the most actionable metrics and adds deployment-aware signals where feasible.

---

## Assumptions

- The existing `features/home/` module structure and component conventions remain stable.
- Top-level NavBar already provides access to Schema Library, making a dedicated Home card redundant.
- "Continue Where You Left Off" can be powered by `localStorage` (recent project/mapping access timestamps) in Phase 0 without backend support.
- "Needs Attention" can be derived from existing data (mapping status, validation results) but some signals (stale deployments, unsynced schemas) require scaffold treatment until backend support exists.
- The ApiAdapter interface does not change — this spec consumes existing adapter methods only.
- Deployments will eventually become a dedicated top-level page, but that work is out of scope here. Home should only show lightweight deploy signals.
- Phase 0 deploy statuses remain hardcoded to `'not-deployed'` — the UI should render them correctly but the values will not be meaningful until backend wiring exists.

---

## Current Context

### Existing Home Dashboard (FS-014)

The Home Dashboard is implemented in `ui/src/features/home/` with:

- **`HomeDashboardPage`** — main page component handling loading/error/empty/loaded states
- **`DashboardTabs`** — three-tab shell (Projects / Deployments / Activity); Deployments and Activity are placeholder panels
- **`MetricsBar`** — 5 metric cards: Projects, Mappings, Schemas, Status breakdown (Ready/Draft/Has Errors), Deployed count (always 0)
- **`ProjectList`** — search + sort + status filter + grid/table toggle
- **`ProjectCard` / `ProjectCardGrid`** — grid card showing name, worst-status badge, description, mapping count, DEV/QA/PROD deploy badges, relative date
- **`ProjectTable`** — table view alternative
- **`SchemaLibraryCard`** — standalone card linking to Schema Library with schema count
- **`DashboardSkeleton`** — pulse skeleton for loading state
- **`DashboardEmptyState`** — "No projects yet" CTA
- **`DashboardErrorBanner`** — error banner with retry
- **`useDashboardData`** — loads projects + schemas in parallel, then per-project mappings; computes metrics + project list items; deploy statuses hardcoded to `'not-deployed'`
- **`useViewMode`** — persists grid/table preference to localStorage

### Types

- `DashboardMetrics` — totalProjects, totalMappings, totalSchemas, statusBreakdown, deployedCount
- `ProjectListItem` — projectId, name, description, mappingCount, updatedAt, worstStatus, devDeploy/qaDeploy/prodDeploy
- `ProjectWorstStatus` — `MappingStatus | 'no-mappings'`

### Routing

- Home is mounted at `/` via `routes/pages/HomeDashboard.tsx` → `HomeDashboardPage`
- Schema Library at `/schemas` (top-nav accessible)
- No dedicated `/deployments` route exists yet

### Architecture

The `ui-application.md` architecture document covers the Home Dashboard implicitly through routing and component organization. No separate Home Dashboard architecture section exists — the feature module is standard and does not require one.

---

## Scope

### In Scope

1. **Remove `DashboardTabs`** — retire the tab shell; render Projects content directly on the page without tab navigation
2. **Remove `SchemaLibraryCard`** — delete the dedicated card component and its rendering in `HomeDashboardPage`
3. **Add "Continue Where You Left Off" section** — new component near the top of the page showing recently accessed projects/mappings, powered by localStorage tracking
4. **Add "Needs Attention" scaffold section** — new component near the top showing placeholder/scaffold content for attention items; derive what is possible from existing data (mappings with errors)
5. **Redesign page layout** — primary content area (projects) + secondary right rail (activity placeholder); "Continue Where You Left Off" and "Needs Attention" above the project list
6. **Add Activity rail placeholder** — secondary panel in the right rail with placeholder content
7. **Refine `MetricsBar`** — evaluate and select the most actionable metrics; remove or deprioritize non-actionable ones; add "Mappings with Errors" and "Ready to Deploy" signals if derivable
8. **Enhance `ProjectCard` deploy/status visibility** — stronger visual differentiation between draft/ready/has-errors/stale; clearer environment deploy summaries
9. **Update `useDashboardData`** — add any new data derivations needed (recently edited, attention items); add localStorage tracking for recent access
10. **Update tests** — update existing tests to reflect new layout; add tests for new components

### Out of Scope

- Creating a dedicated `/deployments` route or page (future spec)
- Backend activity event generation or API
- Backend deployment status wiring (Phase 0 stays hardcoded)
- Changes to the NavBar or top-level navigation
- Changes to the Mapping Editor, Schema Library, or any other page
- Schema Library functionality changes (only removing the Home card)
- Any ApiAdapter interface changes

---

## Non-Goals

- This spec does not establish real-time or polling-based data refresh for the dashboard.
- This spec does not implement a full activity feed — only a placeholder.
- This spec does not add deploy actions to the Home Dashboard.
- This spec does not create a Deployments page.
- This spec does not introduce backend-dependent features that cannot be scaffolded.

---

## Relevant Areas

- `ui/src/features/home/` (all files — primary work area)
- `ui/src/features/home/components/HomeDashboardPage.tsx`
- `ui/src/features/home/components/DashboardTabs.tsx` (to be retired)
- `ui/src/features/home/components/MetricsBar.tsx`
- `ui/src/features/home/components/ProjectCard.tsx`
- `ui/src/features/home/components/ProjectList.tsx`
- `ui/src/features/home/hooks/use-dashboard-data.ts`
- `ui/src/features/home/types.ts`
- `ui/src/features/home/index.ts`
- `forge/architecture/project-structure.md` (update if new files created)

---

## Dependencies / Blockers

- none

---

## Constraints

- Must preserve existing routing structure (Home at `/`).
- Must not modify the NavBar or top-level navigation.
- Must not introduce backend dependencies — all new features must work with existing adapter methods or localStorage.
- Must preserve the grid/table view toggle and search/sort/filter functionality for the project list.
- Must not add deploy actions to the Home Dashboard or Mapping Editor.
- Desktop-first layout (1024px minimum, 1280px+ optimized).
- TypeScript strict mode; zero lint/typecheck errors.
- Must use placeholder/scaffold patterns for sections whose backing implementation is deferred.
- Must preserve `data-testid="page-home-dashboard"` on the root element.

---

## Proposed Behavior

### User Flow

When a user navigates to Home (`/`):

1. **Loading state** — skeleton shows the new layout structure (metrics bar + two-column layout skeleton)
2. **Loaded state** — the page renders in a two-column layout:
   - **Main column (~70-75%):**
     - Overview metrics bar (top)
     - "Needs Attention" summary (below metrics, scaffold-friendly)
     - "Continue Where You Left Off" section (1-3 recent items)
     - Project list (search + sort + filter + grid/table toggle) — primary content
   - **Right rail (~25-30%):**
     - Activity placeholder card
3. **Empty state** — when no projects exist, the empty state CTA replaces the project list area; other sections still render (metrics show zeros, "Continue Where You Left Off" hidden or shows empty state, Activity placeholder still visible)
4. **Error state** — error banner replaces the main content area with retry action

### Recommended Page Structure

```
┌──────────────────────────────────────────────────────────────────────┐
│ NavBar (unchanged)                                                    │
├──────────────────────────────────────────────────────────────────────┤
│ PageHeader: "Dashboard" + "Create Project" button                    │
├──────────────────────────────────────────────────┬───────────────────┤
│ MAIN COLUMN                                      │ RIGHT RAIL        │
│                                                  │                   │
│ ┌──────────────────────────────────────────────┐ │ ┌───────────────┐ │
│ │ Overview Metrics (horizontal cards)          │ │ │ Activity      │ │
│ └──────────────────────────────────────────────┘ │ │ (placeholder) │ │
│                                                  │ │               │ │
│ ┌──────────────────────────────────────────────┐ │ │ "Activity     │ │
│ │ Needs Attention (scaffold/summary)           │ │ │  feed will    │ │
│ └──────────────────────────────────────────────┘ │ │  appear here  │ │
│                                                  │ │  when         │ │
│ ┌──────────────────────────────────────────────┐ │ │  available."  │ │
│ │ Continue Where You Left Off                  │ │ │               │ │
│ │ (1-3 recent project/mapping cards)           │ │ │               │ │
│ └──────────────────────────────────────────────┘ │ │               │ │
│                                                  │ │               │ │
│ ┌──────────────────────────────────────────────┐ │ │               │ │
│ │ Projects                                     │ │ │               │ │
│ │ [Search] [Sort ▾] [Filter ▾] [Grid|Table]   │ │ │               │ │
│ │                                              │ │ │               │ │
│ │ ┌────────┐ ┌────────┐ ┌────────┐            │ │ │               │ │
│ │ │ Card 1 │ │ Card 2 │ │ Card 3 │            │ │ │               │ │
│ │ └────────┘ └────────┘ └────────┘            │ │ │               │ │
│ │ ...                                          │ │ │               │ │
│ └──────────────────────────────────────────────┘ │ └───────────────┘ │
├──────────────────────────────────────────────────┴───────────────────┤
```

### System Behavior

#### Overview Metrics

The `MetricsBar` is refined to show the most actionable metrics:

| Metric | Source | Actionable? | Keep |
|---|---|---|---|
| Total Projects | `projects.length` | Low — count only | Yes (lightweight) |
| Total Mappings | `allMappings.flat().length` | Low — count only | Yes (lightweight) |
| Total Schemas | `schemas.length` | Low — count only | Yes (lightweight, replaces Schema Library card) |
| Ready (mappings) | `statusBreakdown.ready` | Medium — indicates deployable work | Yes |
| Draft (mappings) | `statusBreakdown.draft` | Medium — indicates incomplete work | Yes |
| Has Errors (mappings) | `statusBreakdown.hasErrors` | **High** — requires attention | Yes (highlighted) |
| Deployed | `deployedCount` | Low (always 0 in Phase 0) | **Remove** — scaffold in "Needs Attention" instead |

The "Deployed" metric card is removed from the metrics bar. "Has Errors" gets visual emphasis (red/amber accent) when count > 0 to draw attention. The metrics bar should be clickable/linkable in the future but this is not required in this spec.

#### Needs Attention

A scaffold-friendly summary section that can surface attention items:

**Phase 0 (this spec):**
- If `statusBreakdown.hasErrors > 0`: show "N mappings with errors" as an attention item
- All other attention items are scaffold placeholders:
  - "Stale deployments" — placeholder (shows "—" or "0" with muted styling)
  - "Unsynced schemas" — placeholder
- The section renders even when all counts are zero, with a "Nothing needs attention" positive-state message
- Visually: a compact card or inline row group with icon + label + count per item

**Future (out of scope):**
- Real stale deployment detection
- Unsynced schema detection
- Validation error deep-links

#### Continue Where You Left Off

A high-value section for TTFSM:

**Data source (Phase 0):**
- Track recent project/mapping access in localStorage under key `keyra:recent-activity`
- Store entries as `{ type: 'project' | 'mapping', id: string, projectId?: string, name: string, timestamp: string }`
- Maximum 10 stored entries; display top 3
- Entries are written when:
  - User navigates to a project overview page
  - User opens a mapping in the editor
  - User opens a mapping in test lab
- A new `useRecentActivity` hook manages read/write operations

**Rendering:**
- Show 1-3 compact horizontal cards with: name, type indicator (project/mapping), relative timestamp
- Each card is clickable and navigates to the respective page
- If no recent activity exists: section is hidden entirely (not empty state)
- Cards use a horizontal layout (not a list) to minimize vertical space

**Recording (integration):**
- Recording navigation events requires adding `recordRecentActivity()` calls in the relevant route pages (ProjectOverview, MappingEditor, TestLabPage)
- This is included in this spec's scope because the "Continue Where You Left Off" section is meaningless without data

#### Activity Rail

A secondary panel in the right rail:

- Renders a `Card` with "Recent Activity" heading
- Shows placeholder content: an icon + message "Activity feed will appear here when event tracking is available."
- When the dashboard is in empty/loading/error state, the right rail is still structurally present but may collapse or show minimal content
- The activity rail uses `min-w-[280px]` and `max-w-[320px]` to maintain readability

#### Project Card Enhancements

Improve status/deploy visibility on `ProjectCard`:

1. **Stronger status badge colors:**
   - `ready` — green badge with filled background (currently outline-only)
   - `draft` — slate/gray badge (current, acceptable)
   - `has-errors` — red badge with filled background for urgency
   - `no-mappings` — hidden (current behavior preserved)

2. **Deploy summary simplification:**
   - Current: separate DEV/QA/PROD labels + individual StatusBadge components
   - New: if all environments are `'not-deployed'`, show a single muted "Not deployed" label instead of three separate badges — reduces visual noise in Phase 0
   - When any environment has a non-default status, show the individual environment badges as before
   - This handles Phase 0 gracefully (all cards show "Not deployed") while preserving detail when real data arrives

3. **Visual emphasis for error state:**
   - When `worstStatus === 'has-errors'`, add a subtle left-border accent (e.g., `border-l-2 border-l-red-500`) to the card for visual scanning

### Failure / Edge Behavior

- **Loading state:** The two-column layout skeleton renders with placeholder shapes for metrics, attention, recent items, projects, and activity rail.
- **Error state:** The error banner replaces the main column content. The right rail may still show the activity placeholder.
- **Empty state (no projects):** MetricsBar shows zeros. "Needs Attention" shows "Nothing needs attention." "Continue Where You Left Off" is hidden. The empty state CTA replaces the project list. Activity placeholder still visible.
- **No recent activity:** The "Continue Where You Left Off" section is hidden entirely (no empty state card).
- **localStorage unavailable or corrupted:** `useRecentActivity` returns an empty list and does not throw. Recording silently fails.
- **Responsive behavior (below 1024px):** The right rail stacks below the main content. This is low-priority given the desktop-first constraint but should not break visually.

---

## Acceptance Examples

### AE-01 — Loaded dashboard shows two-column layout without tabs

**Given**
- 3 projects exist with varying mapping statuses
- Schema Library has 5 schemas

**When**
- User navigates to Home (`/`)

**Then**
- No tab bar is rendered (no `role="tablist"`)
- The page shows a two-column layout with main content and a right rail
- MetricsBar shows Projects: 3, Mappings: N, Schemas: 5, Status breakdown, no "Deployed" card
- Project list renders in the main column with search/sort/filter controls
- Activity placeholder renders in the right rail

### AE-02 — Schema Library card is removed

**Given**
- The dashboard is loaded

**When**
- User views the page

**Then**
- No `SchemaLibraryCard` component is rendered
- Schema count appears only in the MetricsBar as a metric card
- Schema Library remains accessible only through top-level navigation

### AE-03 — "Needs Attention" shows errors when present

**Given**
- 2 mappings have `status: 'has-errors'`

**When**
- User views the dashboard

**Then**
- The "Needs Attention" section is visible below the metrics bar
- It shows "2 mappings with errors" as an attention item
- "Stale deployments" and "Unsynced schemas" show placeholder/scaffold values

### AE-04 — "Needs Attention" shows positive state when nothing needs attention

**Given**
- All mappings are `status: 'ready'` or `status: 'draft'` (none have errors)
- No stale deployments (Phase 0)

**When**
- User views the dashboard

**Then**
- The "Needs Attention" section shows "Nothing needs attention" with a positive/muted visual treatment

### AE-05 — "Continue Where You Left Off" shows recent items

**Given**
- The user previously visited Project "Alpha" and Mapping "Order Transform" in the current browser session
- localStorage key `keyra:recent-activity` contains these entries

**When**
- User navigates to Home

**Then**
- The "Continue Where You Left Off" section renders below "Needs Attention"
- It shows up to 3 compact cards with name, type indicator, and relative timestamp
- Clicking a card navigates to the corresponding page

### AE-06 — "Continue Where You Left Off" hidden when no recent activity

**Given**
- localStorage key `keyra:recent-activity` does not exist or is empty

**When**
- User navigates to Home

**Then**
- The "Continue Where You Left Off" section is not rendered at all
- No empty state placeholder appears for this section

### AE-07 — Recent activity is recorded on project navigation

**Given**
- User is on the Home Dashboard

**When**
- User clicks a project card and navigates to Project Overview

**Then**
- An entry is written to `keyra:recent-activity` in localStorage with `type: 'project'`, the project's ID and name, and a current timestamp
- The entry appears in "Continue Where You Left Off" on next Home visit

### AE-08 — Project card shows condensed deploy summary in Phase 0

**Given**
- A project has all deploy statuses as `'not-deployed'` (Phase 0 default)

**When**
- The project card renders

**Then**
- Instead of three separate DEV/QA/PROD badges, a single "Not deployed" muted label is shown
- When deploy statuses become non-default (future), individual environment badges appear

### AE-09 — Project card shows error accent

**Given**
- A project has `worstStatus: 'has-errors'`

**When**
- The project card renders

**Then**
- The card has a visible left-border accent in red/error color
- The worst-status badge shows "Has Errors" with filled red styling

### AE-10 — Empty state preserves layout structure

**Given**
- No projects exist

**When**
- User navigates to Home

**Then**
- MetricsBar shows all zeros
- "Needs Attention" shows "Nothing needs attention"
- "Continue Where You Left Off" is hidden
- The empty state CTA ("Create your first project") renders in the main column where the project list would be
- The Activity rail placeholder is still visible in the right column

### AE-11 — Activity placeholder renders in right rail

**Given**
- The dashboard is loaded

**When**
- User views the page

**Then**
- The right rail contains a card titled "Recent Activity"
- The card shows placeholder text: "Activity feed will appear here when event tracking is available."
- The card has an Activity icon

### AE-12 — Skeleton loading state reflects new layout

**Given**
- Dashboard data is loading

**When**
- The loading state is active

**Then**
- The skeleton renders a two-column layout (main + rail)
- Skeleton shapes appear for: metrics bar, needs attention area, recent items area, project cards, and activity rail
- No tab bar skeleton is rendered

### AE-13 — Responsive stacking at narrow widths

**Given**
- The browser viewport is narrower than 1024px

**When**
- The dashboard renders

**Then**
- The right rail stacks below the main content instead of beside it
- No content is clipped or overflows

---

## Open Questions

- `Q1.` Should "Continue Where You Left Off" entries persist across browser sessions (localStorage) or be session-only (sessionStorage)? The spec assumes localStorage for persistence across sessions, but sessionStorage could be argued for privacy. Recommendation: use localStorage for better TTFSM across sessions.
- `Q2.` Should the Deployments tab content be completely removed, or should a minimal "Deployments overview coming soon" link/indicator remain somewhere on the Home page to signal the upcoming feature? The spec currently removes it entirely since there is no dedicated Deployments route yet.
- `Q3.` For the "Needs Attention" section, should the attention items be clickable to navigate to a filtered view (e.g., clicking "2 mappings with errors" navigates to a filtered project/mapping list)? This would add significant value but increases scope. Recommendation: defer deep-linking to a follow-up; make items non-interactive in this iteration but use `<button>` elements for future upgrade.

---

## Verification Strategy

All acceptance examples should be covered by automated tests:

- **AE-01, AE-02, AE-10, AE-11, AE-12:** Component tests for `HomeDashboardPage` verifying layout structure, absence of tabs, absence of Schema Library card, presence of activity rail, and skeleton structure.
- **AE-03, AE-04:** Component tests for `NeedsAttention` rendering with and without error data.
- **AE-05, AE-06:** Component tests for `ContinueWhereYouLeftOff` with and without localStorage data.
- **AE-07:** Unit test for `useRecentActivity` hook verifying localStorage write behavior.
- **AE-08, AE-09:** Component tests for `ProjectCard` verifying condensed deploy summary and error accent.
- **AE-13:** Manual verification (responsive layout).

Verification commands:
- `cd ui && pnpm typecheck` — zero errors
- `cd ui && pnpm lint` — zero errors
- `cd ui && pnpm test` — all tests pass including new/updated home feature tests

---

## Task Generation Notes

This spec decomposes into 9 tasks. All are `Agent: ui-task` except the architecture update which is `Agent: task`.

1. **T-01: Remove DashboardTabs and SchemaLibraryCard** — Retire `DashboardTabs.tsx`, remove `SchemaLibraryCard` from `HomeDashboardPage`, render project content directly. This is the foundation for all subsequent layout work.
2. **T-02: Add Needs Attention scaffold section** — New `NeedsAttention` component. Derives "mappings with errors" from existing metrics. Other items are scaffold placeholders. Depends on T-01 (page structure change).
3. **T-03: Add Continue Where You Left Off section** — New `useRecentActivity` hook + `ContinueWhereYouLeftOff` component + navigation recording in route pages. Depends on T-01.
4. **T-04: Refine MetricsBar** — Remove "Deployed" card. Add visual emphasis to "Has Errors" when count > 0. Depends on T-01 (because MetricsBar moves out of tabs).
5. **T-05: Redesign page layout to two-column with right rail** — Restructure `HomeDashboardPage` to use a main column + right rail layout. Wire all sections (metrics, attention, recent, projects, activity) into the new layout. Depends on T-01, T-02, T-03, T-04.
6. **T-06: Enhance ProjectCard deploy/status visibility** — Condensed deploy summary, error accent border, stronger badge colors. Independent of layout work.
7. **T-07: Add Activity rail placeholder** — New `ActivityPlaceholder` component for the right rail. Independent; wired in T-05.
8. **T-08: Update tests for new dashboard layout** — Update existing tests, add tests for new components. Depends on T-05 (final layout), T-06, T-07.
9. **T-09: Update project-structure.md** — Reflect any new files added to `features/home/`. Depends on T-08 (all implementation complete). Agent: task.

Parallelization: T-02, T-03, T-04, T-06, T-07 are mostly independent of each other (all depend on or work alongside T-01). T-05 is the integration point. T-08 covers verification. T-09 is the architecture update.

---

## Change Log

- Rev 1 — 2026-05-12
  - Initial draft
