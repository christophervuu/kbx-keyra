# SPEC

## Title

Implement AI feature: AI Validation for mapping quality review

---

## ID

FS-072

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

This spec defines KeyRa’s AI Validation feature for broader mapping-quality feedback. A user can request an AI-generated review of a mapping configuration; the backend assembles mapping + schema context (plus optional sample data), invokes the shared AI runtime, and returns a structured report with categorized issues, severities, affected rules, and recommendations. The feature is explicitly additive guidance and must remain clearly distinct from deterministic engine validation diagnostics.

---

## Problem

Current validation feedback is primarily deterministic engine diagnostics and manual human review. Deterministic diagnostics are authoritative for syntax/type/context correctness, but they do not provide broader quality guidance (for example: suspicious logic patterns, weak fallback handling, potential maintainability risks, or likely mapping gaps). Users need a structured, rule-linked AI review layer without weakening deterministic validation semantics.

---

## Goal

Deliver a canonical AI Validation workflow where:

1. Users can trigger AI validation for a mapping.
2. Backend assembles mapping, schema, and optional sample-data context.
3. AI returns a structured validation report with issue categorization and severity.
4. Report issues map back to affected mapping rule(s) for direct navigation.
5. UI presents AI findings as advisory/additive and keeps deterministic diagnostics clearly authoritative.

---

## Assumptions

- Shared AI runtime under `src/lib/ai/*` remains the canonical AI orchestration boundary.
- `POST /ai/validate-mappings` is the canonical endpoint for this feature.
- Mapping + schema identifiers already available in backend persistence are sufficient for context assembly.
- Mapping Editor surfaces can host AI validation actions/results without route-level redesign.
- Deterministic engine diagnostics remain unchanged as the authoritative validation channel.

---

## Current Context

- Architecture coverage already exists in:
  - `forge/architecture/ai-runtime.md`
  - `forge/architecture/backend-api.md`
  - `forge/architecture/ui-application.md`
  - `forge/architecture/mapping-engine.md`
- Related active specs already in progress:
  - `FS-068` (canonical adapter AI endpoint routing)
  - `FS-069` (Explain Rule)
  - `FS-070` (NL → DSL suggestion)
  - `FS-071` (Smart Fix)
- Existing AI validation domain contracts are too minimal for this feature:
  - `ValidateMappingsInput` currently centered on mapping IDs
  - `ValidationReport` currently minimal (`valid` + diagnostics)
- Existing architecture documents cover the subsystem boundaries required for this feature; no new architecture document is required for Rev 1.

---

## Scope

### In Scope

- User-triggered AI validation request for a mapping.
- Backend request contract and handler behavior for `/ai/validate-mappings`.
- Backend-owned context assembly (mapping config, relevant schema context, optional sample data).
- Structured AI validation report model including:
  - `summary`
  - `issues[]` with category, severity, affected rule reference(s), description, recommendation
  - optional metadata (for example `generatedAt`, model/prompt trace identifiers if permitted)
- UI report rendering with category/severity display and issue-to-rule linking.
- Explicit UI distinction between AI advisory findings and deterministic engine diagnostics.
- Test coverage for success/failure paths and non-destructive behavior.

### Out of Scope

- Replacing, suppressing, or reinterpreting deterministic engine diagnostics.
- Auto-applying AI recommendations.
- Multi-mapping batch validation in this iteration.
- Prompt admin/authoring UI.
- New model provider integration or browser-direct model calls.

---

## Non-Goals

- Making AI validation authoritative for save/deploy gates.
- Guaranteeing AI issue detection completeness or correctness in all cases.
- Redefining engine diagnostic taxonomy.
- Building autonomous remediation/auto-fix workflows in this spec.

---

## Relevant Areas

- `src/lambda/ai/validate-mappings.ts`
- `src/lib/ai/invoke-ai.ts`
- `src/lib/ai/output-parser.ts`
- `src/lambda/shared/errors.ts`
- `src/lambda/shared/response.ts`
- `src/lambda/mapping/get-mapping.ts ?`
- `src/lambda/schema/get-schema.ts ?`
- `src/lambda/schema/query-schema-nodes.ts ?`
- `ui/src/lib/types/domain.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/features/mappings/hooks/use-ai-validation.ts ?`
- `ui/src/features/mappings/hooks/use-mapping-editor.tsx ?`
- `ui/src/features/mappings/components/*validation*.tsx ?`
- `ui/src/features/mappings/components/RuleList.tsx ?`
- `tests/lambda/ai/validate-mappings.test.ts ?`
- `ui/src/features/mappings/hooks/*.test.ts* ?`
- `ui/src/features/mappings/components/*.test.tsx ?`
- `forge/architecture/ai-runtime.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- Contract alignment with `FS-068` for canonical `ApiAdapter`/`HttpAdapter` AI method routing.
- Prompt registry / structured output contract alignment from `FS-067`.
- Reuse consistency with AI UX patterns in `FS-069` through `FS-071`.

---

## Constraints

- AI validation is additive guidance only; it is not authoritative.
- Deterministic engine diagnostics remain authoritative and separately identifiable.
- AI request path must be backend-mediated only (`UI -> ApiAdapter -> backend endpoint -> shared runtime`).
- Report issues must include stable rule references (`ruleIndex`, `targetPath`, or both) for UI linking.
- Optional sample-data payload must be bounded by explicit size/type limits.
- Existing backend error envelope conventions and UI error normalization must be preserved.
- AI validation must not mutate mapping data as a side effect.
- V1 supports single-mapping validation requests only; batch validation is deferred.
- Canonical V1 issue taxonomy is: `correctness`, `completeness`, `maintainability`, `risk`.
- Canonical V1 severity scale is: `info | warning | error`.
- V1 sample-data constraints: JSON/XML text only, maximum payload size 1 MB.
- Sample-data payloads over 1 MB must be rejected with a clear validation error (no silent truncation).
- V1 trigger model is manual-only (no auto-refresh on mapping edits).

---

## Proposed Behavior

### User Flow

1. User opens a mapping and clicks **Validate with AI**.
2. User optionally includes sample data context.
3. UI sends request through adapter to `/ai/validate-mappings`.
4. Backend resolves mapping and schema context, invokes AI validation prompt through shared runtime, and returns a structured report.
5. UI renders AI report with categories, severity badges, affected-rule links, and recommendations.
6. User clicks an affected rule reference to navigate/highlight that rule when resolvable.
7. Deterministic engine diagnostics remain visible and clearly marked as authoritative, while AI findings are marked advisory.

### System Behavior

1. Endpoint validates request input and resolves canonical context (mapping, source schema, target schema, optional sample data).
2. Handler invokes shared runtime via `invokeAI('validate-mappings', variables)`.
3. Structured output parser enforces report schema before success response.
4. Successful response returns structured payload similar to:
   - `summary`: issue counts and high-level quality signal
   - `issues[]`: `{ id, category, severity, affectedRules[], description, recommendation }`
   - optional `meta`: generation timestamp / prompt version / model info if contract allows
5. `issues[].category` must be one of: `correctness | completeness | maintainability | risk`.
6. `issues[].severity` must be one of: `info | warning | error`.
7. Endpoint rejects sample data that is not JSON/XML text or exceeds 1 MB with deterministic validation error response.
8. AI validation execution is user-triggered only in V1.
9. UI maps `affectedRules[]` to rule list entities for navigation.
10. UI stores and presents AI report state independently from deterministic engine validation state.

### Failure / Edge Behavior

- Invalid request payload returns canonical `VALIDATION_ERROR` envelope.
- Missing mapping/schema context returns canonical `RESOURCE_NOT_FOUND` or validation failure as appropriate.
- Runtime/provider/timeout/parse failures return normalized retryable/non-retryable errors per backend conventions.
- If structured output parse fails, backend returns failure envelope (no malformed partial report).
- If an issue references a stale/unresolvable rule, UI renders non-clickable fallback text and does not crash.
- Failed AI validation requests must not alter mapping draft state, persisted mapping content, or deterministic diagnostics.

---

## Acceptance Examples

### AE-01 — User can request AI validation and receive structured report

**Given**
- A mapping with resolvable source/target schema context

**When**
- User triggers Validate with AI

**Then**
- Backend invokes AI validation through canonical runtime path
- UI receives and renders a structured report

### AE-02 — Report issues include required structured fields

**Given**
- AI validation request succeeds

**When**
- Report is returned

**Then**
- Each issue includes category, severity, affected rule reference(s), and recommendation

### AE-03 — Issue links navigate to affected rules

**Given**
- Report issue includes resolvable affected rule reference(s)

**When**
- User clicks an issue’s rule link

**Then**
- UI navigates/highlights the corresponding rule context

### AE-04 — AI findings remain clearly distinct from deterministic diagnostics

**Given**
- Both deterministic engine diagnostics and AI report are available

**When**
- User views validation information

**Then**
- Deterministic diagnostics are clearly authoritative
- AI findings are clearly labeled advisory/additive

### AE-05 — Optional sample data participates in AI validation context

**Given**
- User includes optional sample data in request

**When**
- Backend processes AI validation

**Then**
- Sample data is included in prompt context within configured bounds

### AE-07 — Oversized sample data is rejected with clear error

**Given**
- User submits sample data payload larger than 1 MB

**When**
- AI validation request is sent

**Then**
- Backend rejects request with clear validation error
- No silent truncation occurs

### AE-08 — Category and severity enums follow canonical V1 sets

**Given**
- AI validation report is returned

**When**
- UI parses and renders report issues

**Then**
- Every issue category is one of: `correctness | completeness | maintainability | risk`
- Every issue severity is one of: `info | warning | error`

### AE-09 — AI validation trigger is manual only

**Given**
- User edits rules after an AI validation report is shown

**When**
- User does not click Validate with AI again

**Then**
- No automatic AI re-validation request is triggered

### AE-06 — Failure paths are normalized and non-destructive

**Given**
- AI runtime/provider/parse/request failure occurs

**When**
- AI validation request fails

**Then**
- UI receives normalized error state with retry path
- Mapping/rule state remains unchanged

---

## Open Questions

- none

---

## Verification Strategy

Automated:
- Backend tests for request validation, context assembly, runtime invoke wiring, structured output parsing (`AE-01`, `AE-02`, `AE-05`).
- Backend tests for sample-data type/size validation and oversized rejection behavior (`AE-05`, `AE-07`).
- Backend tests for normalized failure mapping and parse/runtime/provider error handling (`AE-06`).
- Adapter/domain contract tests for `validateMappings` request/response alignment and enum constraints (`AE-01`, `AE-02`, `AE-08`).
- UI hook/component tests for lifecycle state, issue rendering, rule-link behavior, advisory distinction messaging, and manual-only trigger behavior (`AE-02`, `AE-03`, `AE-04`, `AE-09`).
- Regression tests confirming no mapping-state mutation on AI validation failure (`AE-06`).

Manual:
- Run AI validation against at least one realistic mapping and inspect issue readability/utility (`AE-01`, `AE-02`).
- Verify issue-to-rule navigation and stale-link fallback behavior (`AE-03`).
- Verify deterministic diagnostics and AI report are visually/semantically distinct (`AE-04`).
- Verify behavior with and without sample data (`AE-05`).
- Verify oversized sample-data request receives clear rejection and no silent truncation (`AE-07`).
- Verify editing mapping rules does not auto-trigger AI re-validation unless user manually triggers (`AE-09`).

Quality gates:
- `pnpm typecheck`
- targeted backend tests for `validate-mappings`
- targeted UI tests for AI validation hooks/components

---

## Task Generation Notes

- This is cross-cutting work; split tasks by backend/contract/ui/architecture domains.
- Use `Agent: task` for backend handler/runtime/adapter-contract/architecture tasks.
- Use `Agent: ui-task` for UI lifecycle, rendering, and navigation behavior.
- Recommended sequence:
  1. Backend endpoint + structured report contract
  2. Adapter/domain contract alignment
  3. UI orchestration hook and state lifecycle
  4. UI report rendering + rule-link navigation + advisory distinction
  5. Architecture doc updates for final canonical behavior
- Since architecture coverage already exists, no new architecture document is created in this spec; include explicit architecture update task instead.

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved all open questions with product decisions:
    - V1 scope is single-mapping only; batch deferred.
    - Canonical issue categories set to `correctness`, `completeness`, `maintainability`, `risk`.
    - Canonical severity scale set to `info | warning | error`.
    - Sample-data constraints set to JSON/XML text only, max 1 MB, reject-over-limit policy.
    - Trigger model set to manual-only in V1 (no auto-refresh).
  - Added AE-07 (oversized sample-data rejection), AE-08 (canonical enums), AE-09 (manual-only trigger).
  - Closed Open Questions section.

- Rev 1 — 2026-06-02
  - Initial draft
