# SPEC

## Title

Backend-Backed HttpAdapter with Transparent Adapter Bootstrap

---

## ID

FS-055

---

## Metadata

Owner: @christophervuu  
Reviewers: TBD  
Created: 2026-05-14  
Last Updated: 2026-05-14  
Type: cross-cutting

---

## Status

ready

---

## Revision

Rev: 2

---

## Summary

Implement a typed `HttpAdapter` that fulfills the `ApiAdapter` contract for project, mapping, and schema CRUD operations over HTTP, and update the adapter bootstrap logic so that `VITE_API_URL` present selects `HttpAdapter` (replacing `HybridAdapter`) while absent continues to select `LocalStorageAdapter`. The full UI must continue to work without component-level changes, preserving offline/local behavior when no backend is configured. Error normalization ensures the UI's `AppError`/`AsyncState` model receives consistent, retryable failure information from HTTP responses.

---

## Problem

Today, the `HybridAdapter` routes only three AI showcase methods to HTTP while all CRUD operations remain localStorage-backed. Phase 1 requires a real backend for projects, mappings, schemas, and versions, but the current adapter stack has no HTTP implementation for these domains. Without a dedicated `HttpAdapter`, backend concerns will leak into feature components, degrading authoring speed and making Phase 1 integration brittle.

---

## Goal

When `VITE_API_URL` is configured, the application transparently routes all project/mapping/schema/version CRUD through HTTP endpoints while the UI layer remains unchanged. Developers without a backend continue using `LocalStorageAdapter` with no behavioral difference. The adapter abstraction boundary (`ApiAdapter`) remains the single stable contract for all data access.

---

## Assumptions

- Backend API endpoints will be RESTful and return JSON responses using a canonical envelope: `{ success: true, data: T }` for success and `{ success: false, error: { code, message } }` for failures. This matches the existing AI endpoint envelope and reduces adapter complexity.
- Backend returns full-array responses for list endpoints (no pagination in initial Phase 1 increment).
- Backend provides immediate read-after-write consistency for CRUD operations.
- Auth/session concerns will be handled at a transport layer (e.g., auth headers injected via middleware/interceptor) without changing `ApiAdapter` method signatures — that work is out of scope for this spec.
- The existing AI HTTP client pattern (`ai-api-client.ts`) can be extended or adapted for CRUD operations.
- AI methods are a Phase 2 concern and remain as placeholders in `HttpAdapter`; `HybridAdapter` behavior is not absorbed.

---

## Current Context

### Adapter Stack

- `ApiAdapter` interface (`ui/src/lib/api/types.ts`) defines ~40 methods across schemas, mappings, versions, projects, templates, deployment, GitHub, AI, search, activity, and preview.
- `LocalStorageAdapter` implements all methods using browser localStorage; AI/GitHub/preview methods throw `"Not available in offline mode"`.
- `HybridAdapter` extends `LocalStorageAdapter`, overriding only `explainRule`, `suggestExpression`, and `autoMapSection` to route to HTTP.
- `createAdapter()` in `bootstrap.ts` selects `HybridAdapter` when `VITE_API_URL` is set, `LocalStorageAdapter` when not.

### Error Model

- `AppError` (`ui/src/lib/state/app-error.ts`) is the normalized error shape for UI async failures (`message`, `code?`, `statusCode?`, `retryable`).
- `toAppError()` converts arbitrary errors to `AppError`.
- `AsyncState<T>` has an `error` status carrying `AppError` and `retryable` flag.
- Current AI client throws plain `Error` objects with user-friendly messages; `toAppError()` converts these with `retryable: true` default.

### Bootstrap Flow

`main.tsx` calls `createAdapter()` once at startup and passes the result to `AdapterProvider`. All components access the adapter via `useAdapter()`.

---

## Scope

### In Scope

- New `HttpAdapter` class implementing `ApiAdapter` for:
  - Schema CRUD (`listSchemas`, `getSchema`, `createSchema`, `updateSchema`, `deleteSchema`)
  - Mapping CRUD (`listMappings`, `getMapping`, `createMapping`, `updateMapping`, `deleteMapping`, `duplicateMapping`)
  - Mapping versions (`listMappingVersions`, `getMappingVersion`, `saveMappingVersion`)
  - Project CRUD (`listProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject`)
- HTTP client utility module for CRUD operations (fetch wrapper with timeout, error normalization, response envelope parsing, and automatic retry for transient failures)
- Error normalization layer that produces errors compatible with `toAppError()` (with `statusCode`, `code`, and `retryable` fields)
- Updated `createAdapter()` bootstrap to select `HttpAdapter` when `VITE_API_URL` is present
- Safe placeholder implementations for methods not covered by CRUD (AI, GitHub, deployment, templates, search, activity, preview) — these throw structured "not implemented" errors consistent with `AppError`
- Preservation of `HybridAdapter` for backward compatibility (not deleted, but no longer selected by bootstrap; formally deprecated with dev-only console warning)
- Unit tests for `HttpAdapter` CRUD methods and error normalization
- Verification that existing E2E/integration tests pass unchanged when backend mode is configured with a test server

### Out of Scope

- Backend API endpoint implementation (assumed to exist or be mocked)
- Authentication/authorization injection into requests
- Pagination support for list endpoints
- AI method HTTP implementations beyond existing showcase methods (covered by separate spec)
- GitHub integration, deployment, template, search, activity, or preview endpoint implementations
- Optimistic update strategies or cache layers
- Component-level changes of any kind

---

## Non-Goals

- This spec does not attempt to implement a full backend-compatible adapter for all 40+ methods. It covers CRUD domains that are the backbone of UI data flow.
- This spec does not define backend API design — it assumes backend endpoints conform to existing domain type shapes.
- This spec does not introduce middleware, interceptors, or auth header injection.
- This spec does not change the `ApiAdapter` interface itself.

---

## Relevant Areas

- `ui/src/lib/api/types.ts` — ApiAdapter contract (read-only, no changes)
- `ui/src/lib/api/bootstrap.ts` — adapter selection logic (modified)
- `ui/src/lib/api/http-adapter.ts` — new HttpAdapter implementation
- `ui/src/lib/api/http-client.ts` — new HTTP utility module
- `ui/src/lib/api/hybrid-adapter.ts` — retained but no longer selected
- `ui/src/lib/api/ai-api-client.ts` — existing HTTP patterns (reference)
- `ui/src/lib/state/app-error.ts` — error shape (read-only, no changes)
- `ui/src/main.tsx` — bootstrap call site (no changes expected)
- `ui/src/lib/api/adapter-provider.tsx` — provider (no changes expected)

---

## Dependencies / Blockers

- FS-054 (Architecture Reconciliation) should be complete to ensure architecture docs are current — not a hard blocker but reduces re-work risk.
- A running backend or mock server is needed for integration testing but not for implementation (unit tests can use fetch mocking).

---

## Constraints

- `ApiAdapter` interface must not be modified.
- No component-level code may change.
- `LocalStorageAdapter` must remain fully functional when `VITE_API_URL` is absent.
- `HttpAdapter` must produce errors that `toAppError()` can normalize to `AppError` with correct `retryable`, `statusCode`, and `code` fields.
- Existing `HybridAdapter` must not be deleted (backward compatibility for references).
- TypeScript strict mode must remain clean.
- `pnpm build` and `pnpm typecheck` in `ui/` must pass.

---

## Proposed Behavior

### User Flow

From the user's perspective, nothing changes. When the app is configured with a backend URL (`VITE_API_URL`), data loads from the server instead of localStorage. When not configured, the app behaves exactly as Phase 0. There is no visible UI indicator of adapter mode (though one could be added later).

### System Behavior

#### Bootstrap Selection

```
createAdapter():
  if VITE_API_URL is set and non-empty:
    return new HttpAdapter(VITE_API_URL)
  else:
    return new LocalStorageAdapter()
```

#### HttpAdapter CRUD Implementation

Each CRUD method:
1. Calls the HTTP client utility with the appropriate method/path/body
2. Receives the parsed response body (typed domain object extracted from envelope)
3. Returns it directly to the caller

HTTP client utility:
1. Constructs fetch request with JSON headers and configurable timeout (default 10s)
2. On success (2xx): parses JSON envelope (`{ success: true, data: T }`), extracts and returns typed `data`
3. On retryable error (429/502/503/504 or network failure): retries with exponential backoff (max 3 attempts, base delay 500ms)
4. On non-retryable error (400/401/403/404/409): extracts error details from envelope (`{ success: false, error: { code, message } }`), constructs `HttpClientError`
5. On network failure after retries exhausted: wraps with network-specific error message and `retryable: true`

#### Response Envelope Contract

All backend endpoints use a canonical envelope:

```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": { "code": "RESOURCE_NOT_FOUND", "message": "Project not found" } }
```

HTTP status codes remain semantically meaningful (200/201 for success, 400/404/409/500 for failures). The response body always uses the envelope format. The HTTP client extracts `data` from success envelopes and maps `error.code`/`error.message` into `HttpClientError` fields for failure envelopes.

#### Retry Strategy

The HTTP client implements automatic retry with exponential backoff for transient failures:

- **Retried status codes:** 429, 502, 503, 504
- **Retried conditions:** network failures (TypeError from fetch), abort/timeout
- **Not retried:** 400, 401, 403, 404, 409, 5xx other than 502/503/504
- **Max attempts:** 3 (1 initial + 2 retries)
- **Backoff:** exponential with jitter — base 500ms, multiplied by attempt (500ms, 1000ms)
- **Mutating requests (POST/PUT/DELETE):** retried only for 429/502/503/504 (idempotent-safe in KeyRa's versioned model); network failures on mutations are **not** retried automatically

#### Endpoint Mapping Convention

| Method | HTTP | Path |
|---|---|---|
| `listSchemas()` | GET | `/schemas` |
| `getSchema(id)` | GET | `/schemas/:id` |
| `createSchema(input)` | POST | `/schemas` |
| `updateSchema(id, input)` | PUT | `/schemas/:id` |
| `deleteSchema(id)` | DELETE | `/schemas/:id` |
| `listMappings(projectId)` | GET | `/projects/:projectId/mappings` |
| `getMapping(id)` | GET | `/mappings/:id` |
| `createMapping(input)` | POST | `/mappings` |
| `updateMapping(id, config)` | PUT | `/mappings/:id` |
| `deleteMapping(id)` | DELETE | `/mappings/:id` |
| `duplicateMapping(id, newName)` | POST | `/mappings/:id/duplicate` |
| `listMappingVersions(mappingId)` | GET | `/mappings/:mappingId/versions` |
| `getMappingVersion(mappingId, version)` | GET | `/mappings/:mappingId/versions/:version` |
| `saveMappingVersion(mappingId, entry)` | POST | `/mappings/:mappingId/versions` |
| `listProjects()` | GET | `/projects` |
| `getProject(id)` | GET | `/projects/:id` |
| `createProject(input)` | POST | `/projects` |
| `updateProject(id, input)` | PUT | `/projects/:id` |
| `deleteProject(id)` | DELETE | `/projects/:id` |

#### Non-CRUD Placeholder Methods

All non-CRUD methods (AI, GitHub, deployment, templates, search, activity, preview) throw an `AdapterMethodNotImplementedError` with:
- `message`: `"{methodName}" is not yet available in HTTP mode.`
- `code`: `"NOT_IMPLEMENTED"`
- `retryable`: `false`

This allows the UI's error model to display a meaningful message rather than crashing.

### Failure / Edge Behavior

| Scenario | Behavior |
|---|---|
| Network unreachable | Error with `retryable: true`, user-friendly message |
| Request timeout (10s default) | Error with `retryable: true`, timeout-specific message |
| 400 Bad Request | Error with `retryable: false`, `statusCode: 400`, server message if available |
| 401 Unauthorized | Error with `retryable: false`, `statusCode: 401`, auth-related message |
| 403 Forbidden | Error with `retryable: false`, `statusCode: 403` |
| 404 Not Found | Error with `retryable: false`, `statusCode: 404`, resource-not-found message |
| 409 Conflict | Error with `retryable: false`, `statusCode: 409`, conflict message |
| 429 Rate Limited | Error with `retryable: true`, `statusCode: 429`, rate-limit message |
| 500+ Server Error | Error with `retryable: true`, `statusCode`, generic server error message |
| Malformed JSON response | Error with `retryable: false`, parse-error message |
| `VITE_API_URL` malformed | `HttpAdapter` construction throws immediately (caught at bootstrap) |

---

## Acceptance Examples

### AE-01 — CRUD operations route through HTTP when VITE_API_URL is set

**Given**
- `VITE_API_URL` is set to `http://localhost:3001/api`
- Backend is running and responds to requests

**When**
- `createAdapter()` is called
- The returned adapter's `listProjects()` is invoked

**Then**
- A GET request is made to `http://localhost:3001/api/projects`
- The response body is returned as `ProjectMetadata[]`
- No localStorage is read or written

### AE-02 — LocalStorageAdapter selected when VITE_API_URL is absent

**Given**
- `VITE_API_URL` is not set (or empty string)

**When**
- `createAdapter()` is called

**Then**
- A `LocalStorageAdapter` instance is returned
- No HTTP requests are made for any operation

### AE-03 — HTTP errors are normalized to AppError-compatible shape

**Given**
- `VITE_API_URL` is set
- Backend returns 404 for `getProject("nonexistent")`

**When**
- `adapter.getProject("nonexistent")` is called

**Then**
- An error is thrown with `statusCode: 404`, `retryable: false`
- `toAppError(error)` produces an `AppError` with the same fields

### AE-04 — Network failures produce retryable errors

**Given**
- `VITE_API_URL` is set to a non-reachable URL

**When**
- `adapter.listSchemas()` is called

**Then**
- An error is thrown with `retryable: true`
- `toAppError(error)` produces an `AppError` with message indicating network issue

### AE-05 — Non-CRUD methods throw structured not-implemented errors

**Given**
- `VITE_API_URL` is set
- `HttpAdapter` is active

**When**
- `adapter.deploy(mappingId, "DEV")` is called

**Then**
- Error is thrown with `code: "NOT_IMPLEMENTED"`, `retryable: false`
- UI error surfaces display meaningful "not yet available" messaging

### AE-06 — Existing E2E tests pass unchanged in backend mode

**Given**
- A test backend/mock server is running at `VITE_API_URL`
- The mock server implements all CRUD endpoints with compatible responses

**When**
- Existing E2E tests execute against the app in backend mode

**Then**
- All tests pass without modification
- No localStorage CRUD artifacts are created

---

## Open Questions

- none

### Resolved Decisions

- **Q1 (AI method absorption):** AI methods remain as placeholders in `HttpAdapter`. `HybridAdapter` functionality is not absorbed. AI is a Phase 2 concern with a separate spec.
- **Q2 (Error envelope):** Canonical envelope for all backend endpoints: `{ success: true, data: T }` / `{ success: false, error: { code, message } }`. CRUD and AI endpoints use the same format.
- **Q3 (Retry logic):** Include simple exponential backoff retry for 429/502/503/504 and network failures. Do not retry 400/401/403/404/409. Mutating requests only retry for server-indicated transient errors (not network failures).
- **Q4 (HybridAdapter deprecation):** Formally deprecated with dev-only console warning on instantiation. Not removed until AI/adapter strategy resolved in a later spec.
- **Q5 (CRUD timeout):** Default 10 seconds. Per-method override available if needed.

---

## Verification Strategy

- **Unit tests** for `HttpAdapter`: mock `fetch` globally, verify each CRUD method makes correct HTTP request and returns parsed response. Cover all AE-01 through AE-05 scenarios.
- **Unit tests** for HTTP client utility: verify error normalization for all HTTP status codes and network failure conditions.
- **Unit tests** for updated `createAdapter()`: verify selection logic for both branches.
- **TypeScript typecheck**: `pnpm typecheck` must pass clean in `ui/`.
- **Build**: `pnpm build` must produce a clean bundle.
- **Integration/E2E** (AE-06): Run existing E2E test suite against a mock backend to verify UI works unchanged. This may require a simple mock server fixture.

---

## Task Generation Notes

This is a cross-cutting spec but all implementation is within `ui/src/lib/api/` (no React components are touched). Tasks should be:

1. **HTTP client utility** (`task` agent) — the foundational fetch wrapper with error normalization, timeout, and response parsing
2. **HttpAdapter CRUD implementation** (`task` agent) — the adapter class implementing all CRUD methods using the HTTP client
3. **HttpAdapter non-CRUD placeholders** (`task` agent) — safe placeholder throws for all remaining methods
4. **Bootstrap update** (`task` agent) — modify `createAdapter()` to select `HttpAdapter` instead of `HybridAdapter`
5. **Unit tests** (`task` agent) — comprehensive test coverage for HTTP client, HttpAdapter, and bootstrap
6. **Architecture update** (`task` agent) — update `ui-application.md` to reflect `HttpAdapter` as the new backend-mode adapter and updated bootstrap behavior

Tasks are sequenced: T-01 → T-02 → T-03 → T-04 (dependencies chain). T-05 can begin after T-02. T-06 runs last.

---

## Change Log

- Rev 2 — 2026-05-14
  - All open questions resolved (Q1–Q5)
  - Added canonical envelope contract to Proposed Behavior
  - Added retry strategy with exponential backoff to Proposed Behavior and Scope
  - Added HybridAdapter formal deprecation to Scope
  - Updated Assumptions to reflect envelope and AI placeholder decisions
  - Status → ready
- Rev 1 — 2026-05-14
  - Initial draft
