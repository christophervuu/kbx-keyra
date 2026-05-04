# SPEC

## Title

Schema Library Page

---

## ID

FS-016

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

Build the Schema Library page (`/schemas`) per Section 6.5 of the product spec. A searchable, filterable, sortable list of all schemas (global and project-level) from `LocalStorageAdapter`. Each schema is displayed as a card showing metadata, origin badge, scope badge, field count, format, and sync status. Clicking a card navigates to the Schema Detail page (`/schemas/:schemaId`, FS-015).

---

## Problem

The Schema Library route (`/schemas`) currently renders a placeholder page ("Coming Soon"). Users have no way to browse, search, or filter the collection of schemas stored in localStorage. There is no aggregate view showing schema metadata, sync status, or usage information across projects. Users must navigate to individual Project Overview pages to discover which schemas exist in the system.

---

## Goal

Deliver a fully functional Schema Library page that:

1. Displays all schemas from `LocalStorageAdapter` as visually rich cards with metadata.
2. Provides instant client-side search by name and description.
3. Supports multi-select filtering by origin, format, and scope.
4. Supports sorting by name, field count, last modified, and origin.
5. Navigates to the Schema Detail page on card click.
6. Handles loading, empty, and error states gracefully.
7. Integrates with the existing app shell (routing, layout, breadcrumbs, shared primitives).

---

## Assumptions

- FS-008 is complete: scaffold, shared primitives, routing, `LocalStorageAdapter`.
- FS-013 is complete: schemas are created/uploaded on Project Overview pages and stored in localStorage.
- FS-015 T-01 is complete: `SchemaMetadata` is extended with `scope` (`'global' | 'project'`), `description`, `inferred?: boolean`, and `syncStatus` (`'synced' | 'not-synced' | 'local-changes'`) fields.
- Schema counts remain below 100 in Phase 0, making client-side operations practical without pagination or virtualization.
- The "Inferred" format display is derived directly from `SchemaMetadata.inferred` field (populated at creation time).
- All schemas are accessible via `adapter.listSchemas()` regardless of project association.
- No new `ApiAdapter` methods are required — `listSchemas()` and `listProjects()` are sufficient.

---

## Current Context

**Existing page:** `ui/src/routes/pages/SchemaLibrary.tsx` — placeholder rendering "Coming Soon" with `data-testid="page-schema-library"`.

**Domain types (`ui/src/lib/types/domain.ts`):**
- `SchemaMetadata` has: `schemaId`, `name`, `format`, `fieldCount`, `origin`, `status`, `source`, `createdAt`, `updatedAt`. After FS-015 T-01: adds `scope`, `description`, `updatedBy`, `inferred`, `syncStatus`.
- `SchemaOrigin` = `'cdm' | 'published' | 'local'`.
- `SchemaFormat` = `'json-schema' | 'xsd'`.
- `SchemaSourceInfo` = `GitHubSourceInfo | UploadSourceInfo`.

**ApiAdapter:** Has `listSchemas(): Promise<SchemaMetadata[]>` and `listProjects(): Promise<ProjectMetadata[]>`.

**Feature module:** `ui/src/features/schemas/` exists with parsers, tree view, types, and hooks. No page-level components for Schema Library currently exist.

**Route:** `PATHS.SCHEMA_LIBRARY = '/schemas'` is registered in `ui/src/routes/paths.ts`.

**Breadcrumb:** Derived from path segments — `/schemas` renders as "Home > Schema Library" automatically via `Breadcrumbs` component.

---

## Scope

### In Scope

- Schema Library page component displaying all schemas as cards.
- Schema card component with: name, origin badge, scope badge, field count, format display, project usage count, sync status indicator.
- Search input with instant client-side filtering by schema name and description.
- Multi-select filters for origin (CDM / Published / Local), format (JSON Schema / XSD / Inferred), and scope (Global / Project-Level).
- Filter display as removable chips/tags with "Clear all" action.
- Sort controls for name (alpha), field count (numeric), last modified (date), origin. Default: last modified descending.
- Empty state with appropriate messaging.
- Loading state with skeleton cards.
- Error state with inline banner and retry button.
- Schema count display in page header.
- Click-to-navigate from card to `/schemas/:schemaId`.
- Integration with app shell layout, NavBar, and breadcrumbs.
- Data hook that loads schemas and projects, derives enriched display model.

### Out of Scope

- Schema upload or creation actions (those live on Project Overview per Section 5.3 principle #4).
- Schema editing (that's on Schema Detail, FS-015).
- Pagination or infinite scroll (schema count < 100 in Phase 0).
- Backend communication — all data from `LocalStorageAdapter`.
- Mobile/responsive layout (desktop-first per Phase 0 constraints).
- Virtualization (not needed for < 100 items).

---

## Non-Goals

- This page does not provide any write operations on schemas.
- This page does not implement GitHub sync status refresh — sync indicators are derived from stored metadata.
- This page does not replace the schema cards shown on Project Overview — those remain project-scoped.
- This page does not implement advanced full-text search — simple substring matching is sufficient.

---

## Relevant Areas

- `ui/src/routes/pages/SchemaLibrary.tsx` — current placeholder (to be updated to render feature page)
- `ui/src/features/schemas/` — feature module (new page and list components added here)
- `ui/src/features/schemas/components/` — new SchemaLibraryPage, SchemaLibraryCard, filter components
- `ui/src/features/schemas/hooks/` — new `use-schema-library.ts` data hook
- `ui/src/features/schemas/lib/` — new `schema-filters.ts` filter/sort utilities
- `ui/src/lib/types/domain.ts` — `SchemaMetadata` type (reads `scope`, `description` added by FS-015)
- `ui/src/lib/api/types.ts` — `ApiAdapter` interface (read-only usage)
- `ui/src/components/` — shared primitives (PageHeader, Card, StatusBadge, Button)
- `forge/architecture/project-structure.md` — update with new files

---

## Dependencies / Blockers

- Depends on FS-008 (UI Scaffold) — **satisfied** (completed)
- Depends on FS-013 (Project Overview) — **satisfied** (completed); schemas are created there
- Depends on FS-015 T-01 (domain type extension adding `scope`, `description`, `inferred`, and `syncStatus` to `SchemaMetadata`) — must be completed before FS-016 implementation begins

---

## Constraints

- No backend dependency. All data from `LocalStorageAdapter`.
- Must integrate with FS-008's app shell (routing, layout, shared primitives).
- No schema upload or creation actions on this page.
- TypeScript strict mode, zero lint/typecheck errors.
- Tailwind CSS 4 for styling.
- No external state management libraries (Phase 0 rules).
- Desktop-first (1024px minimum).
- Client-side filtering only — no debounce needed given < 100 schemas.
- Cards must be keyboard-accessible (focusable, Enter/Space to navigate).

---

## Proposed Behavior

### User Flow

1. **Navigate:** User clicks "Schema Library" in the global NavBar (or navigates directly to `/schemas`).
2. **Load:** Page shows skeleton cards while loading data from localStorage.
3. **View:** User sees all schemas rendered as cards in a grid. Page header shows "Schema Library (N schemas)".
4. **Search:** User types in search input. List filters instantly by matching schema name or description (case-insensitive substring).
5. **Filter:** User selects filter toggles (origin, format, scope). Active filters appear as removable chips above the list. Filters combine with AND between categories, OR within a category.
6. **Sort:** User selects sort option (name, field count, last modified, origin). List reorders. Sort indicator shows current sort + direction.
7. **Navigate to detail:** User clicks a schema card. Browser navigates to `/schemas/:schemaId`.
8. **Clear filters:** User clicks individual chip × to remove a single filter, or "Clear all filters" to reset.

### System Behavior

**Page load:**
- Call `adapter.listSchemas()` to get all `SchemaMetadata[]`.
- Call `adapter.listProjects()` to get all `ProjectMetadata[]` (for deriving project usage counts).
- Cross-reference: for each schema, count projects whose `schemaRefs[]` contain a matching `schemaId`.
- Derive sync status directly from `SchemaMetadata.syncStatus`:
  - `'synced'` → "✓ Synced"
  - `'not-synced'` → "⚠ Not synced"
  - `'local-changes'` → "⚠ Local changes"
  - (In Phase 0 with no GitHub, all schemas show "⚠ Not synced" — correct and expected)
- Derive display format:
  - `inferred === true` → "Inferred"
  - `format === 'json-schema'` and not inferred → "JSON Schema"
  - `format === 'xsd'` → "XSD"
- Build enriched display model for each schema card.

**Search:**
- Filter schemas where `name` or `description` includes the search term (case-insensitive).
- Applied after filter narrowing.

**Filtering:**
- Each filter category (origin, format, scope) supports multi-select.
- Within a category: OR logic (e.g., selecting "CDM" and "Local" shows both).
- Between categories: AND logic (e.g., origin=CDM AND format=JSON Schema).
- No selection within a category = all values pass (filter inactive for that category).
- Active filters displayed as removable chips.

**Sorting:**
- Sort options: Name (A-Z, Z-A), Field Count (asc, desc), Last Modified (newest, oldest), Origin (CDM > Published > Local, or reverse).
- Default: Last Modified, descending (newest first).
- Only one sort active at a time.

**Card display:**
- Schema name (primary text)
- Origin badge: 📚 CDM (purple) / 📄 Published (blue) / 💾 Local (green)
- Scope badge: Global / Project-Level
- Field count: "{N} fields"
- Format: JSON Schema / XSD / Inferred
- Projects using: "Used by {N} projects" as text. Hover tooltip lists project names (up to 5). If > 5: first 5 + "and {N} more."
- Sync status: ✓ Synced / ⚠ Not synced / ⚠ Local changes
- Click/keyboard → navigate to `/schemas/${schemaId}`

### Failure / Edge Behavior

- **Loading:** Skeleton cards (6-8 placeholder cards with shimmer animation).
- **Error loading schemas:** Inline error banner with message "Failed to load schemas" and retry button. Banner uses `role="alert"`.
- **Empty state (no schemas at all):** Centered empty illustration with heading "No schemas available" and subtext "Upload a schema from a Project Overview page, or link one from the CDM library." No upload action on this page.
- **Empty search/filter results:** Message "No schemas match the current filters" with option to clear filters. This is distinct from the empty state (which means zero schemas exist).
- **Schema without description:** Search still works on name only. Card displays without description line.
- **Schema with no project usage:** Shows "Not used" or "0 projects" in project count area.
- **Failed project load (for usage counts):** Display schema cards without project usage info (graceful degradation). Show usage as "—" or omit.

---

## Acceptance Examples

### AE-01 — Full schema list renders with metadata

**Given**
- 3 schemas in localStorage:
  - `S-1`: name="Patient", origin="cdm", format="json-schema", fieldCount=25, scope="global", source={type:"github", commitSha:"abc"}
  - `S-2`: name="Order", origin="local", format="json-schema", fieldCount=12, scope="project", source={type:"upload"}
  - `S-3`: name="HL7v2 ADT", origin="published", format="xsd", fieldCount=40, scope="global", source={type:"github", commitSha:"def"}
- 1 project `P-1` references S-1 and S-2

**When**
- User navigates to `/schemas`

**Then**
- Page header shows "Schema Library (3 schemas)"
- 3 cards rendered, each showing name, origin badge, scope badge, field count, format, project count, sync status
- S-1 card: "Patient", CDM badge, Global badge, "25 fields", "JSON Schema", "1 project", "✓ Synced"
- S-2 card: "Order", Local badge, Project-Level badge, "12 fields", "JSON Schema", "1 project", upload status
- S-3 card: "HL7v2 ADT", Published badge, Global badge, "40 fields", "XSD", "0 projects", "✓ Synced"

### AE-02 — Search filters by name and description

**Given**
- Schemas: "Patient" (desc: "Core patient demographics"), "Order" (desc: "Lab orders"), "Address" (desc: "Patient address")

**When**
- User types "patient" in search input

**Then**
- Results show "Patient" and "Address" (both match "patient" — one in name, one in description)
- "Order" is filtered out
- Count updates to show filtered count

### AE-03 — Multi-select filter with AND/OR logic

**Given**
- Schemas: S-1 (cdm, json-schema, global), S-2 (local, json-schema, project), S-3 (published, xsd, global), S-4 (local, xsd, project)

**When**
- User selects origin filter: "CDM" AND "Local"
- User selects format filter: "JSON Schema"

**Then**
- Results show S-1 and S-2 only
- S-1 matches: origin=(CDM ∈ {CDM, Local}) AND format=(json-schema ∈ {JSON Schema})
- S-2 matches: origin=(Local ∈ {CDM, Local}) AND format=(json-schema ∈ {JSON Schema})
- S-3 excluded: origin=published not in selected origins
- S-4 excluded: format=xsd not in selected formats
- Active filter chips shown: "CDM", "Local", "JSON Schema"

### AE-04 — Sort by field count descending

**Given**
- Schemas: "Patient" (25 fields), "Order" (12 fields), "HL7v2 ADT" (40 fields)

**When**
- User selects sort: "Field Count" descending

**Then**
- Cards ordered: HL7v2 ADT (40), Patient (25), Order (12)
- Sort indicator shows active sort column and direction

### AE-05 — Empty state with no schemas

**Given**
- No schemas in localStorage

**When**
- User navigates to `/schemas`

**Then**
- Page header shows "Schema Library (0 schemas)"
- Empty state displayed with icon
- Heading: "No schemas available"
- Subtext: "Upload a schema from a Project Overview page, or link one from the CDM library."
- No upload/create button on this page

### AE-06 — Loading state shows skeleton

**Given**
- Schemas exist in localStorage

**When**
- Page is loading (adapter call in progress)

**Then**
- Skeleton cards displayed (shimmer/pulse animation)
- `role="status"` with screen-reader-only "Loading schemas" text
- No search/filter controls active during loading

### AE-07 — Error state with retry

**Given**
- `adapter.listSchemas()` throws an error

**When**
- Page load fails

**Then**
- Inline error banner: "Failed to load schemas"
- Banner has `role="alert"`
- Retry button present
- Clicking retry re-calls `adapter.listSchemas()`

### AE-08 — Card click navigates to Schema Detail

**Given**
- Schema S-1 with `schemaId="s-abc-123"`

**When**
- User clicks on S-1's card (or presses Enter/Space while focused)

**Then**
- Browser navigates to `/schemas/s-abc-123`
- Navigation uses `react-router` (no full page reload)

### AE-09 — Filter chips and clear all

**Given**
- Active filters: origin="CDM", scope="Global"

**When**
- User clicks × on "CDM" chip

**Then**
- Origin filter for "CDM" removed
- Schema list updates to show all origins with scope="Global"
- Only "Global" chip remains

**When**
- User clicks "Clear all filters"

**Then**
- All filter chips removed
- Full schema list displayed (search term also cleared)

### AE-10 — No results for current filters

**Given**
- All schemas have origin="local"

**When**
- User filters by origin="CDM"

**Then**
- No cards displayed
- Message: "No schemas match the current filters"
- "Clear filters" action available
- This is visually distinct from AE-05 (no schemas exist)

---

## Resolved Questions

- `Q1.` **Add `inferred?: boolean` to `SchemaMetadata`.** One-line type addition, set at creation time when `parseInferredSchema()` is used. Avoids loading full content just to render a list. Added as part of FS-015 T-01 (which already touches `SchemaMetadata` for the `scope` field addition).
- `Q2.` **Show "Local changes" via `syncStatus` field.** FS-015 adds `syncStatus: 'synced' | 'not-synced' | 'local-changes'` to `SchemaMetadata` (or derives it from `lastSyncedAt` + `updatedAt` comparison). The library page displays this directly from metadata. In Phase 0 with no GitHub, all schemas show "Not synced" — which is correct and communicates the intended workflow.
- `Q3.` **Count as primary, tooltip for names ≤ 5.** On the list card: "Used by N projects". Hover → tooltip lists project names. If > 5 projects, tooltip shows first 5 + "and N more." This keeps the card compact while still being informative.

---

## Verification Strategy

- **Unit tests:** Filter/sort utility functions (pure logic), enriched schema derivation, search matching.
- **Component tests:** SchemaLibraryPage renders correctly in all states (loading, error, empty, loaded). Card renders all metadata. Search filters correctly. Filters apply AND/OR logic. Sort reorders. Navigation on click/keyboard.
- **Build/typecheck/lint:** `pnpm tsc --noEmit` and `pnpm lint` must pass with zero errors.
- **Manual verification:** Visual layout matches card description; badges display correct colors; skeleton animation visible; breadcrumb shows correctly.

AE-01 through AE-10 should all have automated coverage through component tests.

---

## Task Generation Notes

This is a `ui` type spec. All tasks are `Agent: ui-task` except T-05 (architecture update) which is `Agent: task`.

Recommended decomposition:

1. **T-01:** Schema Library data hook + filter/sort utilities (pure logic + hook)
2. **T-02:** Schema card component (individual card with badges, metadata, click handling)
3. **T-03:** Search, filter, and sort controls (input, multi-select toggles, chips, sort dropdown)
4. **T-04:** Schema Library page assembly (shell, states, wiring, breadcrumb, integration)
5. **T-05:** Update `project-structure.md` with new file entries

T-01 is prerequisite for T-04. T-02 and T-03 are prerequisites for T-04. T-01, T-02, and T-03 can be developed in parallel.

---

## Change Log

- Rev 2 — 2026-05-02
  - Resolved all Open Questions (Q1–Q3) with definitive answers
  - Q1: `inferred?: boolean` added to SchemaMetadata via FS-015 T-01
  - Q2: `syncStatus` field added to SchemaMetadata via FS-015 T-01; library reads it directly
  - Q3: Card shows "Used by N projects" with hover tooltip (names ≤ 5, truncated beyond)
  - Updated assumptions to reflect new metadata fields
  - Updated sync status derivation to use `syncStatus` field directly (not derived from source)
  - Updated format derivation to use `inferred` field directly
  - Renamed section from "Open Questions" to "Resolved Questions"
- Rev 1 — 2026-05-02
  - Initial draft
