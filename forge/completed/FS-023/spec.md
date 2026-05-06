# SPEC

## Title

Expression Builder Redesign — Single-Form Multi-Mode Builder

---

## ID

FS-023

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

Rev: 2

---

## Summary

Replace the existing 4-step wizard (`GuidedBuilder`) with a single-form expression builder that shows all sections simultaneously (Source, Transform chain, Live Expression, Live Result) and supports three expression type modes: Value (default), Conditional, and Value Map. The redesigned builder eliminates unnecessary navigation friction, provides a composable transform pipeline UI, adds guided builders for conditionals and value maps, makes the Live Expression always visible, and ensures the builder panel works identically in both Target View and Rules View.

---

## Problem

The current Builder/Editor panel uses a 4-step wizard (Source -> Transform -> Arguments -> Preview) that has several UX issues:

1. **Too linear.** Real expression building isn't strictly sequential. Users may want to pick a transform first, then figure out source fields.
2. **Too many clicks.** A simple direct copy (`source("email")`) requires navigating through multiple steps when it should be 1 click.
3. **"Arguments" step is confusing.** The relationship between the source fields selected in Step 1 and the "arguments" in Step 3 is unclear. Users don't understand what goes where.
4. **"Preview" as a step is wrong.** Preview should be live/always-visible, not something the user navigates to.
5. **Inconsistent panel behavior.** The Builder/Editor panel only appears when in Target View. It should be available in both Target View and Rules View -- the user is editing the same rule regardless of how they navigated to it.
6. **No support for composable transforms.** Users building `substring(lower(trim(source("email"))), 13)` must understand nested function syntax. There's no visual way to chain transforms as a pipeline.
7. **Conditionals and Value Maps have no guided builder.** These common expression types require the user to switch to raw Editor mode.

---

## Goal

A single-form builder that:

- Shows Source, Transform chain, Live Expression, and Live Result sections simultaneously (no step navigation).
- Supports three expression type modes: Value (default), Conditional, and Value Map.
- Provides a "Direct Copy" shortcut that makes the ~50% of rules that are simple `source("field")` copies achievable in 1 click.
- Offers a chainable transform pipeline UI where each transform is a numbered step with auto-wired value parameters and editable additional parameters.
- Provides form-based guided builders for conditionals (`if()`) and value maps (`valueMap()`).
- Shows Live Expression always visible, updating in real-time.
- Shows Live Result when test data is loaded.
- Works identically in Target View and Rules View.
- Maintains lossless bidirectional sync with the raw Editor mode.

---

## Assumptions

- The existing `DSL_FUNCTION_CATALOG` in `ui/src/lib/data/dsl-functions.ts` provides all function metadata (parameters, types, required/optional) needed to drive the transform parameter forms dynamically.
- The existing `parse()` and AST types provide sufficient structure for decomposing existing expressions back into the new builder's state model.
- The `ExpressionBuilderPanel` (Rules View) and `ScalarFieldBuilder` (Target View) can share the same new builder component.
- The two-tier save model from FS-021 (Apply + Save) remains unchanged.
- The preview strip from FS-021 supplies test data for Live Result display.
- FS-022's layout changes (resizable panels, toolbar consolidation) are compatible with this builder redesign.

---

## Current Context

The expression builder is implemented as a 4-step wizard in `GuidedBuilder.tsx` with sub-components:
- `SourceFieldPicker.tsx` — Step 1: source field selection
- `TransformPicker.tsx` — Step 2: function selection from categorized list
- `ArgumentConfigurator.tsx` — Step 3: argument values
- `ExpressionPreviewStep.tsx` — Step 4: generated expression display
- `BuilderStepIndicator.tsx` — step navigation dots

Supporting infrastructure:
- `expression-generator.ts` — converts `BuilderState` (function name + arguments) to DSL string
- `ast-decomposer.ts` — converts DSL expression back to `BuilderState` for Editor->Builder transition
- `use-expression-builder.ts` — orchestration hook for mode toggle, expression state, decomposition

The builder is used in two contexts:
- **Target View:** embedded in `ScalarFieldBuilder.tsx` (right panel for scalar fields)
- **Rules View:** embedded in `ExpressionBuilderPanel.tsx` (right panel for any rule)

Key limitation: the current `BuilderState` model is a single function call with nested arguments — it cannot represent a chainable pipeline or express conditional/valueMap patterns without requiring the user to understand nesting.

---

## Scope

### In Scope

- New `UnifiedExpressionBuilder` component replacing `GuidedBuilder` in both `ScalarFieldBuilder` and `ExpressionBuilderPanel`.
- Three expression type modes (Value, Conditional, Value Map) selectable via tabs/segmented control.
- Value Mode: source chip picker with search, static value toggle, Direct Copy shortcut, chainable transform pipeline UI.
- Conditional Mode: form-based Boolean condition builder with comparison operators, then/else branches supporting static values, source fields, or inline mini-builders, and nested conditionals (else-if).
- Value Map Mode: source field picker, editable key-value mapping table, fallback value.
- Live Expression section: always visible, real-time update, clickable to switch to Editor mode.
- Live Result section: displays evaluated output when test data is loaded, "Load test data to see live results" when not.
- Transform pipeline UI: numbered steps, auto-wired first parameter, labeled additional parameter inputs derived from `DSL_FUNCTION_CATALOG`, drag-to-reorder, remove button.
- Function picker for transforms: categorized list with search, suggests relevant transforms based on source field type.
- New state model (`ExpressionBuilderState`) replacing `BuilderState` to support pipeline and modal patterns.
- New expression generator that converts the new state model to DSL.
- New decomposer that parses DSL expressions back into the new state model (or falls back to "Complex expression -- edit in Editor mode").
- Builder panel parity between Target View and Rules View.
- Bidirectional lossless sync between Builder and Editor modes.

### Out of Scope

- Changes to the raw DSL Editor (`RawDslEditor.tsx`) itself (only its integration point changes).
- AI action buttons behavior (remain as disabled placeholders).
- Array mapping builder changes (remains as separate `ArrayMappingBuilder`).
- Changes to the Inline Preview Strip or Advanced Testing page.
- DSL language changes — the form generates existing DSL syntax.
- Keyboard shortcut for advancing to next unmapped field after Apply (that's FS-021 behavior, already implemented).
- Changes to the function catalog data structure (`dsl-functions.ts`).

---

## Non-Goals

- This spec does not introduce a new DSL syntax or expression language.
- This spec does not implement AI-powered expression suggestion (buttons remain placeholders).
- This spec does not change the Apply/Save model or the panel layout/sizing.
- This spec does not add new DSL functions to the engine.
- This spec does not redesign the source panel or target worklist.

---

## Relevant Areas

- `ui/src/features/mappings/components/GuidedBuilder.tsx` (replaced)
- `ui/src/features/mappings/components/SourceFieldPicker.tsx` (replaced/refactored)
- `ui/src/features/mappings/components/TransformPicker.tsx` (replaced/refactored)
- `ui/src/features/mappings/components/ArgumentConfigurator.tsx` (replaced)
- `ui/src/features/mappings/components/ExpressionPreviewStep.tsx` (replaced)
- `ui/src/features/mappings/components/BuilderStepIndicator.tsx` (removed)
- `ui/src/features/mappings/components/ConditionBuilder.tsx` (replaced with new Conditional mode)
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx` (integration update)
- `ui/src/features/mappings/components/ExpressionBuilderPanel.tsx` (integration update)
- `ui/src/features/mappings/lib/expression-generator.ts` (replaced with new pipeline generator)
- `ui/src/features/mappings/lib/ast-decomposer.ts` (replaced with new decomposer)
- `ui/src/features/mappings/hooks/use-expression-builder.ts` (refactored for new state model)
- `ui/src/features/mappings/types.ts` (new types)
- `ui/src/lib/data/dsl-functions.ts` (consumed, not modified)
- `ui/src/features/mappings/index.ts` (barrel updates)
- `forge/architecture/ui-application.md` (architecture update)

---

## Dependencies / Blockers

- Depends on FS-021 (completed) — defines the panel width (50%), Apply/Save model, preview strip integration, and `ScalarFieldBuilder` contract.
- Depends on FS-011 (completed) — established the original expression builder architecture.
- DSL Specification (`specs/KEYRA-DSL-SPECIFICATION.md`) — defines function signatures that drive the parameter form fields.
- FS-022 (in progress) — toolbar consolidation and resizable panels. This spec should be compatible but not dependent on FS-022 landing first; the builder component itself is panel-content-agnostic.

---

## Constraints

- The form must support all DSL functions defined in the DSL specification via the `DSL_FUNCTION_CATALOG`.
- All expression types must produce valid KeyRa DSL — the form is a structured interface to DSL generation, not a separate language.
- The Builder <-> Editor sync must be lossless. Switching between modes preserves the expression.
- The [Apply] button follows the two-tier save model from FS-021 (applies rule to working session, does not persist).
- Transform parameters must be derived from the `DSL_FUNCTION_CATALOG` function signatures — each function's parameter names, types, and required/optional status drive the form fields dynamically.
- Live Result requires test data to be loaded in the preview strip (from FS-021). If no test data is loaded, the Live Result section shows "Load test data to see live results."
- The form must handle expressions that were written in raw Editor mode (or generated by AI) gracefully — parse them back into the form structure where possible, or show "Complex expression -- edit in Editor mode" if the structure doesn't map cleanly to the form.
- TypeScript strict mode, zero lint/typecheck/test errors.
- Desktop-first, minimum 1024px viewport.

---

## Proposed Behavior

### User Flow

**Mode Selection:** At the top of the builder panel, a segmented control offers three expression type tabs: **Value** (default) | **Conditional** | **Value Map**. Selecting a mode reconfigures the form below. If the user has an in-progress expression and switches modes, a confirmation dialog warns about losing current work.

**Value Mode (default):**

1. **Source section:** A chip-based multi-select with a search input to pick source fields from the parsed source schema. A "Use a static value instead" toggle switches to a text/number/boolean input. When exactly 1 source field is selected and no transforms are added, a **"Direct Copy"** shortcut button appears. Clicking Direct Copy **auto-applies** the rule immediately (fires `onApply` with `source("fieldPath")`), shows a brief toast confirmation ("Direct copy applied"), and advances focus to the next unmapped target field. No separate Apply click is needed.
2. **Transform section:** Below the source section, a **transform pipeline** displays as a vertical list of numbered steps. Initially empty. The user clicks **[+ Add Transformation]** to open the function picker (categorized: String, Date & Time, Math, Conditional, Lookup, Array, Null Handling, Type Conversion — with search). After selecting a function, a new step appears showing: step number, function name, auto-wired value parameter (from previous step output or source), and editable additional parameter inputs (labeled, typed, with required/optional indicators). Each step can be drag-reordered or removed (x button). The first parameter of each transform is always auto-filled from the previous step's output — it is displayed as a **labeled read-only field** (e.g., `value: <- from source` or `value: <- from step 1`) with a grayed-out/locked style, maintaining visual consistency with other parameter fields while being clearly non-editable. Additional parameters (e.g., `start`, `end` for `substring`; `search`, `replacement` for `replaceAll`) appear as labeled editable input fields.
3. **Live Expression:** Always visible below the transform chain. Updates in real-time as form fields change. Shows the generated DSL string. Clickable — clicking it switches to Editor mode with the expression pre-filled.
4. **Live Result:** Below the expression. If test data is loaded in the preview strip, shows the actual evaluated output value. If not, shows "Load test data to see live results."

**Conditional Mode:**

1. **Condition section:** A form-based Boolean builder with: left operand (source field picker or expression input), comparison operator dropdown (equals, not equal, greater than, less than, greater or equal, less or equal, contains, is null, is not null), right operand (typed input, source field, or expression). For compound conditions, **[+ Add condition]** appends another row within the same logical group. Each condition group enforces a single logical operator (AND or OR) — all conditions in a group share the same operator, selected via an AND/OR toggle above the group. To mix AND/OR logic, the user creates a **nested group** (e.g., "ALL of: [condition A, ANY of: [condition B, condition C]]"), which generates clean unambiguous DSL: `and(condA, or(condB, condC))`.
2. **Then branch:** a value selector that can be: static value input, source field picker, or "Build expression..." that opens an inline mini-builder (same Source + Transform UI, nested within the branch).
3. **Else branch:** same options as Then, plus an additional option to "Add else-if condition" which nests another conditional (recursive). The form supports up to **5 else-if levels** (6 total branches). Beyond 5 levels, an info message reads: "For more than 5 conditions, consider using a Value Map or switch to Editor mode."
4. **Live Expression and Live Result:** Same as Value mode.

**Value Map Mode:**

1. **Input Value:** Source field picker (single select).
2. **Mapping Table:** Editable key-value rows with headers "When value is..." and "Map to...". Each row is an input pair. **[+ Add row]** appends a new empty row. Rows can be removed.
3. **Fallback:** A value input for the default case, or a "return null" checkbox/option.
4. **Live Expression and Live Result:** Same as Value mode.

**Shared across all modes:**

- The Builder/Editor panel renders identically whether the user is in Target View or Rules View.
- **[Builder | Editor]** toggle remains. Both modes produce the same DSL expression and sync bidirectionally.
- AI action buttons (**Suggest**, **Explain**, **Fix**) remain at the bottom as disabled placeholders.
- **[Apply]** button at the bottom-right. Enabled when the expression is non-empty and valid.

**Direct Copy fast path:** User selects a source field -> clicks "Direct Copy" -> rule is auto-applied (fires `onApply`), toast shows "Direct copy applied", focus advances to the next unmapped target field. This is the zero-friction path for simple field copying (estimated ~50% of rules). The two-tier save model means this is not persisted until the user explicitly Saves — if they made a mistake, they can click the target field again and overwrite.

### System Behavior

**State Model:** The new builder uses an `ExpressionBuilderState` discriminated union:

```typescript
type ExpressionBuilderState =
  | { mode: 'value'; sources: SourceSelection[]; transforms: TransformStep[]; }
  | { mode: 'conditional'; condition: ConditionGroup; thenBranch: BranchValue; elseBranch: BranchValue; }
  | { mode: 'valueMap'; inputSource: string; mappings: ValueMapEntry[]; fallback: FallbackValue; };
```

**Expression Generation:** A new `generateExpressionFromState(state: ExpressionBuilderState): string` pure function converts the state model to a DSL expression string. For Value mode, it wraps source fields in transform functions as a nested pipeline (innermost = source, outermost = last transform). For Conditional mode, it generates `if(condition, then, else)` with nested `if()` for else-if chains. For Value Map mode, it generates `valueMap(source("field"), { "key": "value", ... }, fallback)`.

**Expression Decomposition:** A new `decomposeExpression(expression: string): DecompositionResult` function parses a DSL expression and attempts to map it into the `ExpressionBuilderState` model. It **auto-detects the expression type mode** from the outer function structure: `if()` outer call -> Conditional mode, `valueMap()` outer call -> Value Map mode, pipeline of transforms wrapping `source()` -> Value mode. If decomposition fails (unsupported nesting, unknown patterns), it returns `{ success: false, reason: "..." }` and the UI shows "Complex expression -- edit in Editor mode." For expressions that don't cleanly map to any mode but are simple enough to represent (e.g., a single `source()` call), the decomposer defaults to Value mode.

**Transform Parameter Derivation:** When a transform function is selected, its parameter form fields are derived from `DSL_FUNCTION_CATALOG`. The first parameter (typically named `value`) is auto-wired from the pipeline's previous step output and displayed as read-only. Remaining parameters are rendered as editable input fields with labels from `parameter.name`, type hints from `parameter.type`, and required/optional indicators from `parameter.required`.

**Function Picker Intelligence:** When suggesting transforms, the picker prioritizes functions whose first parameter type matches the current pipeline output type. For example, if the source is a date string, Date & Time functions appear first. The full categorized list remains accessible.

**Mode toggle (Builder <-> Editor):**
- Builder -> Editor: generate expression string from current state and populate the raw editor.
- Editor -> Builder: run decomposition. On success, hydrate the builder state and **auto-switch to the detected mode** (Value, Conditional, or Value Map). On failure, remain in Editor mode and show the complex expression warning banner.

**Panel parity:** `ScalarFieldBuilder` (Target View) and `ExpressionBuilderPanel` (Rules View) both render the same `UnifiedExpressionBuilder` component. The only difference is the header/wrapper — `ScalarFieldBuilder` adds the target field header and suggested sources section above the builder.

### Failure / Edge Behavior

- **Decomposition failure:** When switching from Editor to Builder, if the expression can't be decomposed, the UI stays in Editor mode and shows "Complex expression -- edit in Editor mode" banner. User can still edit in raw mode.
- **Invalid parameters:** Transform parameter inputs validate on blur. Invalid values show inline error messages (red text below the input). The Live Expression still generates what it can, marking invalid parts. Apply button is disabled while validation errors exist.
- **Empty source selection:** If no source fields are selected and no static value is set, the Live Expression shows empty state text: "Select a source field or enter a static value to begin."
- **Mode switch with unsaved work:** Switching expression type mode (Value/Conditional/Value Map) when there's an in-progress expression shows a confirmation: "Switching modes will reset the current expression. Continue?" with Confirm/Cancel.
- **No test data for Live Result:** Shows muted text: "Load test data to see live results." with a link/hint to the preview strip.
- **Transform with 0 additional parameters:** Functions like `upper`, `lower`, `trim` only have the auto-wired value parameter. The step shows just the function name and the auto-wired source — no additional fields needed.
- **Variadic parameters:** Functions like `concat` with variadic parameters show an initial set of fields plus an [+ Add argument] button to append more.
- **Drag reorder constraints:** The first transform step always receives from the source section. Reordering updates the auto-wiring display but does not change the auto-wire semantics (each step receives from its predecessor).

---

## Acceptance Examples

### AE-01 -- Direct Copy shortcut (auto-apply)

**Given**
- The builder is in Value mode.
- The user selects exactly one source field: `email`.
- No transforms are added.

**When**
- The user clicks the "Direct Copy" button.

**Then**
- `onApply` is fired immediately with expression `source("email")`.
- A brief toast/flash confirmation shows: "Direct copy applied".
- Focus advances to the next unmapped target field in the worklist.

### AE-02 -- Transform pipeline with two steps

**Given**
- The builder is in Value mode.
- The user selects source field: `email`.
- The user adds transform: `trim` (step 1).
- The user adds transform: `lower` (step 2).

**When**
- Both transforms are added to the pipeline.

**Then**
- The Live Expression displays `lower(trim(source("email")))`.
- Step 1 shows: "1. trim" with value parameter showing "source('email')" (read-only).
- Step 2 shows: "2. lower" with value parameter showing "output of step 1" (read-only).

### AE-03 -- Transform with additional parameters

**Given**
- The builder is in Value mode.
- The user selects source field: `code`.
- The user adds transform: `substring`.

**When**
- The substring step appears with parameters.

**Then**
- The step shows: "1. substring" with:
  - `value`: read-only, auto-wired from `source("code")`
  - `start`: editable number input, labeled "start", marked required
  - `end`: editable number input, labeled "end", marked optional
- After entering start=0, end=3, Live Expression shows: `substring(source("code"), 0, 3)`.

### AE-04 -- Conditional mode basic usage

**Given**
- The builder is switched to Conditional mode.
- The user sets left operand to source field `status`.
- The user selects operator "equals".
- The user sets right operand to static value `"active"`.
- The user sets Then branch to static value `"Yes"`.
- The user sets Else branch to static value `"No"`.

**When**
- All fields are filled.

**Then**
- The Live Expression displays: `if(eq(source("status"), "active"), "Yes", "No")`.

### AE-05 -- Conditional mode with nested else-if

**Given**
- The builder is in Conditional mode.
- Primary condition: source("priority") equals "high".
- Then: static "1".
- Else: user clicks "Add else-if condition".
- Nested condition: source("priority") equals "medium".
- Nested Then: static "2".
- Nested Else: static "3".

**When**
- All fields are filled.

**Then**
- The Live Expression displays: `if(eq(source("priority"), "high"), "1", if(eq(source("priority"), "medium"), "2", "3"))`.

### AE-15 -- Compound condition with nested group (mixed AND/OR)

**Given**
- The builder is in Conditional mode.
- Primary condition group is set to "ALL of" (AND).
- First condition: source("amount") greater than 1000.
- User adds a nested group (ANY of / OR) containing:
  - source("channel") equals "web"
  - source("channel") equals "mobile"
- Then branch: static "approved".
- Else branch: static "pending".

**When**
- All fields are filled.

**Then**
- The Live Expression displays: `if(and(gt(source("amount"), 1000), or(eq(source("channel"), "web"), eq(source("channel"), "mobile"))), "approved", "pending")`.

### AE-06 -- Value Map mode

**Given**
- The builder is switched to Value Map mode.
- Input source: `country`.
- Mapping rows: "US" -> "United States", "GB" -> "United Kingdom".
- Fallback: "Unknown".

**When**
- All fields are filled.

**Then**
- The Live Expression displays: `valueMap(source("country"), {"US": "United States", "GB": "United Kingdom"}, "Unknown")`.

### AE-07 -- Live Result with test data

**Given**
- The builder has expression: `lower(source("email"))`.
- Test data is loaded in the preview strip with `{ "email": "JOHN@EXAMPLE.COM" }`.

**When**
- The Live Result section evaluates.

**Then**
- The Live Result shows: `"john@example.com"`.

### AE-08 -- Live Result without test data

**Given**
- The builder has a valid expression.
- No test data is loaded in the preview strip.

**When**
- The builder renders.

**Then**
- The Live Result section shows: "Load test data to see live results."

### AE-09 -- Editor to Builder decomposition (success with mode auto-detect)

**Given**
- The user is in Editor mode with expression: `upper(trim(source("name")))`.

**When**
- The user switches to Builder mode.

**Then**
- The builder populates in **Value mode** (auto-detected from pipeline structure) with:
  - Source: `name` field selected
  - Transform step 1: `trim` (value auto-wired from source)
  - Transform step 2: `upper` (value auto-wired from step 1)

### AE-16 -- Editor to Builder decomposition (conditional auto-detect)

**Given**
- The user is in Editor mode with expression: `if(gt(source("amount"), 100), "high", "low")`.

**When**
- The user switches to Builder mode.

**Then**
- The builder populates in **Conditional mode** (auto-detected from `if()` outer call) with:
  - Condition: source("amount") greater than 100
  - Then: static "high"
  - Else: static "low"

### AE-10 -- Editor to Builder decomposition (failure)

**Given**
- The user is in Editor mode with expression: `concat(source("first"), " ", if(isNull(source("middle")), "", concat(source("middle"), " ")), source("last"))`.

**When**
- The user switches to Builder mode.

**Then**
- The UI stays in Editor mode.
- A banner shows: "Complex expression -- edit in Editor mode."

### AE-11 -- Builder panel parity (Rules View)

**Given**
- The user is in Rules View.
- The user selects a rule with expression `source("email")`.

**When**
- The right panel loads the expression builder.

**Then**
- The same `UnifiedExpressionBuilder` component renders with the same modes, sections, and behavior as in Target View.
- The Builder/Editor toggle, mode tabs, and Apply button are all present.

### AE-12 -- Transform pipeline reorder

**Given**
- The pipeline has 3 steps: trim (1), lower (2), substring (3).

**When**
- The user drags step 2 (lower) to position 3.

**Then**
- The pipeline becomes: trim (1), substring (2), lower (3).
- Auto-wiring updates: each step receives from its predecessor.
- Live Expression updates to reflect the new nesting order: `lower(substring(trim(source("email")), 0, 5))`.

### AE-13 -- Mode switch confirmation

**Given**
- The builder is in Value mode with source `email` selected and transform `trim` added.

**When**
- The user clicks the "Conditional" mode tab.

**Then**
- A confirmation dialog appears: "Switching modes will reset the current expression. Continue?"
- Clicking "Continue" clears the Value mode state and switches to Conditional mode.
- Clicking "Cancel" stays in Value mode with existing state preserved.

### AE-14 -- Static value in Value mode

**Given**
- The builder is in Value mode.
- The user toggles "Use a static value instead."

**When**
- The user enters `"default@example.com"` as the static value.

**Then**
- The source chip picker is hidden.
- The Live Expression shows: `static("default@example.com")`.

---

## Open Questions

- none

### Resolved Decisions (from Rev 1 questions)

- **Direct Copy auto-applies** (was Q1): Clicking Direct Copy fires `onApply` immediately, shows a toast confirmation, and advances focus. The user's intent is unambiguous for a simple `source("field")` copy. The two-tier save model ensures nothing is persisted until explicit Save.
- **Labeled read-only field for auto-wired parameter** (was Q2): The first parameter displays as `value: <- from source` (or `value: <- from step N`) in a labeled, grayed-out field. This makes data flow explicit without requiring users to interpret a new visual metaphor.
- **Compound conditions are grouped (enforced)** (was Q3): Each condition group shares a single logical operator (AND or OR). To mix operators, users create nested groups (e.g., "ALL of: [A, ANY of: [B, C]]"). This prevents operator precedence ambiguity and generates clean DSL (`and(a, or(b, c))`).
- **Mode auto-detection on load** (was Q4): The decomposer detects expression type from AST structure (`if()` -> Conditional, `valueMap()` -> Value Map, pipeline -> Value). Fallback for undecomposable expressions: stay in Editor mode with warning.
- **5-level cap for else-if chains** (was Q5): The form allows up to 5 else-if levels (6 total branches). Beyond 5 levels, an info message nudges toward Value Map mode or raw Editor. This covers the vast majority of real conditional logic while keeping the UI readable.
- **"Recently used" functions deferred** (was Q6): Out of scope. The categorized list with search is sufficient for v1. Revisit based on user feedback.

---

## Verification Strategy

- **Unit tests** for `generateExpressionFromState()` covering all three modes and edge cases (AE-01 through AE-06, AE-14).
- **Unit tests** for the new `decomposeExpression()` covering successful decomposition (AE-09) and failure cases (AE-10).
- **Component tests** for `UnifiedExpressionBuilder` covering mode selection, source picking, transform pipeline CRUD, and Live Expression updates.
- **Component tests** for `TransformPipelineStep` covering parameter rendering from catalog, auto-wiring display, drag-reorder, and removal.
- **Component tests** for `ConditionalBuilder` covering condition rows, operator dropdown, then/else branches, and nested else-if.
- **Component tests** for `ValueMapBuilder` covering row CRUD, fallback, and expression generation.
- **Component tests** for `LiveExpressionDisplay` and `LiveResultDisplay` covering real-time updates and empty states (AE-07, AE-08).
- **Integration tests** for Editor <-> Builder mode sync (decomposition success and failure).
- **Component tests** for panel parity: both `ScalarFieldBuilder` and `ExpressionBuilderPanel` render `UnifiedExpressionBuilder` (AE-11).
- **Typecheck and lint** must pass across all touched files.

---

## Task Generation Notes

This spec decomposes into 8 tasks:

1. **Define new state model and expression generator** (task) — Create the new `ExpressionBuilderState` type system and the `generateExpressionFromState()` pure function. This is the foundational data layer with no UI. Covers Value mode pipeline generation, Conditional mode `if()` generation, and Value Map mode `valueMap()` generation.

2. **Implement new expression decomposer** (task) — Create the new `decomposeExpression()` function that parses DSL expressions into `ExpressionBuilderState`. Must handle pipeline detection (nested single-param transforms), conditional detection (`if()` outer call), and value map detection (`valueMap()` outer call). Covers decomposition success/failure and mode auto-detection.

3. **Build UnifiedExpressionBuilder shell and Value mode source section** (ui-task, depends T-01) — Create the new `UnifiedExpressionBuilder` component with mode tabs, the source chip picker with search, static value toggle, and Direct Copy shortcut. Wire expression generation for source-only expressions.

4. **Build transform pipeline UI** (ui-task, depends T-01, T-03) — Implement `TransformPipeline` component with numbered steps, function picker integration, auto-wired first parameter, dynamic additional parameter inputs from catalog, drag-to-reorder (react-style state reorder, not DnD library), and remove. Wire to expression generator.

5. **Build Conditional mode UI** (ui-task, depends T-01, T-03) — Implement `ConditionalModeBuilder` with condition rows (left operand, operator dropdown, right operand), compound conditions (AND/OR), then/else branches (static value, source field, or inline mini-builder), and nested else-if support. Wire to expression generator.

6. **Build Value Map mode UI** (ui-task, depends T-01, T-03) — Implement `ValueMapModeBuilder` with input source picker, editable key-value table, fallback value, and [+ Add row]. Wire to expression generator.

7. **Build Live Expression and Live Result displays + integrate into ScalarFieldBuilder and ExpressionBuilderPanel** (ui-task, depends T-02, T-03, T-04, T-05, T-06) — Implement `LiveExpressionDisplay` (always visible, real-time, clickable to switch to Editor) and `LiveResultDisplay` (evaluates via `useExpressionPreview` when test data present). Replace `GuidedBuilder` usage in `ScalarFieldBuilder` and `ExpressionBuilderPanel` with `UnifiedExpressionBuilder`. Wire mode toggle (Builder <-> Editor) through the new decomposer. Ensure panel parity between Target View and Rules View.

8. **Update ui-application.md architecture** (task, depends T-07) — Reflect the new builder component hierarchy, state model, expression generation/decomposition patterns, and updated hook contracts in `forge/architecture/ui-application.md`.

Sequencing: T-01 and T-02 are independent and can be parallelized. T-03 depends on T-01. T-04, T-05, T-06 depend on T-01 and T-03 and can be parallelized. T-07 depends on all UI tasks. T-08 depends on T-07.

---

## Change Log

- Rev 2 -- 2026-05-04
  - Resolved all 6 open questions with decisions:
    - Direct Copy now auto-applies (fires onApply immediately + toast + focus advance) — AE-01 updated
    - Labeled read-only field confirmed for auto-wired parameter display
    - Compound conditions enforced as grouped (single operator per group, nested groups for mixing) — AE-15 added
    - Mode auto-detection confirmed: decomposer detects Value/Conditional/ValueMap from AST — AE-16 added
    - 5-level cap for else-if nesting with info message nudging to Value Map or Editor
    - "Recently used" functions confirmed out of scope
  - Added AE-15 (compound condition with nested group)
  - Added AE-16 (conditional mode auto-detection from Editor)
  - Updated Proposed Behavior sections to reflect resolved decisions
  - Moved Open Questions to "Resolved Decisions" section
- Rev 1 -- 2026-05-04
  - Initial draft
