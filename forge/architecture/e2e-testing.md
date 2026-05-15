# E2E Testing Architecture

## Overview

End-to-end tests exercise KeyRa through a real browser using Playwright. They verify that integrated user workflows function correctly from a user's perspective — navigation, form submission, data persistence, and multi-component interactions.

Phase 0 status note: the E2E harness described below is an architecture target and is **not yet implemented in this repository** (`tests/e2e/` is currently absent).

E2E tests complement the existing unit/component test layer (Vitest + React Testing Library) by catching integration issues that isolated tests miss: routing failures, localStorage serialization bugs, cross-component state propagation, and render lifecycle problems.

## Scope

- Full user journey tests (create project → upload schema → create mapping → map fields)
- Route accessibility and navigation
- Form validation and error handling
- Data persistence across page reloads
- Multi-panel editor interactions

## Directory Structure

```
tests/
  e2e/
    playwright.config.ts       # Playwright configuration
    fixtures/
      base.ts                 # Extended test with custom fixtures
      storage.ts              # localStorage seed/clear helpers
      test-data.ts            # Domain object factories
      schemas/                # JSON Schema fixture files for upload tests
      invalid/                # Invalid fixture files for error tests
    pages/
      app.page.ts             # Base page object (shell, nav)
      project-list.page.ts    # Project list interactions
      project-form.page.ts    # Project create/edit form
      schema-list.page.ts     # Schema library
      schema-detail.page.ts   # Schema viewer + tree
      mapping-editor.page.ts  # Multi-panel mapping editor
    specs/
      smoke.spec.ts           # Route loading & navigation
      project-crud.spec.ts    # Project lifecycle
      schema-upload.spec.ts   # Schema import & tree
      mapping-creation.spec.ts # Mapping setup
      mapping-editor.spec.ts  # Field mapping interactions
      validation.spec.ts      # Error states & validation
      persistence.spec.ts     # localStorage survival
    test-results/             # (gitignored) Test run artifacts
    playwright-report/        # (gitignored) HTML reports
```

## Patterns

### Page Object Model

Page objects encapsulate selectors and interactions for a route/component. They:
- Are TypeScript classes accepting a Playwright `Page` in the constructor
- Return `Locator` objects (not resolved values) for maximum flexibility
- Never contain assertions — tests assert, page objects locate and interact
- Have a `goto()` method for direct navigation

```typescript
export class ProjectListPage {
  constructor(private page: Page) {}
  async goto() { await this.page.goto('/'); }
  getProjectByName(name: string) { return this.page.getByTestId(`project-${name}`); }
  async clickCreateProject() { await this.page.getByTestId('create-project-btn').click(); }
}
```

### Extended Test Fixtures

All tests import from `fixtures/base.ts` rather than `@playwright/test` directly. The extended `test` provides:
- Automatic localStorage cleanup (teardown)
- Pre-bound storage helpers
- Access to test data factories

### Storage Helpers

Phase 0 stores data in localStorage under `keyra:projects`, `keyra:schemas`, `keyra:mappings`. Helpers use `page.evaluate()` to manipulate storage:

```typescript
export async function seedStorage(page: Page, data: SeedData) {
  await page.evaluate((d) => {
    Object.entries(d).forEach(([key, value]) => {
      localStorage.setItem(`keyra:${key}`, JSON.stringify(value));
    });
  }, data);
}
```

### Test Data Factories

Factories produce valid domain objects with sensible defaults. They accept partial overrides for test-specific customization:

```typescript
export function createTestProject(overrides?: Partial<Project>): Project {
  return { id: 'test-project-1', name: 'Test Project', ...overrides };
}
```

### Test Isolation

Every test follows: **seed → execute → teardown**. Tests never depend on state from other tests. The fixture teardown ensures cleanup even when tests fail.

### Fixture Files

Dedicated `.json` schema files live in `tests/e2e/fixtures/schemas/`. These are preferred over in-memory generation because:
- Reusable across multiple tests without copy-paste
- Human-readable and reviewable (serve as documentation)
- Decoupled from implementation details that may drift

Keep fixtures small (10-15 fields). Include at least one deeply-nested schema (3+ levels) for tree interaction tests.

## Selector Strategy

Priority order:
1. `data-testid` — primary, most stable (`page.getByTestId()`)
2. ARIA roles — for semantic elements (`page.getByRole()`)
3. Text content — for user-visible labels (`page.getByText()`)
4. Never use CSS classes, tag names, or DOM structure as selectors

## Performance Budget

- Full suite: < 60 seconds
- Individual test: < 10 seconds
- Single browser (Chromium) in Phase 0
- Parallelism: Playwright's default worker count

## CI Configuration

CI integration is deferred to a follow-up spec. When implemented, the intended approach:

- Headless Chromium only
- Retries: 1 on CI, 0 locally
- Reporter: `list` on CI, `html` locally
- Artifacts: screenshots on failure, trace on first retry
- `webServer` starts Vite dev server automatically
- Possible Docker container for consistent font rendering

## Phase Evolution

When Phase 1 introduces a real backend:
- Storage helpers will be replaced by API seed functions (direct DB seeding or test API endpoints)
- Network interception (`page.route()`) will be used for specific error simulation
- Consider a test backend mode that resets between tests
- Page objects remain unchanged — only fixture internals change
- May add Firefox/WebKit projects for cross-browser coverage

Visual regression (screenshot comparison) is deferred until post-Phase 2 when the design system stabilizes and panel layouts are unlikely to change. Functional correctness is the Phase 0 priority.
