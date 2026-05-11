# AI Runtime Architecture

This document defines the architecture of the shared AI runtime layer — the backend module that provides reusable prompt loading, DSL reference injection, prompt rendering, model invocation, structured output parsing, and local testing support for all AI Lambda handlers.

---

## Overview

The AI runtime is a shared backend library under `src/lib/ai/` consumed by all AI Lambda handlers (`src/lambda/ai/`). It exists so that individual Lambdas remain thin request-handler shells while all AI orchestration logic lives in one place.

The runtime handles:

1. **Prompt Registry access** — loading versioned prompt records from DynamoDB with in-memory caching
2. **DSL asset resolution** — loading the DSL reference from S3 for prompt injection
3. **Prompt rendering** — replacing template placeholders in system and user messages
4. **Model invocation** — calling GitHub Models via the OpenAI SDK with structured output support
5. **Output parsing** — validating and normalizing structured AI responses
6. **Orchestration** — a single `invokeAI()` entry point that wires steps 1–5 into a reusable pipeline

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

1. Parse the API Gateway event body
2. Call `invokeAI(promptId, variables)` from the shared runtime
3. Return the structured response or error

Handlers do not contain prompt logic, caching logic, or model configuration.

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
    code: string;          // e.g., 'PROMPT_NOT_FOUND', 'MODEL_ERROR', 'PARSE_ERROR'
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

### Caching

- In-memory `Map<string, { record: PromptRecord; fetchedAt: number }>` cache
- TTL: 5 minutes (300,000 ms)
- Cache key: `promptId`
- On cache miss or expiry: query DynamoDB, update cache
- Cache is per-Lambda-instance (cold start resets cache)

### Local Adapter

Reads prompt records from local JSON files under a configurable directory. File naming convention: `{promptId}.json`. Each file contains a single `PromptRecord` object. This allows local development without DynamoDB access.

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
   - `{{targetPath}}`, `{{expression}}`, `{{instruction}}`, `{{sourceContext}}`, etc.
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

Model errors (rate limits, invalid requests, network failures) are caught and normalized into `AIError` with appropriate error codes.

Implemented error mapping:
- `429` → `MODEL_RATE_LIMITED`
- `401` / `403` → `MODEL_ERROR` (authentication context)
- `400` → `MODEL_ERROR` (request validation context)
- Other/network failures → `MODEL_ERROR`

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
  ├── 2. Load DSL reference (via DslAssetLoader)
  │       └── Cache hit? Return cached. Miss? Read from S3.
  │
  ├── 3. Render messages (via prompt-renderer)
  │       ├── System message: inject {{dslReference}} + any system-level vars
  │       └── User message: inject request-scoped vars ({{expression}}, etc.)
  │
  ├── 4. Invoke model (via model-client)
  │       └── GitHub Models → structured output → raw response
  │
  └── 5. Parse output (via output-parser)
          └── Validate against responseSchema → AIResult<T> or AIError
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

Implemented status mapping in `explain-rule` and `suggest-expression` handlers:
- `PROMPT_NOT_FOUND` → `404`
- `MODEL_RATE_LIMITED` → `429`
- `VALIDATION_ERROR` → `400`
- all other runtime errors → `500`

The `suggest-expression` handler keeps the same response/error mapping conventions while validating a different required-field set (`instruction`, `targetPath`, `targetType`, `sourceContext`) and invoking promptId `nl-to-rule`.

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
- AI output is **suggestion-only** — no auto-commit to mapping state.
- Step Functions are **not used** for lightweight AI endpoints (explain-rule, suggest-expression, smart-fix). Step Functions are reserved for future long-running operations like large-schema auto-map.

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

- **RAG integration**: Auto-map and smart-fix will add OpenSearch retrieval to the orchestration pipeline. This will be an additional step between prompt loading and rendering — the architecture is designed to accommodate it.
- **Step Functions**: Large auto-map operations may use Step Functions for parallel chunk processing. The shared runtime's `invokeAI()` will remain the per-chunk execution unit.
- **Prompt authoring UI**: A future admin interface may write to the PromptRegistry table. The runtime only reads from it.
- **Batch field descriptions**: `describe-fields` may need chunking logic for large schemas. This is Lambda-specific logic, not shared runtime logic.
