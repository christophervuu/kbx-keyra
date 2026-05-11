# SPEC

## Title

UI Integration for Explain Rule API (Showcase Vertical Slice)

---

## ID

FS-041

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-11
Last Updated: 2026-05-11
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Wire the existing Explain button in the Mapping Editor UI to the deployed backend Explain Rule Lambda, delivering a thin end-to-end vertical slice suitable for a showcase demo. This introduces the minimum Phase 1 infrastructure (a `HybridAdapter` that augments the existing `LocalStorageAdapter` with HTTP-based AI calls) without requiring full backend migration. The user clicks Explain, sees a loading state, and receives a plain-English explanation of the selected rule's DSL expression displayed in an inline panel.

---

## Problem

The Explain Rule backend Lambda is deployed and functional (`src/lambda/ai/explain-rule.ts`), and the Mapping Editor UI already renders an Explain button on each scalar field rule. However, the button is currently disabled with a "coming soon" tooltip. There is no HTTP adapter, no API client path, and no presentation surface to complete the end-to-end flow.

Full Phase 1 backend integration (`HttpAdapter` replacing `LocalStorageAdapter` for all CRUD operations) is not yet implemented, and that migration is not needed for this feature. What is needed is a narrow bridge that lets the UI call exactly one backend AI endpoint while continuing to use `LocalStorageAdapter` for all other data operations.

---

## Goal

Deliver a polished, demoable Explain Rule flow in the Mapping Editor:

1. User clicks Explain on a mapping rule → the UI calls the backend AI endpoint
2. A loading indicator appears while the request is in flight
3. The explanation result is displayed inline below the Explain button
4. Errors are shown gracefully without disrupting the editor
5. The entire flow works in a showcase environment pointed at the deployed API

Success means a stakeholder can see the Explain Rule feature work end-to-end in a live demo.

---

## Assumptions

- The backend Explain Rule Lambda is deployed and accessible at `https://ingkgy3x55.execute-api.us-east-1.amazonaws.com/sandbox/ai/explain-rule`
- The Lambda accepts `POST` with `{ targetPath: string, expression: string }` and returns the `AIResult`/`AIError` envelope defined in `ai-runtime.md`
- The Lambda's structured output `data` field is `{ explanation: string }` — confirmed by the prompt registry's `responseSchema`: `{"type":"object","properties":{"explanation":{"type":"string"}},"required":["explanation"]}`
- `VITE_API_URL` will be set to the API Gateway base URL (`https://ingkgy3x55.execute-api.us-east-1.amazonaws.com/sandbox`) in showcase/demo environments; the client appends `/ai/explain-rule`
- No authentication is required for the showcase endpoint (CORS is already configured with `Access-Control-Allow-Origin: *` in the Lambda)
- The existing `LocalStorageAdapter` continues to handle all CRUD operations unchanged
- No response caching — each Explain click makes a fresh request

---

## Current Context

### Adapter Architecture

The UI uses an adapter pattern for all data operations (`ui/src/lib/api/types.ts`):

- `ApiAdapter` interface defines all methods including `explainRule(input: ExplainRuleInput): Promise<string>`
- `LocalStorageAdapter` implements all methods; AI methods throw `"Not available in offline mode"`
- `createAdapter()` in `bootstrap.ts` returns `LocalStorageAdapter` when `VITE_API_URL` is unset; throws `"HttpAdapter not implemented"` when set
- `AdapterProvider` + `useAdapter()` inject the adapter via React Context

### Existing Types

- `ExplainRuleInput` in `ui/src/lib/types/domain.ts`: `{ readonly expression: string }` — missing `targetPath` that the backend requires
- `ApiAdapter.explainRule` returns `Promise<string>` — does not accommodate structured result

### Explain Button Locations

1. **`ScalarFieldBuilder.tsx`** (line ~857): disabled `<button>` with `data-testid="ai-explain-btn"`, tooltip "AI-powered explanation — available in a future release", `Lightbulb` icon
2. **`ChainBuilderShell.tsx`** (line ~183): disabled `<button>` in `AiActionBar` with similar styling

Both buttons are currently `disabled` with `cursor-not-allowed` and `opacity-50`.

### Backend Lambda

`src/lambda/ai/explain-rule.ts`:
- Expects POST body: `{ targetPath: string, expression: string }`
- Calls `invokeAI('explain-rule', { targetPath, expression })`
- Returns `AIResult<T>` on success (`{ success: true, data: T, promptId, model, usage }`)
- Returns `AIError` on failure (`{ success: false, error: { code, message }, promptId }`)
- CORS headers already included (`Access-Control-Allow-Origin: *`)

### Related Active Specs

- **FS-031** (active, draft): Shared AI Runtime for Backend AI Features — defines the backend `invokeAI()` pipeline. This is the backend infrastructure that `explain-rule.ts` already consumes. FS-041 does not depend on FS-031 completion; the Lambda is already deployed.
- **FS-019** (active, draft): Playwright E2E Test Infrastructure — not blocking.

---

## Scope

### In Scope

1. **Type updates**: Extend `ExplainRuleInput` to include `targetPath`; add `ExplainRuleResult` type; update `ApiAdapter.explainRule` return type
2. **AI API client**: A focused HTTP module (`ui/src/lib/api/ai-api-client.ts`) that calls the Explain Rule endpoint via `fetch()`
3. **HybridAdapter**: A new adapter class that extends `LocalStorageAdapter` and overrides AI methods to use HTTP when an API URL is configured
4. **Bootstrap update**: Modify `createAdapter()` to return `HybridAdapter` when `VITE_API_URL` is set, instead of throwing
5. **`useExplainRule()` hook**: Async lifecycle hook for the Explain Rule call (loading/success/error states)
6. **ScalarFieldBuilder integration**: Enable the Explain button, show loading/result/error states, render explanation in an inline panel
7. **ChainBuilderShell integration**: Same pattern applied to the chain builder's AI bar
8. **Architecture update**: Document the HybridAdapter pattern in `ui-application.md`

### Out of Scope

- Full `HttpAdapter` implementation for all `ApiAdapter` methods
- Migration of CRUD operations (schemas, mappings, projects) to HTTP
- Other AI features (auto-map, suggest-expression, smart-fix, validate-mappings, describe-fields)
- Authentication, authorization, or API key management
- Deployment workflow or CI/CD changes
- Schema ingestion or RAG pipeline
- Redesigning the Mapping Editor layout or builder flow
- Backend changes to the Explain Rule Lambda (already deployed)

---

## Non-Goals

- This spec does not establish the permanent Phase 1 backend integration pattern — it establishes a narrow, clean bridge that Phase 1 can later absorb or replace
- This spec does not implement a mock/stub fallback path for when the API is unavailable — the `LocalStorageAdapter` offline throw already provides that boundary
- This spec does not generalize the AI API client to support all AI endpoints — it implements exactly one (`explain-rule`) and leaves the pattern extensible

---

## Relevant Areas

- `ui/src/lib/types/domain.ts` — `ExplainRuleInput` type
- `ui/src/lib/api/types.ts` — `ApiAdapter` interface
- `ui/src/lib/api/local-storage-adapter.ts` — offline AI method stubs
- `ui/src/lib/api/bootstrap.ts` — adapter selection
- `ui/src/lib/api/adapter-provider.tsx` — context injection
- `ui/src/lib/api/ai-api-client.ts` — new HTTP client module
- `ui/src/lib/api/hybrid-adapter.ts` — new adapter class
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx` — Explain button
- `ui/src/features/mappings/components/ChainBuilderShell.tsx` — Explain button (chain builder)
- `ui/src/features/mappings/hooks/use-explain-rule.ts` — new hook
- `ui/src/features/mappings/components/ExplanationPanel.tsx` — new presentation component
- `forge/architecture/ui-application.md` — architecture update

---

## Dependencies / Blockers

- The backend Explain Rule Lambda must be deployed and accessible via API Gateway (assumed already done per requirements)
- FS-031 (Shared AI Runtime) does not block this spec — the Lambda is independently deployed
- No other specs block this work

---

## Constraints

- UI is a React/TypeScript/Vite thick client — all existing conventions apply
- All AI calls go through the backend only — no API keys in the browser
- Mapping engine remains pure TypeScript, separate from backend concerns
- Save ≠ Deploy — Explain Rule is informational only, never modifies rules
- The `LocalStorageAdapter` must continue to work unchanged when `VITE_API_URL` is not set
- Prioritize TTFSM (Time to First Successful Mapping) — Explain must not disrupt the authoring flow
- TypeScript strict mode, zero-error lint/typecheck policy
- Desktop-first (1024px+ minimum)

---

## Proposed Behavior

### User Flow

1. User opens the Mapping Editor and selects a target field that has a mapping expression
2. In the `ScalarFieldBuilder` (or `ChainBuilderShell`), the Explain button is visible and enabled (no longer grayed out)
3. User clicks Explain
4. A loading indicator appears in place of / adjacent to the Explain button area
5. After 1–5 seconds, the explanation appears in an inline panel below the action row
6. The explanation panel shows:
   - The explanation text (1–2 sentences, plain English)
   - A close/dismiss button
7. The user reads the explanation, optionally dismisses it, and continues editing
8. Clicking Explain again on the same rule re-fetches (no stale cache for showcase simplicity)

### System Behavior

**When `VITE_API_URL` is configured:**

1. `createAdapter()` returns a `HybridAdapter(apiUrl)` instance
2. `HybridAdapter` extends `LocalStorageAdapter` — all CRUD methods delegate to `super`
3. `HybridAdapter.explainRule()` overrides the parent to call `explainRuleHttp(apiUrl, input)`
4. `explainRuleHttp()` in `ai-api-client.ts`:
   - `POST`s to `${apiUrl}/ai/explain-rule` with JSON body `{ targetPath, expression }`
   - Sets `Content-Type: application/json`
   - Applies a 15-second timeout via `AbortController`
   - On 200 + `success: true`: extracts `data` field, maps to `ExplainRuleResult`
   - On non-200 or `success: false`: throws a descriptive error
5. `useExplainRule()` hook wraps the adapter call with loading/success/error state

**When `VITE_API_URL` is not configured:**

1. `createAdapter()` returns `LocalStorageAdapter` (unchanged)
2. The Explain button checks `VITE_API_URL` at render time — if not set, button remains disabled with an updated tooltip: "Explain requires API connection — set VITE_API_URL"
3. Alternatively: button is always enabled; clicking it when offline triggers the adapter throw which the hook converts to a user-friendly error message

Decision: **Option 2 (always enabled, graceful error)** is simpler and avoids prop-drilling env config. The hook catches the `LocalStorageAdapter` throw and displays "Explain Rule is not available in offline mode."

### Failure / Edge Behavior

| Scenario | Behavior |
|---|---|
| `VITE_API_URL` not set (offline mode) | `LocalStorageAdapter.explainRule()` throws → hook catches → error state: "Explain is not available in offline mode" |
| Network failure / timeout (15s) | `fetch` throws or `AbortController` fires → hook catches → error state: "Could not reach the Explain service. Check your connection and try again." |
| Backend 400 (bad request) | Response parsed → error state: "Invalid request — the rule may be malformed." |
| Backend 429 (rate limited) | Response parsed → error state: "The AI service is temporarily busy. Please try again in a moment." |
| Backend 500+ (server error) | Response parsed → error state: "The Explain service encountered an error. Please try again." |
| Malformed response (not JSON, missing fields) | Parse/extract fails → hook catches → error state: "Received an unexpected response from the server." |
| No expression on current field | Explain button is disabled when `expression` is empty or only whitespace |
| User navigates away while loading | Hook cleanup via `AbortController.abort()` — request cancelled, no state update on unmounted component |
| User clicks Explain again while loading | Previous request aborted, new request started |

---

## Acceptance Examples

### AE-01 — Explain Rule success (ScalarFieldBuilder)

**Given**
- `VITE_API_URL` is set to a valid API Gateway URL
- User has a scalar target field selected with expression `if(lt(source("InvoiceAmount"), 0), "CreditMemo", "Invoice")`
- The target path is `Order.Header.DocumentType`

**When**
- User clicks the Explain button in ScalarFieldBuilder

**Then**
- A loading spinner/indicator appears
- After the API responds, an inline explanation panel appears showing the explanation text
- The explanation is a plain-English description of the rule logic
- The Explain button returns to its default enabled state

### AE-02 — Explain Rule success (ChainBuilderShell)

**Given**
- Same setup as AE-01 but the user is in the chain builder view

**When**
- User clicks the Explain button in the ChainBuilderShell AI bar

**Then**
- Same behavior as AE-01 — loading state, then inline explanation panel

### AE-03 — Explain button disabled when no expression

**Given**
- User selects a target field with no mapping (empty expression)

**When**
- The ScalarFieldBuilder renders

**Then**
- The Explain button is disabled with `aria-disabled="true"`
- Tooltip: "No expression to explain"

### AE-04 — API not configured (offline mode)

**Given**
- `VITE_API_URL` is not set

**When**
- User clicks Explain (button is enabled)

**Then**
- Error message displayed inline: "Explain is not available in offline mode"
- Editor remains fully functional

### AE-05 — Network failure

**Given**
- `VITE_API_URL` is set but the server is unreachable

**When**
- User clicks Explain

**Then**
- Loading spinner appears
- After timeout (15s) or immediate network error: error message "Could not reach the Explain service. Check your connection and try again."
- A "Try again" button is available

### AE-06 — Backend error response

**Given**
- `VITE_API_URL` is set, server returns 500

**When**
- User clicks Explain

**Then**
- Error message: "The Explain service encountered an error. Please try again."
- Editor remains functional

### AE-07 — Rate limited

**Given**
- Backend returns 429

**When**
- User clicks Explain

**Then**
- Error message: "The AI service is temporarily busy. Please try again in a moment."

### AE-08 — Dismiss and re-explain

**Given**
- An explanation panel is visible

**When**
- User clicks the dismiss/close button on the panel
- Then clicks Explain again

**Then**
- Panel dismisses
- New request is made (no stale cache)
- Fresh explanation is displayed

### AE-09 — Navigation cancels pending request

**Given**
- An Explain request is in flight (loading state visible)

**When**
- User selects a different target field

**Then**
- The pending request is aborted
- No error is shown
- The explanation panel is not visible on the new field

### AE-10 — HybridAdapter delegates CRUD to LocalStorageAdapter

**Given**
- `VITE_API_URL` is set
- `createAdapter()` returns `HybridAdapter`

**When**
- Any CRUD operation (e.g., `getMapping`, `updateMapping`, `listSchemas`) is called

**Then**
- The operation delegates to `LocalStorageAdapter` behavior (localStorage-backed)
- No HTTP calls are made for CRUD operations

### AE-11 — ExplainRuleInput includes targetPath

**Given**
- User clicks Explain on a rule for `Order.Header.DocumentType`

**When**
- The adapter's `explainRule()` is invoked

**Then**
- The request body includes both `targetPath: "Order.Header.DocumentType"` and `expression: "<current expression>"`

---

## Open Questions

- none

---

## Verification Strategy

### Automated (unit/component tests)

- **AE-01, AE-02**: Component tests for `ScalarFieldBuilder` and `ChainBuilderShell` — mock adapter, verify loading → result → panel rendering
- **AE-03**: Component test — verify button disabled when expression is empty
- **AE-04**: Component test — mock `LocalStorageAdapter` (throws), verify error message
- **AE-05, AE-06, AE-07**: `ai-api-client.ts` unit tests — mock `fetch`, verify error mapping for timeout/500/429
- **AE-08**: Component test — dismiss, re-click, verify new request
- **AE-09**: Hook test — verify `AbortController.abort()` on cleanup
- **AE-10**: `HybridAdapter` unit test — verify CRUD methods call super, `explainRule` calls HTTP
- **AE-11**: Unit test — verify request body includes `targetPath`

### Manual (showcase validation)

- Manually exercise the full flow against the deployed Lambda in a showcase environment
- Confirm the explanation text is coherent and relevant to the DSL expression
- Confirm error states render correctly when the backend is unavailable

### Build gate

- `tsc --noEmit` passes with no errors
- `pnpm lint` passes with no errors
- All existing tests continue to pass (mock adapter stubs in tests already include `explainRule: vi.fn()`)

---

## Task Generation Notes

This is a **cross-cutting** spec. Tasks are split by execution domain:

- **`task` agent** (T-01 through T-03, T-07): type definitions, HTTP client, adapter infrastructure, architecture update
- **`ui-task` agent** (T-04 through T-06): React hook, component integration, presentation

Sequencing:
1. T-01 (types) is the foundation — no dependencies
2. T-02 (HTTP client) depends on T-01
3. T-03 (HybridAdapter + bootstrap) depends on T-02
4. T-04 (hook) depends on T-01 (uses types; adapter injection is runtime)
5. T-05 (ScalarFieldBuilder) depends on T-04
6. T-06 (ChainBuilderShell) depends on T-04; can parallelize with T-05
7. T-07 (architecture) depends on T-03

The vertical slice is "done" when T-05 is complete and the app runs against a configured API URL. T-06 adds parity for the chain builder surface. T-07 is documentation.

### Showcase-only vs. Generalizable

| Aspect | Showcase vertical slice (this spec) | Future Phase 1 generalization |
|---|---|---|
| Adapter approach | `HybridAdapter` extends `LocalStorageAdapter`, overrides AI methods only | Full `HttpAdapter` implements all methods via HTTP |
| AI API client | Single function `explainRuleHttp()` | Generalized client with method-per-endpoint or generic `callAI()` |
| Error handling | User-friendly inline messages, no retry queue | Centralized error handling, retry logic, toast notifications |
| Caching | None — always re-fetch | Response cache with TTL per endpoint |
| Auth | None (CORS-only) | Token-based auth via API Gateway authorizer |
| Configuration | `VITE_API_URL` env var only | Full environment configuration (auth tokens, feature flags, etc.) |

---

## Change Log

- Rev 2 — 2026-05-11
  - Resolved Q1: API endpoint confirmed as `POST ${VITE_API_URL}/ai/explain-rule` with base URL `https://ingkgy3x55.execute-api.us-east-1.amazonaws.com/sandbox`
  - Resolved Q2: `data` shape confirmed as `{ explanation: string }` from prompt registry `responseSchema`; removed `complexity` from `ExplainRuleResult`
  - Resolved Q3: No caching confirmed — each Explain click re-fetches
  - Updated Assumptions with concrete API URL, confirmed response schema, and no-cache decision
- Rev 1 — 2026-05-11
  - Initial draft
