# SPEC

## Title

Implement KeyRa AI “Explain Rule” feature (Phase 2 canonical path)

---

## ID

FS-069

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

This spec introduces the first low-risk, user-facing Phase 2 AI feature: Explain Rule. A user can select an existing DSL rule and request a concise, plain-English explanation generated through the backend AI pipeline using prompt registry and structured output contracts. The explanation is presented as generated assistance in the UI and must never mutate or persist mapping rule content.

---

## Problem

Users currently see DSL expressions but do not have a fast, in-product way to understand what a selected rule does in plain language. This slows review, onboarding, and confidence-building in mapping authoring. Existing AI infrastructure and UI hooks are partially present across prior specs, but Explain Rule must now be defined as a canonical, production-ready flow that is safe (read-only), resilient to invalid DSL, and clearly labeled as assistance.

---

## Goal

Deliver a production-ready Explain Rule capability where:

1. Selecting a rule and invoking Explain returns a concise plain-English explanation.
2. Invalid or incomplete DSL input still yields a graceful explanation path or useful failure messaging.
3. The feature is strictly read-only: no rule edits, no side effects, no persistence of explanation as mapping content.
4. The runtime path is canonical Phase 2 backend AI (prompt registry + structured output contract), not legacy shortcut paths.

---

## Assumptions

- Existing AI runtime architecture in `forge/architecture/ai-runtime.md` remains the foundation.
- Explain Rule endpoint path remains `/ai/explain-rule` unless changed by aligned in-progress specs.
- Prompt registry and structured output contracts from FS-066/FS-067 are either available or completed before final implementation.
- Mapping editor rule selection and explain affordance already exist in some form and can be hardened rather than redesigned.
- AI output remains suggestion/assistance only and is not auto-applied to mapping rules.

---

## Current Context

- Architecture coverage exists for AI runtime (`ai-runtime.md`), backend error/handler conventions (`backend-api.md`), and UI feature composition (`ui-application.md`).
- Explain Rule currently appears in prior showcase lineage and active reconciliation work (`FS-065`, `FS-068`), with known legacy-path drift (HybridAdapter / not-implemented placeholders) still being reconciled.
- In-progress specs FS-066/FS-067/FS-068 define canonical backend foundation, prompt/structured contracts, and adapter integration that this feature should consume rather than bypass.
- Existing active work indicates Explain Rule is already recognized as a retained user-visible feature and a good candidate for first production AI slice due to low operational risk.

---

## Scope

### In Scope

- User-triggered Explain Rule action for a selected DSL rule in Mapping Editor surfaces.
- Backend explain-rule invocation via canonical AI runtime path using prompt registry and structured output validation.
- UI presentation of explanation text as generated assistance (clear labeling/disclaimer).
- Read-only guarantees: explanation action does not modify expressions, rule order, draft state, or persisted mapping data.
- Graceful behavior for invalid DSL or malformed requests (best-effort explanation or clear actionable error state).
- Automated and manual verification for feature flow and non-mutation guarantees.

### Out of Scope

- New AI capabilities beyond Explain Rule (suggest, smart-fix, auto-map expansion, AI validation enhancements).
- Prompt authoring tooling or admin workflows.
- Large redesign of mapping editor layout.
- Persisting explanations to mapping metadata/history.
- Model/provider changes beyond existing runtime contracts.

---

## Non-Goals

- Automatically rewriting DSL based on explanation.
- Converting Explain Rule into a rule-quality validator.
- Introducing browser-direct model calls or alternate adapter paths.
- Expanding feature scope into multi-rule/bulk explanation in this iteration.

---

## Relevant Areas

- `src/lambda/ai/explain-rule.ts`
- `src/lib/ai/invoke-ai.ts`
- `src/lib/ai/output-parser.ts`
- `src/lib/ai/prompt-registry.ts`
- `src/lambda/shared/response.ts`
- `src/lambda/shared/errors.ts`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/features/mappings/hooks/use-explain-rule.ts`
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/ExplanationPanel.tsx ?`
- `tests/lambda/ai/explain-rule.test.ts`
- `ui/src/features/mappings/hooks/use-explain-rule.test.ts`
- `ui/src/features/mappings/components/ScalarFieldBuilder.test.tsx`
- `forge/architecture/ai-runtime.md`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- Depends on alignment with active specs:
  - FS-066 (shared AI backend foundation)
  - FS-067 (prompt registry + structured output contracts)
  - FS-068 (canonical HttpAdapter AI integration)
- If these specs change endpoint contract or prompt ID naming, this spec’s tasks must be reviewed for drift before execution.

---

## Constraints

- Explanation generation must run through backend AI pipeline only.
- Prompt source must come from prompt registry/runtime configuration (no hardcoded prompt text in UI).
- Structured output validation must gate success responses.
- Explanation text must be concise and user-friendly.
- Explanation must be clearly presented as generated assistance, not authoritative persisted mapping content.
- No mutation of mapping rule expression/content/order as a side effect of explain action.
- Error handling must use canonical backend envelope / UI normalization patterns.
- Explanation must be 1–2 sentences, target ≤ 320 characters (soft limit), hard cap approximately 120 tokens.
- Response contract may include optional metadata fields: `confidence` (string) and `limitations[]` (string array). UI may initially render only the explanation text and hide these fields.

---

## Proposed Behavior

### User Flow

1. User selects a rule in the Mapping Editor.
2. User invokes **Explain**.
3. UI sends the selected rule context (at minimum expression and target path/context) through `ApiAdapter.explainRule`.
4. Backend returns a structured explanation result.
5. UI renders the explanation in an inline/panel surface with clear generated-assistance labeling.
6. User may dismiss/re-run explain; underlying rule remains unchanged.

### System Behavior

1. Explain requests route through canonical adapter → backend endpoint (`/ai/explain-rule`) → shared AI runtime.
2. Runtime resolves explain prompt via prompt registry and uses structured output schema for response format/validation.
3. Success response includes explanation text in expected contract shape.
4. UI state machine handles idle/loading/success/error transitions and does not perform any rule mutation operations.
5. Explanation output is transient UI assistance (not written into mapping config/persistence artifacts).

### Failure / Edge Behavior

- If DSL is invalid or partially invalid, backend attempts best-effort graceful explanation first (e.g., describing likely intent or parsing available fragments). Deterministic failure occurs only when no meaningful fragment can be extracted from the expression.
- If backend returns validation/provider/config errors, UI shows user-friendly error messaging and allows retry.
- If request lacks required fields (e.g., expression), request fails deterministically with validation error.
- On any failure path, rule content and mapping state remain unchanged.

---

## Acceptance Examples

### AE-01 — User selects rule and gets explanation

**Given**
- A mapping with at least one selectable DSL rule

**When**
- The user selects the rule and invokes Explain

**Then**
- The user sees a concise plain-English explanation generated by the backend AI pipeline

### AE-02 — Invalid DSL handled gracefully

**Given**
- A selected rule with invalid or partially invalid DSL expression

**When**
- The user invokes Explain

**Then**
- The system returns either a graceful best-effort explanation or a useful user-facing failure message
- No unhandled/opaque error is shown

### AE-03 — Explain action never mutates rule content

**Given**
- A selected rule with known expression text and mapping draft state

**When**
- Explain succeeds or fails

**Then**
- The expression text, rule structure/order, and persistence state remain unchanged

### AE-04 — Explanation is clearly labeled generated assistance

**Given**
- An explanation result is shown in the UI

**When**
- The user reads the explanation panel/section

**Then**
- The UI clearly indicates the text is AI-generated assistance and not persisted mapping content

### AE-05 — Canonical prompt/structured-contract path is used

**Given**
- Explain Rule backend invocation executes

**When**
- Request/response path is observed in tests/logs

**Then**
- Prompt is resolved from prompt registry and structured output validation gates success response

---

## Open Questions

- none

---

## Verification Strategy

Automated:
- Backend handler/runtime tests for explain success and structured-output validation (`AE-01`, `AE-05`).
- Backend tests for invalid DSL graceful handling / failure mapping (`AE-02`).
- UI hook/component tests for explain lifecycle and clear assistance labeling (`AE-01`, `AE-04`).
- Non-mutation tests comparing pre/post rule state for both success and failure paths (`AE-03`).

Manual:
- In Mapping Editor, run explain on valid and invalid rule samples; confirm result quality and user-facing error behavior (`AE-01`, `AE-02`).
- Verify explanation panel copy explicitly denotes generated assistance and no save/apply action is implied (`AE-04`).
- Confirm repeated explain runs do not alter rule expression or unsaved-change counters (`AE-03`).

Quality gates:
- `pnpm typecheck`
- targeted backend tests for `tests/lambda/ai/explain-rule*`
- targeted UI tests for explain hook/component surfaces

---

## Task Generation Notes

- This is cross-cutting work and must be split by domain.
- Backend/runtime/architecture tasks use `Agent: task`.
- UI behavior/presentation tasks use `Agent: ui-task`.
- Include an explicit architecture update task because this spec changes behavior/constraints inside existing AI runtime and UI architecture docs.
- Sequence should reduce risk: backend contract + tests first, then UI integration/hardening, then architecture update.

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Q1: "concise" = 1–2 sentences, target ≤ 320 chars (soft), hard cap ~120 tokens
  - Resolved Q2: invalid DSL → best-effort graceful explanation first; deterministic failure only when unparsable
  - Resolved Q3: optional `confidence`/`limitations[]` fields in response contract; UI may hide initially
  - Added corresponding constraints and failure-bullet updates
- Rev 1 — 2026-06-02
  - Initial draft
