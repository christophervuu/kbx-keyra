# SPEC

## Title

Mapping Editor — Target-Driven Three-Column Layout Redesign

---

## ID

FS-020

---

## Metadata

Owner: @keyra-ui-team
Reviewers: TBD
Created: 2026-05-03
Last Updated: 2026-05-03 (Rev 2)
Type: ui

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Redesign the Mapping Editor from its current rules-list-centric 8-panel grid to a target-driven, three-column layout where the target schema serves as the primary worklist. The new layout uses Source Schema (left) → Target Schema Worklist (center) → Contextual Builder/Editor (right), with Preview/Testing/Diagnostics relocated to a full-width bottom area. This reduces time-to-first-successful-mapping (TTFSM) by making the next action obvious and improves coverage visibility.

---

## Problem

The current Mapping Editor layout centers on a Rules List (Panel 3) as the primary working surface. Users must mentally correlate rule indices with target schema positions, track coverage by scanning the rule list, and cannot see at a glance which target fields remain unmapped. This imposes high cognitive load, especially for non-technical users who think in terms of "fill this target field" rather than "manage rule #27." Array mappings are handled through the same single-row editing UX as scalar fields, providing no guided workflow. The existing stacked source/target schema panels in the narrow left column provide limited structural visibility.

---

## Goal

A redesigned Mapping Editor layout that:

- Makes the target schema the primary worklist so users navigate by "what needs to be mapped" rather than "which rule to edit"
- Provides instant coverage visibility (mapped/unmapped/warning/error status per field, section-level coverage indicators)
- Offers node-type-specific editing modes: scalar builder, object summary, and a dedicated array mapping workflow
- Relocates Preview/Testing/Diagnostics to a full-width bottom area for better output visibility
- Preserves all existing functionality (Rules View, Configuration, Version History, AI features) as accessible secondary views
- Reduces TTFSM by presenting clear next-action guidance from first load

---

## Assumptions

- FS-010 (Rule Editor) and FS-011 (Expression Builder) are complete — `useMappingEditor`, `useExpressionBuilder`, validation wiring, save flow all exist
- FS-017 (Configuration Panel) is complete or in progress — Panel 7 functionality remains accessible
- FS-018 (Version History) is complete or in progress — drawer pattern remains accessible
- Source and target parsed schemas are available from `useMappingEditor` hook
- The current `MappingEditorPage` grid component can be replaced without breaking the route composition in `routes/pages/MappingEditor.tsx`
- Existing expression builder components (`GuidedBuilder`, `RawDslEditor`, `ExpressionPreview`, etc.) are reusable in the new right-panel context
- No mapping engine, DSL, or backend API changes are required
- Save ≠ Deploy semantics remain unchanged

---

## Current Context

The Mapping Editor (`ui/src/features/mappings/`) uses a multi-panel grid layout (`MappingEditorPage.tsx`) with 8 named slots:

- **Panel 1** (Source Schema) — top-left, stacked above Panel 2
- **Panel 2** (Target Schema) — middle-left, stacked below Panel 1
- **Panel 3** (Rule List) — center, spans 2 rows, primary working surface
- **Panel 4** (Expression Builder) — top-right, dual-mode (Raw DSL / Guided Builder)
- **Panel 5** (Preview) — middle-right
- **Panel 6** (Diagnostics) — bottom-left
- **Panel 7** (Configuration) — bottom-center
- **Panel 8** (History) — bottom-right (compact summary, full drawer overlay)

Grid layout: `grid-cols-[200px_1fr_240px] grid-rows-[1fr_1fr_180px]`

Interaction model: User selects a rule in Panel 3 → expression loads in Panel 4 → preview shows in Panel 5. Source schema (Panel 1) supports click-to-insert paths into expression. The rule list is the central navigation artifact.

The Version History is implemented as a right-side overlay drawer, not a grid panel. Configuration Panel writes to `MappingConfig.config` and integrates with validation.

Existing hooks: `useMappingEditor`, `useExpressionBuilder`, `useExpressionPreview`, `useEngineValidation`, `useDslAutocomplete`, `useDslValidation`.

Existing components that will be reused: `RawDslEditor`, `GuidedBuilder`, `ExpressionPreview`, `FunctionReferencePanel`, `AutocompleteDropdown`, `SourceFieldPicker`, `TransformPicker`, `ConfigurationPanel`, `PreviewPanel`, `VersionHistoryDrawer`.

---

## Scope

### In Scope

- Replace `MappingEditorPage` grid with three-column layout + bottom area
- New Target Schema Worklist as center column with field-level status, grouping modes, coverage indicators
- New Global Toolbar (search, filters, sort, section actions, Rules View toggle)
- Refactored Right Panel (Builder/Editor) with node-type-specific editing modes (scalar, object, array)
- Dedicated Array Mapping Builder with guided multi-step workflow
- Source panel drag-and-drop into Builder/Editor expression slots
- Click-to-stage as alternative source field interaction
- Empty/first-run state with target-driven guidance
- Breadcrumb drill-down mode toggle for deeply nested schemas (5+ levels)
- Rules View preserved as secondary/advanced toggle
- Preview/Testing/Diagnostics relocated to full-width bottom area
- Responsive behavior: source panel collapses at 1024px; target panel never collapses
- Architecture document update for `ui-application.md`

### Out of Scope

- Any mapping engine, DSL, or backend API changes
- "Next best target" auto-navigation after saving a mapping (deferred)
- Mobile/tablet responsive design
- AI model integration (AI suggestion buttons are positioned but remain placeholders)
- Deploy actions in editor
- Performance optimization of schema tree rendering (separate concern)

---

## Non-Goals

- This is not a redesign of the mapping engine execution model
- This does not introduce new DSL syntax or functions
- This does not change the save/persist semantics
- This does not implement "smart" auto-mapping logic (buttons are placed, behavior is placeholder)
- This does not add real-time collaboration features

---

## Relevant Areas

- `ui/src/features/mappings/components/MappingEditorPage.tsx` — primary layout shell (replaced)
- `ui/src/features/mappings/components/` — all existing components (many reused, some refactored)
- `ui/src/features/mappings/hooks/` — existing hooks (extended, not replaced)
- `ui/src/routes/pages/MappingEditor.tsx` — route composition (updated for new layout)
- `ui/src/features/mappings/components/preview/` — preview subsystem (relocated)
- `forge/architecture/ui-application.md` — architecture documentation (updated)

---

## Dependencies / Blockers

- FS-010 (Rule Editor) must be complete — provides `useMappingEditor` and rule CRUD
- FS-011 (Expression Builder) must be complete — provides expression authoring components
- FS-017 (Configuration Panel) should be complete or its components must be portable to the new layout
- FS-018 (Version History) should be complete or its drawer pattern must remain compatible

---

## Constraints

- Desktop-first (1280px+). At 1024px, source panel collapses first.
- The target schema panel must never collapse — it is the primary work queue.
- Array nodes must not be forced into the same single-row field editing UX as scalar nodes.
- Rules View must remain available for power users (bulk review, reorder, copy/paste, advanced debugging).
- This is a UI-only change. No mapping engine, DSL, or backend API changes.
- Must not contradict Save ≠ Deploy semantics, AI suggestion patterns, or engine architecture.
- TypeScript strict mode mandatory.
- Lint, tests, and formatting must pass.
- Must preserve existing `useMappingEditor` hook contract — extend only, don't break.

---

## Proposed Behavior

### User Flow

**Default Entry (Target-Driven Mode):**

1. User opens a mapping → editor loads with three-column layout
2. Target Schema Worklist (center) renders all target fields with unmapped markers
3. Global toolbar shows field counts and filter options
4. User clicks a target field → Right Panel (Builder/Editor) opens with context for that field type:
   - **Scalar field:** standard expression builder (source field selection → transform → preview expression → save)
   - **Object node:** section summary with coverage stats, child statuses, section-level actions
   - **Array node:** dedicated array mapping builder (guided multi-step workflow)
5. User builds mapping in right panel → saves → target field row updates status to "mapped"
6. User continues selecting unmapped target fields until desired coverage is achieved

**Source Interaction:**

- Drag source field from left panel into expression builder slot in right panel
- Or click a source field to "stage" it for insertion into the active expression slot

**Array Mapping Flow:**

1. Select array target field → array builder opens in right panel
2. Step 1: Choose source collection (select from source arrays)
3. Step 2: Choose mapping pattern (1:1 map, filter-then-map, merge arrays, build from scalars, advanced/custom)
4. Step 3: Map item fields (drag-and-drop source item fields to target item fields) — one level only
5. Step 4: Preview sample output
6. Save → generates appropriate DSL expression

**Nested Array Behavior (Step 3 — one level only):**

- The array builder supports mapping item fields for a single level of array items.
- If a user clicks an array node that is nested inside another array, the builder:
  - Shows the standard array builder for that inner array
  - Displays a contextual note: "This array is nested inside {parentArrayName}. The outer array mapping must be configured first." with a link to select the parent array node
  - Allows Raw DSL for advanced users who want to write the full nested expression directly
- Deeply nested array-in-array scenarios (e.g., `departments[].employees[]`) can be authored via the Raw DSL toggle or by mapping each array level separately in the target tree.

**Rules View Toggle:**

- User clicks "Rules View" toggle in toolbar → layout switches to show the traditional rules list as the center column
- All existing Rule List functionality available: CRUD, reorder, bulk actions, diagnostics
- Toggle back to "Target View" returns to the target-driven worklist

**View Toggle Selection Persistence:**

- When switching from Target View to Rules View: the rule corresponding to the currently selected target field is highlighted/scrolled-to in the rules list
- When switching from Rules View to Target View: the previously selected target field remains selected and the right panel shows its builder context
- Edge case: if a rule selected in Rules View targets an array/object path (not a single scalar), switching to Target View selects the array/object node that best represents that rule's target path

**Breadcrumb Drill-Down (Toggle):**

- User enables breadcrumb mode via toggle
- Clicking an object/array node isolates that subtree as the worklist view
- Breadcrumb trail shows navigation path; clicking breadcrumb navigates up

### System Behavior

**Target Field Row Data:**

Each target field row displays:
- Field name
- Type badge (string, number, boolean, object, array)
- Required indicator (asterisk or badge)
- Mapping status icon: unmapped (empty circle), mapped (filled circle/check), warning (yellow triangle), error (red circle)
- Optional short expression summary (max 60 characters; shows outermost function name + first argument; truncates remaining args with `…`; full expression on hover tooltip)

**Grouping Modes:**
- Schema hierarchy (default) — natural JSON Schema structure
- Required-first — required fields grouped at top
- Unmapped-first — unmapped fields grouped at top
- Warnings/errors-first — fields with diagnostics grouped at top

**Section Coverage:**
- Object nodes display coverage indicator: e.g., "3/5 mapped"
- Coverage is computed from direct children mapping status

**Right Panel State:**
- Panel content is driven by `selectedTargetNode` state
- When no target is selected, panel shows guidance text
- Panel never shows preview — preview is exclusively in the bottom area

**Mapping Status Derivation:**
- A target field is "mapped" if a rule exists with that target path
- A target field has "warning" if its rule has validation warnings
- A target field has "error" if its rule has validation errors
- A target field is "unmapped" if no rule targets that path

**Suggested Source Fields Heuristic (client-side, Phase 0–1):**
- Runs entirely client-side against the parsed source schema tree. No backend call.
- Matching rules (ordered by priority):
  1. Exact name match — `firstName` → `firstName`
  2. Case-insensitive match — `FirstName` → `firstName`
  3. Contains match — target `fullName` suggests source fields containing "name" (`firstName`, `lastName`)
  4. Type compatibility — only suggest source fields whose type is compatible with the target field's type
- Returns up to 5 suggestions, ordered by match strength.
- Phase 2: AI suggestions will appear alongside heuristic suggestions with a sparkle badge to distinguish AI-suggested from heuristic-suggested. AI may replace heuristic suggestions when confidence is high.

**Expression Summary Formatting (target field rows):**
- Max 60 characters. If the full expression is ≤ 60 characters, show it in full — no truncation.
- Always show the outermost function name.
- Always show the first argument (usually the primary source path) if it fits.
- Truncate remaining arguments with `…`.
- Object templates inside `map()` show as `{…}`.
- Full expression is visible on hover (tooltip) and when the field is selected (right panel header).
- Examples:
  - `source("firstName")` → shown in full (17 chars)
  - `concat(source("firstName"), " ", source("lastName"))` → `concat(source("firstName"), …)`
  - `map(source("items"), { "sku": item("sku"), … })` → `map(source("items"), {…})`
  - `if(gt(source("amount"), 0), "CREDIT", "DEBIT")` → `if(gt(source("amount"), …), …)`

**Global Toolbar:**
- Search: filters target tree to fields matching query
- Filters: All / Unmapped / Warnings / Required / Arrays (toggleable)
- Sort: Schema order / Unmapped first / Required first
- Section actions: Auto-map Section (disabled, muted style, tooltip: "AI-powered auto-mapping — available in a future release")
- View toggle: Target View (default) / Rules View

### Failure / Edge Behavior

**Empty/First-Run State:**
- No rules exist → all target fields show unmapped status
- Guidance text: "Select a target field to create its mapping"
- CTAs: "Start with required fields", "Auto-map this schema" (disabled, muted, tooltip: "AI-powered auto-mapping — available in a future release"), "Select a target field"
- Target tree renders fully with all fields visible and unmapped markers

**No Source Schema:**
- Source panel shows "No source schema selected" message
- Drag-and-drop is disabled
- Builder still allows raw DSL entry

**No Target Schema:**
- Center column shows "No target schema available" message
- Right panel is disabled

**Deeply Nested Schemas (5+ levels):**
- Default: indented tree with full structural visibility
- Optional breadcrumb drill-down mode isolates subtree

**Schema Parse Errors:**
- If target schema cannot be parsed, show error state in center column with retry action
- If source schema cannot be parsed, show error state in left column

**Responsive (1024px):**
- Source panel collapses to a narrow icon bar or hidden panel with expand toggle
- Target panel and right panel remain visible
- Bottom area remains full-width

---

## Acceptance Examples

### AE-01 — Target-driven layout renders on load

**Given**
- A mapping exists with source and target schemas assigned
- 5 target fields exist, 2 already have rules mapped

**When**
- User navigates to the mapping editor

**Then**
- Three-column layout renders: source browser (left), target worklist (center), builder panel (right)
- Bottom area renders with preview/diagnostics tabs
- Target worklist shows all 5 fields
- 2 fields show "mapped" status, 3 show "unmapped" status
- Right panel shows "Select a target field to create its mapping" guidance

### AE-02 — Selecting a scalar target field opens builder

**Given**
- Target schema has a field `customer.name` of type `string`, required, currently unmapped

**When**
- User clicks the `customer.name` row in the target worklist

**Then**
- Right panel updates to show:
  - Target path: `customer.name`
  - Type: `string`
  - Status: Required, Unmapped
  - Suggested source fields section
  - Expression builder (source field → transform → preview expression)
  - Raw DSL toggle
  - AI action buttons: Suggest, Explain, Fix

### AE-03 — Object node shows section summary

**Given**
- Target schema has an object node `address` with 5 children (3 mapped, 2 unmapped)

**When**
- User clicks the `address` object node in the target worklist

**Then**
- Right panel shows section summary:
  - Coverage: "3/5 mapped"
  - List of child fields with their individual statuses
  - Section actions: "Auto-map section" (placeholder), "Map required fields first" (filters view), "Validate section"

### AE-04 — Array node opens dedicated array builder

**Given**
- Target schema has an array node `orders[]` currently unmapped
- Source schema has an array `data.orderHistory[]`

**When**
- User clicks the `orders[]` array node in the target worklist

**Then**
- Right panel shows the Array Mapping Builder with Step 1 active:
  - Step indicator shows: (1) Source Collection → (2) Pattern → (3) Item Fields → (4) Preview
  - Step 1: list of available source arrays to choose from
- Scalar field builder is NOT shown — array has its own dedicated UX

### AE-05 — Array builder guided workflow completion

**Given**
- User has selected `orders[]` target array
- Source array `data.orderHistory[]` is available

**When**
- User selects `data.orderHistory[]` as source (Step 1)
- User selects "1:1 map" pattern (Step 2)
- User maps item fields: drags `orderHistory[].id` → `orders[].orderId`, drags `orderHistory[].total` → `orders[].amount` (Step 3)
- User reviews preview output (Step 4)
- User clicks "Save"

**Then**
- A mapping rule is created with appropriate DSL expression (e.g., `map(source("data.orderHistory"), ...)`)
- Target worklist updates: `orders[]` status changes to "mapped"
- Item fields `orders[].orderId` and `orders[].amount` also show mapped status

### AE-06 — Empty state (first-run) guidance

**Given**
- A new mapping with target schema assigned but no rules yet

**When**
- User opens the mapping editor

**Then**
- Target worklist renders all fields with "unmapped" status markers
- Right panel shows guidance: "Select a target field to create its mapping"
- Visible CTAs: "Start with required fields", "Auto-map this schema" (disabled with tooltip), "Select a target field"
- No "No rules yet. Add your first rule." message appears

### AE-07 — Global toolbar filter interaction

**Given**
- A mapping with 10 target fields: 3 required, 4 unmapped, 2 with warnings

**When**
- User clicks "Unmapped" filter in the global toolbar

**Then**
- Target worklist shows only the 4 unmapped fields
- Other fields are hidden (not just dimmed)
- Filter badge shows active state
- Clearing the filter restores all 10 fields

### AE-08 — Rules View toggle preserves functionality

**Given**
- User is in the default Target View
- 5 rules exist in the mapping

**When**
- User clicks "Rules View" toggle in the global toolbar

**Then**
- Center column switches to display the traditional rules list (RuleList component)
- All rule CRUD, reorder, bulk selection, diagnostics functionality is available
- Right panel continues to show expression builder for selected rule
- Toggle shows "Target View" option to switch back

### AE-09 — Source drag-and-drop into builder

**Given**
- User has selected scalar target field `customer.email`
- Right panel shows expression builder with empty source slot

**When**
- User drags `data.contactEmail` from source schema browser (left panel) into the source field slot in the builder

**Then**
- Expression builder populates with `source("data.contactEmail")`
- Expression preview in the bottom area updates with evaluation result

### AE-10 — Breadcrumb drill-down mode

**Given**
- Target schema has 6+ levels of nesting
- User enables breadcrumb mode via toggle

**When**
- User clicks object node `response.data.customer.address`

**Then**
- Target worklist isolates to show only `address` subtree children
- Breadcrumb trail shows: `response` > `data` > `customer` > `address`
- Clicking `customer` in breadcrumb navigates up to show `customer` subtree
- Clicking root breadcrumb shows full schema tree

### AE-11 — Responsive collapse at 1024px

**Given**
- Editor is rendered at 1024px viewport width

**When**
- Viewport is at or below 1024px

**Then**
- Source panel collapses (hidden or icon-bar mode with expand toggle)
- Target worklist remains fully visible
- Right panel remains visible (may be narrower)
- Bottom area remains full-width

### AE-12 — Section coverage indicator on object nodes

**Given**
- Object node `billing` has 4 children
- 2 children are mapped, 1 has a warning, 1 is unmapped

**When**
- Target worklist renders in default hierarchy mode

**Then**
- `billing` row shows coverage indicator "2/4 mapped" (warning child counts as mapped-with-warning)
- Expand/collapse chevron allows viewing children inline

### AE-13 — View toggle preserves selection context

**Given**
- User is in Target View with `customer.email` selected (right panel shows its scalar builder)
- A rule exists for `customer.email`

**When**
- User toggles to Rules View

**Then**
- Rules View renders in center column
- The rule targeting `customer.email` is highlighted/scrolled-to in the rules list
- Right panel shows expression builder for that rule

**When** (continuing)
- User toggles back to Target View

**Then**
- Target Worklist renders with `customer.email` still selected (highlighted)
- Right panel shows `customer.email` scalar builder context

### AE-14 — Suggested source fields heuristic

**Given**
- Target field `customer.firstName` of type `string` is selected
- Source schema has fields: `data.firstName`, `data.lastName`, `data.email`, `contact.first_name`

**When**
- Right panel renders the scalar builder for `customer.firstName`

**Then**
- Suggested sources section shows (ordered by match strength):
  1. `data.firstName` (exact name match + type match)
  2. `contact.first_name` (contains "first" + "name")
- `data.lastName` and `data.email` are NOT suggested (no name match for "firstName")

---

## Open Questions

- none

---

## Resolved Decisions

| # | Question | Resolution |
|---|----------|------------|
| Q1 | Auto-map button treatment before AI integration | Visually present but **disabled** with muted style (grayed icon + label). Tooltip: "AI-powered auto-mapping — available in a future release." Layout positions preserved so no design churn when AI ships. |
| Q2 | Array builder Step 3 — nested arrays within arrays | **One level only** in v1. Nested array-in-array scenarios authored via Raw DSL toggle or by mapping each array level separately. If user clicks nested array, builder shows contextual note about configuring outer array first. |
| Q3 | Selection persistence when switching Target View ↔ Rules View | **Preserve selection.** Switching to Rules View highlights/scrolls-to the corresponding rule. Switching back restores the selected target field. Edge case: array/object rules select the best-matching node. |
| Q4 | Suggested source fields — heuristic vs AI-only | **Client-side heuristic for v1.** Matching by: exact name, case-insensitive match, contains match, type compatibility. Up to 5 suggestions. AI suggestions layered in Phase 2 with sparkle badge. |
| Q5 | Expression summary truncation and format | **Max 60 characters.** Show outermost function name + first argument. Truncate remaining args with `…`. Object templates as `{…}`. Full expression on hover tooltip and in right panel. |

---

## Verification Strategy

- **Unit tests** for new components: `TargetWorklist`, `TargetFieldRow`, `GlobalToolbar`, `ArrayMappingBuilder`, `ScalarFieldBuilder`, `ObjectSummaryPanel`, `BreadcrumbNav`
- **Integration tests** for:
  - Target field selection → right panel context loading (AE-02, AE-03, AE-04)
  - Filter/sort interactions (AE-07)
  - Rules View toggle (AE-08)
  - Drag-and-drop source → builder (AE-09)
- **Component tests** for responsive behavior (AE-11) via viewport mocking
- **Typecheck** must pass for all touched areas (`tsc --noEmit`)
- **Lint/format** must pass (`eslint`, `prettier`)
- **Build** must succeed (`pnpm build` in `ui/`)
- **Visual regression** — manual verification of layout at 1280px and 1024px breakpoints
- AE-01 through AE-14 should all have automated test coverage (unit or integration level)
- AE-05 (array builder end-to-end flow) may require integration-level testing with mocked engine

---

## Task Generation Notes

This is a `ui` type spec. All tasks are `ui-task` except the architecture update task which is `task`.

Recommended decomposition:

1. **Layout shell refactor** — replace `MappingEditorPage` grid with new three-column + bottom layout structure. This is the foundation all other tasks build on.
2. **Target Worklist panel** — the center column component rendering target schema as a field-status tree.
3. **Target field row component** — individual row rendering with status, type badge, required indicator, expression summary.
4. **Global Toolbar** — search, filters, sort, section actions, view toggle. Sits above the three columns.
5. **Scalar field builder (Right Panel)** — right panel content when a scalar target is selected.
6. **Object summary panel (Right Panel)** — right panel content when an object node is selected.
7. **Array Mapping Builder (Right Panel)** — dedicated multi-step guided workflow for array nodes.
8. **Bottom area: Preview/Diagnostics relocation** — move existing preview and diagnostics components to full-width bottom.
9. **Source panel interactions** — drag-and-drop + click-to-stage into builder slots.
10. **Empty/first-run state** — target-driven guidance when no rules exist.
11. **Breadcrumb drill-down mode** — toggle for isolating subtrees with breadcrumb navigation.
12. **Rules View preservation** — secondary toggle that shows traditional rules list.
13. **Architecture document update** — update `ui-application.md` to reflect new layout pattern.

Sequencing: T-01 (layout shell) must come first. T-02 and T-03 depend on T-01. T-04 through T-12 depend on T-01 and are mostly parallelizable with T-02/T-03 dependencies for some. T-13 runs last after implementation stabilizes.

---

## Change Log

- Rev 2 — 2026-05-03
  - Resolved all 5 open questions (Q1–Q5)
  - Q1: Auto-map buttons are disabled with tooltip, not hidden
  - Q2: Array builder Step 3 supports one level only; nested arrays use Raw DSL or separate mapping
  - Q3: Selection preserved when switching views; corresponding rule/field highlighted
  - Q4: Client-side heuristic for suggested sources (name match + type match), AI in Phase 2
  - Q5: Expression summary max 60 chars with outermost function + first arg, `…` truncation
  - Added AE-13 (view toggle selection persistence) and AE-14 (suggested sources heuristic)
  - Added "Suggested Source Fields Heuristic" and "Expression Summary Formatting" to System Behavior
  - Added "Nested Array Behavior" and "View Toggle Selection Persistence" to User Flow
- Rev 1 — 2026-05-03
  - Initial draft from requirements
