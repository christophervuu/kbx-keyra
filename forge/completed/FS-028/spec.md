# SPEC

## Title

Import UX, Preview Layout & Diagnostics Readability Improvements

---

## ID

FS-028

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-05-06  
Last Updated: 2026-05-06  
Type: ui

---

## Status

completed

---

## Revision

Rev: 1

---

## Summary

Several UX issues outside the Builder/Editor panel slow users down during schema import, preview reading, and diagnostic inspection. This spec addresses five discrete problems: schema paste analysis delayed until blur, schema name not inferred from JSON Schema title on change, preview panel content not filling available height, field-level live result not visible during expression building, and diagnostics text clipped without full inspection support. The goal is to reduce friction in the import workflow and the read/test/debug loop.

---

## Problem

1. **Schema paste analysis delayed until blur.** In `SchemaUploadDialog`, calling `analyzePasteContent()` only on textarea blur means the content info panel (format badge, field count, parse validation) does not render until the user tabs out or clicks away. While schema name auto-fill already triggers on change, the user receives no visual confirmation that their paste was recognized until they leave the textarea.

2. **Schema name not inferred promptly from JSON Schema title.** The `handlePasteTextChange` handler attempts title inference on every keystroke via `JSON.parse`, but for multi-line pastes the parse only succeeds after the full content arrives in a single paste event. Combined with the blur-gated analysis, users perceive the schema name as arriving late.

3. **Preview panel content does not use height well.** The `InlinePreviewStrip` expanded state and `BottomArea` preview tabs render source/output textareas with fixed or constrained heights. When the user resizes the bottom panel taller via the `useResizableLayout` handle, the additional vertical space is not redistributed into the text content areas.

4. **Live field result not visible during expression building.** `LiveResultDisplay` exists and is rendered inside `UnifiedExpressionBuilder`, but its `sourceData` prop may be disconnected from `PreviewContext` source data when the builder renders in `ScalarFieldBuilder`. When no `sourceData` is threaded through, the component shows the empty state even when test data is loaded in the inline preview strip.

5. **Diagnostics content is truncated.** Long diagnostic descriptions in `InlinePreviewStrip` diagnostics rows were historically clipped via CSS `truncate`. An `ExpandableText` helper was introduced but may not be applied consistently across all diagnostic surfaces, and the expand/collapse threshold (150 chars) may be too aggressive for short-but-multiline messages.

---

## Goal

After this spec is implemented:

- Paste analysis in `SchemaUploadDialog` triggers immediately on input change (debounced), not on blur.
- Schema Name auto-fills from JSON Schema `title` as soon as the paste is parsed — no blur required.
- Manual Schema Name edits are never overwritten by subsequent paste events.
- Preview panel source/output panes fill available vertical space and scroll internally.
- `LiveResultDisplay` in `ScalarFieldBuilder` receives `sourceData` from `PreviewContext` and shows evaluated results while building expressions.
- When no test data is loaded, a clear empty-state message ("Load test data to see live result") is displayed.
- Diagnostics descriptions wrap to multiple lines and support expand/collapse for long messages.

---

## Assumptions

- `SchemaUploadDialog` is the canonical schema import surface (paste mode). No other paste-import surface exists.
- `PreviewContext` is the canonical context for sharing source test data across mapping editor surfaces.
- `useExpressionPreview` hook is stable and supports the debounced parse/evaluate pattern.
- The resizable layout hook (`useResizableLayout`) correctly reports bottom panel height changes.
- `ExpandableText` component in `InlinePreviewStrip.tsx` is the starting point for diagnostics rendering (needs broader application and threshold tuning).

---

## Current Context

**Schema Import:** `SchemaUploadDialog` (at `ui/src/features/projects/components/SchemaUploadDialog.tsx`) provides file upload and paste modes. In paste mode, the Schema Name input is always rendered, and `handlePasteTextChange` already extracts `title` from parsed JSON on each keystroke. However, `analyzePasteContent` (which sets `pasteInfo` for the info panel) is only called in `handlePasteBlur`. This means format badge, field count, and validation feedback require a blur event.

**Preview Panel:** `InlinePreviewStrip` (expanded state) renders source and output textareas. `BottomArea` renders tabbed content (Preview/Diagnostics/Trace/Test Cases). Both are constrained by the bottom panel height from `useResizableLayout`, but internal content areas do not use flex-grow or calc-based height to fill available space.

**Live Result:** `LiveResultDisplay` is rendered as a shared always-visible section inside `UnifiedExpressionBuilder`. It accepts `expression` and `sourceData` props. In `ScalarFieldBuilder`, the `sourceData` must come from `PreviewContext` — if this prop is not threaded through, the component falls into the no-data empty state.

**Diagnostics:** `ExpandableText` exists in `InlinePreviewStrip.tsx` (threshold: 150 chars, show more/less toggle). The component uses `break-words` class for wrapping. Diagnostic rows in the expanded diagnostics section already use this, but the collapsed summary bar and any other diagnostic surfaces may still use `truncate`.

---

## Scope

### In Scope

- `SchemaUploadDialog` paste mode: trigger `analyzePasteContent` on change (debounced) instead of only on blur
- Schema Name auto-fill from `title` during change-triggered analysis (consolidate with existing onChange title extraction)
- Preserve `nameManuallyEdited` guard against overwriting user edits
- `InlinePreviewStrip` expanded state: source and output panes fill available height
- `BottomArea` Preview tab: output area fills available height
- `LiveResultDisplay` in `ScalarFieldBuilder`: wire `sourceData` from `PreviewContext`
- `LiveResultDisplay` empty-state message when no source data
- Diagnostics text wrapping applied consistently (remove any remaining `truncate` on diagnostic descriptions)
- Diagnostics expand/collapse for long messages (tune threshold, ensure all diagnostic surfaces use `ExpandableText`)

### Out of Scope

- Builder/Editor panel state management fixes (dirty-state, Apply behavior) — covered in FS-027
- Static value input type — covered in FS-027
- Clear mapping action — covered in FS-027
- Object summary panel — covered in FS-027
- Header compression — covered in FS-027
- Direct Copy removal — covered in FS-027
- Object mapped ratio — covered in FS-027
- Builder/Editor architecture changes
- Advanced Testing page layout
- Backend round-trip for preview
- Schema creation API changes

---

## Non-Goals

- Redesigning the `SchemaUploadDialog` layout or adding new schema import modes
- Changing the `InlinePreviewStrip` collapsed bar behavior
- Modifying the `PreviewContext` API contract (only wiring existing context to the builder)
- Introducing new diagnostic severity levels or error codes
- Changing the `useResizableLayout` hook behavior

---

## Relevant Areas

- `ui/src/features/projects/components/SchemaUploadDialog.tsx`
- `ui/src/features/projects/components/__tests__/SchemaUploadDialog.test.tsx`
- `ui/src/features/mappings/components/InlinePreviewStrip.tsx`
- `ui/src/features/mappings/components/ConnectedInlinePreviewStrip.tsx`
- `ui/src/features/mappings/components/BottomArea.tsx`
- `ui/src/features/mappings/components/LiveResultDisplay.tsx`
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/UnifiedExpressionBuilder.tsx`
- `ui/src/features/mappings/context/preview-context.tsx`
- `ui/src/features/mappings/components/MappingEditorPage.tsx`

---

## Dependencies / Blockers

- none

---

## Constraints

- Preview loop must stay under 2 seconds for client-side preview (existing product requirement).
- Schema name inference applies only when pasted content is valid JSON and contains a top-level `title` string.
- Preview panel improvements must work with the resizable panel behavior from FS-022 (`useResizableLayout`).
- Diagnostics rendering changes must preserve existing severity indicators, stable error codes, and links to affected rules.
- Must not introduce external dependencies beyond what is already in the project.

---

## Proposed Behavior

### User Flow

**Schema paste (immediate feedback):**
1. User opens the Add Schema dialog and selects "Paste Content" mode.
2. Schema Name input is visible immediately (already the case).
3. User pastes `{"title": "Patient", "type": "object", "properties": {"name": {"type": "string"}}}`.
4. Within ~300ms (debounce), the content info panel appears showing format badge ("JSON Schema"), field count ("1 field detected"), and Schema Name auto-fills with "Patient".
5. No blur/tab required.

**Schema Name preservation:**
1. User manually types "My Patient" into Schema Name before or after paste.
2. Subsequent pastes of new content do not overwrite "My Patient".
3. Only auto-fill applies when `nameManuallyEdited` is `false`.

**Preview panel fill-height:**
1. User expands the bottom panel by dragging the resize handle down.
2. Source JSON textarea and Output display area each grow proportionally to fill available height.
3. When content exceeds the expanded area, it scrolls internally — no outer scrollbar on the panel.
4. Headers/toolbars (status bar, tab bar, run controls) remain fixed at their natural height.

**Live result during building:**
1. User loads test data via the inline preview strip (or a test case).
2. User selects a target field and builds an expression (e.g., `source("firstName")`).
3. `LiveResultDisplay` inside the builder shows the evaluated result: `"John"`.
4. As the user modifies the expression, the result updates (debounced).
5. If no test data is loaded, the result area shows: "Load test data to see live result."

**Diagnostics full inspection:**
1. Diagnostics with descriptions longer than the container width wrap to multiple lines.
2. For especially long descriptions (>150 characters), an expand/collapse toggle is shown.
3. Clicking "Show more" reveals the full text; "Show less" collapses it.
4. Severity icons, error codes, and rule links remain visible regardless of expansion state.

### System Behavior

**Paste analysis debounce:**
- `handlePasteTextChange` calls a debounced version of `analyzePasteContent` (300ms delay).
- The existing immediate `title` extraction can remain as a fast-path for Schema Name only.
- `pasteInfo` is set by the debounced analysis, causing the info panel to render.
- Previous debounce timeout is cancelled on each new keystroke.

**Preview panel layout:**
- `InlinePreviewStrip` expanded container uses `flex flex-col h-full` with the header/controls at natural height and content areas in a `flex-1 min-h-0 overflow-auto` container.
- `BottomArea` preview tab output area uses the same `flex-1 overflow-auto` pattern.
- The parent container passes the panel height from `useResizableLayout.layout.bottomHeight` as an explicit style constraint.

**LiveResultDisplay wiring:**
- `ScalarFieldBuilder` accesses `sourceData` from `PreviewContext` via `useContext(PreviewContext)` or equivalent hook.
- Passes parsed `sourceData` to `UnifiedExpressionBuilder` or directly to `LiveResultDisplay`.
- `LiveResultDisplay` evaluates via `useExpressionPreview({ expression, sourceData })`.

**Diagnostics consistency:**
- All diagnostic description elements remove `truncate` / `line-clamp` CSS classes.
- All diagnostic description elements use `break-words whitespace-pre-wrap` or `ExpandableText`.
- Threshold for expand/collapse remains 150 characters.
- `ExpandableText` is already implemented; ensure it's used in collapsed bar summary and expanded list.

### Failure / Edge Behavior

- **Invalid JSON paste:** `analyzePasteContent` reports parse error; Schema Name remains empty (or last valid inference).
- **Paste with no `title`:** Schema Name stays empty; user must type manually.
- **Empty paste textarea:** No analysis runs; info panel is hidden; Schema Name stays empty.
- **LiveResultDisplay with empty expression:** Shows no result (null state).
- **LiveResultDisplay evaluation error:** Shows error text in red.
- **Diagnostics with zero-length message:** Renders empty row (edge case; should not occur with well-formed diagnostics).
- **Preview panel at minimum height (180px):** Content areas are still scrollable; they receive at least ~100px after header subtraction.

---

## Acceptance Examples

### AE-01 — Schema paste analysis appears without blur

**Given**
- User is in SchemaUploadDialog paste mode
- Textarea is focused and empty

**When**
- User pastes `{"type": "object", "properties": {"id": {"type": "integer"}}}`

**Then**
- Within 300ms, content info panel appears with "JSON Schema" format badge and "1 field detected"
- No blur or tab-out required
- Textarea remains focused

### AE-02 — Schema Name auto-fills from title on paste

**Given**
- User is in SchemaUploadDialog paste mode
- Schema Name input is empty
- `nameManuallyEdited` is false

**When**
- User pastes `{"title": "Patient", "type": "object", "properties": {}}`

**Then**
- Schema Name input shows "Patient"
- No blur or tab-out required

### AE-03 — Manual Schema Name preserved on subsequent paste

**Given**
- User has manually edited Schema Name to "My Schema"
- `nameManuallyEdited` is true

**When**
- User pastes new JSON Schema with `"title": "Order"`

**Then**
- Schema Name remains "My Schema" (not overwritten)

### AE-04 — Preview Source JSON pane fills height on resize

**Given**
- InlinePreviewStrip is in expanded state
- Bottom panel height is default (260px)

**When**
- User drags bottom resize handle to increase height to 450px

**Then**
- Source JSON textarea grows to fill additional vertical space
- Output area also grows proportionally
- Headers/controls remain at fixed height
- Long content scrolls internally within each pane

### AE-05 — LiveResultDisplay shows result with test data

**Given**
- Test data is loaded in PreviewContext: `{"firstName": "John", "age": 30}`
- User selects target field and builds expression `source("firstName")`

**When**
- Expression is valid and sourceData is available

**Then**
- LiveResultDisplay shows: `"John"`
- Result updates when expression changes

### AE-06 — LiveResultDisplay empty state without test data

**Given**
- No test data is loaded (sourceData is null in PreviewContext)

**When**
- User is building an expression in ScalarFieldBuilder

**Then**
- LiveResultDisplay shows: "Load test data to see live result"
- No error state is displayed

### AE-07 — Diagnostics text wraps instead of clipping

**Given**
- A diagnostic has description: "Type mismatch at target path 'address.postalCode': expression returns 'number' but target schema expects 'string'. Consider wrapping with cast(expression, \"string\") to resolve."

**When**
- Diagnostic row is rendered in InlinePreviewStrip expanded diagnostics

**Then**
- Full text wraps to multiple lines
- No horizontal overflow or ellipsis truncation
- Severity icon and error code remain visible on first line

### AE-08 — Diagnostics expand/collapse for long messages

**Given**
- A diagnostic has description exceeding 150 characters

**When**
- Diagnostic row is rendered

**Then**
- Only first 150 characters are shown with "..." followed by "Show more" link
- Clicking "Show more" reveals full text
- Clicking "Show less" collapses back to 150-char preview
- Expand state is per-row (does not affect other rows)

---

## Open Questions

- none

---

## Verification Strategy

- **Unit tests:** Debounced paste analysis logic (verify `pasteInfo` is set within timeout without blur). Schema Name inference from title on change. `ExpandableText` threshold behavior.
- **Component tests:** `SchemaUploadDialog` paste mode — paste triggers info panel without blur (AE-01, AE-02, AE-03). `InlinePreviewStrip` expanded — verify flex-fill behavior via snapshot or computed styles. `LiveResultDisplay` — verify result rendering when sourceData is provided vs null (AE-05, AE-06). Diagnostics rows — verify wrap class application and expand/collapse (AE-07, AE-08).
- **Integration tests:** Preview panel resize → content area height grows (AE-04). Builder field-level result updates when expression changes (AE-05).
- **Visual verification:** Preview panel fill-height on resize. Diagnostics multi-line wrap rendering.
- **Typecheck/lint/build:** All touched files pass `tsc --noEmit`, ESLint, and `pnpm build`.

Coverage mapping:
- AE-01, AE-02, AE-03: component tests (SchemaUploadDialog)
- AE-04: component test + visual verification
- AE-05, AE-06: component tests (LiveResultDisplay + ScalarFieldBuilder)
- AE-07, AE-08: component tests (InlinePreviewStrip diagnostics)

---

## Task Generation Notes

This is a UI-focused spec. All tasks are `Agent: ui-task`.

Recommended decomposition:

1. **Schema paste immediate analysis** — debounce `analyzePasteContent` call on change in `SchemaUploadDialog`; remove exclusive blur dependency
2. **Schema Name title inference consolidation** — ensure title auto-fill works with change-triggered analysis; verify `nameManuallyEdited` guard
3. **Preview panel fill-height layout** — CSS/layout changes to `InlinePreviewStrip` expanded state and `BottomArea` preview tab
4. **LiveResultDisplay sourceData wiring** — thread `PreviewContext` sourceData into `ScalarFieldBuilder` → `UnifiedExpressionBuilder` → `LiveResultDisplay`
5. **Diagnostics wrap and expand consistency** — remove truncation CSS; apply `ExpandableText` to all diagnostic surfaces; verify threshold behavior

Tasks 1 and 2 are closely related but separable (analysis vs name inference). Tasks 3, 4, 5 are fully independent of each other and of tasks 1–2.

---

## Change Log

- Rev 1 — 2026-05-06
  - Initial draft from requirements
  - Noted overlap with FS-027 tasks T-02, T-03, T-10, T-11 — this spec intentionally separates import UX, preview layout, and diagnostics readability from Builder/Editor panel state fixes
  - No open questions
