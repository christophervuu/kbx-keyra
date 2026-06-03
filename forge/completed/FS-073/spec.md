# SPEC

## Title

Implement AI feature: Auto-Map using retrieval-backed generation

---

## ID

FS-073

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-02  
Last Updated: 2026-06-02  
Type: cross-cutting

---

## Status

ready

---

## Revision

Rev: 2

---

## Summary

This spec defines the production Auto-Map generation flow for KeyRa using retrieval-backed context assembly over the existing schema ingestion/query architecture (DynamoDB + OpenSearch). For selected target sections (and whole-target runs where applicable), backend logic retrieves relevant source schema context, generates candidate DSL rules in chunks/sections through the shared AI runtime, merges and deduplicates outputs, validates expressions through the mapping engine, and returns reviewable suggestions to the Auto-Map workspace UX. Success means no direct full-schema prompt fallback path is introduced, and the feature scales from small to very large schemas with deterministic review safety.

---

## Problem

Current Auto-Map behavior is oriented around lightweight prompt input strings and does not yet define a canonical retrieval-backed architecture for large-schema generation quality and safety. Without backend retrieval/scoping, generated suggestions can be under-contextualized or inconsistent, and scaling to very large schemas risks brittle prompt size behavior. Additionally, candidate rules must be normalized, deduplicated, and engine-validated before review to avoid showing low-quality or invalid suggestions as-is.

---

## Goal

Deliver a canonical Auto-Map workflow where:

1. Source context is retrieved through existing ingestion/query infrastructure (not direct full-schema prompt assembly).
2. Generation executes per section/chunk strategy suitable for schema size.
3. Candidate rules are merged and deduplicated into a stable suggestion set.
4. Every suggestion is validation-enriched before UI display.
5. Auto-Map workspace presents suggestions as reviewable actions (accept/edit/dismiss/refresh) with large-schema-safe behavior.

---

## Assumptions

- Existing schema ingestion/query architecture (`SchemaNodes` + OpenSearch indexing + query path) is the canonical retrieval foundation.
- Shared AI runtime (`src/lib/ai/*`) remains the canonical model invocation boundary.
- Existing Auto-Map endpoint family remains rooted at `/ai/auto-map` unless coordinated route changes are approved in related active specs.
- Suggestion application remains user-controlled; Auto-Map does not auto-commit mapping changes.
- Existing in-progress AI contract work (FS-068..FS-072) will either be completed first or aligned during implementation.

---

## Current Context

- Relevant architecture documents were loaded: `ai-runtime.md`, `schema-ingestion.md`, `backend-api.md`, `ui-application.md`, `mapping-engine.md`, `persistence-model.md`.
- Existing `src/lambda/ai/auto-map.ts` currently calls `invokeAI('auto-map', ...)` and performs expression parse-level validation/filtering, but does not yet define full retrieval-backed, large-schema chunk orchestration.
- UI Auto-Map workspace already exists (`use-auto-map-workspace`, FS-048 lineage) and supports lifecycle/review actions, but depends on backend contract quality for suggestion fidelity.
- `HttpAdapter` AI methods are still under active integration alignment (`FS-068`), so this spec must align with canonical adapter/API routing decisions.
- Existing architecture coverage already includes AI runtime, schema retrieval/indexing, backend Lambda conventions, and UI workspace architecture; no new architecture document is required.

---

## Scope

### In Scope

- Backend retrieval flow for source schema context using existing DynamoDB + OpenSearch path.
- Section-based and/or chunk-based generation strategy selection for Auto-Map runs.
- Candidate rule merge/dedup logic across generation batches.
- Engine validation enrichment of generated expressions prior to response.
- Response contract updates needed to support reviewable suggestion metadata.
- UI review-workspace integration updates for large suggestion sets and validation-aware rendering.
- Test coverage for retrieval, generation merge/dedup, validation pass, and large-schema behavior.

### Out of Scope

- Building a separate direct full-schema prompting code path.
- Auto-applying generated mappings without user review.
- Replacing deterministic engine validation semantics.
- Prompt authoring/admin UI.
- New persistence subsystem outside existing mapping/schema stores.

---

## Non-Goals

- Guaranteeing perfectly correct mappings for every field.
- Introducing new model providers or browser-direct model calls.
- Redesigning Mapping Editor navigation/layout beyond Auto-Map review requirements.
- Solving unrelated AI features (Explain/Smart Fix/AI Validation) in this spec.

---

## Relevant Areas

- `src/lambda/ai/auto-map.ts`
- `src/lib/ai/*`
- `src/lib/schema/opensearch/query.ts`
- `src/lambda/schema/query-schema-nodes.ts`
- `src/lib/schema/dynamo/node-reader.ts`
- `src/engine/dsl/*` (parse/validation usage)
- `ui/src/lib/types/domain.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/features/mappings/hooks/use-auto-map-workspace.ts`
- `ui/src/features/mappings/components/AutoMapWorkspace.tsx`
- `tests/lambda/ai/auto-map.test.ts`
- `ui/src/features/mappings/hooks/use-auto-map-workspace.test.ts`
- `forge/architecture/ai-runtime.md` (update target)
- `forge/architecture/ui-application.md` (update target)

---

## Dependencies / Blockers

- Depends on stable schema ingestion/query baseline (FS-056 lineage).
- Depends on ongoing adapter/backend AI contract alignment work in active specs (notably FS-068).
- Depends on prompt/runtime foundation consistency from FS-066 and FS-067.
- Depends on mapping-engine validation behavior remaining available in Lambda runtime.

---

## Constraints

- Must use existing DynamoDB + OpenSearch retrieval architecture for source context.
- Must not add a separate "full schema in one prompt" fallback path.
- Must support both small and very large schemas without API timeout regressions.
- Must keep suggestions advisory and reviewable before any mapping mutation.
- Must preserve standard backend error envelope semantics and UI retry behavior.
- Must keep deterministic validation authoritative; AI validation fields are additive context.
- Whole-schema Auto-Map and section-mode Auto-Map share the same `/ai/auto-map` endpoint, distinguished by a `mode` request field (`"section" | "whole"`).
- Retrieval scoring uses weighted hybrid lexical (BM25 on `fieldName`/`path`/`description` + heuristic boosting), with no vector embedding dependency at initial rollout.

---

## Proposed Behavior

### User Flow

1. User enters Auto-Map workspace for a target section (or whole-target scope where enabled).
2. User triggers Auto-Map generation.
3. UI requests backend Auto-Map generation with scope identifiers (mapping/schema/section) plus `mode` field (`"section"` or `"whole"`), rather than prebuilt full source context blobs.
4. Backend retrieves relevant source schema nodes using existing schema query/index infrastructure.
5. Backend executes generation in section/chunk units, merges and deduplicates candidates, validates expressions, and returns suggestions.
6. Workspace renders suggestions with confidence + validation details and supports Accept, Edit, Dismiss, Refresh actions.
7. User decisions update draft mapping state; suggestions remain review artifacts until explicitly applied.

### System Behavior

- Retrieval stage:
  - Resolve target candidate set for requested scope using `mode` flag (`"section"` or `"whole"`).
  - Retrieve source-context candidates by weighted hybrid lexical scoring (BM25 on `fieldName`/`path`/`description` + heuristic boosting). No vector embedding dependency at initial rollout.
  - Bound retrieved context per chunk/section to maintain prompt-size and latency ceilings.
- Generation stage:
  - Use a section-based flow for smaller scopes and chunked sub-batches for large scopes.
  - Chunk target: 50–100 target fields per chunk. Concurrency cap: max 4 parallel AI runtime invocations per request in Lambda path.
  - When estimated workload exceeds Lambda timeout/memory budget (e.g., large-schema whole-map mode), introduce Step Functions orchestration for the auto-map run.
  - Invoke shared AI runtime per chunk with prompt variables derived from retrieval output.
- Merge/dedup stage:
  - Combine chunk outputs into one suggestion list keyed by target path.
  - Dedup conflicts by deterministic precedence: **validation status first** (valid > invalid/parse-error), **then confidence** (high > medium > low), **then target-type-aware tie-break** (scalar over complex, alphabetic path as final tie-breaker).
  - Record dedup resolution reason for every conflict in response telemetry.
- Validation stage:
  - Run mapping-engine parse validation for each expression.
  - Attach normalized validation diagnostics in response payload.
- Response stage:
  - Return stable suggestion objects suitable for workspace review and refresh-merge behavior.
- Telemetry stage (all Auto-Map responses):
  - Include minimum telemetry fields in response envelope and/or structured logs:
    - `requestId`, `mappingId`, `mode` (`"section"` | `"whole"`)
    - `chunkCount`, `chunkIds`
    - `retrievalCandidatesCount`, `retrievalSelectedCount`
    - Per-rule `sourceChunkRef` mapping
    - `validationPassCount`, `validationFailCount`
    - `dedupDecisions` array with winner/loser target + reason
    - `model` + `promptVersion` IDs
    - Elapsed timing per stage (`retrievalMs`, `generationMs`, `mergeMs`, `validationMs`, `totalMs`)

### Failure / Edge Behavior

- Retrieval returns no relevant source context: backend returns success with empty suggestions + explicit “no relevant source context” reason metadata.
- Partial chunk failures in large runs: backend returns successful partial suggestions plus chunk-level warnings when safe; hard failures return normalized error envelope.
- Generated expression parse failure: suggestion retained but marked invalid with diagnostics; never silently treated as valid.
- Duplicate/conflicting targets across chunks: backend resolves deterministically and records dedup counters/metadata.
- Oversized scope request: backend auto-chunks and enforces per-chunk limits; no direct full-schema prompting fallback.
- Missing mapping/schema references: return `RESOURCE_NOT_FOUND` envelope semantics.

---

## Acceptance Examples

### AE-01 — Section auto-map uses retrieval-backed source context

**Given**
- A mapping references ready source and target schemas
- User triggers Auto-Map for section `Order.Header`

**When**
- Backend processes the Auto-Map request

**Then**
- Source context is retrieved through schema query/index architecture (OpenSearch + schema node metadata)
- AI generation receives scoped retrieved context (not direct full-schema payload)
- Suggestions are returned for eligible target fields in `Order.Header`

### AE-02 — Large-schema requests use chunked generation path

**Given**
- Source schema is very large (thousands of fields)
- User triggers Auto-Map over a broad scope

**When**
- Backend executes generation

**Then**
- Backend splits work into section/chunk units under configured limits
- Chunk outputs are merged into one response
- No separate direct full-schema prompting path is used

### AE-03 — Merge/dedup returns stable target-unique suggestions

**Given**
- Two generation chunks propose rules for the same target path

**When**
- Backend finalizes the suggestion set

**Then**
- Exactly one suggestion remains for that target path according to deterministic precedence
- Response includes dedup/merge metadata suitable for debugging/telemetry

### AE-04 — Validation pass enriches every suggestion before display

**Given**
- Generation returns candidate expressions including at least one invalid DSL expression

**When**
- Backend runs validation enrichment

**Then**
- Every suggestion includes validation status
- Invalid suggestions include normalized diagnostics and are not reported as valid

### AE-05 — Workspace supports review lifecycle on retrieval-backed suggestions

**Given**
- Backend returns validated suggestions for a section

**When**
- User reviews and applies actions in Auto-Map workspace

**Then**
- User can Accept/Edit/Dismiss/Refresh suggestions
- Workspace filtering and summary counts reflect status + validation states
- No auto-apply occurs without user action

### AE-06 — No-context scenario is safe and explicit

**Given**
- Retrieval finds no relevant source nodes for the selected target scope

**When**
- User triggers Auto-Map

**Then**
- Response succeeds with zero suggestions and explicit no-context metadata
- Workspace shows actionable empty state instead of generic failure

---

## Open Questions

- none

---

## Verification Strategy

- Automated backend tests:
  - Retrieval wiring and scoped query behavior (`AE-01`, `AE-06`)
  - Chunk orchestration + merge/dedup determinism (`AE-02`, `AE-03`)
  - Validation enrichment behavior (`AE-04`)
  - Error envelope + partial-failure behavior
- Automated UI tests:
  - Workspace lifecycle actions + filter/summary updates on returned suggestion metadata (`AE-05`, `AE-06`)
- Integration/performance checks:
  - Large-schema simulation validates chunking and latency bounds (`AE-02`)
- Standard checks:
  - `npm run typecheck`
  - Touched Vitest suites for backend + UI areas

---

## Task Generation Notes

- Split backend retrieval/orchestration, merge/dedup/validation, adapter contract alignment, and UI review integration into separate tasks.
- Include an explicit architecture update task because this spec materially extends existing AI runtime + UI Auto-Map architecture docs.
- Keep large-schema verification isolated in a dedicated backend validation task to reduce risk.
- Route backend/architecture/contract tasks to `task`; route workspace UI changes to `ui-task`.

---

## Change Log

- Rev 1 — 2026-06-02
  - Initial draft
- Rev 2 — 2026-06-02
  - Resolved all 5 Open Questions into spec text:
    - Q1: Weighted hybrid lexical (BM25 on fieldName/path/description + heuristics), no vector dependency at initial rollout
    - Q2: Chunk target 50–100 fields, max 4 concurrent invocations, Step Functions handoff when Lambda budget exceeded
    - Q3: Dedup precedence = validation status first → confidence → target-type-aware tie-break
    - Q4: Minimum telemetry fields defined per stage (retrieval, chunk, validation, dedup metrics + timings)
    - Q5: Shared `/ai/auto-map` endpoint with `mode: "section" | "whole"` request field