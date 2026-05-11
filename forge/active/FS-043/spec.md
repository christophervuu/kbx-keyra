# SPEC

## Title

Array Builder Redesign — Chain-Based Model

---

## ID

FS-043

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-11
Last Updated: 2026-05-11
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Replace the current 4-step wizard-style Array Builder in the Mapping Editor with a unified, chain-aligned Array Builder that supports collection-level operations and item-level field mapping using progressive disclosure. The redesign uses a two-layer builder model (collection layer + item layer), reuses the scalar chain builder for leaf fields inside mapped array items, and aligns with KeyRa 2.0's TTFSM (Time to First Successful Mapping) optimization goals. Success means array mapping feels like an extension of the scalar chain builder rather than a disconnected wizard.

---

## Problem

The current `ArrayMappingBuilder` is a 4-step wizard (`Source → Pattern → Fields → Preview`) that is structurally disconnected from the scalar chain builder introduced in FS-038/FS-039. Specific problems:

1. **Wizard model is rigid.** Users must progress linearly through 4 steps. There is no way to adjust collection-level logic (e.g., add a filter) without restarting the wizard flow.
2. **No filter predicate UI.** The `filter-then-map` pattern generates a hardcoded placeholder `item("")` filter condition — the user must manually edit raw DSL to configure it.
3. **No merge branch management UI.** The hook exposes `addAdditionalSource`/`removeAdditionalSource` but the component never calls them.
4. **No expression decomposition.** Unlike the scalar chain builder (which hydrates from existing DSL via `decomposeToChain`), the array builder cannot load existing array expressions into structured mode.
5. **No item-level chain logic.** Field mapping is limited to simple `item("field")` drag-and-drop — no transforms, conditions, or value maps on leaf fields.
6. **No cross-array lookup support.** A common integration pattern (`find` + `get` for key-based joins) has no guided UI.
7. **No nested array support.** Nested arrays show only a banner; no actual nesting logic exists.
8. **Inconsistent UX.** The wizard flow, step indicators, and back/next buttons are visually and interaction-pattern-distinct from the chain builder's accordion model.

---

## Goal

Deliver an Array Builder that:

- Feels like a natural extension of the scalar chain builder
- Uses progressive disclosure instead of a full-screen wizard
- Supports five entry modes: Map source array, Filter + map, Build from values, Merge array branches, Custom expression
- Reuses scalar chain logic for leaf field mapping inside array items
- Supports nested target arrays with parent-item scope references
- Includes a guided cross-array lookup helper for leaf-level fields
- Distinguishes incomplete draft state from real validation errors
- Preserves compatible state when switching between array modes
- Can load existing array DSL expressions into structured or fallback raw mode

---

## Assumptions

- The KeyRa DSL array semantics are stable and will not change for this work. Specifically: `map()`, `filter()`, `find()`, `array()`, `merge()`, `item()`, `parent()`, `source()`, `get()`, `static()`.
- `source()` is always root/global; `item()` refers to nearest enclosing array context; `parent()` reaches exactly one enclosing context.
- Named scopes and multi-level ancestor addressing are out of scope for v1.
- Advanced collection functions (`sort()`, `distinct()`, `groupBy()`, `reduce()`, `limit()`) are future extensions, not v1.
- The Mapping Editor already uses a draft-based editing model with explicit save via the header save action (FS-039).
- The scalar chain builder (`ChainBuilder.tsx`, `ChainState`, `generateChainExpression`, `decomposeToChain`) is stable and available for reuse.
- The existing `ArrayMappingBuilder`, `useArrayBuilder`, and `array-expression-generator` will be fully replaced by this work.
- No engine-level DSL behavior changes are required for this UI redesign.

---

## Current Context

### Current Array Builder

The existing array builder (`ArrayMappingBuilder.tsx`) is a 4-step wizard:

- **Step 1 (Source):** Select a source array path from parsed source schema.
- **Step 2 (Pattern):** Choose from 5 patterns: `1:1 map`, `filter-then-map`, `merge-arrays`, `build-from-scalars`, `advanced`.
- **Step 3 (Fields):** Drag-and-drop field mapping — source item fields to target item fields. Generates simple `item("field")` references.
- **Step 4 (Preview):** Read-only DSL preview (or raw editor for `advanced`).

State is managed by `useArrayBuilder` hook with `ArrayBuilderState`:
```
{ sourceArrayPath, pattern, fieldMappings, rawExpression, additionalSourcePaths }
```

DSL generation is handled by `generateArrayExpression()` in `array-expression-generator.ts`. There is no decomposer — existing array expressions cannot be loaded into structured mode.

### Scalar Chain Builder (FS-039)

The scalar chain builder uses `ChainState`:
```typescript
interface ChainState {
  source: ChainSource;        // field | static | none
  steps: readonly ChainStep[]; // transform | condition | valueMap
}
```

Key properties:
- **Progressive disclosure:** Source entry first, then `[+ Add Step]` to add transform/condition/valueMap steps.
- **Accordion model:** One step expanded at a time; completed steps collapse to summaries.
- **Recursive branches:** Condition and value-map branches contain full `ChainState`.
- **Generator + decomposer:** `generateChainExpression()` for forward path, `decomposeToChain()` for reverse.
- **Type-compatible step suggestions:** `getCompatibleChainableTransforms()` filters add-step options.

### DSL Array Semantics

The array DSL (from `specs/KEYRA-DSL-ARRAYS.md`) defines:

- **Scope-creating functions:** `map()`, `filter()`, `find()` create array contexts where `item()` is available.
- **Scope stack:** `item()` reads nearest context, `parent()` reads one level up, `source()` is always root.
- **Key patterns:** 1:1 map, filter-then-map, build from scalars with `array()`, merge with `merge()`, cross-array lookup with `find()` + `get()`, nested arrays.
- **Error codes:** `KEYRA-E010` (item outside context), `KEYRA-E013` (parent outside nested context), `KEYRA-E015` (invalid map template), `KEYRA-E017` (non-boolean filter/find condition).

### Integration Points

- The Array Builder renders in the right panel of the Mapping Editor when an array-type target field is selected.
- It participates in the auto-draft save model (FS-039): calls `updateDraft(targetPath, expression)` as the generated expression changes.
- The pinned feedback area (`BuilderFeedbackArea`) shows Expression, Result, and Validation for the active field.
- The `ConnectedInlinePreviewStrip` watches draft expressions for auto-preview.

---

## Scope

### In Scope

- New array builder state model aligned with chain semantics (collection layer + item layer)
- Array DSL expression generator from new state model
- Array DSL expression decomposer (DSL → structured state)
- Collection layer UI for all five entry modes: Map source array, Filter + map, Build from values, Merge array branches, Custom expression
- Item template layer with scalar chain builder reuse for leaf fields
- Mode switching with state preservation rules and confirmation flow
- Cross-array lookup guided helper for leaf-level fields
- Nested array builder context with scope display
- Array-specific validation model (collection, item, leaf, output levels)
- Validation feedback area integration with incomplete vs invalid distinction
- Custom expression mode with best-effort round-trip to structured mode
- Result preview for arrays (shape, first N items, empty/null states)
- Backward compatibility: loading existing valid array DSL into structured or raw mode
- Replacing existing `ArrayMappingBuilder`, `useArrayBuilder`, `array-expression-generator`

### Out of Scope

- External/API-backed array sources
- Advanced collection operations: `sort()`, `limit()`, `distinct()`, `groupBy()`, `reduce()`
- Named multi-level scopes beyond current `parent()` behavior
- General raw DSL authoring improvements outside the Array Builder
- Engine-level DSL semantic changes
- Array-to-scalar derivations inside the Array Builder (e.g., `join()`, `count()`, `first()` — these remain in the scalar builder)
- Changes to the scalar chain builder model itself
- Rules View integration (array builder is Target View only)

---

## Non-Goals

- Replacing or modifying the scalar chain builder architecture
- Solving triple-nested array scope access (requires named scopes — future DSL extension)
- General raw DSL editor improvements (autocomplete, syntax highlighting — addressed elsewhere)
- Changing engine validation behavior or diagnostic codes
- Building a visual query designer for complex filter predicates
- Supporting non-equality-based cross-array lookups (range, fuzzy, etc.)
- Providing drag-and-drop source field staging into array collection-level controls (leaf-level only)

---

## Relevant Areas

- `ui/src/features/mappings/components/ArrayMappingBuilder.tsx` (replace)
- `ui/src/features/mappings/hooks/use-array-builder.ts` (replace)
- `ui/src/features/mappings/lib/array-expression-generator.ts` (replace)
- `ui/src/features/mappings/lib/chain-builder-state.ts` (extend with array types)
- `ui/src/features/mappings/lib/chain-expression-generator.ts` (reference for reuse)
- `ui/src/features/mappings/lib/chain-decomposer.ts` (reference for reuse)
- `ui/src/features/mappings/components/ChainBuilder.tsx` (reuse for leaf fields)
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx` (reference pattern)
- `ui/src/features/mappings/components/BuilderFeedbackArea.tsx ?` (integration)
- `ui/src/features/mappings/hooks/use-mapping-editor.ts` (draft API consumer)
- `ui/src/features/mappings/hooks/use-engine-validation.ts` (validation integration)
- `ui/src/features/mappings/hooks/use-expression-preview.ts` (preview integration)
- `ui/src/features/mappings/types.ts ?`
- `forge/architecture/ui-application.md` (architecture update)

---

## Dependencies / Blockers

- FS-039 (chain builder model) — completed; ChainState, ChainBuilder, generator, decomposer available
- FS-040 (BuilderFeedbackArea, UnsavedDiffPanel) — completed; feedback area pattern available
- No blocking dependencies on incomplete specs

---

## Constraints

- Must preserve the established draft-save model (FS-039): array edits are draft-based and saved through the existing header save action
- Must not modify engine-level DSL semantics or function implementations
- Must reuse existing scalar `ChainState`/`ChainBuilder` for leaf field mapping inside item templates — do not fork or duplicate the chain builder
- Must work within the existing three-column Mapping Editor layout; the array builder renders in the right panel
- Must maintain TypeScript strict mode compliance
- Must follow existing component organization conventions (feature-scoped under `ui/src/features/mappings/`)
- Existing valid array DSL expressions must continue to load — either into structured mode or raw fallback
- Desktop-first layout (1024px minimum, optimized for 1280px+)

---

## Proposed Behavior

### User Flow

#### Entry Point

When a user selects an array-type target field in the Target Worklist, the right panel renders the Array Builder instead of `ScalarFieldBuilder` or `ObjectSummaryPanel`.

The Array Builder presents a two-layer editing surface:

1. **Collection layer** — How the target array is produced
2. **Item layer** — How each array item is constructed

#### First-Time Array Mapping

1. User selects an array target field.
2. The builder shows: "How do you want to build this array?" with five mode options:
   - **Map source array** — Transform each element of a source array
   - **Filter + map source array** — Filter, then transform a source array
   - **Build from values** — Construct array entries from individual fields
   - **Merge array branches** — Combine multiple source arrays
   - **Custom expression** — Write raw DSL (advanced)
3. User selects a mode. The collection layer expands with mode-specific controls.
4. User configures collection-level logic (source selection, filter conditions, branch setup, etc.).
5. The item layer appears below the collection layer once the collection source is established.
6. User maps item-level fields using the scalar chain builder model for each leaf field.
7. The generated DSL expression updates live in the pinned feedback area.
8. The expression is auto-drafted via `updateDraft()`.

#### Loading Existing Array Expressions

When an array target field already has a mapped expression:

1. The decomposer attempts to parse the expression into structured state.
2. **Decomposition success:** The builder loads in the detected structured mode with all layers hydrated.
3. **Decomposition failure:** The builder falls back to Custom Expression mode with the raw DSL displayed. A banner explains: "This expression uses a pattern not supported by the structured builder. Edit in custom expression mode or reset to start fresh."

#### Mode Switching

Users may switch array builder modes while in draft state:

- **Map ↔ Filter + Map:** Preserves source selection and item template; adds/removes filter only.
- **Map/Filter-Map → Merge:** Preserves current setup as Branch 1.
- **Merge → Map/Filter-Map:** Only if one branch exists, or user explicitly chooses one branch to keep.
- **Build from Values ↔ other structured modes:** Structurally incompatible — confirmation dialog explains what will be kept/discarded.
- **Any → Custom Expression:** Generates best-effort DSL from current structured state. Preserves the previous structured draft in-session for return.
- **Custom Expression → structured mode:** Only if the expression matches a recognized structured pattern; otherwise requires reset confirmation.

#### Nested Arrays

When an item template contains a target field that is itself an array:

1. User clicks the nested array field in the item template.
2. A separate focused Array Builder panel replaces the outer builder, with a clear "Back to parent" action at the top.
3. Draft state for the outer array is preserved while editing the nested array.
4. Available scopes in the nested context:
   - **Root source** — `source()`
   - **Current item** — `item()` (inner array element)
   - **Parent item** — `parent()` (outer array element)
   - **Static** — literal values
5. The UI clearly labels the scope context (e.g., "Editing: orders[].items[] — inside orders[]").
6. Only one parent level is available.
7. Clicking "Back to parent" returns to the outer array builder with all outer state intact.

#### Cross-Array Lookup

Cross-array lookup is a guided helper available on leaf-level fields inside item templates:

1. User is mapping a leaf field inside an item template.
2. User selects "Cross-array lookup" from the leaf logic options (alongside Transformation, Condition, Value Map).
3. The helper prompts for:
   - **Lookup array** — which source array to search
   - **Match field** — which field in the lookup array to match against
   - **Compare against** — current item field or parent item field to compare
   - **Return field** — which field to extract from the matched element
   - **Default fallback** — optional value if no match found
4. The helper generates `default(get(find(source("lookupArray"), eq(item("matchField"), parent("compareField"))), "returnField"), fallback)`.
5. The generated expression appears in the leaf field's chain as a step.

### System Behavior

#### State Model

The array builder state model has two layers:

**ArrayBuilderState (top level):**
```
{
  mode: ArrayBuilderMode;           // 'map' | 'filterMap' | 'buildFromValues' | 'mergeArrayBranches' | 'customExpression'
  collectionState: CollectionState; // mode-specific collection-level state
  itemTemplate: ItemTemplateState;  // item-level field mapping state
  completionStatus: CompletionStatus;
  previousStructuredDraft?: ArrayBuilderState; // preserved when switching to custom mode
}
```

**CollectionState (discriminated union by mode):**
```
MapCollectionState:       { sourceArrayPath, sourceArrayType? }
FilterMapCollectionState: { sourceArrayPath, sourceArrayType?, filterPredicate: FilterPredicateState }  // simplified boolean builder + raw fallback
BuildFromValuesState:     { entries: ValueEntry[] }  // reorderable via drag-and-drop + keyboard
MergeBranchesState:       { branches: MergeBranch[] }  // max 10 branches in structured UI
CustomExpressionState:    { rawExpression: string }
```

**ItemTemplateState:**
```
{
  fields: ItemFieldMapping[];  // each leaf maps to a ChainState or cross-array lookup
  nestedArrays: Map<string, ArrayBuilderState>;  // recursive for nested arrays
}
```

**CompletionStatus:**
```
'notStarted' | 'inProgress' | 'complete' | 'hasErrors'
```

Completion derivation:
- `notStarted`: no mode selected
- `inProgress`: mode selected but item template incomplete (missing required fields, incomplete chains)
- `complete`: collection logic valid + all required item fields satisfied + leaf outputs match target types
- `hasErrors`: validation errors exist at any level

**Draft integration:**
- The array builder generates a DSL expression from its state on every meaningful state change.
- The expression is passed to `updateDraft(targetPath, expression)` from `useMappingEditor`.
- Save merges the draft into saved rules via the existing header save action.

#### Mode-Switch State Transitions

| From | To | Behavior |
|---|---|---|
| Map | Filter + Map | Add empty filter predicate; preserve sourceArrayPath + itemTemplate |
| Filter + Map | Map | Remove filter predicate; preserve sourceArrayPath + itemTemplate |
| Map / Filter + Map | Merge Branches | Preserve current setup as Branch 1; reset Branch 2+ |
| Merge Branches | Map / Filter + Map | If 1 branch: convert to Map/Filter-Map. If 2+: user picks branch to keep. Confirmation dialog. |
| Build from Values | Any structured | Confirmation: "Build from values configuration will be discarded. Item template will be reset." |
| Any structured | Build from Values | Confirmation: "Current configuration will be discarded." |
| Any structured | Custom Expression | Generate best-effort DSL from current state; preserve structured draft in-session |
| Custom Expression | Any structured | If expression matches recognized pattern: decompose and load. Otherwise: confirmation to reset. |

#### Validation Model

Validation operates at four levels:

**1. Collection validation:**
- Selected source must resolve to an array type in the source schema
- Filter predicate must be a boolean expression
- Merge branches must each resolve to arrays
- Build-from-values entries must be structurally valid

**2. Item-template validation:**
- Required target item fields must be present
- Item template shape must match target schema item type
- Nested arrays within the template must pass their own validation

**3. Leaf output validation:**
- Each mapped field's chain output must be type-compatible with the target field type
- Cross-array lookup return field must be type-compatible

**4. Final output validation:**
- Generated expression must parse successfully
- Result type must match target array type and item schema

**Incomplete vs Invalid distinction:**
- **Incomplete:** Required item fields not yet mapped, or collection source not yet selected. Shown as muted/pending indicators during editing. Not blocking for navigation or mode switching.
- **Invalid:** Type mismatches, source path errors, filter returning non-boolean. Shown as error indicators. Blocking at save/final validation time.

**Validation display:**
- Pinned summary in the BuilderFeedbackArea (Expression + Result + Validation rows)
- Status badges at the array node level in the Target Worklist
- Per-field validation indicators inside item templates
- Incomplete fields: gray/muted dot or empty circle
- Invalid fields: red error icon

#### Expression Generation

The expression generator produces DSL from the array builder state:

| Mode | Generated DSL Pattern |
|---|---|
| Map | `map(source("path"), { "field": <chain>, ... })` |
| Filter + Map | `map(filter(source("path"), <predicate>), { "field": <chain>, ... })` |
| Build from Values | `filter(array({ ... }, { ... }, ...), <nullFilter?>)` or `array(...)` |
| Merge Branches | `merge(map(source("a"), {...}), map(source("b"), {...}), ...)` |
| Custom Expression | Raw passthrough |

Item-level fields use `generateChainExpression()` from the scalar chain generator, with scope-aware source references (`item("field")` instead of `source("field")` when inside an array context).

#### Expression Decomposition

The decomposer analyzes existing DSL to produce structured state:

1. Parse the expression into AST.
2. Match outer structure against known patterns:
   - `map(source(...), {...})` → Map mode
   - `map(filter(source(...), ...), {...})` → Filter + Map mode
   - `array(...)` or `filter(array(...), ...)` → Build from Values mode
   - `merge(...)` → Merge Branches mode
3. For each recognized pattern, extract:
   - Source array path
   - Filter predicate (if present)
   - Item template fields → decompose each field expression into `ChainState` using existing `decomposeToChain()`
4. If the pattern is not recognized → fall back to Custom Expression mode.

#### Result Preview

The array builder integrates with the existing preview infrastructure:

- **Preview result shape:** Shows the generated array structure as formatted JSON.
- **Preview first N items:** Displays up to 10 items by default with a summary such as "Showing 10 of 237 items" and expandable access to the full result.
- **Preview empty/null result:** Clear indication of `null` result (source not found) vs `[]` (empty array / all filtered out).
- **Merge branch contribution:** When practical, annotate which items came from which branch (e.g., "Branch 1: 3 items, Branch 2: 1 item").

Preview is driven by the same `useExpressionPreview` / `usePreviewExecution` hooks used by the scalar builder and inline preview strip.

### Failure / Edge Behavior

- **Source array not found:** Collection validation shows error "Source path does not resolve to an array". Preview shows `null`.
- **Filter removes all elements:** Preview shows `[]` with info message "Filter condition excluded all elements".
- **Merge with null branch:** Null branches are treated as empty per DSL semantics. No error; preview shows contribution summary indicating "0 items" for the null branch.
- **Nested array with parent scope error:** If `parent()` is used at the wrong nesting depth, validation shows `KEYRA-E013`.
- **Circular or deeply nested arrays:** Nesting depth follows the engine's 32-level recursion limit. UI supports 2 explicit nesting levels (outer + inner). Deeper nesting falls back to custom expression.
- **Mode switch data loss:** Confirmation dialog lists exactly what will be preserved and what will be discarded.
- **Legacy expression fallback:** Expressions that cannot be decomposed load in Custom Expression mode with a clear banner. No data is lost.
- **Empty item template:** Valid for drafting (status: `inProgress`). Becomes blocking at save validation if required fields exist in the target schema.
- **Partial chain on leaf field:** Individual leaf fields may be incomplete while user works on other fields. The item template tracks per-field completion.

---

## Acceptance Examples

### AE-01 — Map source array with item transforms

**Given**
- Target field `lineItems` is an array of objects with fields: `productCode` (string), `qty` (number), `netPrice` (number)
- Source schema has `items[]` with fields: `sku`, `quantity`, `unitPrice`, `discountAmount`

**When**
- User selects `lineItems` in target worklist
- User selects "Map source array" mode
- User selects `items` as source array
- User maps `productCode` ← `item("sku")` (direct copy)
- User maps `qty` ← `item("quantity")` (direct copy)
- User maps `netPrice` ← `subtract(item("unitPrice"), item("discountAmount"))` (transform chain)

**Then**
- Generated expression: `map(source("items"), {"productCode": item("sku"), "qty": item("quantity"), "netPrice": subtract(item("unitPrice"), item("discountAmount"))})`
- Feedback area shows valid expression, preview shows transformed items
- Status is `complete`

### AE-02 — Filter + map source array

**Given**
- Target field `discountLines` is an array
- Source schema has `items[]` with `discountAmount` field

**When**
- User selects "Filter + map source array" mode
- User selects `items` as source array
- User configures filter: `gt(item("discountAmount"), 0)`
- User maps item fields

**Then**
- Generated expression: `map(filter(source("items"), gt(item("discountAmount"), 0)), {"sku": item("sku"), "discount": item("discountAmount")})`
- Preview shows only items where `discountAmount > 0`

### AE-03 — Build from values with null filtering

**Given**
- Target field `contactMethods[]` expects objects with `type` and `number` fields
- Source has scalar fields: `primaryPhone`, `mobilePhone`, `faxNumber` (faxNumber is null)

**When**
- User selects "Build from values" mode
- User adds three value entries mapping to `{type, number}` objects
- Null filtering is enabled

**Then**
- Generated expression includes `filter(array(...), not(isNull(item("number"))))` pattern
- Preview shows 2 entries (fax entry filtered out)

### AE-04 — Merge array branches

**Given**
- Target field `allAddresses[]` expects `{city, origin}` objects
- Source has `domesticAddresses[]` and `internationalAddresses[]`

**When**
- User selects "Merge array branches" mode
- User adds Branch 1: source `domesticAddresses`, maps fields, adds `origin: static("DOMESTIC")`
- User adds Branch 2: source `internationalAddresses`, maps fields, adds `origin: static("INTERNATIONAL")`

**Then**
- Generated expression: `merge(map(source("domesticAddresses"), {...}), map(source("internationalAddresses"), {...}))`
- Preview shows merged results with branch contribution summary

### AE-05 — Mode switch preserves compatible state

**Given**
- User has configured "Map source array" mode with source `items` and 3 field mappings

**When**
- User switches to "Filter + map source array" mode

**Then**
- Source selection (`items`) is preserved
- All 3 field mappings are preserved
- An empty filter predicate is added to the collection layer
- No confirmation dialog is shown (compatible switch)

### AE-06 — Mode switch with confirmation for incompatible change

**Given**
- User has configured "Build from values" mode with 4 value entries

**When**
- User switches to "Map source array" mode

**Then**
- Confirmation dialog: "Switching to Map source array will discard your Build from values configuration. Item template will be reset. Continue?"
- If confirmed: mode switches, previous state is discarded
- If cancelled: mode stays as Build from Values

### AE-07 — Cross-array lookup helper

**Given**
- User is mapping `tax` field inside `map(source("lineItems"), {...})` item template
- Source has `taxLines[]` with `lineRef` and `taxAmount` fields

**When**
- User selects "Cross-array lookup" for the `tax` leaf field
- User configures: lookup array = `taxLines`, match field = `lineRef`, compare against = `parent("lineId")`, return field = `taxAmount`, default = `0`

**Then**
- Generated leaf expression: `default(get(find(source("taxLines"), eq(item("lineRef"), parent("lineId"))), "taxAmount"), 0)`
- Validation passes (types are compatible)

### AE-08 — Nested array with parent references

**Given**
- Target has `departments[].staff[]` nested structure
- Source has `departments[].employees[]`

**When**
- User selects `departments` array target, configures Map mode with source `departments`
- Inside item template, user selects `staff` nested array field
- Nested array builder opens with scope context: "Editing: departments[].staff[] — inside departments[]"
- User maps `staff` from `item("employees")` (source relative to parent item)
- User maps leaf field `department` ← `parent("name")` (parent item reference)

**Then**
- Generated outer expression includes nested `map()` with `parent("name")` references
- Scope context is clearly displayed
- Validation recognizes nested array context and allows `parent()` usage

### AE-09 — Incomplete item template during drafting

**Given**
- Target item has 5 required fields
- User has mapped 2 of 5 required fields

**When**
- User navigates to a different target field

**Then**
- The 3 unmapped required fields show as incomplete (muted indicators), not as errors
- The array node shows "In Progress" status badge
- Draft is saved via `updateDraft()`
- No blocking dialog prevents navigation

### AE-10 — Validation at save time

**Given**
- User has an array mapping with 2 of 5 required fields mapped
- User has a filter predicate that returns a string (not boolean)

**When**
- User clicks Save in the header

**Then**
- Save proceeds (save is never blocked by validation in the current model)
- Validation feedback shows:
  - Error: "Filter predicate must return boolean" (invalid)
  - Warning: "3 required item fields not mapped" (incomplete)
- These are visually distinct (error vs incomplete indicators)

### AE-11 — Load existing array expression into structured mode

**Given**
- Target field has existing expression: `map(source("items"), {"sku": item("sku"), "qty": item("quantity")})`

**When**
- User selects the array target field

**Then**
- Decomposer recognizes `map()` pattern
- Builder loads in "Map source array" mode
- Source array: `items`
- Item template shows 2 mapped fields: `sku` and `qty`
- No raw/custom expression fallback needed

### AE-12 — Load unrecognized array expression into raw mode

**Given**
- Target field has existing expression: `flatten(map(source("departments"), item("employees")))`

**When**
- User selects the array target field

**Then**
- Decomposer cannot match to a supported structured pattern
- Builder loads in "Custom expression" mode
- Raw DSL editor shows the full expression
- Banner: "This expression uses a pattern not supported by the structured builder."
- User can edit the raw DSL or reset to start fresh with a structured mode

### AE-13 — Custom expression with return to structured mode

**Given**
- User has configured "Map source array" with source `items` and 3 field mappings
- User switches to "Custom expression" mode

**When**
- Best-effort DSL is generated and shown in the raw editor
- User edits the DSL and then decides to switch back to "Map source array"

**Then**
- If the edited DSL matches a recognized Map pattern: decompose and load structured state
- If not: prompt "Cannot load this expression in structured mode. Return to your previous structured draft?" with options:
  - "Restore previous" — reloads the in-session preserved structured draft
  - "Reset" — starts fresh structured mode
  - "Stay in Custom" — remains in custom expression mode

### AE-14 — Build from values with object-shaped entries

**Given**
- Target `contactMethods[]` expects `{type: string, number: string}`
- Source has `primaryPhone`, `mobilePhone`

**When**
- User selects "Build from values" mode
- User adds entry 1: `{ "type": static("PRIMARY"), "number": source("primaryPhone") }`
- User adds entry 2: `{ "type": static("MOBILE"), "number": source("mobilePhone") }`
- User enables null filtering on `number` field

**Then**
- Generated expression: `filter(array({"type": "PRIMARY", "number": source("primaryPhone")}, {"type": "MOBILE", "number": source("mobilePhone")}), not(isNull(item("number"))))`

### AE-15 — Merge branch validation

**Given**
- User has configured "Merge array branches" with 2 branches
- Branch 1 source resolves to an array
- Branch 2 source resolves to a string (not an array)

**When**
- Validation runs

**Then**
- Branch 1: valid (green indicator)
- Branch 2: error "Source must resolve to an array" (red indicator)
- Overall array status: `hasErrors`

---

## Open Questions

All questions resolved in Rev 2.

- `Q1.` **Resolved.** Maximum 10 merge branches in the UI. The DSL supports unlimited branches, but the structured builder caps at 10. Users needing more switch to Custom Expression mode.
- `Q2.` **Resolved.** Simplified boolean-focused filter builder — not the full chain model. Supports field comparisons (eq, neq, gt, lt, gte, lte) and null checks (isNull, isNotNull). A raw expression fallback handles complex predicates (AND/OR, nested logic).
- `Q3.` **Resolved.** Yes — entries are reorderable via drag-and-drop with keyboard move controls (up/down). Order is semantically meaningful in `array()`.
- `Q4.` **Resolved.** Truncate at 10 items by default. Show summary "Showing 10 of N items" with expandable access to the full result.
- `Q5.` **Resolved.** Focused panel model — nested builder replaces the outer builder with a "Back to parent" action. Outer draft state is preserved. Not inline.

---

## Verification Strategy

All acceptance examples (AE-01 through AE-15) should be covered by automated tests where practical:

- **Unit tests** for state model, expression generator, and expression decomposer (AE-01 through AE-04, AE-11, AE-12, AE-14)
- **Component tests (React Testing Library)** for mode switching, confirmation dialogs, cross-array lookup helper, nested array context, and validation display (AE-05 through AE-10, AE-13, AE-15)
- **Integration tests** for end-to-end flow: user selects array target → configures builder → generates expression → preview shows correct result (AE-01, AE-02, AE-03)
- **Backward compatibility tests** for loading existing array DSL patterns (AE-11, AE-12)

Manual verification:
- Visual review of progressive disclosure UX and accordion behavior
- Verify scope context display in nested array scenarios
- Verify preview rendering for various array sizes and shapes

Build / typecheck / lint must pass for all touched areas.

---

## Task Generation Notes

This is a cross-cutting spec. Most tasks are `ui-task` type (React component and UI surface work). One architecture update task is `task` type.

Recommended decomposition and sequencing:

1. **State model + types** — Foundation. Define all array builder types, factory functions, and completion derivation. No UI.
2. **Expression generator** — Pure function, depends on state model.
3. **Expression decomposer** — Pure function, depends on state model.
4. **Collection layer UI: Mode selector + Map mode** — First visual surface. Depends on state model.
5. **Collection layer UI: Filter + Map and Build from Values** — Extends collection layer. Depends on T-04.
6. **Collection layer UI: Merge Branches** — Extends collection layer. Depends on T-04.
7. **Item template layer with chain builder reuse** — Core item editing. Depends on T-04.
8. **Mode switching logic** — Cross-cutting state transitions. Depends on T-04, T-05, T-06.
9. **Cross-array lookup helper** — Leaf-level guided helper. Depends on T-07.
10. **Nested array builder context** — Recursive builder. Depends on T-07.
11. **Validation model and feedback area** — Multi-level validation + display. Depends on T-07.
12. **Custom expression mode and backward compatibility** — Escape hatch + decomposer integration. Depends on T-03, T-04.
13. **Result preview for arrays** — Preview integration. Depends on T-02, T-07.
14. **Architecture update** — Update `ui-application.md`. Depends on all prior tasks being designed (not necessarily complete).

---

## Change Log

- Rev 1 — 2026-05-11
  - Initial draft
- Rev 2 — 2026-05-11
  - Resolved all 5 open questions (Q1–Q5)
  - Q1: Merge branches capped at 10 in UI (DSL unlimited; >10 uses Custom Expression)
  - Q2: Filter predicate uses simplified boolean-focused builder with raw expression fallback
  - Q3: Build from values entries reorderable via drag-and-drop + keyboard controls
  - Q4: Result preview shows first 10 items with "Showing 10 of N items" summary
  - Q5: Nested arrays open in focused panel model with "Back to parent" action
  - Updated Proposed Behavior: preview default 3→10, nested arrays inline→focused panel
  - Updated state model annotations for MergeBranchesState, BuildFromValuesState, FilterMapCollectionState
