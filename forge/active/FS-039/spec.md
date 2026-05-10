# SPEC

## Title

Mapping Editor Builder Panel — Interaction and State Model (Auto-Draft, Chain Semantics, Collapse Behavior)

---

## ID

FS-039

---

## Metadata

Owner: @christophervuu
Reviewers: TBD
Created: 2026-05-09
Last Updated: 2026-05-09
Type: cross-cutting

Cross-cutting because this spec defines both UI component behavior (ui-task) and state management infrastructure (ui-task), with an architecture update task (task).

---

## Status

draft

---

## Revision

Rev: 1

---

## Summary

This spec defines the complete interaction and state model for the KeyRa 2.0 Mapping Editor Builder panel. It replaces the current two-tier Apply/Save model with an auto-draft model where edits update an in-memory draft immediately and the header Save button commits the draft to the saved mapping config. It defines a unified chain model for source selections, transformations, conditions, and value maps; collapse/summary behavior for completed steps; and a "View unsaved changes" diff capability. The primary metric is TTFSM — every interaction decision optimizes for rapid iterative authoring by non-technical users.

---

## Problem

The current Builder panel has several interaction model issues that slow down iterative authoring:

1. **Two-tier Apply/Save is confusing.** Users must Apply to commit an expression to the working session, then Save to persist. The Apply step creates cognitive overhead — non-technical users don't understand why they need two commit actions.

2. **No draft visibility.** There is no way to see what has changed since the last save. Users must remember which fields they've edited.

3. **Chain model is fragmented.** The current `TransformChainStep` pipeline, `ConditionalModeBuilder`, and `ValueMapModeBuilder` are three separate interaction paradigms. Users must think in "modes" rather than building a chain of operations on a value.

4. **Steps are always fully expanded.** As chains grow, the builder becomes a long vertical form with no progressive disclosure. Completed steps should collapse into readable summaries.

5. **"Next unmapped" in the Builder panel is misplaced.** Navigation belongs in the target worklist, not in the authoring surface.

6. **No revert/discard capability.** If a user makes edits they don't want, there's no clean way to discard the draft and return to the last saved state for that field.

---

## Goal

Define a complete, implementable behavior and state model for the Builder panel that:

1. Eliminates the Apply step — edits update the draft immediately
2. Provides a clear "edit draft → review diff → save" workflow
3. Unifies chains, conditions, and value maps into a single composable chain model
4. Introduces collapse/summary behavior for completed steps
5. Supports rapid iterative authoring for non-technical users
6. Defines all state transitions, persistence boundaries, and edge cases needed for implementation

---

## Assumptions

- The Mapping Editor's existing version/save infrastructure (`useMappingEditor`, `LocalStorageAdapter`, version history) remains stable
- The engine's `parse()` and `evaluate()` functions continue to be usable for live preview during draft editing
- The `ScalarFieldBuilder` component remains the primary Builder panel surface for scalar target fields
- `UnifiedExpressionBuilder` remains the internal builder implementation but its state model will change significantly
- `RawDslEditor` (Editor mode) continues to exist alongside Builder mode
- `EditorTopBar` continues to own the Save button and save status display
- TTFSM is the primary success metric — every interaction decision should be evaluated against it

---

## Current Context

### Current Two-Tier Save Model (from FS-021, FS-025, FS-027)

The current model has two commit tiers:

1. **Apply** — `ScalarFieldBuilder.onApply` calls `useMappingEditor.applyRule(targetPath, expression)`, which upserts the rule into the local working session and increments `unsavedRuleCount`.
2. **Save** — `useMappingEditor.save()` persists all applied rules to the adapter and resets `unsavedRuleCount`.

Dirty detection compares `currentExpression !== lastAppliedExpression` to determine whether unapplied changes exist. The navigation guard fires when `unsavedRuleCount > 0` or when in-progress expression differs from applied.

### Current Builder State Model (from FS-023, FS-027, FS-030)

`ExpressionBuilderState` is a discriminated union with three modes:
- `value` — source selections + transform pipeline + optional static value
- `conditional` — condition tree + then/else branches
- `valueMap` — input source + mapping rows + fallback

Each mode has its own component hierarchy and interaction model. Transform chains use `TransformChainStep[]` with innermost-first ordering. Conditions use `ConditionalModeBuilder` with `ConditionRowEditor` and `BranchValueSelector`. Value maps use `ValueMapModeBuilder`.

### Current Save Infrastructure

- `useMappingEditor.save()` persists to `LocalStorageAdapter`
- Save increments the version number
- Version history snapshots are taken on save
- `saveStatus: 'saved' | 'unsaved' | 'saving' | 'error'` drives UI state
- `canNavigateAway()` returns `true` when `unsavedRuleCount === 0`
- Navigation guard uses React Router v6 `useBlocker`

### Current Component Hierarchy

```
ScalarFieldBuilder
  header (target path, type badge, required/optional, status)
  suggested sources (hidden when empty)
  mode toggle (Builder / Editor)
  expression area (drop zone):
    UnifiedExpressionBuilder (builder mode)
    RawDslEditor (editor mode)
  apply button (currently gated on isValid && expression.trim())
```

---

## Scope

### In Scope

1. **Draft state model** — define in-memory draft state, its lifecycle, and how it relates to the saved mapping config
2. **Auto-draft behavior** — edits update the draft immediately; no Apply step
3. **Save behavior** — header Save commits the draft; define what "commit" means precisely
4. **Discard/revert behavior** — how to revert draft edits to the last saved state
5. **Unsaved change detection** — how the system determines what has changed since last save
6. **View unsaved changes** — a diff capability comparing draft vs saved state
7. **Chain semantics** — a single composable chain model that subsumes sources, transforms, conditions, and value maps
8. **Condition semantics** — total conditions with required else, full chains in branches, summary collapse
9. **Value map semantics** — value map as a chain construct with required default
10. **Step expansion/collapse** — when steps expand, when they collapse, summary text behavior
11. **Progression rules** — what gates "+ Add Step" visibility and save eligibility
12. **Builder/Editor mode interaction** — how draft state interacts with raw DSL editing
13. **Expression and Result updates** — how LiveExpressionDisplay and LiveResultDisplay behave during draft editing
14. **Error and warning states** — how validation errors/warnings appear during draft editing
15. **Persistence boundaries** — in-memory draft vs saved config vs version increment
16. **Removal of Apply button** — replacement interaction model
17. **Removal of "Next unmapped" from Builder** — where navigation responsibility moves

### Out of Scope

- Changes to the Mapping Editor's three-column layout structure
- Changes to SourceSchemaPanel or TargetWorklist behavior
- Changes to RuleList (Rules View) behavior
- Changes to ArrayMappingBuilder (array mapping wizard)
- Changes to Test Lab or preview execution
- AI suggestion acceptance flow (AI suggestions remain non-auto-committed)
- ObjectSummaryPanel behavior
- Deploy workflow
- Backend/API changes
- Schema ingestion or editing

---

## Non-Goals

- This spec does not define visual/pixel-level design — it defines behavior and state
- This spec does not redesign the three-column layout
- This spec does not change how Rules View works (it affects only Target View → Builder panel flow)
- This spec does not introduce undo/redo history within the builder (draft revert is limited to "revert to last saved state")
- This spec does not introduce collaborative editing or conflict resolution

---

## Relevant Areas

- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/UnifiedExpressionBuilder.tsx`
- `ui/src/features/mappings/components/SourceCard.tsx`
- `ui/src/features/mappings/components/TransformPipeline.tsx`
- `ui/src/features/mappings/components/TransformPipelineStep.tsx`
- `ui/src/features/mappings/components/ConditionalModeBuilder.tsx`
- `ui/src/features/mappings/components/ConditionRowEditor.tsx`
- `ui/src/features/mappings/components/BranchValueSelector.tsx`
- `ui/src/features/mappings/components/ValueMapModeBuilder.tsx`
- `ui/src/features/mappings/components/LiveExpressionDisplay.tsx`
- `ui/src/features/mappings/components/LiveResultDisplay.tsx`
- `ui/src/features/mappings/components/EditorTopBar.tsx`
- `ui/src/features/mappings/hooks/use-mapping-editor.ts`
- `ui/src/features/mappings/hooks/use-expression-builder.ts`
- `ui/src/features/mappings/lib/expression-builder-state.ts`
- `ui/src/features/mappings/lib/pipeline-expression-generator.ts`
- `ui/src/features/mappings/lib/pipeline-decomposer.ts`
- `ui/src/features/mappings/lib/source-card-expression-generator.ts`
- `ui/src/features/mappings/lib/source-card-decomposer.ts`
- `ui/src/features/mappings/lib/transform-chain-utils.ts`
- `ui/src/features/mappings/types.ts`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- Depends on completed FS-023 (UnifiedExpressionBuilder foundation)
- Depends on completed FS-025 (builder state hydration)
- Depends on completed FS-027 (dirty-state detection, static values)
- Depends on completed FS-030 (transform chain pipeline model)
- All dependencies are in `forge/completed/`; no blockers.

---

## Constraints

- Must preserve the existing version/save infrastructure in `useMappingEditor`
- Must preserve the existing Builder/Editor mode toggle (raw DSL editing remains available)
- Must preserve the existing LiveExpressionDisplay and LiveResultDisplay surfaces (behavior may change)
- Must preserve engine integration patterns (`useExpressionPreview`, `useEngineValidation`)
- Save does not deploy — this constraint is inherited and must be maintained
- AI suggestions are never auto-committed — this constraint is inherited and must be maintained
- No new external state management libraries (React Context + hooks only)
- TypeScript strict mode
- Desktop-first (1024px minimum)

---

## Proposed Behavior

### 1. State Model — Draft vs Saved

The Builder introduces a two-layer state model:

#### Layer 1: Saved State (persisted)

The **saved state** is the mapping config persisted through `LocalStorageAdapter`. It contains the canonical `rules[]` array. Each rule has a `target` path and an `expression` string.

Saved state changes only on explicit **Save** (header Save button or Ctrl+S).

#### Layer 2: Draft State (in-memory)

The **draft state** is a per-field in-memory representation of the current Builder edits. It is derived from the saved rules on target selection and diverges as the user makes edits.

```
DraftFieldState {
  targetPath: string
  chain: ChainState              // the current chain being authored
  generatedExpression: string    // DSL derived from chain on each change
  savedExpression: string | null // expression from saved rules (null if unmapped)
  isDirty: boolean               // generatedExpression !== savedExpression
  validationState: DraftValidationState
}
```

**Lifecycle:**
1. User selects a target field
2. System looks up the saved rule for that target path
3. If a saved rule exists: decompose its expression into `ChainState` (hydration)
4. If no saved rule: initialize empty `ChainState` (source selection entry point)
5. User edits the chain — `generatedExpression` updates on every change
6. `isDirty` is `true` when `generatedExpression !== savedExpression`
7. User navigates away or saves — draft is either committed or discarded

**Key principle:** The draft is the in-memory working state. It is never auto-persisted. It is never written to localStorage. It exists only in React state.

#### State Diagram

```
                    ┌─────────────┐
                    │  No Target  │
                    │  Selected   │
                    └──────┬──────┘
                           │ select target
                           ▼
              ┌────────────────────────┐
              │     Hydrate Draft      │
              │ (decompose saved rule  │
              │  or init empty chain)  │
              └────────────┬───────────┘
                           │
                           ▼
                   ┌───────────────┐
             ┌────►│  Draft Clean  │◄──── save succeeds
             │     │  (not dirty)  │      (savedExpression updated)
             │     └───────┬───────┘
             │             │ user edits chain
             │             ▼
             │     ┌───────────────┐
             │     │  Draft Dirty  │
             │     │  (isDirty)    │
             │     └───┬───┬───┬───┘
             │         │   │   │
             │    save  │   │   │ discard
             │         │   │   │
             │         ▼   │   ▼
             │   commit to │  revert to
             │   saved     │  savedExpression
             │   rules     │
             │         │   │ select different target
             │         │   │
             └─────────┘   ▼
                    ┌──────────────────────┐
                    │  Navigation Guard    │
                    │  "Unsaved changes"   │
                    │  Discard / Cancel    │
                    └──────────────────────┘
```

### 2. Auto-Draft Behavior

Every edit the user makes updates the draft immediately:

| User Action | Draft Effect |
|---|---|
| Select a source field | Sets chain source; generates `source("path")` |
| Add a transform step | Appends step to chain; regenerates expression |
| Edit a step argument | Updates step args; regenerates expression |
| Remove a step | Removes from chain; regenerates expression |
| Add a condition | Wraps chain in conditional; regenerates expression |
| Edit a condition branch | Updates branch chain; regenerates expression |
| Add a value map | Wraps chain in value map; regenerates expression |
| Change static value | Updates literal value; regenerates expression |
| Edit in raw Editor mode | Updates `generatedExpression` directly |

**No Apply button.** The draft is always the current state of the Builder. The generated expression updates in real-time and is visible in `LiveExpressionDisplay`.

### 3. Unsaved Change Detection

**Per-field detection:**
```
isDirty(field) = draftExpression(field) !== savedExpression(field)
```

Where:
- `draftExpression(field)` = the current generated expression from the draft chain (or raw editor text)
- `savedExpression(field)` = the expression from the persisted mapping config for that target path, or `null` if no saved rule exists

**Global detection:**
```
hasUnsavedChanges = any field has isDirty === true
```

In practice, since only one field is edited at a time, the global state is:
- Check if the currently selected field is dirty
- Check if there are previously committed-to-draft changes for other fields that haven't been saved

**Implementation approach:** `useMappingEditor` maintains a `draftRules: Map<string, string>` alongside the saved `rules[]`. When the user edits a field, the draft expression for that target path is updated in the map. `hasUnsavedChanges` is `draftRules.size > 0` where entries differ from saved state.

### 4. Save Behavior

**Trigger:** Header Save button or Ctrl+S.

**Save sequence:**
1. Collect all draft changes from `draftRules` map
2. For each draft entry:
   - If expression is non-empty and the target has no saved rule → add new rule
   - If expression is non-empty and the target has a saved rule → update existing rule
   - If expression was cleared (empty) and target had a saved rule → delete the rule
3. Persist the updated rules array via `adapter.updateMapping()`
4. Increment version number
5. Take version history snapshot
6. Clear `draftRules` map
7. Update `saveStatus` to `'saved'`
8. Update `savedExpression` for the currently selected field (if any)

**What blocks save:**
- `saveStatus === 'saving'` (save already in progress)
- No unsaved changes exist (Save button disabled when clean)

**What does NOT block save:**
- Validation errors on the current draft expression
- Empty expressions for some fields
- Parse errors in the current expression

Rationale: Users should be able to save work-in-progress. A half-finished expression is better saved than lost. Validation errors are informational during authoring — they don't gate persistence.

### 5. Discard/Revert Behavior

#### Per-field revert

The user can revert the current field's draft to its saved state:

- **Action:** "Discard changes" button (visible only when `isDirty` for the current field)
- **Effect:** Re-hydrate the chain from `savedExpression`, or reset to empty if no saved rule
- **No confirmation dialog** for single-field revert (fast iterative flow)

#### Global discard

- **Action:** Not explicitly surfaced as a button. Occurs when the user navigates away from the editor with unsaved changes.
- **Navigation guard:** "You have unsaved changes. Discard and leave?" with Confirm/Cancel
- **Effect on confirm:** All draft changes are discarded; navigation proceeds

#### Revert via diff view

The "View unsaved changes" surface (see section 6) allows field-level revert directly from the diff.

### 6. View Unsaved Changes

A capability to compare the current draft against the saved mapping rules.

**Trigger:** "View unsaved changes" action in `EditorTopBar` (visible when `hasUnsavedChanges === true`).

**Display:**
- A summary list of changed fields, grouped by change type:
  - **Modified:** fields where `draftExpression !== savedExpression` and both are non-empty
  - **Added:** fields where `savedExpression` is null and `draftExpression` is non-empty
  - **Removed:** fields where `savedExpression` is non-empty and `draftExpression` is empty/cleared
- Each entry shows:
  - Target field path
  - Saved expression (or "unmapped")
  - Draft expression (or "will be removed")
- Per-field actions:
  - "Revert" — discard this field's draft changes
  - Click field path → navigate to that field in the Builder

**Implementation:** Presented as a modal or drawer overlay. Does not replace the Builder — it's a review surface.

**Count badge:** `EditorTopBar` shows a badge with the number of unsaved field changes (replaces the old `unsavedRuleCount` badge).

### 7. Chain Model (Unified)

#### Core concept

The Builder uses a **single chain model**. A chain is an ordered sequence of operations that transform an initial value into a final output. Every mapping expression is a chain.

```
ChainState {
  source: ChainSource               // the initial value
  steps: ChainStep[]                 // ordered operations on that value
}

ChainSource =
  | { kind: 'field'; path: string }              // source("path")
  | { kind: 'static'; value: StaticValue }       // literal value
  | { kind: 'none' }                             // not yet selected

ChainStep =
  | TransformStep                    // a function applied to the current value
  | ConditionStep                    // a conditional branch
  | ValueMapStep                     // a value map branch
```

#### Chain evaluation model

Each step operates on the **current value** (the output of the previous step, or the source if it's the first step). Extra inputs can be added explicitly where supported (e.g., transform functions with additional parameters, or condition comparisons against other values).

```
source("name") → upper() → default("UNKNOWN")
  └─ current value: source("name")
         └─ current value: upper(source("name"))
              └─ current value: default(upper(source("name")), "UNKNOWN")
```

#### Source selection produces a valid current value

When the user selects a source field or enters a static value, the chain immediately has a valid current value. This is a valid, complete expression (`source("path")` or a literal). No further steps are required.

#### "+ Add Step" visibility rule

`[+ Add Step]` appears **only after the current last step is structurally valid** (or if the chain has a valid source and no steps yet).

"Structurally valid" means:
- For a **source**: a field path is selected or a static value is entered
- For a **transform step**: the function is selected and all required arguments have values
- For a **condition step**: all branches (then + else) have valid chains; all conditions have left operand, operator, and right operand
- For a **value map step**: all mapping rows have input value + output value; default case has a value

The `[+ Add Step]` action opens a picker offering:
- **Transform functions** — filtered by type compatibility with the current chain output type
- **Add condition** — wraps the remaining chain in an `if()` construct
- **Add value map** — wraps the remaining chain in a `valueMap()` construct

### 8. Condition Semantics

#### Total conditions

Conditions in the Builder are **total** — they must cover all possible inputs. This means:

- **Else is required.** Every condition must have both a Then branch and an Else branch.
- There is no "if without else" in the Builder. (Users who want that can use Editor mode.)

#### Branch structure

```
ConditionStep {
  kind: 'condition'
  conditions: ConditionClause[]      // if / else-if clauses
  elseBranch: ChainState             // required else branch
}

ConditionClause {
  predicates: Predicate[]            // AND-combined
  thenBranch: ChainState             // result chain for this clause
}

Predicate {
  left: OperandValue                 // left side
  operator: ComparisonOperator       // eq, neq, gt, lt, gte, lte, contains, etc.
  right: OperandValue                // right side
}
```

#### Then and Else branches contain full chains

Each branch is a full `ChainState` — it can contain its own source selection, transform steps, nested conditions, and value maps. This enables rich compositional logic.

**Nesting depth:** The Builder does not impose an artificial nesting limit but relies on collapse behavior and summary text to keep deep structures readable.

#### Completed conditions collapse into summaries

Once a condition step has all required parts filled:
1. The full condition editor collapses into a **summary card**
2. The summary shows a human-readable description:
   - `If name equals "VIP" then upper(source("tier")) else "standard"`
   - `If amount > 1000 then "high" / else if amount > 100 then "medium" / else "low"`
3. Clicking the summary card expands it for inline editing
4. The collapse is per-condition-step (not global)

### 9. Value Map Semantics

#### Value map as a chain construct

A value map is a specialized branching construct that fits into the chain model as a step:

```
ValueMapStep {
  kind: 'valueMap'
  mappings: ValueMapRow[]
  defaultValue: ChainState           // required default case
}

ValueMapRow {
  inputValue: string                 // the value to match
  outputChain: ChainState            // the result chain for this match
}
```

#### Default case is required

Every value map must have a default case. The Builder enforces this structurally — the default row is always present and cannot be removed.

#### Value map sources

The value map implicitly operates on the current chain value (the output of the previous step). This means a value map step doesn't need its own separate source selector — it maps from the current value.

#### Collapse behavior

Like conditions, completed value maps collapse into summary cards:
- `Map "US" → "United States", "UK" → "United Kingdom", default → source("country")`

### 10. Step Expansion and Collapse

#### Expansion rules

- **Only one step can be expanded at a time** within a given chain level (accordion behavior)
- Clicking a collapsed step expands it and collapses the previously expanded step
- Newly added steps start expanded
- The most recently edited step stays expanded

#### Collapse rules

A step **auto-collapses** into its summary when:
1. The user adds a new step after it (the new step becomes the active expanded step)
2. The user clicks a different collapsed step to expand it
3. The user explicitly clicks the collapse toggle on the expanded step

A step **cannot collapse** when:
- It is structurally incomplete (missing required arguments or values)
- It has validation errors that require user attention

#### Summary text behavior

Every step type has a summary text renderer:

| Step Type | Summary Pattern |
|---|---|
| Source (field) | `source("customer.name")` |
| Source (static) | `"hello"` / `42` / `true` |
| Transform | `upper()` / `default("N/A")` / `cast("number")` |
| Condition | `If {predicate summary} then {branch summary} else {branch summary}` |
| Value Map | `Map {N} values, default: {default summary}` |

Summary text is truncated at ~80 characters with an ellipsis for deeply nested chains.

### 11. Interaction Between Builder Mode and Editor Mode

#### Builder → Editor

When the user switches from Builder to Editor mode:
1. The current `generatedExpression` from the chain is placed into the raw editor textarea
2. The chain state is preserved in memory (not destroyed)
3. The user can edit the raw DSL directly

#### Editor → Builder

When the user switches from Editor to Builder mode:
1. The current raw editor text is decomposed via `decomposeExpression()`
2. **Success:** chain state is hydrated from the decomposed structure; Builder renders it
3. **Failure:** Builder cannot represent the expression; a warning banner appears: "This expression is too complex for the Builder. Edit in Editor mode."
4. On failure, the switch is blocked — the user stays in Editor mode

#### Draft consistency

Both modes operate on the same draft. The `generatedExpression` (Builder) or raw editor text (Editor) are the same draft expression for the current field. Switching modes does not create separate drafts.

#### Dirty detection in Editor mode

When in Editor mode, `isDirty` compares the raw editor text against `savedExpression`. Same logic as Builder mode.

### 12. Expression and Result Updates During Draft Editing

#### LiveExpressionDisplay

- **Always visible** below the Builder/Editor surface
- **Updates on every change** — as the user edits the chain, the generated DSL expression updates in real-time
- **Read-only** in this surface — click-to-edit navigates to Editor mode (existing behavior preserved)
- Shows the full expression (scrollable if long)

#### LiveResultDisplay

- **Always visible** below LiveExpressionDisplay
- **Updates with debounce** — after the generated expression changes, a 300ms debounce triggers `useExpressionPreview()` to parse/evaluate the expression against current source data
- **Shows result** when source data is available and expression is valid
- **Shows parse/evaluation error** when expression is invalid (red text, error message)
- **Shows placeholder** when no source data is loaded ("Load test data to see results")
- **Shows null** when expression evaluates to null (with a subtle "null" indicator, not an error)

#### Preview auto-execution

The `ConnectedInlinePreviewStrip` (bottom area in Target View) should trigger a preview whenever the draft expression changes for the selected field, debounced to avoid excessive executions. This replaces the old "auto-preview on Apply" behavior — now it's "auto-preview on draft change."

### 13. What Blocks Progression vs What Blocks Save

#### What blocks "+ Add Step"

The `[+ Add Step]` button appears only when the current last step is structurally valid:

| Situation | "+ Add Step" Visible? |
|---|---|
| Source selected, no steps | Yes |
| Last step is a complete transform | Yes |
| Last step is a complete condition (all branches filled) | Yes |
| Last step is a complete value map (all rows + default filled) | Yes |
| Source not yet selected | No |
| Last step has empty required arguments | No |
| Last condition step missing else branch value | No |
| Last value map step missing default value | No |

#### What blocks Save

**Nothing blocks Save** except:
- No unsaved changes exist (button disabled)
- Save already in progress (button disabled)

Validation errors, incomplete expressions, and parse failures do NOT block save. Users can save work-in-progress.

#### What shows warnings during draft editing

| Condition | Warning Display |
|---|---|
| Expression has parse errors | Red underline in LiveExpressionDisplay; error in LiveResultDisplay |
| Expression has validation warnings | Amber indicator on the step with the issue |
| Type mismatch between chain output and target type | Warning badge on the field in TargetWorklist |
| Empty expression for a required target | Warning badge on the field in TargetWorklist |

### 14. Persistence Boundaries

Three distinct persistence layers:

| Layer | Storage | Lifetime | Updated When |
|---|---|---|---|
| In-memory draft | React state (`useState`/`useReducer`) | Current session, current field selection | Every user edit |
| Draft rules map | React state in `useMappingEditor` | Current session, survives field navigation | When user navigates away from a dirty field (auto-commits draft to map) |
| Saved mapping config | `LocalStorageAdapter` | Persistent across sessions | Explicit Save (header button / Ctrl+S) |

**Version increment:** Occurs only on explicit Save. Draft edits do not create versions.

**Draft rules map behavior:**

When the user navigates from field A to field B:
1. If field A is dirty, the current draft expression for field A is stored in the `draftRules` map
2. Field B is hydrated: check `draftRules` map first (for in-progress edits), then fall back to saved rules
3. This allows the user to edit multiple fields before saving

When the user saves:
1. All entries in `draftRules` are committed to the saved rules array
2. `draftRules` map is cleared
3. Version increments

### 15. "Add Logic" vs "Add Step" Rules

The Builder shows different actions depending on context:

| Context | Available Action | Label |
|---|---|---|
| Chain has valid source, no steps | `[+ Add Step]` | Opens step picker (transforms, condition, value map) |
| Chain has one or more complete steps | `[+ Add Step]` | Opens step picker (transforms, condition, value map) |
| Inside a condition branch (then/else) | `[+ Add Step]` | Opens step picker within the branch chain |
| Inside a value map output | `[+ Add Step]` | Opens step picker within the output chain |
| Step picker is open | Categorized list | Transform functions / "Add condition" / "Add value map" |

There is no separate "Add logic" label — the step picker is unified. Conditions and value maps appear as step categories alongside transform functions.

### 16. Removal of Apply and Next Unmapped

#### Apply removal

- The Apply button is removed from `ScalarFieldBuilder`
- `useMappingEditor.applyRule()` is no longer called per-edit
- Instead, draft expressions accumulate in the `draftRules` map and are committed on Save
- The "Applied" indicator state is removed

#### Next Unmapped removal from Builder

- The "Next unmapped" button is removed from `ScalarFieldBuilder`
- The `onAdvanceToNext` callback is removed from `ScalarFieldBuilder` props
- The `Ctrl+]` / `Cmd+]` keyboard shortcut for Next Unmapped is removed from the Builder
- Navigation to unmapped fields remains available through the TargetWorklist (filter by Unmapped, click next field)

### User Flow

1. User selects a target field in the TargetWorklist
2. Builder panel hydrates: shows the current chain (from draft map, or decomposed from saved rule, or empty)
3. User builds the expression:
   - Selects a source field (or enters a static value)
   - Optionally adds transform steps, conditions, or value maps
   - Each edit updates the chain; expression and result update live
4. User navigates to another field (draft is stored in `draftRules` map)
5. User reviews changes via "View unsaved changes" in EditorTopBar
6. User saves via Save button or Ctrl+S
7. All drafts commit to saved rules; version increments

### System Behavior

#### Draft hydration on target selection

1. Check `draftRules` map for an in-progress expression for this target
2. If found: decompose into `ChainState` and display
3. If not found: check saved rules for this target
4. If saved rule found: decompose saved expression into `ChainState`
5. If decomposition fails: show raw expression in Editor mode with warning banner
6. If no saved rule: show empty Builder (source selection entry point)

#### Expression generation

On every chain state change:
1. Walk the `ChainState` tree
2. Generate DSL string via the expression generator (updated for chain model)
3. Update `generatedExpression`
4. Update `isDirty` by comparing against `savedExpression`
5. Debounce 300ms → trigger `useExpressionPreview()` for live result

#### Navigation guard

When user attempts to navigate away from the editor (route change):
- If `draftRules` map has any entries (unsaved changes exist):
  - Show confirmation: "You have unsaved changes to N field(s). Discard and leave?"
  - Confirm: discard all drafts, navigate away
  - Cancel: stay on editor

When user selects a different target field:
- If current field is dirty: auto-store draft expression in `draftRules` map (no dialog)
- Hydrate the new field's chain
- This is a key UX improvement: navigating between fields does not lose work and does not interrupt flow

### Failure / Edge Behavior

#### Decomposition failure on hydration

If a saved expression cannot be decomposed into `ChainState`:
- The field opens in Editor mode (raw DSL textarea)
- A warning banner shows: "This expression is too complex for the Builder. Edit in Editor mode."
- The user can still edit in Editor mode; draft detection works normally
- If the user modifies the expression to something decomposable and switches to Builder mode, decomposition is reattempted

#### Save failure

If the adapter fails to persist:
- `saveStatus` transitions to `'error'`
- Draft rules are preserved (not cleared)
- User can retry Save

#### Empty expression save

If a field's draft expression is empty:
- If the field had a saved rule: the rule is deleted on Save
- If the field had no saved rule: no-op (nothing to save for that field)

#### Concurrent field edits

The `draftRules` map can accumulate edits across multiple fields:
- User edits field A → navigates to field B (A's draft stored) → edits field B → navigates to field C (B's draft stored) → saves (A + B committed)

#### Builder mode with structurally incomplete chain

If the user has started building a chain but hasn't completed it:
- The generated expression may be incomplete or empty
- LiveExpressionDisplay shows whatever is generated (may be partial)
- LiveResultDisplay shows an error or empty state
- The field is still dirty if the generated expression differs from saved
- Save is still allowed — the partial expression is saved as-is

---

## Acceptance Examples

### AE-01 — Basic auto-draft: select source and see live expression

**Given**
- Target field "customerName" is selected
- No saved rule exists for this field

**When**
- User selects source field `customer.name` from the source panel

**Then**
- Chain shows: Source → `source("customer.name")`
- `LiveExpressionDisplay` shows: `source("customer.name")`
- `isDirty` is `true`
- `[+ Add Step]` button is visible
- No Apply button is present

### AE-02 — Add transform step to chain

**Given**
- AE-01 state: source selected, chain has `source("customer.name")`

**When**
- User clicks `[+ Add Step]` → selects `upper`

**Then**
- Chain shows: Source → `upper()`
- `LiveExpressionDisplay` shows: `upper(source("customer.name"))`
- The source step auto-collapses into summary: `source("customer.name")`
- The `upper()` step is expanded (active)
- `[+ Add Step]` is visible after `upper()` (it has no required args beyond the implicit first)

### AE-03 — Multi-step chain with summary collapse

**Given**
- Chain: `source("customer.name")` → `upper()` → `default("UNKNOWN")`

**When**
- User clicks `[+ Add Step]` after `default()` is complete

**Then**
- `source("customer.name")` summary: collapsed
- `upper()` summary: collapsed
- `default("UNKNOWN")` summary: collapsed
- New step picker is open (expanded)
- `LiveExpressionDisplay`: `default(upper(source("customer.name")), "UNKNOWN")`

### AE-04 — Navigate away stores draft in map

**Given**
- User has edited "customerName" to `upper(source("customer.name"))` (dirty)

**When**
- User clicks target field "orderId" in TargetWorklist

**Then**
- "customerName" draft is stored in `draftRules` map
- "orderId" Builder hydrates (from its own draft, saved rule, or empty)
- No dialog is shown (seamless field navigation)
- EditorTopBar shows unsaved changes badge: "1 unsaved"

### AE-05 — Save commits all draft changes

**Given**
- `draftRules` map contains:
  - "customerName" → `upper(source("customer.name"))`
  - "orderId" → `source("order.id")`
- Currently editing "orderDate" with draft `formatDate(source("order.date"), "YYYY-MM-DD")`

**When**
- User presses Ctrl+S

**Then**
- All three draft rules are committed to saved mapping config
- Version increments from v3 to v4
- Version history snapshot is taken
- `draftRules` map is cleared
- `saveStatus` transitions: `'unsaved'` → `'saving'` → `'saved'`
- Unsaved changes badge disappears
- "orderDate" Builder now shows `isDirty: false` (savedExpression matches)

### AE-06 — View unsaved changes shows diff

**Given**
- `draftRules` map contains:
  - "customerName" → `upper(source("customer.name"))` (modified from saved `source("customer.name")`)
  - "newField" → `source("order.ref")` (added — no saved rule)

**When**
- User clicks "View unsaved changes" in EditorTopBar

**Then**
- Diff overlay shows:
  - **Modified (1):** customerName — saved: `source("customer.name")` → draft: `upper(source("customer.name"))`
  - **Added (1):** newField — draft: `source("order.ref")`
- Each entry has a "Revert" action
- Clicking "customerName" path closes diff and navigates to that field

### AE-07 — Per-field revert from diff view

**Given**
- AE-06 state: diff overlay open

**When**
- User clicks "Revert" on "customerName" entry

**Then**
- "customerName" draft is removed from `draftRules` map
- The field reverts to its saved expression `source("customer.name")`
- Diff overlay updates: only "newField" (Added) remains
- If user navigates to "customerName", Builder shows the saved expression

### AE-08 — Condition step with required else

**Given**
- Chain has: `source("customer.tier")`
- User clicks `[+ Add Step]` → "Add condition"

**When**
- Condition step is created

**Then**
- Condition step is expanded showing:
  - IF: empty predicate (left operand / operator / right operand)
  - THEN: empty branch chain
  - ELSE: empty branch chain (always present, cannot be removed)
- `[+ Add Step]` after the condition is NOT visible (condition is incomplete)

### AE-09 — Completed condition collapses to summary

**Given**
- Condition step filled:
  - IF `source("customer.tier")` equals `"VIP"`
  - THEN chain: `"premium"`
  - ELSE chain: `"standard"`

**When**
- User clicks outside the condition step (or adds a new step after it)

**Then**
- Condition collapses to summary: `If tier = "VIP" then "premium" else "standard"`
- `LiveExpressionDisplay`: `if(eq(source("customer.tier"), "VIP"), "premium", "standard")`
- Clicking the summary re-expands for editing

### AE-10 — Value map with required default

**Given**
- Chain has: `source("country.code")`
- User clicks `[+ Add Step]` → "Add value map"

**When**
- Value map step is created

**Then**
- Value map step is expanded showing:
  - Empty mapping rows area with `[+ Add Mapping]` button
  - Default case: empty value (required, cannot be removed)
- `[+ Add Step]` after value map is NOT visible (default case is empty)

### AE-11 — Add Step gated by structural validity

**Given**
- Chain has: `source("amount")` → `divide()` (divide step expanded, second argument empty)

**When**
- User has not yet filled the divisor argument

**Then**
- `[+ Add Step]` is NOT visible
- The divide step cannot collapse (incomplete)
- `LiveExpressionDisplay` shows partial or error state

**When (continued)**
- User fills divisor: `source("total")`

**Then**
- `[+ Add Step]` becomes visible
- The divide step CAN now collapse
- `LiveExpressionDisplay`: `divide(source("amount"), source("total"))`

### AE-12 — Accordion: only one step expanded at a time

**Given**
- Chain: `source("name")` → `upper()` (collapsed) → `default("N/A")` (collapsed) → `trim()` (expanded)

**When**
- User clicks the `upper()` summary to expand it

**Then**
- `upper()` expands (shows full step editor)
- `trim()` collapses (shows summary)
- `source("name")` and `default("N/A")` remain collapsed

### AE-13 — Builder-to-Editor mode preserves draft

**Given**
- Builder mode active with chain: `upper(source("name"))` (dirty)

**When**
- User toggles to Editor mode

**Then**
- Raw editor shows: `upper(source("name"))`
- Chain state is preserved in memory
- `isDirty` remains `true`
- User can edit the raw DSL

### AE-14 — Editor-to-Builder decomposition failure

**Given**
- Editor mode active with raw DSL: `concat(source("a"), source("b"), source("c"))` (non-chainable)

**When**
- User attempts to toggle to Builder mode

**Then**
- Decomposition fails (concat with 3 args is not a linear chain)
- Warning banner: "This expression is too complex for the Builder. Edit in Editor mode."
- User stays in Editor mode
- Draft detection continues normally

### AE-15 — Navigation guard on route change with unsaved drafts

**Given**
- `draftRules` map has 2 entries (unsaved changes)

**When**
- User clicks browser back button or navigates to a different route

**Then**
- Confirmation dialog: "You have unsaved changes to 2 field(s). Discard and leave?"
- "Discard and leave" → all drafts cleared, navigation proceeds
- "Cancel" → stay on editor, drafts preserved

### AE-16 — Save with validation errors allowed

**Given**
- Draft expression `upper(source("nonexistent.field"))` has a validation warning (source path not in schema)

**When**
- User clicks Save

**Then**
- Save succeeds
- Expression is persisted as-is
- Validation warning still appears after save (it's a property of the expression, not the save state)

### AE-17 — Discard button for current field

**Given**
- "customerName" saved expression: `source("customer.name")`
- User has edited draft to: `upper(source("customer.name"))`
- `isDirty` is `true`

**When**
- User clicks "Discard changes" on the current field

**Then**
- Chain reverts to decomposed `source("customer.name")`
- `isDirty` becomes `false`
- `LiveExpressionDisplay` shows: `source("customer.name")`
- No entry in `draftRules` map for this field

### AE-18 — Empty field save deletes rule

**Given**
- "customerName" has saved rule: `source("customer.name")`
- User clears the source (chain becomes empty)
- `generatedExpression` is `""`

**When**
- User saves

**Then**
- The rule for "customerName" is deleted from the saved config
- The field shows as "unmapped" in TargetWorklist

### AE-19 — Draft survives field-to-field navigation

**Given**
- User edits "fieldA" → draft: `upper(source("a"))` (dirty)
- User navigates to "fieldB" → draft stored in map
- User edits "fieldB" → draft: `source("b")` (dirty)
- User navigates back to "fieldA"

**When**
- "fieldA" loads in Builder

**Then**
- Builder shows the in-progress chain: `upper(source("a"))` (from draftRules map)
- `isDirty` is `true` (compared against saved expression for fieldA)
- "fieldB" draft is also preserved in the map

### AE-20 — Condition branches with full chains

**Given**
- Condition step in a chain

**When**
- User builds the THEN branch as: `source("premium.rate")` → `multiply(100)` → `round(2)`

**Then**
- The THEN branch is a full chain with source + 2 transform steps
- `[+ Add Step]` is available within the THEN branch after `round(2)` completes
- The generated expression correctly nests: `if(condition, round(multiply(source("premium.rate"), 100), 2), elseBranch)`

---

## Open Questions

- `Q1.` Should the "View unsaved changes" be a modal dialog, a slide-out drawer, or an inline panel? The spec currently suggests modal/drawer — need to decide on the exact surface.
- `Q2.` Should `draftRules` map entries persist to sessionStorage (survive page refresh) or be purely in-memory (lost on refresh)? In-memory is simpler and consistent with "draft is ephemeral" philosophy, but losing unsaved work on accidental refresh is painful.
- `Q3.` For condition branches, should nested chains within branches also use accordion expansion, or should branch chains always be fully expanded (since they're shorter)? The spec says accordion at all levels but this could be noisy for shallow branches.
- `Q4.` Should the `[+ Add Step]` picker be a dropdown menu, a popover, or an inline expanded section? Current implementation uses various patterns — need consistency.
- `Q5.` When a user clears the source in the Builder (removes the source selection), should this be treated as "empty chain" (reverts to entry state) or "chain with no source" (keeps other steps)? Recommend: clears the entire chain since all steps depend on the source value.
- `Q6.` How does the existing `ExpressionBuilderPanel` (Rules View context) interact with this new draft model? Rules View may need its own adaptation since it operates on individual rules, not the target-driven field model. Consider whether Rules View continues to use the old Apply model or migrates.

---

## Verification Strategy

This is a behavior/state spec. Verification is primarily through:

1. **State model unit tests** — test `ChainState` operations, expression generation from chain state, chain decomposition, draft rules map operations, dirty detection
2. **Component integration tests** — test Builder panel rendering with chain state, collapse/expand behavior, step picker visibility gating
3. **Hook tests** — test `useMappingEditor` draft rules map behavior, save with draft merging, revert behavior
4. **Interaction tests** — test full user flows (select source → add step → navigate → save)
5. **Edge case tests** — decomposition failure, save failure, empty expression save, concurrent field edits

Map to acceptance examples:
- AE-01 through AE-03: chain model + expression generation tests
- AE-04, AE-05, AE-19: draft rules map + save integration tests
- AE-06, AE-07: view unsaved changes component tests
- AE-08 through AE-10: condition + value map structural tests
- AE-11: progression gating tests
- AE-12: accordion behavior tests
- AE-13, AE-14: mode toggle + decomposition tests
- AE-15: navigation guard tests
- AE-16: save-with-errors tests
- AE-17: per-field revert tests
- AE-18: empty expression save tests
- AE-20: nested branch chain tests

---

## Task Generation Notes

This spec should be decomposed into the following task groups:

**Phase 1 — State model foundation (task + ui-task)**
1. Define the new `ChainState`, `ChainSource`, `ChainStep`, and related types in `expression-builder-state.ts` — **Agent: ui-task**
2. Implement chain-to-DSL expression generator (update `pipeline-expression-generator.ts` and `source-card-expression-generator.ts` for unified chain model) — **Agent: ui-task**
3. Implement DSL-to-chain decomposer (update `pipeline-decomposer.ts` and `source-card-decomposer.ts` for unified chain model) — **Agent: ui-task**
4. Implement `draftRules` map in `useMappingEditor` (draft accumulation, save merging, revert, navigation handling) — **Agent: ui-task**

**Phase 2 — Builder panel behavior (ui-task)**
5. Refactor `ScalarFieldBuilder` — remove Apply button, remove Next Unmapped, wire auto-draft behavior — **Agent: ui-task**
6. Implement chain-based `UnifiedExpressionBuilder` (unified step model, step picker, source entry) — **Agent: ui-task**
7. Implement step collapse/expand and summary text rendering — **Agent: ui-task**
8. Implement condition step (total conditions, required else, branch chains, summary collapse) — **Agent: ui-task**
9. Implement value map step (required default, chain outputs, summary collapse) — **Agent: ui-task**

**Phase 3 — Supporting surfaces (ui-task)**
10. Implement "View unsaved changes" overlay (diff display, per-field revert, field navigation) — **Agent: ui-task**
11. Update `EditorTopBar` (unsaved changes badge, View unsaved changes trigger, save behavior changes) — **Agent: ui-task**
12. Update navigation guard and dirty detection for draft model — **Agent: ui-task**
13. Update `LiveExpressionDisplay` and `LiveResultDisplay` for auto-draft preview flow — **Agent: ui-task**

**Phase 4 — Architecture update (task)**
14. Update `forge/architecture/ui-application.md` to reflect the new draft model, chain semantics, and Builder panel interaction model — **Agent: task**

Phases 1-2 are sequential (2 depends on 1). Phase 3 can partially parallelize with Phase 2. Phase 4 runs after implementation stabilizes.

---

## Change Log

- Rev 1 — 2026-05-09
  - Initial draft
  - Defines auto-draft state model, chain semantics, condition/value-map behavior, collapse/summary model, and persistence boundaries
  - 20 acceptance examples covering core flows and edge cases
  - 6 open questions captured
