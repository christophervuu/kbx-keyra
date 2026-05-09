# SPEC

## Title

Improve Test Lab Execution Feedback with Summary and Diff-Driven Validation

---

## ID

FS-035

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-09
Last Updated: 2026-05-10
Type: ui

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Improve the Test Lab (Advanced Testing page) execution feedback so users can immediately answer "did this work?" and "what failed?" after running tests. This includes an execution summary bar with pass/fail status, duration, and diagnostics count; diff-first UX when expected output exists; categorized field-level mismatches in the diff view; per-test pass/fail indicators for saved test cases; and a suite-level summary after batch execution.

---

## Problem

Today the Advanced Testing page shows execution results across four tabs (Output, Diagnostics, Trace, Diff) but provides no consolidated summary of what happened. Users must mentally piece together success/failure by checking multiple tabs. Key gaps:

1. **No execution summary** — `ExecutionStats` data (rules evaluated/succeeded/failed, duration) is returned by the engine but not surfaced on the Advanced Testing page. It is only partially consumed by the editor's inline preview strip.
2. **No pass/fail signal** — there is no top-level indicator of whether the execution succeeded, partially failed, or had errors. The only implicit pass/fail is the diff tab's green checkmark when output matches expected.
3. **Diff is buried** — the diff tab requires users to manually navigate to it and paste expected output. When a test case already has `expectedOutput`, the diff should be front-and-center.
4. **Coarse mismatch categories** — the current `DiffChangeType` only distinguishes `added | removed | changed`. Users cannot tell whether a mismatch is a missing field, type mismatch, null mismatch, or value mismatch without manual inspection.
5. **No batch execution** — test cases can only be run one at a time. There is no way to run all saved test cases and see which passed and which failed.
6. **No per-test indicators** — the test case list shows no pass/fail state from prior or current runs.

---

## Goal

After this change, users should be able to:

- See at a glance whether an execution passed or failed, how long it took, and how many diagnostics were raised — without navigating to a specific tab.
- When expected output exists, immediately see a categorized diff summary showing what mismatched and why.
- Run all saved test cases in a batch and see a suite-level summary of pass/fail results.
- See per-test pass/fail indicators next to each saved test case.
- Quickly identify the type of each field mismatch (missing, extra, type, value, null, structural) to guide their fix.

---

## Assumptions

- The engine's `ExecutionResult` shape (including `stats`, `diagnostics`, `trace`) remains stable.
- `TestCase` continues to be stored in localStorage under `keyra:testcases:{mappingId}`.
- Batch execution runs test cases sequentially in the browser (no parallelism needed in Phase 0).
- Version/environment context is derived from the loaded mapping's version and the current engine identity (no backend version endpoint in Phase 0).

---

## Current Context

### Advanced Testing Page

Route: `/projects/:projectId/mappings/:mappingId/test`

Two-panel layout: left (~35%) has source data input + TestCaseManager; right (~65%) has tabbed results (Output | Diagnostics | Trace | Diff). The page has its own isolated `PreviewProvider`.

Execution uses `usePreviewExecution()` which returns `PreviewExecutionState`:
```
'idle' | 'executing' | 'success' (with ExecutionResult) | 'error' (with string) | 'timeout'
```

`ExecutionResult` already includes `stats?: ExecutionStats` with `rulesEvaluated`, `rulesSucceeded`, `rulesFailed`, `durationMs` — but the Advanced Testing page does not consume any of these.

### Diff Infrastructure

- `DiffResult` / `DiffEntry` types in `ui/src/lib/types/diff.ts`
- `computeDiff()` in `ui/src/lib/utils/json-diff.ts`
- `DiffDisplay` component renders diff entries as added (green), removed (red), changed (amber)
- Current `DiffChangeType = 'added' | 'removed' | 'changed'` — no finer categorization
- Expected output can come from a test case's `expectedOutput` field or manual entry in the diff tab textarea

### Test Cases

`TestCase { id, name, sourceData, expectedOutput?, createdAt }` — stored via `useTestCases(mappingId)` hook. CRUD operations: `saveTestCase`, `loadTestCase`, `deleteTestCase`. No batch operations exist.

### Inline Preview Strip (editor)

`ConnectedInlinePreviewStrip` already derives and surfaces `durationMs`, error/warning counts, and `ruleCount` from `ExecutionStats`. This pattern can inform the Advanced Testing page implementation.

---

## Scope

### In Scope

1. **Execution summary bar** — a persistent summary strip on the Advanced Testing page that appears after execution and shows:
   - Pass/fail status indicator (derived from diagnostics + optional diff match)
   - Execution duration (`durationMs`)
   - Diagnostics count by severity (errors, warnings, info)
   - Rules evaluated/succeeded/failed counts
   - Version context (mapping version) and environment label (e.g., "Local / Phase 0")

2. **Diff mismatch categorization** — extend `DiffChangeType` and `DiffEntry` to support:
   - `missing_field` — field exists in expected but not in actual
   - `extra_field` — field exists in actual but not in expected
   - `value_mismatch` — same path, same type, different value
   - `type_mismatch` — same path, different JS types
   - `null_mismatch` — one side is `null`, the other is not
   - `structural_mismatch` — one side is object/array, other is primitive (or vice versa)

3. **Diff-first UX** — when expected output exists (from loaded test case):
   - Auto-activate the Diff tab after execution completes
   - Show a diff summary line in the execution summary bar (e.g., "3 mismatches: 1 missing, 2 value")
   - Surface a compact diff summary badge on the Diff tab label

4. **Per-test pass/fail indicators** — show pass/fail/not-run status next to each test case in the TestCaseManager list, based on the most recent execution result for that test case. Results are persisted to `sessionStorage` so they survive page navigations within the same browser session but are cleared on tab/window close.

5. **Batch execution** — add a "Run All" action in the TestCaseManager section that executes all saved test cases sequentially and collects results.

6. **Suite summary after batch runs** — after batch execution completes, show an inline suite summary in the existing workspace (not a dedicated tab or view):
   - Total tests / passed / failed / errored
   - Per-test result rows with pass/fail indicator, duration, and diagnostics count
   - Clicking a test row loads its results into the standard Output/Diagnostics/Trace/Diff tabs

7. **Modified test case isolation** — when a user loads a saved test case and then modifies its source data or expected output, the test enters a "modified/unsaved" state. Execution results in this state apply to the working copy and do not update the canonical saved test case's pass/fail result. The canonical result is only updated when the user runs against unmodified saved data, or after explicitly saving changes.

### Out of Scope

- Persisting test execution results across browser sessions (results persist within a session via sessionStorage but are not durable history)
- Parallel/web-worker batch execution (sequential in-browser is sufficient for Phase 0)
- Test result export (CSV, JSON report)
- CI integration or headless test runner
- Changes to the editor's inline preview strip (ConnectedInlinePreviewStrip)
- Changes to the Mapping Editor page layout or bottom area behavior
- Backend test execution endpoints

---

## Non-Goals

- This spec does not introduce a formal test runner framework or assertion library.
- This spec does not create a test reporting backend or persistent test history.
- This spec does not change how test cases are authored or stored — only how results are displayed.
- This spec does not add AI-driven test generation or validation.

---

## Relevant Areas

- `ui/src/features/mappings/components/AdvancedTestingPage.tsx`
- `ui/src/features/mappings/components/preview/DiffDisplay.tsx`
- `ui/src/features/mappings/components/preview/OutputDisplay.tsx`
- `ui/src/features/mappings/components/preview/DiagnosticsDisplay.tsx`
- `ui/src/features/mappings/hooks/use-preview-execution.ts`
- `ui/src/features/mappings/hooks/use-test-cases.ts`
- `ui/src/lib/types/diff.ts`
- `ui/src/lib/utils/json-diff.ts`
- `ui/src/lib/types/domain.ts` (TestCase, PreviewExecutionState)
- `ui/src/features/mappings/components/TestCaseManager.tsx` (?)
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- none

---

## Constraints

- Must preserve the existing four-tab layout (Output | Diagnostics | Trace | Diff) — the summary bar is additive, not a replacement.
- Must use existing engine `ExecutionResult` and `ExecutionStats` shapes without engine changes.
- Must remain compatible with `PreviewProvider` isolation pattern (editor and Advanced Testing page have separate providers).
- TypeScript strict mode, lint/typecheck/format must pass.
- No external state management or data-fetching libraries (Phase 0 rules).
- Desktop-first (1024px minimum).

---

## Proposed Behavior

### User Flow

#### Single Test Execution

1. User navigates to Advanced Testing page.
2. User enters source data (manually or by loading a saved test case).
3. User clicks Run.
4. **Execution summary bar** appears below the top bar / above the result tabs:
   - Shows pass/fail icon + label
   - Shows duration (e.g., "42ms")
   - Shows diagnostics count badges (e.g., "2 errors, 1 warning")
   - Shows rules summary (e.g., "15/15 rules succeeded")
   - Shows mapping version (e.g., "v3") and environment label ("Local")
5. If expected output exists (from loaded test case):
   - Diff tab auto-activates
   - Summary bar includes diff mismatch summary (e.g., "2 mismatches: 1 type, 1 value")
   - Diff tab label shows a badge with mismatch count
6. If no expected output exists:
   - Output tab remains active (current behavior)
   - Summary bar shows execution status without diff info

#### Batch Execution

1. User has 2+ saved test cases.
2. User clicks "Run All" button in the TestCaseManager section.
3. A progress indicator shows batch execution progress (e.g., "Running 3/7...").
4. After all tests complete, an **inline suite summary** appears in the existing workspace (no dedicated tab):
   - Header: "7 tests: 5 passed, 1 failed, 1 error"
   - Per-test rows showing: test name, pass/fail icon, duration, diagnostics count
   - Clicking a test row loads its results into the standard detail tabs (Output/Diagnostics/Trace/Diff)
5. Each test case in the TestCaseManager list shows a pass/fail indicator from the batch run.

#### Per-Test Indicators

- After any execution (single or batch), the TestCaseManager list shows a small status icon next to each test case that was run in the current session:
  - Green check: passed (no errors, diff matches if expected output exists)
  - Red X: failed (errors or diff mismatch)
  - Gray dash: not yet run this session
- Indicators are persisted to `sessionStorage` keyed by mapping ID. They survive page navigations within the same browser session but are cleared when the tab/window is closed.
- When a loaded test case is modified (source data or expected output edited after loading), it enters a "modified" state. Running the modified test case does not update the canonical saved test case's pass/fail indicator. The indicator only updates when:
  - The test runs against its unmodified saved data, OR
  - The user explicitly saves the modified data to the test case and then re-runs

### System Behavior

#### Pass/Fail Derivation

A single test execution is classified as:

- **pass** — execution status is `success` AND diagnostics contain zero `error`-severity entries AND (if expected output exists) diff `isEqual` is `true`
- **fail** — execution status is `success` BUT diagnostics contain `error`-severity entries OR diff `isEqual` is `false`
- **error** — execution status is `error` or `timeout`

#### Diff Mismatch Categorization

`computeDiff()` is extended to produce categorized `DiffEntry` records:

| Category | Condition |
|---|---|
| `missing_field` | Path exists in expected, absent in actual |
| `extra_field` | Path exists in actual, absent in expected |
| `value_mismatch` | Same path, same JS type, different value |
| `type_mismatch` | Same path, different JS types (e.g., string vs number) |
| `null_mismatch` | Same path, one side is `null` and the other is not |
| `structural_mismatch` | Same path, one side is object/array and other is primitive (or array vs object) |

The old `DiffChangeType` values (`added`, `removed`, `changed`) map naturally:
- `added` → `extra_field`
- `removed` → `missing_field`
- `changed` → one of `value_mismatch`, `type_mismatch`, `null_mismatch`, or `structural_mismatch` based on inspection

#### Batch Execution

- Test cases are executed sequentially using the same `usePreviewExecution` mechanism (or a batch wrapper around it).
- Each execution uses the test case's `sourceData` as input and the current mapping config/schemas.
- Results are collected into a `BatchExecutionResult` structure:
  ```
  { testCaseId, testCaseName, state: PreviewExecutionState, diffResult?: DiffResult, durationMs }[]
  ```
- Results are persisted to `sessionStorage` keyed by mapping ID (survives page navigation within session).

#### Modified Test Case Isolation

When a user loads a saved test case and modifies its source data or expected output:
- The test case enters a `modified` state (tracked via comparison of working data against saved data).
- Execution results for the modified working copy are displayed in the UI but do NOT update the canonical `testResults` entry for that test case ID in sessionStorage.
- The canonical result for that test case ID retains its last clean-run value.
- If the user saves the modified data back to the test case (via test case CRUD) and re-runs, the run is against the now-canonical saved data and the result updates normally.

#### Version/Environment Context

- Mapping version: read from the loaded mapping's `version` field.
- Environment: static label "Local" in Phase 0 (future: derive from adapter type or config).

### Failure / Edge Behavior

- **No test cases saved:** "Run All" button is hidden or disabled.
- **Single test case:** "Run All" behaves identically to running that one test; suite summary still shows.
- **Test case with no expectedOutput:** pass/fail is based on diagnostics only; diff is not evaluated; mismatch summary shows "No expected output".
- **Expected output is invalid JSON:** diff section shows parse error; test is classified as "error" for diff purposes but execution pass/fail is still based on diagnostics.
- **Execution timeout during batch:** that test case is marked as `timeout`; batch continues with remaining tests.
- **Execution error during batch:** that test case is marked as `error`; batch continues.
- **User cancels batch (navigates away):** in-progress batch is abandoned; partial results are discarded.
- **Empty source data in a test case:** that test case is skipped during batch execution with a "skipped" indicator.

---

## Acceptance Examples

### AE-01 — Execution summary bar after single run

**Given**
- A mapping with 15 rules is loaded
- Source data is entered
- No expected output is set

**When**
- User clicks Run

**Then**
- Summary bar appears showing:
  - Pass icon (green check) if no error diagnostics; fail icon (red X) if any error diagnostics
  - Duration (e.g., "42ms")
  - Diagnostics counts by severity
  - Rules summary (e.g., "15/15 succeeded")
  - Mapping version badge and "Local" environment label

### AE-02 — Diff-first UX with expected output

**Given**
- A test case with `expectedOutput` is loaded
- Source data is populated from the test case

**When**
- User clicks Run

**Then**
- Execution completes and Diff tab auto-activates
- Summary bar includes diff mismatch summary (e.g., "2 mismatches: 1 type, 1 value")
- Diff tab label shows badge with mismatch count
- DiffDisplay shows categorized entries with mismatch type labels

### AE-03 — Categorized diff mismatches

**Given**
- Actual output: `{ "name": "Alice", "age": "30", "score": null, "extra": true }`
- Expected output: `{ "name": "Alice", "age": 30, "score": 95, "role": "admin" }`

**When**
- Diff is computed

**Then**
- `age`: `type_mismatch` (string vs number)
- `score`: `null_mismatch` (null vs number)
- `extra`: `extra_field` (in actual, not in expected)
- `role`: `missing_field` (in expected, not in actual)
- `name`: no entry (values match)

### AE-04 — Batch execution with inline suite summary

**Given**
- 3 saved test cases: "Happy path" (has expectedOutput), "Edge case" (has expectedOutput), "No expected" (no expectedOutput)

**When**
- User clicks "Run All" in the TestCaseManager section

**Then**
- Progress indicator shows during execution
- After completion, an inline suite summary appears in the existing workspace: "3 tests: 2 passed, 1 failed" (example)
- Each test row shows: name, pass/fail icon, duration, diagnostics count
- Clicking a test row loads its results into the standard Output/Diagnostics/Trace/Diff tabs
- No dedicated "Batch Results" tab is created

### AE-05 — Per-test pass/fail indicators persist in session

**Given**
- 3 saved test cases
- Batch execution has completed

**Then**
- TestCaseManager list shows green check next to passed tests, red X next to failed tests
- Indicators are visible without expanding or selecting any test case
- Navigating away from the page and back preserves the indicators (sessionStorage)
- Closing the browser tab clears them

### AE-08 — Modified test case does not update canonical result

**Given**
- Test case "Happy path" was loaded and previously passed (green check indicator)
- User modifies the source data in the working area

**When**
- User clicks Run

**Then**
- Execution runs against the modified data and results display in the tabs
- The canonical pass/fail indicator for "Happy path" in the TestCaseManager list remains the previous value (green check) — it is NOT overwritten by the modified-data run
- A "modified" visual cue is shown on the loaded test case indicator

### AE-06 — Pass/fail with no expected output

**Given**
- A test case with no `expectedOutput`
- Execution completes with zero error diagnostics

**When**
- Pass/fail is derived

**Then**
- Result is "pass" (diff is not evaluated when no expected output)
- Summary bar shows pass icon but no diff mismatch summary

### AE-07 — Structural mismatch in diff

**Given**
- Actual output: `{ "address": { "street": "123 Main" } }`
- Expected output: `{ "address": "123 Main St" }`

**When**
- Diff is computed

**Then**
- `address`: `structural_mismatch` (object vs string)

---

## Open Questions

- none (Q1–Q4 resolved in Rev 2)

---

## Verification Strategy

- Unit tests for extended `computeDiff()` covering all six mismatch categories (AE-03, AE-07)
- Unit tests for pass/fail derivation logic covering all classification cases (AE-01, AE-06)
- Component tests for execution summary bar rendering with various `ExecutionResult` shapes
- Component tests for DiffDisplay rendering categorized mismatch entries
- Component tests for batch execution flow and suite summary rendering (AE-04)
- Component tests for per-test pass/fail indicator rendering (AE-05)
- Typecheck (`tsc --noEmit`) passes for all touched areas
- Lint and format pass

---

## Task Generation Notes

This is a UI-type spec. All tasks are `ui-task` except the architecture update task.

Suggested decomposition:

1. **Diff mismatch categorization (utility)** — extend `DiffChangeType`, `DiffEntry`, and `computeDiff()` in `ui/src/lib/`. This is foundational — other tasks depend on it.
2. **DiffDisplay categorized rendering** — update the DiffDisplay component to render mismatch type labels and category-specific styling. Depends on T-01.
3. **Execution summary bar** — new component + integration into AdvancedTestingPage. Independent of diff changes.
4. **Diff-first UX** — auto-tab-switch + summary bar diff integration. Depends on T-01 and T-03.
5. **Per-test pass/fail indicators** — extend TestCaseManager with execution result state. Depends on pass/fail derivation (can share logic with T-03).
6. **Batch execution and suite summary** — batch runner + suite summary view. Depends on T-03 and T-05.
7. **Architecture update** — update `ui-application.md` with Test Lab execution feedback additions.

Tasks should be executed roughly in this order due to dependencies. T-01 and T-03 can run in parallel. T-07 should run last.

---

## Change Log

- Rev 2 — 2026-05-10
  - Resolved Q1: inline suite summary in existing workspace, no dedicated Batch Results tab
  - Resolved Q2: "Run All" placed in TestCaseManager section only, not in top bar
  - Resolved Q3: per-test pass/fail indicators persisted to sessionStorage (session-scoped, not durable)
  - Resolved Q4: modified loaded test cases do not silently update canonical pass/fail; results apply to working copy until user saves changes
  - Added AE-08 for modified test case isolation
  - Added "Modified test case isolation" to In Scope and System Behavior
- Rev 1 — 2026-05-09
  - Initial draft
