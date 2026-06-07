# SPEC

## Title

Redesign Dashboard and app shell to dark-mode workspace with collapsible sidebar

---

## ID

FS-084
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

Redesign the KeyRa dashboard and app shell to match the provided dark SaaS workspace target, replacing the current top-nav shell with a left collapsible sidebar across primary routes. The dashboard should prioritize Projects as the dominant panel and present Recent Activity as a smaller secondary panel with intentional placeholder behavior when activity data is incomplete. Sidebar collapsed state must persist across reloads using client-side localStorage, and dense focused workspace routes must retain compatibility without showing both top and side navigation simultaneously.

---

## Problem

Current shell and dashboard presentation use a top navigation pattern (`NavBar`) and a functional content layout that does not match the requested dedicated workspace style. The visual hierarchy, spacing, interaction polish, and structural composition (sidebar-first app shell, dominant project panel, refined cards/panels) do not meet the new design direction. The current dashboard also includes a metrics strip that does not align with the supplied mockup and dilutes the requested focus on Projects and Recent Activity.

---

## Goal

Deliver a polished dark-mode workspace shell and dashboard layout that follows the supplied mockup’s structure, hierarchy, spacing, and visual style (not pixel-perfect), including sidebar collapse behavior with local persistence, clear active/hover/focus states, and intentional empty/placeholder states for projects and recent activity.

---

## Assumptions

- Existing dashboard data hooks (`useDashboardData`, `useRecentActivity`) remain usable and do not require backend changes.
- Route surface remains unchanged (`/` for dashboard, existing pages/routes preserved).
- Styling remains within current UI stack (React + Tailwind + existing component primitives).
- Desktop-width behavior is the primary target; mobile redesign is out of scope for this spec.
- Existing in-progress specs FS-081/082/083 (deployment architecture) and FS-019 (e2e infra) are unrelated and impose no direct scope constraints here.

---

## Current Context

Repository findings:
- `ui/src/components/layout/AppLayout.tsx` currently renders a top `NavBar` and optional breadcrumbs for most routes.
- `ui/src/components/layout/NavBar.tsx` contains current global navigation with a horizontal top bar.
- `ui/src/features/home/components/HomeDashboardPage.tsx` currently renders a two-column dashboard with metrics/attention/continue/project list and activity placeholder rail.
- Layout tests in `ui/src/components/layout/layout.test.tsx` assert top-nav presence and current shell behavior.
- Canonical visual target for this spec is `forge/active/FS-084/keyra_dashboard_simple.html`.
- Architecture coverage already exists for this subsystem in `forge/architecture/ui-application.md`; this is an architecture-impacting update of existing UI surfaces, not a new subsystem.

---

## Scope

### In Scope

- Replace top app navigation with a fixed left sidebar workspace shell for primary app routes (Home/Dashboard, Schemas, Templates, Settings, Project Overview, and other standard non-focused pages).
- Add sidebar collapsed/expanded behavior and matching nav rendering (icon+label expanded, icon-only collapsed).
- Persist sidebar collapse preference across reloads using client-only localStorage.
- Ensure active nav indicator does not rely on color alone.
- Redesign Dashboard header/content composition to match mockup hierarchy:
  - large title/subtitle
  - right-aligned “New project” button
  - dominant Projects panel
  - secondary Recent Activity panel
- Remove the current dashboard metrics strip from redesigned dashboard content.
- Redesign project cards with dark panel visual treatment, status badge, metadata row, footer/divider, and Open CTA alignment.
- Add/adjust interaction states: hover/focus/active/collapsed/empty/placeholder.
- Preserve compatibility for Mapping Editor / dense focused workspace routes; integrate sidebar only where it does not break editor experience and never show top nav and sidebar simultaneously.
- Maintain existing route functionality and accessibility semantics for navigation/focus states.
- Update relevant UI tests and add targeted tests for new shell/dashboard behavior.

### Out of Scope

- Backend/API changes for activity generation or project data.
- New product features beyond visual/layout behavior (e.g., advanced activity feed logic).
- Mobile-first redesign or full responsive strategy beyond “narrow desktop stack” requirement.
- Establishing broader app-shell conventions outside FS-084 artifacts; that can be promoted to dedicated architecture docs in future work.

---

## Non-Goals

- Introducing a new design system package or replacing Tailwind strategy.
- Implementing real recent-activity ingestion if currently unavailable.
- Reworking mapping editor/test-lab focused workspace architecture beyond ensuring shell consistency expectations.

---

## Relevant Areas

- `forge/active/FS-084/keyra_dashboard_simple.html`
- `ui/src/components/layout/AppLayout.tsx`
- `ui/src/components/layout/NavBar.tsx` (likely replaced or heavily refactored)
- `ui/src/components/layout/Breadcrumbs.tsx` ?
- `ui/src/features/home/components/HomeDashboardPage.tsx`
- `ui/src/features/home/components/*` (dashboard cards/panels/support components)
- `ui/src/components/layout/layout.test.tsx`
- `ui/src/features/home/components/__tests__/*` ?
- `forge/architecture/ui-application.md` (architecture update)

---

## Dependencies / Blockers

- Canonical mockup for implementation/regression review: `forge/active/FS-084/keyra_dashboard_simple.html`.
- No hard dependency on other active FS items.

---

## Constraints

- Must remove top navigation bar from primary app-shell experience in favor of sidebar-owned global navigation.
- Must preserve existing route paths and basic navigation destinations.
- Must implement dark workspace visual style with clear contrast and hierarchy aligned to `forge/active/FS-084/keyra_dashboard_simple.html`.
- Must include visible non-color-only active indicator for Home active route state.
- Must support sidebar collapse/expand state with content area expansion.
- Must persist sidebar collapsed state client-side in localStorage (no backend persistence).
- Must ensure interaction feedback for cards/nav/buttons/inputs and accessible focus states.
- Must keep recent activity panel intentional when real data is unavailable.
- Must remove dashboard metrics strip from redesigned dashboard.
- Must not render both top navigation and sidebar navigation at the same time.

---

## Proposed Behavior

### User Flow

1. User lands on Dashboard (`/`) and sees a full-height workspace shell with left sidebar and content area.
2. Sidebar shows KeyRa branding, workspace section label, and primary nav rows.
3. User can collapse sidebar to icon-only mode; content area expands accordingly.
4. Sidebar collapse preference is restored on page reload from localStorage.
5. Dashboard header shows “Dashboard” with muted subtitle and right-aligned “New project” action.
6. Main content shows dominant Projects panel and secondary Recent Activity panel on wide screens; panels may stack on narrower desktop widths.
7. User can search projects, switch grid/list mode, hover cards for visual feedback, and use Open buttons.
8. If no activity implementation exists, Recent Activity shows polished placeholder/empty intent rather than broken or blank appearance.

### System Behavior

- App shell renders a left sidebar as the primary global navigation surface for standard routes (Home, Schemas, Templates, Settings, Project Overview, and other non-focused pages).
- Active route presentation includes both color and structural marker (e.g., indicator bar/shape and optional weight/icon treatment).
- Sidebar collapse state toggles layout classes and nav row rendering mode.
- Sidebar collapse preference persists in localStorage and is read on app-shell mount.
- Dashboard layout uses responsive desktop breakpoints to move from side-by-side panels to stacked panels where needed.
- Projects panel preserves existing data-driven rendering but adopts redesigned composition/styling.
- Recent activity panel uses existing data if available; otherwise deterministic placeholder rows/empty-state copy.
- Dashboard metrics strip is removed from the redesigned dashboard.
- Mapping Editor/Test Lab (and other focused workspace routes) remain compatibility-preserving; if sidebar inclusion causes regressions, focused layout behavior is retained without reintroducing top nav.

### Failure / Edge Behavior

- If project list is empty, an intentional empty-project state is shown within the redesigned Projects panel.
- If recent activity data is missing/unimplemented, a deliberate placeholder/empty state is shown with explanatory copy.
- If sidebar is collapsed, labels are hidden but icon navigation remains operable with accessible labels/tooltips.
- If localStorage is unavailable or fails, sidebar defaults to expanded without blocking navigation.
- Keyboard focus must remain visible across interactive controls in both expanded and collapsed sidebar modes.

---

## Acceptance Examples

### AE-01 — Workspace shell replaces top navigation on primary routes

**Given**
- the user opens a primary route (e.g., `/`, `/schemas`, `/templates`, `/settings`, `/projects/:projectId`)

**When**
- the shell renders

**Then**
- a fixed left sidebar is visible
- no top navigation bar is shown
- main content renders to the right with workspace-style spacing

### AE-02 — Sidebar expanded and collapsed states

**Given**
- the sidebar is expanded by default

**When**
- the user toggles collapse

**Then**
- expanded mode shows nav icons and labels
- collapsed mode shows icon-only nav
- content area expands in collapsed mode
- nav items remain accessible and route correctly in both modes

### AE-03 — Active nav indicator is not color-only

**Given**
- Home route is active

**When**
- sidebar nav renders

**Then**
- Home item has a clear active state using color plus at least one non-color cue (shape/indicator/weight/icon state)

### AE-04 — Dashboard hierarchy matches canonical mockup direction

**Given**
- desktop-width viewport

**When**
- Dashboard is rendered

**Then**
- heading/subtitle and right-aligned New project action appear in header area
- Projects panel is visually dominant
- Recent Activity is secondary and smaller
- spacing/alignment follows `forge/active/FS-084/keyra_dashboard_simple.html` direction rather than prior full-width feel

### AE-05 — Projects panel composition and card styling

**Given**
- project data is available

**When**
- Projects panel renders

**Then**
- panel includes title, grid/list toggle, search input, and project cards
- cards show project name, status badge, description, counts/metadata, last-edited footer, and right-aligned Open action
- card hover state provides visible feedback

### AE-06 — Intentional empty/placeholder states

**Given**
- no project data or no recent activity data

**When**
- dashboard panels render

**Then**
- projects empty state is intentional and polished
- recent activity panel shows placeholder rows or explicit empty-state copy
- UI does not imply broken loading behavior

### AE-07 — Interaction and focus states

**Given**
- user hovers/focuses nav items, project cards, New project button, and search input

**When**
- interaction occurs

**Then**
- each control shows visible hover/focus feedback consistent with dark SaaS styling and accessibility expectations

### AE-08 — Sidebar preference persists across reloads

**Given**
- user sets sidebar to collapsed or expanded

**When**
- user reloads the page

**Then**
- sidebar restores the previously selected state from localStorage
- no backend request is required for this preference

### AE-09 — Focused workspace compatibility without dual navigation

**Given**
- user opens Mapping Editor or Test Lab route

**When**
- route layout renders

**Then**
- specialized focused-workspace experience remains usable
- top navigation is not reintroduced
- sidebar integration is only applied if it does not degrade focused editing UX

### AE-10 — Dashboard metrics strip removed

**Given**
- dashboard renders in redesigned mode

**When**
- content panels are displayed

**Then**
- prior metrics strip is not shown
- dashboard emphasizes Projects and Recent Activity panels only

---

## Open Questions

- none

---

## Verification Strategy

- Automated UI tests (React Testing Library) for shell behavior:
  - AE-01, AE-02, AE-03, AE-08, AE-09
- Automated dashboard component tests:
  - AE-04, AE-05, AE-06, AE-07, AE-10
- Manual verification (desktop widths):
  - compare implemented hierarchy/spacing/style against `forge/active/FS-084/keyra_dashboard_simple.html`
  - confirm collapsed sidebar behavior, persistence across reload, and content expansion
  - confirm no top nav + sidebar dual rendering
  - confirm hover/focus states across target controls
- Quality gates:
  - `pnpm --filter ui test` (or equivalent UI test command)
  - `pnpm --filter ui typecheck`
  - `pnpm --filter ui lint` (if configured)

---

## Task Generation Notes

- Decompose into shell/navigation refactor (including persistence + route rollout), dashboard visual composition update, and test coverage hardening tasks.
- Keep UI tasks (`Agent: ui-task`) separate from architecture documentation updates (`Agent: task`).
- Include one explicit architecture update task because this spec materially changes existing UI architecture patterns in `forge/architecture/ui-application.md`.
- Ensure task acceptance checks explicitly reference AE IDs.

---

## Change Log

- Rev 1 — 2026-06-06
  - Initial draft
- Rev 2 — 2026-06-06
  - Resolved Q1: canonical visual target is `forge/active/FS-084/keyra_dashboard_simple.html`.
  - Resolved Q2: sidebar collapsed/expanded preference persists via client-side localStorage.
  - Resolved Q3: sidebar is shared primary shell across standard routes; focused workspace routes preserve compatibility and must not show top + side nav together.
  - Resolved Q4: removed dashboard metrics strip from redesigned dashboard scope.
