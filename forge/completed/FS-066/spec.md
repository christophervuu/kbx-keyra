# SPEC

## Title

Implement AI backend foundation and shared invocation layer

---

## ID

FS-066

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-02  
Last Updated: 2026-06-02  
Type: backend

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

This spec defines the Phase 2 backend foundation for all KeyRa AI features: a shared Lambda-side AI invocation layer, centralized Tier 1/Tier 2 model routing, unified request/response handling, telemetry, validation, timeout/token controls, and normalized failure semantics. The implementation builds on the existing Phase 1 backend and `src/lib/ai` runtime so explain-rule, natural-language-to-DSL, smart-fix, AI validation, and auto-map all execute through one standard backend path. Success means AI feature handlers become thin endpoint shells with no prompt text hardcoded in handlers and no direct browser-to-model invocation path.

---

## Problem

AI features are currently a mix of showcase-era and partially consolidated paths. Without a strict shared invocation foundation, each endpoint can diverge in model selection, limits, logging, validation, and error behavior. That increases operational risk, slows new feature delivery, and makes cross-feature observability and reliability inconsistent.

Phase 2 needs one canonical backend AI path that all AI endpoints use, with clear constraints and shared controls.

---

## Goal

Deliver a reusable backend AI foundation such that:

1. All AI endpoint handlers invoke a shared AI service layer (no per-handler orchestration duplication).
2. Model selection is centralized with explicit Tier 1/Tier 2 routing rules.
3. Request validation, timeout/token limits, telemetry, and error normalization are standardized.
4. Prompt content is sourced from prompt registry/runtime configuration, not hardcoded in feature handlers.
5. Browser clients only call backend API endpoints; model-provider calls are backend-only.

---

## Assumptions

- Existing AI runtime architecture in `forge/architecture/ai-runtime.md` remains the base subsystem.
- Existing backend API error envelope conventions in `forge/architecture/backend-api.md` remain canonical.
- GitHub Models remains the AI provider in this phase, invoked via OpenAI SDK.
- `PromptRegistry` remains the source of prompt templates/model settings for AI capabilities.
- FS-065 reconciliation work may still be active; this spec defines the foundation expected by that and future AI endpoint implementations.
- Tier routing uses a hybrid configuration model: code-defined defaults/fallbacks with registry metadata overrides when valid.

---

## Current Context

- Architecture coverage already exists for AI runtime (`ai-runtime.md`) and backend error/handler conventions (`backend-api.md`); this spec extends existing architecture rather than introducing a new subsystem.
- The repository has active AI reconciliation work (FS-065), indicating current AI paths still need convergence on canonical backend patterns.
- Existing AI endpoints and handlers exist (explain-rule, suggest-expression, auto-map), but Phase 2 requires a formal shared foundation reusable by additional features (smart-fix, AI validation, broader auto-map flows).
- External docs confirm GitHub Models inference supports model IDs in `{publisher}/{model}` format and structured JSON-schema response format, aligning with current OpenAI SDK integration expectations.

---

## Scope

### In Scope

- Shared backend AI invocation module for Lambda handlers under `src/lib/ai/`.
- Centralized Tier 1/Tier 2 model routing policy and configuration.
- Common AI request validation and response shaping contract for AI endpoints.
- Standardized telemetry/logging contract for AI invocations (correlation, timing, model/tier metadata, outcome).
- Normalized failure mapping from runtime/provider/internal errors to canonical backend API error envelope.
- Standard timeout and token-limit enforcement.
- Handler-level guardrails requiring prompt registry/runtime-driven prompts (no hardcoded prompt text in feature handlers).
- Repo-level guardrail(s) to prevent direct model-provider usage from browser code paths.
- Test coverage for routing, limits, error normalization, and handler contract reuse.
- Architecture documentation update task for existing docs.

### Out of Scope

- New AI product features or UX expansion.
- Prompt authoring UI or prompt lifecycle management tooling.
- Non-GitHub-Models provider abstraction.
- Full IaC rollout changes for all AI routes.
- Large-scale RAG redesign beyond current architecture direction.

---

## Non-Goals

- Replacing the existing AI runtime subsystem with a new subsystem.
- Implementing browser-side AI inference.
- Tuning prompt content quality for individual features.
- Redesigning frontend AI surfaces.

---

## Relevant Areas

- `src/lib/ai/*`
- `src/lambda/ai/*`
- `src/lambda/shared/*`
- `src/lambda/shared/response.ts`
- `src/lambda/shared/errors.ts`
- `ui/src/lib/api/*` (contract verification only; no UI feature redesign)
- `tests/lib/ai/*`
- `tests/lambda/ai/*`
- `forge/architecture/ai-runtime.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/phase-1-readiness.md`

---

## Dependencies / Blockers

- Architecture baseline docs: `ai-runtime.md`, `backend-api.md`, `phase-1-readiness.md`.
- Coordination with FS-065 if overlapping files are touched in parallel.
- Prompt registry records for targeted features must exist when endpoint implementations are executed.

---

## Constraints

- AI model calls must occur only in backend runtime (API Gateway → Lambda).
- Feature handlers must remain thin and must not embed prompt text.
- Shared foundation must preserve Phase 1 backend error envelope conventions.
- Tier routing must be centrally configurable and deterministic.
- Per-invocation timeout and token limits must be enforceable and observable.
- Structured outputs and response parsing must remain strict enough to normalize downstream failures consistently.
- TypeScript strict mode and existing lint/test gates must remain green.
- Initial tier defaults are fixed for Rev 2: Tier 1 (`openai/gpt-4.1-mini`) timeout 20s and max output tokens 1200; Tier 2 (`openai/gpt-4.1`) timeout 45s and max output tokens 2500.
- Feature-specific limit/model overrides are allowed only through an explicit allowlisted config table in shared backend configuration (never ad hoc handler constants).

---

## Proposed Behavior

### User Flow

1. User-triggered AI actions (explain, suggest, smart-fix, validation, auto-map) call backend API endpoints.
2. Backend endpoint handlers validate request shape, resolve feature invocation profile, and delegate to shared AI invocation layer.
3. Handler returns normalized success payload or standardized error envelope.

### System Behavior

1. **Shared invocation API**: a single backend-internal invocation contract accepts a feature identifier, request payload, correlation metadata, and execution options.
2. **Tier routing**: invocation profile resolves Tier 1 vs Tier 2 centrally via a hybrid model: code defaults/fallbacks plus registry metadata override when valid; invalid/missing registry override always falls back to code defaults.
3. **Prompt source policy**: shared layer loads prompt definitions through prompt registry/runtime adapters; handler files do not carry prompt literals.
4. **Validation contract**: shared validators enforce required request fields, payload bounds, and invocation preconditions before model call.
5. **Limits contract**: shared layer applies timeout budget and token caps per tier/feature profile using Rev 2 defaults (Tier 1: 20s/1200, Tier 2: 45s/2500) with optional feature overrides only from an allowlisted shared config table.
6. **Telemetry contract**: every invocation emits structured logs/events including requestId/correlationId, feature, tier, model, timeout, token cap, latency, status, and normalized error code when failed.
7. **Error normalization**: provider/runtime/parsing failures map into canonical backend API error envelope codes/status (including transient vs non-transient classification).
8. **Browser-call guardrail**: repository policy/config enforces both ESLint `no-restricted-imports` and a path-based static check to block direct model SDK imports and forbidden provider domains in browser/client bundle paths.

### Failure / Edge Behavior

- Missing/invalid AI request payload returns standardized `VALIDATION_ERROR` with consistent shape.
- Prompt lookup failure maps to deterministic not-found/config error path (not raw provider errors).
- Provider timeout/rate-limit/auth/network/parsing failures map to normalized error codes; handlers do not leak provider-specific raw envelopes.
- Limit breaches (token/time budget) return normalized failure codes and are logged with tier/feature context.
- If invocation profile for a feature is missing/misconfigured, request fails fast with standardized internal/config error classification.

---

## Acceptance Examples

### AE-01 — Shared invocation path used by AI handlers

**Given**
- AI handlers for explain-rule, suggest-expression, and auto-map section invocation

**When**
- Requests reach the handlers

**Then**
- Handlers delegate through the shared invocation layer and do not implement bespoke model orchestration logic

### AE-02 — Tier routing resolves centrally

**Given**
- Feature profiles for Tier 1 and Tier 2 AI tasks

**When**
- Shared invocation resolves a feature execution profile

**Then**
- Model/tier selection comes from centralized routing config and is consistent across handlers

### AE-03 — Timeout and token limits enforced

**Given**
- A feature profile with defined timeout and token caps

**When**
- Invocation executes and reaches limit boundaries

**Then**
- Limits are applied by the shared layer and resulting failures are normalized

### AE-09 — Hybrid routing fallback safety

**Given**
- A feature with code-default tier/model profile and optional registry override metadata

**When**
- Registry override is missing or invalid

**Then**
- Shared invocation deterministically falls back to code defaults and continues with canonical routing behavior

### AE-10 — Tier defaults and allowlisted overrides

**Given**
- Tier 1 and Tier 2 baseline limits are configured in shared AI foundation

**When**
- Invocation profile resolves limits for baseline and feature-specific cases

**Then**
- Baseline defaults are Tier 1 `openai/gpt-4.1-mini` at 20s/1200 and Tier 2 `openai/gpt-4.1` at 45s/2500
- Feature-specific overrides apply only when present in an allowlisted shared config table

### AE-04 — Prompt text not hardcoded in handlers

**Given**
- AI feature handlers under `src/lambda/ai/`

**When**
- Handler code is reviewed and tested

**Then**
- Handler files contain no prompt template literals and obtain prompt content via shared runtime/registry path

### AE-05 — Telemetry contract consistency

**Given**
- Successful and failed AI requests across multiple endpoints

**When**
- Logs/telemetry are emitted

**Then**
- Each event contains standardized AI invocation metadata and outcome fields

### AE-06 — Error normalization consistency

**Given**
- Provider errors, parsing errors, config errors, and validation errors

**When**
- Shared invocation returns failure

**Then**
- Endpoint responses use canonical backend error envelope and stable error-code mapping

### AE-07 — Browser cannot directly invoke model provider

**Given**
- UI/browser code paths under `ui/`

**When**
- Static checks and tests run

**Then**
- Direct model-provider client usage/import patterns are blocked and backend API path remains the only allowed AI access path

### AE-11 — Dual guardrail enforcement in browser paths

**Given**
- Browser/client code paths under `ui/`

**When**
- Lint and static policy checks run

**Then**
- ESLint restricted-import rules block model SDK imports
- Path-based static checks block forbidden provider-domain and import patterns in client bundle paths

### AE-08 — Foundation reusable by Phase 2 AI endpoints

**Given**
- Existing and planned AI endpoints (explain-rule, nl-to-dsl, smart-fix, AI validation, auto-map)

**When**
- Endpoint wiring follows the foundation

**Then**
- Shared request/response/logging/error/limit contracts are reused without per-feature redefinition

---

## Open Questions

- none

---

## Verification Strategy

Automated:
- Unit tests for shared invocation profile resolution and fallback (`AE-01`, `AE-02`, `AE-08`, `AE-09`).
- Unit tests for limit enforcement/defaults/allowlisted override behavior and failure normalization (`AE-03`, `AE-06`, `AE-10`).
- Unit tests for prompt-source enforcement and handler thinness checks (`AE-04`).
- Unit/integration tests for telemetry field contract coverage (`AE-05`).
- Static/lint checks preventing browser-side direct model client usage with dual enforcement (`AE-07`, `AE-11`).
- Regression tests on existing AI handlers to ensure canonical envelope and behavior consistency (`AE-01`, `AE-06`).

Quality gates:
- `pnpm typecheck`
- `pnpm lint`
- targeted `vitest` suites for `tests/lib/ai/*` and `tests/lambda/ai/*`

Manual:
- Validate logs include correlation and tier/model metadata for representative success/failure invocations.

---

## Task Generation Notes

- This is backend-focused work; all tasks should be `Agent: task`.
- Sequence should establish contracts first, then implementation, then endpoint adoption, then verification/documentation.
- Include an explicit architecture update task because this spec materially updates existing AI/backend architecture docs.
- Keep endpoint handlers thin; avoid embedding feature-specific orchestration in handler files.
- Guardrail tasks should enforce backend-only AI invocation as a durable repository policy.

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Q1: Tier routing model is hybrid (code defaults/fallbacks + registry override)
  - Resolved Q2: Initial tier defaults set to Tier 1 `openai/gpt-4.1-mini` 20s/1200 and Tier 2 `openai/gpt-4.1` 45s/2500
  - Resolved Q2 addendum: feature-specific overrides allowed only via allowlisted shared config table (not handler-local)
  - Resolved Q3: browser guardrail is dual enforcement (ESLint restricted imports + path-based static checks)
  - Added AE-09, AE-10, AE-11 to make decisions verifiable

- Rev 1 — 2026-06-02
  - Initial draft
