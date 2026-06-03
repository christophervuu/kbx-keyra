# SPEC

## Title

FS-075 Phase 2 verification, regression, and acceptance gate

---

## ID

FS-075

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

This spec defines the verification and acceptance gate for KeyRa Phase 2 AI features to prove they are safe and do not regress Phase 1 behavior. It establishes deterministic and non-deterministic AI test strategies, a per-feature verification matrix, prompt regression/golden coverage, and explicit safety gates for backend-only AI execution, no-browser-secret exposure, pre-display DSL validation, and no-auto-commit behavior. Success means AI features can only pass acceptance when they satisfy these gates while Phase 1 persistence, schema ingestion, and adapter behavior remain intact.

---

## Problem

Phase 2 AI features are being introduced across multiple surfaces (Explain Rule, Suggest Expression, Smart Fix, AI Validation, Auto-Map), but without a unified verification gate they can drift on safety and regress core platform behavior. Current implementation momentum can accidentally allow unvalidated generated expressions, browser-side secret exposure risks, endpoint-path drift away from canonical backend architecture, or silent mutation of mapping state. The project needs a formal, repeatable acceptance framework that is strict enough to catch regressions before merge/release.

---

## Goal

Define and implement a Phase 2 acceptance gate where:

1. Every AI feature has a documented test plan and acceptance matrix.
2. Prompt behavior is tracked with deterministic golden cases and bounded non-deterministic quality checks.
3. AI calls are enforced as backend-only through canonical Phase 1 backend adapter/API paths.
4. Browser-side secret leakage is prevented by explicit checks.
5. Generated DSL expressions are validated before being shown as apply-ready suggestions.
6. AI suggestions are never auto-committed.
7. Phase 1 persistence, schema ingestion, and adapter flows have non-regression coverage when AI features are enabled.

---

## Assumptions

- Active AI feature specs FS-069 through FS-074 are the primary feature surfaces this gate must cover.
- Canonical adapter + backend direction from FS-068 remains authoritative for UI→backend AI routing.
- Existing test infrastructure (Vitest, backend Lambda tests, integration tests, and Playwright parity) can be extended without introducing a new test framework.
- Phase 1 architecture documents (`backend-api.md`, `persistence-model.md`, `schema-ingestion.md`, `e2e-testing.md`) represent the baseline for non-regression checks.

---

## Current Context

- Architecture index and relevant docs were loaded: `ai-runtime.md`, `backend-api.md`, `persistence-model.md`, `schema-ingestion.md`, `ui-application.md`, `phase-1-readiness.md`, `e2e-testing.md`.
- In-progress AI specs FS-069..FS-074 already define behavior-level requirements, but cross-feature verification is not yet unified as a single acceptance gate.
- Existing architecture already states backend-mediated AI and suggestion-only semantics, but enforcement and regression checks need to be tightened and automated.
- This spec does not introduce a new runtime subsystem; it defines a verification/governance layer across existing subsystems.

---

## Scope

### In Scope

- Define a verification plan per AI feature (Explain, Suggest, Smart Fix, AI Validation, Auto-Map).
- Define deterministic and non-deterministic test strategy split for AI-assisted behavior.
- Add prompt regression/golden-case coverage and maintenance rules.
- Add backend-only enforcement checks for AI endpoint usage.
- Add no-browser-secret checks for AI-related credentials/config.
- Add explicit verification for "generated DSL validated before display/apply-ready state".
- Add explicit verification for "suggestions never auto-committed".
- Add Phase 1 non-regression checks covering persistence model, schema ingestion/query behavior, and adapter mode parity.
- Define acceptance gate pass/fail criteria and required command set for Phase 2 sign-off.

### Out of Scope

- Implementing new AI user features or prompt capabilities.
- Redesigning AI UX surfaces beyond what is needed for testability/assertions.
- Re-architecting backend API routes outside verification enforcement needs.
- Replacing existing CI system/tooling entirely.

---

## Non-Goals

- Guaranteeing semantic perfection of all AI-generated outputs.
- Turning non-deterministic quality checks into strict deterministic correctness proofs.
- Introducing direct browser-to-model invocation under any circumstance.
- Replacing deterministic engine validation with AI evaluation.

---

## Relevant Areas

- `forge/active/FS-069/spec.md`
- `forge/active/FS-070/spec.md`
- `forge/active/FS-071/spec.md`
- `forge/active/FS-072/spec.md`
- `forge/active/FS-073/spec.md`
- `forge/active/FS-074/spec.md`
- `src/lambda/ai/*.ts`
- `src/lib/ai/*`
- `src/engine/dsl/*`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/lib/api/local-storage-adapter.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/features/mappings/hooks/use-suggest-expression.ts`
- `ui/src/features/mappings/hooks/use-auto-map-workspace.ts`
- `ui/src/features/mappings/components/SuggestExpressionInline.tsx`
- `ui/src/features/mappings/components/WorkspaceSuggestionCard.tsx`
- `tests/lambda/ai/*.test.ts`
- `tests/lambda/integration/*.test.ts`
- `tests/lib/persistence/*.test.ts ?`
- `tests/lib/schema/*.test.ts ?`
- `tests/e2e/specs/*.spec.ts ?`
- `.github/workflows/*.yml ?`
- `forge/architecture/ai-runtime.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/e2e-testing.md`
- `forge/architecture/INDEX.md`

---

## Dependencies / Blockers

- Depends on final behavior contracts from active AI specs FS-069..FS-074.
- Depends on FS-068 canonical adapter/backend AI routing decisions staying stable.
- Non-regression checks depend on baseline Phase 1 tests remaining green and maintained.

---

## Constraints

- AI model/runtime invocation must remain backend-only; UI may only call backend APIs through adapter contracts.
- No AI secrets/tokens may be present in browser runtime variables, client bundles, or UI logs.
- Generated DSL suggestion payloads must include validation outcome before being rendered as apply-ready.
- Suggestion generation/refresh/retry/failure paths must never mutate mapping config without explicit accept/apply action.
- Acceptance gate must be executable in CI and reproducible locally.
- Verification must map back to acceptance examples and be explicit about deterministic vs non-deterministic checks.

---

## Proposed Behavior

### User Flow

1. Developer updates or adds a Phase 2 AI feature.
2. Verification pipeline runs the Phase 2 acceptance gate.
3. Gate executes deterministic suites (contract, unit, integration, and regression checks) and non-deterministic AI quality checks.
4. If all required checks pass within defined thresholds, the work is accepted; otherwise it is blocked with clear failure diagnostics.

### System Behavior

1. Maintain a per-feature verification matrix (Explain, Suggest, Smart Fix, AI Validation, Auto-Map) mapping each feature to:
   - deterministic checks
   - prompt goldens
   - non-deterministic quality checks
   - safety gates (backend-only, no-browser-secret, no-auto-commit, validation-before-display)
2. Deterministic strategy includes:
   - API/adapter contract tests
   - Lambda/runtime tests with fixed fixtures/mocks
   - DSL validation gating tests for generated suggestions
   - state-mutation invariant tests
   - Phase 1 regression suites
3. Non-deterministic strategy includes:
   - curated prompt eval set (golden prompts + expected quality rubric)
   - two-stage threshold policy:
     - PR gate: warning budget allows small bounded flake/degradation rate without hard-fail
     - pre-release gate: strict threshold (effectively hard fail unless explicitly waived)
   - drift detection reports across prompt/runtime revisions
   - golden versioning keyed by `promptId + model/runtime tuple`
4. Backend-only enforcement includes static + behavioral checks that fail when:
   - UI imports model SDK or AI runtime internals
   - UI performs direct model endpoint calls
   - AI feature hooks bypass `ApiAdapter`
5. No-browser-secret checks include static scans/build-time checks that fail when:
   - forbidden env vars/secrets are referenced in UI code
   - sensitive tokens appear in generated browser bundles or config surfaces
6. Phase 1 non-regression includes targeted checks proving AI additions do not break:
   - persistence save/load/revision/version invariants
   - schema ingestion/query behavior
   - adapter parity behavior (`localStorage` vs `httpBackend`) for core non-AI flows

### Failure / Edge Behavior

- Deterministic check failure: gate fails hard; change is blocked.
- Non-deterministic check degradation in PR checks: consumes warning budget and is surfaced; budget overflow blocks PR gate.
- Non-deterministic check degradation in pre-release gate: strict threshold violation hard-fails unless explicitly waived.
- Missing golden case for a changed prompt contract: gate fails with required golden-update action.
- Feature lacking mapped verification plan entries: gate fails as incomplete coverage.
- Any detected auto-commit or pre-validation display path: gate fails as safety violation.

---

## Acceptance Examples

### AE-01 — Per-feature verification matrix exists and is executable

**Given**
- Phase 2 AI features in scope (Explain, Suggest, Smart Fix, AI Validation, Auto-Map)

**When**
- The acceptance gate is run

**Then**
- Each feature has a documented and executable deterministic + non-deterministic test plan

### AE-02 — Prompt regression goldens detect unintended behavior drift

**Given**
- A curated prompt golden corpus for AI features

**When**
- Prompt/runtime changes are introduced

**Then**
- Golden checks report drift and block acceptance when results violate defined thresholds
- Golden artifacts are versioned by prompt ID + model/runtime tuple

### AE-03 — Backend-only enforcement prevents browser-side model invocation

**Given**
- UI and adapter code paths for AI features

**When**
- Verification runs backend-only enforcement checks

**Then**
- Any direct browser model/service invocation or adapter bypass fails the gate

### AE-04 — No-browser-secret checks prevent secret leakage in client surfaces

**Given**
- UI source and build artifacts

**When**
- Secret exposure checks are executed

**Then**
- Forbidden AI secret variables/tokens are not present in client code or bundles

### AE-05 — Generated DSL is validated before display as apply-ready suggestion

**Given**
- AI-generated DSL outputs for Suggest/Smart Fix/Auto-Map suggestion surfaces

**When**
- Suggestions are processed for UI display

**Then**
- Validation results are available before apply-ready display, and invalid suggestions are not treated as valid acceptance candidates
- Invalid generated DSL remains visible in a clearly non-applicable diagnostic state for transparency/debugging

### AE-06 — AI suggestions never auto-commit

**Given**
- AI generation lifecycle events (generate, refresh, retry, failure)

**When**
- These events occur without explicit user accept/apply

**Then**
- Mapping config remains unchanged

### AE-07 — Phase 1 persistence/schema/adapter behaviors remain non-regressed

**Given**
- AI features are integrated into the codebase

**When**
- Regression suite runs

**Then**
- Phase 1 persistence, schema ingestion/query, and adapter parity checks pass without AI-induced regressions

---

## Open Questions

- none

---

## Verification Strategy

Deterministic (must-pass):
- Contract tests for AI adapter/backend endpoint mapping (`AE-03`).
- Lambda/runtime tests for generated-DSL validation gating (`AE-05`).
- UI/hook invariants for no-auto-commit (`AE-06`).
- Static checks for backend-only and no-browser-secret policies (`AE-03`, `AE-04`).
- Phase 1 regression suites for persistence/schema/adapter parity (`AE-07`).

Non-deterministic (threshold-gated):
- Prompt golden/eval corpus run with rubric-based scoring and drift diff report (`AE-02`), versioned by prompt ID + model/runtime tuple.
- Stability checks over repeated runs for high-variance prompts.
- PR gate policy: warning budget allows bounded non-deterministic flake/degradation before block.
- Pre-release policy: strict threshold is required; violations hard-fail unless explicitly waived.

Manual:
- Spot-check one end-to-end flow per AI feature against matrix expectations (`AE-01`, `AE-05`, `AE-06`).
- Review drift report for changed prompts and adjudicate expected vs unexpected movement (`AE-02`).

Quality gates (expected command set, final command names TBD):
- typecheck/lint for touched packages
- targeted AI lambda and UI feature test suites
- Phase 1 integration/parity suites
- prompt-golden/eval command
- required PR check (warning-budget mode)
- stricter pre-release gate (hard-fail mode)

---

## Task Generation Notes

- This spec is cross-cutting and requires both `task` and `ui-task` task types.
- Split execution by domain:
  - `task`: verification harness, backend/runtime checks, security checks, CI gate orchestration, architecture updates.
  - `ui-task`: React hook/component-level assertions for validation-before-display and no-auto-commit behavior.
- Include an explicit architecture update task because this spec materially updates verification architecture coverage in existing docs.
- Recommended sequence:
  1. Define verification matrix and deterministic gate scaffolding.
  2. Add prompt golden/non-deterministic eval harness.
  3. Add backend-only + no-browser-secret enforcement checks.
  4. Add UI safety regression checks.
  5. Add Phase 1 non-regression suite integration.
  6. Wire CI acceptance gate and update architecture docs.

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Open Questions Q1–Q4:
    - non-deterministic eval policy set to warning budget in PR checks and strict hard-fail threshold in pre-release gate (unless waived)
    - prompt golden versioning set to prompt ID + model/runtime tuple
    - CI gate location confirmed as both required PR check and stricter pre-release gate
    - invalid generated DSL visibility set to transparent diagnostic display (non-applicable / non-applyable state)
  - Updated System Behavior, Failure/Edge Behavior, Acceptance Examples, and Verification Strategy to encode these decisions
- Rev 1 — 2026-06-02
  - Initial draft
