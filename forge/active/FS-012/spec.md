# SPEC

## Title

Mapping Editor — Preview & Testing Panel (Panel 5)

---

## ID

FS-012

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-01
Last Updated: 2026-05-01
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 1

---

## Summary

Add a Preview & Testing panel (Panel 5) to the Mapping Editor that lets users execute the current mapping rules against sample source data, inspect the transformed output, view execution trace/diagnostics, compare results against expected output, and manage reusable test cases. This panel provides the primary feedback loop for mapping authorship and supplies the `sourceData` context consumed by FS-011's expression preview.

---

## Problem

Users have no way to test their mapping rules within the editor. They must mentally simulate transformations or deploy to an external system to see results. This slows iteration, increases error rates, and makes it difficult to verify correctness before deployment. Additionally, FS-011's expression-level preview requires sample source data that currently has no UI surface to provide it.

---

## Goal

Provide an integrated, client-side preview and testing experience that:

1. Executes the current mapping (including unsaved rule edits) against user-supplied JSON source data in under 2 seconds for up to 500 rules.
2. Displays the transformed output, execution trace, and any diagnostics.
3. Allows users to compare actual output against an expected output (structural diff).
4. Lets users save, load, and manage named test cases persisted in localStorage.
5. Supplies the active sample data as context to FS-011's `useExpressionPreview` hook.

---

## Assumptions

- The `@keyra/engine` `execute()` function runs synchronously in the browser and completes within 2 seconds for typical workloads (up to 500 rules).
- Source data is always valid JSON (no XML source documents in Phase 0).
- Target schema is always JSON Schema (no XSD target in Phase 0 preview).
- localStorage is available and sufficient for test case persistence in Phase 0 (no cross-device sync needed).
- Panel 5 occupies the bottom-right cell of the existing 3-column × 3-row grid layout (`grid-rows-[1fr_1fr_180px]`, column 3).

---

## Current Context

The Mapping Editor (`MappingEditorPage.tsx`) uses a 3×3 CSS grid layout. Panel 5 currently renders a `<PanelPlaceholder name="Preview (Panel 5)" />` at `data-testid="panel-slot-5"`. The `useMappingEditor` hook provides the current `rules`, `config`, loaded schemas (`sourceSchemaDetail`, `targetSchemaDetail`), and parsed schemas.

The engine integration layer (`ui/src/lib/engine/index.ts`) exports `executeMapping(uiConfig, sourceData, rawSourceSchema, rawTargetSchema, options?)` which wraps the engine's `execute()` call, handling type conversions. It returns `ExecutionResult` containing `output`, `diagnostics[]`, `trace[]` (when `{ trace: true }` is passed), and `stats`.

FS-011 (Expression Builder) defines a `useExpressionPreview` hook that accepts optional `sourceData` — currently always `null`. FS-012 is responsible for providing this data via shared context.

The `ApiAdapter` interface has no test-case-specific methods. Test case persistence will be feature-local using `localStorage` directly, scoped by mapping ID.

---

## Scope

### In Scope

- Preview panel UI (Panel 5 replacement of placeholder)
- Source data JSON input with syntax validation
- "Run" execution trigger (manual button + optional auto-run toggle)
- Output display (formatted JSON)
- Execution trace display (collapsible step list)
- Diagnostics display (errors/warnings from engine)
- Structural diff view (expected vs actual output)
- Test case CRUD: save current input/expected as named test case, load, delete
- Test case localStorage persistence scoped by mapping ID
- `PreviewContext` React context providing `sourceData` to sibling panels (consumed by FS-011)
- Execution performance guardrails (timeout, abort on re-run)
- Hook: `usePreviewExecution` — orchestrates execution lifecycle
- Hook: `useTestCases` — manages test case CRUD and persistence

### Out of Scope

- Backend persistence of test cases (future: sync via adapter)
- Batch/suite execution of multiple test cases
- Coverage visualization (which rules fired)
- XML source data input
- XSD target validation
- Snapshot testing / regression detection automation
- Panel resizing (uses fixed grid allocation from FS-010)

---

## Non-Goals

- This is not a full test runner or CI integration — it is an interactive authoring feedback loop.
- This does not replace or duplicate the engine's internal validation (FS-010's `useEngineValidation`); it complements it with execution-based feedback.
- This does not attempt to provide guaranteed deterministic output ordering beyond what the engine produces.

---

## Relevant Areas

- `ui/src/features/mappings/components/MappingEditorPage.tsx` — Panel 5 slot
- `ui/src/features/mappings/components/preview/` — new directory for preview panel components
- `ui/src/features/mappings/hooks/use-preview-execution.ts` — new hook
- `ui/src/features/mappings/hooks/use-test-cases.ts` — new hook
- `ui/src/features/mappings/context/preview-context.tsx` — new context provider
- `ui/src/lib/engine/index.ts` — `executeMapping()` consumer
- `ui/src/lib/types/domain.ts` — new `TestCase` type
- `ui/src/features/mappings/hooks/use-mapping-editor.ts` — consumed for rules/schemas

---

## Dependencies / Blockers

- FS-010 (Mapping Editor Shell & State) must be complete — provides `useMappingEditor`, panel grid, schema loading.
- FS-009 (Schema Import & Parsing) must be complete — provides schema content for execution.
- FS-011 (Expression Builder) is a soft dependency — FS-012 provides context FS-011 consumes, but neither blocks the other's core implementation.

---

## Constraints

- All execution is client-side via `@keyra/engine` — no network calls for preview.
- Must complete execution in < 2 seconds for up to 500 rules (abort and show timeout message if exceeded).
- Must not block the main thread perceptibly — if execution is synchronous and fast, acceptable; if it risks > 100ms, must show loading indicator.
- Must preserve existing panel grid structure (no layout changes outside Panel 5 cell).
- No external dependencies beyond what is already in the project (no Monaco editor, no diff library — use custom lightweight implementations).
- localStorage keys must be namespaced to avoid collisions: `keyra:testcases:{mappingId}`.
- TypeScript strict mode, zero lint/typecheck errors.
- Tailwind CSS 4 for all styling.

---

## Proposed Behavior

### User Flow

1. **Enter sample data**: User types or pastes JSON into the Source Data input area within Panel 5. Invalid JSON shows inline validation error; valid JSON enables the "Run" button.

2. **Execute mapping**: User clicks "Run" (or toggle auto-run, which re-executes on rule/data changes with 500ms debounce). The panel shows a brief loading state, then displays results.

3. **Inspect output**: The Output tab shows the transformed JSON, syntax-highlighted. If execution produced diagnostics (errors/warnings), they appear in a Diagnostics tab with severity icons.

4. **Inspect trace**: If trace is enabled (toggle), a Trace tab shows each rule's evaluation step: target path, expression, resolved value, and timing.

5. **Compare with expected**: User can paste or define "expected output" JSON. A Diff tab shows a structural comparison highlighting added, removed, and changed fields between actual and expected output.

6. **Save test case**: User clicks "Save as Test Case", provides a name. The current source data + expected output (if defined) are persisted to localStorage under the mapping ID.

7. **Load test case**: User selects a saved test case from a dropdown. Source data and expected output fields are populated. User can then Run to compare.

8. **Delete test case**: User can delete saved test cases from the dropdown menu.

9. **Context sharing**: Whenever source data is valid JSON, it is published to `PreviewContext` so FS-011's expression preview can evaluate expressions against it in real time.

### System Behavior

- **Execution**: Calls `executeMapping()` with the current in-memory `MappingConfig` (reflecting unsaved rule edits), the parsed source data object, and the raw source/target schemas. Passes `{ trace: true }` when trace toggle is enabled.

- **Result handling**: `ExecutionResult.output` is displayed as formatted JSON. `ExecutionResult.diagnostics` are categorized by severity. `ExecutionResult.trace` entries are rendered as a list. `ExecutionResult.stats` (duration, rule count) shown in a status bar.

- **Diff computation**: Structural diff compares `actual` (execution output) vs `expected` (user-defined) by recursively walking both JSON trees. Reports: added keys, removed keys, changed values (with old/new). No external diff library — custom recursive implementation.

- **Test case storage**: Each test case is `{ id: string, name: string, sourceData: string, expectedOutput?: string, createdAt: string }`. Stored as JSON array in `localStorage` under key `keyra:testcases:{mappingId}`.

- **Context propagation**: `PreviewContext` provides `{ sourceData: unknown | null, isExecuting: boolean, lastResult: ExecutionResult | null }`. Wrapped around the editor panel grid so all panels can consume it.

### Failure / Edge Behavior

- **Invalid source JSON**: "Run" button disabled. Inline error message below input showing parse error position. `PreviewContext.sourceData` set to `null`.
- **Execution timeout (> 2s)**: Abort execution, display "Execution timed out" message with suggestion to reduce rule count or simplify expressions.
- **Engine throws**: Catch error, display as a diagnostic with `error` severity. Output tab shows "Execution failed" placeholder.
- **Empty rules**: Execution produces empty output `{}`. Output tab shows the empty object; no error.
- **No source/target schema loaded**: "Run" button disabled with tooltip "Schemas must be loaded before preview".
- **localStorage full**: Catch quota error on save, display toast "Unable to save test case — storage full".
- **Mapping ID changes** (navigation): Clear preview state, reload test cases for new mapping.

---

## Acceptance Examples

### AE-01 — Basic execution with valid source data

**Given**
- Mapping has 2 rules: `{ target: "name", expression: "source.firstName + ' ' + source.lastName" }` and `{ target: "age", expression: "source.age" }`
- User enters source data: `{"firstName": "Alice", "lastName": "Smith", "age": 30}`

**When**
- User clicks "Run"

**Then**
- Output tab shows: `{"name": "Alice Smith", "age": 30}`
- Stats bar shows execution duration and "2 rules evaluated"
- No diagnostics displayed

### AE-02 — Invalid source JSON prevents execution

**Given**
- User enters source data: `{"name": "Alice",}` (trailing comma — invalid JSON)

**When**
- User finishes typing (or on blur)

**Then**
- Inline validation error displayed below input: "Invalid JSON at position 18"
- "Run" button is disabled
- `PreviewContext.sourceData` is `null`

### AE-03 — Execution with diagnostics

**Given**
- Mapping has rule: `{ target: "email", expression: "source.contact.email" }`
- Source data: `{"contact": {}}` (email path doesn't exist)

**When**
- User clicks "Run"

**Then**
- Output tab shows result (with `email` as `null` or omitted per config options)
- Diagnostics tab shows warning: "Path 'source.contact.email' resolved to undefined"
- Diagnostics count badge appears on tab

### AE-04 — Trace display

**Given**
- Mapping has 3 rules
- Trace toggle is enabled
- Valid source data entered

**When**
- User clicks "Run"

**Then**
- Trace tab shows 3 entries, each with: target path, expression text, resolved value, and duration
- Entries are ordered by execution sequence

### AE-05 — Structural diff between actual and expected

**Given**
- Execution output: `{"name": "Alice", "age": 30, "active": true}`
- User enters expected output: `{"name": "Alice", "age": 31}`

**When**
- Diff tab is selected

**Then**
- Diff shows: `age` changed (30 → 31), `active` added (not in expected), no removals
- Changed fields highlighted in yellow, added fields in green

### AE-06 — Save and load test case

**Given**
- Source data: `{"x": 1}`
- Expected output: `{"y": 2}`
- Mapping ID: `mapping-abc`

**When**
- User clicks "Save as Test Case" and enters name "basic test"

**Then**
- Test case persisted to `localStorage` key `keyra:testcases:mapping-abc`
- Test case appears in the test case dropdown
- Loading the test case populates source data and expected output fields

### AE-07 — Context sharing with expression preview

**Given**
- Valid source data entered: `{"price": 100, "tax": 0.08}`
- FS-011 expression preview is active for expression `source.price * (1 + source.tax)`

**When**
- Source data is valid and parsed

**Then**
- `PreviewContext.sourceData` is `{price: 100, tax: 0.08}`
- FS-011 expression preview shows result: `108`

### AE-08 — Execution timeout

**Given**
- Mapping has rules that would exceed 2 second execution time

**When**
- User clicks "Run"

**Then**
- After 2 seconds, execution is aborted
- Output area shows "Execution timed out — consider reducing rule count or simplifying expressions"
- No partial output displayed

### AE-09 — Auto-run mode

**Given**
- Auto-run toggle is enabled
- Valid source data is present

**When**
- User modifies a rule expression in the editor

**Then**
- After 500ms debounce, execution re-runs automatically
- Output updates to reflect the new rule
- Loading indicator shown briefly during execution

### AE-10 — Delete test case

**Given**
- Test case "basic test" exists for current mapping

**When**
- User clicks delete on "basic test" in the test case dropdown

**Then**
- Test case is removed from localStorage
- Test case no longer appears in dropdown
- Current input fields are not cleared (only storage is affected)

---

## Open Questions

- none

---

## Verification Strategy

- **Unit tests**: `usePreviewExecution` hook tested with mock `executeMapping` — covers AE-01, AE-03, AE-04, AE-08, AE-09.
- **Unit tests**: `useTestCases` hook tested with mock localStorage — covers AE-06, AE-10.
- **Unit tests**: JSON diff utility tested with known input/output pairs — covers AE-05.
- **Unit tests**: JSON validation utility tested — covers AE-02.
- **Component tests**: Preview panel renders tabs, disables Run when appropriate, shows output — covers AE-01, AE-02, AE-03.
- **Integration tests**: `PreviewContext` propagation verified — covers AE-07.
- **Typecheck**: `tsc --noEmit` passes for all touched files.
- **Build**: `vite build` succeeds without errors.

---

## Task Generation Notes

This is a cross-cutting spec: most tasks are `ui-task` (React components, hooks, context) but the diff utility and type definitions are `task` type.

Recommended decomposition:

1. **Types & interfaces** (`task`) — `TestCase` type, `PreviewContextValue` type, `DiffResult` type in domain types.
2. **JSON diff utility** (`task`) — Pure function, no React. Structural recursive diff with full unit tests.
3. **PreviewContext** (`ui-task`) — React context + provider, integration into editor page layout.
4. **usePreviewExecution hook** (`ui-task`) — Execution lifecycle, timeout, abort, debounce for auto-run.
5. **useTestCases hook** (`ui-task`) — localStorage CRUD, namespaced by mapping ID.
6. **Preview Panel shell** (`ui-task`) — Tab layout (Output, Diagnostics, Trace, Diff), toolbar with Run button and toggles.
7. **Source Data Input** (`ui-task`) — Textarea with JSON validation, wired to PreviewContext.
8. **Output Display tab** (`ui-task`) — Formatted JSON output rendering.
9. **Diagnostics tab** (`ui-task`) — Severity-categorized diagnostic list with badges.
10. **Trace tab** (`ui-task`) — Collapsible trace entry list.
11. **Diff tab** (`ui-task`) — Renders DiffResult with color-coded field changes.
12. **Test Case Manager** (`ui-task`) — Save/load/delete UI, dropdown, name input.
13. **Wire PreviewContext to FS-011** (`ui-task`) — Connect sourceData from preview to expression preview hook.

Tasks should be sequenced: 1 → 2 (parallel with 3–5) → 6 → 7–12 (parallel, depend on 6) → 13.

---

## Change Log

- Rev 1 — 2026-05-01
  - Initial draft
