# FS-019: Playwright E2E Test Infrastructure

| Field | Value |
|-------|-------|
| Status | draft |
| Type | config |
| Priority | P1 |
| Depends on | FS-008, FS-009, FS-010, FS-012, FS-013, FS-014 |

## Context

KeyRa has unit and component tests (Vitest + React Testing Library) but no end-to-end tests that exercise the full application through a real browser. As the UI grows in complexity (multi-panel mapping editor, drag-and-drop, schema tree interactions), regressions increasingly slip through component-level tests. E2E tests provide confidence that integrated workflows function correctly from the user's perspective.

Phase 0 constraints simplify the E2E setup: the app runs entirely client-side with `LocalStorageAdapter`, so no backend services or network mocking are required. Tests seed localStorage directly and verify rendered output.

## Requirements

### Infrastructure
- Install and configure Playwright with TypeScript support
- Configure a single browser (Chromium) for Phase 0 to keep CI fast
- Playwright `webServer` config starts the Vite dev server automatically
- All test files live in `tests/e2e/` per project-structure.md conventions
- Shared fixtures, page objects, and helpers in `tests/e2e/fixtures/` and `tests/e2e/pages/`
- Add `pnpm test:e2e` script to root `package.json`
- Test data factories produce valid domain objects (projects, schemas, mappings)

### Page Object Models
- `AppPage` — base page object with common navigation helpers
- `ProjectListPage` — project list interactions
- `ProjectFormPage` — create/edit project form
- `SchemaListPage` — schema library list
- `SchemaDetailPage` — schema viewer with tree
- `MappingEditorPage` — multi-panel editor with panel slot selectors

### Test Coverage (Phase 0 Initial Suite)
- **Smoke tests**: app loads, all routes are accessible, navigation works
- **Project CRUD**: create project, view in list, edit, delete
- **Schema upload**: upload JSON Schema file, view in library, inspect tree
- **Mapping creation**: create mapping, assign schemas, verify editor panels load
- **Mapping editor interactions**: select source node, select target node, verify mapping row appears
- **Validation errors**: submit invalid forms, verify error messages display
- **Data persistence**: create entity, reload page, verify entity persists (localStorage)

### Performance & Reliability
- Total suite runs in < 60 seconds on a local dev machine
- Each test is independent — seeds its own data, tears down after
- No test-order dependencies
- Flaky-test mitigation: explicit waits on `data-testid` selectors, no arbitrary timeouts
- CI integration deferred to a follow-up spec

## Acceptance Criteria

- [ ] `pnpm test:e2e` runs all Playwright tests from workspace root and exits 0 on a clean app state
- [ ] Playwright config targets Chromium only, starts Vite dev server via `webServer`
- [ ] At least 6 page object models cover the primary routes
- [ ] Smoke test suite verifies all routes render without errors
- [ ] Happy-path test creates a project, uploads a schema, creates a mapping, and makes one field mapping
- [ ] Validation test verifies error messages on empty/invalid form submissions
- [ ] Each test seeds localStorage directly and cleans up after itself
- [ ] All tests pass in < 60 seconds total on a local dev machine
- [ ] Test data factories produce type-safe domain objects matching engine types
- [ ] Dedicated `.json` schema fixture files exist in `tests/e2e/fixtures/schemas/` (10-15 fields, 3+ nesting levels)

## Technical Approach

### Directory Structure
```
tests/
  e2e/
    playwright.config.ts
    fixtures/
      test-data.ts          # Factories for projects, schemas, mappings
      storage.ts            # localStorage seed/clear helpers
      base.ts              # Extended Playwright test with custom fixtures
      schemas/             # Real .json fixture files (10-15 fields each)
        patient.schema.json
        order.schema.json
        address.schema.json  # Nested 3+ levels for tree tests
      invalid/             # Invalid files for error tests
        not-json.txt
        invalid-schema.json
    pages/
      app.page.ts          # Base page object
      project-list.page.ts
      project-form.page.ts
      schema-list.page.ts
      schema-detail.page.ts
      mapping-editor.page.ts
    specs/
      smoke.spec.ts
      project-crud.spec.ts
      schema-upload.spec.ts
      mapping-creation.spec.ts
      mapping-editor.spec.ts
      validation.spec.ts
      persistence.spec.ts
```

### Key Patterns

**Custom Fixture (base.ts)**
Extends Playwright's `test` with pre-seeded storage and page objects:
```typescript
import { test as base } from '@playwright/test';
import { seedStorage, clearStorage } from './storage';
import { AppPage } from '../pages/app.page';

export const test = base.extend<{ appPage: AppPage }>({
  appPage: async ({ page }, use) => {
    await clearStorage(page);
    const appPage = new AppPage(page);
    await use(appPage);
    await clearStorage(page);
  },
});
```

**Storage Helpers (storage.ts)**
Directly manipulate localStorage via `page.evaluate()`:
```typescript
export async function seedStorage(page: Page, data: SeedData) {
  await page.evaluate((d) => {
    localStorage.setItem('keyra:projects', JSON.stringify(d.projects));
    localStorage.setItem('keyra:schemas', JSON.stringify(d.schemas));
    localStorage.setItem('keyra:mappings', JSON.stringify(d.mappings));
  }, data);
}
```

**Page Objects**
Each page object encapsulates selectors (via `data-testid`) and common interactions:
```typescript
export class MappingEditorPage {
  constructor(private page: Page) {}

  async goto(projectId: string, mappingId: string) {
    await this.page.goto(`/projects/${projectId}/mappings/${mappingId}`);
  }

  panel(slot: number) {
    return this.page.getByTestId(`panel-slot-${slot}`);
  }

  async selectSourceNode(path: string) { /* ... */ }
  async selectTargetNode(path: string) { /* ... */ }
}
```

### Configuration
- Playwright config: `tests/e2e/playwright.config.ts`
- Base URL: `http://localhost:5173` (Vite default)
- `webServer.command`: `pnpm --filter @keyra/ui dev`
- Timeout: 30s per test, 5s for actions
- Reporter: `html` (local development; CI reporter configured in follow-up)
- Retries: 0 (local; CI retries configured in follow-up)
- `test:e2e` script lives in root `package.json` (workspace-level concern)

## Resolved Questions

- `Q1.` **Defer visual regression to a later spec.** Screenshot comparison adds significant maintenance burden (flaky due to font rendering, anti-aliasing, OS differences). Phase 0 priority is functional correctness, not pixel-perfect regression. Add visual regression when the design system stabilizes (post-Phase 2 when all panels are built and unlikely to change layout).
- `Q2.` **Workspace root.** Tests live in `tests/e2e/` (at the root), test the full app (not just the `ui/` package), and need the dev server running. Put `test:e2e` in the root `package.json`. The script starts the Vite dev server and runs Playwright against it — that's a workspace-level concern.
- `Q3.` **Dedicated fixture files.** Use real `.json` fixture files in `tests/e2e/fixtures/schemas/`. Reasons: (1) reusable across multiple tests without copy-paste, (2) human-readable and reviewable, (3) serve as documentation of what "a typical schema" looks like, (4) generating schemas in-memory couples test setup to implementation details that may drift. Keep fixtures small (10-15 fields) — enough to exercise tree, search, and validation without being unwieldy.
- `Q4.` **Defer CI to a follow-up.** This spec establishes local testing infrastructure, scripts, and initial test suite. A GitHub Actions workflow is a separate concern (needs secrets config, caching strategy, parallelization decisions, possibly Docker for consistent rendering). Add it as a one-task follow-up spec or include it in FS-020 (backend integration) where CI/CD for deployments is being set up.
