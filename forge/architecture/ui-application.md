# UI Application Architecture

This document defines the architecture of the KeyRa frontend application. Agents working on UI specs (FS-008+) must load this document before implementation.

This is a living document. Update it when architectural decisions change.

---

## Overview

The KeyRa UI is a React 18+ / TypeScript / Vite single-page application. It provides the interface for authoring, validating, and deploying mappings.

Phase model:
- **Phase 0 (implemented in FS-008):** Local-only operation through `LocalStorageAdapter`.
- **Phase 1+:** Backend communication via `HttpAdapter` (placeholder only in Phase 0).

Primary characteristics:
- Desktop-first (minimum 1024px, optimized for 1280px+)
- TypeScript strict mode
- Tailwind CSS 4 utility-first styling
- React Router v6 app-shell routing

---

## Technology Decisions

| Layer | Decision | Notes |
|---|---|---|
| Framework | React 18+ | Functional components and hooks only |
| Language | TypeScript (strict) | `tsc --noEmit` must stay clean |
| Build Tool | Vite | Fast dev server and production bundling |
| Styling | Tailwind CSS 4 | No CSS modules or styled-components in Phase 0 |
| Icons | Lucide React | Shared icon set for shell/primitives |
| Routing | React Router v6 | Layout route + nested pages |
| Package Manager | pnpm | Required for UI workspace workflows |
| Testing | Vitest + React Testing Library | Co-located tests under `ui/src/**/*.test.{ts,tsx}` |
| Code Quality | ESLint + Prettier | Zero-error lint/typecheck/format policy |

---

## Module Structure

```text
ui/src/
  main.tsx                    App bootstrap: createAdapter() + AdapterProvider + render
  App.tsx                     BrowserRouter + layout route + page routes
  vite-env.d.ts               Vite env typings (includes VITE_API_URL)

  routes/                     Route constants + route placeholder pages
    index.ts                  Route barrel
    paths.ts                  PATHS route constants
    pages/                    One placeholder page component per route

  components/                 Shared reusable components
    index.ts                  Shared component barrel
    Button.tsx                Primitive button
    Card.tsx                  Primitive card container
    PageHeader.tsx            Primitive page heading block
    StatusBadge.tsx           Primitive deploy status badge
    layout/                   App shell components
      AppLayout.tsx           NavBar + Breadcrumbs + Outlet wrapper
      NavBar.tsx              Top global navigation
      Breadcrumbs.tsx         Path-derived breadcrumb navigation
      index.ts                Layout component barrel

  hooks/
    use-async-state.ts        Async state lifecycle hook

  features/
    mappings/                 Mapping Editor feature module (FS-010)
      index.ts                Feature barrel (components + hooks + utilities)
      components/
        MappingEditorPage.tsx Multi-panel editor shell (8 named panel slots)
        EditorTopBar.tsx      Editor metadata strip (name/version/save/deploy/schema refs)
        PanelPlaceholder.tsx  Placeholder renderer for inactive panels
        RuleList.tsx          Rule list panel surface (CRUD/reorder/bulk + diagnostics)
      hooks/
        use-engine-validation.ts  Debounced engine validate() integration hook
        use-mapping-editor.ts     Editor orchestration (load/save/rules/validation wiring)
      lib/
        infer-rule-type.ts    Expression outer-function -> display label mapping

  lib/
    api/
      types.ts                ApiAdapter contract
      local-storage-adapter.ts
      adapter-provider.tsx
      bootstrap.ts            Adapter selection using VITE_API_URL
    engine/
      index.ts                Browser integration boundary for `@keyra/engine`
    state/
      async-state.ts
      app-error.ts
    types/
      domain.ts               Shared UI domain model types
```

---

## Adapter Pattern

### Contract

`ApiAdapter` is the only supported interface for data operations. UI components must not call `fetch()` directly.

### Implementations

- **Current:** `LocalStorageAdapter` (Phase 0)
- **Future:** `HttpAdapter` (Phase 1+; intentionally not implemented)

### Bootstrap

Startup behavior is centralized in `createAdapter()`:

1. Read `import.meta.env.VITE_API_URL`
2. If unset/empty → return `new LocalStorageAdapter()`
3. If set → throw `Error("HttpAdapter not implemented")`

### Dependency Injection

`AdapterProvider` supplies the adapter instance through React Context, and components access it via `useAdapter()`.

### Offline-Only Enforcement

In `LocalStorageAdapter`, AI/GitHub/server-preview methods throw `Error("Not available in offline mode")` to enforce Phase 0 boundaries.

---

## State Management

### Phase 0 Rules

- No Redux/Zustand (or other external state management library)
- No TanStack Query (or other external data-fetching library)
- React Context + `useReducer` for shared/global state surfaces
- Local `useState` for component-local state

### AsyncState Pattern

Data request lifecycle uses `AsyncState<T>`:

```ts
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T; updatedAt: Date }
  | { status: 'error'; error: AppError; retryable: boolean }
  | { status: 'stale'; data: T; refreshing: boolean };
```

`useAsyncState()` standardizes transitions (`execute`, `reset`, `markStale`, `refresh`) and includes race-protection semantics.

### Error Shape

`AppError` is the normalized error model for UI async failures.

---

## Engine Integration

The UI consumes the mapping engine through a browser integration layer in `ui/src/lib/engine/`.

### Module Purpose

- `ui/src/lib/engine/index.ts` is the canonical UI-facing engine entrypoint.
- It imports from `@keyra/engine` (aliased to `src/engine/index.ts`) and re-exports:
  - raw engine functions (`validate`, `execute`) for advanced usage
  - UI adapters (`validateMapping`, `executeMapping`) that convert UI `MappingConfig` to engine-native config shape
  - engine result/types used by hooks and feature components

### Import + Bundling Pattern (Vite)

- `@keyra/engine` is resolved via Vite/TypeScript path alias to source (`src/engine/index.ts`), not a pre-built package artifact.
- Vite transpiles engine TypeScript directly and resolves engine internal `.js` import specifiers.
- The engine is pure, synchronous, and deterministic; it is safe to invoke inside React hooks.
- The engine self-initializes its function registry on first import; UI code does not perform setup.

### Canonical Hook Pattern: `useEngineValidation()`

Location: `ui/src/features/mappings/hooks/use-engine-validation.ts`

Contract:

- Inputs:
  - `config: MappingConfig | null`
  - `sourceSchema: unknown | null`
  - `targetSchema: unknown | null`
- Behavior:
  - debounces validation by 300ms after input changes
  - skips validation when any required input is `null`
  - catches unexpected engine errors and exposes hook-level `error` state
- Outputs:
  - `result: ValidationResult | null`
  - `isValidating: boolean`
  - `diagnosticsForRule(ruleIndex): Diagnostic[]`
  - `coveragePercent: number`
  - `summary: { total; valid; warnings; errors }`

Future hooks (for example, `useEngineExecution()`) should follow the same pattern:

1. accept nullable editor inputs
2. debounce invocation
3. call `ui/src/lib/engine/` adapter or raw engine API
4. return strongly typed result + derived UI summary state
5. isolate and surface integration errors without crashing UI surfaces

### Tree-Shaking + Bundle Notes

- Feature code should import engine access via `ui/src/lib/engine/` (single boundary) instead of importing engine internals directly.
- FS-010 production baseline with engine integration active (`pnpm build` in `ui/`):
  - `dist/assets/index-*.js`: ~`343.42 kB` (gzip: ~`106.61 kB`)
- Use this as the baseline for tracking bundle growth when adding additional engine-backed hooks/features.

---

## Routing

### Registered Routes (FS-008)

- `/` → Home Dashboard
- `/projects/new` → Create Project
- `/projects/:projectId` → Project Overview
- `/projects/:projectId/settings` → Project Settings
- `/projects/:projectId/deployments` → Project Deployments
- `/projects/:projectId/mappings/new` → Create Mapping
- `/projects/:projectId/mappings/:mappingId` → Mapping Editor
- `/projects/:projectId/mappings/:mappingId/deploy` → Mapping Deployment
- `/schemas` → Schema Library
- `/schemas/:schemaId` → Schema Detail
- `/templates` → Template Library
- `/settings` → Settings
- `*` → Not Found

### Layout Route Pattern

All pages render inside a single shell route:

- `AppLayout` provides `NavBar` + `Breadcrumbs` + content container (`<Outlet />`)
- Not Found route is also rendered inside shell

### Breadcrumb Strategy

Breadcrumbs are derived from `location.pathname` segments:
- Home is always first
- Intermediate segments are links
- Last segment is current-page text
- Dynamic IDs display raw parameter values

### Route Constants

All navigable paths are centralized in `ui/src/routes/paths.ts` (`PATHS`) for reuse across navigation and future route-aware features.

---

## Component Organization

### Placement Rules

1. Shared, reusable UI primitives/utilities belong in `ui/src/components/`
2. App-shell components belong in `ui/src/components/layout/`
3. Feature-specific UI belongs in `ui/src/features/{feature}/`
4. No cross-feature direct imports; shared code must be lifted into `components/`, `hooks/`, or `lib/`

### Shared Primitives (FS-008)

- `Button` (variants/sizes/loading)
- `Card` (container with optional header)
- `PageHeader` (title/description/actions)
- `StatusBadge` (deploy status label + color dot)

---

## Mapping Editor Architecture

FS-010 establishes the editor shell pattern in `ui/src/features/mappings/`.

### Multi-Panel Layout + Slot Pattern

- `MappingEditorPage` owns the editor grid and defines stable named panel slots (Panels 1-8).
- Each slot renders a dedicated child panel (or `PanelPlaceholder` when deferred).
- Panel 3 (`Rule List`) is injected as child content (`ruleListContent`) so rule-list behavior can evolve without layout refactors.

Pattern for adding new panels:

1. implement panel component under `features/mappings/components/`
2. replace placeholder in corresponding slot
3. preserve slot identity and grid coordinates to avoid cross-panel regressions

### Top Bar Contract

`EditorTopBar` is the canonical metadata strip for Mapping Editor pages.

Its contract includes:

- mapping identity: `mappingName`, `version`
- persistence state: `saveStatus` (`saved | unsaved | saving | error`)
- deployment context: environment status badges
- schema context: `sourceSchemaName`, `targetSchemaName`
- navigation context: `projectId`, `mappingId` (used to build deploy-route link)

### Editor Data Flow

- `useMappingEditor(mappingId)` is the feature orchestration boundary.
- It loads mapping + schemas through `ApiAdapter`, owns local rule mutations, and wires validation through `useEngineValidation()`.
- It returns state + action callbacks (`addRule`, `updateRule`, `deleteRule`, `reorderRules`, bulk actions, `save`, `retry`) as the panel-facing contract.

State management note:

- FS-010 currently uses hook-local `useState` with dispatch-style action callbacks.
- If panel interaction complexity grows in FS-011/FS-012, this boundary is the place to consolidate into a `useReducer` store without changing panel contracts.

---

## Constraints

- TypeScript strict mode is mandatory
- Lint, tests, and formatting must pass before task completion
- Desktop-first only (1024px minimum); mobile behavior is deferred
- Components remain adapter-agnostic
- No direct localStorage access outside adapter implementations
- No direct backend HTTP calls in UI components

---

## Future Considerations

- Implement `HttpAdapter` when backend services become available
- Extend engine hooks beyond validation (for example `useEngineExecution()`) using the same debounce + typed-result pattern
- Re-evaluate state/data libraries after FS-010 through FS-012 if complexity justifies adoption
- Expand primitives toward a fuller internal design system only when feature pressure warrants it
