# SPEC

## Title

Make Smart Builder actions parameter-aware with explicit guided editors

---

## ID

FS-095  
Assigned sequentially. `FS` = Feature Spec.

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-16  
Last Updated: 2026-06-16  
Type: ui

If unknown during early drafting, use `TBD`.

`Type` indicates the primary execution domain. Used to route tasks to the correct agent (`task` or `ui-task`). Cross-cutting specs may produce tasks of mixed types - declare the type per task in that case.

---

## Status

draft

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

Rev: 1

Rev bump required when any of the following materially change:

- intended behavior
- scope boundaries
- acceptance examples
- verification expectations
- materially affected system areas

See `Change Log` for revision history.

---

## Summary

Smart Builder currently supports recipe-first action selection and immediate expression updates, but many actions still depend on implicit arguments or fixed drafts instead of explicit user-configured parameters. This change introduces a parameter-schema-driven action draft lifecycle so guided actions can expose required and optional parameters in deterministic editors, preview resulting DSL, and apply changes without hidden defaults. Success means all guided DSL actions with parameters are discoverable, editable, and serializable through one consistent model while preserving FS-094 interaction patterns and recent UX fixes.

---

## Problem

Current guided actions are inconsistent: some actions are one-click templates while others require parameters that are not represented in a first-class model. This causes gaps where actions are unavailable, only partially wired, or silently assume defaults that users cannot see or change. The result is reduced trust in guided mode and frequent fallback to raw expression editing for otherwise common mapping tasks.

---

## Goal

Deliver a unified parameter-aware guided action system where every parameterized DSL action has explicit, validated editor controls and a deterministic apply path from action selection to draft expression update. Keep recipe-first UX, condensed row-editing layout behavior, and explicit action visibility rules intact.

---

## Assumptions

- FS-094 smart-builder replacement architecture remains the active baseline.
- Existing recipe-first panel controls (`+ Add input`, `MAPPING RECIPE`, on-demand base/step pickers) remain the primary interaction model.
- Mapping engine DSL registry remains source of truth for valid function names and argument semantics.
- Advanced editor remains available as an escape hatch for unsupported or intentionally advanced authoring.
- Existing source type hydration fix (`sourceValueTypeByPath`) remains available for action availability and parameter validation context.

---

## Current Context

Repository-grounded context loaded before drafting:

- `forge/architecture/INDEX.md` and relevant docs (`ui-application.md`, `mapping-engine.md`, `backend-api.md`, `project-structure.md`) were reviewed.
- Active related specs reviewed: FS-092, FS-093, FS-094.
- Smart Builder now uses recipe-first controls in `SmartBuilderPanel.tsx`; always-visible action catalogs were removed.
- `applySmartActionToDraft` in `MappingEditor.tsx` was expanded recently but still mixes fixed templates and bespoke parameter handling.
- `smart-builder-action-catalog.ts` defines action entries but does not yet provide complete parameter schema coverage for all guided DSL actions.
- `smart-builder-state.ts` hydration now supports source type maps, which should be leveraged for parameter-editor validation and availability checks.

---

## Scope

### In Scope

- Add a formal action parameter schema model for guided Smart Builder actions.
- Add action draft lifecycle state (selected action, parameter values, validation, apply/cancel/reset behavior).
- Implement reusable parameter editor rendering in Smart Builder for action-specific controls.
- Ensure parameter values are explicit in UI for required and optional arguments; no hidden assumptions in guided mode.
- Expand guided action coverage for parameterized DSL operations to use the shared parameter lifecycle.
- Ensure action availability/disabled-reason logic accounts for parameter requirements and current input/target types.
- Preserve current recipe-first interaction, condensed row-editing layout behavior, and explicit unused-input guidance.
- Add or update tests for lifecycle, editors, generation, and regressions.

### Out of Scope

- New DSL function additions in the mapping engine.
- Replacing Advanced/raw expression editor.
- Full redesign of Mapping Editor layout beyond already landed condensed/recipe-first behavior.
- AI ranking/recommendation for actions or auto-filling action parameters from heuristics.
- Backend API, persistence, or runtime execution contract changes.

---

## Non-Goals

- Introduce hidden auto-parameterization in guided mode.
- Revert to always-visible action catalog body inside Smart Builder panel.
- Re-open FS-094 array architecture decisions.
- Change save boundary semantics (draft updates vs global Save persistence).

---

## Relevant Areas

- `ui/src/features/mappings/components/SmartBuilderPanel.tsx`
- `ui/src/features/mappings/components/SmartBuilderPanel.test.tsx`
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/ScalarFieldBuilder.test.tsx`
- `ui/src/routes/pages/MappingEditor.tsx`
- `ui/src/routes/pages/MappingEditor.test.ts`
- `ui/src/features/mappings/lib/smart-builder-action-catalog.ts`
- `ui/src/features/mappings/lib/smart-builder-action-resolver.ts`
- `ui/src/features/mappings/lib/smart-builder-state.ts`
- `ui/src/features/mappings/lib/smart-builder-state.test.ts`
- `ui/src/features/mappings/lib/*smart-builder*.test.ts`

---

## Dependencies / Blockers

- Depends on FS-094 baseline behavior and currently landed recipe-first UI flows.
- Depends on FS-093 enrichment input semantics where action parameters may reference enrichment-derived values.
- Depends on complete DSL registry understanding from `mapping-engine.md` and `ui/src/lib/data/dsl-functions.ts`.

If none:
- none

---

## Constraints

- Guided actions must only emit registered DSL functions with valid argument structures.
- Parameter editors must represent effective values before apply; hidden defaults are not allowed for guided actions.
- Disabled actions remain hidden by default in pickers and appear through search with deterministic unavailable reasons.
- Array-only add-input options (`Item()`, `Parent()`) remain conditional on array-scope context.
- Recipe-first hierarchy and condensed row-editing allocation must not regress.
- Expression updates remain draft-only until global Save.

---

## Proposed Behavior

### User Flow

1. User selects a target field and opens Smart Builder in recipe-first mode.
2. User chooses base or step action from on-demand picker.
3. If action has parameters, Smart Builder opens an inline action editor with labeled fields, defaults shown explicitly, and validity state.
4. User modifies parameters and sees immediate preview/state update for pending action draft.
5. User applies action; recipe and draft DSL update immediately and visibly.
6. User can re-open an applied parameterized step to edit parameters and re-apply deterministically.

### System Behavior

- Action catalog entries support parameter schema metadata (field id, type, label, required/optional, explicit default, constraints).
- Smart Builder keeps parameter drafts in state separate from committed recipe steps.
- `applySmartActionToDraft` consumes normalized parameter payloads from shared action draft lifecycle instead of action-specific ad-hoc argument assembly.
- Parameter validation errors are surfaced in editor UI and block apply until valid.
- Action resolver considers current input/target context plus parameter requirements when deciding enabled vs disabled state and reason messaging.
- Existing one-click actions remain one-click where no parameters are required.
- Existing parameterized actions (for example substring and similar transform-style actions) are migrated to shared parameter editor flows.

### Failure / Edge Behavior

- If a previously applied action becomes invalid after input/type changes, step is flagged with repair guidance and deterministic reason.
- If parameter draft is incomplete, apply is blocked and no DSL mutation occurs.
- If hydration opens an existing expression that maps to a parameterized action, editor reflects recovered parameter values when decomposable.
- If decomposition cannot recover parameters safely, builder keeps Advanced fallback behavior and does not fabricate parameter values.

---

## Acceptance Examples

### AE-01 - Parameterized action opens explicit editor

**Given**
- user has selected a target field
- user opens `+ Add step`

**When**
- user selects a parameterized action (for example substring)

**Then**
- Smart Builder shows a parameter editor with labeled controls for each required/optional argument
- any default value shown in the editor is explicit and user-visible

### AE-02 - Apply requires valid parameter state

**Given**
- a parameterized action draft has missing or invalid required inputs

**When**
- user attempts to apply

**Then**
- apply is blocked
- field-level or action-level validation guidance is shown
- draft expression is unchanged

### AE-03 - Valid parameter apply mutates recipe and DSL

**Given**
- user configures valid parameters for a selected action

**When**
- user clicks apply

**Then**
- recipe step is added or updated with parameterized configuration
- draft expression mutates immediately to the expected DSL
- mapped-row draft/unsaved indicators update consistently

### AE-04 - Applied parameterized step is editable

**Given**
- recipe already contains a parameterized step

**When**
- user re-opens that step

**Then**
- editor hydrates existing parameter values
- edits re-apply deterministically and update DSL without duplicating step intent

### AE-05 - Availability + disabled reason behavior remains explicit

**Given**
- current input/target context makes some actions unavailable

**When**
- user opens action picker and searches unavailable actions

**Then**
- unavailable actions appear only in search results
- each unavailable action includes a deterministic reason

### AE-06 - Recipe-first and condensed layout behavior is preserved

**Given**
- row-editing mode with condensed target panel enabled

**When**
- user selects and applies parameterized actions

**Then**
- target panel remains condensed (Status/Target/Notes)
- builder width allocation and recipe-first hierarchy remain unchanged

### AE-07 - Array-context add-input options remain context-gated

**Given**
- user is not in array-scope authoring context

**When**
- user opens `+ Add input`

**Then**
- `Item()` and `Parent()` options are not shown

**When**
- user is in array-scope context

**Then**
- `Item()` and `Parent()` options are available

### AE-08 - Non-decomposable expressions avoid unsafe parameter reconstruction

**Given**
- saved expression includes unsupported or ambiguous parameterized patterns

**When**
- builder hydrates selected row

**Then**
- builder uses Advanced fallback behavior
- guided parameter editor is not populated with guessed values

---

## Open Questions

- none

---

## Verification Strategy

- Unit tests for parameter schema normalization, validation rules, and action apply payload generation (AE-01/02/03).
- Unit tests for step edit hydration and deterministic re-apply behavior (AE-04).
- Resolver and picker tests for unavailable visibility/search + reason text behavior (AE-05).
- Integration tests for recipe-first + condensed row-editing regression coverage while using parameterized actions (AE-06).
- Integration tests for array-context-gated `Item()/Parent()` add-input visibility (AE-07).
- Hydration fallback tests for non-decomposable parameterized expressions (AE-08).
- Standard quality gates for touched UI areas: lint, typecheck, targeted and full relevant test suites.

---

## Task Generation Notes

- Generate tasks in this order to isolate risk:
  1. action parameter schema + state contracts,
  2. action apply pipeline refactor,
  3. Smart Builder parameter editor UI,
  4. resolver/picker availability behavior,
  5. regression + verification sweep.
- Keep tasks atomic and map each task to explicit `AE-##` IDs.
- Keep all implementation tasks as `ui-task` unless a cross-subsystem architecture update becomes necessary.
- If new file/folder structure is introduced, verify alignment with `forge/architecture/project-structure.md` during implementation.

---

## Change Log

- Rev 1 - 2026-06-16
  - Initial draft
