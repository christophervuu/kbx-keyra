# SPEC

## Title

Validate Adapter Transparency — Unchanged UI and E2E Parity

---

## ID

FS-060

---

## Metadata

Owner: @christophervuu  
Reviewers: TBD  
Created: 2026-05-14  
Last Updated: 2026-05-15  
Type: cross-cutting

---

## Status

ready

---

## Revision

Rev: 2

---

## Summary

Formally verify that the Phase 1 `HttpAdapter` is a transparent drop-in replacement for `LocalStorageAdapter` from the perspective of existing UI components and end-to-end test coverage. This spec establishes a Playwright E2E harness capable of dual-mode execution (localStorage vs HTTP backend), a mock backend server seeded with deterministic test data, and parity assertions proving that project CRUD, mapping CRUD, schema upload/load flows, and error handling all behave identically regardless of active adapter. The explicit pass condition is: Phase 0 E2E tests pass without modification when the app runs in Phase 1 backend mode.

---

## Problem

Phase 1 introduces `HttpAdapter` (FS-055) which routes all CRUD operations through HTTP instead of localStorage. Without formal verification that the adapter swap is transparent, any subtle behavioral differences — timing, error shapes, data serialization, or missing response fields — risk introducing UX regressions that are difficult to detect through unit tests alone. The E2E infrastructure described in `e2e-testing.md` does not yet exist in the repository, meaning there is currently no mechanism to prove adapter transparency at the integration level.

---

## Goal

A single Playwright E2E test suite that:
1. Passes with `LocalStorageAdapter` (Phase 0 mode) as baseline
2. Passes identically with `HttpAdapter` against a seeded mock backend (Phase 1 mode)
3. Requires zero test rewrites between modes — adapter switching is purely an environment/config concern
4. Runs in CI as a parity gate before Phase 1 backend changes can merge

---

## Assumptions

- FS-055 (`HttpAdapter`) is complete or sufficiently progressed that the adapter class exists and can be instantiated
- Backend CRUD endpoints conform to domain type shapes in `ui/src/lib/types/domain.ts` (as specified in FS-057/backend-api.md)
- The mock server provides immediate read-after-write consistency (matching Phase 0 localStorage semantics)
- Playwright will be added as a dev dependency to the workspace
- E2E tests target Chromium only (matching `e2e-testing.md` Phase 0 scope)

---

## Current Context

### Adapter Bootstrap

`createAdapter()` in `ui/src/lib/api/bootstrap.ts` selects the adapter based on `VITE_API_URL`:
- Unset/empty → `LocalStorageAdapter`
- Set → `HybridAdapter` (Phase 0.5), will become `HttpAdapter` (FS-055)

### E2E Infrastructure State

`forge/architecture/e2e-testing.md` defines the target Playwright structure (`tests/e2e/`) with page objects, fixtures, storage helpers, and spec files. However, **this directory does not exist** in the repository. No Playwright configuration, no page objects, and no E2E specs are currently implemented.

### Phase 1 Readiness Gaps

`phase-1-readiness.md` section 3, item 8 explicitly identifies the E2E gap: "E2E infrastructure documented but not present." This spec resolves that gap for the subset of flows needed to prove adapter parity.

### Related Active Specs

- **FS-055** — Implements `HttpAdapter` with CRUD routing (direct dependency)
- **FS-057** — Defines backend API route table and handler structure
- **FS-058** — Defines DynamoDB/S3 persistence layer

---

## Scope

### In Scope

- Dedicated `tests/e2e/` workspace package with Playwright as its own isolated dependency scope
- Playwright configuration and project setup (`tests/e2e/playwright.config.ts`)
- Extended test fixtures with dual-mode adapter switching
- Mock backend server (Express, started via Playwright `webServer` config) implementing CRUD endpoints with in-memory store
- Seed/reset utilities for both localStorage and mock backend modes
- Test data factories producing deterministic domain objects
- E2E specs covering parity domains:
  - Project CRUD (create, read, update, delete)
  - Mapping CRUD (create, read, update, delete, duplicate)
  - Schema upload and load flows
  - Error handling (not-found, validation errors, network failures)
- CI configuration for dual-mode execution (path-filtered: triggers on `ui/src/lib/api/`, `src/lambda/`, `src/lib/persistence/`, route/config/bootstrap changes)
- Pass/fail parity gate assertion

### Out of Scope

- AI method parity (AI methods remain not-implemented in HttpAdapter; tested separately)
- GitHub integration, deployment, template, or search flows
- Cross-browser testing (Chromium only)
- Visual regression testing
- Performance benchmarking between adapters
- Authentication/authorization flows
- Full page object coverage for every UI surface (only surfaces exercising CRUD parity)

---

## Non-Goals

- This spec does not implement backend endpoints — it mocks them
- This spec does not validate backend correctness — it validates UI transparency
- This spec does not establish a complete E2E suite for all KeyRa features — it focuses on CRUD parity proof
- This spec does not change any UI component code or adapter implementations

---

## Relevant Areas

- `tests/e2e/` — new E2E infrastructure (all new files)
- `ui/src/lib/api/bootstrap.ts` — read-only reference for adapter switching
- `ui/src/lib/api/types.ts` — ApiAdapter contract (read-only reference)
- `ui/src/lib/api/http-adapter.ts` — HttpAdapter under test (from FS-055)
- `ui/src/lib/api/local-storage-adapter.ts` — LocalStorageAdapter baseline
- `forge/architecture/e2e-testing.md` — architecture reference for conventions
- `forge/architecture/backend-api.md` — endpoint shapes for mock server

---

## Dependencies / Blockers

- **FS-055** (HttpAdapter) must be complete — the adapter under validation
- Mock server must implement endpoints matching FS-057 route table shapes
- Playwright must be installable in the workspace (pnpm workspace compatible)

---

## Constraints

- Zero UI component changes — tests must exercise existing UI unchanged
- Zero test rewrites between modes — same test file, different config/env
- Mock server must return response shapes byte-compatible with domain types
- Test isolation: each test seeds its own data and cleans up; no inter-test dependencies
- Deterministic test data: factory-generated IDs and timestamps for reproducible assertions
- E2E tests must follow conventions from `e2e-testing.md` (page objects, fixtures, selector strategy)

---

## Proposed Behavior

### User Flow

There is no user-visible behavior change. This spec produces developer/CI infrastructure that validates adapter transparency.

### System Behavior

#### Environment Switching

The E2E harness uses Playwright projects to run the same specs in two modes:

```
// playwright.config.ts
projects: [
  {
    name: 'localStorage',
    use: { /* no VITE_API_URL — app uses LocalStorageAdapter */ }
  },
  {
    name: 'httpBackend',
    use: { /* VITE_API_URL=http://localhost:4100 — app uses HttpAdapter */ }
  }
]
```

The Vite dev server is started per-project with the appropriate env var. Both projects execute identical spec files.

#### Mock Backend Server

An Express server (`tests/e2e/mock-server/`) managed by Playwright's `webServer` config implements:
- All CRUD endpoints from FS-057 route table (projects, mappings, schemas, versions)
- In-memory store with seed/reset capability via a `POST /test/reset` control endpoint
- Response shapes matching `ui/src/lib/types/domain.ts` exactly
- Error responses matching the error envelope from `backend-api.md` section 4

Playwright starts the mock server automatically (via `webServer` array alongside the Vite dev server) and tears it down after tests. This eliminates manual process management and ensures reproducibility. The mock server provides:
- `POST /test/seed` — bulk-load test data into memory store
- `POST /test/reset` — clear all data to empty state
- `GET /test/health` — readiness probe for Playwright startup wait
- Immediate read-after-write consistency

#### Seed/Reset Strategy

| Mode | Seed Mechanism | Reset Mechanism |
|------|---------------|-----------------|
| localStorage | `page.evaluate()` to set `keyra:*` keys (per `e2e-testing.md`) | Fixture teardown clears localStorage |
| httpBackend | HTTP POST to `mock-server/test/seed` with same data shape | HTTP POST to `mock-server/test/reset` |

A unified `seedData(page, mode, data)` helper abstracts the mode difference so test specs remain adapter-agnostic.

#### Parity Check Domains

Each domain has E2E coverage asserting identical observable behavior:

1. **Project CRUD**: create project → list shows it → edit name → verify change → delete → verify removal
2. **Mapping CRUD**: create mapping in project → open editor → select single target field → enter expression → save → close/reopen → verify rule persisted → duplicate → verify copy → delete
3. **Schema upload/load**: upload JSON schema → navigate to schema detail → verify field tree renders → reference schema in project → verify association
4. **Error handling**: navigate to non-existent project → verify error state renders → attempt invalid operations → verify error feedback

### Failure / Edge Behavior

| Scenario | Expected Behavior |
|---|---|
| Mock server is down when httpBackend tests start | Test suite fails fast with clear error message indicating mock server not reachable |
| Seed data shape mismatch | Factory types enforce compile-time compatibility; runtime mismatches surface as test assertion failures |
| HttpAdapter throws for non-CRUD method during test | Test should not exercise non-CRUD methods; if accidentally triggered, test fails visibly (not silently) |
| Flaky timing differences between modes | Tests use Playwright auto-waiting; explicit waits only for known async boundaries |

---

## Acceptance Examples

### AE-01 — Project CRUD parity (localStorage mode)

**Given**
- App is running with `LocalStorageAdapter` (no `VITE_API_URL`)
- No pre-existing data

**When**
- Create a project named "Parity Test Project"
- Navigate to project list
- Verify project appears
- Edit project name to "Renamed Project"
- Delete the project

**Then**
- All operations succeed
- Project list reflects each change immediately
- After deletion, project is no longer visible

### AE-02 — Project CRUD parity (httpBackend mode)

**Given**
- App is running with `HttpAdapter` (`VITE_API_URL=http://localhost:4100`)
- Mock server is running with empty state

**When**
- Execute identical steps as AE-01

**Then**
- All operations succeed with identical observable UI behavior
- No localStorage CRUD artifacts created
- Mock server state reflects changes via its API

### AE-03 — Mapping CRUD with persistence verification

**Given**
- A project exists (seeded)
- App is running in either adapter mode

**When**
- Create a mapping in the project
- Open mapping editor
- Add a mapping rule (target field expression)
- Save the mapping
- Navigate away and return to the mapping

**Then**
- The saved rule is present on reload
- Behavior is identical in both adapter modes

### AE-04 — Schema upload and tree rendering

**Given**
- A fixture JSON schema file exists in `tests/e2e/fixtures/schemas/`
- App is running in either adapter mode

**When**
- Navigate to schema creation
- Upload the fixture schema
- Navigate to schema detail page

**Then**
- Schema metadata is displayed correctly
- Schema tree renders with expected field structure
- Behavior is identical in both adapter modes

### AE-05 — Error handling parity

**Given**
- App is running in either adapter mode

**When**
- Navigate to a non-existent project (`/projects/does-not-exist`)

**Then**
- Error state is displayed (not a crash)
- Error UI is identical in both adapter modes

### AE-06 — Dual-mode CI gate passes

**Given**
- CI pipeline runs the Playwright suite

**When**
- Suite executes in `localStorage` project
- Suite executes in `httpBackend` project

**Then**
- Both project runs pass
- Zero test files differ between runs (same specs, same assertions)
- CI reports parity status

---

## Open Questions

- none

All questions resolved in Rev 2 — see Change Log.

---

## Verification Strategy

- **AE-01 / AE-02**: Playwright specs for project CRUD pass in both modes (automated)
- **AE-03**: Playwright specs for mapping save/reload pass in both modes (automated)
- **AE-04**: Playwright specs for schema upload/tree pass in both modes (automated)
- **AE-05**: Playwright specs for error states pass in both modes (automated)
- **AE-06**: CI pipeline configuration runs both projects and reports combined pass/fail (automated)
- **Build gate**: `pnpm build` in `ui/` continues to pass (no source changes)
- **Type gate**: `pnpm typecheck` continues to pass (no source changes)
- **Lint gate**: lint clean (no source changes expected, only test infrastructure)

---

## Task Generation Notes

This is a cross-cutting spec with all tasks assigned to `task` agent (no UI component work — this is infrastructure/test harness work).

Sequencing:
1. Playwright setup + configuration (foundation)
2. Mock backend server (required for httpBackend mode)
3. Test fixtures, factories, and seed/reset utilities (required by all specs)
4. E2E spec files covering parity domains (the actual tests)
5. CI dual-mode configuration (run both projects)
6. Architecture update (update `e2e-testing.md` to reflect implemented state)

Tasks 1-3 can partially overlap but have natural dependencies. Task 4 depends on all of 1-3. Task 5 depends on 4. Task 6 runs last.

---

## Change Log

- Rev 2 — 2026-05-15
  - Resolved all 5 open questions:
    - Q1: Mock server started via Playwright `webServer` (not standalone)
    - Q2: Express chosen for mock server (familiarity for support tooling)
    - Q3: Playwright lives in dedicated `tests/e2e/` workspace package
    - Q4: Minimum mapping editor interaction is single-field mapping + save + reload + verify
    - Q5: CI parity gate is path-filtered (`ui/src/lib/api/`, `src/lambda/`, persistence, bootstrap)
  - Updated Scope and System Behavior sections to reflect decisions
- Rev 1 — 2026-05-14
  - Initial draft
