# SPEC

## Title

Rework ApiAdapter/HttpAdapter AI integration to canonical backend endpoints (Phase 2 methods)

---

## ID

FS-068

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

This spec defines how KeyRa AI methods are integrated through the canonical adapter boundary using the standard backend architecture. It replaces legacy/placeholder AI access in `HttpAdapter` with backend-backed API methods for `explainRule`, `suggestExpression`, `smartFix`, `validateMappings`, and `autoMap`, while preserving the rule that browser code never calls model services directly. It also defines explicit local/offline behavior for AI methods when `LocalStorageAdapter` is active. Success means AI UI call sites remain adapter-based and all supported AI HTTP calls route through canonical backend API contracts.

---

## Problem

Current AI integration is split between:
- canonical adapter bootstrap (`HttpAdapter` when `VITE_API_URL` is set),
- legacy showcase transport (`HybridAdapter` + `ai-api-client.ts`), and
- `HttpAdapter` placeholders (`NOT_IMPLEMENTED`) for multiple AI methods.

This creates architecture drift: the UI can retain old hybrid loops while canonical adapter methods remain unimplemented, and offline behavior is implicit rather than formally defined per method.

---

## Goal

Establish one canonical AI invocation path at the UI integration boundary:
1. `HttpAdapter` implements backend API calls for Phase 2 AI methods.
2. `LocalStorageAdapter` defines deterministic unsupported/offline behavior for these methods.
3. API contracts for AI endpoints are documented and aligned with adapter/domain types.
4. Legacy hybrid AI loops are removed/deprecated from active integration paths.
5. UI call sites continue to use `ApiAdapter` (no direct browser AI/model calls).

---

## Assumptions

- Existing backend AI runtime and handlers under `src/lambda/ai/*` remain the canonical backend-side AI execution boundary.
- Existing endpoint paths (`/ai/explain-rule`, `/ai/suggest-expression`, `/ai/auto-map`) remain valid unless superseded by explicit contract updates in this spec.
- `smart-fix` and `validate-mappings` endpoints may require backend implementation in parallel specs/tasks; this spec defines adapter/API contract integration and expected behavior.
- Temporary pre-backend behavior for unavailable AI endpoints is standardized as `FEATURE_NOT_ENABLED` (not generic/untyped errors).
- Standard backend envelope/error semantics remain authoritative for HTTP mode.

---

## Current Context

Repository context indicates:
- `HttpAdapter` currently throws `AdapterMethodNotImplementedError` for `autoMap`, `autoMapSection`, `suggestExpression`, `explainRule`, `smartFix`, and `validateMappings`.
- `HybridAdapter` still directly uses `ai-api-client.ts` for selected AI methods (legacy showcase loop).
- `LocalStorageAdapter` currently throws generic offline errors (`"Not available in offline mode"`) for all AI methods.
- AI handlers exist for `explain-rule`, `suggest-expression`, and `auto-map`; additional Phase 2 methods are part of ongoing AI backend foundation specs (FS-066/FS-067).
- Mapping feature hooks (`useExplainRule`, `useSuggestExpression`, `useAutoMapWorkspace`) already call adapter methods rather than direct `fetch()`.

Related in-progress specs:
- FS-065 (AI showcase reconciliation)
- FS-066 (AI backend foundation)
- FS-067 (prompt/output contracts)

---

## Scope

### In Scope

- Implement `HttpAdapter` AI methods for:
  - `explainRule`
  - `suggestExpression`
  - `smartFix`
  - `validateMappings`
  - `autoMap`
  - maintain `autoMapSection` routing as part of canonical auto-map contract
- Define canonical API endpoint contracts (request/response/error expectations) for those methods.
- Standardize offline behavior for AI methods in `LocalStorageAdapter`.
- Remove/deprecate legacy hybrid AI integration loops from active adapter usage.
- Keep existing UI AI hooks/components adapter-based and transport-agnostic.
- Add/adjust automated tests for adapter routing, payload mapping, and offline-mode behavior.
- Include explicit architecture updates for existing docs.

### Out of Scope

- New AI UX/features beyond existing methods and call sites.
- Prompt tuning/model-quality improvements.
- Browser-side direct model invocation of any kind.
- Full backend implementation details for new endpoints beyond contract-level definition (covered by backend execution tasks/specs where needed).

---

## Non-Goals

- Creating a second adapter path for AI traffic.
- Keeping `HybridAdapter` as a production AI integration path.
- Refactoring mapping UI behavior unrelated to adapter/API integration.

---

## Relevant Areas

- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/lib/api/local-storage-adapter.ts`
- `ui/src/lib/api/hybrid-adapter.ts`
- `ui/src/lib/api/ai-api-client.ts`
- `ui/src/lib/api/index.ts`
- `ui/src/lib/api/http-adapter.test.ts`
- `ui/src/lib/api/local-storage-adapter.test.ts`
- `ui/src/lib/api/__tests__/hybrid-adapter.test.ts`
- `ui/src/features/mappings/hooks/use-explain-rule.ts`
- `ui/src/features/mappings/hooks/use-suggest-expression.ts`
- `ui/src/features/mappings/hooks/use-auto-map-workspace.ts`
- `src/lambda/ai/explain-rule.ts`
- `src/lambda/ai/suggest-expression.ts`
- `src/lambda/ai/auto-map.ts`
- `forge/architecture/ui-application.md`
- `forge/architecture/phase-1-readiness.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/INDEX.md`

---

## Dependencies / Blockers

- Depends on AI backend route/contract availability aligned with FS-066 and FS-067.
- If `smart-fix` / `validate-mappings` routes are not yet implemented server-side, adapter behavior must return standardized `FEATURE_NOT_ENABLED` semantics (not `NOT_IMPLEMENTED` and not generic errors).

---

## Constraints

- No AI/model calls from browser code outside backend API routes.
- UI call sites must continue using `ApiAdapter`; no direct `fetch()` in feature hooks/components.
- Preserve canonical HTTP client error normalization conventions.
- Preserve TypeScript/domain type compatibility across adapter boundaries.
- Keep behavior deterministic between HTTP mode and offline mode.

---

## Proposed Behavior

### User Flow

1. User triggers an AI action (Explain, Suggest, Auto-Map, Smart Fix, Validate Mappings).
2. UI hook/component calls the corresponding `ApiAdapter` method.
3. In HTTP mode (`HttpAdapter`): adapter calls canonical backend `/ai/*` endpoint and returns typed result.
4. In offline mode (`LocalStorageAdapter`): unsupported AI methods fail deterministically with defined offline behavior.
5. UI displays existing success/error UX based on adapter result/error, without transport-specific branching.

### System Behavior

1. **Canonical HttpAdapter AI mappings**
   - `explainRule(input)` → `POST /ai/explain-rule`
   - `suggestExpression(input)` → `POST /ai/suggest-expression`
   - `autoMap(input)` → `POST /ai/auto-map` (whole-mapping contract shape; response always includes `rules` and may include `diagnostics`, `warnings`, `retrievalMeta`)
   - `autoMapSection(input)` → `POST /ai/auto-map` (section-scoped contract shape)
   - `smartFix(input)` → `POST /ai/smart-fix`
   - `validateMappings(input)` → `POST /ai/validate-mappings`

2. **HTTP transport contract**
   - All methods use canonical HTTP adapter transport/error handling (no bespoke fetch loop in feature code).
   - Success payloads map to existing domain types (`ExplainRuleResult`, `SuggestExpressionResult`, etc.).
   - Error envelopes map through standard app error normalization.

3. **LocalStorageAdapter behavior**
   - For AI methods above, offline mode returns deterministic unsupported behavior.
   - Behavior is documented and test-covered as product-policy (e.g., explicit offline unavailable error semantics).

4. **Legacy loop retirement policy**
   - `HybridAdapter` is retained as deprecated for one release cycle, with instantiation warning preserved.
   - `HybridAdapter` receives no new usage/callsites.
   - Repository guardrail (lint/check) prohibits adding new `HybridAdapter` callsites.
   - `ai-api-client.ts` remains legacy-only and must not be used by new production call paths.
   - `HttpAdapter` remains the canonical HTTP AI adapter path.

5. **UI call-site rule**
   - Existing UI hooks continue to invoke adapter methods only.
   - No feature-level direct endpoint calls are introduced.

### Failure / Edge Behavior

- If backend returns standardized feature-gated/unsupported responses (`FEATURE_NOT_ENABLED`), adapter surfaces them without fallback to hybrid/local loops.
- If `LocalStorageAdapter` is active, AI methods fail with deterministic offline-unavailable behavior.
- If endpoint payload shape is malformed, adapter returns normalized error (no partial success object leakage).

---

## Acceptance Examples

### AE-01 — HttpAdapter explain/suggest integration is canonical

**Given**
- `HttpAdapter` is active

**When**
- `explainRule` or `suggestExpression` is invoked

**Then**
- Adapter calls canonical `/ai/explain-rule` or `/ai/suggest-expression` endpoint and returns typed results

### AE-02 — HttpAdapter phase-2 methods are implemented with standardized temporary gating

**Given**
- `HttpAdapter` is active

**When**
- `smartFix`, `validateMappings`, and `autoMap` are invoked

**Then**
- Methods route to canonical backend endpoints and do not throw `AdapterMethodNotImplementedError`
- If endpoint capability is temporarily unavailable, adapter surfaces standardized `FEATURE_NOT_ENABLED` behavior

### AE-03 — Local/offline AI behavior is defined and deterministic

**Given**
- `LocalStorageAdapter` is active

**When**
- Any Phase 2 AI method is invoked

**Then**
- Behavior follows one defined offline unsupported policy and is covered by tests

### AE-04 — Legacy hybrid loop is deprecated and frozen (one-cycle retention)

**Given**
- Current adapter exports/bootstrap configuration

**When**
- AI integration path is reviewed

**Then**
- No active production path depends on `HybridAdapter`/legacy direct AI API client loops
- `HybridAdapter` remains deprecated-only, emits warning on instantiation, and new callsites are blocked by lint/check guardrails

### AE-05 — UI call sites remain adapter-based

**Given**
- Mapping AI hooks/components

**When**
- Explain/Suggest/Auto-map flows execute

**Then**
- Calls are made via `ApiAdapter` methods; no direct `fetch()` AI calls are introduced

### AE-06 — API contract coverage exists for all mapped methods

**Given**
- AI endpoint matrix for the methods in scope

**When**
- Contract docs/tests are reviewed

**Then**
- Request/response/error expectations are explicit and aligned with adapter/domain types

---

## Open Questions

- none

---

## Verification Strategy

Automated:
- `HttpAdapter` route-mapping tests for all AI methods (`AE-01`, `AE-02`, `AE-06`).
- `LocalStorageAdapter` offline behavior tests for all AI methods in scope (`AE-03`).
- Regression tests ensuring no `NOT_IMPLEMENTED` placeholders remain for scoped AI methods (`AE-02`).
- Static/code-level checks for adapter-based UI call sites in mapped hooks (`AE-05`).

Quality gates:
- `pnpm --filter @keyra/ui test`
- `pnpm --filter @keyra/ui typecheck`
- `pnpm --filter @keyra/ui lint`

Manual:
- Run Explain/Suggest/Auto-Map flows in HTTP mode and offline mode to verify behavioral parity and expected offline failure semantics (`AE-01`, `AE-03`, `AE-05`).

---

## Task Generation Notes

- This is cross-cutting; split backend/adapter/architecture and UI-surface verification tasks by execution domain.
- Use `Agent: task` for adapter/API contract, local-mode policy, legacy retirement, and architecture updates.
- Use `Agent: ui-task` for UI hook/call-site verification updates where React/UI surface code is touched.
- Include explicit architecture update task because this spec materially updates existing AI integration architecture.

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Q1: temporary pre-backend unavailable endpoint behavior is standardized as `FEATURE_NOT_ENABLED`
  - Resolved Q2: `autoMap(input)` response always includes `rules`; may include optional `diagnostics`, `warnings`, `retrievalMeta`
  - Resolved Q3: `HybridAdapter` retained for one release cycle as deprecated-only; no new callsites, with guardrails to prevent additions
  - Updated proposed behavior, dependencies, failure semantics, and acceptance examples to reflect these decisions

- Rev 1 — 2026-06-02
  - Initial draft
