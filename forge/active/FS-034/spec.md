# SPEC

## Title

Add scenario-based test case management to Test Lab

---

## ID

FS-034

---

## Metadata

Owner: @christophervuu
Reviewers: TBD
Created: 2026-05-09
Last Updated: 2026-05-10
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Expand Test Lab from a single-input runner into a scenario-based test workspace. This spec adds inline test case creation, saved named scenarios, renaming/duplicating/deleting test cases, batch execution (Run All / Rerun Failed), per-case pass/fail status, and last-run result persistence. The goal is to make testing repeatable and reduce regression risk during mapping authoring.

---

## Problem

Today's test case infrastructure is minimal:

- `useTestCases` hook supports basic CRUD (save, load, delete) but lacks rename, duplicate, and update operations.
- `TestCaseManager` component uses a dropdown selector with Load/Delete/Save — there is no test case list view, no inline creation, and no way to rename or duplicate a case.
- There is no concept of a "scratchpad" (ad hoc) input vs a saved named test case — users type into a textarea and can optionally save, but the UX does not distinguish these modes.
- There is no batch execution — users must manually load each test case and click Run one at a time.
- There is no per-case pass/fail status or last-run result persistence — results are transient and lost on navigation or page reload.
- The `AdvancedTestingPage` has the most complete test surface but still relies on the basic `TestCaseManager` component.

This makes it difficult to build repeatable regression test scenarios, which slows down mapping authoring and increases the risk of unintended breakage during iterative development.

---

## Goal

After this change, users can:

1. Create, name, rename, duplicate, and delete test cases from within the Test Lab.
2. Distinguish between ad hoc scratchpad input and saved named test cases.
3. Run all saved test cases in a single batch operation.
4. Re-run only the failed cases from a previous batch run.
5. See per-case pass/fail status at a glance in a test case list.
6. Return to the test page later and see the last-run result for each test case.

---

## Assumptions

- The existing `TestCase` domain type and `useTestCases` hook are the correct foundation to extend (not replace).
- localStorage remains the persistence layer for Phase 0 — no backend involvement.
- Pass/fail determination is based on execution success (no error-severity diagnostics in the result) rather than expected-output diffing. Expected-output comparison is a separate concern (Diff tab) and is not the pass/fail signal for this spec.
- The `AdvancedTestingPage` is the primary surface for the enhanced test case management UX. The inline preview strip in the Mapping Editor gets lighter integration (test case selector updates only).
- Batch execution is sequential (one case at a time) — no parallel execution in Phase 0.

---

## Current Context

### Domain Type

`TestCase` in `ui/src/lib/types/domain.ts`:

```ts
export interface TestCase {
  readonly id: string;
  readonly name: string;
  readonly sourceData: string;
  readonly expectedOutput?: string;
  readonly createdAt: ISODateString;
}
```

### Hook

`useTestCases(mappingId)` in `ui/src/features/mappings/hooks/use-test-cases.ts`:

- localStorage key: `keyra:testcases:{mappingId}`
- Returns: `testCases`, `saveTestCase`, `loadTestCase`, `deleteTestCase`
- Missing: rename, duplicate, update, run-result operations

### TestCaseManager Component

`ui/src/features/mappings/components/preview/TestCaseManager.tsx`:

- Dropdown `<select>` for test case selection
- Load button, Delete button (×), Save flow (inline name input + Confirm)
- Used in `AdvancedTestingPage` (left panel, below source input) and `PreviewPanel`

### AdvancedTestingPage

`ui/src/features/mappings/components/AdvancedTestingPage.tsx`:

- Route: `/projects/:projectId/mappings/:mappingId/test`
- Two-panel layout: left (35% source + TestCaseManager) / right (65% tabbed results)
- Tabs: Output, Diagnostics, Trace, Diff
- Uses `usePreviewExecution` for single-case execution
- Uses `useTestCases` for CRUD

### ConnectedInlinePreviewStrip

`ui/src/features/mappings/components/ConnectedInlinePreviewStrip.tsx`:

- Inline strip in Mapping Editor bottom area (Target View)
- Uses `useTestCases` for test case loading into source textarea
- Simpler surface — test case selector only, no management UI

---

## Scope

### In Scope

- Extend `TestCase` domain type with `lastRunResult` fields
- Extend `useTestCases` hook with `renameTestCase`, `duplicateTestCase`, `updateTestCase` operations
- Add separate run-result persistence model scoped to mapping
- Distinguish scratchpad (ad hoc) input vs saved test case selection in UI state
- Build `TestCaseListPanel` component replacing the dropdown-based `TestCaseManager`:
  - Vertical list of test cases with name, pass/fail badge, last-run timestamp
  - Selection model (click to select → loads source data into editor)
  - Inline rename (double-click or edit action)
  - Context actions: Duplicate, Delete
  - Add New (blank) button
  - Save Current Input as Test Case action
- Implement Run All batch execution
- Implement Rerun Failed batch execution
- Show per-case pass/fail status in the list
- Persist last-run results to localStorage
- Wire new components into `AdvancedTestingPage`
- Update test case selector in `ConnectedInlinePreviewStrip` to reflect new test case list

### Out of Scope

- Expected-output diffing as the pass/fail signal (existing Diff tab handles manual comparison)
- Parallel batch execution
- Test case import/export
- Test case ordering/reordering
- Test case tagging or categorization
- Multi-select bulk actions (arbitrary subset selection for delete or re-run) — Run All and Rerun Failed are the only batch operations in v1
- Scratchpad content persistence across navigations
- Backend persistence (Phase 1+)
- Changes to the Mapping Editor's `ScalarFieldBuilder` or expression authoring surfaces
- Test case sharing across mappings

---

## Non-Goals

- This spec does not aim to build a full test automation framework.
- This spec does not aim to add CI/CD integration for test cases.
- This spec does not aim to replace the Diff tab's expected-output comparison with automated assertions.

---

## Relevant Areas

- `ui/src/lib/types/domain.ts` — `TestCase` type extension
- `ui/src/features/mappings/hooks/use-test-cases.ts` — hook CRUD extension
- `ui/src/features/mappings/hooks/use-test-cases.test.ts` — hook tests
- `ui/src/features/mappings/components/preview/TestCaseManager.tsx` — existing component (to be superseded)
- `ui/src/features/mappings/components/preview/TestCaseManager.test.tsx` — existing tests
- `ui/src/features/mappings/components/AdvancedTestingPage.tsx` — primary integration surface
- `ui/src/features/mappings/components/AdvancedTestingPage.test.tsx` — page tests
- `ui/src/features/mappings/components/ConnectedInlinePreviewStrip.tsx` — inline strip updates
- `ui/src/features/mappings/components/preview/index.ts` — barrel exports
- `ui/src/features/mappings/components/index.ts` — feature barrel
- `ui/src/features/mappings/hooks/use-preview-execution.ts` — execution hook (consumed by batch runner)
- `forge/architecture/ui-application.md` — architecture update

---

## Dependencies / Blockers

- none

---

## Constraints

- localStorage persistence only (Phase 0)
- No external state management libraries (React Context + hooks)
- Batch execution must be sequential to avoid overwhelming the synchronous engine
- Must not break existing test case data in localStorage — migration must be backward-compatible (existing `TestCase[]` arrays must load without error)
- TypeScript strict mode, zero-error lint/typecheck policy
- Desktop-first layout (1024px minimum)

---

## Proposed Behavior

### User Flow

#### Scratchpad vs Saved Test Cases

- When no test case is selected, the source textarea operates in **scratchpad mode** — the user types ad hoc input freely.
- **Scratchpad is ephemeral:** it always starts empty when entering Test Lab. Content is not persisted across page navigations or sessions. Durable work should be saved as a named test case.
- When a saved test case is selected, the source textarea loads the test case's `sourceData` and enters **saved-case mode** — edits update the selected case (with an explicit Save action or auto-save on blur).
- A "Scratchpad" entry appears at the top of the test case list as a permanent, non-deletable pseudo-entry. Selecting it returns to ad hoc mode.

#### Test Case List

- The test case list replaces the dropdown `<select>` in `AdvancedTestingPage`.
- Each row shows: name, pass/fail status badge, last-run relative timestamp.
- Clicking a row selects it and loads its `sourceData` into the source textarea.
- The currently selected row is visually highlighted.
- **Add New:** A button at the top of the list creates a new blank test case with a default name ("Test Case N") and selects it. The source textarea clears.
- **Save Current Input:** A button saves the current scratchpad source data as a new named test case. An inline name input appears (same pattern as current save flow). After saving, the new case is selected.
- **Rename:** Double-click the test case name to enter inline edit mode. Press Enter to confirm, Escape to cancel.
- **Duplicate:** Context action (button or menu) that creates a copy with " (copy)" suffix appended to the name.
- **Delete:** Context action with confirmation for cases that have run results. Deleting the selected case returns to scratchpad mode.

#### Batch Execution

- **Run All:** Executes all saved test cases sequentially. During execution, a progress indicator shows (e.g., "Running 3/7..."). Each case's pass/fail result is recorded as it completes. The user can observe results populating the list in real-time.
- **Rerun Failed:** Filters to test cases with a `fail` status from the last batch run and re-executes them. Behaves identically to Run All but on the filtered subset. Disabled when there are no failed cases.
- Both actions are buttons in the test case list toolbar area.
- **Completion UX is inline:** after batch completion, the test case list shows an inline suite summary (e.g., "2 passed, 1 failed") in the toolbar area. No blocking summary modal or toast is shown. The summary can auto-dismiss after a brief period or be manually cleared.
- During batch execution, individual Run and source editing are disabled to prevent conflicting state.

#### Per-Case Pass/Fail Status

- **Pass:** The execution completed and the result contains zero error-severity diagnostics.
- **Fail:** The execution completed but the result contains one or more error-severity diagnostics, or the execution itself errored/timed out.
- **Not Run:** The test case has never been executed or has been modified since its last run.
- Status badges use green (pass), red (fail), gray (not run) color coding.

#### Last-Run Result Persistence

- After each execution (individual or batch), the result (pass/fail status, diagnostic count, timestamp, output snapshot) is persisted to localStorage.
- Results are stored separately from test case definitions to keep the test case array clean and backward-compatible.
- Storage key: `keyra:testresults:{mappingId}`
- On page load, last-run results are loaded and displayed in the test case list.

### System Behavior

#### Data Model Extensions

**TestCase** remains unchanged for backward compatibility. No new fields are added to the existing type.

**TestRunResult** (new type in `domain.ts`):

```ts
export interface TestRunResult {
  readonly testCaseId: string;
  readonly status: 'pass' | 'fail';
  readonly errorCount: number;
  readonly warningCount: number;
  readonly executedAt: ISODateString;
  readonly durationMs: number;
  readonly outputSnapshot?: unknown;
}
```

**Run result storage** is a separate localStorage key (`keyra:testresults:{mappingId}`) containing a `Record<string, TestRunResult>` keyed by test case ID.

#### useTestCases Hook Extensions

New operations added to `UseTestCasesResult`:

- `renameTestCase(id: string, newName: string): void` — updates name, persists
- `duplicateTestCase(id: string): TestCase | null` — creates copy with " (copy)" suffix, persists, returns the new case
- `updateTestCase(id: string, updates: Partial<Pick<TestCase, 'sourceData' | 'expectedOutput'>>): void` — partial update, persists

#### useTestRunResults Hook (new)

A new hook `useTestRunResults(mappingId)` manages run result persistence:

- `results: Readonly<Record<string, TestRunResult>>` — current results map
- `recordResult(testCaseId: string, result: TestRunResult): void` — upsert a result
- `clearResult(testCaseId: string): void` — remove a result (called when test case is modified)
- `clearAll(): void` — remove all results for the mapping
- Storage key: `keyra:testresults:{mappingId}`

#### Batch Execution Model

A new hook `useBatchExecution` orchestrates batch runs:

- Accepts: test cases to run, mapping config, schemas
- Manages: execution queue, progress state, cancellation
- For each case: parses `sourceData` as JSON, calls the engine `execute()`, records pass/fail based on diagnostics
- Emits: per-case completion callbacks so the UI can update in real-time
- Returns: `isRunning`, `progress: { current, total }`, `runAll()`, `rerunFailed()`, `cancel()`

### Failure / Edge Behavior

- **Invalid sourceData JSON:** If a test case's `sourceData` is not valid JSON, the execution for that case is marked as `fail` with an appropriate error message. Batch execution continues to the next case.
- **Empty test case list:** Run All and Rerun Failed buttons are disabled when there are no saved test cases.
- **No failed cases:** Rerun Failed is disabled when no test cases have `fail` status.
- **Storage quota exceeded:** Save/duplicate operations return an error result (same pattern as existing `saveTestCase`). The error is displayed inline.
- **Corrupted run results in localStorage:** Handled gracefully — corrupted data resets to empty record (same pattern as existing `useTestCases` corruption handling).
- **Test case deleted while batch is running:** The batch runner skips deleted cases gracefully.
- **Navigating away during batch execution:** The batch is cancelled (no blocking modal).
- **Backward compatibility:** Existing `TestCase[]` arrays in localStorage load without error. The absence of a corresponding `testresults` entry means "not run."

---

## Acceptance Examples

### AE-01 — Create a new blank test case

**Given**
- The user is on the Advanced Testing page with no test cases saved

**When**
- The user clicks "Add New"

**Then**
- A new test case appears in the list with the name "Test Case 1"
- The new case is automatically selected
- The source textarea is cleared
- The case shows "Not Run" status

### AE-02 — Save current scratchpad input as a test case

**Given**
- The user is in scratchpad mode with `{"name": "Alice"}` in the source textarea

**When**
- The user clicks "Save As Test Case"
- The user enters the name "Happy Path" and confirms

**Then**
- A new test case "Happy Path" appears in the list with sourceData `{"name": "Alice"}`
- The new case is automatically selected
- The source textarea retains the same content

### AE-03 — Rename a test case

**Given**
- A test case named "Happy Path" exists

**When**
- The user double-clicks the name "Happy Path"
- The user types "Basic Success" and presses Enter

**Then**
- The test case name updates to "Basic Success"
- The name is persisted to localStorage

### AE-04 — Duplicate a test case

**Given**
- A test case named "Basic Success" exists with sourceData `{"name": "Alice"}`

**When**
- The user clicks the Duplicate action on "Basic Success"

**Then**
- A new test case "Basic Success (copy)" appears in the list
- Its sourceData is identical to the original
- The duplicate is automatically selected

### AE-05 — Delete a test case

**Given**
- A test case named "Basic Success (copy)" is selected

**When**
- The user clicks the Delete action

**Then**
- The test case is removed from the list and localStorage
- Selection returns to scratchpad mode
- The source textarea clears

### AE-06 — Run a single test case with pass result

**Given**
- A test case "Happy Path" is selected with valid sourceData
- The mapping has no rules that produce error diagnostics for this input

**When**
- The user clicks Run

**Then**
- The test case status shows a green "Pass" badge
- The last-run timestamp updates to "just now"
- The result is persisted to `keyra:testresults:{mappingId}` in localStorage

### AE-07 — Run a single test case with fail result

**Given**
- A test case "Missing Field" is selected with sourceData that causes error diagnostics

**When**
- The user clicks Run

**Then**
- The test case status shows a red "Fail" badge
- The error count is displayed (e.g., "2 errors")
- The result is persisted

### AE-08 — Run All test cases

**Given**
- 3 saved test cases exist: "Happy Path", "Missing Field", "Edge Case"

**When**
- The user clicks "Run All"

**Then**
- A progress indicator shows "Running 1/3...", "Running 2/3...", "Running 3/3..."
- Each case's pass/fail badge updates as it completes
- After completion, the progress indicator is replaced by a summary (e.g., "2 passed, 1 failed")
- All results are persisted

### AE-09 — Rerun Failed test cases

**Given**
- After a Run All, "Missing Field" shows Fail status
- "Happy Path" and "Edge Case" show Pass status

**When**
- The user clicks "Rerun Failed"

**Then**
- Only "Missing Field" is re-executed
- The progress indicator shows "Running 1/1..."
- The pass/fail badge updates for "Missing Field"
- "Happy Path" and "Edge Case" results are unchanged

### AE-10 — Rerun Failed disabled when no failures

**Given**
- All test cases show Pass status

**When**
- The user looks at the toolbar

**Then**
- The "Rerun Failed" button is disabled

### AE-11 — Last-run results persist across page navigation

**Given**
- Test case "Happy Path" was run and shows Pass status
- The user navigates to the Mapping Editor and back to Advanced Testing

**When**
- The Advanced Testing page loads

**Then**
- "Happy Path" still shows Pass status and the original last-run timestamp
- Results are loaded from `keyra:testresults:{mappingId}`

### AE-12 — Scratchpad mode selection

**Given**
- Test case "Happy Path" is currently selected

**When**
- The user clicks the "Scratchpad" entry at the top of the test case list

**Then**
- The source textarea clears
- The user can type ad hoc input without affecting any saved test case
- No test case is highlighted in the list

### AE-13 — Invalid JSON in test case sourceData during batch run

**Given**
- Test case "Bad JSON" has sourceData `{not valid json}`

**When**
- The user clicks "Run All"

**Then**
- "Bad JSON" is marked as Fail with an error message about invalid JSON
- Batch execution continues to the next case

### AE-14 — Backward compatibility with existing localStorage data

**Given**
- localStorage contains existing `TestCase[]` under `keyra:testcases:{mappingId}` from before this feature

**When**
- The Advanced Testing page loads

**Then**
- Existing test cases load correctly
- All cases show "Not Run" status (no `testresults` entry exists yet)
- No console errors or data corruption

### AE-15 — Batch execution cancellation on navigation

**Given**
- A batch Run All is in progress (3 of 7 cases completed)

**When**
- The user navigates away from the Advanced Testing page

**Then**
- The batch execution stops
- The 3 completed results are persisted
- The remaining 4 cases retain their previous status (Not Run or prior result)

---

## Open Questions

- none

---

## Verification Strategy

- **Unit tests** for `useTestCases` hook extensions (rename, duplicate, update) — map to AE-03, AE-04
- **Unit tests** for `useTestRunResults` hook (record, clear, load, corruption handling) — map to AE-06, AE-07, AE-11, AE-14
- **Unit tests** for `useBatchExecution` hook (sequential execution, progress, cancellation, error handling) — map to AE-08, AE-09, AE-13, AE-15
- **Component tests** for `TestCaseListPanel` (render, selection, inline rename, add new, save current, status badges) — map to AE-01, AE-02, AE-03, AE-04, AE-05, AE-12
- **Component tests** for batch execution UI (Run All button, Rerun Failed button, progress indicator, disabled states) — map to AE-08, AE-09, AE-10
- **Integration test** for backward compatibility — map to AE-14
- **TypeScript strict typecheck** must pass across all touched files
- **ESLint** must pass with zero errors

---

## Task Generation Notes

This is a cross-cutting spec: all implementation tasks are `ui-task` (React component and hook work), but the architecture update is `task`.

Suggested decomposition:

1. **Data layer first (T-01):** Extend `TestCase` domain type if needed, extend `useTestCases` hook with rename/duplicate/update operations. This is the foundation all UI work depends on.
2. **Run result model (T-02):** Add `TestRunResult` type and `useTestRunResults` hook. Separate from T-01 because it's a new storage concern.
3. **Test case list UI (T-03):** Build `TestCaseListPanel` component with selection model, pass/fail badges, inline rename, context actions. Depends on T-01 and T-02.
4. **Inline creation + save current (T-04):** Add New blank test case and Save Current Input flows. Depends on T-01, integrates with T-03.
5. **Batch execution hook (T-05):** Build `useBatchExecution` hook for sequential Run All and Rerun Failed. Depends on T-02.
6. **Batch execution UI (T-06):** Wire batch execution into test case list toolbar (Run All / Rerun Failed buttons, progress indicator). Depends on T-03 and T-05.
7. **Compose into AdvancedTestingPage (T-07):** Replace `TestCaseManager` with new components in AdvancedTestingPage layout. Wire all hooks together. Depends on T-03, T-04, T-06.
8. **Update ConnectedInlinePreviewStrip (T-08):** Update inline strip's test case selector to use new hook API. Light touch. Depends on T-01.
9. **Architecture update (T-09):** Update `ui-application.md` to document new test case management architecture. Agent: task.

---

## Change Log

- Rev 2 — 2026-05-10
  - Resolved Q1: Scratchpad is ephemeral — always starts empty, not persisted across navigations. Durable work should be saved as a named test case.
  - Resolved Q2: Batch completion UX is inline only — test case list updates in place with pass/fail status and shows inline suite summary. No blocking modal or toast.
  - Resolved Q3: No multi-select bulk actions in v1 — only Run All and Rerun Failed. Arbitrary subset selection deferred to future enhancement.
  - Added "Scratchpad content persistence across navigations" and "Multi-select bulk actions" to Out of Scope.
  - No material behavior, scope boundary, or acceptance example changes — all resolutions confirmed the existing draft lean.
- Rev 1 — 2026-05-09
  - Initial draft
