# SPEC

## Title

Auto-Map Review Drawer — Showcase Vertical Slice

---

## ID

FS-046

---

## Metadata

Owner: @christophervuu
Reviewers: TBD
Created: 2026-05-11
Last Updated: 2026-05-11
Type: cross-cutting

Cross-cutting: type definitions and API client work are `task`; all UI components and hooks are `ui-task`.

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Implement a right-side review drawer in the Mapping Editor for reviewing, accepting, editing, and dismissing AI-generated Auto-Map suggestions. This is the showcase/local-first vertical slice that surfaces Auto-Map results after the user triggers "Auto-Map This Section." The drawer follows the §13.7 AI UX pattern (request → loading → review → accept/edit/dismiss) and extends the FS-041/FS-042 showcase AI integration pattern to a multi-suggestion, section-level review flow.

---

## Problem

Auto-Map is a core AI feature that generates mapping suggestions for an entire target section. The backend slice for section-based Auto-Map is being developed separately, but no UI exists to review the returned suggestions. Without a review surface, Auto-Map suggestions cannot be presented to users, which blocks the TTFSM optimization goal and showcase readiness.

The existing AI integration patterns (FS-041 Explain Rule, FS-042 Suggest Expression) handle single-field inline interactions. Auto-Map returns many suggestions at once and requires a different review surface — a multi-item review flow that lets users scan, compare, accept, edit, or dismiss suggestions in bulk without leaving the Mapping Editor.

---

## Goal

Deliver a polished, demoable Auto-Map review drawer that:

1. Presents section-level Auto-Map suggestions in a right-side drawer without navigating away from the Mapping Editor
2. Shows current expression vs suggested expression comparison per target field
3. Supports per-suggestion Accept, Edit, and Dismiss actions
4. Supports bulk "Accept All Valid" for rapid adoption of safe suggestions
5. Surfaces confidence, validation status, and explanations per suggestion
6. Handles loading, empty, error, and completion states gracefully
7. Integrates with the existing `useMappingEditor` draft model for accepting suggestions
8. Remains decoupled from specific backend implementation details so it continues to work when Auto-Map transitions from showcase to full RAG

---

## Assumptions

- The backend Auto-Map endpoint returns a response envelope consistent with the `AIResult<T>` pattern from `ai-runtime.md`
- The backend returns per-suggestion `confidence` and optional `validation` status
- Auto-Map is section-based for the showcase slice (the user selects a target section, not the entire mapping)
- The existing `HybridAdapter` pattern (FS-041) and `ai-api-client.ts` HTTP client pattern are stable and correct to extend
- The `useMappingEditor` auto-draft model (FS-039) is the correct integration point for accepting suggestions (via `updateDraft`)
- The Mapping Editor three-column layout and `MappingEditorPage` slot pattern are stable
- A right-side drawer at the route-page composition level (same pattern as `VersionHistoryDrawer`) is architecturally appropriate
- Per §17.1, AI output is suggestion-only and never auto-committed

---

## Current Context

### Existing AI Integration Pattern (FS-041/FS-042)

The showcase AI features follow a layered vertical slice pattern:

1. **Type contract** in `ui/src/lib/types/domain.ts`
2. **HTTP function** in `ui/src/lib/api/ai-api-client.ts`
3. **`HybridAdapter` override** to route the AI method to HTTP when `VITE_API_URL` is set
4. **Feature hook** for async lifecycle + abort semantics
5. **Inline UI component** for user interaction and result presentation

Current slices: `explainRule` (FS-041), `suggestExpression` (FS-042). Both are single-field, inline interactions within `ScalarFieldBuilder`. Auto-Map requires extending this pattern to a multi-suggestion, section-level review flow.

### Existing Auto-Map Types (Phase 0 stubs)

`AutoMapInput` and `AutoMapResult` already exist in `domain.ts` as minimal stubs:

```ts
interface AutoMapInput {
  readonly projectId: string;
  readonly mappingId: string;
}

interface AutoMapResult {
  readonly rules: readonly MappingRule[];
  readonly diagnostics?: readonly Diagnostic[];
}
```

These are intentionally minimal. This spec adds **new** types alongside them — `AutoMapSectionInput`, `AutoMapSectionResult`, and `AutoMapSuggestion` — rather than modifying the existing stubs. The existing `autoMap()` adapter method and its types remain untouched for future full-schema Auto-Map use. A new `autoMapSection()` adapter method with separate types keeps the contracts cleanly separated.

### Existing Drawer Patterns

Two right-side drawer patterns exist in the Mapping Editor:

- **`VersionHistoryDrawer`** — `fixed right-0 top-0 z-50, w-[440px]`, `role="dialog"`, `aria-modal`, focus trap, Escape close, backdrop dismiss. Composed at the route page level outside `MappingEditorPage`.
- **`UnsavedChangesOverlay`** — Similar modal overlay with `role="dialog"`, focus trap, Escape close.

The Auto-Map review drawer should follow the `VersionHistoryDrawer` pattern (right-side fixed drawer, same z-level, same composition point).

### Mapping Editor Draft Model (FS-039)

The editor uses an auto-draft save model:
- `updateDraft(targetPath, expression)` — writes a draft for a target field
- `getDraftExpression(targetPath)` — reads the current draft
- `save()` — merges all drafts into saved rules

Accepting an Auto-Map suggestion should use `updateDraft(target, expression)` to write the suggested expression as a draft. This ensures accepted suggestions flow through the same save pipeline as manual edits.

### Product Spec References

- **§6.3 Panel 6** — AI features accessible via contextual buttons, follow suggestion pattern
- **§13.3 Auto-Map** — Suggestions with ✨ badges, Accept/Edit/Dismiss per rule, "Accept All" with confirmation
- **§13.7 AI UX Pattern** — Request → Loading → Review → Accept/Edit/Dismiss, never auto-commit
- **§17.1** — "Suggest, never auto-commit" principle

---

## Scope

### In Scope

1. **Domain types** — Add new `AutoMapSectionInput`, `AutoMapSectionResult`, and `AutoMapSuggestion` types for section-based Auto-Map with per-suggestion explanation, confidence, and validation; add review state types (`SuggestionReviewStatus`, `SuggestionReviewItem`, `AutoMapReviewSummary`). Existing `AutoMapInput`/`AutoMapResult` stubs remain untouched.
2. **API client** — Add `autoMapSectionHttp()` to `ai-api-client.ts`; add new `autoMapSection()` method to `ApiAdapter` interface, `HybridAdapter` (routes to HTTP), and `LocalStorageAdapter` (offline stub). The existing `autoMap()` method remains unchanged.
3. **`useAutoMapReview` hook** — Feature hook managing the full suggestion review lifecycle: trigger request, receive results, track per-suggestion review status, apply accepted suggestions via `updateDraft`
4. **`AutoMapReviewDrawer` component** — Right-side fixed drawer with summary header, scrollable suggestion list, bulk actions bar, loading/empty/error/done states
5. **`SuggestionReviewCard` component** — Individual suggestion card showing target path, new/replace badge, current vs suggested expression, explanation, confidence badge, validation badge, Accept/Edit/Dismiss actions
6. **Bulk "Accept All Valid" action** — Applies all suggestions with `validation.valid === true` (or all suggestions when validation data is absent)
7. **MappingEditorPage integration** — Wire the drawer at the route page composition level; add section-level trigger mechanism; connect drawer actions to `useMappingEditor` draft API
8. **Loading, empty, error, malformed response, and all-done states**
9. **Architecture update** — Update `ui-application.md` to document the Auto-Map review drawer pattern

### Out of Scope

1. Full backend Auto-Map implementation (Lambda, prompt, RAG retrieval)
2. Full RAG retrieval UI
3. Preview-result execution inside the drawer (no live preview of what each suggestion would produce)
4. Deployment workflow changes
5. Full Mapping Editor redesign
6. Bulk selection system (checkboxes per suggestion for selective accept) — unless clearly justified
7. Auth/authorization work
8. Smart Fix integration (post-accept validation → fix loop)
9. "Dismiss All" action (can be added later if needed)

---

## Non-Goals

- Redesigning the Mapping Editor layout or panel structure
- Adding deploy actions to the editor
- Building a full RAG pipeline UI
- Implementing the backend Auto-Map endpoint (separate spec)
- Tight coupling to the temporary no-RAG backend implementation details
- Mobile or responsive layout for the drawer

---

## Relevant Areas

- `ui/src/lib/types/domain.ts` — shared domain types (AutoMapSectionInput, AutoMapSectionResult, AutoMapSuggestion)
- `ui/src/lib/api/ai-api-client.ts` — HTTP client for AI endpoints (autoMapSectionHttp)
- `ui/src/lib/api/hybrid-adapter.ts` — HybridAdapter (autoMapSection override)
- `ui/src/lib/api/types.ts` — ApiAdapter interface (autoMapSection method)
- `ui/src/lib/api/local-storage-adapter.ts` — offline-mode stub (autoMapSection stub)
- `ui/src/features/mappings/hooks/use-auto-map-review.ts` — new hook
- `ui/src/features/mappings/components/AutoMapReviewDrawer.tsx` — new drawer component
- `ui/src/features/mappings/components/SuggestionReviewCard.tsx` — new card component
- `ui/src/features/mappings/components/index.ts` — barrel export
- `ui/src/features/mappings/hooks/index.ts` — barrel export
- `ui/src/routes/pages/MappingEditor.tsx` — drawer composition point
- `forge/architecture/ui-application.md` — architecture update
- `forge/architecture/project-structure.md` — structure update

---

## Dependencies / Blockers

- **FS-041 (completed)** — establishes HybridAdapter + ai-api-client pattern
- **FS-042 (completed)** — extends HybridAdapter pattern; confirms showcase AI integration approach
- **FS-039 (completed)** — establishes auto-draft model (`updateDraft`, `getDraftExpression`)
- **Backend Auto-Map endpoint** — not yet implemented. The UI can be built and tested against mock data / a local adapter stub. The HTTP client function will be ready to connect once the endpoint exists.

---

## Constraints

- AI output is suggestion-only and never auto-committed (§17.1)
- The Mapping Editor remains the main authoring surface
- Save ≠ Deploy; no deploy actions in the editor
- UI is React / TypeScript / Vite
- No external state management library (React Context + hooks only)
- Desktop-first (1280px target, 1024px minimum)
- TypeScript strict mode; zero-error lint/typecheck policy
- Drawer must not require navigating away from the Mapping Editor
- Accepted suggestions must write through `updateDraft(targetPath, expression)` — no bypass of the draft model
- Drawer should remain usable when backend transitions from showcase to RAG (do not couple to temporary backend details)
- Follow existing drawer patterns (VersionHistoryDrawer) for consistency

---

## Proposed Behavior

### User Flow

1. User is in the Mapping Editor, Target View.
2. User selects a target section (object node in the target tree).
3. User clicks **"Auto-Map This Section"** in the `ObjectSummaryPanel` (right panel when an object node is selected).
4. A loading state appears (spinner + contextual message: "Generating mapping suggestions for {sectionName}...").
5. Backend returns suggestions.
6. A right-side drawer slides open showing:
   - **Summary header**: section name, suggestion count, breakdown by validation state and confidence
   - **Bulk actions bar**: "Accept All Valid" button
   - **Scrollable suggestion list**: one `SuggestionReviewCard` per suggestion
7. User reviews each suggestion:
   - **Accept** → suggestion expression is written as a draft via `updateDraft(target, expression)`. Card updates to show "Accepted ✓" state.
   - **Edit** → drawer closes (or stays open), editor navigates to the target field with the suggested expression pre-loaded as a draft. User can modify before saving.
   - **Dismiss** → suggestion is removed from the active review list. No change to editor state.
8. User clicks **"Accept All Valid"** → all suggestions with `validation.valid === true` are accepted in bulk. Cards update to "Accepted ✓" state.
9. When all suggestions are resolved (accepted, edited, or dismissed), the drawer shows a completion summary.
10. User closes the drawer via the X button, Escape key, or backdrop click.

### System Behavior

#### Trigger and Request

- The trigger invokes `adapter.autoMapSection(input)` through the `useAutoMapReview` hook.
- Input includes `projectId`, `mappingId`, `sectionPath` (the `selectedTargetPath` when the user triggers from an object node), and an optional `sourceContext` (a bounded subset of source fields, flattened as compact text lines — temporary RAG substitute).
- The hook manages the async lifecycle: `idle → loading → success | error`.

#### Response Processing

The hook processes the `AutoMapSectionResult` response:

1. Maps each returned suggestion to a `SuggestionReviewItem` with:
   - `suggestion`: the raw suggestion data (target, expression, explanation, confidence, validation)
   - `currentExpression`: looked up from `editor.rules` — the existing expression for this target path, or `null` if no rule exists
   - `reviewStatus`: initialized to `'pending'`
   - `isNew`: `true` if no existing rule maps to this target path

2. Computes summary counts:
   - Total suggestions
   - Valid count, warning count, invalid count (from validation data)
   - High/medium/low confidence counts

#### Accept Action

When the user accepts a suggestion:

1. Call `updateDraft(suggestion.target, suggestion.expression)` on `useMappingEditor`
2. Update the `SuggestionReviewItem.reviewStatus` to `'accepted'`
3. The card renders with an "Accepted ✓" visual state
4. The suggestion remains visible in the list (not removed) so the user retains context

#### Edit Action

When the user clicks Edit:

1. Update the `SuggestionReviewItem.reviewStatus` to `'edited'`
2. Call `updateDraft(suggestion.target, suggestion.expression)` to pre-load the suggestion as a draft
3. Navigate the editor to `suggestion.target` (set `selectedTargetPath`)
4. The drawer remains open so the user can return to reviewing other suggestions
5. The card shows "Editing" state with an indicator that the user is working on it

#### Dismiss Action

When the user dismisses a suggestion:

1. Update the `SuggestionReviewItem.reviewStatus` to `'dismissed'`
2. No change to editor state
3. The card collapses to a reduced "Dismissed" state with an **Undo** button
4. The suggestion remains in the list, visually de-emphasized but recoverable
5. Clicking **Undo** on a dismissed card sets `reviewStatus` back to `'pending'` and restores the full card view

#### Undo Dismiss

When the user clicks Undo on a dismissed suggestion:

1. Update the `SuggestionReviewItem.reviewStatus` from `'dismissed'` back to `'pending'`
2. The card re-expands to the full pending state with all action buttons available
3. Summary recalculates (pending count increases, dismissed count decreases)

#### Bulk Accept All Valid

When the user clicks "Accept All Valid":

1. Identify all suggestions where `reviewStatus === 'pending'` AND (`validation.valid === true` OR validation data is absent)
2. For each eligible suggestion, call `updateDraft(suggestion.target, suggestion.expression)`
3. Update all eligible `SuggestionReviewItem.reviewStatus` to `'accepted'`
4. Show a brief toast or inline confirmation: "N suggestions accepted"

#### Drawer Lifecycle

- Drawer opens after suggestions are returned (automatic open on success)
- Drawer remains open until the user explicitly closes it
- Drawer can be re-opened if closed (suggestions are retained in hook state until a new Auto-Map request is triggered)
- A new Auto-Map request replaces the previous results
- Drawer is rendered at the route-page level (same as `VersionHistoryDrawer`), outside the `MappingEditorPage` grid

### Failure / Edge Behavior

#### Loading State
- Drawer may optionally open immediately with a loading indicator, or the loading state may render inline (e.g., in the trigger button area) with the drawer opening only on success.
- For showcase: prefer opening the drawer on success (cleaner UX for demos).

#### No Suggestions Returned
- Drawer opens with an empty state: "No suggestions were generated for this section. All target fields may already be mapped, or the AI could not determine appropriate mappings."
- Close button available.

#### Backend Request Failed
- Drawer opens with an error state: "Failed to generate suggestions. {error message}" with a "Try Again" button.
- Alternatively, the error can be shown inline without opening the drawer.

#### Malformed Response
- If the response cannot be parsed into the expected shape, treat as an error: "Received an unexpected response. Please try again."

#### All Suggestions Resolved
- When all suggestions have been accepted, edited, or dismissed, the drawer shows a summary: "All N suggestions reviewed. M accepted, K dismissed."
- The "Accept All Valid" button is disabled when no pending suggestions remain.

#### Suggestion for a Field with Existing Draft
- If the target field already has an unsaved draft, accepting the suggestion overwrites the draft.
- The comparison should show the *saved* expression as "current" (not the draft), since the user's draft is in-progress work.
- This behavior matches the §13.3 intent: Auto-Map suggestions replace existing rules.

#### Duplicate Target in Suggestions
- If the backend returns multiple suggestions for the same target path, only the first is shown. The duplicate is silently dropped with a console warning.

---

## Acceptance Examples

### AE-01 — Drawer opens with suggestions after Auto-Map

**Given**
- User is in the Mapping Editor with a target schema containing an "Order.Header" object section
- "Order.Header" has 5 child fields

**When**
- User triggers Auto-Map for "Order.Header"
- Backend returns 4 suggestions

**Then**
- A right-side drawer opens
- Summary shows "4 suggestions for Order.Header"
- 4 SuggestionReviewCards are rendered
- Each card shows target path, suggested expression, explanation, confidence badge

### AE-02 — Accept a single suggestion

**Given**
- Drawer is open with 4 pending suggestions
- "Order.Header.DocumentType" has suggestion: `if(lt(source("InvoiceAmount"), 0), "CreditMemo", "Invoice")`
- No existing rule for this target

**When**
- User clicks Accept on the DocumentType suggestion

**Then**
- `updateDraft("Order.Header.DocumentType", 'if(lt(source("InvoiceAmount"), 0), "CreditMemo", "Invoice")')` is called
- The card shows "Accepted ✓" state
- The card shows an "isNew" badge (no existing rule was replaced)
- Summary updates to reflect 1 accepted, 3 pending

### AE-03 — Accept suggestion that replaces existing rule

**Given**
- Drawer is open with suggestions
- "Order.Header.Currency" has existing rule: `source("CurrencyCode")`
- Suggestion: `default(source("CurrencyCode"), "USD")`

**When**
- User clicks Accept

**Then**
- Card shows "Replaces existing" badge
- Card shows current expression vs suggested expression comparison
- `updateDraft("Order.Header.Currency", 'default(source("CurrencyCode"), "USD")')` is called
- Card shows "Accepted ✓" state

### AE-04 — Edit a suggestion

**Given**
- Drawer is open with suggestions
- "Order.Header.OrderDate" has suggestion: `formatDate(source("InvoiceDate"), "yyyy-MM-dd")`

**When**
- User clicks Edit on the OrderDate suggestion

**Then**
- `updateDraft("Order.Header.OrderDate", 'formatDate(source("InvoiceDate"), "yyyy-MM-dd")')` is called
- `selectedTargetPath` is set to "Order.Header.OrderDate"
- The right panel shows `ScalarFieldBuilder` for OrderDate with the suggested expression loaded
- The drawer remains open
- The card shows "Editing" state

### AE-05 — Dismiss a suggestion (with undo)

**Given**
- Drawer is open with 4 suggestions
- User does not want the "Order.Header.Priority" suggestion

**When**
- User clicks Dismiss on the Priority suggestion

**Then**
- No `updateDraft` call is made
- The card collapses to a reduced "Dismissed" state with an **Undo** button visible
- Summary updates to reflect 1 dismissed, 3 pending

**When** (continued)
- User clicks **Undo** on the dismissed Priority card

**Then**
- The card re-expands to the full pending state with Accept/Edit/Dismiss actions
- Summary updates back to 0 dismissed, 4 pending
- No `updateDraft` call is made

### AE-06 — Accept All Valid

**Given**
- Drawer is open with 6 suggestions
- 4 have `validation.valid === true`, 1 has `validation.valid === false`, 1 has no validation data

**When**
- User clicks "Accept All Valid"

**Then**
- 5 suggestions are accepted (4 valid + 1 without validation data)
- 1 invalid suggestion remains pending
- `updateDraft` is called 5 times (once per accepted suggestion)
- Summary shows "5 accepted, 1 pending"

### AE-07 — Confidence and validation badges

**Given**
- Backend returns a suggestion with `confidence: "high"` and `validation: { valid: true, diagnostics: [] }`

**When**
- Drawer renders the suggestion card

**Then**
- A green "High confidence" badge is visible
- A green "Valid" validation badge is visible
- No diagnostic details are shown (empty diagnostics array)

### AE-08 — Validation warning with diagnostics

**Given**
- Backend returns a suggestion with `validation: { valid: true, diagnostics: [{ code: "W003", severity: "warning", message: "Fallback value used" }] }`

**When**
- Drawer renders the suggestion card

**Then**
- A yellow "Warning" validation badge is visible
- An expandable diagnostics section shows the W003 warning

### AE-09 — Invalid suggestion

**Given**
- Backend returns a suggestion with `validation: { valid: false, diagnostics: [{ code: "E001", severity: "error", message: "Parse error" }] }`

**When**
- Drawer renders the suggestion card

**Then**
- A red "Invalid" validation badge is visible
- Diagnostics are shown inline
- Accept button is still available (user choice, not blocked) but visually de-emphasized
- "Accept All Valid" would skip this suggestion

### AE-10 — Empty response

**Given**
- User triggers Auto-Map for a section

**When**
- Backend returns `{ rules: [] }`

**Then**
- Drawer opens with empty state message
- No suggestion cards rendered
- Close button available

### AE-11 — Backend error

**Given**
- User triggers Auto-Map

**When**
- Backend returns an error (network failure, 500, etc.)

**Then**
- Error state is shown with a user-friendly message
- "Try Again" button is available
- No stale suggestions are displayed

### AE-12 — Drawer keyboard accessibility

**Given**
- Drawer is open

**When**
- User presses Escape

**Then**
- Drawer closes
- Focus returns to the trigger element

### AE-13 — All suggestions resolved

**Given**
- Drawer has 3 suggestions
- User accepts 2 and dismisses 1

**When**
- The last suggestion is resolved

**Then**
- Drawer shows completion summary: "All 3 suggestions reviewed. 2 accepted, 1 dismissed."
- "Accept All Valid" button is disabled

### AE-14 — Validation data absent

**Given**
- Backend returns suggestions without `validation` field

**When**
- Drawer renders

**Then**
- No validation badge is shown (graceful degradation)
- "Accept All Valid" treats suggestions without validation as eligible for bulk accept
- Confidence badges still render if confidence data is present

### AE-15 — Loading state

**Given**
- User triggers Auto-Map

**When**
- Request is in flight

**Then**
- A loading indicator is shown (location: inline near trigger or in drawer)
- The loading message includes section context: "Generating suggestions for {sectionName}..."

### AE-16 — Undo dismiss restores pending state

**Given**
- Drawer has 4 suggestions
- User has dismissed "Order.Header.Priority" (now in dismissed state with Undo button)
- Summary shows 1 dismissed, 3 pending

**When**
- User clicks **Undo** on the dismissed Priority card

**Then**
- The Priority card re-expands to the full pending state
- All action buttons (Accept, Edit, Dismiss) are available on the card
- Summary updates to 0 dismissed, 4 pending
- No draft changes are made
- The card retains its original suggestion data (expression, explanation, confidence, validation)

---

## Open Questions

All resolved in Rev 2.

- `Q1.` **Trigger placement** — ✅ Resolved: **ObjectSummaryPanel** when an object section is selected. Contextual and discoverable; aligns with §6.3 Panel 6 intent.
- `Q2.` **Section path derivation** — ✅ Resolved: **`selectedTargetPath`** is the section path source. No special backend format needed — the target path as-is identifies the section.
- `Q3.` **Source context for showcase** — ✅ Resolved: **Send `sourceContext`** as a bounded relevant subset of source fields (compact flattened field list, limited to ~200 lines). Temporary RAG substitute, same pattern as FS-042.
- `Q4.` **Drawer width** — ✅ Resolved: **`w-[520px]`**. May widen to 560px post-implementation if content feels cramped.
- `Q5.` **Undo dismiss** — ✅ Resolved: **Yes**. Dismissed cards stay visible in a reduced state with an **Undo** button. Clicking Undo restores the card to `'pending'` status. Low implementation cost via `undoDismiss(targetPath)` action on the hook.
- `Q6.` **Backend response envelope** — ✅ Resolved: **New `autoMapSection()` adapter method** with new `AutoMapSectionInput`/`AutoMapSectionResult` types. The existing `autoMap()` method and `AutoMapInput`/`AutoMapResult` stubs remain untouched. This keeps contracts cleanly separated and avoids a breaking type change on the existing stub.

---

## Verification Strategy

- **Unit tests** for `useAutoMapReview` hook: lifecycle states, per-suggestion actions, undo dismiss, bulk accept logic, error handling (map to AE-01 through AE-16)
- **Component tests** for `AutoMapReviewDrawer`: rendering, summary, states, keyboard/accessibility (AE-10, AE-11, AE-12, AE-13, AE-15)
- **Component tests** for `SuggestionReviewCard`: badges, comparison display, action callbacks (AE-02 through AE-09)
- **Integration tests** for editor integration: accept → updateDraft, edit → navigate + updateDraft (AE-02, AE-03, AE-04)
- **TypeScript strict typecheck** passes across all touched files
- **ESLint** passes with zero errors
- **Build** (`pnpm build` in `ui/`) succeeds

---

## Task Generation Notes

This is a cross-cutting spec. Tasks split into two execution domains:

**`task` agent (backend/infrastructure):**
- T-01: Type definitions + API client (new domain types, HTTP function, `autoMapSection()` on ApiAdapter/HybridAdapter/LocalStorageAdapter)
- T-08: Architecture update (update `ui-application.md` and `project-structure.md`)

**`ui-task` agent (React components):**
- T-02: `useAutoMapReview` hook
- T-03: `AutoMapReviewDrawer` shell + summary header
- T-04: `SuggestionReviewCard` component
- T-05: Per-suggestion actions + bulk Accept All Valid
- T-06: MappingEditorPage integration + trigger wiring
- T-07: Empty/loading/error/done states

Task dependencies:
- T-01 must complete before T-02 (types needed for hook)
- T-02 must complete before T-03–T-07 (hook needed for components)
- T-03 must complete before T-04 (drawer shell needed for cards)
- T-04 must complete before T-05 (cards needed for actions)
- T-03 + T-05 must complete before T-06 (drawer + actions needed for editor integration)
- T-07 can proceed after T-03 (states are part of the drawer shell)
- T-08 depends on all other tasks (architecture doc reflects implemented state)

---

## Change Log

- Rev 2 — 2026-05-11
  - Resolved all 6 open questions (Q1–Q6)
  - Q1: Trigger placement confirmed as ObjectSummaryPanel
  - Q2: Section path derived from `selectedTargetPath`
  - Q3: Source context sent as bounded subset (compact field list)
  - Q4: Drawer width set to `w-[520px]`
  - Q5: Undo dismiss added — dismissed cards stay visible with Undo button; `undoDismiss(targetPath)` action added to hook
  - Q6: New `autoMapSection()` adapter method with `AutoMapSectionInput`/`AutoMapSectionResult` types; existing `autoMap()` stubs untouched
  - Updated AE-05 to include undo dismiss flow
  - Added AE-16 for standalone undo dismiss scenario
  - Updated Proposed Behavior: Dismiss Action section with undo semantics
  - Updated API references from `autoMap()` to `autoMapSection()` throughout
  - Updated type references from `AutoMapInput`/`AutoMapResult` to `AutoMapSectionInput`/`AutoMapSectionResult` for section-level types
- Rev 1 — 2026-05-11
  - Initial draft
