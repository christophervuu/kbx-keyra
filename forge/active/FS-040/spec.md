# SPEC

## Title

Builder Panel Validation, Unsaved Diff Review, and Assistive Actions

---

## ID

FS-040

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-09
Last Updated: 2026-05-09
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 1

---

## Summary

Add continuous two-level validation, a pinned feedback area, an unsaved-changes diff view, and a redesigned assistive action row to the Builder panel in the Mapping Editor. The goal is to give non-technical mapping authors immediate, understandable feedback about what they are building, what it produces, and whether it is valid — while keeping the surface low-friction and aligned with KeyRa's progressive disclosure, explainability, and no-auto-commit-AI principles.

---

## Problem

The Builder panel today has limited feedback:

1. **Validation is shallow and late.** `useDslValidation` only runs the engine parser (`parse()`) on the expression string. It checks syntax and function arity but does not check whether the expression is structurally complete as a Builder construct (e.g., missing source, incomplete condition tree, no else branch) or whether the output type matches the target property type. Validation feedback only gates the Apply button; there is no persistent, visible validation status area.

2. **No output type checking.** A user can author an expression that resolves to a number for a target field that expects a string. Nothing in the Builder warns about this mismatch — it only appears later as a diagnostic in the engine `validate()` pipeline (KEYRA-E005), disconnected from the authoring context.

3. **No unsaved diff review.** The editor tracks `unsavedRuleCount` and exposes `saveStatus`, but there is no way for the user to see *what* has changed between the current draft and the last saved state. For BAs reviewing their work before saving, this is a significant gap in confidence.

4. **Assistive actions are placeholders.** The Suggest, Explain, and Fix buttons are disabled with a "Coming soon" tooltip. The Clear button is contextual to mapped status only. The suggested-sources row is a heuristic that does not align with the future Suggest action direction.

5. **No persistent feedback area.** The Expression and Result displays live inside `UnifiedExpressionBuilder` and are not visible in Editor mode. There is no single, stable location where the user can always see what expression they have built, what it evaluates to, and whether it is valid.

---

## Goal

After this change:

- The Builder panel provides continuous, two-level validation (structural completeness + output type compatibility) while the user is authoring, not only at save time.
- A pinned feedback area near the top of the Builder always shows the current expression summary, evaluated result, and validation status — regardless of Builder/Editor mode.
- Structural validation issues block Apply and Save with clear, BA-friendly messages. Output type mismatches are surfaced clearly near the result display and also block Save.
- The user can view unsaved changes as a human-readable diff before saving, comparing the current draft against the last saved state.
- The assistive action row is redesigned with forward-looking Suggest, Explain, Fix, and Clear/Reset semantics, removing the old suggested-sources row.
- All AI suggestions remain suggestion-only — no auto-commit.

---

## Assumptions

- The engine `parse()` and `evaluate()` APIs remain stable and are available synchronously in the browser.
- The engine `validate()` type inference model (`validate/type-inference.ts`, `validate/type-compatibility.ts`) can be reused or adapted for single-expression output-type checking against a known target type.
- `UnifiedExpressionBuilder` state model (`ExpressionBuilderState`) is stable and can be inspected for structural completeness without requiring a new parsing pass.
- The two-tier save model (Apply → Save) from FS-021 remains unchanged. This spec adds feedback *around* that model, not changes to the model itself.
- AI backend endpoints (FS-031 `invokeAI`) are not yet wired to the UI. This spec defines the action semantics and UI surface but does not implement actual AI calls — actions remain disabled with revised placeholder behavior until backend integration is complete.
- `MappingConfig` is available in the editor state via `useMappingEditor` for deriving the "last saved" baseline for diff comparison.

---

## Current Context

### Builder Panel Layout (current)

The `ScalarFieldBuilder` component is the right-panel surface for scalar target field authoring. Its current layout from top to bottom:

1. **Header** — target path, type badge, required/optional label, mapping status, Builder|Editor toggle
2. **Suggested Sources** — heuristic `suggestSourceFields()` pills (hidden when empty)
3. **Expression Area** — `UnifiedExpressionBuilder` (builder mode) or `RawDslEditor` (editor mode) with DnD drop zone
4. **Action Row** — disabled AI buttons (Suggest/Explain/Fix) + conditional Clear + spacer + Next unmapped + Apply

### Validation (current)

- `useDslValidation(expression)` runs `parse()` with 300ms debounce. Returns `isValid` (syntax only), `errorDecorations`, `diagnostics`.
- `isValid` gates the Apply button together with `isDirty` and `expression.trim().length > 0`.
- No structural completeness checks against Builder state.
- No output-type-vs-target-type check.

### Expression & Result Display (current)

- `LiveExpressionDisplay` and `LiveResultDisplay` are rendered *inside* `UnifiedExpressionBuilder` as always-visible sections.
- They are not visible when the user is in Editor mode.
- They are not rendered in `ScalarFieldBuilder` at the top level.

### Save Model (current)

- Two-tier: Apply (local rule upsert) → Save (persist all to adapter).
- `useMappingEditor` tracks `unsavedRuleCount`, `saveStatus`, and `canNavigateAway()`.
- `EditorTopBar` shows `unsavedCount` badge.
- No capability to view what specifically changed.

### AI Actions (current)

- Three disabled placeholder buttons with "Coming soon" tooltip.
- `Clear` is a destructive action visible only when `currentStatus === 'mapped'`.
- Backend AI runtime is architected (FS-031 `ai-runtime.md`) but not yet wired to UI surfaces.

---

## Scope

### In Scope

1. **Two-level validation model** — structural validation of Builder state + output type validation against target field type.
2. **Pinned feedback area** — persistent section in `ScalarFieldBuilder` showing Summary (optional), Expression, Result, and Validation Status, visible in both Builder and Editor modes.
3. **Validation status display** — distinct indicators for structural validity and output type validity within the feedback area.
4. **Error/warning taxonomy** — a defined set of BA-friendly validation messages for the Builder UX (not new engine error codes).
5. **Assistive action row redesign** — remove suggested-sources row, redefine Suggest/Explain/Fix/Clear semantics and UI, keep actions disabled as placeholders with improved contextual descriptions.
6. **Unsaved diff capability** — a "View unsaved changes" action that shows a human-readable comparison of the current draft vs. last saved state for the selected target property.
7. **Accessibility** — ARIA attributes, keyboard navigation, and screen reader considerations for all new surfaces.
8. **Architecture update** — update `ui-application.md` to reflect the new Builder panel model.

### Out of Scope

- Actual AI endpoint integration (backend calls to Suggest/Explain/Fix Lambdas). FS-031 defines the runtime; wiring to UI is a future spec.
- Changes to the two-tier save model (Apply/Save mechanics).
- Changes to `RuleList` (Rules View) validation or expression builder surfaces.
- Changes to `ObjectSummaryPanel` or `ArrayMappingBuilder` panels.
- Engine-level changes to the `validate()` pipeline or diagnostic codes.
- Full mapping-level diff (this spec covers per-target-property diff only; full mapping diff is a natural follow-on).
- Auto-save behavior.

---

## Non-Goals

- This spec is not building a full type system for the Builder. Output type inference is best-effort, consistent with the engine's existing type inference model.
- This spec is not implementing real AI suggestions. Actions are defined semantically for future integration but remain disabled.
- This spec is not replacing the engine's validation pipeline. Builder-level validation is a complementary UI-layer concern that operates on Builder state, not on engine internals.
- This spec is not adding mapping-level diff or version-history-level diff. The diff surface here is scoped to the selected target property's current draft vs. last saved rule.

---

## Relevant Areas

- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx` — primary component being modified
- `ui/src/features/mappings/components/UnifiedExpressionBuilder.tsx` — Builder state source
- `ui/src/features/mappings/components/LiveExpressionDisplay.tsx` — relocated/reused
- `ui/src/features/mappings/components/LiveResultDisplay.tsx` — relocated/reused
- `ui/src/features/mappings/hooks/use-dsl-validation.ts` — existing validation hook
- `ui/src/features/mappings/hooks/use-mapping-editor.ts` — save state, rule access
- `ui/src/features/mappings/lib/expression-builder-state.ts` — Builder state types
- `ui/src/features/mappings/lib/pipeline-expression-generator.ts` — expression generation
- `ui/src/features/mappings/hooks/use-expression-preview.ts` — result evaluation
- `ui/src/features/mappings/components/TargetFieldRow.tsx` — TargetFieldType/TargetFieldStatus types
- `src/engine/validate/type-inference.ts` — engine type inference (reference)
- `src/engine/validate/type-compatibility.ts` — engine type compatibility (reference)
- `forge/architecture/ui-application.md` — architecture document to update

---

## Dependencies / Blockers

- Depends on current Builder/Editor mode architecture from FS-023, FS-025, FS-027, FS-029, FS-030 being stable.
- AI action integration depends on FS-031 (shared AI runtime) being available — but this spec does not depend on FS-031 for its deliverables since actions remain disabled placeholders.

---

## Constraints

- Must preserve existing Builder/Editor mode toggle behavior.
- Must preserve the two-tier save model (Apply → Save) without modification.
- Must not add runtime dependencies to the UI (Phase 0 constraint).
- All validation must remain client-side and synchronous (or debounced with engine `parse()`/`evaluate()`).
- AI actions must never auto-commit. User must explicitly accept any suggestion.
- Must remain accessible: ARIA roles, keyboard navigable, screen-reader-friendly validation messages.
- Must work at desktop-first minimum width (1024px).
- TypeScript strict mode. Zero lint/typecheck errors.

---

## Proposed Behavior

### 1. Validation Model

#### 1.1 Structural Validation

Structural validation checks whether the Builder expression is complete and valid *as a Builder construct*, independent of whether the resulting DSL expression would parse successfully.

**When it runs:** Continuously, derived from `ExpressionBuilderState` on every state change (no debounce needed — this is pure state inspection, not engine invocation).

**What it checks (by mode):**

| Mode | Check | Error key | Message |
|---|---|---|---|
| Value | No source selected and no static value entered | `missing_source` | "Select a source field or enter a static value" |
| Value | Transform step has unfilled required arguments | `incomplete_transform` | "Complete all arguments for {functionName}" |
| Conditional | Missing condition (no condition rows) | `missing_condition` | "Add at least one condition" |
| Conditional | Condition row missing left operand | `incomplete_condition` | "Select a value for the left side of the condition" |
| Conditional | Condition row missing right operand | `incomplete_condition` | "Select a value for the right side of the condition" |
| Conditional | Missing then-branch value | `missing_then` | "Provide a value for the THEN branch" |
| Conditional | Missing else-branch value | `missing_else` | "Provide a value for the ELSE branch" |
| Value Map | No source selected for value map input | `missing_source` | "Select a source field for the value map" |
| Value Map | Missing default/fallback case | `missing_default` | "Provide a default value for unmatched cases" |
| Value Map | Empty mapping rows | `empty_map_rows` | "Add at least one mapping row" |
| All | Expression is empty | `empty_expression` | "Build an expression to map this field" |

**Structural validation does not apply in Editor mode.** In Editor mode, the user is writing raw DSL — `useDslValidation` (parse-level) is the relevant check.

**Effect:** Structural issues set `structureValid = false`. This blocks Apply. A brief, contextual message is shown in the validation status area.

#### 1.2 Output Type Validation

Output type validation checks whether the expression's resulting value type is compatible with the selected target property's schema type.

**When it runs:** After the expression is generated and parsed successfully. Uses the engine's `inferExpressionType()` utility (adapted from `validate/type-inference.ts`) to infer the output type of the parsed AST, then compares against `selectedTargetType`.

**Type compatibility rules (aligned with engine):**

| Target type | Compatible output types |
|---|---|
| `string` | `string`, `unknown` |
| `number` | `number`, `integer`, `unknown` |
| `integer` | `integer`, `number` (widening accepted with warning), `unknown` |
| `boolean` | `boolean`, `unknown` |
| `array` | `array`, `unknown` |
| `object` | `object`, `unknown` |
| `null` | any (null is always compatible) |

When inference returns `unknown` (cannot determine type), no mismatch is reported — consistent with the engine's "cannot prove mismatch → skip" philosophy.

**Effect:** Type mismatch sets `outputTypeValid = false`. A clear message is shown near the Result display: "Expression produces {inferred type} but target expects {target type}". This blocks Save but not Apply, to allow the user to continue working on the expression while seeing the warning. (See Open Questions Q1 for discussion.)

#### 1.3 Validation in Editor Mode

In Editor mode, structural validation is not applicable. Output type validation runs identically — the expression is parsed and type-inferred the same way. `useDslValidation` continues to provide parse-level syntax checks.

#### 1.4 Combined Validation State

The Builder exposes a combined validation state:

```typescript
interface BuilderValidationState {
  structureValid: boolean;
  structureIssues: readonly BuilderValidationIssue[];
  outputTypeValid: boolean;
  outputTypeMismatch: OutputTypeMismatch | null;
  canApply: boolean;   // structureValid && parseValid && expression non-empty
  canSave: boolean;    // canApply && outputTypeValid
}

interface BuilderValidationIssue {
  key: string;         // e.g., 'missing_source', 'incomplete_transform'
  message: string;     // BA-friendly message
  severity: 'error';   // structural issues are always blocking
}

interface OutputTypeMismatch {
  inferredType: string;
  targetType: string;
  message: string;
}
```

### 2. Pinned Feedback Area

A new persistent section is added to `ScalarFieldBuilder`, positioned between the Header and the Expression Area (replacing the Suggested Sources row).

**Layout:**

```
┌─────────────────────────────────────────────────┐
│ Header (target path, type, status, mode toggle) │
├─────────────────────────────────────────────────┤
│ Pinned Feedback Area                            │
│ ┌─────────────────────────────────────────────┐ │
│ │ Expression    source("Amount")              │ │
│ │ Result        42.50                         │ │
│ │ Validation    ✓ Structure  ✓ Output type    │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ Expression Area (Builder or Editor content)      │
├─────────────────────────────────────────────────┤
│ Action Row                                      │
└─────────────────────────────────────────────────┘
```

**Contents:**

| Row | Content | Behavior |
|---|---|---|
| Expression | Syntax-highlighted DSL expression (reuses `LiveExpressionDisplay` rendering) | Always visible. Shows the generated expression in Builder mode, the typed expression in Editor mode. Empty state: italic placeholder. |
| Result | Evaluated result value (reuses `LiveResultDisplay` rendering logic) | Always visible. Shows the live-evaluated result when source data is loaded. Empty state: "Load test data to see results". Error state: shows evaluation error. |
| Validation | Two status badges: Structure (✓/✗) and Output Type (✓/✗) | Structure badge shows green check when `structureValid`, red X with first issue message when invalid. Output Type badge shows green check when `outputTypeValid`, amber warning with mismatch message when invalid. |

**Behavior notes:**
- The pinned feedback area is always visible, never collapsed, and is not scrollable independently — it is part of the fixed header area.
- `LiveExpressionDisplay` and `LiveResultDisplay` are removed from *inside* `UnifiedExpressionBuilder` and rendered in this feedback area instead. The Builder content area gains vertical space.
- In Editor mode, the Expression row shows the raw expression from the editor. In Builder mode, it shows the generated expression from state.
- The Validation row is compact: two inline badges. Clicking a failed badge scrolls to or highlights the relevant issue in the builder (if applicable).
- When no expression has been entered, the validation row shows a neutral state (no badges, or muted text "Enter an expression to validate").

### 3. Error/Warning Taxonomy for Builder UX

Builder validation messages are separate from engine diagnostic codes. They are BA-friendly, context-specific, and do not expose engine internals.

| Category | Severity | User-facing pattern | Example |
|---|---|---|---|
| Structural — missing input | Error (blocks Apply) | "Select a {what}" / "Enter a {what}" | "Select a source field or enter a static value" |
| Structural — incomplete step | Error (blocks Apply) | "Complete {what}" | "Complete all arguments for substring" |
| Structural — missing branch | Error (blocks Apply) | "Provide a value for {branch}" | "Provide a value for the ELSE branch" |
| Output type mismatch | Warning (blocks Save) | "Expression produces {type} but target expects {type}" | "Expression produces number but target expects string" |
| Parse error | Error (blocks Apply) | Engine message (from `useDslValidation`) | "Unexpected token at position 15" |
| Parse warning | Warning (informational) | Engine message | "Unknown function name: fooBar" |

**Design principle:** Structural and output-type messages are authored for BAs. Engine parse messages pass through as-is because they are already user-facing in the editor overlay.

### 4. Assistive Action Row Redesign

The action row at the bottom of `ScalarFieldBuilder` is redesigned:

**Removed:** Suggested Sources row (the heuristic source pills between Header and Expression Area). This section is replaced by the Pinned Feedback Area.

**New action row layout:**

```
┌────────────────────────────────────────────────────────────────────┐
│ [✨ Suggest] [💡 Explain] [🔧 Fix] │ [Reset draft] │ ◄ │ [Apply] │
└────────────────────────────────────────────────────────────────────┘
```

| Action | Icon | Semantics | Enabled when | Tooltip (disabled) |
|---|---|---|---|---|
| **Suggest** | Sparkles | Generate or refine the expression for the current target field. Future: calls `suggest-expression` Lambda. | AI backend available + target field selected | "AI-powered expression suggestions — available in a future release" |
| **Explain** | Lightbulb | Explain the current draft expression in plain language. Future: calls `explain-rule` Lambda. | AI backend available + expression non-empty | "AI-powered explanation — available in a future release" |
| **Fix** | Wrench | Propose a fix for validation or logic issues. Future: calls `smart-fix` Lambda with current diagnostics as context. | AI backend available + validation issue present | "AI-powered fix suggestions — available in a future release" |
| **Reset draft** | RotateCcw | Clear the current in-progress expression and reset builder state to empty. Replaces the old "Clear" label. Does *not* delete the saved rule — it only resets the working draft. | Expression is non-empty OR builder state is dirty | — |

**Behavioral changes from current:**

- "Clear" is renamed to "Reset draft" to communicate that it resets the in-progress authoring state, not the saved mapping. The action resets expression to empty and builder state to default.
- "Clear mapping" (the red destructive action that deletes the saved rule) is renamed to "Remove mapping" and moved to a secondary position or overflow — it should not be visually co-located with Reset draft to avoid confusion. Implementation: render it as a small text link or secondary button below the action row, not inline.
- AI action tooltips are updated from "Coming soon" to more descriptive text that explains what the action will do.
- Fix button gains future contextual awareness: when validation issues exist, its tooltip will indicate it can address those specific issues.

### 5. Unsaved Diff Capability

#### 5.1 What the Diff Compares

The diff operates at the **per-target-property level**. For the currently selected target field, it compares:

| Side | Label | Source |
|---|---|---|
| Left (baseline) | "Last saved" | The rule from `useMappingEditor`'s last-saved `MappingConfig` for this target path. If no saved rule exists, baseline is "No mapping". |
| Right (current) | "Current draft" | The current expression in the builder/editor + the `ExpressionBuilderState` if in builder mode. If no expression, current is "No mapping". |

#### 5.2 Diff Representation

The diff is shown as a **human-readable side-by-side or stacked comparison** optimized for BAs, not a raw text diff.

**Recommended approach — Stacked summary diff:**

```
┌──────────────────────────────────────────────┐
│ Unsaved Changes for Order.Header.Amount      │
├──────────────────────────────────────────────┤
│ Last saved                                   │
│   Expression: source("InvoiceAmount")        │
│   Result type: number                        │
├──────────────────────────────────────────────┤
│ Current draft                                │
│   Expression: round(source("InvoiceAmount"), │
│               2)                             │
│   Result type: number                        │
├──────────────────────────────────────────────┤
│ What changed:                                │
│   • Expression modified — added rounding     │
│     transform                                │
│   • Result type: unchanged (number)          │
└──────────────────────────────────────────────┘
```

**Diff fields:**

| Field | Shown | Diff behavior |
|---|---|---|
| Expression (DSL string) | Always | Highlight text differences. If expressions differ, show both. If identical, show "No changes". |
| Inferred result type | When available | Show if type changed. |
| Status | When relevant | "New mapping" if no saved rule. "Mapping removed" if saved rule exists but current is empty. "Modified" if both exist and differ. "Unchanged" if identical. |

#### 5.3 Where the Diff is Shown

The diff is triggered by a "View unsaved changes" button/link, which opens an **inline expandable panel** within the Builder (below the Pinned Feedback Area, above the Expression Area). This avoids modal interruption and keeps the user in context.

Alternatively, it could be shown as a drawer or popover. The inline panel is recommended for lower friction.

#### 5.4 How it Interacts with Save and Discard

- **Save** — after saving, the diff would show "No unsaved changes" (baseline updates to match current).
- **Discard/Revert** — clicking "Revert to saved" in the diff panel restores the expression to the last-saved version, resetting builder state via decomposition.
- **No saved rule** — if the target has no saved mapping, the diff shows the current draft as entirely new.

#### 5.5 Data Source for Baseline

The "last saved" baseline comes from `useMappingEditor`'s persisted config. Specifically:
- On save, the mapping config is persisted via the adapter. The hook should expose a `getSavedRuleForTarget(targetPath): MappingRule | null` accessor (or the full saved config for comparison).
- This requires either caching the last-saved config in memory or re-reading it from the adapter. The recommended approach is to snapshot the config at last save time in the hook state.

### 6. Accessibility Implications

| Surface | Requirement |
|---|---|
| Validation badges | `role="status"`, `aria-live="polite"` for dynamic updates. Screen readers announce validation changes. |
| Validation messages | Associated with the relevant form control via `aria-describedby`. |
| Diff panel | `aria-expanded` on trigger button. Panel content is labelled (`aria-labelledby`). |
| Action buttons | `aria-disabled="true"` (not just `disabled`) for disabled AI actions, with descriptive `aria-label`. |
| Reset draft | Confirmation if expression is non-trivial (more than a simple source reference). `aria-label="Reset current draft expression"`. |
| Remove mapping | Confirmation dialog with `role="alertdialog"`. |
| Pinned feedback area | `role="region"`, `aria-label="Expression feedback"`. Expression and Result are `aria-live="polite"` regions. |
| Keyboard | Tab order: Header → Feedback area → Expression area → Action row. All interactive elements reachable via keyboard. |

### User Flow

1. User selects a target field → Builder loads (existing behavior).
2. **Pinned feedback area** immediately shows: empty expression placeholder, "Load test data" result placeholder, neutral validation state.
3. User begins building an expression → **expression updates live** in the feedback area. **Structural validation** runs on every state change. If issues exist, the Structure badge turns red and shows the first issue message.
4. Once expression is structurally complete → parse runs (debounced 300ms via `useDslValidation`). If parse succeeds → **output type inference** runs. If type mismatch → Output Type badge turns amber with mismatch message.
5. User can click **"View unsaved changes"** at any time to see the diff between current draft and last saved.
6. User clicks **Apply** (gated by structural + parse validity) → rule is applied locally.
7. User reviews the diff, sees the change, clicks **Save** in the top bar (gated by output type validity at save time).

### System Behavior

- `useBuilderValidation` hook is the new validation orchestrator. It accepts `ExpressionBuilderState`, `expression: string`, `targetType`, `mode`, and existing `useDslValidation` results. It returns `BuilderValidationState`.
- The hook is called in `ScalarFieldBuilder` and its results are passed to the pinned feedback area and used for Apply/Save gating.
- Expression and Result in the feedback area use the same `useExpressionPreview` and `LiveExpressionDisplay`/`LiveResultDisplay` rendering as today, but are rendered in `ScalarFieldBuilder` rather than inside `UnifiedExpressionBuilder`.

### Failure / Edge Behavior

| Scenario | Behavior |
|---|---|
| Empty expression | Structure badge neutral, no issues. Apply disabled. |
| Valid expression, no source data loaded | Result shows "Load test data to see results". Type inference still runs against the expression AST. |
| Expression parse error | Structure badge valid (Builder mode) or N/A (Editor mode). Parse error shown via `useDslValidation` decorations in the editor. Apply blocked. |
| Type inference returns `unknown` | Output Type badge shows green check (cannot prove mismatch). |
| User switches Builder → Editor mid-draft | Feedback area continues showing expression/result. Structural validation suspends (not applicable in Editor). Output type validation continues. |
| Diff for target with no saved rule | Diff shows "New mapping" — current draft only, no baseline. |
| Diff for target where user cleared expression | Diff shows "Mapping removed" if saved rule exists. |
| Reset draft when expression is trivial | Reset happens immediately, no confirmation. |
| Reset draft when expression is complex | Confirmation prompt: "Reset draft? Your current expression will be cleared." |

---

## Acceptance Examples

### AE-01 — Structural validation: missing source in Value mode

**Given**
- User selects a scalar target field and is in Builder > Value mode
- No source field is selected and no static value is entered

**When**
- Builder state is evaluated

**Then**
- Structure validation badge shows red X
- Message: "Select a source field or enter a static value"
- Apply button is disabled
- `data-testid="validation-structure-badge"` has `aria-label` containing "invalid"

### AE-02 — Structural validation: missing else branch in Conditional mode

**Given**
- User is in Conditional mode
- IF condition and THEN branch are filled
- ELSE branch is empty

**When**
- Builder state is evaluated

**Then**
- Structure badge shows red X with "Provide a value for the ELSE branch"
- Apply is disabled

### AE-03 — Output type mismatch

**Given**
- Target field type is `string`
- User enters expression `add(source("Price"), source("Tax"))` which resolves to `number`

**When**
- Expression is parsed and type-inferred

**Then**
- Output Type badge shows amber warning
- Message near Result: "Expression produces number but target expects string"
- Apply is enabled (structural and parse valid)
- Save is blocked until mismatch is resolved

### AE-04 — Pinned feedback area visibility in Editor mode

**Given**
- User is in Editor mode typing a raw DSL expression
- Source data is loaded

**When**
- User types `upper(source("Name"))`

**Then**
- Pinned feedback area shows:
  - Expression: `upper(source("Name"))` with syntax highlighting
  - Result: the evaluated uppercase value
  - Validation: Structure ✓ (N/A badge or hidden in Editor mode), Output Type ✓
- Feedback area is visible without scrolling

### AE-05 — View unsaved changes: modified expression

**Given**
- Target field `Order.Header.Amount` has a saved rule: `source("InvoiceAmount")`
- User has changed the expression to `round(source("InvoiceAmount"), 2)` and applied it

**When**
- User clicks "View unsaved changes"

**Then**
- Inline diff panel expands showing:
  - Last saved: `source("InvoiceAmount")`
  - Current draft: `round(source("InvoiceAmount"), 2)`
  - Status: "Modified"
- A "Revert to saved" button is available

### AE-06 — View unsaved changes: new mapping

**Given**
- Target field `Order.Header.Currency` has no saved mapping
- User has entered and applied `"USD"` (static value)

**When**
- User clicks "View unsaved changes"

**Then**
- Diff panel shows:
  - Last saved: "No mapping"
  - Current draft: `"USD"`
  - Status: "New mapping"

### AE-07 — Reset draft action

**Given**
- User has a non-trivial expression built (source + transform chain)

**When**
- User clicks "Reset draft"

**Then**
- Confirmation prompt appears: "Reset draft? Your current expression will be cleared."
- On confirm: expression resets to empty, builder state resets to default Value mode
- On cancel: no change

### AE-08 — AI action placeholder behavior

**Given**
- User has a valid expression and validation issues exist

**When**
- User hovers over the disabled "Fix" button

**Then**
- Tooltip reads: "AI-powered fix suggestions — available in a future release"
- Button has `aria-disabled="true"` and `aria-label="Fix — AI-powered fix suggestions, available in a future release"`

### AE-09 — Validation state transitions on mode switch

**Given**
- User is in Builder mode with a structurally valid expression
- Structure badge shows green ✓

**When**
- User switches to Editor mode

**Then**
- Structure badge becomes neutral/hidden (structural validation not applicable in Editor mode)
- Output Type badge remains visible and accurate
- Expression and Result in feedback area continue updating

### AE-10 — Remove mapping action

**Given**
- Target field has a saved mapping (`currentStatus === 'mapped'`)

**When**
- User clicks "Remove mapping"

**Then**
- Confirmation dialog: "Remove mapping for {targetPath}? This will delete the saved rule."
- On confirm: `onClearMapping(targetPath)` is called
- On cancel: no change

---

## Open Questions

- `Q1.` Should output type mismatch block Apply in addition to blocking Save? The current design allows Apply so the user can continue iterating, but this means an invalid-output expression can be applied to local state. If this causes confusion downstream (e.g., preview runs but shows unexpected type), it may be better to block Apply as well. **Recommendation: allow Apply, block Save — revisit if user confusion is observed.**

- `Q2.` Should the unsaved diff show a per-field view only, or should there also be a global "View all unsaved changes" action in the top bar (EditorTopBar)? This spec scopes to per-field. A global diff is a natural follow-on but may be more valuable.

- `Q3.` For the type inference utility — should we directly import and reuse `inferExpressionType` from `src/engine/validate/type-inference.ts` in the browser, or create a UI-side lightweight adapter? The engine code is already bundled into the UI via Vite alias, so direct import is feasible. **Recommendation: import via the `ui/src/lib/engine/` boundary, consistent with existing engine integration patterns.**

- `Q4.` When the user is in Builder mode and structural validation fails, should the generated expression still be shown in the feedback area (it may be partial/empty), or should the Expression row show a placeholder like "Complete the expression to see DSL output"? **Recommendation: show the partial expression if one exists, show placeholder if empty.**

- `Q5.` Should "Remove mapping" (the destructive delete-saved-rule action) be in the action row at all, or should it move to the header area or a context menu? Keeping it near Reset draft risks confusion between "reset my draft" and "delete the saved rule."

- `Q6.` For the `getSavedRuleForTarget` accessor needed by the diff — should `useMappingEditor` expose the last-saved config snapshot directly, or should the diff hook manage its own baseline from adapter reads?

---

## Verification Strategy

- **Unit tests** for `useBuilderValidation` hook covering all structural checks per mode (Value, Conditional, Value Map), output type inference integration, and combined state derivation. Maps to AE-01, AE-02, AE-03, AE-09.
- **Unit tests** for the diff comparison utility (expression diff, status derivation). Maps to AE-05, AE-06.
- **Component tests** for the pinned feedback area rendering in both Builder and Editor modes. Maps to AE-04.
- **Component tests** for the redesigned action row (Reset draft confirmation, Remove mapping confirmation, AI placeholder tooltips). Maps to AE-07, AE-08, AE-10.
- **Component tests** for the unsaved diff panel (expand/collapse, content accuracy, revert action). Maps to AE-05, AE-06.
- **Typecheck** — `pnpm tsc --noEmit` passes with zero errors.
- **Lint** — `pnpm lint` passes with zero errors.
- **Build** — `pnpm build` in `ui/` completes successfully.
- **Accessibility** — manual verification of ARIA attributes, keyboard navigation, and screen reader announcements for validation status changes.

---

## Task Generation Notes

This is a cross-cutting spec. Most tasks are UI tasks (`ui-task` agent) touching `ui/src/features/mappings/`. One architecture update task uses the `task` agent.

Recommended decomposition:

1. **T-01 (ui-task):** Validation model types + `useBuilderValidation` hook — define types, implement structural checks per mode, integrate output type inference via engine boundary, expose `BuilderValidationState`. This is the foundation for everything else.

2. **T-02 (ui-task):** Pinned feedback area component — extract `LiveExpressionDisplay`/`LiveResultDisplay` from `UnifiedExpressionBuilder`, create `BuilderFeedbackArea` component with Expression/Result/Validation rows, integrate into `ScalarFieldBuilder` layout. Depends on T-01 for validation state.

3. **T-03 (ui-task):** Wire validation to Apply/Save gating — update `ScalarFieldBuilder` to use `useBuilderValidation` for Apply button gating (replace current `isValid` check), wire `canSave` to the save flow (or expose it for parent consumption). Remove suggested-sources row.

4. **T-04 (ui-task):** Assistive action row redesign — rename Clear to "Reset draft" with confirmation logic, rename destructive Clear to "Remove mapping" with confirmation dialog and repositioning, update AI placeholder tooltips, update test IDs and ARIA attributes.

5. **T-05 (ui-task):** Unsaved diff capability — implement `useUnsavedDiff` hook (baseline from saved config, current from working state), create `UnsavedDiffPanel` component (inline expandable), wire "View unsaved changes" trigger and "Revert to saved" action into `ScalarFieldBuilder`.

6. **T-06 (task):** Architecture update — update `ui-application.md` to document the new Builder panel model: pinned feedback area, two-level validation, action row layout, unsaved diff pattern. Update INDEX.md date.

Sequencing: T-01 → T-02 → T-03 (sequential dependency chain). T-04 and T-05 can run in parallel after T-01. T-06 runs after all UI tasks.

---

## Change Log

- Rev 1 — 2026-05-09
  - Initial draft
