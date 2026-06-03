# FS-065 — Keep/Replace/Retire Matrix + Migration Plan (T-03)

Created: 2026-06-02  
Spec: FS-065 Rev 2  
Task: T-03

Inputs:
- `forge/active/FS-065/ai-implementation-inventory.md` (T-01)
- `forge/active/FS-065/ai-architecture-drift-matrix.md` (T-02)

---

## 1) Decision Framework

- **Keep**: preserve surface/behavior because it is user-visible or architecturally correct.
- **Replace**: preserve behavior but change implementation path to canonical architecture.
- **Retire**: remove superseded/non-canonical surface to prevent loop reintroduction.

Guardrails from FS-065 Rev 2:
- Canonical `HttpAdapter` must implement `autoMap`, `suggestExpression`, `explainRule`, `smartFix`, `validateMappings`.
- Deferred non-core/experimental methods must return standardized `FEATURE_NOT_ENABLED`.
- No alternate adapter path in production backend mode.
- Schema retrieval target is OpenSearch-first with PK-scoped, gated, instrumented degraded fallback.

---

## 2) Keep / Replace / Retire Matrix

## 2.1 User-facing AI feature surfaces

| Surface | Current State | Decision | Rationale | Drift Link |
|---|---|---|---|---|
| Scalar Suggest UI (`ai-suggest-btn` + inline suggest panel) | Active, user-visible | **Keep** | Valuable user-visible behavior; preserve UX while rerouting backend path | D-01, D-02, D-03 |
| Scalar Explain UI (`ai-explain-btn` + explanation panel) | Active, user-visible | **Keep** | Valuable user-visible behavior; preserve UX while rerouting backend path | D-01, D-02, D-03 |
| Scalar Fix UI (`ai-fix-btn`) | Disabled placeholder | **Replace** | Keep button concept but wire to canonical behavior: either implemented `smartFix` endpoint or explicit `FEATURE_NOT_ENABLED` gate | D-01, D-04 |
| Chain Suggest flow | Active, user-visible | **Keep** | Parity with scalar suggest expectations; route through canonical adapter path | D-01, D-02 |
| Chain Explain flow | Active, user-visible | **Keep** | Parity with scalar explain expectations; route through canonical adapter path | D-01, D-02 |
| Auto-Map workspace (middle panel) | Active primary review mode | **Keep** | Canonical UI review surface for Auto-Map | D-09 |
| Legacy Auto-Map review drawer | Unwired but present/exported | **Retire** | Superseded by workspace; retained code creates loop risk | D-09 |
| Legacy `useAutoMapReview` hook | Exported legacy hook | **Retire** | Superseded by `useAutoMapWorkspace`; avoid accidental reuse | D-09 |

## 2.2 Adapter/client/backend API surfaces

| Surface | Current State | Decision | Rationale | Drift Link |
|---|---|---|---|---|
| `createAdapter()` bootstrap (`HttpAdapter` when `VITE_API_URL`) | Correct canonical selection | **Keep** | Canonical production entrypoint already correct | D-01 |
| `HybridAdapter` class + export | Deprecated but still exported | **Retire** | Alternate adapter path violates single canonical production path constraint | D-02 |
| `ai-api-client` pattern (endpoint helpers) | Exists for subset methods | **Replace** | Keep pattern, extend to full mandatory method set and canonical ownership | D-03 |
| `AdapterMethodNotImplementedError` / `NOT_IMPLEMENTED` for deferred methods | Current deferred behavior | **Replace** | Must standardize to `FEATURE_NOT_ENABLED` gating contract | D-04 |

## 2.3 `ApiAdapter` AI method contract decisions

| Method | Current Path | Decision | Target Outcome | Drift Link |
|---|---|---|---|---|
| `autoMap` | HttpAdapter placeholder | **Replace** | Canonical HttpAdapter backend call implemented | D-01, D-10 |
| `autoMapSection` | Implemented only via HybridAdapter | **Replace** | Canonical HttpAdapter backend call implemented; no Hybrid dependency | D-01, D-02 |
| `suggestExpression` | Implemented only via HybridAdapter | **Replace** | Canonical HttpAdapter backend call implemented | D-01, D-02 |
| `explainRule` | Implemented only via HybridAdapter | **Replace** | Canonical HttpAdapter backend call implemented | D-01, D-02 |
| `smartFix` | HttpAdapter placeholder | **Replace** | Canonical HttpAdapter backend call implemented (or explicitly gated `FEATURE_NOT_ENABLED` if API deferred by approved scope gate) | D-01, D-04 |
| `validateMappings` | HttpAdapter placeholder | **Replace** | Canonical HttpAdapter backend call implemented (or explicitly gated `FEATURE_NOT_ENABLED` if API deferred by approved scope gate) | D-01, D-04 |

## 2.4 Backend AI lambdas/runtime surfaces

| Surface | Current State | Decision | Rationale | Drift Link |
|---|---|---|---|---|
| `explain-rule` lambda | Active thin handler | **Keep** | Aligns with shared runtime model; normalize only where needed | D-08 (minor consistency concern) |
| `suggest-expression` lambda | Active thin handler | **Keep** | Aligns with shared runtime model; normalize only where needed | D-08 (minor consistency concern) |
| `auto-map` lambda handler shape | Contains substantial orchestration logic | **Replace** | Preserve behavior but move non-handler orchestration into reusable/runtime-aligned modules where feasible | D-07 |
| Shared runtime modules (`src/lib/ai/*`) | Canonical foundation | **Keep** | Already architecture-aligned; remain central orchestration path | D-07 |
| AI route IaC posture | Temporarily outside Phase 1 IaC docs | **Keep (interim)** | Allowed by Q2 resolution; requires explicit interim documentation and control | D-11 |

## 2.5 Schema-query and AI dependency surfaces

| Surface | Current State | Decision | Target Outcome | Drift Link |
|---|---|---|---|---|
| `query-schema-nodes` lambda using Dynamo substring filtering | Active path | **Replace** | OpenSearch-first retrieval path; Dynamo fallback only under gated degraded mode | D-05 |
| OpenSearch query module (`searchSchemaNodes`) | Exists, not wired | **Keep + Integrate** | Use as primary query implementation in canonical path | D-05 |
| Degraded fallback contract (PK-scoped + gated + instrumented) | Not explicit | **Replace** | Introduce explicit gating flag/guard + instrumentation + bounded fallback behavior | D-06 |

## 2.6 Local/offline and deferred behavior surfaces

| Surface | Current State | Decision | Rationale | Drift Link |
|---|---|---|---|---|
| Local adapter offline throws (`Not available in offline mode`) | Generic local behavior | **Keep (local mode) + Replace semantics where applicable** | Keep offline behavior but ensure canonical backend-mode deferrals use `FEATURE_NOT_ENABLED` contract | D-12, D-04 |
| Non-core/experimental deferred methods | Not standardized | **Replace** | Standardize gating behavior to `FEATURE_NOT_ENABLED` end-to-end | D-04 |

---

## 3) Explicit Retire Impact Notes

| Retired Surface | User-visible impact | Risk Mitigation |
|---|---|---|
| `AutoMapReviewDrawer` + `useAutoMapReview` legacy path | No user-facing regression expected because workspace is already active route surface | Remove exports/usages in controlled cleanup; keep regression tests on workspace behavior |
| `HybridAdapter` production relevance | No intended user-facing regression in backend mode once HttpAdapter AI coverage is complete | Implement HttpAdapter AI methods first, then remove/lock HybridAdapter path |

---

## 4) Executable Migration Plan

### Phase 0 — Baseline and gating prep (planning hardening)

**Objective:** lock target contracts before code cutover.

- Confirm endpoint contract mapping for mandatory HttpAdapter AI methods:
  - `autoMap`, `suggestExpression`, `explainRule`, `smartFix`, `validateMappings`
- Define standardized deferred response contract:
  - `FEATURE_NOT_ENABLED` shape, status mapping, retryability
- Define degraded-mode controls for query fallback:
  - explicit gate signal
  - instrumentation fields/metrics
  - PK-scoped fallback boundary

**Outputs:** contract notes + test plan skeleton.

---

### Phase 1 — Canonical adapter/client reconciliation (T-04 lead)

**Objective:** eliminate canonical-path dead ends.

1. Extend `HttpAdapter` AI methods to backend calls for mandatory set.
2. Extend/normalize AI HTTP helpers as needed.
3. Replace `NOT_IMPLEMENTED` deferred semantics with `FEATURE_NOT_ENABLED` contract where deferral is explicitly approved.
4. Add/adjust API adapter tests for new canonical routing and gating semantics.

**Dependencies:** Phase 0 contracts finalized.

**Verification gates:**
- Adapter tests prove no mandatory method remains placeholder in backend mode.
- Deferred methods (if any) return standardized `FEATURE_NOT_ENABLED`.

---

### Phase 2 — Remove alternate adapter loops (T-04 + T-05)

**Objective:** enforce single production adapter path.

1. Decouple AI flows from `HybridAdapter` dependency.
2. Retire or lock legacy `HybridAdapter` usage from production-facing exports/paths.
3. Keep compatibility strategy explicit for non-production reference/tests if temporarily retained.

**Dependencies:** Phase 1 complete.

**Verification gates:**
- `createAdapter()` backend mode + UI hooks/components exercise only canonical `HttpAdapter` path.
- No production path relies on `HybridAdapter`.

---

### Phase 3 — Schema query path reconciliation (T-04)

**Objective:** align AI-adjacent retrieval to OpenSearch-first model.

1. Wire OpenSearch query path as primary retrieval for schema query endpoint(s).
2. Implement explicit degraded-mode fallback gate:
   - PK-scoped fallback only
   - fallback usage instrumentation/logging
3. Preserve bounded query behavior and error contract.

**Dependencies:** OpenSearch module availability (already present), endpoint contract finalization.

**Verification gates:**
- Normal path tests assert OpenSearch-first execution.
- Degraded-mode tests assert fallback only when gated and instrumented.

---

### Phase 4 — UI surface cleanup and parity hardening (T-05)

**Objective:** preserve UX while removing stale surfaces.

1. Retire `AutoMapReviewDrawer` + `useAutoMapReview` from active/exported canonical UI path.
2. Ensure suggest/explain/auto-map workspace behaviors remain parity-stable on canonical adapter path.
3. Keep Fix action behavior explicit (implemented or standardized gated response).

**Dependencies:** Phases 1–3 complete or stable enough for UI integration.

**Verification gates:**
- Hook/component regression tests for explain/suggest/automap workspace.
- Manual parity pass for retained user-visible behaviors.

---

### Phase 5 — Documentation and architecture closure (T-06)

**Objective:** freeze reconciled architecture as durable reference.

1. Update architecture docs with canonical path and retired patterns.
2. Document interim AI IaC exception posture explicitly.
3. Document OpenSearch-first + gated fallback contract.
4. Update `forge/architecture/INDEX.md` coverage/last-updated notes.

**Dependencies:** Implementation complete and verified.

**Verification gates:**
- Documentation matches merged implementation (no aspirational mismatch).

---

## 5) Dependency Map (Execution)

- **T-03 outputs required by:** T-04, T-05, T-06
- **T-04 depends on:** decision matrix + migration contracts from T-03
- **T-05 depends on:** canonical adapter/backend behaviors from T-04
- **T-06 depends on:** reconciled implementation state from T-04/T-05

Critical cross-task dependencies:
- Canonical adapter method routing contract (T-04) must stabilize before UI parity assertions (T-05).
- Query-path reconciliation must define degraded-mode instrumentation before architecture finalization (T-06).

---

## 6) Blockers / Risks and Handling

| Risk | Impact | Handling |
|---|---|---|
| Backend endpoint scope mismatch for mandatory methods | Can block canonical adapter completion | Resolve endpoint ownership at Phase 0; gate unresolved endpoints explicitly with `FEATURE_NOT_ENABLED` only if approved |
| HybridAdapter removal breaks legacy tests | Slows migration | Stage removal: first canonical parity, then legacy cleanup/update tests |
| OpenSearch availability/operational gaps | Blocks strict OpenSearch-first runtime | Use explicit degraded-mode gate with instrumentation; do not allow silent fallback |
| Error envelope inconsistencies between AI and shared backend handlers | UI retry/error normalization drift | Define harmonization strategy in T-04 (full align or documented temporary variance + guardrails) |

---

## 7) Verification Gate Matrix

| Gate | Scope | Required Before |
|---|---|---|
| G-01 | Canonical adapter routing tests for mandatory methods | Completing T-04 |
| G-02 | Deferred gating contract tests (`FEATURE_NOT_ENABLED`) | Completing T-04 |
| G-03 | OpenSearch-first + degraded fallback tests/instrumentation checks | Completing T-04 |
| G-04 | UI parity regression tests for retained surfaces | Completing T-05 |
| G-05 | Architecture doc consistency review vs merged code | Completing T-06 |
| G-06 | Lint + typecheck + relevant test suites pass | Marking FS-065 implementation done |

---

## 8) Traceability (Decision → Drift → Spec Goals)

| Decision Cluster | Drift IDs | Spec Goals / AEs |
|---|---|---|
| Canonical HttpAdapter AI implementation | D-01, D-03, D-10 | Goal #4, AE-04, AE-09 |
| Retire alternate adapter path | D-02 | Goal #4, constraints: single canonical adapter path |
| Standardized deferred gating | D-04, D-12 | Goal #3/#4, AE-10 |
| OpenSearch-first retrieval + gated fallback | D-05, D-06 | Goal #4, AE-11 |
| Auto-map handler/runtime shaping | D-07 | Goal #4, architecture consistency |
| Legacy UI surface retirement with parity preservation | D-09 | Goal #5, AE-06 |
| Interim IaC exception with canonical consumption | D-11 | Q2 resolution, AE-04/AE-08 |

---

## 9) Non-goal Compliance Statement

This plan introduces **no new AI capabilities**. All work is reconciliation, canonical routing, legacy-path retirement, and architecture alignment for existing surfaces only.

---

## 10) Execution Readiness Statement

This plan is directly executable and decomposable into T-04 (backend/adapter), T-05 (UI parity + cleanup), and T-06 (architecture updates) without reopening discovery.
