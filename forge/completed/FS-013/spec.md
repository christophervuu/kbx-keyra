# SPEC

## Title

Project Overview & CRUD

---

## ID

FS-013

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-01
Last Updated: 2026-05-01
Rev Updated: 2026-05-01
Type: ui

---

## Status

completed

---

## Revision

Rev: 2

---

## Summary

Build the Project Overview screen (`/projects/:projectId`), the Create Project wizard (`/projects/new`), and the Create Mapping flow (`/projects/:projectId/mappings/new`). These screens provide the organizational layer that enables users to manage projects, attach schemas, create and list mappings, and navigate to the Mapping Editor. All persistence is via `LocalStorageAdapter` (Phase 0). This is the primary navigation path through which users reach the Mapping Editor.

---

## Problem

The application currently has placeholder pages for Project Overview, Create Project, and Create Mapping. Users have no way to create or manage projects, attach schemas to projects, create mappings within a project context, or navigate to the Mapping Editor through the intended application flow. Without these screens, the editor can only be accessed via direct URL.

---

## Goal

Deliver a fully functional project management layer that:

1. Displays project metadata with inline editing.
2. Manages schemas attached to a project (upload with format inference, link from library, remove).
3. Lists mappings with status, coverage, and deployment badges.
4. Provides Create Project and Create Mapping wizards.
5. Enables navigation to the Mapping Editor and other downstream pages.
6. Persists all data through the existing `ApiAdapter` interface using `LocalStorageAdapter`.

---

## Assumptions

- Routes already registered in React Router (FS-008): `/projects/:projectId`, `/projects/new`, `/projects/:projectId/mappings/new`.
- `ApiAdapter` already implements project CRUD (`listProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject`), mapping CRUD (`listMappings`, `createMapping`, `deleteMapping`, `duplicateMapping`), and schema CRUD (`listSchemas`, `getSchema`, `createSchema`, `deleteSchema`).
- `LocalStorageAdapter` is the only adapter in Phase 0 — no network calls needed.
- FS-009's schema parsers (`parseJsonSchema`, `parseXsd`, `parseInferredSchema`) are available and functional.
- The engine's `validate()` (via `validateMapping()`) is available for computing mapping coverage and status.
- Shared primitives `Button`, `Card`, `PageHeader`, `StatusBadge` from `ui/src/components/` are available.
- The `Project` domain type has `schemaRefs: SchemaRef[]` for tracking attached schemas.
- `MappingConfig.sourceSchemaRef` and `MappingConfig.targetSchemaRef` are optional (`SchemaRef | undefined`). When undefined, schemas are not yet assigned. This spec introduces this type change.
- `MappingMetadata.sourceSchemaId` and `MappingMetadata.targetSchemaId` are optional (`string | undefined`). Derived from the optional config refs.
- Deploy badges are read-only placeholders in Phase 0 (all show "Not deployed").

---

## Current Context

Three placeholder route pages exist at `ui/src/routes/pages/`: `ProjectOverview.tsx`, `CreateProject.tsx`, and `CreateMapping.tsx` — each rendering only a heading and "Coming Soon" text. The `features/projects/` directory does not exist yet.

The `LocalStorageAdapter` implements all needed CRUD methods:
- `createProject(input)` generates a UUID, stores in `keyra:projects`, returns `ProjectMetadata`.
- `getProject(id)` returns `ProjectDetail` (project + its mappings).
- `updateProject(id, input)` does partial update of name/description/slug/schemaRefs/tags.
- `deleteProject(id)` removes from storage.
- `createSchema(input)` stores schema content + metadata.
- `createMapping(input)` requires `projectId`, `name`, `sourceSchemaRef`, `targetSchemaRef`.
- `listMappings(projectId)` filters by project.
- `duplicateMapping(id, newName)` copies config with new UUID.

The `Project` type includes: `projectId`, `name`, `description`, `slug`, `schemaRefs[]`, `tags[]`, `createdAt`, `updatedAt`. `ProjectDetail` extends `Project` with `mappings: MappingMetadata[]`.

`MappingMetadata` includes: `mappingId`, `projectId`, `name`, `version`, `status`, `sourceSchemaId`, `targetSchemaId`, `ruleCount`, `coverage`, `updatedAt`.

`SchemaMetadata` includes: `schemaId`, `name`, `format`, `fieldCount`, `origin`, `status`, `source`, `createdAt`, `updatedAt`.

Schema parsers from FS-009: `parseJsonSchema(content)`, `parseXsd(xmlString)`, `parseInferredSchema(sampleData)` — all return `ParsedSchema` with `totalFieldCount`.

---

## Scope

### In Scope

- Project Overview page (`/projects/:projectId`) with four sections:
  - Section A: Project metadata display + inline editing
  - Section B: Schema management (cards, upload, link, remove)
  - Section C: Mapping list table with status/coverage/deploy badges
  - Section D: Project actions (create mapping, add schema, duplicate, delete, placeholders)
- Create Project wizard (`/projects/new`)
- Create Mapping flow (`/projects/:projectId/mappings/new`)
- Schema upload with format detection (JSON Schema, XSD, sample data inference)
- Schema scope selection (Global vs Project-Level)
- Mapping status derivation from engine validation
- Coverage computation from engine validation
- Navigation wiring to Mapping Editor, Schema Detail, Schema Library
- Loading/error/not-found states
- Confirm dialogs for destructive actions (delete project, remove schema, delete mapping)
- Feature module at `ui/src/features/projects/`

### Out of Scope

- Home Dashboard (FS-014)
- Mapping Editor internals (FS-010/011/012)
- Schema Library page / Schema Detail page (separate spec)
- Backend/HTTP persistence
- GitHub sync functionality (Phase 3)
- Deployment execution (Phase 4)
- Project Settings page content (placeholder route only)
- Export/Import functionality (Phase 1+)
- Real deployment badge values (always "Not deployed" in Phase 0)
- Responsive/mobile layout (desktop-first per architecture)

---

## Non-Goals

- This spec does not implement real deployment — deploy badges are read-only placeholders.
- This spec does not implement GitHub schema linking or sync — those buttons are non-functional placeholders.
- This spec does not replace or modify the Mapping Editor — it only navigates to it.
- This spec does not implement the Home Dashboard — project creation success redirects to the project overview, not the dashboard.

---

## Relevant Areas

- `ui/src/features/projects/` (new feature directory)
- `ui/src/routes/pages/ProjectOverview.tsx` (replace placeholder)
- `ui/src/routes/pages/CreateProject.tsx` (replace placeholder)
- `ui/src/routes/pages/CreateMapping.tsx` (replace placeholder)
- `ui/src/lib/api/types.ts` (ApiAdapter — consumed, not modified)
- `ui/src/lib/api/local-storage-adapter.ts` (consumed, minor field-count update may be needed)
- `ui/src/lib/types/domain.ts` (consumed; may need `SchemaScope` type addition)
- `ui/src/features/schemas/` (imports parsers for upload flow)
- `ui/src/lib/engine/index.ts` (imports `validateMapping` for status/coverage)
- `ui/src/components/` (imports shared primitives)
- `ui/src/routes/paths.ts` (imports route constants)

---

## Dependencies / Blockers

- FS-008 (UI Scaffold) must be complete — provides routing, adapter, shared primitives.
- FS-009 (Schema Tree View) must be complete — provides schema parsers for upload/inference.
- FS-010 (Mapping Editor) should be complete — destination of "Edit" action (graceful if not yet implemented; link still navigates).

---

## Constraints

- No backend dependency. All CRUD via `LocalStorageAdapter` through `useAdapter()`.
- Must use FS-009 parsers (`parseJsonSchema`, `parseXsd`, `parseInferredSchema`) for schema upload analysis.
- Must use `validateMapping()` from engine integration for mapping status and coverage derivation.
- Must integrate with FS-008's app shell (routing via `PATHS`, layout via `AppLayout`, adapter context).
- TypeScript strict mode, zero lint/typecheck errors.
- Tailwind CSS 4 for all styling.
- No external state management library (Phase 0 rules — `useState`/`useReducer` only).
- Deploy badges are read-only placeholders showing "Not deployed" in Phase 0.
- Mappings with undefined schema refs (`sourceSchemaRef` or `targetSchemaRef` absent) cannot be deployed. The Deployment Page (Phase 4) must check this constraint. In Phase 0, this is informational only (deploy is not yet functional).
- Desktop-first (1024px minimum viewport).
- No cross-feature direct imports — shared code via `components/`, `hooks/`, or `lib/`.

---

## Proposed Behavior

### User Flow

**Project Overview (`/projects/:projectId`)**:

1. User navigates to project overview. Page loads project data, schemas, and mappings in parallel.
2. **Section A**: User sees project name, description, tags, created/modified dates. Clicking name or description enters inline edit mode. Changes save on blur or Enter via `updateProject()`.
3. **Section B**: User sees schema cards. Each card shows name, format, origin badge, scope badge, field count, sync status. User can:
   - Click "Upload Schema" → file picker → format detection → scope selection → save.
   - Click "Link Schema" → shows picker of existing schemas from library → attach to project.
   - Click "Remove" on a card → confirmation if mappings reference it → removes schema ref from project.
   - Click "View" → navigates to `/schemas/:schemaId`.
4. **Section C**: User sees mapping table. Columns: Name, Source→Target, Rules, Coverage%, Status, DEV/QA/PROD badges, Last Modified, Actions. User can:
   - Click "Create Mapping" → navigates to create mapping flow.
   - Click "Edit" → navigates to Mapping Editor.
   - Click "Duplicate" → creates copy, appears in table.
   - Click "Delete" → confirmation → removes mapping.
   - Click column headers to sort.
5. **Section D**: Action buttons for create mapping, add schema, duplicate project, delete project, and placeholder buttons for export/import/settings.

**Create Project (`/projects/new`)**:

1. User fills: name (required), description (optional), tags (comma-separated or tag input).
2. On submit: calls `createProject()`, navigates to `/projects/:projectId`.
3. Cancel returns to `/` (Home Dashboard).

**Create Mapping (`/projects/:projectId/mappings/new`)**:

1. Step 1: Enter mapping name (required).
2. Step 2: Select source schema from project's attached schemas (or "Skip — add later").
3. Step 3: Select target schema from project's attached schemas (or "Skip — add later").
4. On submit: calls `createMapping()`, navigates to Mapping Editor.
5. If schemas skipped: Mapping Editor shows banner "Attach source and target schemas to enable validation and preview."

### System Behavior

- **Project loading**: On mount, call `getProject(projectId)`. This returns `ProjectDetail` including mapped `MappingMetadata[]`. Separately load schemas referenced by `project.schemaRefs` via individual `getSchema()` calls.
- **Schema upload**: Read file content, detect format (JSON Schema if valid JSON with `type`/`properties`/`$schema` keys; XSD if XML with `xs:schema` root; otherwise sample data). If sample → run `parseInferredSchema()`. Call `createSchema(input)` with detected format and content. Update project's `schemaRefs` via `updateProject()`.
- **Mapping status derivation**: For each mapping in the list, compute status from `MappingMetadata.status` field (already stored). For the currently-viewed project, optionally re-validate on load to refresh coverage if schemas changed (deferred — use stored values in Phase 0).
- **Coverage**: Read from `MappingMetadata.coverage` (stored at mapping save time by editor). If 0 and rules exist, display as-is (editor is responsible for computing and storing on save).
- **Duplicate project**: Copy project record with new UUID, copy all mappings with new UUIDs pointing to new project, copy schema refs. Navigates to new project.
- **Delete project**: Remove project, remove all mappings associated with project. Do NOT delete schemas (they may be shared). Navigate to Home Dashboard.
- **Schema removal**: Remove `SchemaRef` from project's `schemaRefs`. If any mapping in the project references the schema (as source or target), show warning in confirmation. Do not delete the schema record itself.

### Failure / Edge Behavior

- **Project not found**: Show "Project not found" message with link to Home Dashboard. Occurs if `getProject()` throws with NOT_FOUND.
- **Loading failure**: Show "Failed to load project" with retry button.
- **Empty schemas**: Section B shows "No schemas attached" empty state with prominent "Upload Schema" and "Link Schema" buttons.
- **Empty mappings**: Section C shows "No mappings yet" empty state with "Create Mapping" button.
- **Invalid upload file**: If file cannot be read or is empty, show inline error. If format detection is ambiguous, default to sample data inference.
- **Schema parsing failure during upload**: Show warning "Schema uploaded but field count could not be determined" — still save with `fieldCount: 0`.
- **Create project validation**: Name is required. Show inline error if submitted empty.
- **Create mapping with skipped schemas**: `sourceSchemaRef` and/or `targetSchemaRef` are omitted (`undefined`) from `CreateMappingInput`. The mapping is created in `draft` status with no schema references. `MappingConfig.sourceSchemaRef` and `MappingConfig.targetSchemaRef` are optional — `undefined` means "not yet assigned."
- **Duplicate naming**: Duplicated items get " (Copy)" suffix appended to name.
- **Storage quota exceeded**: Show error toast if `writeArray` throws quota error.

---

## Acceptance Examples

### AE-01 — Load project overview with data

**Given**
- Project "Order Processing" exists with 2 schemas and 3 mappings

**When**
- User navigates to `/projects/{projectId}`

**Then**
- Section A shows "Order Processing" name, description, tags, dates
- Section B shows 2 schema cards with name, format badge, field count
- Section C shows 3 mapping rows with all columns populated
- No loading indicators remain visible

### AE-02 — Inline edit project name

**Given**
- Project overview is loaded for "Order Processing"

**When**
- User clicks the project name text
- User changes it to "Order Processing v2"
- User presses Enter (or blurs the field)

**Then**
- Name updates in the UI immediately
- `updateProject()` is called with `{ name: "Order Processing v2" }`
- Page does not navigate or reload

### AE-03 — Upload JSON Schema file

**Given**
- Project overview is loaded
- User has a file `order.json` containing `{"type":"object","properties":{"orderId":{"type":"string"}},"$schema":"http://json-schema.org/draft-07/schema#"}`

**When**
- User clicks "Upload Schema"
- User selects the file
- User chooses scope "Project-Level"
- Upload completes

**Then**
- Format detected as "json-schema" (has `$schema` and `properties`)
- Schema card appears in Section B with name "order.json", format "JSON Schema", field count from parser
- `createSchema()` called with format "json-schema" and content
- Project's `schemaRefs` updated via `updateProject()`

### AE-04 — Upload sample JSON (inferred schema)

**Given**
- User uploads a file `sample.json` containing `{"name":"Alice","age":30,"addresses":[{"city":"NYC"}]}`

**When**
- Format detection runs

**Then**
- Content is valid JSON but lacks `type`/`properties`/`$schema` → treated as sample data
- `parseInferredSchema()` called on parsed content
- Schema card shows "⚠ Inferred from sample data" badge
- Field count derived from inferred schema

### AE-05 — Create project wizard

**Given**
- User is on `/projects/new`

**When**
- User enters name "New Project", description "Testing", tags "api, v2"
- User clicks "Create"

**Then**
- `createProject({ name: "New Project", description: "Testing", slug: "new-project", tags: ["api","v2"] })` called
- User navigated to `/projects/{newProjectId}`
- Project overview loads for the new project

### AE-06 — Create mapping with schema selection

**Given**
- Project has schemas "OrderRequest" (source) and "OrderResponse" (target) attached

**When**
- User clicks "Create Mapping" in Section C
- User enters name "Order Transform"
- User selects "OrderRequest" as source schema
- User selects "OrderResponse" as target schema
- User clicks "Create"

**Then**
- `createMapping({ projectId, name: "Order Transform", sourceSchemaRef: {...OrderRequest}, targetSchemaRef: {...OrderResponse} })` called
- User navigated to Mapping Editor at `/projects/{projectId}/mappings/{newMappingId}`

### AE-07 — Create mapping with skipped schemas

**Given**
- User is in Create Mapping flow

**When**
- User enters name "Draft Mapping"
- User clicks "Skip — add schema later" for both source and target
- User clicks "Create"

**Then**
- Mapping created with `sourceSchemaRef: undefined`, `targetSchemaRef: undefined`
- Status is "draft"
- Mapping Editor opens with banner "Attach source and target schemas to enable validation and preview"

### AE-08 — Delete project with confirmation

**Given**
- Project "Old Project" has 2 mappings and 1 schema attached

**When**
- User clicks "Delete Project"

**Then**
- Confirmation dialog shows "This will delete 2 mappings and unlink 1 schema. This action cannot be undone."
- On confirm: project and its mappings deleted, user navigated to Home Dashboard
- Schemas are NOT deleted (may be shared)

### AE-09 — Mapping list sorting and status display

**Given**
- Project has mappings with various statuses: one "ready" (coverage 85%), one "has-errors", one "draft"

**When**
- User views the mapping table

**Then**
- Status column shows colored badges: green "Ready", red "Has Errors", gray "Draft"
- Coverage column shows "85%", "—" (if has errors), "0%"
- DEV/QA/PROD columns show "○ Not deployed" for all
- Clicking "Last Modified" header sorts descending (default), click again for ascending

### AE-10 — Project not found

**Given**
- User navigates to `/projects/nonexistent-id`

**When**
- `getProject()` throws NOT_FOUND error

**Then**
- Page shows "Project not found" with link to Home Dashboard
- No unhandled errors or blank screens

### AE-11 — Remove schema with mapping reference warning

**Given**
- Schema "OrderRequest" is attached to project
- Mapping "Order Transform" uses "OrderRequest" as source schema

**When**
- User clicks "Remove" on "OrderRequest" schema card

**Then**
- Confirmation shows "This schema is referenced by 1 mapping (Order Transform). Removing it may affect those mappings."
- On confirm: schema ref removed from project, schema record preserved in storage
- Mapping metadata still references the schema (stale reference — editor will show warning)

### AE-12 — Link schema from library

**Given**
- Schema "SharedAddress" exists in localStorage (created in another project or directly)
- It is not currently attached to this project

**When**
- User clicks "Link Schema"
- User sees list of available schemas
- User selects "SharedAddress"

**Then**
- Schema ref added to project's `schemaRefs` via `updateProject()`
- Schema card for "SharedAddress" appears in Section B
- Schema data is not duplicated — just referenced

### AE-13 — Duplicate mapping

**Given**
- Mapping "Order Transform" exists in the project

**When**
- User clicks "Duplicate" on that mapping row

**Then**
- `duplicateMapping(id, "Order Transform (Copy)")` called
- New mapping row appears in table with name "Order Transform (Copy)"
- New mapping has same rules but new ID, version reset to 1

---

## Open Questions

All questions resolved in Rev 2.

- `Q1.` ~~When creating a mapping with skipped schemas, what `SchemaRef` value should be stored?~~ **RESOLVED (Rev 2):** Option (c) — make `sourceSchemaRef` and `targetSchemaRef` optional on both `MappingConfig` and `CreateMappingInput`. TypeScript enforces that every consumer handles the missing case. No magic empty strings or sentinel values. `MappingMetadata.sourceSchemaId` and `MappingMetadata.targetSchemaId` also become optional (`string | undefined`). The engine's `validate()` already handles the "no schema" case (skips path validation when schemas aren't provided). The Mapping Editor already shows a banner when schemas are missing. Downstream consumers of `MappingConfig` (e.g., `useMappingEditor`, `toEngineMappingConfig()`, `LocalStorageAdapter`) must add `?.` guards. Constraint added: mappings with undefined schema refs cannot be deployed (Phase 4 gate).

---

## Verification Strategy

- **Unit tests**: Hooks (`useProjectOverview`, `useCreateProject`, `useCreateMapping`, `useSchemaUpload`) tested with mock adapter — covers AE-01, AE-02, AE-03, AE-04, AE-05, AE-06, AE-07, AE-08.
- **Unit tests**: Schema format detection utility tested — covers AE-03, AE-04.
- **Component tests**: Project Overview page renders sections with mock data — covers AE-01, AE-09.
- **Component tests**: Create Project form validation and submission — covers AE-05.
- **Component tests**: Create Mapping wizard step navigation — covers AE-06, AE-07.
- **Component tests**: Confirmation dialogs for destructive actions — covers AE-08, AE-11.
- **Integration tests**: Full flow from create project → add schema → create mapping → navigate to editor — covers AE-05, AE-06.
- **Typecheck**: `tsc --noEmit` passes for all touched files.
- **Build**: `vite build` succeeds without errors.
- **Lint**: Zero ESLint errors.

---

## Task Generation Notes

This is a `ui` type spec. All tasks are `ui-task` agent except for a schema format detection utility which is `task` type.

Recommended decomposition:

1. **Feature scaffolding & types** (`ui-task`) — Create `features/projects/` structure, hooks barrel, components barrel, feature-local types.
2. **Schema format detection utility** (`task`) — Pure function, no React. Detects JSON Schema vs XSD vs sample data.
3. **useProjectOverview hook** (`ui-task`) — Loads project, schemas, mappings. Manages inline editing. Handles errors.
4. **Project Overview — Section A (Metadata)** (`ui-task`) — Inline-editable name/description/tags display.
5. **Project Overview — Section B (Schema Management)** (`ui-task`) — Schema cards, upload flow, link flow, remove.
6. **Project Overview — Section C (Mapping List)** (`ui-task`) — Sortable table with status/coverage/deploy badges, row actions.
7. **Project Overview — Section D (Actions)** (`ui-task`) — Action buttons (duplicate, delete, placeholders).
8. **Project Overview — Page Assembly** (`ui-task`) — Compose sections, wire to hook, replace placeholder page.
9. **Create Project wizard** (`ui-task`) — Form, validation, submission, navigation.
10. **Create Mapping flow** (`ui-task`) — Multi-step: name, source schema, target schema, submission.
11. **Schema Upload flow** (`ui-task`) — File picker, format detection integration, scope selection, parse + store.
12. **Confirmation dialogs** (`ui-task`) — Delete project, remove schema, delete mapping confirmations.
13. **Loading/error/not-found states** (`ui-task`) — Skeleton layout, error display, not-found page.

Sequencing: T-01 first, then T-02/T-03 in parallel, then T-04–T-07 (depend on T-03), T-08 (depends on T-04–T-07), T-09/T-10/T-11 (parallel, depend on T-01), T-12/T-13 integrated throughout.

---

## Change Log

- Rev 2 — 2026-05-01
  - Resolved Q1: Make `sourceSchemaRef`/`targetSchemaRef` optional on both `MappingConfig` and `CreateMappingInput` (option c). `MappingMetadata.sourceSchemaId`/`targetSchemaId` also optional.
  - Added constraint: mappings with undefined schema refs cannot be deployed (Phase 4 gate)
  - Updated AE-07 to use `undefined` instead of placeholder refs
  - Updated edge behavior for skipped schemas
- Rev 1 — 2026-05-01
  - Initial draft
