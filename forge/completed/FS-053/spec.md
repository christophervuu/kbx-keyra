# SPEC

## Title

Refresh Function Parameter UI — Intent-Based Input Modes in Mapping Editor

---

## ID

FS-053

---

## Metadata

Owner: @chris
Reviewers: TBD
Created: 2026-05-14
Last Updated: 2026-05-14
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Redesign the function parameter editing experience in the Mapping Editor to replace the current implementation-oriented mode model (source/literal/expression) with an intent-based model (Source/Static/Item/Options/Expression). The redesign makes the selected function editor feel like a primary editing workspace (full-width, less visual nesting), removes redundant controls, introduces a clean Options mode for parameters with predefined values, improves empty string handling, and demotes Expression to a secondary/advanced path. The result is a reusable `ParameterValueInput` component that works across function parameters, direct mapping contexts, and array/item-based scopes.

---

## Problem

The current function parameter UI (`ArgumentSlotInput`) presents several UX issues that increase cognitive load and slow down non-technical mapping authors:

1. **Constrained layout.** The selected function editor (rendered inside `ChainStepCard` or `TransformStepForm`) does not use the full width of its parent container. The accordion card styling and nested padding make it feel secondary rather than being the primary editing workspace.

2. **Redundant close/X control.** The `ChainStepCard` header includes an X/remove button that is contextually confusing when the user just wants to change which function is configured. The `NestedFunctionBuilder` has a "Change" button alongside the function name — but the pattern is inconsistent across surfaces.

3. **Implementation-oriented mode model.** `ArgumentSlotInput` exposes three modes via a segmented toggle: `source`, `literal`, `expression`. These labels map to internal DSL concepts rather than user intent. "Literal" is not how a business user thinks about entering a static value. "Expression" is shown as a peer to common operations even though it's an advanced escape hatch.

4. **No dedicated Options mode.** Functions like `formatDate()` have parameters with well-known predefined values (ISO8601, YYYY-MM-DD, etc.) handled through the `PARAMETER_HINTS` registry. Currently these render as a dropdown variant of "literal" mode — the hint-driven dropdown appears inside the literal tab with no distinct affordance. Users must already be in literal mode to see it.

5. **Empty string friction.** String parameters require the user to either type quotes or leave the field empty with no clear distinction between "not yet provided" and "intentionally empty." The current implementation treats an empty literal input as an empty string at the DSL level, but the UI does not communicate this intent clearly.

6. **Expression shown as primary.** The `expression` mode toggle option is always visible in the segmented control, taking up space and introducing an advanced concept before users need it.

---

## Goal

After this change:

1. The selected function parameter editor uses the full available width of its container and feels like the primary editing surface.
2. Parameter input modes use intent-based labels that match how business users think about values: Source (from data), Static (fixed value), Options (pick from known values), Item (array context), Expression (advanced).
3. Expression authoring is available but accessed via a secondary/advanced affordance, not a primary tab.
4. Parameters with predefined values display those values through a dedicated Options mode with clear interaction (chips/selectable list).
5. Empty string handling is user-friendly: empty input in Static mode is treated as empty string, with a visual affordance to distinguish "not yet filled" from "intentionally blank."
6. A shared `ParameterValueInput` component enables reuse across all parameter-editing contexts.
7. Non-technical users experience lower cognitive load and faster TTFSM for function configuration.

---

## Assumptions

- The `PARAMETER_HINTS` registry (`parameter-hints.ts`) remains the source of truth for which parameters have predefined values
- The `DSL_FUNCTION_CATALOG` remains the source of truth for parameter metadata (name, type, required, variadic)
- `ArgumentForm` + `ArgumentSlotInput` are the primary surfaces impacted; the legacy `GuidedBuilder` and `ArgumentConfigurator` are not being updated (they are retained for Rules View `ExpressionBuilderPanel`)
- The chain builder (`ChainBuilder.tsx` → `ChainStepCard` → `TransformStepForm` → `ArgumentForm`) is the primary editing surface for scalar field function parameters
- The `SourceCard` → `ArgumentForm` flow is also impacted
- This work can proceed independently of FS-051 (Unified Builder Visual Shell) and FS-052 (Unified Source Field Option Row) but should not contradict their design patterns

---

## Current Context

### ArgumentSlotInput Mode Toggle (Current)

The current mode toggle renders three radio buttons in a segmented control:

```tsx
{(['source', 'literal', 'expression'] as SlotMode[]).map((m) => (
  <button role="radio" aria-checked={currentMode === m} ...>
    {m}
  </button>
))}
```

- `source` → renders a combobox field-path picker
- `literal` → renders either a freeform text input OR a dropdown (when `PARAMETER_HINTS` provides options)
- `expression` → opens a `TransformFunctionPicker` to nest a function

### Parameter Hints (Current)

`parameter-hints.ts` defines two hint types:
- `EnumParameterHint` (strict options: `cast.targetType`)
- `TokenParameterHint` (presets + freeform: `formatDate.inputFormat`, `formatDate.outputFormat`, `dateDiffSeconds.inputFormat`)

When a hint exists, `ArgumentSlotInput` renders a `<select>` dropdown (or combobox for tokens with `allowFreeform`). But this only appears when the user is already in `literal` mode — there is no separate "Options" affordance.

### ChainStepCard Layout (Current)

```
┌── ChainStepCard ─────────────────────────────────┐
│ Header: collapsed summary | expand/collapse | X  │
├──────────────────────────────────────────────────┤
│ Body (expanded):                                  │
│   TransformStepForm                               │
│     └── ArgumentForm                              │
│           └── ArgumentSlotInput (per slot)        │
└──────────────────────────────────────────────────┘
```

The card uses accordion styling with internal padding that reduces effective content width.

### Key Files

- `ui/src/features/mappings/components/ArgumentSlotInput.tsx` (977 lines)
- `ui/src/features/mappings/components/ArgumentForm.tsx` (494 lines)
- `ui/src/features/mappings/components/TransformStepForm.tsx` (248 lines)
- `ui/src/features/mappings/components/ChainStepCard.tsx`
- `ui/src/features/mappings/components/ChainBuilder.tsx`
- `ui/src/features/mappings/components/NestedFunctionBuilder.tsx`
- `ui/src/features/mappings/components/SourceCard.tsx`
- `ui/src/lib/data/parameter-hints.ts` (110 lines)

---

## Scope

### In Scope

1. **New `ParameterValueInput` component** — shared reusable component replacing `ArgumentSlotInput` for mode selection and value entry
2. **Intent-based mode model** — Source, Static, Item (array context), Options (predefined values), Expression (secondary)
3. **Options mode** — dedicated mode for parameters with `PARAMETER_HINTS` entries; renders as selectable chip list or searchable dropdown
4. **Expression as secondary affordance** — demote from primary tab to an "Advanced: Use expression" action
5. **Empty string handling** — clear UX distinction between required-but-empty and intentionally-blank
6. **Layout improvements** — function parameter editor uses full container width; reduce unnecessary nesting/padding in ChainStepCard body
7. **Function header cleanup** — remove redundant X/close from selected function display in applicable surfaces; use consistent "Change function" pattern
8. **ArgumentForm integration** — update `ArgumentForm` to use `ParameterValueInput` instead of `ArgumentSlotInput`
9. **TransformStepForm integration** — ensure transform step forms render with full-width parameter inputs
10. **Backward compatibility** — `ArgumentSlotInput` interface preserved (deprecated) for any remaining consumers; new component has equivalent functionality

### Out of Scope

- Chain model changes (`ChainState`, `ChainStep`, generator, decomposer)
- Changes to the chain builder step list or step picker
- Array builder mode selector or collection editors
- ScalarFieldBuilder / ArrayBuilder unified shell (FS-051 covers this)
- SourceFieldOptionRow unification (FS-052 covers this)
- Rules View `ExpressionBuilderPanel` / legacy `GuidedBuilder` / `ArgumentConfigurator`
- AI features (Suggest/Explain)
- DSL engine changes
- Mobile/responsive layout

---

## Non-Goals

- This is not a full guided builder redesign — it targets specifically the parameter value input experience
- This does not add new DSL functions or parameter types
- This does not change how expressions are generated or parsed at the engine level
- This does not introduce a design system component library — it creates one shared component for parameter input

---

## Relevant Areas

- `ui/src/features/mappings/components/ArgumentSlotInput.tsx`
- `ui/src/features/mappings/components/ArgumentForm.tsx`
- `ui/src/features/mappings/components/TransformStepForm.tsx`
- `ui/src/features/mappings/components/ChainStepCard.tsx`
- `ui/src/features/mappings/components/ChainBuilder.tsx`
- `ui/src/features/mappings/components/NestedFunctionBuilder.tsx`
- `ui/src/features/mappings/components/SourceCard.tsx`
- `ui/src/lib/data/parameter-hints.ts`
- `ui/src/features/mappings/lib/expression-builder-state.ts`
- `ui/src/features/mappings/components/ItemFieldRow.tsx ?`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- none (FS-051 and FS-052 are concurrent but non-blocking — this spec is additive and should integrate cleanly)

---

## Constraints

- Must preserve all existing functional behavior: source selection, literal input, expression nesting, hint-driven dropdowns, variadic slots, condition editors
- Must preserve the `ArgumentSlot` data model in `expression-builder-state.ts` — the new component must emit the same slot shapes
- Must remain compatible with `TransformStepForm`, `SourceCard`, and `ChainBuilder` consumption patterns
- TypeScript strict mode, zero-error lint/typecheck
- No new external dependencies
- Tailwind CSS 4 utility-first styling only
- Desktop-first (1024px minimum)
- Must not break existing tests for `ArgumentForm` and `ArgumentSlotInput` (tests are updated alongside component changes)

---

## Proposed Behavior

### New Mode Model

The `ParameterValueInput` component supports the following modes, displayed conditionally based on context:

| Mode | Label | When Shown | Description |
|------|-------|------------|-------------|
| `source` | Source | Always (non-array context) | Pick a field path from the source schema |
| `static` | Static | Always | Enter a fixed value (text, number, boolean) |
| `item` | Item | Only in array/item context | Pick a field from the current array item |
| `options` | Options | Only when parameter has PARAMETER_HINTS | Select from predefined values |
| `expression` | Expression | Always, but secondary | Nest a function call (advanced) |

### Mode Display Rules

```
Primary modes (shown as segmented toggle):
  - Source (or Item in array context)
  - Static
  - Options (only when hint exists)
  - External (disabled/coming-soon chip with tooltip)

Secondary mode (inline link below toggle, inside the parameter card):
  - "Use advanced expression" → opens expression picker
```

The "Use advanced expression" link is positioned **inline** within the parameter card, directly below the primary mode toggle. It is a contextual escape hatch for that specific parameter — not a card-level footer action. This keeps it close to the thing it affects, supports progressive disclosure, and avoids unnecessary visual weight. A footer/action area would only be warranted if multiple secondary actions are introduced later.

When `item` context is active, `Source` is replaced by `Item` in the primary toggle (not added alongside — the user is either in root source context or item context, not both).

When `options` is available AND the user has not selected another mode, `Options` is the default initial mode (since predefined values represent the most common choice for that parameter).

The `External` chip appears in the mode toggle as a disabled/coming-soon affordance with a tooltip: "External data sources — available in a future release." This maintains consistency with the scalar builder entry-mode pattern (FS-051 AE-11) and preserves the long-term conceptual model without exposing unsupported functionality.

### ParameterValueInput Component API

```tsx
interface ParameterValueInputProps {
  /** Current slot value (same ArgumentSlot shape as today). */
  slot: ArgumentSlot;
  /** Parameter catalog definition. */
  parameter: FunctionCatalogParameter;
  /** User-facing label. */
  label: string;
  /** Optional description text. */
  description?: string;
  /** Predefined options for this parameter (from PARAMETER_HINTS). */
  options?: ParameterOptions;
  /** Source field suggestions. */
  sourceOptions?: readonly SchemaPathEntry[];
  /** Whether this parameter is in an array/item context. */
  isItemContext?: boolean;
  /** Array path for item-context field filtering. */
  arrayPath?: string;
  /** Whether to show the External chip (disabled/coming-soon). Defaults to true. */
  showExternal?: boolean;
  /** Fires when the slot value changes. */
  onSlotChange: (updated: ArgumentSlot) => void;
  /** Optional: fires when this slot should be removed (variadic). */
  onRemove?: () => void;
  /** Placeholder/example text. */
  placeholder?: string;
}

interface ParameterOptions {
  /** Ordered list of predefined values. */
  values: readonly string[];
  /** Whether custom/freeform values are also allowed. */
  allowCustom: boolean;
  /** Display style: 'chips' for small sets, 'dropdown' for larger sets. */
  display: 'chips' | 'dropdown';
}
```

**Component location:** `ui/src/features/mappings/components/ParameterValueInput.tsx` — feature-local initially, designed with a stable prop interface to support later extraction to `ui/src/components/` if consumed by other features.

### User Flow

#### Standard parameter (Source or Static)

1. User adds a transform step (e.g., `replace()`)
2. The step expands, showing parameters: "Find this text" and "Replace with"
3. Each parameter shows a mode toggle: `[Source] [Static]`
4. Default mode is determined by `PARAMETER_PRESENTATION` defaultInputMode (as today)
5. User fills in values; no "expression" concept is visible in the default flow

#### Parameter with predefined values (Options mode)

1. User adds `formatDate()` step
2. "Current date standard" parameter shows mode toggle: `[Source] [Static] [Options]`
3. Options is pre-selected (it is the recommended default when hints exist)
4. Options mode renders a chip list of presets: `ISO8601`, `YYYY-MM-DD`, `MM/DD/YYYY`, etc.
5. User clicks a chip → value is set → slot emits `makeLiteralSlot("ISO8601")`
6. If user wants a custom format, they switch to Static mode and type it
7. Switching from Options to Static preserves any previously entered custom value

#### Parameter with enum hints (strict Options)

1. User adds `cast()` step
2. "Convert to type" parameter shows mode toggle: `[Options]` (only options, since it's a strict enum with no freeform)
3. Chip list: `string`, `number`, `boolean`
4. No Static tab (enum is strict — `allowCustom: false`)

#### Advanced expression usage

1. User is editing a parameter in Source or Static mode
2. Directly below the primary mode toggle (inline within the parameter card), a subtle link appears: "Use advanced expression"
3. Clicking it opens the `TransformFunctionPicker` (same as today's expression mode)
4. Once an expression function is selected, the parameter switches to expression mode
5. The slot renders the nested function form
6. A "Back to simple input" action allows returning to Source/Static (clears expression state)

#### Empty string handling

1. User selects Static mode for a string parameter
2. Input is empty (no text typed)
3. The input placeholder reads: "Leave empty for blank value" (optional params) or "Enter a value…" (required params)
4. For optional params, subtle helper text below the input: "Empty = blank text (empty string)"
5. Validation:
   - If `parameter.required` and user has not interacted with the field: shows "Required" unmet state (same as today)
   - If `parameter.required` and user has interacted (focused then left empty): field is treated as intentionally blank; helper text "Leave blank to use an empty string" clarifies intent; no separate control needed
   - If `!parameter.required` and input is empty: this is valid — treated as intentional empty string
6. No quotes are needed — the system handles serialization
7. For required parameters: an untouched field remains in the "unmet required" state. Once the user interacts with the field (focuses and leaves empty), the empty value is treated as an intentional empty string. Helper text can clarify: "Leave blank to use an empty string." No checkbox or chip needed — interaction state distinguishes "unset" from "intentionally blank."

### Layout Changes

#### ChainStepCard expanded body

**Before:** Body has `px-3 py-3` padding + `TransformStepForm` with its own `space-y-3` + `ArgumentForm` with `space-y-2` → effectively ~12px left padding from card edge to input content.

**After:** Reduce nested padding. The expanded body uses `px-0 py-3` and `ArgumentForm` parameters render edge-to-edge within the card body (only the card's own padding applies). This makes the parameter inputs feel like primary content, not nested secondary controls.

#### Function header in TransformStepForm

**Before:** `ArgumentForm` renders a function header (`functionName + description`) unless `hideFunctionHeader` is set. `TransformStepForm` already sets `hideFunctionHeader` since the `ChainStepCard` header shows the function name.

**After:** No change needed for header — `hideFunctionHeader` is already used correctly. However, the `ChainStepCard` header X/remove button is recontextualized:
- The X button on `ChainStepCard` means "remove this step from the chain" — this is correct and should remain
- The confusion was about the *function change* affordance: currently there is a `ChevronDown` that allows changing the function within `TransformStepForm`. This should be retained as the clear "change function" mechanism.
- The X button is clearly a "remove step" action and is relabeled with `aria-label="Remove step"` (already done)

#### NestedFunctionBuilder header

**Before:** Shows "Function: functionName()" with a "Change" button.

**After:** This pattern is already clean. No X/close to remove — just a "Change" text button. This is the reference pattern. Surfaces that use X/close for function switching should adopt this "Change function" pattern instead.

### System Behavior

#### Mode → ArgumentSlot mapping

| Mode | Slot emitted |
|------|-------------|
| Source | `makeSourceSlot(path)` |
| Static | `makeLiteralSlot(value)` |
| Item | `makeExpressionSlot({ functionName: 'item', slots: [makeLiteralSlot(path)] })` |
| Options | `makeLiteralSlot(selectedOption)` |
| Expression | `makeExpressionSlot({ functionName, slots })` |

This mapping preserves full backward compatibility with the existing `ArgumentSlot` discriminated union.

#### Options mode resolution

When rendering a `ParameterValueInput`:
1. Look up `getParameterHint(functionName, parameterName)`
2. If hint exists:
   - `type === 'enum'` → Options mode with `allowCustom: false`, `display: values.length <= 5 ? 'chips' : 'dropdown'`
   - `type === 'tokens'` → Options mode with `allowCustom: hint.allowFreeform ?? true`, `display: presets.length <= 6 ? 'chips' : 'dropdown'`
3. If no hint → no Options mode in toggle

#### Context awareness (Item mode)

`ParameterValueInput` receives `isItemContext` from the parent form. When true:
- `Source` label is replaced by `Item`
- The source field picker shows item-scoped fields (filtered by `arrayPath`)
- The slot output wraps in `item()` DSL call (via `makeExpressionSlot`)

This mirrors the existing `buildArrayItemFieldOptions()` logic in `ArgumentSlotInput` but makes it an explicit mode rather than implicit behavior.

### Failure / Edge Behavior

1. **No source schema loaded:** Source/Item mode renders an empty field with placeholder text. No suggestions list. User can type a path manually.

2. **Parameter hint not found:** Options mode is not shown. Only Source + Static (+ Expression secondary) appear.

3. **Switching from Options to Static:** If the user previously typed a custom value in Static mode, it is preserved. If they are switching for the first time, Static starts empty.

4. **Switching from Expression back to Source/Static:** The expression state is discarded. A confirmation is shown if the expression is non-trivial (has filled arguments).

5. **Variadic slot removal:** Remove button (X) appears only on variadic extra slots (same as today). This is distinct from the "remove step" button on ChainStepCard.

6. **Required parameter empty in Static mode:** Shows amber "Required" validation badge (preserved from current behavior). The "intentionally blank" signal is only meaningful for optional parameters.

7. **Options mode with current value not in options list:** If the slot's current literal value is not in the options list (e.g., a custom format string), the UI shows it as selected/highlighted with a "Custom" badge, and provides a path back to Options presets.

---

## Acceptance Examples

### AE-01 — Parameter input shows intent-based mode toggle

**Given**
- A transform step (e.g., `replace()`) is expanded in the chain builder
- The "Find this text" parameter is rendered

**When**
- The parameter value input renders

**Then**
- A segmented toggle shows: `[Source] [Static] [External(disabled)]`
- No "expression" option is visible in the toggle
- No "literal" label appears anywhere
- The External chip is visually muted and non-interactive with tooltip: "External data sources — available in a future release"
- Default mode matches `PARAMETER_PRESENTATION` defaultInputMode

### AE-02 — Options mode appears for formatDate parameters

**Given**
- A `formatDate()` transform step is expanded
- The "Output date format" parameter is rendered

**When**
- The parameter value input renders

**Then**
- Mode toggle shows: `[Source] [Static] [Options]`
- Options mode is pre-selected (default when hint exists)
- Chip list renders showing format presets (ISO8601, YYYY-MM-DD, etc.)
- Clicking a chip sets the slot value to that preset string
- The slot emitted is `makeLiteralSlot("ISO8601")`

### AE-03 — Strict enum renders Options-only

**Given**
- A `cast()` transform step is expanded
- The "Convert to type" parameter is rendered

**When**
- The parameter value input renders

**Then**
- Mode toggle shows only: `[Options]` (no Source, no Static — this is a strict enum)
- Chip list: `string`, `number`, `boolean`
- No freeform input is available
- Clicking a chip sets the slot value

### AE-04 — Expression is accessible as inline secondary action

**Given**
- Any parameter in any function step is rendered

**When**
- The user looks at the parameter input

**Then**
- Directly below the primary mode toggle (inline within the parameter card), a subtle link/button reads: "Use advanced expression"
- Clicking it opens the function picker (TransformFunctionPicker)
- After selecting a function, the parameter switches to expression mode
- A "Back to simple input" link allows returning

### AE-05 — Expression does not appear in primary toggle

**Given**
- Any parameter in any function step is rendered
- No special context (not in expression mode already)

**When**
- The segmented mode toggle renders

**Then**
- The toggle contains only primary modes (Source, Static, and/or Options)
- "Expression" is not one of the toggle segments

### AE-06 — Item mode in array context

**Given**
- A function step is being configured inside an array item template context
- `isItemContext` is true

**When**
- A parameter value input renders for a source-typed parameter

**Then**
- Mode toggle shows: `[Item] [Static]` (not `[Source] [Static]`)
- Item mode shows item-scoped field suggestions (filtered to array item children)
- Selecting a field emits an `item()` wrapped expression slot

### AE-07 — Empty string handling for optional parameter

**Given**
- A `replace()` step is expanded
- The "Replace with" parameter (type: string, required: false) is in Static mode
- The input is empty (user has not typed anything)

**When**
- The parameter renders

**Then**
- Placeholder text reads: "Leave empty for blank value" (or equivalent)
- No validation warning is shown (parameter is optional)
- The slot emitted is `makeLiteralSlot("")` — treated as intentional empty string
- No quotes or special syntax visible to the user

### AE-08 — Empty string handling for required parameter

**Given**
- A `replace()` step is expanded
- The "Find this text" parameter (type: string, required: true) is in Static mode
- The user has not yet interacted with the input

**When**
- The parameter renders

**Then**
- Amber "Required" validation indicator appears (unmet required state)
- Placeholder text reads "Enter a value…"
- The parameter is flagged as incomplete

**When**
- The user focuses the input and then blurs without typing (interacted but left empty)

**Then**
- Helper text appears: "Leave blank to use an empty string"
- The slot emits `makeLiteralSlot("")` — treated as intentional empty string
- The "Required" indicator transitions from "unmet" to a softer state indicating the user made a deliberate choice

### AE-09 — Full-width parameter layout in ChainStepCard

**Given**
- A transform step (e.g., `multiply()`) is expanded in the chain builder

**When**
- The step card body renders with its parameter form

**Then**
- Parameter inputs use the full available width of the ChainStepCard body
- No excessive nested padding reduces the effective input width
- The parameter form feels like a primary editing surface, not a cramped nested modal

### AE-10 — Options mode with custom value already set

**Given**
- A `formatDate()` "Output date format" parameter already has value `"DD/MMM/YYYY"` (custom, not in presets)
- User switches to this field

**When**
- The parameter value input renders

**Then**
- The current value is shown with a "Custom" badge or indicator
- User can switch to Options to pick a preset (which replaces the custom value)
- User can stay in Static mode to continue editing the custom value

### AE-11 — Backward-compatible slot emission

**Given**
- Any mode change in the new `ParameterValueInput`

**When**
- The user selects a source, enters a static value, picks an option, or configures an expression

**Then**
- The emitted `ArgumentSlot` uses the exact same `makeSourceSlot` / `makeLiteralSlot` / `makeExpressionSlot` factories as today
- Parent components (`ArgumentForm`, `TransformStepForm`, `SourceCard`) receive unchanged slot shapes
- Expression generation and decomposition pipelines are unaffected

### AE-12 — Switching from Options to Static preserves custom value

**Given**
- User is in Options mode for `formatDate.outputFormat`
- User switches to Static mode
- User types "YYYY/MM/DD" (a custom format)
- User switches back to Options mode
- User switches to Static mode again

**When**
- The Static input renders after the second switch

**Then**
- The previously typed custom value "YYYY/MM/DD" is preserved in the input

### AE-13 — External chip shown as disabled coming-soon

**Given**
- Any parameter in any function step is rendered
- `showExternal` is true (default)

**When**
- The mode toggle renders

**Then**
- An "External" chip appears in the toggle, visually muted (`opacity-50` or equivalent reduced contrast)
- The chip is non-interactive (no hover effects, no click response, `aria-disabled="true"`)
- Tooltip on hover: "External data sources — available in a future release"
- The chip does not interfere with active mode selection

---

## Open Questions

- none

All questions resolved at Rev 2 — see Change Log.

---

## Verification Strategy

- **AE-01, AE-05:** Component tests for `ParameterValueInput` — render with standard parameters, assert no "expression" or "literal" label in toggle, assert correct mode labels.
- **AE-02, AE-03:** Component tests — render with parameters that have `PARAMETER_HINTS`, assert Options mode appears, assert chip rendering, assert slot emission on chip click.
- **AE-04:** Component test — render with standard parameters, assert "Use advanced expression" link present, simulate click, assert function picker opens.
- **AE-06:** Component test — render with `isItemContext=true`, assert "Item" label replaces "Source", assert item-scoped field filtering.
- **AE-07, AE-08:** Component tests — render optional and required parameters in Static mode with empty input, assert correct placeholder text, assert validation presence/absence.
- **AE-09:** Visual verification + snapshot test — render `ChainStepCard` expanded body, assert parameter inputs span full card width.
- **AE-10:** Component test — render parameter with custom value, assert "Custom" indicator, assert mode switching preserves value.
- **AE-11:** Integration tests — verify `ArgumentForm` with new `ParameterValueInput` emits the same `ArgumentSlot` shapes for all modes.
- **AE-12:** Component test — simulate Options→Static→type→Options→Static flow, assert value persistence.
- **All tasks:** TypeScript strict typecheck (`tsc --noEmit`) and lint must pass. Existing `ArgumentForm.test.tsx` and `ArgumentSlotInput.test.tsx` test suites adapted to new component.

---

## Task Generation Notes

This spec decomposes into the following task areas:

1. **ParameterValueInput component + mode model (foundation)** — Create the new shared component with intent-based mode toggle, Options mode rendering, and secondary Expression affordance. Pure UI component with no integration yet. Agent: `ui-task`.

2. **Options mode + ParameterHints integration** — Wire `PARAMETER_HINTS` into `ParameterValueInput` Options mode; implement chip list and dropdown rendering; handle enum vs. token hint types; handle custom-value-in-options-context UX. Agent: `ui-task`.

3. **Empty string handling + Static mode refinements** — Implement empty string UX: placeholder text, validation behavior for required vs optional, and the intentionally-blank affordance. Agent: `ui-task`.

4. **ArgumentForm integration** — Replace `ArgumentSlotInput` usage in `ArgumentForm` with `ParameterValueInput`; ensure slot emission backward compatibility; update variadic slot handling; preserve condition editor special case. Agent: `ui-task`.

5. **Layout improvements (ChainStepCard + TransformStepForm)** — Reduce nested padding in ChainStepCard expanded body; ensure full-width rendering for parameter inputs. Agent: `ui-task`.

6. **SourceCard + NestedFunctionBuilder integration** — Update remaining `ArgumentForm`/`ArgumentSlotInput` consumers (SourceCard per-step argument forms, NestedFunctionBuilder) to use new component or receive layout improvements. Agent: `ui-task`.

7. **Architecture update** — Update `ui-application.md` to document ParameterValueInput component, intent-based mode model, and Options mode pattern. Agent: `task`.

Task 1 is the foundation. Tasks 2-3 can be done in parallel with Task 1 or immediately after. Task 4 depends on Task 1. Tasks 5-6 depend on Task 4. Task 7 depends on all prior tasks.

---

## Change Log

- Rev 2 — 2026-05-14
  - All four open questions resolved:
    - Q1 resolved: Place "Use advanced expression" inline below the mode toggle inside the parameter card. It is a contextual escape hatch for that specific parameter, not a card-level footer action. Revisit a footer only if multiple secondary actions are introduced later.
    - Q2 resolved: Do not add a checkbox or chip for "intentionally blank." Use a minimal interaction model: empty Static = empty string; untouched required params remain in unmet state until user interacts. Distinguish unset vs intentionally blank through interaction state and helper text.
    - Q3 resolved: Place `ParameterValueInput` in `ui/src/features/mappings/components/` initially. Design with a stable prop interface to support later extraction to `ui/src/components/` if reused elsewhere.
    - Q4 resolved: Include External as a disabled/coming-soon chip in the mode toggle with tooltip. Maintains consistency with FS-051 scalar builder entry-mode pattern and preserves long-term conceptual model.
  - Updated Mode Display Rules to include External chip and clarify inline positioning of expression link
  - Updated ParameterValueInput API to include `showExternal` prop and component location note
  - Updated Advanced expression usage flow to reference inline positioning
  - Updated Empty string handling section to reflect interaction-state-based model
  - Added AE-13 (External chip shown as disabled)
  - Updated AE-01, AE-04, AE-08 to reflect resolved decisions
  - No scope change — all resolutions are design clarifications within existing scope boundaries

- Rev 1 — 2026-05-14
  - Initial draft
