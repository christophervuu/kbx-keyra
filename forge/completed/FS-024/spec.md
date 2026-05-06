# SPEC

## Title

Inline Preview Strip — Three-Pane Redesign with Diagnostics, Status Bar & Save Modal

---

## ID

FS-024

---

## Metadata

Owner: @christophervuu
Reviewers: TBD
Created: 2026-05-04
Last Updated: 2026-05-04
Type: ui

---

## Status

completed

---

## Revision

Rev: 1

---

## Summary

Redesigns the inline preview strip in the Mapping Editor from a two-column layout (Source + Output) with a narrow status column into a three-pane layout (Source JSON ~35% / Output ~40% / Diagnostics ~25%) with a full-width toolbar row, a single-line status bar, a modal for saving test cases, and always-visible diagnostics. This eliminates the need to navigate to a separate tab to see warnings/errors, introduces deliberate friction for test case saves, and surfaces the "Open Advanced Testing" link in multiple discovery points.

---

## Problem

The current inline preview strip in the Mapping Editor has several UX issues that break the edit-preview feedback loop:

1. **Three-column layout wastes space and buries diagnostics.** The current layout splits into Source JSON, Output, and a narrow Status column. Diagnostics are not visible inline — they require navigating to a separate tab.
2. **No test case selector friction.** Saving a test case inline risks accidental saves without naming.
3. **Toolbar controls are disorganized.** The test case selector, Run button, and Auto-run toggle are not grouped in a way that makes their relationship explicit.
4. **"Open Advanced Testing" is not surfaced.** There is no persistent link to the Advanced Testing page from the preview strip toolbar, and no contextual link when errors are present.
5. **No Clear button.** Users must manually select all text in the textarea to clear source data.
6. **Auto-run is unconditional with no user override.** Per FS-022, auto-preview fires unconditionally. Users who want manual-only execution during debugging have no way to suppress it.

---

## Goal

A redesigned inline preview strip with:

- A full-width **toolbar row** containing PREVIEW label, test case selector, Clear button, Save as test case button (modal), Auto-run toggle, Run button, and Open Advanced Testing link.
- A single-line **status bar** displaying execution state with contextual links.
- A **three-pane content area** with always-visible Diagnostics (Source JSON ~35%, Output ~40%, Diagnostics ~25%).
- A **modal** for saving test cases (deliberate friction: requires naming).
- **Clickable diagnostics** that navigate to the affected rule in the target worklist.

---

## Assumptions

- The resizable bottom panel behavior (drag handle, collapse) from FS-022 continues to apply; this spec redesigns the content within the strip, not the strip's relationship to the editor grid.
- `usePreviewExecution` already returns diagnostics with sufficient detail (severity, errorCode, message, ruleIndex/ruleName).
- The engine's execution result includes timing information (duration in ms) that can be surfaced in the status bar.
- `useTestCases(mappingId)` supports a `saveTestCase({ name, sourceData, expectedOutput? })` method.
- Diagnostics include a reference to the affected rule (by index or target path) so entries can be made clickable.

---

## Current Context

The current `InlinePreviewStrip` (post FS-022) has:

- **Collapsed bar:** "Preview" label, status summary, expand chevron.
- **Expanded layout:** Header bar (Preview label + collapse chevron) → Main row split into: Source input (~30%) with test case selector, Run button (narrow column), Output (~45%), Status + Advanced Testing link (~25%).
- **Auto-preview:** unconditional — fires on every `lastApplyTimestamp` change when `sourceData` is non-empty. No toggle.
- **Test case selector:** a `<select>` dropdown that loads saved test cases into the source textarea.
- **Output flash:** brief border animation when new results arrive.
- **No diagnostics pane.** Diagnostics are only visible on the Advanced Testing page.

`ConnectedInlinePreviewStrip` owns `sourceData`, `isCollapsed` state, and wires `usePreviewExecution` + `useTestCases`.

---

## Scope

### In Scope

- Redesign `InlinePreviewStrip` expanded layout into toolbar row + status bar + three-pane content area.
- Add full-width toolbar with: PREVIEW label, test case selector dropdown, × Clear button, ⊕ Save as test case button, Auto-run toggle, ▶ Run button, Open Advanced Testing ↗ link.
- Add single-line status bar below toolbar with state-dependent display (Idle, Ready, Running, Success, Success with warnings, Error).
- Replace the Output + Status columns with: Source JSON (~35%), Output (~40%), Diagnostics (~25%).
- Add always-visible Diagnostics pane with clickable entries (severity icon, error code, message, affected rule name).
- Add Save as test case modal (name input, JSON preview, optional "Set as expected output" checkbox).
- Add × Clear button that clears source data textarea.
- Re-introduce Auto-run toggle (green dot when active; replaces the unconditional behavior from FS-022).
- Add contextual "Open Advanced Testing →" link in status bar when errors are present.
- Add [Format] ghost button in Source pane header (pretty-prints minified JSON).
- Add [Copy] ghost button in Output pane header (copies to clipboard with "Copied ✓" feedback).
- Wire clickable diagnostics to navigate to affected rule in target worklist.
- Update `ConnectedInlinePreviewStrip` to pass diagnostics, timing, and rule-navigation callback.
- Update collapsed bar to remain consistent.
- Update all affected tests.

### Out of Scope

- Changing the bottom panel's resize/collapse behavior (owned by FS-022's `useResizableLayout`).
- Making the three panes independently resizable (fixed widths in this iteration).
- Redesigning the BottomArea (Rules View) — only the InlinePreviewStrip (Target View) is affected.
- Adding test case edit/delete to the inline strip (stays on Advanced Testing page).
- Changing the Advanced Testing page layout.

---

## Non-Goals

- This spec is not redesigning the overall editor layout or panel grid.
- This spec is not implementing a full test runner (test cases with pass/fail assertions happen on Advanced Testing page).
- This spec is not adding trace mode to the inline strip.

---

## Relevant Areas

- `ui/src/features/mappings/components/InlinePreviewStrip.tsx` (major rewrite)
- `ui/src/features/mappings/components/InlinePreviewStrip.test.tsx` (major test update)
- `ui/src/features/mappings/components/ConnectedInlinePreviewStrip.tsx` (prop additions)
- `ui/src/features/mappings/hooks/use-preview-execution.ts` (expose diagnostics + timing)
- `ui/src/features/mappings/hooks/use-test-cases.ts` (verify save interface)
- `ui/src/features/mappings/types.ts` (new types for diagnostics display)
- `ui/src/features/mappings/components/MappingEditorPage.tsx` (rule navigation callback)
- `ui/src/features/mappings/components/TargetWorklist.tsx ?` (highlight target from diagnostics click)

---

## Dependencies / Blockers

- Depends on FS-022 (completed) — defines the resizable panel, collapse behavior, and strip placement.
- Depends on FS-021 (completed) — defines InlinePreviewStrip, ConnectedInlinePreviewStrip, and Advanced Testing page route.
- Depends on FS-012 (completed) — defines `usePreviewExecution` and `useTestCases` hooks.

---

## Constraints

- The preview strip remains resizable (vertical drag handle above it, per FS-022).
- Auto-run toggle replaces the unconditional FS-022 behavior. When on: fires on every Apply if source data is non-empty. When off: manual Run only.
- The [Format] button in the Source pane pretty-prints minified JSON in the textarea.
- The [Copy] button in the Output pane copies output JSON to clipboard and shows "Copied ✓" for 1.5 seconds before reverting.
- Diagnostics pane entries are clickable and navigate to the affected rule in the target worklist (highlights it).
- The three panes are not independently resizable in this iteration — widths are fixed at ~35% / ~40% / ~25%.
- The strip collapses to a slim header bar (double-click on drag handle or click the collapse chevron in the header), per FS-022.
- The Advanced Testing page link (`/projects/:projectId/mappings/:mappingId/test`) is the same route defined in FS-021.
- The test case selector reads from `useTestCases(mappingId)` — same localStorage key (`keyra:testcases:{mappingId}`) shared with the Advanced Testing page.
- TypeScript strict mode, lint/format, and existing tests must continue to pass.
- Save as test case modal must require a name (auto-populated with "Test case N" if blank on submit).

---

## Proposed Behavior

### User Flow

**Toolbar row:** When the strip is expanded, the user sees a full-width toolbar above the content. From left to right: "PREVIEW" label, test case selector dropdown, × Clear button, ⊕ Save as test case button, Auto-run toggle (green dot when active), ▶ Run button, then right-aligned "Open Advanced Testing ↗" link.

**Test case selector:** The dropdown lists saved test cases by name. Options include: saved cases (selects and loads sourceData), "Paste new..." (no-op, placeholder instructing manual paste), and "Load from file..." (deferred — disabled in this iteration). Selecting a saved case populates the source textarea.

**Clear button:** Clicking × clears the source data textarea immediately.

**Save as test case:** Clicking ⊕ opens a modal with: name input (required; auto-populated with "Test case {N+1}"), read-only JSON preview (truncated if long), "Set as expected output" checkbox (saves current output alongside source), Save/Cancel buttons. On save success, the ⊕ button briefly shows "Saved ✓" state for 1.5 seconds.

**Auto-run toggle:** A pill/dot toggle showing on/off state. When on (green dot), preview fires automatically on every Apply when source data is present. When off (gray dot), only manual ▶ Run executes. Default state: on.

**Run button:** Manual trigger. Disabled when source data is empty or execution is in progress.

**Status bar:** A slim full-width row below the toolbar showing one of:
- Idle: `● Paste source JSON and click Run` — muted gray
- Ready: `● Ready — click Run or enable Auto-run` — muted gray
- Running: `◌ Evaluating N rules...` — muted yellow
- Success: `✓ N rules evaluated · 0 errors · 0 warnings · Xms` — green
- Success with warnings: `⚠ N rules evaluated · 0 errors · N warnings · Xms` — amber
- Error: `✗ N errors · N warnings · Open Advanced Testing →` — red, with inline clickable link

**Three-pane content area:**

1. **Source JSON (~35%):** Pane header with "SOURCE JSON" label and [Format] ghost button. Below: JSON textarea populated by test case selector or manual paste. Format button pretty-prints minified JSON.

2. **Output (~40%):** Pane header with "OUTPUT" label and [Copy] ghost button. Below: read-only transformed result display. Placeholder: "No output yet — run the mapping to see results". Copy button copies JSON to clipboard and shows "Copied ✓" for 1.5s.

3. **Diagnostics (~25%):** Pane header with "DIAGNOSTICS" label and count badge (e.g., "3"). Below: scrollable list of diagnostic entries. Placeholder: "Run to see diagnostics." Each entry shows: severity icon (✗ red / ⚠ amber / ℹ blue), error code, message, and affected rule name. Each entry is clickable — navigates to the affected rule in the target worklist.

### System Behavior

**Props expansion:** `InlinePreviewStripProps` gains:
- `diagnostics: PreviewDiagnostic[]` — full diagnostic entries from execution
- `ruleCount: number` — total rules evaluated (for status bar display)
- `durationMs: number | null` — execution duration
- `onNavigateToRule: (ruleIndex: number) => void` — callback to highlight a rule in the target worklist
- `onSaveTestCase: (input: { name: string; sourceData: string; expectedOutput?: unknown }) => void` — save callback
- `onClearSource: () => void` — clear source data
- `autoRun: boolean` — current auto-run state
- `onAutoRunChange: (value: boolean) => void` — toggle auto-run

`ConnectedInlinePreviewStrip` changes:
- Derives `diagnostics` and `durationMs` from `usePreviewExecution` state.
- Owns `autoRun` state (default: `true`), persisted in localStorage key `keyra:preview-autorun`.
- The `lastApplyTimestamp` effect now respects `autoRun` — only fires `onRun()` when `autoRun === true && sourceData.trim()`.
- Passes `onSaveTestCase` wired to `useTestCases.saveTestCase`.
- Passes `onNavigateToRule` from composition layer (received as new prop).

**Navigate-to-rule:** When a diagnostic entry is clicked, `onNavigateToRule(ruleIndex)` fires. The composition layer (`MappingEditor.tsx`) resolves the rule's `targetPath` and sets `selectedTargetPath`, which highlights the row in `TargetWorklist`.

**Format button:** Parses the textarea value with `JSON.parse`, then re-serializes with `JSON.stringify(parsed, null, 2)`. If parse fails, the button shows a brief shake animation and does nothing.

**Copy button:** Uses `navigator.clipboard.writeText(outputText)`. On success, button text changes to "Copied ✓" for 1.5s. On failure (clipboard API unavailable), shows "Copy failed" for 1.5s.

### Failure / Edge Behavior

- **Empty source data:** Status shows "Idle", Run is disabled, Auto-run skips silently, Diagnostics shows placeholder.
- **Invalid source JSON (for Format):** Format button parse fails → brief shake animation, textarea unchanged.
- **No diagnostics:** Diagnostics pane shows "Run to see diagnostics." placeholder.
- **Clipboard API unavailable:** Copy button shows "Copy failed" briefly, no crash.
- **No test cases saved:** Selector shows "No saved test cases" as disabled option (existing behavior).
- **Save modal with empty name:** Auto-populates with "Test case {N+1}" on submit. Name input shows validation hint if submitted truly empty.
- **Rule navigation target not found:** If `ruleIndex` doesn't resolve to a valid target path, navigation is a no-op (no error).
- **Large diagnostics list:** Pane is scrollable with overflow-y-auto.
- **Long output:** Output pane is scrollable (removes the current `line-clamp-3` restriction).

---

## Acceptance Examples

### AE-01 — Toolbar layout renders all controls

**Given**
- The inline preview strip is expanded.

**When**
- The strip renders.

**Then**
- The toolbar row contains (in order): "PREVIEW" label, test case selector dropdown, × Clear button, ⊕ Save as test case button, Auto-run toggle, ▶ Run button, "Open Advanced Testing ↗" link (right-aligned).
- All controls have appropriate `data-testid` attributes.

### AE-02 — Status bar shows Idle state

**Given**
- The strip is expanded.
- No source data is loaded (textarea empty).

**When**
- The strip renders.

**Then**
- Status bar shows: `● Paste source JSON and click Run` in muted gray.
- Run button is disabled.

### AE-03 — Status bar shows Success state

**Given**
- Source data is loaded.
- A preview run completes successfully with 5 rules, 0 errors, 0 warnings, in 12ms.

**When**
- The run finishes.

**Then**
- Status bar shows: `✓ 5 rules evaluated · 0 errors · 0 warnings · 12ms` in green.

### AE-04 — Status bar shows Error state with link

**Given**
- A preview run completes with 2 errors and 1 warning.

**When**
- The run finishes.

**Then**
- Status bar shows: `✗ 2 errors · 1 warning · Open Advanced Testing →` in red.
- "Open Advanced Testing →" is a clickable link navigating to the testing page.

### AE-05 — Diagnostics pane shows entries

**Given**
- A preview run completes with diagnostics: `[{ severity: 'error', code: 'E001', message: 'Invalid source path', ruleName: 'patient.name.given' }]`.

**When**
- The diagnostics pane renders.

**Then**
- The diagnostics pane shows one entry with: red ✗ icon, "E001", "Invalid source path", "patient.name.given".
- The entry is clickable.

### AE-06 — Clicking diagnostic navigates to rule

**Given**
- A diagnostic entry with `ruleIndex: 3` is displayed.

**When**
- The user clicks the diagnostic entry.

**Then**
- `onNavigateToRule(3)` is called.
- The target worklist highlights the row for rule index 3's target path.

### AE-07 — Save as test case modal flow

**Given**
- Source data contains `{"name": "John"}`.
- Output is `{"fullName": "John Doe"}`.

**When**
- The user clicks ⊕ Save as test case.
- The modal opens with name "Test case 1" auto-populated.
- The user changes name to "Patient Basic".
- The user checks "Set as expected output".
- The user clicks Save.

**Then**
- `onSaveTestCase({ name: 'Patient Basic', sourceData: '{"name": "John"}', expectedOutput: {"fullName": "John Doe"} })` is called.
- The modal closes.
- The ⊕ button shows "Saved ✓" for 1.5 seconds.

### AE-08 — Auto-run toggle off suppresses auto-preview

**Given**
- Auto-run toggle is off (gray dot).
- Source data is loaded.

**When**
- The user clicks Apply in the ScalarFieldBuilder (lastApplyTimestamp changes).

**Then**
- No preview execution occurs.
- Output remains unchanged.

### AE-09 — Auto-run toggle on triggers auto-preview

**Given**
- Auto-run toggle is on (green dot).
- Source data is loaded.

**When**
- The user clicks Apply in the ScalarFieldBuilder (lastApplyTimestamp changes).

**Then**
- Preview executes automatically.
- Output updates with new results.

### AE-10 — Clear button clears source data

**Given**
- Source data textarea contains JSON.

**When**
- The user clicks the × Clear button.

**Then**
- The source textarea is empty.
- Status bar reverts to Idle state.

### AE-11 — Format button pretty-prints JSON

**Given**
- Source textarea contains `{"name":"John","age":30}`.

**When**
- The user clicks [Format] in the Source pane header.

**Then**
- The textarea content becomes:
```json
{
  "name": "John",
  "age": 30
}
```

### AE-12 — Copy button copies output

**Given**
- Output pane shows `{"result": "success"}`.

**When**
- The user clicks [Copy] in the Output pane header.

**Then**
- The clipboard contains `{"result": "success"}`.
- The button text changes to "Copied ✓" for 1.5 seconds, then reverts.

### AE-13 — Diagnostics placeholder when no run

**Given**
- No preview run has been executed.

**When**
- The diagnostics pane renders.

**Then**
- It shows: "Run to see diagnostics."

### AE-14 — Output placeholder when no run

**Given**
- No preview run has been executed.

**When**
- The output pane renders.

**Then**
- It shows: "No output yet — run the mapping to see results"

### AE-15 — Test case selector populates source

**Given**
- A saved test case "Patient Full" exists with sourceData `{"id": "123"}`.

**When**
- The user selects "Patient Full" from the test case dropdown.

**Then**
- The source textarea is populated with `{"id": "123"}`.
- If Auto-run is on, preview executes automatically.

---

## Open Questions

- `Q1.` The requirements describe re-introducing an Auto-run toggle after FS-022 removed it and made auto-preview unconditional. Confirm this is intentional — the toggle gives users explicit control to suppress auto-execution during debugging.
- `Q2.` Should the diagnostics pane support filtering by severity (errors only vs all)?
- `Q3.` Does `usePreviewExecution` currently return execution duration (ms)? If not, this needs engine-level instrumentation.
- `Q4.` The "Load from file..." option in the test case selector — should it be rendered as disabled in this iteration, or omitted entirely?
- `Q5.` Should the Auto-run default state be persisted per-mapping or globally?

---

## Verification Strategy

- Component tests for `InlinePreviewStrip` covering all toolbar controls, status bar states, three-pane layout, and interactions.
- Component tests for the Save as test case modal flow.
- Component tests for clickable diagnostics entries.
- Unit tests for Format button (valid JSON → pretty-print; invalid JSON → no change).
- Unit tests for Copy button (clipboard API mock).
- Integration test for Auto-run toggle state change affecting auto-preview behavior.
- Component tests for `ConnectedInlinePreviewStrip` with new prop wiring.
- Typecheck and lint must pass across all touched files.

Map to acceptance examples:
- AE-01: Component test for toolbar layout.
- AE-02, AE-03, AE-04: Component tests for status bar states.
- AE-05, AE-06: Component tests for diagnostics pane + navigation.
- AE-07: Component test for save modal flow.
- AE-08, AE-09: Integration tests for auto-run toggle behavior.
- AE-10: Component test for clear button.
- AE-11: Unit test for format button.
- AE-12: Unit test for copy button.
- AE-13, AE-14, AE-15: Component tests for placeholders and test case loading.

---

## Task Generation Notes

This spec decomposes into six tasks:

1. **Redesign InlinePreviewStrip layout — toolbar + status bar + three panes** (ui-task) — Rewrite the expanded layout from the current 4-column to: toolbar row, status bar, three-pane content area. Define new `InlinePreviewStripProps` interface. Implement pane headers with labels. Implement status bar with state logic. Update collapsed bar if needed. This is the foundational structure task.

2. **Implement toolbar controls — Clear, Auto-run toggle, Run relocation** (ui-task, depends T-01) — Add × Clear button, Auto-run toggle (green/gray dot with on/off states), relocate ▶ Run button into toolbar, add right-aligned "Open Advanced Testing ↗" link. Wire `autoRun` state into `ConnectedInlinePreviewStrip` with localStorage persistence.

3. **Implement Save as test case modal** (ui-task, depends T-01) — Add ⊕ button in toolbar that opens a modal. Modal: name input (auto-populated), JSON preview, "Set as expected output" checkbox, Save/Cancel. On success: brief "Saved ✓" feedback on toolbar button. Wire to `useTestCases.saveTestCase`.

4. **Implement Diagnostics pane with clickable entries** (ui-task, depends T-01) — Build the Diagnostics pane (~25% width) with: placeholder state, scrollable entry list, severity icons, error code, message, rule name. Make entries clickable → fire `onNavigateToRule(ruleIndex)`. Wire navigation callback through `ConnectedInlinePreviewStrip` to composition layer.

5. **Implement Format and Copy ghost buttons** (ui-task, depends T-01) — Add [Format] ghost button to Source pane header (pretty-prints JSON, shake on invalid). Add [Copy] ghost button to Output pane header (clipboard write with "Copied ✓" feedback for 1.5s). Both use the pane header slot pattern.

6. **Update ConnectedInlinePreviewStrip wiring and composition integration** (ui-task, depends T-01, T-02, T-03, T-04, T-05) — Wire all new props through `ConnectedInlinePreviewStrip`: diagnostics, durationMs, ruleCount from `usePreviewExecution`; autoRun state with localStorage; onNavigateToRule from composition layer; onSaveTestCase from `useTestCases`. Update `MappingEditorPage` / composition layer to pass `onNavigateToRule`. Verify auto-run toggle gating works end-to-end.

T-01 must be completed first (structural rewrite). T-02 through T-05 can be parallelized after T-01. T-06 integrates everything and depends on all prior tasks.

---

## Change Log

- Rev 1 — 2026-05-04
  - Initial draft
