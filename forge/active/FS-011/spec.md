# SPEC

## Title

Mapping Editor — Expression Builder

---

## ID

FS-011

---

## Metadata

Owner: @keyra-ui-team
Reviewers: TBD
Created: 2026-05-01
Last Updated: 2026-05-01
Rev Updated: 2026-05-01
Type: ui

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Build Panel 4 of the Mapping Editor — the expression builder that enables users to construct DSL expressions through either a guided form mode (no syntax knowledge required) or a raw DSL text editor with syntax highlighting and autocomplete. Both modes produce identical DSL expression strings and can be toggled freely. The panel integrates with the rule editor (FS-010) to populate/edit the expression field of the selected rule, and with the source schema tree (FS-009) for field selection. All parsing, validation, and evaluation are client-side using the engine's `parse()` and `evaluate()` APIs.

---

## Problem

Users currently have no guided way to author DSL expressions. The rule editor (FS-010) accepts raw expression strings, but expects users to know DSL syntax. There is no syntax highlighting, no autocomplete, no inline validation feedback, and no guided builder for users unfamiliar with the DSL. This makes mapping authoring error-prone for new users and slow for power users who lack editor tooling.

---

## Goal

A dual-mode expression authoring panel that:
- Provides a guided step-by-step builder for users who don't know DSL syntax (covers the 80% common patterns)
- Provides a raw DSL text editor with syntax highlighting, autocomplete, inline validation, and bracket matching for power users
- Integrates seamlessly with the selected rule in Panel 3 (expression loads on rule select, updates propagate back)
- Integrates with the source schema tree (Panel 1) for click-to-insert field paths
- Shows a live expression preview with evaluated results when sample data is available
- Uses the engine's `parse()` for real validation (not regex heuristics)

---

## Assumptions

- FS-008 (UI Scaffold) is complete — provides routing, adapter, shared primitives, domain types
- FS-009 (Schema Tree View) is complete — provides `ParsedSchema`, `SchemaTreeNode` types, `parseJsonSchema()`/`parseXsd()` parsers, and `<SchemaTreeView />` component with `onSelectNode` callback
- FS-010 (Rule List & CRUD) is complete — provides `useMappingEditor()` hook with `updateRule()` action, `useEngineValidation()` hook, engine browser integration layer, and the `MappingEditorPage` multi-panel layout with Panel 4 slot
- The engine's `parse()` function is imported via `@keyra/engine` path alias and returns `ParseResult { success, ast, diagnostics }`
- The engine's `evaluate()` function and `EvaluationContext` are available for single-expression preview evaluation
- The engine's `FunctionRegistry` is available via `defaultRegistry` with `listFunctions()` and `getFunction()` for autocomplete metadata
- `useMappingEditor()` currently exposes `rules`, `updateRule(index, rule)`, `parsedSourceSchema`, and `validation` — the expression builder needs a "selected rule index" concept to be added or managed at the panel integration level
- Phase 0: no external state management libraries; no code editor libraries unless bundle impact is justified
- The raw editor uses a textarea with a synchronized overlay div for syntax highlighting (textarea + overlay pattern, as used by CodeMirror 5). The overlay sits on top with `pointer-events: none` and renders highlighted tokens while the textarea handles all input, cursor, and selection natively. This is simpler, more accessible, and avoids contenteditable cursor/selection issues.
- The guided builder does not need to support every DSL pattern — it covers direct copy, static, concat, cast, default, coalesce, if, valueMap, formatDate, map, filter, and math operations
- The guided builder can decompose expressions up to 3 levels of nesting when all functions are in the builder's supported set (~15 functions). This covers patterns like `default(upper(source("name")), "N/A")` (2 levels) and `if(gt(source("amount"), 1000), upper(source("tier")), static("Standard"))` (3 levels).
- Sample data for live preview is an optional dependency (FS-012 provides the test data context); the expression builder shows a placeholder when unavailable

---

## Current Context

The repository currently contains:

- `ui/src/features/mappings/components/MappingEditorPage.tsx` — multi-panel layout with Panel 4 slot rendering `<PanelPlaceholder name="Expression Builder (Panel 4)" />`
- `ui/src/features/mappings/hooks/use-mapping-editor.ts` — orchestration hook with `rules`, `updateRule(index, rule)`, `parsedSourceSchema`, `parsedTargetSchema`
- `ui/src/features/mappings/hooks/use-engine-validation.ts` — debounced validation hook returning diagnostics per rule
- `ui/src/features/mappings/lib/infer-rule-type.ts` — expression outer-function to display label mapping
- `ui/src/lib/engine/index.ts` — browser integration layer re-exporting `validate`, `execute`, `validateMapping`, `executeMapping` from `@keyra/engine`
- `ui/src/lib/types/domain.ts` — `SchemaTreeNode`, `ParsedSchema`, `MappingRule`, `MappingConfig` types
- `src/engine/dsl/index.ts` — `parse(expression, options?)` returning `ParseResult`
- `src/engine/dsl/evaluator.ts` — `evaluate(node, context)` returning `EvaluationResult`
- `src/engine/registry/function-registry.ts` — `FunctionRegistry` with `listFunctions()`, `getFunction(name)` returning `RegisteredFunction`
- `src/engine/types/registry.ts` — `FunctionSignature`, `FunctionParameter` with `name`, `type`, `required`, `variadic` fields

Per `forge/architecture/ui-application.md`:
- Feature code goes in `ui/src/features/mappings/`
- Engine access via `ui/src/lib/engine/` (single boundary)
- No cross-feature imports; shared code goes to `components/`, `hooks/`, or `lib/`
- TypeScript strict mode, zero lint errors
- Tailwind CSS 4 for styling
- Phase 0: no external state management libraries

Per `forge/architecture/mapping-engine.md`:
- `parse()` returns `{ success, ast, diagnostics }` with character-offset positions on all AST nodes
- `evaluate()` is pure and synchronous — safe to call in React hooks with debounce
- `FunctionSignature` contains parameter definitions (name, type, required, variadic) and return type
- The function registry is immutable after initialization and safe to read concurrently

---

## Scope

### In Scope

- Expression builder panel component (`ExpressionBuilderPanel`) for Panel 4 slot
- Mode toggle (Builder / Editor) with bidirectional switching
- **Raw DSL Editor:**
  - Syntax highlighting (function names, strings, numbers, booleans, null, paths, commas)
  - Context-aware autocomplete (function names with signatures, source field paths, constant names, external source names)
  - Inline validation via engine `parse()` (debounced 300ms, red underline + error tooltip)
  - Bracket matching (highlight matching parentheses)
  - Multi-line expression support
  - Keyboard shortcuts (Ctrl+Space autocomplete, Ctrl+Enter apply, Escape close dropdown)
- **Guided Builder:**
  - Step 1: Source field selection (click from tree or type with autocomplete, multi-field for concat)
  - Step 2: Transform function picker (categorized: String, Date, Math, Conditional, Lookup, Array, Null Handling, Type Conversion)
  - Step 3: Argument configuration (literal input, source field picker, enum dropdown, nested function recursion)
  - Step 4: Preview with generated DSL string and evaluated result
  - Direct copy shortcut (select field only → `source("path")`)
  - Static value shortcut (toggle → `static("value")`)
  - Array expression support: `map()` with object template, `filter()` with condition, `item()`/`parent()` in array context
- **Expression preview area** (below editor/builder):
  - Always shows final DSL expression string
  - Shows evaluated result if sample data is loaded (from FS-012 context)
  - Shows evaluation errors inline
  - Shows placeholder when no sample data
- **Function reference panel** (collapsible, searchable, click-to-insert)
- **Integration with FS-010 rule editor:**
  - Load selected rule's expression when rule is selected in Panel 3
  - Update rule expression on change (real-time with debounce preferred)
  - Empty state when no rule selected
- **Integration with FS-009 source schema tree:**
  - Click node in Panel 1 → insert `source("path")` at cursor (raw mode) or fill source field slot (guided mode)
  - Mini source field picker inline for quick access
- `useExpressionBuilder()` hook for expression state management
- `useExpressionPreview()` hook for live evaluation against sample data

### Out of Scope

- Full code editor library integration (Monaco/CodeMirror) — deferred unless the lightweight custom approach proves inadequate
- NL → DSL AI expression generation (Phase 2)
- Smart Fix AI expression replacement (Phase 2)
- Undo/redo history for the expression editor (potential Phase 2)
- Expression templates/snippets library
- Drag-and-drop from schema tree to expression builder (FS-011 uses click-to-insert)
- Panel 5 (Preview & Testing) implementation (FS-012) — this spec only consumes sample data context if available
- Schema tree panels (Panel 1/2) wiring beyond the click-to-insert integration point

---

## Non-Goals

- This spec does not implement the full Preview & Testing panel (FS-012) — only a preview area showing expression result
- This spec does not implement schema tree rendering — it consumes the existing `<SchemaTreeView />` and `ParsedSchema` from FS-009
- This spec does not create a general-purpose code editor component — it is DSL-specific
- This spec does not aim to support 100% of DSL patterns in the guided builder — complex/exotic nesting is handled via raw editor mode
- This spec does not implement collaborative editing or conflict resolution for expressions

---

## Relevant Areas

- `ui/src/features/mappings/components/` — ExpressionBuilderPanel, RawDslEditor, GuidedBuilder, ExpressionPreview, FunctionReference, AutocompleteDropdown
- `ui/src/features/mappings/hooks/` — useExpressionBuilder, useExpressionPreview, useDslAutocomplete, useDslValidation
- `ui/src/features/mappings/lib/` — dsl-tokenizer (syntax highlighting), ast-decomposer (editor→builder)
- `ui/src/features/mappings/components/MappingEditorPage.tsx` — Panel 4 slot replacement
- `ui/src/lib/data/dsl-functions.ts` — shared DSL_FUNCTION_CATALOG static data (cross-feature)
- `ui/src/lib/engine/index.ts` — additional re-exports needed (parse, evaluate, defaultRegistry, FunctionRegistry types)
- `ui/src/lib/types/domain.ts` — SchemaTreeNode, ParsedSchema consumed for autocomplete
- `src/engine/dsl/index.ts` — parse() API consumed via @keyra/engine
- `src/engine/dsl/evaluator.ts` — evaluate() API consumed via @keyra/engine
- `src/engine/registry/function-registry.ts` — listFunctions(), getFunction() for metadata
- `forge/architecture/ui-application.md` — architecture update for expression builder pattern

---

## Dependencies / Blockers

- Depends on FS-008 (UI Scaffold & App Shell) — **completed**
- Depends on FS-009 (Schema Tree View) — **completed** — provides ParsedSchema, SchemaTreeNode, onSelectNode callback
- Depends on FS-010 (Rule List & CRUD) — **completed** — provides useMappingEditor, useEngineValidation, engine integration layer, MappingEditorPage Panel 4 slot
- Soft dependency on FS-012 (Preview & Testing) for sample data context — expression preview shows placeholder until FS-012 provides data

---

## Constraints

- No backend dependency. All parsing, validation, and evaluation are client-side.
- Must work with FS-010's `useMappingEditor()` hook (selected rule, expression updates via `updateRule()`).
- Must use FS-009's `ParsedSchema` / `SchemaTreeNode` types for source field autocomplete.
- Must use the engine's `parse()` from `@keyra/engine` for real syntax validation (not just regex).
- Must use the engine's `evaluate()` for live expression preview (single-rule evaluation against sample data).
- Must use the engine's `FunctionRegistry` for function metadata (signatures, parameter names/types).
- TypeScript strict mode, zero lint/typecheck errors.
- Tailwind CSS 4 for styling.
- No external state management library (Phase 0 rules).
- No code editor library (Monaco/CodeMirror) unless bundle impact is documented and justified. A lightweight custom solution is the default for Phase 0.
- Validation debounce: 300ms after last keystroke.
- Desktop-first: 1280px+ target, 1024px minimum.
- Expression updates to rule state should be real-time with debounce (preferred per TTFSM optimization).
- Only syntactically valid expressions are committed to rule state. Empty string is committable (clearing is valid). Invalid in-progress edits stay in local state only, with a visual "not saved" indicator.
- The expression builder panel uses CSS `resize: vertical` with default height ~200px, min-height 120px, max-height 50vh.
- The guided builder covers the common 80% of patterns: direct copy, static, concat, cast, default, coalesce, if, valueMap, formatDate, map, filter, math operations. Complex nesting defers to raw editor.
- The guided builder decomposition supports up to 3 levels of function nesting with supported functions only. Beyond that → `canDecompose = false`.
- Bundle size impact should be measured and documented (baseline from FS-010: ~343 kB / 106 kB gzip).

---

## Proposed Behavior

### User Flow

1. **Select a rule** — User clicks a rule in Panel 3 (Rule List). The expression builder loads that rule's current expression. If the expression is parseable by the guided builder, Builder mode shows the decomposed steps. Otherwise, Editor mode is shown with the raw expression.

2. **Guided Builder flow (new/simple expressions):**
   - User sees Step 1: "Select source field." They click a field in Panel 1 (source schema tree) or use the inline field picker with autocomplete.
   - `source("selectedField.path")` is generated.
   - User optionally proceeds to Step 2: "Choose transform." A categorized picker shows available functions.
   - User selects a function (e.g., `concat`). Argument slots scaffold.
   - User fills argument slots (Step 3). Each slot accepts source fields, literals, or nested functions.
   - Step 4 shows the generated DSL string and (if sample data is loaded) the evaluated result.
   - The expression updates the selected rule in real-time as the user builds.

3. **Direct Copy shortcut** — User selects a source field and skips the transform step. Expression is `source("path")`. Done.

4. **Static Value shortcut** — User toggles "Static value" and types a literal. Expression is `static("value")`. Done.

5. **Raw Editor flow (complex/power-user expressions):**
   - User switches to Editor mode (or is shown it automatically for complex expressions).
   - Syntax highlighting colors the expression tokens.
   - User types; autocomplete suggests functions and source paths contextually.
   - Inline validation shows errors (red underline + tooltip) as the user types (300ms debounce).
   - Bracket matching highlights paired parentheses.
   - Expression updates the selected rule in real-time (300ms debounce).

6. **Mode toggle** — User switches freely between Builder and Editor:
   - Builder → Editor: generated DSL appears in the text editor.
   - Editor → Builder: if decomposable, steps populate. If too complex, warning shown.

7. **Function reference** — User opens the collapsible reference panel, searches for a function, and clicks to insert it at cursor (raw mode) or select as transform (guided mode).

8. **Source tree click-to-insert** — User clicks a node in Panel 1. In raw mode, `source("path")` inserts at cursor. In guided mode, fills the current source field slot.

### System Behavior

**Engine integration for expression builder (`ui/src/lib/engine/` additions):**
- Re-export `parse` from `@keyra/engine` for expression validation
- Re-export `evaluate` from `@keyra/engine` for expression preview
- Re-export `defaultRegistry` (or a `listRegisteredFunctions()` utility) for function metadata
- Re-export AST types (`AstNode`, `FunctionCallNode`, `ParseResult`) for builder decomposition

**`useExpressionBuilder()` hook:**
```typescript
function useExpressionBuilder(options: {
  selectedRuleIndex: number | null;
  rules: readonly MappingRule[];
  updateRule: (index: number, rule: Pick<MappingRule, 'target' | 'expression' | 'description'>) => void;
  parsedSourceSchema: ParsedSchema | null;
}): {
  mode: 'builder' | 'editor';
  setMode: (mode: 'builder' | 'editor') => void;
  expression: string;
  setExpression: (expr: string) => void;
  validationResult: ParseResult | null;
  isValid: boolean;
  selectedRule: MappingRule | null;
  canDecompose: boolean;
}
```
- Loads expression from selected rule when `selectedRuleIndex` changes
- Debounces expression updates back to `updateRule()` (300ms)
- Runs `parse()` on expression changes (300ms debounce) for inline validation
- Tracks mode and handles mode switching logic (decomposition check)

**`useExpressionPreview()` hook:**
```typescript
function useExpressionPreview(options: {
  expression: string;
  sourceData: unknown | null;
  sourceSchema: unknown | null;
  targetSchema: unknown | null;
  constants: Record<string, unknown>;
  externalSources: Record<string, unknown>;
}): {
  result: unknown | null;
  error: string | null;
  isEvaluating: boolean;
}
```
- Parses and evaluates the expression against sample data (debounced 300ms)
- Returns evaluated result or error message
- Returns null result if no sample data or expression is empty/invalid

**DSL syntax highlighting (regex-based tokenizer for visual rendering):**
- Token classes: `function-name`, `string-literal`, `number-literal`, `boolean-literal`, `null-literal`, `punctuation`, `comma`, `path` (inside string literals in source())
- Renders as an overlay above the textarea (transparent text + colored span layer)
- Produces no AST — purely for visual styling

**Autocomplete context detection:**
- Inside `source("` → suggest source field paths from ParsedSchema (flattened paths)
- Inside `constant("` → suggest constant names from mapping config
- Inside `external("` → suggest external source names from mapping config
- At function call position → suggest function names with parameter hints
- Uses cursor position to determine context via simple character scanning

**Guided builder AST decomposition (Editor → Builder):**
- Parses expression with `parse()`
- Checks if all functions in the AST are in the builder's supported set (~15 functions)
- Checks nesting depth does not exceed 3 levels
- Supported patterns:
  - `FunctionCall("source", [StringLiteral])` → Direct Copy
  - `FunctionCall("static", [Literal])` → Static Value
  - `FunctionCall(supportedFunction, [...args])` → Transform with args
  - Nested up to 3 levels deep when all functions are supported → decomposable
  - Any unsupported function or nesting > 3 levels → not decomposable
- If not decomposable: `canDecompose = false`, show warning on mode switch

**Function registry metadata for UI:**
- A static `DSL_FUNCTION_CATALOG` in `ui/src/lib/data/dsl-functions.ts` (shared cross-feature location) providing:
  - Function name
  - Category (String, Date, Math, Conditional, Lookup, Array, Null Handling, Type Conversion)
  - One-line description
  - Parameter signatures with types
  - Example usage string
- This is a build-time static data structure, not dynamically queried from the registry at runtime (for performance and bundle-size reasons)
- However, function existence validation uses the live registry for accuracy
- Consumed by: FS-011 (builder, autocomplete, function reference), FS-012 (diagnostics), FS-010 (rule type inference)

### Failure / Edge Behavior

- **No rule selected:** Panel shows empty state: "Select a rule to edit its expression, or add a new rule."
- **Rule selected, empty expression:** Builder shows Step 1 (select source). Editor shows empty with placeholder text.
- **Rule selected, existing expression — decomposable:** Builder populates steps from AST.
- **Rule selected, existing expression — not decomposable:** Editor mode shown. Switching to Builder shows warning: "This expression is too complex for the guided builder. You can edit it in raw mode."
- **Validation error in expression:** Inline red underline in editor with tooltip showing error code + message. Builder Step 4 shows error inline.
- **Parse failure (fatal syntax error):** Editor shows full expression with error indicators. Builder cannot render (shows error state with suggestion to use editor).
- **Sample data not loaded:** Preview area shows "Load sample data in the Preview panel to see live results." Expression still shows as string.
- **Evaluation error with sample data:** Preview shows error message with code and description. Expression string still visible.
- **Source schema not loaded:** Autocomplete for source fields unavailable. Guided builder source field picker shows "No schema loaded" message.
- **Mode switch with unsaved builder changes:** Not applicable — expression updates are real-time, so both modes always reflect the current expression.
- **Very long expressions:** Raw editor handles multi-line gracefully. Autocomplete dropdown positioned relative to cursor.
- **Concurrent rapid typing:** Debounce (300ms) ensures validation and rule updates don't fire on every keystroke.

---

## Acceptance Examples

### AE-01 — Load expression from selected rule

**Given**
- A mapping with a rule at index 2: target `Order.Header.Status`, expression `if(eq(source("urgent"), true), static("Rush"), static("Normal"))`
- No rule is currently selected

**When**
- User clicks rule at index 2 in the Rule List (Panel 3)

**Then**
- Expression builder panel activates (no longer shows empty state)
- The expression `if(eq(source("urgent"), true), static("Rush"), static("Normal"))` appears in the editor
- Syntax highlighting renders: `if`, `eq`, `source`, `static` as function names; `"urgent"`, `"Rush"`, `"Normal"` as string literals; `true` as boolean
- Validation runs and shows green (valid) or appropriate error indicators

### AE-02 — Guided builder direct copy

**Given**
- A rule is selected with an empty expression
- Source schema has field `order.customerName` (string)

**When**
- User is in Builder mode at Step 1
- User clicks `customerName` in the source schema tree (Panel 1)

**Then**
- Source field slot shows `order.customerName`
- Generated expression is `source("order.customerName")`
- Since no transform was selected, this is the final expression (direct copy shortcut)
- The selected rule's expression updates to `source("order.customerName")`
- Preview area shows the DSL string

### AE-03 — Guided builder with transform

**Given**
- A rule is selected with an empty expression
- Source schema has fields `firstName` (string) and `lastName` (string)

**When**
- User selects `firstName` in Step 1
- User clicks "Add another source field" and selects `lastName`
- User proceeds to Step 2 and selects `concat` from String category
- Step 3 shows: argument 1 = `source("firstName")`, argument 2 = `source("lastName")`, separator slot (optional)
- User types `" "` (space) in the separator slot

**Then**
- Generated expression is `concat(source("firstName"), source("lastName"), " ")`
- Step 4 shows the DSL string
- If sample data has `{ "firstName": "John", "lastName": "Doe" }`, preview shows `"John Doe"`
- Rule expression updates automatically

### AE-04 — Raw editor syntax highlighting and validation

**Given**
- A rule is selected
- Expression builder is in Editor mode

**When**
- User types `source("invalidField")`

**Then**
- `source` is highlighted as a function name
- `"invalidField"` is highlighted as a string literal
- Parentheses are highlighted as punctuation
- After 300ms debounce, `parse()` succeeds (syntactically valid)
- Note: semantic validation (field existence) is handled by `useEngineValidation()` at the mapping level, not inline in the expression editor

### AE-05 — Raw editor autocomplete

**Given**
- Expression builder is in Editor mode
- Source schema has fields: `order.id`, `order.date`, `order.amount`, `order.customer.name`
- Cursor is inside `source("` (user typed `source("`)

**When**
- Autocomplete triggers (on typing or Ctrl+Space)

**Then**
- Dropdown shows source field paths: `order.id`, `order.date`, `order.amount`, `order.customer.name`
- Typing `order.c` filters to `order.customer.name`
- Selecting an item inserts the path and closing quote: `source("order.customer.name")`

### AE-06 — Mode toggle Builder to Editor

**Given**
- User built an expression via the guided builder: `concat(source("firstName"), source("lastName"))`
- Mode is currently "Builder"

**When**
- User clicks the "Editor" tab in the mode toggle

**Then**
- Raw editor shows `concat(source("firstName"), source("lastName"))` with full syntax highlighting
- Expression is editable
- Validation runs on the expression

### AE-07 — Mode toggle Editor to Builder (complex expression)

**Given**
- User has typed a complex expression in Editor mode: `if(gt(source("amount"), 1000), concat(upper(source("tier")), static("-VIP")), default(source("tier"), static("Standard")))`

**When**
- User clicks the "Builder" tab

**Then**
- Warning message appears: "This expression is too complex for the guided builder. You can edit it in raw mode."
- Mode does not switch (or switches showing the warning + raw expression remains the source of truth)
- User can dismiss warning and stay in Editor mode

### AE-08 — Expression preview with sample data

**Given**
- A rule's expression is `formatDate(source("orderDate"), "YYYY-MM-DD")`
- Sample source data is loaded: `{ "orderDate": "2026-03-15T10:30:00Z" }`

**When**
- Expression builder renders the preview area

**Then**
- Preview shows:
  - Expression: `formatDate(source("orderDate"), "YYYY-MM-DD")`
  - Result: `"2026-03-15"`
- Result updates whenever the expression changes (debounced)

### AE-09 — Empty state (no rule selected)

**Given**
- No rule is selected in Panel 3

**When**
- User views Panel 4 (Expression Builder)

**Then**
- Panel shows empty state: "Select a rule to edit its expression, or add a new rule."
- No editor or builder controls are visible
- Mode toggle is disabled or hidden

### AE-10 — Array expression in guided builder

**Given**
- A rule is selected targeting `Order.Lines`
- Source schema has `items` (array) with children `sku` (string), `qty` (number)

**When**
- User selects `items` as source (an array field)
- Builder detects array type and shows `map()` as a suggested transform
- User selects `map()` from the Array category
- Builder scaffolds object template with key-value pairs
- User adds key `productCode` with value `item("sku")` and key `quantity` with value `item("qty")`

**Then**
- Generated expression: `map(source("items"), { "productCode": item("sku"), "quantity": item("qty") })`
- Builder shows "You are inside a map() — use item() to access array element fields"
- Preview (if sample data loaded) shows the transformed array

### AE-11 — Function reference panel

**Given**
- Expression builder is in Editor mode with cursor at the beginning

**When**
- User opens the function reference panel
- User searches for "date"
- User sees `formatDate` in results with signature and description
- User clicks `formatDate`

**Then**
- `formatDate()` is inserted at the cursor position in the editor
- Cursor is placed inside the parentheses
- Autocomplete may trigger to help fill arguments

### AE-12 — Inline validation error display

**Given**
- Expression builder is in Editor mode
- User types `concat(source("name"), `  (incomplete — missing closing paren)

**When**
- 300ms debounce fires and `parse()` runs

**Then**
- Parse returns `success: false` with diagnostic `KEYRA-E001` (unexpected end of expression)
- The error location is underlined in red
- Hovering shows tooltip: "KEYRA-E001: Unexpected end of expression"
- The expression is not applied to the rule (invalid expressions are not committed)
- A visual indicator appears below the editor: "⚠ Expression has syntax errors — not saved to rule"

### AE-13 — Static value shortcut

**Given**
- A rule is selected with an empty expression
- Builder mode is active

**When**
- User toggles "Static value" switch
- User types `PO` in the value input

**Then**
- Generated expression is `static("PO")`
- Rule expression updates
- Preview shows `"PO"` as the result

---

## Open Questions

All questions resolved in Rev 2.

- `Q1.` ~~Should the expression builder use a textarea + overlay approach for the raw editor, or a contenteditable div?~~ **RESOLVED (Rev 2):** Use textarea + synchronized overlay. The overlay div sits on top with `pointer-events: none` and renders highlighted tokens; the textarea handles all input, cursor, and selection natively. This is simpler, more accessible, and avoids contenteditable cursor/selection issues.

- `Q2.` ~~Should invalid expressions (parse failures) be committed to the rule state?~~ **RESOLVED (Rev 2):** Only commit syntactically valid expressions to rule state. Empty string is committable (clearing an expression is valid). Partial/invalid expressions stay in local working state only. Show a visual indicator: "⚠ Expression has syntax errors — not saved to rule" below the editor when the local expression differs from the committed rule expression due to parse failure.

- `Q3.` ~~What is the exact decomposition depth limit for Editor → Builder mode?~~ **RESOLVED (Rev 2):** The guided builder can decompose expressions up to 3 levels of nesting when all functions in the expression tree are in the builder's supported set (~15 functions: source, static, concat, cast, default, coalesce, if, valueMap, formatDate, map, filter, upper, lower, trim, add, subtract, multiply, divide, eq, neq, gt, gte, lt, lte). Examples: `default(upper(source("name")), "N/A")` (2 levels) ✓, `if(gt(source("amount"), 1000), upper(source("tier")), static("Standard"))` (3 levels) ✓. Beyond 3 levels or any unsupported function in the tree → `canDecompose = false`.

- `Q4.` ~~Should the expression builder panel be resizable or have a fixed height within the grid?~~ **RESOLVED (Rev 2):** The panel uses CSS `resize: vertical` with default height ~200px, min-height 120px, max-height 50vh. This allows users to expand the editor for complex multi-line expressions without permanently consuming screen space.

- `Q5.` ~~For the function catalog static data, should it be co-located with the expression builder feature or placed in a shared location?~~ **RESOLVED (Rev 2):** Place the function catalog in `ui/src/lib/data/dsl-functions.ts` as shared cross-feature static data. It will be consumed by FS-011 (builder, autocomplete, function reference), FS-012 (diagnostics display), and potentially FS-010 (rule type inference). The file exports `DSL_FUNCTION_CATALOG: readonly FunctionCatalogEntry[]` and associated types.

---

## Verification Strategy

- **Unit tests** for hooks:
  - `useExpressionBuilder` — mode switching, expression loading from rule, debounced updates, validation integration (AE-01, AE-06, AE-07, AE-09)
  - `useExpressionPreview` — evaluation with sample data, error handling (AE-08)
  - `useDslAutocomplete` — context detection, suggestion generation (AE-05)
  - `useDslValidation` — parse integration, error position mapping (AE-12)
- **Unit tests** for utilities:
  - DSL tokenizer for syntax highlighting (token classification correctness)
  - AST decomposer for Editor → Builder (decomposable vs complex detection) (AE-07)
  - Function catalog data completeness (all registered functions have metadata)
- **Component tests** (React Testing Library):
  - ExpressionBuilderPanel empty state (AE-09)
  - Raw editor rendering with syntax highlighting (AE-04)
  - Guided builder step flow (AE-02, AE-03, AE-13)
  - Mode toggle behavior (AE-06, AE-07)
  - Autocomplete dropdown rendering and selection (AE-05)
  - Function reference search and insert (AE-11)
  - Array expression builder scaffolding (AE-10)
  - Expression preview rendering (AE-08)
  - Inline validation error display (AE-12)
- **Integration tests:**
  - Expression builder loads expression from selected rule (AE-01)
  - Expression changes propagate back to rule state (AE-02, AE-03)
  - Source schema tree click inserts source path (AE-02)
- **TypeScript**: `tsc --noEmit` passes, zero lint errors
- **Build**: `pnpm build` succeeds, bundle size delta documented

---

## Task Generation Notes

Decompose into 12 tasks:

1. **T-01: Expression builder types, state hook, and panel shell** — Define types (ExpressionBuilderMode, BuilderStep, FunctionCatalogEntry, etc.), create `useExpressionBuilder()` hook with selected rule loading and debounced updates (commit-only-valid logic), build panel shell with mode toggle UI and resizable container. Create `DSL_FUNCTION_CATALOG` in shared `ui/src/lib/data/dsl-functions.ts`. Foundation for all other tasks. Agent: `ui-task`.

2. **T-02: Raw DSL editor with syntax highlighting** — Build the raw editor component using textarea + synchronized overlay div for syntax highlighting. Implement regex-based DSL tokenizer for visual token classification, render colored overlay with `pointer-events: none`. Bracket matching. Multi-line support. Resizable panel container (200px default, 120px min, 50vh max). Depends on T-01. Agent: `ui-task`.

3. **T-03: Autocomplete system** — Build context-aware autocomplete: detect cursor context (inside source(), at function position, etc.), generate suggestions from ParsedSchema + config constants + function registry, render dropdown, handle selection/keyboard. Depends on T-02. Agent: `ui-task`.

4. **T-04: Inline validation via engine parse()** — Wire engine's `parse()` into the raw editor with 300ms debounce. Map diagnostic positions to editor offsets. Render error underlines + tooltips. Only commit valid expressions to rule state. Show "⚠ Expression has syntax errors — not saved to rule" indicator for invalid in-progress edits. Empty expression is committable. Depends on T-02. Agent: `ui-task`.

5. **T-05: Guided builder — source selection and transform picker** — Build Step 1 (source field selection with inline picker, multi-field support, direct copy shortcut, static value shortcut) and Step 2 (categorized function picker with descriptions and parameter counts). Depends on T-01. Agent: `ui-task`.

6. **T-06: Guided builder — argument configuration and DSL generation** — Build Step 3 (argument slot rendering with type-aware inputs, nested function recursion, enum dropdowns) and Step 4 (live DSL string generation from builder state). Depends on T-05. Agent: `ui-task`.

7. **T-07: Array expression support in guided builder** — Add `map()` object template scaffolding, `filter()` condition builder, `item()`/`parent()` as source options in array context, visual array context indicator. Depends on T-06. Agent: `ui-task`.

8. **T-08: Mode toggle and bidirectional conversion** — Implement Builder→Editor (trivial: show generated string) and Editor→Builder (AST decomposition into builder steps, 3-level nesting support with supported function set, complexity detection, warning display). Depends on T-02, T-05. Agent: `ui-task`.

9. **T-09: Function reference panel** — Build collapsible searchable function catalog panel. Import `DSL_FUNCTION_CATALOG` from `ui/src/lib/data/dsl-functions.ts` (shared location). Categories, descriptions, signatures, examples. Click-to-insert for both modes. Depends on T-01. Agent: `ui-task`.

10. **T-10: Expression preview area** — Build preview component showing final DSL string, create `useExpressionPreview()` hook for live evaluation against sample data, handle evaluation errors and loading state. Depends on T-01. Agent: `ui-task`.

11. **T-11: Panel integration and source tree wiring** — Wire ExpressionBuilderPanel into MappingEditorPage Panel 4 slot. Connect selected rule state from useMappingEditor. Connect source schema tree onSelectNode to expression builder insert. Wire keyboard shortcuts. Depends on T-02, T-05, T-08, T-09, T-10. Agent: `ui-task`.

12. **T-12: Architecture update** — Update `forge/architecture/ui-application.md` with expression builder architecture (hook pattern, mode toggle, engine parse/evaluate integration, function catalog pattern). Agent: `task`.

Parallelization:
- T-01 is foundation (everything depends on it)
- T-02 and T-05 can run in parallel after T-01 (raw editor vs guided builder)
- T-09 and T-10 can run in parallel after T-01
- T-03 and T-04 depend on T-02 (can parallel with each other)
- T-06 depends on T-05
- T-07 depends on T-06
- T-08 depends on T-02 + T-05
- T-11 depends on T-02 + T-05 + T-08 + T-09 + T-10 (final integration)
- T-12 depends on T-01 (can run after architectural decisions are made)

---

## Change Log

- Rev 2 — 2026-05-01
  - Resolved Q1: Raw editor uses textarea + synchronized overlay (not contenteditable)
  - Resolved Q2: Only valid expressions committed to rule state; empty is committable; "not saved" indicator for invalid edits
  - Resolved Q3: Guided builder decomposition supports up to 3 levels of nesting (was 1 level); supported function set ~15 functions
  - Resolved Q4: Panel uses `resize: vertical`, default 200px, min 120px, max 50vh
  - Resolved Q5: Function catalog placed in shared `ui/src/lib/data/dsl-functions.ts` (cross-feature)
  - Updated Assumptions, Constraints, Proposed Behavior, AE-12, Relevant Areas to reflect resolutions
- Rev 1 — 2026-05-01
  - Initial draft
