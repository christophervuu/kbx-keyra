# SPEC

## Title

Rename Advanced Testing to Test Lab and Make It a Dedicated Full-Bleed Workspace

---

## ID

FS-032

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-09
Last Updated: 2026-05-09
Type: ui

---

## Status

completed

---

## Revision

Rev: 1

---

## Summary

Rename the "Advanced Testing" page to "Test Lab" throughout the UI, change the route segment from `/test` to `/test-lab`, suppress breadcrumbs on the page, and render it in a full-bleed layout matching the Mapping Editor workspace pattern. This low-risk, high-clarity change sets intentional naming and workspace semantics before deeper UX changes land, reducing visual friction and making the testing surface feel like a first-class workspace rather than a bolted-on feature.

---

## Problem

The current "Advanced Testing" page has three issues:

1. **Naming friction.** "Advanced Testing" sounds like a power-user escape hatch rather than a purpose-built workspace. The name discourages regular use.
2. **Layout mismatch.** The page renders inside the standard constrained content container (`max-w-7xl` with `px-6 py-6` padding), which wastes screen space for a workspace that benefits from full width and height. The Mapping Editor already uses a full-bleed layout; the testing surface should match.
3. **Breadcrumb noise.** Breadcrumbs render on the page showing path segments like "Projects > {id} > Mappings > {id} > Test". This is unnecessary visual clutter for a focused workspace that already provides its own top bar with "Back to Editor" navigation and mapping context.

---

## Goal

After this change:

- All visible UI copy says "Test Lab" instead of "Advanced Testing"
- The URL path uses `/test-lab` instead of `/test`
- The page renders in a full-bleed workspace layout (no `max-w-7xl` constraint, no padding)
- Breadcrumbs are suppressed on this page
- The page top bar continues to show "Back to Editor" navigation and mapping context
- Test IDs are updated to use a `test-lab-` prefix for consistency

---

## Assumptions

- The Mapping Editor full-bleed layout pattern in `AppLayout.tsx` is the correct model to follow
- No external systems or bookmarks depend on the `/test` URL path (Phase 0, local-only operation)
- No other pages currently link to the test page besides `InlinePreviewStrip`

---

## Current Context

### Route and PATHS constant

The test page route is registered in `App.tsx` at path `/projects/:projectId/mappings/:mappingId/test`. The PATHS constant in `paths.ts` is:

```ts
MAPPING_TEST: '/projects/:projectId/mappings/:mappingId/test',
```

### Layout and breadcrumb suppression

`AppLayout.tsx` uses a single `useMatch()` check against the Mapping Editor route to decide breadcrumb suppression and full-bleed layout:

```tsx
const isMappingEditorRoute = useMatch('/projects/:projectId/mappings/:mappingId') !== null;
```

When this matches:
- Breadcrumbs are hidden
- Content renders in `<main className="flex-1">` (no padding, no max-width)

When it does not match (including the current Advanced Testing route):
- Breadcrumbs are shown
- Content renders inside `<main className="flex-1 px-6 py-6"><div className="mx-auto max-w-7xl">...</div></main>`

The Advanced Testing route (`/test` suffix) does NOT match the `useMatch()` pattern, so it gets breadcrumbs and constrained layout.

### AdvancedTestingPage component structure

- **Route wrapper:** `MappingAdvancedTesting.tsx` in `routes/pages/` — extracts route params, renders `<AdvancedTestingPage>`
- **Feature component:** `AdvancedTestingPage.tsx` in `features/mappings/components/` — 340 lines, wraps content in its own `<PreviewProvider>`, uses `useMappingEditor(mappingId)` to load config/schemas independently
- The component already uses `h-[calc(100vh-3.5rem)]` to attempt full viewport usage, but the AppLayout wrapper constrains it

### Navigation entry points to the test page

Two links exist in `InlinePreviewStrip.tsx`:
1. Toolbar link: `"Open Advanced Testing"` with test-id `strip-advanced-testing-link`
2. Error status bar link: `"Open Advanced Testing ->"` with test-id `strip-status-bar-advanced-testing-link`

Both construct the URL inline: `/projects/${projectId}/mappings/${mappingId}/test`

### Test IDs using "advanced-testing" prefix

- `advanced-testing-page` (AdvancedTestingPage root)
- `advanced-testing-topbar` (AdvancedTestingPage top bar)
- `strip-advanced-testing-link` (InlinePreviewStrip toolbar link)
- `strip-status-bar-advanced-testing-link` (InlinePreviewStrip error link)

### ConnectedInlinePreviewStrip URL construction

`ConnectedInlinePreviewStrip.tsx` constructs the URL at line 190:
```tsx
testingPageUrl={`/projects/${projectId}/mappings/${mappingId}/test`}
```

---

## Scope

### In Scope

- Rename `PATHS.MAPPING_TEST` value from `/test` to `/test-lab` segment
- Update route registration in `App.tsx` to use `/test-lab`
- Rename visible UI copy from "Advanced Testing" to "Test Lab" in all components
- Update "Open Advanced Testing" links to "Open Test Lab" in `InlinePreviewStrip.tsx`
- Update URL construction in `ConnectedInlinePreviewStrip.tsx` to use `/test-lab`
- Extend `AppLayout.tsx` breadcrumb suppression to also cover the test-lab route
- Extend `AppLayout.tsx` full-bleed layout to also cover the test-lab route
- Rename route page wrapper from `MappingAdvancedTesting.tsx` to `MappingTestLab.tsx`
- Rename feature component from `AdvancedTestingPage.tsx` to `TestLabPage.tsx`
- Update component function names (`AdvancedTestingPage` -> `TestLabPage`, `AdvancedTestingInner` -> `TestLabInner`, etc.)
- Rename test-ids from `advanced-testing-*` to `test-lab-*`
- Update all test files referencing renamed components, test-ids, and paths
- Update `EditorTopBar.tsx` if it constructs any test-page URLs
- Update architecture document to reflect new names, route, and layout pattern

### Out of Scope

- Changes to the Test Lab page functionality, features, or internal UX
- Changes to the Mapping Editor page
- Changes to the test case data model or storage keys
- Changes to the PreviewProvider or execution hooks
- Document title / `<title>` tag management (no current mechanism exists)
- Mobile responsiveness
- New features or capabilities for the testing surface

---

## Non-Goals

- This spec is not redesigning the Test Lab page UX — only renaming and adjusting layout/routing
- This spec is not introducing a general "focused workspace" abstraction — it pragmatically extends the existing AppLayout branching
- This spec is not adding new navigation paths to the Test Lab beyond the existing entry points

---

## Relevant Areas

- `ui/src/routes/paths.ts` — PATHS constant
- `ui/src/App.tsx` — route registration and import
- `ui/src/components/layout/AppLayout.tsx` — breadcrumb suppression + layout branching
- `ui/src/routes/pages/MappingAdvancedTesting.tsx` — route page wrapper (rename to `MappingTestLab.tsx`)
- `ui/src/features/mappings/components/AdvancedTestingPage.tsx` — feature component (rename to `TestLabPage.tsx`)
- `ui/src/features/mappings/components/InlinePreviewStrip.tsx` — "Open Advanced Testing" link text + test-ids
- `ui/src/features/mappings/components/ConnectedInlinePreviewStrip.tsx` — URL construction
- `ui/src/features/mappings/components/AdvancedTestingPage.test.tsx` — test file (rename)
- `ui/src/features/mappings/components/InlinePreviewStrip.test.tsx` — test assertions
- `ui/src/features/mappings/index.ts` — feature barrel re-exports ?
- `forge/architecture/ui-application.md` — routing table, Advanced Testing Page section, component hierarchy

---

## Dependencies / Blockers

- none

---

## Constraints

- Must preserve the existing behavior of breadcrumb suppression and full-bleed layout for the Mapping Editor route
- Must preserve the Test Lab page's functionality exactly (only naming, routing, and layout container change)
- Must keep test-ids stable within this spec (old test-ids become the new `test-lab-*` IDs)
- The `AppLayout.tsx` breadcrumb/layout pattern should remain simple and readable — avoid over-engineering a route matching system
- All existing tests must pass after updates (no functionality regressions)

---

## Proposed Behavior

### User Flow

1. User is in the Mapping Editor and clicks "Open Test Lab" in the inline preview strip toolbar or error status bar
2. Browser navigates to `/projects/:projectId/mappings/:mappingId/test-lab`
3. The page renders with:
   - NavBar at the top (global navigation)
   - No breadcrumbs
   - Full-bleed content (no padding, no max-width constraint)
   - The Test Lab top bar showing "Back to Editor" link and mapping name/version
4. All visible text says "Test Lab" — no remnants of "Advanced Testing"
5. Clicking "Back to Editor" returns to the Mapping Editor

### System Behavior

**AppLayout changes:**
- The layout branching in `AppLayout.tsx` is extended to recognize the Test Lab route as a "focused workspace" route alongside the Mapping Editor
- Implementation approach: introduce a second `useMatch()` for the test-lab route pattern and combine with `isMappingEditorRoute` using a general `isFocusedWorkspace` flag (or similar)
- When either the Mapping Editor or Test Lab route matches: breadcrumbs are suppressed and full-bleed `<main>` is used

**Route changes:**
- `PATHS.MAPPING_TEST` value changes from `'/projects/:projectId/mappings/:mappingId/test'` to `'/projects/:projectId/mappings/:mappingId/test-lab'`
- The route in `App.tsx` changes to match the new path
- The route page component import changes from `MappingAdvancedTesting` to `MappingTestLab`

**Component renames:**
- `MappingAdvancedTesting.tsx` -> `MappingTestLab.tsx` (route page wrapper)
- `AdvancedTestingPage.tsx` -> `TestLabPage.tsx` (feature component)
- `AdvancedTestingPage.test.tsx` -> `TestLabPage.test.tsx` (test file)
- Internal function names follow: `AdvancedTestingPage` -> `TestLabPage`, `MappingAdvancedTesting` -> `MappingTestLab`
- Feature barrel updated if it re-exports the component

**Link updates:**
- `InlinePreviewStrip.tsx`: "Open Advanced Testing" -> "Open Test Lab"; "Open Advanced Testing ->" -> "Open Test Lab ->"
- `ConnectedInlinePreviewStrip.tsx`: URL changes from `/test` to `/test-lab`
- Any other URL constructions referencing the old path are updated

**Test-ID renames:**
- `advanced-testing-page` -> `test-lab-page`
- `advanced-testing-topbar` -> `test-lab-topbar`
- `strip-advanced-testing-link` -> `strip-test-lab-link`
- `strip-status-bar-advanced-testing-link` -> `strip-status-bar-test-lab-link`

### Failure / Edge Behavior

- If a user has bookmarked the old `/test` URL, they will see the Not Found page. This is acceptable in Phase 0 (local-only, no external link sharing). No redirect is implemented.
- If the `AdvancedTestingPage` height calculation (`h-[calc(100vh-3.5rem)]`) was compensating for breadcrumbs + padding, it may need adjustment after the layout change removes the breadcrumbs. The full-bleed layout provides the flex container directly, so the component should verify correct viewport filling.

---

## Acceptance Examples

### AE-01 — Test Lab link text in inline preview strip

**Given**
- User is on the Mapping Editor page with the inline preview strip expanded

**When**
- User looks at the preview strip toolbar

**Then**
- The link reads "Open Test Lab" (not "Open Advanced Testing")
- The link test-id is `strip-test-lab-link`
- Clicking the link navigates to `/projects/:projectId/mappings/:mappingId/test-lab`

### AE-02 — Test Lab page renders without breadcrumbs

**Given**
- User navigates to `/projects/proj-1/mappings/map-1/test-lab`

**When**
- The page loads

**Then**
- The NavBar is visible at the top
- No breadcrumb bar is rendered below the NavBar
- The Test Lab top bar with "Back to Editor" and mapping context is visible

### AE-03 — Test Lab page uses full-bleed layout

**Given**
- User navigates to `/projects/proj-1/mappings/map-1/test-lab`

**When**
- The page loads

**Then**
- The page content fills the full viewport width (no `max-w-7xl` constraint)
- No horizontal padding from the outer content wrapper
- The page content fills the available viewport height below the NavBar

### AE-04 — Mapping Editor breadcrumbs unaffected

**Given**
- User navigates to `/projects/proj-1/mappings/map-1` (Mapping Editor)

**When**
- The page loads

**Then**
- Breadcrumbs are still suppressed on the Mapping Editor (existing behavior preserved)
- Full-bleed layout is still used (existing behavior preserved)

### AE-05 — Regular pages retain breadcrumbs and constrained layout

**Given**
- User navigates to `/projects/proj-1` (Project Overview)

**When**
- The page loads

**Then**
- Breadcrumbs are shown
- Content is rendered inside the constrained `max-w-7xl` wrapper with padding

### AE-06 — Back to Editor navigation

**Given**
- User is on the Test Lab page

**When**
- User clicks "Back to Editor"

**Then**
- Browser navigates to `/projects/:projectId/mappings/:mappingId` (Mapping Editor)

### AE-07 — Error status bar link updated

**Given**
- User is on the Mapping Editor with an execution error in the inline preview strip

**When**
- The error status bar is visible

**Then**
- The link reads "Open Test Lab ->" (not "Open Advanced Testing ->")
- The link test-id is `strip-status-bar-test-lab-link`

### AE-08 — Old URL returns Not Found

**Given**
- User navigates to `/projects/proj-1/mappings/map-1/test` (old URL)

**When**
- The page loads

**Then**
- The Not Found page is displayed

### AE-09 — Component test-ids updated

**Given**
- The Test Lab page is rendered

**When**
- Querying for test-ids

**Then**
- `test-lab-page` exists on the root element
- `test-lab-topbar` exists on the top bar
- No elements with `advanced-testing-*` test-ids exist

### AE-10 — Route constant updated

**Given**
- A developer imports `PATHS` from `routes/paths`

**When**
- Accessing `PATHS.MAPPING_TEST`

**Then**
- The value is `'/projects/:projectId/mappings/:mappingId/test-lab'`

---

## Open Questions

- none

---

## Verification Strategy

- **AE-01, AE-07**: Verified by updated `InlinePreviewStrip.test.tsx` tests asserting new link text, test-ids, and navigation URLs
- **AE-02, AE-03, AE-04, AE-05**: Verified by `AppLayout` tests or manual verification that the layout branching works correctly for editor, test-lab, and regular routes
- **AE-06**: Verified by existing "Back to Editor" test in `TestLabPage.test.tsx` (renamed file, preserved assertion)
- **AE-08**: Verified manually or by a test confirming the old route is no longer registered
- **AE-09**: Verified by updated `TestLabPage.test.tsx` tests asserting new test-ids
- **AE-10**: Verified by typecheck (any code using the old constant value would fail at compile time after the change)
- All tasks must pass: `pnpm typecheck`, `pnpm lint`, `pnpm test` in the `ui/` workspace

---

## Task Generation Notes

This work is entirely UI-focused. Tasks should be decomposed as follows:

1. **Route and PATHS update** (ui-task): Update `paths.ts`, `App.tsx` route registration, and import. This is the foundation — other tasks depend on the new path being available.
2. **AppLayout breadcrumb suppression + full-bleed layout** (ui-task): Extend the layout branching to cover the test-lab route. Can be done in parallel with component renames since it touches a different file.
3. **Component renames** (ui-task): Rename files, function names, imports, test-ids in `AdvancedTestingPage.tsx` -> `TestLabPage.tsx` and `MappingAdvancedTesting.tsx` -> `MappingTestLab.tsx`. Update feature barrel if needed.
4. **InlinePreviewStrip link updates** (ui-task): Rename link text, test-ids, and update URL construction in `ConnectedInlinePreviewStrip.tsx`. Can parallelize with component renames.
5. **Test file updates** (ui-task): Rename test file, update all test descriptions, assertions, and test-id lookups. Depends on component renames and link updates being done first.
6. **Architecture update** (task): Update `ui-application.md` to reflect the new route path, component names, layout pattern, and section naming. Update `INDEX.md` date if needed.

Tasks 2, 3, and 4 can proceed in parallel after Task 1. Task 5 depends on 3 and 4. Task 6 can run after all UI tasks.

---

## Change Log

- Rev 1 — 2026-05-09
  - Initial draft
