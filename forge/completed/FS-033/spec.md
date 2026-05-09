# SPEC

## Title

Redesign Test Lab Layout for Simultaneous Result Visibility

---

## ID

FS-033

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-09
Last Updated: 2026-05-10
Type: ui

---

## Status

completed

---

## Revision

Rev: 2

---

## Summary

Redesign the Advanced Testing page (Test Lab) from its current tabbed result layout to a multi-panel simultaneous layout where Output, Diff, Diagnostics, and Trace are visible together on wide screens. This reduces context-switching during debugging and accelerates time-to-first-successful-mapping (TTFSM). The redesign includes responsive breakpoint behavior, collapsible/resizable panels, sticky execution summary, empty states, and persisted layout preferences.

---

## Problem

The current Advanced Testing page uses a tabbed layout for its four result panels (Output, Diagnostics, Trace, Diff). Users can only see one result panel at a time and must click between tabs to correlate execution output with diagnostics, trace data, or diff results. This click-hopping pattern slows debugging workflows and forces users to mentally hold information from one tab while switching to another.

For complex mappings with multiple diagnostics, the tab-switching overhead is especially costly — users often need to cross-reference a specific trace entry with the corresponding output field or diagnostic message.

---

## Goal

Users should be able to see all relevant execution outputs simultaneously on a single screen. On wide desktop displays, Output, Diff, Diagnostics, and Trace panels should all be visible at once. On progressively narrower viewports, the layout should degrade gracefully — collapsing less-critical panels and falling back to tabs as a last resort on narrow desktop screens.

---

## Assumptions

- The existing display components (`OutputDisplay`, `DiagnosticsDisplay`, `TraceDisplay`, `DiffDisplay`) remain functionally unchanged — their props interfaces are stable and their rendering is self-contained.
- The existing `usePreviewExecution` hook and `PreviewProvider` context remain the execution infrastructure — this spec does not change execution logic.
- The page continues to live at the existing route `/projects/:projectId/mappings/:mappingId/test`.
- The left panel (Source Data Input + Test Case Manager) is structurally unchanged — its internal components and behavior are not modified. The left/right split between the source panel and the result area is now resizable.
- Desktop-first: minimum viewport 1024px per project constraint.

---

## Current Context

### Page Structure

The Advanced Testing page (`AdvancedTestingPage.tsx`) is a full-page testing surface at route `/projects/:projectId/mappings/:mappingId/test`. It uses a two-panel layout:

- **Left panel (~35%):** `SourceDataInput` (scrollable textarea) + `TestCaseManager` (CRUD list below source input).
- **Right panel (~65%):** A tab bar with 4 tabs (Output | Diagnostics | Trace | Diff) and a content area that shows only the active tab's content. All tab panels are mounted but hidden via `hidden` attribute.

### Display Components

All four display components live in `ui/src/features/mappings/components/preview/`:

| Component | Props | Notes |
|---|---|---|
| `OutputDisplay` | `state: PreviewExecutionState` | Renders JSON output or error |
| `DiagnosticsDisplay` | `state: PreviewExecutionState` | Renders diagnostic list from execution result |
| `TraceDisplay` | `trace: TraceEntry[] \| undefined`, `traceEnabled: boolean` | Renders trace entries; shows enable prompt when trace disabled |
| `DiffDisplay` | `state: PreviewExecutionState`, `initialExpectedOutput?`, `onExpectedRawChange?` | Renders diff between expected and actual output |

### Related Resizable Pattern

The Mapping Editor (`MappingEditorPage.tsx`) already implements a resizable panel layout via `useResizableLayout()` hook. This hook manages pixel-based widths, collapse states, drag handles, and localStorage persistence. The Test Lab layout can draw on this pattern but requires its own independent hook (different panel topology and persistence key).

---

## Scope

### In Scope

- Replace the tabbed right panel with a multi-panel simultaneous layout
- Show Output, Diff, Diagnostics, and Trace together on wide screens (1280px+)
- Define responsive behavior:
  - **Wide (>= 1280px):** All 4 panels visible in a 2x2 grid
  - **Medium (1024px – 1279px):** 2-column layout with secondary panels collapsible
  - **Narrow desktop fallback (< 1024px):** Degrade to tab layout (preserve current behavior)
- Create a reusable `ResultPanel` wrapper component with: header bar, panel title, optional badge (e.g., diagnostic count), collapse/expand toggle, empty state
- Add resizable dividers between panels (horizontal and vertical)
- Add a sticky execution summary bar above the result panels showing: execution status, duration, rule stats, diagnostic summary counts
- Persist user layout preferences (panel sizes, collapsed state, main split ratio) to localStorage
- Define which panels are always visible vs. optional/collapsible
- Make the left/right split (source panel vs. result area) resizable with a default 35/65 ratio, enforced min/max constraints, and persisted user preference
- Update existing tests for the Advanced Testing page

### Out of Scope

- Changes to the display component internals (OutputDisplay, DiagnosticsDisplay, TraceDisplay, DiffDisplay)
- Changes to `usePreviewExecution`, `PreviewProvider`, or execution logic
- Changes to the left panel internals (SourceDataInput, TestCaseManager component behavior)
- Changes to the top bar layout or controls (Back to Editor, Trace/Auto-run toggles, Run button)
- Changes to the Mapping Editor inline preview strip or BottomArea
- Mobile responsive behavior (minimum is 1024px per project constraints)
- Test case data model or test case execution features (separate spec)
- AI-powered testing features

---

## Non-Goals

- This spec does not redesign the left panel or source input area.
- This spec does not introduce new execution features (batch run, comparison mode, etc.).
- This spec does not add new result panel types beyond the existing four.
- This spec does not change routing or add new pages.

---

## Relevant Areas

- `ui/src/features/mappings/components/AdvancedTestingPage.tsx` — primary file being redesigned
- `ui/src/features/mappings/components/AdvancedTestingPage.test.tsx` — tests to update
- `ui/src/features/mappings/components/preview/` — display components (unchanged, but referenced)
- `ui/src/features/mappings/hooks/use-preview-execution.ts` — execution hook (unchanged, but wired)
- `ui/src/features/mappings/hooks/use-resizable-layout.ts` — reference pattern for resizable panels
- `ui/src/features/mappings/hooks/` — new hook location
- `forge/architecture/ui-application.md` — architecture update needed

---

## Dependencies / Blockers

- none (all prerequisite infrastructure exists)

---

## Constraints

- Must preserve existing `AdvancedTestingPage` props interface (`projectId`, `mappingId`)
- Must preserve existing `PreviewProvider` isolation pattern
- Must not break the existing display component contracts
- Must follow existing project conventions: Tailwind CSS 4, TypeScript strict, Vitest + RTL, desktop-first
- Must not introduce external layout/resize libraries — use the same mouse-event-based drag pattern established by `useResizableLayout`
- localStorage persistence must fail silently (no UI crash on storage errors)
- Panel sizes must have enforced minimums to prevent panels from becoming unusable
- All panels must remain mounted (not unmounted on collapse) to preserve internal state

---

## Proposed Behavior

### User Flow

1. User navigates to Test Lab (`/projects/:projectId/mappings/:mappingId/test`)
2. The page loads with the left panel (source + test cases) and the right area showing the multi-panel layout
3. Before execution, all result panels show their individual empty states
4. User enters source data, clicks Run
5. After execution completes, all four panels simultaneously display their results:
   - **Output** (top-left): JSON execution output
   - **Diff** (top-right): expected vs. actual comparison
   - **Diagnostics** (bottom-left): diagnostic messages with severity badges
   - **Trace** (bottom-right): trace entries (if trace enabled)
6. A sticky summary bar above the panels shows execution duration, rule stats (evaluated/succeeded/failed), and diagnostic counts (errors/warnings/info)
7. User can collapse any panel to focus on specific results — collapsed panels show only their header bar
8. User can drag dividers between panels to resize
9. User can drag the divider between the left panel (source + test cases) and the right area (result panels) to resize the main split
10. Layout preferences persist across sessions via localStorage

### System Behavior

#### Panel Layout Grid

On wide viewports (>= 1280px), the page renders with a resizable left/right split and a 2x2 result grid:

```
┌──────────────┬┬─────────────────────────────────────────────┐
│              ││ Execution Summary Bar (sticky)              │
│              │├─────────────────────┬┬──────────────────────┤
│ Source Data  ││ Output              ││ Diff                 │
│ Input        ││                     ││                      │
│              ││                     ││                      │
│──────────────│├─────────────────────┤├──────────────────────┤
│ Test Case    ││ Diagnostics         ││ Trace                │
│ Manager      ││                     ││                      │
│              ││                     ││                      │
└──────────────┴┴─────────────────────┴┴──────────────────────┘

Legend: `││` between left and right areas is a draggable main-split resize handle.
        `││` within the result grid are draggable column/row resize handles.
```

- Main split divider between left panel and right result area — horizontally resizable (default 35/65)
- Vertical divider between left column (Output + Diagnostics) and right column (Diff + Trace) — horizontally resizable
- Horizontal divider between top row (Output + Diff) and bottom row (Diagnostics + Trace) — vertically resizable

#### Panel Visibility Rules

| Panel | Always visible | Collapsible | Default state |
|---|---|---|---|
| Output | Yes (wide/medium) | No (always expanded at wide/medium) | Expanded |
| Diff | Yes (wide) | Yes (medium) | Expanded |
| Diagnostics | Yes (wide) | Yes (medium) | Expanded |
| Trace | Conditional | Yes (all breakpoints) | Collapsed when trace disabled |

Trace panel default state is derived from `traceEnabled`:
- When `traceEnabled === false`: Trace panel starts collapsed with a message "Enable Trace in the top bar to see execution trace"
- When `traceEnabled === true`: Trace panel starts expanded

#### Responsive Breakpoints

| Breakpoint | Width | Layout | Behavior |
|---|---|---|---|
| Wide | >= 1280px | 2x2 grid | All 4 panels visible; all resizable |
| Medium | 1024px – 1279px | Stacked column | Output always visible; Diff/Diagnostics/Trace collapsible; vertical stack |
| Narrow | < 1024px | Tabs (fallback) | Revert to current tab layout for graceful degradation |

On medium screens, the layout stacks panels vertically:

```
┌──────────────────────────────────────────┐
│ Execution Summary Bar (sticky)           │
├──────────────────────────────────────────┤
│ Output (always expanded)                 │
├──────────────────────────────────────────┤
│ Diff (collapsible)                       │
├──────────────────────────────────────────┤
│ Diagnostics (collapsible)                │
├──────────────────────────────────────────┤
│ Trace (collapsible)                      │
└──────────────────────────────────────────┘
```

#### ResultPanel Component

A reusable wrapper component that provides consistent chrome for each result panel:

- **Header bar:** panel title (left), optional badge (e.g., diagnostic count), collapse/expand chevron (right)
- **Content area:** renders children; scrollable within the panel
- **Collapsed state:** only header bar visible; content hidden but children remain mounted (use CSS `hidden` or `h-0 overflow-hidden`)
- **Empty state:** when no execution result exists, renders a panel-specific empty message
- **Focus ring:** header collapse button has visible focus indicator

Props contract:

```ts
interface ResultPanelProps {
  title: string;
  badge?: { count: number; variant: 'info' | 'warning' | 'error' };
  collapsed: boolean;
  onToggleCollapse: () => void;
  collapsible?: boolean; // default true
  emptyState?: React.ReactNode;
  isEmpty?: boolean;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}
```

#### Execution Summary Bar

A sticky bar rendered above the result panels (below the top bar, above the 2x2 grid). It displays:

- **Status indicator:** idle / executing (spinner) / success / error
- **Duration:** `{N}ms` when available
- **Rule stats:** `{evaluated} rules: {succeeded} passed, {failed} failed` (from `ExecutionStats`)
- **Diagnostic counts:** error count (red badge), warning count (amber badge), info count (blue badge)
- **Last run timestamp:** relative time (e.g., "3s ago")

The summary bar is compact (single row, ~32px height) and visually distinct from the panels below it.

#### Resizable Panels

The resizable behavior follows the same mouse-event-based pattern used in the Mapping Editor (`useResizableLayout`):

- `mousedown` on a divider starts tracking
- `mousemove` updates panel sizes (clamped to minimums)
- `mouseup` ends tracking and persists to localStorage
- During drag: cursor forced to `col-resize` or `row-resize`, text selection disabled
- Dividers render as thin lines (2-4px) with a hover highlight

Three resizable dividers:

1. **Main split divider:** between the left panel (source + test cases) and the right result area. Default ratio: 0.35 (35/65 split). Clamped to [0.2, 0.5] — left panel minimum 20% of page, maximum 50%.
2. **Column divider:** between the left result column (Output + Diagnostics) and right result column (Diff + Trace). Default ratio: 0.5. Clamped to [0.2, 0.8].
3. **Row divider:** between the top result row (Output + Diff) and bottom result row (Diagnostics + Trace). Default ratio: 0.5. Clamped to [0.2, 0.8].

Minimum panel sizes:
- Left panel (source area): minimum 200px width
- Each panel in 2x2 grid: minimum 200px width, 150px height
- Stacked column (medium): minimum 120px height per expanded panel

#### localStorage Persistence

Key: `keyra:testlab-layout`

Persisted shape:

```json
{
  "mainSplit": 0.35,
  "columnSplit": 0.5,
  "rowSplit": 0.5,
  "collapsed": {
    "output": false,
    "diff": false,
    "diagnostics": false,
    "trace": true
  }
}
```

- `mainSplit` is a ratio (0-1) representing the left/right divider position (default 0.35)
- `columnSplit` and `rowSplit` are ratios (0-1) representing the result grid divider positions
- `collapsed` stores per-panel collapsed state
- Invalid/missing/corrupt data falls back to defaults silently
- Trace collapsed state is overridden by `traceEnabled` toggle (if user enables trace, trace panel auto-expands)

### Failure / Edge Behavior

- **No execution result:** All panels show their respective empty states inside ResultPanel wrappers. Summary bar shows "idle" status.
- **Execution error:** Output panel shows error message; other panels may be empty. Summary bar shows error status.
- **Trace disabled:** Trace panel collapses automatically with an informational message in the header: "Trace disabled". Enabling trace auto-expands the panel.
- **All panels collapsed (medium breakpoint):** Output cannot be collapsed, so at least one panel is always visible.
- **localStorage unavailable/full:** Layout defaults are used; persistence failures are silently ignored.
- **Very small result data:** Panels shrink to content with their minimum sizes enforced; no blank wasted space beyond minimum.
- **Panel resize below minimum:** Clamped to minimum — divider cannot be dragged past the minimum size threshold.

---

## Acceptance Examples

### AE-01 — Wide viewport shows all four panels simultaneously

**Given**
- Viewport width >= 1280px
- An execution has completed successfully with output, diagnostics, trace (enabled), and expected output set

**When**
- The results render after execution

**Then**
- All four panels (Output, Diff, Diagnostics, Trace) are visible simultaneously in a 2x2 grid
- Each panel has a header bar with its title
- No tab bar is present
- All four panels display their respective content

### AE-02 — Medium viewport stacks panels vertically

**Given**
- Viewport width is 1100px (between 1024px and 1280px)
- An execution has completed

**When**
- The results render

**Then**
- Panels are stacked vertically: Output, Diff, Diagnostics, Trace
- Output panel is always expanded
- Diff, Diagnostics, and Trace panels have collapse/expand toggles
- No 2x2 grid is rendered

### AE-03 — Narrow viewport falls back to tabs

**Given**
- Viewport width < 1024px

**When**
- The page renders

**Then**
- The familiar tabbed layout (Output | Diagnostics | Trace | Diff tabs) is shown
- Behavior matches the pre-redesign tab layout

### AE-04 — Panel collapse and expand

**Given**
- Wide viewport with all panels visible
- Diagnostics panel is expanded

**When**
- User clicks the collapse toggle on the Diagnostics panel header

**Then**
- Diagnostics panel collapses to just its header bar
- The adjacent panels expand to fill the available space
- Clicking the toggle again restores the Diagnostics panel to its previous size

### AE-05 — Trace panel auto-collapse when trace disabled

**Given**
- Trace toggle in top bar is unchecked (trace disabled)
- Wide viewport

**When**
- An execution completes

**Then**
- Trace panel is collapsed by default
- Trace panel header shows "Trace disabled" indicator
- Output, Diff, and Diagnostics panels fill the available space (bottom-right quadrant allocated to other panels or empty)

### AE-06 — Trace panel auto-expands when trace enabled

**Given**
- Trace panel is collapsed because trace was disabled
- User checks the Trace toggle in the top bar

**When**
- Trace is enabled

**Then**
- Trace panel automatically expands
- If a previous execution result with trace data exists, the trace entries are immediately visible

### AE-07 — Resizable dividers

**Given**
- Wide viewport with 2x2 grid
- Column split is at 50/50

**When**
- User drags the vertical divider to the right

**Then**
- Output and Diagnostics columns grow wider
- Diff and Trace columns shrink
- Panel sizes are clamped at minimums (200px width each)
- After mouse release, new sizes are persisted to localStorage

### AE-08 — Layout persistence across sessions

**Given**
- User has customized panel sizes and collapsed the Diff panel
- User navigates away from the page

**When**
- User navigates back to the Test Lab page

**Then**
- Panel sizes restore to the previously saved proportions
- Diff panel is still collapsed
- Layout matches the saved state from localStorage

### AE-09 — Execution summary bar displays stats

**Given**
- An execution has completed with: 10 rules evaluated, 8 succeeded, 2 failed, duration 45ms, 3 warnings, 1 error

**When**
- The summary bar renders

**Then**
- Status shows success (green indicator)
- Duration shows "45ms"
- Rule stats show "10 rules: 8 passed, 2 failed"
- Diagnostic badges show: 1 error (red), 3 warnings (amber)
- Summary bar is visually compact (~32px height)

### AE-10 — Empty state before execution

**Given**
- User has just navigated to the Test Lab
- No execution has been run

**When**
- The page renders

**Then**
- All four ResultPanel wrappers are visible (on wide viewport)
- Each panel shows its empty state message inside the ResultPanel chrome
- Summary bar shows "idle" or "No results yet" status
- Panel headers are present with titles

### AE-11 — Diagnostic badge on panel header

**Given**
- An execution has completed with 5 diagnostics

**When**
- The Diagnostics panel header renders

**Then**
- A badge showing "5" appears next to the "Diagnostics" title in the panel header
- Badge uses the amber warning color variant

### AE-12 — Corrupt localStorage graceful fallback

**Given**
- localStorage key `keyra:testlab-layout` contains invalid JSON

**When**
- The Test Lab page loads

**Then**
- Default layout is applied (35/65 main split, 50/50 grid splits, no panels collapsed except trace when disabled)
- No error is thrown
- Page renders normally

### AE-13 — Resizable left/right main split

**Given**
- Wide or medium viewport
- Main split is at the default 35/65

**When**
- User drags the main split divider to the right (giving more space to the source panel)

**Then**
- Left panel (source + test cases) grows wider
- Right panel (result area) shrinks
- Main split is clamped: left panel cannot exceed 50% or shrink below 20% of page width
- After mouse release, the new split ratio is persisted to localStorage
- On page reload, the split restores to the persisted ratio

---

## Open Questions

- none

---

## Verification Strategy

- **Unit tests (Vitest + RTL):** Cover `ResultPanel` component rendering, collapse/expand behavior, badge rendering, empty states. Cover `useTestLabLayout` hook state transitions, responsive breakpoint detection, localStorage read/write/fallback. Map to AE-01, AE-02, AE-04, AE-05, AE-06, AE-10, AE-11, AE-12.
- **Integration tests (Vitest + RTL):** Cover `AdvancedTestingPage` rendering with multi-panel layout, panel visibility at different breakpoints (mock `matchMedia`), execution summary bar content after execution. Map to AE-01, AE-02, AE-03, AE-09, AE-10.
- **Manual verification:** AE-07 (drag resize of result grid), AE-08 (cross-session persistence), AE-13 (main split resize + persistence). These involve pointer interactions and session reload that are difficult to automate in unit tests.
- **Typecheck:** `pnpm tsc --noEmit` passes
- **Lint:** `pnpm lint` passes with zero errors

---

## Task Generation Notes

This spec is purely UI work — all tasks are `Agent: ui-task` except the architecture update task.

Suggested decomposition:

1. **ResultPanel component** — the reusable panel wrapper (header, collapse, badge, empty state). Independent of layout — can be built and tested first.
2. **useTestLabLayout hook** — panel state management, responsive breakpoint detection, main split ratio, localStorage persistence. Independent of rendering — can be built and tested first.
3. **Multi-panel layout rewrite** — replace the tabbed right panel in `AdvancedTestingPage` with the 2x2 grid using `ResultPanel` + `useTestLabLayout`. Make the left/right split use the hook's `mainSplit` ratio instead of the hardcoded 35%. This is the core integration task.
4. **Resizable dividers** — add mouse-event-based drag handles: main split divider (left/right), column divider, and row divider. Depends on the layout being in place.
5. **Execution summary bar** — sticky bar above the result grid. Depends on layout but could parallelize with resizable dividers.
6. **Test updates** — update `AdvancedTestingPage.test.tsx` to cover the new layout, responsive behavior, main split, and summary bar. Depends on all layout tasks.
7. **Architecture update** — update `ui-application.md` to reflect the new Advanced Testing Page layout including main split resize. Agent: task.

---

## Change Log

- Rev 2 — 2026-05-10
  - All open questions resolved:
    - Q1 resolved: Fixed panel arrangement for v1 (Output top-left, Diff top-right, Diagnostics bottom-left, Trace bottom-right). Panel rearrangement deferred to a future enhancement.
    - Q2 resolved: Collapsed panel headers remain in natural document order at medium breakpoints.
    - Q3 resolved: Left/right main split is now resizable with 35/65 default, [0.2, 0.5] clamp range, and localStorage persistence. Added `mainSplit` to hook state, persistence shape, and layout behavior.
  - Added AE-13 (resizable left/right main split)
  - Updated persistence shape to include `mainSplit` field
  - Updated layout diagrams to show full page with main split divider
  - Updated resizable panels section with three dividers (main, column, row) and per-divider clamp ranges
  - Scope expanded: main split resizable added to In Scope
- Rev 1 — 2026-05-09
  - Initial draft
