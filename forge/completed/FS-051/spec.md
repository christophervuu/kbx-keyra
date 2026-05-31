# SPEC

## Title

Unified Builder Visual System — Align Scalar Builder to Array Builder

---

## ID

FS-051

---

## Metadata

Owner: @chris
Reviewers: TBD
Created: 2026-05-12
Last Updated: 2026-05-12
Type: ui

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Align the scalar field builder to the array builder's visual and interaction style so both builders feel like one cohesive authoring system. The array builder is the canonical source of truth for layout patterns, component styling, spacing, hierarchy, selection states, and advanced section treatment. This spec brings the scalar builder into visual conformance with the array builder and resolves the biggest structural inconsistency — Custom Expression is currently treated as a strategy card in the array builder but as a header-level Builder/Editor toggle in the scalar builder. After this work, both builders share a unified visual shell, and raw DSL editing is accessed identically via a header toggle in both.

---

## Problem

The scalar builder and array builder evolved independently across FS-038/FS-039 (scalar chain redesign) and FS-043 (array builder redesign). While they share some components (BuilderFeedbackArea, card styling), they diverge in several ways that break the perception of a single authoring system:

1. **Outer frame inconsistency.** ScalarFieldBuilder has `rounded-lg border border-slate-700 bg-slate-900/30` outer framing. ArrayBuilder has no border, no rounded corners, and no background fill. Both render in the same center panel slot — the visual mismatch is jarring.

2. **Header background inconsistency.** ScalarFieldBuilder header has `bg-slate-900/40`. ArrayBuilder header has no background. The header content structure differs: scalar shows type badge + path + Builder/Editor toggle + overflow menu; array shows status icon + type badge + path + completion status but no Builder/Editor toggle or overflow menu.

3. **Builder/Editor toggle asymmetry.** The scalar builder exposes a Builder/Editor toggle in the header to switch between the chain builder and raw DSL editing. The array builder has no such toggle — instead, raw DSL editing is accessed by selecting the "Custom expression" mode card in ArrayModeSelector. This is the biggest interaction inconsistency: raw DSL is a mode switch in one builder and a strategy in the other.

4. **No completion status on scalar.** ArrayBuilder shows a completion status label (notStarted / inProgress / complete / hasErrors) in the header row 2. ScalarFieldBuilder shows only a "Required" label.

5. **No validation summary row on scalar.** ArrayBuilder has a dedicated `ValidationSummaryRow` pinned bar between the feedback area and scrollable content. ScalarFieldBuilder has no equivalent.

6. **Footer action row asymmetry.** ScalarFieldBuilder has a footer with AI buttons (Suggest, Explain, Fix), Reset draft, and Discard changes. ArrayBuilder has no footer action row.

7. **External option absent.** The scalar builder's entry point cards are Source field and Static value. External (disabled/coming-soon) was specified in FS-038 AE-19 but needs consistent disabled/coming-soon styling matching the conventions used elsewhere in the builder system.

---

## Goal

After this change:

1. A user opening the scalar builder and then the array builder (or vice versa) perceives a single, consistent authoring system with the same visual shell and interaction conventions.
2. Both builders use the same pattern: strategy selection -> contextual configuration -> advanced logic/details.
3. Builder and raw DSL editor modes are exposed in the same location (header toggle) and with the same interaction pattern in both builders.
4. Differences between scalar and array builders are limited to data-model-specific controls (source vs. collection modes, chain steps vs. item template), not visual presentation or structural framing.

---

## Assumptions

- The array builder (FS-043) is the canonical visual baseline — scalar aligns to array, not the other way around
- ChainBuilder, ConditionStepEditor, ValueMapStepEditor, and ChainStepCard internals are not being redesigned — this is a visual shell alignment, not a chain model redesign
- BuilderFeedbackArea is already shared between both builders and does not need structural changes
- The existing card styling in both ArrayModeSelector and ScalarEntryModeSelector already matches — this spec focuses on the surrounding chrome, not card internals
- The existing AI action buttons (Suggest, Explain, Fix) in the scalar builder footer are functional features that should be preserved, though their placement may change
- ArrayBuilder's item template layer and nested array handling are unaffected

---

## Current Context

### ScalarFieldBuilder Visual Anatomy

```
┌── rounded-lg border border-slate-700 bg-slate-900/30 ──────────┐
│ Header (bg-slate-900/40 px-4 py-3 border-b)                    │
│   Row 1: icon · type-badge · path ···· [Builder|Editor] [⋮]    │
│   Row 2: "Required" label (conditional)                         │
├─────────────────────────────────────────────────────────────────┤
│ BuilderFeedbackArea (pinned, shrink-0)                          │
├─────────────────────────────────────────────────────────────────┤
│ Scrollable content (flex-1 overflow-y-auto bg-slate-900/20)     │
│   · ScalarEntryModeSelector (3 cards: Source, Static, External) │
│   · ChainSourceCard / StaticValueInput (contextual)             │
│   · ── Logic divider ── (centered text)                         │
│   · Logic step list (transforms, conditions, value maps)        │
├─────────────────────────────────────────────────────────────────┤
│ Footer action row (bg-slate-900/40 px-4 py-3 border-t)         │
│   [Suggest] [Explain] [Fix(disabled)] · Reset draft · Discard  │
└─────────────────────────────────────────────────────────────────┘
```

### ArrayBuilder Visual Anatomy

```
┌── no outer frame ───────────────────────────────────────────────┐
│ Header (px-4 py-3 border-b, no bg)                              │
│   Row 1: status-icon · type-badge(amber) · path                │
│   Row 2: "Required" + completion status label                   │
├─────────────────────────────────────────────────────────────────┤
│ BuilderFeedbackArea (pinned, shrink-0, with ArrayResultPreview) │
│ ValidationSummaryRow (pinned, error/warning/incomplete counts)  │
├─────────────────────────────────────────────────────────────────┤
│ Scrollable content (flex-1 overflow-y-auto space-y-4 px-4 py-4)│
│   · ArrayModeSelector (5 cards: Map, FilterMap, BuildFromValues,│
│     MergeArrayBranches + ── Advanced ── CustomExpression)       │
│   · ── h-px divider ──                                         │
│   · Collection editor (mode-specific)                           │
│   · ── h-px divider ──                                         │
│   · ItemTemplateEditor (for map/filterMap/merge)                │
│                                                                  │
│ (no footer action row)                                          │
└─────────────────────────────────────────────────────────────────┘
```

### Key Differences (Current State)

| Aspect | ScalarFieldBuilder | ArrayBuilder |
|---|---|---|
| Outer frame | `rounded-lg border bg-slate-900/30` | None |
| Header bg | `bg-slate-900/40` | None |
| Builder/Editor toggle | Header (ModeToggle pill) | None — Custom Expr is a mode card |
| Completion status | Not shown | Shown in header row 2 |
| Validation summary row | Not present | Dedicated pinned bar |
| Footer action row | Yes (AI + Reset + Discard) | None |
| Overflow menu (⋮) | In header | Not present |
| Advanced separator | None (Logic uses same divider style) | "Advanced" divider in mode selector |

### Shared Components (Already Consistent)

- `BuilderFeedbackArea` — same component, same props shape
- Card styling — `rounded-lg border px-3 py-3`, blue dot indicator, hover states
- Question heading — `text-xs font-semibold uppercase tracking-wide text-slate-400`
- Divider pattern — `h-px bg-slate-700/60` or `bg-slate-700`

### Key Files

- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/ArrayBuilder.tsx`
- `ui/src/features/mappings/components/ArrayModeSelector.tsx`
- `ui/src/features/mappings/components/CustomExpressionEditor.tsx`
- `ui/src/features/mappings/components/ChainBuilder.tsx`
- `ui/src/features/mappings/components/BuilderFeedbackArea.tsx`
- `ui/src/features/mappings/components/RawDslEditor.tsx`

---

## Scope

### In Scope

1. **Mode consistency** — Add Builder/Editor toggle to ArrayBuilder header; remove Custom Expression as a strategy card from ArrayModeSelector; wire RawDslEditor rendering for array builder editor mode
2. **Visual frame alignment** — Remove outer border/rounded/bg from ScalarFieldBuilder to match ArrayBuilder; remove header background from ScalarFieldBuilder
3. **Header alignment** — Add completion status label to ScalarFieldBuilder header row 2; add overflow menu (⋮) to ArrayBuilder header for parity with ScalarFieldBuilder
4. **Validation summary alignment** — Add ValidationSummaryRow (or equivalent) to ScalarFieldBuilder between feedback area and scrollable content
5. **Section framing alignment** — Ensure both builders use the same scrollable content spacing, divider treatment, and section ordering
6. **External option treatment** — Ensure the External value option in ScalarFieldBuilder's entry mode selector uses consistent disabled/coming-soon styling
7. **Action row alignment** — Add action row to ArrayBuilder with Reset draft and Discard; omit AI buttons from array builder; ensure consistent container styling across both builders
8. **Spacing and typography audit** — Verify matching px/py values, font sizes, colors, and visual weight between both builder shells

### Out of Scope

- Chain model changes (ChainState, ChainStep, generator, decomposer)
- Array builder mode logic changes (map, filterMap, buildFromValues, mergeArrayBranches internal behavior)
- Item template editor changes
- BuilderFeedbackArea internal changes
- AI feature implementation (Suggest/Explain/Fix logic is unchanged)
- New functional capabilities for either builder
- Rules View ExpressionBuilderPanel changes
- Changes to ObjectSummaryPanel or BuilderEmptyState
- Mobile or responsive layout

---

## Non-Goals

- This is not a chain model or interaction model redesign — it is a visual and structural alignment
- This does not introduce new builder capabilities
- This does not change the underlying DSL or engine behavior
- This does not aim for pixel-perfect design system specification — it establishes consistent visual treatment between two related surfaces

---

## Relevant Areas

- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/ArrayBuilder.tsx`
- `ui/src/features/mappings/components/ArrayModeSelector.tsx`
- `ui/src/features/mappings/components/CustomExpressionEditor.tsx`
- `ui/src/features/mappings/components/ChainBuilder.tsx`
- `ui/src/features/mappings/components/RawDslEditor.tsx`
- `ui/src/features/mappings/components/BuilderFeedbackArea.tsx`
- `ui/src/features/mappings/hooks/use-array-builder-state.ts`
- `ui/src/features/mappings/types.ts ?`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- Depends on completed FS-038 (scalar chain builder redesign)
- Depends on completed FS-039 (auto-draft, chain semantics, collapse behavior)
- Depends on completed FS-043 (array builder redesign)
- All dependencies are in `forge/completed/`; no blockers.

---

## Constraints

- Must preserve all existing functional behavior of both builders
- Must preserve Builder/Editor mode toggle contract — switching to Editor shows generated/raw DSL, switching back decomposes
- Must preserve the array builder's mode switching and state preservation logic
- Must preserve the scalar builder's auto-draft model and chain semantics
- Must preserve integration with BuilderFeedbackArea, ConnectedInlinePreviewStrip, and useMappingEditor
- The array builder's CustomExpressionEditor.tsx is retired as a mode card surface; its RawDslEditor rendering and decomposition-back logic must be preserved in the new Builder/Editor toggle flow
- TypeScript strict mode, zero-error lint/typecheck
- No new external dependencies
- Desktop-first (1024px minimum)

---

## Proposed Behavior

### Unified Builder Shell Pattern

After this change, both builders share the same visual shell:

```
┌── no outer frame (flex flex-col, no border/rounded/bg) ─────────┐
│ Header (px-4 py-3 border-b, no bg)                              │
│   Row 1: status-icon · type-badge · path ·· [Builder|Editor] [⋮]│
│   Row 2: "Required" (conditional) + completion status label      │
├──────────────────────────────────────────────────────────────────┤
│ BuilderFeedbackArea (pinned, shrink-0)                           │
│ ValidationSummaryRow (pinned, shrink-0)                          │
├──────────────────────────────────────────────────────────────────┤
│ Scrollable content (flex-1 overflow-y-auto space-y-4 px-4 py-4) │
│                                                                   │
│   [Builder mode]                                                  │
│   · Strategy cards (question heading + selectable cards)          │
│   · ── h-px divider ──                                            │
│   · Contextual configuration (mode-specific body)                │
│   · ── h-px divider ── (if advanced/logic section present)       │
│   · Advanced logic / refinement section                          │
│                                                                   │
│   [Editor mode]                                                   │
│   · RawDslEditor (full height, with parse status + error list)   │
│   · Decomposition warning banner (if applicable)                 │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│ Action row (px-4 py-2 border-t, shrink-0) [both builders]       │
│   Scalar: [Suggest] [Explain] ···· [Reset draft] [Discard]      │
│   Array:  [Reset draft] [Discard] (no AI buttons)                │
└──────────────────────────────────────────────────────────────────┘
```

### User Flow

#### Scalar Builder Flow (Post-Alignment)

1. User selects a scalar target field
2. Builder panel renders with unified shell:
   - Header: status icon, type badge, target path, Builder/Editor toggle, overflow menu (⋮), completion status
   - BuilderFeedbackArea: expression + result
   - ValidationSummaryRow: error/warning/incomplete counts (if any)
3. Scrollable content (Builder mode):
   - Question: "Where does this value come from?"
   - Cards: Source field, Static value, External (disabled)
   - Divider
   - Contextual config: source picker / static input / disabled placeholder
   - Logic divider (if source or static selected)
   - Logic section: [+ Add Step] for transforms/conditions/value maps
4. Action row: AI actions, Reset draft, Discard

#### Array Builder Flow (Post-Alignment)

1. User selects an array target field
2. Builder panel renders with unified shell:
   - Header: status icon, type badge (amber "array"), target path, **Builder/Editor toggle** (new), **overflow menu (⋮)** (new), completion status
   - BuilderFeedbackArea: expression + result (with ArrayResultPreview)
   - ValidationSummaryRow: error/warning/incomplete counts
3. Scrollable content (Builder mode):
   - Question: "How do you want to build this array?"
   - Cards: Map, Filter+Map, Build from values, Merge array branches (**no Custom Expression card**)
   - Divider
   - Collection editor (mode-specific)
   - Divider
   - Item template editor (for applicable modes)
4. Scrollable content (Editor mode — **new**):
   - RawDslEditor with parse status badge, error list, restore/reset actions
   - Same decomposition-back-to-builder flow as scalar builder
5. Action row: Reset draft, Discard (no AI buttons until array-level AI features exist)

### System Behavior

#### Builder/Editor Toggle in ArrayBuilder (New)

**Adding the toggle:**
- A `ModeToggle` component (same as ScalarFieldBuilder's) is added to the ArrayBuilder header row 1, right-aligned after the target path
- Toggle has two segments: "Builder" (default) and "Editor"
- Same visual treatment: `inline-flex overflow-hidden rounded border border-slate-700`, active `bg-blue-600 text-white`, inactive `bg-slate-800 text-slate-400`

**Builder → Editor switch:**
1. The current generated expression from the array builder state is placed into the RawDslEditor textarea
2. The structured array builder state is preserved in memory (not destroyed)
3. User can edit the raw DSL directly
4. Draft detection continues normally (isDirty compares against savedExpression)

**Editor → Builder switch:**
1. Current raw editor text is run through the array decomposer (`decomposeArrayExpression()`)
2. **Success:** array builder state is hydrated from decomposed structure; structured builder renders
3. **Failure:** warning banner: "This expression is too complex for the Builder. Edit in Editor mode." User stays in Editor mode.
4. The CustomExpressionEditor's existing "Restore previous draft" and "Reset to structured mode" actions are preserved as equivalent actions within the Editor mode surface

**Removing Custom Expression mode card:**
- The `customExpression` option is removed from `ArrayModeSelector`
- The "Advanced" separator divider in ArrayModeSelector is removed (no longer needed)
- `CustomExpressionEditor.tsx` content (RawDslEditor, parse status badge, error list) is refactored into the ArrayBuilder's editor-mode rendering path
- The `isFromUnrecognized` banner concept is preserved: when an expression cannot be decomposed, the Builder/Editor toggle defaults to Editor mode with the unrecognized expression banner

#### ScalarFieldBuilder Visual Frame Changes

**Outer wrapper:** Remove `rounded-lg border border-slate-700 bg-slate-900/30`. The component renders as `flex flex-col gap-0 overflow-y-auto` (matching ArrayBuilder).

**Header:** Remove `bg-slate-900/40`. Keep `shrink-0 border-b border-slate-700 px-4 py-3`. Add completion status label in row 2 (matching ArrayBuilder's notStarted / inProgress / complete / hasErrors pattern).

**Scrollable content:** Change background from `bg-slate-900/20` to match ArrayBuilder's plain treatment. Adopt `space-y-4 px-4 py-4` spacing.

#### Validation Summary Row for Scalar

Add a `ValidationSummaryRow` (or reuse ArrayBuilder's implementation) between the BuilderFeedbackArea and scrollable content in ScalarFieldBuilder. Shows:
- Error count (if > 0)
- Warning count (if > 0)
- Incomplete indicator (if chain is structurally incomplete)

This matches ArrayBuilder's existing pinned validation bar.

#### Completion Status for Scalar

The scalar builder header row 2 gains a completion status label matching ArrayBuilder's pattern:

| State | Label | Color |
|---|---|---|
| No source selected | "Not started" | Slate/muted |
| Source selected, chain valid | "Complete" | Green |
| Source selected, chain structurally incomplete | "In progress" | Blue |
| Validation errors present | "Has errors" | Red/amber |

#### Action Row Alignment

Both builders share a structurally consistent footer action row container, but contents differ based on available capabilities:

- Same border/padding treatment: `shrink-0 border-t border-slate-700 px-4 py-2`
- **Scalar builder:** Suggest, Explain AI action buttons (left) + Reset draft, Discard changes (right)
- **Array builder:** Reset draft, Discard changes only — **no AI buttons** until array-level AI features exist
- ArrayBuilder gains this action row (it currently has none)

**Guiding principle:** Use consistent structure for real affordances, but do not add disabled or non-functional controls purely for visual symmetry. Disabled AI buttons in the array builder would suggest capability that does not exist, add visual noise, and increase cognitive load without helping TTFSM. The action row container is the shared structural element; its contents are capability-driven.

#### Overflow Menu (⋮) Alignment

The overflow menu (⋮) is added to the ArrayBuilder header for parity with ScalarFieldBuilder:

- Same placement: header row 1, right-aligned after the Builder/Editor toggle
- Same icon and interaction model: click to open a dropdown menu
- Menu contents may vary by builder type:
  - **Scalar:** Remove mapping (and any future scalar-specific actions)
  - **Array:** Remove mapping (and any future array-specific actions)
- Even if array only has one option initially, the menu is present — builder-level actions always live in the same location across builder types

#### External Option Treatment

The External value card in ScalarFieldBuilder's entry mode selector uses the same disabled/coming-soon styling pattern:
- Card is visually muted (`opacity-50` or reduced contrast)
- Non-interactive (no hover effects, no selection)
- Tooltip on hover: "External data sources — available in a future release"
- Matches ArrayBuilder's convention for disabled/future features

### Failure / Edge Behavior

1. **Array expression decomposition failure on Editor→Builder switch:** Same behavior as scalar — warning banner, user stays in Editor mode. Draft detection continues.

2. **Unrecognized array expression on field selection:** When a saved array expression cannot be decomposed into structured mode, the builder opens in Editor mode with the unrecognized expression banner. Builder/Editor toggle shows Editor selected. User can edit raw DSL or attempt "Reset to structured mode."

3. **Mode switch during Editor mode in ArrayBuilder:** If the user is in Editor mode and manually edits the expression, then switches to Builder: decomposition is attempted. If the expression maps to a recognized array mode, the appropriate mode card is auto-selected and the collection editor hydrates.

4. **Action row in constrained width (~300px):** AI buttons should wrap or condense at narrow panel widths. The action row uses `flex-wrap` to accommodate narrow panels.

5. **Empty state:** Both builders continue to use the existing empty-state patterns. ScalarFieldBuilder's BuilderEmptyState is unaffected.

---

## Acceptance Examples

### AE-01 — Scalar builder has no outer border or background

**Given**
- A scalar target field is selected

**When**
- The ScalarFieldBuilder renders

**Then**
- The outer wrapper has no `rounded-lg`, no `border`, no `bg-slate-900/30`
- The component renders as `flex flex-col` without outer frame styling
- Visual appearance matches the ArrayBuilder's frameless rendering

### AE-02 — Scalar builder header matches array builder header

**Given**
- A scalar target field is selected

**When**
- The ScalarFieldBuilder header renders

**Then**
- Header has no background color (no `bg-slate-900/40`)
- Header has `border-b border-slate-700 px-4 py-3` (matching ArrayBuilder)
- Row 1: status icon, type badge, target path, Builder/Editor toggle, overflow menu (⋮)
- Row 2: "Required" label (conditional) + completion status label

### AE-03 — Array builder has Builder/Editor toggle and overflow menu in header

**Given**
- An array target field is selected

**When**
- The ArrayBuilder header renders

**Then**
- A Builder/Editor toggle (ModeToggle) appears in header row 1, right-aligned
- An overflow menu (⋮) appears after the toggle, matching ScalarFieldBuilder's header placement
- Visual treatment matches the scalar builder's toggle: `rounded border border-slate-700`, `bg-blue-600` for active, `bg-slate-800` for inactive
- "Builder" is selected by default
- Overflow menu contains "Remove mapping" (and any future array-specific actions)

### AE-04 — Custom Expression is no longer a strategy card in ArrayBuilder

**Given**
- An array target field is selected
- Builder mode is active

**When**
- The ArrayModeSelector renders

**Then**
- Four mode cards are shown: Map, Filter+Map, Build from values, Merge array branches
- No "Custom expression" card is present
- No "Advanced" separator divider is present

### AE-05 — Array builder Editor mode shows RawDslEditor

**Given**
- An array target field is selected
- User toggles Builder/Editor to "Editor"

**When**
- The builder switches to editor mode

**Then**
- The scrollable content area shows a RawDslEditor with the current generated expression
- Parse status badge shows (Empty / Valid / Invalid)
- Error list renders below if parse errors exist
- Strategy cards and collection editor are hidden
- BuilderFeedbackArea remains pinned above
- Switching back to "Builder" attempts decomposition

### AE-06 — Editor→Builder decomposition failure in array builder

**Given**
- An array target field is in Editor mode
- The raw DSL text is a complex expression that cannot be decomposed

**When**
- User toggles to "Builder"

**Then**
- Warning banner: "This expression is too complex for the Builder. Edit in Editor mode."
- User stays in Editor mode
- The toggle remains on "Editor"

### AE-07 — Scalar builder shows completion status

**Given**
- A scalar target field is selected

**When**
- No source is selected

**Then**
- Completion status label shows "Not started" in muted styling

**When**
- User selects a source field and the chain is complete (valid expression)

**Then**
- Completion status label shows "Complete" in green

### AE-08 — Scalar builder shows validation summary row

**Given**
- A scalar target field is selected
- The field has a validation warning (e.g., source path not in schema)

**When**
- The builder renders

**Then**
- A ValidationSummaryRow appears between BuilderFeedbackArea and the scrollable content
- Shows warning count badge
- Matches ArrayBuilder's validation summary styling

### AE-09 — Both builders use same scrollable content spacing

**Given**
- A scalar target field is selected in one instance
- An array target field is selected in another instance

**When**
- Both builders render their scrollable content area

**Then**
- Both use `space-y-4 px-4 py-4` spacing
- Both use `h-px bg-slate-700/60` dividers between major sections
- Question headings use `text-xs font-semibold uppercase tracking-wide text-slate-400`
- Card styling is identical

### AE-10 — Action row present in both builders with capability-appropriate contents

**Given**
- A scalar target field is selected
- An array target field is selected (separate instance)

**When**
- Both builders render

**Then**
- Both show an action row pinned at the bottom with `border-t border-slate-700 px-4 py-2`
- Both show Reset draft action (with inline confirmation for non-trivial expressions)
- Both show Discard changes action (visible when field is dirty)
- Scalar builder shows Suggest and Explain AI buttons (functional)
- Array builder does **not** show AI buttons — the action row contains only Reset draft and Discard
- The action row container styling is identical between both builders; only the contents differ based on available capabilities

### AE-11 — External option in scalar builder has disabled styling

**Given**
- A scalar target field is selected
- Builder mode is active

**When**
- The ScalarEntryModeSelector renders

**Then**
- "External" card has muted/disabled visual treatment (reduced opacity or contrast)
- Card is non-interactive (no hover effects, no click response)
- Tooltip: "External data sources — available in a future release"
- Disabled styling matches the project's existing conventions for coming-soon features

### AE-12 — Unrecognized array expression opens in Editor mode

**Given**
- An array target field has a saved expression that the array decomposer cannot parse into structured mode

**When**
- User selects the field

**Then**
- Builder/Editor toggle defaults to "Editor"
- RawDslEditor shows the saved expression
- Unrecognized expression banner appears (amber themed) explaining the expression is too complex for the Builder
- User can edit raw DSL or attempt "Reset to structured mode"

### AE-13 — Intentional differences are data-model-specific only

**Given**
- Both builders have been aligned

**When**
- Comparing the two builders side by side

**Then**
- Visual shell (header, feedback area, validation summary, scrollable frame, action row container) is identical
- Differences are limited to:
  - Strategy cards: source/static/external (scalar) vs. map/filterMap/buildFromValues/merge (array)
  - Contextual config: chain source card (scalar) vs. collection editors (array)
  - Advanced section: logic steps (scalar) vs. item template editor (array)
  - Result preview slot: standard (scalar) vs. ArrayResultPreview (array)
  - Action row contents: AI buttons present (scalar) vs. omitted (array) — structural affordances only
  - Completion status derivation logic (different per data model)
  - Overflow menu contents (may vary by builder type)

---

## Open Questions

- none

All questions resolved at Rev 2 — see Change Log.

---

## Verification Strategy

- **AE-01, AE-02, AE-09:** Verified via component tests — render ScalarFieldBuilder, assert CSS classes on outer wrapper, header, and content area match expected patterns. No outer border/rounded/bg, no header bg.
- **AE-03, AE-04, AE-05, AE-06, AE-12:** Verified via component tests — render ArrayBuilder, assert ModeToggle presence in header, assert no Custom Expression card, assert RawDslEditor renders in editor mode, assert decomposition failure shows warning.
- **AE-07, AE-08:** Verified via component tests — render ScalarFieldBuilder with various states, assert completion status label and ValidationSummaryRow presence.
- **AE-10:** Verified via component tests — render both builders, assert action row presence with expected buttons.
- **AE-11:** Verified via component test — render ScalarEntryModeSelector, assert External card is disabled with tooltip.
- **AE-13:** Manual visual inspection — compare both builders side by side.
- **All tasks:** TypeScript strict typecheck (`tsc --noEmit`) and lint must pass. Existing test suites for both builders must continue passing.

---

## Task Generation Notes

This spec should be decomposed into the following task areas:

1. **Array builder mode toggle** — Add Builder/Editor toggle to ArrayBuilder header; remove Custom Expression from ArrayModeSelector; wire RawDslEditor for editor mode; handle decomposition-back flow. This is the most complex task and should be done first as it changes the array builder's interaction model. Agent: `ui-task`.

2. **Scalar builder visual frame alignment** — Remove outer border/rounded/bg from ScalarFieldBuilder; remove header bg; align scrollable content spacing to `space-y-4 px-4 py-4`; ensure divider treatment matches. Agent: `ui-task`.

3. **Scalar builder header and status alignment** — Add completion status label to ScalarFieldBuilder header row 2; derive completion state from chain state and validation. Agent: `ui-task`.

4. **Validation summary row for scalar builder** — Add ValidationSummaryRow (shared or ported from ArrayBuilder) between BuilderFeedbackArea and scrollable content in ScalarFieldBuilder. Agent: `ui-task`.

5. **Action row alignment** — Add action row to ArrayBuilder matching ScalarFieldBuilder's footer; ensure consistent layout and button placement in both. Agent: `ui-task`.

6. **External option styling and visual polish** — Ensure External value card in ScalarEntryModeSelector uses consistent disabled/coming-soon styling; final spacing/typography audit across both builders. Agent: `ui-task`.

7. **Architecture update** — Update `ui-application.md` to document unified builder visual system, Builder/Editor toggle pattern for both builders, and retirement of Custom Expression as a mode card. Agent: `task`.

Tasks 2-6 can be parallelized once task 1 is complete (task 1 establishes the array builder's new toggle pattern). Task 7 depends on all prior tasks.

---

## Change Log

- Rev 2 — 2026-05-12
  - Both open questions resolved:
    - Q1 resolved: Omit AI buttons from ArrayBuilder action row until array-level AI features exist. Do not show disabled buttons purely for visual symmetry. The action row container is shared (same structural styling), but contents differ based on available capabilities. Guiding principle: use consistent structure for real affordances, but do not add disabled or non-functional controls purely for visual symmetry.
    - Q2 resolved: Add overflow menu (⋮) to ArrayBuilder header for parity with ScalarFieldBuilder. Same placement, same icon, same interaction model. Menu contents may vary by builder type (e.g., "Remove mapping" in both, future builder-specific actions as needed). The overflow menu is a real structural affordance — users benefit from learning that builder-level actions always live in the same header location.
  - Updated Proposed Behavior: Action Row Alignment section rewritten for capability-driven contents; new Overflow Menu Alignment section added
  - Updated Unified Builder Shell Pattern diagram to show overflow menu and differentiated action row contents
  - Updated AE-03 to include overflow menu in header
  - Updated AE-10 to reflect no AI buttons in array builder action row
  - Updated AE-13 to reflect action row content and overflow menu as intentional differences
  - No scope change — all resolutions are design clarifications within existing scope boundaries

- Rev 1 — 2026-05-12
  - Initial draft
