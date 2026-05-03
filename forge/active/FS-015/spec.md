# SPEC

## Title

Schema Detail Page

---

## ID

FS-015

---

## Metadata

Owner: @keyra-ui-team
Reviewers: TBD
Created: 2026-05-02
Last Updated: 2026-05-02
Type: ui

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Build the Schema Detail page (`/schemas/:schemaId`) per Section 6.7 of the product spec. Displays schema metadata, Git sync status, a full interactive tree view (using FS-009's `<SchemaTreeView />`), usage information (which projects/mappings reference the schema), and context-dependent actions. For non-CDM schemas, supports inline editing of schema structure. CDM schemas are always read-only. All persistence is via `LocalStorageAdapter` (Phase 0).

---

## Problem

The Schema Detail route (`/schemas/:schemaId`) currently renders a placeholder page ("Coming Soon"). Users have no way to view schema contents, metadata, sync status, or usage from a dedicated detail surface. There is no mechanism to edit non-CDM schema structure (mark required/optional, change types, add/remove/rename fields). The schema feature module has a fully-functional `<SchemaTreeView />` component but no page-level surface that leverages it for detail viewing and editing.

---

## Goal

Deliver a fully functional Schema Detail page that:

1. Displays comprehensive schema metadata with inline editing for non-CDM schemas.
2. Shows Git sync status (read-only placeholders for Phase 0).
3. Renders the full schema tree using `<SchemaTreeView />` with support for editable mode.
4. Provides inline schema editing capabilities for non-CDM schemas (type changes, required toggles, field CRUD, descriptions).
5. Shows usage information — which projects and mappings reference this schema.
6. Provides context-dependent actions (edit, sync, promote, replace, remove, view raw).
7. Handles inferred schema banners, loading/error/not-found states.
8. Persists all modifications through `LocalStorageAdapter`.

---

## Assumptions

- FS-008 is complete: scaffold, shared primitives, routing, `LocalStorageAdapter`.
- FS-009 is complete: `<SchemaTreeView />` component with `editable` prop placeholder, parsers, `ParsedSchema` / `SchemaTreeNode` types.
- FS-013 is complete: Project Overview with schema attachment — schemas can be uploaded and linked to projects.
- The `SchemaTreeView` `editable` prop currently exists but has no behavior. This spec defines and implements the editable behavior within the tree or as a wrapper.
- The `ApiAdapter` interface currently has no `updateSchema` method. This spec adds one.
- `SchemaMetadata` currently lacks `scope`, `description`, and `updatedBy` fields. These must be added. (`updatedBy` is not displayed in Phase 0 but exists for future use.)
- Schema editing modifies both `content` and `metadata` (e.g., fieldCount) in localStorage.
- GitHub and AI action buttons are non-functional placeholders in Phase 0 (throw "Not available in offline mode" if invoked).
- Usage information (which projects/mappings reference a schema) is derived by scanning all projects' `schemaRefs[]` and all mappings' `sourceSchemaRef`/`targetSchemaRef`.

---

## Current Context

**Existing page:** `ui/src/routes/pages/SchemaDetail.tsx` — placeholder rendering "Coming Soon".

**Domain types (`ui/src/lib/types/domain.ts`):**
- `SchemaMetadata` has: `schemaId`, `name`, `format`, `fieldCount`, `origin`, `status`, `source`, `createdAt`, `updatedAt`.
- `SchemaDetail` has: `{ metadata: SchemaMetadata; content: Record<string, unknown> | string }`.
- `SchemaOrigin` = `'cdm' | 'published' | 'local'`.
- `SchemaSourceInfo` = `GitHubSourceInfo | UploadSourceInfo`.
- `ParsedSchema` has: `nodes`, `totalFieldCount`, `format`, `parseTimeMs`, `inferred`.
- `SchemaTreeNode` has: `path`, `fieldName`, `type`, `description`, `depth`, `isArray`, `isRequired`, `parentPath`, `childCount`, `children`, plus optional fields.

**ApiAdapter:** Has `listSchemas`, `getSchema`, `createSchema`, `deleteSchema`. No `updateSchema`.

**SchemaTreeView component:** Exists at `ui/src/features/schemas/components/SchemaTreeView.tsx` with props: `schema`, `variant`, `mappingStatus`, `onSelectNode`, `selectedPath`, `searchable`, `editable`. The `editable` prop is declared but has no implementation.

**LocalStorageAdapter:** Stores schemas as `{ metadata: SchemaMetadata; detail: SchemaDetail }` under `keyra:schemas` key.

**Feature module:** `ui/src/features/schemas/` contains parsers, tree view, types, hooks. No page-level components exist here.

---

## Scope

### In Scope

- Extend `SchemaMetadata` with `scope` (`'global' | 'project'`), `description` (optional string), `updatedBy` (optional string), `inferred` (optional boolean), and `syncStatus` (`'synced' | 'not-synced' | 'local-changes'`) fields.
- Add `UpdateSchemaInput` type and `updateSchema(id, input)` method to `ApiAdapter` and `LocalStorageAdapter`.
- Schema Detail page layout with all sections (metadata, git status, tree, usage, actions).
- Inline metadata editing (name, description) for non-CDM schemas.
- Schema tree view integration with editable mode for non-CDM schemas.
- Schema editing operations: toggle required, change type, add/edit description, rename field, add field, remove field, add nested object, add array field.
- Local edit state with explicit save action.
- Usage section showing referencing projects and mappings.
- Context-dependent action buttons with modals/confirmations.
- Inferred schema banner with per-schema dismiss persistence.
- View Raw modal with syntax highlighting and copy button.
- Replace file action (re-upload and re-parse).
- Remove schema action (blocked if mappings reference it).
- Promote to Global action (scope change with confirmation).
- Placeholder buttons for Phase 0 (GitHub sync, AI auto-describe).
- Loading skeleton, error state with retry, not-found state.
- Breadcrumb: Home > Schema Library > {Schema Name}.

### Out of Scope

- Functional GitHub sync/re-sync (Phase 3).
- Functional AI auto-describe (Phase 2).
- Schema versioning or history.
- Conflict resolution for concurrent edits.
- Drag-and-drop reordering of fields.
- Schema validation/linting.
- XSD visual editing (too complex for Phase 0; JSON Schema editing only for tree edit mode).
- Mobile/responsive layout (desktop-first per Phase 0 constraints).

---

## Non-Goals

- This page does not replace the Mapping Editor's schema panels — those remain separate with their own mapping-context behavior.
- This page does not manage schema upload/import flows — those live on the Project Overview page (FS-013).
- This page does not implement backend communication — all operations are localStorage-only.
- This is not a schema designer tool — editing is limited to structure modifications, not full schema authoring from scratch.

---

## Relevant Areas

- `ui/src/routes/pages/SchemaDetail.tsx` — current placeholder (to be replaced with route-level composition)
- `ui/src/features/schemas/` — feature module (page component, hooks, editing logic)
- `ui/src/features/schemas/components/SchemaTreeView.tsx` — existing tree view (editable prop activation)
- `ui/src/features/schemas/components/SchemaTreeNodeRow.tsx` — may need editable row variant
- `ui/src/features/schemas/types.ts` — `SchemaTreeViewProps` (editable prop behavior)
- `ui/src/lib/types/domain.ts` — `SchemaMetadata`, `SchemaDetail`, `UpdateSchemaInput` additions
- `ui/src/lib/api/types.ts` — `ApiAdapter` interface (add `updateSchema`)
- `ui/src/lib/api/local-storage-adapter.ts` — implement `updateSchema`
- `ui/src/components/` — potential new shared components (CodeViewer, ConfirmModal ?)

---

## Dependencies / Blockers

- Depends on FS-008 (UI Scaffold) — **satisfied** (completed)
- Depends on FS-009 (Schema Tree View) — **satisfied** (completed)
- Depends on FS-013 (Project Overview) — **satisfied** (completed); schemas are uploaded there and linked to projects

No active blockers.

---

## Constraints

- No backend dependency. All CRUD via `LocalStorageAdapter`.
- Must use FS-009's `<SchemaTreeView />` component for tree rendering.
- Schema editing modifies `ParsedSchema` / raw content in localStorage.
- CDM schemas are always read-only (no edit, no replace, no remove).
- GitHub actions (sync, re-sync, publish) are placeholder buttons in Phase 0.
- AI actions (auto-describe) are placeholder buttons in Phase 0.
- TypeScript strict mode, zero lint/typecheck errors.
- Tailwind CSS 4 for styling.
- No external state management libraries (Phase 0 rules).
- Desktop-first (1024px minimum).
- Editing limited to JSON Schema format schemas. XSD schemas render read-only even when non-CDM (captured in Open Questions).

---

## Proposed Behavior

### User Flow

1. **Navigate:** User clicks a schema name from Schema Library (FS-016) or Project Overview. Browser navigates to `/schemas/:schemaId`.
2. **Load:** Page fetches schema via `getSchema(schemaId)`. Shows skeleton during load.
3. **View metadata:** User sees schema name, description, origin badge, scope badge, format, field count, dates. (`updatedBy` is not displayed in Phase 0.)
4. **View tree:** Full schema tree rendered via `<SchemaTreeView />`. User can expand/collapse, search, see types and required indicators.
5. **View usage:** User sees which projects and mappings reference this schema.
6. **Edit (non-CDM):** User clicks "Edit" action. Tree enters editable mode. User modifies fields (toggle required, change type, rename, add, remove, describe). Edits are local until "Save".
7. **Save:** User clicks "Save". Modified schema is persisted to localStorage. If schema was previously synced, status changes to "Local changes".
8. **Replace:** User clicks "Replace file", uploads new file. Schema content is replaced and re-parsed.
9. **Remove:** User clicks "Remove". If schema is referenced by mappings, action is blocked. Otherwise, confirmation modal → delete from storage → redirect to Schema Library.
10. **View Raw:** User clicks "View Raw". Code viewer modal shows raw JSON Schema or XSD with syntax highlighting.

### System Behavior

**Page load:**
- Call `adapter.getSchema(schemaId)`.
- Parse raw content with appropriate parser (`parseJsonSchema` or `parseXsd`) to get `ParsedSchema`.
- Derive sync status from `SchemaSourceInfo` (GitHub source = check `commitSha` presence; upload source = always "Local").
- Fetch usage: call `adapter.listProjects()` and `adapter.listMappings()` for each project, scan `schemaRefs` and mapping schema refs.

**Metadata editing (non-CDM):**
- Click-to-edit on name/description fields.
- On blur or Enter: call `adapter.updateSchema(schemaId, { name, description })`.
- Optimistic UI update.

**Schema structure editing (non-CDM, JSON Schema only):**
- Entering edit mode sets tree to `editable={true}`.
- Edits accumulate locally in component state as a modified `SchemaTreeNode[]` tree.
- Operations supported:
  - Toggle `isRequired` on a field.
  - Change `type` via dropdown.
  - Add/edit `description` via inline input.
  - Rename `fieldName` via inline input.
  - Add new field to an object node (appended as last child).
  - Remove field (confirmation if has children; removes recursively).
  - Add nested object (inserts object with placeholder child `newField`).
  - Add array field (inserts array with item type definition).
- "Save" reconstructs raw content (JSON Schema object) from modified tree, updates `fieldCount`, calls `adapter.updateSchema(schemaId, { content, fieldCount })`.
- After save, if schema had a GitHub source, the sync status indicator changes to "Local changes".

**Usage derivation:**
- Projects: filter `listProjects()` results where `project.schemaRefs` contains `schemaId`.
- Mappings: for each project, filter `listMappings(projectId)` where `sourceSchemaId === schemaId || targetSchemaId === schemaId`.
- Display as linked lists. Empty state: "This schema is not currently used by any projects or mappings."

**Action visibility rules:**
| Action | Condition |
|---|---|
| Edit | origin !== 'cdm' AND format === 'json-schema' |
| Auto-describe fields | origin !== 'cdm' (placeholder) |
| Sync to GitHub | origin === 'local' OR (origin === 'published' AND has local changes) (placeholder) |
| Re-sync from GitHub | origin === 'cdm' OR origin === 'published' (placeholder) |
| Promote to Global | scope === 'project' |
| Replace file | origin !== 'cdm' |
| Remove | origin !== 'cdm' |
| View Raw | always |

### Failure / Edge Behavior

- **Schema not found:** Display "Schema not found" message with link back to Schema Library.
- **Parse error:** Display tree error state with retry option. Metadata still visible.
- **Delete blocked:** If schema is referenced by mappings, show which mappings block deletion. "Remove" button disabled with tooltip listing blocking mappings.
- **Edit save failure:** Show error toast. Edits remain in local state for retry.
- **Empty schema (no fields):** Tree shows empty state. Edit mode still available to add first field.
- **XSD schema edit attempt:** "Edit" action not shown for XSD schemas (editing limited to JSON Schema format).
- **Large schema (1000+ fields):** Virtualization from `<SchemaTreeView />` handles rendering. Edit mode works on visible nodes.
- **Inferred schema banner:** Shown when `ParsedSchema.inferred === true`. Dismiss persists to `localStorage` as `keyra:schema-banner-dismissed:{schemaId}`.

---

## Acceptance Examples

### AE-01 — View CDM schema (read-only)

**Given**
- Schema with `origin: 'cdm'`, `source: { type: 'github', repo: 'org/cdm-schemas', branch: 'main', path: 'v2/patient.json', commitSha: 'abc123' }`

**When**
- User navigates to `/schemas/{schemaId}`

**Then**
- Metadata section shows name, "CDM" origin badge, format, field count, dates
- Git status shows "Synced", repo name, branch, file path, commit SHA
- Tree renders in read-only mode
- Actions available: Re-sync from GitHub (placeholder), View Raw
- No Edit, Replace, or Remove actions visible
- Breadcrumb shows: Home > Schema Library > {name}

### AE-02 — Edit a local JSON Schema

**Given**
- Schema with `origin: 'local'`, `format: 'json-schema'`, content has field `firstName` (type: string, required: true)

**When**
- User clicks "Edit" action
- User changes `firstName` type from `string` to `number`
- User toggles `firstName` required to optional
- User clicks "Save"

**Then**
- Tree shows `firstName` with number type icon, no required indicator
- Schema content in localStorage is updated with `firstName` as type `number`, not in `required` array
- `updatedAt` is refreshed
- If schema had GitHub source: sync status shows "Local changes"

### AE-03 — Add and remove fields in edit mode

**Given**
- Schema with `origin: 'local'`, `format: 'json-schema'`, content has object `address` with children `street`, `city`

**When**
- User enters edit mode
- User adds new field `zipCode` to `address` (type: string)
- User removes `city` (confirms removal)
- User clicks "Save"

**Then**
- Tree shows `address` with children `street` and `zipCode` (no `city`)
- `address` child count badge shows "(2 fields)"
- `fieldCount` in metadata is updated accordingly
- Raw content in localStorage reflects the changes

### AE-04 — Usage section shows referencing projects and mappings

**Given**
- Schema `S-1` is referenced by Project `P-1` (via `schemaRefs`) and Mapping `M-1` (as `sourceSchemaId`)

**When**
- User views Schema Detail for `S-1`

**Then**
- Usage section shows "Projects using this schema:" with link to `P-1`
- Usage section shows "Mappings referencing this schema:" with link to `M-1`
- Links navigate to Project Overview and Mapping Editor respectively

### AE-05 — Remove blocked by mapping reference

**Given**
- Schema `S-1` is referenced by Mapping `M-1` as target schema

**When**
- User clicks "Remove" action

**Then**
- Action is blocked (button disabled or click shows blocking info)
- Message shows: "Cannot remove this schema because it is referenced by: M-1"
- Schema is not deleted

### AE-06 — Inferred schema banner

**Given**
- Schema where `ParsedSchema.inferred === true`
- Banner not previously dismissed for this schema

**When**
- User navigates to Schema Detail

**Then**
- Banner displayed: "This schema was inferred from sample data and may be incomplete. Review and refine the structure before using it in mappings."
- "Dismiss" button present
- Clicking "Dismiss" hides banner and persists dismissal in localStorage

### AE-07 — View Raw shows content with copy

**Given**
- Schema with JSON Schema content

**When**
- User clicks "View Raw"

**Then**
- Modal/panel opens showing raw JSON content
- Content is syntax-highlighted
- Copy button copies raw content to clipboard
- Content is read-only (no editing in raw view)

### AE-08 — Promote to Global

**Given**
- Schema with `scope: 'project'`

**When**
- User clicks "Promote to Global"

**Then**
- Confirmation modal: "This will make the schema available to all projects. This action cannot be undone."
- On confirm: schema scope changes to `'global'` in localStorage
- Scope badge updates to "Global"

### AE-09 — Replace file

**Given**
- Non-CDM schema with existing content

**When**
- User clicks "Replace file"
- User uploads a new JSON Schema file

**Then**
- Confirmation: "This will replace the current schema content. Existing mappings will need re-validation."
- On confirm: new file content replaces existing content
- Content is re-parsed via `parseJsonSchema()`
- `fieldCount` is updated from new `ParsedSchema.totalFieldCount`
- Tree re-renders with new structure

### AE-10 — Loading and error states

**Given**
- Various load conditions

**When / Then**
- Loading: skeleton layout displayed (metadata skeleton + tree skeleton)
- Error fetching schema: "Failed to load schema" with retry button
- Schema not found (404): "Schema not found" with link to Schema Library

---

## Resolved Questions

- `Q1.` **XSD editing deferred indefinitely.** XSD is structurally different (namespaces, type inheritance, groups) and reconstructing valid XSD from tree edits is significantly harder than JSON Schema. CDM schemas are all JSON anyway. If XSD editing ever becomes a requirement, it would be its own spec. XSD schemas render read-only always.
- `Q2.` **Explicit stored `scope` field.** Inferring scope from project attachment creates a race condition (schema created but not yet attached — is it global?). An explicit `scope: 'global' | 'project'` field on `SchemaMetadata` removes ambiguity. Default `'global'` for backward compatibility with existing schemas that have no field.
- `Q3.` **Omit `updatedBy` display entirely in Phase 0.** With no auth, displaying "local-user" adds zero information. Do not render an "Updated by" field. The timestamp is sufficient. The `updatedBy` field remains in the type definition for Phase 5 (Cognito) population but is not displayed.
- `Q4.` **Preserve unrecognized top-level properties during reconstruction.** When reconstructing JSON Schema from an edited tree, keep `$schema`, `$id`, `x-*` extensions, and any other root-level keys the parser didn't consume. For nested objects, only emit the fields the system understands (`type`, `properties`, `required`, `items`, `description`, `enum`, etc.). This avoids destroying metadata while not trying to round-trip deep custom extensions through the tree model.
- `Q5.` **Prominent CTA (primary button) for sync after local edits.** After saving local edits to a previously-synced schema, the #1 next action is syncing to GitHub. Implement as a primary-colored button. Once synced, revert to a standard action button showing "Synced."

---

## Verification Strategy

- **Unit tests:** Schema editing operations (tree manipulation, raw content reconstruction), usage derivation logic, action visibility rules.
- **Component tests:** SchemaDetailPage renders correctly for CDM/local/published schemas, edit mode toggles, metadata inline editing, loading/error/not-found states.
- **Integration tests:** Full flow: load schema → edit → save → verify localStorage updated; remove flow with blocking check.
- **Build/typecheck/lint:** `pnpm tsc --noEmit` and `pnpm lint` must pass with zero errors.
- **Manual verification:** Visual layout matches section descriptions; action buttons appear/hide correctly per origin/scope/format.

AE-01 through AE-10 should all have automated coverage through component and integration tests.

---

## Task Generation Notes

This is a `ui` type spec. All tasks are `Agent: ui-task` except:
- T-01 (domain type and adapter contract extension) — `Agent: task` since it modifies shared types and adapter interface/implementation.
- T-09 (architecture update) — `Agent: task`.

Recommended decomposition:

1. **T-01:** Extend domain types + adapter (type-level foundation work — must come first)
2. **T-02:** Schema Detail page shell (layout, routing, metadata section, loading/error/not-found)
3. **T-03:** Git Status section
4. **T-04:** Schema tree integration + editable mode activation
5. **T-05:** Schema editing operations (field manipulation logic)
6. **T-06:** Usage section
7. **T-07:** Actions section (buttons, modals, confirmations)
8. **T-08:** Inferred banner + View Raw modal + Replace file flow
9. **T-09:** Architecture update to `ui-application.md`

T-01 is a prerequisite for all other tasks. T-02 is prerequisite for T-03–T-08. T-04 is prerequisite for T-05.

---

## Change Log

- Rev 2 — 2026-05-02
  - Resolved all Open Questions (Q1–Q5) with definitive answers
  - Q1: XSD editing deferred indefinitely (not just Phase 0)
  - Q2: Explicit `scope` field with `'global'` default for backward compat
  - Q3: `updatedBy` not rendered in Phase 0 (no auth = no meaningful value)
  - Q4: Preserve unrecognized top-level JSON Schema properties during tree reconstruction
  - Q5: Sync-to-GitHub button is primary CTA after local edits to synced schema
  - Renamed section from "Open Questions" to "Resolved Questions"
  - Added `inferred?: boolean` and `syncStatus` fields to SchemaMetadata scope (per FS-016 Q1/Q2 resolution)
  - Updated T-01 task to include `inferred` and `syncStatus` fields
- Rev 1 — 2026-05-02
  - Initial draft
