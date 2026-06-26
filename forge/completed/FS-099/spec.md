# SPEC

## Title

Inline Output View in Target Mapping Fields panel

---

## ID

FS-099

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-24  
Last Updated: 2026-06-24  
Type: cross-cutting

---

## Status

refining

---

## Revision

Rev: 3

---

## Summary

Add an alternate **Output** view to the Mapping Editor’s **Target Mapping Fields** panel via a segmented switch (`Fields | Output`) so users can inspect generated target payloads and jump directly to Builder from generated nodes. Rev 3 makes scope definitive: **FS-099 delivers JSON inline output only** because no canonical XML serializer/adapter contract is currently present in the repository. The design remains format-extensible through a discriminated output contract and shared orchestration wrapper.

---

## Problem

The Mapping Editor currently requires users to leave authoring flow and go to Test Lab to inspect output, then manually find the responsible target rule. This slows inspect-and-correct loops and time to first successful mapping. Also, container rows in Fields can show contradictory method/coverage messaging.

---

## Goal

Enable in-editor output inspection and direct output-node-to-Builder navigation with deterministic execution lifecycle, stale isolation, and performant rendering—without changing Test Lab responsibilities.

---

## Assumptions

- Mapping Editor route (`ui/src/routes/pages/MappingEditor.tsx`) remains the integration owner.
- Engine execution result remains neutral structured value + diagnostics (`executeMapping` / `ExecutionResult`), not serialized XML.
- Target output format authority comes from target schema metadata (`SchemaDetail.metadata.dataFormat`: `json | xml`), not user display preference.
- Existing repository currently has no canonical shared object→XML serialization module compatible with production mapping execution output.
- `OutputDisplay` should be retained as shared orchestration wrapper, with format-specific viewers under it.

---

## Current Context

Repository findings for Rev 3:

- Loaded architecture context: `forge/architecture/INDEX.md`, `ui-application.md`, `project-structure.md`, `mapping-engine.md`, `backend-api.md`.
- In-progress related specs: FS-092/FS-095/FS-097/FS-098.
- Target panel currently renders `TargetWorklist` only (`MappingEditorPage.tsx`).
- Canonical sample selection already exists in MappingEditor (`selectedSampleId`, `resolveInitialSelectedSampleId`, shared selector slot).
- Current inline sample preview is synchronous in route-level memo and lacks explicit stale/context lifecycle.
- Shared execution lifecycle hook exists (`ui/src/features/mappings/hooks/use-preview-execution.ts`) with debounce but no monotonic stale-write protection.
- Existing output component exists (`ui/src/features/mappings/components/preview/OutputDisplay.tsx`) for JSON interactions.
- Test Lab navigation from MappingEditor currently uses plain route navigation only (`navigate(testLabPath)`), with no explicit working-state handoff contract for unsaved mapping/sample/enrichment/output-format context.
- XML serializer inspection result: no canonical shared serializer/format-adapter path identified for this feature to depend on.

FS number scan:
- Active highest: FS-098
- Completed highest: FS-084
- Next available used by this spec: FS-099

---

## Scope

### In Scope

- Add segmented switch in Target Mapping Fields header: `Fields | Output`.
- Fields remains default and keeps existing behavior.
- Add Output view for JSON-format mappings using current working editor state and canonical sample/input-set.
- Reuse/extract shared preview execution lifecycle.
- Execute while Output is active with debounce and monotonic stale-result protection.
- Mark Output dirty while Fields is active (no hidden execution); execute immediately on Output reopen.
- Define preview-context identity for stale retention/isolation.
- Render JSON output with hierarchy, collapse/expand, search, highlight, copy, and output-node interactions.
- Output-node to Builder resolution with deterministic fallback order, including unconfigured target-field fallback.
- Define and implement output state transitions (current/partial/stale/failure).
- Define large-output configurable thresholds and fallback behavior.
- Correct container coverage labels independent from validation status.
- Add accessibility requirements and automated coverage.

### Out of Scope

- XML inline output rendering in FS-099.
- Ad hoc object-to-XML conversion in UI.
- Test Lab working-state transfer redesign.
- Deployment/save flow redesign.
- Expected-output comparison and full diagnostics/trace UX in Output view.

---

## Non-Goals

- Replace Test Lab.
- Introduce separate sample-selection states synchronized by effects.
- Couple Output view execution to backend/deployed snapshots.

---

## Relevant Areas

- `ui/src/routes/pages/MappingEditor.tsx`
- `ui/src/features/mappings/components/MappingEditorPage.tsx`
- `ui/src/features/mappings/components/TargetWorklist.tsx`
- `ui/src/features/mappings/components/TargetFieldRow.tsx`
- `ui/src/features/mappings/components/EditorTopBar.tsx`
- `ui/src/features/mappings/components/preview/OutputDisplay.tsx`
- `ui/src/features/mappings/components/preview/OutputDisplay.test.tsx`
- `ui/src/features/mappings/hooks/use-preview-execution.ts`
- `ui/src/features/mappings/context/preview-context.tsx`
- `ui/src/features/mappings/hooks/use-target-status.ts`
- `ui/src/lib/engine/index.ts`
- `ui/src/lib/types/domain.ts`
- `ui/src/features/mappings/**/*.test.tsx`
- `ui/src/routes/pages/MappingEditor.test.tsx`
- `forge/architecture/ui-application.md` (update required)

---

## Dependencies / Blockers

- Depends on FS-092/FS-098 Mapping Editor contracts.
- No canonical XML serializer found; therefore XML rendering is excluded from FS-099 and moved to follow-up spec scope.

---

## Constraints

- Use working in-memory mapping state (drafts/unsaved accepted edits), not last persisted snapshot.
- No backend requirement for Output preview.
- Stale protection must prevent out-of-order completions from replacing newer results.
- Hidden executions while Fields view is active are not allowed.
- Copy must use full serialized payload, not only visible subtree.

---

## Proposed Behavior

### User Flow

1. User opens Mapping Editor (Fields default).
2. User switches to Output.
3. Output executes latest working mapping for active preview context.
4. User searches/navigates generated output.
5. User activates a generated node (pointer or keyboard) to open Builder for corresponding rule/field.
6. User edits rule; Output refreshes while Output remains active.

### System Behavior

#### 1) Panel and execution lifecycle
- Panel view state: `activePanelView: 'fields' | 'output'` (default `fields`).
- While `output` is active:
  - output-affecting changes trigger debounced execution.
- While `fields` is active:
  - output-affecting changes set `outputDirty=true` only.
  - no preview execution runs.
- On re-entering Output with dirty state:
  - execute immediately once with latest state.
- Cancel pending debounce when Output closes/unmounts.
- In-flight completion guarded by monotonic `runId` sequencing.

#### 2) Preview context identity and stale isolation
Define preview context:
- `sampleOrInputSetId`
- `targetOutputFormat`
- `enrichmentInputIdentity` (stable identity/hash over effective enrichment payload set)

Retention rules:
- Last-valid output may be shown as stale only when failure occurs in same preview context.
- If context changes (sample/input-set/format/enrichment identity), prior output must not appear as current for new context.
- On context change failure before success, show actionable failure (or explicitly labeled previous-context artifact, never unlabeled current).

#### 3) Renderable output contract (discriminated)
FS-099 runtime contract (JSON scope):

```ts
type RenderableOutput = {
  format: 'json';
  value: JsonValue;
  serializedText: string;
  pathIndex: OutputPathIndex;
  nodeCount: number;
  serializedSizeBytes: number;
};

interface OutputPathEntry {
  runtimePath: string;
  targetSchemaPath?: string;
  owningRuleTargetPath?: string;
  nodeKind: 'property' | 'array-item' | 'element' | 'attribute' | 'text';
}
```

Notes:
- `OutputDisplay` is shared orchestration wrapper.
- `JsonOutputView` is the format-specific renderer in FS-099.
- Contract remains format-extensible for future XML branch; FS-099 does not implement XML branch.

#### 4) Output node activation -> Builder resolution order
Use deterministic resolution order:
1. Use explicit `pathIndex` metadata when it identifies owning rule.
2. Normalize runtime path (including array index normalization) and find exact rule target.
3. Find longest matching composite/ancestor owning rule target.
4. If no rule exists but normalized path exists in target schema, select that target field and open Builder in unconfigured state.
5. Show `No editable target found` only when node cannot be associated with target schema field or mapping rule.

#### 5) Output transition table

| Execution outcome | Required behavior |
| --- | --- |
| New output with no diagnostics | Show new output as current |
| New output with warnings | Show new output as current with warning summary |
| New partial output with non-blocking errors | Show new partial output as current with diagnostics |
| Validation prevents execution | Keep prior output only for same preview context and mark outdated |
| Engine throws before returning output | Keep prior output only for same preview context and mark outdated |
| Failure with no prior result | Show actionable failure state |

Additional rule:
- If a newer execution produced usable partial output, do not retain older successful output as current.

#### 6) Search and view state
- Fields and Output keep independent search text.
- Output search scopes to generated names + mapped target paths (not free scalar value search in FS-099).
- Matches in collapsed branches auto-expand ancestors.
- No-match message is explicit.

#### 7) Container coverage labels vs validation
Coverage labels use descendant mapping coverage only:
- `Fully mapped`: mapped descendants == total mappable descendants.
- `Partially mapped`: mapped > 0 and < total.
- `No child mappings`: mapped == 0.
- Zero mappable descendants: neutral/no-coverage label (defined consistently in implementation).

Validation warnings/errors remain separate status indicators and can coexist with `Fully mapped`.
Reuse existing canonical descendant coverage calculation (`use-target-status`) rather than adding a separate counter.

#### 8) Large-output behavior (configurable defaults)
- Thresholds are configurable constants (initial defaults only, benchmark-validated):
  - `INLINE_OUTPUT_NODE_LIMIT_SOFT` (default 5,000)
  - `INLINE_OUTPUT_SIZE_BYTES_SOFT` (default 512 KiB)
  - `INLINE_OUTPUT_NODE_LIMIT_HARD` (default 20,000)
  - `INLINE_OUTPUT_SIZE_BYTES_HARD` (default 2 MiB)
- Measurement should derive from formatter/path-index traversal (avoid unnecessary second full traversal).
- Modes:
  - normal interactive mode
  - limited mode (reduced tree rendering to avoid blocking)
  - extreme fallback (no full tree render)
- Copy/download always uses complete `serializedText`, not visible subset.

#### 9) Output format authority
- Mapping target contract is authoritative:
  - JSON target schema -> JSON inline renderer.
  - XSD/XML target -> XML inline renderer only in future follow-up spec after canonical serializer exists.
- User display preferences cannot override payload format.

#### 10) Test Lab handoff behavior
- No existing explicit working-state handoff contract found for unsaved mapping + sample + enrichment + format.
- FS-099 large-output fallback must not imply exact Test Lab reproduction.
- For FS-099:
  - provide `Copy output` and (where supported) `Download output`.
  - optional separate `Go to Test Lab` link with explicit wording that Test Lab may load saved/default context.

#### 11) Summary/copy semantics
- Copy JSON = full canonical pretty JSON from `serializedText`.
- No ambiguous `X fields` summary unless canonical counting definition is introduced.
- Preferred summary: `Generated output · N warnings` (and/or errors where applicable).

### Failure / Edge Behavior

- Missing sample: actionable add/select state.
- Deleted sample: fallback selection and info message.
- Missing required enrichment for current sample/context: explicit error; previous-context result cannot appear current.
- No rules and empty valid output are success states.

---

## Accessibility Requirements

- Segmented control keyboard operable; selected-state semantics exposed (ARIA).
- Output nodes keyboard focusable/activatable with equivalent behavior to pointer.
- Builder opens via keyboard activation with same resolution order.
- Predictable focus movement when Builder opens.
- Loading/stale/error/no-results/copy confirmation announced accessibly.
- Visible focus indicators for all interactive controls.

---

## Acceptance Examples

### AE-01 — Segmented switch in target panel
**Given** Mapping Editor is loaded  
**When** user views Target Mapping Fields header  
**Then** panel shows `Fields | Output` and defaults to `Fields`.

### AE-02 — View switch preserves editor context
**Given** selected target + selected sample exist  
**When** user toggles `Fields -> Output -> Fields`  
**Then** selection/sample remain unchanged and no save/deploy side effects occur.

### AE-03 — Opening Output executes working mapping
**Given** unsaved accepted edits exist  
**When** user opens Output  
**Then** output reflects current working state, not last saved/deployed snapshot.

### AE-04 — Canonical sample selection shared
**Given** sample changes from header selector  
**When** Output is open  
**Then** all sample-dependent surfaces update from same canonical selection.

### AE-05 — Output selector updates canonical state
**Given** user changes sample from Output selector  
**When** selection commits  
**Then** header/source/builder/output reflect same sample.

### AE-06 — Auto-refresh on edits while Output active
**Given** Output view is active  
**When** valid rule/output-affecting config changes  
**Then** debounced execution runs automatically.

### AE-07 — Stale-result protection
**Given** two runs finish out-of-order  
**When** older run completes last  
**Then** newer run result remains displayed.

### AE-08 — Same-context stale retention
**Given** prior success exists in same preview context  
**When** a new attempt fails before producing output  
**Then** prior output is retained as outdated with explicit label.

### AE-09 — JSON render behavior
**Given** target format is JSON and run succeeds  
**When** Output renders  
**Then** payload is formatted, navigable JSON with copy action.

### AE-11 — Independent search state per view
**Given** Fields has a search query  
**When** user switches to Output  
**Then** Output query is independent and Fields query remains preserved.

### AE-12 — Output search expansion/highlight
**Given** match is in collapsed branch  
**When** user searches  
**Then** ancestors expand and match is highlighted.

### AE-13 — Output no-results state
**Given** no generated fields match query  
**When** search executes  
**Then** explicit no-results message is shown.

### AE-14 — Click generated leaf opens Builder
**Given** generated node maps to exact rule  
**When** user activates node  
**Then** target rule is selected and Builder opens while remaining in Output.

### AE-15 — Parent/owner fallback resolution
**Given** no exact leaf rule exists  
**When** user activates generated node  
**Then** nearest owning rule opens.

### AE-16 — Runtime array index normalization
**Given** runtime path contains indices  
**When** resolver maps node  
**Then** normalized schema/rule path (or owner) is resolved.

### AE-17 — Builder edit keeps Output active and refreshes
**Given** Builder opened from Output  
**When** user makes valid edit  
**Then** Output refreshes and stays active.

### AE-18 — Missing sample actionable state
**Given** no sample exists  
**When** Output opens  
**Then** user sees actionable add/select state.

### AE-19 — Large-output fallback
**Given** output exceeds configured hard limits  
**When** Output renders  
**Then** full inline tree is not attempted; limited/fallback UX appears.

### AE-20 — Container coverage label correctness
**Given** container descendant mapping coverage is full  
**When** container row renders  
**Then** label is `Fully mapped` (not `Not configured`).

### AE-21 — No backend requirement
**Given** local adapter mode  
**When** Output is used  
**Then** inline output works client-side.

### AE-22 — Test Lab responsibility unchanged
**Given** inline Output exists  
**When** user needs advanced diagnostics/trace/comparison  
**Then** Test Lab remains separate canonical destination.

### AE-23 — No hidden execution while Fields is active
**Given** Fields view is active  
**When** rules/output-affecting config change  
**Then** Output is marked dirty and no execution runs until Output opens.

### AE-24 — Sample changes do not display unrelated stale output
**Given** Sample A success exists  
**When** Sample B is selected and B execution fails  
**Then** Sample A output is not presented as Sample B stale output.

### AE-25 — Partial output is current output
**Given** new execution returns partial output with diagnostics  
**When** execution completes  
**Then** partial output is shown as current (not replaced by older success).

### AE-26 — Unconfigured generated target opens Builder
**Given** generated output field corresponds to target schema field but no rule exists  
**When** user activates field  
**Then** Builder opens on that target in unconfigured state.

### AE-27 — Coverage independent from validation
**Given** all descendants mapped and one child has validation error  
**When** parent renders  
**Then** parent shows `Fully mapped` and separate validation error status.

### AE-28 — Output execution resumes when reopened
**Given** Output was closed, rules changed in Fields  
**When** Output reopens  
**Then** one execution runs for latest dirty state.

### AE-29 — Complete copy in limited mode
**Given** Output is in limited/truncated render mode  
**When** user copies output  
**Then** full serialized payload is copied.

### AE-30 — Keyboard interaction opens Builder
**Given** an output node is keyboard-focused  
**When** user activates it  
**Then** Builder opens with same fallback behavior as pointer activation.

---

## Open Questions

- none

---

## Verification Strategy

Automated coverage:

- Preview-context identity and stale isolation.
- Partial-output vs retained-output transition rules.
- No execution while Fields active.
- Dirty execution on Output reopen.
- Output-node resolver deterministic order including unconfigured-field fallback.
- Container coverage labels independent of validation status.
- Large-output mode complete copy/download semantics.
- Segmented control + node activation keyboard/focus behavior and announcements.
- JSON render/search/highlight/copy behavior.

Manual coverage:

- Performance benchmark validation for threshold defaults (below/at/above each limit fixture).
- Test Lab link wording clarity for non-guaranteed context transfer.

---

## Task Generation Notes

- Regenerate/revise tasks for Rev 3 drift (XML removal, lifecycle gating, context identity, resolver order, accessibility, large-output constants/benchmarks).
- Keep explicit architecture update task (`Agent: task`) because preview lifecycle and output contract are materially changed.
- Add follow-up spec placeholder for canonical XML serializer + inline XML output as separate scope.

---

## Change Log

- Rev 3 — 2026-06-24
  - Made XML scope definitive: FS-099 is JSON inline output only.
  - Removed conditional XML acceptance dependency and deferred XML inline output to follow-up spec.
  - Defined discriminated RenderableOutput contract for current JSON branch with format-extensible design.
  - Added deterministic output-node-to-Builder resolution order including unconfigured target fallback.
  - Added preview-context identity and stale isolation semantics.
  - Added explicit execution lifecycle: no hidden execution while Fields active; dirty reopen execution.
  - Added current/partial/stale transition table.
  - Separated container coverage labels from validation status.
  - Clarified no explicit Test Lab working-state handoff contract and adjusted fallback expectations.
  - Converted large-output limits to configurable benchmark-validated defaults.
  - Added copy semantics, summary wording constraints, and accessibility requirements.
  - Added AE-23 through AE-30 and updated verification requirements.

- Rev 2 — 2026-06-24
  - Resolved Q1: engine output remains neutral structured value + diagnostics; XML serialization delegated to shared adapter contract.
  - Resolved Q2: `OutputDisplay` as wrapper with split format-specific viewers.

- Rev 1 — 2026-06-24
  - Initial draft from repository-grounded context.
