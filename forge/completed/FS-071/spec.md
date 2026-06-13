# SPEC

## Title

Implement AI feature: Smart Fix for rule diagnostics

---

## ID

FS-071

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

This spec defines a production-ready Smart Fix flow for mapping rules that fail validation or execution diagnostics. From a rule-level diagnostic, users can invoke AI assistance that sends failing expression context (including stable diagnostic codes/messages and schema context) to the backend AI pipeline and receives a corrected DSL suggestion with a clear before/after explanation. The result is presented as a suggestion-only artifact with explicit accept/edit/dismiss actions, and accepted changes are re-validated immediately.

---

## Problem

When rules produce diagnostics, users must manually interpret error details and rewrite DSL expressions, which creates friction and slows correction cycles. Existing AI integration groundwork exists, but Smart Fix is not yet defined as a canonical end-to-end flow with deterministic diagnostic payloads, backend-owned context assembly, and post-acceptance validation behavior. Without this, correction workflows remain manual and inconsistent.

---

## Goal

Deliver a canonical Smart Fix workflow where:

1. Users can trigger AI assistance directly from a rule diagnostic.
2. Backend receives failing expression, stable error code(s), error message(s), and relevant source/target schema context.
3. AI returns a corrected DSL suggestion plus explanation of what changed.
4. UI presents suggestion with explicit Accept, Edit, and Dismiss actions (no auto-apply).
5. Accepted suggestion is re-validated immediately and surfaces validation outcome.

---

## Assumptions

- Existing AI runtime (`src/lib/ai/*`) remains the canonical orchestration path for Smart Fix.
- `smart-fix` is an intended backend AI endpoint in the active architecture direction (currently not fully implemented).
- Rule diagnostics already expose stable code + message metadata suitable for backend payload construction.
- Mapping Editor already has rule selection/diagnostic surfaces that can host Smart Fix invocation without major layout redesign.
- Smart Fix remains suggestion-only and does not persist automatically without explicit save/version actions.

---

## Current Context

- Architecture index and relevant docs (`ai-runtime.md`, `backend-api.md`, `ui-application.md`, `mapping-engine.md`) were loaded before drafting.
- Active related specs include:
  - `FS-068` (canonical adapter AI integration; includes smart-fix method routing intent)
  - `FS-069` (Explain Rule)
  - `FS-070` (NL -> DSL suggestion)
- `ui/src/lib/types/domain.ts` currently defines `SmartFixInput`/`SmartFixResult` as coarse types (`mappingId + diagnostics` -> `updatedRules`), which does not match rule-level review UX or before/after explanation requirements.
- `ui/src/lib/api/http-adapter.ts` currently throws `AdapterMethodNotImplementedError` for `smartFix`.
- Existing architecture docs cover AI runtime/backend/UI subsystems; this spec extends those subsystems and does not introduce a brand-new architecture domain.

---

## Scope

### In Scope

- Rule-level Smart Fix trigger from diagnostic context in Mapping Editor.
- Smart Fix request/response contract for canonical backend endpoint.
- Backend assembly of Smart Fix prompt variables including failing expression, stable diagnostic metadata, and schema context.
- AI-generated corrected expression plus explanation of changes.
- Engine validation of Smart Fix suggestion before backend success response.
- UI review flow with explicit accept/edit/dismiss semantics.
- Immediate re-validation after user accepts/applies Smart Fix suggestion.
- Automated/manual verification for success, invalid-suggestion, and failure flows.

### Out of Scope

- Full auto-map generation or section-level bulk correction.
- Auto-applying Smart Fix suggestions without explicit user action.
- Prompt authoring/admin interfaces.
- New model providers or direct browser model invocation.
- Persistence workflow redesign (save/version/deploy semantics).

---

## Non-Goals

- Guaranteeing every diagnostic can be fixed correctly in one AI pass.
- Replacing manual DSL editing entirely.
- Introducing multi-rule batch Smart Fix in this iteration.
- Changing mapping engine diagnostic code taxonomy.

---

## Relevant Areas

- `src/lambda/ai/smart-fix.ts`
- `src/lib/ai/invoke-ai.ts`
- `src/lib/ai/output-parser.ts`
- `src/lambda/shared/errors.ts`
- `src/lambda/shared/response.ts`
- `src/lambda/mapping/get-mapping.ts ?`
- `src/lambda/schema/query-schema-nodes.ts ?`
- `src/engine/dsl/index.ts`
- `ui/src/lib/types/domain.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/features/mappings/hooks/use-mapping-editor.tsx ?`
- `ui/src/features/mappings/hooks/use-dsl-validation.ts`
- `ui/src/features/mappings/hooks/use-smart-fix.ts ?`
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/RuleList.tsx ?`
- `ui/src/features/mappings/components/*diagnostic* ?`
- `tests/lambda/ai/smart-fix.test.ts ?`
- `ui/src/features/mappings/hooks/*.test.ts* ?`
- `ui/src/features/mappings/components/*.test.tsx ?`
- `forge/architecture/ai-runtime.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- Depends on canonical AI adapter/backend alignment from `FS-068`.
- Should align with interaction patterns established in `FS-069` and `FS-070` to avoid fragmented AI UX.
- Smart Fix prompt contract availability in prompt registry/runtime path is required before production rollout.

---

## Constraints

- Smart Fix invocation must remain backend-mediated (UI -> ApiAdapter -> backend endpoint -> shared runtime).
- Request payload must include deterministic diagnostic identity (stable code + message + rule/target context).
- Backend must validate generated expression before returning apply-ready suggestion state.
- UI must clearly separate suggestion review from application.
- Re-validation after acceptance must be deterministic and visible to the user.
- Existing backend error envelope and UI error normalization conventions must be preserved.
- No mutation of persisted mapping state occurs as a side effect of suggestion generation.

---

## Proposed Behavior

### User Flow

1. User views a rule with one or more diagnostics in Mapping Editor.
2. User clicks **Smart Fix** from the specific diagnostic/rule context.
3. UI submits Smart Fix request with mapping/rule identity, failing expression snapshot, rule version/hash snapshot, and diagnostics context (defaults to all diagnostics on the selected rule, with optional single-diagnostic scope when explicitly chosen in UI).
4. Backend enriches request with relevant schema context and invokes Smart Fix prompt via shared AI runtime.
5. Backend validates returned corrected expression and responds with Smart Fix suggestion payload.
6. UI renders Smart Fix suggestion card showing:
   - original expression
   - suggested expression
   - concise explanation of what changed
   - validation status/diagnostics
7. User chooses:
   - **Accept**: apply suggested expression to draft rule and trigger immediate re-validation.
   - **Edit**: modify suggested expression before apply; applied result still triggers re-validation.
   - **Dismiss**: close suggestion with no rule change.

### System Behavior

1. Smart Fix endpoint accepts deterministic, rule-scoped inputs including at least: `mappingId`, `ruleIndex` or stable rule identity, `targetPath`, `failingExpression`, diagnostics context (default all diagnostics for the selected rule; optional narrowed single-diagnostic scope), and `ruleVersion`/`ruleHash` snapshot fields for stale-apply protection.
2. Handler resolves required mapping/schema context server-side and assembles Smart Fix prompt variables.
3. Context assembly follows envelope guardrails: max bundle ~64KB / ~8k tokens. If truncation is required, prioritize latest/high-severity diagnostics first before lower-priority context.
4. Handler invokes `invokeAI('smart-fix', variables)` (prompt id naming may align to final registry naming decision).
5. On AI success, handler validates corrected expression through engine parse/validation path.
6. Response includes structured Smart Fix artifact:
   - original expression
   - suggested expression
   - change explanation (before/after rationale)
   - validation object (`valid`, diagnostics)
   - correlation metadata for UI review/apply
7. UI enables one-click Accept only when suggestion is validation-valid; invalid suggestions remain review-only until edited into valid expression (no “Apply anyway” path).
8. On accept/apply, UI/backend perform a hard stale check against `ruleVersion`/`ruleHash` from request-time snapshot.
9. If hash/version mismatch is detected, direct apply is blocked and user is offered “re-run fix on latest rule” (rebase prompt path).
10. Accept/edit apply path that passes stale check triggers immediate rule validation refresh and updates diagnostic display.

### Failure / Edge Behavior

- Missing mapping/rule/diagnostic identity returns deterministic request error.
- If mapping/rule changed after request start, stale protection uses hard check on `ruleVersion`/`ruleHash`; direct apply is blocked and UI must offer “re-run fix on latest rule”.
- AI runtime/provider failures return normalized recoverable errors with retry affordance.
- If AI output is malformed or unparseable, backend returns structured failure (no partial suggestion object).
- If corrected expression fails validation, response remains a non-apply-ready invalid suggestion with diagnostics.
- Dismiss always leaves expression and draft state unchanged.

---

## Acceptance Examples

### AE-01 — Smart Fix invoked from rule diagnostic context (default all diagnostics)

**Given**
- A mapping rule with at least one diagnostic

**When**
- User invokes Smart Fix from that diagnostic/rule

**Then**
- Backend receives failing expression + stable diagnostic metadata + rule identity
- Diagnostics payload defaults to all diagnostics for the selected rule
- UI may optionally scope to one selected diagnostic when explicitly chosen
- Smart Fix suggestion workflow starts for that specific rule

### AE-02 — Backend generates corrected expression with before/after explanation

**Given**
- Smart Fix request with valid context

**When**
- AI generation succeeds

**Then**
- Response includes corrected DSL expression and explanation of what changed from original

### AE-03 — Validation gate prevents invalid suggestion from apply-ready state

**Given**
- AI returns candidate expression that fails engine validation

**When**
- Backend processes Smart Fix result

**Then**
- Response includes invalid validation status + diagnostics
- UI does not expose one-click apply-ready acceptance for that suggestion
- UI requires edit-to-valid before apply

### AE-04 — Accept/edit/dismiss review actions are explicit and safe

**Given**
- A Smart Fix suggestion is displayed

**When**
- User accepts, edits then applies, or dismisses

**Then**
- Accept/apply updates draft expression only
- Edit modifies candidate before apply
- Dismiss does not mutate expression/draft state

### AE-05 — Re-validation runs immediately after acceptance/apply

**Given**
- User applies a Smart Fix suggestion

**When**
- Rule expression is updated in draft state

**Then**
- Engine validation is re-run immediately
- Updated diagnostics/validity are visible in the rule UI

### AE-06 — Stale-write protection blocks apply on rule mismatch

**Given**
- A Smart Fix suggestion generated against rule snapshot hash/version A

**When**
- User attempts acceptance after the underlying rule has changed to hash/version B

**Then**
- Direct apply is blocked by hard stale check
- UI offers “re-run fix on latest rule” instead of applying stale suggestion

### AE-07 — Errors are normalized and non-destructive

**Given**
- Backend/runtime/provider/contract failure during Smart Fix

**When**
- Request fails

**Then**
- User receives normalized failure messaging and can retry
- No unintended rule mutation occurs

---

## Open Questions

- none

---

## Verification Strategy

Automated:
- Backend tests for Smart Fix request validation, context assembly, envelope guardrails/truncation priority, AI invoke wiring, and response contract (`AE-01`, `AE-02`).
- Backend tests for validation-gating behavior and invalid suggestion handling (`AE-03`).
- Backend/UI tests for hard stale-check behavior and rebase rerun path (`AE-06`).
- UI hook/component tests for Smart Fix lifecycle and accept/edit/dismiss behavior (`AE-04`, `AE-07`).
- UI/engine-integration tests for re-validation after apply (`AE-05`).
- Regression tests for no mutation on dismiss/failure (`AE-04`, `AE-07`).

Manual:
- Trigger Smart Fix from at least one real failing diagnostic and verify before/after explanation clarity (`AE-01`, `AE-02`).
- Verify invalid-suggestion path is not apply-ready and diagnostics are visible; apply requires edit-to-valid (`AE-03`).
- Verify accept and edit-then-apply each trigger immediate validation refresh and updated diagnostic state (`AE-05`).
- Verify stale mismatch blocks direct apply and offers re-run on latest rule (`AE-06`).
- Verify dismiss/failure leaves expression unchanged (`AE-04`, `AE-07`).

Quality gates:
- `pnpm typecheck`
- targeted backend tests for Smart Fix lambda/runtime
- targeted UI tests for Smart Fix hook/component integration

---

## Task Generation Notes

- This is cross-cutting; split by backend/adapter/UI/architecture domains.
- Use `Agent: task` for backend contract/runtime work, API adapter/type alignment, and architecture updates.
- Use `Agent: ui-task` for Mapping Editor interaction and component/hook behavior.
- Sequence to reduce risk:
  1. Backend Smart Fix contract + validation gate
  2. Adapter/domain contract adoption
  3. UI Smart Fix orchestration state
  4. UI interaction hardening (accept/edit/dismiss + re-validation)
  5. Architecture docs updates reflecting finalized canonical behavior
- Existing architecture coverage is sufficient; do not create a new architecture document unless implementation reveals a genuinely new subsystem boundary.

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Q1: default Smart Fix diagnostics scope is all diagnostics for selected rule; optional UI scope to one diagnostic is allowed as enhancement.
  - Resolved Q2: adopted FS-070-style context envelope guardrail (~64KB / ~8k tokens) with truncation priority for latest/high-severity diagnostics.
  - Resolved Q3: no “Apply anyway” path; suggestion must be edited to valid before apply when validation fails.
  - Resolved Q4: stale-write protection uses hard `ruleVersion`/`ruleHash` check; mismatch blocks direct apply and offers “re-run fix on latest rule”.
  - Added stale-protection acceptance example and verification expectations.

- Rev 1 — 2026-06-02
  - Initial draft
