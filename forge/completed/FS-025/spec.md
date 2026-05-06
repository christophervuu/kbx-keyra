# SPEC

## Title

Builder/Editor Panel — State Loading, Navigation Reset, Conditional Branch Transforms & Apply Behavior Fixes

---

## ID

FS-025

---

## Metadata

Owner: @christophervuu
Reviewers: TBD
Created: 2026-05-05
Last Updated: 2026-05-05

Type: ui

---

## Status

completed

---

## Revision

Rev: 1

---

## Summary

Fix four interrelated behavior issues in the Builder/Editor panel that break the authoring flow: (1) the builder does not populate with existing configuration when selecting a mapped target field, (2) conditional mode branches only support static values — not transforms/expressions, (3) the builder does not reset/reload when navigating between target fields, and (4) the Apply button auto-advances focus to the next unmapped target field without user consent. These fixes restore reliable builder state management, enable full expression composition in conditional branches, and give users explicit control over navigation.

---

## Problem

The Builder/Editor panel has several behavior issues that break the authoring flow:

1. **Builder not populated when selecting a mapped target property.** When a user clicks a target field that already has a mapping, the builder panel does not load the existing configuration (source, transform chain, expression type, parameters). The user sees an empty builder instead of the current rule's state, making it impossible to review or edit existing mappings without switching to raw Editor mode.

2. **Conditionals don't support transformations in branches.** The Conditional mode only allows static values or nested else-if in the Then/Else branches. Users cannot apply transforms within a conditional branch (e.g., `if(gt(source("amount"), 1000), upper(source("tier")), "STANDARD")`). The Then/Else branches should support the full expression-building capability: static value, source field, or a built expression (Source + Transform chain).

3. **Builder does not reset/load when navigating between target properties.** After finishing one target property and clicking another, the builder panel does not reset to show the new target's configuration (or an empty state if unmapped). It appears stuck on the previous field's state.

4. **Apply button auto-advances to next target property.** The current behavior where clicking Apply automatically moves focus to the next unmapped target field is disorienting. Users may want to review their work, tweak the expression, or check the live preview before moving on. The user should explicitly choose when to navigate to the next field.

---

## Goal

- When a user selects a mapped target field, the builder panel populates with the existing rule's full configuration (expression type auto-detected, source fields shown, transform chain populated, conditional/value-map branches filled).
- Conditional mode Then/Else branches support three options: static value, source field, or a full build expression (inline mini-builder with Source + Transform chain).
- When the user navigates between target fields, the builder fully resets and loads the new target field's state.
- Clicking Apply commits the rule without auto-advancing focus. The user explicitly navigates when ready.

---

## Assumptions

- FS-023's `pipeline-decomposer.ts` (`decomposeExpression()`) provides the foundational decomposition logic for mapping DSL expressions back to `ExpressionBuilderState`. The fixes in this spec wire that decomposer into the target-selection lifecycle.
- The `UnifiedExpressionBuilder` state model (`ExpressionBuilderState`) from FS-023 can represent the full range of expressions users create through the builder UI.
- The navigation guard behavior from FS-021 AE-05 (confirmation dialog for unapplied changes) is already implemented and functioning correctly.
- `BranchValueSelector` from FS-023 already renders static value and source field options; this spec extends it with a "Build expression" option.
- The `DSL_FUNCTION_CATALOG` provides sufficient metadata to drive inline mini-builder transform steps.

---

## Current Context

The `UnifiedExpressionBuilder` (FS-023) is the current form-based builder supporting three modes (Value, Conditional, Value Map). It is used in both `ScalarFieldBuilder` (Target View) and `ExpressionBuilderPanel` (Rules View).

**State loading gap:** The `useExpressionBuilder` hook loads the selected rule's expression and attempts decomposition when switching from Editor to Builder mode, but it does **not** automatically decompose and hydrate the builder state when the user first selects a target field. The hook initializes with empty state regardless of whether the target has an existing mapping.

**Navigation reset gap:** `ScalarFieldBuilder` does not reset its internal builder state when `selectedTargetPath` changes. The previous field's state persists in the component because `UnifiedExpressionBuilder` is not keyed or reset on target change.

**Branch limitation:** `BranchValueSelector` in the Conditional mode currently offers: static value, source field reference, or "Add else-if" (for the else branch only). There is no option to compose a full expression (Source + Transform chain) within a branch.

**Auto-advance behavior:** In `useMappingEditor`, after `applyRule()` completes, an `onRuleApplied` callback fires which advances focus to the next unmapped target field. The FS-023 Direct Copy shortcut also auto-advances.

Key files:
- `ui/src/features/mappings/hooks/use-expression-builder.ts` — orchestration hook
- `ui/src/features/mappings/hooks/use-mapping-editor.ts` — Apply/Save model + navigation
- `ui/src/features/mappings/components/UnifiedExpressionBuilder.tsx` — builder component
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx` — Target View wrapper
- `ui/src/features/mappings/components/ExpressionBuilderPanel.tsx` — Rules View wrapper
- `ui/src/features/mappings/components/BranchValueSelector.tsx` — conditional branch option selector
- `ui/src/features/mappings/components/ConditionalModeBuilder.tsx` — conditional form UI
- `ui/src/features/mappings/lib/pipeline-decomposer.ts` — DSL -> ExpressionBuilderState
- `ui/src/features/mappings/lib/expression-builder-state.ts` — state model types

---

## Scope

### In Scope

- Wire `decomposeExpression()` into the target-field-selection lifecycle so the builder auto-hydrates with the existing rule's configuration when a mapped field is selected.
- Implement builder state reset triggered by target field navigation changes (new `selectedTargetPath` clears old state and loads new).
- Add "Build expression" option to `BranchValueSelector` that opens an inline mini-builder (Source + Transform chain) within Then/Else branches.
- Enable transforms on the condition's left operand (e.g., `length(source("name"))` as the left side of a comparison).
- Remove auto-advance behavior from Apply (both normal Apply and Direct Copy).
- Add an optional "Next unmapped" accelerator button for explicit manual advance.
- Update Editor mode to also load the existing expression text when selecting a mapped field.
- Handle decomposition failure gracefully: show raw expression in Live Expression with "Complex expression -- edit in Editor mode" note.
- Preserve navigation guard behavior (FS-021 AE-05) when switching fields with unapplied changes.

### Out of Scope

- Changes to the `pipeline-decomposer.ts` core algorithm (unless a bug is found during integration).
- Changes to the expression generation logic (`pipeline-expression-generator.ts`).
- Changes to the raw DSL Editor (`RawDslEditor.tsx`) internal behavior.
- Changes to the Inline Preview Strip or bottom panel.
- Changes to the Apply/Save model itself (tier 1 / tier 2 semantics unchanged).
- Changes to array mapping builder (`ArrayMappingBuilder`).
- Adding undo/redo for expression edits.

---

## Non-Goals

- This spec does not redesign the builder UI layout or mode selection (FS-023 handles that).
- This spec does not add new DSL functions or change expression generation patterns.
- This spec does not implement AI-powered expression suggestions.
- This spec does not change how the builder works in Rules View rule selection (only target-field selection in Target View and its cross-view parity).

---

## Relevant Areas

- `ui/src/features/mappings/hooks/use-expression-builder.ts`
- `ui/src/features/mappings/hooks/use-mapping-editor.ts`
- `ui/src/features/mappings/components/UnifiedExpressionBuilder.tsx`
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/ExpressionBuilderPanel.tsx`
- `ui/src/features/mappings/components/BranchValueSelector.tsx`
- `ui/src/features/mappings/components/ConditionalModeBuilder.tsx`
- `ui/src/features/mappings/components/ConditionRowEditor.tsx`
- `ui/src/features/mappings/lib/pipeline-decomposer.ts`
- `ui/src/features/mappings/lib/expression-builder-state.ts`
- `ui/src/features/mappings/types.ts`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- Depends on FS-023 (Builder/Editor Panel Redesign) — provides the `UnifiedExpressionBuilder`, `ExpressionBuilderState`, `decomposeExpression()`, `BranchValueSelector`, and `ConditionalModeBuilder` components/utilities that this spec extends.
- Depends on FS-021 (Mapping Editor UX Redesign) — provides the two-tier save model, Apply behavior, and navigation guard that this spec modifies.

---

## Constraints

- Expression decomposition (parsing a stored DSL expression back into form fields) must handle all expression types defined in the DSL spec. Expressions that cannot be cleanly decomposed should fall back to showing the raw expression in the Live Expression area with a note: "Complex expression -- edit in Editor mode."
- The decomposition depth limit (5 levels for else-if chains, per FS-023 resolved Q5) still applies.
- The navigation guard behavior (per FS-021 AE-05) must be preserved -- unapplied changes trigger a confirmation before switching fields.
- These fixes apply to both Builder mode and Editor mode (Editor mode should also load the existing expression text when selecting a mapped field).
- The "Build expression" option in conditional branches must reuse the same `SourceChipPicker` + `TransformPipeline` components, rendered inline within the branch section.
- TypeScript strict mode, zero lint/typecheck/test errors.
- Desktop-first, minimum 1024px viewport.

---

## Proposed Behavior

### User Flow

**Fix 1 — Builder loads existing configuration:**

When the user selects a mapped target field in the worklist:

1. The builder panel detects the existing rule for that target path.
2. The existing rule's expression is passed to `decomposeExpression()`.
3. On successful decomposition:
   - The expression type mode is auto-detected (Value / Conditional / Value Map) based on the outer function of the stored expression.
   - The mode tabs switch to the detected mode.
   - Source fields are shown as chips in the Source section.
   - Transform chain is populated with each function as a numbered step, with parameters filled in.
   - For Conditionals: condition rows, Then/Else branches are fully populated.
   - For Value Maps: input value, mapping table rows, and fallback are populated.
4. The Live Expression section shows the current stored expression.
5. The Live Result section shows the evaluated output if test data is loaded.
6. On decomposition failure:
   - The builder switches to Editor mode.
   - The raw expression text is loaded into `RawDslEditor`.
   - A warning banner shows: "Complex expression -- edit in Editor mode."
   - The Live Expression section shows the stored expression.
7. If the target field is unmapped, the builder shows an empty/default state (Value mode, no sources, no transforms).

**Fix 2 — Conditionals support transformations in branches:**

Each Then/Else branch in Conditional mode now offers three options via `BranchValueSelector`:

1. **Static value** -- a literal string/number/boolean input.
2. **Source field** -- a direct `source("path")` reference via field picker.
3. **Build expression** -- opens an inline mini-builder with Source chip picker + Transform pipeline (same composable pipeline UI as Value mode). This produces a full expression for that branch.

The inline mini-builder is a compact version of the Value mode form:
- Source chip picker (single or static value toggle)
- Transform pipeline (numbered steps, add/remove/reorder)
- Generated sub-expression preview (read-only)

This allows expressions like:
- `if(contains(lower(source("notes")), "rush"), concat("RUSH-", source("orderId")), source("orderId"))`
- `if(gt(source("amount"), 1000), upper(source("tier")), "STANDARD")`

The condition's left operand also supports transforms. Instead of only allowing a bare `source("field")` reference, the left operand can be built as a mini-expression (e.g., `length(source("name"))` as the left side of a comparison). The `ConditionRowEditor` left operand field gains a "Transform..." option that opens the same inline mini-builder pattern.

**Fix 3 — Builder resets/loads on target field navigation:**

When the user clicks a different target field in the worklist:

1. If there are unapplied changes in the current builder, the navigation guard fires (per FS-021 AE-05): "You have unapplied changes to this rule. Discard?" with "Apply & Continue", "Discard", "Cancel".
2. Once navigation proceeds (guard passes or no unapplied changes):
   - The builder fully resets its internal state.
   - The new target field's state is loaded (per Fix 1 behavior: decompose existing rule or show empty state).
   - The builder header updates to show the new field's name, type, required/mapped status.
3. This works identically whether the user is in Target View or Rules View.

**Fix 4 — Remove auto-advance on Apply:**

1. Clicking Apply commits the rule to the working session but does **not** move focus to the next target field.
2. The builder remains on the current field after Apply, showing the applied expression in a "committed" state:
   - Live Expression shows the applied expression.
   - Apply button becomes disabled until further edits are made.
   - A subtle visual indicator (e.g., checkmark or "Applied" label) confirms the action.
3. The user manually clicks the next target field when ready to move on.
4. A **"Next unmapped -->"** button is provided below the Apply button as an optional accelerator:
   - Only visible when there are unmapped target fields remaining.
   - Clicking it moves focus to the next unmapped target field in document order.
   - Keyboard shortcut: `Ctrl+]` (or `Cmd+]` on macOS).
5. Direct Copy behavior is also updated: Direct Copy applies the rule immediately but no longer auto-advances. The toast still shows "Direct copy applied" but the user stays on the current field.

### System Behavior

**State hydration lifecycle:**

When `selectedTargetPath` changes in the composition layer:

1. The composition layer looks up the rule matching the new `selectedTargetPath` in the current rules array.
2. If a matching rule exists:
   - The rule's `expression` string is passed to `decomposeExpression()`.
   - On success: the returned `ExpressionBuilderState` is set as the builder's initial state; the Builder/Editor mode is set to Builder.
   - On failure: the expression string is loaded into the raw editor; mode is set to Editor; decomposition warning is shown.
3. If no matching rule exists:
   - Builder state is reset to default (Value mode, empty sources, empty transforms).
   - Mode is set to Builder.
4. The `useExpressionBuilder` hook exposes a `loadExpression(expression: string | null)` method that triggers this decompose-or-reset flow.

**Inline mini-builder for branches:**

The `BranchValueSelector` component gains a new `type: 'expression'` variant in its discriminated union:

```typescript
type BranchValue =
  | { type: 'static'; value: string }
  | { type: 'source'; path: string }
  | { type: 'expression'; state: ValueModeState }  // NEW
  | { type: 'elseIf'; condition: ConditionGroup; thenBranch: BranchValue; elseBranch: BranchValue };
```

Where `ValueModeState = { sources: SourceSelection[]; transforms: TransformStep[] }` -- the same shape as Value mode's state without the mode discriminator.

The inline mini-builder renders `SourceChipPicker` + `TransformPipeline` in a compact layout within the branch container. Expression generation for branches calls the same `generateValueExpression(state)` utility used by Value mode.

**Condition left operand transforms:**

`ConditionRowEditor` gains a `leftOperand` type that supports expressions:

```typescript
type ConditionOperand =
  | { type: 'source'; path: string }
  | { type: 'expression'; state: ValueModeState }  // NEW
  | { type: 'static'; value: string };
```

When the user clicks "Transform..." on the left operand, an inline mini-builder appears for composing the left side (e.g., `length(source("name"))`).

**Apply behavior change:**

In `useMappingEditor`:
- `applyRule()` no longer calls the `onRuleApplied` callback that triggers auto-advance.
- After apply, the hook sets an `appliedExpression` state that the builder uses to show the "committed" indicator.
- The `onRuleApplied` callback is repurposed for preview auto-run only (per FS-022/FS-024 behavior) -- it no longer controls navigation.

In `ScalarFieldBuilder` / `ExpressionBuilderPanel`:
- The `onApply` handler no longer includes navigation logic.
- A separate `onAdvanceToNext` callback is wired to the "Next unmapped -->" button.
- Direct Copy calls `onApply` without `onAdvanceToNext`.

### Failure / Edge Behavior

- **Decomposition failure on load:** Builder falls back to Editor mode with the raw expression text. User can edit in Editor mode or attempt to simplify the expression for builder compatibility.
- **Partially decomposable expressions:** The decomposer is all-or-nothing. If any part of the expression doesn't map to the state model, the entire expression falls back to Editor mode. (This is existing FS-023 behavior, preserved here.)
- **Navigation guard dismissed mid-load:** If the user cancels the navigation guard ("Cancel"), the builder stays on the current field with its current state intact.
- **Target field with empty expression rule:** If a rule exists for the target path but has an empty expression string, the builder shows empty state (same as unmapped).
- **Inline mini-builder with no source:** The mini-builder within a branch shows the same empty state as the main builder: "Select a source field or enter a static value."
- **Deep nesting of inline builders:** Inline mini-builders within conditional branches do not themselves offer Conditional mode -- they only support Value mode (Source + Transforms). This prevents unbounded nesting.
- **Apply button disabled state:** After Apply, the button shows "Applied" (disabled) until the user makes further edits that differ from the committed expression.
- **Next unmapped button when all fields are mapped:** The "Next unmapped -->" button is hidden when no unmapped fields remain.

---

## Acceptance Examples

### AE-01 -- Builder loads existing Value mode expression

**Given**
- Target field `order.total` has existing rule with expression `round(multiply(source("subtotal"), source("taxRate")), 2)`.
- The builder is on a different target field.

**When**
- The user clicks `order.total` in the target worklist.

**Then**
- The builder switches to Value mode (auto-detected from pipeline structure).
- Source section shows chips for `subtotal` and `taxRate`.
- Transform pipeline shows: step 1 "multiply" (with source parameters), step 2 "round" (with precision parameter = 2).
- Live Expression shows `round(multiply(source("subtotal"), source("taxRate")), 2)`.

### AE-02 -- Builder loads existing Conditional expression

**Given**
- Target field `order.priority` has existing rule with expression `if(gt(source("amount"), 1000), "HIGH", "NORMAL")`.

**When**
- The user clicks `order.priority` in the target worklist.

**Then**
- The builder switches to Conditional mode (auto-detected from `if()` outer call).
- Condition shows: left = `source("amount")`, operator = "greater than", right = `1000`.
- Then branch shows: static value "HIGH".
- Else branch shows: static value "NORMAL".
- Live Expression shows `if(gt(source("amount"), 1000), "HIGH", "NORMAL")`.

### AE-03 -- Builder loads existing Value Map expression

**Given**
- Target field `order.region` has existing rule with expression `valueMap(source("country"), {"US": "North America", "CA": "North America", "GB": "Europe"}, "Other")`.

**When**
- The user clicks `order.region` in the target worklist.

**Then**
- The builder switches to Value Map mode (auto-detected from `valueMap()` outer call).
- Input source shows `country`.
- Mapping table shows 3 rows: US->North America, CA->North America, GB->Europe.
- Fallback shows "Other".
- Live Expression shows the full `valueMap(...)` expression.

### AE-04 -- Builder shows empty state for unmapped field

**Given**
- Target field `order.notes` has no existing rule.

**When**
- The user clicks `order.notes` in the target worklist.

**Then**
- The builder shows empty/default state in Value mode.
- Source section shows no chips.
- Transform pipeline is empty.
- Live Expression shows placeholder: "Select a source field or enter a static value to begin."
- Apply button is disabled.

### AE-05 -- Builder handles complex expression gracefully

**Given**
- Target field `order.display` has existing rule with expression `concat(source("first"), " ", if(isNull(source("middle")), "", concat(source("middle"), " ")), source("last"))`.
- This expression cannot be cleanly decomposed into the builder state model.

**When**
- The user clicks `order.display` in the target worklist.

**Then**
- The builder switches to Editor mode.
- The raw expression is loaded into `RawDslEditor`.
- A warning banner shows: "Complex expression -- edit in Editor mode."
- Live Expression displays the full expression text.

### AE-06 -- Conditional branch with build expression

**Given**
- The builder is in Conditional mode.
- Condition: source("amount") greater than 1000.
- The user selects "Build expression" for the Then branch.

**When**
- In the inline mini-builder, the user selects source field `tier` and adds transform `upper`.

**Then**
- The Then branch mini-builder shows: source chip "tier", transform step "upper".
- The Then branch sub-expression preview shows: `upper(source("tier"))`.
- The full Live Expression shows: `if(gt(source("amount"), 1000), upper(source("tier")), ...)` (else branch contributes its value).

### AE-07 -- Conditional left operand with transform

**Given**
- The builder is in Conditional mode.
- The user clicks "Transform..." on the left operand of a condition row.

**When**
- In the inline mini-builder, the user selects source field `name` and adds transform `length`.

**Then**
- The left operand shows the composed expression: `length(source("name"))`.
- With operator "greater than" and right operand 10, the Live Expression generates: `if(gt(length(source("name")), 10), ...)`.

### AE-08 -- Builder resets on target field navigation

**Given**
- The user has the builder populated for `order.total` (Value mode with transforms).
- No unapplied changes (expression was already applied).

**When**
- The user clicks a different target field `order.currency`.

**Then**
- The builder fully resets.
- If `order.currency` is mapped, the builder loads its configuration (per Fix 1).
- If `order.currency` is unmapped, the builder shows empty state.
- The builder header shows the new field name, type, and status.

### AE-09 -- Navigation guard fires on unapplied changes

**Given**
- The user has edited the expression for `order.total` in the builder (unapplied changes present).

**When**
- The user clicks target field `order.currency` in the worklist.

**Then**
- Navigation guard fires: "You have unapplied changes to this rule. Discard?"
- "Apply & Continue": applies the expression to `order.total`, then navigates to `order.currency` (loads its configuration).
- "Discard": discards edits and navigates to `order.currency`.
- "Cancel": stays on `order.total` with current edits preserved.

### AE-10 -- Apply does not auto-advance

**Given**
- The user has composed an expression for `order.total` in the builder.
- Expression is valid.

**When**
- The user clicks Apply.

**Then**
- The rule is committed to the working session.
- The builder remains focused on `order.total`.
- Apply button shows "Applied" (disabled state).
- Live Expression shows the committed expression.
- Focus does NOT move to the next unmapped field.

### AE-11 -- Next unmapped button provides explicit advance

**Given**
- The user has just applied an expression for `order.total`.
- There are 3 remaining unmapped target fields; the next in document order is `order.currency`.

**When**
- The user clicks "Next unmapped -->" button.

**Then**
- Focus moves to `order.currency`.
- The builder loads `order.currency`'s configuration (empty state if unmapped).
- The button navigates to the document-order next unmapped field.

### AE-12 -- Direct Copy does not auto-advance

**Given**
- The user selects source field `email` in the builder (Value mode, single source, no transforms).
- The Direct Copy button is visible.

**When**
- The user clicks "Direct Copy".

**Then**
- `onApply` fires with expression `source("email")`.
- Toast shows "Direct copy applied".
- The builder remains on the current target field (does NOT advance).
- Apply button shows "Applied" (disabled).

### AE-13 -- Editor mode loads expression on target selection

**Given**
- The user is in Editor mode (not Builder mode).
- Target field `order.total` has existing rule with expression `round(source("subtotal"), 2)`.

**When**
- The user clicks `order.total` in the target worklist.

**Then**
- The `RawDslEditor` textarea is populated with `round(source("subtotal"), 2)`.
- Live Expression shows the loaded expression.
- The user can immediately edit the expression text.

### AE-14 -- Builder loads conditional with expression branches

**Given**
- Target field `order.label` has existing rule with expression `if(contains(lower(source("notes")), "rush"), concat("RUSH-", source("orderId")), source("orderId"))`.

**When**
- The user clicks `order.label` in the target worklist.

**Then**
- The builder switches to Conditional mode.
- Condition left operand shows: `lower(source("notes"))` with transform indicator.
- Condition operator: "contains".
- Condition right operand: "rush".
- Then branch shows: "Build expression" with mini-builder showing source `orderId` + transform `concat` with prefix "RUSH-".
- Else branch shows: source field `orderId`.

---

## Open Questions

- none

### Resolved Decisions

- **Q1 (uniform stay behavior for all apply-like actions):** All apply-like actions -- including Direct Copy -- stay on the current field. Predictability beats cleverness: users should not have to learn two different post-action behaviors. Direct Copy is still an edit action (user may want to verify mapping status, inspect preview, add a wrapper transform, or confirm the source field). The "Next unmapped" accelerator button provides the explicit advance path for power users who want speed.

---

## Verification Strategy

- **Unit tests** for `useExpressionBuilder` hook: verify `loadExpression()` triggers decomposition and state hydration on target change. Cover success (Value, Conditional, ValueMap modes) and failure (falls back to Editor mode).
- **Unit tests** for expression generation with inline branch expressions: ensure `generateExpressionFromState()` correctly handles `BranchValue.type === 'expression'`.
- **Component tests** for `ScalarFieldBuilder`: verify builder state resets on `selectedTargetPath` prop change; verify existing rule expression is loaded; verify empty state for unmapped fields.
- **Component tests** for `BranchValueSelector`: verify "Build expression" option renders inline mini-builder; verify generated sub-expression flows into the parent conditional expression.
- **Component tests** for `ConditionRowEditor`: verify "Transform..." on left operand opens inline builder; verify composed left operand flows into condition generation.
- **Component tests** for Apply behavior: verify Apply does not trigger navigation; verify "Next unmapped" button triggers navigation; verify Direct Copy does not trigger navigation.
- **Component tests** for navigation guard integration: verify guard fires on target switch with unapplied changes; verify "Apply & Continue" applies then loads new target.
- **Integration test** for full round-trip: select mapped target -> builder loads -> edit -> Apply -> select different target -> loads new configuration.
- **Typecheck and lint** must pass across all touched files.

Map to acceptance examples:
- AE-01, AE-02, AE-03, AE-04, AE-05: State hydration tests.
- AE-06, AE-07, AE-14: Conditional branch expression tests.
- AE-08, AE-09: Navigation reset and guard tests.
- AE-10, AE-11, AE-12: Apply/advance behavior tests.
- AE-13: Editor mode loading test.

---

## Task Generation Notes

This spec decomposes into 5 tasks:

1. **Implement builder state hydration on target field selection** (ui-task) -- Wire `decomposeExpression()` into the target-selection lifecycle via `useExpressionBuilder`. When `selectedTargetPath` changes, look up the existing rule expression, decompose it, and hydrate builder state. Handle decomposition failure (fallback to Editor mode + warning). Handle unmapped fields (empty state). Ensure both Builder and Editor mode receive the loaded expression. This is the core mechanism for Fix 1.

2. **Implement builder reset/load on target field navigation** (ui-task, depends T-01) -- Ensure the builder fully resets when the user navigates between target fields. Key the builder component or use explicit reset signals so stale state from the previous field is cleared before loading the new field. Integrate with navigation guard (FS-021 AE-05): when unapplied changes exist, fire the guard before resetting. Ensure the builder header updates to reflect the new field's metadata. Covers Fix 3.

3. **Add "Build expression" to conditional branches and condition operands** (ui-task, depends T-01) -- Extend `BranchValueSelector` with a `type: 'expression'` option that renders an inline mini-builder (SourceChipPicker + TransformPipeline). Extend `ConditionRowEditor` left operand with a "Transform..." option. Update expression generation to handle branch expressions. Update the decomposer to hydrate branch expressions when loading existing conditionals. Covers Fix 2.

4. **Remove auto-advance on Apply and add explicit "Next unmapped" accelerator** (ui-task) -- Remove the post-Apply navigation logic from `useMappingEditor` and `ScalarFieldBuilder`. Add "Applied" visual state to the Apply button after commit. Add a "Next unmapped -->" button as an explicit accelerator. Remove auto-advance from Direct Copy. Add `Ctrl+]` keyboard shortcut for the advance action. Covers Fix 4.

5. **Update architecture documentation** (task, depends T-01, T-02, T-03, T-04) -- Update `forge/architecture/ui-application.md` to document: the builder state hydration lifecycle on target selection, the conditional branch expression support (`BranchValue.type === 'expression'`), the removed auto-advance behavior, and the "Next unmapped" accelerator pattern. Update the Two-Tier Save Model section to remove the "focus advances to next unmapped field" statement. Update the Expression Builder Architecture section for the branch expression pattern.

Sequencing:
- T-01 is foundational (hydration mechanism).
- T-02 depends on T-01 (uses the hydration mechanism for navigation resets).
- T-03 depends on T-01 (needs hydration to load existing branch expressions).
- T-04 is independent (can be done in parallel with T-01/T-02/T-03).
- T-05 depends on all prior tasks.

---

## Change Log

- Rev 1 -- 2026-05-05
  - Initial draft
  - Q1 resolved same day: all apply-like actions (including Direct Copy) uniformly stay on current field. No auto-advance anywhere.
