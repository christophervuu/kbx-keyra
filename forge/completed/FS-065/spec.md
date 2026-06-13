# SPEC

## Title

Audit and Reconcile AI Showcase Implementation with Phase 1 Backend Architecture

---

## ID

FS-065

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-02  
Last Updated: 2026-06-02  
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

This spec defines an audit-and-reconcile pass for all pre-Phase-1 AI showcase work so KeyRa can safely build future AI features on canonical backend architecture. The work inventories existing AI UI surfaces, adapter/client routing, Lambda handlers, prompt/runtime orchestration, and schema-query dependencies; identifies drift and architectural loops; and defines keep/replace/retire outcomes. Success means all retained AI features run through the standard Phase 1 backend flow (API → handler → shared runtime/persistence/ingestion-query path) with no hidden shortcuts.

---

## Problem

The current AI capability footprint evolved through showcase vertical slices before full Phase 1 backend consolidation. As a result, AI behavior is split across legacy and canonical paths (e.g., deprecated showcase patterns vs current HttpAdapter-first backend architecture), creating ambiguity about which path is authoritative. This introduces risk for Phase 2: new work could accidentally extend non-canonical loops or bypass validated backend contracts.

---

## Goal

Produce and execute a reconciliation plan that:

1. Inventories all current AI feature surfaces and technical touchpoints.
2. Identifies every architectural drift/bypass/loop against the Phase 1 backend architecture.
3. Produces explicit keep/replace/retire decisions.
4. Migrates retained AI behavior onto canonical backend paths only.
5. Preserves worthwhile user-visible behavior while removing architecture shortcuts.

---

## Assumptions

- Phase 1 core backend architecture references remain authoritative: `backend-api.md`, `persistence-model.md`, `schema-ingestion.md`, `ai-runtime.md`, `phase-1-readiness.md`.
- Existing showcase features (Explain Rule, Suggest Expression, Auto-Map section review/workspace) are user-visible and should be preserved where compatible.
- `HttpAdapter` is the canonical UI backend adapter when `VITE_API_URL` is set; deprecated showcase bridge paths should not remain long-term.
- AI endpoints remain suggestion-only and do not auto-commit mapping changes.
- In this reconciliation pass, canonical `HttpAdapter` support is required for `autoMap`, `suggestExpression`, `explainRule`, `smartFix`, and `validateMappings`.
- Non-core/experimental AI methods may be deferred only behind explicit feature gating with standardized `FEATURE_NOT_ENABLED` errors.

---

## Current Context

Repository/architecture context loaded before drafting indicates:

- Current active specs: `FS-019` and `FS-063` (FS-063 currently has no spec/tasks content).
- Existing AI architecture coverage already exists (`forge/architecture/ai-runtime.md`) and broader Phase 1 backend architecture is documented.
- AI showcase lineage exists in completed specs (`FS-041`, `FS-042`, `FS-044`, `FS-046`, `FS-048`) and introduced vertical-slice patterns before broader backend normalization.
- Current UI adapter bootstrap is HttpAdapter-first when `VITE_API_URL` is set, while deprecated showcase artifacts (e.g., `HybridAdapter`, AI-specific HTTP client conventions) still exist and can cause architectural drift.
- Current HttpAdapter leaves several AI methods as `NOT_IMPLEMENTED`, while AI-focused pathways exist elsewhere, which is a concrete reconciliation hotspot.

---

## Scope

### In Scope

- Full inventory of existing AI implementation surfaces across UI, adapter/client, Lambda, shared runtime, and schema-query dependencies.
- Drift analysis against canonical Phase 1 backend architecture documents and currently implemented conventions.
- Explicit keep/replace/retire decision matrix for each AI surface.
- Reconciliation changes so retained AI features route through canonical backend architecture only.
- Removal or retirement of shortcuts/bypasses that conflict with canonical adapter/API/persistence/ingestion-query flow.
- Migration plan (sequencing, fallback/compatibility strategy, verification gates).
- Architecture documentation update capturing the reconciled target and migration rationale.
- OpenSearch-first schema retrieval for AI-related schema query dependencies, with documented/instrumented PK-scoped degraded fallback as a temporary path.

### Out of Scope

- Net-new AI capabilities, endpoints, or UX expansion.
- Prompt quality tuning or model experimentation beyond parity-preserving migration needs.
- New product workflows unrelated to existing AI showcase behavior.
- Major redesign of Mapping Editor non-AI surfaces.

---

## Non-Goals

- Expanding AI feature scope beyond currently shipped/showcased functionality.
- Replacing Phase 1 backend architecture with a new architecture.
- Introducing a second long-term AI integration pattern.
- Deferring drift fixes by documenting them only without executable migration work.

---

## Relevant Areas

- `forge/architecture/ai-runtime.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/phase-1-readiness.md`
- `forge/architecture/schema-ingestion.md`
- `forge/architecture/persistence-model.md`
- `forge/architecture/ui-application.md`
- `ui/src/lib/api/bootstrap.ts`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/lib/api/hybrid-adapter.ts`
- `ui/src/lib/api/ai-api-client.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/features/mappings/hooks/use-explain-rule.ts`
- `ui/src/features/mappings/hooks/use-suggest-expression.ts`
- `ui/src/features/mappings/hooks/use-auto-map-workspace.ts`
- `src/lambda/ai/explain-rule.ts`
- `src/lambda/ai/suggest-expression.ts`
- `src/lambda/ai/auto-map.ts`
- `src/lib/ai/*`
- `src/lambda/shared/*`
- `src/lambda/schema/query-schema-nodes.ts`
- `src/lib/schema/opensearch/*`
- `tests/lambda/ai/*`
- `ui/src/lib/api/__tests__/*`

---

## Dependencies / Blockers

- Depends on completed Phase 1 architecture baselines in FS-055, FS-056, FS-057, FS-058, FS-059, FS-061, FS-062, FS-063, FS-064 remaining stable enough for reconciliation mapping.
- AI routes may remain temporarily outside Phase 1 IaC as an interim operational model, but must be consumed exclusively through canonical backend APIs via `HttpAdapter`.

---

## Constraints

- Preserve user-visible behavior judged valuable by the reconciliation matrix.
- All retained AI flows must use canonical backend pathways (no direct model calls or ad-hoc bypasses).
- Do not regress standardized error envelope/retry semantics used by Phase 1 UI.
- Keep adapter boundary contract coherent (single canonical production adapter path).
- Keep mapping draft/save/deploy semantics unchanged (AI remains suggestion-only).
- No new AI feature expansion in this spec.
- No direct browser model calls or alternate adapter paths are permitted.
- Canonical `HttpAdapter` must implement backend calls for `autoMap`, `suggestExpression`, `explainRule`, `smartFix`, and `validateMappings` in this pass.
- Deferred non-core/experimental methods must use explicit feature gating and standardized `FEATURE_NOT_ENABLED` responses.
- AI schema retrieval must be OpenSearch-first; any fallback must be PK-scoped, explicitly degraded-mode gated, and instrumented.

---

## Proposed Behavior

### User Flow

1. Existing AI UI entry points (Explain, Suggest, Auto-Map review/workspace) remain available where retained.
2. Users continue to receive equivalent or improved responses/errors for retained features.
3. No new AI actions are introduced in this reconciliation pass.

### System Behavior

1. A formal inventory artifact is produced for all AI-related surfaces and dependencies.
2. A drift list is produced that explicitly maps each finding to violated/misaligned Phase 1 architecture expectations.
3. Each AI surface receives a keep/replace/retire decision with rationale and target-state mapping.
4. Reconciled implementation routes retained features through canonical backend paths:
   - UI uses canonical adapter path for production backend mode.
   - `HttpAdapter` provides canonical backend-backed implementations for `autoMap`, `suggestExpression`, `explainRule`, `smartFix`, and `validateMappings`.
   - API route/handler contracts align to backend API conventions.
   - Lambda handlers use shared AI runtime and shared response/error conventions.
   - Any schema-query dependencies for AI use OpenSearch-first retrieval, with temporary PK-scoped fallback only under explicit degraded-mode gating and instrumentation.
5. Deprecated shortcuts are removed or hard-retired with clear compatibility handling where needed.
6. Architecture documentation is updated to reflect the reconciled steady-state model.

### Failure / Edge Behavior

- If a showcase behavior cannot be safely reconciled without architecture violation, it is marked `retire` with explicit rationale and user-facing impact note.
- If parity cannot be preserved for a retained behavior, migration must include explicit regression callout and mitigation path before completion.
- If infrastructure gaps block full cutover, migration remains incomplete and the spec stays active with explicit blocker tracking.
- If a non-core/experimental method is deferred, API and adapter behavior must return standardized `FEATURE_NOT_ENABLED` with explicit gating rationale.
- If OpenSearch is unavailable/degraded, fallback is allowed only through PK-scoped gated mode with instrumentation for degraded-path usage.

---

## Acceptance Examples

### AE-01 — Complete AI surface inventory

**Given**
- The current repository state and architecture references

**When**
- The audit is executed

**Then**
- A complete inventory exists covering AI UI surfaces, adapter/client paths, Lambda handlers, runtime/prompt logic, and schema-query dependencies

### AE-02 — Drift list aligned to architecture

**Given**
- The inventory and Phase 1 architecture documents

**When**
- Drift analysis is completed

**Then**
- Each drift item identifies the conflicting architecture rule/document and concrete impacted code paths

### AE-03 — Keep/replace/retire matrix finalized

**Given**
- Drift findings and product-preservation intent

**When**
- Decisioning is completed

**Then**
- Every AI surface is tagged as keep, replace, or retire with rationale and migration implication

### AE-04 — Canonical routing enforced for retained features

**Given**
- A retained AI feature (e.g., Explain, Suggest, Auto-Map section)

**When**
- Reconciliation is implemented

**Then**
- Runtime path uses canonical backend adapter/API/handler/runtime/query flow with no deprecated shortcut loop

### AE-05 — No AI feature expansion

**Given**
- The reconciliation implementation

**When**
- Scope is validated against spec

**Then**
- No new AI capabilities beyond reconciliation are introduced

### AE-06 — User-visible behavior parity for retained features

**Given**
- Existing retained feature surfaces

**When**
- Reconciliation changes land

**Then**
- Core user-visible behaviors remain available and functionally equivalent (or intentionally improved without expansion)

### AE-07 — Migration plan is executable

**Given**
- The reconciliation package

**When**
- Engineering plans execution

**Then**
- A sequenced migration plan exists with dependencies, cutover strategy, and verification gates

### AE-08 — Architecture references updated

**Given**
- Reconciliation decisions are finalized

**When**
- Architecture update task is completed

**Then**
- Relevant architecture docs and `forge/architecture/INDEX.md` reflect the reconciled AI architecture state

### AE-09 — Mandatory canonical HttpAdapter AI methods implemented

**Given**
- Backend mode with `VITE_API_URL` configured

**When**
- UI invokes `autoMap`, `suggestExpression`, `explainRule`, `smartFix`, and `validateMappings`

**Then**
- Each method routes through canonical `HttpAdapter` backend API calls (not `NOT_IMPLEMENTED`, not alternate adapter paths)

### AE-10 — Deferred methods use standardized feature gating

**Given**
- A non-core/experimental method intentionally deferred in this pass

**When**
- The method is invoked through canonical adapter/API surface

**Then**
- The response is standardized `FEATURE_NOT_ENABLED` and clearly gated (no silent fallback/alternate execution path)

### AE-11 — OpenSearch-first retrieval with gated degraded fallback

**Given**
- An AI flow requiring schema retrieval

**When**
- Retrieval executes under normal and degraded conditions

**Then**
- Normal path uses OpenSearch-first retrieval
- Any fallback path is PK-scoped, explicitly degraded-mode gated, and instrumented

---

## Open Questions

- none

---

## Verification Strategy

- Map verification directly to AE IDs.

Automated:
- Adapter/API contract tests for mandatory canonical methods and deferred gating behavior (`AE-04`, `AE-09`, `AE-10`).
- Lambda/runtime tests validating canonical invocation and standardized error handling (`AE-04`, `AE-10`).
- Regression tests on retained UI hooks/components for explain/suggest/auto-map behaviors (`AE-06`).
- Schema retrieval path tests for OpenSearch-first + degraded fallback instrumentation (`AE-11`).
- Lint/typecheck/build gates for touched areas (`AE-04`–`AE-11`).

Manual/Review:
- Audit artifact review confirming inventory completeness (`AE-01`).
- Drift matrix review against architecture references (`AE-02`, `AE-03`).
- Migration plan walkthrough for execution readiness (`AE-07`).
- Scope review confirming explicit non-goal compliance (`AE-05`).

---

## Task Generation Notes

- This is cross-cutting and must be split by domain.
- Use `task` agent for architecture/backend/adapter-contract/audit/migration planning tasks.
- Use `ui-task` agent for UI-surface reconciliation tasks in React mapping feature surfaces.
- Include an explicit architecture update task (`Agent: task`) because this spec materially updates an existing subsystem architecture (AI integration path).
- Sequence: inventory → drift/decision matrix → architecture target + plan → backend reconciliation → UI reconciliation → verification + architecture documentation finalization.

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Q1: canonical `HttpAdapter` must implement backend calls for `autoMap`, `suggestExpression`, `explainRule`, `smartFix`, and `validateMappings` in this pass
  - Resolved Q1 addendum: non-core/experimental methods may be deferred only with explicit feature gating and standardized `FEATURE_NOT_ENABLED`
  - Resolved Q2: AI routes may remain temporarily outside Phase 1 IaC, but consumption must be canonical backend API via `HttpAdapter` only
  - Resolved Q3: schema retrieval targets OpenSearch-first with documented/instrumented PK-scoped degraded fallback under explicit gating
  - Added AE-09 through AE-11 to make resolved decisions testable

- Rev 1 — 2026-06-02
  - Initial draft
