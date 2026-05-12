# SPEC

## Title

Natural Language to Rule Lambda (`aiSuggestExpression`)

---

## ID

FS-044

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

Implement the backend Lambda handler for the Natural Language to Rule AI feature (`POST /ai/suggest-expression`). The Lambda accepts a natural language instruction with target field metadata and source field context, invokes the shared AI runtime with promptId `nl-to-rule`, and returns a suggested DSL expression with explanation. This is a thin handler following the exact pattern established by `explain-rule.ts` in FS-031 — same handler shape, same shared runtime usage, same response envelope, same local testability. This is a showcase/local-first vertical slice; full RAG retrieval is deferred.

---

## Problem

The product spec defines a Natural Language to Rule AI feature (PRODUCT-TECHNICAL.md Section 13.3) that converts user instructions into DSL expressions. The shared AI runtime (FS-031) provides the `invokeAI()` orchestration function, and the UI integration (FS-042) is being built to consume a `POST /ai/suggest-expression` endpoint. However, the Lambda handler itself does not yet exist. This is the gap between the runtime infrastructure and the UI consumer.

Without this Lambda, the NL to Rule feature cannot be demonstrated end-to-end.

---

## Goal

Deliver a working `aiSuggestExpression` Lambda that:

1. Accepts a POST request with `instruction`, `targetPath`, `targetType`, `sourceContext`, and optional `targetDescription`
2. Maps request fields to the `nl-to-rule` prompt's expected placeholders
3. Calls `invokeAI('nl-to-rule', variables)` from the shared AI runtime
4. Returns the suggested DSL expression in the standard `AIResult`/`AIError` response envelope
5. Is locally testable without a full deployed UI stack
6. Follows the identical handler pattern as `explain-rule.ts` for consistency and reuse

Success means the Lambda can be invoked locally or through API Gateway and returns a valid DSL expression suggestion for a given natural language instruction.

---

## Assumptions

- The shared AI runtime (`src/lib/ai/`) from FS-031 is implemented and working, including `invokeAI()`, prompt registry, DSL asset loader, model client, and output parser
- The `nl-to-rule` prompt record exists in the Prompt Registry (DynamoDB or local fixture) with placeholders `{{dslReference}}`, `{{targetPath}}`, `{{targetType}}`, `{{targetDescription}}`, `{{instruction}}`, `{{sourceFields}}`
- GitHub Models endpoint is accessible with a valid `GITHUB_TOKEN`
- The response schema in the `nl-to-rule` prompt record expects `{ expression, explanation, confidence, assumptions }` as structured output fields
- CORS is handled at API Gateway level (the Lambda includes `Access-Control-Allow-Origin: *` header as a belt-and-suspenders measure, matching explain-rule)
- No authentication is required for the showcase endpoint

---

## Current Context

### Shared AI Runtime (FS-031)

The shared AI runtime at `src/lib/ai/` provides:

- `invokeAI(promptId, variables, options?)` — the single orchestration entry point
- Prompt loading from DynamoDB with in-memory caching (5-min TTL)
- DSL reference loading from S3 with in-memory caching
- Prompt rendering (`{{placeholder}}` replacement)
- GitHub Models invocation via OpenAI SDK with structured output
- Output parsing and error normalization into `AIResult<T>` / `AIError`
- Local mode: file-based prompt loading and local DSL reference when `AI_RUNTIME_MODE=local`

### Explain Rule Lambda (FS-031)

The existing `explain-rule.ts` at `src/lambda/ai/explain-rule.ts` establishes the handler pattern:

- Inline `APIGatewayProxyEvent` / `APIGatewayProxyResult` interfaces (no `@types/aws-lambda` dependency)
- `parseRequestBody()` utility for safe JSON parsing
- Field-by-field validation of required string fields with specific error messages
- Single `invokeAI()` call with promptId and variable map
- `statusCodeForAIError()` mapping: `PROMPT_NOT_FOUND` -> 404, `MODEL_RATE_LIMITED` -> 429, `VALIDATION_ERROR` -> 400, default -> 500
- `jsonResponse()` utility for consistent response formatting with CORS headers
- Top-level try/catch for unexpected errors -> 500 with `MODEL_ERROR`
- 100 lines total

### Test Pattern (FS-031)

The explain-rule tests at `tests/lambda/ai/explain-rule.test.ts` establish:

- `vi.hoisted()` mock for `invokeAI`
- `vi.mock()` of the AI runtime barrel
- Dynamic `import()` of handler in each test (after mock setup)
- `createEvent()` helper for constructing `APIGatewayProxyEvent`
- Tests for: valid request -> 200, missing body -> 400, invalid JSON -> 400, missing each required field -> 400, error code mapping (404, 429, 500), CORS headers

### Fixture Pattern (FS-031)

Local test fixtures live under `tests/lambda/ai/fixtures/`:

```
tests/lambda/ai/fixtures/
  valid-direct-source/
    request.json
    assertions.json
  valid-conditional-document-type/
    request.json
    assertions.json
  invalid-missing-expression/
    request.json
    assertions.json
```

Local prompt record fixtures live under `tests/lib/ai/fixtures/local-runtime/`:

```
tests/lib/ai/fixtures/local-runtime/
  explain-rule.json       # PromptRecord for explain-rule
```

### UI Consumer (FS-042)

FS-042 defines the UI consumer for this endpoint. It expects:

- Endpoint: `POST ${VITE_API_URL}/ai/suggest-expression`
- Request body: `{ instruction, targetPath, targetType, targetDescription?, sourceContext }`
- Response: standard `AIResult<{ expression: string, explanation?: string }>` / `AIError` envelope

### Prompt Variable Mapping

The request contract uses `sourceContext` as the field name (a pre-formatted text block of available source fields). The `nl-to-rule` prompt template uses `{{sourceFields}}` as the placeholder name. The Lambda must map `sourceContext` from the request to `sourceFields` in the variables passed to `invokeAI()`.

---

## Scope

### In Scope

- New Lambda handler at `src/lambda/ai/suggest-expression.ts`
- Request body parsing and validation for required fields (`instruction`, `targetPath`, `targetType`, `sourceContext`)
- Optional field support (`targetDescription`)
- Variable mapping from request fields to prompt placeholders (including `sourceContext` -> `sourceFields`)
- `invokeAI('nl-to-rule', variables)` call
- Standard `AIResult`/`AIError` response envelope with HTTP status code mapping
- CORS headers on all responses
- Unit tests at `tests/lambda/ai/suggest-expression.test.ts`
- Local test fixtures at `tests/lambda/ai/fixtures/suggest-expression/`
- Local prompt record fixture at `tests/lib/ai/fixtures/local-runtime/nl-to-rule.json`
- Architecture update to `ai-runtime.md` documenting the new Lambda
- Project structure update

### Out of Scope

- Full RAG/OpenSearch retrieval for source field context (deferred to production scope)
- Engine evaluation preview of the suggested expression
- Automatic acceptance/application of suggestions to mappings
- Smart fix feature
- Auto-map feature
- Frontend implementation (covered by FS-042)
- API Gateway configuration / IaC
- Authentication / authorization
- Response caching
- Any changes to the shared AI runtime (`src/lib/ai/`)

---

## Non-Goals

- This Lambda does not perform any DSL validation or engine evaluation of the generated expression
- This Lambda does not retrieve source fields via RAG — it receives them directly in the request as a pre-formatted text block
- This Lambda does not modify or persist any mapping state
- This spec does not change the shared AI runtime; it is a pure consumer of `invokeAI()`

---

## Relevant Areas

- `src/lambda/ai/suggest-expression.ts` (new)
- `src/lambda/ai/explain-rule.ts` (reference pattern)
- `src/lib/ai/index.ts` (consumed, not modified)
- `src/lib/ai/types.ts` (consumed, not modified)
- `tests/lambda/ai/suggest-expression.test.ts` (new)
- `tests/lambda/ai/fixtures/suggest-expression/` (new)
- `tests/lib/ai/fixtures/local-runtime/nl-to-rule.json` (new)
- `forge/architecture/ai-runtime.md` (update)
- `forge/architecture/project-structure.md` (update)

---

## Dependencies / Blockers

- Depends on FS-031 (Shared AI Runtime) being implemented — specifically `invokeAI()`, the prompt registry, DSL asset loader, and output parser
- The `nl-to-rule` prompt record must exist in the Prompt Registry (or as a local fixture) before the Lambda can produce real results
- A valid `GITHUB_TOKEN` is required for model invocation (both local and deployed)

---

## Constraints

- All AI calls must remain backend-only — the UI never calls GitHub Models directly
- Use GitHub Models via OpenAI SDK (through the shared runtime)
- Use Prompt Registry for prompts — no hardcoded prompt text in the Lambda
- Inject DSL reference dynamically via the shared runtime's DSL asset loader
- Temperature must remain deterministic (0) as configured in the prompt record
- Follow the existing `explain-rule.ts` handler conventions exactly unless there is a strong reason to diverge
- The Lambda handler must remain thin — all orchestration logic lives in `invokeAI()`
- No new NPM dependencies required (the Lambda uses only the shared AI runtime)
- Optimize for fast showcase delivery

---

## Proposed Behavior

### User Flow

This Lambda has no direct user-facing flow. It is the backend endpoint consumed by the UI (FS-042). The user interaction is:

1. User clicks Suggest on a target field in the Mapping Editor
2. User enters a natural language instruction (e.g., "default currency to USD if missing")
3. UI sends `POST /ai/suggest-expression` with instruction, target metadata, and source field context
4. **This Lambda** receives the request, calls `invokeAI('nl-to-rule', variables)`, and returns the result
5. UI displays the suggested expression for user review

### System Behavior

1. **Request parsing**: Parse the JSON body from the API Gateway event. Return 400 if body is null, not valid JSON, or not an object.

2. **Field validation**: Validate required string fields in order:
   - `instruction` — the natural language instruction (required, must be a non-empty string)
   - `targetPath` — the dot-notation target field path (required, must be a non-empty string)
   - `targetType` — the expected type of the target field (required, must be a non-empty string)
   - `sourceContext` — pre-formatted text block of available source fields (required, must be a non-empty string)
   - `targetDescription` — description of the target field (optional, defaults to empty string if missing or not a string)

3. **Variable mapping**: Build the `invokeAI` variables map:
   - `instruction` -> `instruction`
   - `targetPath` -> `targetPath`
   - `targetType` -> `targetType`
   - `targetDescription` -> `targetDescription`
   - `sourceContext` -> `sourceFields` (note the name mapping)

4. **AI invocation**: Call `invokeAI('nl-to-rule', variables)` with the mapped variables.

5. **Response formatting**: 
   - On success (`result.success === true`): return HTTP 200 with the full `AIResult` body
   - On AI error (`result.success === false`): map `result.error.code` to HTTP status via `statusCodeForAIError()` and return the full `AIError` body
   - On unexpected exception: return HTTP 500 with a synthetic `AIError` body

### Failure / Edge Behavior

- **Missing body**: 400 with `{ "error": "Invalid request body" }`
- **Invalid JSON body**: 400 with `{ "error": "Invalid request body" }`
- **Non-object body** (e.g., array, string): 400 with `{ "error": "Invalid request body" }`
- **Missing `instruction`**: 400 with `{ "error": "Missing required field: instruction" }`
- **Missing `targetPath`**: 400 with `{ "error": "Missing required field: targetPath" }`
- **Missing `targetType`**: 400 with `{ "error": "Missing required field: targetType" }`
- **Missing `sourceContext`**: 400 with `{ "error": "Missing required field: sourceContext" }`
- **Empty string for required field**: 400 with `{ "error": "Missing required field: {fieldName}" }` — empty strings are treated as missing
- **Missing `targetDescription`**: not an error; defaults to empty string `""`
- **Prompt not found**: 404 via `PROMPT_NOT_FOUND` error code
- **Rate limited**: 429 via `MODEL_RATE_LIMITED` error code
- **Model error**: 500 via `MODEL_ERROR` error code
- **Unexpected throw**: 500 with synthetic error body `{ success: false, error: { code: "MODEL_ERROR", message: "Unexpected error while handling request" }, promptId: "nl-to-rule" }`
- **All responses include** `Content-Type: application/json` and `Access-Control-Allow-Origin: *` headers

---

## Acceptance Examples

### AE-01 — Valid request returns suggested expression

**Given**
- A valid `nl-to-rule` prompt record exists in the registry
- The DSL reference asset is available
- GitHub Models is accessible

**When**
- `POST /ai/suggest-expression` with body:
```json
{
  "instruction": "default currency to USD if missing",
  "targetPath": "Order.Header.CurrencyCode",
  "targetType": "string",
  "targetDescription": "ISO currency code for the document",
  "sourceContext": "- InvoiceCurrency (string)\n- Header.Currency (string)\n- Billing.CurrencyCode (string)"
}
```

**Then**
- Response status is 200
- Response body has `success: true`
- Response body has `data` containing at minimum `expression` (string)
- Response body has `promptId: "nl-to-rule"`
- Response body has `model` field (string)
- Response headers include `Content-Type: application/json` and `Access-Control-Allow-Origin: *`

### AE-02 — Missing instruction returns 400

**Given**
- Request body is valid JSON

**When**
- `POST /ai/suggest-expression` with body:
```json
{
  "targetPath": "Order.Header.CurrencyCode",
  "targetType": "string",
  "sourceContext": "- InvoiceCurrency (string)"
}
```

**Then**
- Response status is 400
- Response body is `{ "error": "Missing required field: instruction" }`

### AE-03 — Missing targetPath returns 400

**Given**
- Request body is valid JSON

**When**
- `POST /ai/suggest-expression` with body:
```json
{
  "instruction": "default currency to USD if missing",
  "targetType": "string",
  "sourceContext": "- InvoiceCurrency (string)"
}
```

**Then**
- Response status is 400
- Response body is `{ "error": "Missing required field: targetPath" }`

### AE-04 — Missing targetType returns 400

**Given**
- Request body is valid JSON

**When**
- `POST /ai/suggest-expression` with body:
```json
{
  "instruction": "default currency to USD if missing",
  "targetPath": "Order.Header.CurrencyCode",
  "sourceContext": "- InvoiceCurrency (string)"
}
```

**Then**
- Response status is 400
- Response body is `{ "error": "Missing required field: targetType" }`

### AE-05 — Missing sourceContext returns 400

**Given**
- Request body is valid JSON

**When**
- `POST /ai/suggest-expression` with body:
```json
{
  "instruction": "default currency to USD if missing",
  "targetPath": "Order.Header.CurrencyCode",
  "targetType": "string"
}
```

**Then**
- Response status is 400
- Response body is `{ "error": "Missing required field: sourceContext" }`

### AE-06 — Empty string for required field returns 400

**Given**
- Request body is valid JSON

**When**
- `POST /ai/suggest-expression` with body:
```json
{
  "instruction": "",
  "targetPath": "Order.Header.CurrencyCode",
  "targetType": "string",
  "sourceContext": "- InvoiceCurrency (string)"
}
```

**Then**
- Response status is 400
- Response body is `{ "error": "Missing required field: instruction" }`

### AE-07 — Missing targetDescription defaults to empty string

**Given**
- A valid `nl-to-rule` prompt record exists in the registry
- `invokeAI` is called successfully

**When**
- `POST /ai/suggest-expression` with body:
```json
{
  "instruction": "default currency to USD if missing",
  "targetPath": "Order.Header.CurrencyCode",
  "targetType": "string",
  "sourceContext": "- InvoiceCurrency (string)"
}
```

**Then**
- Response status is 200
- `invokeAI` was called with variables including `targetDescription: ""`
- `invokeAI` was called with `sourceFields` (not `sourceContext`) as the variable key

### AE-08 — sourceContext maps to sourceFields in invokeAI variables

**Given**
- A valid `nl-to-rule` prompt record exists in the registry
- `invokeAI` is called successfully

**When**
- `POST /ai/suggest-expression` with body containing `sourceContext: "- Field1 (string)"`

**Then**
- `invokeAI` was called with second argument containing `{ sourceFields: "- Field1 (string)" }` (not `sourceContext`)

### AE-09 — Null body returns 400

**Given**
- API Gateway event has `body: null`

**When**
- Handler is invoked

**Then**
- Response status is 400
- Response body is `{ "error": "Invalid request body" }`

### AE-10 — Invalid JSON body returns 400

**Given**
- API Gateway event has `body: "{invalid-json"`

**When**
- Handler is invoked

**Then**
- Response status is 400
- Response body is `{ "error": "Invalid request body" }`

### AE-11 — PROMPT_NOT_FOUND maps to 404

**Given**
- `invokeAI` returns `{ success: false, error: { code: "PROMPT_NOT_FOUND", message: "..." }, promptId: "nl-to-rule" }`

**When**
- Handler processes the AI error

**Then**
- Response status is 404

### AE-12 — MODEL_RATE_LIMITED maps to 429

**Given**
- `invokeAI` returns `{ success: false, error: { code: "MODEL_RATE_LIMITED", message: "..." }, promptId: "nl-to-rule" }`

**When**
- Handler processes the AI error

**Then**
- Response status is 429

### AE-13 — Unknown AI error maps to 500

**Given**
- `invokeAI` returns `{ success: false, error: { code: "MODEL_ERROR", message: "..." }, promptId: "nl-to-rule" }`

**When**
- Handler processes the AI error

**Then**
- Response status is 500

### AE-14 — Unexpected exception returns 500 with synthetic error

**Given**
- `invokeAI` throws an unhandled exception

**When**
- Handler catches the exception

**Then**
- Response status is 500
- Response body is `{ "success": false, "error": { "code": "MODEL_ERROR", "message": "Unexpected error while handling request" }, "promptId": "nl-to-rule" }`

### AE-15 — All responses include CORS and JSON headers

**Given**
- Any request to the handler (valid or invalid)

**When**
- Handler returns a response

**Then**
- Response headers include `Content-Type: application/json`
- Response headers include `Access-Control-Allow-Origin: *`

---

## Open Questions

- none

---

## Verification Strategy

All acceptance examples (AE-01 through AE-15) will be covered by automated unit tests at `tests/lambda/ai/suggest-expression.test.ts`.

Testing approach:

1. **Unit tests** (primary): Mock `invokeAI` via `vi.mock()` and test the handler in isolation. This covers input validation, variable mapping, response formatting, error code mapping, and header inclusion. Tests follow the same pattern as `tests/lambda/ai/explain-rule.test.ts`.

2. **Local test fixtures**: JSON request/assertion pairs under `tests/lambda/ai/fixtures/suggest-expression/` for documentation and potential fixture-driven test extension.

3. **Local prompt fixture**: `tests/lib/ai/fixtures/local-runtime/nl-to-rule.json` enables local-mode testing of the full pipeline (prompt load -> render -> model call -> parse) when `AI_RUNTIME_MODE=local`.

4. **Build validation**: `tsc --noEmit` passes, `eslint` passes, all tests pass.

---

## Task Generation Notes

This spec produces 4 tasks:

1. **T-01**: Implement the `suggest-expression.ts` Lambda handler — the core implementation task. Creates the handler file following the `explain-rule.ts` pattern. Includes body parsing, field validation (4 required + 1 optional), variable mapping (`sourceContext` -> `sourceFields`), `invokeAI()` call, response formatting, error mapping, and CORS headers. Agent: `task`.

2. **T-02**: Write unit tests for the suggest-expression handler — creates `tests/lambda/ai/suggest-expression.test.ts` covering all 15 acceptance examples. Follows the explain-rule test pattern (vi.mock, dynamic import, createEvent helper). Agent: `task`.

3. **T-03**: Create local test fixtures — creates request/assertion JSON pairs for suggest-expression under `tests/lambda/ai/fixtures/suggest-expression/` and the `nl-to-rule.json` prompt record fixture under `tests/lib/ai/fixtures/local-runtime/`. Agent: `task`.

4. **T-04**: Update architecture documentation — updates `ai-runtime.md` module structure to list `suggest-expression.ts` as a consumer Lambda, updates `project-structure.md` to reflect new files. Agent: `task`.

T-01 has no task dependencies. T-02 depends on T-01. T-03 is independent of T-01 and T-02. T-04 depends on T-01.

All tasks are `Agent: task` — this is pure backend work with no UI component.

The existing `explain-rule.ts` utilities (`parseRequestBody`, `jsonResponse`, `statusCodeForAIError`) could be extracted into a shared handler-utilities module, but this optimization is not required for this spec. The suggest-expression handler should duplicate these utilities for now (matching the explain-rule pattern exactly). If a third Lambda is added, extraction should be considered at that point.

---

## Change Log

- Rev 1 — 2026-05-11
  - Initial draft
