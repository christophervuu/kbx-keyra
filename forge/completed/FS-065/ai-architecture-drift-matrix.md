# FS-065 — AI Architecture Drift Matrix (T-02)

Created: 2026-06-02  
Spec: FS-065 Rev 2  
Task: T-02

---

## Purpose

Identify architecture drift, loops, and bypass risks between current implementation and the Phase 1 backend model, using:

- `forge/architecture/ai-runtime.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/phase-1-readiness.md`
- `forge/architecture/schema-ingestion.md`
- `forge/architecture/persistence-model.md`
- `forge/active/FS-065/ai-implementation-inventory.md`

This artifact is decision-neutral (no keep/replace/retire assignments).

---

## Risk Levels

- **High**: blocks canonical path adoption, can misroute future work, or violates FS-065 Rev 2 hard constraints.
- **Medium**: architectural inconsistency likely to cause drift/rework but not immediate hard blocker.
- **Low**: cleanup/documentation mismatch with bounded short-term impact.

## Disposition Categories

- **Must-fix for reconciliation**
- **Documented defer with guardrails**

---

## Drift Matrix

| ID | Finding | Conflicting Architecture Rule / Spec Constraint | Concrete Impacted Paths | Runtime Path / Loop Risk | Risk | Disposition |
|---|---|---|---|---|---|---|
| D-01 | Canonical backend mode (`VITE_API_URL` set) selects `HttpAdapter`, but core AI methods are still placeholders (`NOT_IMPLEMENTED`). | FS-065 Rev 2 requires canonical `HttpAdapter` implementations for `autoMap`, `suggestExpression`, `explainRule`, `smartFix`, `validateMappings` (AE-09). `phase-1-readiness.md` AI transition path calls for full AI contract expansion. | `ui/src/lib/api/bootstrap.ts`, `ui/src/lib/api/http-adapter.ts`, `ui/src/lib/api/types.ts` | Primary runtime path dead-ends for core AI calls; canonical path cannot currently serve retained AI behavior. | High | Must-fix for reconciliation |
| D-02 | Legacy `HybridAdapter` still carries live AI HTTP routing for explain/suggest/autoMapSection while not bootstrap-selected. | `ui-application.md` marks `HybridAdapter` deprecated and non-bootstrap-selected; FS-065 requires single canonical production adapter path (no alternate adapter paths). | `ui/src/lib/api/hybrid-adapter.ts`, `ui/src/lib/api/index.ts`, `ui/src/lib/api/__tests__/hybrid-adapter.test.ts` | Split-path loop risk: canonical runtime (`HttpAdapter`) differs from legacy working path (`HybridAdapter`), encouraging accidental reuse of deprecated path. | High | Must-fix for reconciliation |
| D-03 | AI HTTP client coverage is partial: only explain/suggest/autoMapSection helpers exist. | FS-065 Rev 2 mandatory method set includes `autoMap`, `smartFix`, `validateMappings` on canonical adapter path. | `ui/src/lib/api/ai-api-client.ts` | Coverage gap pushes implementations toward ad-hoc patterns or leaves methods unimplemented in canonical route. | High | Must-fix for reconciliation |
| D-04 | Deferred-method error model is `NOT_IMPLEMENTED` (`AdapterMethodNotImplementedError`), not standardized `FEATURE_NOT_ENABLED`. | FS-065 Rev 2 requires explicit feature gating with standardized `FEATURE_NOT_ENABLED` for deferred non-core/experimental methods (AE-10). | `ui/src/lib/api/errors.ts`, `ui/src/lib/api/http-adapter.ts`, `ui/src/lib/api/http-adapter.test.ts`, `ui/src/lib/api/bootstrap.test.ts` | Ambiguous semantics between “not yet implemented” vs explicitly gated feature availability. | High | Must-fix for reconciliation |
| D-05 | Active schema query handler uses DynamoDB PK query + in-memory substring filtering; OpenSearch query module exists but is not wired into runtime path. | FS-065 Rev 2 requires OpenSearch-first retrieval with constrained degraded fallback (AE-11). `schema-ingestion.md` query architecture documents OpenSearch multi-match path. | `src/lambda/schema/query-schema-nodes.ts`, `src/lib/schema/opensearch/query.ts`, `src/lambda/schema/index.ts` | Search-path divergence: designed OpenSearch retrieval exists, but active endpoint stays on non-OpenSearch path. | High | Must-fix for reconciliation |
| D-06 | No explicit degraded-mode gating/instrumentation contract exists for schema-query fallback behavior. | FS-065 Rev 2 requires fallback to be PK-scoped, explicitly degraded-mode gated, and instrumented (AE-11). | `src/lambda/schema/query-schema-nodes.ts`, `src/lib/schema/opensearch/query.ts`, related handler/util logging surfaces | Fallback behavior is implicit/non-contractual; cannot distinguish normal vs degraded operations in a controlled way. | High | Must-fix for reconciliation |
| D-07 | Auto-map lambda contains substantial handler-level logic (deduping, target-list parsing, expression validation, normalization), not strictly thin-shell pattern. | `ai-runtime.md` design principle: AI lambdas should be thin shells around `invokeAI()`. | `src/lambda/ai/auto-map.ts` | Handler-level orchestration increases divergence risk from shared runtime conventions and consistency guarantees. | Medium | Must-fix for reconciliation |
| D-08 | AI lambda responses use local `jsonResponse` shape and do not use backend shared response/error envelope helpers with request correlation IDs. | `phase-1-readiness.md` calls for standardized backend error normalization; `backend-api.md` defines canonical envelope/`requestId` contract for backend surfaces (AI currently documented separately). | `src/lambda/ai/explain-rule.ts`, `src/lambda/ai/suggest-expression.ts`, `src/lambda/ai/auto-map.ts`, `src/lambda/shared/response.ts`, `src/lambda/shared/errors.ts` | Error-model inconsistency risk across backend surfaces and UI error/retry handling assumptions. | Medium | Documented defer with guardrails *(if not brought in-scope for T-04)* |
| D-09 | UI codebase still exports legacy Auto-Map review hook/component while route now uses workspace hook/component only. | `ui-application.md` describes FS-048 workspace model replacing drawer composition; single canonical UI path reduces drift. | `ui/src/features/mappings/hooks/use-auto-map-review.ts`, `ui/src/features/mappings/components/AutoMapReviewDrawer.tsx`, `ui/src/features/mappings/hooks/index.ts`, `ui/src/routes/pages/MappingEditor.tsx` | Legacy surface can be accidentally reused, reintroducing superseded AI review flow. | Medium | Must-fix for reconciliation |
| D-10 | `ApiAdapter` includes both `autoMap` and `autoMapSection`, but active UI flow invokes only section mode; whole-map path has no canonical behavior. | FS-065 Rev 2 mandates canonical `autoMap` implementation on `HttpAdapter`; `phase-1-readiness.md` identifies unresolved full-section vs whole-mapping semantics. | `ui/src/lib/api/types.ts`, `ui/src/lib/api/http-adapter.ts`, `ui/src/features/mappings/hooks/use-auto-map-workspace.ts` | Contract drift risk: method exists in boundary but has no active canonical runtime semantics. | Medium | Must-fix for reconciliation |
| D-11 | IaC/route ownership for AI remains outside core Phase 1 route-table documentation. | `backend-api.md` explicitly excludes AI endpoints (covered in `ai-runtime.md`); FS-065 Q2 resolution allows interim IaC exception but mandates canonical backend API consumption. | `forge/architecture/backend-api.md`, `forge/architecture/ai-runtime.md`, deployment/IaC references | Documentation split can cause operational ambiguity if not explicitly tracked as interim model. | Low | Documented defer with guardrails |
| D-12 | Local adapter AI behavior is generic offline throw (`Not available in offline mode`) without feature-specific gating semantics. | `phase-1-readiness.md` flags mixed/heterogeneous error handling as a Phase 1 concern; FS-065 standardized gating requirement applies to deferred canonical surfaces. | `ui/src/lib/api/local-storage-adapter.ts` | Low immediate risk in offline mode, but increases inconsistency when testing parity between local/canonical modes. | Low | Documented defer with guardrails |

---

## Loop / Bypass Patterns Called Out Explicitly

1. **Canonical-vs-legacy adapter loop**
   - Canonical path: `createAdapter()` → `HttpAdapter` (backend mode)
   - Legacy path: `HybridAdapter` + `ai-api-client` helpers for explain/suggest/autoMapSection
   - Risk: “working” behavior exists only on non-canonical path, incentivizing bypass.

2. **Query-path split loop**
   - Designed path exists: `src/lib/schema/opensearch/query.ts`
   - Active path remains: `src/lambda/schema/query-schema-nodes.ts` Dynamo substring filtering
   - Risk: implementation evolves away from documented retrieval architecture.

3. **UI review-surface split loop**
   - Active: Auto-Map workspace (`useAutoMapWorkspace`, `AutoMapWorkspace`)
   - Legacy retained/exported: `useAutoMapReview`, `AutoMapReviewDrawer`
   - Risk: future changes may accidentally target stale surface.

---

## Feature-Gating Conformance Snapshot (`FEATURE_NOT_ENABLED`)

Current state:

- Canonical deferred-path errors use `NOT_IMPLEMENTED` (`AdapterMethodNotImplementedError`) rather than `FEATURE_NOT_ENABLED`.
- No unified feature-gating contract identified for deferred non-core/experimental AI methods.

Conformance status: **Not compliant with FS-065 Rev 2 gating requirement**.

---

## OpenSearch-First Conformance Snapshot

Current state:

- OpenSearch query capability exists (`searchSchemaNodes`), but active schema query handler does not use it.
- No explicit degraded-mode gate + instrumentation contract found for fallback pathing.

Conformance status: **Not compliant with FS-065 Rev 2 OpenSearch-first + gated fallback requirement**.

---

## Traceability Check (High-Risk Items)

High-risk items and direct code traceability:

- D-01 → `ui/src/lib/api/bootstrap.ts`, `ui/src/lib/api/http-adapter.ts`
- D-02 → `ui/src/lib/api/hybrid-adapter.ts`, `ui/src/lib/api/index.ts`
- D-03 → `ui/src/lib/api/ai-api-client.ts`, `ui/src/lib/api/http-adapter.ts`
- D-04 → `ui/src/lib/api/errors.ts`, `ui/src/lib/api/http-adapter.ts`
- D-05 → `src/lambda/schema/query-schema-nodes.ts`, `src/lib/schema/opensearch/query.ts`
- D-06 → `src/lambda/schema/query-schema-nodes.ts`, `src/lib/schema/opensearch/query.ts`

All high-risk findings are mapped to concrete files and runtime paths.

---

## Readiness for T-03

This drift matrix is sufficient to drive T-03 keep/replace/retire decisioning and migration sequencing without reopening discovery.
