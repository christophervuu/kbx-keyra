# SPEC

## Title

Schema Ingestion — Paste JSON/Payload & Rename

---

## ID

FS-026

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-05
Last Updated: 2026-05-05
Type: ui

---

## Status

completed

---

## Revision

Rev: 1

---

## Summary

Enhance the schema upload dialog to support pasting raw JSON or payload content directly (in addition to file upload), and allow the user to customize the schema name before creation. Currently schemas can only be ingested by uploading a file, and the name is automatically derived from the filename with no opportunity to override it. This spec adds a paste-based input mode with the same format detection/parsing pipeline, and a user-editable name field that defaults to a sensible value but can be changed before saving.

---

## Problem

1. **File-only ingestion is limiting.** Users who have JSON/payload content in their clipboard (e.g., copied from an API response, documentation, or another tool) must first save it to a file before they can import it. This adds unnecessary friction, especially during exploratory mapping work.

2. **No name control at creation time.** The schema name is derived from the uploaded filename (stripped of extension). Users have no opportunity to set a meaningful name during the creation flow. They must create the schema first, then navigate to the Schema Detail page to rename it inline — a multi-step workaround for what should be a single interaction.

---

## Goal

- Users can paste raw JSON (schema or sample payload) directly into the upload dialog and have it processed through the same detection and parsing pipeline as file uploads.
- Users can set or edit the schema name before creation, with a sensible default pre-populated (filename for file uploads, "Pasted Schema" or similar for paste mode).
- The dialog accommodates both input methods (file upload and paste) in a clear, non-conflicting UI.

---

## Assumptions

- The existing format detection utility (`detectSchemaFormat`) works on raw text input regardless of source (file or paste).
- The schema parsers (`parseJsonSchema`, `parseXsd`, `parseInferredSchema`) do not depend on file metadata — they operate on text/parsed content.
- `CreateSchemaInput.name` is already a required field that accepts any string.
- `SchemaUploadDialog` is the only schema ingestion surface in Phase 0 (no separate "Create Schema" page).
- XSD paste is out of scope for this iteration (XML paste detection is complex and low-value in Phase 0).

---

## Current Context

The `SchemaUploadDialog` component lives at `ui/src/features/projects/components/SchemaUploadDialog.tsx`. It is opened from the Project Overview page when the user clicks "Add Schema" or "Upload" buttons.

Current flow:
1. User clicks file input, selects a `.json`, `.xsd`, or `.xml` file.
2. `FileReader` reads the file as text.
3. `detectSchemaFormat(text)` determines the format (`json-schema`, `xsd`, `sample-json`, `sample-xml`, `unknown`).
4. The appropriate parser runs to extract field count.
5. A summary panel shows filename, detected format badge, and field count.
6. User selects scope (Global / Project-Level).
7. User clicks Upload — `adapter.createSchema()` is called with `name: stripExtension(filename)`.

The name is never editable. The dialog has no textarea or paste mechanism.

The `SchemaDetailPage` (`ui/src/features/schemas/components/SchemaDetailPage.tsx`) already supports inline renaming via `InlineEditableText` after the schema exists — but this requires navigating away from the project overview.

---

## Scope

### In Scope

- Add a textarea for pasting raw JSON/payload content to the `SchemaUploadDialog`.
- Add input mode toggle or tab UI to switch between "Upload File" and "Paste Content" methods.
- Run the same `detectSchemaFormat` → parser pipeline on pasted text.
- Add an editable "Schema Name" text input field that:
  - Defaults to `stripExtension(filename)` when a file is uploaded.
  - Defaults to `"Pasted Schema"` (or derived from format, e.g., "Pasted JSON Schema") when content is pasted.
  - Is always editable before creation regardless of input method.
- Validate that the name is non-empty before allowing upload/create.
- Preserve all existing file upload behavior unchanged.
- Preserve scope selection and error handling behavior.

### Out of Scope

- XSD paste support (XML detection from raw paste is unreliable and low priority).
- Multi-file upload or batch paste.
- Schema name uniqueness validation (not enforced in Phase 0).
- Any changes to the Schema Detail page rename flow.
- Any changes to the Schema Library page.
- Drag-and-drop file upload (future enhancement).

---

## Non-Goals

- This spec does not introduce a standalone "Create Schema" page or route.
- This spec does not change the adapter interface or storage model.
- This spec does not add schema versioning or content diff capabilities.

---

## Relevant Areas

- `ui/src/features/projects/components/SchemaUploadDialog.tsx` (primary change target)
- `ui/src/features/projects/components/__tests__/SchemaUploadDialog.test.tsx`
- `ui/src/features/projects/lib/detect-schema-format.ts` (consumed, not modified)
- `ui/src/features/schemas/` (parsers consumed, not modified)
- `ui/src/lib/types/domain.ts` (consumed — `CreateSchemaInput`)

---

## Dependencies / Blockers

- FS-013 (Project Overview & CRUD) — completed; provides the SchemaUploadDialog.
- FS-009 (Schema Tree View) — completed; provides parsers.

---

## Constraints

- Must not break existing file upload behavior.
- Must use the same `detectSchemaFormat` pipeline for pasted content.
- TypeScript strict mode, zero lint/typecheck errors.
- Tailwind CSS 4 styling consistent with existing dialog.
- No external UI component libraries (Phase 0 rules).
- The dialog title should update contextually ("Upload Schema" vs "Add Schema" or similar neutral label).
- Tab/mode toggle must be keyboard accessible.

---

## Proposed Behavior

### User Flow

**File Upload (existing, preserved):**
1. User opens dialog → sees "Upload File" / "Paste Content" toggle (Upload File active by default).
2. User selects file via file input.
3. File info panel shows filename, format badge, field count.
4. Name field pre-populates with filename (sans extension). User may edit.
5. User selects scope.
6. User clicks "Add Schema" → schema is created with the edited name.

**Paste Content (new):**
1. User opens dialog → clicks "Paste Content" tab/toggle.
2. Textarea appears. User pastes JSON or sample payload.
3. On blur or explicit "Analyze" action, `detectSchemaFormat` runs on the pasted text.
4. Info panel shows detected format badge and field count (no filename row).
5. Name field pre-populates with a default (e.g., "Pasted JSON Schema" or "Pasted Sample JSON"). User may edit.
6. User selects scope.
7. User clicks "Add Schema" → schema is created with the edited name.

**Name editing (both modes):**
- The name field appears after content is loaded/analyzed (file info or paste analysis complete).
- It is a standard text input with a label "Schema Name".
- It is pre-populated with a sensible default but fully editable.
- If the user clears the name, the "Add Schema" button is disabled.
- If the user selects a different file, the name resets to the new file's default (unless the user has manually edited it — in which case it is preserved).

### System Behavior

- `detectSchemaFormat(text)` is called on pasted content identically to how it is called on file content.
- Parse flow (parser selection, field count extraction) is identical for both modes.
- `adapter.createSchema()` is called with `name` from the name input field (not derived from filename in paste mode).
- `source` field on `CreateSchemaInput` is set to `{ type: 'upload' }` for both modes (paste is treated as a local upload for Phase 0).
- The dialog resets all state (file info, paste content, name, errors) when closed and reopened.

### Failure / Edge Behavior

- **Empty paste:** "Add Schema" button remains disabled. Inline hint: "Paste JSON content above."
- **Invalid/unparseable paste:** Error shown below textarea: "Could not determine format. Paste valid JSON Schema or sample JSON data." Same styling as existing `fileError`.
- **Name cleared to empty:** "Add Schema" button disabled. No error shown (implicit requirement).
- **Name with only whitespace:** Treated as empty — "Add Schema" disabled.
- **Extremely large paste (>1MB):** No explicit limit in Phase 0, but browser textarea performance may degrade. Acceptable for now; no truncation logic.
- **Switching modes with content loaded:** If user switches from file (with file loaded) to paste (empty), the file info is preserved but hidden. Switching back reveals it. This avoids data loss if the user accidentally clicks the wrong tab. Paste content is similarly preserved when switching away and back.
- **File re-selection with edited name:** If the user has manually edited the name field and then selects a new file, the name resets to the new filename default (the manual edit is lost) to avoid confusion about which file the name refers to.

---

## Acceptance Examples

### AE-01 — Paste valid JSON Schema

**Given**
- Dialog is open in "Paste Content" mode.

**When**
- User pastes: `{"type":"object","properties":{"name":{"type":"string"},"age":{"type":"number"}},"required":["name"]}`

**Then**
- Format badge shows "JSON Schema".
- Field count shows "3 fields detected" (name, age, root object — per parser behavior).
- Name field shows "Pasted JSON Schema".
- "Add Schema" button is enabled.

### AE-02 — Paste sample JSON payload

**Given**
- Dialog is open in "Paste Content" mode.

**When**
- User pastes: `{"firstName":"John","lastName":"Doe","address":{"city":"NYC","zip":"10001"}}`

**Then**
- Format badge shows "Sample JSON".
- Inferred warning shows.
- Field count reflects inferred structure.
- Name field shows "Pasted Sample JSON".
- "Add Schema" button is enabled.

### AE-03 — Paste invalid content

**Given**
- Dialog is open in "Paste Content" mode.

**When**
- User pastes: `this is not json`

**Then**
- Error message: "Could not determine format. Paste valid JSON Schema or sample JSON data."
- "Add Schema" button is disabled.
- No format badge or field count shown.

### AE-04 — Edit schema name before upload (file mode)

**Given**
- Dialog is open in "Upload File" mode.
- User selects file `patient-record.json` (valid JSON Schema).

**When**
- Name field shows "patient-record".
- User changes name to "Patient Record v2".
- User clicks "Add Schema".

**Then**
- Schema is created with name "Patient Record v2" (not "patient-record").

### AE-05 — Edit schema name before create (paste mode)

**Given**
- Dialog is open in "Paste Content" mode.
- User pastes valid JSON Schema.
- Name field shows "Pasted JSON Schema".

**When**
- User changes name to "Order Response Schema".
- User clicks "Add Schema".

**Then**
- Schema is created with name "Order Response Schema".

### AE-06 — Empty name disables creation

**Given**
- Dialog is open. File is selected (or content pasted) successfully.

**When**
- User clears the name field to empty string.

**Then**
- "Add Schema" button is disabled.

### AE-07 — Mode toggle preserves state

**Given**
- Dialog is open in "Upload File" mode.
- User selects a file successfully. Info panel shows.

**When**
- User switches to "Paste Content" tab.
- User switches back to "Upload File" tab.

**Then**
- Original file info is still displayed.
- Name field still shows the file-derived default.

### AE-08 — Analyze pasted content on blur

**Given**
- Dialog is open in "Paste Content" mode.
- Textarea is focused and empty.

**When**
- User pastes JSON Schema content and tabs out of the textarea.

**Then**
- Format detection runs.
- Info panel appears with format badge and field count.
- Name field populates with default.

---

## Open Questions

- none

---

## Verification Strategy

- Unit tests for the updated `SchemaUploadDialog` component covering:
  - AE-01 through AE-08 as individual test cases.
  - Existing file upload tests remain passing (regression).
- TypeScript strict typecheck passes.
- ESLint passes with zero errors.
- Manual verification: open dialog from Project Overview, test both modes interactively.

---

## Task Generation Notes

This is a UI-only change to a single dialog component. Decomposition:

1. **T-01 (ui-task):** Add input mode toggle (Upload File / Paste Content) and textarea UI to `SchemaUploadDialog`. Wire paste content through the existing `detectSchemaFormat` → parser pipeline. Handle mode switching state preservation.

2. **T-02 (ui-task):** Add the editable "Schema Name" text input field. Pre-populate with defaults based on mode (filename for file upload, format-derived string for paste). Wire name into `handleUpload` → `adapter.createSchema()`. Disable "Add Schema" button when name is empty/whitespace.

3. **T-03 (ui-task):** Update existing tests and add new test cases for paste mode, name editing, mode toggle, and edge cases (AE-01 through AE-08). Ensure regression coverage for existing file upload behavior.

T-01 and T-02 can be implemented in parallel since they affect different logical sections of the component (input method vs. name field), but T-02 has a soft dependency on T-01 for the paste-mode default name. Recommend sequential execution: T-01 → T-02 → T-03.

---

## Change Log

- Rev 1 — 2026-05-05
  - Initial draft
