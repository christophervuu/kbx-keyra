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
    schemas/                  Schema Library + Schema Detail feature module (FS-009, FS-015)
      index.ts                Feature barrel (types + parsers + hooks + components)
      types.ts                Feature-specific tree/editing types (SchemaTreeViewProps, EditNodeCallbacks, SchemaParseError)
      components/
        SchemaDetailPage.tsx  Feature page composition for `/schemas/:schemaId`
        SchemaGitStatus.tsx   Git/source status section (upload vs GitHub source metadata)
        SchemaUsageSection.tsx Usage section (projects + mappings that reference schema)
        SchemaActions.tsx     Context-dependent actions + confirm-dialog flows
        InferredSchemaBanner.tsx Dismissible inferred-schema warning (localStorage-backed UI preference)
        ViewRawModal.tsx      Read-only raw schema modal with lightweight syntax highlighting + copy
        ReplaceFileDialog.tsx Replace-file flow: confirm -> pick -> parse -> persist -> refresh
        SchemaTreeView.tsx    Virtualized schema tree renderer (editable + read-only modes)
      hooks/
        use-schema-detail.ts  Schema load/parse/error + inline metadata update contract
        use-schema-editor.ts  JSON-Schema edit-mode orchestration and save pipeline
        use-schema-usage.ts   Usage derivation across projects + mappings for section/actions
      lib/
        schema-editor-ops.ts  Immutable tree operations for field-level edits
        tree-to-json-schema.ts Tree reconstruction + field counting utilities
        parsers/              parseJsonSchema/parseXsd/parseInferredSchema implementations

    mappings/                 Mapping Editor feature module (FS-010, FS-011)
      index.ts                Feature barrel (components + hooks + utilities)
      components/
        MappingEditorPage.tsx Multi-panel editor shell (8 named panel slots)
        EditorTopBar.tsx      Editor metadata strip (name/version/save/deploy/schema refs)
        PanelPlaceholder.tsx  Placeholder renderer for inactive panels
        RuleList.tsx          Rule list panel surface (CRUD/reorder/bulk + diagnostics)
        ExpressionBuilderPanel.tsx  Panel 4 expression shell (mode toggle + composition)
        RawDslEditor.tsx      Raw DSL textarea editor (overlay highlighting + autocomplete)
        GuidedBuilder.tsx     Step-based builder (source -> transform -> arguments -> preview)
        ExpressionPreview.tsx Live expression preview/result surface
        FunctionReferencePanel.tsx  Collapsible searchable DSL function reference
        AutocompleteDropdown.tsx    Portal dropdown for DSL autocomplete suggestions
      hooks/
        use-engine-validation.ts  Debounced engine validate() integration hook
        use-mapping-editor.ts     Editor orchestration (load/save/rules/validation wiring)
        use-expression-builder.ts  Panel 4 expression state orchestration + debounced commit
        use-expression-preview.ts  Single-expression parse/evaluate preview hook
        use-dsl-autocomplete.ts    Context-aware DSL autocomplete state hook
        use-dsl-validation.ts      Inline parse diagnostics + editor error decorations
      lib/
        infer-rule-type.ts    Expression outer-function -> display label mapping
        dsl-tokenizer.ts      DSL tokenizer for syntax highlighting overlays
        expression-generator.ts  Guided-builder state -> DSL expression generator
        ast-decomposer.ts     Editor expression -> guided-builder decomposition utility
        autocomplete-utils.ts Context detection + suggestion filtering utilities

  lib/
    api/
      types.ts                ApiAdapter contract
      local-storage-adapter.ts
      adapter-provider.tsx
      bootstrap.ts            Adapter selection using VITE_API_URL
    engine/
      index.ts                Browser integration boundary for `@keyra/engine` (validate/execute/parse/evaluate/registry helpers)
    data/
      dsl-functions.ts        Shared DSL function catalog (cross-feature static metadata)
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
  - raw engine functions (`validate`, `execute`, `parse`, `evaluate`, `resolvePath`) for advanced usage
  - `defaultRegistry` and related registry/types for DSL metadata consumers
  - UI adapters (`validateMapping`, `executeMapping`) that convert UI `MappingConfig` to engine-native config shape
  - helper `evaluateExpression()` for single-expression preview evaluation
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

### Canonical Hook Pattern: `useExpressionPreview()` (FS-011)

Location: `ui/src/features/mappings/hooks/use-expression-preview.ts`

Contract:

- Inputs:
  - `expression: string`
  - `sourceData: unknown | null`
  - optional `constants` and `externalSources`
- Behavior:
  - short-circuits to empty preview state when expression is empty or sourceData is null
  - debounces parse/evaluate by 300ms after expression changes
  - uses `evaluateExpression()` from `ui/src/lib/engine/`
  - catches parser/evaluator integration failures and maps to `error` state
- Outputs:
  - `result: unknown | null`
  - `error: string | null`
  - `isEvaluating: boolean`

This pattern is the canonical single-expression engine usage for UI surfaces that need local preview behavior without executing a full mapping.

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

FS-010 establishes the editor shell pattern in `ui/src/features/mappings/`. FS-011 extends the shell with a full Panel 4 expression authoring architecture.

### Multi-Panel Layout + Slot Pattern

- `MappingEditorPage` owns the editor grid and defines stable named panel slots (Panels 1-8).
- Each slot renders a dedicated child panel (or `PanelPlaceholder` when deferred).
- Panel 3 (`Rule List`) is injected as child content (`ruleListContent`) so rule-list behavior can evolve without layout refactors.
- Panel 1 and Panel 4 can also be injected via slot content (`panelOneContent`, `expressionBuilderContent`) to keep page layout stable while feature composition evolves.
- Panel 5 (`Preview`) is injected via `previewContent`.
- Panel 7 (`Configuration`) is injected via `configPanelContent` (FS-017). When not provided, the slot renders a `PanelPlaceholder` labeled "Configuration (Panel 7)". Panel 7 was previously labeled "AI Assist" — that label is retired; AI Assist will be a floating overlay in Phase 2.

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
- It returns state + action callbacks (`addRule`, `updateRule`, `deleteRule`, `reorderRules`, bulk actions, `updateConfig`, `save`, `retry`) as the panel-facing contract.
- `updateConfig(partial: Partial<MappingConfigOptions>)` merges partial config option changes into local state (FS-017). Config changes flow through the `validationConfig` memo → `useEngineValidation()` → re-validation (debounced 300ms). Config changes also set `hasUnsavedChanges` to `true` and are persisted on `save()` alongside rules.

FS-011 expression flow adds a page-level selection bridge:

1. `selectedRuleIndex` is owned at route/page composition level (`routes/pages/MappingEditor.tsx`)
2. `RuleList` uses this value for active-row highlighting and selection toggle callbacks (`onRuleSelect`)
3. `useExpressionBuilder({ selectedRuleIndex, rules, updateRule, parsedSourceSchema })` loads the selected rule expression into local working state
4. local expression edits run inline parse validation (`useDslValidation`) and only commit syntactically valid updates
5. valid expression updates are debounced and committed through `updateRule()`
6. committed rule updates retrigger mapping-level validation (`useEngineValidation`)

This keeps selection concerns outside the data-loading hook while preserving a stable `useMappingEditor` contract.

### Expression Builder Architecture (FS-011)

Panel 4 is implemented as a dual-mode authoring surface:

- **Editor mode:** raw DSL input for power users
- **Builder mode:** guided step flow for common mapping patterns

#### Component hierarchy

`ExpressionBuilderPanel`
- mode toggle (Builder / Editor)
- conditional main surface:
  - `RawDslEditor` (editor mode)
  - `GuidedBuilder` (builder mode)
- `ExpressionPreview`
- `FunctionReferencePanel`

#### Hook contracts

- `useExpressionBuilder()`
  - Inputs: `selectedRuleIndex`, `rules`, `updateRule`, `parsedSourceSchema`
  - Outputs: mode state, expression state, switch handlers, decomposition warning state, parse validity/decorations, flush commit API
  - Responsibilities: load selected-rule expression, preserve local in-progress edits, debounce valid commits

- `useExpressionPreview()`
  - Inputs: expression + optional sample data/context
  - Outputs: `{ result, error, isEvaluating }`
  - Responsibilities: debounced parse/evaluate preview flow via engine boundary helpers

#### Mode-toggle rules

- Builder -> Editor: direct projection of current expression string into raw editor (no decomposition required)
- Editor -> Builder: attempt AST decomposition (`ast-decomposer.ts`)
  - success: hydrate guided-builder initial state
  - failure: stay in editor mode and surface `ComplexExpressionWarning`

#### Raw editor overlay pattern

`RawDslEditor` uses the textarea + synchronized overlay pattern:

- native `<textarea>` owns input/cursor/selection behavior
- overlay `<div>` renders syntax-highlight tokens + error decorations
- overlay uses `pointer-events: none`
- no `contenteditable`, Monaco, or CodeMirror in Phase 0

#### Autocomplete pattern

Autocomplete uses context detection + suggestion filtering utilities (`autocomplete-utils.ts`) and stateful orchestration in `use-dsl-autocomplete.ts`:

- context scanner determines if cursor is in function/source-path/constant/external context
- suggestions are derived from function catalog and schema paths
- dropdown is rendered via portal (`AutocompleteDropdown`)

#### Function catalog pattern

Function metadata is provided by static shared data in `ui/src/lib/data/dsl-functions.ts` (`DSL_FUNCTION_CATALOG`).

- catalog is consumed by guided picker, autocomplete, and function reference surfaces
- runtime parsing/evaluation still uses live engine registry and parser/evaluator through `ui/src/lib/engine/`

#### Cross-panel integration points

- **Panel 3 -> Panel 4:** rule selection controls which rule expression is loaded/edited
- **Panel 1 -> Panel 4:** schema-tree `onSelectNode` inserts `source("path")` in editor mode or fills source slots in builder mode via `ExpressionBuilderPanel` ref API

State management note:

- FS-010 currently uses hook-local `useState` with dispatch-style action callbacks.
- If panel interaction complexity grows in FS-011/FS-012, this boundary is the place to consolidate into a `useReducer` store without changing panel contracts.

---

## Schema Detail Page Architecture

FS-015 establishes the feature-page architecture for `/schemas/:schemaId` under `ui/src/features/schemas/`.

### Page composition pattern

- Route-level wrapper (`ui/src/routes/pages/SchemaDetail.tsx`) is intentionally thin and only resolves route params.
- Feature page (`SchemaDetailPage`) owns orchestration and section layout.
- Stable section order:
  1. inferred-schema banner (conditional)
  2. metadata
  3. git/source status
  4. tree view (+ edit toolbar/banner)
  5. usage
  6. actions
  7. modal/dialog overlays (View Raw + Replace File)

This keeps routing concerns separate from feature logic and allows section-level evolution without route refactors.

### Hook contracts

#### `useSchemaDetail(schemaId)`

Responsibilities:

- loads `SchemaDetail` via `ApiAdapter.getSchema(schemaId)`
- parses content based on metadata format/inferred flag (`parseJsonSchema`, `parseXsd`, `parseInferredSchema`)
- exposes async lifecycle state: loading, error, not-found, retry
- exposes metadata mutation action: `updateMetadata(input)`
- exposes `setParsedSchema(parsed)` so external save flows can push refreshed parse state without forcing full reload

Contract shape:

- `schema: SchemaDetail | null`
- `parsedSchema: ParsedSchema | null`
- `setParsedSchema(parsed)`
- `isLoading`, `error`, `notFound`, `retry()`
- `updateMetadata(input)`

#### `useSchemaEditor(parsedSchema, schemaId, originalContent, onSaved)`

Responsibilities:

- manages edit mode boundary for JSON Schema tree editing
- snapshots `parsedSchema.nodes` into local editable state on entry
- dispatches all row-level edit operations through immutable helpers
- exposes save/cancel behavior and callback bundle for `SchemaTreeView`

Contract shape:

- state: `isEditing`, `editedNodes`, `editedParsedSchema`, `isDirty`
- actions: `startEditing()`, `cancelEditing()`, `saveEdits()`
- callbacks: `editCallbacks` (`toggleRequired`, `changeType`, `renameField`, `updateDescription`, `addField`, `removeField`, `addNestedObject`, `addArrayField`)

Editing state machine (conceptual):

1. **idle** -> `startEditing()` -> **editing(clean)**
2. operation dispatch -> **editing(dirty)**
3. `cancelEditing()` -> **idle** (discard local edits)
4. `saveEdits()` -> reconstruct + persist + re-parse -> **idle** (emit `onSaved` on parse success)

#### `useSchemaUsage(schemaId)`

Responsibilities:

- derives usage data for both display (`SchemaUsageSection`) and action gating (`SchemaActions` remove blocking)
- Phase 0 algorithm:
  - `listProjects()`
  - hydrate each with `getProject(projectId)` to inspect `schemaRefs`
  - keep referencing projects
  - `listMappings(projectId)` for each referencing project
  - classify mapping role as `source` or `target`

Contract shape:

- `projects: UsageProject[]`
- `mappings: UsageMapping[]`
- `isLoading: boolean`

### Tree editing pattern (immutable operations + reconstruction)

Schema editing is intentionally split into three layers:

1. **Operation layer** (`schema-editor-ops.ts`)
   - pure immutable transforms over `SchemaTreeNode[]`
   - no adapter/IO side effects
2. **Reconstruction layer** (`tree-to-json-schema.ts`)
   - converts edited tree back to raw JSON Schema payload
   - preserves top-level keys from original content where possible
   - derives `fieldCount` via `countAllNodes()`
3. **Persistence/orchestration layer** (`useSchemaEditor.saveEdits()`)
   - reconstruct -> `adapter.updateSchema(schemaId, { content, fieldCount })` -> re-parse -> exit edit mode

This separation keeps row-level interactions deterministic/testable while concentrating persistence concerns in a single hook.

### Action visibility rules (origin x scope x format)

Current implementation in `SchemaActions` uses metadata-driven conditional rendering:

- CDM schemas: Re-sync (placeholder), View Raw
- Non-CDM schemas:
  - Edit when `format === 'json-schema'` and not already editing
  - Auto-describe (placeholder)
  - Sync to GitHub (placeholder)
  - Replace file
  - Remove (blocked if usage mappings exist)
  - View Raw
- `scope === 'project'`: additional Promote to Global action + confirm flow

Promote/Remove flows use shared `ConfirmDialog` and adapter mutations (`updateSchema`, `deleteSchema`) with post-action page refresh/navigation.

### UI preference storage vs domain storage

- Domain data (schema content/metadata, delete/promote, usage source records) always flows through `ApiAdapter`.
- UI preference state that is explicitly local-only (inferred-banner dismissal) is stored directly in `localStorage` under key `keyra:schema-banner-dismissed:{schemaId}`.

This preserves adapter boundaries for domain consistency while allowing lightweight client-only UX preferences.

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
