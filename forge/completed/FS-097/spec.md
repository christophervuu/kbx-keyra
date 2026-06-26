# SPEC

## Title

Redesign shared Builder Input Tray and Conditional method in Mapping Editor

---

## ID

FS-097  
Assigned sequentially. `FS` = Feature Spec.

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-21  
Last Updated: 2026-06-21  
Type: ui

If unknown during early drafting, use `TBD`.

`Type` indicates the primary execution domain. Used to route tasks to the correct agent (`task` or `ui-task`). Cross-cutting specs may produce tasks of mixed types — declare the type per task in that case.

---

## Status

refining

- `draft` = initial spec created, not yet refined
- `refining` = questions, tradeoffs, or repo grounding still being resolved
- `ready` = refined enough for reliable task generation and planning review
- `in_progress` = one or more tasks are being executed
- `completed` = implementation and verification finished
- `archived` = retired, replaced, or no longer relevant

This status tracks the overall lifecycle of the change, not just document editing.

This spec becomes part of the planning package together with its derived task set.

---

## Revision

Rev: 3

Rev bump required when any of the following materially change:

- intended behavior
- scope boundaries
- acceptance examples
- verification expectations
- materially affected system areas

See `Change Log` for revision history.

---

## Summary

This spec redesigns the **shared Builder Input Tray** and the **Conditional method that consumes it**. The tray is a persistent Builder-panel shell element (not conditional-only), enabling a fast default Direct mapping path and progressive disclosure into Conditional authoring when needed. The new guided experience must support multi-input field provenance/usage visibility, maintain FS-094/FS-095 draft-save contracts, and synchronize with existing KeyRa DSL without introducing new syntax.

---

## Problem

The prior draft implied that users pick Conditional before seeing Input Tray behavior, which reverses the desired hierarchy and slows the common direct-mapping flow. Current conditional controls still expose slot/operand mechanics, and tray behavior across method changes/target switches is under-specified. Without explicit shell/default/method-switch contracts, implementation risk is high for regressions in TTFSM and state consistency.

---

## Goal

Deliver a Builder experience where users can:
- open any target and immediately use a persistent Input Tray,
- complete common Direct mappings in the shortest path,
- progressively switch to Conditional when needed,
- preserve tray context across method changes,
- and restore existing rules (Direct/Conditional) in the correct method without forcing method re-selection.

---

## Assumptions

- Existing DSL syntax/function set remains unchanged.
- Existing mapping engine runtime semantics remain unchanged.
- FS-092/FS-094/FS-095 Mapping Editor shell and draft lifecycle are canonical.
- Multi-input model from FS-093 (`enrichmentSources`) remains canonical for provenance and expression generation.
- Existing save/validity gates (engine validation + draft model) remain authoritative; FS-097 does not introduce an Apply button model.

---

## Current Context

Repository-grounded context loaded before drafting/refinement:

- Loaded workflow and templates: `forge/config/workflow/AGENTS.md`, `forge/config/workflow/WORKFLOW.md`, `forge/config/templates/SPEC_TEMPLATE.md`, `forge/config/templates/TASK_TEMPLATE.md`.
- Loaded architecture index and relevant docs: `forge/architecture/INDEX.md`, `forge/architecture/ui-application.md`, `forge/architecture/backend-api.md`, `forge/architecture/mapping-engine.md`.
- Scanned in-progress specs in `forge/active/`: FS-092, FS-093, FS-094, FS-095, FS-096 are relevant context.
- Existing architecture coverage already includes Mapping Editor + Smart Builder and DSL boundaries; no new subsystem architecture document is required.
- Next available FS number across `forge/active/` and `forge/completed/` is `FS-097`.

---

## Scope

### In Scope

- Canonical Builder hierarchy with persistent Input Tray for all supported mapping methods.
- Default method behavior for unmapped scalar targets (`Direct mapping`).
- First-input and multi-select behavior under Direct mode.
- Conditional method redesign with direct IF / THEN / OTHERWISE editing.
- Add-to-Tray and Fill-Current-Value source-browser modes.
- Method-switch preservation rules (Direct↔Conditional).
- Target-scoped tray lifecycle for session-only staged rows.
- Target-switch restore rules for unmapped/direct/conditional existing rules.
- Type-aware operators/right-value editors and explicit transform requirements.
- Per-usage transforms for reused fields.
- Sample evaluation and diagnostics behavior under draft lifecycle.
- Guided ↔ Advanced DSL synchronization and strict unsupported/non-lossless fallback.
- Legacy conditional draft-shape discovery and migration execution strategy.

### Out of Scope

- New DSL syntax or functions.
- Mapping runtime semantic changes.
- Full Mapping Editor redesign beyond shared tray + conditional method behavior.
- Source Browser redesign beyond mode/state behavior needed here.
- Nested condition groups in guided mode beyond one flat group.
- Backend/Lambda contract redesign unless required metadata is unexpectedly unavailable.

---

## Non-Goals

- Replace Advanced DSL.
- Add drag-and-drop expression authoring.
- Persist unused tray inputs in engine-facing mapping config.
- Introduce a global active-input selector for conditional values.
- Add phase-one `Manage` tray view.

---

## Relevant Areas

- `ui/src/features/mappings/components/SmartBuilderPanel.tsx`
- `ui/src/features/mappings/components/InputTray.tsx`
- `ui/src/features/mappings/components/ConditionBuilder.tsx`
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/SourceSchemaPanel.tsx`
- `ui/src/features/mappings/hooks/use-mapping-editor.ts`
- `ui/src/features/mappings/lib/smart-builder-state.ts`
- `ui/src/features/mappings/lib/smart-builder-expression-generator.ts`
- `ui/src/features/mappings/lib/smart-builder-action-resolver.ts`
- `ui/src/features/mappings/**/*.test.tsx`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- Depends on FS-094 Smart Builder baseline architecture.
- Depends on FS-093 multi-input enrichment model and terminology.
- Depends on existing parser/decomposer round-trip behavior for representable conditional expressions.
- Depends on FS-094 draft-navigation behavior for unsaved target switching.

If none:
- none

---

## Constraints

- Input Tray is method-independent shell state: changing mapping method must not mount/unmount/clear/replace tray.
- Guided output must serialize to valid existing KeyRa DSL.
- Guided UI must not silently coerce incompatible types.
- Condition operators shown in guided mode must map to supported DSL composition.
- Unsupported but valid DSL must remain intact in Advanced mode.
- Save boundary unchanged: invalid/incomplete edits may exist in local draft, but existing save validity gates must prevent committing invalid executable rules.
- Accessibility and keyboard operability are required for tray rows, active values, and selection flow.

---

## Proposed Behavior

### User Flow

#### New unmapped target

1. User selects an unmapped target field.
2. Builder panel opens with target header, persistent Input Tray, default `Direct mapping` method, and empty-tray Add Input prompt.
3. User adds one or more source fields through Add Input or Source panel click.
4. First selected field becomes Direct mapping source automatically.
5. Additional selected fields remain staged in tray and do not alter direct expression.
6. If Direct mapping is sufficient, no method-selection step is required.
7. If additional logic is needed, user selects `Change method` and chooses `Conditional`.
8. Tray remains visible and unchanged; current Direct value (when representable) seeds first IF left value.
9. User configures operator, comparison value, THEN/OTHERWISE, optional additional conditions, and per-usage transforms.
10. Sample evaluation updates after valid changes; Advanced DSL remains available.

#### Existing mapped target

1. User selects a target field with an existing rule.
2. Builder opens in the rule’s saved method automatically.
3. Referenced source fields are reconstructed in the persistent tray.
4. Existing guided state is restored when representable; otherwise Advanced DSL remains authoritative without expression mutation.

### System Behavior

#### Canonical builder hierarchy

Builder layout order is:

1. Target header
2. Input Tray (persistent)
3. Mapping Method summary + change action
4. Method-specific controls
5. Sample result
6. Details
7. Footer

#### Input Tray shell behavior

- Tray is always visible for supported methods.
- Phase one defers `Manage`; grouped rows + internal scrolling are canonical.
- Empty state copy:

```text
INPUTS 0                                  [Add input]

No inputs selected yet.
Add a source field to build this mapping.
```

- Scroll activation rule:
  - show up to five compact rows without scroll,
  - enable internal tray scroll when content exceeds five rows or 320px height (whichever occurs first).

#### Default method behavior

- Newly selected unmapped scalar target starts in `Direct mapping` mode.
- Method summary displays:

```text
METHOD

Direct mapping                                  [Change method]
```

- Before source selection:

```text
Direct mapping
Select an input to continue.
```

- After first source assignment:

```text
Direct mapping
transaction.priority
```

#### First-input behavior (Direct)

- When target has no existing rule and Direct is active:
  - first field added to tray becomes direct source automatically.
- Additional fields:
  - are staged in tray only,
  - do not replace direct source automatically.
- Multi-select while Direct is empty:
  - first selected becomes direct source,
  - remaining selections are staged.

#### Source panel click routing matrix

| Current state | Clicking source field does |
| --- | --- |
| Direct method, no input assigned | Adds to tray and sets direct source |
| Direct method, source already assigned | Adds to tray only (no expression replacement) |
| Conditional, active value selected | Adds to tray and fills active value |
| Conditional, no active value | Adds to tray only |
| Explicit Add-to-Tray mode | Toggles multi-selection |
| Explicit Fill-Current-Value mode | Single-select fill for active value |

#### Method-switch preservation

Direct → Conditional:
- Preserve all tray items, order, and provenance.
- Auto-fill priority (new conditional configuration only):
  1) current Direct value if representable,
  2) else earliest selected tray item,
  3) else leave IF-left empty.
- Preserve transforms from Direct value when losslessly representable.
- Leave operator/right/THEN/OTHERWISE incomplete.
- Do not auto-place remaining tray fields.
- If current Direct expression is not representable as conditional value, do not guess/rewrite; preserve DSL and route to Advanced/fallback confirmation.

Conditional → Direct (or another non-conditional method):
- Tray is preserved.
- Confirm before discarding conditional-specific config.
- Keep prior conditional in editor-local draft state until user confirms method change.
- Inputs are not removed solely because they become unreferenced by new method.

#### Target-scoped tray lifecycle

- Tray session state is scoped per target rule key:
  - `mappingId + targetPath` (or canonical rule id if available).
- Each target field has its own tray state.
- Switching targets restores that target’s tray session state.
- New unmapped target starts with empty tray.
- Referenced fields are reconstructed from expression for that target.
- Unused staged rows persist only in active editor session for that target and are never written into mapping configuration.

#### Target-change restore behavior

- Target with unsaved builder edits:
  - follow existing FS-094 draft-navigation handling.
- New unmapped target:
  - empty tray + Direct default + Add Input prompt.
- Existing direct rule:
  - tray reconstructed with referenced sources,
  - Direct selected,
  - usage label includes `Used in: Direct mapping`.
- Existing conditional rule:
  - tray reconstructed with referenced sources,
  - Conditional selected immediately,
  - per-usage labels restored,
  - no new-conditional auto-fill run.

#### Conditional builder behavior

- IF/THEN/OTHERWISE labels only (no Fill-left/right/THEN/ELSE controls).
- Flat condition set with Match mode All/Any only.
- Type-aware operators and right-value editors; explicit transforms required for compatibility.
- Per-usage transform chains attach to usages, not tray rows.

### Failure / Edge Behavior

- Incompatible field/operator/value combinations are preserved but flagged in draft.
- Missing input sample vs field-missing vs null are distinguished in tray/sample output.
- Missing referenced input document marks unresolved references and blocks valid-save path per existing validation gates.
- Unsupported nested logical DSL uses guided fallback notice and keeps Advanced DSL authoritative unchanged.
- If legacy transform usage reconstruction is non-lossless, preserve original DSL exactly and require Advanced DSL mode (no guessing/rewriting).
- Incomplete conditional does not execute sample evaluation.

---

## Acceptance Examples

### AE-00 — Open builder and create direct mapping

**Given**
- User selects an unmapped scalar target field

**When**
- Builder opens and user adds one compatible source field

**Then**
- Input Tray is visible immediately with default Direct method
- Added field appears in tray and becomes direct mapping source
- Usage shows `Used in: Direct mapping`
- No method-selection step is required

### AE-01 — Switch Direct to Conditional preserves tray and seeds IF-left

**Given**
- Direct mapping uses `transaction.priority`
- Tray also contains staged `transaction.channel`

**When**
- User selects `Change method` → `Conditional`

**Then**
- Both tray fields remain
- `transaction.priority` fills first IF-left (when representable)
- `transaction.channel` remains staged
- Operator/right/THEN/OTHERWISE are incomplete

### AE-02 — Existing conditional reopens in conditional mode

**Given**
- Target has saved conditional rule

**When**
- User selects that target

**Then**
- Builder opens in Conditional mode directly
- Referenced fields are reconstructed in tray
- Direct mode is not shown first
- New-conditional auto-fill does not run

### AE-03 — Multi-field same-input conditions with All mode

**Given**
- Tray contains `transaction.priority`, `transaction.channel`, `customer.accountTier` from one input

**When**
- User authors two conditions and sets Match = All

**Then**
- Tray shows one grouped input section with reusable rows
- Usage indicators identify placements
- Serialized conditional composes logical AND

### AE-04 — Cross-input comparison and enrichment result

**Given**
- Tray includes primary `requestedQuantity` and enrichment `availableQuantity`, `availabilityStatus`

**When**
- User compares enrichment number to primary number and returns enrichment status in THEN

**Then**
- Tray grouping/provenance is clear
- Cross-input numeric comparison is allowed
- Sample evaluation resolves values per originating input sample

### AE-05 — Incompatible comparison in draft

**Given**
- Left value is number and right field is string for `greater than`

**When**
- User keeps incompatible selection without explicit transform

**Then**
- UI flags incompatibility in draft
- No silent cast occurs
- Existing save validity gates treat resulting expression as invalid until corrected

### AE-06 — Reused field with per-usage transforms

**Given**
- `priority` is used in IF, THEN, and OTHERWISE

**When**
- User applies different transform chains per usage

**Then**
- One tray row shows multi-usage state
- Per-usage transform chains remain independent
- Tray represents raw source only

### AE-07 — Remove referenced input with confirmation

**Given**
- Tray field is referenced in IF and OTHERWISE

**When**
- User removes field and confirms clear usages

**Then**
- Confirmation lists affected usages
- Usages are cleared atomically
- Conditional becomes incomplete and re-validation runs

### AE-08 — Source panel click routing safety

**Given**
- Direct mapping already has a source assigned

**When**
- User clicks another source field in source panel

**Then**
- New field is added to tray only
- Existing direct expression is not replaced automatically

### AE-09 — Multi-select add in empty Direct mode

**Given**
- Empty Direct mapping and Add Input multi-select

**When**
- User adds three fields in one action

**Then**
- First selected field becomes Direct source
- Remaining two fields are staged in tray
- Direct expression changes once only

### AE-10 — Change method confirmation preserves tray on cancel/confirm

**Given**
- User has configured conditional values and tray contains multiple inputs

**When**
- User initiates change from Conditional to Direct and either cancels or confirms

**Then**
- Cancel: conditional config remains unchanged and tray unchanged
- Confirm: conditional config is discarded per confirmation contract and tray remains unchanged

### AE-11 — Unsupported nested or non-lossless legacy expression fallback

**Given**
- Advanced DSL contains valid nested or non-losslessly reconstructable conditional expression

**When**
- User opens Builder mode

**Then**
- Builder shows unsupported/fallback notice
- Expression remains unchanged in Advanced DSL
- No partial guided reconstruction is rendered

---

## Open Questions

- none

---

## Verification Strategy

- Automated component/unit coverage for tray shell/default behavior, direct first-input behavior, method-switch preservation, source-click routing, condition editing, type-aware operators, and DSL generation.
- Integration tests for target-switch restore behavior across unmapped/direct/conditional targets.
- Integration tests for guided↔advanced synchronization and strict fallback (`AE-11`).
- Discovery + migration tests for legacy slot-based draft shapes and lossless transform reconstruction criteria.
- Manual keyboard/accessibility verification for tray row focus, active-value flow, and method-switch confirmation dialog.
- Standard quality gates: lint + typecheck + targeted mapping feature tests.

Coverage mapping guidance:
- `AE-00`..`AE-11` should be automated where deterministic.
- Accessibility traversal and some visual density checks remain manual-only.

---

## Task Generation Notes

- This is primarily UI work; assign implementation tasks to `Agent: ui-task`.
- Include one explicit architecture update task assigned to `Agent: task`.
- Keep tasks split by concern:
  1) state/DSL mapping,
  2) tray UI/behavior,
  3) source-browser modes + source click routing matrix,
  4) direct-default method and first-input behavior,
  5) conditional UI replacement,
  6) type-aware semantics,
  7) per-usage transforms,
  8) sample/diagnostics,
  9) legacy discovery,
  10) migration execution with strict fallback,
  11) architecture updates.
- Do not merge architecture doc updates into UI execution tasks.

---

## Change Log

- Rev 3 — 2026-06-21
  - Reframed spec to make Input Tray method-independent Builder shell state.
  - Added explicit primary flow: unmapped target opens in Direct mode with tray visible before method selection.
  - Added explicit existing-rule flow: opens in saved method with reconstructed tray references.
  - Added direct first-input behavior, multi-select behavior, and source panel click routing matrix.
  - Added method-switch preservation rules (Direct↔Conditional) and confirmation behavior.
  - Added target-scoped tray lifecycle key (`mappingId + targetPath`) and target-switch restore behavior.
  - Replaced apply-centric wording with FS-094/FS-095 draft/save validity contract language.
  - Added missing acceptance coverage (`AE-00`, method switch, reopen existing rule, routing safety, multi-select direct, change-method confirmation).

- Rev 2 — 2026-06-21
  - Resolved Q1: Phase one defers Manage tray view; grouped rows + internal scrolling only.
  - Resolved Q2: Unused staged tray rows persist only for active editor session and are not written to mapping configuration; referenced rows are reconstructed on reopen.
  - Resolved Q3: Tray scrolling threshold fixed to >5 rows or >320px content height (whichever occurs first).
  - Resolved Q4: Added explicit discovery-first migration requirement and task for lossless per-usage transform reconstruction; non-lossless cases must preserve DSL and require Advanced DSL.

- Rev 1 — 2026-06-21
  - Initial draft
