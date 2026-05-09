# SPEC

## Title

Transform Chain Pipeline for Source Card Builder

---

## ID

FS-030

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-09
Last Updated: 2026-05-09
Type: ui

---

## Status

completed

---

## Revision

Rev: 1

---

## Summary

Extend the Source Card builder's inline transform model (FS-029) to support chaining multiple transforms on a single source slot as a flat vertical pipeline. Each transform step consumes the result of the previous step as its implicit first argument. The generated DSL remains standard nested function calls; only the authoring model and state representation change. This eliminates the need for users to manually nest expression slots several levels deep when building common multi-step transformations like math pipelines or string cleanup chains.

---

## Problem

The Source Card builder (FS-029) currently supports only a single inline transform per source slot. When users need to compose multiple sequential operations -- such as divide, then multiply, then round for a percentage calculation -- they must fall back to the raw DSL editor or manually construct deeply nested expression slots. Each level requires switching to expression mode, selecting a function, configuring arguments, then drilling into the next nested function.

Example: to build `round(multiply(divide(source("stats.mappedFields"), source("stats.totalFields")), 100), 2)`, the user currently cannot express this as a flat sequence of transform steps in the Source Card builder. Instead, the expression decomposes into a `FunctionCall` with nested `expression` slots, losing the intuitive "source -> transform -> transform -> transform" mental model.

---

## Goal

Allow users to chain multiple transforms on a source slot as a flat vertical pipeline in the Source Card UI. Each step shows only its configurable arguments (the first argument is implicit and auto-wired from the previous step's output). The UI enforces type compatibility when adding new steps. The generator produces nested DSL from the chain, and the decomposer can round-trip eligible nested expressions back into chained transform state.

---

## Assumptions

- FS-029 Source Card builder is implemented and stable (9/10 tasks done; T-10 cleanup is non-blocking).
- The `DSL_FUNCTION_CATALOG` structure (parameters, types, returnType) remains stable and provides sufficient metadata for type compatibility checks.
- The `InlineTransform` type is used only as ephemeral UI state; no persisted data stores `InlineTransform` objects directly (DSL strings are the persisted format). This makes the type shape change safe.
- The `SourceCardValueModeState` discriminated union (`directCopy`, `sourceWithTransform`, `functionCall`, `pendingConnector`) remains structurally sound; only `InlineTransform` changes within `sourceWithTransform` and `ArgumentSlot.transform`.

---

## Current Context

### State Model

`InlineTransform` (`expression-builder-state.ts`) currently represents a single function wrapping a source:

```ts
interface InlineTransform {
  readonly functionName: string;
  readonly args: readonly ArgumentSlot[];
}
```

Used in:
- `SourceWithTransformState.transform` -- top-level single-source-with-transform variant
- `ArgumentSlot` with `mode: 'source'` -- optional inline transform on a source within a function call

### Expression Generation

`source-card-expression-generator.ts` generates DSL by wrapping `source("path")` in a single function call:

```ts
function generateInlineTransform(sourcePath, transform): string {
  const sourceExpr = `source("${sourcePath}")`;
  const allArgs = [sourceExpr, ...extraArgs];
  return `${transform.functionName}(${allArgs.join(', ')})`;
}
```

### Decomposition

`source-card-decomposer.ts` recognizes `fn(source("path"), ...)` patterns for functions in `SINGLE_INPUT_TRANSFORMS` (upper, lower, trim, replace, replaceAll, length, substring, formatDate, round, abs, cast, default). Multi-step nesting like `round(multiply(...))` falls through to `FunctionCall` with `expression` slots.

### Source Card UI

`SourceCard.tsx` renders a single transform: function badge, argument form (via render prop), and remove button. No vertical pipeline rendering exists.

### Key Files

- `ui/src/features/mappings/lib/expression-builder-state.ts` -- state types
- `ui/src/features/mappings/lib/source-card-expression-generator.ts` -- DSL generation
- `ui/src/features/mappings/lib/source-card-decomposer.ts` -- DSL decomposition
- `ui/src/features/mappings/components/SourceCard.tsx` -- Source Card UI
- `ui/src/features/mappings/components/TransformFunctionPicker.tsx` -- function picker
- `ui/src/features/mappings/components/ArgumentForm.tsx` -- argument form
- `ui/src/features/mappings/components/ArgumentSlotInput.tsx` -- argument slot input
- `ui/src/features/mappings/components/UnifiedExpressionBuilder.tsx` -- builder integration
- `ui/src/lib/data/dsl-functions.ts` -- function catalog with parameter/return type metadata

---

## Scope

### In Scope

- Evolve `InlineTransform` from a single transform to a chain of `TransformChainStep` entries
- Update expression generator to iterate chain steps, each wrapping the previous result
- Update decomposer to walk nested function chains and produce chained transform state
- Implement non-linear fallback: when chain-walking encounters a non-chainable function, stop chaining and fall back to `FunctionCall` representation
- Render chained transforms as a vertical pipeline in the Source Card UI
- Allow users to add unlimited transform steps
- Keep each step's first argument implicit (auto-wired from previous step output)
- Render only the remaining configurable arguments per step
- Enforce type compatibility when adding a new transform step (filter picker by output type of previous step)
- Preserve backward compatibility: existing single-transform expressions decompose and render identically
- Round-trip: generate -> decompose -> generate produces the same DSL for all supported chain patterns

### Out of Scope

- Drag-and-drop transform reordering
- Arbitrary graph-style expression editing
- Changes to the DSL engine or function registry
- Conditional mode or Value Map mode changes
- New DSL functions
- Forcing non-linear expressions into the chain model

---

## Non-Goals

- No DSL or engine syntax changes; this is a UI/state-model enhancement only
- No attempt to visually represent arbitrary expression trees as chains
- No reordering of transform steps in this scope

---

## Relevant Areas

- `ui/src/features/mappings/lib/expression-builder-state.ts`
- `ui/src/features/mappings/lib/expression-builder-state.test.ts`
- `ui/src/features/mappings/lib/source-card-expression-generator.ts`
- `ui/src/features/mappings/lib/source-card-expression-generator.test.ts`
- `ui/src/features/mappings/lib/source-card-decomposer.ts`
- `ui/src/features/mappings/lib/source-card-decomposer.test.ts`
- `ui/src/features/mappings/components/SourceCard.tsx`
- `ui/src/features/mappings/components/SourceCard.test.tsx`
- `ui/src/features/mappings/components/TransformFunctionPicker.tsx`
- `ui/src/features/mappings/components/ArgumentForm.tsx`
- `ui/src/features/mappings/components/ArgumentSlotInput.tsx`
- `ui/src/features/mappings/components/UnifiedExpressionBuilder.tsx`
- `ui/src/features/mappings/components/UnifiedExpressionBuilder.test.tsx`
- `ui/src/features/mappings/components/UnifiedExpressionBuilder.integration.test.tsx`
- `ui/src/features/mappings/lib/index.ts` (barrel)
- `ui/src/lib/data/dsl-functions.ts` (consumed for type metadata)

---

## Dependencies / Blockers

- Depends on FS-029 (Source Card builder) being substantially complete. FS-029 T-01 through T-09 are done; T-10 (cleanup of deprecated components) is non-blocking.

---

## Constraints

- No DSL or engine syntax changes
- Existing expressions and saved states with a single inline transform must remain supported without migration
- Transform chaining applies only to the single-source transform path (`SourceWithTransform` and `ArgumentSlot.transform`), not to arbitrary multi-input function composition
- The first parameter of every chained transform is implicit and must not be rendered as an editable slot
- The UI must reuse existing parameter editors, hints, and dropdown behavior for additional transform arguments
- Non-linear expressions must break the chain and fall back to expression-mode representation rather than being forced into an incorrect pipeline model
- Generated expressions must pass engine validation
- Generated expressions must be decomposable back into builder state (round-trip)

---

## Proposed Behavior

### State Model

#### New Types

```ts
/** A single step in a transform chain. Same shape as the old InlineTransform. */
interface TransformChainStep {
  readonly functionName: string;
  /** Additional argument slots beyond the implicit first argument. */
  readonly args: readonly ArgumentSlot[];
}

/** A chain of transforms applied sequentially to a source value. */
interface InlineTransform {
  readonly steps: readonly TransformChainStep[];
}
```

For a single transform (e.g., `upper(source("x"))`), `steps` has one entry: `[{ functionName: 'upper', args: [] }]`.

For a chain (e.g., `round(multiply(divide(source("x"), source("y")), 100), 2)`), `steps` has three entries:
```ts
[
  { functionName: 'divide', args: [{ mode: 'source', path: 'stats.totalFields' }] },
  { functionName: 'multiply', args: [{ mode: 'literal', value: '100' }] },
  { functionName: 'round', args: [{ mode: 'literal', value: '2' }] },
]
```

Steps are ordered innermost-first (first step applied to the source, last step produces the final output).

#### Affected State Locations

- `SourceWithTransformState.transform: InlineTransform` -- top-level
- `ArgumentSlot` with `mode: 'source'` and `transform?: InlineTransform` -- nested within function call slots

### Chainable Transforms Set

A function is chainable when its first parameter is the "value being transformed" and remaining parameters are configuration. The `CHAINABLE_TRANSFORMS` set:

```
String:  upper, lower, trim, replace, replaceAll, length, substring
Date:    formatDate
Math:    add, subtract, multiply, divide, round, abs
Type:    cast
Null:    default
Array:   flatten, first, count
```

Functions NOT in this set (multi-input, iterators, comparators, accessors): `concat`, `coalesce`, `map`, `filter`, `find`, `array`, `merge`, `join`, `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `isNull`, `not`, `and`, `or`, `if`, `valueMap`, `source`, `item`, `parent`, `constant`, `external`, `static`.

### Expression Generation

The generator iterates chain steps, each wrapping the previous result:

```
Input: sourcePath = "stats.mappedFields", steps = [divide, multiply, round]

Step 0 (base):  source("stats.mappedFields")
Step 1 (divide): divide(source("stats.mappedFields"), source("stats.totalFields"))
Step 2 (multiply): multiply(divide(...), 100)
Step 3 (round): round(multiply(...), 2)
```

### Decomposition

The decomposer walks nested function calls from outermost to innermost through first arguments:

1. At each level, check if the function is in `CHAINABLE_TRANSFORMS`
2. If yes, record it as a chain step (function name + additional args as slots)
3. Walk into the first argument
4. When `source("path")` is reached, the chain is complete
5. If a non-chainable function or non-function node is encountered, chain-walking fails

#### Top-Level Heuristic (Backward Compatibility)

To preserve backward compatibility with existing single-transform decomposition:

- If the chain has **2+ steps**: always decompose as `SourceWithTransform` with the full chain
- If the chain has **exactly 1 step**: use the existing `SINGLE_INPUT_TRANSFORMS` heuristic to decide between `SourceWithTransform` and `FunctionCall`

This ensures that `divide(source("x"), source("y"))` alone still decomposes as `FunctionCall` (since `divide` is not in the narrower `SINGLE_INPUT_TRANSFORMS` set), while `multiply(divide(source("x"), source("y")), 100)` decomposes as `SourceWithTransform` with a 2-step chain.

#### Non-Linear Fallback

If chain-walking fails (non-chainable function encountered, non-source base, etc.), decomposition falls back:
- To `FunctionCall` if the root is a supported function call
- To `null` if the expression is entirely unsupported

Non-linear expressions are never forced into the chain model.

#### Argument Slot Chain Decomposition

Within a `FunctionCall`, argument slots also benefit from chain recognition. For `concat(round(multiply(source("x"), 100), 2), "suffix")`, the first slot decomposes as:

```ts
{ mode: 'source', path: 'x', transform: { steps: [
  { functionName: 'multiply', args: [{ mode: 'literal', value: '100' }] },
  { functionName: 'round', args: [{ mode: 'literal', value: '2' }] },
] } }
```

### User Flow

#### Chained Math Pipeline

1. User selects source `stats.mappedFields` -> Source Card appears (DirectCopy)
2. User clicks `[+ Add Transformation]` -> picks `divide`
3. Source Card shows transform pipeline:
   - **Step 1: divide** -- second arg slot is editable, user picks source `stats.totalFields`
4. User clicks `[+ Add Step]` at the bottom of the pipeline -> picks `multiply`
5. Pipeline now shows:
   - **Step 1: divide** -- args: source("stats.totalFields")
   - **Step 2: multiply** -- second arg slot: user types `100`
6. User clicks `[+ Add Step]` -> picks `round`
7. Pipeline now shows:
   - **Step 1: divide** -- args: source("stats.totalFields")
   - **Step 2: multiply** -- args: `100`
   - **Step 3: round** -- args: `2`
8. Generated expression: `round(multiply(divide(source("stats.mappedFields"), source("stats.totalFields")), 100), 2)`

#### String Cleanup Pipeline

1. User selects source `input.rawName` -> Source Card
2. User adds `trim` -> Step 1: trim (no additional args)
3. User adds `lower` -> Step 2: lower (no additional args)
4. Generated expression: `lower(trim(source("input.rawName")))`

#### Nested Slot Pipeline

1. User creates top-level `concat` via `[+ Add Transformation]`
2. In slot 1, user selects source `firstName` and adds chain: `upper`
3. In slot 2, user types literal `" "`
4. In slot 3, user selects source `lastName`
5. Generated expression: `concat(upper(source("firstName")), " ", source("lastName"))`

### Type Compatibility Enforcement

When the user clicks `[+ Add Step]` to append a new transform to the chain, the function picker filters by type compatibility:

1. Determine the current pipeline output type:
   - No chain steps yet: the source field's type (from schema metadata, or `any` if unknown)
   - After chain steps: the `returnType` of the last step's function (from `DSL_FUNCTION_CATALOG`)
2. For each candidate function, check if its first parameter type accepts the current output type
3. Compatible functions are selectable; incompatible functions are hidden or disabled
4. If the output type is `any` or cannot be determined, all chainable transforms are shown (no false restriction)

Type compatibility rules:
- `number` output -> only functions whose first param accepts `number` (e.g., `multiply`, `round`, `cast`, `add`)
- `string` output -> only functions whose first param accepts `string` (e.g., `upper`, `lower`, `trim`, `substring`)
- `any` output -> all chainable transforms shown
- First param type `any` -> accepts all output types

### Failure / Edge Behavior

- **Empty chain**: `InlineTransform` with `steps: []` is invalid; the generator returns `null` and the UI does not render a chain. The component should prevent this state.
- **Single step**: equivalent to the current single-transform behavior. No visual difference except the `[+ Add Step]` button is available.
- **Removing a step mid-chain**: removes the step and re-wires: the step after the removed one now takes input from the step before it (or from the source if the first step was removed).
- **Removing all steps**: reverts to `DirectCopy` state.
- **Non-chainable expression opened in builder**: decomposer falls back to `FunctionCall` or editor mode; no chain is shown.

---

## Acceptance Examples

### AE-01 -- Math pipeline: completion percentage

**Given**
- Source Card builder is open with source `stats.mappedFields` selected

**When**
- User adds transform `divide` with second arg `source("stats.totalFields")`
- User adds transform `multiply` with second arg `100`
- User adds transform `round` with second arg `2`

**Then**
- The pipeline renders 3 steps vertically: divide -> multiply -> round
- Each step shows only its additional arguments (not the implicit first arg)
- The generated expression is `round(multiply(divide(source("stats.mappedFields"), source("stats.totalFields")), 100), 2)`

### AE-02 -- Type compatibility filtering

**Given**
- A chain with one step `divide` (output type: `number`)
- User clicks `[+ Add Step]`

**When**
- The function picker opens

**Then**
- Functions whose first param accepts `number` are selectable (e.g., `multiply`, `round`, `abs`, `cast`)
- Functions whose first param requires `string` are excluded (e.g., `upper`, `lower`, `trim`)
- If type information is unavailable (`any`), all chainable transforms are shown

### AE-03 -- Backward compatibility: single transform

**Given**
- An existing rule with expression `upper(source("order.name"))`

**When**
- The decomposer processes this expression

**Then**
- Decomposition produces `SourceWithTransform` with a single-step chain: `[{ functionName: 'upper', args: [] }]`
- The UI renders identically to the current single-transform presentation (plus an available `[+ Add Step]` button)
- The generator round-trips to `upper(source("order.name"))`

### AE-04 -- Decomposition of eligible nested expression

**Given**
- An existing rule with expression `round(multiply(divide(source("stats.mappedFields"), source("stats.totalFields")), 100), 2)`

**When**
- The decomposer processes this expression

**Then**
- Decomposition produces `SourceWithTransform` with:
  - `sourcePath: "stats.mappedFields"`
  - `transform.steps`: divide (args: source("stats.totalFields")), multiply (args: 100), round (args: 2)
- The UI renders a 3-step vertical pipeline
- The generator round-trips to the same expression

### AE-05 -- Non-linear expression fallback

**Given**
- An existing rule with expression `round(concat(source("a"), source("b")), 2)`

**When**
- The decomposer processes this expression

**Then**
- Chain-walking encounters `concat` (not in `CHAINABLE_TRANSFORMS`) at the inner level
- Decomposition falls back to `FunctionCall` representation (not a chain)
- The UI renders as a function form with argument slots, not as a chain pipeline

### AE-06 -- Round-trip: string cleanup chain

**Given**
- State: `SourceWithTransform` with sourcePath `input.rawName` and steps: `[trim, lower]`

**When**
- Generator produces DSL, decomposer decomposes it back

**Then**
- Generated: `lower(trim(source("input.rawName")))`
- Decomposed: same SourceWithTransform state with 2-step chain
- Round-trip verified

### AE-07 -- Nested slot with chain

**Given**
- Expression: `concat(round(multiply(source("x"), 100), 2), "suffix")`

**When**
- The decomposer processes this expression

**Then**
- Top-level: `FunctionCall` with functionName `concat`
- Slot 0: `{ mode: 'source', path: 'x', transform: { steps: [multiply(args: 100), round(args: 2)] } }`
- Slot 1: `{ mode: 'literal', value: 'suffix' }`
- Generator round-trips to the same expression

### AE-08 -- Backward compatibility: divide alone stays FunctionCall

**Given**
- An existing rule with expression `divide(source("a"), source("b"))`

**When**
- The decomposer processes this expression

**Then**
- Chain has 1 step (divide), but divide is NOT in `SINGLE_INPUT_TRANSFORMS`
- Decomposition produces `FunctionCall` (not SourceWithTransform)
- Preserves backward compatibility with FS-029 behavior

### AE-09 -- Remove step mid-chain

**Given**
- A 3-step chain: divide -> multiply -> round

**When**
- User removes the `multiply` step

**Then**
- The chain becomes: divide -> round
- Round takes the output of divide as its first argument
- Generated expression: `round(divide(source("stats.mappedFields"), source("stats.totalFields")), 2)`

### AE-10 -- Remove all steps reverts to DirectCopy

**Given**
- Source Card with source `order.name` and a 2-step chain: trim -> upper

**When**
- User removes `upper`, then removes `trim`

**Then**
- Source Card reverts to DirectCopy state
- Generated expression: `source("order.name")`

---

## Open Questions

- none

---

## Verification Strategy

- **Unit tests** for `TransformChainStep`/`InlineTransform` new type shape, factory functions, and type guards (`expression-builder-state.test.ts`)
- **Unit tests** for expression generation from chain state: math pipeline (AE-01), string pipeline (AE-06), single step (AE-03), nested slot (AE-07) (`source-card-expression-generator.test.ts`)
- **Unit tests** for decomposition: chain recognition (AE-04), non-linear fallback (AE-05), backward compat (AE-03, AE-08), nested slot chain (AE-07) (`source-card-decomposer.test.ts`)
- **Round-trip tests**: generate -> decompose -> generate for all AE cases (`source-card-decomposer.test.ts`)
- **Component tests** for SourceCard chain rendering: vertical pipeline, add step, remove step (AE-09, AE-10) (`SourceCard.test.tsx`)
- **Component tests** for type-filtered function picker (AE-02)
- **Integration tests** for full builder flow: source selection -> chain building -> apply -> re-open -> chain hydrated (`UnifiedExpressionBuilder.integration.test.tsx`)
- **Typecheck and lint** pass on all new/modified files
- **Manual verification** of keyboard accessibility and screen reader labels on chain steps

Map to AE IDs: AE-01 through AE-10 require automated coverage. No manual-only acceptance examples.

---

## Task Generation Notes

This is a `ui`-type spec. All component and state tasks are `ui-task`. The architecture update task is `task`.

Decomposition:

1. **State model** (T-01) -- `TransformChainStep` type, `InlineTransform` evolution to chain, factory/guard updates, existing test migration
2. **Expression generation** (T-02) -- update generator to iterate chain steps; new chain-specific tests; depends on T-01
3. **Decomposition** (T-03) -- `CHAINABLE_TRANSFORMS` set, chain-walking algorithm, non-linear fallback, round-trip tests; depends on T-01
4. **Chain UI component** (T-04) -- render chain steps as vertical pipeline in SourceCard, add/remove step UX; depends on T-01
5. **Type compatibility** (T-05) -- output type tracking, picker filtering; depends on T-01, T-04
6. **Integration and backward compatibility** (T-06) -- wire chain into UnifiedExpressionBuilder, update all InlineTransform consumers, verify AE-03 and AE-08; depends on T-02, T-03, T-04, T-05
7. **Architecture update** (T-07) -- update ui-application.md with transform chain model; depends on T-06

Sequencing: T-01 -> T-02 + T-03 + T-04 (parallel) -> T-05 (depends on T-04) -> T-06 -> T-07

---

## Change Log

- Rev 1 -- 2026-05-09
  - Initial draft from requirements
