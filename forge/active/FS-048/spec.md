# SPEC

## Title

Auto-Map Review Workspace — Middle Panel Redesign with Persistent Suggestions, Refresh, and Preview

---

## ID

FS-048

---

## Metadata

Owner: @christophervuu
Reviewers: TBD
Created: 2026-05-12
Last Updated: 2026-05-13
Type: ui

All tasks are UI-surface work except the state/persistence infrastructure task and the architecture update task.

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Redesign the Auto-Map review experience from a right-side drawer (FS-046) into a dedicated **Auto-Map Review Workspace** that takes over the middle Builder/Editor panel. Add persistent suggestion state so users do not regenerate on every navigation, refresh/regenerate controls for suggestion subsets, an enriched suggestion lifecycle model, and optional preview support when sample source data is available. The workspace should feel like a first-class editing mode — not a temporary overlay — and should improve review focus, trust in AI suggestions, throughput when accepting many suggestions, and TTFSM for section-based Auto-Map.

---

## Problem

The current right-side drawer (FS-046) works for basic review but is too constrained for the richer workflow Auto-Map needs:

1. **Space:** 520px is insufficient for side-by-side expression comparison, preview output, and rich metadata (confidence, validation, explanation, diagnostics).
2. **Transience:** suggestions are lost when the user navigates away or closes the drawer. Regeneration is the only recovery path, which is slow and wasteful.
3. **No refresh:** the user cannot regenerate a subset of suggestions (e.g., only unmapped targets or stale suggestions) without discarding the entire review context.
4. **No preview:** when sample source data exists, there is no way to see what a suggestion would produce before accepting it.
5. **Limited lifecycle:** suggestions are either pending, accepted, edited, or dismissed — there is no concept of staleness when the underlying rules or context change after generation.

The middle panel is a better fit because Auto-Map review is the user's primary task after generation. It needs more room, benefits from persistence, and should support future growth (preview, stale state, refresh, RAG-backed context) without overloading a narrow drawer.

---

## Goal

Deliver a polished Auto-Map Review Workspace that:

1. Replaces the right-side drawer with a middle-panel workspace mode in the Mapping Editor
2. Persists suggestion state per mapping + target section so users can leave and return without regenerating
3. Supports refresh/regenerate actions for all suggestions, unmapped-only, and stale-only subsets
4. Defines a per-suggestion lifecycle model (suggested, accepted, edited, dismissed, stale) with clear transitions
5. Surfaces optional preview output per suggestion when sample source data is available
6. Provides filtering and bulk actions that improve review throughput
7. Remains decoupled from specific backend implementation so it works when Auto-Map transitions from showcase to RAG
8. Aligns with the "Suggest, never auto-commit" principle (PRODUCT-TECHNICAL.md §17.1)

---

## Assumptions

- FS-046 is complete and its components (`AutoMapReviewDrawer`, `SuggestionReviewCard`, `useAutoMapReview`) are available as the baseline to evolve
- The `autoMapSection()` adapter method, types (`AutoMapSectionInput`, `AutoMapSectionResult`, `AutoMapSuggestion`), and HTTP client (`autoMapSectionHttp`) are stable
- The `useMappingEditor` auto-draft model (FS-039) with `updateDraft`/`getDraftExpression`/`commitDraft` is the correct integration point
- The three-column layout and `MappingEditorPage` slot pattern are stable; the middle panel currently renders `TargetWorklist` (Target View) or `RuleList` (Rules View)
- Auto-Map remains section-based for the current phase (one target section at a time)
- Backend may transition from direct `sourceContext` to RAG retrieval; the UI must not tightly couple to the no-RAG implementation
- Sample source data may or may not be available in the Preview context; preview is a progressive enhancement

---

## Current Context

### Existing Auto-Map Drawer (FS-046)

FS-046 delivers a right-side fixed drawer (`w-[520px]`, `role="dialog"`, `aria-modal`) composed at the route page level. Key components:

- **`AutoMapReviewDrawer`** — shell with summary header, bulk actions bar, loading/empty/error/done states
- **`SuggestionReviewCard`** — per-suggestion card with target path, new/replace badge, expression comparison, confidence/validation badges, Accept/Edit/Dismiss actions, Undo dismiss
- **`useAutoMapReview`** — lifecycle hook: trigger request, receive results, track per-suggestion status, apply accepted suggestions via `updateDraft`

The drawer is triggered from `ObjectSummaryPanel` via "Auto-Map This Section" when an object node is selected.

### Suggestion Review State Model (FS-046)

```ts
type SuggestionReviewStatus = 'pending' | 'accepted' | 'edited' | 'dismissed';

interface SuggestionReviewItem {
  targetPath: string;
  suggestedExpression: string;
  existingExpression: string | null;
  confidence: number;
  isNew: boolean;
  status: SuggestionReviewStatus;
}
```

This model is transient — it lives only in the hook's `useState` and is lost on unmount or re-trigger.

### Mapping Editor Layout

The editor uses a three-column layout with a bottom area:

- **Left:** `SourceSchemaPanel` (source schema tree, drag-and-drop, search)
- **Center:** `TargetWorklist` (Target View) or `RuleList` (Rules View) — controlled by `EditorView`
- **Right:** Node-type-specific builder panel (`ScalarFieldBuilder`, `ObjectSummaryPanel`, `ArrayBuilder`, etc.)
- **Bottom:** `ConnectedInlinePreviewStrip` (Target View) or `BottomArea` (Rules View)

The center panel is the natural location for a review workspace because it already handles view-mode switching (`target` / `rules`) and the user's attention is centered there during mapping work.

### Preview Infrastructure

- `PreviewProvider` + `usePreviewExecution` manage source data and execution state
- `ConnectedInlinePreviewStrip` watches draft expression and auto-runs preview on stabilization
- Source data is available via `PreviewContext` when the user has loaded a test case or pasted sample data
- `evaluateExpression()` from `ui/src/lib/engine/` can evaluate a single expression against source data locally

---

## Scope

### In Scope

1. **Workspace mode switch** — add `'automap'` to `EditorView` so the center panel can render the Auto-Map Review Workspace instead of `TargetWorklist` or `RuleList`
2. **Auto-Map Review Workspace component** — new component rendered in the center panel slot when `view === 'automap'`; replaces the drawer-based review surface
3. **Workspace header/summary** — section name, suggestion counts (total/valid/invalid/replacing/accepted/dismissed/stale), generation metadata (last refreshed timestamp)
4. **Suggestion persistence store** — per-mapping, per-section suggestion state that survives navigation and view switches within a session; sessionStorage-backed for cross-navigation durability
5. **Extended suggestion lifecycle model** — add `stale` status; define transitions for all user actions and system events (source/target changes, rule edits post-generation)
6. **Refresh/regenerate controls** — refresh all, refresh unmapped only, refresh stale only; clear interaction with existing accepted/edited/dismissed suggestions
7. **Enriched suggestion cards** — leverage wider middle-panel space for improved expression comparison, expanded/collapsed states, grouping, status badges
8. **Preview support** — when sample source data is available, show per-suggestion preview output (current vs suggested); graceful degradation when no source data exists
9. **Filtering** — all, unmapped, replacing existing, valid, invalid, low confidence, accepted, dismissed, stale
10. **Bulk actions** — Accept All Valid, Refresh Unmapped, Refresh Stale, Refresh All
11. **Accept/Edit/Dismiss/Keep Current behavior** — clear definitions for each action including workspace persistence and navigation
12. **Stale detection** — lightweight client-side staleness based on rule changes after suggestion generation
13. **Retire the right-side drawer** — remove `AutoMapReviewDrawer` from the route-page composition and replace with workspace mode
14. **Architecture update** — update `ui-application.md` to document the workspace mode pattern, persistence model, and lifecycle model

### Out of Scope

1. Backend Auto-Map implementation changes
2. Full RAG retrieval implementation
3. Deployment workflow changes
4. Full Mapping Editor redesign outside the review-mode shift
5. Auth/authorization
6. Smart Fix integration (post-accept validation-fix loop)
7. Full persistence backend for AI suggestion sessions
8. Mobile or responsive layout
9. Multi-section Auto-Map (generating suggestions for the entire mapping at once)

---

## Non-Goals

- Redesigning unrelated parts of the Mapping Editor
- Moving deploy actions into the editor
- Building a full RAG pipeline UI
- Implementing the backend Auto-Map endpoint changes
- Tight coupling to the temporary no-RAG backend implementation details

---

## Relevant Areas

- `ui/src/features/mappings/components/AutoMapReviewDrawer.tsx` — to be retired/replaced
- `ui/src/features/mappings/components/SuggestionReviewCard.tsx` — to be evolved into workspace card
- `ui/src/features/mappings/hooks/use-auto-map-review.ts` — to be evolved with persistence + lifecycle
- `ui/src/features/mappings/components/AutoMapWorkspace.tsx` — new workspace component
- `ui/src/features/mappings/components/WorkspaceSuggestionCard.tsx` — new enriched card component
- `ui/src/features/mappings/components/WorkspaceHeader.tsx` — new summary header
- `ui/src/features/mappings/components/WorkspaceToolbar.tsx` — new filter/actions toolbar
- `ui/src/features/mappings/components/WorkspaceSuggestionPreview.tsx` — new preview sub-component
- `ui/src/features/mappings/hooks/use-auto-map-workspace.ts` — new/evolved workspace hook
- `ui/src/features/mappings/hooks/use-suggestion-preview.ts` — new per-suggestion preview hook
- `ui/src/features/mappings/lib/auto-map-persistence.ts` — new persistence utilities
- `ui/src/features/mappings/lib/auto-map-staleness.ts` — new staleness detection utilities
- `ui/src/features/mappings/types.ts` — `EditorView` type extension
- `ui/src/features/mappings/components/MappingEditorPage.tsx` — slot wiring for workspace mode
- `ui/src/routes/pages/MappingEditor.tsx` — drawer removal, workspace mode integration
- `ui/src/features/mappings/components/ObjectSummaryPanel.tsx` — trigger update
- `forge/architecture/ui-application.md` — architecture update
- `forge/architecture/project-structure.md` — structure update

---

## Dependencies / Blockers

- **FS-046 (completed/active)** — establishes the baseline Auto-Map review surface, types, API client, and hook
- **FS-039 (completed)** — auto-draft model (`updateDraft`, `getDraftExpression`)
- **FS-041/FS-042 (completed)** — showcase AI integration pattern and `HybridAdapter`
- **Backend Auto-Map endpoint** — must support the existing `autoMapSection()` contract; no backend changes required for this spec

---

## Constraints

- AI output is suggestion-only and never auto-committed (§17.1)
- The Mapping Editor remains the main authoring surface
- Save ≠ Deploy; no deploy actions in the editor
- UI is React / TypeScript / Vite
- No external state management library (React Context + hooks only)
- Desktop-first (1280px target, 1024px minimum)
- TypeScript strict mode; zero-error lint/typecheck policy
- Accepted suggestions must write through `updateDraft(targetPath, expression)` — no bypass of the draft model
- Workspace must remain usable when backend transitions from showcase to RAG
- The workspace must not block interaction with the source panel or bottom preview area
- Follow existing Mapping Editor patterns for view switching and panel rendering
- Prioritize TTFSM (Time to First Successful Mapping)

---

## Proposed Behavior

### User Flow

1. User is in the Mapping Editor, Target View.
2. User selects a target section (object node) in the target worklist.
3. User clicks **"Auto-Map This Section"** in `ObjectSummaryPanel`.
4. The middle panel switches from `TargetWorklist` to the **Auto-Map Review Workspace**.
5. While suggestions generate, the workspace shows a loading state with section context.
6. When suggestions arrive, the workspace shows:
   - **Summary header:** section name/path, suggestion counts, validation summary, last refreshed time
   - **Filter/actions toolbar:** filter chips + bulk action buttons
   - **Scrollable suggestion list:** one card per suggestion with full expression comparison
7. User reviews each suggestion:
   - **Accept** — suggestion expression is written as a draft; card shows accepted state
   - **Edit** — suggestion is loaded as a draft, editor navigates to the target field, workspace switches to normal builder view focused on that field
   - **Dismiss** — no change to editor state; card collapses to dismissed state with Undo
   - **Keep Current** — for replacement suggestions, explicitly retains the existing rule; treated as dismiss with "Kept current" label
8. User can filter suggestions (e.g., show only unmapped, only invalid, only stale).
9. User can bulk-accept valid suggestions, refresh unmapped targets, or refresh all.
10. If sample source data is available, suggestion cards show optional preview output.
11. User clicks **"Back to Editor"** to return to Target View / builder mode.
12. If the user navigates away and returns to the same section, persisted suggestions are still available without regeneration.

### System Behavior

#### Workspace Mode Switch

`EditorView` is extended from `'target' | 'rules'` to `'target' | 'rules' | 'automap'`.

When `view === 'automap'`:
- Center panel renders `AutoMapWorkspace` instead of `TargetWorklist` or `RuleList`
- Right panel continues to render the node-type-specific builder (so the user can still see field details if a target is selected)
- Source panel remains visible and interactive
- Bottom preview area remains visible and usable
- The target worklist toolbar (sort, view toggle, search) is hidden; the workspace has its own toolbar

Entering workspace mode:
- Triggered by `ObjectSummaryPanel` "Auto-Map This Section" button
- Sets `view` to `'automap'` and records the `autoMapSectionPath`
- If persisted suggestions exist for this section, they are loaded immediately (no regeneration)
- If no persisted suggestions exist, a generation request is triggered automatically

Exiting workspace mode:
- "Back to Editor" button in the workspace header sets `view` back to `'target'`
- Suggestions remain persisted — returning to the same section restores them
- The previous `selectedTargetPath` is preserved (user returns to the same selection context)

#### Suggestion Persistence

Suggestions are persisted per mapping + target section path using a two-tier model:

**Tier 1 — Application state (React state in hook):**
- Primary working state during review
- Holds all `SuggestionReviewItem[]` with current lifecycle status
- Survives view switches within the editor (state is not unmounted when switching views)

**Tier 2 — sessionStorage:**
- Survives full page navigation within the session (e.g., navigating to Test Lab and back)
- Key: `keyra:automap-suggestions:{mappingId}`
- Value: `Record<string, PersistedSectionSuggestions>` keyed by section path
- Cleared on tab/window close (sessionStorage lifetime)
- Corrupted data resets to empty with console warning (consistent with existing patterns)

```ts
interface PersistedSectionSuggestions {
  sectionPath: string;
  generatedAt: string;          // ISO timestamp
  items: PersistedSuggestionItem[];
  generationContext: {
    sourceContextHash?: string; // lightweight hash for staleness detection
  };
}

interface PersistedSuggestionItem {
  targetPath: string;
  suggestedExpression: string;
  explanation: string;
  confidence: number;
  validation?: { valid: boolean; diagnostics: readonly Diagnostic[] };
  status: SuggestionLifecycleStatus;
  isNew: boolean;
  existingExpressionAtGeneration: string | null;
}
```

Persistence behavior:
- On generation success: write to sessionStorage immediately
- On status change (accept/edit/dismiss/undo): update sessionStorage
- On hook mount with existing sessionStorage data: hydrate from storage, check for staleness
- On new generation for the same section: replace previous suggestions entirely

#### Extended Suggestion Lifecycle Model

```ts
type SuggestionLifecycleStatus =
  | 'suggested'    // freshly generated, awaiting review
  | 'accepted'     // user accepted; draft written via updateDraft
  | 'edited'       // user chose Edit; navigated to field for manual editing
  | 'dismissed'    // user dismissed; no draft change
  | 'stale';       // underlying context changed since generation
```

State transitions:

| From | Action | To | Side Effects |
|---|---|---|---|
| `suggested` | Accept | `accepted` | `updateDraft(targetPath, expression)` |
| `suggested` | Edit | `edited` | `updateDraft(targetPath, expression)`, navigate to field, exit workspace |
| `suggested` | Dismiss | `dismissed` | none |
| `suggested` | Keep Current | `dismissed` | none (label: "Kept current") |
| `suggested` | Context changed | `stale` | none (visual indicator only) |
| `accepted` | (immutable) | — | — |
| `edited` | (immutable) | — | — |
| `dismissed` | Undo Dismiss | `suggested` | none |
| `stale` | Accept | `accepted` | `updateDraft(targetPath, expression)` (user accepts despite staleness) |
| `stale` | Dismiss | `dismissed` | none |
| `stale` | Refresh | `suggested` | replaced with new suggestion from backend |
| any unresolved | Refresh All | `suggested` | replaced with new suggestions; accepted/edited preserved |

Notes:
- `accepted` and `edited` are terminal states — they cannot be changed. The user's decision is final.
- `dismissed` can be undone back to `suggested`.
- `stale` is a system-assigned state, not a user action. It is applied when staleness is detected.
- Refresh operations only replace items in `suggested`, `dismissed`, or `stale` status. `accepted` and `edited` items are never overwritten by refresh.

#### Staleness Detection

A suggestion becomes stale when:
1. **Rule changed:** the saved or draft expression for the target path changed after the suggestion was generated (compared to `existingExpressionAtGeneration`)
2. **Manual rule added:** a rule was manually added for a target that was `isNew` at generation time

Staleness is checked:
- When the workspace is entered (hydrating from persistence)
- When the user returns to workspace mode after editing
- Periodically is not required — check on workspace entry is sufficient

Staleness does **not** include:
- Source schema changes (would require re-parsing; deferred to future)
- Target schema changes (would require re-generation; deferred to future)
- Sample payload changes (preview will re-evaluate; does not affect suggestion validity)

#### Refresh / Regenerate Behavior

Four refresh actions:

| Action | Targets | Behavior |
|---|---|---|
| Refresh All | All non-accepted, non-edited items | Re-triggers `autoMapSection()` for the full section; replaces `suggested`/`dismissed`/`stale` items with new results; `accepted`/`edited` items are preserved |
| Refresh Unmapped | Only targets where `isNew === true` and status is `suggested` or `stale` | Sends a filtered request or re-triggers full generation and filters client-side |
| Refresh Stale | Only items with `status === 'stale'` | Re-triggers generation and replaces only stale items |
| Per-suggestion Refresh | Single item | Re-triggers for one target (if backend supports) or full section with client-side filtering |

Refresh interaction with existing state:
- **Accepted items:** never overwritten. If the backend returns a new suggestion for an accepted target, the new suggestion is silently dropped.
- **Edited items:** never overwritten. Same as accepted.
- **Dismissed items:** replaced by refresh (the user explicitly asked for new suggestions).
- **Manual rules:** not affected. Refresh only operates on AI suggestion state.

Refresh confirmation:
- Refresh All shows a brief inline confirmation: "This will regenerate N suggestions. Accepted and edited suggestions will be preserved."
- Refresh Unmapped and Refresh Stale do not require confirmation (they are scoped and non-destructive).

#### Workspace Header / Summary

The header displays:

```
Auto-Map: Order.Header                                    [Back to Editor]
33 suggestions | 31 valid | 2 invalid | 6 replacing existing
12 accepted | 2 dismissed | 1 stale
Last refreshed 2 minutes ago
```

Header elements:
- **Section path** — the target section being reviewed
- **Suggestion counts** — total, valid, invalid, replacing existing
- **Status counts** — accepted, dismissed, stale (updated live as the user acts)
- **Last refreshed** — relative timestamp of the most recent generation/refresh
- **Back to Editor** button — returns to Target View

#### Suggestion Cards

Each suggestion card in the workspace shows:

**Collapsed state (default for accepted/dismissed):**
- Target field path
- Status badge (Suggested / Accepted / Edited / Dismissed / Stale)
- One-line expression summary (truncated)

**Expanded state (default for suggested/stale):**
- Target field path
- Status badge with color coding
- New/Replace badge
- **Current expression** (if replacing) — the expression that was in place at generation time
- **Suggested expression** — the AI-proposed expression
- Explanation text
- Confidence badge (High/Medium/Low with color)
- Validation badge (Valid/Warning/Invalid with diagnostics expandable)
- **Preview section** (when source data available):
  - Current output (from existing expression, or "No current rule")
  - Suggested output (from suggested expression)
  - Side-by-side or stacked comparison
- **Action buttons:** Accept / Edit / Dismiss (or Keep Current for replacements)
- **Stale indicator** (when stale): "This suggestion may be outdated — the target rule has changed since generation." with a per-item Refresh button

Cards support expand/collapse toggle. Users can expand any card to see full details.

#### Preview Support

When sample source data is available via `PreviewContext`:

1. Each suggestion card can show a **preview section** with:
   - **Current output:** result of evaluating the existing expression against source data (or "No current rule" / "No output")
   - **Suggested output:** result of evaluating the suggested expression against source data
2. Preview evaluation uses `evaluateExpression()` from `ui/src/lib/engine/` — local, synchronous, no backend call
3. Preview is computed lazily (only for expanded cards) to avoid performance overhead
4. Preview errors (parse failure, evaluation error) show inline with the expression rather than blocking the card

When sample source data is **not** available:
- Preview sections are hidden
- A workspace-level callout appears: "Load sample source data to preview what suggestions would produce"
- The callout links to the inline preview strip's test case selector

Preview does **not** block any review actions — it is purely informational.

#### Filtering

Filter chips in the toolbar:

| Filter | Shows |
|---|---|
| All | All suggestions (default) |
| Unmapped | `isNew === true` |
| Replacing | `isNew === false` |
| Valid | `validation.valid === true` or validation absent |
| Invalid | `validation.valid === false` |
| Low Confidence | `confidence < 0.5` (configurable threshold) |
| Accepted | `status === 'accepted'` |
| Dismissed | `status === 'dismissed'` |
| Stale | `status === 'stale'` |

Filter chips use OR semantics within status groups and AND across dimensions (consistent with existing filter patterns). Active filter count is shown.

#### Bulk Actions

| Action | Button Label | Behavior |
|---|---|---|
| Accept All Valid | "Accept All Valid" | Accepts all `suggested` items where `validation.valid !== false` |
| Refresh Unmapped | "Refresh Unmapped" | Regenerates suggestions for unmapped targets only |
| Refresh Stale | "Refresh Stale" | Regenerates suggestions for stale items only; hidden when no stale items |
| Refresh All | "Refresh All" | Regenerates all non-terminal suggestions with confirmation |

Bulk actions are disabled when not applicable (e.g., "Accept All Valid" disabled when no pending valid suggestions).

#### Accept / Edit / Dismiss Behavior

**Accept:**
1. `updateDraft(targetPath, suggestedExpression)` is called
2. Item status transitions to `accepted`
3. Card collapses to accepted summary state
4. Item remains visible in the list (filtered out if "Accepted" filter is not active)
5. Workspace stays open

**Edit:**
1. `updateDraft(targetPath, suggestedExpression)` is called (pre-loads suggestion as draft)
2. Item status transitions to `edited`
3. `selectedTargetPath` is set to the suggestion's target path
4. `view` switches back to `'target'` (exits workspace, enters normal builder focused on that field)
5. User can return to workspace after editing — the item shows as "Edited"

**Dismiss:**
1. No `updateDraft` call
2. Item status transitions to `dismissed`
3. Card collapses to dismissed state with Undo button
4. Workspace stays open

**Keep Current (replacement suggestions only):**
1. Identical to Dismiss but shows "Kept current" label instead of "Dismissed"
2. Communicates that the user reviewed the suggestion and intentionally chose the existing rule

**Back to Editor:**
1. Sets `view` back to `'target'`
2. All suggestion state is preserved in persistence
3. The "Auto-Map This Section" button in `ObjectSummaryPanel` shows an indicator that persisted suggestions exist (e.g., badge count)

### Failure / Edge Behavior

#### Loading State
- Workspace renders with a centered loading state: spinner + "Generating mapping suggestions for {sectionPath}..."
- Filter/action toolbar is hidden during loading

#### No Suggestions Returned
- Workspace shows empty state: "No suggestions were generated for this section. All target fields may already be mapped, or the AI could not determine appropriate mappings."
- "Back to Editor" and "Refresh All" buttons available

#### Backend Error
- Workspace shows error state: `role="alert"`, error message, "Try Again" button
- Previous suggestions (if any exist from prior generation) are preserved and can be accessed via "Show previous suggestions" link

#### Malformed Response
- Treated as error: "Received an unexpected response. Please try again."

#### All Suggestions Resolved
- When all items are accepted, edited, or dismissed: workspace shows completion banner
- "All N suggestions reviewed. M accepted, K edited, J dismissed."
- "Refresh All" remains available to regenerate

#### Preview Evaluation Failure
- Per-card: "Preview unavailable — expression could not be evaluated" shown inline
- Does not block Accept/Edit/Dismiss actions

#### SessionStorage Corruption
- Corrupted data resets to empty with console warning
- User sees fresh state and can regenerate

#### Concurrent Editing
- If the user accepts a suggestion and then manually edits the same field's draft before saving, the manual edit overwrites the AI suggestion in the draft model. This is correct behavior — the draft model is last-write-wins.

---

## Acceptance Examples

### AE-01 — Workspace opens with suggestions after Auto-Map

**Given**
- User is in the Mapping Editor with target schema containing "Order.Header" (5 child fields)
- No persisted suggestions exist for this section

**When**
- User selects "Order.Header" in target worklist
- User clicks "Auto-Map This Section" in ObjectSummaryPanel
- Backend returns 4 suggestions

**Then**
- Middle panel switches from TargetWorklist to Auto-Map Review Workspace
- Summary header shows "Auto-Map: Order.Header" with "4 suggestions"
- 4 suggestion cards are rendered in expanded state
- Source panel remains visible on the left
- Bottom preview area remains visible

### AE-02 — Persisted suggestions restored on re-entry

**Given**
- User previously ran Auto-Map for "Order.Header" and accepted 2 of 4 suggestions
- User navigated to a different target field (exited workspace)

**When**
- User selects "Order.Header" again and clicks "Auto-Map This Section"

**Then**
- Workspace opens immediately with the 4 previously generated suggestions
- 2 show as "Accepted", 2 show as "Suggested" (pending)
- No new backend request is made
- Summary shows correct counts

### AE-03 — Stale detection after manual edit

**Given**
- User ran Auto-Map for "Order.Header" and has 4 suggestions
- Suggestion for "Order.Header.Currency" shows `default(source("CurrencyCode"), "USD")`
- User exits workspace and manually edits "Order.Header.Currency" to `source("CurrencyISO")`

**When**
- User returns to the workspace for "Order.Header"

**Then**
- The Currency suggestion shows status "Stale" with visual indicator
- Stale message: "The target rule has changed since this suggestion was generated"
- Per-item Refresh button is available on the stale card
- Other suggestions remain in their previous states

### AE-04 — Refresh Unmapped targets

**Given**
- Workspace has 6 suggestions: 3 accepted, 1 dismissed, 2 suggested (unmapped targets)

**When**
- User clicks "Refresh Unmapped"

**Then**
- Backend request is triggered
- Only the 2 unmapped-target suggestions are replaced with new results
- The 3 accepted suggestions are preserved unchanged
- The 1 dismissed suggestion is preserved (it is not unmapped)
- Summary and filter counts update

### AE-05 — Accept All Valid with mixed validation

**Given**
- Workspace has 6 suggestions: 4 valid, 1 invalid, 1 without validation data, all in `suggested` status

**When**
- User clicks "Accept All Valid"

**Then**
- 5 suggestions are accepted (4 valid + 1 without validation)
- 1 invalid suggestion remains in `suggested` status
- `updateDraft` is called 5 times
- Summary updates to "5 accepted, 1 suggested"

### AE-06 — Edit navigates to field and exits workspace

**Given**
- Workspace is open with suggestions
- "Order.Header.OrderDate" has suggestion: `formatDate(source("InvoiceDate"), "yyyy-MM-dd")`

**When**
- User clicks Edit on the OrderDate suggestion

**Then**
- `updateDraft("Order.Header.OrderDate", 'formatDate(source("InvoiceDate"), "yyyy-MM-dd")')` is called
- Middle panel switches back to TargetWorklist (view = 'target')
- `selectedTargetPath` is set to "Order.Header.OrderDate"
- Right panel shows ScalarFieldBuilder with the suggested expression loaded as draft
- Suggestion status transitions to `edited`

### AE-07 — Preview output per suggestion

**Given**
- Workspace has suggestions and source data is loaded: `{ "InvoiceAmount": -50, "CurrencyCode": "EUR" }`
- "Order.Header.DocumentType" suggestion: `if(lt(source("InvoiceAmount"), 0), "CreditMemo", "Invoice")`
- No existing rule for this target

**When**
- The suggestion card is expanded

**Then**
- Preview section shows:
  - Current: "No current rule"
  - Suggested: `"CreditMemo"`
- Preview is computed using `evaluateExpression()` with the loaded source data

### AE-08 — Preview unavailable (no source data)

**Given**
- Workspace has suggestions
- No source data is loaded in the Preview context

**When**
- Workspace renders

**Then**
- No per-card preview sections are shown
- Workspace-level callout: "Load sample source data to preview what suggestions would produce"
- All review actions remain available

### AE-09 — Filtering by status

**Given**
- Workspace has 10 suggestions: 4 accepted, 3 suggested, 2 dismissed, 1 stale

**When**
- User clicks the "Stale" filter chip

**Then**
- Only the 1 stale suggestion is visible
- Filter chip shows as active
- Summary counts remain unchanged (filters affect visibility, not counts)
- Bulk actions operate on visible items only

### AE-10 — Dismiss with Undo

**Given**
- Workspace has 4 suggestions in `suggested` status

**When**
- User clicks Dismiss on "Order.Header.Priority"

**Then**
- No `updateDraft` call
- Card collapses to dismissed state with Undo button
- Summary updates: 1 dismissed, 3 suggested

**When** (continued)
- User clicks Undo

**Then**
- Card expands back to full `suggested` state
- Summary updates: 0 dismissed, 4 suggested

### AE-11 — Keep Current for replacement suggestion

**Given**
- "Order.Header.Currency" has existing rule: `source("CurrencyCode")`
- Suggestion: `default(source("CurrencyCode"), "USD")`

**When**
- User clicks "Keep Current"

**Then**
- No `updateDraft` call
- Card shows "Kept current" label (not "Dismissed")
- Status transitions to `dismissed` internally
- Undo is available

### AE-12 — Back to Editor preserves state

**Given**
- Workspace has 6 suggestions: 3 accepted, 1 dismissed, 2 suggested

**When**
- User clicks "Back to Editor"

**Then**
- Middle panel returns to TargetWorklist
- ObjectSummaryPanel for the section shows indicator: "2 suggestions pending review"
- Suggestions are persisted in sessionStorage

### AE-13 — Refresh All with confirmation

**Given**
- Workspace has 4 suggestions: 2 accepted, 2 suggested

**When**
- User clicks "Refresh All"

**Then**
- Inline confirmation: "This will regenerate 2 suggestions. 2 accepted suggestions will be preserved."
- On confirm: backend request triggers; 2 suggested items replaced with new results; 2 accepted items unchanged
- On cancel: no action

### AE-14 — Workspace loading state

**Given**
- User triggers Auto-Map for a section with no persisted suggestions

**When**
- Request is in flight

**Then**
- Workspace shows loading state in center panel: spinner + "Generating mapping suggestions for Order.Header..."
- Filter toolbar and bulk actions are hidden
- Source panel and bottom area remain visible

### AE-15 — Backend error with previous suggestions

**Given**
- User has persisted suggestions from a prior generation
- User clicks "Refresh All"
- Backend returns an error

**When**
- Error occurs

**Then**
- Error message shown with "Try Again" button
- "Show previous suggestions" link is available
- Clicking it restores the prior suggestions

### AE-16 — Expand/collapse suggestion cards

**Given**
- Workspace has 6 suggestions; 3 accepted (collapsed), 3 suggested (expanded)

**When**
- User clicks on an accepted card's expand toggle

**Then**
- The accepted card expands to show full details (expression, explanation, confidence, preview)
- Other cards remain in their current expand/collapse state

### AE-17 — ObjectSummaryPanel indicator for persisted suggestions

**Given**
- User previously generated suggestions for "Order.Header" with 3 still pending

**When**
- User selects "Order.Header" in the target worklist (not in workspace mode)

**Then**
- ObjectSummaryPanel shows the "Auto-Map This Section" button
- Below or beside the button: "3 suggestions pending review" indicator
- Clicking "Auto-Map This Section" enters workspace mode and loads persisted suggestions

---

## Open Questions

All resolved in Rev 2.

- `Q1.` **Refresh granularity** — Resolved: **Full-section re-generation with client-side merge.** Backend continues generating suggestions for the full section. Refresh actions (unmapped-only, stale-only) are client-side scope/filter behaviors. The client merges the refreshed full-section result into persisted suggestion state. Merge rules: preserve accepted and edited suggestions by default; allow dismissed suggestions to remain dismissed unless explicitly refreshed; replace open/pending suggestions with refreshed equivalents. Granular backend refresh is noted as a future optimization.
- `Q2.` **Preview performance** — Resolved: **Lazy preview evaluation.** Evaluate preview only for visible/expanded cards (or when preview is explicitly opened). Debounce evaluation lightly (~150ms). Do not precompute preview for the full suggestion list. If lightweight, cache preview results by expression + source payload signature during the session.
- `Q3.` **Right panel during workspace mode** — Resolved: **Keep right panel active as contextual support.** Continue showing the builder/details for the currently selected target or suggestion. If nothing is selected, show `BuilderEmptyState` or a lightweight empty state. The middle panel remains the primary Auto-Map review surface. The right panel should be **visually secondary** during workspace mode (e.g., reduced opacity or muted border treatment) to keep review focus on the center workspace.
- `Q4.` **Trigger placement for re-entry** — Resolved: **Primary trigger in `ObjectSummaryPanel`, with persistent re-entry affordance in `EditorTopBar`.** When persisted suggestions exist for the selected section, the ObjectSummaryPanel button becomes "Return to Auto-Map Review." Additionally, a subtle persistent re-entry affordance (status pill or small link) is added to `EditorTopBar` — not a dominant global CTA, but discoverable enough that the user does not rely on navigating to the section object to re-enter. Do not rely on a temporary toast alone for re-entry.

---

## Verification Strategy

- **Unit tests** for suggestion persistence utilities: save/load/clear/corruption recovery
- **Unit tests** for staleness detection: rule changed, rule added, no change
- **Unit tests** for workspace hook: lifecycle states, persistence integration, refresh merge logic, filter computation
- **Component tests** for `AutoMapWorkspace`: rendering, mode switch, loading/error/empty/done states
- **Component tests** for `WorkspaceSuggestionCard`: expanded/collapsed, status badges, action callbacks, preview rendering
- **Component tests** for workspace toolbar: filter chips, bulk action buttons, disabled states
- **Integration tests** for editor integration: workspace mode switch, accept/edit flow, persistence across navigation
- **Preview tests** for suggestion preview: evaluation with source data, missing source data, evaluation failure
- **TypeScript strict typecheck** passes across all touched files
- **ESLint** passes with zero errors
- **Build** (`pnpm build` in `ui/`) succeeds

Map verification to acceptance examples:
- AE-01, AE-14: workspace rendering and mode switch
- AE-02, AE-12, AE-17: persistence and re-entry
- AE-03: staleness detection
- AE-04, AE-13: refresh behavior
- AE-05: bulk accept
- AE-06: edit navigation
- AE-07, AE-08: preview support
- AE-09: filtering
- AE-10, AE-11: dismiss/keep current
- AE-15: error recovery with previous suggestions
- AE-16: expand/collapse

---

## Task Generation Notes

This is a UI-focused spec. Most tasks are `ui-task`. Infrastructure/state tasks that do not render components are `task`.

**`task` agent:**
- T-01: Suggestion persistence utilities + extended lifecycle types
- T-11: Architecture update (`ui-application.md` and `project-structure.md`)

**`ui-task` agent:**
- T-02: `EditorView` extension + workspace mode switch infrastructure in `MappingEditorPage`
- T-03: `useAutoMapWorkspace` hook (evolved from `useAutoMapReview`) with persistence integration
- T-04: Staleness detection module + hook integration
- T-05: `AutoMapWorkspace` shell component + `WorkspaceHeader`
- T-06: `WorkspaceSuggestionCard` component (evolved from `SuggestionReviewCard`)
- T-07: `WorkspaceToolbar` — filter chips + bulk actions
- T-08: Refresh/regenerate controls + merge logic
- T-09: Per-suggestion preview support (`WorkspaceSuggestionPreview` + `useSuggestionPreview`)
- T-10: MappingEditor page integration — trigger updates, drawer retirement, ObjectSummaryPanel indicator

Task dependencies:
- T-01 must complete before T-03 (types + persistence needed for hook)
- T-02 must complete before T-05 (mode switch needed for workspace shell)
- T-03 must complete before T-04, T-05, T-06, T-07, T-08, T-09 (hook needed for all workspace components)
- T-04 can proceed after T-03 (staleness detection depends on hook state model)
- T-05 must complete before T-06, T-07 (shell needed for card and toolbar)
- T-06 must complete before T-09 (cards needed for preview integration)
- T-07 must complete before T-08 (toolbar needed for refresh controls)
- T-10 depends on T-02 + T-05 + T-06 + T-07 (full workspace needed for page integration)
- T-11 depends on all other tasks

---

## Change Log

- Rev 2 — 2026-05-13
  - Resolved all 4 open questions (Q1–Q4)
  - Q1: Refresh granularity confirmed as full-section re-generation with client-side merge; added explicit merge guidance (preserve accepted/edited, allow dismissed to stay dismissed unless refreshed, replace pending)
  - Q2: Preview performance confirmed as lazy evaluation on card expand with 150ms debounce; optional expression+payload cache
  - Q3: Right panel stays active during workspace mode, visually secondary (muted treatment to focus attention on center workspace)
  - Q4: Primary trigger in ObjectSummaryPanel + subtle persistent re-entry affordance in EditorTopBar (status pill or small link, not a toast)
  - Tasks updated: T-02 (right-panel visual treatment), T-08 (merge guidance codified), T-10 (EditorTopBar re-entry affordance added)
- Rev 1 — 2026-05-12
  - Initial draft
