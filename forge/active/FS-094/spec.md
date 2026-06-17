# SPEC

## Title

Rebuild Mapping Editor builder as a Smart Input Tray Builder (replacement architecture)

---

## ID

FS-094  
Assigned sequentially. `FS` = Feature Spec.

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-14  
Last Updated: 2026-06-14  
Type: cross-cutting

If unknown during early drafting, use `TBD`.

`Type` indicates the primary execution domain. Used to route tasks to the correct agent (`task` or `ui-task`). Cross-cutting specs may produce tasks of mixed types — declare the type per task in that case.

---

## Status

ready

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

Replace the current Mapping Editor scalar builder internals with a new Smart Input Tray Builder centered on multi-input authoring, immediate draft expression updates, and action-driven composition. The new builder is a replacement architecture (not an extension of `ChainBuilderState`) and must preserve the persisted DSL contract while making direct mapping instant and multi-input composition discoverable for BA/CIS users. The action system must be catalog-driven, show enabled + disabled actions with reasons, and only emit DSL functions that are valid in the registered engine function set.

---

## Problem

Current builder behavior assumes single-source insertion and accumulated chain wrapping semantics. This conflicts with the target workflow where users first gather multiple inputs (primary, enrichment, constant, static, array context) and then choose how to compose/transform/condition/map those inputs. It also creates DSL consistency risk because current condition operators include values that do not map 1:1 to registered DSL functions and rely on special-case generation logic.

---

## Goal

Deliver a target-focused Smart Input Tray Builder that:
- supports click-to-add multi-input mapping by default,
- auto-saves draft expressions on source/action changes,
- supports per-input transforms and composition over 2+ inputs,
- provides deterministic undo between direct and composed states,
- covers all current DSL function capabilities via builder actions/input types/advanced-only mapping,
- and validates through existing engine validation rather than a parallel correctness system.

---

## Assumptions

- Persisted mapping rules remain DSL expression strings; no DSL syntax migration is required.
- Existing engine parser/validator/evaluator contracts remain authoritative.
- Existing enrichment canonical model from FS-093 (`enrichmentSources` with `external()` runtime access) remains unchanged.
- Existing Array Builder and array DSL support exist and can be integrated rather than re-inventing engine-level array semantics.
- Replacing builder internal state is allowed; migration of in-progress legacy builder draft state is not required.

---

## Current Context

Repository-grounded context loaded before drafting:

- `forge/architecture/INDEX.md` loaded; relevant docs reviewed: `ui-application.md`, `mapping-engine.md`, `backend-api.md`, `persistence-model.md`.
- In-progress related specs loaded: FS-092 (Mapping Editor grid/details model) and FS-093 (multi-input enrichment support).
- `ui-application.md` currently documents chain-based scalar builder (`ChainBuilder`) and legacy builder surfaces; this spec replaces scalar builder architecture and must remain aligned with FS-092 authoring-route boundaries and FS-093 enrichment terminology.
- `mapping-engine.md` already documents full DSL function registry, array scope semantics (`item()/parent()`), and validate/execute contracts.
- Next available FS number from `forge/active/` + `forge/completed/` is FS-094.

---

## Scope

### In Scope

- Replace scalar builder internal model with new `SmartBuilderDraft` + input tray model.
- Implement input tray behaviors:
  - click-to-add source input,
  - append (not replace) behavior for 2+ inputs,
  - focused slot fill behavior,
  - remove input behavior and deterministic insertion-order expression generation.
- Implement immediate draft expression auto-save behavior (draft-only, not persisted until global Save).
- Implement deterministic expression generation from smart-builder state.
- Implement undo behavior across direct mapping -> composed mapping transition.
- Implement builder action catalog + resolver with grouped categories and disabled-reason support.
- Implement per-input transform chains and composition flows (concat/math/condition/valueMap/coalesce/null/convert/date/string).
- Ensure catalog DSL coverage accounting for all current functions: direct action, input type, advanced-only, or intentional unsupported + documented reason.
- Restrict guided actions to registered DSL functions; remove/replace non-DSL operator options from guided UI.
- Integrate array-capable actions with existing array authoring system and define explicit integration contract for map/filter/find/item/parent paths.
- Keep advanced raw expression editor as escape hatch without reusing function reference panel as builder action source.
- Add unit/integration tests for tray behavior, generator, resolver, and validation integration.

### Out of Scope

- Migration of unsaved legacy builder draft state.
- AI recommendations/ranking for actions.
- Rebuild of Deployment/Test Lab flows.
- Backend API changes unless needed to read already-existing enrichment metadata in builder context.
- Full redesign of raw advanced editor/function reference UX beyond minimal compatibility needs.
- Tray drag/drop reorder UI and move up/down controls.

---

## Non-Goals

- Preserve legacy `ChainBuilderState`/`ChainBuilder` architecture.
- Introduce DSL functions not currently in engine registry in this spec.
- Auto-persist mappings without global Save.
- Replace mapping-engine validation with UI-only validation.

---

## Relevant Areas

- `ui/src/features/mappings/components/MappingEditorPage.tsx`
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/ExpressionBuilderPanel.tsx`
- `ui/src/features/mappings/components/SmartBuilderPanel.tsx` (new)
- `ui/src/features/mappings/components/InputTray.tsx` (new)
- `ui/src/features/mappings/components/BuilderActionList.tsx` (new)
- `ui/src/features/mappings/components/ConditionBuilder.tsx` (new)
- `ui/src/features/mappings/components/ArrayBuilder.tsx` (integration)
- `ui/src/features/mappings/hooks/use-mapping-editor.ts`
- `ui/src/features/mappings/lib/smart-builder-state.ts` (new)
- `ui/src/features/mappings/lib/smart-builder-action-catalog.ts` (new)
- `ui/src/features/mappings/lib/smart-builder-action-resolver.ts` (new)
- `ui/src/features/mappings/lib/smart-builder-expression-generator.ts` (new)
- `ui/src/features/mappings/lib/smart-builder-dsl-coverage.ts` (new)
- `ui/src/lib/data/dsl-functions.ts`
- `ui/src/features/mappings/**/*.test.ts(x)`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- Depends on FS-092 editor layout contracts (target row selection -> builder panel hydration, advanced mode default hidden).
- Depends on FS-093 enrichment input contracts and terminology (`Enrichment input` as guided label, `external()` DSL in generated output).
- Input click behavior wiring must align with current Source/Input panel event model from FS-092/093 implementation state.
- FS-094 requires an additive source/input field-selection event contract because current plain path staging (`onStageField: (path: string) => void`) is insufficient for focused-slot behavior.

---

## Constraints

- Guided builder output must always be syntactically valid KeyRa DSL expression text composed from registered functions.
- Guided builder must only offer actions that map to registered DSL functions.
- Raw editor may temporarily contain invalid DSL while user is editing, but invalid raw expressions are never treated as valid guided-builder output.
- Disabled actions should remain visible with deterministic reason text.
- Direct first-click mapping must remain low-latency and immediate.
- Undo stack must preserve prior direct expression when entering compose mode.
- Validation source of truth remains engine `validate` path.
- Save semantics remain unchanged: builder edits update draft only; global Save persists.

---

## Proposed Behavior

### User Flow

1. User selects a target field in Mapping Editor.
2. Smart Builder opens in target-focused state with empty tray guidance.
3. User clicks input fields; first click creates direct draft expression immediately.
4. Additional input clicks append to tray; builder shifts to compose-capable mode.
5. User applies transforms/actions (or fills focused condition slot) and sees immediate draft/output/unsaved updates.
6. User uses Undo to recover previous direct state if needed.
7. User saves globally to persist draft expression.

### System Behavior

- Introduce new `SmartBuilderDraft` model (separate from existing chain model) containing:
  - target metadata,
  - ordered tray inputs,
  - focused slot id,
  - composition state,
  - post-steps,
  - deterministic expression,
  - `previousExpressions` history,
  - validation state.
- Input tray supports source kinds: `primary | enrichment | constant | static | item | parent | expression`.
- First source click with empty tray creates `source("path")` draft expression immediately.
- No-slot click appends to tray; focused slot click fills slot instead of append.
- Focused-slot fill creates a slot-scoped input reference that participates in type/sample/transform/expression generation; it does not visibly append to top-level tray unless user explicitly promotes it.
- Action catalog entries include category, constraints, applicability, `getAvailability(context)`, and `createDraft(context)`.
- Resolver returns enabled actions first; disabled actions are retained with machine-derived user reason strings.
- Expression generation is pure/deterministic from state.
- Engine validation runs on draft expression updates and surfaces diagnostics in builder UI.
- Condition/operator set in guided UI is restricted to operations with valid generator-to-DSL mapping; unregistered pseudo-operators (including `startsWith`) are removed from guided controls.
- `isTruthy` / `isFalsy` are permitted in guided UI only if compiled into valid registered DSL patterns and covered by tests.
- Deterministic input ordering rule:
  - `SmartBuilderDraft.inputs` insertion order is canonical in Rev 1,
  - expression generation uses insertion order unless a composition editor explicitly defines operand order.
- Array actions are integrated with existing array capabilities:
  - scalar smart tray can invoke array actions where context supports,
  - item/parent scope semantics are preserved via array context model,
  - existing `ArrayBuilder` remains the detailed array editor in this spec,
  - smart tray routes array target fields and array actions into `ArrayBuilder`-compatible state,
  - full tray-native replacement of deep array authoring is a follow-up spec unless implementation proves it is required.
- Existing saved rule hydration behavior:
  - supported expressions are decomposed into `SmartBuilderDraft`,
  - non-decomposable expressions open in Advanced mode with a complex-expression banner.

### Failure / Edge Behavior

- If action prerequisites are not met, action appears disabled with explicit reason.
- If guided expression generation fails to produce valid DSL (unexpected), engine diagnostics show inline and draft remains unsaved.
- Invalid raw-editor expressions can be shown during editing but are not considered valid guided output until they validate.
- If focused slot target is cleared/unmounted, click behavior falls back to append mode.
- If enrichment input alias/schema metadata is unavailable, enrichment actions are disabled with reason and fallback to other input types remains available.
- Enrichment generation rules are strict:
  - root enrichment alias emits `external("alias")`,
  - nested enrichment field emits `get(external("alias"), "field.path")`.
- If user removes inputs used by composition, resolver marks composition incomplete and builder prompts user to repair/replace removed references.

---

## Acceptance Examples

### AE-01 — Empty tray target-focused state

**Given**
- target field selected
- no tray inputs

**When**
- builder panel renders

**Then**
- builder shows target metadata, empty tray guidance, and "Other ways to fill this field" options

### AE-02 — First source click creates direct draft immediately

**Given**
- tray empty

**When**
- user clicks source field `firstName`

**Then**
- tray contains input 1 (`SRC firstName`)
- draft expression becomes `source("firstName")`
- row mapped state/output/unsaved count update immediately

### AE-03 — Second source click appends rather than replaces

**Given**
- tray contains `firstName` direct mapping

**When**
- user clicks source field `lastName`

**Then**
- tray contains both inputs in order
- builder enters compose-capable mode (not direct-only)

### AE-04 — Focused slot fill overrides append

**Given**
- condition operand slot is focused and empty

**When**
- user clicks source field `sourceA`

**Then**
- focused slot is filled with `sourceA`
- tray does not append a new input for that click

### AE-05 — Undo returns composed draft to prior direct expression

**Given**
- user moved from `source("firstName")` direct draft to multi-input compose state

**When**
- user clicks Undo

**Then**
- draft expression returns to `source("firstName")`
- tray/composition state restore to one-input direct form

### AE-06 — Per-input transform before condition compare

**Given**
- tray has inputs `emailA` and `emailB`

**When**
- user applies `lower()` transform to each input and configures equality condition with MATCH/NO_MATCH outputs

**Then**
- generated expression is equivalent to:
  `if(eq(lower(source("emailA")), lower(source("emailB"))), static("MATCH"), static("NO_MATCH"))`

### AE-07 — Composition-first then per-input transform edit

**Given**
- user created a condition composition first

**When**
- user edits operand input transforms inside condition editor

**Then**
- expression updates deterministically using transformed operands

### AE-08 — Enabled/disabled action list with reasons

**Given**
- tray contains two string inputs

**When**
- action list renders

**Then**
- compatible text/condition/null actions are enabled
- incompatible number/array actions are visible as disabled with concrete reasons

### AE-09 — DSL function coverage accounting

**Given**
- current DSL function registry and builder action catalog

**When**
- coverage check runs

**Then**
- each DSL function is classified as one of: user action, input type, advanced-only, intentionally unsupported-with-reason
- no guided action emits unregistered function names

### AE-10 — Enrichment input selection in guided builder

**Given**
- mapping has enrichment alias `carrier`

**When**
- user selects enrichment alias root value

**Then**
- tray shows enrichment-tagged input (e.g., `ENR1`)
- generated expression uses `external("carrier")`

**When**
- user selects nested enrichment field `rateCode`

**Then**
- generated expression uses `get(external("carrier"), "rateCode")`

### AE-11 — Null handling action behavior

**Given**
- tray has nullable inputs

**When**
- user chooses default/coalesce behavior

**Then**
- generated expression uses `default` or `coalesce` as configured
- required target context elevates null-handling actions

### AE-12 — Type conversion constraints

**Given**
- input type differs from target type

**When**
- user opens convert actions

**Then**
- builder offers only valid scalar cast targets (`string | number | boolean`)

### AE-13 — Array action integration contract visible

**Given**
- selected input is array-capable

**When**
- user opens array actions

**Then**
- array actions (`map/filter/find/array/merge/flatten/first/nth/join/count/get`) are represented and routed through supported scalar/array integration paths with valid scope semantics

### AE-14 — Engine validation is canonical

**Given**
- draft expression has mismatch or invalidity

**When**
- builder updates expression

**Then**
- diagnostics come from engine validate path
- builder does not maintain a separate correctness engine
- invalid raw-editor content is not accepted as valid guided-builder output

### AE-15 — Save boundary remains unchanged

**Given**
- user made smart-builder draft changes

**When**
- user has not clicked global Save

**Then**
- mapping config persistence does not change
- clicking global Save persists latest draft expression

### AE-16 — Existing expression hydration behavior

**Given**
- a target has a saved expression

**When**
- expression is decomposable by smart-builder decomposer

**Then**
- builder hydrates into `SmartBuilderDraft` state and opens in guided mode

**When**
- expression is not decomposable

**Then**
- builder opens in Advanced mode with complex-expression banner and does not falsely present guided state

---

## Decisions

- `D1.` Tray input reorder is deferred from Rev 1 UI. `SmartBuilderDraft` preserves deterministic insertion order, and expression generation uses that order unless a composition editor explicitly defines operand order. Rev 1 supports removing inputs; drag/drop reorder and move up/down controls are follow-up scope.

- `D2.` Source/Input panel does not currently emit slot-focus-aware events. FS-094 adds a source/input selection event contract. Source/Input panel emits field-selection metadata (not just path string), and SmartBuilder/MappingEditor determines whether selection fills focused slot or appends to tray.

---

## Verification Strategy

- Automated unit tests for state + generator + resolver:
  - tray add/append/focused-slot behavior (AE-02/03/04)
  - undo direct->compose->direct path (AE-05)
  - per-input transform generation paths (AE-06/07)
  - action availability + disabled reasons (AE-08)
  - DSL coverage accounting and unregistered-function guard (AE-09)
  - enrichment expression generation, including root-vs-nested behavior (AE-10)
  - null/convert action generation (AE-11/12)
  - array action availability + integration routing checks (AE-13)
  - `isTruthy`/`isFalsy` compile-path tests if enabled in guided UI
- UI integration tests:
  - builder panel empty/one-input/multi-input states (AE-01/02/03)
  - auto-draft updates reflected in row/preview/unsaved indicators (AE-02/15)
  - focused-slot fill UX with slot-scoped references (AE-04)
  - decomposable/non-decomposable existing expression hydration behavior (AE-16)
  - source/input event contract behavior: focused slot fill vs tray append decision path
- Engine validation integration tests:
  - diagnostics passthrough for invalid drafts and invalid raw expressions (AE-14)
- Standard quality gates:
  - `pnpm -C ui test` (targeted + full touched suites)
  - `pnpm -C ui lint`
  - `pnpm -C ui typecheck`

---

## Task Generation Notes

- Use separate tasks for:
  - smart builder state/model + expression generation,
  - action catalog/resolver + DSL coverage audit,
  - click/input-tray behavior + draft autosave/undo wiring,
  - source/input field-selection event contract and smart-builder integration wiring,
  - React builder UI components,
  - transform/composition editors,
  - array integration bridge,
  - test coverage,
  - architecture updates.
- Task routing:
  - `ui-task` for all React/UI and UI-local state library work.
  - `task` for architecture documentation update task.
- Include an explicit architecture update task for `forge/architecture/ui-application.md` and `forge/architecture/INDEX.md`.
- Array scope decision resolved in this revision: keep existing `ArrayBuilder` as detailed editor and bridge smart tray actions/state into `ArrayBuilder`-compatible state.
- Full tray-native replacement of deep array authoring is explicitly follow-up scope unless implementation proves replacement is required during execution.

---

## Change Log

- Rev 1 — 2026-06-14
  - Initial draft
- Rev 2 — 2026-06-14
  - Resolved array scope decision: existing `ArrayBuilder` remains detailed editor; smart tray bridges array actions/targets into compatible state.
  - Added existing-expression hydration behavior (decompose when supported; otherwise Advanced mode with complex-expression banner).
  - Clarified guided-vs-raw validity rule: guided output must be syntactically valid registered DSL; raw editor may be temporarily invalid.
  - Clarified focused-slot fill as slot-scoped input reference (non-appending unless promoted).
  - Resolved operator policy: removed unregistered pseudo-operators (including `startsWith`); `isTruthy`/`isFalsy` allowed only when compiling to valid registered DSL patterns with tests.
  - Tightened enrichment generation behavior for root alias vs nested field.
  - Updated relevant catalog reference path to `ui/src/lib/data/dsl-functions.ts`.
- Rev 3 — 2026-06-14
  - Resolved remaining planning decisions: deferred tray reorder from Rev 1 while preserving deterministic insertion-order expression generation.
  - Replaced Open Questions with explicit Decisions section.
  - Added explicit requirement for source/input field-selection event contract to support focused-slot-aware insertion routing.
  - Marked spec status as `ready`.
