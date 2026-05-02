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
        index.ts          Feature barrel (re-exports hooks + components)
        components/       Editor page shell components
          index.ts        Components barrel
          BulkActionBar.tsx          Bulk action toolbar (appears when rules are selected: copy, duplicate, delete)
          ConfirmDialog.tsx          Reusable focus-trapped confirmation dialog (modal overlay, Escape to close)
          ConfirmDialog.test.tsx     Component tests (12 tests: rendering, focus trap, keyboard, callbacks)
          DiagnosticDetail.tsx       Expandable diagnostic panel (code, severity badge, message, expression snippet)
          EditorTopBar.tsx           Top bar (name, version, save status, deploy badges, schema names, deploy link)
          MappingEditorPage.tsx      Multi-panel grid layout container (8 named panel slots)
          MappingEditorPage.test.tsx Component tests (22 tests: top bar, panels, slots, routing)
          PanelPlaceholder.tsx       Generic placeholder for inactive panels
          RuleForm.tsx               Add/edit rule form (target, expression, description fields, validation)
          RuleForm.test.tsx          Component tests (14 tests: add/edit modes, validation, callbacks)
          RuleList.tsx               Rule list container (DnD reorder, CRUD state, multi-select, bulk actions, copy/paste, summary bar, keyboard nav, aria-activedescendant, empty/missing states)
          RuleList.test.tsx          Component tests (107 tests: rendering, CRUD, DnD reorder, move buttons, multi-select, bulk ops, copy/paste, announcements)
          RuleRow.tsx                Individual rule row (checkbox-first tab order, drag handle, move up/down, target, expression, type badge, validation icon, edit/copy/delete, isFocused ring, id for aria-activedescendant)
          ValidationSummaryBar.tsx   Validation summary (role=status, aria-live=polite, aria-atomic=true, aria-label, rule count, valid/warning/error counts, coverage %)
          accessibility.test.tsx     Accessibility tests (T-08: ARIA attrs, keyboard nav, focus trap, focus return, tab order, aria-controls/expanded)
        hooks/            Feature-specific React hooks
          index.ts        Hooks barrel
          use-engine-validation.ts       Debounced validation hook (300ms, wraps engine validate())
          use-engine-validation.test.ts  Hook unit tests (14 tests: debounce, summary, coverage, error handling)
          use-mapping-editor.ts          Orchestration hook: load/save config+schemas, local rules state, Ctrl+S, beforeunload, unsaved detection
          use-mapping-editor.test.tsx    Hook unit tests (26 tests: loading, save, unsaved detection, keyboard, beforeunload, actions)
        lib/              Pure utility functions
          index.ts        Lib barrel
          infer-rule-type.ts         Maps outermost expression function name to display label
          infer-rule-type.test.ts    Unit tests (14 tests: all rule type patterns)
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
      engine/             Browser integration layer for src/engine (imported via @keyra/engine alias)
        index.ts          Exports validateMapping(), executeMapping(), toEngineConfig adapter, and re-exports engine types
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
