# SPEC

## Title

Redesign Mapping Editor around target-first Mapping Grid and row details panels

---

## ID

FS-092  
Assigned sequentially. `FS` = Feature Spec.

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-11  
Last Updated: 2026-06-11  
Type: cross-cutting

If unknown during early drafting, use `TBD`.

`Type` indicates the primary execution domain. Used to route tasks to the correct agent (`task` or `ui-task`). Cross-cutting specs may produce tasks of mixed types — declare the type per task in that case.

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

Rev: 2

Rev bump required when any of the following materially change:

- intended behavior
- scope boundaries
- acceptance examples
- verification expectations
- materially affected system areas

See `Change Log` for revision history.

---

## Summary

This spec redesigns the KeyRa Mapping Editor into a focused mapping-authoring workspace centered on a target-field-first Mapping Grid and row details panels (Source + Builder). The editor removes embedded testing, deployment, and schema-structure editing from the primary route and hides raw DSL by default, while preserving the existing engine contract where mappings still compile to KeyRa DSL and execute in the TypeScript mapping engine. Success is a BA/CIS-friendly authoring flow that mirrors spreadsheet-style row mapping, reduces cognitive load, and shortens time to first successful mapping.

---

## Problem

The current Mapping Editor architecture is visually and functionally overloaded: mapping authoring is mixed with diagnostics-heavy views, preview/testing surfaces, and deployment-adjacent actions in one workspace. BA/CIS users typically work from row-based mapping sheets (target field, source reference, method, notes), but the current interaction model pulls users toward developer-first expression editing and panel complexity. This mismatch increases navigation friction and slows authoring for both scalar and array mappings.

---

## Goal

Deliver a mapping-authoring-only editor where users:
- review target fields in a row-based grid,
- select a row to configure mapping details in side-by-side panels,
- rely on business-friendly mapping controls and statuses,
- receive sample-driven output/validation feedback per field,
- and save mapping changes without coupling to deployment or full test-console workflows.

---

## Assumptions

- Existing mapping runtime remains authoritative: persisted mapping rules are still DSL expressions executed by `@keyra/engine`.
- Existing mapping CRUD/version APIs remain the persistence backbone; any new metadata is additive and backward-compatible.
- FS-087/FS-089/FS-090 schema metadata contracts (`ownership`, `readonly`, `dataFormat`, `sourceKind`, `status`, sample payload metadata) remain canonical.
- Existing Test Lab route is canonical for mapping testing: `/projects/:projectId/mappings/:mappingId/test-lab`.
- Existing deployment routes/pages remain available; Mapping Editor only links out.

---

## Current Context

Repository-grounded context loaded before drafting:

- `forge/architecture/ui-application.md` currently documents a three-column Mapping Editor with additional bottom-area tabs and prior auto-map workspace patterns; this spec materially changes editor IA and panel responsibilities.
- `forge/architecture/backend-api.md` documents mapping CRUD and schema sample endpoints (`POST /schemas/:id/samples`) that can support sample payload lifecycle, but Mapping Editor-specific sample-selection and filter-scoped auto-map contracts are not yet codified for this UX.
- `forge/architecture/persistence-model.md` documents schema sample payload metadata/blob storage and mapping revision/version model, but does not yet define Mapping Editor row-level UX metadata contracts.
- Related active specs with overlap/constraints: FS-088 (Create Mapping), FS-089 (Schema Library simplification), FS-090 (Schema Detail inferred review/sample lifecycle), FS-091 (backend retrieval architecture). This spec must align with shared schema/sample metadata semantics from FS-089/090.
- Next available FS number after scanning `forge/active/` and `forge/completed/` is FS-092.

---

## Scope

### In Scope

- Redesign Mapping Editor route UI and interaction model around:
  - Header + toolbar,
  - target-first Mapping Grid,
  - right-side Source and Builder panels.
- Hide raw DSL by default and expose it only behind Advanced Mode.
- Preserve field-level sample-driven output feedback in grid and detail panels.
- Add sample payload picker behavior in editor context (default load, switch, add sample).
- Support business-friendly value source and mapping method controls for scalar and array targets.
- Support filter/search model and filter-scoped auto-map initiation.
- Support AI suggestion lifecycle in-grid/in-panel (suggested/accepted/edited/dismissed) without silent commit.
- Add/align row-level validation + consolidated issues panel behavior.
- Move full Test & Preview workflow and deployment workflow out of Mapping Editor primary surface (link-out only).
- Generate required backend/adapter/domain updates needed to support the new editor behavior.

### Out of Scope

- Deployment page redesign or deployment orchestration changes.
- Full Test Lab feature redesign.
- Schema structural editing experience redesign.
- Replacing KeyRa DSL or mapping-engine execution model.
- Free-form spreadsheet cell editing in Mapping Grid.
- Auto-committing AI suggestions.

---

## Non-Goals

- Introduce deploy/promote/rollback actions in Mapping Editor.
- Embed full payload input/output diff console directly in Mapping Editor.
- Add top-of-panel “Suggested source fields” section in Source Panel for this iteration.
- Introduce new schema ownership or scope semantics beyond FS-089/090 contracts.
- Replace route architecture for Schema Library, Schema Detail, or Deployment pages.

---

## Relevant Areas

- `ui/src/features/mappings/components/MappingEditorPage.tsx`
- `ui/src/features/mappings/components/EditorTopBar.tsx`
- `ui/src/features/mappings/components/*` (new grid/details/panel components)
- `ui/src/features/mappings/hooks/use-mapping-editor.ts`
- `ui/src/features/mappings/hooks/*` (new selection/filter/sample/suggestion hooks)
- `ui/src/lib/types/domain.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/http-adapter.ts`
- `src/lambda/mapping/*` ?
- `src/lambda/ai/auto-map.ts` ?
- `src/lambda/schema/add-schema-sample.ts` (integration check)
- `src/lib/persistence/mappings.ts` ?
- `forge/architecture/ui-application.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/persistence-model.md`

---

## Dependencies / Blockers

- Alignment dependency: FS-089/FS-090 schema/sample metadata behavior should remain canonical for sample-picker + readiness handling.
- Potential backend dependency: filter-scoped auto-map request contract may require additive backend/API changes if current endpoint cannot accept visible target scope.

---

## Constraints

- Must preserve backward compatibility for persisted mapping configs and revision/version mechanics.
- Save remains the only primary persistence action in Mapping Editor; save must not deploy.
- Mapping Grid is row-select navigation + status surface, not independently editable cells.
- Raw DSL remains hidden by default.
- AI suggestions must be non-destructive and explicitly user-controlled.
- Large arrays must use progressive disclosure to avoid rendering overload.
- UI must continue to operate under existing adapter pattern (`ApiAdapter`) and strict TypeScript constraints.

---

## Proposed Behavior

### User Flow

1. User opens Mapping Editor and sees context header + filter toolbar + target-first grid.
2. Default source sample payload is loaded; grid shows muted output values per row when available.
3. User selects a target row; right details opens with Source Panel and Builder Panel.
4. User chooses value source and mapping method through guided controls.
5. Row status, source summary, mapping type, notes preview, and sample output update.
6. User iterates row-by-row; optional auto-map creates explicit AI suggestions for current filtered scope.
7. User accepts/edits/dismisses suggestions.
8. User saves mapping (version increments), then optionally navigates to Test Lab or Deployment via More menu.

### System Behavior

- Editor materializes a row model derived from target schema structure + current rules + validation + AI suggestion state.
- Row selection drives details-panel hydration; edits are staged through existing draft/unsaved model and persisted on Save.
- Sample payload selection resolves using this priority order:
  1. User’s last selected sample for this mapping.
  2. Mapping-level default selected sample.
  3. Source schema default sample.
  4. No sample selected.
- Selected sample context persistence model:
  - mapping-level default selected sample is persisted,
  - per-user last-selected override is persisted when user-preference storage is available.
- Sample payload selection updates evaluation context used for:
  - grid muted output,
  - Source Panel sample value,
  - Builder Panel output,
  - sample-dependent validation text.
- Value source types supported: source field, static value, constant, external source, leave unmapped.
- Scalar mapping methods supported through guided controls: direct, static, default/fallback, format date, format text, cast, value map, condition, intentionally unmapped.
- Array targets render as grouped rows with parent coverage summary; large arrays use explicit thresholds:
  - `<=25` child fields: inline expansion,
  - `26–75` child fields: filtered child workspace,
  - `>75` child fields: summary-first expansion with strong Array Builder CTA.
  Users may still choose “View all child fields”.
- Auto-map call includes explicit scope of visible/filtered target fields; response produces suggestion-state rows and never silently overwrites accepted mappings.
- Advanced Mode reveals generated DSL and diagnostic detail for selected row only.
- Advanced Mode preference is per-user global, defaults off, and persists across mappings/sessions for that user.

### Failure / Edge Behavior

- If sample payload is missing/unparseable, editor falls back to “no sample context” state while preserving mapping authoring.
- If sample-dependent evaluation fails for a row, row shows warning/error state with BA-friendly message in Builder validation section.
- If auto-map fails, existing mappings and suggestion state remain unchanged; show retryable error banner/toast.
- Intentionally unmapped required fields are allowed but produce warnings in-editor.
- Strict blocking behavior is controlled by mapping/project validation settings, not hardcoded editor behavior.
- For arrays beyond threshold, default to summary/filtered child subset instead of full child dump based on configured thresholds.
- Save failure preserves local unsaved drafts and surfaces retry path.

---

## Acceptance Examples

### AE-01 — Mapping-authoring-only workspace shell

**Given**
- user opens `/projects/:projectId/mappings/:mappingId`

**When**
- editor loads

**Then**
- header/toolbar/grid/details layout is present
- no inline deploy actions are shown
- no full test console is shown in-page

### AE-02 — Target-first row selection and details hydration

**Given**
- target rows are displayed in grid

**When**
- user clicks an unmapped row

**Then**
- selected row is highlighted
- Source Panel + Builder Panel open with that target context
- grid remains visible for rapid row switching

### AE-03 — Default sample payload drives field-level feedback

**Given**
- source schema has a default sample payload

**When**
- editor first loads

**Then**
- default sample is selected
- muted output values appear in grid rows where computable
- Source Panel and Builder output use the same sample context

### AE-04 — Sample picker switch updates outputs

**Given**
- multiple samples are available

**When**
- user changes selected sample

**Then**
- grid muted outputs, source sample value, builder output, and sample-dependent validation update consistently

### AE-05 — Add sample payload from picker

**Given**
- user opens sample picker

**When**
- user adds a valid JSON/XML sample payload

**Then**
- sample is persisted via canonical sample lifecycle
- new sample appears in picker
- user can select it immediately for row feedback

### AE-06 — Scalar mapping via guided controls

**Given**
- scalar target row selected

**When**
- user selects `InvoiceDate` source and sets mapping method `Format date` with input/output formats

**Then**
- builder shows transformed sample output
- row updates source summary + mapping type
- generated DSL is updated behind the scenes

### AE-07 — Value source types beyond source field

**Given**
- target row selected

**When**
- user chooses static value / constant / external source / leave unmapped

**Then**
- Source + Builder panels show contextual controls
- row source summary and status reflect the selected value source behavior

### AE-08 — Required marker and row status model

**Given**
- grid has required and optional targets

**When**
- rows render

**Then**
- required targets show red asterisk by target name
- status column supports unmapped/mapped/warning/error/AI/intentionally-unmapped states

### AE-09 — Filter/search and filter-scoped auto-map

**Given**
- user filters to Required + Unmapped and searches target rows

**When**
- user triggers Auto-map

**Then**
- request scope is limited to visible filtered rows
- UI makes scope explicit before execution
- suggestions only appear for in-scope rows

### AE-10 — AI suggestion review lifecycle

**Given**
- auto-map returns suggestions

**When**
- user reviews a suggestion

**Then**
- suggestion row is visually distinct
- user can Accept, Edit before accepting, or Dismiss
- accepted suggestion becomes normal mapped row
- existing accepted mappings are never silently overwritten

### AE-11 — Array parent grouping and child mapping coverage

**Given**
- target contains array fields

**When**
- array parent row renders

**Then**
- array row shows source list summary, method, sample item count, and child mapping coverage
- array child rows can be expanded/scoped for authoring

### AE-12 — Large-array progressive disclosure

**Given**
- array has large child-field count

**When**
- user expands parent row

**Then**
- UI shows summarized/filtered workspace by priority instead of dumping all children
- “View all child fields” and “Open Array Builder” actions are available

### AE-13 — Builder validation and View Issues consolidation

**Given**
- mapping has warnings/errors

**When**
- user opens Builder panel or clicks View Issues

**Then**
- Builder shows BA-friendly row validation messages
- Issues panel lists consolidated blocking/warning issues with open-row navigation
- raw JSON diagnostics are not default-visible

### AE-14 — Advanced Mode DSL visibility

**Given**
- row is selected in Builder Panel

**When**
- Advanced Mode is off

**Then**
- raw DSL is hidden

**When**
- Advanced Mode is turned on

**Then**
- generated DSL + detailed diagnostics are shown for the selected row

### AE-15 — Save behavior and separation of concerns

**Given**
- user has unsaved row edits

**When**
- user clicks Save Mapping

**Then**
- mapping persists and version increments
- editor save state updates (saving/saved/failed)
- no deployment action is triggered

---

## Open Questions

- none

---

## Verification Strategy

- **UI component/integration coverage (automated):** AE-01, AE-02, AE-03, AE-04, AE-06, AE-08, AE-09, AE-10, AE-11, AE-12, AE-14, AE-15.
- **Adapter/API contract tests (automated):** AE-05, AE-09, AE-10, AE-13, AE-15.
- **Manual UX verification:**
  - Row-by-row authoring speed/clarity pass across scalar + array mappings (AE-02, AE-06, AE-11).
  - Sample switching consistency pass (AE-04).
  - More menu route-outs and absence of in-page deploy/test console actions (AE-01, AE-15).
- **Quality gates:** touched workspace tests pass, `pnpm lint`, `pnpm typecheck` (or repository canonical equivalents) pass for changed surfaces.

---

## Task Generation Notes

- This spec is **cross-cutting** and must be split by domain:
  - `ui-task` for Mapping Editor UI architecture/components/hooks and UX behaviors.
  - `task` for backend/API/adapter contract additions and architecture documentation updates.
- Do not merge backend/API contract work into UI tasks.
- Include an explicit architecture update task (`Agent: task`) because this spec materially changes existing UI/API/persistence architecture documentation.
- Sequence should isolate contracts first (domain/API), then UI shell/grid/details, then suggestion/array/validation polish, then verification and architecture update.

---

## Change Log

- Rev 1 — 2026-06-11
  - Initial draft from provided requirements and repository/architecture context.

- Rev 2 — 2026-06-11
  - Resolved Q1: More menu uses label `Open Test Lab` and canonical route `/projects/:projectId/mappings/:mappingId/test-lab`.
  - Resolved Q2: sample context resolution priority finalized (user override -> mapping default -> schema default -> none) with mapping-level default persistence and per-user override when available.
  - Resolved Q3: intentionally unmapped required fields are allowed with warning; strict blocking delegated to mapping/project validation settings.
  - Resolved Q4: large-array thresholds finalized (`<=25`, `26–75`, `>75`) with optional “View all child fields”.
  - Resolved Q5: Advanced Mode preference finalized as per-user global, default off, persisted across mappings/sessions.
