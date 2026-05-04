# SPEC

## Title

Mapping Editor UX Redesign

---

## ID

FS-021

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-05-04  
Last Updated: 2026-05-04  

Type: cross-cutting

---

## Status

completed

---

## Revision

Rev: 2

---

## Summary

Redesign the Mapping Editor layout to reduce cognitive load and accelerate time-to-first-saved-mapping (TTFSM). The changes consolidate the top bar from 3 rows to 2, introduce a two-tier save model (Apply + Save), rebalance panel widths to prioritize the builder, add per-panel search, simplify the bottom panel to an inline preview strip, and extract full test case management into a dedicated Advanced Testing page.

---

## Problem

The Mapping Editor screen (`/projects/:projectId/mappings/:mappingId`) has several UX issues that increase cognitive load and slow down TTFSM:

1. **Top area is crowded** — three horizontal rows (global nav, breadcrumbs with raw UUIDs, status bar) consume ~100px before content starts.
2. **Single search bar is ambiguous** — one search field covers only target properties; source fields have no search.
3. **No visible global save action** — users must know Ctrl+S to persist the overall mapping. The existing "Save mapping" button in the builder panel only applies the current rule to the working session.
4. **Panel proportions are wrong** — the target worklist dominates (~55% width) while the builder/editor panel (the primary authoring surface) gets ~33%.
5. **Bottom panel is overloaded** — four tabs (Preview, Diagnostics, Trace, Test Cases) with sub-tabs compete for vertical space during authoring. Advanced testing belongs on a separate page.

---

## Goal

A redesigned Mapping Editor layout that:

- Consolidates the top area from 3 rows to 2, using human-readable names instead of raw UUIDs.
- Introduces a clear two-tier save model (Apply commits rule to session, Save persists to storage).
- Rebalances panel widths to give the builder/editor panel ~50% of horizontal space.
- Provides per-panel search and filter chips within the target panel toolbar.
- Simplifies the bottom area to a compact inline preview strip with a link to Advanced Testing.
- Creates a new dedicated Advanced Testing page with full test case management, trace, diff, and diagnostics.

---

## Assumptions

- The existing FS-020 three-column layout structure (source / target worklist / builder) remains the foundational grid; this spec adjusts proportions and top/bottom areas, not the column architecture.
- The `useMappingEditor` hook's core load/save pipeline remains stable; this spec adds Apply semantics on top.
- The existing `PreviewPanel`, `DiagnosticsDisplay`, `TraceDisplay`, `DiffDisplay`, and `TestCaseManager` components are reusable on the new Advanced Testing page without duplication.
- The `LocalStorageAdapter` is the only persistence layer (Phase 0).
- FS-018 version history drawer remains accessible from the redesigned top bar.

---

## Current Context

The Mapping Editor was implemented in FS-010/FS-011/FS-020 as a three-column layout with a full-width tabbed bottom area. The current architecture (documented in `forge/architecture/ui-application.md`) uses:

- `MappingEditorPage.tsx` — three-column shell with slot props
- `GlobalToolbar.tsx` — single search, filters, sort, focus mode toggle, view toggle
- `EditorTopBar.tsx` — mapping name, version, save status, deploy badges, schema names
- `BottomArea.tsx` — 4-tab container (Preview, Diagnostics, Trace, Test Cases)
- `useMappingEditor.ts` — orchestration hook with load/save/rules/validation wiring; Ctrl+S triggers save
- `AppLayout.tsx` → `NavBar` + `Breadcrumbs` + `<Outlet />`

The breadcrumb component currently renders raw route param values (UUIDs). The "Save mapping" button in `ScalarFieldBuilder` commits an expression to the local rule set (not persistent storage), but its label implies persistent save. Panel widths are set at source ~hidden/15%, target ~55%, builder ~33%.

---

## Scope

### In Scope

- Top bar consolidation: merge breadcrumb row into context row; display human-readable project/mapping names; add always-visible Save button and unsaved state indicator.
- Deploy badge simplification: single highest-environment badge with stale indicator.
- Two-tier save model: rename builder "Save mapping" to "Apply" (commits rule to session); add global "Save" (persists to storage); unsaved/unapplied navigation guards.
- Per-panel search: search input in source panel header; search input in target panel header with filter chips (Unmapped, Warnings, Required, Arrays).
- Panel width rebalance: source ~15% (collapsible), target ~35%, builder ~50%.
- Bottom area simplification: collapse 4-tab area into a compact inline preview strip (input, Run, output, status line, "Open Advanced Testing" link).
- New Advanced Testing page (`/projects/:projectId/mappings/:mappingId/test`): full test case management, trace mode, diff view, diagnostics table, server-side preview placeholder.
- Keyboard behavior: Ctrl+S → global Save; Enter/arrow-down to advance to next unmapped target after Apply.

### Out of Scope

- Deploy actions within the editor (deploy stays on the Deployment Page).
- Mobile or tablet responsive breakpoints.
- Backend API changes (Phase 0 adapter-only).
- Changes to the mapping engine execution logic.
- Modifications to the version history drawer (FS-018).
- Changes to the expression builder internal architecture (GuidedBuilder, RawDslEditor).

---

## Non-Goals

- This spec does not introduce server-side preview execution (the engine remains client-side in Phase 0).
- This spec does not change the drag-and-drop or click-to-stage interaction model.
- This spec does not introduce undo/redo for individual rule edits.

---

## Relevant Areas

- `ui/src/features/mappings/components/MappingEditorPage.tsx`
- `ui/src/features/mappings/components/EditorTopBar.tsx`
- `ui/src/features/mappings/components/GlobalToolbar.tsx`
- `ui/src/features/mappings/components/BottomArea.tsx`
- `ui/src/features/mappings/components/SourceSchemaPanel.tsx`
- `ui/src/features/mappings/components/TargetWorklist.tsx`
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/hooks/use-mapping-editor.ts`
- `ui/src/components/layout/AppLayout.tsx`
- `ui/src/components/layout/Breadcrumbs.tsx`
- `ui/src/routes/paths.ts`
- `ui/src/routes/pages/MappingEditor.tsx`
- `ui/src/routes/pages/MappingAdvancedTesting.tsx` (new)
- `ui/src/App.tsx` (new route registration)
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- FS-020 (three-column layout) must be implemented — this builds on top of it.
- FS-012 (Preview & Testing Panel) must be implemented — this refactors and relocates those components.
- FS-018 (Version History) must be implemented — this preserves its top-bar integration.

---

## Constraints

- Must not introduce deploy actions into the editor (deploy stays on the Deployment Page).
- The mapping engine's client-side preview must remain < 2 seconds.
- The Apply + Save model must warn users before navigating away with unsaved work (both unapplied rule edits and unsaved session changes).
- The Advanced Testing page reuses the same engine and test case data — no duplication of state or localStorage keys.
- Panel width rebalance must preserve the collapsible source panel behavior at <=1024px.
- TypeScript strict mode, lint/format, and existing tests must continue to pass.

---

## Proposed Behavior

### User Flow

**Top bar (2-row layout):**
1. Row 1: Global NavBar (unchanged).
2. Row 2: Context bar — `ProjectName / MappingName` (links), version badge (`v3`), single deploy badge showing highest environment (e.g., "QA" with green dot, or "QA (stale)" with amber dot if saved version is ahead of deployed version), save state indicator ("Saved" or "N unsaved changes"), Save button (primary, disabled when saved), History button (opens FS-018 drawer), actions overflow menu.

**Two-tier save model:**
1. User edits an expression in ScalarFieldBuilder or ExpressionBuilderPanel.
2. User clicks "Apply" (or presses Enter in the builder) — the rule expression is committed to the working session (in-memory rule set). The top bar updates to show "1 unsaved change".
3. User continues editing other rules. Each Apply increments the unsaved count.
4. User clicks "Save" in the top bar (or presses Ctrl+S) — the entire working config is persisted via `adapter.updateMapping()`, version increments, state resets to "Saved".
5. If user clicks a different target field with unapplied changes in the builder, a confirmation dialog warns: "You have unapplied changes to this rule. Discard?" — with "Apply & Continue" navigating to the field the user clicked (not auto-advancing to next unmapped).
6. If user tries to navigate away from the editor route with unsaved changes (applied but not saved), a confirmation dialog warns: "You have N unsaved changes. Save before leaving?"

**Per-panel search:**
1. Source panel header includes a search input that filters the source schema tree using the existing `useTreeSearch` hook (expands ancestor nodes of matches, highlights matched nodes, collapses non-matching branches). No filter chips in the source panel — search only.
2. Target panel header includes a search input that filters the target field list, plus filter chip buttons: Unmapped, Warnings, Required, Arrays. Chips are toggleable and combinable (AND logic between chips, search is additive filter).

**Panel widths:**
- Source panel: `w-[15%]` (collapsible, hidden at <=1024px).
- Target worklist: `w-[35%]`.
- Builder/editor: `w-[50%]`.
- Total three columns fill available width below the top bar, above the bottom strip.

**Bottom area (inline preview strip):**
- Single collapsible row (default expanded, ~120px height).
- Contains: compact JSON source input (single-line with expand toggle), "Run" button, inline output display (truncated, single-line with expand toggle), status line ("2 errors, 1 warning" or "Valid"), "☑ Auto-preview" toggle (default on), "Open Advanced Testing" link/button.
- **Auto-preview behavior:** When "Auto-preview" is enabled and source data is already loaded (from a prior Run or loaded test case), the preview auto-runs on every Apply. Output updates with a subtle flash animation to signal the change. When disabled, preview is manual-trigger-only via the Run button.
- No tabs. No diagnostics, trace, or test case management here.

**Advanced Testing page (`/projects/:projectId/mappings/:mappingId/test`):**
- Full-page layout with left panel (source data input, test case selector) and right panel (output, diff, diagnostics, trace as tabs).
- Test case CRUD: save/load/delete test cases (reuses `useTestCases` hook and same localStorage keys).
- **Data loading:** Fresh load from localStorage on page mount. No shared React Context with the editor page — the testing page is fully independent. Both pages read from the same localStorage keys (`keyra:testcases:{mappingId}`), so test cases created on either page are visible on the other after navigation.
- Trace mode toggle.
- Diff view: expected vs actual output.
- Diagnostics table: full diagnostic detail per rule.
- "Back to Editor" navigation link.
- Loads mapping config and schemas independently (same adapter calls as the editor).

**Keyboard behavior:**
- Ctrl+S → global Save (persist). Overrides previous behavior where Ctrl+S was already bound to save.
- After Apply: cursor/focus advances to the next unmapped target field in the worklist (Enter or arrow-down from builder triggers this).

### System Behavior

- `useMappingEditor` hook gains:
  - `unsavedRuleCount: number` — count of rules modified since last save.
  - `hasUnappliedExpression: boolean` — whether the current builder has uncommitted edits.
  - `applyRule(targetPath, expression)` — commits expression to working rule set, increments `unsavedRuleCount`.
  - `save()` — persists entire config, resets `unsavedRuleCount` to 0, increments version.
  - Navigation guard integration: exposes `canNavigateAway()` and `confirmationMessage()`.

- Breadcrumb resolution: the context bar fetches project name and mapping name from the loaded mapping config (already available in `useMappingEditor` state) rather than displaying raw route params.

- Deploy badge derivation: reads current deploy status from mapping metadata; shows highest of DEV < QA < PROD as the badge. Stale threshold is strictly `savedVersion > deployedVersion` (no content diffing). If the saved version number exceeds the deployed version for the highest environment, shows "(stale)" suffix with amber indicator.

- The inline preview strip invokes the same `usePreviewExecution` hook but with a simplified UI surface. When auto-preview is enabled and source data is present, it triggers `run()` after each `applyRule` call.

- The Advanced Testing page loads mapping config, schemas, and test cases independently from localStorage on mount. It uses its own `PreviewProvider` wrapper (isolated from the editor's provider). Same localStorage keys are accessed via hooks directly — no shared cross-route state.

### Failure / Edge Behavior

- **Apply with invalid expression:** Apply button is disabled when expression fails parse validation (same gate as current "Save mapping" button).
- **Save with no changes:** Save button is disabled when `unsavedRuleCount === 0`.
- **Navigation guard dismissed:** If user dismisses the "unsaved changes" dialog and chooses "Don't Save", changes are lost (consistent with standard web app behavior).
- **Preview timeout:** Inline preview strip shows "Timeout" status if engine execution exceeds 2 seconds. Full diagnostics available on Advanced Testing page.
- **Advanced Testing page with no test cases:** Shows empty state with "Create your first test case" CTA.
- **Stale deploy badge with no deployments:** Badge shows "Not deployed" in neutral gray.

---

## Acceptance Examples

### AE-01 — Top bar shows human-readable names and save state

**Given**
- User is on Mapping Editor for project "Order Transform" / mapping "Shopify to ERP"
- Mapping has version 3, deployed to QA at version 2

**When**
- Page loads

**Then**
- Row 2 shows: `Order Transform / Shopify to ERP` (both clickable links), `v3`, deploy badge "QA (stale)" with amber dot, "Saved" indicator, disabled Save button, History button
- No raw UUIDs visible in the top bar

### AE-02 — Apply commits rule without persisting

**Given**
- User has edited the expression for target field `order.total` in ScalarFieldBuilder
- Expression is valid (passes parse)

**When**
- User clicks "Apply"

**Then**
- Rule for `order.total` is updated in the working session (in-memory)
- Top bar changes from "Saved" to "1 unsaved change"
- Save button becomes enabled (primary style)
- Focus advances to the next unmapped target field in the worklist

### AE-03 — Save persists all applied changes

**Given**
- User has applied 3 rule changes (top bar shows "3 unsaved changes")

**When**
- User clicks Save button (or presses Ctrl+S)

**Then**
- `adapter.updateMapping()` is called with the complete config
- Version increments (v3 → v4)
- Top bar reverts to "Saved" with green checkmark
- Save button becomes disabled
- `unsavedRuleCount` resets to 0

### AE-04 — Navigation guard warns on unsaved changes

**Given**
- User has 2 unsaved changes (applied but not saved)

**When**
- User clicks a navigation link (e.g., project breadcrumb)

**Then**
- Confirmation dialog appears: "You have 2 unsaved changes. Save before leaving?"
- Options: "Save & Leave", "Discard", "Cancel"
- "Save & Leave" triggers save then navigates
- "Discard" navigates without saving
- "Cancel" stays on page

### AE-05 — Navigation guard warns on unapplied builder changes

**Given**
- User has typed an expression in the builder but not clicked Apply
- User's current target selection is `order.total`

**When**
- User clicks a different target field (`order.currency`) in the worklist

**Then**
- Confirmation dialog appears: "You have unapplied changes to this rule. Discard?"
- Options: "Apply & Continue", "Discard", "Cancel"
- "Apply & Continue" applies the current expression to `order.total`, then navigates to `order.currency` (the field the user clicked — not the next unmapped field)
- "Discard" discards the expression and navigates to `order.currency`
- "Cancel" stays on `order.total`

### AE-06 — Per-panel search filters source and target independently

**Given**
- Source schema has fields: `customer.name`, `customer.email`, `order.id`, `order.total`
- Target schema has fields: `buyer.fullName`, `buyer.contact`, `invoice.number`, `invoice.amount`

**When**
- User types "order" in the source panel search
- User types "invoice" in the target panel search

**Then**
- Source panel shows only `order.id` and `order.total` (and parent `order` node)
- Target panel shows only `invoice.number` and `invoice.amount` (and parent `invoice` node)
- Panels filter independently

### AE-07 — Filter chips narrow target worklist

**Given**
- Target has 20 fields; 5 are unmapped, 3 have warnings, 8 are required

**When**
- User clicks "Required" chip, then "Unmapped" chip

**Then**
- Target worklist shows only fields that are both required AND unmapped
- Both chips appear active (highlighted)
- Clicking "Required" again deactivates it; list shows all unmapped fields

### AE-08 — Panel widths are rebalanced

**Given**
- User is on Mapping Editor at viewport width 1440px

**When**
- Page loads with source panel visible

**Then**
- Source panel occupies ~15% (~216px)
- Target worklist occupies ~35% (~504px)
- Builder/editor occupies ~50% (~720px)
- Total fills available width

### AE-09 — Inline preview strip replaces bottom tabs

**Given**
- User is on Mapping Editor

**When**
- Page loads

**Then**
- Bottom area shows a single compact strip (not tabs)
- Strip contains: source input, Run button, output display, status summary, "Open Advanced Testing" link
- No "Diagnostics", "Trace", or "Test Cases" tabs visible in the editor

### AE-10 — Advanced Testing page loads with full test management

**Given**
- User has 3 saved test cases for mapping "Shopify to ERP"

**When**
- User clicks "Open Advanced Testing" link from the editor

**Then**
- Browser navigates to `/projects/:projectId/mappings/:mappingId/test`
- Page shows test case selector with 3 saved cases
- Full tabs: Output, Diagnostics, Trace, Diff
- Trace mode toggle available
- "Back to Editor" link visible

### AE-11 — Deploy badge shows highest environment

**Given**
- Mapping is deployed to DEV (v2) and QA (v3), not deployed to PROD
- Current saved version is v4

**When**
- Page loads

**Then**
- Single badge shows "QA (stale)" with amber dot (because v4 > v3)
- Not three separate DEV/QA/PROD badges

### AE-12 — Keyboard shortcut Ctrl+S triggers global Save

**Given**
- User has 2 unsaved changes

**When**
- User presses Ctrl+S (or Cmd+S on macOS)

**Then**
- Global Save is triggered (same as clicking Save button)
- Changes are persisted, version increments
- Top bar shows "Saved"

### AE-13 — Inline preview auto-runs on Apply when source data is loaded

**Given**
- User has source JSON loaded in the inline preview strip (from a prior Run)
- Auto-preview toggle is enabled (default)
- User edits expression for `order.total`

**When**
- User clicks "Apply"

**Then**
- Rule is applied to working session
- Preview strip automatically re-runs with the existing source data
- Output updates with a brief flash/highlight animation
- No manual "Run" click required

### AE-14 — Auto-preview does not trigger when no source data is loaded

**Given**
- Preview strip source input is empty (no prior Run, no test case loaded)
- Auto-preview toggle is enabled

**When**
- User clicks "Apply"

**Then**
- Rule is applied to working session
- Preview strip does NOT run (no source data available)
- No error or prompt — silent no-op for preview

---

## Open Questions

- none

---

## Verification Strategy

- **AE-01, AE-11:** Component tests for the redesigned top bar / context bar verifying human-readable names, deploy badge logic (strictly version-based stale check), and save state display.
- **AE-02, AE-03, AE-12:** Hook unit tests for the extended `useMappingEditor` verifying `applyRule`, `save`, `unsavedRuleCount`, and Ctrl+S binding.
- **AE-04, AE-05:** Component tests for navigation guard dialogs and their action callbacks; verify "Apply & Continue" navigates to the originally clicked field.
- **AE-06, AE-07:** Component tests for per-panel search (using `useTreeSearch` in source panel) and filter chip interactions.
- **AE-08:** Component tests verifying panel width CSS classes on `MappingEditorPage`.
- **AE-09, AE-13, AE-14:** Component tests for the inline preview strip rendering, auto-preview toggle behavior, and "Open Advanced Testing" link.
- **AE-10:** Integration test for the Advanced Testing page: route registration, component rendering, independent test case loading from localStorage.
- All tests must pass TypeScript strict mode typecheck and lint.

---

## Task Generation Notes

This spec is `cross-cutting` (primarily UI but includes architecture update). Task decomposition:

1. **Top bar consolidation** (ui-task): Redesign `EditorTopBar`, remove breadcrumb row, add context bar with human-readable names, deploy badge simplification, save state indicator. Touches `AppLayout` conditional breadcrumb suppression for editor routes.
2. **Two-tier save model** (ui-task): Extend `useMappingEditor` with Apply/Save semantics, `unsavedRuleCount`, navigation guards, rename "Save mapping" → "Apply" in builder components.
3. **Per-panel search and filter chips** (ui-task): Add search to `SourceSchemaPanel`, move/add search + filter chips into target panel toolbar. Refactor `GlobalToolbar` to remove search (it moves into panels).
4. **Panel width rebalance** (ui-task): Update `MappingEditorPage` grid CSS. Minimal logic change.
5. **Inline preview strip** (ui-task): Replace `BottomArea` 4-tab container with compact strip. Extract reusable preview execution into strip surface.
6. **Advanced Testing page** (ui-task): New route, new page component, reuse existing preview/diagnostics/trace/diff/test-case components. Route registration in `App.tsx` and `paths.ts`.
7. **Architecture update** (task): Update `forge/architecture/ui-application.md` to reflect the new layout, save model, route addition, and component changes.

Sequencing:
- T-04 (panel widths) is low-risk and can proceed independently.
- T-01 (top bar) and T-02 (save model) are tightly coupled and should be done in sequence (T-01 first, T-02 second, since T-02 adds the Save button into the top bar created by T-01).
- T-03 (per-panel search) depends on T-04 (widths need to be settled for source panel search placement).
- T-05 (preview strip) and T-06 (testing page) can proceed in parallel once T-04 is done.
- T-07 (architecture) should be done last after implementation stabilizes.

---

## Change Log

- Rev 2 — 2026-05-04
  - Resolved all 5 open questions (Q1–Q5):
    - Q1: "Apply & Continue" navigates to the originally clicked field, not next unmapped
    - Q2: Stale badge uses strictly `savedVersion > deployedVersion` (no content diffing)
    - Q3: Inline preview auto-runs on Apply when source data is loaded (toggle-controlled)
    - Q4: Advanced Testing page loads fresh from localStorage (no shared context)
    - Q5: Source panel search uses `useTreeSearch` hook (expand-to-match tree behavior)
  - Added AE-13 (auto-preview on Apply) and AE-14 (no auto-preview without source data)
  - Updated AE-05 to specify "Apply & Continue" target is the clicked field
  - Updated Proposed Behavior sections for all resolved decisions
  - Open Questions section now empty
- Rev 1 — 2026-05-04
  - Initial draft
