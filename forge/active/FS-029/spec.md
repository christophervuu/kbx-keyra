# SPEC

## Title

Source Card Expression Builder — Flexible Multi-Input Transformation UX

---

## ID

FS-029  

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-05-06  
Last Updated: 2026-05-06  
Type: ui

---

## Status

approved

---

## Revision

Rev: 2

---

## Summary

Redesign the Value mode of the UnifiedExpressionBuilder to use a "Source Card" model where users start by selecting source fields (direct copy by default), can add transformations inline within a source card, and can combine multiple sources via a connector function. This replaces the current pipeline model that locks the first argument and makes multi-input functions (concat, formatDate, add) awkward to configure.

---

## Problem

The current Value mode uses a linear pipeline where source fields are selected first, then a transform is added with the first parameter auto-wired (locked) to the selected source. This works well for unary transforms (`upper`, `trim`, `lower`) but breaks down for multi-input functions:

1. **`concat(a, b, ...)`** — The first argument is locked to the selected source. Users cannot add another source field as a subsequent argument; they can only type literal strings.
2. **`formatDate(value, inputFormat, outputFormat)`** — Works passably (source fills `value`, user types format strings) but the parameter labels don't guide the user on what format tokens are valid.
3. **`add(a, b)` / `subtract(a, b)`** — Both arguments might be source fields, but only the first can be.
4. **Argument purpose is unclear** — The current `TransformPipelineStep` shows parameter names and freeform text inputs without contextual guidance on what values are expected.

Users have no way to easily express "take two source fields and combine them" or "transform this source with these specific configuration values" in a way that makes the arguments self-documenting.

---

## Goal

Provide an expression builder UX where:
- Direct copy (single source, no transform) is the default and simplest path.
- Adding a transformation to a source is an inline, in-context action within the source card.
- Multi-input functions let the user fill each argument independently with a source field, literal value, or nested expression.
- Multiple standalone source cards can be connected together via a combining function.
- Each argument slot clearly communicates what it expects (name, type, valid values).

---

## Assumptions

- The `DSL_FUNCTION_CATALOG` structure (parameters, types, variadic flag, examples) remains stable and is the source of truth for argument metadata.
- The underlying expression generation (`generateExpressionFromState`, `generateExpression`) remains compatible with the new builder state shape.
- The Conditional mode and Value Map mode of the UnifiedExpressionBuilder are not affected by this change.
- The existing `TransformPipeline` and `TransformPipelineStep` components will be superseded by the new design.

---

## Current Context

The UnifiedExpressionBuilder (FS-023) has three modes: Value, Conditional, and Value Map. The Value mode currently uses:

- **`SourceChipPicker`** — select one or more source fields as chips, or enter a static value.
- **`TransformPipeline`** — an ordered list of transform steps. Each step auto-wires its first parameter from the previous step's output (locked, read-only with a 🔒 icon). Additional parameters are shown as freeform inputs.
- **`TransformPipelineStep`** — renders a single step card with the locked first param and editable additional params.
- **`TransformFunctionPicker`** — dropdown/popover to select which function to add.

State is tracked via `ValueModeState` which holds `sources: SourceSelection[]` and `transforms: TransformStep[]`. Expression generation wraps the first source through the transform chain sequentially.

Key files:
- `ui/src/features/mappings/components/UnifiedExpressionBuilder.tsx`
- `ui/src/features/mappings/components/TransformPipeline.tsx`
- `ui/src/features/mappings/components/TransformPipelineStep.tsx`
- `ui/src/features/mappings/components/TransformFunctionPicker.tsx`
- `ui/src/features/mappings/components/SourceChipPicker.tsx`
- `ui/src/features/mappings/lib/expression-builder-state.ts`
- `ui/src/features/mappings/lib/pipeline-expression-generator.ts`
- `ui/src/lib/data/dsl-functions.ts` (catalog with parameter metadata)

---

## Scope

### In Scope

- Redesign of the Value mode builder UX to use the Source Card model.
- New "Source Card" component with inline transformation capability.
- New "Argument Slot" design that supports source-picker, literal-input, and dropdown modes per slot.
- Known-value dropdowns/suggestions for specific parameters (format tokens for `formatDate`, type options for `cast`, etc.).
- Multi-source connector UX: when multiple source cards exist without a wrapping function, prompt the user to select a combining function.
- State model changes to support the new builder shape.
- Expression generation from the new state model.
- Inline parameter labels, type badges, and example hints from the catalog.

### Out of Scope

- Conditional mode changes.
- Value Map mode changes.
- Changes to the DSL engine or function registry.
- New DSL functions or parameters.
- Array mode (map/filter) builder changes (existing ObjectTemplateBuilder/ConditionBuilder remain as-is for now).
- The old GuidedBuilder (already superseded by UnifiedExpressionBuilder).

---

## Non-Goals

- This is not a full visual drag-and-drop expression editor.
- This does not introduce a node-graph or visual programming paradigm.
- This does not change how expressions are stored or evaluated.

---

## Relevant Areas

- `ui/src/features/mappings/components/UnifiedExpressionBuilder.tsx`
- `ui/src/features/mappings/components/TransformPipeline.tsx` (to be replaced)
- `ui/src/features/mappings/components/TransformPipelineStep.tsx` (to be replaced)
- `ui/src/features/mappings/components/TransformFunctionPicker.tsx` (may be reused)
- `ui/src/features/mappings/components/SourceChipPicker.tsx` (may be adapted)
- `ui/src/features/mappings/lib/expression-builder-state.ts` (state model changes)
- `ui/src/features/mappings/lib/pipeline-expression-generator.ts` (generation changes)
- `ui/src/lib/data/dsl-functions.ts` (consumed for parameter metadata, possibly extended with hint data)

---

## Dependencies / Blockers

- none

---

## Constraints

- Must preserve existing Direct Copy behavior (single source, no transform → `source("path")`).
- Must produce valid DSL expressions that pass engine validation.
- Must work within the existing ScalarFieldBuilder / UnifiedExpressionBuilder layout.
- Generated expressions must be decomposable back into builder state (round-trip for editing existing rules).
- Must remain accessible (keyboard navigation, screen reader labels).

---

## Proposed Behavior

### User Flow

#### Path 1: Direct Copy (unchanged)
1. User selects a single source field.
2. No transformation is added.
3. Result: `source("path")` — applied directly.

#### Path 2: Single Source + Transformation
1. User selects a source field → a **Source Card** appears showing the field path.
2. Within the Source Card, user clicks **[+ Add Transformation]**.
3. A function picker appears (categorized, searchable — same as current TransformFunctionPicker).
4. User selects a function (e.g. `formatDate`).
5. The Source Card expands to show an **Argument Form** for the selected function:
   - The first argument slot is pre-filled with the card's source field (but **editable**, not locked).
   - Remaining argument slots are shown with:
     - Parameter name label (e.g. "inputFormat")
     - Type badge (e.g. `string`)
     - Input control appropriate to the parameter:
       - Freeform text for generic strings/numbers
       - Dropdown with suggestions for known-value parameters (format tokens, types)
       - Source field picker toggle for arguments that accept source references
     - Placeholder/hint text from the catalog example
6. User fills arguments → expression updates live.
7. Result: `formatDate(source("createdAt"), "ISO8601", "YYYY-MM-DD")`

#### Path 3: Multi-Input via Transformation Form (top-level Add Transformation)
1. The empty builder state shows two distinct buttons at the top-left: **[+ Add Source]** and **[+ Add Transformation]**. These are peer actions — Add Transformation is NOT inside a source card.
2. User clicks **[+ Add Transformation]**.
3. Function picker appears → user selects `concat`.
4. An **Argument Form** for `concat` appears (no source card wrapping it — it IS the top-level):
   - Each argument slot can independently be set to:
     - **Source mode**: shows a source field picker inline
     - **Literal mode**: shows a text/number input
   - For variadic functions, a **[+ Add value]** button appends slots.
   - Argument slots support inline nested transforms (e.g. user can pick a source, then add a transform to it within that slot — producing `upper(source("a"))` as an argument value).
5. User adds `source("firstName")`, literal `" "`, `source("lastName")`.
6. Result: `concat(source("firstName"), " ", source("lastName"))`

#### Path 4: Multiple Sources → Automatic Connector Prompt
1. User adds a source field → Source Card 1 appears.
2. User adds another source field → Source Card 2 appears.
3. Since there are now 2+ standalone source cards with no wrapping function, the UI **automatically** shows a **Connector Prompt** between/below the cards (no explicit trigger needed):
   - "How should these be combined?"
   - Dropdown with compatible combining functions: `concat`, `coalesce`, `add`, etc.
   - Optional: separator/parameter inputs depending on the selected function.
4. User selects `concat` with separator `" "`.
5. The two source cards merge into a single `concat` Argument Form.
6. Result: `concat(source("firstName"), source("lastName"), " ")`

### System Behavior

- **State model**: `ValueModeState` is updated to represent the new builder shape. A Source Card is a node that optionally wraps a function call. The top-level state is either:
  - A single source (direct copy)
  - A single source with an inline transformation
  - A function call with independently-configured arguments (some of which may be sources, literals, or nested expressions with their own transforms)
  
- **Argument slot nesting**: Each argument slot in an Argument Form can hold a plain source, a literal, or a source-with-transform (e.g. `upper(source("a"))`). This enables compositions like `concat(upper(source("a")), source("b"))` to be fully authored in the builder without falling back to raw DSL mode.

- **Empty state layout**: When the builder is empty (no source selected, no transformation chosen), two peer buttons are shown at the top-left: **[+ Add Source]** and **[+ Add Transformation]**. Once a source or transformation is added, the builder transitions to the appropriate state.
  
- **Expression generation**: The generator reads the new state shape and produces the corresponding DSL string. No intermediate pipeline chaining — the function and all its arguments are assembled directly.

- **Catalog-driven hints**: For each parameter, the system looks up:
  - `parameter.name` → label
  - `parameter.type` → type badge and input control type
  - Known enums (extended `ENUM_OPTIONS` or new `PARAMETER_HINTS` map) → dropdown suggestions
  - `entry.example` → shown as hint text on the form

- **Format token derivation (programmatic)**: Format token suggestions for `formatDate` (and any future token-based parameters) are derived programmatically from the engine's supported token set. The engine exports its `TOKENS` constant (currently: `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss` plus the special `ISO8601` keyword). The UI reads this exported list rather than maintaining a separate curated static list. A `PARAMETER_HINTS` registry maps `(functionName, parameterName)` → hint source, and for `formatDate.inputFormat` / `formatDate.outputFormat` the hint source is the engine token list.

- **Round-trip decomposition**: Existing expressions can be decomposed back into the new state shape for editing. The pipeline decomposer is updated or replaced to produce Source Card state. Nested expressions within argument slots (e.g. `upper(source("a"))` as an arg to `concat`) are decomposed recursively into nested argument slot state.

### Failure / Edge Behavior

- **No source selected, no function selected**: Empty state with guidance text ("Select a source field or add a transformation to begin").
- **Function selected but required arguments missing**: The Apply/Preview button is disabled. Unfilled required arguments show a subtle validation indicator.
- **Incompatible connector**: If the user has two source cards with incompatible types for the selected connector (e.g. two string sources with `add`), show an inline type-mismatch warning but don't block (the engine will produce a diagnostic).
- **Removing a source from a connector**: If a multi-source connector is reduced to one source, the connector dissolves back into a single Source Card with optional transformation.

---

## Acceptance Examples

### AE-01 — Direct Copy (single source, no transform)

**Given**
- The Value mode builder is open.
- No source fields are selected.

**When**
- User selects source field `order.customerName`.

**Then**
- A Source Card appears showing `order.customerName`.
- The card has a `[+ Add Transformation]` action.
- The generated expression is `source("order.customerName")`.
- User can apply directly.

### AE-02 — Single source with formatDate transformation

**Given**
- A Source Card for `order.createdAt` is shown.

**When**
- User clicks `[+ Add Transformation]` on the card.
- User selects `formatDate` from the function picker.

**Then**
- The card expands to show an Argument Form for `formatDate`.
- Argument 1 (`value`) is pre-filled with `source("order.createdAt")` and is editable.
- Argument 2 (`inputFormat`) shows label "inputFormat", type badge "string", and a dropdown with format token suggestions derived programmatically from the engine (ISO8601, YYYY, MM, DD, HH, mm, ss, and common compositions like YYYY-MM-DD).
- Argument 3 (`outputFormat`) shows label "outputFormat", type badge "string", and a dropdown with the same engine-derived format token suggestions.
- When user selects `ISO8601` for inputFormat and types `YYYY-MM-DD` for outputFormat, the generated expression is `formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD")`.

### AE-03 — Concat via transformation form (multi-source inside)

**Given**
- The Value mode builder is open with empty state (showing [+ Add Source] and [+ Add Transformation] buttons).

**When**
- User clicks `[+ Add Transformation]` (top-level button, distinct from any source card).
- User selects `concat`.
- User sets slot 1 to source mode → picks `firstName`.
- User sets slot 2 to literal mode → types `" "`.
- User sets slot 3 (via [+ Add value]) to source mode → picks `lastName`.

**Then**
- The generated expression is `concat(source("firstName"), " ", source("lastName"))`.

### AE-04 — Multiple sources trigger automatic connector prompt

**Given**
- A Source Card for `order.firstName` exists.

**When**
- User adds a second source field `order.lastName`.

**Then**
- A second Source Card appears.
- A Connector Prompt is **automatically** shown (no user trigger needed) asking "How should these be combined?"
- The prompt offers function options (at minimum: `concat`, `coalesce`).

**When (continued)**
- User selects `concat` from the connector.

**Then**
- The two source cards merge into a `concat` Argument Form.
- The generated expression is `concat(source("order.firstName"), source("order.lastName"))`.
- User can add more values or a separator via `[+ Add value]`.

### AE-05 — Argument slot with known-value dropdown (cast)

**Given**
- User has selected `cast` as the transformation.

**When**
- The Argument Form for `cast` is displayed.

**Then**
- Argument 1 (`value`) shows a source picker (pre-filled if source card existed).
- Argument 2 (`targetType`) shows a dropdown with options: `string`, `number`, `boolean`.
- No freeform text input is shown for `targetType` — only the dropdown.

### AE-06 — Removing transformation returns to source card

**Given**
- A Source Card for `order.email` has an inline `upper` transformation applied.

**When**
- User removes the transformation (X button or similar).

**Then**
- The card returns to its base state showing just `order.email` with `[+ Add Transformation]`.
- The generated expression reverts to `source("order.email")`.

### AE-07 — Nested transform within an argument slot

**Given**
- User has created a `concat` transformation via the top-level [+ Add Transformation] button.
- Slot 1 is set to source mode with `firstName` selected.

**When**
- User adds a transform to slot 1 (e.g. clicks a mini transform action on that slot).
- User selects `upper`.

**Then**
- Slot 1 now shows `upper(source("firstName"))` as its value.
- The full generated expression is `concat(upper(source("firstName")), ...)` (with remaining slots).
- The nested transform is visually indicated within the slot (e.g. a badge or nested card).

---

## Open Questions

All questions from Rev 1 have been resolved:

- `Q1.` ~~Should the connector prompt appear automatically when a second source is added, or should the user explicitly trigger "combine" mode?~~ **Resolved:** The connector prompt appears automatically when a second source is added. No explicit trigger needed.
- `Q2.` ~~For the "transform-first" path (Path 3), should there be a separate button at the top level distinct from the source card's `[+ Add Transformation]`?~~ **Resolved:** Yes. A separate **[+ Add Transformation]** button lives at the top-left, distinct from any source card. On an empty builder, two buttons are shown: **[+ Add Source]** and **[+ Add Transformation]**.
- `Q3.` ~~Should argument slots support inline nested transforms?~~ **Resolved:** Yes. Argument slots support inline nested transforms, enabling compositions like `concat(upper(source("a")), source("b"))` to be built visually.
- `Q4.` ~~Should format token suggestions be a curated static list or derived programmatically?~~ **Resolved:** Derived programmatically from the engine's supported tokens. The engine exports `TOKENS` (`YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`) and the special `ISO8601` keyword. The UI consumes this export.

---

## Verification Strategy

- Unit tests for new Source Card component rendering and interaction.
- Unit tests for Argument Form rendering with different parameter types (freeform, dropdown, source picker).
- Unit tests for connector prompt appearance and function selection.
- Unit tests for expression generation from new state model (all AE cases).
- Unit tests for round-trip: decompose existing expression → new state → regenerate expression.
- Integration test: full flow from empty → source selection → transform → apply produces valid DSL.
- Typecheck and lint pass on all new/modified files.
- Manual verification of keyboard accessibility and screen reader labels.

---

## Task Generation Notes

This is a `ui`-type spec. Decomposition:

1. **State model** — Define the new `ValueModeState` shape (Source Card node, Argument Form node, Connector node, nested argument slot with optional transform). Update `expression-builder-state.ts`.
2. **Source Card component** — New component with source display, `[+ Add Transformation]` action, inline Argument Form expansion.
3. **Argument Form component** — Renders parameter slots from catalog metadata. Each slot supports source/literal/dropdown modes and inline nested transforms. Driven by `DSL_FUNCTION_CATALOG` parameters.
4. **Parameter hints/suggestions data (programmatic)** — Export engine `TOKENS` + `ISO8601` for UI consumption. Create `PARAMETER_HINTS` registry mapping `(functionName, parameterName)` → hint source. Wire `formatDate` format params and `cast.targetType` to their respective hint sources.
5. **Connector Prompt component** — Appears **automatically** when 2+ standalone sources exist. Offers combining function selection. Merges cards into Argument Form.
6. **Empty state with dual buttons** — Implement the top-level [+ Add Source] and [+ Add Transformation] buttons as the empty-state entry point. Wire to source picker and function picker respectively.
7. **Expression generation** — Update `pipeline-expression-generator.ts` (or create new generator) to produce expressions from the new state shape, including nested argument expressions.
8. **Round-trip decomposition** — Update or create decomposer to parse existing expressions (including nested compositions) back into the new state model recursively.
9. **Integration into UnifiedExpressionBuilder** — Wire the new components into the Value mode, replacing TransformPipeline usage.
10. **Remove/deprecate old pipeline components** — Clean up TransformPipeline, TransformPipelineStep once new builder is stable.

Tasks should be sequenced: 1 → 2+3+4+6 (parallel) → 5 → 7 → 8 → 9 → 10.

---

## Change Log

- Rev 2 — 2026-05-06
  - Resolved all open questions (Q1–Q4).
  - Q1: Connector prompt appears automatically on second source addition.
  - Q2: Added top-level [+ Add Source] / [+ Add Transformation] dual-button empty state.
  - Q3: Argument slots now support inline nested transforms.
  - Q4: Format tokens derived programmatically from engine TOKENS export.
  - Added AE-07 (nested transform within argument slot).
  - Updated task decomposition to 10 tasks with revised sequencing.
- Rev 1 — 2026-05-06
  - Initial draft based on design exploration session.
