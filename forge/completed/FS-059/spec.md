# SPEC

## Title

Backend Error Handling, Retry UX Compatibility, and Phase 1 Resilience

---

## ID

FS-059

---

## Metadata

Owner: @christophervuu  
Reviewers: TBD  
Created: 2026-05-14  
Last Updated: 2026-05-14  
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Define and implement the resilience layer for Phase 1 backend communication: a standard error envelope from backend handlers, retryable/non-retryable error classification consumed by the HttpAdapter, UI-facing recovery flows using `AsyncState` that allow retry without page reloads or local state corruption, optimistic update rollback semantics, partial failure handling for schema ingestion, and developer-facing diagnostic logging. The verification scenario — API 500 → user sees retry → retry succeeds — must pass end-to-end.

---

## Problem

Phase 0 operates entirely against localStorage where failures are effectively impossible. Phase 1 introduces network boundaries (API Gateway → Lambda → DynamoDB/S3), timeouts, throttling, transient infrastructure errors, and partial failures (e.g., schema ingestion batch writes). Without a deliberate resilience design:

1. **Lost work:** A failed `updateMapping` save with no retry path forces users to re-enter expressions.
2. **Corrupt local state:** Optimistic UI updates that succeed locally but fail on the server leave the display inconsistent with persisted state.
3. **Silent failures:** Network errors that surface as unstructured error messages give users no path to recovery.
4. **Developer blindness:** Without structured logging/diagnostics, transient failures are invisible during development and debugging.

Error recovery was explicitly identified as a Phase 1 verification gate. It deserves focused design.

---

## Goal

After this work:

- Every backend API failure produces a structured, machine-readable error envelope.
- The HttpAdapter normalizes backend errors into `AppError` with correct `retryable` classification.
- UI hooks using `AsyncState` surface retryable errors with explicit retry affordances (no page reload required).
- Optimistic updates that fail on the server roll back cleanly to pre-mutation state.
- Schema ingestion partial failures are surfaced with clear status and re-attempt guidance.
- Developers see structured console diagnostics for all error paths during development.
- The verification scenario (API 500 → retry → success) passes.

---

## Assumptions

- FS-055 (HttpAdapter) and FS-057 (Backend API) are implemented or in-progress; this spec extends their error paths.
- The backend error envelope defined in `backend-api.md` Section 4 is canonical and will be the response format for all error cases.
- The `AsyncState` model remains the UI's async lifecycle representation (no TanStack Query or external state libraries).
- Auth/session errors (401/403) are handled at the transport layer and are out of scope for retry UX — they trigger re-auth flows.
- The UI runs as a single-user application in Phase 1 (no concurrent edit conflict handling in this spec).

---

## Current Context

### Backend Error Envelope (from `backend-api.md`)

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "statusCode": 400,
    "retryable": false
  }
}
```

Standard codes: `VALIDATION_ERROR` (400), `RESOURCE_NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500, retryable), `SERVICE_UNAVAILABLE` (503, retryable).

### HttpAdapter Error Normalization (from FS-055)

The HttpAdapter's HTTP client utility constructs `Error` objects with enriched properties (`statusCode`, `code`, `retryable`) which `toAppError()` converts to `AppError`. However, FS-055 does not define:
- Retry orchestration (backoff, attempt limits)
- UI-level retry affordance integration
- Optimistic update rollback mechanics
- Partial failure semantics
- Developer diagnostic output

### AsyncState Error Path

```typescript
type AsyncState<T> =
  | { status: 'error'; error: AppError; retryable: boolean }
```

The `retryable` flag exists in the state model but currently no UI components consume it to render retry controls. `useAsyncState` tracks request IDs for race protection but has no retry-specific machinery.

### Schema Ingestion Failure Modes (from `schema-ingestion.md`)

- Invalid schema → `status: "error"` on metadata
- DynamoDB throttle → exponential backoff (internal to pipeline)
- OpenSearch failure → non-blocking; metadata still reaches `ready`
- Step Functions failure → metadata `status: "error"`

The UI currently has no awareness of ingestion partial failures or async status polling.

---

## Scope

### In Scope

1. **Backend error envelope enforcement** — shared utility in `src/lambda/shared/errors.ts` that ensures all handler errors use the canonical envelope, including request correlation IDs.
2. **HttpAdapter `toAppError()` integration** — extend error normalization in the HTTP client to fully parse the backend error envelope (code, message, statusCode, retryable) rather than inferring from status codes alone.
3. **Retry utility** — a lightweight `retryWithBackoff` utility in `ui/src/lib/api/` that HttpAdapter methods can use for retryable failures (exponential backoff, max 3 attempts, jitter).
4. **`useAsyncState` retry enhancement** — add a `retry` action to `AsyncActions` that re-executes the last operation without requiring callers to track the original promise factory.
5. **Error display component** — a shared `ErrorBanner` component that reads `AsyncState` error status and renders retry controls when `retryable: true`.
6. **Optimistic update rollback** — define the pattern for `updateMapping`/`updateProject`/`updateSchema` where UI applies changes optimistically and rolls back on failure.
7. **Schema ingestion status polling** — after `createSchema` returns 202, UI polls schema metadata until `status: "ready"` or `status: "error"`, surfacing progress and failure clearly.
8. **Developer diagnostics** — a `devLogger` utility that logs structured error info (request ID, endpoint, error code, timing) to console in development mode.
9. **Request correlation ID** — backend handlers generate a `requestId` (UUID) included in error responses; HttpAdapter surfaces it in `AppError` for diagnostic correlation.

### Out of Scope

- Auth/session error handling (401/403 redirect to login)
- Concurrent edit conflict resolution (optimistic locking / ETags)
- Full offline mode / queue-and-sync patterns
- Circuit breaker patterns
- Backend alerting / CloudWatch alarm configuration
- UI toast/notification system (this spec uses inline error banners only)
- Retry for AI/long-running operations (separate spec)

---

## Non-Goals

- This spec does not introduce a global error boundary or crash recovery system.
- This spec does not define backend monitoring/alerting infrastructure.
- This spec does not add client-side request queuing or offline resilience.
- This spec does not change the `ApiAdapter` interface contract.
- This spec does not introduce new state management libraries.

---

## Relevant Areas

- `src/lambda/shared/errors.ts` — backend error constructors (extend)
- `src/lambda/shared/response.ts` — response builders (extend with correlation ID)
- `ui/src/lib/api/http-client.ts` — HTTP client error normalization (extend)
- `ui/src/lib/api/http-adapter.ts` — HttpAdapter (integrate retry utility)
- `ui/src/lib/api/retry.ts` — new retry utility
- `ui/src/lib/state/app-error.ts` — AppError type (extend with `requestId?`)
- `ui/src/lib/state/async-state.ts` — AsyncState type (no change)
- `ui/src/hooks/use-async-state.ts` — hook (add `retry` action)
- `ui/src/components/ErrorBanner.tsx` — new shared error display component
- `ui/src/features/schemas/hooks/use-schema-detail.ts` — ingestion polling (extend)
- `ui/src/lib/api/dev-logger.ts` — new developer diagnostics utility
- `forge/architecture/backend-api.md` — update with correlation ID and expanded error section

---

## Dependencies / Blockers

- Depends on FS-055 (HttpAdapter) being at least partially implemented — specifically the HTTP client utility module.
- Depends on FS-057 (Backend API) error handler implementations being in place for testing.
- Schema ingestion polling depends on FS-056 (Schema Ingestion) handler being deployed.

---

## Constraints

- `ApiAdapter` interface must not be modified (error information flows through thrown errors, not return types).
- `AsyncState` type shape must remain backward-compatible (existing consumers must not break).
- No external state management or data-fetching libraries.
- Retry logic must not retry non-retryable errors (400, 404, 409).
- Retry attempts must be bounded (max 3) to avoid runaway loops.
- Optimistic rollback must restore exact pre-mutation state (no partial rollback).
- All changes must pass `pnpm typecheck` and `pnpm build` in `ui/`.
- Backend error envelope changes must not break existing handler tests.

---

## Proposed Behavior

### User Flow

1. **Normal operation:** User performs action (save mapping, create project, upload schema). Action completes via backend. No error surfaces are shown.

2. **Transient failure with automatic retry:** User saves a mapping. Backend returns 503 (DynamoDB throttle). HttpAdapter automatically retries with backoff (up to 3 attempts). If a retry succeeds, the user never sees an error (silent recovery). If all retries fail, the error surfaces.

3. **Visible retryable failure:** User saves a mapping. All automatic retries fail. `AsyncState` transitions to `{ status: 'error', error: {...}, retryable: true }`. The `ErrorBanner` renders with the error message and a "Retry" button. User clicks "Retry". The original save operation re-executes. If it succeeds, the ErrorBanner dismisses with a brief "Recovered" indication, then clears.

4. **Non-retryable failure:** User tries to load a deleted mapping (404). `AsyncState` shows `{ status: 'error', error: {...}, retryable: false }`. ErrorBanner shows the message without a retry button. User navigates away.

5. **Optimistic update failure:** User edits a project name. UI immediately reflects the new name (optimistic). Backend returns 500. Automatic retries fail. UI rolls back to the previous name and shows ErrorBanner with retry option.

6. **Schema ingestion progress:** User uploads a large schema. Backend returns 202 with `status: "ingesting"`. UI shows progress indicator. Polling checks status every 2 seconds. On `status: "ready"`, UI transitions to success. On `status: "error"`, UI shows failure message with option to re-upload.

### System Behavior

#### Backend Error Envelope (Enhanced)

All error responses include a `requestId` for correlation:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred. Please try again.",
    "statusCode": 500,
    "retryable": true,
    "requestId": "req-a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

Handlers generate `requestId` via UUID at the start of each invocation and include it in both success and error responses (success responses include it in a `x-request-id` response header).

#### Error Classification Matrix

| Error Code | HTTP Status | Retryable | Auto-Retry | User Action |
|---|---|---|---|---|
| `VALIDATION_ERROR` | 400 | false | no | Fix input |
| `RESOURCE_NOT_FOUND` | 404 | false | no | Navigate away |
| `CONFLICT` | 409 | false | no | Refresh + re-apply |
| `INTERNAL_ERROR` | 500 | true | yes (3x) | Retry button if auto-retry fails |
| `SERVICE_UNAVAILABLE` | 503 | true | yes (3x) | Retry button if auto-retry fails |
| `TIMEOUT` | 504 | true | yes (2x) | Retry button if auto-retry fails |
| Network failure | — | true | yes (3x) | Retry button if auto-retry fails |

#### Retry Utility

```typescript
interface RetryConfig {
  maxAttempts: number;      // default: 3
  baseDelayMs: number;      // default: 500
  maxDelayMs: number;       // default: 5000
  jitter: boolean;          // default: true
  retryableCheck: (error: unknown) => boolean;
}

function retryWithBackoff<T>(fn: () => Promise<T>, config?: Partial<RetryConfig>): Promise<T>;
```

Backoff formula: `min(baseDelay * 2^attempt + jitter, maxDelay)`

The utility is integrated at the HTTP client layer — all requests through the HTTP client automatically retry retryable failures. Individual requests may override retry config (e.g., reduce attempts for time-sensitive operations) via an options parameter. The utility does not retry non-retryable errors.

#### Optimistic Update Pattern

For mutation methods (`updateMapping`, `updateProject`, `updateSchema`):

1. Hook captures pre-mutation state snapshot
2. UI applies optimistic state update immediately
3. Backend call executes (with retry utility)
4. On success: optimistic state is confirmed (no action needed)
5. On failure (after retries exhausted): state reverts to snapshot, error surfaces

Implementation pattern in hooks:

```typescript
const save = useCallback(async (newConfig: MappingConfig) => {
  const snapshot = currentConfig; // capture before mutation
  setOptimisticConfig(newConfig); // optimistic UI update
  
  try {
    await adapter.updateMapping(id, newConfig);
    // success — optimistic state is now confirmed
  } catch (error) {
    setOptimisticConfig(snapshot); // rollback
    throw error; // propagate to AsyncState error handling
  }
}, [adapter, id, currentConfig]);
```

#### Schema Ingestion Polling

After `createSchema` returns 202:

1. UI enters polling mode (status: "ingesting" displayed)
2. Poll `getSchema(id)` every 2 seconds
3. Max polling duration: 5 minutes (300 seconds)
4. On `status: "ready"`: stop polling, surface success
5. On `status: "error"`: stop polling, surface failure with re-upload option
6. On polling timeout: surface timeout message with manual refresh option

#### Developer Diagnostics

In development mode (`import.meta.env.DEV`):

```typescript
devLogger.error({
  endpoint: 'PUT /mappings/abc-123',
  statusCode: 500,
  errorCode: 'INTERNAL_ERROR',
  requestId: 'req-a1b2c3d4...',
  duration: 1234,
  attempt: 3,
  message: 'All retry attempts failed',
});
```

Output is structured console.group with color coding:
- Red for non-retryable errors
- Yellow for retryable errors (transient)
- Gray for successful retries (informational)

Production mode: `devLogger` is a no-op.

### Failure / Edge Behavior

| Scenario | Behavior |
|---|---|
| Retry succeeds on attempt 2 | User never sees error; devLogger logs retry success |
| All retries fail | Error surfaces in UI with retry button |
| User clicks retry during backoff | Current retry chain is cancelled, fresh chain starts |
| User initiates new save during active retry | Existing retry chain cancelled, new save starts fresh with latest payload |
| Component unmounts during retry | Retry chain aborts, no state update |
| Optimistic rollback during navigation | Rollback completes before navigation proceeds |
| Multiple concurrent retries for same resource | Request ID guard prevents stale completions |
| Schema polling response is 404 | Treat as permanent failure, stop polling |
| Schema polling returns unexpected status | Continue polling until timeout |
| Backend returns error without envelope | HttpAdapter falls back to status-code-based classification |
| Backend returns malformed JSON | Non-retryable error, parse failure message |

---

## Acceptance Examples

### AE-01 — API 500 triggers auto-retry then surfaces retry button

**Given**
- User has an open mapping editor with unsaved changes
- Backend is configured (`VITE_API_URL` set)
- Backend will return 500 for the first 4 requests, then 200

**When**
- User clicks Save
- HttpAdapter sends PUT request
- Backend returns 500 three times (auto-retry exhausted)

**Then**
- UI shows ErrorBanner with message "Save failed. Please try again." and a "Retry" button
- User's draft expression is preserved (not lost)
- The mapping editor remains interactive (no page reload needed)

### AE-02 — Retry button succeeds on user-initiated retry

**Given**
- AE-01 state: ErrorBanner is showing with retry button
- Backend is now healthy (will return 200)

**When**
- User clicks "Retry" button

**Then**
- ErrorBanner shows loading state briefly
- Save completes successfully
- ErrorBanner disappears
- AsyncState transitions to success
- devLogger logs the successful retry

### AE-03 — Non-retryable error shows no retry button

**Given**
- User navigates to a mapping that was deleted by another process
- Backend returns 404 with `RESOURCE_NOT_FOUND`

**When**
- `getMapping(id)` fails with 404

**Then**
- AsyncState transitions to `{ status: 'error', error: { code: 'RESOURCE_NOT_FOUND', retryable: false } }`
- ErrorBanner shows "Mapping not found" message
- No retry button is displayed

### AE-04 — Optimistic update rolls back on failure

**Given**
- User is on Project Overview
- Project name currently shows "My Project"
- Backend will return 500 for all attempts

**When**
- User changes project name to "Renamed Project"
- UI optimistically shows "Renamed Project"
- Backend rejects the update (all retries fail)

**Then**
- Project name reverts to "My Project"
- ErrorBanner appears with retry option
- No inconsistency between displayed state and server state

### AE-05 — Schema ingestion 202 triggers polling and resolves

**Given**
- User uploads a 600-field schema (triggers Step Functions path)
- Backend returns 202 with `{ status: "ingesting", schemaId: "..." }`

**When**
- UI begins polling `getSchema(schemaId)` every 2 seconds
- After 4 polls (8 seconds), backend returns `{ status: "ready", fieldCount: 600 }`

**Then**
- During polling: UI shows "Processing schema..." with progress indicator
- After ready: UI transitions to schema detail view
- No error surfaces are shown

### AE-06 — Schema ingestion failure surfaces re-upload option

**Given**
- User uploads a schema that triggers Step Functions path
- Backend returns 202, then after 3 polls returns `{ status: "error" }`

**When**
- Polling detects `status: "error"`

**Then**
- UI shows "Schema processing failed" message
- A "Try Again" button or re-upload affordance is presented
- devLogger shows the failure with schema ID and request trace

### AE-07 — Backend error envelope with requestId is parsed correctly

**Given**
- Backend returns:
  ```json
  { "error": { "code": "SERVICE_UNAVAILABLE", "message": "DynamoDB throttled", "statusCode": 503, "retryable": true, "requestId": "req-abc123" } }
  ```

**When**
- HttpAdapter receives this response

**Then**
- `AppError` contains `code: "SERVICE_UNAVAILABLE"`, `statusCode: 503`, `retryable: true`, `requestId: "req-abc123"`
- devLogger includes `requestId` in diagnostic output
- Auto-retry engages for this error

### AE-08 — Component unmount cancels retry chain

**Given**
- User triggers a save that starts auto-retry (backend returning 503)
- Retry is in backoff delay (waiting for attempt 2)

**When**
- User navigates away from the page (component unmounts)

**Then**
- Retry chain is aborted
- No state updates occur after unmount
- No memory leaks or console warnings

---

## Open Questions

- none

---

## Verification Strategy

- **Unit tests (AE-07, AE-08):** Test error envelope parsing, retry utility backoff/jitter logic, abort-on-unmount behavior, and optimistic rollback state transitions.
- **Integration tests (AE-01, AE-02, AE-03):** Mock server returning specific status codes, verify full HttpAdapter → useAsyncState → ErrorBanner flow.
- **Component tests (AE-04):** Verify optimistic update + rollback renders correctly in affected feature hooks.
- **Polling tests (AE-05, AE-06):** Verify polling lifecycle with mocked time (fake timers) for schema ingestion.
- **Build/typecheck:** `pnpm typecheck` and `pnpm build` clean in both `ui/` and root.
- **Manual verification:** API 500 → ErrorBanner with retry → retry succeeds → ErrorBanner disappears. This is the primary TTFSM verification gate.

---

## Task Generation Notes

This is a cross-cutting spec spanning backend handlers and UI utilities/components. Tasks split by execution domain:

1. **Backend: Error envelope enforcement + correlation ID** (`task`) — extend `src/lambda/shared/` with requestId generation and ensure all error constructors include it.
2. **UI: Extend AppError and HTTP client error parsing** (`task`) — add `requestId` to AppError, update HTTP client to parse full backend envelope.
3. **UI: Retry utility** (`task`) — implement `retryWithBackoff` with abort support, integrate into HTTP client layer.
4. **UI: useAsyncState retry enhancement** (`task`) — add `retry` action that re-executes last operation.
5. **UI: ErrorBanner shared component** (`ui-task`) — shared component consuming AsyncState error status with retry button.
6. **UI: Optimistic update rollback pattern** (`task`) — implement snapshot/rollback in `use-mapping-editor`, `use-schema-detail`, project hooks.
7. **UI: Schema ingestion polling** (`ui-task`) — extend schema creation flow with 202 polling and status display.
8. **UI: Developer diagnostics utility** (`task`) — implement `devLogger` with structured console output.
9. **Architecture update** (`task`) — update `backend-api.md` with correlation ID pattern and expanded error handling section.

Tasks 1 and 2–3 can proceed in parallel. Task 4 depends on 3. Task 5 depends on 4. Task 6 depends on 2. Task 7 depends on 2. Task 8 has no dependencies. Task 9 runs last.

---

## Change Log

- Rev 2 — 2026-05-14
  - Resolved all open questions (Q1–Q5) based on owner decisions:
    - Q1: ErrorBanner is shared in `ui/src/components/`
    - Q2: Silent auto-recovery by default; light "Recovered" indication only if error was already visible to user
    - Q3: Polling for Phase 1; real-time push deferred
    - Q4: Retry automatic at HTTP client layer (centralized), per-request overrides available
    - Q5: Latest save wins — cancel stale retry chain when user initiates new save
- Rev 1 — 2026-05-14
  - Initial draft
