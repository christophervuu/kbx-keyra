# SPEC

## Title

Asynchronous Auto-Map Runs and Full-Width Suggestion Review

---

## ID

FS-101

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-26  
Last Updated: 2026-06-26  
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 3

---

## Summary

Redesign KeyRa Auto-Map as a persistent, resumable review system where generation attempts are asynchronous runs and the Mapping Editor remains the canonical review surface.

This revision resolves core model ambiguity by separating durable review state (`AutoMapSession`) from execution attempts (`AutoMapRun`). Suggestions and review decisions live in the session; initial generation, refresh, and retry are runs within that same session.

Auto-Map remains suggestion-only: Accept updates draft state, Save persists mapping, and Deploy remains separate.

---

## Problem

Current Auto-Map behavior is directionally useful but contract-ambiguous for persistence, refresh, and resume:

1. create-time generation can block navigation.
2. async `202` responses can be interpreted as empty completion.
3. session-only browser persistence breaks resume across reload/tab/browser.
4. filtered target scope is not always transmitted and enforced exactly.
5. scoped refresh can drop out-of-scope suggestions.
6. action eligibility (accept vs edit) is inconsistently represented.
7. parser-only validation is insufficient.
8. review UI is too narrow for large suggestion sets.
9. accepted-but-unsaved rehydration is undefined.
10. refresh/retry semantics are unclear when multiple attempts exist.

---

## Goal

Deliver an Auto-Map workflow that is implementation-ready with explicit domain contracts for:

- one durable review container per mapping revision,
- multiple asynchronous runs inside that container,
- progressive suggestion persistence and resumable review,
- deterministic action/validation/refresh behavior,
- explicit unsaved rehydration and conflict handling,
- and measurable TTFSM improvements.

---

## Assumptions

- Mapping Editor route remains canonical authoring surface.
- AI invocation remains backend-only (Lambda/worker); browser never calls provider APIs.
- KeyRa engine validation remains authoritative for readiness.
- Polling is Phase 1 delivery mechanism (SSE/WebSockets deferred).

---

## Current Context

Architecture context loaded from:

- `forge/architecture/ui-application.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/ai-runtime.md`
- `forge/architecture/persistence-model.md`
- `forge/architecture/infrastructure.md`
- `forge/architecture/e2e-testing.md`

Existing architecture covers all impacted subsystems; no new subsystem architecture document is required. Existing active spec `FS-019` is not scope-overlapping.

---

## Scope

### In Scope

- Durable `AutoMapSession` + asynchronous `AutoMapRun` model.
- Persistent canonical suggestion storage and review-decision storage.
- Step Functions/worker orchestration behind a unified async API contract.
- Session/run APIs, cursor pagination, batch actions, retry actions, and capability exposure.
- Non-blocking create-time Auto-Map handoff.
- Full-width review mode in Mapping Editor primary workspace.
- Engine-backed validation readiness and action gating.
- Exact target scope transport and enforcement.
- Scoped refresh isolation and merge safety.
- Rehydration of accepted-but-unsaved draft decisions.
- Supersede semantics with late-write protection.
- Telemetry and E2E coverage for async/resume/partial flows.

### Out of Scope

- Deployment page redesign.
- New mapping DSL/functions.
- Auto-save or auto-deploy.
- Multi-user real-time collaboration.
- Step Functions physical cancellation (`StopExecution`) in this phase.

---

## Non-Goals

- Replace KeyRa DSL or mapping engine.
- Auto-commit AI suggestions.
- Require Business Context for Create Mapping Auto-Map flow.
- Browser-side AI provider access.

---

## Relevant Areas

- `ui/src/features/projects/components/CreateMappingPage.tsx`
- `ui/src/routes/pages/MappingEditor.tsx`
- `ui/src/features/mappings/components/*`
- `ui/src/features/mappings/hooks/use-auto-map-workspace.ts`
- `ui/src/lib/api/*`
- `src/lambda/ai/*`
- `src/lib/ai/*`
- `src/lib/persistence/*`
- `src/engine/*`
- `template.yaml`
- `tests/lambda/ai/*`
- `tests/e2e/*`
- `forge/architecture/{ui-application,backend-api,ai-runtime,persistence-model,infrastructure,e2e-testing,INDEX}.md`

---

## Dependencies / Blockers

- Existing mapping CRUD/revision behavior.
- Existing schema retrieval and AI runtime.
- Existing adapter abstraction and editor staged-layout patterns.

---

## Constraints

- Preserve authoring route: `/projects/:projectId/mappings/:mappingId`.
- Suggestion-only AI contract must hold on all paths.
- Save boundary remains explicit and separate from Accept.
- Time-bounded compatibility handling for legacy session-only suggestions without importing them as canonical results.

---

## Domain Model

### AutoMapSession (durable review container)

```ts
type AutoMapSessionStatus =
  | 'open'
  | 'generating'
  | 'reviewing'
  | 'resolved'
  | 'superseded'
  | 'expired';

interface AutoMapSession {
  sessionId: string;
  mappingId: string;
  projectId: string;

  status: AutoMapSessionStatus;

  baseMappingRevision: number;

  generationFingerprint: {
    sourceSchema: { id: string; version: string };
    targetSchema: { id: string; version: string };
    enrichmentSchemas: Array<{ inputId: string; schemaId: string; version: string }>;
    engineVersion: string;
    dslVersion: string;
    promptId: string;
    promptVersion: string;
    model: string;
  };

  reviewCounts: {
    pending: number;
    editing: number;
    accepted: number;
    acceptedEdited: number;
    dismissed: number;
    keptCurrent: number;
    stale: number;
    conflict: number;
    invalid: number;
  };

  lastRunId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  expiresAt?: number;
}
```

### AutoMapRun (execution attempt within a session)

```ts
type AutoMapRunStatus =
  | 'queued'
  | 'preparing'
  | 'retrieving'
  | 'generating'
  | 'validating'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'superseded';

type AutoMapScopeMode = 'whole' | 'visible' | 'section' | 'selected' | 'refresh' | 'retry-failed';

interface AutoMapRun {
  runId: string;
  sessionId: string;
  status: AutoMapRunStatus;
  scope: {
    mode: AutoMapScopeMode;
    sectionPath?: string;
    targetPaths?: string[];
    refreshOfRunId?: string;
    retryWorkUnitIds?: string[];
  };
  requestFingerprint: string;
  progress: {
    completedWorkUnits: number;
    totalWorkUnits: number;
    completedTargets: number;
    totalTargets: number;
  };
  counts: {
    generated: number;
    ready: number;
    warning: number;
    invalid: number;
    failedTargets: number;
  };
  failure?: { code: string; message: string; retryable: boolean };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}
```

`partial` is terminal and means: all work units terminal, at least one success, at least one failure.

### AutoMapWorkUnit

```ts
type AutoMapWorkUnitStatus =
  | 'queued'
  | 'retrieving'
  | 'generating'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'superseded';
```

### AutoMapSuggestion

```ts
type SuggestionReviewStatus =
  | 'pending'
  | 'editing'
  | 'accepted'
  | 'accepted-edited'
  | 'dismissed'
  | 'kept-current'
  | 'stale'
  | 'conflict';
```

Suggestion source references must include:

```ts
interface SuggestionSourceReference {
  inputId: string;
  inputType: 'primary' | 'enrichment';
  path: string;
  displayName?: string;
}
```

Each suggestion includes `version` for optimistic concurrency, and acceptance metadata:

- `acceptedExpression`
- `priorExpressionAtAcceptance`
- `acceptedAtMappingRevision`
- optional `materializedMappingRevision`
- optional `materializedAt`

---

## Persistence Model (resolved)

Dedicated DynamoDB table with on-demand billing:

```text
PK: string
SK: string
TTL attribute: expiresAt
```

Key shape:

```text
PK = SESSION#{sessionId}
SK = META

PK = SESSION#{sessionId}
SK = RUN#{createdAt}#{runId}

PK = SESSION#{sessionId}
SK = WORK_UNIT#{runId}#{workUnitOrder}#{workUnitId}

PK = SESSION#{sessionId}
SK = SUGGESTION#{sectionOrder}#{targetOrder}#{suggestionId}
```

Sparse GSIs on `META` only:

```text
GSI1PK = MAPPING#{mappingId}
GSI1SK = CREATED#{createdAt}#{sessionId}

GSI2PK = MAPPING#{mappingId}
GSI2SK = OPEN#{updatedAt}#{sessionId}
```

- `GSI1`: history lookup
- `GSI2`: active/resumable lookup
- no suggestion-level GSIs in this phase
- PITR enabled outside disposable local envs
- no schema blobs/sample payloads/prompts stored in this table

---

## Concurrency and Session Rules

1. A mapping revision may have only one open Auto-Map session.
2. Whole, visible, section, selected, refresh, and retry operations create runs inside that session.
3. Equivalent active start requests are deduplicated by request fingerprint and return existing run.
4. Starting generation on newer saved mapping revision creates a new session and supersedes prior session.

Superseded write protection:

- worker writes must be conditional on session/run not superseded.
- late writes from superseded runs must not update review counts, progress, or GSI2 attributes.

---

## API Contracts

### Capability exposure (required)

Backend capability payload includes:

```json
{
  "capabilities": {
    "autoMap": {
      "enabled": true,
      "executionMode": "async"
    }
  }
}
```

Execution mode enum: `disabled | legacy | async` (`AUTO_MAP_EXECUTION_MODE`).

### Start run

```http
POST /ai/auto-map/sessions/:sessionId/runs
```

Create-time shortcut may use session bootstrap endpoint:

```http
POST /ai/auto-map/sessions
```

Request:

```ts
interface StartAutoMapRequest {
  projectId: string;
  mappingId: string;
  baseMappingRevision: number;
  scope: {
    mode: 'whole' | 'visible' | 'section' | 'selected' | 'refresh' | 'retry-failed';
    targetPaths?: string[];
    sectionPath?: string;
    refreshOfRunId?: string;
    retryWorkUnitIds?: string[];
  };
  idempotencyKey: string;
}
```

Response (202): `sessionId`, `runId`, queued status.

### Session lookup

```http
GET /mappings/:mappingId/auto-map-session
```

Returns active/resumable open session, else `null`.

### Run status

```http
GET /ai/auto-map/sessions/:sessionId/runs/:runId
```

### Suggestions list

```http
GET /ai/auto-map/sessions/:sessionId/suggestions
```

Pagination contract:

- default `limit=100`
- min accepted `20` (normalize lower values)
- max `250` (cap higher values)
- opaque cursor only

Cursor binding includes session ID + normalized filter hash + sort version + last evaluated key.

### Suggestion decision (single)

```http
PATCH /ai/auto-map/sessions/:sessionId/suggestions/:suggestionId
```

Request:

```ts
interface UpdateSuggestionDecisionRequest {
  action:
    | 'accept'
    | 'apply-edit'
    | 'dismiss'
    | 'keep-current'
    | 'undo'
    | 'cancel-edit';
  expectedVersion: number;
  editedExpression?: string;
}
```

### Suggestion actions (batch)

```http
POST /ai/auto-map/sessions/:sessionId/suggestions/actions
```

Returns applied/skipped counts and skipped reasons.

### Retry failed work units

```http
POST /ai/auto-map/sessions/:sessionId/runs
```

with `scope.mode='retry-failed'` and `retryWorkUnitIds`.

---

## Validation Contract

Validation unit is candidate mapping configuration, not standalone expression-only parse check.

- scalar: apply candidate rule into captured base mapping config, run canonical engine `validate`.
- array: apply complete array parent + child group as one candidate and validate together.
- after accept/edit in UI: validate full current working mapping in browser.

Readiness mapping:

- `ready`: no blocking diagnostics
- `warning`: non-blocking diagnostics
- `invalid`: blocking diagnostics

Invalid suggestions are reviewable/editable but not directly acceptable.

---

## Accepted-but-Unsaved Rehydration

On Accept/Apply Edit, persist suggestion decision metadata in session store; mapping remains unsaved.

On editor reload:

1. Load current saved mapping.
2. For each accepted/accepted-edited suggestion not materialized:
   - if current saved target expression matches `priorExpressionAtAcceptance`, reapply accepted expression into draft.
   - else mark suggestion `conflict`.
3. Keep unsaved indicator visible.

On Save success:

- mark materialized suggestions with `materializedMappingRevision` + `materializedAt`.
- Save does not automatically close session.

---

## Review Completion Rules

Session becomes `resolved` when all are true:

- every suggestion is `accepted | accepted-edited | dismissed | kept-current`
- no run/work-unit active
- no `stale` or `conflict` remaining
- accepted outcomes are materialized or explicitly undone

User may choose **Finish Review** with confirmation to close remaining pending items without applying them.

---

## Polling and Connectivity

- immediate fetch on review open
- active change polling: 2s ±15% jitter
- unchanged backoff:
  - 0–2 unchanged: 2s
  - 3–11 unchanged: 5s
  - 12+: 10s
- hidden tab: pause polling; optional one final status call if previous response >5s old
- on visible: immediate poll + reset unchanged counter
- transient network retry: 2s, 4s, 8s, 15s, 30s max (jittered)
- poll errors do not mutate backend run/session status
- terminal run statuses stop polling: `completed|partial|failed|superseded`

---

## Review Filters and Batch Rules

Primary status filter is exclusive:

- All
- Needs Review
- Accepted
- Dismissed
- Kept Current
- Stale
- Conflict

Secondary filters:

- Validation
- Confidence
- Change type
- Required only
- Section
- Target search

Batch actions:

- apply only to currently filtered rows
- show exact pre-apply count
- never batch-accept `invalid`, `stale`, `conflict`
- return applied/skipped counts with reasons

---

## Preview Behavior

- with selected sample + complete input set: show current vs suggested output
- without sample: show `No sample selected`
- preview absence does not block review/acceptance
- preview execution errors show diagnostics and do not remove suggestion
- enrichment preview requires complete selected input set

---

## Accessibility and Layout Requirements

- keyboard navigation through review rows and actions
- focus moves to Source/Builder details on open and returns to selected row on close
- screen-reader announcements for progress updates, completion, refresh results, and errors
- WCAG AA contrast compliance
- desktop support down to 1024px with responsive collapse of side details into tabs/drawers while preserving primary review workspace

---

## Execution Strategy

All operations use the same persistent session/run API contract.

Execution engine selection is internal:

- small scopes may run in async Lambda workers
- large scopes use Step Functions orchestration

UI behavior is unchanged regardless of backend executor.

---

## Legacy Compatibility Window

Do not import legacy sessionStorage suggestions.

If no backend session exists and legacy data is detected, show one-time notice:

- `Generate new suggestions` (clear legacy + start new canonical session/run)
- `Discard local suggestions` (clear legacy only)

Window: one production release or 30 days after async production rollout (whichever longer). Then remove legacy detection/migration UI/utilities/tests.

---

## TTFSM Targets

- Create mapping -> editor navigation: p95 < 2s after mapping persistence and run acknowledgment.
- Editor open -> first visible progress: p95 < 2s.
- Completed work unit -> suggestion visible: p95 < 3s.
- Client preview (current vs proposed): < 2s.
- Track time-to-first-usable suggestion by schema size segment.
- No regression for small-schema time-to-first-suggestion vs legacy baseline.

---

## Acceptance Examples

### AE-01 — Non-blocking create flow
Given mapping create and session/run start are acknowledged (`202`)  
When create flow completes  
Then editor opens immediately in review mode without waiting for full generation.

### AE-02 — Resume after reload
Given active session with partially completed runs/work units  
When user reloads editor  
Then same session is restored and polling resumes; no duplicate run created.

### AE-03 — Full-width review workspace
Given review mode active  
When editor renders  
Then review grid replaces primary target workspace and is not confined to builder panel.

### AE-04 — Exact scope enforcement
Given 12 visible target paths selected  
When run starts in visible mode  
Then backend receives exactly those paths and persists only in-scope suggestions.

### AE-05 — Scoped refresh isolation
Given mixed accepted/pending/dismissed/stale  
When stale subset refresh run completes  
Then out-of-scope suggestions and decisions remain unchanged.

### AE-06 — Invalid suggestion gating
Given blocking validation diagnostic  
When suggestion row renders  
Then accept is disabled with reason, and edit/dismiss/refresh remain available.

### AE-07 — Undo before save
Given accepted unsaved suggestion  
When user clicks undo  
Then review status returns to pending and draft change is safely reverted.

### AE-08 — Explicit edit lifecycle
Given suggestion opened for edit  
When user cancels edit  
Then prior status is restored and no draft mutation is committed.

### AE-09 — Preview/no-sample behavior
Given no sample selected  
When row/details render  
Then UI shows `No sample selected`; review actions remain available.

### AE-10 — Coherent array validation
Given array mapping suggestion group  
When validated  
Then parent+children are validated as one candidate config.

### AE-11 — Partial terminal run
Given run with succeeded and failed work units  
When all work units become terminal  
Then run status is `partial`; successful suggestions remain reviewable; failed units retryable.

### AE-12 — Conflict on rehydrate
Given accepted unsaved suggestion and target expression changed externally  
When session rehydrates  
Then suggestion becomes `conflict` and is not silently reapplied.

### AE-13 — Browser AI isolation
Given any Auto-Map operation  
When network inspected  
Then browser calls only KeyRa backend, never provider endpoints.

### AE-14 — Save boundary
Given accepted suggestions and no Save action  
When user leaves/reloads  
Then mapping persisted rules remain unchanged until explicit Save.

### AE-15 — Session completion semantics
Given all suggestions resolved and no active run/work unit  
When review reevaluates session state  
Then session transitions to `resolved` and drops from GSI2 open lookup.

---

## Open Questions

- none

---

## Verification Strategy

- Unit: status transitions, request fingerprinting, cursor binding, filter normalization, rehydration/conflict logic.
- Backend handlers: start/session lookup/run status/suggestions/decision/batch/retry contracts.
- Persistence: conditional writes and superseded late-write rejection.
- Orchestration: progressive persistence, partial terminal semantics, idempotent retries.
- Engine validation: scalar/object/array/enrichment candidate-config validation.
- UI: layout mode, filter exclusivity, batch summaries, accessibility/focus behavior, no-sample preview.
- E2E: create->review latency, resume, scoped refresh isolation, partial retry, save boundary, no direct browser AI.
- Quality gates: typecheck, lint, tests, SAM/template validation, build.

---

## Task Generation Notes

- Split by domain (`task` backend/infra/architecture, `ui-task` UI surface).
- Prioritize in this order:
  1) session/run persistence and APIs,
  2) orchestration and validation,
  3) adapter migration,
  4) UI review shell + lifecycle + accessibility,
  5) E2E + telemetry,
  6) architecture doc updates.
- Existing FS-101 task set must be drift-updated to Rev 3 session/run semantics.

---

## Change Log

- Rev 3 — 2026-06-26
  - Resolved implementation blockers by introducing explicit `AutoMapSession` + `AutoMapRun` model, one-open-session-per-mapping-revision rule, accepted-unsaved rehydration contract, full status enums/transitions, expanded API contracts (idempotency, optimistic concurrency, batch, retry, cursor binding), execution-strategy clarification, review completion rules, superseded write protection, accessibility requirements, and measurable TTFSM targets.

- Rev 2 — 2026-06-26
  - Resolved Q1–Q6 with explicit contracts for table/index design, pagination limits, polling/backoff/visibility behavior, legacy compatibility handling, cancellation deferral/supersede semantics, and backend-controlled rollout execution modes.

- Rev 1 — 2026-06-26
  - Initial draft planning package for FS-101 based on provided requirements.
