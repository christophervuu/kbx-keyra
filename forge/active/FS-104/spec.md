# SPEC

## Title

Array Builder: Build target arrays from source object fields

---

## ID

FS-104

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-07-01  
Last Updated: 2026-07-02  
Type: cross-cutting

---

## Status

refining

---

## Revision

Rev: 2

---

## Summary

Add a new guided Array Builder collection mode, **Build from object fields**, for mappings where repeating concepts are represented as named child properties of a source object (for example, `DeliveryWeeklyOperation.Sunday` ... `Saturday`) rather than as a source array.

The mode lets users select schema-defined child properties, define deterministic output order, and configure one reusable item recipe applied to each retained property. Scalar field authoring inside the item recipe uses a shared Smart Builder-backed recipe editor contract (not a mode-specific duplicate implementation).

The generated DSL remains on existing engine functions and compiles to canonical deterministic forms without introducing new DSL functions, runtime laziness semantics, backend persistence changes, or cloud-specific behavior.

---

## Problem

Current Array Builder guided modes (`map`, `filterMap`, `splitString`, `buildFromValues`, `mergeArrayBranches`) do not provide a guided way to generate array items from selected fields of a source object. Users must either handwrite DSL or duplicate per-day/per-field mappings, which is error-prone and does not round-trip reliably through guided reopen.

This gap is common in operational schedules and similar payloads where weekdays or category variants are modeled as named object children.

---

## Goal

Enable a user to build target array items from selected schema-defined child properties of a source object, with:

- deterministic configured ordering,
- default inclusion semantics (include existing non-null child objects; skip absent/null),
- optional user inclusion predicate,
- a single reusable item recipe,
- Smart Builder scalar authoring per item field,
- deterministic canonical DSL generation,
- guided reopen/decompose support for exactly KeyRa’s generated canonical patterns,
- compatibility with existing modes and existing advanced expressions.

---

## Assumptions

- Existing Array Builder architecture in `ui/src/features/mappings/lib/array-builder-state.ts` is the canonical state model baseline.
- Existing array generator/decomposer (`array-expression-generator.ts`, `array-decomposer.ts`) remain canonical extension points.
- Smart Builder scalar recipe flow (FS-098 model) is the canonical scalar authoring UX and should be reused, not duplicated.
- Existing engine function set (`array`, `map`, `filter`, `get`, `source`, `item`, `external`, `not`, `isNull`) is sufficient.
- Canonical DSL expression is the persisted semantic source of truth for guided reopen in this feature.

---

## Current Context

Repository inspection confirms:

- Array Builder mode/state model:
  - `ui/src/features/mappings/lib/array-builder-state.ts`
  - `ui/src/features/mappings/hooks/use-array-builder-state.ts`
  - `ui/src/features/mappings/components/ArrayModeSelector.tsx`
  - `ui/src/features/mappings/components/ArrayBuilder.tsx`
- Array DSL generation/decomposition:
  - `ui/src/features/mappings/lib/array-expression-generator.ts`
  - `ui/src/features/mappings/lib/array-decomposer.ts`
- `buildFromValues` exists and is a structural reference:
  - `ui/src/features/mappings/components/BuildFromValuesEditor.tsx`
- Item field authoring currently uses `ItemTemplateEditor` + `ItemFieldRow`; this must be reconciled to a shared Smart Builder-backed recipe contract for reusable item-template modes.
- Advanced-editor fallback exists through `customExpression` and decomposer failure paths.
- Engine behavior for relevant functions exists in:
  - `src/engine/functions/arrays.ts`
  - `src/engine/functions/source-access.ts`
  - `tests/engine/functions/arrays*.test.ts`
- In-progress specs scanned (`forge/active/FS-101`, `FS-102`, `FS-103`, `FS-019`) do not conflict with this scope.

FS number scan across `forge/active/` and `forge/completed/` shows next available: **FS-104**.

---

## Scope

### In Scope

- New guided Array Builder mode: `objectFields`.
- Selecting one schema-defined parent object reference from:
  - primary source, or
  - configured enrichment input (must have resolvable schema and available authoring schema tree).
- Listing/selecting/removing/reordering schema-defined direct child properties.
- Default inclusion behavior: include when selected child resolves to non-null object; skip absent/null child.
- Optional user-defined inclusion predicate.
- One reusable item recipe applied for all retained properties.
- Shared Smart Builder-backed array item recipe editor contract for reusable item-template modes:
  - `map`
  - `filterMap`
  - `objectFields`
  - each `mergeArrayBranches` branch
- Canonical deterministic DSL generation for this mode, including sequential mandatory + optional filtering.
- Decomposer recognition for canonical generated forms (with/without optional second filter).
- Guided reopen round-trip preservation for canonical generated expressions.
- Validation and preview summary behavior specific to this mode.
- UI diagnostic grouping presentation (no engine/runtime dedupe changes).
- Unit/integration/UI/parity tests covering required scenarios, including enrichment-backed parent objects.
- Architecture document updates reflecting actual guided mode set and `objectFields` addition.

### Out of Scope

- Iterating arbitrary runtime object keys.
- Runtime-discovered property lists or wildcard object traversal.
- New DSL functions (`keys`, `entries`, `hasPath`) or lazy evaluation changes.
- Distinguishing absent vs explicit null in this phase.
- Global engine/runtime diagnostic deduplication behavior changes.
- Structural migration of `splitString` or `buildFromValues` into the shared recipe editor in this revision.
- Primitive target-array authoring flow unless existing reusable primitive-item recipe contract is verified and adopted without adding a separate flow.
- Backend route/storage/deployment/infra changes for this feature.
- Broad semantic decomposition of arbitrary handwritten equivalent expressions.

---

## Non-Goals

- Redesigning Mapping Editor route/layout architecture.
- Replacing Advanced Editor as fallback for non-decomposable expressions.
- Introducing a second semantic persistence channel for guided object-fields state.

---

## Relevant Areas

- UI mode/state/generator/decomposer
  - `ui/src/features/mappings/lib/array-builder-state.ts`
  - `ui/src/features/mappings/hooks/use-array-builder-state.ts`
  - `ui/src/features/mappings/lib/array-expression-generator.ts`
  - `ui/src/features/mappings/lib/array-decomposer.ts`
  - `ui/src/features/mappings/lib/array-validation.ts`
- UI components
  - `ui/src/features/mappings/components/ArrayModeSelector.tsx`
  - `ui/src/features/mappings/components/ArrayBuilder.tsx`
  - `ui/src/features/mappings/components/ItemTemplateEditor.tsx`
  - `ui/src/features/mappings/components/ItemFieldRow.tsx`
  - `ui/src/features/mappings/components/BuilderFeedbackArea.tsx`
  - `ui/src/features/mappings/components/ArrayResultPreview.tsx`
  - `ui/src/features/mappings/components/BuildFromValuesEditor.tsx` (reference)
- UI tests
  - `ui/src/features/mappings/components/*.test.tsx`
  - `ui/src/features/mappings/lib/array-expression-generator.test.ts`
  - `ui/src/features/mappings/lib/array-decomposer.test.ts`
  - `ui/src/features/mappings/lib/array-builder-state.test.ts`
- Engine/parity tests
  - `tests/engine/functions/arrays.test.ts`
  - `tests/engine/functions/arrays-integration.test.ts`
  - `tests/lambda/runtime/runtime-handlers.test.ts`
- Architecture docs
  - `forge/architecture/ui-application.md`
  - `forge/architecture/mapping-engine.md`
  - `forge/architecture/INDEX.md`

---

## Dependencies / Blockers

- Depends on existing FS-098 Smart Builder scalar authoring contracts remaining canonical.
- Depends on existing array builder/generator/decomposer test infrastructure.

No external blockers identified.

---

## Constraints

- Must preserve existing guided array modes and existing saved mappings.
- Must generate deterministic DSL for equivalent builder state.
- Must not introduce new DSL functions for this phase.
- Must preserve browser preview and Lambda runtime parity.
- Must keep non-decomposable/modified expressions safely in Advanced Editor with no destructive rewrite.
- Must avoid introducing backend/infrastructure dependencies for this browser-authoring feature.
- `config.editorPreferences` remains non-semantic UI-preferences only for this feature scope.
- **Saved guided state must never compete with or override the saved DSL expression.**

---

## Proposed Behavior

### User Flow

1. User selects **Build from object fields** in Array Builder.
2. User selects a parent object reference from primary source or eligible enrichment input.
3. UI shows schema-defined direct children for that selected object path.
4. User selects and orders child properties deterministically.
5. Default inclusion rule is active (skip missing/null children).
6. User optionally configures additional inclusion predicate.
7. User configures one reusable item recipe with scoped inputs (property name/value, current/parent item where applicable, source, enrichment, fixed values, raw fallback).
8. Preview shows summarized counts and order.
9. Save persists canonical DSL expression; guided reopen reconstructs from decomposition only.

### System Behavior

#### Collection Model

Add `objectFields` to `ArrayBuilderMode` with:

```ts
interface ObjectFieldsParentReference {
  readonly input:
    | { readonly kind: 'primary' }
    | { readonly kind: 'enrichment'; readonly alias: string };
  readonly objectPath: string;
}
```

```ts
interface ObjectFieldsCollectionState {
  readonly mode: 'objectFields';
  readonly parent: ObjectFieldsParentReference;
  readonly orderedChildKeys: readonly string[];
  readonly missingBehavior: 'skip-null-or-absent';
  readonly inclusionPredicate?: FilterPredicateState;
}
```

`FilterPredicateState` remains the only inclusion-predicate type (structured + raw variants already supported).

#### Parent Input Scope and Canonical Parent Expression

Guided picker supports parent object paths from:

- primary source schema (`source("path.to.object")`), and
- enrichment alias with schema (`external("alias")` or `get(external("alias"), "path.to.object")`).

Legacy enrichment aliases without available schema are excluded from guided picker and remain Advanced Editor-only.

Child resolution always uses:

```text
get(<parent-expression>, item(""))
```

#### Canonical Item Context

For each configured child key:

- `day` = property name
- `value` = property value object

Item-template mappings can reference:

- `item("day")`
- `item("value")`
- source/enrichment/fixed/raw contexts through shared recipe editor contract.

#### Optional Inclusion Predicate and Sequential Filters

Mandatory existence filter must execute before optional user predicate.

Canonical generation with optional predicate:

```text
map(
  filter(
    filter(
      map(array(...), candidateTemplate),
      not(isNull(item("value")))
    ),
    <user-inclusion-predicate>
  ),
  itemTemplate
)
```

Canonical generation without optional predicate omits the second filter.

Do not merge mandatory and optional predicates into one condition.

#### Shared Smart Builder Item-Recipe Contract

FS-104 introduces a shared Smart Builder-backed array recipe editor for reusable item-template modes (`map`, `filterMap`, `objectFields`, merge branches).

Contract requirements:

- Adapter/state bridge between FS-098 Smart Builder recipe model and `ItemTemplateState`.
- No second full semantic draft persistence channel.
- No second complete `SmartBuilderDraft` persisted alongside equivalent field expression.
- Generation/hydration must preserve transforms, defaults, conditions, value mappings, and advanced fallback semantics in item fields.
- Existing item-template expressions for current modes must reopen and regenerate with unchanged semantics.

#### Target Item Shape

Rev 1 supports **object-shaped** target array items.

Primitive target arrays are out of scope unless an existing reusable primitive-item recipe contract is confirmed and adopted without a separate authoring flow.

#### Decomposer / Guided Reopen

Decomposer recognizes exact canonical objectFields forms:

1. mandatory existence-filter-only form, and
2. mandatory + optional second-filter form.

It restores parent reference, key order, inclusion predicate, and item recipe state.

Unrecognized expressions remain Advanced Editor with existing warning and no rewrite.

#### Persistence

- Canonical DSL expression is the only persisted semantic source of truth for this feature.
- No semantic objectFields guided state persistence under `config.editorPreferences` in Rev 1.
- `config.editorPreferences` remains non-semantic UI preference only.

#### Diagnostic Summarization (UI presentation)

- No global engine/runtime diagnostic deduplication change in FS-104.
- Preserve raw diagnostics.
- Add shared UI grouping for display consistency (browser/server preview) using stable keys:
  - diagnostic code
  - rule index
  - target path
  - message
  - function + argument location
- Grouped display includes occurrence count.
- For missing object-fields parent, show one summarized warning with parent reference and skipped configured-property count.
- If mandatory existence filter removes all candidates due to missing parent, suppress redundant generic empty-filter warning only in summarized object-fields preview display (retain in raw diagnostics).
- Do not suppress warnings from user-authored inclusion predicates.

#### Preview Summary

For `objectFields`, preview reports:

- configured properties,
- missing/null properties,
- present properties,
- excluded by optional condition,
- generated items,
- output order.

`IsOpen: false` is included unless excluded by user predicate.

#### Validation

Add mode-specific validation for:

- missing parent reference/object path,
- no selected child keys,
- duplicate selected keys,
- invalid/removed schema child keys (preserve unresolved key for repair),
- ineligible enrichment alias (no authoring schema),
- empty/invalid item recipe fields,
- required target field null-risk warnings,
- schema drift after configuration,
- unrecognized expression blocking guided reopen.

### Failure / Edge Behavior

- Missing parent object: output `[]`; non-fatal execution.
- Missing/null selected child: item skipped.
- Existing child with missing inner fields: item kept; unresolved mapped fields follow current object-template semantics.
- Required target enforcement remains existing validation behavior; no implicit item drop.
- Non-canonical edits disable guided reopen and remain in Advanced Editor.

---

## Acceptance Examples

### AE-01 — Weekly object fields produce deterministic seven-item output

**Given**
- Parent reference resolves to weekly object with Sunday–Saturday children.
- Ordered keys are Sunday→Saturday.

**When**
- Mapping executes in browser preview and Lambda runtime.

**Then**
- Output has seven items in configured order.
- `IsOpen: false` days are included unless user predicate excludes them.

### AE-02 — Missing parent object returns empty array without execution failure

**Given**
- Parent reference resolves missing/null.

**When**
- Expression executes.

**Then**
- Result is `[]`.
- Raw diagnostics remain available; UI summary shows one grouped parent-missing warning with skipped count.

### AE-03 — Missing selected child key is skipped

**Given**
- `Wednesday` selected but absent/null.

**When**
- Expression executes.

**Then**
- No placeholder item for Wednesday.
- Preview counts reflect missing/null and generated totals correctly.

### AE-04 — Existing child object with missing fields keeps item

**Given**
- Existing child object has `IsOpen` only.

**When**
- Item recipe maps additional fields.

**Then**
- Item is retained and unresolved fields are null per current object-template semantics.

### AE-05 — One reusable recipe maps property name and property value

**Given**
- Mode `objectFields` with selected ordered keys.

**When**
- User maps day name and value-object child fields once.

**Then**
- One recipe is reused for all retained keys.

### AE-06 — Deterministic canonical DSL generation with sequential filters

**Given**
- Equivalent builder state and optional predicate.

**When**
- Generator runs.

**Then**
- Output DSL is deterministic.
- Mandatory existence filter precedes optional user predicate in separate filter steps.

### AE-07 — Canonical expressions decompose and reopen losslessly

**Given**
- Mapping saved from guided objectFields mode.

**When**
- Reopened in builder.

**Then**
- Parent reference, key order, predicate, and item recipe restore losslessly.

### AE-08 — Non-canonical edits remain in Advanced Editor safely

**Given**
- User structurally modifies expression outside canonical forms.

**When**
- Builder attempts reopen.

**Then**
- Advanced Editor fallback occurs with warning and no rewrite.

### AE-09 — Existing guided modes remain compatible

**Given**
- Existing mappings using current guided modes.

**When**
- App loads/reopens mappings.

**Then**
- Existing modes continue unchanged.

### AE-10 — Browser preview and Lambda runtime parity

**Given**
- Canonical objectFields expressions (primary and enrichment parent references).

**When**
- Executed in browser engine and Lambda harness.

**Then**
- Outputs are identical.

---

## Open Questions

- none

---

## Verification Strategy

- **Generator tests** (AE-01/02/03/04/05/06):
  - one and seven keys,
  - ordering,
  - missing/null handling,
  - `IsOpen:false` inclusion,
  - optional second-filter predicate,
  - primary + enrichment parent-expression variants.
- **Decomposer tests** (AE-07/08):
  - canonical form without optional predicate,
  - canonical form with optional second filter,
  - enrichment parent-reference restoration,
  - strict fallback for non-canonical edits.
- **Shared recipe integration tests** (AE-05/09):
  - adapter contract map/hydrate between Smart Builder recipe state and `ItemTemplateState`,
  - transform/default/condition/value-map round-trip,
  - existing item-template expression compatibility unchanged.
- **UI tests** (AE-01/03/05/08):
  - picker eligibility for primary/enrichment parents,
  - child select/reorder,
  - summary counts,
  - grouped diagnostics display with occurrence counts,
  - advanced fallback behavior.
- **Parity tests** (AE-10):
  - browser vs Lambda outputs for primary + enrichment-backed parents.

---

## Task Generation Notes

- This spec remains cross-cutting (`ui-task` + `task`) when execution tasks are generated.
- Do **not** generate or refresh execution tasks from Rev 2 until implementation plan explicitly preserves:
  1. shared Smart Builder recipe-state adapter contract, and
  2. sequential-filter canonical generation/decomposition forms.
- Existing Rev 1 tasks should be treated as stale pending Rev 2 task regeneration.

---

## Change Log

- Rev 1 — 2026-07-01
  - Initial draft.
- Rev 2 — 2026-07-02
  - Resolved persistence decision: canonical DSL is sole semantic source of truth; no semantic `objectFields` metadata persistence under `config.editorPreferences`.
  - Replaced parent path with discriminated parent reference (primary/enrichment alias + objectPath).
  - Defined canonical parent-expression variants (`source`, `external`, `get(external, path)`) and child resolution contract.
  - Defined required sequential filters for mandatory existence and optional inclusion predicate.
  - Clarified shared Smart Builder-backed recipe editor contract and no duplicate semantic draft persistence.
  - Corrected inclusion predicate type to `inclusionPredicate?: FilterPredicateState`.
  - Clarified object-shaped target item scope and primitive-array out-of-scope stance.
  - Added diagnostic summarization policy as UI presentation grouping only (no global engine dedupe).
  - Removed resolved open questions and set status to `refining` pending Rev 2 task regeneration.