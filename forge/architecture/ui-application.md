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

    mappings/                 Mapping Editor feature module (FS-010, FS-011, FS-020, FS-021, FS-022, FS-023)
      index.ts                Feature barrel (components + hooks + utilities)
      types.ts                TargetFilter, TargetSort, EditorView types
      components/
        MappingEditorPage.tsx Three-column editor shell with draggable resize handles, persistent pixel widths, source expand strip, and bottom collapse/resize behavior (FS-022)
        SourceSchemaPanel.tsx Left column: draggable source schema tree (HTML5 DnD) with internal search input
        TargetWorklist.tsx    Center column (target view): target schema tree + toolbar controls (sort dropdown, Target/Rules view toggle), internal search + 4 filter chips (Unmapped/Warnings/Required/Arrays, AND semantics)
        BuilderEmptyState.tsx Right panel: no-selection guidance + CTAs
        ScalarFieldBuilder.tsx Right panel: scalar field expression authoring + drop zone; embeds UnifiedExpressionBuilder in builder mode and RawDslEditor in editor mode; onApply/onExpressionChange callbacks; compressed header (type badge left, Builder|Editor toggle in header row); conditional Suggested Sources (hidden when empty); Clear mapping action; live result display wired to PreviewContext (FS-021, FS-023, FS-027)
        ObjectSummaryPanel.tsx Right panel: object node coverage + child status; clickable child rows navigate to child field; empty state when no children
        ArrayMappingBuilder.tsx Right panel: 4-step array mapping wizard
        BottomArea.tsx        Full-width tabbed container (Preview/Diagnostics/Trace/Test Cases) retained for Rules View; includes test case selector in tab bar for source-data loading parity (FS-022)
        InlinePreviewStrip.tsx Collapsed bar + expanded strip; unconditional auto-preview on Apply when sourceData is present; test case selector; output flash animation; Run disabled when sourceData empty (FS-022)
        ConnectedInlinePreviewStrip.tsx Owns usePreviewExecution + local state; renders inside PreviewProvider; used as bottomContent in MappingEditor (FS-021 T-05)
        TestLabPage.tsx      Full-page test lab: multi-panel simultaneous layout (2×2 wide, vertical stack medium, tab fallback narrow); resizable main split; ExecutionSummaryBar; ResultPanel wrappers; useTestLabLayout hook; own isolated PreviewProvider (FS-021 T-06, FS-032, FS-033)
        preview/
          ResultPanel.tsx      Reusable panel chrome: header (title + badge + collapse toggle) + content area; children always mounted; CSS hidden for collapse; ARIA aria-expanded on toggle (FS-033)
          ExecutionSummaryBar.tsx  Sticky compact bar: idle | executing | success (duration + rule stats + diagnostic severity badges) | error | timeout; pure component from PreviewExecutionState (FS-033)
        TargetFieldRow.tsx    Atomic target field row (status icon, type badge, expression summary)
        EditorTopBar.tsx      Editor metadata strip (name/version/save/deploy/schema refs); two-row layout (FS-021 T-01)
        PanelPlaceholder.tsx  Placeholder renderer for inactive panels
        RuleList.tsx          Rule list panel surface (CRUD/reorder/bulk + diagnostics + debounced search/filter by target/expression/type; DnD disabled during active search)
        ExpressionBuilderPanel.tsx  Rules View expression shell (mode toggle + composition); embeds UnifiedExpressionBuilder in builder mode and RawDslEditor in editor mode (FS-023)
        RawDslEditor.tsx      Raw DSL textarea editor (overlay highlighting + autocomplete)
        UnifiedExpressionBuilder.tsx Single-form multi-mode builder (Value / Conditional / Value Map) with live expression/result sections (FS-023); FS-029 Source Card integration + FS-030 transform-chain argument wiring and decomposition hydration
        SourceChipPicker.tsx  Value-mode source chip picker with search and static-value toggle (FS-023)
        SourceCard.tsx        FS-029/FS-030 Source Card builder surface: DirectCopy + SourceWithTransform chain pipeline, per-step argument rendering, add/remove step actions, and type-compatible add-step picker wiring
        ArgumentForm.tsx      Parameter-driven argument editor used by FunctionCall and per-step SourceCard chain forms; supports implicit-first-arg offset and variadic slots
        ArgumentSlotInput.tsx Single-slot editor (source/literal/expression) with optional nested source inline transform (single-step chain shape in slot transform)
        ConnectorPrompt.tsx   Pending-connector surface for 2+ selected sources awaiting a combining function (FunctionCall transition)
        BuilderEntryActions.tsx Empty-state entry actions ([+ Add Source] / [+ Add Transformation]) for Source Card flow
        TransformPipeline.tsx  Value-mode ordered transform chain (add/remove/reorder) (FS-023)
        TransformPipelineStep.tsx Value-mode single transform step card (auto-wired first param + dynamic additional params) (FS-023)
        TransformFunctionPicker.tsx Value-mode categorized transform picker with search (FS-023); optional allowedFunctions filtering for FS-030 type compatibility
        ConditionalModeBuilder.tsx Conditional-mode IF/THEN/ELSE builder with grouped AND/OR conditions and nested else-if (FS-023)
        ConditionRowEditor.tsx Conditional-mode single comparison row editor (FS-023)
        BranchValueSelector.tsx Conditional/value-branch selector (static/source/pipeline/else-if) with depth cap messaging; "Build expression" option renders InlinePipelineBuilder (FS-023, FS-025 T-03)
        InlinePipelineBuilder.tsx Compact inline Source + Transform mini-builder for branch values and condition left operands; Value mode only (FS-025 T-03)
        ValueMapModeBuilder.tsx Value-map mode source + table + fallback builder (FS-023)
        LiveExpressionDisplay.tsx Always-visible generated DSL display; click-to-edit handoff to editor mode (FS-023)
        LiveResultDisplay.tsx Always-visible evaluated result display powered by useExpressionPreview (FS-023)
        GuidedBuilder.tsx     Legacy step-based builder retained for non-FS-023 surfaces
        ExpressionPreview.tsx Live expression preview/result surface
        FunctionReferencePanel.tsx  Collapsible searchable DSL function reference
        AutocompleteDropdown.tsx    Portal dropdown for DSL autocomplete suggestions
      hooks/
        use-engine-validation.ts  Debounced engine validate() integration hook
        use-mapping-editor.ts     Editor orchestration (load/save/rules/validation wiring); applyRule(), deleteRuleByTarget(), unsavedRuleCount, canNavigateAway(), onRuleApplied callback (FS-021 T-02, FS-027 T-08)
        use-expression-builder.ts  Rules View expression orchestration + mode switch/decomposition flow (pipeline-decomposer first, legacy fallback) + debounced commit (FS-023)
        use-expression-preview.ts  Single-expression parse/evaluate preview hook
        use-dsl-autocomplete.ts    Context-aware DSL autocomplete state hook
        use-dsl-validation.ts      Inline parse diagnostics + editor error decorations
        use-target-status.ts       Status/coverage derivation from rules + validation
        use-array-builder.ts       Array mapping wizard state (4-step)
        use-drag-source.ts         HTML5 drag state for a single source field
        use-drop-zone.ts           HTML5 drop zone state (isDragOver + handlers)
        use-preview-execution.ts   Preview execution lifecycle hook (FS-012 T-04)
        use-resizable-layout.ts    Resizable layout state hook (source/target widths, bottom height, collapse state, drag handle props, localStorage persistence)
        use-test-cases.ts          Test case CRUD hook keyed by mappingId (FS-012 T-05, FS-034 T-01): save/load/delete/rename/duplicate/update; localStorage key keyra:testcases:{id}
        use-test-run-results.ts    Test run result persistence hook keyed by mappingId (FS-034 T-02): recordResult/clearResult/clearAll; localStorage key keyra:testresults:{id}; results stored as Record<string, TestRunResult> for O(1) lookup
        use-batch-execution.ts     Sequential batch execution hook (FS-034 T-05): runAll/rerunFailed/cancel; pass/fail from zero-error-diagnostic rule; onCaseComplete callback; cancellation ref; unmount cleanup
        use-test-lab-layout.ts     Test Lab multi-panel layout state: breakpoint detection (wide/medium/narrow via matchMedia), panel collapsed states, split ratios (mainSplit/columnSplit/rowSplit), trace auto-expand/collapse, localStorage persistence (keyra:testlab-layout) (FS-033)
      context/
        preview-context.tsx  PreviewContext + PreviewSettersContext + PreviewProvider + hooks (FS-012 T-03)
      lib/
        infer-rule-type.ts    Expression outer-function -> display label mapping
        dsl-tokenizer.ts      DSL tokenizer for syntax highlighting overlays
        expression-builder-state.ts Discriminated union state model for UnifiedExpressionBuilder modes (Value/Conditional/ValueMap); ValueModeState includes `inputType: 'source' | 'static'` and `staticValue?: StaticValue`; FS-029/FS-030 Source Card types (SourceCardValueModeState, ArgumentSlot, TransformChainStep, InlineTransform chain model)
        pipeline-expression-generator.ts Pure state -> DSL generator for UnifiedExpressionBuilder (FS-023)
        pipeline-decomposer.ts DSL -> ExpressionBuilderState decomposer with mode auto-detection and failure reason (FS-023)
        source-card-expression-generator.ts FS-029/FS-030 SourceCardValueModeState -> DSL generator (DirectCopy/SourceWithTransform chain/FunctionCall/PendingConnector)
        source-card-decomposer.ts FS-029/FS-030 DSL -> SourceCardValueModeState decomposer with chain-walking (`CHAINABLE_TRANSFORMS`), backward-compat single-step heuristic (`SINGLE_INPUT_TRANSFORMS`), and FunctionCall fallback
        transform-chain-utils.ts FS-030 chain utilities: getChainOutputType() + getCompatibleChainableTransforms() for add-step picker type compatibility filtering
        expression-generator.ts  Legacy guided-builder state -> DSL expression generator
        ast-decomposer.ts     Legacy editor expression -> guided-builder decomposition utility
        autocomplete-utils.ts Context detection + suggestion filtering utilities
        suggest-source-fields.ts  Heuristic source field suggestions (exact/case/contains + type)
        truncate-expression.ts    Expression display truncation utility (max 60 chars)
        array-expression-generator.ts  Array pattern -> DSL expression generator

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
- `/projects/:projectId/mappings/:mappingId/test-lab` → Test Lab (FS-021 T-06, FS-032)
- `/schemas` → Schema Library
- `/schemas/:schemaId` → Schema Detail
- `/templates` → Template Library
- `/settings` → Settings
- `*` → Not Found

### Layout Route Pattern

All pages render inside a single shell route:

- `AppLayout` provides `NavBar` + `Breadcrumbs` + content container (`<Outlet />`)
- Mapping Editor and Test Lab are treated as focused-workspace routes: breadcrumbs are suppressed and content renders full-bleed (`<main className="flex-1">`) rather than the constrained `max-w-7xl` container
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

FS-020 redesigns the Mapping Editor from an 8-panel grid into a **target-driven three-column layout** with a collapsible bottom area. FS-021 adds the two-row top context model and inline preview strip. FS-022 consolidates toolbar controls into panel-local surfaces, removes Focus/Breadcrumb drill-down mode, introduces persistent resizable panel layout, adds Rules View search, and makes inline preview auto-run on Apply unconditional when source data is present.

### Three-Column + Resizable Layout (FS-022)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Row 1: NavBar (global navigation)                                                 │
│ Row 2: EditorTopBar (mapping context + save/deploy + Auto-map placeholder)       │
├──────────────────────┬┬──────────────────────────────┬┬───────────────────────────┤
│ Source Panel         ││ Target Panel                ││ Builder Panel             │
│ SourceSchemaPanel    ││ TargetWorklist (target)     ││ Node-type-specific panel  │
│                      ││ RuleList (rules view)        ││ / ExpressionBuilderPanel  │
│                      ││ Toolbar contains Sort +      ││                           │
│                      ││ View Toggle + Search/Filters ││                           │
├──────────────────────┴┴──────────────────────────────┴┴───────────────────────────┤
│ Bottom resize handle                                                               │
├────────────────────────────────────────────────────────────────────────────────────┤
│ Bottom area: ConnectedInlinePreviewStrip (Target View) OR BottomArea (Rules View) │
└────────────────────────────────────────────────────────────────────────────────────┘

Legend: vertical `││` separators are draggable resize handles between panels.
```

**Slot props on `MappingEditorPage`:**
- `sourceContent` — `SourceSchemaPanel` (left panel, internal search)
- `targetWorklistContent` — `TargetWorklist` (target view) or `RuleList` (rules view)
- `builderContent` — node-type-specific right panel (see below)
- `bottomContent` — `ConnectedInlinePreviewStrip` (Target View) or `BottomArea` (Rules View)

`toolbarContent` was removed in FS-022; sort and view toggle controls are now internal to `TargetWorklist`.

### Component Hierarchy

```
MappingEditorPage
├── SourceSchemaPanel          (left panel; internal search)
├── TargetWorklist             (center panel, target view)
│   └── TargetFieldRow[]       (recursive tree)
├── RuleList                   (center panel, rules view)
├── Right panel (conditional on selected node type)
│   ├── BuilderEmptyState      (no selection)
│   ├── ScalarFieldBuilder     (scalar leaf node)
│   ├── ObjectSummaryPanel     (object node)
│   ├── ArrayMappingBuilder    (array node)
│   └── ExpressionBuilderPanel (rules view)
└── Bottom content (by view)
    ├── ConnectedInlinePreviewStrip
    │   └── InlinePreviewStrip
    └── BottomArea
```

### View Toggle Pattern

The **Target View / Rules View** segmented toggle (`EditorView = 'target' | 'rules'`) is now rendered in the `TargetWorklist` toolbar row (not in a global toolbar).

- **Target View (default):** center column = `TargetWorklist`; right panel = node-type-specific builder
- **Rules View:** center column = `RuleList`; right panel = `ExpressionBuilderPanel` (existing expression editing UX)

**Selection persistence across view toggles:**
- Target → Rules: find the rule whose `targetPath` matches `selectedTargetPath`; set `selectedRuleIndex`
- Rules → Target: resolve `selectedRuleIndex` rule's `target` path; set `selectedTargetPath`
- If no match found, selection clears gracefully (no error)

State is managed at the composition level (`MappingEditor.tsx`):
- `selectedTargetPath: string | null` — target view selection
- `selectedRuleIndex: number | null` — rules view selection
- `view: EditorView` — current view toggle state

`TargetWorklist` owns toolbar controls for:
- `sort` / `onSortChange`
- `view` / `onViewToggle`
- search input and filter chips

### Node-Type-Specific Right Panel Pattern

When a target field is selected in Target View, the right panel renders based on the node's type:

| Node type | Right panel component |
|---|---|
| none selected | `BuilderEmptyState` |
| `string`, `number`, `boolean`, `integer`, `null` | `ScalarFieldBuilder` |
| `object` | `ObjectSummaryPanel` |
| `array` | `ArrayMappingBuilder` |

`ScalarFieldBuilder` renders within the expression-panel context — it owns its own UnifiedExpressionBuilder/RawDslEditor mode toggle and drop zone, rather than relying on a standalone Panel 4 slot.

### Drag-and-Drop Pattern (HTML5 API)

Source fields in `SourceSchemaPanel` are draggable using the HTML5 Drag API (no external DnD library).

- **Drag payload:** source field path string set as `text/plain` on `DataTransfer`
- **`useDragSource(path)`:** returns `{ isDragging, dragHandlers }` for a single draggable element
- **`useDropZone({ onDrop })`:** returns `{ isDragOver, dropHandlers }` for a drop target; tracks enter/leave depth correctly across child elements
- **Drop zones:** `ScalarFieldBuilder` expression area accepts drops; on drop, inserts `source("path")` into the active builder/editor slot
- **Click-to-stage:** clicking a source field fires `onStageField(path)` — same insertion as drop
- **Visual feedback:** drop zone highlights with `ring-1 ring-blue-500 bg-blue-950/40` on hover; source fields show grip handle + `cursor-grab`

### Resizable Panel Layout (FS-022)

`MappingEditorPage` uses `useResizableLayout()` (`ui/src/features/mappings/hooks/use-resizable-layout.ts`) as the canonical layout state contract.

Hook contract:

- **Inputs:** none
- **Outputs:**
  - `layout: { sourceWidth, targetWidth, bottomHeight, sourceCollapsed, bottomCollapsed }`
  - `sourceHandleProps`, `builderHandleProps`, `bottomHandleProps`
  - `expandSource`, `collapseSource`, `expandBottom`, `collapseBottom`
  - `isDragging`

Persistence:

- localStorage key: `keyra:editor-layout`
- persisted shape:

```json
{
  "sourceWidth": 240,
  "targetWidth": 450,
  "bottomHeight": 260,
  "sourceCollapsed": false,
  "bottomCollapsed": false
}
```

Constraints and behavior:

- Source minimum width: `180px`
- Target minimum width: `250px`
- Builder minimum width target: `300px` (enforced by clamping strategy and flex behavior)
- Bottom minimum expanded height: `180px`
- Bottom maximum height: `65%` of viewport height
- Drag interactions use `mousedown` / `mousemove` / `mouseup` listeners (not HTML5 DnD) to avoid conflicts with source-field drag-and-drop
- During drag, body cursor is forced to `col-resize` or `row-resize` and text selection is disabled

Collapse model:

- **Collapsible:** Source panel, Bottom panel
- **Not collapsible:** Target panel, Builder panel
- Source collapse uses a persistent expand strip in the layout shell
- Bottom collapse uses the strip's collapsed presentation

Fallback behavior:

- Missing, invalid, or corrupt localStorage payload falls back to defaults
- Storage write failures are ignored (no UI crash)

### `useTargetStatus` Hook Contract

Location: `ui/src/features/mappings/hooks/use-target-status.ts`

Inputs:
- `rules: readonly MappingRule[]`
- `validationResult: ValidationResult | null`
- `nodes: readonly SchemaTreeNode[]`

Outputs:
- `statusMap: Map<string, 'unmapped' | 'mapped' | 'warning' | 'error'>` — per-path mapping status
- `coverageMap: Map<string, { mapped: number; total: number }>` — per-object-node child coverage

Derivation logic:
1. All paths start as `'unmapped'`
2. Paths with a matching rule become `'mapped'`
3. Paths with rule diagnostics (warning/error severity) become `'warning'` or `'error'`
4. Object/array nodes derive coverage from their **recursive leaf descendants** (not direct children); an object node's coverage ratio is `leafDescendantsMapped / leafDescendantsTotal` (FS-027 T-12)

### `useArrayBuilder` Hook Contract

Location: `ui/src/features/mappings/hooks/use-array-builder.ts`

Manages the 4-step array mapping wizard state for `ArrayMappingBuilder`.

Inputs:
- `targetArrayPath: string`
- `parsedSourceSchema: ParsedSchema | null`
- `parsedTargetSchema: ParsedSchema | null`

Outputs:
- `step: ArrayBuilderStep` (1–4)
- `pattern: ArrayPattern | null`
- `sourceArrayPath: string | null`
- `fieldMappings: FieldMapping[]`
- `generatedExpression: string`
- Navigation actions: `goToStep`, `nextStep`, `prevStep`
- Field mapping actions: `setSourceArrayPath`, `setPattern`, `addFieldMapping`, `removeFieldMapping`, `updateFieldMapping`

Patterns: `1:1 map`, `filter-then-map`, `merge-arrays`, `build-from-scalars`, `advanced` (bypasses Step 3, opens raw DSL).

### Empty/First-Run State

`BuilderEmptyState` renders in the right panel when no target field is selected. It provides:
- Guidance text: "Select a target field to create its mapping"
- CTA: "Start with required fields" → fires `onFilterRequired()` (sets `required` filter in toolbar)
- CTA: "Auto-map this schema" → **disabled**, muted style, tooltip: "AI-powered auto-mapping — available in a future release"
- Visual hint pointing to the worklist

This replaces the legacy "No rules yet" empty state from `RuleList` in the target-driven view. `RuleList`'s own empty state is still shown in Rules View.

### Top Bar Contract (FS-021)

`EditorTopBar` is the canonical metadata strip for Mapping Editor pages. FS-021 T-01 redesigns it as a **2-row layout** replacing the previous single-row strip:

- **Row 1 (NavBar):** global navigation (provided by `AppLayout`; breadcrumbs suppressed on editor route)
- **Row 2 (context bar):** mapping identity, save state, deploy badges, schema names, action buttons

Props contract:

- `projectId`, `mappingId` — used to build deploy-route and test-route links
- `mappingName` — displayed in context bar
- `version` — displayed as `v{N}` badge
- `saveStatus: 'saved' | 'unsaved' | 'saving' | 'error'` — drives save indicator display
- `unsavedCount: number` — count of applied-but-not-saved rules; shown as badge when > 0
- `deployStatus: HighestDeployStatus | null` — derived from deployment context; drives stale badge (strictly version-based, no content diff)
- `sourceSchemaName`, `targetSchemaName` — schema context labels
- `onSave` — save callback
- `onHistoryToggle` — optional; when provided, renders "History" button (clock icon) for version history drawer
- Auto-map placeholder action is rendered in this top bar as a disabled control (feature intentionally not implemented)

### Two-Tier Save Model (FS-021 T-02)

The editor uses a **two-tier save model** to separate expression authoring from persistence:

**Tier 1 — Apply:**
- `ScalarFieldBuilder` exposes an `onApply` callback and an `apply-btn` test ID.
- Clicking Apply calls `useMappingEditor.applyRule(targetPath, expression)`, which upserts the rule into local state and increments `unsavedRuleCount`.
- After applying, the builder **remains on the current field** in a committed state: the Apply button shows a disabled "Applied ✓" indicator until the user makes further edits. Auto-advance was removed in FS-025 T-04.
- `onExpressionChange` fires on every keystroke so the parent can track the in-progress expression.
- **"Next unmapped →" button:** visible when unmapped target fields remain; clicking it navigates to the next unmapped field in document order. Keyboard shortcut: `Ctrl+]` / `Cmd+]`.
- `onAdvanceToNext` callback on `ScalarFieldBuilder` is wired to the composition layer's `getNextUnmappedPath` logic in `MappingEditor.tsx`.

**Tier 2 — Save:**
- `useMappingEditor.save()` persists all applied rules to `LocalStorageAdapter` and resets `unsavedRuleCount` to 0.
- Triggered by Ctrl+S or the Save button in `EditorTopBar`.
- `saveStatus` reflects the persistence lifecycle: `'saved' | 'unsaved' | 'saving' | 'error'`.

**Navigation guard:**
- `useMappingEditor.canNavigateAway()` returns `true` when `unsavedRuleCount === 0`.
- `MappingEditor.tsx` uses React Router v6 `useBlocker` to intercept navigation when `!canNavigateAway()`.
- A confirmation dialog is shown: "You have unapplied changes. Leave anyway?" with Confirm/Cancel.

**`useMappingEditor` additions (FS-021 T-02, FS-027 T-08):**
- `applyRule(targetPath: string, expression: string): void` — upserts rule, increments `unsavedRuleCount`
- `deleteRuleByTarget(targetPath: string): void` — removes the rule for a given target path from working session; marks session as having unsaved changes (FS-027 T-08)
- `unsavedRuleCount: number` — count of applied-but-not-saved rules
- `canNavigateAway(): boolean` — returns `unsavedRuleCount === 0`
- `onRuleApplied?: () => void` — optional callback fired after each `applyRule()` call; used by `ConnectedInlinePreviewStrip` to trigger auto-preview

### Per-Panel Search

Search state is **owned per-panel** rather than in the global toolbar:

- **Source panel (`SourceSchemaPanel`):** internal search input using `useTreeSearch` hook; no filter chips.
- **Target panel (`TargetWorklist`):** internal search input + 4 filter chips (Unmapped / Warnings / Required / Arrays); filter chips use AND semantics (`activeFilters: Set<TargetFilter>`).
- Global toolbar surface has been removed; panel-specific controls remain in their owning panels.

This change was made in FS-021 T-03 to reduce prop drilling and allow each panel to own its own search lifecycle independently.

### Inline Preview Strip

`InlinePreviewStrip` replaces the 4-tab `BottomArea` as the bottom slot in Target View:

- **Collapsed state (default):** a slim bar showing last output summary and a Run button.
- **Expanded state:** full strip with source data input, output display, and run controls.
- **Unconditional auto-preview on Apply:** when `lastApplyTimestamp` changes (rule Apply event), the strip calls `onRun()` whenever `sourceData` is non-empty. There is no auto-preview toggle in this strip.
- **Test case selector:** the strip supports `testCases` and `onLoadTestCase` props; users can load saved test cases directly into the source textarea. If no saved cases exist, selector shows a disabled empty-state option.
- **Output flash animation:** a brief highlight animation plays on the output area when new results arrive.
- **Run disabled:** the Run button is disabled when `sourceData` is empty (AE-14 compliance).
- **`ConnectedInlinePreviewStrip`:** thin wrapper that owns `usePreviewExecution` and local state; must be rendered inside `<PreviewProvider>`. Used as `bottomContent` in `MappingEditor.tsx`.
- **Rules View parity:** `BottomArea` also exposes the same test case selector behavior so saved test cases can be loaded without switching views.
- **`PreviewProvider` isolation:** `MappingEditor.tsx` wraps its content in a `<PreviewProvider>`. The Test Lab page has its own separate `<PreviewProvider>` — they are never co-mounted.

### Test Lab Page (FS-021 T-06, FS-032, FS-033, FS-034)

Route: `/projects/:projectId/mappings/:mappingId/test-lab`

A dedicated full-page testing surface that provides simultaneous visibility of all four result panels (Output, Diff, Diagnostics, Trace) with a resizable main split, responsive breakpoint layout, per-panel collapse controls, and a full test case management sidebar with batch execution.

**Page composition:**
- `MappingTestLab.tsx` (route page) — thin wrapper; extracts `projectId`/`mappingId` from route params; renders `TestLabPage`.
- `TestLabPage.tsx` (feature component) — wraps content in its own isolated `<PreviewProvider>`; delegates to `TestLabInner`.
- `TestLabInner` — owns all state and hooks; never co-mounted with the editor's `PreviewProvider`.

**Responsive breakpoints:**
- **Wide (>= 1280px):** 2×2 CSS Grid layout — Output (top-left), Diff (top-right), Diagnostics (bottom-left), Trace (bottom-right). Three resizable dividers: main split (left/right), column divider (between result columns), row divider (between result rows).
- **Medium (1024–1279px):** Vertical flex stack. Output always expanded (not collapsible). Diff, Diagnostics, Trace have collapse toggles. Main split divider active. No column/row dividers.
- **Narrow (< 1024px):** Tab fallback — tab bar (Output | Diagnostics | Trace | Diff) with corresponding display components. No dividers.

**Layout (two-panel, full page height):**
```
┌─────────────────────────────────────────────────────────┐
│  Top bar (Back to Editor | name | Trace | Auto-run | Run)│
├─────────────────────────────────────────────────────────┤
│  Execution Summary Bar (status | duration | rule stats)  │
├──────────────────┬──┬──────────────────────────────────┤
│  Left panel      │  │  Right panel (breakpoint-driven)  │
│  (mainSplit %)   │▐▌│  Wide: 2×2 grid                  │
│                  │  │  Medium: vertical stack            │
│  TestCaseList-   │  │  Narrow: tab layout               │
│  Panel (upper)   │  │                                   │
│  SourceDataInput │  │                                   │
│  (lower)         │  │                                   │
└──────────────────┴──┴──────────────────────────────────┘
```

**Resizable main split:**
- Default ratio: `0.35` (35% left / 65% right)
- Clamped: `[0.2, 0.5]`
- Persisted to `keyra:testlab-layout` as `mainSplit`
- Drag handle: 4px vertical divider between left and right panels

**Wide layout grid dividers:**
- Column divider: between Output/Diagnostics column and Diff/Trace column; `columnSplit` ratio, clamped `[0.2, 0.8]`
- Row divider: between top row (Output/Diff) and bottom row (Diagnostics/Trace); `rowSplit` ratio, clamped `[0.2, 0.8]`
- Both dividers use mouse-event drag (mousedown/mousemove/mouseup), consistent with `useResizableLayout` pattern

**Top bar:**
- Mapping name + version (read-only context via `useMappingEditor`)
- "← Back to Editor" link (navigates to `/projects/:projectId/mappings/:mappingId`)
- Trace mode toggle (checkbox)
- Auto-run toggle (checkbox)
- Run button (disabled when `sourceData` is null or mapping config/schemas not loaded, or batch is running)

**Execution Summary Bar (`ExecutionSummaryBar`):**
- Sticky bar between top bar and result area; renders at all breakpoints
- Displays: idle message | executing spinner | success (green dot + duration + rule stats + diagnostic severity badges) | error (red dot + message) | timeout (amber dot)
- Props: `state: PreviewExecutionState`
- Diagnostic badges only shown for severities with count > 0

**`ResultPanel` component:**
- Reusable wrapper for each result panel
- Props: `title`, `badge?` (count + variant), `collapsed`, `onToggleCollapse`, `collapsible?` (default true), `emptyState?`, `isEmpty?`, `children`, `className?`, `testId?`
- Children always remain mounted (CSS `hidden` class used for collapse, not unmounting)
- Badge variants: `info` (blue), `warning` (amber), `error` (red)
- Collapse toggle button has ARIA `aria-expanded` and `aria-label`

**`useTestLabLayout` hook:**
- Input: `{ traceEnabled: boolean }`
- Output: `{ layout: TestLabLayoutState, togglePanel, setMainSplit, setColumnSplit, setRowSplit }`
- `TestLabLayoutState`: `{ breakpoint: 'wide' | 'medium' | 'narrow', collapsed: { output, diff, diagnostics, trace }, mainSplit, columnSplit, rowSplit }`
- Breakpoint detection via `window.matchMedia` with change listeners
- Trace panel auto-collapses when `traceEnabled` changes to `false`; auto-expands when changed to `true`
- `togglePanel('output')` is a no-op at medium breakpoint (Output always expanded)
- Persistence key: `keyra:testlab-layout`; shape: `{ collapsed, mainSplit, columnSplit, rowSplit }`
- Trace collapsed state is always derived from `traceEnabled` on mount (not read from localStorage)
- Storage write failures are caught and ignored silently

**Panel visibility rules:**
- Output: always expanded at medium; collapsible at wide and narrow
- Diff, Diagnostics, Trace: collapsible at all breakpoints
- Trace: auto-collapsed when `traceEnabled === false`

**Hook wiring:**
- `useMappingEditor(mappingId)` — loads mapping config and schemas independently on mount; no shared React Context with the editor page.
- `usePreviewExecution({ config, sourceSchemaDetail, targetSchemaDetail, sourceDataRaw })` — execution lifecycle.
- `useTestLabLayout({ traceEnabled })` — panel layout state, breakpoint detection, persistence.
- `useTestCases(mappingId)` — test case CRUD (save/load/delete/rename/duplicate/update); reads from `keyra:testcases:{mappingId}`.
- `useTestRunResults(mappingId)` — run result persistence; reads from `keyra:testresults:{mappingId}`.
- `useBatchExecution({ config, sourceSchema, targetSchema, onCaseComplete })` — sequential batch execution; fires `onCaseComplete` after each case; parent calls `recordResult`.

**`PreviewProvider` isolation:** the Test Lab page wraps its content in its own `<PreviewProvider>`, independent from the editor's provider. Both pages independently access the same localStorage keys via their respective hook instances. This avoids stale-reference risk and is future-proof for `HttpAdapter` migration.

### Test Case Management (FS-034)

The Test Lab page provides a full test case management sidebar (`TestCaseListPanel`) that replaces the legacy `TestCaseManager` dropdown.

**Selection model:**
- `selectedTestCaseId: string | null` — `null` means Scratchpad is active.
- Scratchpad is ephemeral: always starts empty, not persisted across navigations.
- Selecting a saved test case loads its `sourceData` into the source textarea and its `expectedOutput` into the Diff tab.
- Selecting Scratchpad clears the source textarea.

**`TestCaseListPanel` component:**
- Props: `testCases`, `selectedId`, `runResults`, `onSelect`, `onSelectScratchpad`, `onRename`, `onDuplicate`, `onDelete`, `onAddNew`, `onSaveCurrentInput`, `sourceDataRaw`, `onRunAll`, `onRerunFailed`, `onCancel`, `batchState`, `toolbarSlot?`
- Permanent Scratchpad pseudo-entry at top of list (non-deletable, non-renamable)
- Status badges: green = pass, red = fail, gray = not run
- Inline rename: double-click name → input → Enter confirms, Escape/blur cancels
- Delete confirmation when run results exist for the case
- Add New / Save As toolbar row (primary)
- Run All / Rerun Failed / progress / summary toolbar row (batch)

**`TestRunResult` type:**
```ts
interface TestRunResult {
  testCaseId: string;
  status: 'pass' | 'fail';
  errorCount: number;
  warningCount: number;
  executedAt: ISODateString;
  durationMs: number;
  outputSnapshot?: unknown;
}
```
Storage key: `keyra:testresults:{mappingId}` — stored as `Record<string, TestRunResult>` for O(1) lookup by `testCaseId`. Separate from `keyra:testcases:{mappingId}` to preserve backward compatibility with existing `TestCase` data.

**`useTestRunResults` hook:**
- Input: `mappingId: string`
- Output: `{ results, recordResult, clearResult, clearAll }`
- `results: Readonly<Record<string, TestRunResult>>` — keyed by `testCaseId`
- Reloads on `mappingId` change; corrupted data resets to `{}` with console warning

**`useBatchExecution` hook:**
- Input: `{ config, sourceSchema, targetSchema, onCaseComplete? }`
- Output: `{ isRunning, progress: { current, total }, runAll, rerunFailed, cancel }`
- Sequential execution: one test case at a time, yields to event loop between cases
- Pass/fail: zero error-severity diagnostics = pass; any errors, invalid JSON, or engine throw = fail
- `rerunFailed` filters to cases with `status === 'fail'` in the provided results map
- Cancellation: `cancel()` sets a ref flag checked before each case; current case always completes
- Cleanup: cancels on unmount via `useEffect` cleanup
- Does not own result persistence — fires `onCaseComplete(testCaseId, result)` and caller persists via `recordResult`

**Batch summary:**
- After `runAll` or `rerunFailed` completes, `TestLabInner` computes `{ passed, failed }` from the updated `runResults` and passes it to `TestCaseListPanel` as `batchState.summary`
- Summary is shown inline in the batch toolbar row; cleared when a new batch starts

`RuleList` includes a local search bar for filtering visible rules by case-insensitive substring match against:

- `rule.target`
- `rule.expression`
- `rule.type`

Behavior:

- search input state is debounced by `200ms`
- displayed rows are filtered via `filteredIndices` while retaining original rule indices for all operations
- match count is displayed as `{N} of {M} rules` when search is active
- clear button resets query and restores full list
- no-match state renders inline guidance (`No rules match your search`)
- drag-and-drop reorder is disabled while search is active to avoid index-remapping ambiguity
- multi-select `Select All` operates on filtered rows only while search is active

### Version History Drawer (FS-018)

Version history is implemented as a **right-side overlay drawer**, not a grid panel. The drawer sits outside the `MappingEditorPage` grid and is composed at the route page level (`routes/pages/MappingEditor.tsx`).

**Storage model:**
- Each successful save triggers `adapter.saveMappingVersion(mappingId, entry)` (fire-and-forget, errors logged only).
- Entries are stored under `keyra:versions:{mappingId}` in localStorage, capped at 50 entries (oldest pruned).
- Each `MappingVersionEntry` stores: `version`, `savedAt` (ISO string), `savedBy`, `ruleCount`, and the full `MappingConfig` snapshot.

**`useVersionHistory(mappingId, currentConfig)` hook:**
- Loads version list from `adapter.listMappingVersions(mappingId)` on mount.
- Sorts versions descending (most recent first).
- Computes a `summary` string per entry: `"Initial version — N rules"` for the first, or a diff-based summary (`"+N added, ~M modified"`) for subsequent versions.
- Exposes `selectedVersion`, `selectVersion(n)`, `selectedDiff` (diff from selected version to current), `getRestoreConfig(version)`, and `refresh()`.

**Restore flow:**
1. User selects a version in `VersionHistoryDrawer` → `VersionDiffView` renders the diff.
2. User clicks "Restore v{N}" → `ConfirmDialog` confirms (warns about unsaved changes if applicable).
3. On confirm: `history.getRestoreConfig(version)` retrieves the full `MappingConfig` snapshot.
4. `editor.actions.restore(config)` replaces working state, increments version, and persists immediately.
5. Drawer closes; `history.refresh()` is called after a brief delay to reload the updated version list.

**Component hierarchy:**
- `VersionHistoryDrawer` — slide-in panel with backdrop, version list, loading/empty states.
- `VersionListItem` — per-entry row with version badge, relative timestamp, rule count, summary, "Current" badge.
- `VersionDiffView` — diff detail view injected into the drawer's `children` slot when a version is selected; includes restore button and confirmation modal.
- `VersionDiffView` reuses the existing `ConfirmDialog` component for restore confirmation.

### Editor Data Flow

- `useMappingEditor(mappingId)` is the feature orchestration boundary.
- It loads mapping + schemas through `ApiAdapter`, owns local rule mutations, and wires validation through `useEngineValidation()`.
- It returns state + action callbacks (`addRule`, `updateRule`, `deleteRule`, `reorderRules`, bulk actions, `updateConfig`, `restore`, `save`, `retry`) as the panel-facing contract.
- `updateConfig(partial: Partial<MappingConfigOptions>)` merges partial config option changes into local state (FS-017). Config changes flow through the `validationConfig` memo → `useEngineValidation()` → re-validation (debounced 300ms). Config changes also set `hasUnsavedChanges` to `true` and are persisted on `save()` alongside rules.
- `restore(restoreConfig: MappingConfig)` replaces the entire working state (rules + config options) with the provided config, increments the version, and immediately persists via `adapter.updateMapping()`. On success it also fires a version snapshot via `adapter.saveMappingVersion()` (fire-and-forget). This is the end-to-end restore path for version history (FS-018).

FS-020 target-driven composition adds page-level state:

1. `selectedTargetPath` is owned at route/page composition level
2. `TargetWorklist` uses this for active-row highlighting and fires `onSelectNode(path, type)`
3. Right panel component is selected based on the node type at `selectedTargetPath`
4. `ScalarFieldBuilder` owns its own expression state and fires `onSave(targetPath, expression)` to the composition layer
5. `handleSaveExpression` at composition level upserts the rule (update existing or add new)

### Expression Builder Architecture (FS-011, FS-023)

The expression builder is a dual-surface authoring system used in two contexts:
- **Rules View:** `ExpressionBuilderPanel` (rule-selected panel)
- **Target View / scalar fields:** `ScalarFieldBuilder` (target-selected panel)

Both surfaces now use the same builder implementation in builder mode: `UnifiedExpressionBuilder`.

#### Component hierarchy (Rules View)

`ExpressionBuilderPanel`
- mode toggle (Builder / Editor)
- decomposition warning (`ComplexExpressionWarning`) when editor expression cannot hydrate builder
- conditional main surface:
  - `RawDslEditor` (editor mode)
  - `UnifiedExpressionBuilder` (builder mode)
    - mode tabs: Value | Conditional | Value Map
    - mode-specific content:
      - Value mode: `SourceChipPicker` + `TransformPipeline` (`TransformPipelineStep[]` + `TransformFunctionPicker`)
      - Conditional mode: `ConditionalModeBuilder` (`ConditionRowEditor[]`, nested groups, `BranchValueSelector`)
      - Value Map mode: `ValueMapModeBuilder`
    - shared always-visible sections:
      - `LiveExpressionDisplay`
      - `LiveResultDisplay`
- `ExpressionPreview`
- `FunctionReferencePanel`

#### Component hierarchy (Target View / ScalarFieldBuilder)

`ScalarFieldBuilder`
- header: target path, type badge, required/optional, status
- suggested sources (heuristic, up to 5)
- mode toggle (Builder / Editor)
- expression area (drop zone for DnD):
  - `UnifiedExpressionBuilder` (builder mode)
  - `RawDslEditor` (editor mode)
- disabled AI action buttons (placeholder)
- apply button (gated on `isValid && expression.trim()`)

#### State model

`UnifiedExpressionBuilder` owns a discriminated union state model:

`ExpressionBuilderState`
- `mode: 'value'` — source selections + transform pipeline (+ optional static value)
- `mode: 'conditional'` — condition tree + then/else branches
- `mode: 'valueMap'` — input source + mapping rows + fallback

The expression string is derived from state on each change and propagated upward through `onExpressionChange`.

#### Transform Chain Model (FS-030)

FS-030 evolves Source Card inline transforms from a single wrapper to a chain pipeline model.

Type definitions and ordering:

- `TransformChainStep = { functionName: string; args: readonly ArgumentSlot[] }`
- `InlineTransform = { steps: readonly TransformChainStep[] }`
- Chain ordering is **innermost-first**:
  - `steps[0]` is applied to `source("path")`
  - each later step consumes the previous step's output as implicit arg1
  - last step produces final output

Chain state locations:

- top-level source-card transform: `SourceWithTransformState.transform`
- nested source slot transform: `ArgumentSlot.transform` when `slot.mode === 'source'`

`CHAINABLE_TRANSFORMS` vs `SINGLE_INPUT_TRANSFORMS`:

- `CHAINABLE_TRANSFORMS` (used for chain-walking and add-step candidates) includes:
  - String: `upper`, `lower`, `trim`, `replace`, `replaceAll`, `length`, `substring`
  - Date: `formatDate`
  - Math: `add`, `subtract`, `multiply`, `divide`, `round`, `abs`
  - TypeConversion: `cast`
  - NullHandling: `default`
  - Array: `flatten`, `first`, `count`
- `SINGLE_INPUT_TRANSFORMS` remains narrower and is used only for backward-compatible **single-step** top-level decomposition decisions.

Generation algorithm (chain -> DSL):

1. Start with base expression `source("{sourcePath}")`
2. Iterate `transform.steps` in order
3. For each step, build `step.functionName(previousExpression, ...step.args)`
4. Final wrapped expression is emitted

Example:

`steps = [divide(y), multiply(100), round(2)]`
-> `round(multiply(divide(source("x"), source("y")), 100), 2)`

Decomposition algorithm (DSL -> chain):

1. Walk outermost -> innermost through function-call first arguments
2. Record each function only if it is in `CHAINABLE_TRANSFORMS`
3. Collect non-first arguments as `step.args`
4. Stop successfully when base reaches `source("path")`
5. Fail chain-walk when encountering a non-chainable function or non-source base

Top-level backward-compat heuristic:

- 2+ recovered steps => `SourceWithTransform` chain
- exactly 1 recovered step => preserve FS-029 behavior by applying `SINGLE_INPUT_TRANSFORMS` heuristic (otherwise `FunctionCall`)

Non-linear fallback:

- if chain-walk fails, decomposition falls back to `FunctionCall` (or `null` if unsupported), never forcing an invalid chain model.

Type compatibility enforcement for `[+ Add Step]`:

- `getChainOutputType(steps, sourceType?)` computes current pipeline output type from last step return type (or source type / `any`)
- `getCompatibleChainableTransforms(outputType)` filters `DSL_FUNCTION_CATALOG` to chainable transforms whose first parameter accepts the output type
- `TransformFunctionPicker` receives `allowedFunctions` so incompatible transforms are excluded from add-step UI

SourceCard rendering pattern:

- SourceCard shows a **vertical pipeline** (`<ol>`) of steps
- each row renders a step badge, remove button, and per-step `ArgumentForm` for additional args only (implicit arg1 hidden)
- connector visuals indicate flow between rows
- `[+ Add Step]` appends a new chain step and opens type-filtered picker

#### State hydration on target selection (FS-025 T-01)

When `selectedTargetPath` changes in the composition layer:
1. The matching rule expression (if any) is looked up from `editor.rules`.
2. The expression is passed to `decomposeExpression()` (`pipeline-decomposer.ts`).
3. **Decomposition success:** builder state is hydrated with the returned `ExpressionBuilderState`; mode is auto-detected (Value / Conditional / Value Map); Builder mode is activated.
4. **Decomposition failure:** raw expression is loaded into Editor mode; a "Complex expression — edit in Editor mode" warning banner is shown.
5. **No rule / empty expression:** builder resets to default empty state (Value mode, no sources, no transforms).

`ScalarFieldBuilder` passes `initialState` to `UnifiedExpressionBuilder`, which applies it via a `useEffect` on mount or when the prop reference changes.

#### Builder reset on navigation (FS-025 T-02)

- The builder fully resets when the user navigates to a different target field.
- The navigation guard (FS-021 AE-05) fires before reset when unapplied changes exist.
- `UnifiedExpressionBuilder` is keyed on `selectedTargetPath` in `ScalarFieldBuilder` to guarantee state isolation between fields.

#### Conditional branch expressions (FS-025 T-03)

`BranchValue` discriminated union extended with:
- `{ kind: 'pipeline'; state: ValueModeState }` — structured inline mini-builder state for then/else branches

`Operand` (condition left/right side) extended with:
- `{ kind: 'pipeline'; value: string; pipelineState: ValueModeState }` — structured inline mini-builder state for left operands

Rules:
- Inline mini-builder is **Value mode only** (Source + Transforms); no nested conditionals or value-maps within branches.
- Expression generation calls `generateValueExpression(state)` for `kind: 'pipeline'` branches and operands.
- Decomposer attempts per-branch pipeline decomposition for transform-chain branches (e.g., `upper(source("tier"))` → `kind: 'pipeline'`); falls back to `kind: 'expression'` (raw DSL string) if decomposition fails.
- `InlinePipelineBuilder` component renders a compact `SourceChipPicker` + `TransformPipeline` + sub-expression preview within branch containers and condition left operand rows.

#### Expression generation

- Canonical generator: `generateExpressionFromState(state)` (`pipeline-expression-generator.ts`)
- Pattern: pure state -> DSL transform
- Value mode uses nested wrapping semantics:
  - innermost: `source("path")` for `inputType === 'source'`; bare DSL literal (`"hello"`, `42`, `true`, `null`) for `inputType === 'static'` (FS-027 T-06)
  - each transform wraps prior output
  - final string matches pipeline order
- Static value DSL: string → `"value"`, number → `42`, boolean → `true`/`false`, null → `null`. No `static()` wrapper in new expressions; `static()` is accepted by the decomposer for backward compatibility.
- Conditional mode generates `if(condition, then, else)` with nested `if()` for else-if branches
- Value Map mode generates `valueMap(source("field"), {...}, fallback)`

#### Expression decomposition

- Canonical decomposer: `decomposeExpression(expression)` (`pipeline-decomposer.ts`)
- Pattern: DSL string -> `ExpressionBuilderState` or failure reason
- Mode auto-detection from outer AST structure:
  - `if(...)` -> conditional mode
  - `valueMap(...)` -> value-map mode
  - transform/source pipeline -> value mode (`inputType: 'source'`)
  - bare literal at root (`"hello"`, `42`, `true`, `false`, `null`) -> value mode (`inputType: 'static'`) (FS-027 T-06)
  - `static(...)` wrapper -> value mode (`inputType: 'static'`, backward compat)
- Failure path: remain in editor mode and show warning banner ("Complex expression -- edit in Editor mode.")

#### Hook contracts

- `useExpressionBuilder()`
  - Inputs: `selectedRuleIndex`, `rules`, `updateRule`, `parsedSourceSchema`
  - Outputs: mode state, expression state, switch handlers, decomposition warning state, parse validity/decorations, flush commit API, decomposition hydration state, and `loadExpression`
  - Responsibilities:
    - load selected-rule expression via `loadExpression(expression: string | null)` — triggers decomposition and state hydration (or reset for null/empty); called automatically on `selectedRuleIndex` change
    - preserve local in-progress edits
    - debounce valid commits
    - Builder/Editor toggle orchestration
    - editor->builder decomposition using `pipeline-decomposer.ts` first, with legacy fallback for compatibility

- `useExpressionPreview()`
  - Inputs: expression + optional sample data/context
  - Outputs: `{ result, error, isEvaluating }`
  - Responsibilities: debounced parse/evaluate preview flow via engine boundary helpers

- `useDragSource(path)` — drag state for a single source field; returns `{ isDragging, dragHandlers }`
- `useDropZone({ onDrop })` — drop zone state; returns `{ isDragOver, dropHandlers }`

#### Mode-toggle rules

- Builder -> Editor: direct projection of current generated expression string into raw editor
- Editor -> Builder: decomposition attempt via pipeline decomposer
  - success: hydrate builder state + auto-switch to detected mode (Value / Conditional / Value Map)
  - failure: stay in editor mode + surface `ComplexExpressionWarning`

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

- **Target Worklist → Right Panel:** node selection controls which builder renders and which expression is loaded/edited
- **Source Panel → ScalarFieldBuilder:** drag-and-drop or click-to-stage inserts `source("path")` into the active expression slot in editor mode, and in builder mode feeds the UnifiedExpressionBuilder source flow
- **Source Panel → ExpressionBuilderPanel (Rules View):** `expressionBuilderRef.insertSourceField(path)` inserts into active expression flow (editor direct insertion; builder-mode source flow handled by UnifiedExpressionBuilder)

State management note:

- FS-020 uses hook-local `useState` with dispatch-style action callbacks at composition level.
- If panel interaction complexity grows, the composition-level state is the place to consolidate into a `useReducer` store without changing panel contracts.

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
