# Project Structure

This document defines where code lives in this repository. Agents must load this document before writing or modifying any source files.

This is a living document. Update it when the project structure changes. Do not let it drift from the actual repository layout.

---

## Top-Level Layout

```
src/        Backend and shared source code
ui/         Frontend source code (React / TypeScript / Vite)
tests/      Test files
forge/      Workflow artifacts only — no application code lives here
```

---

## `src/` — Backend and Shared Source

```
src/
  engine/             Pure TypeScript mapping engine (zero dependencies on UI or cloud)
    index.ts          Engine entry point — exports execute(), validate(), parse()
    dsl/              DSL parser and expression evaluator
    execute/          Execute pipeline utilities (AST cache, target-path assembly)
    validate/         Validation submodules (schema-tree, path/type/context checks, coverage)
    types/            Shared TypeScript types used by engine and consumers
    diagnostics/      Error codes, diagnostic formatting, trace output
    registry/         Function registration and lookup mechanism
    functions/        Built-in DSL function implementations (grouped by category)
  lambda/             AWS Lambda function handlers
    schema/           Schema CRUD lambdas (ingestSchema, getSchema, deleteSchema, querySchemaNodes)
    mapping/          Mapping CRUD lambdas
    project/          Project CRUD lambdas
    deploy/           Deployment lambdas (deployMapping, promoteDeploy, rollbackDeploy)
    github/           GitHub API lambdas (listCdmFiles, publishSchema, syncSchema)
    ai/               AI lambdas (aiAutoMap, aiSuggestExpression, aiSmartFix, etc.)
    preview/          Preview lambda (previewMapping)
  lib/                Shared utilities used across lambdas
  types/              Shared types across backend
```

**Rules:**
- The engine (`src/engine/`) has zero imports from `src/lambda/`, `ui/`, or any cloud SDK. It is a pure library.
- Lambda handlers import from `src/engine/` and `src/lib/` only — not from each other.
- Types shared between engine and UI are defined in `src/engine/types/` and imported by both.

---

## `ui/` — Frontend Source

```
ui/
  src/
    main.tsx              App entry point
    App.tsx               Root component and router setup
    routes/               Route path constants and placeholder pages
      index.ts            Barrel export for route constants
      paths.ts            Route path string constants (PATHS object)
      pages/              Placeholder page components (one per route)
        HomeDashboard.tsx
        CreateProject.tsx
        ProjectOverview.tsx
        ProjectSettings.tsx
        ProjectDeployments.tsx
        CreateMapping.tsx
        MappingEditor.tsx
        MappingDeployment.tsx
        SchemaLibrary.tsx
        SchemaDetail.tsx
        TemplateLibrary.tsx
        Settings.tsx
        NotFound.tsx
    features/             Feature-scoped code — one folder per major screen or domain
      schemas/            Schema Library, Schema Detail, and schema tree components (FS-009)
        index.ts          Feature barrel (re-exports shared types + parsers + hooks + components)
        types.ts          Feature-specific types (SchemaTreeViewProps, SchemaParseError, parser fn types)
        components/       Schema tree view components (T-05+)
          index.ts        Components barrel
          MappingStatusIcon.tsx    Mapping status icon (mapped/unmapped/warning) with aria-labels
          SchemaSearchInput.tsx    Search input with clear button (debounced, result count)
          SchemaTreeNodeIcon.tsx   Type→icon mapping component (color-coded Lucide icons)
          SchemaTreeNodeRow.tsx    Single tree row (expand/collapse, guides, badges, tooltip, highlight, selection, status, focus ring, ARIA)
          SchemaTreeToolbar.tsx    Toolbar: Expand All, Collapse All, Expand to depth (1/2/3)
          SchemaTreeView.tsx       Virtualized container with search, toolbar, selection, keyboard nav, states, and tree rendering
          SchemaTreeView.test.tsx  Component tests (72 tests: rendering, virtualization, search, selection, mapping status, toolbar, keyboard nav)
        hooks/            Feature-specific React hooks
          index.ts        Hooks barrel
          use-flattened-tree.ts       DFS flatten of tree based on expand state (virtualizer input)
          use-flattened-tree.test.ts  Hook unit tests (7 tests)
          use-tree-keyboard-nav.ts    Keyboard navigation hook (arrow keys, Home/End, Enter/Space, aria-activedescendant)
          use-tree-search.ts          Search state management (debounce, filter, expand preservation)
        lib/              Schema parsing logic and utilities
          index.ts        Lib barrel
          tree-filter.ts  Pure filter function (case-insensitive substring, ancestor propagation)
          tree-filter.test.ts  Filter unit tests (11 tests including performance)
          parsers/        Parser implementations
            index.ts      Parsers barrel
            parse-json-schema.ts
            parse-xsd.ts
            parse-inferred-schema.ts
        schemas.test.ts   Feature-level unit tests
      home/               Home Dashboard
      projects/           Project Overview and Project Settings
      mappings/           Mapping Editor (panels, expression builder, preview, AI features)
      deployments/        Deployment Page (mapping-level and project-level)
      templates/          Template Library
      settings/           Global Settings
    components/           Shared UI components used across features
      index.ts            Barrel export for all shared components
      Button.tsx          Button with variants (primary/secondary/ghost/danger) and sizes
      Card.tsx            Container component with optional title/description header
      PageHeader.tsx      Page title + optional description + action slot
      StatusBadge.tsx     Deploy status colored badge (dot + label)
      layout/             App shell components
        AppLayout.tsx     Layout wrapper (NavBar + Breadcrumbs + Outlet)
        NavBar.tsx        Top navigation bar with app name + nav links
        Breadcrumbs.tsx   Route-derived breadcrumb bar
        index.ts          Barrel export
    hooks/                Shared React hooks
    lib/
      api/                ApiAdapter interface + LocalStorageAdapter + HttpAdapter
      engine/             Browser bundle of src/engine (imported as a package)
      state/              Global state (Context + useReducer)
      types/              UI-specific TypeScript types
        domain.ts         Shared domain model types (includes SchemaTreeNode, ParsedSchema, SchemaNodeType, MappingNodeStatus)
        index.ts          Types barrel
    assets/               Static assets
  index.html
  vite.config.ts
  vitest.config.ts
  tailwind.config.ts
  tsconfig.json
```

**Rules:**
- Components live in `features/{feature}/` if they are feature-specific, or `components/` if shared.
- No component imports directly from another feature's folder — shared code goes to `components/` or `hooks/`.
- The `ApiAdapter` interface is the only path to backend data — no raw `fetch()` calls in components.
- The engine is consumed via `ui/src/lib/engine/` — never imported directly from `src/engine/` at runtime.
- State management: `useReducer` + Context for global state, `useState` for local component state.

---

## `tests/` — Tests

```
tests/
  engine/             Unit and integration tests for src/engine/
    dsl/              DSL parser and evaluator tests
    functions/        DSL function implementation tests
    execute/          Engine execution tests with fixture mapping configs
    validate/         Engine validation tests
  lambda/             Lambda handler tests
  ui/                 UI component and integration tests
    features/         Tests mirroring ui/src/features/ structure
    components/       Tests for shared components
```

**Rules:**
- Test file naming: `{subject}.test.ts` or `{subject}.spec.ts`.
- Engine tests must not import from lambda or UI code.
- UI tests use the component's public interface — no reaching into internal state.
- Every acceptance example (`AE-##`) in a spec must have at least one test tracing back to it.

---

## Placement Decision Guide

When writing a new file, use this to decide where it goes:

| What it is | Where it goes |
|---|---|
| Pure transformation or DSL logic | `src/engine/` |
| Lambda function handler | `src/lambda/{concern}/` |
| Shared backend utility | `src/lib/` |
| React component for one screen | `ui/src/features/{feature}/` |
| React component used in multiple features | `ui/src/components/` |
| Data fetching / API adapter | `ui/src/lib/api/` |
| Global state | `ui/src/lib/state/` |
| Engine test | `tests/engine/` |
| Lambda test | `tests/lambda/` |
| UI component test | `tests/ui/features/{feature}/` |
| Workflow artifact (spec, task, architecture doc) | `forge/` |

**Nothing workflow-related goes in `src/`, `ui/`, or `tests/`. Nothing application-related goes in `forge/`.**
