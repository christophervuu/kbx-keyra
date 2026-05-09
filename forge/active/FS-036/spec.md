# SPEC

## Title

Add Linked Cross-Panel Debugging Interactions to Test Lab

---

## ID

FS-036

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-09
Last Updated: 2026-05-09
Type: ui

---

## Status

draft

---

## Revision

Rev: 1

---

## Summary

Make the Test Lab (Advanced Testing page) and Inline Preview Strip a connected debugging workspace by introducing linked selection state across the Diagnostics, Trace, Output, and Diff panels. Clicking an item in one panel highlights related items in the others, enabling rapid failure-to-root-cause navigation. Add filters for diagnostics and trace, jump-to-rule navigation from failures back to the Mapping Editor, and plain-language explainability helpers for common failure patterns like null propagation. The goal is to reduce Time To First Successful Mapping (TTFSM) by shortening the path from observing a failure to identifying the responsible rule.

---

## Problem

Today, the Test Lab displays diagnostics, trace, output, and diff as four independent read-only tabs with no interactive relationship between them. A user who spots an error in the Diagnostics tab must mentally correlate the `ruleIndex` and `targetPath` to find the corresponding trace step, locate the affected output path in the JSON tree, and identify the matching diff entry — all manually. For mappings with dozens of rules, this back-and-forth is slow and error-prone.

Additionally:
- DiagnosticsDisplay and TraceDisplay have no filtering — users must scroll through all entries to find relevant items
- There is no way to jump from a failure in the Test Lab back to the responsible rule in the Mapping Editor
- Common failure patterns (null output, type mismatch, missing source path) require users to read raw diagnostic codes and messages, with no plain-language guidance on what to fix
- The Inline Preview Strip has basic diagnostic-to-rule navigation (`onNavigateToRule`) but the full-page Test Lab has no equivalent

---

## Goal

After this spec is implemented:

1. Clicking a diagnostic entry highlights the corresponding trace step, output path, and diff entry across all visible panels
2. Clicking a trace step highlights the corresponding diagnostics, output path, and diff entry
3. Clicking a diff entry highlights the corresponding diagnostics and output location
4. Diagnostics can be filtered by severity (error/warning/info) and searched by target path or message
5. Trace can be filtered by result status (success/failure) and searched by target path
6. A "Jump to rule" action from any selected diagnostic or trace entry navigates to the Mapping Editor with the responsible rule selected
7. Common failure patterns display plain-language explanations alongside the raw diagnostic message
8. All linked behavior works in both the full-page Test Lab and the Inline Preview Strip (where applicable, given its subset of panels)

---

## Assumptions

- The `ruleIndex` and `targetPath` fields on `Diagnostic` and `TraceEntry` remain stable linking dimensions across all panels
- `DiffEntry.path` correlates to `TraceEntry.targetPath` and `Diagnostic.targetPath` when the path refers to the same output location
- The engine's `execute()` function continues to produce `ExecutionResult` with the same shape (diagnostics, trace, output)
- The AdvancedTestingPage continues to use the 4-tab layout (Output | Diagnostics | Trace | Diff)
- React Router v6 navigation supports passing state to the Mapping Editor route for pre-selecting a rule on arrival

---

## Current Context

### Test Lab Surfaces

The codebase has two preview/testing surfaces:

1. **AdvancedTestingPage** (`ui/src/features/mappings/components/AdvancedTestingPage.tsx`) — full-page route at `/projects/:projectId/mappings/:mappingId/test` with two-panel layout: left (source input + test cases) and right (4-tab results: Output | Diagnostics | Trace | Diff). Uses its own `<PreviewProvider>` and `usePreviewExecution`. Currently has **no cross-panel selection or navigation**.

2. **InlinePreviewStrip** (`ui/src/features/mappings/components/InlinePreviewStrip.tsx`) — compact bottom strip embedded in the Mapping Editor Target View. Three-pane layout: Source | Output | Diagnostics. Has **one existing cross-panel interaction**: clicking a diagnostic calls `onNavigateToRule(ruleIndex)` which sets `selectedTargetPath` in the editor. No Trace or Diff panels.

### Display Components (preview/ subfolder)

- **DiagnosticsDisplay** — flat `<ul>` of `Diagnostic` items with severity icons, message, targetPath, expression. **No click handlers, no filtering, display-only.**
- **TraceDisplay** — collapsible `<ul>` of `TraceEntry` rows with local expand/collapse state. Shows targetPath, durationMs (collapsed); expression, outputValue (expanded). **No click-to-navigate, no filtering.**
- **DiffDisplay** — expected output textarea + color-coded diff entries (added/removed/changed) with path descriptions. **No click handlers, no selection state.**
- **OutputDisplay** — syntax-highlighted JSON via custom tokenizer. **No path tracking, no selection, read-only.**

### Data Types

- `Diagnostic`: `{ code, severity, message, ruleIndex?, targetPath?, expression?, location? }`
- `TraceEntry`: `{ ruleIndex, targetPath, expression, inputValue, outputValue, diagnostics?, durationMs? }`
- `DiffEntry`: `{ path, type: 'added' | 'removed' | 'changed', actual?, expected? }`
- `ExecutionResult`: `{ output, diagnostics, trace?, stats? }`
- `PreviewDiagnostic` (InlinePreviewStrip): `{ severity, code, message, ruleName, ruleIndex }`

### Linking Dimensions

The natural linking key between panels is a combination of `targetPath` and `ruleIndex`:
- Diagnostics → Trace: same `ruleIndex` (primary) or same `targetPath`
- Diagnostics → Output: `targetPath` maps to a path in the output JSON
- Diagnostics → Diff: `targetPath` corresponds to `DiffEntry.path`
- Trace → Diagnostics: same `ruleIndex`
- Trace → Output: `targetPath` maps to output JSON path
- Diff → Diagnostics: `DiffEntry.path` matches `Diagnostic.targetPath`
- Diff → Output: `DiffEntry.path` maps to output JSON path

---

## Scope

### In Scope

- Shared linked debug selection state model (`DebugSelection` type + `useLinkedDebugSelection` hook)
- Interactive DiagnosticsDisplay: click-to-select rows, highlight when selected from other panels, severity filter chips, target path search
- Interactive TraceDisplay: click-to-select rows, highlight when selected from other panels, status filter (success/failure), target path search
- OutputDisplay path-based highlighting: track JSON paths during rendering, highlight path matching current selection
- DiffDisplay click-to-select and highlighting: click diff entry to fire selection, highlight entries matching current selection
- Linked selection orchestration in AdvancedTestingPage wiring all panels
- Extended linked selection in InlinePreviewStrip diagnostics pane (subset of full behavior)
- Jump-to-rule navigation from Test Lab back to Mapping Editor with rule pre-selected
- Plain-language failure helpers for common diagnostic patterns (null propagation, type mismatch, missing source, unresolved function)
- Architecture update to `ui-application.md` documenting the linked debugging model

### Out of Scope

- Renaming "Advanced Testing" to "Test Lab" (cosmetic rename can be a separate task)
- Adding new panel types beyond the existing four tabs
- Modifying the engine's `execute()` or `validate()` output shape
- Source panel highlighting (highlighting source schema fields related to a failure)
- Adding trace support to InlinePreviewStrip (it has no Trace tab)
- Adding diff support to InlinePreviewStrip (it has no Diff tab)
- Keyboard navigation between linked panels
- Persisting debug selection state to localStorage
- AI-powered "explain this failure" (uses AI runtime from FS-031; this spec only adds static pattern matching)

---

## Non-Goals

- Replace or modify the mapping engine's execution behavior
- Add breakpoints, stepping, or interactive debugging of the engine pipeline
- Build a visual graph of rule dependencies
- Support multi-selection across panels (single linked selection only)
- Create a standalone debugging tool outside the existing page surfaces

---

## Relevant Areas

- `ui/src/features/mappings/components/AdvancedTestingPage.tsx`
- `ui/src/features/mappings/components/InlinePreviewStrip.tsx`
- `ui/src/features/mappings/components/ConnectedInlinePreviewStrip.tsx`
- `ui/src/features/mappings/components/preview/DiagnosticsDisplay.tsx`
- `ui/src/features/mappings/components/preview/TraceDisplay.tsx`
- `ui/src/features/mappings/components/preview/OutputDisplay.tsx`
- `ui/src/features/mappings/components/preview/DiffDisplay.tsx`
- `ui/src/features/mappings/components/preview/PreviewPanel.tsx`
- `ui/src/features/mappings/hooks/use-preview-execution.ts`
- `ui/src/features/mappings/context/preview-context.tsx`
- `ui/src/features/mappings/types.ts`
- `ui/src/lib/types/domain.ts`
- `ui/src/lib/types/diff.ts`
- `ui/src/features/mappings/hooks/` (new hook: `use-linked-debug-selection.ts`)
- `ui/src/features/mappings/lib/` (new: `failure-explainer.ts`)
- `ui/src/routes/pages/MappingEditor.tsx` (route state handling for jump-to-rule)
- `ui/src/routes/pages/MappingAdvancedTesting.tsx`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- none (all required data types and components exist; this spec builds on the existing preview infrastructure)

---

## Constraints

- Must not change the engine's `Diagnostic`, `TraceEntry`, or `ExecutionResult` types
- Must preserve the existing `onNavigateToRule` behavior in InlinePreviewStrip
- Must work within the existing `PreviewProvider` context boundary (no shared state between editor and Test Lab pages)
- Must follow Phase 0 state management rules (React Context + hooks, no Redux/Zustand)
- Output path highlighting must not break existing JSON syntax highlighting
- Filter and selection state must be component-local or page-local (not persisted)
- TypeScript strict mode, lint/typecheck/test must pass

---

## Proposed Behavior

### User Flow

#### Linked Selection — Diagnostics as Entry Point

1. User runs a mapping in the Test Lab and sees results across tabs
2. User clicks a diagnostic entry in the Diagnostics tab
3. The diagnostic row is highlighted as "selected"
4. If Trace tab is visible or switched to: the trace step with the matching `ruleIndex` is scrolled into view and highlighted
5. If Output tab is visible or switched to: the JSON path matching the diagnostic's `targetPath` is highlighted in the rendered output
6. If Diff tab is visible or switched to: any diff entries with matching `path` are highlighted
7. User clicks a different diagnostic — selection moves; previous highlights clear

#### Linked Selection — Trace as Entry Point

1. User clicks a trace step row
2. The trace row is highlighted
3. Diagnostics with matching `ruleIndex` are highlighted (may be zero or multiple)
4. Output path matching `targetPath` is highlighted
5. Diff entries matching `targetPath` are highlighted

#### Linked Selection — Diff as Entry Point

1. User clicks a diff entry
2. The diff entry is highlighted
3. Diagnostics with matching `targetPath` are highlighted
4. Output path matching `path` is highlighted
5. If a corresponding trace entry exists (matched by `targetPath`), it is highlighted

#### Filtering

1. Diagnostics tab shows filter chips: **Error** | **Warning** | **Info** (toggle ON/OFF, AND semantics for multi-select)
2. Diagnostics tab shows a search input filtering by `targetPath` or `message` substring (case-insensitive, debounced 200ms)
3. Trace tab shows filter chips: **Failed** (has diagnostics) | **Success** (no diagnostics)
4. Trace tab shows a search input filtering by `targetPath` (case-insensitive, debounced 200ms)
5. Filtering does not clear linked selection; if the selected item is filtered out, the selection persists but the item is not visible. When filters clear, it reappears highlighted.
6. Filter state includes a count display: `{N} of {M} diagnostics` or `{N} of {M} trace steps`

#### Jump to Rule

1. When a diagnostic or trace entry is selected, a "Jump to rule" button/link appears in the selection context
2. Clicking it navigates to `/projects/:projectId/mappings/:mappingId` with route state `{ selectedTargetPath: targetPath }`
3. The Mapping Editor reads this route state on mount and sets `selectedTargetPath`, scrolling the target worklist to the relevant field and opening its builder

#### Plain-Language Failure Helpers

1. When viewing diagnostics, common failure patterns display a supplementary helper line below the raw message
2. Helpers are pattern-matched on diagnostic `code` and/or `message` content
3. Initial pattern set:
   - **Null output** (`outputValue === null` with no explicit null rule): "This field produced null because the source path resolved to no value. Check that the source field name matches your input data."
   - **Type mismatch** (code `TYPE_MISMATCH` or similar): "The expression returned a {actualType} but the target field expects {expectedType}. Consider wrapping with `cast()` or reviewing the transform chain."
   - **Missing source path** (code related to unresolved source): "The source path `{path}` was not found in the input data. Verify the path exists in your test data or check for typos."
   - **Unresolved function** (code related to unknown function): "The function `{name}` is not recognized. Check spelling against the DSL function reference."
4. Helpers are static pattern-matched strings, not AI-generated (AI explain is out of scope per FS-031 boundary)

### System Behavior

#### Debug Selection State Model

```typescript
interface DebugSelection {
  /** The target path linking across panels */
  targetPath: string;
  /** The rule index, if available from the source panel */
  ruleIndex: number | undefined;
  /** Which panel initiated the selection */
  source: 'diagnostics' | 'trace' | 'output' | 'diff';
}

interface UseLinkedDebugSelectionReturn {
  selection: DebugSelection | null;
  select: (selection: DebugSelection) => void;
  clear: () => void;
  /** Check if a given targetPath is currently selected */
  isPathSelected: (path: string) => boolean;
  /** Check if a given ruleIndex is currently selected */
  isRuleSelected: (ruleIndex: number) => boolean;
}
```

The hook is instantiated at the AdvancedTestingPage orchestration level and passed as props to each display component.

#### Output Path Highlighting

OutputDisplay must be enhanced to:
1. Parse the rendered JSON and track the path to each key-value pair during rendering
2. Accept an `highlightPath: string | null` prop
3. When `highlightPath` is set, apply a highlight style (background color) to the key-value node(s) at that path
4. Handle nested paths with dot notation (e.g., `Order.Header.DocumentType` highlights the `DocumentType` key and value within the rendered JSON)

#### Failure Explainer Module

A pure function module `failure-explainer.ts`:

```typescript
interface FailureExplanation {
  /** Short plain-language description */
  summary: string;
  /** Optional actionable suggestion */
  suggestion?: string;
}

function explainDiagnostic(diagnostic: Diagnostic, traceEntry?: TraceEntry): FailureExplanation | null;
```

Returns `null` for diagnostics that don't match any known pattern. The function is pure and deterministic — no I/O.

### Failure / Edge Behavior

| Scenario | Behavior |
|---|---|
| Diagnostic has no `ruleIndex` | Selection uses `targetPath` only for cross-panel matching; trace match falls back to `targetPath` instead of `ruleIndex` |
| Diagnostic has no `targetPath` | Selection fires with undefined `targetPath`; no output or diff highlighting occurs; only rule-index-based trace matching |
| Trace entry has no matching diagnostics | Trace click still fires selection; diagnostics panel shows no highlighted rows |
| Selected item filtered out by active filters | Selection persists in state but item is not visible; other panels still show highlights based on the selection's `targetPath`/`ruleIndex` |
| Output JSON path doesn't match any `targetPath` | No output highlighting shown; selection still works for other panels |
| No execution result (idle/executing state) | All display components show their existing empty/loading states; linked selection is disabled |
| Multiple diagnostics with same `targetPath` | All matching rows are highlighted in diagnostics panel when selected from trace/diff |
| Jump-to-rule with invalid or deleted rule | Mapping Editor receives `selectedTargetPath` via route state; if no matching field exists, selection clears gracefully (existing behavior) |

---

## Acceptance Examples

### AE-01 — Click diagnostic highlights trace step

**Given**
- Mapping execution has completed with diagnostics and trace enabled
- Diagnostics tab shows 3 diagnostics, one for `targetPath: "Order.Status"` at `ruleIndex: 2`
- Trace tab shows 5 trace entries

**When**
- User clicks the diagnostic for `Order.Status`

**Then**
- The clicked diagnostic row shows a selected/highlighted state
- Switching to Trace tab: trace entry with `ruleIndex: 2` is highlighted and scrolled into view
- Other trace entries are not highlighted

### AE-02 — Click diagnostic highlights output path

**Given**
- Execution result output is `{ "Order": { "Status": "Active", "Id": "123" } }`
- A diagnostic exists for `targetPath: "Order.Status"`

**When**
- User clicks the diagnostic for `Order.Status`
- User switches to Output tab

**Then**
- The `"Status": "Active"` key-value pair in the rendered JSON is highlighted with a distinct background color
- Other output nodes are not highlighted

### AE-03 — Click diagnostic highlights diff entries

**Given**
- Diff tab shows 2 diff entries: one for path `Order.Status` (changed), one for path `Order.Id` (added)
- A diagnostic exists for `targetPath: "Order.Status"`

**When**
- User clicks the diagnostic
- User switches to Diff tab

**Then**
- The diff entry for `Order.Status` is highlighted
- The diff entry for `Order.Id` is NOT highlighted

### AE-04 — Click trace step highlights diagnostics

**Given**
- Trace has an entry for `ruleIndex: 1`, `targetPath: "Order.Id"`
- Diagnostics has 2 entries: one for `ruleIndex: 1` (warning), one for `ruleIndex: 3` (error)

**When**
- User clicks the trace entry for `ruleIndex: 1`

**Then**
- Switching to Diagnostics tab: the diagnostic with `ruleIndex: 1` is highlighted
- The diagnostic with `ruleIndex: 3` is NOT highlighted

### AE-05 — Click diff entry highlights related panels

**Given**
- Diff entry exists for path `Order.Total` (type: `changed`)
- A trace entry exists with `targetPath: "Order.Total"`
- A diagnostic exists with `targetPath: "Order.Total"`

**When**
- User clicks the diff entry for `Order.Total`

**Then**
- Trace tab: trace entry for `Order.Total` is highlighted
- Diagnostics tab: diagnostic for `Order.Total` is highlighted
- Output tab: `"Total"` key-value in rendered JSON is highlighted

### AE-06 — Diagnostics severity filter

**Given**
- Diagnostics tab shows 5 entries: 2 errors, 2 warnings, 1 info

**When**
- User clicks the "Error" filter chip (toggling it ON)

**Then**
- Only the 2 error diagnostics are visible
- Count display shows "2 of 5 diagnostics"
- Warning and info entries are hidden

### AE-07 — Diagnostics search filter

**Given**
- Diagnostics tab shows entries for `Order.Status`, `Order.Id`, `Customer.Name`

**When**
- User types "order" into the search input

**Then**
- Only entries for `Order.Status` and `Order.Id` are visible
- `Customer.Name` entry is hidden
- Count display shows "2 of 3 diagnostics"

### AE-08 — Trace filter by result status

**Given**
- Trace tab shows 4 entries: 3 succeeded (no diagnostics), 1 failed (has diagnostics)

**When**
- User clicks the "Failed" filter chip

**Then**
- Only the 1 failed trace entry is visible
- Count display shows "1 of 4 trace steps"

### AE-09 — Jump to rule from diagnostic

**Given**
- User is on the Test Lab page for mapping `m1` in project `p1`
- A diagnostic for `targetPath: "Order.Status"` at `ruleIndex: 2` is selected

**When**
- User clicks "Jump to rule" button

**Then**
- Browser navigates to `/projects/p1/mappings/m1`
- Mapping Editor loads with `selectedTargetPath` set to `"Order.Status"`
- The target worklist scrolls to and highlights `Order.Status`
- The builder panel shows the expression for the `Order.Status` rule

### AE-10 — Plain-language helper for null output

**Given**
- A trace entry for `targetPath: "Order.Status"` has `outputValue: null`
- The diagnostic code or message indicates a missing/null source value

**When**
- User views the diagnostic in the Diagnostics tab

**Then**
- Below the raw diagnostic message, a helper line appears: "This field produced null because the source path resolved to no value. Check that the source field name matches your input data."
- The helper is visually distinct (different style, lighter text or info icon)

### AE-11 — Selection clears on new execution

**Given**
- A diagnostic is selected, with linked highlights active in trace and output

**When**
- User clicks "Run" to execute the mapping again

**Then**
- The previous selection clears
- All highlights are removed
- New results render without any pre-selection

### AE-12 — InlinePreviewStrip diagnostic click fires linked navigation

**Given**
- User is in the Mapping Editor with InlinePreviewStrip expanded
- Diagnostics pane shows 2 diagnostics

**When**
- User clicks a diagnostic for `targetPath: "Order.Id"`

**Then**
- `onNavigateToRule` fires, setting `selectedTargetPath` to `"Order.Id"` (existing behavior preserved)
- The diagnostic row shows a selected/highlighted state (new behavior)
- The output pane in the strip highlights the `Order.Id` path if visible

---

## Open Questions

- `Q1.` Should the "Jump to rule" behavior open the editor in the same tab (replacing the Test Lab) or in a new tab? Recommendation: same tab with browser back-button support; new-tab can be added later as a modifier (Ctrl+click).
- `Q2.` Should Output path highlighting support array indices (e.g., `Order.Items[0].Name`) or only dot-separated object paths? The current `DiffEntry.path` format needs confirmation. Recommendation: support dot-separated paths first; array index paths in a follow-up if the diff utility produces them.
- `Q3.` Should the diagnostic severity filter default to showing all severities or only errors+warnings? Recommendation: all severities shown by default (no filters active on load).
- `Q4.` For the InlinePreviewStrip, should the output pane highlighting be added in this spec or deferred? The strip's output area is smaller and space-constrained. Recommendation: add it — highlighting a single path in the compact output view is still useful for quick correlation.
- `Q5.` Should the failure explainer patterns be driven by diagnostic `code` strings only, or also inspect the `message` text? The engine's diagnostic codes need to be cataloged to build the pattern set. Recommendation: match on `code` first; fall back to `message` substring matching for patterns not covered by codes.

---

## Verification Strategy

### Unit Tests

- **`useLinkedDebugSelection` hook**: test select/clear/isPathSelected/isRuleSelected behavior (AE-01 through AE-05, AE-11)
- **DiagnosticsDisplay**: test click handlers fire selection, highlight state renders correctly, severity filter reduces visible entries, search filter works, count display updates (AE-06, AE-07)
- **TraceDisplay**: test click handlers fire selection, highlight state renders correctly, status filter works, search filter works, count display updates (AE-08)
- **OutputDisplay**: test path highlighting applies correct styles when `highlightPath` is set, clears when null (AE-02)
- **DiffDisplay**: test click handlers fire selection, highlight state renders on matching paths (AE-03, AE-05)
- **failure-explainer**: test each known pattern returns correct explanation, unknown patterns return null (AE-10)
- **Jump-to-rule navigation**: test React Router navigation with state (AE-09)

### Integration Tests

- **AdvancedTestingPage**: test full linked selection flow — click diagnostic, verify trace/output/diff highlights update (AE-01 through AE-05)
- **InlinePreviewStrip**: test diagnostic click fires navigation AND sets highlight state (AE-12)

### Verification Commands

- `pnpm typecheck` passes with zero errors
- `pnpm lint` passes
- `pnpm test` passes — all new and existing test files pass

---

## Task Generation Notes

This spec decomposes into 9 tasks. All tasks are `Agent: ui-task` except T-09 (architecture update, `Agent: task`).

Task sequencing:

1. **T-01: Linked debug selection state model and hook** — foundational types and hook; all other interactive tasks depend on this
2. **T-02: Interactive DiagnosticsDisplay** — depends on T-01; adds click handlers, highlight state, severity filters, search
3. **T-03: Interactive TraceDisplay** — depends on T-01; adds click handlers, highlight state, status filters, search
4. **T-04: OutputDisplay path-based highlighting** — depends on T-01; enhances JSON renderer with path tracking and highlight prop
5. **T-05: DiffDisplay click-to-select and highlighting** — depends on T-01; adds click handlers and highlight state
6. **T-06: Wire linked selection in AdvancedTestingPage** — depends on T-02, T-03, T-04, T-05; orchestration layer
7. **T-07: Jump-to-rule navigation from Test Lab** — depends on T-06; adds navigation button and route state handling
8. **T-08: Plain-language failure helpers** — depends on T-02 (renders in DiagnosticsDisplay); can be built in parallel with T-03-T-06
9. **T-09: Architecture update for linked debugging model** — depends on T-06; update `ui-application.md`

Parallelization: T-02, T-03, T-04, T-05 are independent of each other (all depend only on T-01). T-08 depends only on T-02.

---

## Change Log

- Rev 1 — 2026-05-09
  - Initial draft
