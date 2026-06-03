# SPEC

## Title

Implement AI feature: Natural Language → DSL Expression

---

## ID

FS-070

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

This spec defines a production-ready “Natural Language → DSL Expression” flow for KeyRa mapping authoring. A user provides natural-language intent for a selected target field, the backend resolves relevant schema context, AI generates a candidate DSL expression, and the system validates that expression before it is shown. The UI presents the result as a suggestion-only artifact the user may accept, edit, or dismiss, with no automatic rule mutation.

---

## Problem

Rule authoring currently requires manual DSL composition even when user intent is simple and can be described in plain language. Existing suggest-expression capability is not yet defined as a canonical end-to-end product flow with backend-owned schema-context retrieval and pre-display engine validation guarantees. Without this, suggestion quality and safety are inconsistent, and users may see AI output that is unvalidated or hard to review safely.

---

## Goal

Deliver a canonical NL→DSL suggestion workflow where:

1. Users can request a suggestion from natural-language instruction for a selected target field.
2. Backend retrieves schema context needed for generation (rather than relying on UI-composed context strings).
3. AI returns a candidate DSL expression through the shared runtime path.
4. Candidate expression is validated by the mapping engine before UI display.
5. UI treats output as suggestion-only and supports accept/edit/dismiss actions.

---

## Assumptions

- Existing AI runtime (`src/lib/ai/*`) and suggest-expression handler (`src/lambda/ai/suggest-expression.ts`) remain the canonical generation path foundation.
- Mapping metadata already provides enough identifiers (mappingId, schema refs, target path/type) for backend context retrieval.
- Existing schema metadata/query APIs and storage model can supply source/target context for prompt construction without new infrastructure.
- Engine-level expression syntax validation can be performed via current engine exports (`parse()` and/or validate path) in Lambda runtime.
- Suggestion acceptance remains a UI draft update operation and does not auto-save/persist by itself.

---

## Current Context

- `src/lambda/ai/suggest-expression.ts` exists and currently expects `sourceContext` directly in request payload.
- `tests/lambda/ai/suggest-expression.test.ts` covers request validation and invokeAI wiring for current contract.
- UI already has suggest-expression orchestration (`use-suggest-expression.ts`) and inline suggestion surface (`SuggestExpressionInline.tsx`) with generate/accept/dismiss lifecycle.
- AI runtime architecture is already documented in `forge/architecture/ai-runtime.md`; backend conventions and UI composition are documented in `backend-api.md` and `ui-application.md`.
- Existing architecture docs cover this subsystem area, so a new architecture document is not required.

---

## Scope

### In Scope

- NL input flow from selected target field context in Mapping Editor.
- Backend retrieval/assembly of relevant schema context for suggestion generation.
- Suggest-expression request/response contract updates needed for backend-owned context retrieval.
- AI generation invocation for NL→DSL candidate expression.
- Engine validation of generated expression before suggestion is returned/displayed.
- UI suggestion review experience with explicit Accept, Edit, and Dismiss actions.
- Deterministic error behavior for missing context, generation failure, and validation failure.
- Automated and manual verification coverage for the above.

### Out of Scope

- Auto-committing accepted suggestion to persistent backend storage.
- Bulk or multi-target NL generation in one request.
- New model providers or runtime-provider abstractions.
- Prompt authoring/admin tooling.
- Expansion into explain/smart-fix/auto-map behavior changes beyond integration safety.

---

## Non-Goals

- Guaranteeing semantic correctness of every AI-generated expression.
- Replacing existing manual DSL authoring surfaces.
- Introducing browser-direct model invocation.
- Turning this feature into an autonomous mapping agent.

---

## Relevant Areas

- `src/lambda/ai/suggest-expression.ts`
- `src/lib/ai/invoke-ai.ts`
- `src/lib/ai/prompt-registry.ts`
- `src/lib/ai/output-parser.ts`
- `src/lambda/shared/errors.ts`
- `src/lambda/shared/response.ts`
- `src/lambda/schema/query-schema-nodes.ts ?`
- `src/lambda/mapping/get-mapping.ts ?`
- `src/engine/dsl/index.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/lib/types/domain.ts`
- `ui/src/features/mappings/hooks/use-suggest-expression.ts`
- `ui/src/features/mappings/components/SuggestExpressionInline.tsx`
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `tests/lambda/ai/suggest-expression.test.ts`
- `ui/src/features/mappings/hooks/use-suggest-expression.test.ts`
- `ui/src/features/mappings/components/SuggestExpressionInline.test.tsx`
- `forge/architecture/ai-runtime.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- Alignment with active AI integration work:
  - FS-067 (prompt registry + structured output contracts)
  - FS-068 (canonical HttpAdapter AI endpoint integration)
  - FS-069 (Explain Rule canonicalization; adjacent AI UX patterns)
- Availability of schema lookup inputs from selected mapping/target context in UI state.

---

## Constraints

- AI invocation must stay backend-mediated via existing Lambda/runtime architecture.
- Backend, not UI, is responsible for constructing generation-ready schema context.
- Generated expression must pass engine validation gate before success response is returned.
- Validation gate includes syntax, function compatibility, and target-type compatibility in this iteration.
- Invalid/failed validation outcomes must not be shown as accepted-ready suggestions.
- Backend schema-context assembly is bounded to ~64KB raw text or ~8k token-equivalent (whichever is reached first), with truncation/summarization applied.
- Suggestion remains non-persistent assistance until explicit user action.
- Existing error envelope/normalization conventions must be preserved.
- No breaking changes to unrelated adapter methods.

---

## Proposed Behavior

### User Flow

1. User selects a target field in Mapping Editor and opens Suggest Expression.
2. User enters natural-language instruction (e.g., “Use invoice currency, fallback to USD”).
3. User submits generation request.
4. UI sends request with target/mapping identifiers and instruction (no full schema-context string payload from UI).
5. Backend resolves relevant schema context, generates DSL candidate, validates it, and returns structured suggestion result.
6. UI displays suggestion card with expression, validation status, and optional diagnostics.
7. User can:
   - **Accept**: apply suggested expression into current draft field.
   - **Edit**: modify suggested expression in-place via inline editable suggestion area (canonical review behavior) before applying.
   - **Dismiss**: close suggestion without changing field expression.

### System Behavior

1. Suggest endpoint request contract includes instruction + selection identity (mappingId, targetPath, targetType, and any required schema refs).
2. Handler retrieves schema context server-side from mapping/schema records (and/or node query pathways), normalizes it to prompt variables, and invokes `invokeAI('nl-to-rule', variables)`.
3. Context assembly enforces bounds (~64KB raw text or ~8k token-equivalent, whichever first) with deterministic truncation/summarization.
4. On successful AI output parse, handler runs engine expression validation including syntax, function compatibility, and target-type compatibility.
5. Response includes:
   - suggested expression
   - explanation/rationale (if prompt contract provides)
   - validation result (`valid`, diagnostics array)
   - metadata needed by UI to render review state
5. UI only renders “ready to accept” state when `validation.valid === true`; apply is strictly blocked until the current review expression validates.

### Failure / Edge Behavior

- Missing mapping/field/schema context returns deterministic validation error (400/404-style mapped envelope) with actionable message.
- AI provider/runtime errors return normalized user-facing failure state with retry affordance.
- If AI output cannot be parsed into contract shape, return structured failure (no partial broken payload).
- If generated expression fails engine validation, return suggestion result marked invalid with diagnostics; UI displays diagnostics and blocks apply until expression validates.
- Dismiss action always leaves current expression unchanged.

---

## Acceptance Examples

### AE-01 — Valid NL instruction yields validated candidate suggestion

**Given**
- A selected target field with resolvable mapping/schema context
- A valid NL instruction

**When**
- User submits Suggest Expression

**Then**
- Backend retrieves schema context server-side
- AI returns candidate DSL expression
- Engine validation runs before response
- UI displays the candidate as a reviewable suggestion

### AE-02 — Backend context retrieval replaces UI-passed schema-context blob

**Given**
- UI has mapping/target identifiers for the selected field

**When**
- Suggest request is sent

**Then**
- Request does not require UI to send full source context text
- Backend constructs prompt context from persisted schema/mapping data

### AE-03 — Invalid generated expression is never displayed as ready-to-accept success

**Given**
- AI returns an expression that fails engine validation

**When**
- Backend processes the candidate

**Then**
- Response includes invalid status and diagnostics
- UI surfaces review/error state and does not auto-apply expression

### AE-04 — Suggestion-only UX supports accept, edit, dismiss

**Given**
- A suggestion is displayed for selected target

**When**
- User accepts, edits, or dismisses

**Then**
- Accept applies expression to draft only
- Edit allows modifying suggestion before apply
- Dismiss leaves field expression unchanged

### AE-05 — Backend/runtime and UI errors are normalized and recoverable

**Given**
- A runtime/provider/config/request failure occurs

**When**
- Suggest request fails

**Then**
- User sees clear, normalized failure message
- Retry path remains available
- No unintended draft mutation occurs

---

## Open Questions

- none

---

## Verification Strategy

Automated:
- Lambda unit tests for updated suggest-expression contract, backend schema-context retrieval behavior, and invokeAI variable assembly (`AE-01`, `AE-02`).
- Lambda tests for engine-validation gating and invalid-expression response shape (`AE-03`).
- UI hook/component tests for lifecycle states and accept/edit/dismiss interactions (`AE-04`, `AE-05`).
- Regression tests for no unintended expression mutation on dismiss/failure paths (`AE-04`, `AE-05`).

Manual:
- In Mapping Editor, run suggestion on at least one valid and one invalid-intent prompt; verify display, diagnostics, and acceptance behavior (`AE-01`, `AE-03`).
- Verify edit-before-apply flow works and final applied expression matches edited content (`AE-04`).
- Verify dismiss and failed-generation paths leave draft unchanged (`AE-04`, `AE-05`).

Quality gates:
- `pnpm typecheck`
- `pnpm test -- tests/lambda/ai/suggest-expression.test.ts`
- targeted UI tests for suggest hook/component suites

---

## Task Generation Notes

- This is cross-cutting work and must be split by domain.
- Backend/API/runtime/architecture tasks use `Agent: task`.
- UI behavior/surface tasks use `Agent: ui-task`.
- Sequence to reduce risk:
  1. Backend contract + context retrieval + validation gate
  2. UI contract adoption and review-state hardening
  3. UI interaction refinements for edit/apply/dismiss
  4. Architecture updates documenting finalized canonical flow
- Include explicit architecture update task because this spec materially changes behavior inside existing AI runtime/backend API/UI architecture docs.

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Q1: canonical review UX uses inline editable suggestion area.
  - Resolved Q2: backend context assembly bounded to ~64KB raw text or ~8k token-equivalent with truncation/summarization.
  - Resolved Q3: apply is strictly blocked until expression validates (no apply-anyway path).
  - Resolved Q4: first validation gate includes syntax + function checks + target-type compatibility.
- Rev 1 — 2026-06-02
  - Initial draft
