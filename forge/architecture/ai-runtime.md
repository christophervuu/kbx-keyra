# AI Runtime Architecture

This document defines the architecture of the shared AI runtime layer — the backend module that provides reusable prompt loading, DSL reference injection, prompt rendering, model invocation, structured output parsing, and local testing support for all AI Lambda handlers.

---

## Overview

The AI runtime is a shared backend library under `src/lib/ai/` consumed by all AI Lambda handlers (`src/lambda/ai/`). It exists so that individual Lambdas remain thin request-handler shells while all AI orchestration logic lives in one place.

The runtime handles:

1. **Prompt Registry access** — loading versioned prompt records from DynamoDB with in-memory caching
2. **DSL asset resolution** — loading the DSL reference from S3 for prompt injection
3. **Prompt rendering** — replacing template placeholders in system and user messages
4. **Centralized routing/limits** — resolving feature invocation profile (tier/model/timeout/token cap) from shared defaults with allowlisted overrides
5. **Invocation guards** — validating payload and prompt contract before model invocation
6. **Model invocation** — calling GitHub Models via the OpenAI SDK with structured output support
7. **Output parsing** — validating and normalizing structured AI responses
8. **Telemetry** — emitting standardized start/success/failure invocation events
9. **Error normalization** — mapping AI/runtime/provider errors to canonical backend envelope semantics for handlers
10. **Orchestration** — a single `invokeAI()` entry point that wires all steps into a reusable pipeline

---

## FS-066 Shared Foundation Standard

FS-066 established the Phase 2 shared AI foundation on top of FS-065 reconciliation. This is the canonical runtime model for backend AI invocation.

### Implemented shared contracts

- **Centralized tier routing** (`src/lib/ai/routing.ts`)
  - Tier defaults are fixed:
    - Tier 1: `openai/gpt-4.1-mini`, `timeoutMs=20000`, `maxOutputTokens=1200`
    - Tier 2: `openai/gpt-4.1`, `timeoutMs=45000`, `maxOutputTokens=2500`
  - Feature defaults are centralized by prompt/feature (`explain-rule`, `nl-to-rule`, `smart-fix`, `validate-mappings`, `auto-map`)
  - Feature overrides are permitted only through the shared allowlist table (`AI_FEATURE_OVERRIDE_ALLOWLIST`)
  - Registry metadata can refine model/tokens when valid; invalid/missing values fall back to code defaults

- **Invocation guard contract** (`src/lib/ai/invocation-guards.ts`)
  - Validates promptId/variables/profile before invocation
  - Enforces positive finite timeout/token limits and non-empty model
  - Validates prompt record contract (temperature in [0,2], non-empty system/user templates)

- **Limit enforcement contract** (`src/lib/ai/invoke-ai.ts`)
  - Fails fast when prompt `maxTokens` exceeds resolved profile max output tokens (`LIMIT_EXCEEDED`)
  - Fails invocation when completion usage exceeds resolved max output tokens (`LIMIT_EXCEEDED`)
  - Normalizes provider `413` model errors to `LIMIT_EXCEEDED`

- **Telemetry contract** (`src/lib/ai/telemetry.ts`)
  - Event types: `ai.invoke.start`, `ai.invoke.success`, `ai.invoke.failure`
  - Stable fields: `invocationId`, `timestamp`, `promptId`, `requestId?`, `correlationId?`, `feature?`, `tier?`, `model?`, `timeoutMs?`, `maxOutputTokens?`, `durationMs?`, `errorCode?`

- **Error normalization contract** (`src/lib/ai/error-normalization.ts`)
  - Handler-facing mapper from AI/runtime/provider errors to canonical backend envelope semantics:
    - `VALIDATION_ERROR|LIMIT_EXCEEDED -> VALIDATION_ERROR (400, non-retryable)`
    - `PROMPT_NOT_FOUND -> RESOURCE_NOT_FOUND (404, non-retryable)`
    - `INVALID_MODEL_OUTPUT -> INVALID_MODEL_OUTPUT (500, non-retryable)`
    - `TIMEOUT -> TIMEOUT (504, retryable)`
    - `MODEL_RATE_LIMITED|provider 5xx/429 -> SERVICE_UNAVAILABLE (503, retryable)`
    - `REGISTRY_ERROR|ASSET_ERROR -> SERVICE_UNAVAILABLE (503, retryable)`
    - remaining config/parse/model/internal classes -> `INTERNAL_ERROR (500)`

## FS-067 Prompt Registry + Structured Output Contracts

FS-067 hardened prompt selection and structured-output contracts across all AI handlers.

### Canonical prompt identity contract

- Canonical prompt IDs are centralized in `src/lib/ai/prompt-ids.ts` and consumed by runtime/handlers.
- Canonical IDs include:
  - `explain-rule`
  - `natural-language-to-dsl`
  - `smart-fix`
  - `ai-validation`
  - `auto-map`
  - `field-description`
- Backward compatibility alias:
  - `nl-to-rule -> natural-language-to-dsl` (one release-cycle compatibility path).

### Deterministic prompt selection + rollback contract

- Authoritative rollback selector: **environment-scoped active pointer record**.
- Runtime environment selector variable:
  - `PROMPT_REGISTRY_ACTIVE_POINTER_ENV`
- Selection behavior:
  1. If active-pointer env is configured and pointer exists, select the pointed version deterministically.
  2. Otherwise select latest `status=active` version.
  3. Otherwise fall back to latest version record.
- Invalid pointer configuration (for example pointer version missing) is a deterministic registry failure (no silent fallback).
- Prompt status fields are retained as historical metadata and are not authoritative when pointer selection is configured.
- Invocation diagnostics include selected prompt metadata (`promptVersion`, `promptSelectionSource`, `promptSelectionEnvironment`).

### Shared structured response contract

- Runtime response schema contracts are centralized in `src/lib/ai/response-contracts.ts`.
- `invokeAI()` uses shared contract lookup first, then prompt-record schema fallback when needed.
- Output parser enforces strict JSON parse + schema validation before success results are returned.
- Invalid/malformed model output returns `INVALID_MODEL_OUTPUT` (never a success payload).

## FS-065 Reconciliation Status (Canonical Model)

FS-065 reconciled AI showcase-era integration paths onto a single canonical production flow.

### Keep

- Backend AI handlers under `src/lambda/ai/` remain thin wrappers over `invokeAI()`.
- UI backend mode consumption remains adapter-based and must route through `HttpAdapter`.

### Replace

- AI method placeholders using `NOT_IMPLEMENTED` were replaced by explicit feature gating semantics where methods are intentionally deferred (`FEATURE_NOT_ENABLED`, non-retryable).
- Schema query dependency behavior moved from DynamoDB substring-first to OpenSearch-first retrieval.

### Retire / Non-canonical

- `HybridAdapter` is retired and must not be reintroduced as a production path.
- Legacy UI shortcut/review-loop surfaces retired in FS-065 are non-canonical and prohibited for new work.

### Interim infrastructure posture

- AI routes may remain outside the full Phase 1 IaC route set temporarily.
- This does **not** change the canonical consumption requirement: UI backend mode must call backend AI routes through `HttpAdapter` only.

---

## Canonical End-to-End AI Flow

```text
UI hook/component
  -> ApiAdapter method
  -> HttpAdapter (when VITE_API_URL is set)
  -> API Gateway route
  -> Lambda handler (src/lambda/ai/*)
  -> invokeAI() shared runtime
  -> Prompt registry + DSL asset + model client + output parser
  -> standardized JSON response back to UI
```

Canonical route mappings currently implemented in `HttpAdapter`:

- `autoMap` / `autoMapSection` -> `POST /ai/auto-map`
- `suggestExpression` -> `POST /ai/suggest-expression`
- `explainRule` -> `POST /ai/explain-rule`
- `smartFix` -> `POST /ai/smart-fix`
- `validateMappings` -> `POST /ai/validate-mappings`

---

## Module Structure

```
src/
  lib/
    ai/
      index.ts              Barrel export — public API surface
      types.ts              Shared types: PromptRecord, AIResult, AIError, adapter interfaces
      config.ts             Runtime configuration from environment variables
      prompt-registry.ts    PromptRegistryAdapter interface + DynamoDB + local implementations
      dsl-asset-loader.ts   DslAssetLoader interface + S3 + local implementations
      prompt-renderer.ts    Template placeholder rendering
      model-client.ts       GitHub Models client wrapper (OpenAI SDK)
      output-parser.ts      Structured output parsing and error normalization
      invoke-ai.ts          Orchestration entry point: invokeAI()
  lambda/
    ai/
      explain-rule.ts       First consumer Lambda — thin handler shell
      suggest-expression.ts Second consumer Lambda — NL to rule handler
      auto-map.ts           Auto-map Lambda handler for section/whole retrieval-backed suggestion generation
```

---

## Design Principles

### Adapter Pattern for Testability

All I/O operations (DynamoDB reads, S3 reads, model API calls) are accessed through adapter interfaces. This enables:

- **Local development**: swap in file-based or in-memory adapters that read prompt records from local JSON files and DSL reference from the local filesystem
- **Unit testing**: inject mock adapters without AWS SDK mocking
- **Deployed execution**: use the real DynamoDB/S3/API adapters

The adapter selection is driven by runtime configuration (`config.ts`), not by conditionals scattered throughout business logic.

### Thin Lambda Handlers

Lambda handlers in `src/lambda/ai/` are minimal:

1. Parse and validate API Gateway request input
2. Call `invokeAI(promptId, variables)` from the shared runtime
3. Normalize failures using shared error mapper (`normalizeAIError`)
4. Return canonical backend response envelope via shared response helpers

Handlers do not contain prompt logic, routing policy, limit policy, caching logic, or direct model-client orchestration.

### Environment-Driven Configuration

All external references (table names, S3 buckets, API endpoints, tokens) are resolved from environment variables at startup. The configuration module (`config.ts`) centralizes all environment variable reads and provides typed defaults for local development.

---

## Core Types

### PromptRecord

The in-memory representation of a row from the PromptRegistry DynamoDB table. Matches the schema defined in PRODUCT-TECHNICAL.md §15.1.

```typescript
interface PromptRecord {
  promptId: string;
  version: number;
  status?: 'active' | 'inactive' | 'deprecated';
  selectionSource?: 'active-pointer' | 'latest-active' | 'latest-version';
  selectionEnvironment?: string;
  systemMessage: string;
  userMessageTemplate: string;
  model: string;
  temperature: number;
  responseSchema: string;    // JSON string of the response JSON Schema
  maxTokens: number;
  updatedAt: string;
  updatedBy: string;
  notes?: string;
}
```

### AIResult

The normalized return type from `invokeAI()`.

```typescript
interface AIResult<T = unknown> {
  success: true;
  data: T;
  promptId: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface AIError {
  success: false;
  error: {
    code: string;          // e.g., 'PROMPT_NOT_FOUND', 'MODEL_ERROR', 'INVALID_MODEL_OUTPUT'
    message: string;
    details?: unknown;
  };
  promptId: string;
}

type AIResponse<T = unknown> = AIResult<T> | AIError;
```

### Adapter Interfaces

```typescript
interface PromptRegistryAdapter {
  getLatestPrompt(promptId: string): Promise<PromptRecord | null>;
}

interface DslAssetLoader {
  loadDslReference(): Promise<string>;
}
```

---

## Prompt Registry

### Access Pattern

- **Table**: `integrations-keyra-promptregistry`
- **PK**: `promptId` (string)
- **SK**: `version` (number)
- **Access**: Query PK = promptId, ScanIndexForward = false, Limit = 1 to retrieve the highest version

### Selection policy

- Runtime selection is deterministic and data/config-driven.
- Authoritative rollback path is active-pointer selection (`recordType=active-pointer`) scoped by environment.
- Pointer environment is provided by `PROMPT_REGISTRY_ACTIVE_POINTER_ENV`.
- Without a pointer, runtime resolves latest active, then latest version fallback.
- Selection metadata is attached to the selected record for telemetry/diagnostics.

### Caching

- In-memory `Map<string, { record: PromptRecord; fetchedAt: number }>` cache
- TTL: 5 minutes (300,000 ms)
- Cache key: `promptId`
- On cache miss or expiry: query adapter selection path, update cache
- Cache is per-Lambda-instance (cold start resets cache)

### Local Adapter

Reads prompt records from local JSON files under a configurable directory. File naming convention: `{promptId}.json`. Files may contain a single `PromptRecord` or an array of prompt versions + optional active-pointer record. This allows local development without DynamoDB access while preserving selection semantics.

---

## DSL Asset Resolution

### S3 Source

- **Bucket**: `integrations-keyra`
- **Prefix**: `prompt-assets/dsl/`
- **Asset key resolution**: The runtime reads the environment variable `DSL_ASSET_KEY` for the full S3 object key (e.g., `prompt-assets/dsl/keyra-dsl-reference-v1.md`). If not set, it defaults to `prompt-assets/dsl/keyra-dsl-reference.md`.

This approach avoids hardcoding a specific versioned filename while still allowing version-specific overrides through configuration.

### Caching

- Single in-memory `string` cache with timestamp
- TTL: 5 minutes (300,000 ms)
- On cache miss or expiry: read from S3, update cache

### Local Adapter

Reads the DSL reference from a local file path specified by the environment variable `DSL_ASSET_LOCAL_PATH`. This allows local testing with the actual DSL reference content without S3 access.

---

## Prompt Rendering

Template rendering replaces `{{placeholder}}` tokens in `systemMessage` and `userMessageTemplate` with actual values.

### Placeholder Categories

1. **System-managed placeholders** — resolved by the runtime itself:
   - `{{dslReference}}` — the full DSL reference text loaded by the DSL asset loader

2. **Request-scoped placeholders** — provided by the caller:
   - `{{targetPath}}`, `{{targetType}}`, `{{expression}}`, `{{instruction}}`, etc.
   - Variable names are prompt-specific and defined in `userMessageTemplate`

### Rendering Rules

- All `{{key}}` tokens in the template are replaced with the corresponding value from the variables map
- Unreplaced placeholders remain as-is (the runtime does not throw on missing variables — this is a diagnostic choice so that prompt templates can evolve independently)
- The renderer is a pure function with no I/O dependencies

---

## Model Client

### Provider

GitHub Models via the OpenAI SDK (`openai` npm package).

### Configuration

```typescript
const client = new OpenAI({
  baseURL: config.githubModelsEndpoint,
  apiKey: config.githubToken,
  defaultQuery: {
    'api-version': '2024-08-01-preview',
  },
});
```

### Structured Output

The client uses the OpenAI SDK's `chat.completions.create()` with `response_format` set to `json_schema` mode. The JSON Schema is taken from the prompt record's `responseSchema` field.

```typescript
const response = await client.chat.completions.create({
  model: promptRecord.model,
  temperature: promptRecord.temperature,
  max_tokens: promptRecord.maxTokens,
  messages: renderedMessages,
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: promptRecord.promptId,
      strict: true,
      schema: JSON.parse(promptRecord.responseSchema),
    },
  },
});
```

### Error Handling

Model client maps provider/runtime failures into shared AI error codes with provider diagnostics in `details` where available.

Implemented model-client mapping:
- timeout-like failures -> `TIMEOUT`
- `429` -> `MODEL_RATE_LIMITED`
- `401` / `403` -> `MODEL_ERROR` (auth context)
- `400` -> `MODEL_ERROR` (request validation context)
- other/network failures -> `MODEL_ERROR`

Handler responses must not return raw provider error payloads directly; they normalize through `normalizeAIError(...)` into canonical backend envelope codes/status/retryability.

---

## Orchestration

The `invokeAI()` function is the primary reusable entry point.

### Flow

```
invokeAI(promptId, variables, options?)
  │
  ├── 1. Load prompt record (via PromptRegistryAdapter)
  │       └── Cache hit? Return cached. Miss? Query DynamoDB.
  │
  ├── 2. Resolve invocation profile (routing defaults + allowlisted overrides + valid registry metadata)
  │       └── tier/model/timeoutMs/maxOutputTokens
  │
  ├── 3. Validate invocation payload and prompt contract (invocation-guards)
  │
  ├── 4. Enforce prompt/profile token-limit invariants
  │
  ├── 5. Load DSL reference (via DslAssetLoader)
  │       └── Cache hit? Return cached. Miss? Read from S3.
  │
  ├── 6. Render messages (via prompt-renderer)
  │       ├── System message: inject {{dslReference}} + any system-level vars
  │       └── User message: inject request-scoped vars ({{expression}}, etc.)
  │
  ├── 7. Invoke model (via model-client)
  │       └── GitHub Models → structured output → raw response
  │
  ├── 8. Enforce completion-token usage cap (when usage available)
  │
  ├── 9. Parse output (via output-parser)
  │       └── Validate against shared response contract / responseSchema → AIResult<T> or AIError
  │
  └── 10. Emit telemetry start/success/failure events around full invocation lifecycle
```

### Dependency Injection

`invokeAI()` accepts an optional `options` parameter that allows overriding adapters:

```typescript
interface InvokeAIOptions {
  promptRegistry?: PromptRegistryAdapter;
  dslAssetLoader?: DslAssetLoader;
}
```

When not provided, the function uses the default adapters configured by `config.ts`. This enables:
- Lambda handlers to call `invokeAI(promptId, vars)` with zero configuration
- Tests to call `invokeAI(promptId, vars, { promptRegistry: mockRegistry })` with full control

The default prompt registry adapter, DSL asset loader, and model client are lazily initialized as module-level singletons so cache state can be reused across warm Lambda invocations.

---

## Lambda Handler Pattern

Both `src/lambda/ai/explain-rule.ts` and `src/lambda/ai/suggest-expression.ts` follow the same thin-handler pattern: parse and validate request input, call `invokeAI(promptId, variables)`, and return standardized JSON/CORS responses.

All AI Lambdas follow this structure:

```typescript
// src/lambda/ai/explain-rule.ts
import { invokeAI } from '../../lib/ai/index.js';

export async function handler(event: APIGatewayProxyEvent) {
  // validate JSON body and required fields before invokeAI
  const body = JSON.parse(event.body ?? '{}');
  const result = await invokeAI('explain-rule', {
    targetPath: body.targetPath,
    expression: body.expression,
  });
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(result),
  };
}
```

AI handlers (`explain-rule`, `suggest-expression`, `smart-fix`, `auto-map`) use shared failure normalization and canonical envelope responses through `errorResponse(...)`.

`suggest-expression` validates (`mappingId`, `instruction`, `targetPath`, `targetType`) and routes through canonical prompt ID resolution (`nl-to-rule` alias -> `natural-language-to-dsl`).

### Suggest Expression canonical contract (FS-070)

`src/lambda/ai/suggest-expression.ts` is a canonical thin handler over `invokeAI('nl-to-rule', ...)` and enforces these production constraints:

- Request contract uses mapping/target identity, not UI-provided schema blobs:
  - required: `mappingId`, `instruction`, `targetPath`, `targetType`
  - optional: `targetDescription`
- Backend owns context retrieval/assembly from persisted mapping/schema data before invocation.
- Context assembly is bounded with deterministic truncation/summarization:
  - ~64KB raw text or ~8k token-equivalent, whichever is reached first.
- On successful model output parse, candidate expressions are validated before response success:
  - syntax validity
  - function compatibility
  - target-type compatibility
- Success payload includes review-state metadata:
  - `expression`, optional `explanation`
  - `validation: { valid, diagnostics[] }`
  - `readyToApply`
  - `context` metadata (`sourceNodeCount`, `includedNodeCount`, `truncated`, `approxTokenCount`, `byteLength`)
- Validation-invalid outcomes are returned as suggestion results with diagnostics and `readyToApply: false` (not transport failures).

### Explain Rule canonical contract (FS-069)

`src/lambda/ai/explain-rule.ts` is a canonical thin handler over `invokeAI('explain-rule', ...)` and enforces these production constraints:

- Validates required request fields (`targetPath`, non-empty `expression`)
- Rejects completely unparsable expressions before invocation (no meaningful DSL fragment)
- Uses prompt-registry + structured-output path via `invokeAI()`; success is gated by shared contract validation (`response-contracts.ts` + `output-parser.ts`)
- Normalizes success data to concise explanation output (1–2 sentences target, hard token clamp) with optional metadata passthrough (`confidence`, `limitations[]`)
- Remains read-only assistance: explain invocation never mutates mapping rules or persistence state

### Smart Fix canonical contract (FS-071)

`src/lambda/ai/smart-fix.ts` is a canonical thin handler over `invokeAI('smart-fix', ...)` and enforces these production constraints:

- Request contract is rule-scoped and diagnostic-driven:
  - required: `mappingId`, `ruleIndex`, `targetPath`, `failingExpression`, `diagnostics[]`
  - optional: `targetType`, `diagnosticScope`, `selectedDiagnosticIndex`, `ruleVersion`, `ruleHash`
- Backend owns mapping/schema retrieval and context assembly prior to invocation.
- Context assembly is bounded with deterministic truncation:
  - ~64KB raw text or ~8k token-equivalent
  - truncation priority: latest/high-severity diagnostics first, then lower-priority context.
- Handler invokes Smart Fix prompt via shared runtime and validates structured output contract before success.
- On success, candidate corrected expression is engine-validated before response success payload is returned.
- Success payload includes review/apply metadata:
  - `originalExpression`, `suggestedExpression`, `explanation`
  - `validation: { valid, diagnostics[] }`
  - `readyToApply`
  - `diagnosticsScopeApplied`
  - `context` usage/truncation metadata
  - `applyGuard: { ruleVersion, ruleHash }`
- Validation-invalid outcomes are returned as suggestion results with `readyToApply: false` (not transport failures).
- Stale snapshot protection is hard-gated at handler contract level:
  - rule version/hash mismatches map to canonical `CONFLICT` response for UI rerun flows.

### Validate Mappings canonical contract (FS-072)

`src/lambda/ai/validate-mappings.ts` is a canonical thin handler over `invokeAI('ai-validation', ...)` and enforces these production constraints:

- Request contract is single-mapping, backend-context-driven:
  - required: `mappingId`
  - optional: `sampleData: { contentType, content }`
- V1 scope is **single mapping only**. Batch input is rejected with canonical `VALIDATION_ERROR`.
- Backend owns mapping/schema retrieval and AI prompt context assembly prior to invocation.
- Optional sample-data contract is strictly validated before invocation:
  - content types: JSON/XML text only (`application/json`, `application/xml`, `text/xml`)
  - size cap: **1 MB max**
  - payloads over cap are rejected (no silent truncation)
- Handler invokes AI Validation prompt through shared runtime and requires structured-output success before response success.
- Structured report contract is enforced as:
  - `summary` (high-level counts/signal)
  - `issues[]` where each issue includes `category`, `severity`, `affectedRules[]`, `description`, `recommendation`
  - optional generation metadata (`generatedAt`, prompt/model traces when available)
- Canonical V1 issue taxonomy is enforced at the backend boundary:
  - `category`: `correctness | completeness | maintainability | risk`
  - `severity`: `info | warning | error`
- Rule references must be stable and UI-linkable (`ruleIndex`, `targetPath`, or both) via `affectedRules[]`.
- Invalid or schema-nonconforming model output is rejected as `INVALID_MODEL_OUTPUT` (never a partial success payload).
- Feature semantics are advisory-only: AI validation augments deterministic validation but never replaces authoritative engine diagnostics.
- Trigger semantics are manual-only in V1; runtime/handler does not introduce auto-refresh behavior on rule edits.

### Cross-feature suggestion-review hardening contract (FS-074)

FS-074 adds system-level guardrails for all suggestion-producing AI handlers (`explain-rule`, `suggest-expression`, `smart-fix`, `auto-map`, and advisory recommendation-bearing validation flows).

Canonical guarantees:

- Handler/runtime outputs are **review artifacts only**; generated content is never treated as an implicit mutation instruction.
- Success/error/retry/refresh request lifecycles must remain non-mutating; mapping state changes only through explicit UI review actions that invoke mapping mutation APIs separately.
- Validation-invalid suggestion outcomes remain successful review payloads with apply gating metadata (for example `readyToApply: false` + diagnostics) rather than transport errors.
- Stale-guard metadata (for example `ruleVersion`/`ruleHash`) is first-class apply-protection context; stale conflicts resolve as explicit conflict/block outcomes, not silent apply fallthrough.
- Explain Rule remains read-only assistance with no rule-mutation path.

Telemetry and traceability requirements:

- Runtime baseline telemetry (`ai.invoke.start|success|failure`) remains required for all handler invocations.
- Feature-level review audit events (`suggestion_generated`, `suggestion_viewed`, `suggestion_edited`, `suggestion_accepted`, `suggestion_dismissed`, `apply_blocked_invalid`, `apply_blocked_stale`) are required at integration boundaries.
- Correlation continuity is mandatory across feature event -> API envelope -> runtime telemetry using shared identifiers (`requestId`, optional `correlationId`).

### Auto-Map canonical contract (FS-073)

`src/lambda/ai/auto-map.ts` is a canonical thin handler over shared runtime invocation and enforces these production constraints:

- Single endpoint + mode contract:
  - route: `POST /ai/auto-map`
  - request includes `mode: 'section' | 'whole'`
  - section mode scopes generation to a target section path; whole mode scopes generation to full target coverage for the mapping
- Backend owns context retrieval. Client-provided full-schema context blobs are non-canonical.
- Retrieval path is OpenSearch-first over ingested schema nodes (`fieldName` / `path` / `description`) with weighted hybrid lexical scoring and heuristic boosts.
- No direct full-schema prompting path exists as a fallback.
- Large-schema strategy is chunked generation with bounded parallelism:
  - default chunk target: 50–100 target fields per chunk
  - in-Lambda parallel chunk invocation cap: max 4
  - over-budget workloads are delegated to Step Functions orchestration
- Chunk outputs are merged and deduplicated to one target-unique suggestion set.
- Dedup precedence is deterministic:
  1. validation status (`valid` over invalid/parse-failed)
  2. confidence (`high` > `medium` > `low`)
  3. target-type-aware tie-break (scalar-preferred), then stable lexical fallback
- Every candidate suggestion is validation-enriched before success response:
  - normalized `validation` object is attached per suggestion/rule
  - invalid candidates remain reviewable outcomes (not silent drops) unless superseded by deterministic dedup rules
- Minimum Auto-Map telemetry/metadata contract includes:
  - request/run identity: `requestId`, `mappingId`, `mode`
  - chunking: `chunkCount`, `chunkIds`
  - retrieval: `retrievalCandidatesCount`, `retrievalSelectedCount`
  - validation: `validationPassCount`, `validationFailCount`
  - dedup: conflict counters + `dedupDecisions` (winner/loser + reason)
  - per-rule lineage: `sourceChunkRef`
  - timing/model traces: stage durations + model/prompt version when available
- No-context retrieval is a success outcome, not an error:
  - returns zero suggestions with explicit no-context reason metadata for workspace empty-state rendering

Lambda handlers do not:
- Read from DynamoDB directly
- Call the OpenAI SDK directly
- Contain prompt templates or rendering logic
- Manage caching

---

## Local Development

### Configuration

| Environment Variable | Purpose | Default |
|---|---|---|
| `PROMPT_REGISTRY_TABLE` | DynamoDB table name | `integrations-keyra-promptregistry` |
| `PROMPT_REGISTRY_LOCAL_DIR` | Local directory for prompt JSON files | (none — uses DynamoDB if unset) |
| `PROMPT_REGISTRY_ACTIVE_POINTER_ENV` | Environment selector for active-pointer prompt version resolution | (none — pointer override disabled) |
| `DSL_ASSET_BUCKET` | S3 bucket for DSL reference | `integrations-keyra` |
| `DSL_ASSET_KEY` | S3 object key for DSL reference | `prompt-assets/dsl/keyra-dsl-reference.md` |
| `DSL_ASSET_LOCAL_PATH` | Local file path for DSL reference | (none — uses S3 if unset) |
| `GITHUB_MODELS_ENDPOINT` | GitHub Models API base URL | `https://models.inference.ai.azure.com` |
| `GITHUB_TOKEN` | GitHub PAT with Models access | (required) |
| `AI_RUNTIME_MODE` | `local` or `aws` | `aws` |

### Local Mode

When `AI_RUNTIME_MODE=local`:
- `PromptRegistryAdapter` uses the local file adapter (reads from `PROMPT_REGISTRY_LOCAL_DIR`)
- `DslAssetLoader` uses the local file adapter (reads from `DSL_ASSET_LOCAL_PATH`)
- Model client still calls GitHub Models (requires `GITHUB_TOKEN`)

This allows exercising the full orchestration pipeline locally without AWS infrastructure, while still making real AI model calls.

### Test Harness

A simple script or test file can call `invokeAI()` directly:

```typescript
const result = await invokeAI('explain-rule', {
  targetPath: 'Order.Header.DocumentType',
  expression: 'if(lt(source("InvoiceAmount"), 0), "CreditMemo", "Invoice")',
});
console.log(result);
```

---

## Constraints

- The AI runtime has **zero dependency on the mapping engine** (`src/engine/`). It is a backend-only module.
- The AI runtime has **zero dependency on UI code** (`ui/`).
- Lambda handlers import from `src/lib/ai/` — not from each other.
- All AI calls go through API Gateway -> Lambda. The UI never calls GitHub Models directly.
- Browser-side provider invocation is prohibited by dual policy guardrails: UI ESLint restricted imports and path-based static scanning (`scripts/check-ui-ai-guardrails.ts`).
- AI output is **suggestion-only** — no auto-commit to mapping state.
- Step Functions are **not used** for lightweight AI endpoints (explain-rule, suggest-expression, smart-fix).
- Auto-Map may use Step Functions for over-budget large-schema workloads while keeping `invokeAI()` as the per-chunk execution unit.
- Backend mode UI integration must use `HttpAdapter` as the only canonical production adapter path.
- Deprecated shortcut patterns (including HybridAdapter-style alternate routing) are non-canonical.

---

## Schema Query Dependency Contract (AI-adjacent)

Some AI UX flows depend on schema search/query context. The canonical backend contract for schema-node retrieval is:

- Primary path: **OpenSearch-first** query via `searchSchemaNodes(...)`.
- Temporary degraded fallback: PK-scoped DynamoDB fallback is allowed only when `SCHEMA_QUERY_DEGRADED_FALLBACK` is explicitly enabled.
- Fallback use must be instrumented; current handler log marker is:
  - `[schema-query] degraded fallback activated`

This fallback is transitional and is not a second canonical retrieval architecture.

---

## Dependencies

### NPM Packages (new to backend)

- `openai` — OpenAI SDK for GitHub Models inference
- `@aws-sdk/client-dynamodb` — DynamoDB document client
- `@aws-sdk/lib-dynamodb` — DynamoDB document abstraction
- `@aws-sdk/client-s3` — S3 client for DSL asset loading

### Internal

- No imports from `src/engine/`
- No imports from `ui/`

---

## Future Considerations

- **Retrieval evolution**: Auto-Map retrieval is canonical and OpenSearch-first. Future work may tune ranking heuristics or add additional retrieval signals while preserving the same handler/runtime boundaries.
- **Step Functions scaling**: Auto-Map over-budget workloads may be delegated to Step Functions; `invokeAI()` remains the per-chunk execution unit.
- **Prompt authoring UI**: A future admin interface may write to the PromptRegistry table. The runtime only reads from it.
- **Batch field descriptions**: `describe-fields` may need chunking logic for large schemas. This is Lambda-specific logic, not shared runtime logic.
