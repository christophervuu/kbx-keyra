# SPEC

## Title

Implement prompt registry and structured output contracts for AI runtime

---

## ID

FS-067

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

This spec defines a shared backend infrastructure for AI prompt management and machine-readable output enforcement across KeyRa AI capabilities. It standardizes how prompts are versioned, stored, loaded (`getLatestPrompt(promptId)`), and rolled back, and how each capability declares and validates its structured response schema. Success means Lambda handlers only return schema-validated AI payloads (or normalized errors), with no ad-hoc prompt/version logic per endpoint.

---

## Problem

KeyRa currently has AI runtime primitives, but prompt/version lifecycle and output-contract enforcement are not fully standardized across all AI capabilities. Without a single registry/version/rollback pattern and strict structured-output validation before handler response, behavior can drift per endpoint and invalid model payloads can leak to UI clients. This creates reliability, operability, and safety gaps as AI surface area grows.

---

## Goal

Deliver one shared prompt and response-contract infrastructure that:

1. Defines canonical prompt IDs and registry records for current AI capabilities.
2. Provides deterministic latest-version retrieval and explicit rollback behavior.
3. Requires each AI capability to declare an expected response schema contract.
4. Validates structured model output in backend runtime before Lambda returns to UI.
5. Normalizes invalid-output failures into stable backend error semantics.

---

## Assumptions

- Existing AI runtime architecture (`forge/architecture/ai-runtime.md`) remains the base subsystem.
- Prompt registry persistence continues to use DynamoDB-backed records (with local adapter support for local mode).
- Existing backend error envelope conventions from `forge/architecture/backend-api.md` remain canonical.
- Structured output mode via model `json_schema` response format remains available and required for these AI calls.
- Feature-specific UX changes are not required for this infrastructure pass.

---

## Current Context

- `forge/architecture/ai-runtime.md` already defines baseline `PromptRecord`, `PromptRegistryAdapter`, and shared `invokeAI()` orchestration.
- `getLatestPrompt(promptId)` exists as an interface-level contract but requires stricter versioning/rollback semantics and cross-capability standardization.
- Active AI-related specs (`FS-065`, `FS-066`) are converging AI endpoints onto canonical backend paths; this spec provides the shared prompt/structured-output contract needed by that convergence.
- The architecture index and existing docs show this work belongs to the existing AI runtime subsystem, not a new subsystem.

---

## Scope

### In Scope

- Prompt registry record contract refinements needed for versioning + rollback control.
- Canonical prompt ID catalog for:
  - `explain-rule`
  - `natural-language-to-dsl` (with backward-compat alias handling where needed)
  - `smart-fix`
  - `ai-validation`
  - `auto-map`
  - `field-description` generation
- Shared prompt retrieval APIs in runtime, including `getLatestPrompt(promptId)` behavior guarantees.
- Versioning and rollback strategy (latest selection, rollback target resolution, and audit metadata expectations).
- Shared response schema declaration/lookup contract per AI capability.
- Structured output validation path in runtime and Lambda handlers before returning response bodies.
- Failure behavior for invalid model output (normalized error code + status mapping + safe response body shape).
- Automated tests for prompt retrieval/versioning/rollback and output-validation failure cases.
- Architecture documentation updates for existing AI runtime/backend docs.

### Out of Scope

- Prompt authoring UI/workflow.
- New end-user AI feature UX or capability expansion.
- Model quality/prompt-content tuning beyond contract compliance.
- Replacing model provider or redesigning non-AI backend architecture.

---

## Non-Goals

- Building a full prompt CMS/editor.
- Introducing browser-side AI invocation.
- Redesigning Mapping Editor or other UI surfaces.
- Implementing long-running orchestration (Step Functions) for this specific contract work.

---

## Relevant Areas

- `src/lib/ai/types.ts`
- `src/lib/ai/prompt-registry.ts`
- `src/lib/ai/config.ts`
- `src/lib/ai/model-client.ts`
- `src/lib/ai/output-parser.ts`
- `src/lib/ai/invoke-ai.ts`
- `src/lib/ai/index.ts`
- `src/lambda/ai/explain-rule.ts`
- `src/lambda/ai/suggest-expression.ts`
- `src/lambda/ai/auto-map.ts`
- `src/lambda/shared/errors.ts`
- `src/lambda/shared/response.ts`
- `tests/lib/ai/*`
- `tests/lambda/ai/*`
- `forge/architecture/ai-runtime.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/INDEX.md`

---

## Dependencies / Blockers

- Coordinate with FS-065/FS-066 if files overlap during active implementation.
- Requires prompt registry records to exist for canonical prompt IDs by rollout time.
- Any production rollback operation depends on operational access path for writing/marking prompt records.

---

## Constraints

- No direct model-provider call paths from UI/browser.
- Lambda handlers remain thin and delegate orchestration/validation to shared AI runtime.
- Error responses must preserve canonical backend envelope semantics.
- Prompt/version retrieval must be deterministic and cache-safe for warm Lambda reuse.
- Structured output must be schema-validated before a success payload is returned to UI.
- Changes must remain compatible with TypeScript strict mode and current lint/test gates.

---

## Proposed Behavior

### User Flow

1. User triggers an AI capability (explain, NL→DSL, smart-fix, AI validation, auto-map, field descriptions).
2. Backend handler invokes shared runtime with capability key / prompt ID.
3. Runtime resolves active prompt version via registry (`getLatestPrompt(promptId)` or explicit rollback target behavior).
4. Model returns structured output in JSON schema mode.
5. Runtime validates parsed output against capability contract.
6. Handler returns validated success payload or normalized error payload.

### System Behavior

1. **Prompt registry contract**
   - Prompt records include version metadata and rollback-relevant metadata (e.g., active/deprecated status or rollback marker metadata as decided in implementation).
   - Registry supports deterministic latest-version retrieval by `promptId`.
   - Canonical prompt IDs are centrally defined and reused by handlers/runtime.

2. **`getLatestPrompt(promptId)` contract**
   - Returns the currently active/latest prompt version for a known prompt ID.
   - Returns `null` (or mapped not-found failure) for unknown IDs.
   - Uses bounded in-memory cache with deterministic refresh behavior.

3. **Versioning + rollback**
   - Runtime supports selecting rollback-safe prompt versions without changing handler code.
   - Rollback decisioning is data/config driven (not hardcoded in endpoint handlers).
   - Authoritative selection source is an explicit **active pointer record per environment**.
   - Prompt/deployment status fields are retained as historical metadata only and are not authoritative selection inputs.
   - Retrieval logic records enough metadata for audit/debug (selected version, pointer source/environment, and selection path).

4. **Structured output contract declaration**
   - Each AI capability declares expected response schema in one shared location.
   - Canonical prompt ID for NL→DSL is `natural-language-to-dsl`; `nl-to-rule` is supported as a backward-compatible alias for one release cycle.
   - Runtime/model invocation consumes that schema for `response_format` and downstream validation.

5. **Validation before handler response**
   - Runtime parses model output and validates against declared schema.
   - On schema mismatch/parse failure, runtime returns normalized invalid-output failure with semantic code `INVALID_MODEL_OUTPUT`.
   - Lambda handlers map normalized failure into canonical backend envelope/status before UI response.

### Failure / Edge Behavior

- Unknown prompt ID → deterministic prompt-not-found failure path.
- Missing active/latest prompt version for known ID → deterministic configuration/not-found failure path.
- Rollback target unavailable/inconsistent → deterministic configuration failure path (no silent fallback to arbitrary version).
- Model returns malformed JSON or schema-incompatible JSON → normalized `INVALID_MODEL_OUTPUT` error with HTTP 500 (no partially trusted payload returned as success).
- Validation failure includes safe diagnostic context for logs/telemetry (feature key, prompt ID/version, failure class) without leaking sensitive prompt/model internals to UI.

---

## Acceptance Examples

### AE-01 — Latest prompt retrieval is deterministic

**Given**
- Multiple prompt versions exist for `explain-rule`

**When**
- Runtime calls `getLatestPrompt('explain-rule')`

**Then**
- The same active/latest version is selected deterministically according to registry/version policy

### AE-02 — Canonical prompt IDs are registry-addressable

**Given**
- The prompt ID set for explain-rule, natural-language-to-DSL, smart-fix, ai-validation, auto-map, and field-description

**When**
- Runtime resolves prompts for each capability

**Then**
- Each capability resolves through centralized prompt ID definitions and registry lookup
- `natural-language-to-dsl` is canonical and `nl-to-rule` is honored as an alias for one release cycle

### AE-03 — Rollback can be applied without handler code changes

**Given**
- A prompt ID with latest version V5 and rollback target V4
- Environment `prod` has an active pointer record selecting V4

**When**
- Runtime resolves prompt selection for `prod`

**Then**
- Runtime selects V4 using the environment active pointer record and handlers continue unchanged

### AE-04 — Structured output is validated before success response

**Given**
- A capability with declared response schema

**When**
- Model output conforms to schema

**Then**
- Runtime returns typed/validated success payload and handler returns success response

### AE-05 — Invalid structured output fails safely

**Given**
- A capability with declared response schema

**When**
- Model output is malformed or schema-incompatible

**Then**
- Runtime returns normalized `INVALID_MODEL_OUTPUT` failure and handler returns canonical error envelope with HTTP 500 (no invalid payload returned as success)

### AE-06 — Unknown prompt ID fails deterministically

**Given**
- A capability references a non-existent prompt ID

**When**
- Runtime resolves prompt record

**Then**
- Request fails through prompt-not-found path with stable error mapping

### AE-07 — Cache behavior preserves correctness

**Given**
- Warm Lambda cache contains prior prompt version result

**When**
- Cache TTL expires or rollback selection changes

**Then**
- Runtime refreshes from registry and serves the updated selected version deterministically

---

## Open Questions

- none

---

## Verification Strategy

Automated:
- Unit tests for prompt retrieval/version selection and rollback selection behavior (`AE-01`, `AE-03`, `AE-07`).
- Unit tests for canonical ID/alias resolution contract (`AE-02`, `AE-06`).
- Unit tests for output-parser/schema validation success and failure (`AE-04`, `AE-05`).
- Lambda handler tests asserting normalized envelope mapping on invalid structured output (`AE-05`, `AE-06`).

Quality gates:
- `pnpm typecheck`
- `pnpm lint`
- Targeted `vitest` for `tests/lib/ai/*` and `tests/lambda/ai/*`

Manual/operational:
- Simulate rollback metadata/config change and confirm selected version changes without handler code edits (`AE-03`).
- Verify logs include selected prompt ID/version and failure class on invalid output path (`AE-05`, `AE-07`).

---

## Task Generation Notes

- All tasks are backend/architecture domain (`Agent: task`).
- Sequence should isolate risk:
  1) define contracts and prompt ID catalog,
  2) implement registry retrieval/version/rollback behavior,
  3) implement schema declaration/validation contracts,
  4) wire runtime + handlers and normalize failures,
  5) complete tests,
  6) update architecture docs.
- Include explicit architecture update task because this spec materially updates an existing subsystem (`ai-runtime.md` + backend error mapping guidance).
- Keep this spec focused on shared infrastructure; avoid feature UX deltas.

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Q1: authoritative rollback representation is an explicit active pointer record per environment; deployment/status fields remain historical metadata only
  - Resolved Q2: canonical prompt ID is `natural-language-to-dsl`; `nl-to-rule` remains a backward-compatible alias for one release cycle
  - Resolved Q3: invalid structured output maps to HTTP 500 with dedicated semantic envelope code `INVALID_MODEL_OUTPUT`

- Rev 1 — 2026-06-02
  - Initial draft
