# SPEC

## Title

Auto-Map Backend Lambda (`aiAutoMap`) — Section-Based Vertical Slice

---

## ID

FS-045

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-11
Last Updated: 2026-05-11
Type: backend

---

## Status

completed

---

## Revision

Rev: 1

---

## Summary

Implement a backend Lambda for the Auto-Map AI feature (`POST /ai/auto-map`) that generates DSL mapping rule suggestions for a given target section, using the same shared AI runtime pattern established by `explain-rule.ts` and `suggest-expression.ts`. This is a showcase/local-first vertical slice: the request includes source context directly (no RAG retrieval), the Lambda generates suggestions for one target section at a time, and each generated expression is validated using the engine's `parse()` before being returned. The design preserves a clean upgrade path to RAG-backed context assembly.

---

## Problem

KeyRa 2.0's Mapping Editor requires an Auto-Map feature where users can generate DSL mapping rule suggestions for target schema sections using AI. The product spec (§13.3) defines this as a RAG-backed pipeline, but no Auto-Map Lambda exists yet and the RAG infrastructure is not ready.

Without a working Auto-Map Lambda:
- There is no backend to support the Auto-Map UI feature
- The AI feature set cannot be demonstrated end-to-end for Auto-Map
- There is no way to validate prompt quality or iterate on the `auto-map` prompt (already stored in Prompt Registry) against real schema data

The Explain Rule and NL → Rule Lambdas were implemented as showcase/local-first vertical slices and have proven effective for prompt iteration and showcase demonstrations. Auto-Map needs the same treatment.

---

## Goal

Deliver a working `POST /ai/auto-map` Lambda that:
1. Accepts a target section, source context, and optional business context
2. Generates DSL mapping rule suggestions using the shared AI runtime (`invokeAI`)
3. Validates each generated expression using the engine's `parse()` function
4. Returns a structured response with rules, explanations, confidence levels, and validation results
5. Follows the same handler conventions, response envelope, and local testing patterns as `explain-rule.ts` and `suggest-expression.ts`
6. Preserves a clean upgrade path to RAG-backed context assembly without requiring handler redesign

---

## Assumptions

- The `auto-map` prompt is already stored in Prompt Registry with `promptId = "auto-map"`, placeholders `{{dslReference}}`, `{{targetSection}}`, `{{sourceContext}}`, and a `responseSchema` expecting `{ rules: [...] }`
- The `auto-map` prompt's `model` field is set to `openai/gpt-4.1` (Tier 2)
- The shared AI runtime (`src/lib/ai/`) is stable and fully functional (delivered by FS-031)
- The engine's `parse()` function is stable and can validate DSL expression syntax in isolation (no schema context required)
- The `auto-map` prompt's response schema defines `rules` with `target`, `expression`, `explanation`, and `confidence` fields
- `businessContext` is not currently referenced in the `auto-map` prompt template — it is accepted in the request for forward compatibility but has no effect on generation output until the prompt is revised to include a `{{businessContext}}` placeholder. The renderer silently ignores unreferenced variables, so this is safe.
- The `confidence` field in the AI response is constrained by the prompt's `responseSchema` (structured output JSON Schema). The handler passes the value through as-is — no additional handler-level constraint is needed.
- Shared Lambda boilerplate extraction (`parseRequestBody`, `jsonResponse`, `statusCodeForAIError`) is deferred to a follow-up spec. The auto-map handler will duplicate these utilities inline, matching the existing pattern in `explain-rule.ts` and `suggest-expression.ts`.

---

## Current Context

### Shared AI Runtime

The shared AI runtime (`src/lib/ai/`) provides the `invokeAI()` orchestration entry point used by all AI Lambdas. It handles prompt loading (DynamoDB with 5-minute cache), DSL reference injection (S3 with cache), prompt rendering (placeholder replacement), GitHub Models invocation (OpenAI SDK), and structured output parsing. See `forge/architecture/ai-runtime.md` for full details.

### Existing AI Lambda Pattern

Two AI Lambdas exist and establish the handler pattern:

1. **`src/lambda/ai/explain-rule.ts`** — takes `targetPath` + `expression`, calls `invokeAI('explain-rule', vars)`, returns explanation
2. **`src/lambda/ai/suggest-expression.ts`** — takes `instruction` + `targetPath` + `targetType` + `sourceContext` + optional `targetDescription`, calls `invokeAI('nl-to-rule', vars)`, returns suggested expression

Both handlers share identical boilerplate:
- `APIGatewayProxyEvent` / `APIGatewayProxyResult` interfaces
- `JSON_HEADERS` constant with Content-Type + CORS
- `jsonResponse(statusCode, payload)` helper
- `statusCodeForAIError(code)` mapper (PROMPT_NOT_FOUND→404, MODEL_RATE_LIMITED→429, VALIDATION_ERROR→400, default→500)
- `parseRequestBody(body)` with null/invalid-JSON handling
- try/catch around `invokeAI()` with synthetic `MODEL_ERROR` fallback

Both have corresponding test suites at `tests/lambda/ai/` that mock `invokeAI` using `vi.hoisted()` and test all input validation, success, error mapping, and header scenarios.

### Engine Validation

The mapping engine exports `parse(expression, options)` from `src/engine/dsl/index.ts` which validates DSL syntax, function names, and argument compatibility. It returns `{ ast, diagnostics }` where diagnostics contain severity and message. This can validate individual expressions without requiring full schema context, making it suitable for post-AI validation in the auto-map handler.

The full `validate()` function requires `MappingConfig`, `sourceSchema`, and `targetSchema` objects — impractical for the auto-map Lambda which receives schemas as text descriptions. Parse-level validation is the appropriate first step.

### Product Spec References

- `PRODUCT-TECHNICAL.md §13.3` — Auto-Map feature definition
- `PRODUCT-TECHNICAL.md §13.4` — RAG pipeline for schema retrieval
- `PRODUCT-TECHNICAL.md §14.3` — Lambda table listing `kbx-keyra-automap` at `POST /ai/auto-map`
- `PRODUCT-TECHNICAL.md §13.6` — Structured output pattern
- `PRODUCT-TECHNICAL.md §13.8` — Prompt Registry structure

---

## Scope

### In Scope

- New Lambda handler at `src/lambda/ai/auto-map.ts` following the established thin-handler pattern
- Input validation for required fields (`targetSection`, `sourceContext`) and optional field (`businessContext`)
- Invocation of `invokeAI('auto-map', variables)` with the shared AI runtime
- Post-AI parse-level expression validation using the engine's `parse()` function
- Validation results attached to each rule in the response (`validation.valid`, `validation.diagnostics`)
- Standard response envelope matching the `AIResult<T>` / `AIError` pattern
- Standard error code → HTTP status mapping
- Unit tests at `tests/lambda/ai/auto-map.test.ts` following the established mock-invokeAI test pattern
- Local test fixture for manual/local invocation
- Architecture documentation updates (`ai-runtime.md`, `project-structure.md`)

### Out of Scope

- RAG/OpenSearch retrieval for source context assembly
- Step Functions orchestration for large schemas
- Full-schema auto-map across all target sections in one request
- Full `validate()` with parsed schema objects (requires structured schemas, not text)
- UI implementation for Auto-Map review/acceptance
- Automatic application or persistence of suggested rules
- Prompt authoring or modification (the `auto-map` prompt already exists)
- Extraction of shared Lambda boilerplate to a common module (recommended follow-up, noted below)
- `businessContext` prompt integration (accepted in request, deferred until prompt is updated)

---

## Non-Goals

- Replace or redesign the shared AI runtime — this Lambda is a consumer, not a modifier
- Build the RAG pipeline — this slice uses direct context; RAG is a separate future spec
- Implement the Auto-Map UI — the UI review panel is a separate spec
- Support batch/multi-section auto-map in a single request — section-based is intentional for TTFSM, prompt quality, and local testability
- Modify existing AI Lambdas (explain-rule, suggest-expression)

---

## Relevant Areas

- `src/lambda/ai/auto-map.ts` (new)
- `src/lambda/ai/explain-rule.ts` (pattern reference)
- `src/lambda/ai/suggest-expression.ts` (pattern reference)
- `src/lib/ai/invoke-ai.ts` (consumed)
- `src/lib/ai/types.ts` (consumed)
- `src/engine/dsl/index.ts` — `parse()` function (consumed for validation)
- `src/engine/registry/function-registry.ts` — `defaultRegistry` (consumed for validation)
- `tests/lambda/ai/auto-map.test.ts` (new)
- `tests/lambda/ai/fixtures/auto-map-event.json` (new)
- `forge/architecture/ai-runtime.md` (update)
- `forge/architecture/project-structure.md` (update)

---

## Dependencies / Blockers

- FS-031 (Shared AI Runtime) must be complete — it is; the runtime is implemented and tested
- The `auto-map` prompt must exist in Prompt Registry — it is assumed to exist per requirements
- `GITHUB_TOKEN` must be available for model calls — same as existing Lambdas

---

## Constraints

- All AI calls must remain backend-only (API Gateway → Lambda → GitHub Models)
- Must use GitHub Models via OpenAI SDK (same as existing Lambdas)
- Must use Prompt Registry for prompt loading (same as existing Lambdas)
- Must inject DSL reference dynamically (same as existing Lambdas)
- Temperature must be deterministic (controlled by prompt record, expected `0`)
- Model must be Tier 2 (`openai/gpt-4.1`) — controlled by prompt record's `model` field
- The Lambda handler must not import from `ui/` or from other Lambda handlers
- `src/lib/ai/` must not be modified to import from `src/engine/` — the engine import lives in the Lambda handler only
- Response envelope must follow the `AIResult<T>` / `AIError` type pattern from `src/lib/ai/types.ts`
- AI output is suggestion-only — no auto-commit to mapping state

---

## Proposed Behavior

### User Flow

> Note: This section describes the backend contract. The UI flow is out of scope for this spec.

1. A caller (future UI or local test) sends `POST /ai/auto-map` with `targetSection`, `sourceContext`, and optional `businessContext`
2. The Lambda validates the request, generates suggestions, validates each expression, and returns structured results
3. The caller receives an array of suggested rules with validation status and can present them for review

### System Behavior

#### Request Contract

```json
{
  "targetSection": "- Order.Header.DocumentType (string)\n- Order.Header.DocumentDate (string)\n- Order.Header.CurrencyCode (string)",
  "sourceContext": "- InvoiceAmount (number)\n- InvDate (string, MM/DD/YYYY)\n- InvoiceCurrency (string)\n- Header.Currency (string)",
  "businessContext": "This mapping converts AP invoice data into the ShipmentOrder target model."
}
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `targetSection` | Yes | string | Newline-delimited list of target fields (path + type) for one section |
| `sourceContext` | Yes | string | Newline-delimited list of available source fields (path + type + format hints) |
| `businessContext` | No | string | Optional business context to guide mapping decisions |

#### Processing Pipeline

1. **Parse & validate request** — check for valid JSON body and required fields
2. **Prepare variables** — assemble the variable map for prompt rendering:
   - `targetSection` → from request
   - `sourceContext` → from request
   - `businessContext` → from request (empty string if absent)
3. **Invoke AI** — call `invokeAI('auto-map', variables)` which handles prompt loading, DSL injection, rendering, model invocation, and output parsing
4. **Validate expressions** — for each rule in the AI response, call `parse(rule.expression, { registry: defaultRegistry })` from the engine to validate DSL syntax
5. **Enrich response** — attach `validation: { valid, diagnostics }` to each rule
6. **Return** — return the enriched response in the standard `AIResult<AutoMapData>` envelope

#### Response Contract — Success

```json
{
  "success": true,
  "data": {
    "rules": [
      {
        "target": "Order.Header.DocumentType",
        "expression": "if(lt(source(\"InvoiceAmount\"), 0), \"CreditMemo\", \"Invoice\")",
        "explanation": "Sets the document type based on whether the invoice amount is negative.",
        "confidence": "high",
        "validation": {
          "valid": true,
          "diagnostics": []
        }
      },
      {
        "target": "Order.Header.DocumentDate",
        "expression": "formatDate(source(\"InvDate\"), \"MM/DD/YYYY\", \"YYYY-MM-DD\")",
        "explanation": "Converts the invoice date from MM/DD/YYYY to ISO format.",
        "confidence": "high",
        "validation": {
          "valid": true,
          "diagnostics": []
        }
      },
      {
        "target": "Order.Header.CurrencyCode",
        "expression": "coalesce(source(\"InvoiceCurrency\"), source(\"Header.Currency\"))",
        "explanation": "Uses the invoice currency if available, falls back to the header currency.",
        "confidence": "medium",
        "validation": {
          "valid": true,
          "diagnostics": []
        }
      }
    ]
  },
  "promptId": "auto-map",
  "model": "openai/gpt-4.1",
  "usage": {
    "promptTokens": 1200,
    "completionTokens": 350,
    "totalTokens": 1550
  }
}
```

#### Response Contract — Validation Failure on a Rule

When a generated expression fails parse-level validation, the rule is still returned but flagged:

```json
{
  "target": "Order.Header.InvalidField",
  "expression": "unknownFunc(source(\"Field\"))",
  "explanation": "...",
  "confidence": "low",
  "validation": {
    "valid": false,
    "diagnostics": ["Unknown function: unknownFunc"]
  }
}
```

Invalid rules are not filtered out — they are returned with validation status so the UI can present them appropriately (e.g., with warning indicators or disabled acceptance).

#### Response Contract — AI Error

Same `AIError` envelope as existing Lambdas:

```json
{
  "success": false,
  "error": {
    "code": "MODEL_ERROR",
    "message": "...",
    "details": null
  },
  "promptId": "auto-map"
}
```

### Failure / Edge Behavior

| Scenario | Behavior |
|----------|----------|
| Missing `targetSection` | 400 — `"Missing required field: targetSection"` |
| Missing `sourceContext` | 400 — `"Missing required field: sourceContext"` |
| Empty string `targetSection` | 400 — `"Missing required field: targetSection"` |
| Empty string `sourceContext` | 400 — `"Missing required field: sourceContext"` |
| Missing `businessContext` | Accepted — defaults to empty string |
| Invalid JSON body | 400 — `"Invalid request body"` |
| Null body | 400 — `"Invalid request body"` |
| `auto-map` prompt not found | 404 — AIError with `PROMPT_NOT_FOUND` |
| GitHub Models rate limited | 429 — AIError with `MODEL_RATE_LIMITED` |
| Model invocation failure | 500 — AIError with `MODEL_ERROR` |
| Unexpected exception | 500 — Synthetic AIError `{ code: 'MODEL_ERROR', message: 'Unexpected error while handling request' }` |
| AI returns valid JSON but expression fails parse | 200 — rule included in response with `validation.valid = false` and diagnostics |
| AI returns empty `rules` array | 200 — success response with `data.rules = []` |
| Expression parse throws unexpectedly | Rule included with `validation: { valid: false, diagnostics: ["Validation failed"] }` — parse errors are caught per-rule |

---

## Acceptance Examples

### AE-01 — Valid request returns suggestions with validation

**Given**
- Request with `targetSection`, `sourceContext`, and `businessContext`
- `invokeAI` returns a successful result with 3 rules

**When**
- `POST /ai/auto-map` is called

**Then**
- Response status is 200
- Response body has `success: true`
- `data.rules` contains 3 rules
- Each rule has `target`, `expression`, `explanation`, `confidence`, and `validation`
- `promptId` is `"auto-map"`
- JSON and CORS headers are present

### AE-02 — Missing targetSection returns 400

**Given**
- Request body with `sourceContext` but no `targetSection`

**When**
- `POST /ai/auto-map` is called

**Then**
- Response status is 400
- Body is `{ "error": "Missing required field: targetSection" }`

### AE-03 — Missing sourceContext returns 400

**Given**
- Request body with `targetSection` but no `sourceContext`

**When**
- `POST /ai/auto-map` is called

**Then**
- Response status is 400
- Body is `{ "error": "Missing required field: sourceContext" }`

### AE-04 — Empty string targetSection returns 400

**Given**
- Request body with `targetSection: ""` and valid `sourceContext`

**When**
- `POST /ai/auto-map` is called

**Then**
- Response status is 400
- Body is `{ "error": "Missing required field: targetSection" }`

### AE-05 — Empty string sourceContext returns 400

**Given**
- Request body with valid `targetSection` and `sourceContext: ""`

**When**
- `POST /ai/auto-map` is called

**Then**
- Response status is 400
- Body is `{ "error": "Missing required field: sourceContext" }`

### AE-06 — Missing businessContext defaults to empty string

**Given**
- Request body with `targetSection` and `sourceContext` but no `businessContext`
- `invokeAI` returns a successful result

**When**
- `POST /ai/auto-map` is called

**Then**
- Response status is 200
- `invokeAI` was called with `businessContext: ""`

### AE-07 — Null body returns 400

**Given**
- Request with null body

**When**
- `POST /ai/auto-map` is called

**Then**
- Response status is 400
- Body is `{ "error": "Invalid request body" }`

### AE-08 — Invalid JSON body returns 400

**Given**
- Request with malformed JSON body

**When**
- `POST /ai/auto-map` is called

**Then**
- Response status is 400
- Body is `{ "error": "Invalid request body" }`

### AE-09 — PROMPT_NOT_FOUND maps to 404

**Given**
- Valid request
- `invokeAI` returns `AIError` with code `PROMPT_NOT_FOUND`

**When**
- `POST /ai/auto-map` is called

**Then**
- Response status is 404

### AE-10 — MODEL_RATE_LIMITED maps to 429

**Given**
- Valid request
- `invokeAI` returns `AIError` with code `MODEL_RATE_LIMITED`

**When**
- `POST /ai/auto-map` is called

**Then**
- Response status is 429

### AE-11 — Unknown AI error maps to 500

**Given**
- Valid request
- `invokeAI` returns `AIError` with code `MODEL_ERROR`

**When**
- `POST /ai/auto-map` is called

**Then**
- Response status is 500

### AE-12 — Unexpected exception returns synthetic error

**Given**
- Valid request
- `invokeAI` throws an unexpected exception

**When**
- `POST /ai/auto-map` is called

**Then**
- Response status is 500
- Body is `{ success: false, error: { code: "MODEL_ERROR", message: "Unexpected error while handling request" }, promptId: "auto-map" }`

### AE-13 — Expression with parse error includes validation failure

**Given**
- Valid request
- `invokeAI` returns a rule with an invalid DSL expression (e.g., `unknownFunc(...)`)
- Engine `parse()` produces diagnostics with severity `error`

**When**
- `POST /ai/auto-map` is called

**Then**
- Response status is 200 (the AI call succeeded)
- The rule is included in `data.rules`
- The rule has `validation.valid = false`
- The rule has `validation.diagnostics` containing the parse error messages

### AE-14 — All rules pass validation

**Given**
- Valid request
- `invokeAI` returns rules with valid DSL expressions
- Engine `parse()` produces no error-level diagnostics

**When**
- `POST /ai/auto-map` is called

**Then**
- All rules have `validation.valid = true`
- All rules have `validation.diagnostics = []`

### AE-15 — JSON and CORS headers on all responses

**Given**
- Any request (valid or invalid)

**When**
- `POST /ai/auto-map` is called

**Then**
- Response includes `Content-Type: application/json`
- Response includes `Access-Control-Allow-Origin: *`

---

## Open Questions

- none

All questions resolved in Rev 1 — see Change Log.

---

## Verification Strategy

All acceptance examples (AE-01 through AE-15) will be covered by automated unit tests in `tests/lambda/ai/auto-map.test.ts`.

Tests will follow the established pattern:
- Mock `invokeAI` using `vi.hoisted()` + `vi.mock()`
- Mock `parse` from the engine for validation scenarios
- Test each input validation, success, error mapping, and edge case
- Verify JSON/CORS headers on all responses

Local integration testing (manual):
- Use the local test fixture with `AI_RUNTIME_MODE=local` to exercise the full pipeline against GitHub Models

Build verification:
- TypeScript compilation passes for all new and modified files
- Vitest passes for all new tests
- No lint errors in new files

---

## Task Generation Notes

This spec produces 5 tasks, all assigned to `Agent: task` (backend work, no UI):

1. **T-01: Implement auto-map Lambda handler** — Core handler following the established thin-handler pattern. Input validation, `invokeAI` call, response envelope. No validation post-processing yet.
2. **T-02: Add parse-level expression validation** — Post-process AI results by calling `parse()` from the engine on each generated expression. Attach validation results per rule. Depends on T-01.
3. **T-03: Unit tests for auto-map Lambda** — Full test suite covering all acceptance examples. Follows the `explain-rule.test.ts` and `suggest-expression.test.ts` patterns. Depends on T-01 and T-02.
4. **T-04: Local test fixture and invocation support** — Create event fixture JSON for local testing. Document the local invocation approach. Depends on T-01.
5. **T-05: Architecture documentation update** — Update `ai-runtime.md` to list auto-map as the third consumer Lambda. Update `project-structure.md` with new files.

All tasks are `Agent: task`. No `ui-task` tasks — this spec is backend-only.

The spec has architecture impact on the existing `ai-runtime.md` subsystem (adding a new consumer Lambda). T-05 handles this as an explicit architecture update task.

### Showcase vs. Production Scope

| Aspect | This Spec (Showcase/Local-First) | Future (RAG-Backed Production) |
|--------|----------------------------------|-------------------------------|
| Source context | Provided directly in request (`sourceContext`) | Assembled via RAG/OpenSearch retrieval from indexed schemas |
| Target scope | One section per request | Orchestrated across all sections (Step Functions for large schemas) |
| Validation | Parse-level (`parse()`) — syntax + function calls | Full `validate()` with parsed source/target schemas |
| Schema format | Text descriptions (field lists) | Structured `SchemaNode` trees from DynamoDB |
| Orchestration | Single Lambda call | Step Functions for parallel chunk processing |

The upgrade path is clean: the handler's `invokeAI` call and response envelope remain unchanged. Only the **context assembly** step changes — from request-provided to retrieval-backed. The generation core (prompt rendering → model invocation → output parsing → validation) is fully reusable.

---

## Change Log

- Rev 1 — 2026-05-11
  - Initial draft
  - Resolved Q1: `auto-map` prompt does not include `{{businessContext}}`. Keep `businessContext` as optional request field for forward compatibility; no effect until prompt is revised.
  - Resolved Q2: `confidence` passes through as-is from structured output. No handler-level constraint needed.
  - Resolved Q3: Shared Lambda boilerplate extraction deferred to follow-up spec. Auto-map handler duplicates inline, matching existing pattern.
