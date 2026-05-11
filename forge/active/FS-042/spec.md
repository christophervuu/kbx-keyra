# SPEC

## Title

UI Integration for Natural Language → Rule API (Showcase Vertical Slice)

---

## ID

FS-042

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

Wire the existing Suggest button in the Mapping Editor to a deployed backend Suggest Expression Lambda, delivering a thin end-to-end vertical slice for the Natural Language → Rule AI feature. The user enters a natural language instruction (e.g., "default currency to USD if missing"), the UI sends it to the backend with compact source-field context, and the backend returns a suggested DSL expression displayed in an inline suggestion panel. The user can accept the expression into their draft or dismiss it. This follows the same showcase/local pattern established by FS-041 (Explain Rule), extending the existing `HybridAdapter` and `ai-api-client` infrastructure.

---

## Problem

The product spec defines a Natural Language → Rule AI feature (§13.3) that converts user instructions into DSL expressions. The full production architecture relies on RAG retrieval of relevant source fields via OpenSearch. However, the RAG pipeline is not yet implemented, and waiting for it blocks any user-facing progress on this high-value feature.

The Mapping Editor already renders a disabled Suggest button on each scalar field rule (`ScalarFieldBuilder.tsx` and `ChainBuilderShell.tsx`). The `ApiAdapter` interface already defines `suggestExpression(input)` with types `SuggestExpressionInput` and `SuggestExpressionResult`. However:

1. The existing `SuggestExpressionInput` type lacks the showcase-necessary context fields (target type, target description, source field list)
2. No HTTP client function exists for the suggest-expression endpoint
3. The `HybridAdapter` does not override `suggestExpression` (it still throws "Not available in offline mode")
4. No UI hook, input mechanism, or result presentation exists

---

## Goal

Deliver a demoable Natural Language → Rule flow in the Mapping Editor:

1. User clicks Suggest on a target field → an inline input area appears
2. User enters a natural language instruction
3. UI sends the instruction + compact source-field context + target metadata to the backend
4. The suggested DSL expression is shown in an inline panel with Accept/Dismiss actions
5. Accepting inserts the expression as the field's draft (auto-draft model)
6. The entire flow works locally against a deployed API endpoint

Success means a stakeholder can see the NL → Rule feature work end-to-end in a live demo, generating valid DSL expressions from natural language.

---

## Assumptions

- A `suggest-expression` Lambda will be deployed at `POST ${VITE_API_URL}/ai/suggest-expression` following the same conventions as the deployed `explain-rule` Lambda
- The Lambda accepts a POST body with at minimum `{ instruction, targetPath, targetType, sourceFields }` and returns the `AIResult`/`AIError` envelope with `data: { expression: string, explanation?: string }`
- The Lambda uses promptId `nl-to-rule` and calls `invokeAI()` from the shared AI runtime (FS-031)
- `VITE_API_URL` is set to the same API Gateway base URL used for explain-rule in showcase environments
- CORS is configured on the backend with `Access-Control-Allow-Origin: *`
- No authentication is required for the showcase endpoint
- The existing `HybridAdapter`, `ai-api-client.ts`, and bootstrap infrastructure from FS-041 are implemented and working
- The `LocalStorageAdapter` continues to throw "Not available in offline mode" for `suggestExpression`
- No response caching — each suggest request is fresh

---

## Current Context

### Adapter Infrastructure (from FS-041)

FS-041 established the showcase AI integration pattern:

- `ai-api-client.ts` exports `explainRuleHttp()` — a fetch-based HTTP function with timeout, error mapping, and AI envelope parsing
- `HybridAdapter` extends `LocalStorageAdapter` and overrides `explainRule` to call the HTTP function
- `bootstrap.ts` returns `HybridAdapter` when `VITE_API_URL` is set
- `useExplainRule()` hook manages async lifecycle with abort-on-unmount semantics
- `ExplanationPanel` renders inline success/error results below the action row

This spec extends all of these with a second AI endpoint (`suggest-expression`).

### Existing Types

In `ui/src/lib/types/domain.ts`:

```typescript
export interface SuggestExpressionInput {
  readonly instruction: string;
  readonly targetPath: string;
  readonly context?: Readonly<Record<string, unknown>>;
}

export interface SuggestExpressionResult {
  readonly expression: string;
  readonly explanation?: string;
}
```

The existing `SuggestExpressionInput` has a generic `context` field. For the showcase, we replace this with explicit typed fields matching the approved backend contract: `targetType`, `targetDescription`, and `sourceContext` (a pre-formatted text block of available source fields).

### Suggest Button Locations

1. **`ScalarFieldBuilder.tsx`** (~line 856): disabled `<button>` with `data-testid="ai-suggest-btn"`, tooltip "AI-powered expression suggestions — available in a future release", `Sparkles` icon
2. **`ChainBuilderShell.tsx`** (~line 168): disabled `<button>` in `AiActionBar` with `data-testid="chain-shell-ai-suggest"`

Both buttons are currently `disabled` with `cursor-not-allowed` and `opacity-50`.

### Backend Contract (Target)

Per PRODUCT-TECHNICAL.md §15.2:

| Lambda | Trigger | Prompt ID | Responsibility |
|---|---|---|---|
| `kbx-keyra-suggestexpression` | `POST /ai/suggest-expression` | `nl-to-rule` | Tier 1 LLM call: NL instruction + source field context → single DSL expression |

### Source Field Context — Showcase Simplification

**Production architecture** (§13.3–13.4): The backend retrieves relevant source fields via RAG (OpenSearch hybrid search + DynamoDB structural enrichment).

**Showcase substitute (this spec)**: The UI derives source field context from the currently loaded/parsed source schema and formats it as a compact text block (`sourceContext` string). This is a temporary local-first approach:

- Today: UI formats source fields as a newline-separated list (e.g., `"- InvoiceCurrency (string)\n- Header.Currency (string)"`) and sends it in `sourceContext`
- Later: Backend ignores `sourceContext` and retrieves context via RAG pipeline; the field becomes optional/deprecated

The API contract is designed so that both paths are valid — the backend can accept direct context OR retrieve its own. The `sourceContext` field is required for the showcase slice but will become optional once RAG is active.

### Related Active Specs

- **FS-041** (active): UI Integration for Explain Rule API — establishes the adapter/HTTP/hook pattern this spec extends
- **FS-031** (active): Shared AI Runtime — backend infrastructure that the suggest-expression Lambda will consume

---

## Scope

### In Scope

1. **Type updates**: Enrich `SuggestExpressionInput` with showcase-mode fields (`targetType`, `targetDescription`, `sourceContext` as formatted text string); deprecate the generic `context` field; keep backward-compatible (new fields optional except `sourceContext` which is required for showcase)
2. **HTTP client**: Add `suggestExpressionHttp()` to `ai-api-client.ts` following the established pattern
3. **HybridAdapter update**: Override `suggestExpression` to call the HTTP function when API URL is configured
4. **`useSuggestExpression()` hook**: Async lifecycle hook (idle → inputting → loading → success → error) with abort semantics
5. **`SuggestExpressionInline` component**: Inline input + result panel (instruction textarea, Generate button, suggestion display with Accept/Dismiss)
6. **ScalarFieldBuilder integration**: Enable the Suggest button, show inline suggest panel, wire Accept to `updateDraft`
7. **ChainBuilderShell integration**: Same pattern applied to the chain builder's AI bar
8. **Architecture update**: Document the `suggestExpressionHttp` extension and showcase source-context pattern in `ui-application.md`

### Out of Scope

- Backend Lambda implementation (the Lambda is assumed deployed or deployable independently)
- RAG pipeline implementation
- Full `HttpAdapter` for all CRUD operations
- Other AI features (auto-map, smart-fix, validate-mappings, describe-fields)
- Authentication, authorization, or API key management
- Schema indexing / OpenSearch integration
- Prompt registry management
- Redesigning the Mapping Editor layout
- Deployment workflow or CI/CD changes

---

## Non-Goals

- This spec does not implement RAG retrieval — it provides a direct-context substitute that is explicitly temporary
- This spec does not establish a generic "AI suggestion" framework — it implements exactly one endpoint (`suggest-expression`)
- This spec does not add caching of suggestions — each request is fresh
- This spec does not auto-apply suggestions — explicit user acceptance is required
- This spec does not validate the suggested expression via the engine before showing it (that is a future enhancement)

---

## Relevant Areas

- `ui/src/lib/types/domain.ts` — `SuggestExpressionInput`, `SuggestExpressionResult` types
- `ui/src/lib/api/types.ts` — `ApiAdapter` interface (already has `suggestExpression`)
- `ui/src/lib/api/ai-api-client.ts` — add `suggestExpressionHttp()`
- `ui/src/lib/api/hybrid-adapter.ts` — override `suggestExpression`
- `ui/src/lib/api/local-storage-adapter.ts` — already throws for `suggestExpression` (no change)
- `ui/src/features/mappings/hooks/use-suggest-expression.ts` — new hook
- `ui/src/features/mappings/components/SuggestExpressionInline.tsx` — new component
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx` — Suggest button integration
- `ui/src/features/mappings/components/ChainBuilderShell.tsx` — Suggest button integration
- `forge/architecture/ui-application.md` — architecture update

---

## Dependencies / Blockers

- FS-041 (Explain Rule vertical slice) must be completed — this spec extends its infrastructure (HybridAdapter, ai-api-client, bootstrap pattern)
- A backend `suggest-expression` Lambda must be deployed at `${VITE_API_URL}/ai/suggest-expression` for end-to-end testing (but the UI work can proceed independently with mock/stub testing)

---

## Constraints

- All AI calls go through backend only — no API keys or model calls in the browser
- UI is React/TypeScript/Vite — all existing conventions apply
- Mapping engine remains pure TypeScript, separate from backend concerns
- AI output is suggestion-only — must be explicitly accepted by the user (never auto-applied)
- Save ≠ Deploy — accepting a suggestion modifies the draft, not the saved/deployed state
- The `LocalStorageAdapter` must continue to work unchanged when `VITE_API_URL` is not set
- TypeScript strict mode, zero-error lint/typecheck policy
- Desktop-first (1024px+ minimum)
- Each suggestion request is fresh — no caching
- Stale suggestions must not persist after the target field changes or the instruction is modified

---

## Proposed Behavior

### User Flow

1. User opens the Mapping Editor and selects a target field (scalar)
2. In `ScalarFieldBuilder` (or `ChainBuilderShell`), the Suggest button is visible and enabled
3. User clicks Suggest
4. An inline input area appears below the AI action row:
   - A textarea for the natural language instruction (placeholder: "Describe the mapping logic…")
   - A "Generate" button
   - Contextual info line showing the target field path and type
5. User types an instruction (e.g., "default to USD if the source currency field is empty")
6. User clicks Generate (or presses Ctrl+Enter)
7. A loading spinner replaces the Generate button
8. After 1–5 seconds, the result appears:
   - The suggested DSL expression displayed in a monospaced code block
   - An optional explanation (1–2 sentences, if returned by the backend)
   - **Accept** button — inserts the expression as the draft for the current field
   - **Dismiss** button — closes the suggestion panel
9. If the user clicks Accept:
   - The expression is set as the draft via `updateDraft(targetPath, suggestedExpression)`
   - The suggestion panel closes
   - The draft expression is now visible/editable in the expression area
   - The inline preview fires automatically (existing auto-preview on draft stabilization)
10. If the user clicks Dismiss:
    - The suggestion panel closes
    - No change to the draft expression

### System Behavior

**When `VITE_API_URL` is configured:**

1. `createAdapter()` returns `HybridAdapter(apiUrl)` (existing FS-041 behavior)
2. `HybridAdapter.suggestExpression()` overrides the parent to call `suggestExpressionHttp(apiUrl, input)`
3. `suggestExpressionHttp()` in `ai-api-client.ts`:
   - `POST`s to `${apiUrl}/ai/suggest-expression` with JSON body
   - Sets `Content-Type: application/json`
   - Applies a 30-second timeout (longer than explain-rule due to context processing)
   - On 200 + `success: true`: extracts `data` field, maps to `SuggestExpressionResult`
   - On non-200 or `success: false`: throws a descriptive error
4. `useSuggestExpression()` hook manages state transitions and abort logic

**Request body construction (showcase mode):**

The hook/component gathers:
- `instruction` — from the user's textarea input (required)
- `targetPath` — from the currently selected target field (required)
- `targetType` — from the target schema node's type (required)
- `targetDescription` — from the target schema node's description (optional, if available)
- `sourceContext` — a pre-formatted text block derived from the parsed source schema: one line per leaf field in the format `"- {path} ({type})"`, newline-separated

Source context formatting:
- Format: `"- Invoice.Amount (number)\n- Invoice.CurrencyCode (string)\n- Invoice.Date (string)"`
- Maximum 200 leaf fields included (to avoid excessive request size)
- If the source schema has more, truncate to the first 200 leaf fields
- If no source schema is loaded, send an empty string `""`

**When `VITE_API_URL` is not configured:**

1. Button is always enabled (same as Explain in FS-041)
2. Clicking Suggest opens the input area
3. Clicking Generate invokes `adapter.suggestExpression()` which throws
4. Hook catches the throw → error message: "Suggest Expression is not available in offline mode"

### Failure / Edge Behavior

| Scenario | Behavior |
|---|---|
| `VITE_API_URL` not set (offline mode) | `LocalStorageAdapter.suggestExpression()` throws → hook catches → error state: "Suggest Expression is not available in offline mode" |
| Network failure / timeout (30s) | `fetch` throws or `AbortController` fires → error: "Could not reach the Suggest service. Check your connection and try again." |
| Backend 400 (bad request) | Error: "Invalid request — check the instruction and try again." |
| Backend 429 (rate limited) | Error: "The AI service is temporarily busy. Please try again in a moment." |
| Backend 500+ (server error) | Error: "The Suggest service encountered an error. Please try again." |
| Malformed response (not JSON, missing `expression` field) | Error: "Received an unexpected response from the server." |
| Empty instruction text | Generate button is disabled; tooltip: "Enter an instruction first" |
| No expression on current field (empty) | Suggest button is still enabled — NL → Rule generates a new expression |
| User navigates to a different target field while input is open | Inline area dismisses, any in-flight request is aborted |
| User clicks Suggest again while panel is open | Panel resets to input state (clears any previous result) |
| User clicks Generate again while loading | Previous request aborted, new request started |
| Source schema not loaded | `sourceContext` sent as empty string `""`; backend handles as best-effort |
| Target field changes after result is shown | Suggestion panel auto-dismisses (stale result) |

---

## Acceptance Examples

### AE-01 — Suggest Expression success (ScalarFieldBuilder)

**Given**
- `VITE_API_URL` is set to a valid API Gateway URL
- User has a scalar target field selected: `Order.Header.Currency` (type: `string`)
- Source schema is loaded with fields including `Invoice.CurrencyCode`

**When**
- User clicks the Suggest button in ScalarFieldBuilder
- User enters instruction: "default to USD if the source currency is missing"
- User clicks Generate

**Then**
- A loading spinner appears on the Generate button
- After the API responds, the suggestion area shows:
  - The suggested DSL expression (e.g., `default(source("Invoice.CurrencyCode"), "USD")`)
  - An optional explanation
  - Accept and Dismiss buttons
- The Suggest button returns to its default state

### AE-02 — Accept suggestion inserts draft

**Given**
- A suggestion result is visible showing expression `default(source("Invoice.CurrencyCode"), "USD")`
- The current field's draft is empty

**When**
- User clicks Accept

**Then**
- The suggestion panel closes
- The expression `default(source("Invoice.CurrencyCode"), "USD")` is now the draft for `Order.Header.Currency`
- The expression appears in the expression editing area
- Auto-preview fires after 300ms stabilization (existing behavior)

### AE-03 — Suggest button always enabled (no expression required)

**Given**
- User selects a target field with no existing expression (empty draft)

**When**
- The ScalarFieldBuilder renders

**Then**
- The Suggest button is enabled (unlike Explain, which requires an existing expression)
- The button is styled as interactive (not grayed out)

### AE-04 — API not configured (offline mode)

**Given**
- `VITE_API_URL` is not set

**When**
- User clicks Suggest, enters an instruction, clicks Generate

**Then**
- Error message displayed: "Suggest Expression is not available in offline mode"
- Editor remains fully functional

### AE-05 — Network failure

**Given**
- `VITE_API_URL` is set but the server is unreachable

**When**
- User clicks Suggest, enters instruction, clicks Generate

**Then**
- Loading state appears
- After timeout (30s) or immediate network error: error message "Could not reach the Suggest service. Check your connection and try again."
- A "Try again" button is available (re-submits with same instruction)

### AE-06 — Dismiss clears suggestion

**Given**
- A suggestion result is visible

**When**
- User clicks Dismiss

**Then**
- The suggestion panel closes (returns to collapsed state)
- No change to the draft expression
- Clicking Suggest again reopens the input area (fresh state)

### AE-07 — Target field navigation dismisses panel

**Given**
- The suggest input or result is visible for `Order.Header.Currency`

**When**
- User selects a different target field

**Then**
- The suggestion panel auto-dismisses
- Any in-flight request is aborted
- No error is shown

### AE-08 — Empty instruction disables Generate

**Given**
- The suggest input area is open

**When**
- The instruction textarea is empty or whitespace-only

**Then**
- The Generate button is disabled
- Tooltip: "Enter an instruction first"

### AE-09 — Source context included in request

**Given**
- Source schema is loaded with fields `Invoice.Amount` (number), `Invoice.CurrencyCode` (string), `Invoice.Date` (string)
- User targets `Order.Header.Currency` (type: string, description: "ISO currency code for the document")
- User enters instruction "use the invoice currency"

**When**
- User clicks Generate

**Then**
- The request body sent to the backend is:
  ```json
  {
    "instruction": "use the invoice currency",
    "targetPath": "Order.Header.Currency",
    "targetType": "string",
    "targetDescription": "ISO currency code for the document",
    "sourceContext": "- Invoice.Amount (number)\n- Invoice.CurrencyCode (string)\n- Invoice.Date (string)"
  }
  ```

### AE-10 — HybridAdapter delegates suggestExpression to HTTP

**Given**
- `VITE_API_URL` is set
- `createAdapter()` returns `HybridAdapter`

**When**
- `adapter.suggestExpression(input)` is called

**Then**
- An HTTP POST is made to `${VITE_API_URL}/ai/suggest-expression`
- No localStorage operations occur for this call

### AE-11 — Suggest Expression success (ChainBuilderShell)

**Given**
- Same setup as AE-01 but user is in the chain builder view

**When**
- User clicks the Suggest button in ChainBuilderShell AI bar
- User enters instruction and clicks Generate

**Then**
- Same behavior as AE-01 — input area, loading state, result panel with Accept/Dismiss

### AE-12 — Backend error response

**Given**
- `VITE_API_URL` is set, server returns 500

**When**
- User enters instruction and clicks Generate

**Then**
- Error message: "The Suggest service encountered an error. Please try again."
- Editor remains functional

### AE-13 — Generate while loading aborts previous

**Given**
- A request is in-flight (loading state)

**When**
- User modifies instruction and clicks Generate again (or focus changes cause re-submit)

**Then**
- Previous request is aborted
- New request starts with updated instruction
- Only the latest result is displayed

---

## Open Questions

- none

---

## Verification Strategy

### Automated (unit/component tests)

- **AE-01, AE-11**: Component tests — mock adapter, verify input area → loading → result rendering
- **AE-02**: Component test — verify Accept calls `updateDraft` with the suggested expression
- **AE-03**: Component test — verify Suggest button is enabled even with empty expression
- **AE-04**: Component test — mock `LocalStorageAdapter` (throws), verify error message
- **AE-05, AE-12**: `ai-api-client.ts` unit tests — mock `fetch`, verify error mapping for timeout/500/429
- **AE-06, AE-07**: Component test — dismiss behavior and navigation cleanup
- **AE-08**: Component test — Generate disabled when instruction is empty
- **AE-09**: Unit test — verify request body construction includes source fields
- **AE-10**: `HybridAdapter` unit test — verify `suggestExpression` calls HTTP
- **AE-13**: Hook test — verify `AbortController.abort()` on re-invocation

### Manual (showcase validation)

- Exercise the full flow against the deployed Lambda in a showcase environment
- Confirm suggested expressions are valid DSL and relevant to the instruction
- Confirm Accept inserts the expression and triggers auto-preview
- Confirm error states render correctly when the backend is unavailable

### Build gate

- `tsc --noEmit` passes with no errors
- `pnpm lint` passes with no errors
- All existing tests continue to pass

---

## Task Generation Notes

This is a **cross-cutting** spec. Tasks are split by execution domain:

- **`task` agent** (T-01 through T-03, T-08): type definitions, HTTP client, adapter update, architecture update
- **`ui-task` agent** (T-04 through T-07): React hook, inline component, ScalarFieldBuilder integration, ChainBuilderShell integration

Sequencing:
1. T-01 (types) — foundation, no dependencies
2. T-02 (HTTP client) — depends on T-01
3. T-03 (HybridAdapter override) — depends on T-02
4. T-04 (hook) — depends on T-01 (uses types; adapter injection is runtime)
5. T-05 (SuggestExpressionInline component) — depends on T-04
6. T-06 (ScalarFieldBuilder integration) — depends on T-05
7. T-07 (ChainBuilderShell integration) — depends on T-05; can parallelize with T-06
8. T-08 (architecture update) — depends on T-03

The vertical slice is "done" when T-06 is complete and the app runs against a configured API URL. T-07 adds parity for the chain builder. T-08 is documentation.

### Showcase-Only vs. Generalizable

| Aspect | Showcase vertical slice (this spec) | Future production architecture |
|---|---|---|
| Source field context | UI formats parsed schema fields into a `sourceContext` text block | Backend retrieves via RAG (OpenSearch + DynamoDB) |
| `sourceContext` field | Required for showcase (primary context source) | Optional/ignored once RAG is active |
| Pre-accept preview | Not shown — user sees preview via existing auto-preview after accept | May show inline preview of suggestion output |
| Input validation | Client-side only (non-empty instruction) | Server-side validation + schema-aware context |
| Expression validation | None before display | Engine `validate()` on suggestion before showing |
| Caching | None | Per-field TTL or session cache |
| Auth | None (CORS-only) | Token-based auth via API Gateway authorizer |
| Source field limit | First 200 leaf fields formatted as text | Backend determines relevance via embedding similarity |

### Future RAG Compatibility

The design preserves RAG compatibility:
1. The `sourceContext` field in the request is explicitly a showcase mechanism — the backend can choose to use it or ignore it
2. When RAG is implemented, the backend retrieves its own context and `sourceContext` becomes a no-op hint (or is omitted entirely)
3. The UI continues to send `sourceContext` for backward compatibility (zero client-side change needed during transition)
4. The API endpoint, response shape, and UI presentation remain identical

---

## Change Log

- Rev 2 — 2026-05-11
  - Resolved Q1: Backend request contract approved as `{ instruction, targetPath, targetType, targetDescription?, sourceContext }` — `sourceContext` is a pre-formatted text block (not a structured array). This simplifies the type model (no `SourceFieldDescriptor` interface needed).
  - Resolved Q2: Pre-accept expression preview deferred — user sees result via existing auto-preview after accepting. Keeps showcase slice minimal.
  - Updated `SuggestExpressionInput` type design: `sourceContext: string` replaces `sourceFields: SourceFieldDescriptor[]`
  - Updated AE-09 with approved request body shape
  - All open questions resolved; spec is ready for task execution
- Rev 1 — 2026-05-11
  - Initial draft
