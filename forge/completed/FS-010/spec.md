# SPEC

## Title

Mapping Editor — Rule List & CRUD

---

## ID

FS-010

---

## Metadata

Owner: @keyra-ui-team
Reviewers: TBD
Created: 2026-05-01
Last Updated: 2026-05-01

Type: ui

---

## Status

completed

---

## Revision

Rev: 2

---

## Summary

Build the Mapping Editor page shell and Panel 3 (Rule List) — the primary rule authoring surface where users view, create, edit, delete, reorder, and bulk-manage DSL mapping rules. This panel integrates the mapping engine's `validate()` pipeline entirely client-side to provide inline validation on every change, displaying diagnostics with stable error codes, precise rule locations, and user-friendly messages. This is the first component to exercise the engine in-browser and establishes the reusable engine integration pattern that FS-011 (Expression Builder) and FS-012 (Preview & Testing) build upon.

---

## Problem

No mapping authoring UI exists. Users cannot view, create, or edit mapping rules in the browser. The engine (`validate()` and `execute()`) exists as a pure TypeScript library but has no browser integration layer. Downstream specs (FS-011, FS-012) are blocked on both the editor shell and the engine integration pattern.

---

## Goal

A fully functional Mapping Editor page at `/projects/:projectId/mappings/:mappingId` that:
- Renders a multi-panel layout container with Panel 3 (Rule List) functional and remaining panels as named placeholders
- Displays the `rules[]` array from a `MappingConfig` as a scrollable, interactive list with validation status
- Supports full CRUD: add, edit, delete, reorder, duplicate, copy/paste rules
- Calls `validate()` from the engine on every change (debounced 300ms) and displays inline diagnostics per rule
- Provides multi-select with bulk actions (delete, duplicate, copy)
- Persists changes via `useAdapter().updateMapping()` with version increment and unsaved-changes tracking
- Establishes a reusable `useEngineValidation()` hook for FS-011 and FS-012 to consume

---

## Assumptions

- FS-008 (UI Scaffold) is complete — provides routing, adapter, shared primitives, domain types
- FS-009 (Schema Tree View) is complete or in progress — provides `parseJsonSchema()` / `parseXsd()` parsers and `ParsedSchema` / `SchemaTreeNode` types needed for tree display
- The engine (`src/engine/`) is fully implemented (FS-001 through FS-007) and can be bundled for browser consumption via Vite
- `ui/src/lib/engine/` is the correct location for the browser integration layer (per project-structure.md)
- Engine is imported via a `@keyra/engine` path alias in `vite.config.ts` and `tsconfig.json` pointing to `src/engine/index.ts`. Vite handles `.js` extension resolution and TS transpilation natively. No pre-build step needed.
- `MappingConfig` in `ui/src/lib/types/domain.ts` is the canonical UI type; the engine's `MappingConfig` (from `src/engine/types/config.ts`) is structurally compatible
- UI `MappingRule` includes `description?: string` (aligned with engine's `MappingRule` type)
- Engine `validate()` signature: `validate(config: MappingConfig, sourceSchema: ResolvedSchema, targetSchema: ResolvedSchema): ValidationResult`
- The engine's `SchemaTree` adapter builds its own internal representation from raw JSON Schema objects. The UI passes `JSON.parse(schemaContent)` — the raw JSON Schema object, not the string. The FS-009 `ParsedSchema` is for the UI tree view only; it is not passed to the engine. They are parallel consumers of the same raw schema content.
- LocalStorageAdapter stores `MappingConfig` objects retrievable by ID
- `SchemaDetail.content` provides the raw schema content (JSON object or XML string) for both parser (tree display) and engine (validation) consumption
- Phase 0: no external state management libraries; `useState` / `useReducer` only
- Drag-and-drop uses `@dnd-kit/core` + `@dnd-kit/sortable` (~15KB gzipped). This is the mandated library for this spec — it provides built-in keyboard accessibility, active maintenance, and sortable list support out of the box.

---

## Current Context

The repository currently contains:
- `src/engine/` — fully implemented mapping engine with `validate()` and `execute()` entry points
- `ui/src/features/schemas/` — FS-009 schema parsers (`parseJsonSchema`, `parseXsd`, `parseInferredSchema`) and `<SchemaTreeView />` component
- `ui/src/routes/pages/MappingEditor.tsx` — placeholder page component (renders route title only)
- `ui/src/lib/api/types.ts` — `ApiAdapter` interface with `getMapping()`, `updateMapping()`, `getSchema()` methods
- `ui/src/lib/types/domain.ts` — `MappingConfig`, `MappingRule`, `SchemaRef`, `ParsedSchema`, `SchemaTreeNode` types
- `ui/src/hooks/use-async-state.ts` — `useAsyncState()` hook for async data loading
- `ui/src/lib/engine/` — referenced in project-structure.md but does not exist yet
- `ui/src/features/mappings/` — referenced in project-structure.md but does not exist yet

Per `forge/architecture/ui-application.md`:
- Feature code goes in `ui/src/features/mappings/`
- Shared engine integration goes in `ui/src/lib/engine/`
- No cross-feature imports; shared code goes to `components/`, `hooks/`, or `lib/`
- TypeScript strict mode, zero lint errors
- Tailwind CSS 4 for styling

Per `forge/architecture/mapping-engine.md`:
- `validate()` returns `ValidationResult { valid, diagnostics, coverage? }`
- `Diagnostic` contains: `code`, `severity`, `message`, `ruleIndex?`, `targetPath?`, `expression?`, `location?`
- `CoverageResult` contains: `total`, `mapped`, `percentage`, `unmappedFields?`
- Engine is pure, synchronous, deterministic — safe to call on every keystroke (with debounce)

---

## Scope

### In Scope

- Engine browser integration layer (`ui/src/lib/engine/`) with `validate` and `execute` re-exports
- `useEngineValidation()` hook (debounced, accepts MappingConfig + schemas, returns ValidationResult)
- Mapping Editor page shell with multi-panel layout container
- Top bar: mapping name, version indicator, save status, deploy status badges, schema names, "Go to Deploy Page" link
- Panel 3: Rule List component with validation status per row
- Rule display: target path, expression (truncated), type indicator, validation icon, row number, selection checkbox
- Rule type inference from expression (Direct Copy, Static Value, Conditional, Lookup, Array, Transform, Not configured)
- Add rule (append to end, trigger validate)
- Edit rule (inline or detail panel, target + expression + description, trigger validate)
- Delete rule (single with confirmation, trigger validate)
- Reorder rules (drag-and-drop with keyboard alternative, trigger validate)
- Multi-select with bulk actions: delete selected, duplicate selected, copy to clipboard
- Copy/paste rules (single-rule copy, paste from clipboard as JSON)
- Save behavior: persist via adapter, increment version, track unsaved changes, Ctrl+S/Cmd+S
- Load behavior: load MappingConfig + schemas on mount, parse schemas for validation
- Validation summary bar: total rules, valid/warning/error counts, coverage percentage
- Diagnostic detail panel (expand to see code, severity, message, expression snippet)
- States: loading, empty, populated, error (load), error (save), unsaved changes
- Empty state with "Add Rule" CTA and "Auto-Map with AI" placeholder button
- Browser `beforeunload` warning when unsaved changes exist
- Accessibility: keyboard navigable rule list, DnD keyboard alternative, ARIA live regions, focus-trapped confirmations

### Out of Scope

- Expression Builder panel (FS-011)
- Preview & Testing panel (FS-012)
- Schema Tree View panels (rendered as placeholders; FS-009 component may be wired later)
- Project CRUD / navigation to mappings (FS-013)
- Deployment actions (Phase 4)
- AI auto-map functionality (Phase 2)
- AI smart fix functionality (Phase 2)
- Backend communication (Phase 1+; all operations use LocalStorageAdapter)
- Schema upload/management within the editor
- Rule undo/redo (potential Phase 2 enhancement)
- Collaborative editing / conflict resolution

---

## Non-Goals

- This spec does not implement guided expression authoring — that is FS-011
- This spec does not implement live data preview — that is FS-012
- This spec does not create mappings from scratch (no "new mapping" wizard) — that is FS-013
- This is not a generic CRUD pattern — it is mapping-rule-specific with engine validation semantics
- This does not define the deployment workflow — deploy badges are read-only status indicators

---

## Relevant Areas

- `ui/src/lib/engine/` — new engine browser integration layer
- `ui/src/features/mappings/` — new feature module (components, hooks, types)
- `ui/src/features/mappings/components/` — MappingEditor, RuleList, RuleRow, RuleForm, DiagnosticPanel, etc.
- `ui/src/features/mappings/hooks/` — useEngineValidation, useMappingEditor, useRuleList
- `ui/src/routes/pages/MappingEditor.tsx` — upgrade from placeholder to feature mount point
- `ui/src/lib/types/domain.ts` — add `description?: string` to `MappingRule` type
- `ui/src/lib/api/types.ts` — ApiAdapter.getMapping(), updateMapping(), getSchema()
- `ui/src/hooks/use-async-state.ts` — used for data loading
- `src/engine/index.ts` — validate() public API (imported by lib/engine/)
- `src/engine/types/results.ts` — ValidationResult, Diagnostic, CoverageResult types
- `forge/architecture/ui-application.md` — architecture update for engine integration pattern

---

## Dependencies / Blockers

- Depends on FS-008 (UI Scaffold & App Shell) — **completed**
- Depends on FS-009 (Schema Tree View) — parsers needed for schema-to-validation pipeline; **in progress**
- Depends on FS-002 through FS-007 (Mapping Engine) — validate() function — **completed**
- Soft dependency on FS-009 parsers: if FS-009 is not merged when T-01 starts, the engine integration can stub schema inputs and add real parser wiring later

---

## Constraints

- Engine runs entirely client-side. No backend call for validation or rule management.
- Must work with `LocalStorageAdapter` (Phase 0).
- Must integrate with FS-008's app shell (routing, layout, shared primitives, adapter context).
- Must use FS-009's schema parsers to parse loaded schemas for validation.
- TypeScript strict mode, zero lint/typecheck errors.
- Tailwind CSS 4 for styling — no CSS modules, no styled-components.
- No external state management library. Use `useState`/`useReducer` for editor state.
- Validation debounce: 300ms after last change. Do not block the UI during validation.
- Desktop-first: 1280px+ target, 1024px minimum.
- Drag-and-drop uses `@dnd-kit/core` + `@dnd-kit/sortable`. Keyboard accessibility is provided by `@dnd-kit`'s built-in keyboard sensor.
- Performance: validate 500 rules in < 1 second; render 500 rules smoothly; save in < 500ms.
- Engine imported via `@keyra/engine` path alias (Vite + tsconfig). No pre-build step. Verify tree-shaking and bundle size impact.

---

## Proposed Behavior

### User Flow

1. **Navigate to editor** — User arrives at `/projects/:projectId/mappings/:mappingId`. The page loads the MappingConfig and associated schemas.
2. **View rules** — The rule list displays all existing rules with target path, expression preview, type badge, and validation status icon.
3. **Validation runs** — On load (after schemas are available), `validate()` runs and decorates each rule with its status. A summary bar shows counts.
4. **Add a rule** — User clicks "Add Rule". A form appears for target path and expression. On save, the rule is appended and validation re-runs.
5. **Edit a rule** — User clicks a rule row. An inline edit mode or detail panel opens. User modifies target, expression, or description. Changes trigger validation.
6. **Delete a rule** — User clicks delete on a row. A confirmation appears. On confirm, the rule is removed and validation re-runs.
7. **Reorder rules** — User drags a rule to a new position (or uses keyboard shortcuts). Validation re-runs.
8. **Bulk operations** — User selects multiple rules via checkboxes. A bulk action bar appears. User can delete, duplicate, or copy the selection.
9. **View diagnostics** — User clicks a diagnostic icon on a rule. A detail section expands showing all diagnostics (code, severity, message, expression location).
10. **Save** — User clicks "Save" or presses Ctrl+S. The config persists via adapter with incremented version. Save status updates.
11. **Navigate away** — If unsaved changes exist, browser `beforeunload` fires a warning.

### System Behavior

**Engine integration layer (`ui/src/lib/engine/`):**
- Re-exports `validate` and `execute` from the engine via `@keyra/engine` path alias
- Path alias configured in `vite.config.ts` (`resolve.alias`) and `tsconfig.json` (`paths`) pointing to `../../src/engine/index.ts`
- Vite handles `.js` extension resolution in engine internal imports and TS transpilation natively — no pre-build step
- The engine self-initializes its function registry on import (via `registerAllFunctions(defaultRegistry)` in `src/engine/index.ts`)
- No additional setup needed beyond import
- If path alias causes issues (unlikely), fallback: pnpm workspace package with `"main": "src/engine/index.ts"`

**Schema data flow for validation:**
- `SchemaDetail.content` is loaded from adapter (JSON object or XML string)
- For JSON schemas: pass the raw JSON object directly to `validate()` — the engine builds its own `SchemaTree` internally
- For XSD schemas: the engine's XSD adapter returns a permissive stub (per `mapping-engine.md`); pass whatever format the engine accepts
- The FS-009 `ParsedSchema` output is for the UI tree view only — it is **not** passed to the engine
- Both the UI tree parsers and the engine are parallel consumers of the same raw `SchemaDetail.content`

**`useEngineValidation()` hook:**
```typescript
function useEngineValidation(
  config: MappingConfig | null,
  sourceSchema: object | null,
  targetSchema: object | null
): {
  result: ValidationResult | null;
  isValidating: boolean;
  diagnosticsForRule(ruleIndex: number): Diagnostic[];
  coveragePercent: number;
  summary: { total: number; valid: number; warnings: number; errors: number };
}
```
- Debounces validation calls by 300ms after config/schema changes
- Skips validation if config or either schema is null (shows "Attach schemas" message)
- Returns per-rule diagnostic lookup and summary statistics
- Uses `useRef` for debounce timer to avoid stale closures

**Rule type inference:**
| Outermost function | Display label |
|---|---|
| `source("...")` | Direct Copy |
| `static(...)` | Static Value |
| `if(...)` | Conditional |
| `valueMap(...)` | Lookup |
| `map(...)` / `filter(...)` | Array |
| `concat(...)`, `upper(...)`, `formatDate(...)`, etc. | Transform |
| Empty expression | Not configured |

Inference is display-only. It parses only the first token/function name of the expression — it does not run the full parser.

**Save flow:**
1. User triggers save (button or Ctrl+S)
2. Current config snapshot is taken
3. Version is incremented (config.version + 1)
4. `adapter.updateMapping(mappingId, updatedConfig)` is called
5. On success: save status → "Saved", last-saved snapshot updated
6. On failure: error notification shown, local state preserved, save status → "Save failed"

**Unsaved changes detection:**
- On load, store the initial config as "last saved" reference
- On every rule mutation, compare current config to last-saved (deep equality on `rules` array)
- If different: show "Unsaved changes" in top bar, register `beforeunload` handler
- If same: clear unsaved indicator, remove `beforeunload` handler

### Failure / Edge Behavior

- **Schema not attached:** If `sourceSchemaRef` or `targetSchemaRef` points to a non-existent schema, validation is skipped and a message shows "Attach source and target schemas to enable validation."
- **Schema parse failure:** If FS-009 parser throws on loaded schema content, validation is skipped. Error shown in validation summary area.
- **Engine validate() throws unexpectedly:** Catch at hook level, show error in summary bar ("Validation failed — internal error"), do not crash component.
- **Save failure:** Error notification with "Retry" action. Local state not lost. User can continue editing and retry save.
- **Load failure:** Error state with "Retry" action. No partial rendering of stale data.
- **Invalid paste data:** If clipboard content is not valid rule JSON, show error toast ("Invalid rule data in clipboard").
- **Duplicate target paths:** `validate()` emits `KEYRA-W` warning — shown as yellow warning icon on affected rules.
- **Empty expression in new rule:** Allowed (shows "Not configured" type). Validation may emit warnings depending on target required status.
- **500+ rules:** List must render without jank. Virtualization allowed but not required at this threshold (test empirically).
- **Concurrent mutation during save:** Not possible in Phase 0 (single user, localStorage). No conflict resolution needed.

---

## Acceptance Examples

### AE-01 — Load and display a mapping with rules

**Given**
- A `MappingConfig` stored in LocalStorageAdapter with ID "mapping-1", name "Order Transform", version 3
- Config has 5 rules: `Order.Header.DocType` ← `static("PO")`, `Order.Header.Date` ← `source("orderDate")`, `Order.Lines` ← `map(source("items"), ...)`, etc.
- Source and target schemas exist and are loadable

**When**
- User navigates to `/projects/proj-1/mappings/mapping-1`

**Then**
- Top bar shows: name "Order Transform", version "v3", save status "Saved", schema names displayed
- Rule list shows 5 rows with correct target paths, expression previews, type badges ("Static Value", "Direct Copy", "Array", etc.)
- Validation runs automatically after schemas load
- Each rule shows green/yellow/red validation icon
- Summary bar shows: "5 rules | 4 valid | 1 warning | 0 errors | 80% coverage"

### AE-02 — Add a new rule

**Given**
- A mapping is loaded with 3 existing rules

**When**
- User clicks "Add Rule"
- User enters target path: `Order.Header.Priority`
- User enters expression: `static("Normal")`
- User saves the rule

**Then**
- Rule is appended as the 4th entry in the list
- Type badge shows "Static Value"
- Validation runs (debounced)
- Validation icon shows green checkmark if expression is valid
- Save status shows "Unsaved changes"
- Summary bar updates: "4 rules | ..."

### AE-03 — Edit an existing rule

**Given**
- A mapping with a rule at index 2: target `Order.Header.Status`, expression `static("Draft")`

**When**
- User clicks the rule to enter edit mode
- User changes expression to `if(eq(source("urgent"), true), static("Rush"), static("Normal"))`
- User confirms the edit

**Then**
- Rule expression updates in the list
- Type badge changes from "Static Value" to "Conditional"
- Validation re-runs
- Save status shows "Unsaved changes"

### AE-04 — Delete a rule with confirmation

**Given**
- A mapping with 5 rules

**When**
- User clicks delete on rule at index 3
- Confirmation dialog appears: "Delete rule targeting 'Order.Lines.Quantity'?"
- User confirms

**Then**
- Rule is removed from the list
- Remaining rules shift (4 rules remain, re-indexed)
- Validation re-runs
- Save status shows "Unsaved changes"

### AE-05 — Reorder rules via drag-and-drop

**Given**
- A mapping with rules at indexes 0-4
- Rule at index 4 targets `Order.Footer.Total`

**When**
- User drags rule 4 to position 1

**Then**
- Rule list reorders: former rule 4 is now at index 1
- All other rules shift accordingly
- Validation re-runs (order can affect validation in future target() support)
- Save status shows "Unsaved changes"

### AE-06 — Validation diagnostics display

**Given**
- A mapping with a rule: target `Order.Header.Amount`, expression `source("nonExistentField")`
- Source schema does not have field "nonExistentField"

**When**
- Validation runs after schemas load

**Then**
- Rule shows red error icon
- Clicking the icon expands diagnostic detail showing:
  - Code: "KEYRA-E030"
  - Severity: "error" (red badge)
  - Message: "Source path 'nonExistentField' does not exist in source schema"
- Summary bar shows error count incremented
- Coverage percentage reflects this field as errored (not successfully mapped)

### AE-07 — Save with version increment

**Given**
- A mapping loaded at version 5
- User has made edits (unsaved changes exist)

**When**
- User presses Ctrl+S (or clicks Save)

**Then**
- `adapter.updateMapping()` is called with version 6
- Top bar version updates to "v6"
- Save status changes to "Saved"
- "Unsaved changes" indicator disappears
- `beforeunload` handler is removed

### AE-08 — Empty mapping state

**Given**
- A mapping with zero rules

**When**
- User navigates to the mapping editor

**Then**
- Empty state renders: "No rules yet. Add your first rule to start mapping."
- Prominent "Add Rule" button is visible
- "Auto-Map with AI" placeholder button is visible but non-functional (shows "Coming soon" tooltip)
- Validation summary shows: "0 rules | 0% coverage"

### AE-09 — Bulk delete selected rules

**Given**
- A mapping with 8 rules
- User selects rules at indexes 2, 4, and 6 via checkboxes

**When**
- User clicks "Delete selected" in the bulk action bar
- Confirmation: "Delete 3 selected rules?"
- User confirms

**Then**
- 3 rules are removed; 5 remain
- Bulk action bar disappears (no selection)
- Validation re-runs
- Save status shows "Unsaved changes"

### AE-10 — Validation skipped when schemas missing

**Given**
- A mapping where `sourceSchemaRef.schemaId` points to a schema that does not exist in LocalStorageAdapter

**When**
- Editor loads

**Then**
- Rules render normally (target, expression, type badge)
- Validation icons show neutral/gray state (not validated)
- Summary bar shows: "Attach source and target schemas to enable validation"
- No engine error is thrown

### AE-11 — Copy and paste a rule

**Given**
- A mapping with 3 rules
- Rule at index 1 has target `Order.Header.Currency` and expression `static("USD")`

**When**
- User clicks "Copy rule" action on rule at index 1
- User clicks "Paste rules" action

**Then**
- A duplicate rule is appended at the end (index 3)
- The pasted rule has the same target and expression as the copied rule
- Validation re-runs (may warn about duplicate target)
- Save status shows "Unsaved changes"

### AE-12 — Keyboard reorder alternative

**Given**
- Focus is on a rule row at index 2

**When**
- User activates "Move Up" action (button or keyboard shortcut)

**Then**
- Rule moves from index 2 to index 1
- Focus follows the moved rule
- Validation re-runs
- Screen reader announces new position

---

## Open Questions

_All questions resolved in Rev 2._

### Resolved

- **Q1.** How should the engine package be imported in Vite? → **Direct path alias.** Add `@keyra/engine` alias in `vite.config.ts` and `tsconfig.json` pointing to `src/engine/index.ts`. The engine is pure TypeScript with zero runtime deps — Vite's TS transpilation handles it natively. `.js` extensions in engine imports are a TS module resolution convention that Vite resolves fine. No pre-build step needed. Fallback (unlikely needed): workspace package with `"main"` pointing to source.
- **Q2.** Should the `MappingRule` type include `description`? → **Yes.** Add `description?: string` to the UI `MappingRule` in `domain.ts` to match the engine type. One-line fix done as part of T-01 (or a pre-task patch).
- **Q3.** What format does the engine's `validate()` expect for schemas? → **Raw JSON Schema objects.** The UI loads `SchemaDetail.content` (already a JSON object for JSON schemas), and passes it directly to `validate()`. The engine builds its own `SchemaTree` from it. The FS-009 `ParsedSchema` is a parallel consumer for the UI tree view — not for the engine. They consume the same raw content independently.
- **Q4.** DnD library choice? → **`@dnd-kit/core` + `@dnd-kit/sortable`.** Mandated, not deferred. ~15KB gzipped, actively maintained, built-in keyboard accessibility, handles sortable list pattern out of the box. Building accessible DnD from scratch is a multi-day effort for zero value. Bundle size is negligible next to React + Tailwind.

---

## Task Generation Notes

Decompose into 9 tasks:

1. **T-01: Engine browser integration layer** — Create `ui/src/lib/engine/`, set up Vite import path, re-export `validate` and `execute`, verify bundle works. Create `useEngineValidation()` hook with debounce. Agent: `ui-task`.

2. **T-02: Mapping Editor page shell** — Replace placeholder `MappingEditor.tsx` route page with the multi-panel layout container and top bar. Panels are named placeholders except Panel 3. Agent: `ui-task`.

3. **T-03: Rule list display component** — Build the rule list table/grid showing rules with target path, expression, type badge, validation icon, row number, checkbox. Include validation summary bar. Depends on T-01, T-02. Agent: `ui-task`.

4. **T-04: Rule CRUD operations** — Implement add, edit, delete rule flows with validation triggers. Includes rule form (target path + expression + description), delete confirmation, inline edit mode. Depends on T-03. Agent: `ui-task`.

5. **T-05: Drag-and-drop rule reorder** — Implement drag-and-drop reordering with keyboard alternative (Move Up/Move Down). Depends on T-03. Agent: `ui-task`.

6. **T-06: Multi-select, bulk actions, and copy/paste** — Implement checkbox selection, bulk action bar, copy-to-clipboard, paste-from-clipboard. Depends on T-04. Agent: `ui-task`.

7. **T-07: Save/load and state management** — Implement data loading (config + schemas), save with version increment, unsaved-changes tracking, beforeunload, loading/error states. Depends on T-02, T-03. Agent: `ui-task`.

8. **T-08: Accessibility and keyboard navigation** — Full keyboard nav for rule list, ARIA live regions for validation summary, focus management, screen reader announcements. Depends on T-03, T-04, T-05, T-06. Agent: `ui-task`.

9. **T-09: Update ui-application.md architecture** — Document the engine integration pattern, useEngineValidation hook, and Mapping Editor panel layout architecture. Agent: `task`.

Parallelization:
- T-01 and T-02 are independent (can run in parallel)
- T-03 depends on T-01 + T-02
- T-04 and T-05 depend on T-03 (can run in parallel with each other)
- T-06 depends on T-04
- T-07 depends on T-02 + T-03
- T-08 depends on T-03 + T-04 + T-05 + T-06 (runs last for UI tasks)
- T-09 depends on T-01 (architecture emerges from engine integration decisions)

---

## Change Log

- Rev 2 — 2026-05-01
  - Resolved all open questions (Q1–Q4); moved to Resolved section
  - Q1: Engine imported via `@keyra/engine` path alias — no pre-build
  - Q2: `description?: string` added to UI `MappingRule` type (confirmed)
  - Q3: Engine receives raw JSON Schema objects from `SchemaDetail.content` directly; FS-009 ParsedSchema is for UI only
  - Q4: `@dnd-kit/core` + `@dnd-kit/sortable` mandated (not deferred)
  - Updated Assumptions with all resolved decisions
  - Updated Constraints with DnD library and engine import details
  - Updated System Behavior with schema data flow and engine import specifics
  - Bumped revision to Rev 2
- Rev 1 — 2026-05-01
  - Initial draft

