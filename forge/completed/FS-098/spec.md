# SPEC

## Title

Unified Smart Builder Output Composition and Transformation Flow

---

## ID

FS-098  
Assigned sequentially. `FS` = Feature Spec.

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-22  
Last Updated: 2026-06-22  
Type: ui

---

## Status

draft

---

## Revision

Rev: 1

---

## Summary

This spec defines the new canonical Smart Builder interaction contract for Mapping Editor scalar authoring, grounded in `feature/dev-checkpoint-1` repository state and superseding conflicting behavior from FS-094/FS-097/current implementation. The guiding invariant is: **The Input Tray contains values available to the rule. The active output recipe explicitly determines which values are used, their order, their per-use transformations, and how they produce the target. Tray membership never determines mapping behavior by itself.**

The redesign unifies direct mapping, fixed/constant values, combine/coalesce/calculation/conditional/value-map flows, final-result refinement, array handoff, and Advanced DSL fallback under one mental model: **Collect values → Build the output → Refine the result**. Success is lower TTFSM while preserving existing DSL/runtime semantics and deterministic draft/save behavior.

---

## Problem

Current Smart Builder behavior is split across multiple evolving models (FS-094/FS-097 + implementation) and still contains implicit tray-count-driven logic. Today:

- extra tray items can disable direct/value-map or trigger inferred composition,
- expression generation may fall back to “all tray inputs” when recipe operands are absent,
- transform ownership is duplicated between raw tray inputs and per-usage nodes,
- source selection exposes permanent mode toggles (`Add to tray` vs `Fill current value`),
- conditional UI exposes too much technical/debug detail for the core authoring path,
- “Unused” and warning-toned states raise friction for valid staged-but-unreferenced inputs.

This conflicts with the required product mental model and increases time/friction to first successful mapping.

---

## Goal

Deliver one deterministic Smart Builder contract where:

1. Input Tray is a reusable availability palette, not recipe logic.
2. Build Output explicitly owns recipe operands/order/per-value steps.
3. Refine Result owns post-recipe output steps.
4. Additional tray inputs never implicitly change recipe behavior.
5. Incomplete guided edits preserve last valid expression and block Save.
6. Guided mode remains lossless/decomposable-only; unsupported valid expressions stay in Advanced DSL.

---

## Assumptions

- Branch/repo grounding: `christophervuu/kbx-keyra` on `feature/dev-checkpoint-1` working tree.
- Existing mapping engine DSL/function semantics remain unchanged.
- Existing Array Builder remains authoritative for deep array authoring.
- Existing Mapping Editor draft/save distinction remains canonical.
- Existing project value-table/valueMap contracts from FS-096 remain canonical.

---

## Current Context

Repository-grounded review completed for:

- `ui/src/features/mappings/components/SmartBuilderPanel.tsx`
- `ui/src/features/mappings/components/InputTray.tsx`
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/SourceSchemaPanel.tsx`
- `ui/src/features/mappings/lib/smart-builder-state.ts`
- `ui/src/features/mappings/lib/smart-builder-expression-generator.ts`
- `ui/src/features/mappings/lib/smart-builder-action-catalog.ts`
- `ui/src/features/mappings/lib/smart-builder-action-resolver.ts`
- `ui/src/features/mappings/hooks/use-mapping-editor.ts`
- `ui/src/routes/pages/MappingEditor.tsx`
- relevant tests in `ui/src/features/mappings/**/*.test.ts(x)` and `ui/src/routes/pages/MappingEditor.test.ts`

Observed deltas vs requested behavior:

- tray usages are mostly direct/conditional only (`getBuilderInputUsages`) and do not recurse across all recipe/value contexts,
- input transforms are currently stored on `BuilderInput` and also on `BuilderArgumentValue.transforms` (dual ownership),
- expression generator uses insertion-order fallback (`resolveOrderedInputIds`) for omitted recipe operand lists,
- SourceSchemaPanel still renders permanent selection-mode toggle,
- InputTray still labels unreferenced items as `Unused`.

Related in-progress specs reviewed: FS-094, FS-095, FS-096, FS-097.

Architecture docs loaded: `forge/architecture/INDEX.md`, `ui-application.md`, `mapping-engine.md`.

Next available FS number from `forge/active/` + `forge/completed/` is FS-098.

---

## Scope

### In Scope

- Canonical Smart Builder hierarchy and terminology:
  - Target header
  - Inputs
  - Build Output
  - Refine Result
  - Details
  - Footer actions
- Canonical invariant enforcement: tray membership never implies recipe behavior.
- Superseding conflicting FS-094/FS-097/current Smart Builder behaviors.
- Canonical recipe/value-reference model and transform scope model.
- Deterministic expression generation using explicit recipe operands only.
- Guided hydration/decomposition rules and Advanced DSL fallback contracts.
- Input Tray UX, grouping, usage states, remove behavior, session-scoped persistence.
- Direct/fixed/constant/combine/coalesce/calculation/conditional/value-map/array-handoff flows.
- Change logic confirmation + undo snapshot model.
- Incomplete recipe lifecycle + save-blocking behavior.
- Contextual source selection mode (task-driven, not permanent toggle).
- Accessibility and analytics instrumentation requirements.

### Out of Scope

- New DSL syntax/functions or engine runtime semantic changes.
- Backend/Lambda changes unless repository-discovered blocking constraint appears.
- Full Array Builder redesign.
- Nested guided conditional groups.
- Test Lab redesign.
- Deployment actions in Mapping Editor.

---

## Non-Goals

- Auto-selecting recipe from second+ input count/type.
- Persisting unused tray inputs in mapping config or deployment snapshots.
- Building a global drag/drop expression canvas.
- AI auto-commit or AI auto-recipe selection.

---

## Relevant Areas

- `ui/src/features/mappings/components/SmartBuilderPanel.tsx`
- `ui/src/features/mappings/components/InputTray.tsx`
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/SourceSchemaPanel.tsx`
- `ui/src/routes/pages/MappingEditor.tsx`
- `ui/src/features/mappings/lib/smart-builder-state.ts`
- `ui/src/features/mappings/lib/smart-builder-expression-generator.ts`
- `ui/src/features/mappings/lib/smart-builder-action-catalog.ts`
- `ui/src/features/mappings/lib/smart-builder-action-resolver.ts`
- `ui/src/features/mappings/hooks/use-mapping-editor.ts`
- `ui/src/features/mappings/**/*.test.ts(x)`
- `ui/src/routes/pages/MappingEditor.test.ts`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- Depends on existing FS-094/095/097 implementation surfaces as migration source.
- Depends on existing FS-096 value-table contracts.
- Depends on existing Mapping Editor draft/save gates in `use-mapping-editor`.
- No external API/version-sensitive dependency requiring Tavily lookup.

---

## Constraints

- **Product invariant (locked): The Input Tray contains values available to the rule. The active output recipe explicitly determines which values are used, their order, their per-use transformations, and how they produce the target. Tray membership never determines mapping behavior by itself.**
- Guided builder emits only registered valid existing DSL.
- Engine validation remains canonical correctness source.
- No silent casts/coercions.
- Incomplete guided state must preserve last valid executable expression and block global Save.
- Session-only staged tray inputs are target-scoped (`mappingId + targetPath`) and non-persistent to mapping config/deployment snapshot.
- Scroll threshold: >5 rows or >320px content height.
- Existing Array Builder remains canonical for deep array logic.

---

## Proposed Behavior

### Superseded Behavior (explicit)

This spec supersedes conflicting behavior from FS-094, FS-097, and current implementation:

1. Direct invalidated by tray count >1.
2. Implicit use of all tray inputs as recipe operands.
3. Auto-concat for multiple strings.
4. Auto-calculation for multiple numbers.
5. Auto-conditional for multiple inputs.
6. Warning merely for unreferenced tray input.
7. Global input transforms tied to first tray item.
8. Dual transform ownership (raw tray + per-use).
9. Fallback-to-all-tray IDs when recipe operands missing.
10. Auto-inserting every tray input into compose/coalesce/math/array flows.
11. Forcing method selection before first meaningful action.
12. Empty placeholder sections (`Fallback`, `Input Transforms`, `Output Steps`) when unset.
13. Detailed conditional debugger/tester inside Smart Builder.
14. Permanently exposed `Add to tray` / `Fill current value` mode toggle in Input panel.

### User Flow

#### Canonical hierarchy

1. Target header
2. Inputs
3. Build Output
4. Refine Result
5. Details
6. Footer actions

#### Empty target and first input

- Selecting unmapped scalar target opens builder immediately with Inputs + neutral Build Output guidance.
- First compatible source selection:
  - adds to tray,
  - auto-creates Direct (`Use one value`),
  - immediately generates `source("path")` and updates draft/summary/validation.
- This is the only automatic recipe inference.

#### Additional input flow (while Direct active)

- Additional source click adds tray row as `Available`.
- Direct recipe and expression remain unchanged.
- Build Output emphasizes change options (`Change logic`) without warnings.

#### Build Output recipe chooser

- Shows compatible recipes first by target type and context.
- Unavailable options are secondary disclosure with reasons.
- Recipes explicitly own selected values/order/per-value steps.

#### Recipe families

- Use one value (Direct)
- Fixed value
- Constant
- Combine values (explicit ordered parts; literals as visible parts)
- Use first available (explicit ordered values)
- Calculate (explicit start + ordered operations)
- Conditional (flat all/any, sentence-oriented)
- Value mapping (explicit lookup value, inline/project)
- Array handoff (existing Array Builder)

#### Refine Result

- Collapsed method-independent section.
- Appears only as actionable container (`Add step`) when empty.
- Ordered steps applied after recipe output.

#### Source/Input Fields interaction

- No permanent mode toggle.
- Normal state: click adds to tray.
- Active recipe slot: contextual single-select prompt (e.g., “Choose a value for THEN”).
- Explicit Add Input: multi-select add-to-tray mode.

#### Remove input behavior

- Available unreferenced input: remove immediately, DSL unchanged.
- Referenced input: confirm with usage list; clear references atomically; mark recipe incomplete; preserve last valid expression.

#### Change logic + undo

- Direct→other recipe: safe deterministic seed of first obvious slot only.
- Nontrivial→other recipe: confirmation required; tray preserved; old recipe only recoverable by Undo.
- Undo restores full snapshot state (not only expression text).

#### Incomplete lifecycle

- Incomplete guided state remains visible.
- Last valid executable expression stays active.
- Save blocked until complete/discard/clear mapping.

#### Advanced DSL

- `Editor` renamed to `Advanced DSL`.
- Guided entry only when lossless decomposition possible.
- Unsupported valid expressions remain unchanged and Advanced-only.

### System Behavior

#### Canonical invariant enforcement

- Tray membership never determines mapping behavior by itself.
- Action resolver and generator rely on explicit recipe values only.

#### Canonical state model

`SmartBuilderDraft` evolves to include:

- `availableInputs`
- `recipe`
- `resultSteps`
- `recipeStatus` (`valid|incomplete|invalid`)
- `validExpression`
- `lastValidExpression`
- `undoHistory` of full snapshots (max 20)

Semantics must match the required model in the request.

#### Canonical value reference model

Guided recipe values support:

- input reference
- fixed primitive
- named constant

Each value usage owns per-value steps.

#### Transform ownership

Exactly two scopes:

1. Per-value steps (before recipe composition)
2. Final-result steps (after recipe output)

Raw tray inputs do not canonically own transforms.

#### Expression generation

Pure deterministic generation rules:

- explicit recipe operands only,
- recipe order drives argument order,
- no fallback to “all tray rows,”
- no replacement DSL emitted for incomplete recipe,
- only registered DSL functions.

#### Hydration/decomposition

Lossless guided hydration supports direct/fixed/constant/concat/coalesce/calculation/flat conditional/value-map/array handoff where representable. Non-lossless or unsupported valid expressions remain untouched in Advanced DSL.

#### Save/draft lifecycle

- Valid guided edits update valid draft expression immediately.
- Incomplete guided state blocks global Save.
- Save persists valid draft expressions only.
- Save does not deploy.

### Failure / Edge Behavior

- Missing required recipe values/operators/table config -> recipe incomplete.
- Division by literal zero -> immediate warning.
- Type incompatibility -> explicit convert required.
- Removed referenced input -> explicit confirmation + atomic clear.
- Unsupported expression decomposition -> Advanced DSL fallback with reason.
- Available but unreferenced tray rows -> neutral status, no warning.

---

## Product Invariants (locked)

1. **The Input Tray contains values available to the rule. The active output recipe explicitly determines which values are used, their order, their per-use transformations, and how they produce the target. Tray membership never determines mapping behavior by itself.**
2. Extra tray inputs do not invalidate Direct or Value Mapping.
3. Multi-value recipes explicitly own operands and order.
4. Per-value and final-result transform scopes are distinct.
5. Incomplete guided recipes preserve last valid expression and block Save.

---

## Acceptance Examples

### AE-01 — Empty target
**Given** unmapped scalar target selected  
**When** builder opens  
**Then** Inputs + Build Output render, no invalid direct config, fixed/constant available without tray input.

### AE-02 — First source creates Direct
**Given** empty recipe  
**When** first source clicked  
**Then** direct recipe created and expression becomes `source("path")`.

### AE-03 — Second source does not change Direct
**Given** valid direct recipe  
**When** second source clicked  
**Then** new tray row is `Available`, expression unchanged, no warning, Build Output emphasized.

### AE-04 — Direct valid with five tray inputs
**Given** tray has five+ inputs  
**When** one is selected for direct  
**Then** only selected value used, others available, save allowed.

### AE-05 — Change direct source
**Given** direct recipe  
**When** user chooses another value  
**Then** direct updates to new value, previous becomes available.

### AE-06 — Direct value step
**Given** direct recipe  
**When** per-value step added  
**Then** generated DSL wraps selected direct value.

### AE-07 — Final-result step
**Given** configured recipe  
**When** refine-result step added  
**Then** step wraps completed recipe expression.

### AE-08 — Combine explicit parts
**Given** combine recipe with input/literal/input parts  
**When** saved  
**Then** DSL is `concat(source("customer.firstName"), " ", source("customer.lastName"))`; literal not in tray.

### AE-09 — Combine reordered parts
**Given** combine parts reordered  
**When** expression generated  
**Then** argument order follows recipe order; tray order unchanged.

### AE-10 — Reuse one field twice
**Given** same tray input used twice in recipe  
**When** expression generated  
**Then** one tray row, two value usages, independent per-use steps.

### AE-11 — Use first available
**Given** explicit ordered coalesce values  
**When** expression generated  
**Then** order preserved; extra tray values excluded.

### AE-12 — Calculation
**Given** explicit start + ordered operations  
**When** expression generated  
**Then** ordered math nesting matches configured operations; extra numeric inputs stay available.

### AE-13 — Conditional boolean
**Given** boolean field condition “is true” + fixed THEN/OTHERWISE  
**When** complete  
**Then** valid conditional DSL generated.

### AE-14 — Conditional field comparison
**Given** two fields same source  
**When** used in condition  
**Then** valid compare DSL generated.

### AE-15 — Cross-input conditional
**Given** primary + enrichment fields  
**When** compared  
**Then** valid cross-input condition generated.

### AE-16 — Multiple conditions All
**Given** second condition added + mode All  
**When** expression generated  
**Then** logical AND semantics generated.

### AE-17 — Multiple conditions Any
**Given** second condition added + mode Any  
**When** expression generated  
**Then** logical OR semantics generated.

### AE-18 — Incomplete conditional lifecycle
**Given** previous valid expression exists  
**When** conditional missing THEN/OTHERWISE  
**Then** incomplete state shown, last valid expression remains active, save blocked; completion replaces active expression.

### AE-19 — Inline Value Mapping
**Given** value-map with explicit lookup + inline rows + no-match mode  
**When** expression generated  
**Then** valid inline `valueMap(...)` output produced.

### AE-20 — Project Value Mapping
**Given** explicit project table + revision + direction + no-match mode  
**When** configured  
**Then** valid `valueTable(...)`-backed `valueMap(...)` generated with pinned metadata compatibility.

### AE-21 — Value Mapping with extra tray fields
**Given** value-map lookup selected and extra tray rows  
**When** validating  
**Then** lookup remains valid, extras remain available, no input-count error.

### AE-22 — Remove Available input
**Given** unreferenced input  
**When** remove clicked  
**Then** removed immediately; DSL unchanged.

### AE-23 — Remove referenced input
**Given** referenced input in recipe  
**When** remove confirmed  
**Then** usages listed, references cleared atomically, recipe incomplete, last valid expression preserved.

### AE-24 — Contextual source selection
**Given** THEN slot active  
**When** user selects source field  
**Then** field assigned to THEN and added to tray if missing.

### AE-25 — Explicit Add Input multi-select
**Given** Add Input multi-select open  
**When** multiple fields selected  
**Then** fields added to tray; no inferred recipe except first-input direct rule.

### AE-26 — Change logic confirmation
**Given** configured nontrivial recipe  
**When** changing to different recipe kind  
**Then** confirmation appears; tray retained; replacement only on confirm.

### AE-27 — Undo full recipe change
**Given** snapshot-capable edits  
**When** undo triggered  
**Then** tray, recipe, order, transforms, and expression all restore.

### AE-28 — Target switching
**Given** multiple targets edited in session  
**When** switching targets  
**Then** each target restores its own tray/recipe session state.

### AE-29 — Reopen saved Direct
**Given** saved direct rule reopened  
**When** hydrated  
**Then** referenced input reconstructed and direct recipe restored.

### AE-30 — Reopen saved Combine
**Given** saved combine reopened  
**When** hydrated  
**Then** parts/literals/order/transforms restored.

### AE-31 — Reopen saved Conditional
**Given** saved flat conditional reopened  
**When** hydrated  
**Then** conditions/branches/usages restored.

### AE-32 — Reopen saved Value Mapping
**Given** saved value-map reopened  
**When** hydrated  
**Then** lookup/scope/direction/revision/no-match restored.

### AE-33 — Unsupported advanced expression
**Given** valid but non-lossless expression  
**When** opening guided mode  
**Then** expression unchanged; Advanced DSL shown; no partial guided reconstruction.

### AE-34 — No silent cast
**Given** incompatible value types  
**When** user attempts recipe/value assignment  
**Then** explicit Convert required; no silent coercion.

### AE-35 — Array handoff
**Given** array-capable logic selection in scalar smart builder  
**When** invoked  
**Then** hands off to existing Array Builder flow.

---

## Open Questions

- none

---

## Verification Strategy

- Unit tests:
  - `smart-builder-state` (recipe model, usage derivation, incomplete/valid lifecycle, snapshot behavior).
  - `smart-builder-expression-generator` (explicit operand-only deterministic generation).
  - action resolver/catalog tests (compatibility-first chooser, no tray-count inference).
- Component tests:
  - `InputTray`, `SmartBuilderPanel`, `SourceSchemaPanel`, `ScalarFieldBuilder` for hierarchy, copy, statuses, slot routing, and remove confirmations.
- Integration tests:
  - `MappingEditor.test.ts` target-scoped state restore, save blocking on incomplete recipes, undo behavior, method-switch confirmation.
- Regression checks map to AE-01…AE-35 with deterministic assertions.
- Standard quality gates: typecheck, lint, relevant test suites.

---

## Task Generation Notes

- Generate atomic tasks matching requested 21-part breakdown.
- Assign `ui-task` for UI/component/state/hook/tests work.
- Assign `task` for architecture-update task only.
- Include explicit architecture update task for `forge/architecture/ui-application.md` + `INDEX.md` to codify superseded/canonical smart-builder contract.
- Do not create a new architecture document (existing subsystem coverage exists).

---

## Change Log

- Rev 1 — 2026-06-22
  - Initial draft for FS-098.
  - Grounded against current Smart Builder implementation, FS-094/FS-095/FS-096/FS-097 artifacts, and architecture docs.
  - Locks canonical invariant and superseded behavior list.
