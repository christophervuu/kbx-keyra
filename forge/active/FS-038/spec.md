# SPEC

## Title

Redesign the Mapping Editor Builder Panel — Question-First Chain Model

---

## ID

FS-038

---

## Metadata

Owner: @chris
Reviewers: TBD
Created: 2026-05-09
Last Updated: 2026-05-10
Type: ui

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Redesign the Mapping Editor's Builder panel to start from the user's question — "How is this target property's value derived?" — instead of asking users to choose between mapping modes (Value/Conditional/Value Map) upfront. The redesign replaces the current 3-mode tab model with a progressive, chain-based authoring flow that begins with Source or Static entry points, makes direct copy the default complete state, and reveals advanced logic (transformations, conditions, value maps) only when the user explicitly opts in via "+ Add logic". Expression and Result sections are pinned near the top for persistent visibility, completed steps collapse to readable summaries, and the overall flow is optimized to minimize Time to First Successful Mapping (TTFSM) for non-technical mapping authors.

---

## Problem

The current Builder panel starts too close to implementation terminology and internal engine structure:

1. **Premature mode choice.** Users must choose between Value, Conditional, and Value Map tabs before expressing intent. This forces a structural decision too early, increasing cognitive load for the common path (direct source copy).

2. **The common path is not short enough.** A simple `source("field")` mapping — the most frequent pattern — requires entering Value mode, adding a source, and recognizing that no transform is needed. There is no visual signal that the mapping is already complete once a source is selected.

3. **Expression and Result are buried.** `LiveExpressionDisplay` and `LiveResultDisplay` sit at the bottom of the builder, below mode-specific content and transform pipelines. Users must scroll to see the generated DSL and evaluation result — the two most important feedback signals.

4. **Suggested Sources row adds noise.** The heuristic suggested-sources row is redundant when SUGGEST will generate expressions directly. It occupies prime visual real estate with low-confidence suggestions.

5. **Disconnected mental models.** Value mode, Conditional mode, and Value Map mode are presented as separate, peer-level concepts. In reality, most mappings start with a source value and progressively add transformations, conditions, or lookup logic. The current model forces users to pick a track rather than progressively refine.

6. **Transformation UX is function-signature-oriented.** The current transform step presentation exposes raw function parameter lists. For example, `concat` forces the user to reason about which parameter slot the current value occupies. A task-oriented model where the current value is implicit and additional inputs are explicitly added would be more intuitive.

7. **Action/state clutter.** The header row, mode toggle, suggested sources, builder surface, and always-visible sections compete for attention without a clear visual hierarchy.

---

## Goal

Reduce TTFSM by restructuring the Builder panel around the user's mental model:

1. **Start from intent, not mode.** The first question is "Where does this value come from?" — Source or Static. Not "What type of mapping is this?"

2. **Make the common path a two-step completion.** Select a source field → mapping is done. No additional clicks, no mode confirmation, no transforms required.

3. **Keep feedback visible.** Expression and Result sections are pinned near the top so the user always sees what they're building and what it produces.

4. **Use progressive disclosure for advanced logic.** Transformations, conditions, and value maps appear only when the user clicks "+ Add logic" — not as peer-level tabs.

5. **Use a chain model for composition.** Every step operates on the current value. Additional inputs are added explicitly. Users think in terms of "take this value, then do X to it, then do Y" — not disconnected mode switches.

6. **Keep advanced capability accessible.** The redesign should not hide power features — it should make them discoverable through progressive refinement rather than upfront choice.

---

## Assumptions

- The mapping engine DSL and function catalog remain unchanged
- The Builder/Editor toggle (raw DSL mode) remains a peer-level switch
- The Apply/Save two-tier model remains unchanged
- The ScalarFieldBuilder shell (drop zone, apply button, navigation) is preserved
- Drag-and-drop source insertion continues to work
- The existing expression generator and decomposer patterns are the right abstraction boundary — new generator and decomposer are added alongside, legacy decomposers are retained during migration and retired in a follow-up cleanup spec
- FS-029/FS-030 chain model patterns (TransformChainStep, InlineTransform, CHAINABLE_TRANSFORMS, type compatibility) are reused where applicable, but the Builder component itself is a new component (`ChainBuilder`) — the mental model shift justifies a clean break rather than evolving the existing SourceCard in-place
- The product-level constraint that AI suggestions are never auto-committed remains

---

## Current Context

### Current Builder Information Architecture

The Builder panel uses a 3-mode tabbed model inside `UnifiedExpressionBuilder`:

- **Value mode** (default): Source chip picker or static value toggle, with an optional transform pipeline and FS-029/FS-030 Source Card surface
- **Conditional mode**: IF/THEN/ELSE form builder with grouped conditions and nested else-if branches
- **Value Map mode**: Source field + key-value mapping table + fallback

Mode selection happens at the top of the builder via segmented tabs. Switching modes requires a confirmation dialog because state is lost.

### Current State Model

`ExpressionBuilderState` is a discriminated union on `mode: 'value' | 'conditional' | 'valueMap'`. Value mode has two sub-models:

- Legacy pipeline: `SourceSelection[]` + `TransformStep[]`
- FS-029 Source Card: `SourceCardValueModeState` (DirectCopy / SourceWithTransform / FunctionCall / PendingConnector)

The Source Card model (FS-029/FS-030) already supports:
- Direct copy as a first-class state
- Inline transform chains (`TransformChainStep[]` in `InlineTransform`)
- Type-compatible add-step filtering
- Chain generation and decomposition

### Current Component Hierarchy

```
ScalarFieldBuilder
  Header (type badge, path, Builder/Editor toggle, required/optional, status)
  Suggested Sources (heuristic, up to 5)
  Expression area (drop zone):
    UnifiedExpressionBuilder (builder mode)
      Mode tabs: Value | Conditional | Value Map
      Mode-specific content (SourceCard, ConditionalModeBuilder, ValueMapModeBuilder)
      LiveExpressionDisplay
      LiveResultDisplay
    RawDslEditor (editor mode)
  Footer (AI placeholders, Clear, Next unmapped, Apply)
```

### Key Files

- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/UnifiedExpressionBuilder.tsx`
- `ui/src/features/mappings/components/SourceCard.tsx`
- `ui/src/features/mappings/components/BuilderEntryActions.tsx`
- `ui/src/features/mappings/components/ConditionalModeBuilder.tsx`
- `ui/src/features/mappings/components/ValueMapModeBuilder.tsx`
- `ui/src/features/mappings/components/TransformPipeline.tsx`
- `ui/src/features/mappings/components/TransformFunctionPicker.tsx`
- `ui/src/features/mappings/components/LiveExpressionDisplay.tsx`
- `ui/src/features/mappings/components/LiveResultDisplay.tsx`
- `ui/src/features/mappings/lib/expression-builder-state.ts`
- `ui/src/features/mappings/lib/pipeline-expression-generator.ts`
- `ui/src/features/mappings/lib/pipeline-decomposer.ts`
- `ui/src/features/mappings/lib/source-card-expression-generator.ts`
- `ui/src/features/mappings/lib/source-card-decomposer.ts`
- `ui/src/features/mappings/lib/transform-chain-utils.ts`

### Architecture Coverage

The Builder is documented in `forge/architecture/ui-application.md` under "Expression Builder Architecture" (FS-011, FS-023) and subsequent subsections. This spec will require an architecture update to reflect the new information architecture.

---

## Scope

### In Scope

1. **New entry-point model** replacing 3-mode tabs: Source (default), Static, External (future placeholder)
2. **New Builder shell layout**: redesigned header rows, AI action bar, pinned Expression/Result, removal of suggested-sources row
3. **Source entry flow**: source field selection → direct copy as default complete state → optional "+ Add logic"
4. **Static entry flow**: literal value input → target-type validation → terminal unless user adds logic
5. **"+ Add logic" progressive disclosure**: reveals Transformation, Condition, Value map as refinement options
6. **Chain-model transformation steps**: implicit current value, explicit additional params, task-oriented presentation
7. **Redesigned Condition builder**: required else, null/empty/0 branch returns, full chains in branches, collapsible summaries
8. **Redesigned Value Map builder**: switch-statement UX, required default case
9. **Inline editing with collapsible step summaries**: completed steps collapse to one-line summaries, expand on click
10. **New expression generator** adapted for the chain model
11. **New expression decomposer** adapted for the chain model with backward compatibility
12. **ScalarFieldBuilder integration** with the new Builder
13. **ExpressionBuilderPanel (Rules View) integration** with the new Builder

### Out of Scope

- External entry point implementation (future-facing; placeholder only)
- AI suggestion, explain, or fix implementation (buttons are placed but remain disabled/placeholder)
- Changes to the mapping engine DSL or function catalog
- Changes to the Apply/Save two-tier model
- Changes to drag-and-drop source insertion mechanics
- Changes to the RawDslEditor (raw DSL mode)
- Changes to the Builder/Editor toggle mechanism
- ArrayMappingBuilder or ObjectSummaryPanel redesign
- Changes to the EditorTopBar, TargetWorklist, or SourceSchemaPanel
- Mobile or responsive layout changes

---

## Non-Goals

- This is not a general Mapping Editor redesign — it is scoped to the Builder panel's information architecture and interaction model
- This does not implement AI-powered features (Suggest/Explain/Fix) — it only places the UI affordances
- This does not change the underlying DSL or engine behavior
- This does not introduce new mapping capabilities — it reorganizes how existing capabilities are accessed
- This does not aim for pixel-perfect visual design — it establishes the structural and interaction model that visual polish can be applied to

---

## Relevant Areas

- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/UnifiedExpressionBuilder.tsx`
- `ui/src/features/mappings/components/SourceCard.tsx`
- `ui/src/features/mappings/components/BuilderEntryActions.tsx`
- `ui/src/features/mappings/components/ConditionalModeBuilder.tsx`
- `ui/src/features/mappings/components/ValueMapModeBuilder.tsx`
- `ui/src/features/mappings/components/TransformPipeline.tsx`
- `ui/src/features/mappings/components/TransformFunctionPicker.tsx`
- `ui/src/features/mappings/components/LiveExpressionDisplay.tsx`
- `ui/src/features/mappings/components/LiveResultDisplay.tsx`
- `ui/src/features/mappings/components/ExpressionBuilderPanel.tsx`
- `ui/src/features/mappings/lib/expression-builder-state.ts`
- `ui/src/features/mappings/lib/pipeline-expression-generator.ts`
- `ui/src/features/mappings/lib/pipeline-decomposer.ts`
- `ui/src/features/mappings/lib/source-card-expression-generator.ts`
- `ui/src/features/mappings/lib/source-card-decomposer.ts`
- `ui/src/features/mappings/lib/transform-chain-utils.ts`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- Depends on FS-030 (transform chain pipeline model) being completed — provides the foundation chain types
- Depends on FS-027 (static value inputType, clear mapping, live result wiring) being completed — provides inputType model and static DSL generation
- Depends on FS-029 (Source Card) being completed — provides DirectCopy/SourceWithTransform patterns
- Depends on FS-025 (builder state hydration, conditional branch transforms) being completed — provides hydration and InlinePipelineBuilder patterns

---

## Constraints

- Must produce valid DSL expressions consumable by the existing engine
- Must preserve backward compatibility: existing saved expressions must decompose into the new builder model
- Must maintain the Builder/Editor toggle contract — switching to Editor shows the generated DSL, switching back decomposes
- Must keep Expression and Result sections visible without scroll in the common case (source + 0-1 logic steps)
- Must work within the existing resizable panel layout (minimum builder panel width ~300px)
- TypeScript strict mode, zero-error lint/typecheck
- No new external dependencies
- Desktop-first (1024px minimum viewport)

---

## Proposed Behavior

### Builder Information Architecture

The redesigned Builder replaces the 3-mode tabbed model with a progressive chain-based flow:

```
┌─────────────────────────────────────────────────────┐
│ [string] customer.full_name [required]  [Builder|Editor] │
├─────────────────────────────────────────────────────┤
│ [Suggest] [Explain] [Fix]                    [Clear] │
├─────────────────────────────────────────────────────┤
│ Expression: concat(source("first"), " ", source("last")) │
│ Result: "John Smith"                                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Entry: ( Source )  Static  External                │
│                                                     │
│  ┌─ Source Card ─────────────────────────────┐     │
│  │ Source: customer.first_name               │     │
│  │ Direct copy                               │     │
│  │ [+ Add logic]                             │     │
│  └───────────────────────────────────────────┘     │
│                                                     │
│                         [Next unmapped ->] [Apply]  │
└─────────────────────────────────────────────────────┘
```

#### Entry Points

Three top-level entry points replace the mode tabs:

| Entry Point | Description | Default? | Visual Weight |
|---|---|---|---|
| **Source** | Value derived from a source schema field | Yes (default, most prominent) | Primary visual treatment |
| **Static** | Value is a literal constant | Secondary | Normal weight |
| **External** | Value from an external source | Future | Muted/disabled |

Entry points are rendered as a segmented control or radio group. Source is pre-selected.

#### Pinned Feedback Sections

Two always-visible sections are pinned between the AI action bar and the entry-point area:

1. **Expression** — shows the generated DSL expression. Updates live as the user builds. Clicking it enters Editor mode (same as current `LiveExpressionDisplay`).
2. **Result** — shows the evaluated result when source data is available. Updates live via `useExpressionPreview`. Shows placeholder when no source data is loaded.

These sections never scroll out of view. They sit above the builder content area.

### User Flow

#### Flow 1 — Direct Source Copy (Most Common)

1. User selects a target field → Builder panel opens with Source entry pre-selected
2. User selects a source field (via source panel click/drag, or search within builder)
3. Builder shows:
   ```
   ┌─ Source Card ─────────────────────┐
   │ Source: customer.first_name       │
   │ Direct copy                       │
   │ [+ Add logic]                     │
   └───────────────────────────────────┘
   ```
4. Expression section shows: `source("customer.first_name")`
5. Result section shows evaluated value (if source data loaded)
6. **Mapping is complete.** User clicks Apply.

**TTFSM optimization:** Two actions (select target, select source) → mapping done. No mode choice, no transform decision, no extra clicks.

#### Flow 2 — Source with Transformation

1. Steps 1-3 from Flow 1
2. User clicks "+ Add logic" → refinement picker appears:
   ```
   [Transformation]  [Condition]  [Value map]
   ```
3. User clicks "Transformation" → transform step appends to chain:
   ```
   ┌─ Source Card ─────────────────────┐
   │ Source: customer.first_name       │
   │                                   │
   │  Step 1: upper                    │
   │    (current value → uppercased)   │
   │                                   │
   │  [+ Add step]                     │
   └───────────────────────────────────┘
   ```
4. Expression updates to: `upper(source("customer.first_name"))`
5. User can add more steps. Each step operates on the previous output.
6. User clicks Apply.

#### Flow 3 — Source with Condition

1. Steps 1-3 from Flow 1
2. User clicks "+ Add logic" → "Condition"
3. Condition builder appears inline:
   ```
   ┌─ Condition ───────────────────────┐
   │ IF  [current value ▾]  [equals]  ["premium"]  │
   │     (Change input)                │
   │ THEN  [source.first_name]         │
   │ ELSE  ["N/A"]                     │
   │                                   │
   │ [+ Add else-if]                   │
   └───────────────────────────────────┘
   ```
4. The left operand defaults to the current accumulated value (source or source + transforms) — shown explicitly
5. "Change input" affordance below the left operand lets the user switch to a different source field
6. Else is required — the builder pre-creates the else branch
5. Both THEN and ELSE support full chains (source + transforms)
6. Once complete, the condition collapses to summary:
   ```
   Condition: if tier = "premium" then first_name else "N/A"
   ```

#### Flow 4 — Source with Value Map

1. Steps 1-3 from Flow 1
2. User clicks "+ Add logic" → "Value map"
3. Value map builder appears inline:
   ```
   ┌─ Value Map ───────────────────────┐
   │ When source.status equals:        │
   │                                   │
   │  "A"  →  "Active"                │
   │  "I"  →  "Inactive"              │
   │  "P"  →  "Pending"               │
   │  [+ Add case]                     │
   │                                   │
   │  Default →  "Unknown"             │
   └───────────────────────────────────┘
   ```
4. Default case is required — always present
5. Feels like a user-friendly switch statement

#### Flow 5 — Static Value

1. User selects a target field → Builder panel opens
2. User switches entry point to "Static"
3. Builder shows a literal value input:
   ```
   ┌─ Static Value ────────────────────┐
   │ Value: [ "ACME Corp"            ] │
   │ Type: string ✓                    │
   └───────────────────────────────────┘
   ```
4. Input is validated against the target field's type
5. Expression shows: `"ACME Corp"`
6. **Mapping is complete.** User clicks Apply.
7. Optionally, user can click "+ Add logic" to add a condition or value map around the static value

#### Flow 6 — Multi-Step Chain

1. User selects source field → direct copy
2. User clicks "+ Add logic" → "Transformation"
3. Adds `trim` step → `trim(source("name"))`
4. Clicks "+ Add step" → adds `upper` → `upper(trim(source("name")))`
5. Clicks "+ Add step" → adds `substring(0, 50)` → `substring(upper(trim(source("name"))), 0, 50)`
6. Each step shows one-line summary when not being edited
7. Expression and Result update after each step

### System Behavior

#### State Model

The redesigned builder uses a new top-level state type:

```typescript
type BuilderEntryType = 'source' | 'static' | 'external';

interface ChainBuilderState {
  entryType: BuilderEntryType;
  // Source entry
  sourcePath?: string;
  // Static entry
  staticValue?: StaticValue;
  // Chain of refinement steps (optional, progressive)
  logicSteps: LogicStep[];
  // Tracks which step is expanded for editing
  expandedStepIndex: number | null;
}

type LogicStep =
  | TransformLogicStep
  | ConditionLogicStep
  | ValueMapLogicStep;

interface TransformLogicStep {
  kind: 'transform';
  functionName: string;
  args: ArgumentSlot[]; // additional args beyond implicit current value
}

interface ConditionLogicStep {
  kind: 'condition';
  condition: ConditionGroup;
  thenBranch: ChainBranch;
  elseBranch: ChainBranch;
}

interface ValueMapLogicStep {
  kind: 'valueMap';
  mappings: ValueMapEntry[];
  defaultValue: ChainBranch;
}

type ChainBranch =
  | { kind: 'static'; value: StaticValue }
  | { kind: 'source'; path: string; steps: TransformLogicStep[] }
  | { kind: 'expression'; raw: string };
```

This model treats logic as a chain of steps applied to a base value, rather than disconnected modes.

#### Chain Model Semantics

- The selected source (or static value) establishes the **base value**
- Each `LogicStep` operates on the current value in the chain
- `TransformLogicStep`: applies a function where the current value is the implicit first argument
- `ConditionLogicStep`: wraps the entire expression in an `if()` — the condition tests, then/else branches produce the output. The condition left operand **defaults to the current accumulated value** (the source, or source + prior transforms) and is shown explicitly in the UI (e.g., "If current value equals..."). A "Change input" affordance allows switching the left operand to a different source field if needed.
- `ValueMapLogicStep`: wraps the expression in a `valueMap()` — the base value is the lookup key
- **Post-condition and post-value-map chaining:** After a condition or value map step, the output becomes the new current value. Users can add further transform steps after a condition or value map to transform the result. The UX makes this explicit by showing "Current value: output of condition" (or similar) as the input label for the next step. This avoids artificial dead ends and is coherent with the DSL (a condition returns a value, so transforming it is valid).
- Multiple steps can be chained: Source → Transform → Transform → Condition → Transform (transforms the conditional output)
- Chain ordering is semantic: each step feeds into the next

#### Expression Generation

Generation walks the chain from base to last step:

1. **Base**: `source("path")` (source entry) or literal DSL (static entry)
2. **Transform steps**: each wraps the previous expression as the first argument: `fn(prev, ...additionalArgs)`
3. **Condition step**: `if(condition, thenExpr, elseExpr)` wrapping the accumulated expression (condition operands may reference it)
4. **Value Map step**: `valueMap(prev, { ... }, default)`

The output is a single DSL expression string, identical to what the current generator produces for equivalent logic.

#### Expression Decomposition

Decomposition must handle:

1. **New chain expressions** generated by this builder
2. **Legacy expressions** generated by the FS-023/FS-029/FS-030 model
3. **Hand-written DSL** from the raw editor

Strategy:
- Outer `if()` → detect as source + condition logic step (or fall back to expression branches)
- Outer `valueMap()` → detect as source + value map logic step
- Nested function calls → walk innermost to find `source()` or literal base, decompose outer calls as transform chain steps
- Bare `source("path")` → direct copy (no logic steps)
- Bare literal → static entry (no logic steps)
- Unrecognizable → fall back to Editor mode with complex-expression warning (same as current behavior)

Backward compatibility: existing saved expressions must decompose into the new model. The `CHAINABLE_TRANSFORMS` list and chain-walking logic from FS-030 are reused.

#### Collapsible Step Summaries

When a logic step is complete (all required fields filled), it collapses to a compact one-line summary:

| Step Type | Collapsed Summary Example |
|---|---|
| Transform | `upper → UPPERCASED` |
| Transform chain | `trim → upper → substring(0, 50)` |
| Condition | `if tier = "premium" then first_name else "N/A"` |
| Value map | `map status: A→Active, I→Inactive, ... (default: Unknown)` |

Clicking a collapsed summary expands it for editing. Only one step can be expanded at a time. The Expression and Result sections remain pinned and visible regardless of which step is expanded.

### Failure / Edge Behavior

1. **No source data loaded:** Result section shows "Load source data to see results" placeholder. Expression section still updates live.

2. **Invalid static value for target type:** Type validation indicator shows error. Apply button remains disabled. Validation message appears inline (e.g., "Expected number, got string").

3. **Expression decomposition failure:** Builder falls back to Editor mode with "Complex expression — edit in Editor mode" warning. This is unchanged from current behavior.

4. **Empty state (no target selected):** `BuilderEmptyState` renders. Unchanged from current behavior.

5. **Switching entry type with existing state:** If the user switches from Source to Static (or vice versa) when logic steps exist, a confirmation dialog warns that steps will be cleared. Switching between source fields within Source mode preserves the chain if the field type is compatible; otherwise prompts.

6. **External entry point:** Renders as a disabled option with tooltip "Coming soon — external data sources in a future release." No interaction.

7. **Chain step with missing required args:** Step remains expanded. Apply button is disabled. Inline validation highlights the missing field.

8. **Condition without else branch:** Not possible — else is required and always present. The builder initializes else with an empty value that must be filled before Apply is valid.

9. **Value map without default:** Not possible — default case is always present and initialized.

10. **Builder width constrained (~300px):** All layouts must remain usable at minimum panel width. Collapsible summaries help by reducing vertical space. Step forms should use single-column layout at narrow widths.

---

## Acceptance Examples

### AE-01 — Direct source copy is two-step completion

**Given**
- A target field `customer.full_name` (string, required) is selected
- Source entry point is pre-selected

**When**
- User clicks source field `source.firstName` in the source panel

**Then**
- Source Card shows: `Source: source.firstName` with `Direct copy` label and `[+ Add logic]` button
- Expression section shows: `source("source.firstName")`
- Result section shows evaluated value (if source data present)
- Apply button is enabled
- No mode selection, transform decision, or additional clicks required

### AE-02 — Static value as terminal path

**Given**
- A target field `order.channel` (string) is selected

**When**
- User switches entry point to "Static"
- User enters `"WEB"` in the value input

**Then**
- Expression section shows: `"WEB"`
- Type validation shows green checkmark (string matches target type string)
- Apply button is enabled
- No additional steps required

### AE-03 — Expression and Result pinned above builder content

**Given**
- Builder panel is open with any mapping in progress
- Source data is loaded

**When**
- User scrolls the builder content area (e.g., a long condition form)

**Then**
- Expression and Result sections remain visible at their fixed position
- They do not scroll with the builder content

### AE-04 — Progressive disclosure via "+ Add logic"

**Given**
- A source field is selected showing the Source Card with "Direct copy"

**When**
- User clicks "+ Add logic"

**Then**
- Three options appear: `[Transformation]` `[Condition]` `[Value map]`
- No other UI changes occur until user selects one

### AE-05 — Chain-model transformation with implicit current value

**Given**
- Source `customer.name` is selected
- User clicks "+ Add logic" → "Transformation" → selects `upper`

**When**
- The transform step renders

**Then**
- Step shows function name `upper` with description "Converts text to uppercase"
- No parameter form is shown (upper has no additional parameters beyond implicit current value)
- Expression updates to: `upper(source("customer.name"))`

### AE-06 — Multi-parameter transform with explicit additional inputs

**Given**
- Source `order.amount` is selected
- User clicks "+ Add logic" → "Transformation" → selects `multiply`

**When**
- The transform step renders

**Then**
- Step shows function name `multiply`
- One additional parameter slot is shown: "Multiply by: [___]"
- The current value (source) is implicit — NOT shown as a parameter to fill
- User enters `100` → Expression updates to: `multiply(source("order.amount"), 100)`

### AE-07 — Concat with explicit additional inputs

**Given**
- Source `customer.first_name` is selected
- User clicks "+ Add logic" → "Transformation" → selects `concat`

**When**
- The transform step renders

**Then**
- Step shows function name `concat` with description "Joins values together"
- Current value is treated as the base (implicit first input)
- `[+ Add input]` button allows adding more values to concatenate
- User adds literal `" "` and source `customer.last_name`
- Expression: `concat(source("customer.first_name"), " ", source("customer.last_name"))`

### AE-08 — Condition with required else and collapsible summary

**Given**
- Source `customer.tier` is selected
- User clicks "+ Add logic" → "Condition"

**When**
- Condition builder renders inline

**Then**
- IF row is ready for input (left operand defaults to current value, shown explicitly as "current value" with "Change input" affordance)
- THEN branch is empty, ready for input
- ELSE branch is present (required) and empty, ready for input
- Apply is disabled until both THEN and ELSE have values

**When** (continued)
- User fills: IF tier = "premium" THEN "VIP" ELSE "Standard"
- User clicks outside the condition step (or collapses it)

**Then**
- Condition collapses to summary: `if tier = "premium" then "VIP" else "Standard"`
- Summary is clickable to re-expand for editing
- Expression: `if(eq(source("customer.tier"), "premium"), "VIP", "Standard")`

### AE-09 — Value map with required default and switch-statement UX

**Given**
- Source `order.status_code` is selected
- User clicks "+ Add logic" → "Value map"

**When**
- Value map builder renders inline

**Then**
- "When source.status_code equals:" header shows
- Default row is always present: `Default → [___]`
- `[+ Add case]` button adds mapping rows
- User adds: `"A" → "Active"`, `"I" → "Inactive"`, Default → `"Unknown"`
- Expression: `valueMap(source("order.status_code"), {"A": "Active", "I": "Inactive"}, "Unknown")`

### AE-10 — Collapsible step summaries with single-step expansion

**Given**
- Source with two transform steps: `trim` then `upper`

**When**
- Both steps are complete

**Then**
- Step 1 shows collapsed summary: `trim`
- Step 2 shows collapsed summary: `upper`
- Only one step is expanded at a time

**When** (continued)
- User clicks the collapsed Step 1 summary

**Then**
- Step 1 expands for editing
- Step 2 collapses (if it was expanded)
- Expression and Result remain pinned and visible

### AE-11 — Suggested-sources row removed

**Given**
- Builder panel renders for any target field

**Then**
- No "Suggested Sources" row appears
- AI action bar shows: `[Suggest]` `[Explain]` `[Fix]` and `[Clear]` buttons

### AE-12 — AI action bar placement with disabled buttons

**Given**
- Builder panel renders

**Then**
- Below the header row: `[Suggest]` `[Explain]` `[Fix]` buttons (disabled, placeholder) on left, `[Clear]` button (functional when mapped) on right
- Suggest has tooltip: "AI-powered expression suggestion — available in a future release"

### AE-13 — Entry-type switch with confirmation

**Given**
- User has a source selected with two transform steps applied

**When**
- User switches entry point to "Static"

**Then**
- Confirmation dialog: "Switching to Static will clear your current mapping steps. Continue?"
- Confirm → clears source and steps, shows static value input
- Cancel → returns to Source with existing state preserved

### AE-14 — Backward compatibility — legacy expression decomposition

**Given**
- An existing mapping has expression: `upper(source("customer.name"))`

**When**
- User selects the target field (triggering builder hydration)

**Then**
- Builder hydrates to: Source entry, source = `customer.name`, one transform step = `upper`
- Source Card shows with transform chain
- Expression and Result show correctly

### AE-15 — Backward compatibility — conditional expression decomposition

**Given**
- An existing mapping has expression: `if(eq(source("tier"), "gold"), "VIP", "Standard")`

**When**
- User selects the target field

**Then**
- Builder hydrates to: Source entry (base from condition operands), one condition logic step
- Condition step shows: IF tier = "gold" THEN "VIP" ELSE "Standard"
- Expression and Result show correctly

### AE-16 — Backward compatibility — value map decomposition

**Given**
- An existing mapping has expression: `valueMap(source("code"), {"A": "Active", "I": "Inactive"}, "Unknown")`

**When**
- User selects the target field

**Then**
- Builder hydrates to: Source entry, source = `code`, one value map logic step
- Value map shows the cases and default
- Expression and Result show correctly

### AE-17 — Static value type validation

**Given**
- Target field type is `number`
- User is in Static entry mode

**When**
- User enters `"hello"` (a string)

**Then**
- Type validation shows error: "Expected number"
- Apply button is disabled

**When** (continued)
- User enters `42`

**Then**
- Type validation shows success checkmark
- Apply button is enabled
- Expression: `42`

### AE-18 — Chain with condition after transform

**Given**
- Source `order.amount` selected
- User adds transform: `multiply` (by 100)
- User clicks "+ Add step" but instead clicks "+ Add logic" and selects "Condition"

**When**
- User fills condition: IF amount > 1000 THEN current value ELSE 0

**Then**
- Expression: `if(gt(multiply(source("order.amount"), 100), 1000), multiply(source("order.amount"), 100), 0)`
- The chain correctly composes transform → condition

### AE-19 — External entry point disabled

**Given**
- Builder panel renders

**When**
- User observes the entry point selector

**Then**
- "External" option is visually muted/disabled
- Tooltip: "External data sources — available in a future release"
- Clicking has no effect

---

## Open Questions

- none

All questions resolved at Rev 2 — see Change Log.

---

## Verification Strategy

- **AE-01 through AE-04, AE-10 through AE-13, AE-19:** Verified via component-level tests using React Testing Library. Tests should render the builder with controlled props and assert the expected UI state, interaction flows, and callback invocations.
- **AE-05 through AE-09, AE-18:** Verified via integration tests that exercise the full flow from source selection through expression generation, asserting the generated DSL string matches expectations.
- **AE-14 through AE-16:** Verified via decomposer unit tests that take legacy expression strings and assert the returned `ChainBuilderState` matches the expected structure.
- **AE-17:** Verified via component test for static value validation.
- **All tasks:** TypeScript strict typecheck (`tsc --noEmit`) and lint must pass.
- **Expression generator:** Unit tests for each flow path (source direct, source+transforms, source+condition, source+valueMap, static, static+logic).
- **Expression decomposer:** Unit tests for forward compatibility (new expressions) and backward compatibility (FS-023/FS-029/FS-030 expressions).

---

## Task Generation Notes

This spec should be decomposed into the following task areas:

1. **State model foundation** — Define new `ChainBuilderState` types, entry-point types, and `LogicStep` union. This is the foundation that all other tasks depend on. Agent: `ui-task`.

2. **Expression generator** — Adapt expression generation for the chain model. Can be developed in parallel with UI once types exist. Agent: `ui-task`.

3. **Expression decomposer** — Adapt decomposition for the chain model with backward compatibility. Depends on generator (for round-trip testing). Agent: `ui-task`.

4. **Builder shell layout** — New header rows, AI action bar, pinned Expression/Result, removal of suggested-sources. This is the structural container. Agent: `ui-task`.

5. **Source entry flow** — Source selection, Source Card with direct copy default, integration with source panel DnD/click. Agent: `ui-task`.

6. **Static entry flow** — Literal value input, target-type validation, static DSL generation. Agent: `ui-task`.

7. **"+ Add logic" progressive disclosure** — The refinement picker that reveals Transformation/Condition/Value map options. Agent: `ui-task`.

8. **Chain-model transform steps** — Implicit current value, explicit additional params, task-oriented presentation. Agent: `ui-task`.

9. **Condition builder redesign** — Required else, full chains in branches, collapsible summaries. Agent: `ui-task`.

10. **Value Map builder redesign** — Switch-statement UX, required default. Agent: `ui-task`.

11. **Collapsible step summaries** — Summary rendering, single-step expansion, interaction model. Agent: `ui-task`.

12. **ScalarFieldBuilder integration** — Wire the new builder into the ScalarFieldBuilder shell, replacing UnifiedExpressionBuilder usage. Agent: `ui-task`.

13. **ExpressionBuilderPanel (Rules View) integration** — Wire the new builder into Rules View. Agent: `ui-task`.

14. **Architecture update** — Update `ui-application.md` Expression Builder Architecture section. Agent: `task`.

Tasks 2 and 3 (generator/decomposer) can be parallelized with UI tasks once the state types (task 1) are complete. UI tasks 5-11 depend on task 1 and task 4. Integration tasks 12-13 depend on all prior tasks. Architecture update is last.

---

## Change Log

- Rev 2 — 2026-05-10
  - All 6 open questions resolved:
    - Q1 resolved: Condition left operand defaults to current accumulated value (chain-preserving). "Change input" affordance available as escape hatch to switch to a different source.
    - Q2 resolved: New component (`ChainBuilder.tsx` or similar) rather than evolving existing `SourceCard.tsx` in-place. The mental model shift justifies a clean break. Legacy `SourceCard` retained for backward compatibility during migration.
    - Q3 resolved: Add unified decomposer first alongside legacy decomposers. Migrate all consumers. Retire legacy decomposers in a separate follow-up cleanup spec. This reduces migration risk.
    - Q4 resolved: New file `chain-builder-state.ts`. Clearer boundary, easier migration, avoids enlarging already-large legacy file.
    - Q5 resolved: Post-condition and post-value-map steps are structurally supported. The output of a condition or value map becomes the new current value. UX must clearly label the input for subsequent steps (e.g., "Current value: output of condition"). Avoids artificial dead ends; coherent with DSL semantics.
    - Q6 resolved: Condition left operand defaults to current value, shown explicitly in the UI. "Change input" affordance lets user switch to a different source. Optimizes for TTFSM without making the default invisible.
  - Updated Chain Model Semantics to document post-condition/post-value-map chaining
  - Updated Condition flow (Flow 3) and AE-08 to reflect default left operand behavior with "Change input" affordance
  - Updated Assumptions to reflect new component decision and decomposer migration strategy
  - No scope change — all resolutions are design clarifications within existing scope boundaries

- Rev 1 — 2026-05-09
  - Initial draft
