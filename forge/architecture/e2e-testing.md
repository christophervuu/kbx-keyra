# E2E Testing Architecture

## Overview

End-to-end tests exercise KeyRa through a real browser using Playwright. They verify integrated user workflows from a user perspective (navigation, CRUD flows, validation/error states, and persistence behavior).

The E2E harness is implemented in `tests/e2e/` and is used as an **adapter-parity gate**: the same spec files run in both `localStorage` and `httpBackend` modes.

## Scope

- Adapter transparency validation for core CRUD flows
- Route accessibility and navigation
- Form validation and not-found/error handling
- Save/reload persistence checks in both adapter modes
- CI parity gate integration

## Directory Structure (implemented)

```
tests/
  e2e/
    README.md                  # Local/CI parity runbook
    package.json               # E2E workspace scripts/dependencies
    tsconfig.json              # E2E TypeScript config
    playwright.config.ts       # Dual-project config + webServer lifecycle
    fixtures/
      base.ts                  # Extended test fixture (adapterMode, seed/reset, factories)
      seed.ts                  # Adapter-agnostic seed/reset router
      storage.ts               # localStorage seed/clear helpers
      http-seed.ts             # mock-server seed/reset HTTP helpers
      test-data.ts             # Deterministic domain factories
      schemas/
        simple-order.json
        nested-customer.json
    pages/
      app.page.ts
      project-list.page.ts
      project-form.page.ts
      project-overview.page.ts
      create-mapping.page.ts
      schema-upload.page.ts
      schema-detail.page.ts
      mapping-editor.page.ts
    specs/
      fixtures-smoke.spec.ts
      project-crud.spec.ts
      mapping-crud.spec.ts
      schema-flows.spec.ts
      error-handling.spec.ts
      auto-map-async.spec.ts
    mock-server/
      index.ts
      store.ts
      response.ts
      types.ts
      routes/
        projects.ts
        mappings.ts
        auto-map.ts
        schemas.ts
        test-control.ts
```

## Dual-Mode Playwright Configuration

`playwright.config.ts` defines two projects using the same spec set:

- `localStorage` → app at `http://127.0.0.1:4173` with `VITE_API_URL` forced empty
- `httpBackend` → app at `http://127.0.0.1:4174` with `VITE_API_URL=http://127.0.0.1:4100`

The harness uses Playwright `webServer` entries so Vite and mock-server are started/stopped automatically for runs (local and CI).

## Mock Server Architecture

`tests/e2e/mock-server/` provides a deterministic Express server for backend-mode parity testing.

### Characteristics

- In-memory state only (non-persistent)
- No auth
- CRUD endpoints needed by parity suite
- Standard success envelope + standardized error envelope
- CORS enabled for local/CI browser runs

### Control Endpoints

- `GET /test/health` — readiness probe
- `POST /test/seed` — bulk-seed deterministic state
- `POST /test/reset` — clear state between tests

## Seed/Reset Canonical Pattern

The canonical pattern is `seedData()` / `resetData()` from `fixtures/base.ts`, which routes by adapter mode:

- `localStorage` mode → `storage.ts` writes/removes `keyra:*` localStorage keys via `page.evaluate()`
- `httpBackend` mode → `http-seed.ts` calls mock-server `/test/seed` and `/test/reset`

All new E2E specs should follow:

1. seed
2. execute
3. assert user-visible state
4. teardown/reset (fixture-managed)

## Patterns

### Page Object Model

- Page objects encapsulate selectors and interactions
- Specs own assertions
- Prefer semantic interactions (`data-testid`, role, text) in that priority order

### Test Data Factories

`fixtures/test-data.ts` is the source of deterministic project/mapping/schema factories and default seed payloads.

### Test Isolation

Tests must not depend on execution order. Isolation is enforced via fixture reset semantics and deterministic seeding.

## Selector Strategy

Priority order:

1. `data-testid`
2. ARIA roles
3. User-visible text
4. Never rely on CSS classes or DOM structure

## Performance & Runtime Budget

- Full suite target: `< 60s` per mode
- Individual test target: `< 10s`
- Browser target: Chromium only
- Retries: `1` on CI, `0` locally
- Reporter: `list` on CI, `html` locally

Current config uses serial worker execution (`workers: 1`) for deterministic parity isolation against shared local mock/server ports.

## CI Integration

GitHub Actions parity gate:

- Workflow: `.github/workflows/e2e-parity.yml`
- Trigger: PR path filters for parity-relevant backend/adapter/bootstrap/E2E files
- Command: `pnpm test:e2e:parity` (single invocation covering both projects)
- Browser install: Chromium installed in CI before test run
- Failure artifacts uploaded from:
  - `tests/e2e/test-results`
  - `tests/e2e/playwright-report`

Parity gate behavior: failure in either project (`localStorage` or `httpBackend`) fails the workflow.

### FS-075 acceptance-gate integration posture

FS-075 adds a separate CI workflow (`.github/workflows/phase2-acceptance-gate.yml`) that enforces Phase 2 AI acceptance criteria across deterministic checks and prompt-eval policy modes. E2E parity remains an independent gate focused on adapter behavior; it is not replaced by FS-075 and continues to run as its own required quality signal.

## Phase Evolution

Phase 0.5/Phase 1 parity mode is now implemented (dual adapter projects + mock backend).

Future evolution candidates:

- Extend coverage domains beyond CRUD parity
- Add controlled error simulation via request interception where needed
- Revisit worker parallelism if isolated environments/ports are introduced
- Add optional cross-browser projects when parity scope requires it

Visual regression remains deferred until design-system surfaces stabilize.

---

## FS-100 deployment/runtime architecture verification addendum

FS-100 adds architecture-level E2E/contract verification expectations for deployment/runtime surfaces beyond baseline CRUD parity.

Verification emphasis for this slice:

- Deployment page bootstrap contract is aggregate `GET /mappings/:mappingId/deploy-context`.
- Deployment UX reflects canonical four-stage ordering (`SANDBOX -> DEV -> PREPROD -> PROD`) with SANDBOX-first default behavior.
- Deployment failure rendering includes normalized backend envelope behavior with request-lineage visibility (summary + expandable technical details).
- Compatibility boundary is preserved: historical `QA` data may be normalized in read-model displays, but canonical surfaced environment labeling is `PREPROD`.

Scope note:

- These FS-100 checks are architecture/contract assertions and can be satisfied by a mix of UI integration tests and backend contract tests when full browser E2E wiring is not yet expanded for deployment flows.

---

## FS-101 async Auto-Map verification addendum

FS-101 adds parity expectations for async Auto-Map session/run contracts and review workspace lifecycle behavior.

Canonical E2E expectations in this slice:

- `httpBackend` project validates async create→review flow against session/run API behavior (acknowledged async start, workspace review lifecycle, suggestion interactions).
- `localStorage` project validates AI isolation: browser does not call backend/provider AI endpoints during offline adapter runs.
- Test harness seed model includes deterministic Auto-Map scenarios (`autoMapScenarios`) routed through `/test/seed` for backend-mode progression control.
- Mock server includes dedicated Auto-Map session/run/suggestion routes to emulate capabilities, open-session lookup, run status progression, and paginated/filterable suggestions.

Contract boundary reminder:

- E2E verifies user-visible async review behavior and adapter parity invariants; it does not assert provider/model internals.
