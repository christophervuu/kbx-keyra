# SPEC

## Title

Mapping Editor — Configuration Panel (Panel 7)

---

## ID

FS-017

---

## Metadata

Owner: @keyra-ui-team
Reviewers: TBD
Created: 2026-05-02
Last Updated: 2026-05-02
Type: ui

---

## Status

completed

---

## Revision

Rev: 2

---

## Summary

Build Panel 7 of the Mapping Editor — the configuration panel where users manage mapping-level behaviors: unmapped targets strategy, null-out subtrees, constants, and external sources. These settings write to `MappingConfig.config` (the `MappingConfigOptions` object) and are consumed by the engine's `validate()` and `execute()` pipelines. Without this panel, users can author rules but cannot configure the mapping-level behaviors those rules depend on.

---

## Problem

Users can currently author mapping rules (FS-010) and expressions (FS-011) in the Mapping Editor, but there is no UI surface for configuring mapping-level settings. The `MappingConfigOptions` fields — `unmappedTargets`, `nullSubtrees`, `constants`, and `externalSources` — have no editor. This means:

- Users cannot control what happens to unmapped target fields.
- Users cannot bulk-null subtrees.
- Users cannot define constants referenced by `constant("KEY")` expressions.
- Users cannot declare external sources referenced by `external("name")` expressions.
- Validation errors (KEYRA-E011, KEYRA-E012) appear for constant/external references but users have no way to resolve them through the UI.

---

## Goal

A fully functional Configuration Panel (Panel 7) in the Mapping Editor that:

- Lets users select the unmapped targets strategy (null, omit, error)
- Lets users manage a list of null-out subtree paths with target schema autocomplete
- Lets users manage a key-value table of constants
- Lets users manage a list of declared external source names
- Triggers `validate()` on every config change so diagnostics update immediately
- Integrates with the existing save flow (config changes are part of MappingConfig and mark the editor as "unsaved")
- Establishes the settings inheritance indicator pattern for Phase 1+ project defaults

---

## Assumptions

- FS-010 (Rule Editor) is complete — `useMappingEditor` hook, validation wiring, save flow all exist
- FS-009 (Schema Tree View) is complete — target schema parsed tree available for path autocomplete
- FS-008 (UI Scaffold) is complete — shared primitives, adapter, routing available
- The `MappingConfigOptions` type in `ui/src/lib/types/domain.ts` already has all required fields: `unmappedTargets`, `nullSubtrees`, `constants`, `externalSources` (all optional)
- The engine `MappingConfigBlock` type in `src/engine/types/config.ts` uses the same field names (structurally compatible)
- `useEngineValidation()` already re-validates when the config changes (it accepts the full `MappingConfig` object, including config options)
- Panel 7 slot exists in the `MappingEditorPage` grid layout at `data-testid="panel-slot-7"`
- No project settings inheritance exists in Phase 0 — all config values are mapping-level. The inheritance UI pattern is established visually for Phase 1.

---

## Current Context

The Mapping Editor (`ui/src/features/mappings/`) currently provides:

- `MappingEditorPage` — multi-panel grid with 8 named slots; Panel 7 currently renders `PanelPlaceholder` labeled "AI Assist (Panel 7)" — to be fully replaced by ConfigurationPanel (AI Assist will be a floating overlay in Phase 2, not a fixed panel)
- `useMappingEditor(mappingId)` — orchestration hook that loads config, manages local rule state, tracks unsaved changes (rules only), saves via adapter, wires `useEngineValidation()`
- `useEngineValidation()` — debounced validation hook accepting `MappingConfig | null` and schemas
- `validationConfig` in `useMappingEditor` is derived as `{ ...config, rules }` — it includes the config options from the loaded MappingConfig but does not currently support local config option mutations

Key gaps requiring extension:

1. `useMappingEditor` has no `updateConfig` action — only rule mutations are supported
2. `hasUnsavedChanges` compares only `rules` (via `rulesEqual`) — config option changes are not tracked
3. The save flow spreads rules into the config but does not account for locally mutated config options
4. Panel 7 slot has no content prop — it renders the placeholder directly (unlike Panels 1, 3, 4, 5 which have slot props)

The `MappingConfigOptions` interface already exists with all fields:

```typescript
export interface MappingConfigOptions {
  readonly unmappedTargets?: 'omit' | 'null' | 'error';
  readonly nullSubtrees?: readonly string[];
  readonly constants?: Readonly<Record<string, unknown>>;
  readonly externalSources?: readonly string[];
}
```

---

## Scope

### In Scope

- Extend `useMappingEditor` to support config option mutations (`updateConfig` action)
- Extend unsaved-changes detection to include config options (not just rules)
- Extend save flow to persist locally-mutated config options
- Configuration Panel component with section layout
- Unmapped targets strategy section: radio group selecting null/omit/error
- Null-out subtrees section: list with add (autocomplete from target schema paths), remove, display child count
- Constants section: key-value table with add, inline edit, delete
- External sources section: list with add, remove
- Settings inheritance indicator pattern (visual only in Phase 0 — all show as mapping-level)
- "Reset to project default" action (no-op / disabled in Phase 0, UI pattern established)
- Confirmation dialogs for destructive actions (remove subtree, delete constant, remove external source)
- Wire ConfigurationPanel into MappingEditorPage Panel 7 slot
- All config changes trigger `validate()` via existing `useEngineValidation()` hook
- Config changes mark editor as "unsaved" — same save behavior as rule edits

### Out of Scope

- Project settings page / project-level defaults (Phase 1)
- Actual inheritance resolution from project to mapping (Phase 1)
- Undo/redo for config changes
- Import/export of config settings
- Batch/template application of config across multiple mappings
- AI-assisted configuration suggestions
- Panel 7 resize or detach behavior

---

## Non-Goals

- This spec does not implement project-level settings or inheritance resolution — only the visual pattern
- This spec does not change the engine's validate/execute behavior — it only provides UI access to existing engine inputs
- This spec does not introduce new config fields beyond what `MappingConfigOptions` already defines
- This spec does not implement runtime external source resolution — external sources return null in client-side preview (FS-012 responsibility)

---

## Relevant Areas

- `ui/src/features/mappings/hooks/use-mapping-editor.ts` — extend with config mutation support
- `ui/src/features/mappings/components/` — new ConfigurationPanel component and sub-components
- `ui/src/features/mappings/components/MappingEditorPage.tsx` — add Panel 7 slot prop, update panel name
- `ui/src/features/mappings/index.ts` — export new components
- `ui/src/lib/types/domain.ts` — verify `MappingConfigOptions` has all needed fields (already does)
- `ui/src/features/schemas/` — `ParsedSchema` / `SchemaTreeNode` types for path autocomplete
- `ui/src/features/mappings/hooks/use-engine-validation.ts` — consumed (no changes expected)
- `forge/architecture/ui-application.md` — update to document config mutation pattern

---

## Dependencies / Blockers

- Depends on FS-008 (UI Scaffold) — **completed**
- Depends on FS-009 (Schema Tree View) — target schema `ParsedSchema` needed for null-subtree path autocomplete — **completed**
- Depends on FS-010 (Rule Editor) — `useMappingEditor`, `useEngineValidation`, save flow, `MappingEditorPage` shell — **completed**

---

## Constraints

- No backend dependency. Config stored in `LocalStorageAdapter` as part of `MappingConfig`.
- Must integrate with FS-010's editor state (same `MappingConfig` object, same save flow, same validation hook).
- Must trigger `validate()` on config changes (reuses `useEngineValidation()` from FS-010).
- TypeScript strict mode, zero lint/typecheck errors.
- Tailwind CSS 4 for styling.
- No external state management library (`useState`/`useReducer` only).
- Desktop-first: 1280px+ target, 1024px minimum.
- Panel 7 lives in the bottom row of the editor grid (existing slot dimensions).
- Validation debounce: reuses existing 300ms debounce in `useEngineValidation()`.

---

## Proposed Behavior

### User Flow

1. **Access config panel** — User navigates to the Mapping Editor. Panel 7 shows in the bottom row (currently labeled "Configuration"). User can see config settings when the panel is visible.
2. **Set unmapped targets strategy** — User selects "null", "omit", or "error" from the radio group. Validation re-runs immediately. If "error" is selected and unmapped fields exist, new diagnostics appear in Panel 3/6.
3. **Add null-out subtree** — User types or autocompletes a target path (object-type nodes from target schema). Path is added to the list. Validation re-runs.
4. **Remove null-out subtree** — User clicks X on a subtree entry. Confirmation dialog: "Remove subtree null-out for 'path'?" On confirm, entry is removed. Validation re-runs.
5. **Add constant** — User enters a key name (uppercase convention suggested via placeholder) and a value. Value type is inferred (number if numeric, boolean if "true"/"false", otherwise string). Constant is added to the table. Validation re-runs (any rules referencing this constant now resolve).
6. **Edit constant** — User clicks a constant row to edit key or value inline. On blur/enter, the change commits. Validation re-runs.
7. **Delete constant** — User clicks X on a constant. Confirmation: "This constant may be referenced by rules. Removing it will cause validation errors." On confirm, constant is deleted. Validation re-runs (rules referencing it now get KEYRA-E011).
8. **Add external source** — User enters a source name and clicks add. Name appears in the list. Validation re-runs.
9. **Remove external source** — User clicks X on an external source. Confirmation dialog. On confirm, source is removed. Validation re-runs.
10. **Save** — User clicks Save or presses Ctrl+S. All config changes (including config options) persist as part of the MappingConfig. Version increments.
11. **Settings inheritance indicators** — Each section shows either "Using project default" (gray) or "Custom" (blue badge). In Phase 0, all settings show as mapping-level ("Custom" when set, no indicator when using default/empty value). A "Reset to project default" button is visible but non-functional in Phase 0.

### System Behavior

**Config mutation flow:**

1. User changes a config field in the panel
2. `updateConfig(partial)` action is called on `useMappingEditor`
3. Local config state is updated with the new config options
4. `validationConfig` memo recomputes (includes new config options)
5. `useEngineValidation()` receives the updated config and re-validates (debounced 300ms)
6. `hasUnsavedChanges` detects the config differs from last-saved state
7. Save status shows "unsaved"
8. On save, the full config (including mutated options) persists to adapter

**Autocomplete for null-subtree paths:**

- Derives available paths from `parsedTargetSchema` (already exposed by `useMappingEditor`)
- Filters to object-type nodes only (nodes that have children in the schema tree)
- Displays matching paths as user types
- Prevents duplicate entries

**Constant value type inference:**

- If value matches `/^-?\d+(\.\d+)?$/` → store as number
- If value is `"true"` or `"false"` (case-insensitive) → store as boolean
- Otherwise → store as string
- Display shows inferred type as a subtle badge next to the value

**Validation triggers:**

All config changes flow through the existing `useEngineValidation()` pipeline:
- `config.unmappedTargets` change → coverage/error calculations update
- `config.nullSubtrees` change → coverage may change (subtree paths excluded/included)
- `config.constants` change → KEYRA-E011 errors resolve or appear
- `config.externalSources` change → KEYRA-E012 errors resolve or appear

### Failure / Edge Behavior

- **Empty config** — On first load, if `config.config` has no explicit values (all undefined), the panel shows default states: unmapped targets = "null" (engine default), empty subtrees list, empty constants table, empty external sources list.
- **Invalid subtree path** — If user enters a path that doesn't exist in the target schema, display a warning but allow it (schema may change; path is stored as-is). Autocomplete helps but doesn't restrict.
- **Duplicate constant key** — Prevent adding a constant with a key that already exists. Show inline error "Key already exists".
- **Empty constant key** — Prevent adding a constant with an empty key. Add button disabled until key is non-empty.
- **Empty external source name** — Prevent adding an empty name. Add button disabled until name is non-empty.
- **Duplicate external source** — Prevent adding a source name that already exists. Show inline error "Source already declared".
- **Target schema not loaded** — Subtree path autocomplete shows no suggestions. Manual path entry still works.
- **Large constant values** — Values are stored as-is. No size limit in Phase 0. Display truncates long values in the table cell.

---

## Acceptance Examples

### AE-01 — Select unmapped targets strategy

**Given**
- A mapping is loaded with `config.unmappedTargets` currently undefined (defaulting to "null")
- Target schema has 10 required fields, 7 are mapped by rules

**When**
- User selects "error" from the unmapped targets radio group

**Then**
- `config.unmappedTargets` is set to `"error"`
- Validation re-runs (debounced)
- 3 new error diagnostics appear for the unmapped required fields
- Save status shows "Unsaved changes"
- Summary error count increases by 3

### AE-02 — Add and remove null-out subtree

**Given**
- A mapping with a target schema that has an object node at path `Order.Header.ShipTo` with 4 child fields
- `config.nullSubtrees` is currently empty

**When**
- User types "Order.Header.ShipTo" in the subtree input (autocomplete suggests it)
- User confirms the selection

**Then**
- "Order.Header.ShipTo" appears in the subtrees list with "4 child fields" annotation
- Validation re-runs
- Save status shows "Unsaved changes"

**When** (continued)
- User clicks X on the "Order.Header.ShipTo" entry
- Confirmation appears: "Remove subtree null-out for 'Order.Header.ShipTo'?"
- User confirms

**Then**
- Entry is removed from the list
- Validation re-runs
- If no other changes remain, save status reflects accordingly

### AE-03 — Add, edit, and delete constants

**Given**
- A mapping with no constants defined
- A rule exists with expression `constant("TAX_RATE")`

**When**
- User adds a constant: key = "TAX_RATE", value = "0.08"

**Then**
- Constant appears in table: key "TAX_RATE", value `0.08`, type badge "number"
- Validation re-runs
- KEYRA-E011 error for "TAX_RATE" reference resolves (disappears from diagnostics)
- Save status shows "Unsaved changes"

**When** (continued)
- User edits the value to "0.10"

**Then**
- Table updates with new value
- Validation re-runs (no new errors — constant still exists)

**When** (continued)
- User deletes the "TAX_RATE" constant
- Confirmation: "This constant may be referenced by rules. Removing it will cause validation errors."
- User confirms

**Then**
- Constant removed from table
- Validation re-runs
- KEYRA-E011 error reappears for the rule referencing `constant("TAX_RATE")`

### AE-04 — Manage external sources

**Given**
- A mapping with no external sources declared
- A rule exists with expression `external("taxRates")`

**When**
- User adds external source name: "taxRates"

**Then**
- "taxRates" appears in the list with note: "External sources are resolved at runtime. In client-side preview, external sources return null."
- KEYRA-E012 error for "taxRates" reference resolves
- Save status shows "Unsaved changes"

**When** (continued)
- User removes "taxRates" (with confirmation)

**Then**
- Entry removed
- KEYRA-E012 error reappears

### AE-05 — Config changes persist on save

**Given**
- A mapping loaded at version 4
- User has changed unmapped targets to "omit", added constant "VERSION" = "2.0", added external source "lookup"

**When**
- User presses Ctrl+S

**Then**
- `adapter.updateMapping()` is called with version 5 and config options:
  - `unmappedTargets: "omit"`
  - `constants: { VERSION: "2.0" }`
  - `externalSources: ["lookup"]`
- Top bar version updates to "v5"
- Save status changes to "Saved"

### AE-06 — Settings inheritance indicator (Phase 0)

**Given**
- A mapping with `config.unmappedTargets` set to "error" (overridden from default)
- `config.constants` is empty (not overridden)

**When**
- Panel 7 renders

**Then**
- Unmapped targets section shows "Custom" badge (blue)
- Constants section shows "Using project default" (gray text) or no inheritance indicator (since empty = default in Phase 0)
- "Reset to project default" button is visible on overridden sections

**When** (continued)
- User clicks "Reset to project default" on unmapped targets

**Then**
- In Phase 0: `config.unmappedTargets` is set to `undefined` (reverts to engine built-in default "null"). This preserves distinguishability: `undefined` = "not configured" vs explicit `"null"` = "user chose null".
- Validation re-runs (using engine default behavior)
- Inheritance indicator changes to "Using project default"

### AE-07 — Duplicate prevention

**Given**
- A mapping with constant "API_KEY" already defined
- External source "pricing" already declared

**When**
- User tries to add constant with key "API_KEY"

**Then**
- Inline error: "Key already exists"
- Add button remains disabled

**When**
- User tries to add external source "pricing"

**Then**
- Inline error: "Source already declared"
- Add button remains disabled

### AE-08 — Validation auto-triggers on every config change

**Given**
- A mapping with 5 rules, schemas loaded, validation currently showing 0 errors

**When**
- User changes unmapped targets from "null" to "error"

**Then**
- Within 300ms, validation re-runs
- New error diagnostics appear for unmapped required target fields
- Panel 3 rule validation icons update
- Summary bar error count updates

---

## Resolved Questions

- `Q1.` **Configuration Panel replaces the AI Assist placeholder entirely.** AI Assist (Phase 2) will likely be a floating overlay / command palette / contextual buttons throughout the editor — not a fixed panel slot. Configuration is a fixed panel because users set it once and revisit occasionally. Different interaction pattern = different UI treatment. Kill the placeholder, give Panel 7 fully to Configuration.
- `Q2.` **Clear to `undefined`.** The engine already has built-in defaults (`unmappedTargets` defaults to `"null"` when the field is absent from config). Setting it to `undefined` means "use engine default" — which is the semantically correct representation of "not overridden." If you explicitly store `"null"`, you lose the ability to distinguish "user chose null" from "user hasn't configured this." Keep them distinguishable.

---

## Verification Strategy

- **Unit tests (Vitest + React Testing Library):**
  - `useMappingEditor` config mutation actions (updateConfig, hasUnsavedChanges for config, save with config) — AE-05
  - ConfigurationPanel renders all sections correctly
  - Unmapped targets radio group changes state — AE-01
  - Null subtrees list CRUD operations — AE-02
  - Constants table CRUD with type inference — AE-03
  - External sources list CRUD — AE-04
  - Duplicate prevention logic — AE-07
  - Inheritance indicator rendering — AE-06
  - Confirmation dialogs appear for destructive actions

- **Integration tests:**
  - Config changes trigger validation re-run — AE-08
  - Full flow: change config → validation updates → save persists — AE-05

- **Build verification:**
  - `tsc --noEmit` passes (TypeScript strict)
  - `pnpm lint` passes (ESLint zero errors)
  - `pnpm build` succeeds in `ui/`

---

## Task Generation Notes

Decompose into 7 tasks:

1. **T-01: Extend useMappingEditor with config mutation support** — Add `updateConfig` action, extend unsaved-changes detection to include config options, extend save to persist config option mutations. This is the data-layer prerequisite for all panel UI. Agent: `ui-task`.

2. **T-02: Build ConfigurationPanel shell with section layout** — Create the main `ConfigurationPanel` component with section containers for each config area, inheritance indicator pattern, and scroll behavior within the Panel 7 slot. Agent: `ui-task`.

3. **T-03: Implement Unmapped Targets Strategy section** — Radio group with null/omit/error options, connected to `updateConfig`, with inheritance indicator. Agent: `ui-task`.

4. **T-04: Implement Null-out Subtrees section** — List with add (text input + autocomplete from target schema object paths), remove with confirmation, child field count annotation. Agent: `ui-task`.

5. **T-05: Implement Constants key-value editor** — Table with add row (key + value inputs), inline edit, delete with confirmation, type inference badge. Agent: `ui-task`.

6. **T-06: Implement External Sources list** — List with add input, remove with confirmation, runtime resolution note. Agent: `ui-task`.

7. **T-07: Integrate ConfigurationPanel into MappingEditorPage** — Add `configPanelContent` slot prop to `MappingEditorPage`, wire `ConfigurationPanel` at page composition level with config state and parsed target schema, update panel name constant from "AI Assist" to "Configuration". Update `ui-application.md` with config panel pattern. Agent: `ui-task`.

Dependency chain:
- T-01 is the data-layer prerequisite — all other tasks depend on it
- T-02 is the structural shell — T-03, T-04, T-05, T-06 depend on it
- T-03, T-04, T-05, T-06 can run in parallel (each section is independent)
- T-07 depends on T-01 + T-02 (integration wiring); can run in parallel with T-03–T-06 or after

---

## Change Log

- Rev 2 — 2026-05-02
  - Resolved all Open Questions (Q1–Q2) with definitive answers
  - Q1: Configuration Panel fully replaces AI Assist placeholder; AI Assist moves to floating overlay in Phase 2
  - Q2: "Reset to project default" clears to `undefined` (engine built-in default), not explicit `"null"` — preserves distinguishability
  - Renamed section from "Open Questions" to "Resolved Questions"
- Rev 1 — 2026-05-02
  - Initial draft
