# SPEC

## Title

UI Scaffold & App Shell

---

## ID

FS-008

---

## Metadata

Owner: @keyra-ui-team
Reviewers: TBD
Created: 2026-05-01
Last Updated: 2026-05-01
Type: ui

---

## Status

completed

---

## Revision

Rev: 1

---

## Summary

Stand up the foundational React/TypeScript/Vite application that all subsequent UI specs (FS-009 through FS-014) build on. This establishes project tooling, routing, the app shell layout, the ApiAdapter contract, LocalStorageAdapter, the AsyncState pattern, shared domain types, and minimal primitive components. This is a Phase 0 deliverable — no backend, no AI, no GitHub integration. Everything runs locally.

---

## Problem

There is no UI application in the repository. The `ui/` directory is empty. All downstream UI specs (FS-009 through FS-014) require a working React application with routing, a typed API adapter layer, async state management, and shared domain types before they can begin implementation.

---

## Goal

A fully functional, buildable, testable React application shell that:
- Renders placeholder pages for all product routes
- Provides a global navigation bar, breadcrumb bar, and responsive layout
- Defines the complete ApiAdapter TypeScript interface
- Implements LocalStorageAdapter for offline-first Phase 0 operation
- Establishes the AsyncState<T> pattern and useAsyncState hook
- Exports shared domain types used across all features
- Includes minimal shared primitive components (Button, Card, PageHeader, StatusBadge)
- Passes `tsc --noEmit`, ESLint, and Prettier with zero errors

---

## Assumptions

- React 18+ is the target framework version
- Tailwind CSS 4 is the styling system (utility-first, no component library)
- pnpm is the package manager
- The `ui/` directory placement per `forge/architecture/project-structure.md` is correct
- No backend exists yet — all data operations use localStorage
- The engine is not integrated at this stage (FS-009+ will import it)

---

## Current Context

The repository currently contains:
- `src/engine/` — the fully implemented mapping engine (FS-001 through FS-007)
- `ui/` — empty directory (`.gitkeep` only)
- `forge/architecture/project-structure.md` — defines the `ui/` directory structure

The project structure document already specifies the intended `ui/` layout including `src/`, `features/`, `components/`, `hooks/`, `lib/api/`, `lib/state/`, `lib/types/`, and `lib/engine/`. This spec implements that structure.

---

## Scope

### In Scope

- Vite + React + TypeScript project initialization with strict mode
- Tailwind CSS 4 setup
- ESLint + Prettier configuration
- Vitest + React Testing Library setup
- React Router v6 with all routes from Section 5.2 registered
- Placeholder page components for each route
- Global layout: top nav bar, breadcrumb bar, page container
- Responsive layout (1024px minimum, 1280px target)
- ApiAdapter TypeScript interface (full contract from Section 8.2)
- LocalStorageAdapter implementation (localStorage-based, AI methods throw)
- AdapterProvider React context with useAdapter() hook
- AsyncState<T> generic type (idle | loading | success | error | stale)
- useAsyncState() hook for data-fetching operations
- AppError type with retryable flag
- Shared domain type interfaces (Project, MappingConfig, MappingRule, SchemaMetadata, SchemaRef, DeploymentRecord, Environment, DeployStatus, Template, ActivityEntry)
- Shared primitive components: Button, Card, PageHeader, StatusBadge
- Adapter bootstrap logic based on VITE_API_URL env var

### Out of Scope

- Screen-specific content (FS-009+)
- Full design system / component library
- HttpAdapter implementation (Phase 1)
- Engine integration / browser bundle
- AI features
- GitHub integration
- Backend API communication
- Authentication / authorization
- Mobile layout
- State management libraries (Zustand, Redux)
- External data-fetching libraries (TanStack Query)

---

## Non-Goals

- This is not a design system spec — only the minimal primitives needed by the shell are built
- This is not a feature spec — no user-facing functionality beyond navigation
- This does not establish patterns for feature-level state — that emerges from FS-009+
- This does not implement any data persistence beyond localStorage stubs

---

## Relevant Areas

- `ui/` — entire directory (greenfield)
- `ui/src/main.tsx` — app entry point
- `ui/src/App.tsx` — root component and router
- `ui/src/routes/` — route definitions
- `ui/src/components/` — shared primitive components
- `ui/src/hooks/` — shared hooks (useAsyncState)
- `ui/src/lib/api/` — ApiAdapter, LocalStorageAdapter, AdapterProvider
- `ui/src/lib/types/` — shared domain types
- `ui/src/lib/state/` — AsyncState type
- `ui/vite.config.ts` — Vite configuration
- `ui/tailwind.config.ts` — Tailwind configuration
- `ui/tsconfig.json` — TypeScript configuration
- `tests/ui/` — UI test files
- `forge/architecture/project-structure.md` — may need minor updates
- `forge/architecture/ui-application.md` — new architecture document

---

## Dependencies / Blockers

- none (greenfield, no upstream dependencies)

---

## Constraints

- No state management library (no Zustand, no Redux). Use React Context + useReducer for the adapter provider. Evaluate after FS-010–012 per Section 17.2.
- No external data-fetching library. The AsyncState hook is sufficient for Phase 0. Evaluate TanStack Query later per Section 17.2.
- Desktop-first: target 1280px+, minimum 1024px. No mobile layout.
- Must pass `tsc --noEmit`, ESLint, and Prettier checks with zero errors.
- pnpm as package manager (not npm or yarn).
- TypeScript strict mode enabled.
- Components never call `fetch()` directly — they use the ApiAdapter.
- The engine (`src/engine/`) must not be imported directly at runtime — it will be consumed via `ui/src/lib/engine/` in later specs.

---

## Proposed Behavior

### User Flow

1. Developer runs `pnpm install` in `ui/` and `pnpm dev` to start the dev server.
2. The app loads at `http://localhost:5173` (or next available port).
3. The home route (`/`) renders with the global nav bar, breadcrumb showing "Home", and placeholder content.
4. Clicking any nav link navigates to the corresponding route with the appropriate placeholder page.
5. Breadcrumbs update to reflect the current route hierarchy (e.g., "Home > Projects > :projectId > Mappings > :mappingId").
6. All routes resolve without 404 errors. Unknown routes show a "Not Found" fallback.

### System Behavior

**Adapter Bootstrap:**
- On app startup, the code checks `import.meta.env.VITE_API_URL`.
- If not set or empty: instantiate `LocalStorageAdapter` and provide via `AdapterProvider`.
- If set: throw `Error("HttpAdapter not implemented")` — this fails fast in development to signal Phase 1 is needed.

**LocalStorageAdapter:**
- All CRUD methods read/write to `localStorage` using namespaced keys (e.g., `keyra:projects`, `keyra:schemas`).
- AI methods (`autoMap`, `suggestExpression`, `explainRule`, `smartFix`, `validateMappings`) throw `Error("Not available in offline mode")`.
- GitHub methods (`listCdmSchemas`, `linkCdmSchema`, `syncCdmSchema`, `listPublishedSchemas`, `publishSchemaToGitHub`, `linkPublishedSchema`) throw `Error("Not available in offline mode")`.
- `previewOnServer` throws `Error("Not available in offline mode")`.

**AsyncState:**
- Components use `useAsyncState()` to manage data-fetching lifecycle.
- The hook returns the current `AsyncState<T>` and action dispatchers (execute, reset, markStale).
- On `execute(promise)`, state transitions: idle → loading → success or error.

**Routing:**
- All routes from Section 5.2 are registered.
- Each route renders a placeholder component with the page name and "Coming Soon" message.
- A catch-all route renders a "Not Found" page.

### Failure / Edge Behavior

- If `VITE_API_URL` is set, the app crashes on load with a clear error message. This is intentional — the HttpAdapter does not exist yet.
- LocalStorageAdapter methods that encounter corrupted localStorage data should return empty results rather than throwing.
- If localStorage is full (quota exceeded), write operations should throw an AppError with `retryable: false`.
- Unknown routes render the "Not Found" page without crashing the app.

---

## Acceptance Examples

### AE-01 — App boots with LocalStorageAdapter when VITE_API_URL is unset

**Given**
- `VITE_API_URL` is not set in the environment

**When**
- The app starts

**Then**
- The AdapterProvider supplies a LocalStorageAdapter instance
- The app renders without errors
- `useAdapter()` returns the LocalStorageAdapter

### AE-02 — App throws when VITE_API_URL is set

**Given**
- `VITE_API_URL` is set to `"http://localhost:4000"`

**When**
- The app attempts to start

**Then**
- An error is thrown: "HttpAdapter not implemented"

### AE-03 — All routes render placeholder pages

**Given**
- The app is running

**When**
- The user navigates to each of the following routes:
  - `/`
  - `/projects/new`
  - `/projects/test-id`
  - `/projects/test-id/settings`
  - `/projects/test-id/deployments`
  - `/projects/test-id/mappings/new`
  - `/projects/test-id/mappings/mapping-1`
  - `/projects/test-id/mappings/mapping-1/deploy`
  - `/schemas`
  - `/schemas/schema-1`
  - `/templates`
  - `/settings`

**Then**
- Each route renders a page with its name and "Coming Soon" text
- No console errors or unhandled exceptions

### AE-04 — Navigation bar links work

**Given**
- The app is running at `/`

**When**
- The user clicks "Schema Library" in the nav bar

**Then**
- The route changes to `/schemas`
- The breadcrumb updates to show "Schemas"
- The placeholder page renders

### AE-05 — Breadcrumb reflects route hierarchy

**Given**
- The app is running

**When**
- The user navigates to `/projects/abc/mappings/def`

**Then**
- The breadcrumb shows: Home > Projects > abc > Mappings > def
- Each breadcrumb segment (except the last) is a clickable link to the parent route

### AE-06 — AsyncState transitions correctly

**Given**
- A component uses `useAsyncState<string[]>()`

**When**
- The hook is called with `execute(Promise.resolve(["a", "b"]))`

**Then**
- State transitions: idle → loading → success with data `["a", "b"]`
- `updatedAt` is a valid Date

### AE-07 — AsyncState handles errors

**Given**
- A component uses `useAsyncState<string[]>()`

**When**
- The hook is called with `execute(Promise.reject(new Error("fail")))`

**Then**
- State transitions: idle → loading → error
- The error is an AppError with a message
- `retryable` defaults to `true`

### AE-08 — LocalStorageAdapter AI methods throw

**Given**
- The active adapter is LocalStorageAdapter

**When**
- Any AI method is called (e.g., `adapter.autoMap(...)`)

**Then**
- The method throws an Error with message "Not available in offline mode"

### AE-09 — StatusBadge renders deploy states

**Given**
- A StatusBadge component

**When**
- Rendered with status "deployed", "stale", "not-deployed", "deploying"

**Then**
- Each renders with the appropriate color and label:
  - deployed → green with "Deployed"
  - stale → orange with "Stale"
  - not-deployed → gray with "Not deployed"
  - deploying → yellow with "Deploying"

### AE-10 — Unknown route renders Not Found

**Given**
- The app is running

**When**
- The user navigates to `/nonexistent/route`

**Then**
- A "Not Found" page renders
- The app shell (nav bar) remains visible

### AE-11 — TypeScript strict compilation passes

**Given**
- The full `ui/` codebase

**When**
- `pnpm tsc --noEmit` is run

**Then**
- Exit code 0, zero errors

### AE-12 — Lint and format pass

**Given**
- The full `ui/` codebase

**When**
- `pnpm lint` and `pnpm format:check` are run

**Then**
- Exit code 0 for both, zero violations

---

## Open Questions

- none

---

## Verification Strategy

- **Unit tests (Vitest + React Testing Library):**
  - AsyncState hook transitions (AE-06, AE-07)
  - LocalStorageAdapter CRUD operations and AI method throws (AE-08)
  - AdapterProvider supplies correct adapter (AE-01)
  - StatusBadge renders correct variants (AE-09)
  - Breadcrumb generation from route (AE-05)
- **Integration tests:**
  - All routes render without errors (AE-03)
  - Navigation bar links work (AE-04)
  - Not Found route (AE-10)
- **Build verification:**
  - `tsc --noEmit` passes (AE-11)
  - ESLint passes (AE-12)
  - Prettier passes (AE-12)
  - `pnpm build` succeeds
- **Manual verification:**
  - Dev server starts and renders (AE-01)
  - Adapter bootstrap with VITE_API_URL set crashes as expected (AE-02)

---

## Task Generation Notes

This spec decomposes into 10 tasks across two agent types:

**`task` agent (infrastructure, types, config):**
- T-01: Project initialization (Vite, React, TS, Tailwind, ESLint, Prettier, Vitest, pnpm)
- T-02: Shared domain types (TypeScript interfaces)
- T-03: ApiAdapter interface definition
- T-04: AsyncState<T> type + useAsyncState hook + AppError
- T-05: LocalStorageAdapter + AdapterProvider context
- T-06: Adapter bootstrap logic
- T-10: UI application architecture document

**`ui-task` agent (React components, UI surfaces):**
- T-07: Routing setup with placeholder pages
- T-08: App shell layout (nav bar, breadcrumbs, page container)
- T-09: Shared primitive components (Button, Card, PageHeader, StatusBadge)

**Dependency chain:**
- T-01 is the foundation — all other tasks depend on it
- T-02 (domain types) → T-03 (ApiAdapter) → T-05 (LocalStorageAdapter) → T-06 (bootstrap)
- T-04 (AsyncState) depends only on T-01
- T-07 (routing) depends on T-01
- T-08 (app shell) depends on T-07
- T-09 (primitives) depends on T-01
- T-10 (architecture) depends on T-01 through T-09 (documents what was built)

T-02, T-04, T-07, and T-09 can run in parallel after T-01.

---

## Change Log

- Rev 1 — 2026-05-01
  - Initial draft
