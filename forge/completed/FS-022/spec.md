# SPEC

## Title

Mapping Editor — Toolbar Consolidation, Resizable Panels & UX Refinements

---

## ID

FS-022

---

## Metadata

Owner: @christophervuu
Reviewers: TBD
Created: 2026-05-04
Last Updated: 2026-05-04 (Rev 2)
Type: ui

---

## Status

completed

---

## Revision

Rev: 2

---

## Summary

Eliminates the third toolbar bar (GlobalToolbar) from the mapping editor by redistributing its controls, introduces resizable columns and a collapsible bottom panel with persistent layout, adds a test case selector to the inline preview strip, adds a search/filter bar to the Rules View, and makes preview auto-run unconditionally on Apply when source data is present. Together these changes reduce vertical chrome, give users control over panel sizing, and streamline the edit-preview loop.

---

## Problem

The Mapping Editor currently has three horizontal bars stacked above the working area: the NavBar (global nav), EditorTopBar (context bar), and GlobalToolbar (sort, view toggle, focus mode, auto-map placeholder). The GlobalToolbar consumes vertical space for controls that see infrequent use and could be colocated with the panels they govern.

Column widths are fixed percentages (15/35/50) and cannot be adjusted by the user. For wide monitors or narrow workflows, users cannot reclaim space for the panel they need most.

Switching test data in the inline preview strip requires manually pasting JSON. There is no way to select a previously saved test case without navigating to the Advanced Testing page.

The Rules View (RuleList) has no search or filter capability, making it hard to locate rules in large mapping configs.

Auto-preview currently relies on an opt-in toggle (autoPreview state). The desired behavior is for preview to always fire on Apply when source data is present, reducing friction in the edit-preview cycle.

---

## Goal

- Remove the GlobalToolbar bar entirely, reducing the editor to a two-bar header (NavBar + EditorTopBar).
- Relocate Sort and View Toggle into the target panel's toolbar area; relocate the Auto-map placeholder into EditorTopBar; remove Focus mode entirely.
- Make all three column panels and the bottom area user-resizable with drag handles, min/max constraints, double-click collapse, and localStorage-persistent layout.
- Add a test case selector dropdown to the inline preview strip so users can load saved test data without manual paste.
- Add a search/filter bar to the Rules View to find rules by target path, expression text, or type.
- Make preview execution fire automatically on Apply when source data is loaded, without requiring a manual toggle.

---

## Assumptions

- The slot-based `MappingEditorPage` architecture can absorb the toolbar removal without changing child component contracts significantly.
- EditorTopBar has enough space to accommodate the Auto-map placeholder button (it is a disabled placeholder, so minimal UI weight).
- Saved test cases are already available through `useTestCases(mappingId)` with full CRUD support.
- The Rules View is rendered as `RuleList` in the center column when `view === 'rules'`.
- The InlinePreviewStrip is rendered in Target View; Rules View uses `BottomArea`. The test case selector appears in both surfaces for UX consistency.

---

## Current Context

The Mapping Editor layout is defined in `MappingEditorPage.tsx` with five slots: `toolbarContent`, `sourceContent`, `targetWorklistContent`, `builderContent`, and `bottomContent`. Column widths are hardcoded CSS percentages (15% / 35% / flex-1). The bottom panel has mouse-drag resizing (min 180px, max 65vh) but no collapse or persistence.

`GlobalToolbar.tsx` receives `sort`, `view`, `breadcrumbMode`, and `onViewToggle` props from the composition layer. It renders:
1. Sort `<select>` (schema / unmapped-first / required-first)
2. Auto-map placeholder button (disabled)
3. Focus mode toggle
4. Target View / Rules View toggle

`TargetWorklist.tsx` already owns its own search input and four filter chips (Unmapped / Warnings / Required / Arrays). Adding the sort dropdown and view toggle to its toolbar area is a natural extension.

`EditorTopBar.tsx` is a single-row header with breadcrumb links, version badge, deploy badge, schema context, save controls, and config/history/deploy buttons.

`InlinePreviewStrip.tsx` (expanded mode) has: source textarea, run button, output display, status summary, auto-preview checkbox, and "Open Advanced Testing" link. It does not have test case loading.

`ConnectedInlinePreviewStrip.tsx` owns `sourceData`, `isCollapsed`, and `autoPreview` state. It wires `usePreviewExecution` and delegates rendering to `InlinePreviewStrip`.

`RuleList.tsx` has CRUD, drag-reorder, multi-select, and bulk actions but no search or filter capability.

`BreadcrumbNav.tsx` renders breadcrumb segments for focus/drill-down mode. It is rendered inside TargetWorklist only when `breadcrumbMode` is active.

Test case persistence is handled by `useTestCases(mappingId)` hook, which stores in `keyra:testcases:{mappingId}` localStorage key and returns `{ testCases, saveTestCase, loadTestCase, deleteTestCase }`.

---

## Scope

### In Scope

- Remove `GlobalToolbar.tsx` component and the `toolbarContent` slot from `MappingEditorPage`.
- Move Sort dropdown and View Toggle into the TargetWorklist toolbar area (above the existing search input).
- Move the Auto-map placeholder button into EditorTopBar.
- Remove Focus mode (breadcrumb drill-down) entirely: remove the toggle, `BreadcrumbNav` rendering in TargetWorklist, `breadcrumbMode` and `currentSubtreePath` state.
- Make the three column panels horizontally resizable via drag handles.
- Apply min-width and max-width constraints to each column.
- Support double-click on a column drag handle to collapse/expand the adjacent panel.
- Persist column widths and collapse state in localStorage.
- Enhance the existing bottom-panel resize to support double-click collapse and localStorage persistence.
- Add a test case selector dropdown to the inline preview strip and to the BottomArea (Rules View).
- Add a search/filter bar to `RuleList` for filtering rules by target path, expression text, or rule type.
- Make preview auto-run on Apply unconditionally when source data is present (remove the opt-in gate).
- Update all affected tests.

### Out of Scope

- Changing the overall three-column + bottom-area layout topology.
- Adding new view modes beyond Target View / Rules View.
- Implementing the Auto-map feature (it remains a disabled placeholder).
- Changing the Advanced Testing page layout.
- Mobile or responsive breakpoint changes beyond existing 1024px minimum.
- Drag-and-drop between panels (existing DnD from source to builder is unchanged).

---

## Non-Goals

- This spec is not trying to redesign the overall editor experience or introduce a new layout paradigm.
- This spec is not implementing keyboard-based panel resizing (mouse-drag and double-click only).
- This spec is not adding test case management UI to the preview strip (only selection; save/edit/delete stays on Advanced Testing page).

---

## Relevant Areas

- `ui/src/features/mappings/components/MappingEditorPage.tsx`
- `ui/src/features/mappings/components/GlobalToolbar.tsx` (removal)
- `ui/src/features/mappings/components/BreadcrumbNav.tsx` (removal)
- `ui/src/features/mappings/components/TargetWorklist.tsx`
- `ui/src/features/mappings/components/EditorTopBar.tsx`
- `ui/src/features/mappings/components/InlinePreviewStrip.tsx`
- `ui/src/features/mappings/components/ConnectedInlinePreviewStrip.tsx`
- `ui/src/features/mappings/components/RuleList.tsx`
- `ui/src/features/mappings/hooks/use-mapping-editor.ts`
- `ui/src/features/mappings/hooks/use-test-cases.ts`
- `ui/src/features/mappings/types.ts`
- `ui/src/features/mappings/index.ts` (barrel updates)
- `tests/e2e/pages/mapping-editor.page.ts ?`

---

## Dependencies / Blockers

- Depends on FS-021 (completed) — InlinePreviewStrip, EditorTopBar, and current layout established there.
- Depends on FS-020 (completed) — Three-column layout and TargetWorklist.
- Depends on FS-012 (completed) — Preview execution and test case hooks.

---

## Constraints

- Must preserve the `PreviewProvider` nesting boundary in `MappingEditorPage`.
- Must not break existing `data-testid` selectors used by E2E tests (or update them in the same task).
- Column drag handles must not interfere with source-to-builder drag-and-drop (HTML5 DnD).
- localStorage layout key must be namespaced (`keyra:editor-layout`) to avoid collisions.
- Collapsed panels must remain accessible (can be re-expanded via double-click or a visible expand affordance).
- Desktop-first; minimum 1024px viewport assumption is unchanged.
- TypeScript strict, zero lint/typecheck/test errors.

---

## Proposed Behavior

### User Flow

**Toolbar consolidation:** The user opens the Mapping Editor and sees only two header rows: the NavBar and the EditorTopBar (context bar). The EditorTopBar now includes a disabled Auto-map button (existing placeholder). The target panel toolbar (above the search input in TargetWorklist) now includes a Sort dropdown and a Target View / Rules View toggle. Focus mode no longer exists.

**Panel resizing:** Drag handles appear between the Source panel and Target panel, and between the Target panel and Builder panel. The user can drag these handles horizontally to resize columns. Each column has a minimum width (Source: 180px, Target: 250px, Builder: 300px). Double-clicking a drag handle collapses the adjacent panel to zero width with a smooth transition. A persistent expand strip (12-16px wide, with a chevron icon and rotated panel label) remains on the collapsed edge — clicking it restores the panel. Double-click on the handle also restores the panel as a power-user shortcut. The layout is persisted in localStorage and restored on next visit.

The bottom panel's existing drag resize is enhanced: double-clicking the bottom resize handle collapses the bottom area. A thin collapsed bar remains visible (using InlinePreviewStrip's existing collapsed state). The bottom panel has a minimum height of 100px when expanded. Bottom panel height is also persisted in localStorage.

**Test case selector:** In the expanded inline preview strip (Target View) and in the BottomArea (Rules View), a dropdown appears next to the source textarea label. The dropdown lists all saved test cases for the current mapping (from `useTestCases`). Selecting a test case populates the source textarea with that test case's `sourceData`. If no test cases exist, the dropdown shows "No saved test cases" as a disabled option. Both surfaces share the same `useTestCases(mappingId)` hook and produce identical behavior.

**Rules View search:** When the user switches to Rules View, the RuleList panel shows a search input above the rule rows (below the toolbar/add-rule bar). Typing in the search input filters visible rules by matching against target path, expression text, or rule type. The filter is applied as-you-type with 200ms debounce. A clear button resets the search. The matched count is displayed.

**Auto-preview on Apply:** When the user clicks Apply on a ScalarFieldBuilder (or any builder that applies a rule), and source data is loaded in the preview strip, the preview executes automatically. This behavior is unconditional — there is no toggle. The existing auto-preview checkbox is removed from the InlinePreviewStrip.

### System Behavior

**Layout persistence:** Column widths are stored as pixel values in `localStorage` under key `keyra:editor-layout`. The stored object shape:

```json
{
  "sourceWidth": 200,
  "targetWidth": 450,
  "bottomHeight": 260,
  "sourceCollapsed": false,
  "bottomCollapsed": false
}
```

The builder column width is derived (total available minus source minus target). On load, if the stored layout would violate min-width constraints at the current viewport, the layout falls back to defaults.

**Drag handle behavior:** Each drag handle is a 6px-wide interactive zone rendered between panels. During drag, `cursor: col-resize` is applied to the document body. Mouse move events update the adjacent panel widths. On mouse up, the final widths are persisted.

**Test case selector:** `ConnectedInlinePreviewStrip` receives `testCases` and `onLoadTestCase` from the composition layer. When a test case is selected, `sourceData` state is updated with the test case's `sourceData` string. This triggers the existing auto-preview flow (since source data changed and a rule was previously applied). The same pattern is applied to `BottomArea` — it receives `testCases` and `onLoadTestCase` and renders an identical dropdown in its source data section.

**Rules View search:** RuleList owns the search state internally (mirrors the TargetWorklist pattern). It computes filtered rule indices and passes them to rendering. The underlying rule data is unchanged — only display is filtered. Selected-rule state and CRUD operations continue to use original indices.

### Failure / Edge Behavior

- **localStorage missing/corrupt layout:** Fall back to default column widths (15%/35%/flex). No error shown.
- **Viewport narrower than combined minimums:** Panels overflow horizontally; user can scroll. This is an existing behavior at 1024px.
- **Collapsing all panels:** At least the Target panel cannot be collapsed (it is the primary working surface). Source and builder panels are collapsible. When collapsed, a persistent expand strip (12-16px) remains on the edge — the user is never stuck without a restore mechanism.
- **Empty test case list:** Dropdown shows "No saved test cases" (disabled). The source textarea remains editable for manual input.
- **Drag handle and DnD conflict:** Drag handles use a distinct `data-resize-handle` attribute and their own mousedown/mousemove listeners. HTML5 DnD events (dragstart/dragover/drop) are unrelated and do not conflict because resize handles are not draggable elements and do not set DataTransfer.
- **Search with special characters:** The Rules View search treats the input as a plain substring match (no regex). No escaping needed.

---

## Acceptance Examples

### AE-01 — GlobalToolbar removed, controls relocated

**Given**
- The Mapping Editor is open with source and target schemas loaded.

**When**
- The page renders.

**Then**
- No element with `data-testid="global-toolbar"` exists in the DOM.
- The `data-testid="target-worklist-container"` contains a sort dropdown and a segmented view toggle (Target View / Rules View).
- The `data-testid="editor-top-bar"` contains a disabled Auto-map button.

### AE-02 — Focus mode removed

**Given**
- The Mapping Editor is open.

**When**
- The page renders.

**Then**
- No element with `data-testid="toolbar-breadcrumb-mode"` exists.
- No element with `data-testid="breadcrumb-nav"` exists.
- Clicking an object/array node in the target worklist selects it (opens builder panel), not drill-down.

### AE-03 — Column drag resize

**Given**
- The Mapping Editor is open with default column widths.

**When**
- The user presses mousedown on the drag handle between Target and Builder panels.
- The user drags 100px to the left.
- The user releases the mouse.

**Then**
- The Target panel width decreases by ~100px.
- The Builder panel width increases by ~100px.
- The Source panel width is unchanged.
- Neither panel is narrower than its minimum width.

### AE-04 — Double-click collapse with persistent expand strip

**Given**
- The Source panel is expanded at its current width.

**When**
- The user double-clicks the drag handle between Source and Target panels.

**Then**
- The Source panel collapses to zero width.
- The Target panel expands to fill the freed space.
- A persistent expand strip (12-16px wide) remains on the collapsed edge with a chevron icon and the label "Source".
- Clicking the expand strip restores the Source panel to its previous width.
- Double-clicking the drag handle also restores the panel (power-user shortcut).

### AE-05 — Layout persistence

**Given**
- The user has resized columns (Source: 250px, Target: 400px) and collapsed the bottom panel.

**When**
- The user refreshes the page or navigates away and returns to the editor.

**Then**
- The columns restore to Source: 250px, Target: 400px.
- The bottom panel is collapsed.

### AE-06 — Test case selector loads data (Target View)

**Given**
- Two test cases exist for the current mapping: "Patient Basic" and "Patient Full".
- The inline preview strip is expanded (Target View).

**When**
- The user opens the test case dropdown.
- The user selects "Patient Basic".

**Then**
- The source data textarea is populated with the "Patient Basic" test case's sourceData.
- Preview executes automatically (since source data is now present and a rule was previously applied).

### AE-07 — Test case selector empty state

**Given**
- No test cases exist for the current mapping.

**When**
- The user looks at the test case dropdown (in either Target View or Rules View).

**Then**
- The dropdown shows "No saved test cases" as a disabled option.
- The source textarea remains empty and editable.

### AE-14 — Test case selector in Rules View BottomArea

**Given**
- Two test cases exist for the current mapping: "Patient Basic" and "Patient Full".
- The editor is in Rules View with the BottomArea visible.

**When**
- The user opens the test case dropdown in the BottomArea.
- The user selects "Patient Full".

**Then**
- The source data textarea in the BottomArea is populated with the "Patient Full" test case's sourceData.

### AE-08 — Rules View search filters by target path

**Given**
- The editor is in Rules View with 20 rules loaded.
- Rule at index 3 has target path `patient.name.given`.

**When**
- The user types "name.given" in the Rules View search bar.

**Then**
- Only rules whose target path, expression, or type contains "name.given" are shown.
- Rule index 3 is visible.
- The match count displays the number of visible rules.

### AE-09 — Rules View search clear

**Given**
- The Rules View search bar has text "name.given" with 3 rules visible.

**When**
- The user clicks the clear button.

**Then**
- All 20 rules are visible again.
- The search input is empty.

### AE-10 — Auto-preview on Apply

**Given**
- The inline preview strip is expanded.
- Source data is loaded (non-empty) in the source textarea.
- No auto-preview toggle/checkbox exists.

**When**
- The user clicks Apply on the ScalarFieldBuilder.

**Then**
- The preview executes automatically (output updates).

### AE-11 — Auto-preview skipped when no source data

**Given**
- The inline preview strip is expanded.
- The source textarea is empty.

**When**
- The user clicks Apply on the ScalarFieldBuilder.

**Then**
- No preview execution occurs.
- The output area remains unchanged.

### AE-12 — Bottom panel double-click collapse

**Given**
- The bottom panel (preview strip) is expanded at height 260px.

**When**
- The user double-clicks the bottom resize handle.

**Then**
- The bottom panel collapses to a slim bar (collapsed state).
- The collapsed state is persisted in localStorage.

### AE-13 — Min-width constraint enforcement

**Given**
- The Source panel is at 200px width (minimum is 180px).

**When**
- The user drags the Source/Target handle to shrink Source by 50px.

**Then**
- The Source panel stops at 180px (minimum width).
- The Target panel only gains 20px (200 - 180 = 20).

---

## Open Questions

- none

---

## Resolved Questions

- `Q1.` **Segmented control confirmed.** The view toggle is a binary toggle between two views of the same data, not navigation to different content. Tabs imply separate pages/sections; a segmented control implies "same content, different presentation." Matches the existing pattern.
- `Q2.` **Both surfaces.** The test case selector appears in both InlinePreviewStrip (Target View) and BottomArea (Rules View). Forcing users to switch views just to load a test case breaks flow. The dropdown is lightweight, and both surfaces share `useTestCases(mappingId)`.
- `Q3.` **Persistent expand strip (primary) + double-click (secondary).** A 12-16px strip on the collapsed edge with a chevron icon is always visible, zero-cost in space, and discoverable without documentation. Double-click on the drag handle remains as a power-user shortcut. This matches VS Code, Chrome DevTools, and IntelliJ patterns.

---

## Verification Strategy

- Unit tests for the resize hook/utility (drag behavior, min/max enforcement, localStorage read/write).
- Unit tests for Rules View search filtering logic (substring matching across target, expression, type fields).
- Component tests for TargetWorklist with relocated Sort + View Toggle controls.
- Component tests for EditorTopBar with Auto-map button.
- Component tests for InlinePreviewStrip with test case selector dropdown.
- Component tests for RuleList with search bar.
- Integration test for auto-preview on Apply (Apply triggers preview when source data is present).
- E2E test updates if existing tests reference `data-testid="global-toolbar"`.
- Typecheck and lint must pass across all touched files.

Map to acceptance examples:
- AE-01, AE-02: Component tests for GlobalToolbar removal and control relocation.
- AE-03, AE-04, AE-05, AE-12, AE-13: Unit/component tests for resize behavior and persistence.
- AE-06, AE-07, AE-14: Component tests for test case selector in both surfaces.
- AE-08, AE-09: Unit/component tests for Rules View search.
- AE-10, AE-11: Component/integration tests for auto-preview behavior.

---

## Task Generation Notes

This spec decomposes into six tasks:

1. **Remove GlobalToolbar and redistribute controls** (ui-task) — Delete `GlobalToolbar.tsx`, remove the `toolbarContent` slot from `MappingEditorPage`, move Sort + View Toggle into `TargetWorklist` toolbar area, move Auto-map into `EditorTopBar`, remove Focus mode (`BreadcrumbNav` rendering, `breadcrumbMode`/`currentSubtreePath` state). This is the foundational layout change.

2. **Implement resizable panel columns** (ui-task, depends T-01) — Add horizontal drag handles between the three columns, min/max width constraints, double-click collapse for Source and Builder panels (Target is not collapsible), and localStorage persistence. Enhance the existing bottom-panel resize with double-click collapse and localStorage persistence. Introduce a `useResizableLayout` hook.

3. **Add test case selector to preview strip and BottomArea** (ui-task) — Add a dropdown to `InlinePreviewStrip` / `ConnectedInlinePreviewStrip` and to `BottomArea` that lists saved test cases and populates source data on selection. Wire through `useTestCases`.

4. **Add search bar to Rules View** (ui-task) — Add a search input to `RuleList` that filters displayed rules by target path, expression, or type. Internal state, debounced, with clear button and match count.

5. **Auto-preview unconditionally on Apply** (ui-task) — Remove the `autoPreview` toggle from `InlinePreviewStrip`. Make the `lastApplyTimestamp` effect always trigger `onRun()` when sourceData is non-empty. Remove the `autoPreview` prop and state.

6. **Update ui-application.md architecture** (task, depends T-01 through T-05) — Reflect all layout changes, updated component hierarchy, removal of GlobalToolbar/BreadcrumbNav, resizable panel model, test case selector, Rules View search, and auto-preview changes.

T-01 must be completed first. T-02 depends on T-01 (layout changes settled). T-03, T-04, T-05 are independent of each other and can be parallelized after T-01. T-06 depends on all others.

---

## Change Log

- Rev 1 — 2026-05-04
  - Initial draft
- Rev 2 — 2026-05-04
  - Resolved Q1: segmented control confirmed for view toggle (no scope change)
  - Resolved Q2: test case selector now appears in both InlinePreviewStrip (Target View) and BottomArea (Rules View) — expanded T-03 scope
  - Resolved Q3: persistent 12-16px expand strip is the primary restore mechanism for collapsed panels; double-click is secondary shortcut
  - Added AE-14 for test case selector in Rules View BottomArea
  - Updated AE-04 to specify expand strip dimensions and interaction
