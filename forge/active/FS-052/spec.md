# SPEC

## Title

Unified Source Field Option Row — 3-Letter Type Badge + Test Data Preview

---

## ID

FS-052

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-14
Last Updated: 2026-05-14
Type: ui

---

## Status

draft

---

## Revision

Rev: 1

---

## Summary

Standardize every source-field dropdown/listbox option row across the mappings feature to a single shared layout: `[TYPE BADGE] [PROPERTY NAME] [TEST DATA] [SCOPE]`. The leading icon is replaced by a compact 3-letter type badge (e.g., STR, NUM, ARR). When test data is loaded (via PreviewContext), the resolved value for each field is shown inline in smaller/muted text. Scope labels (item, parent, root) remain right-aligned when applicable.

---

## Problem

Source-field pickers are visually inconsistent across the editor:

- `SourceFieldPicker` and `SourceChipPicker` show single-character type glyphs (S, #, ✓) with duplicated `TYPE_ICON` maps
- `ChainSourceCard` dropdown shows only path text — no type information at all
- `ItemFieldRow` dropdown shows a generic Database icon + scope badge but no type badge
- `ValueEntryEditor`, `FilterPredicateEditor`, and `MergeBranchEditor` have no type indication
- No picker shows test data values alongside field paths
- There is no shared renderer — each picker independently inlines its own option row markup

This makes it harder for users to distinguish field types at a glance, forces unnecessary cognitive load when picking fields, and wastes an opportunity to show contextual test data that would accelerate correct field selection.

---

## Goal

After this change:

1. Every source-field dropdown option row uses the same shared renderer component with a consistent 4-zone layout
2. Type is communicated via a clear 3-letter uppercase badge (STR, NUM, INT, BOL, ARR, OBJ, NUL, ANY)
3. When test/source data is loaded, the resolved value for each field path is shown inline in smaller muted text — giving immediate feedback about what data a field holds
4. Scope information (item, parent, root) is right-aligned when applicable
5. A single shared utility/component is the source of truth — no duplication

---

## Assumptions

- All target surfaces are custom listbox/dropdown UIs (not native HTML `<select>` elements)
- Native HTML `<select>` elements (`ValueEntryEditor`, `FilterPredicateEditor`) will be converted to the shared custom dropdown to enable rich option row rendering
- `PreviewContext.sourceData` is the canonical source of loaded test data and is always available in the React tree where source pickers render
- `SchemaPathEntry` (`{ path, type, description? }`) provides type information for all flattened source paths
- Existing search, keyboard navigation, and accessibility (role="listbox", role="option", aria-selected) behavior must be preserved

---

## Current Context

### Existing TYPE_ICON pattern (duplicated)

Both `SourceFieldPicker.tsx` and `SourceChipPicker.tsx` define an identical `TYPE_ICON` map:

```ts
const TYPE_ICON: Record<string, string> = {
  string: 'S', number: '#', integer: '#', boolean: '✓',
  object: '{}', array: '[]', null: '∅', any: '?',
};
```

This is rendered as a `<span className="text-xs font-mono">` leading each option row and pill/chip.

### Source data availability

`PreviewContext` provides `sourceData: unknown | null`. When loaded, this is typically a JSON object from a test case. Resolving a field's test value requires navigating dot-path keys into this object (e.g., `"address.city"` → `sourceData.address.city`).

### Scope labels in ItemFieldRow

`ItemFieldRow` already builds a `UnifiedSourceOption` with `scope: 'item' | 'parent' | 'source'` and renders scope as a trailing badge. This pattern generalizes: scope badges should be right-aligned in the shared option row when present.

### Affected surfaces (custom dropdown/listbox)

| Component | Currently shows type? | Currently shows scope? | Currently shows test data? |
|---|---|---|---|
| `SourceFieldPicker.tsx` | Single-char glyph | No | No |
| `SourceChipPicker.tsx` | Single-char glyph | No | No |
| `ChainSourceCard.tsx` | No | No | No |
| `ItemFieldRow.tsx` | No | Yes (item/parent) | No |
| `ArgumentSlotInput.tsx` | No | No | No |
| `ConditionStepEditor.tsx` | No | No | No |
| `BuilderEntryActions.tsx` | No | No | No |
| `ValueMapModeBuilder.tsx` | No | No | No |
| `MergeBranchEditor.tsx` | No | No | No |

### Affected surfaces (native HTML select — require conversion)

| Component | Notes |
|---|---|
| `ValueEntryEditor.tsx` | `<select>` for source field in array value entries |
| `FilterPredicateEditor.tsx` | `<select>` for right-operand source field |

---

## Scope

### In Scope

- Create a shared `SourceFieldOptionRow` component (single source of truth for option row rendering)
- Create a shared `SOURCE_TYPE_BADGES` map utility (3-letter codes + styling)
- Create a shared `resolveFieldTestValue(sourceData, fieldPath)` utility
- Refactor all custom dropdown/listbox source-field pickers to use the shared option row renderer
- Convert `ValueEntryEditor` and `FilterPredicateEditor` native `<select>` elements to custom dropdowns using the shared pattern
- Update source chip/pill rendering to use the 3-letter badge instead of single-char glyph
- Preserve all existing search, keyboard navigation, and accessibility behavior
- Update affected component tests

### Out of Scope

- SourceSchemaPanel (left tree panel) — this is a schema tree, not a dropdown picker
- Changes to target field pickers/rows (TargetFieldRow, TargetWorklist)
- Schema editing UIs
- Any behavior changes to selection logic, search filtering, or field validation
- Performance optimizations beyond what's needed for correctness

---

## Non-Goals

- This is not a general "design system dropdown" extraction — only source-field option rows are unified
- This does not introduce a new data-fetching pattern for test data — it uses existing `PreviewContext.sourceData`
- This does not change how source schemas are parsed or flattened

---

## Relevant Areas

- `ui/src/features/mappings/components/SourceFieldPicker.tsx`
- `ui/src/features/mappings/components/SourceChipPicker.tsx`
- `ui/src/features/mappings/components/ChainSourceCard.tsx`
- `ui/src/features/mappings/components/ItemFieldRow.tsx`
- `ui/src/features/mappings/components/ArgumentSlotInput.tsx`
- `ui/src/features/mappings/components/ConditionStepEditor.tsx`
- `ui/src/features/mappings/components/BuilderEntryActions.tsx`
- `ui/src/features/mappings/components/ValueMapModeBuilder.tsx`
- `ui/src/features/mappings/components/MergeBranchEditor.tsx`
- `ui/src/features/mappings/components/ValueEntryEditor.tsx`
- `ui/src/features/mappings/components/FilterPredicateEditor.tsx`
- `ui/src/features/mappings/lib/autocomplete-utils.ts` (SchemaPathEntry type)
- `ui/src/features/mappings/context/preview-context.tsx`
- `ui/src/features/mappings/lib/` (new shared utilities)

---

## Dependencies / Blockers

- none

---

## Constraints

- Must preserve existing accessibility patterns (role="listbox", role="option", aria-selected, aria-label)
- Must preserve existing keyboard navigation (arrow keys, Enter, Escape)
- Must preserve existing search/filter behavior in all pickers
- Tailwind CSS 4 utility-first styling only — no CSS modules
- No new external dependencies
- Test data display must gracefully handle missing/null values without breaking the option row layout
- Type badge must remain compact enough to not push content off-screen in narrow panels

---

## Proposed Behavior

### User Flow

1. User opens any source-field dropdown/listbox anywhere in the Mapping Editor
2. Each option row displays: `[3-letter TYPE badge] [field path] [test data preview] [scope badge]`
3. The TYPE badge is a compact colored pill (e.g., `STR` on blue, `NUM` on purple, `ARR` on amber)
4. If test data is loaded (via PreviewContext), the resolved value for that field path appears in smaller, muted text to the right of the field path
5. If the field has a scope context (item, parent, root), it appears right-aligned
6. Selected chips/pills in SourceFieldPicker and SourceChipPicker also use the 3-letter badge instead of single-char glyph
7. Search continues to filter by field path (not by type badge text or test data)

### System Behavior

- `SourceFieldOptionRow` receives: `{ path, type, testValue?, scope? }`
- `SOURCE_TYPE_BADGES` maps schema types to 3-letter codes:
  - `string` → `STR`
  - `number` → `NUM`
  - `integer` → `INT`
  - `boolean` → `BOL`
  - `object` → `OBJ`
  - `array` → `ARR`
  - `null` → `NUL`
  - fallback → `ANY`
- `resolveFieldTestValue(sourceData, path)` navigates dot-path into sourceData object and returns a display-ready string (truncated to ~30 chars if longer)
- Components that render source options consume `PreviewContext` to get `sourceData`, then pass resolved test values to `SourceFieldOptionRow`
- `SourceFieldOptionRow` renders nothing for `testValue` when it is `undefined` or `null`

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ [STR]  address.city   "San Francisco"                   [item]  │
│ badge  path           test data (smaller/muted)       scope     │
└─────────────────────────────────────────────────────────────────┘
```

- Badge: `inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider`
- Path: `text-sm font-mono text-slate-200`
- Test data: `text-xs text-slate-500 truncate max-w-[120px]` — only rendered when non-null
- Scope: `ml-auto text-[10px] font-medium text-slate-500 uppercase`

### Failure / Edge Behavior

- **No source schema loaded:** picker shows empty state or "No source schema loaded" — no option rows rendered
- **Source data not loaded:** test data column is simply omitted (renders nothing) — option rows still show type + path + scope
- **Field path not resolvable in source data:** test data shows nothing for that row (graceful fallback)
- **Deeply nested paths:** dot-path resolution handles intermediate nulls by returning undefined
- **Very long test data values:** truncated with ellipsis (max ~30 chars visible)
- **Unknown type:** badge renders `ANY` with neutral gray styling

---

## Acceptance Examples

### AE-01 — 3-letter type badge replaces single-char icon

**Given**
- Source schema with fields: `name` (string), `age` (number), `active` (boolean), `tags` (array)

**When**
- User opens ChainSourceCard dropdown

**Then**
- Option for `name` shows badge `STR`
- Option for `age` shows badge `NUM`
- Option for `active` shows badge `BOL`
- Option for `tags` shows badge `ARR`
- No single-char icons (S, #, ✓, []) are visible

### AE-02 — Test data displayed when loaded

**Given**
- Source schema with field `email` (string)
- PreviewContext sourceData = `{ "email": "test@example.com" }`

**When**
- User opens any source-field picker

**Then**
- Option for `email` shows: `[STR] email  "test@example.com"`
- Test data text is visually smaller and muted compared to the field path

### AE-03 — Test data absent when not loaded

**Given**
- Source schema with field `email` (string)
- PreviewContext sourceData = null

**When**
- User opens any source-field picker

**Then**
- Option for `email` shows: `[STR] email`
- No test data text is visible
- Layout does not break or leave empty gaps

### AE-04 — Scope badge right-aligned in ItemFieldRow

**Given**
- Array context with item fields `id`, `name` and parent field `orderId`
- PreviewContext sourceData = `{ "orders": [{ "id": 1, "name": "Widget", "orderId": "ORD-1" }] }`

**When**
- User expands an ItemFieldRow and opens the source dropdown

**Then**
- Item fields show scope badge `item` right-aligned
- Parent field shows scope badge `parent` right-aligned
- All options show 3-letter type badge on the left

### AE-05 — Long test data values truncated

**Given**
- Source field `description` (string)
- PreviewContext sourceData = `{ "description": "This is a very long description that should be truncated in the display" }`

**When**
- User opens source-field picker

**Then**
- Test data text shows approximately first 30 characters with ellipsis: `"This is a very long descript…"`
- Layout does not overflow or wrap

### AE-06 — Chips/pills use 3-letter badge

**Given**
- User has selected field `email` (string) in SourceChipPicker

**Then**
- The selected chip shows `STR` badge, not `S` glyph
- Badge styling matches the dropdown option row badge

### AE-07 — Native select converted to custom dropdown

**Given**
- User is in ValueEntryEditor selecting a source field for an array value entry

**When**
- User opens the source field selector

**Then**
- A custom dropdown (role="listbox") renders with full SourceFieldOptionRow layout
- No native `<select>` element is used
- 3-letter type badges and test data are visible

---

## Open Questions

- `Q1.` Should the 3-letter badge have per-type color coding (e.g., STR=blue, NUM=purple, ARR=amber) or a single neutral color? (Draft assumes per-type colors.)
- `Q2.` Should test data for object/array types show a preview (e.g., `{3 keys}`, `[5 items]`) or just be omitted? (Draft assumes brief structural preview.)
- `Q3.` For the `ConditionStepEditor` field pickers — are there additional scope contexts beyond item/parent that need labels? (Draft assumes only item/parent/root.)

---

## Verification Strategy

- Unit tests for `resolveFieldTestValue` utility covering: simple paths, nested paths, array bracket notation, missing intermediates, null sourceData, truncation
- Unit tests for `SOURCE_TYPE_BADGES` mapping completeness
- Component tests for `SourceFieldOptionRow` rendering all layout zones
- Component tests updated for: `SourceFieldPicker`, `SourceChipPicker`, `ChainSourceCard`, `ItemFieldRow`, `ArgumentSlotInput`, `ConditionStepEditor`, `ValueEntryEditor`, `FilterPredicateEditor`, `MergeBranchEditor`, `ValueMapModeBuilder`, `BuilderEntryActions`
- Verify that all existing test assertions about option rendering still pass (with updated text content expectations)
- Typecheck (`tsc --noEmit`) and lint pass for all touched files
- Manual: visually confirm consistent layout across all picker surfaces in Mapping Editor

Maps to acceptance examples:
- AE-01, AE-06: badge rendering tests in shared component + integration in each picker
- AE-02, AE-03, AE-05: resolveFieldTestValue unit tests + SourceFieldOptionRow component tests
- AE-04: ItemFieldRow component tests with scope rendering
- AE-07: ValueEntryEditor/FilterPredicateEditor conversion tests

---

## Task Generation Notes

Decompose as follows:

1. **Shared utilities + SourceFieldOptionRow component (foundation)** — `ui-task`: Create `SOURCE_TYPE_BADGES`, `resolveFieldTestValue`, and `SourceFieldOptionRow` with tests. This is the dependency for all integration tasks.
2. **Refactor SourceFieldPicker + SourceChipPicker** — `ui-task`: Replace inline TYPE_ICON rendering and option markup with shared component. Update chip/pill badges. Update tests.
3. **Refactor ChainSourceCard + BuilderEntryActions** — `ui-task`: Add type information to dropdown options using shared renderer. Wire PreviewContext for test data. Update tests.
4. **Refactor ItemFieldRow + ConditionStepEditor + ArgumentSlotInput + ValueMapModeBuilder + MergeBranchEditor** — `ui-task`: Integrate shared option row renderer into scope-aware pickers. Update tests.
5. **Convert ValueEntryEditor + FilterPredicateEditor native selects** — `ui-task`: Replace `<select>` with custom listbox dropdowns using shared option row pattern. Preserve behavior. Update tests.

Tasks 2–5 depend on Task 1. Tasks 2–5 are parallelizable after Task 1 completes.

---

## Change Log

- Rev 1 — 2026-05-14
  - Initial draft
