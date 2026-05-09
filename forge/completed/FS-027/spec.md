# SPEC

## Title

Mapping Editor Builder/Editor Panel Workflow & State Fixes

---

## ID

FS-027

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-05-06  
Last Updated: 2026-05-06  
Type: ui

---

## Status

completed

---

## Revision

Rev: 1

---

## Summary

The Mapping Editor's Builder/Editor panel and adjacent interactions have accumulated workflow friction and state-management bugs that slow TTFSM. This spec addresses 12 discrete issues: false-positive dirty-state modals, schema name paste/import workflow, preview panel sizing, object target utility, redundant controls (Direct Copy), awkward static value placement, missing clear-mapping action, excessive builder chrome, Apply double-click requirement, missing live result preview, truncated diagnostics, and incorrect object mapped ratios.

---

## Problem

The Builder/Editor panel and target interactions have several bugs and UX gaps:

1. **Unapplied expression modal fires spuriously.** Switching between target properties triggers the "Unapplied expression" modal even when no new edits were made because dirty-state detection compares against the wrong baseline.
2. **Schema Name input hidden until blur.** After pasting schema content, the Schema Name input does not appear until the user tabs/clicks away, obscuring the next step.
3. **Schema Name not inferred from JSON Schema title.** Users must manually type a name even when the pasted schema already has a `title` property.
4. **Preview panel textareas undersized.** Source JSON and Output panes do not fill available panel height and do not scale on resize.
5. **Object target selection lacks utility.** Selecting an object target shows an Object view with no actionable content.
6. **Direct Copy button is redundant.** It duplicates the implicit behavior of selecting a source field and wastes horizontal space.
7. **Static value placement is awkward.** It appears as a detached secondary action instead of being integrated into Value mode.
8. **No way to remove a mapping.** Users cannot clear a single target property's mapping from the builder panel.
9. **Builder chrome consumes too much vertical space.** The "Expression Builder/Editor" row and related rows waste vertical space that should be used for authoring.
10. **Apply requires two clicks.** The first click commits internally but provides no visual confirmation.
11. **Live result not displayed during expression building.** The field-level result preview does not render while building, even with test data available.
12. **Diagnostics text is truncated.** Long descriptions are clipped without a way to inspect the full message.
13. **Object rows do not update mapped ratio correctly.** The mapped ratio does not reflect child leaf field changes.

---

## Goal

After this spec is implemented:

- The unapplied-expression modal only appears when the builder state genuinely differs from the last applied state for the selected field.
- Schema paste workflow is smooth: name input is always visible, auto-fills from `title`, and does not require blur.
- Preview panes fill available height, scroll internally, and resize dynamically.
- Object target selection provides an actionable summary with clickable child fields.
- Redundant Direct Copy button is removed; direct mapping remains implicit.
- Static value is a first-class input type choice within Value mode.
- Users can clear any single target property's mapping from the builder panel.
- Builder chrome is compressed, recovering vertical space for authoring.
- Apply works in one click with clear visual confirmation.
- Live field-level result preview displays while building when test data is available.
- Diagnostics wrap and support expansion for full inspection.
- Object mapped ratios accurately reflect child leaf field status.

---

## Assumptions

- The two-tier Apply + Save model (FS-021) remains the canonical commit pattern.
- `UnifiedExpressionBuilder` (FS-023) is the active builder surface for scalar fields in Target View.
- `ScalarFieldBuilder` owns the expression area, mode toggle, apply button, and header.
- `useExpressionPreview` hook exists and supports single-expression evaluation with source data.
- `useTargetStatus` hook provides `coverageMap` for object nodes.
- Schema paste flow is on the schema import/creation screen, not the mapping editor.
- `pipeline-decomposer.ts` and `pipeline-expression-generator.ts` are stable and correct.

---

## Current Context

The Mapping Editor uses a target-driven three-column layout (FS-020/FS-021/FS-022) with `ScalarFieldBuilder` as the right-panel surface for scalar leaf targets. The builder embeds `UnifiedExpressionBuilder` (FS-023) with Value / Conditional / Value Map modes.

State hydration on target selection (FS-025 T-01) decomposes existing rules into builder state. The builder is keyed on `selectedTargetPath` to guarantee isolation. The two-tier model uses Apply to commit to working session and Save to persist.

The `ObjectSummaryPanel` component is fully implemented in `ui/src/features/mappings/components/ObjectSummaryPanel.tsx` with props, types, and UI logic. `useTargetStatus` provides `statusMap` and `coverageMap` but coverage uses direct children rather than leaf fields.

There is no standalone schema import/paste dialog component. Schema creation and the Replace File flow live within `SchemaDetailPage` (`ui/src/features/schemas/components/SchemaDetailPage.tsx`). Schema Name input and paste handling are part of this surface.

The "Direct Copy" button is implemented in `UnifiedExpressionBuilder` (`ui/src/features/mappings/components/UnifiedExpressionBuilder.tsx`). It appears in Value mode when exactly one source field is selected and no transforms are present.

`LiveResultDisplay` is rendered inside `UnifiedExpressionBuilder` (shared always-visible section), so it is already present in the `ScalarFieldBuilder` surface indirectly. The issue is that it may not be wired to live evaluation with test data during expression building.

Diagnostics text truncation occurs in `InlinePreviewStrip` (`ui/src/features/mappings/components/InlinePreviewStrip.tsx`) using the CSS `truncate` class. `BottomArea` does not truncate diagnostics text.

---

## Scope

### In Scope

- Dirty-state detection logic in `ScalarFieldBuilder` / builder navigation guard
- Schema Name input visibility and auto-fill on schema import screen
- Preview panel (Source JSON / Output) fill-height layout and resize behavior
- `ObjectSummaryPanel` actionable summary with clickable child rows
- Removal of Direct Copy button from `ScalarFieldBuilder`
- Static value integration into Value mode `SourceChipPicker`
- Builder header compression (remove standalone row, move toggle, move type badge, conditional suggestions)
- Clear mapping action in builder panel
- Apply button single-click commit + visual confirmation
- `LiveResultDisplay` wiring in `ScalarFieldBuilder` builder surface
- Diagnostics text wrapping and expansion in diagnostics surfaces
- Object mapped ratio using child leaf fields in `useTargetStatus`

### Out of Scope

- "Added fields appearing below search bar" idea
- Auto-advance-on-Apply (confirmed removed in FS-025 T-04)
- Object-level mapping authoring
- Deploy behavior or changes to Save != Deploy model
- Array mapping wizard changes
- Rules View expression panel changes (only Target View builder panel)
- Backend round-trip for live preview
- Advanced Testing page changes

---

## Non-Goals

- Introducing new expression modes beyond Value / Conditional / Value Map
- Changing the Apply + Save two-tier model semantics
- Adding object-level rule authoring
- Redesigning the overall three-column layout
- Changing the bottom inline preview strip behavior

---

## Relevant Areas

- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/UnifiedExpressionBuilder.tsx` (Direct Copy button, LiveResultDisplay, static value toggle)
- `ui/src/features/mappings/components/SourceChipPicker.tsx`
- `ui/src/features/mappings/components/ObjectSummaryPanel.tsx`
- `ui/src/features/mappings/components/LiveResultDisplay.tsx`
- `ui/src/features/mappings/components/TargetFieldRow.tsx`
- `ui/src/features/mappings/components/InlinePreviewStrip.tsx` (diagnostics truncation)
- `ui/src/features/mappings/hooks/use-target-status.ts`
- `ui/src/features/mappings/hooks/use-mapping-editor.ts`
- `ui/src/features/mappings/hooks/use-expression-preview.ts`
- `ui/src/features/mappings/lib/expression-builder-state.ts`
- `ui/src/features/mappings/lib/pipeline-expression-generator.ts`
- `ui/src/features/mappings/lib/pipeline-decomposer.ts`
- `ui/src/features/schemas/components/SchemaDetailPage.tsx` (schema name + paste flow)
- `ui/src/features/mappings/components/MappingEditorPage.tsx`

---

## Dependencies / Blockers

- none

---

## Constraints

- Must preserve the Save != Deploy model from the product specification. No deploy behavior is introduced.
- Must preserve the two-tier Apply + Save model from the Mapping Editor redesign.
- Dirty-state logic must compare current builder state to the last applied state for the selected field, not to persisted storage.
- Object mapped ratio must use child leaf fields, not just direct children.
- Static value input must still produce valid KeyRa DSL literals/functions consistent with the DSL spec.
- Live field-level result preview depends on available preview/test data and must not require a backend round-trip.
- Builder remains keyed on `selectedTargetPath` per FS-025 T-02.

---

## Proposed Behavior

### User Flow

**Dirty-state detection:**
- User selects target field A which has an applied expression.
- Builder hydrates with the applied expression.
- User clicks target field B without editing anything.
- No modal appears; builder re-hydrates for field B.
- If user edits field A's expression (any change from last applied state) and clicks field B, the "Unapplied expression" modal appears.

**Schema Name:**
- User pastes JSON Schema with `"title": "Patient"` into the schema content area.
- Schema Name input is immediately visible (no blur required) and auto-fills with "Patient".
- If user manually edits Schema Name to "My Patient", a subsequent paste does not overwrite it.

**Preview panel:**
- User resizes the preview panel taller; Source JSON and Output panes expand to fill available height.
- Long content scrolls internally within each pane.

**Object summary:**
- User clicks an `address` object target.
- Right panel shows: "address (object) — 3/5 mapped", required count, and a list of child fields.
- Clicking "city" row navigates directly to `address.city` scalar builder.

**Static value:**
- In Value mode, user sees input-type selector: "Source field" | "Static value".
- Selecting "Static value" shows a literal input field.
- Entering `"hello"` produces the DSL expression `"hello"` (string literal).

**Clear mapping:**
- User selects a mapped target field.
- Builder shows a "Clear mapping" action.
- Clicking it removes the rule for that field; target immediately shows unmapped state.
- This marks the session as having unsaved changes (same as any edit).

**Apply fix:**
- User builds an expression and clicks Apply once.
- Button shows "Applied" disabled state, target row shows mapped indicator, dirty state clears.

**Live result:**
- When test data is loaded, the builder shows the evaluated result of the current expression in real-time.
- When no test data is available: "Load test data to see live result."

**Diagnostics:**
- Long diagnostic descriptions wrap to multiple lines.
- An expand/collapse toggle is available for especially long content.

### System Behavior

**Dirty-state comparison:**
- On target selection, store `lastAppliedExpression` (the expression from the current rule, or empty string if unmapped).
- On each builder change, derive `currentExpression` from builder state.
- `isDirty = currentExpression !== lastAppliedExpression`.
- Navigation guard checks `isDirty` before allowing target switch.

**Object coverage:**
- `useTargetStatus` computes `coverageMap` by recursively counting leaf fields (non-object, non-array nodes) under each object node.
- `mapped` = leaf descendants that have a matching rule.
- `total` = all leaf descendants.
- Updates synchronously when rules change.

**Static value in Value mode:**
- `ExpressionBuilderState` for value mode gains: `inputType: 'source' | 'static'`.
- When `inputType === 'static'`, `staticValue: string` holds the literal.
- Expression generator produces the literal directly (string literals quoted, numbers/booleans raw).

**Apply single-click:**
- `applyRule()` call updates local rules state AND returns success signal.
- `ScalarFieldBuilder` on apply success: disable Apply button, show "Applied" label, update `lastAppliedExpression`.
- Re-enable Apply only when expression changes from applied state.

### Failure / Edge Behavior

- **Empty expression + Apply:** Apply remains disabled when expression is empty/whitespace.
- **Clear mapping on unmapped field:** Clear action is hidden/disabled when no rule exists.
- **Static value invalid DSL:** If static value cannot produce a valid DSL literal, show inline validation error; do not allow Apply.
- **No test data for live result:** Show placeholder text, no error.
- **Schema paste with no `title`:** Schema Name input remains empty and focused.
- **Schema paste with malformed JSON:** Schema Name stays empty; existing error handling for invalid JSON applies.
- **Object with zero children:** Show "No child fields" in summary; 0/0 mapped.

---

## Acceptance Examples

### AE-01 — Dirty modal only on real edits

**Given**
- Target field `name` has applied expression `source("firstName")`
- Builder hydrates with `source("firstName")`

**When**
- User clicks target field `age` without editing `name`

**Then**
- No "Unapplied expression" modal appears
- Builder hydrates for `age`

### AE-02 — Dirty modal on actual change

**Given**
- Target field `name` has applied expression `source("firstName")`
- User edits expression to `upper(source("firstName"))`

**When**
- User clicks target field `age`

**Then**
- "Unapplied expression" modal appears with options to Apply, Discard, or Cancel

### AE-03 — Schema Name auto-fills from title

**Given**
- User is on schema import screen
- Schema Name input is visible (always rendered)

**When**
- User pastes `{"title": "Patient", "type": "object", "properties": {}}`

**Then**
- Schema Name input auto-fills with "Patient"
- No blur/tab required

### AE-04 — Schema Name not overwritten after manual edit

**Given**
- Schema Name has been manually edited to "My Schema"

**When**
- User pastes new JSON Schema with `"title": "Order"`

**Then**
- Schema Name remains "My Schema" (not overwritten)

### AE-05 — Preview panes fill height

**Given**
- Preview panel is expanded

**When**
- User resizes panel to 400px height

**Then**
- Source JSON and Output panes each expand to fill available vertical space
- Content exceeding pane height scrolls internally

### AE-06 — Object summary with clickable children

**Given**
- Target schema has `address` object with children: `street`, `city`, `state`, `zip`, `country`
- `city` and `state` have applied rules

**When**
- User clicks `address` in target worklist

**Then**
- Right panel shows object summary: "address (object) — 2/5 mapped"
- Lists all 5 child fields with mapped/unmapped indicators
- Clicking `street` navigates to `address.street` scalar builder

### AE-07 — Static value in Value mode

**Given**
- User selects a target field
- Builder is in Value mode

**When**
- User selects "Static value" input type
- User enters `"default_value"`

**Then**
- Generated expression is `"default_value"`
- Apply is enabled
- Applying the expression works correctly

### AE-08 — Clear mapping action

**Given**
- Target field `email` has applied expression `source("emailAddress")`
- User selects `email` target

**When**
- User clicks "Clear mapping"

**Then**
- Rule for `email` is removed from working session
- Target field `email` shows unmapped state
- Session has unsaved changes (save indicator updates)
- Apply is not auto-triggered; clearing follows Apply/Save model

### AE-09 — Apply single click with confirmation

**Given**
- User has built expression `upper(source("name"))` for target `fullName`

**When**
- User clicks Apply once

**Then**
- Expression is committed to working session
- Apply button shows disabled "Applied" state
- Target field `fullName` shows mapped indicator
- `unsavedRuleCount` increments

### AE-10 — Live result preview with test data

**Given**
- Test data is loaded: `{"firstName": "John"}`
- User is building expression `source("firstName")`

**When**
- Expression is valid and test data is available

**Then**
- Live result shows: `"John"`
- Result updates as expression changes

### AE-11 — Live result without test data

**Given**
- No test data is loaded

**When**
- User is building an expression

**Then**
- Live result area shows: "Load test data to see live result"

### AE-12 — Diagnostics wrap and expand

**Given**
- A diagnostic has a long description exceeding container width

**When**
- Diagnostic is rendered

**Then**
- Text wraps to multiple lines (not clipped)
- An expand/collapse control allows viewing full content for especially long messages

### AE-13 — Object mapped ratio uses leaf fields

**Given**
- `address` object has children: `street` (string), `location` (object with `lat`, `lng`)
- Total leaf fields: `street`, `lat`, `lng` = 3
- `street` has a rule applied

**When**
- Target worklist renders `address` row

**Then**
- Mapped ratio shows "1/3" (not "1/2" which would be direct children)

### AE-14 — Builder header compressed

**Given**
- User selects a scalar target field

**When**
- Right panel renders

**Then**
- No standalone "Expression Builder/Editor" row
- Builder | Editor toggle is in the target property header row
- Target type badge is on the left side of the header
- Suggested Sources section is hidden if no suggestions exist
- Net vertical space recovered for authoring surface

### AE-15 — Direct Copy button removed

**Given**
- User selects a source field and a target field

**When**
- Right panel renders the builder

**Then**
- No "Direct Copy" button is present
- Selecting a source field with no transforms produces a direct `source("path")` expression implicitly

---

## Open Questions

- none

---

## Verification Strategy

- **Unit tests:** Dirty-state comparison logic, object leaf-field counting in `useTargetStatus`, static value expression generation, clear-mapping action.
- **Component tests:** `ScalarFieldBuilder` Apply flow (single click, disabled state, visual confirmation), header compression, conditional suggested sources rendering, clear mapping button visibility. `ObjectSummaryPanel` child rendering and click navigation. `SourceChipPicker` input-type toggle. Schema Name auto-fill behavior.
- **Integration tests:** Builder navigation between targets without triggering modal (AE-01, AE-02). Object coverage ratio updates when rules change (AE-13).
- **Visual verification:** Preview panel fill-height and resize. Diagnostics wrapping. Builder chrome compression.
- **Typecheck/lint/build:** All touched files pass `tsc --noEmit`, ESLint, and `pnpm build`.

Coverage mapping:
- AE-01, AE-02: unit + component tests
- AE-03, AE-04: component tests
- AE-05: component test + manual visual
- AE-06: component test
- AE-07: unit (generator) + component test
- AE-08: component test
- AE-09: component test
- AE-10, AE-11: component test
- AE-12: component test + manual visual
- AE-13: unit test (`useTargetStatus`)
- AE-14, AE-15: component test + manual visual

---

## Task Generation Notes

This is a UI-only spec. All tasks are `Agent: ui-task` except the architecture update task.

Recommended decomposition:

1. **Dirty-state detection fix** — isolated to `ScalarFieldBuilder` and navigation guard logic
2. **Schema Name input + auto-fill** — in `SchemaDetailPage` / schema creation flow
3. **Preview panel fill-height** — CSS/layout change in preview surfaces
4. **Object summary panel** — `ObjectSummaryPanel` enhancement + navigation wiring
5. **Remove Direct Copy button** — removal in `UnifiedExpressionBuilder` Value mode
6. **Static value in Value mode** — `SourceChipPicker` / `UnifiedExpressionBuilder` + `expression-builder-state.ts` + generator changes
7. **Builder header compression** — `ScalarFieldBuilder` layout restructure
8. **Clear mapping action** — new action in `ScalarFieldBuilder` + `useMappingEditor` wiring
9. **Apply single-click fix** — `ScalarFieldBuilder` Apply flow + state management
10. **Live result preview wiring** — ensure `LiveResultDisplay` in `UnifiedExpressionBuilder` is connected to test data
11. **Diagnostics wrap + expand** — `InlinePreviewStrip` truncation fix
12. **Object mapped ratio fix** — `useTargetStatus` leaf-field counting
13. **Architecture update** — update `ui-application.md` to reflect FS-027 changes

Tasks 1, 9, and 10 are related (builder state lifecycle) but should remain separate for atomic execution. Task 6 has a dependency on task 5 (Direct Copy removal frees space). Tasks 7 and 5 are also layout-related but independent.

---

## Change Log

- Rev 1 — 2026-05-06
  - Initial draft from requirements input
  - Open questions Q1–Q5 resolved:
    - Q1: No standalone schema import/paste screen exists; schema creation uses SchemaDetailPage with a Replace File flow. Schema Name + paste behavior lives in this area.
    - Q2: ObjectSummaryPanel is fully implemented (not a stub).
    - Q3: Direct Copy button is in UnifiedExpressionBuilder (Value mode, 1 source selected, no transforms).
    - Q4: LiveResultDisplay is rendered inside UnifiedExpressionBuilder (already present in ScalarFieldBuilder's builder surface indirectly).
    - Q5: Diagnostics truncation is only in InlinePreviewStrip (CSS `truncate` class); BottomArea does not truncate.
