# SPEC

## Title

Shared AI Runtime for Backend AI Features

---

## ID

FS-031

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-09
Last Updated: 2026-05-09
Type: backend

---

## Status

draft

---

## Revision

Rev: 1

---

## Summary

Implement a shared backend AI runtime layer (`src/lib/ai/`) that provides reusable prompt loading, DSL reference injection, prompt rendering, GitHub Models invocation, structured output parsing, and local testing support. This runtime ensures all AI Lambda handlers remain thin request-handler shells while sharing consistent orchestration logic. The spec delivers the runtime itself plus `aiExplainRule` as the first consumer Lambda.

---

## Problem

KeyRa 2.0 defines six AI endpoints (auto-map, suggest-expression, explain-rule, smart-fix, validate-mappings, describe-fields). Each requires the same core steps: load a versioned prompt from DynamoDB, inject the DSL reference, render placeholders, call GitHub Models with structured output, and parse the response.

Without a shared runtime, each Lambda would independently implement this logic, leading to:
- Duplicated prompt-loading and caching code across 6+ Lambdas
- Inconsistent error handling and response shapes
- Difficulty iterating on prompt content (tightly coupled to Lambda code)
- No local testing path — every change requires deployment to verify

The API Gateway routes and PromptRegistry table are already being set up. Before implementing individual Lambda handlers, a shared runtime is needed to handle the common logic consistently.

---

## Goal

After this spec is implemented:

1. A single `invokeAI(promptId, variables)` function exists that any Lambda can call to execute the full AI pipeline
2. Prompt records are loaded from the PromptRegistry DynamoDB table with 5-minute in-memory caching
3. The DSL reference is loaded from S3 and injected into prompts automatically
4. GitHub Models is called via the OpenAI SDK with structured output support
5. All responses are parsed and returned in a normalized `AIResult<T> | AIError` shape
6. The entire pipeline can run locally without deployed AWS infrastructure (except GitHub Models API)
7. `aiExplainRule` works as a thin Lambda consuming the shared runtime

---

## Assumptions

- The DynamoDB table `integrations-keyra-promptregistry` exists or will be created before Lambda deployment
- The S3 bucket `integrations-keyra` exists with a DSL reference asset under `prompt-assets/dsl/`
- A GitHub PAT with GitHub Models access is available as `GITHUB_TOKEN`
- The PromptRegistry table schema matches PRODUCT-TECHNICAL.md §15.1 (PK=`promptId`, SK=`version`)
- The OpenAI SDK (`openai` npm package) is compatible with GitHub Models when configured with the correct `baseURL`
- The `explain-rule` prompt record will be seeded into the PromptRegistry table before the first end-to-end test

---

## Current Context

### Repository State

The backend source tree currently contains only the mapping engine (`src/engine/`). The `src/lambda/` and `src/lib/` directories do not exist yet — this spec creates them.

The root `package.json` is currently `@keyra/engine` scoped with no AWS SDK dependencies. This spec will add `openai` and AWS SDK packages as dependencies.

### Product Spec References

- **§13 AI Capabilities**: Defines the six AI features, their prompts, model tiers, and structured output expectations
- **§13.5 DSL-Aware Prompting**: Every AI prompt includes the KeyRa DSL syntax reference in the system message
- **§13.6 Structured Output**: All AI features producing machine-parseable results use OpenAI SDK structured output mode
- **§13.8 Prompt Registry**: Versioned prompt templates read at execution time, cached with 5-minute TTL
- **§14.3 AI Lambdas**: All AI Lambdas read prompt configuration from the Prompt Registry at execution time
- **§15.1 PromptRegistry table**: PK=`promptId`, SK=`version`, with fields for systemMessage, userMessageTemplate, model, temperature, responseSchema, maxTokens
- **§16 API Route Map**: `POST /ai/explain-rule` is the route for the first consumer

### GitHub Models Integration

GitHub Models uses the OpenAI SDK with a custom `baseURL`:

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://models.inference.ai.azure.com',
  apiKey: process.env.GITHUB_TOKEN,
});
```

Structured output requires `response_format: { type: 'json_schema', json_schema: { ... } }`. Model IDs use the format `openai/gpt-4.1-mini` or `openai/gpt-4.1`.

### Architecture

No existing architecture document covers this area. This spec introduces a new subsystem. An initial architecture document (`forge/architecture/ai-runtime.md`) is created as part of this planning package.

---

## Scope

### In Scope

- **Types and interfaces** (`src/lib/ai/types.ts`): PromptRecord, AIResult, AIError, AIResponse, PromptRegistryAdapter, DslAssetLoader
- **Configuration module** (`src/lib/ai/config.ts`): environment variable resolution with typed defaults
- **Prompt Registry client** (`src/lib/ai/prompt-registry.ts`): DynamoDB adapter with in-memory caching + local file adapter
- **DSL asset loader** (`src/lib/ai/dsl-asset-loader.ts`): S3 adapter with in-memory caching + local file adapter
- **Prompt renderer** (`src/lib/ai/prompt-renderer.ts`): template placeholder replacement for system and user messages
- **GitHub Models client wrapper** (`src/lib/ai/model-client.ts`): OpenAI SDK integration with structured output
- **Structured output parser** (`src/lib/ai/output-parser.ts`): response validation and error normalization
- **Orchestration entry point** (`src/lib/ai/invoke-ai.ts`): `invokeAI()` function wiring all components
- **Barrel export** (`src/lib/ai/index.ts`): public API surface
- **First consumer Lambda** (`src/lambda/ai/explain-rule.ts`): thin handler for `POST /ai/explain-rule`
- **Tests** for all shared runtime modules
- **Architecture document** (`forge/architecture/ai-runtime.md`): initial document created with planning package; update task for project-structure.md alignment

### Out of Scope

- Building all 6 AI Lambda handlers (only `aiExplainRule` is in scope)
- RAG retrieval pipeline (OpenSearch integration)
- Step Functions orchestration for large auto-map
- Frontend UI for any AI feature
- Prompt authoring or admin UI
- Schema indexing or embedding pipeline
- Deployment workflow (IaC, CDK, SAM) — this spec produces source code only
- Seeding prompt records into DynamoDB (assumed done separately)

---

## Non-Goals

- Replace or modify the mapping engine (`src/engine/`) — the AI runtime has zero dependency on it
- Introduce a state management framework for the backend
- Build a prompt versioning UI
- Support streaming responses (all AI features use complete responses)
- Support models other than GitHub Models (no multi-provider abstraction)
- Implement retry logic with exponential backoff for model calls (future enhancement)

---

## Relevant Areas

- `src/lib/ai/` (new — entire module created by this spec)
- `src/lambda/ai/` (new — first Lambda handler)
- `tests/lambda/ai/` (new — Lambda handler tests)
- `tests/lib/ai/` (new — runtime module tests)
- `package.json` (new dependencies: `openai`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`)
- `forge/architecture/ai-runtime.md` (new architecture document)
- `forge/architecture/project-structure.md` (updated to reflect new directories)
- `forge/architecture/INDEX.md` (updated to include ai-runtime.md)

---

## Dependencies / Blockers

- PromptRegistry DynamoDB table must be provisioned for deployed testing (not required for local testing)
- S3 bucket with DSL reference asset must exist for deployed testing (not required for local testing)
- GitHub PAT with Models access must be available for any model invocation (including local)
- The `explain-rule` prompt record must be seeded into DynamoDB before end-to-end deployed testing

---

## Constraints

- **Serverless AWS backend**: API Gateway -> Lambda -> DynamoDB / S3 (per PRODUCT-TECHNICAL.md §14)
- **GitHub Models via OpenAI SDK**: no alternative AI providers (per §13.1)
- **Temperature = 0**: deterministic output for all AI calls (per §13.8)
- **Prompts are versioned in PromptRegistry**: Lambda code does not contain prompt text (per §13.8)
- **AI output is suggestion-only**: no auto-commit (per §13.7)
- **No API keys in the browser**: all AI calls go through API Gateway -> Lambda (per §14)
- **Mapping engine is pure TypeScript with zero cloud dependencies**: the AI runtime must not introduce cloud dependencies into `src/engine/`
- **No Step Functions for lightweight endpoints**: explain-rule, suggest-expression, smart-fix use direct Lambda invocation
- **TypeScript strict mode**: consistent with the rest of the codebase
- **ESM modules**: consistent with the root `tsconfig.json` (`"module": "NodeNext"`)

---

## Proposed Behavior

### User Flow

This spec does not have a direct user flow — it is a backend infrastructure module. The user-facing flow is:

1. User selects a mapping rule in the Mapping Editor and clicks "Explain"
2. Frontend sends `POST /ai/explain-rule` with `{ targetPath, expression }`
3. API Gateway routes to `aiExplainRule` Lambda
4. Lambda calls `invokeAI('explain-rule', { targetPath, expression })`
5. Runtime loads prompt, injects DSL reference, renders messages, calls GitHub Models, parses response
6. Lambda returns `{ success: true, data: { explanation: "..." } }` or error
7. Frontend displays the explanation

### System Behavior

#### Prompt Loading

1. `invokeAI()` calls `promptRegistry.getLatestPrompt(promptId)`
2. Adapter checks in-memory cache:
   - **Cache hit** (entry exists and age < 5 minutes): return cached `PromptRecord`
   - **Cache miss**: query DynamoDB table `integrations-keyra-promptregistry` with PK=`promptId`, SK descending, Limit=1
3. If no record found: return `AIError` with code `PROMPT_NOT_FOUND`
4. Cache the result with current timestamp

#### DSL Reference Loading

1. `invokeAI()` calls `dslAssetLoader.loadDslReference()`
2. Adapter checks in-memory cache:
   - **Cache hit** (age < 5 minutes): return cached string
   - **Cache miss**: read from S3 bucket `integrations-keyra`, key from `DSL_ASSET_KEY` env var (default: `prompt-assets/dsl/keyra-dsl-reference.md`)
3. Cache the result with current timestamp

#### Prompt Rendering

1. Merge system-managed variables (`{ dslReference }`) with caller-provided variables
2. Replace all `{{key}}` tokens in `systemMessage` with corresponding values
3. Replace all `{{key}}` tokens in `userMessageTemplate` with corresponding values
4. Return rendered system and user message strings

#### Model Invocation

1. Create messages array: `[{ role: 'system', content: renderedSystemMessage }, { role: 'user', content: renderedUserMessage }]`
2. Call `client.chat.completions.create()` with:
   - `model`: from prompt record
   - `temperature`: from prompt record (always 0)
   - `max_tokens`: from prompt record
   - `messages`: rendered messages
   - `response_format`: `{ type: 'json_schema', json_schema: { name: promptId, strict: true, schema: parsedResponseSchema } }`
3. Extract `response.choices[0].message.content`

#### Output Parsing

1. Parse the response content as JSON
2. Return `AIResult<T>` with the parsed data, promptId, model, and usage stats
3. On parse failure: return `AIError` with code `PARSE_ERROR`
4. On model error: return `AIError` with code `MODEL_ERROR`

### Failure / Edge Behavior

| Scenario | Behavior |
|---|---|
| Prompt not found in registry | Return `AIError` with code `PROMPT_NOT_FOUND` |
| DynamoDB unreachable | Return `AIError` with code `REGISTRY_ERROR` |
| S3 asset not found | Return `AIError` with code `ASSET_NOT_FOUND` |
| S3 unreachable | Return `AIError` with code `ASSET_ERROR` |
| GitHub Models returns error | Return `AIError` with code `MODEL_ERROR`, include status code and message |
| GitHub Models rate limited | Return `AIError` with code `MODEL_RATE_LIMITED` |
| Response is not valid JSON | Return `AIError` with code `PARSE_ERROR` |
| Response doesn't match expected schema shape | Return `AIError` with code `PARSE_ERROR`, include details |
| Missing `GITHUB_TOKEN` env var | Return `AIError` with code `CONFIG_ERROR` at invocation time |
| Empty or missing request body in Lambda | Return 400 with validation error |

---

## Acceptance Examples

### AE-01 — Successful explain-rule invocation

**Given**
- PromptRegistry contains an `explain-rule` prompt record at version 3
- The prompt's `systemMessage` includes `{{dslReference}}`
- The prompt's `userMessageTemplate` includes `{{targetPath}}` and `{{expression}}`
- DSL reference is available (S3 or local file)

**When**
- `invokeAI('explain-rule', { targetPath: 'Order.Header.DocumentType', expression: 'if(lt(source("InvoiceAmount"), 0), "CreditMemo", "Invoice")' })` is called

**Then**
- The prompt registry returns the version 3 record
- The DSL reference is injected into the system message
- `targetPath` and `expression` are injected into the user message
- GitHub Models is called with the rendered messages and response schema
- Result is `{ success: true, data: { explanation: "..." }, promptId: 'explain-rule', model: 'openai/gpt-4.1-mini' }`

### AE-02 — Prompt not found

**Given**
- PromptRegistry does not contain a record for `nonexistent-prompt`

**When**
- `invokeAI('nonexistent-prompt', {})` is called

**Then**
- Result is `{ success: false, error: { code: 'PROMPT_NOT_FOUND', message: 'No prompt found for promptId: nonexistent-prompt' }, promptId: 'nonexistent-prompt' }`

### AE-03 — Prompt registry caching

**Given**
- PromptRegistry contains an `explain-rule` prompt record
- `invokeAI('explain-rule', vars)` was called successfully 2 minutes ago

**When**
- `invokeAI('explain-rule', vars)` is called again

**Then**
- The prompt record is served from in-memory cache (no DynamoDB query)
- The DynamoDB adapter's query method is NOT called a second time

### AE-04 — DSL reference caching

**Given**
- DSL reference was loaded from S3 3 minutes ago

**When**
- `invokeAI()` is called again

**Then**
- The DSL reference is served from in-memory cache (no S3 read)

### AE-05 — Cache expiry

**Given**
- The prompt cache entry is 6 minutes old

**When**
- `invokeAI()` is called

**Then**
- The cache entry is treated as expired
- A fresh DynamoDB query is made
- The cache is updated with the new result and timestamp

### AE-06 — Model error handling

**Given**
- GitHub Models returns a 429 rate limit error

**When**
- `invokeAI('explain-rule', vars)` is called

**Then**
- Result is `{ success: false, error: { code: 'MODEL_RATE_LIMITED', message: '...' }, promptId: 'explain-rule' }`

### AE-07 — Structured output parse failure

**Given**
- GitHub Models returns a response that is not valid JSON

**When**
- The output parser processes the response

**Then**
- Result is `{ success: false, error: { code: 'PARSE_ERROR', message: 'Failed to parse model response as JSON' }, promptId: 'explain-rule' }`

### AE-08 — Local mode prompt loading

**Given**
- `AI_RUNTIME_MODE=local`
- `PROMPT_REGISTRY_LOCAL_DIR=./test-prompts`
- File `./test-prompts/explain-rule.json` exists with a valid PromptRecord

**When**
- `invokeAI('explain-rule', vars)` is called

**Then**
- The prompt is loaded from the local JSON file, not from DynamoDB
- The rest of the pipeline (rendering, model call, parsing) proceeds normally

### AE-09 — Local mode DSL reference loading

**Given**
- `AI_RUNTIME_MODE=local`
- `DSL_ASSET_LOCAL_PATH=./test-assets/dsl-reference.md`
- The local file exists with DSL reference content

**When**
- `invokeAI()` is called

**Then**
- The DSL reference is loaded from the local file, not from S3
- The DSL reference text is injected into `{{dslReference}}` in the system message

### AE-10 — Placeholder rendering

**Given**
- System message template: `"You are a DSL expert.\n\nDSL Reference:\n{{dslReference}}"`
- User message template: `"Explain this rule:\nTarget: {{targetPath}}\nExpression: {{expression}}"`
- Variables: `{ targetPath: 'Order.Id', expression: 'source("id")' }`
- DSL reference text: `"# KeyRa DSL v1..."`

**When**
- Prompt rendering is invoked

**Then**
- System message: `"You are a DSL expert.\n\nDSL Reference:\n# KeyRa DSL v1..."`
- User message: `"Explain this rule:\nTarget: Order.Id\nExpression: source(\"id\")"`

### AE-11 — aiExplainRule Lambda handler

**Given**
- API Gateway sends a valid event with body `{ "targetPath": "Order.Id", "expression": "source(\"id\")" }`
- The shared runtime is configured and functional

**When**
- The `aiExplainRule` handler processes the event

**Then**
- Returns status 200 with body containing `{ success: true, data: { explanation: "..." } }`

### AE-12 — aiExplainRule Lambda handler with missing body

**Given**
- API Gateway sends an event with empty body

**When**
- The `aiExplainRule` handler processes the event

**Then**
- Returns status 400 with body containing a validation error

### AE-13 — Dependency injection for testing

**Given**
- A test provides mock adapters for prompt registry and DSL asset loader

**When**
- `invokeAI('explain-rule', vars, { promptRegistry: mockRegistry, dslAssetLoader: mockLoader })` is called

**Then**
- The mock adapters are used instead of the default DynamoDB/S3 adapters
- The test can verify prompt rendering and model invocation without AWS access

---

## Open Questions

- `Q1.` Should the AI runtime validate the model's JSON response against the prompt's `responseSchema` using a JSON Schema validator library (e.g., `ajv`), or is `JSON.parse()` sufficient for the initial implementation? Using `ajv` would catch schema-shape mismatches but adds a dependency. Recommendation: start with `JSON.parse()` only and add schema validation in a follow-up if response quality issues emerge.
- `Q2.` What is the exact S3 object key for the DSL reference asset? The spec recommends `prompt-assets/dsl/keyra-dsl-reference.md` as the default, overridable via `DSL_ASSET_KEY` env var. Confirm this naming convention.
- `Q3.` Should the `openai`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, and `@aws-sdk/client-s3` packages be added to the root `package.json` (which is currently the `@keyra/engine` package), or should the project move to a monorepo structure (e.g., pnpm workspaces) to separate engine from backend? Adding cloud SDKs to the engine package's dependencies would contradict the "zero cloud dependencies" principle for the engine. Recommendation: the engine build (`tsup`) already tree-shakes; however, the cleanest approach is to ensure the engine's published output never bundles these. If the project is not ready for a workspace split, add the dependencies with careful `tsup` configuration. Surface this as an implementation detail for the task agent.

---

## Verification Strategy

### Unit Tests

- **Prompt registry**: test cache hit/miss/expiry behavior with mock DynamoDB; test local file adapter
- **DSL asset loader**: test cache hit/miss/expiry behavior with mock S3; test local file adapter
- **Prompt renderer**: test placeholder replacement for system and user messages; test unreplaced placeholders; test empty variables
- **Model client**: test successful invocation with mocked OpenAI client; test error code mapping for various failure modes
- **Output parser**: test valid JSON parsing; test invalid JSON handling; test empty response handling
- **Orchestration**: test full pipeline with injected mock adapters; test error propagation at each stage
- **aiExplainRule handler**: test request parsing, successful response, validation errors, runtime error propagation

### Integration Tests

- End-to-end test with local mode adapters (mock prompt file + mock DSL file + mocked model client) exercising the full `invokeAI()` pipeline

### Verification Commands

- `pnpm typecheck` passes with zero errors
- `pnpm lint` passes
- `pnpm test` passes — all new test files pass

Map to acceptance examples:
- AE-01, AE-13: unit tests for orchestration with mock adapters
- AE-02: unit test for prompt-not-found error path
- AE-03, AE-04, AE-05: unit tests for caching behavior
- AE-06, AE-07: unit tests for error handling
- AE-08, AE-09: unit tests for local adapters
- AE-10: unit test for prompt renderer
- AE-11, AE-12: unit tests for Lambda handler

---

## Task Generation Notes

This spec decomposes into 8 tasks, all `Agent: task` (no UI work):

1. **T-01: Types, interfaces, and configuration** — foundational types that all other modules depend on. Must be completed first.
2. **T-02: Prompt Registry client** — depends on T-01. Implements both DynamoDB and local adapters with caching.
3. **T-03: DSL asset loader** — depends on T-01. Implements both S3 and local adapters with caching. Can be done in parallel with T-02.
4. **T-04: Prompt renderer** — depends on T-01. Pure function, no I/O. Can be done in parallel with T-02 and T-03.
5. **T-05: GitHub Models client wrapper** — depends on T-01. OpenAI SDK integration. Can be done in parallel with T-02, T-03, T-04.
6. **T-06: Orchestration entry point + output parser** — depends on T-02, T-03, T-04, T-05. Wires all components together.
7. **T-07: aiExplainRule Lambda handler** — depends on T-06. First consumer of the runtime.
8. **T-08: Architecture and project-structure update** — depends on T-06. Update `project-structure.md` and verify `ai-runtime.md` alignment with implementation.

Parallelization: T-02, T-03, T-04, T-05 are independent of each other (all depend only on T-01).

---

## Change Log

- Rev 1 — 2026-05-09
  - Initial draft
