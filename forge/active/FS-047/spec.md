# SPEC

## Title

Auto-Map Suggestion Targeting — Child Property & Header Modes

---

## ID

FS-047

---

## Metadata

Owner: @christophervuu
Reviewers: TBD
Created: 2026-05-12
Last Updated: 2026-05-12
Type: cross-cutting

Cross-cutting: backend Lambda changes are `task`; frontend hook and UI trigger changes are `ui-task`.

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Refine Auto-Map suggestion targeting so that section-mode auto-map generates suggestions per eligible descendant field (excluding object nodes, including array fields), and introduce a header-level auto-map trigger that targets all eligible fields across the entire schema. Currently, section auto-map may suggest the parent object itself as a target; this spec corrects that to only suggest leaf-scalar and array fields.

---

## Problem

When the user triggers "Auto-Map This Section" on an object node (e.g., `Order.Header`), the AI currently returns suggestions that include the parent object path itself as a mapping target. Object nodes are not valid mapping targets — only their descendant scalar fields and array fields are mappable. The result is that:

1. The user receives a suggestion for `Order.Header` with type `object`, which cannot be meaningfully mapped to an expression.
2. The UI must silently ignore or display a confusing non-actionable suggestion.
3. Eligible child fields may not receive suggestions because the AI "used up" its output on the parent.

Additionally, there is no header-level trigger that auto-maps the entire schema at once (targeting all non-object fields + arrays across all sections). Users currently must trigger per-section, which is friction for small/medium schemas.

---

## Goal

1. Section auto-map generates one suggestion per eligible descendant target field of the selected object (scalars + arrays), never suggesting object nodes.
2. A new header-level auto-map trigger generates suggestions for all eligible targets in the entire schema (non-object fields + arrays), skipping object nodes.
3. Suggestions for object-type targets are filtered out at both the backend and frontend layers (belt-and-suspenders).
4. The existing `/ai/auto-map` route continues to be used — no new endpoint is created.
5. CORS remains functional for browser calls.

---

## Assumptions

- The `auto-map` prompt in Prompt Registry accepts a `{{targetSection}}` placeholder that can receive a field listing.
- Providing an explicit listing of eligible target fields (path + type) as `targetSection` produces better suggestion quality than sending just the section path.
- The AI model respects the listed targets and generates suggestions only for them (a post-processing filter catches any misses).
- The existing `AutoMapSectionInput`, `AutoMapSectionResult`, and `AutoMapSuggestion` types from FS-046 are sufficient and stable.
- The existing `ParsedSchema` nodes available on the frontend include `type` and `path` for all schema fields, enabling frontend-side eligibility filtering.
- CORS headers on the existing `/ai/auto-map` Lambda are already configured correctly (confirmed in handler: `Access-Control-Allow-Origin: *`).

---

## Current Context

### How Section Auto-Map Works Today

1. User selects an object node in the Target Worklist (e.g., `Order.Header`).
2. User clicks "Auto-Map This Section" in `ObjectSummaryPanel`.
3. Frontend calls `adapter.autoMapSection({ projectId, mappingId, sectionPath: "Order.Header", sourceContext })`.
4. `autoMapSectionHttp` sends `POST /ai/auto-map` with body `{ sectionPath: "Order.Header", sourceContext: "..." }`.
5. Backend Lambda reads `sectionPath` and passes it as-is to `invokeAI('auto-map', { targetSection: "Order.Header", sourceContext, businessContext })`.
6. The AI receives `targetSection = "Order.Header"` — just the path string — and guesses what fields to generate.
7. The AI may return a suggestion targeting `Order.Header` itself (an object node) rather than its children.

### Root Cause

The frontend sends only `sectionPath` (a dot-path like `"Order.Header"`). The backend passes this verbatim as `targetSection` to the AI prompt. The AI has no explicit list of eligible target fields, so it may suggest a mapping for the object node itself.

In contrast, the backend test fixture (`auto-map.test.ts`) sends `targetSection` as a full field listing:
```
- Order.Header.DocumentType (string)
- Order.Header.DocumentDate (string)
- Order.Header.CurrencyCode (string)
```

This listing format is what produces correct per-field suggestions. The fix is to have the frontend construct this listing (filtered to eligible targets) and send it alongside the `sectionPath`.

### Existing Route and API

- **Route**: `POST /ai/auto-map` (both frontend `autoMapSectionHttp` and backend Lambda use this)
- **CORS**: Already configured with `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: OPTIONS,POST`, `Access-Control-Allow-Headers: Content-Type,Authorization`
- **Frontend API client**: `ui/src/lib/api/ai-api-client.ts` → `autoMapSectionHttp()`
- **Backend handler**: `src/lambda/ai/auto-map.ts`
- **Prompt**: `promptId = "auto-map"` with `{{targetSection}}`, `{{sourceContext}}`, `{{businessContext}}` placeholders

### Eligible Target Definition

A target field is "eligible" for auto-map suggestions when:
- Its type is **not** `object` (scalar types: string, number, integer, boolean, null, any)
- OR its type is `array`

Object nodes are never eligible because they represent structural groupings, not individually-mappable fields. Array nodes ARE eligible because they have their own mapping expressions (collection operations like `map`, `filterMap`, etc.).

---

## Scope

### In Scope

1. **Frontend: Build eligible target listing** — When triggering section auto-map, derive the list of eligible descendant targets (non-object + array) from `parsedTargetSchema` and send it as `targetSection` in the request body alongside `sectionPath`.
2. **Frontend: Header-level trigger** — Add an "Auto-Map All" trigger in the editor toolbar/header that sends all eligible targets from the entire schema as `targetSection`, with `sectionPath` omitted or set to the root.
3. **Backend: Post-processing filter** — After AI returns suggestions, filter out any where `target` resolves to an object-type node (based on the `targetSection` listing sent in the request). Belt-and-suspenders defense.
4. **API contract update** — Add optional `targetSection` string field to `AutoMapSectionInput` interface (the field listing text sent to the AI). Keep `sectionPath` for UI display/context. Backend prefers `targetSection` over `sectionPath` when both are present (already implemented in Lambda handler).
5. **Frontend hook update** — Modify `useAutoMapReview.triggerAutoMap()` to accept the target schema context and derive the eligible field listing.
6. **Update tests** — Backend and frontend tests reflect the new targeting behavior.

### Out of Scope

1. Prompt engineering changes (the prompt already supports `{{targetSection}}` as a field listing)
2. RAG integration or retrieval enhancements
3. Backend Lambda structural refactoring
4. Changes to the `AutoMapReviewDrawer` UI component (it renders whatever suggestions come back)
5. Changes to the review workflow (accept/edit/dismiss)
6. Pagination or chunking of large field sets (future concern)

---

## Non-Goals

- Redesigning the auto-map backend architecture
- Adding a new API endpoint (existing `/ai/auto-map` is reused)
- Handling schema-less or inferred schemas differently
- Performance optimization for very large schemas (>200 fields)
- Modifying the AI prompt text itself

---

## Relevant Areas

- `ui/src/features/mappings/hooks/use-auto-map-review.ts` — hook: build eligible target listing
- `ui/src/features/mappings/hooks/use-auto-map-review.test.ts` — hook tests
- `ui/src/lib/api/ai-api-client.ts` — HTTP client: pass `targetSection` in request body
- `ui/src/lib/api/ai-api-client.test.ts` — client tests
- `ui/src/lib/types/domain.ts` — `AutoMapSectionInput` type update
- `ui/src/routes/pages/MappingEditor.tsx` — header trigger wiring
- `ui/src/features/mappings/components/ObjectSummaryPanel.tsx` — section trigger (no change expected, already wired)
- `ui/src/features/mappings/components/EditorTopBar.tsx` — header-level trigger placement ?
- `src/lambda/ai/auto-map.ts` — backend: post-processing filter for object targets
- `tests/lambda/ai/auto-map.test.ts` — backend tests

---

## Dependencies / Blockers

- **FS-046 (in progress)** — establishes the Auto-Map review drawer, `useAutoMapReview` hook, and `autoMapSection` adapter method. This spec builds on those artifacts.
- **FS-045 (completed)** — the backend Lambda handler exists and is functional.

---

## Constraints

- The `/ai/auto-map` route must remain the same for both frontend and backend.
- CORS expectations for browser calls must be preserved (already in place).
- The `AutoMapSectionInput` type extension must be backward-compatible (new field is optional).
- Object-type targets must never appear in the suggestions returned to the UI.
- Array-type targets must be included as eligible.
- The existing section-mode trigger from `ObjectSummaryPanel` must continue to work.
- TypeScript strict mode; zero-error lint/typecheck policy.
- No breaking changes to the adapter interface contract.

---

## Proposed Behavior

### User Flow

#### Section Mode (existing trigger, improved targeting)

1. User selects an object node in the Target Worklist (e.g., `Order.Header`).
2. `ObjectSummaryPanel` renders with the child field list.
3. User clicks "Auto-Map This Section".
4. Frontend derives eligible descendants from `parsedTargetSchema`:
   - Walks all descendants of `Order.Header`
   - Includes fields where `type !== 'object'` (includes string, number, boolean, array, etc.)
   - Excludes fields where `type === 'object'`
5. Frontend formats the listing as `"- Order.Header.DocumentType (string)\n- Order.Header.Currency (string)\n- Order.Header.LineItems (array)\n..."`.
6. Request sent to `/ai/auto-map` with `{ sectionPath: "Order.Header", targetSection: "<listing>", sourceContext: "<source listing>" }`.
7. AI generates suggestions only for the listed fields.
8. Backend post-processes: filters out any suggestion where the target matches an object node pattern (safety net).
9. Review drawer opens with per-field suggestions.

#### Header Mode (existing button, activated)

1. User is in the Mapping Editor with a mapping loaded.
2. User clicks the existing "Auto-map" button in `EditorTopBar` (currently a disabled placeholder, converted to a live button by this spec).
3. Frontend derives all eligible targets from the entire `parsedTargetSchema`:
   - Walks all nodes in the schema
   - Includes fields where `type !== 'object'`
   - Excludes fields where `type === 'object'`
4. Frontend formats the full listing and sends to `/ai/auto-map` with `{ targetSection: "<full listing>", sourceContext: "<source listing>" }` (no `sectionPath` or sectionPath set to root).
5. AI generates suggestions for all listed targets.
6. Backend post-processes the same way.
7. Review drawer opens with suggestions for the entire schema.

### System Behavior

#### Eligible Target Derivation (Frontend)

A new utility function `deriveEligibleTargets(schema: ParsedSchema, sectionPath?: string): string` that:

1. Iterates `schema.nodes`
2. If `sectionPath` is provided, filters to nodes whose `path` starts with `sectionPath + '.'` (descendants only, not the section itself)
3. If `sectionPath` is omitted/null, uses all nodes
4. Excludes nodes where `type === 'object'`
5. Formats each eligible node as `"- {path} ({type})"`
6. Returns joined string (newline-separated), capped at a reasonable limit (200 lines to match `SOURCE_CONTEXT_LINE_LIMIT`)

#### API Contract

`AutoMapSectionInput` extended with an optional `targetSection` field:

```typescript
interface AutoMapSectionInput {
  readonly projectId: string;
  readonly mappingId: string;
  readonly sectionPath?: string;       // context only (display, retry); optional for header mode
  readonly targetSection?: string;     // NEW: explicit eligible target listing for AI
  readonly sourceContext?: string;
}
```

The HTTP client sends `targetSection` in the request body when present. The backend Lambda already handles this correctly — it prefers `targetSection` over `sectionPath` (existing fallback logic at line 114-119 of `auto-map.ts`).

#### Backend Post-Processing Filter

After the AI returns suggestions and they are enriched with validation, the handler filters out suggestions where the target path ends with a known object suffix or matches an object node pattern. Since the backend does not have access to the parsed schema, the filter uses a heuristic:

- If the `targetSection` listing was provided, extract the set of listed targets. Any AI suggestion whose `target` is not in this set is filtered out.
- This implicitly removes object targets since they were never listed.

This is already partially implemented via the `.filter((suggestion) => suggestion.target !== '' && suggestion.expression !== '')` at line 202, but should be strengthened to validate against the input listing.

#### Header Trigger Integration

The existing disabled "Auto-map" placeholder button in `EditorTopBar` (lines 238-249, `data-testid="automap-button"`) is converted to a live button. Clicking it:

1. Calls `autoMapReview.triggerAutoMap(null)` or a new `autoMapReview.triggerAutoMapAll()` method.
2. The hook derives eligible targets from the full schema (no section filter).
3. The review drawer opens with results for the entire schema.

### Failure / Edge Behavior

#### Object with no eligible children
- If the selected object has only object-type children (deeply nested structure with no leaf fields at the direct level), the eligible listing may be empty or contain only deeply nested fields.
- If the listing is empty after filtering, show a user message: "No eligible target fields found in this section."
- Do not send the request to the backend.

#### Target listing exceeds limit
- If the schema has >200 eligible targets, the listing is truncated to 200 lines (matching SOURCE_CONTEXT_LINE_LIMIT).
- The AI will only generate suggestions for the fields it sees in the listing.
- No error is shown; partial coverage is acceptable.

#### AI suggests unlisted target
- The backend filter removes any suggestion whose target is not in the provided listing.
- A console warning is logged for debugging.
- The user never sees the invalid suggestion.

#### Empty AI response
- Handled by existing FS-046 empty state (drawer shows "No suggestions generated").

#### sectionPath omitted (header mode)
- `sectionPath` field is not sent or sent as empty string.
- Backend treats `targetSection` as the complete context.
- Frontend hook stores `sectionPath` as `null` for header mode; drawer shows "All fields" context.

---

## Acceptance Examples

### AE-01 — Section with 5 eligible children returns up to 5 suggestions

**Given**
- Target schema has `Order.Header` (object) with children:
  - `Order.Header.DocumentType` (string)
  - `Order.Header.Currency` (string)
  - `Order.Header.OrderDate` (string)
  - `Order.Header.TotalAmount` (number)
  - `Order.Header.LineItems` (array)

**When**
- User triggers "Auto-Map This Section" on `Order.Header`

**Then**
- The request to `/ai/auto-map` includes `targetSection` listing all 5 children (not `Order.Header` itself)
- AI may return up to 5 suggestions, each targeting one of the listed fields
- No suggestion targets `Order.Header` (the object node)

### AE-02 — Parent object target suggestion is filtered out

**Given**
- AI response includes a suggestion with `target: "Order.Header"` (object type)
- The `targetSection` listing sent to the AI did not include `Order.Header`

**When**
- Backend post-processes the response

**Then**
- The suggestion for `Order.Header` is removed
- Only suggestions for targets present in the `targetSection` listing are returned
- Frontend never receives a suggestion for an object-type target

### AE-03 — Array fields are included as eligible targets

**Given**
- `Order.Header.LineItems` has type `array`
- User triggers section auto-map for `Order.Header`

**When**
- Frontend derives eligible targets

**Then**
- `Order.Header.LineItems (array)` is included in the `targetSection` listing
- AI may generate a suggestion for `Order.Header.LineItems`
- The suggestion is returned to the frontend (not filtered out)

### AE-04 — Header trigger targets all eligible fields in schema

**Given**
- Schema has 15 total nodes: 3 object nodes, 10 scalar fields, 2 array fields

**When**
- User clicks "Auto-Map All" in the header/toolbar

**Then**
- `targetSection` listing contains 12 entries (10 scalars + 2 arrays)
- Object nodes are excluded from the listing
- `sectionPath` is null or omitted
- Review drawer opens with suggestions for eligible fields from any part of the schema

### AE-05 — Header trigger skips object nodes, includes arrays

**Given**
- Schema contains:
  - `Order` (object) — excluded
  - `Order.Header` (object) — excluded
  - `Order.Header.Id` (string) — included
  - `Order.Lines` (array) — included
  - `Order.Lines.LineNumber` (number) — included

**When**
- Header-level auto-map is triggered

**Then**
- `targetSection` listing is:
  ```
  - Order.Header.Id (string)
  - Order.Lines (array)
  - Order.Lines.LineNumber (number)
  ```
- Object entries `Order` and `Order.Header` are NOT in the listing

### AE-06 — Section with only object children shows appropriate message

**Given**
- `Order.Details` (object) contains only `Order.Details.Metadata` (object) and `Order.Details.Tracking` (object)

**When**
- User triggers "Auto-Map This Section" on `Order.Details`

**Then**
- Frontend determines eligible target list is empty (no non-object descendants)
- No request is sent to the backend
- User sees a message: "No eligible target fields found in this section"

### AE-07 — Existing route and CORS work for browser calls

**Given**
- Frontend is running in browser at `localhost:5173`
- Backend is at `https://api.example.com`

**When**
- Frontend sends `POST https://api.example.com/ai/auto-map` with `targetSection` listing

**Then**
- CORS preflight (OPTIONS) returns 200 with appropriate headers
- POST request succeeds with standard JSON response
- No CORS errors in browser console

---

## Open Questions

All resolved in Rev 2.

- `Q1.` **Header trigger placement** — Resolved: **Use the existing disabled "Auto-map" placeholder button in `EditorTopBar`** (lines 238-249, `data-testid="automap-button"`). Convert it from a disabled placeholder to a live button that triggers header-mode auto-map. No new button needed.
- `Q2.` **Deeply nested descendants** — Resolved: **Yes, include all descendants recursively** (e.g., `Order.Header.Address.Street`), excluding object nodes at any nesting level. This provides maximum coverage for deeply nested schemas.
- `Q3.` **Target listing size cap** — Resolved: **200 lines is fine.** Matches the existing `SOURCE_CONTEXT_LINE_LIMIT`.

---

## Verification Strategy

- **Unit tests** for `deriveEligibleTargets` utility: correctly filters object nodes, includes arrays, respects section prefix, handles empty schemas (maps to AE-01, AE-03, AE-04, AE-05, AE-06)
- **Unit tests** for backend post-processing filter: removes suggestions not in the target listing (maps to AE-02)
- **Unit tests** for `useAutoMapReview` hook: sends `targetSection` in input, handles header mode (no sectionPath) (maps to AE-01, AE-04)
- **Unit tests** for `autoMapSectionHttp`: includes `targetSection` in request body when present
- **Component tests** for header trigger: button renders, click triggers auto-map with full schema listing
- **TypeScript strict typecheck** passes across all touched files
- **ESLint** passes with zero errors
- **Build** (`pnpm build` in `ui/`) succeeds
- **Existing tests** continue to pass (backward compatibility)

---

## Task Generation Notes

This is a cross-cutting spec. Tasks split into two execution domains:

**`task` agent (backend):**
- T-01: Backend post-processing filter — validate suggestions against the target listing sent in the request; filter out unlisted targets
- T-02: Backend tests update — add test cases for the new filtering behavior

**`ui-task` agent (React/frontend):**
- T-03: `deriveEligibleTargets` utility function — new pure function to derive eligible target field listing from ParsedSchema
- T-04: Update `AutoMapSectionInput` type + `autoMapSectionHttp` client — add optional `targetSection` field, send it in the request body
- T-05: Update `useAutoMapReview` hook — derive and pass `targetSection` listing when triggering auto-map; handle header mode (no sectionPath, full schema)
- T-06: Header-level "Auto-Map All" trigger — add trigger button to EditorTopBar, wire to autoMapReview hook

Task dependencies:
- T-01 and T-02 can proceed independently of frontend tasks
- T-03 must complete before T-05 (utility needed by hook)
- T-04 must complete before T-05 (type update needed by hook)
- T-05 must complete before T-06 (hook update needed for header trigger)

---

## Change Log

- Rev 2 — 2026-05-12
  - Resolved all 3 open questions (Q1-Q3)
  - Q1: Header trigger uses existing disabled "Auto-map" placeholder button in EditorTopBar (data-testid="automap-button"); no new button
  - Q2: Section mode includes all recursive descendants (excluding object nodes at any level)
  - Q3: 200-line target listing cap confirmed as sufficient
  - Updated T-06 task to reference existing button conversion
- Rev 1 — 2026-05-12
  - Initial draft
