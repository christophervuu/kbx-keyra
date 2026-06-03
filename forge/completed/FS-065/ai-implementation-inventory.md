# FS-065 — AI Implementation Inventory (T-01)

Created: 2026-06-02  
Spec: FS-065 Rev 2  
Task: T-01

---

## Purpose

Inventory all existing AI-related implementation surfaces and dependencies across UI, adapter/client, backend handlers, shared runtime/prompt logic, and schema-query integration points.

This document is descriptive only (no drift classification, no decisions).

---

## Discovery Coverage

Repository discovery was validated via broad glob/grep sweeps over:

- `ui/src/lib/api/*`
- `ui/src/features/mappings/{components,hooks}/*`
- `src/lambda/ai/*`
- `src/lib/ai/*`
- `src/lambda/schema/query-schema-nodes.ts`
- `src/lib/schema/opensearch/*`
- `tests/lambda/ai/*`
- `tests/lib/ai/*`
- `ui/src/lib/api/__tests__/*`

Key discovery findings used for completeness checks:

- `ApiAdapter` AI methods found in `ui/src/lib/api/types.ts`
- AI lambdas present: `auto-map.ts`, `suggest-expression.ts`, `explain-rule.ts`
- Shared runtime modules present in `src/lib/ai/` (9 files)
- OpenSearch query module exists in `src/lib/schema/opensearch/query.ts`
- Schema query handler currently implemented at `src/lambda/schema/query-schema-nodes.ts`

---

## A) AI Feature Surface Inventory (UI)

### A1. AI entry points in Mapping UI

| Surface | Location | Triggered behavior |
|---|---|---|
| Suggest button (`ai-suggest-btn`) | `ui/src/features/mappings/components/ScalarFieldBuilder.tsx` | Opens `useSuggestExpression` flow; submits `adapter.suggestExpression(...)` |
| Explain button (`ai-explain-btn`) | `ui/src/features/mappings/components/ScalarFieldBuilder.tsx` | Triggers `useExplainRule`; calls `adapter.explainRule(...)` |
| Fix button (`ai-fix-btn`) | `ui/src/features/mappings/components/ScalarFieldBuilder.tsx` | Disabled placeholder (no active `smartFix` call) |
| Suggest flow in chain UI | `ui/src/features/mappings/components/ChainBuilderShell.tsx` | Uses `useSuggestExpression` |
| Explain flow in chain UI | `ui/src/features/mappings/components/ChainBuilderShell.tsx` | Uses `useExplainRule` |
| Auto-Map workspace mode | `ui/src/routes/pages/MappingEditor.tsx` + `ui/src/features/mappings/components/AutoMapWorkspace.tsx` | Uses `useAutoMapWorkspace`, which calls `adapter.autoMapSection(...)` |
| Legacy Auto-Map drawer (unwired) | `ui/src/features/mappings/components/AutoMapReviewDrawer.tsx` + commented route usage in `MappingEditor.tsx` | Legacy review surface retained in code, not active composition |

### A2. AI hooks currently in use

| Hook | Location | Adapter method(s) invoked |
|---|---|---|
| `useExplainRule` | `ui/src/features/mappings/hooks/use-explain-rule.ts` | `adapter.explainRule(input)` |
| `useSuggestExpression` | `ui/src/features/mappings/hooks/use-suggest-expression.ts` | `adapter.suggestExpression(input)` |
| `useAutoMapWorkspace` (active) | `ui/src/features/mappings/hooks/use-auto-map-workspace.ts` | `adapter.autoMapSection(input)` |
| `useAutoMapReview` (legacy/exported) | `ui/src/features/mappings/hooks/use-auto-map-review.ts` | `adapter.autoMapSection(input)` |

---

## B) Adapter and API-Client Inventory

### B1. Bootstrap selection (runtime adapter root)

- `ui/src/lib/api/bootstrap.ts`
  - If `VITE_API_URL` exists → `new HttpAdapter(apiUrl)`
  - Else → `new LocalStorageAdapter()`
- `HybridAdapter` is still exported from `ui/src/lib/api/index.ts`, but **not** selected by bootstrap.

### B2. API adapter method-to-path map (AI methods only)

| ApiAdapter method | Declared in | HttpAdapter | LocalStorageAdapter | HybridAdapter | API client helper |
|---|---|---|---|---|---|
| `autoMap(input)` | `ui/src/lib/api/types.ts` | `NOT_IMPLEMENTED` throw | offline-mode throw | inherits offline throw | none |
| `autoMapSection(input)` | `ui/src/lib/api/types.ts` | `NOT_IMPLEMENTED` throw | offline-mode throw | implemented via HTTP | `autoMapSectionHttp()` |
| `suggestExpression(input)` | `ui/src/lib/api/types.ts` | `NOT_IMPLEMENTED` throw | offline-mode throw | implemented via HTTP | `suggestExpressionHttp()` |
| `explainRule(input)` | `ui/src/lib/api/types.ts` | `NOT_IMPLEMENTED` throw | offline-mode throw | implemented via HTTP | `explainRuleHttp()` |
| `smartFix(input)` | `ui/src/lib/api/types.ts` | `NOT_IMPLEMENTED` throw | offline-mode throw | inherits offline throw | none |
| `validateMappings(input)` | `ui/src/lib/api/types.ts` | `NOT_IMPLEMENTED` throw | offline-mode throw | inherits offline throw | none |

Additional adapter error primitive:

- `ui/src/lib/api/errors.ts`
  - `AdapterMethodNotImplementedError`
  - `code = 'NOT_IMPLEMENTED'`

### B3. AI HTTP endpoint calls currently implemented in UI API client

From `ui/src/lib/api/ai-api-client.ts`:

| Helper | Endpoint | Timeout |
|---|---|---|
| `explainRuleHttp(apiUrl, input)` | `POST {apiUrl}/ai/explain-rule` | 15s |
| `suggestExpressionHttp(apiUrl, input)` | `POST {apiUrl}/ai/suggest-expression` | 30s |
| `autoMapSectionHttp(apiUrl, input)` | `POST {apiUrl}/ai/auto-map` | 60s |

No client helpers currently exist for:

- `autoMap` (non-section)
- `smartFix`
- `validateMappings`

---

## C) Backend AI Handler Inventory

### C1. Lambda handlers

| Handler | File | invokeAI promptId | Request validation shape |
|---|---|---|---|
| Explain Rule | `src/lambda/ai/explain-rule.ts` | `explain-rule` | requires `targetPath`, `expression` |
| Suggest Expression | `src/lambda/ai/suggest-expression.ts` | `nl-to-rule` | requires `instruction`, `targetPath`, `targetType`, `sourceContext`; optional `targetDescription` |
| Auto-Map | `src/lambda/ai/auto-map.ts` | `auto-map` | requires `targetSection` or `sectionPath`, and `sourceContext`; optional `businessContext` |

### C2. Handler contract conventions observed

Common across AI lambdas:

- local `APIGatewayProxyEvent`/`APIGatewayProxyResult` definitions
- local `jsonResponse(...)` helper with CORS headers
- AI error → status mapping using `AIErrorCode` (`PROMPT_NOT_FOUND`, `MODEL_RATE_LIMITED`, `VALIDATION_ERROR`, default 500)
- all call `invokeAI(...)` from `src/lib/ai/index.ts`

Auto-map-specific additions:

- imports and uses engine parser/registry (`parse`, `registerAllFunctions`, `defaultRegistry`) for expression validation/normalization
- request/response logging scaffolding with summarized payloads

---

## D) Shared AI Runtime + Prompt Logic Inventory

### D1. Runtime module files (`src/lib/ai/`)

- `types.ts`
- `config.ts`
- `prompt-registry.ts`
- `dsl-asset-loader.ts`
- `prompt-renderer.ts`
- `model-client.ts`
- `output-parser.ts`
- `invoke-ai.ts`
- `index.ts`

### D2. Core runtime responsibilities (file-level)

| Module | Responsibility |
|---|---|
| `config.ts` | Load env/runtime config (`AI_RUNTIME_MODE`, tokens, table/bucket refs) |
| `prompt-registry.ts` | Prompt loading adapters (Dynamo/local), cached reads |
| `dsl-asset-loader.ts` | DSL reference loading adapters (S3/local), cached reads |
| `prompt-renderer.ts` | Template variable injection |
| `model-client.ts` | OpenAI SDK / GitHub Models invocation, structured output request |
| `output-parser.ts` | Parse model JSON to `AIResponse<T>` |
| `invoke-ai.ts` | Orchestrate end-to-end runtime flow |
| `types.ts` | `PromptRecord`, `AIResponse`, adapters, error codes |
| `index.ts` | Public runtime exports |

### D3. Runtime dependency notes

- Prompt + DSL asset caches use 5-minute TTL in adapter modules.
- Runtime supports local and AWS modes through adapter factories.
- `invokeAI()` uses default singleton adapters/model client unless overridden.
- AI error code set (runtime types): `PROMPT_NOT_FOUND`, `REGISTRY_ERROR`, `ASSET_NOT_FOUND`, `ASSET_ERROR`, `MODEL_ERROR`, `MODEL_RATE_LIMITED`, `PARSE_ERROR`, `CONFIG_ERROR`, `VALIDATION_ERROR`.

---

## E) Schema-Query Dependency Inventory (AI-adjacent)

### E1. Schema query endpoint currently used by backend API

- `src/lambda/schema/query-schema-nodes.ts`
  - validates schema existence in `SCHEMAS_TABLE`
  - queries `SCHEMA_NODES_TABLE` by PK (`schemaId`)
  - filters substring matches in-memory (`path` / `fieldName`)
  - returns up to 50 results

### E2. OpenSearch query module present but not wired into handler path

- `src/lib/schema/opensearch/query.ts`
  - exports `searchSchemaNodes(schemaId, query, filters?, limit?)`
  - uses `OPENSEARCH_ENDPOINT`
  - applies schemaId filter clause in query

Current wiring evidence:

- `searchSchemaNodes(...)` appears only in its own module export; no lambda handler usage found in `src/lambda/**`.
- `query-schema-nodes.ts` uses Dynamo query helper, not OpenSearch helper.

### E3. AI handlers and schema retrieval coupling

- Current AI lambdas (`explain-rule`, `suggest-expression`, `auto-map`) do **not** call schema query backends directly.
- Current AI UI flows provide context directly from parsed UI schema state (`sourceContext` string), especially in suggest/auto-map flows.

---

## F) Tests + Fixtures Inventory (AI)

### F1. Lambda AI tests

- `tests/lambda/ai/explain-rule.test.ts`
- `tests/lambda/ai/suggest-expression.test.ts`
- `tests/lambda/ai/auto-map.test.ts`
- AI request/assertion fixtures under `tests/lambda/ai/fixtures/**`

### F2. Shared runtime tests

- `tests/lib/ai/config.test.ts`
- `tests/lib/ai/types.test.ts`
- `tests/lib/ai/prompt-registry.test.ts`
- `tests/lib/ai/dsl-asset-loader.test.ts`
- `tests/lib/ai/prompt-renderer.test.ts`
- `tests/lib/ai/model-client.test.ts`
- `tests/lib/ai/output-parser.test.ts`
- `tests/lib/ai/invoke-ai.test.ts`
- `tests/lib/ai/integration.test.ts`
- Local-runtime fixtures: `tests/lib/ai/fixtures/local-runtime/{explain-rule.json,nl-to-rule.json,auto-map.json,dsl-reference.md}`

### F3. UI API-client / adapter AI tests

- `ui/src/lib/api/__tests__/ai-api-client.test.ts`
- `ui/src/lib/api/__tests__/hybrid-adapter.test.ts`
- Additional HttpAdapter placeholder behavior tests in `ui/src/lib/api/http-adapter.test.ts`

---

## G) Reachability Snapshot (Current)

### G1. Default app runtime reachability via bootstrap

| Runtime mode | Adapter selected | AI method behavior snapshot |
|---|---|---|
| `VITE_API_URL` unset | `LocalStorageAdapter` | AI methods throw offline-mode errors |
| `VITE_API_URL` set | `HttpAdapter` | AI methods currently `NOT_IMPLEMENTED` throws (including explain/suggest/autoMapSection) |

### G2. Non-bootstrap AI path retained in code

- `HybridAdapter` remains implemented/exported and provides HTTP overrides for:
  - `explainRule`
  - `suggestExpression`
  - `autoMapSection`
- This path is not selected by `createAdapter(...)` but exists in code/tests.

---

## H) Inventory Completeness Checklist

- [x] UI AI surfaces inventoried (buttons, workspace/drawer, hooks)
- [x] Adapter + API client pathways inventoried
- [x] Every AI `ApiAdapter` method mapped to current implementation/path status
- [x] AI Lambda handlers inventoried
- [x] Shared runtime modules inventoried
- [x] Prompt/runtime fixture and test coverage locations inventoried
- [x] Schema-query dependencies inventoried (Dynamo handler path + OpenSearch module presence)

---

## I) Direct Inputs for T-02/T-03

This inventory establishes concrete analysis inputs for next tasks:

1. Canonical-vs-legacy adapter path split (`HttpAdapter` placeholders vs retained `HybridAdapter` HTTP overrides).
2. Missing canonical implementations for `autoMap`, `suggestExpression`, `explainRule`, `smartFix`, `validateMappings` in `HttpAdapter`.
3. Schema query stack mismatch between OpenSearch module availability and active Dynamo query handler path.
4. Legacy but still-exported Auto-Map review surfaces (`useAutoMapReview`, `AutoMapReviewDrawer`) alongside active workspace path.
