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
      types.ts                Feature-shared mappings types: TargetFilter/TargetSort/EditorView, linked debug selection, and comparison mode config (`COMPARISON_MODES`)
      components/
        MappingEditorPage.tsx Three-column editor shell with draggable resize handles, persistent pixel widths, source expand strip, and bottom collapse/resize behavior (FS-022)
        SourceSchemaPanel.tsx Left column: draggable source schema tree (HTML5 DnD) with internal search input
        TargetWorklist.tsx    Center column (target view): target schema tree + toolbar controls (sort dropdown, Target/Rules view toggle), internal search + 4 filter chips (Unmapped/Warnings/Required/Arrays, AND semantics)
        BuilderEmptyState.tsx Right panel: no-selection guidance + CTAs
        ScalarFieldBuilder.tsx Right panel: scalar field expression authoring + drop zone; FS-039 auto-draft model: updateDraft/revertDraft/getDraftExpression props replace onApply; Discard button reverts draft; no Apply/Next Unmapped buttons; onExpressionChange optional (used for preview debounce); compressed header (type badge left, Builder|Editor toggle in header row, ⋮ overflow menu for Remove mapping); Suggested Sources removed (FS-040); BuilderFeedbackArea pinned between header and expression area (FS-040 T-02); UnsavedDiffPanel below feedback area (FS-040 T-05); action row redesigned: Reset draft (with inline confirmation for non-trivial expressions), AI placeholder buttons with descriptive tooltips (FS-040 T-04); savedRules prop drives per-field diff (FS-040 T-05)
        ObjectSummaryPanel.tsx Right panel: object node coverage + child status; clickable child rows navigate to child field; empty state when no children
        ArrayMappingBuilder.tsx Right panel: 4-step array mapping wizard
        BottomArea.tsx        Full-width tabbed container (Preview/Diagnostics/Trace/Test Cases) retained for Rules View; includes test case selector in tab bar for source-data loading parity (FS-022)
        InlinePreviewStrip.tsx Collapsed bar + expanded strip; auto-preview triggered by draft expression stabilization (300ms debounce in ConnectedInlinePreviewStrip); test case selector; output flash animation; Run disabled when sourceData empty (FS-022); lastApplyTimestamp prop deprecated (optional, backward compat only)
        ConnectedInlinePreviewStrip.tsx Owns usePreviewExecution + local state; renders inside PreviewProvider; used as bottomContent in MappingEditor (FS-021 T-05); FS-039 T-13: replaced lastApplyTimestamp with selectedTargetPath+getDraftExpression; debounced auto-preview watches draft expression (300ms)
        TestLabPage.tsx      Full-page test lab: multi-panel simultaneous layout (2×2 wide, vertical stack medium, tab fallback narrow); resizable main split; ExecutionSummaryBar; ResultPanel wrappers; useTestLabLayout hook; own isolated PreviewProvider (FS-021 T-06, FS-032, FS-033)
        comparison/
          CompareTab.tsx               Compare tab composition: mode selector + run/save actions, side-by-side result panels, read-only diff, save-comparison flow
          ComparisonModeSelector.tsx   Segmented comparison mode selector (5 modes, disabled+reason tooltip for unavailable modes)
          ComparisonSidePanel.tsx      Single-side comparison renderer (idle/executing/success/error)
          EnvironmentMetadataBar.tsx   Side metadata strip (execution context, env badge, version, timestamps, engine version)
          ComparisonDiffDisplay.tsx    Read-only comparison diff renderer using `computeDiff`
          ComparisonSnapshotView.tsx   Snapshot indicator + expandable read-only snapshot list
          index.ts                     Comparison component barrel
        preview/
          ResultPanel.tsx      Reusable panel chrome: header (title + badge + collapse toggle) + content area; children always mounted; CSS hidden for collapse; ARIA aria-expanded on toggle (FS-033)
          ExecutionSummaryBar.tsx  Sticky compact bar: hidden when idle; executing (spinner); pass (green) | fail (red) | error (amber) verdict with duration, diagnostic severity badges, rules summary, version badge, environment badge, optional diff summary label; verdict derived via deriveExecutionVerdict (FS-033, FS-035)
          SuiteSummary.tsx         Inline batch suite summary: header with total/passed/failed/errored counts; scrollable per-test rows with verdict icon, name, duration, error count; clickable rows load test results into standard tabs (FS-035)
        TargetFieldRow.tsx    Atomic target field row (status icon, type badge, expression summary)
        EditorTopBar.tsx      Editor metadata strip (name/version/save/deploy/schema refs); two-row layout (FS-021 T-01); FS-039 T-11: unsavedChangeCount prop (replaces unsavedCount), onViewUnsavedChanges prop, "View changes" button with badge (visible when unsavedChangeCount > 0), Save disabled when unsavedChangeCount === 0
        PanelPlaceholder.tsx  Placeholder renderer for inactive panels
        RuleList.tsx          Rule list panel surface (CRUD/reorder/bulk + diagnostics + debounced search/filter by target/expression/type; DnD disabled during active search)
        ExpressionBuilderPanel.tsx  Rules View expression shell (mode toggle + composition); embeds UnifiedExpressionBuilder in builder mode and RawDslEditor in editor mode (FS-023)
        RawDslEditor.tsx      Raw DSL textarea editor (overlay highlighting + autocomplete)
        UnifiedExpressionBuilder.tsx Single-form multi-mode builder (Value / Conditional / Value Map) with live expression/result sections (FS-023); FS-029 Source Card integration + FS-030 transform-chain argument wiring and decomposition hydration [LEGACY — superseded by ChainBuilder.tsx for scalar fields in FS-039; retained for Rules View ExpressionBuilderPanel]
        ChainBuilder.tsx      FS-039 chain-based scalar field builder: manages ChainState; hydrates via decomposeToChain(); generates DSL via generateChainExpression(); source entry toggle, step list, [+ Add Step], StepPickerPanel; wires ConditionStepEditor + ValueMapStepEditor + ChainStepCard; expandedStepIndex accordion state
        ChainStepCard.tsx     FS-039 T-07 accordion wrapper for chain steps: collapsed summary header + expanded body; onExpand/onCollapse/onRemove; isComplete collapse guard; aria-expanded; keyboard nav; accentColor variants
        ConditionStepEditor.tsx FS-039 T-08 full condition step editor: IF/THEN/ELSE structure; OperandValueEditor (currentValue/field/static/expression kinds); PredicateEditor (left operand defaults to currentValue chip, operator dropdown, unary operator hides right); BranchChainEditor (field/static toggle + autocomplete); ConditionClauseEditor (AND predicates, THEN branch); required ELSE non-removable; else-if support
        ValueMapStepEditor.tsx FS-039 T-09 full value map step editor: mapping rows (when→map to), [+ Add Mapping], per-row remove, required default (non-removable); MappingRowEditor + BranchChainEditor sub-components
        UnsavedChangesOverlay.tsx FS-039 T-10 right-side drawer: role="dialog", aria-modal, focus trap, Escape key close, backdrop dismiss; changes grouped Modified→Added→Removed; each entry: clickable field path (navigate + close), saved vs draft expression, Revert button; empty state
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
        use-mapping-editor.ts     Editor orchestration (load/save/rules/validation wiring); FS-039 T-04: draftRules map, updateDraft/commitDraft/revertDraft/revertAllDrafts/getDraftExpression/getUnsavedChangeSummary API; save() merges drafts; hasUnsavedChanges covers drafts; unsavedChangeCount; applyRule() kept as deprecated wrapper; canNavigateAway() uses hasUnsavedChanges (FS-021 T-02, FS-027 T-08)
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
        use-test-run-results.ts    Test run result persistence hook keyed by mappingId (FS-034 T-02, FS-035 T-05): recordResult/clearResult/clearAll; sessionStorage key keyra:test-results:{id}; results stored as Record<string, TestRunResult> for O(1) lookup; cleared on tab/window close
        use-batch-execution.ts     Sequential batch execution hook (FS-034 T-05): runAll/rerunFailed/cancel; pass/fail/error from error diagnostics or engine throw; onCaseComplete callback; cancellation ref; unmount cleanup
        use-test-lab-layout.ts     Test Lab multi-panel layout state: breakpoint detection (wide/medium/narrow via matchMedia), panel collapsed states, split ratios (mainSplit/columnSplit/rowSplit), trace auto-expand/collapse, localStorage persistence (keyra:testlab-layout) (FS-033)
        use-server-preview.ts      Server preview wrapper hook: `adapter.previewOnServer` with 10s timeout and Phase 0 `isAvailable` gating
        use-deployment-context.ts  Deployment context loader + per-mode availability derivation for comparison workflows
        use-environment-comparison.ts Two-sided comparison orchestration (parallel side execution, progressive state, diff computation)
        use-comparison-snapshots.ts Comparison snapshot CRUD hook (`keyra:comparison-snapshots:{mappingId}`), linked by `testCaseId`
      context/
        preview-context.tsx  PreviewContext + PreviewSettersContext + PreviewProvider + hooks (FS-012 T-03)
      lib/
        infer-rule-type.ts    Expression outer-function -> display label mapping
        dsl-tokenizer.ts      DSL tokenizer for syntax highlighting overlays
        expression-builder-state.ts Discriminated union state model for UnifiedExpressionBuilder modes (Value/Conditional/ValueMap); ValueModeState includes `inputType: 'source' | 'static'` and `staticValue?: StaticValue`; FS-029/FS-030 Source Card types (SourceCardValueModeState, ArgumentSlot, TransformChainStep, InlineTransform chain model)
        chain-builder-state.ts FS-039 T-01: ChainState, ChainSource (field/static/none), ChainStep (TransformStep/ConditionStep/ValueMapStep), OperandValue (currentValue/field/static/expression), Predicate, ConditionClause, DraftRulesMap, DraftFieldState; factory functions (createEmptyChain, createEmptyConditionStep, createEmptyValueMapStep, createEmptyConditionClause, createEmptyPredicate) and type guards
        chain-expression-generator.ts FS-039 T-02: generateChainExpression(chain: ChainState) → DSL string; handles all source/operand/step variants; currentValue operand substitutes accumulated chain expression
        chain-decomposer.ts   FS-039 T-03: decomposeToChain(expression) → DecomposeChainResult039; detects currentValue kind by reconstructing left operand and comparing to accumulator; FS-038 .entries → .properties fix
        chain-summary.ts      FS-039 T-07: summarizeSource, summarizeStep, summarizeChain pure functions with ~80-char truncation; used by ChainStepCard collapsed header
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
        execution-result-utils.ts  Pass/fail verdict derivation (deriveExecutionVerdict: idle/executing/pass/fail/error) + diff summary label formatting (formatDiffSummary) (FS-035 T-03, T-04)

  lib/
    api/
      types.ts                ApiAdapter contract
      local-storage-adapter.ts
      hybrid-adapter.ts       HybridAdapter: LocalStorageAdapter + HTTP AI overrides (FS-041)
      ai-api-client.ts        HTTP client functions for AI endpoints (explainRuleHttp) (FS-041)
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

- **Current (Phase 0):** `LocalStorageAdapter` — all operations use localStorage
- **Current (Showcase/Phase 0.5):** `HybridAdapter` — extends `LocalStorageAdapter`; overrides AI methods to call backend via HTTP; all CRUD operations remain localStorage-backed (introduced in FS-041)
- **Future (Phase 1+):** `HttpAdapter` — all operations via HTTP (intentionally not implemented)

### Bootstrap

Startup behavior is centralized in `createAdapter()`:

1. Read `import.meta.env.VITE_API_URL`
2. If unset/empty → return `new LocalStorageAdapter()`
3. If set → return `new HybridAdapter(apiUrl)` — provides localStorage CRUD + HTTP-backed AI calls

Note: the previous behavior (throw when `VITE_API_URL` is set) has been replaced by `HybridAdapter` (FS-041).

### AI API Client

`ui/src/lib/api/ai-api-client.ts` provides focused HTTP client functions for individual AI endpoints:

- **Purpose:** Thin HTTP wrappers consumed by `HybridAdapter` (and potentially future `HttpAdapter`)
- **Current exports:** `explainRuleHttp(apiUrl, input)` → `Promise<ExplainRuleResult>`
- **Pattern:** One exported function per AI endpoint; each handles fetch + 15s timeout + response envelope parsing + error mapping to user-friendly messages
- **Not an adapter** — does not implement `ApiAdapter`; consumed by adapter implementations

### Dependency Injection

`AdapterProvider` supplies the adapter instance through React Context, and components access it via `useAdapter()`.

### Offline-Only Enforcement

In `LocalStorageAdapter`, AI/GitHub/server-preview methods throw `Error("Not available in offline mode")` to enforce Phase 0 boundaries. `HybridAdapter` overrides the AI methods to call the backend instead.

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

### Top Bar Contract (FS-021, FS-039)

`EditorTopBar` is the canonical metadata strip for Mapping Editor pages. FS-021 T-01 redesigns it as a **2-row layout** replacing the previous single-row strip:

- **Row 1 (NavBar):** global navigation (provided by `AppLayout`; breadcrumbs suppressed on editor route)
- **Row 2 (context bar):** mapping identity, save state, deploy badges, schema names, action buttons

Props contract:

- `projectId`, `mappingId` — used to build deploy-route and test-route links
- `mappingName` — displayed in context bar
- `version` — displayed as `v{N}` badge
- `saveStatus: 'saved' | 'unsaved' | 'saving' | 'error'` — drives save indicator display
- `unsavedChangeCount: number` — count of fields with unsaved draft changes; "View changes" button visible when > 0 (FS-039 T-11; replaces `unsavedCount`)
- `onViewUnsavedChanges: () => void` — opens `UnsavedChangesOverlay` (FS-039 T-11)
- `deployStatus: HighestDeployStatus | null` — derived from deployment context; drives stale badge (strictly version-based, no content diff)
- `sourceSchemaName`, `targetSchemaName` — schema context labels
- `onSave` — save callback; Save button disabled when `unsavedChangeCount === 0 || isSaving`
- `onHistoryToggle` — optional; when provided, renders "History" button (clock icon) for version history drawer
- Auto-map placeholder action is rendered in this top bar as a disabled control (feature intentionally not implemented)

### Auto-Draft Save Model (FS-039, replaces Two-Tier Save Model from FS-021)

The editor uses an **auto-draft save model** with three persistence layers:

**Layer 1 — In-memory draft (per keystroke):**
- `ScalarFieldBuilder` calls `updateDraft(targetPath, expression)` on every expression change.
- The draft is stored in `draftRules: Map<string, string>` inside `useMappingEditor`.
- No Apply button. No dialog on field navigation.

**Layer 2 — Draft rules map (cross-field session):**
- `draftRules` accumulates drafts for all fields edited in the session.
- `hasUnsavedChanges` is `true` when `draftRules` is non-empty or rules differ from last save.
- `unsavedChangeCount` counts fields with draft changes (non-empty draft that differs from saved rule, or empty draft that deletes a saved rule).
- `getUnsavedChangeSummary()` returns `UnsavedChangeSummary[]` with change type (Modified/Added/Removed) per field.

**Layer 3 — Save (persist to adapter):**
- `useMappingEditor.save()` merges `draftRules` into saved rules (empty string draft = delete rule; non-empty = upsert), persists to `LocalStorageAdapter`, increments version, clears `draftRules`.
- Triggered by Ctrl+S or the Save button in `EditorTopBar`.
- `saveStatus` reflects the persistence lifecycle: `'saved' | 'unsaved' | 'saving' | 'error'`.
- Save is never blocked by validation errors.

**Field-to-field navigation (seamless, no dialog):**
- `MappingEditor.tsx` calls `commitDraft(previousPath, currentDraft)` before switching `selectedTargetPath`.
- `commitDraft` is a semantic alias for `updateDraft` — the draft is already stored; this call makes the intent explicit.
- No confirmation dialog is shown for field-to-field navigation.

**Route-level navigation guard:**
- `MappingEditor.tsx` uses React Router v6 `useBlocker` with `editor.hasUnsavedChanges` as the gate.
- Dialog text: "You have unsaved changes to N field(s). Discard and leave?"
- Confirm: calls `revertAllDrafts()` then `blocker.proceed()` — clears all drafts and navigates.
- Cancel: calls `blocker.reset()` — stays on page, preserves all drafts.

**`useMappingEditor` draft API (FS-039 T-04):**
- `updateDraft(targetPath, expression)` — store draft; does not write to saved rules
- `commitDraft(targetPath, expression)` — semantic alias for updateDraft (field navigation intent)
- `revertDraft(targetPath)` — remove draft entry for a field; reverts to saved state
- `revertAllDrafts()` — clear all draft entries
- `getDraftExpression(targetPath)` — returns draft expression or null if no draft
- `getUnsavedChangeSummary()` — returns `UnsavedChangeSummary[]` per field
- `savedRules: readonly MappingRule[]` — snapshot of last-persisted rules (updated on successful `save()`); passed to `ScalarFieldBuilder` as `savedRules` prop to drive `useUnsavedDiff` (FS-040 T-05)
- `applyRule(targetPath, expression)` — **deprecated** wrapper; calls `updateDraft` + fires `onRuleApplied`; kept for backward compat during migration
- `unsavedRuleCount` — **deprecated** alias for `unsavedChangeCount`

**EditorTopBar props (FS-039 T-11):**
- `unsavedChangeCount: number` — count of fields with unsaved draft changes (replaces `unsavedCount`)
- `onViewUnsavedChanges: () => void` — opens `UnsavedChangesOverlay`
- "View changes" button: visible when `unsavedChangeCount > 0`; shows count badge; fires `onViewUnsavedChanges`
- Save button: disabled when `unsavedChangeCount === 0 || isSaving`

**UnsavedChangesOverlay (FS-039 T-10):**
- Right-side drawer; `role="dialog"`, `aria-modal`, focus trap, Escape key close, backdrop dismiss
- Changes grouped: Modified → Added → Removed
- Each entry: clickable field path (fires `onNavigate(targetPath)` + `onClose()`), saved vs draft expression, Revert button (fires `onRevert(targetPath)`)
- Empty state when no changes

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
- **Auto-preview on draft stabilization (FS-039 T-13):** `ConnectedInlinePreviewStrip` watches the draft expression for the selected field via `getDraftExpression(selectedTargetPath)`; when the draft stabilizes (300ms debounce), calls `run()` if `autoRun` is on and `sourceData` is non-empty. The old `lastApplyTimestamp`/`onRuleApplied` mechanism is removed.
- **Test case selector:** the strip supports `testCases` and `onLoadTestCase` props; users can load saved test cases directly into the source textarea. If no saved cases exist, selector shows a disabled empty-state option.
- **Output flash animation:** a brief highlight animation plays on the output area when new results arrive.
- **Run disabled:** the Run button is disabled when `sourceData` is empty (AE-14 compliance).
- **`ConnectedInlinePreviewStrip`:** thin wrapper that owns `usePreviewExecution` and local state; must be rendered inside `<PreviewProvider>`. Accepts `selectedTargetPath` and `getDraftExpression` props (FS-039 T-13). Used as `bottomContent` in `MappingEditor.tsx`.
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
- **Hidden when idle** (no execution has run yet)
- Executing: spinner + "Executing…"
- Pass (green tint): CheckCircle2 icon + "Passed" + duration badge + rules summary + diagnostic severity badges
- Fail (red tint): XCircle icon + "Failed" + same stats
- Error (amber tint): AlertTriangle icon + "Error" + error message or "Execution timed out"
- Right side: optional `v{n}` version badge + environment badge (default "Local")
- Optional `diffSummaryLabel` badge (wired by diff-first UX) shown when diff mismatches exist
- Props: `state: PreviewExecutionState`, `diffResult?: DiffResult | null`, `diffSummaryLabel?: string`, `mappingVersion?: number`, `environmentLabel?: string`
- Verdict derived via `deriveExecutionVerdict(state, diffResult)` from `execution-result-utils.ts`

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
- `useTestRunResults(mappingId)` — run result persistence; reads from `keyra:test-results:{mappingId}` (sessionStorage — cleared on tab/window close).
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
- Status indicators: CheckCircle2 (green) = pass, XCircle (red) = fail, AlertCircle (amber) = error, gray dot = not run (FS-035 T-05)
- Inline rename: double-click name → input → Enter confirms, Escape/blur cancels
- Delete confirmation when run results exist for the case
- Add New / Save As toolbar row (primary)
- Run All / Rerun Failed / progress / summary toolbar row (batch)

**`TestRunResult` type:**
```ts
interface TestRunResult {
  testCaseId: string;
  status: 'pass' | 'fail' | 'error';
  errorCount: number;
  warningCount: number;
  executedAt: ISODateString;
  durationMs: number;
  outputSnapshot?: unknown;
}
```
Storage key: `keyra:test-results:{mappingId}` (sessionStorage) — stored as `Record<string, TestRunResult>` for O(1) lookup by `testCaseId`. Cleared on tab/window close. Separate from `keyra:testcases:{mappingId}` to preserve backward compatibility with existing `TestCase` data.

**`useTestRunResults` hook:**
- Input: `mappingId: string`
- Output: `{ results, recordResult, clearResult, clearAll }`
- `results: Readonly<Record<string, TestRunResult>>` — keyed by `testCaseId`
- Reloads on `mappingId` change; corrupted data resets to `{}` with console warning

**`useBatchExecution` hook:**
- Input: `{ config, sourceSchema, targetSchema, onCaseComplete? }`
- Output: `{ isRunning, progress: { current, total }, runAll, rerunFailed, cancel }`
- Sequential execution: one test case at a time, yields to event loop between cases
- Pass/fail/error: zero error-severity diagnostics = pass; any errors = fail; invalid JSON or engine throw = error
- `rerunFailed` filters to cases with `status === 'fail'` in the provided results map
- Cancellation: `cancel()` sets a ref flag checked before each case; current case always completes
- Cleanup: cancels on unmount via `useEffect` cleanup
- Does not own result persistence — fires `onCaseComplete(testCaseId, result)` and caller persists via `recordResult`

**`SuiteSummary` component (FS-035 T-06):**
- Renders inline above tab content after batch execution completes
- Props: `rows: readonly SuiteSummaryRow[]`, `onSelectTest: (testCaseId: string) => void`
- Header: total/passed/failed/errored counts with color-coded labels
- Scrollable per-test rows: verdict icon, test case name, duration badge, error count badge
- Clicking a row fires `onSelectTest(testCaseId)` to load that test's results into the standard tabs

**Batch summary:**
- After `runAll` or `rerunFailed` completes, `TestLabInner` computes `{ passed, failed }` from the updated `runResults` and passes it to `TestCaseListPanel` as `batchState.summary`
- Summary is shown inline in the batch toolbar row; cleared when a new batch starts
- `SuiteSummaryRows` are also populated after batch completion and rendered above the tab content

### Comparison Workflow Architecture (FS-037)

FS-037 extends Test Lab with an environment-aware **Compare** workflow that executes two contexts side-by-side and computes a read-only structural diff.

#### Type model

Core comparison types are defined in `ui/src/lib/types/domain.ts` and mode config lives in `ui/src/features/mappings/types.ts`.

- `ComparisonMode` (union):
  - `'current-vs-saved'`
  - `'current-vs-dev'`
  - `'current-vs-qa'`
  - `'dev-vs-qa'`
  - `'qa-vs-prod'`
- `COMPARISON_MODES: Record<ComparisonMode, ComparisonModeConfig>` defines left/right labels, execution context (`client | server`), and optional environment.
- `ComparisonSideMetadata` captures execution provenance per side:
  - execution context, environment (when server), config/snapshot version, deploy/saved timestamps, engine version, unsaved-change marker.
- `ComparisonSideResult` captures one side's runtime result:
  - `label`, `status` (`idle | executing | success | error`), `metadata`, `output`, `diagnostics`, optional `error`.
- `ComparisonState` is the two-sided aggregate:
  - `{ mode, left, right, diffEntries, overallStatus }` where `overallStatus` is `idle | executing | complete | partial-error`.
- `ComparisonSnapshot` is a persisted historical record:
  - independent record with `{ id, testCaseId, mappingId, mode, leftResult, rightResult, diffEntries, capturedAt }`.

Relationship model:
- `ComparisonState` is ephemeral UI state for the current run.
- `ComparisonSnapshot` is historical persisted state linked to a test case via `testCaseId` (not embedded on `TestCase`).

#### Hook contracts

**`useServerPreview(mappingId, environment)`** (`ui/src/features/mappings/hooks/use-server-preview.ts`)

- Purpose: wrapper over `adapter.previewOnServer` with timeout and offline/availability handling.
- Inputs: `mappingId`, `environment`.
- Outputs:
  - `preview(sourceData)` async action,
  - `isAvailable` (sticky false after offline-mode failures in Phase 0),
  - execution/error state.
- Behavior:
  - applies 10s timeout boundary,
  - maps Phase 0 adapter errors (`Not available in offline mode`) to unavailable state + user-facing messaging,
  - keeps callback stable using ref-updated params pattern.

**`useDeploymentContext(mappingId)`** (`ui/src/features/mappings/hooks/use-deployment-context.ts`)

- Purpose: load deployment context and derive comparison mode availability.
- Inputs: `mappingId`.
- Outputs:
  - `deploymentContext`, `isLoading`, `error`,
  - `environmentStatus: Map<Environment, DeploymentEnvironmentStatus>`,
  - `isModeAvailable(mode)`,
  - `refresh()`.
- Behavior:
  - `current-vs-saved` is always available,
  - environment modes require corresponding env status `=== 'deployed'`,
  - Phase 0 adapter failures make all environment modes unavailable with reason messaging.

**`useEnvironmentComparison(params)`** (`ui/src/features/mappings/hooks/use-environment-comparison.ts`)

- Inputs:
  - `{ mappingId, config, sourceSchemaDetail, targetSchemaDetail, sourceDataRaw }`.
- Outputs:
  - `{ state, mode, setMode, runComparison, canRun, modeAvailability }`.
- Execution model:
  1. parse and validate `sourceDataRaw` as JSON object,
  2. set both sides to `executing`,
  3. dispatch left/right side executions in parallel via `Promise.allSettled`,
  4. execute client sides with `executeMapping` (working config or fresh-loaded saved config),
  5. execute server sides with direct `adapter.previewOnServer` + 10s timeout,
  6. ignore stale runs using incrementing `runId` ref cancellation,
  7. compute diff via `computeDiff(left.output, right.output)` when both succeed,
  8. publish final `ComparisonState` (`complete` or `partial-error`).
- Progressive state updates are explicit: idle -> executing -> final state.

**`useComparisonSnapshots(mappingId)`** (`ui/src/features/mappings/hooks/use-comparison-snapshots.ts`)

- Purpose: persistent CRUD for historical comparison snapshots.
- Outputs:
  - `snapshots`,
  - `snapshotsForTestCase(testCaseId)`,
  - `saveSnapshot(snapshotWithoutId)`,
  - `deleteSnapshot(snapshotId)`,
  - `deleteSnapshotsForTestCase(testCaseId)`.

#### Compare tab composition and hierarchy

At narrow breakpoint, Test Lab tab bar adds `Compare` as the 5th tab. Compare consumes the same `sourceDataRaw` state as Output/Diff/Diagnostics/Trace (single source-of-truth via Test Lab page state + PreviewProvider boundary).

Hierarchy:

```text
CompareTab
├── ComparisonModeSelector
├── ComparisonSidePanel (left)
│   └── EnvironmentMetadataBar
├── ComparisonSidePanel (right)
│   └── EnvironmentMetadataBar
├── ComparisonDiffDisplay
└── Save Comparison flow (inline in Compare top bar)
```

Layout pattern:
- top row: mode selector + run/save actions,
- center: 50/50 side-by-side result panels,
- bottom: read-only diff section.

Diff integration:
- Compare uses `ComparisonDiffDisplay`, which delegates structural comparison to shared `computeDiff`.
- idle/executing renders no diff content; completed runs render either match indicator, cannot-compute state, or categorized differences list.

#### Phase 0 gating pattern

Comparison environment access follows Phase 0 offline boundaries:

- `useDeploymentContext.isModeAvailable(mode)` gates server-backed modes.
- `useServerPreview.isAvailable` transitions to unavailable when adapter throws offline-mode errors.
- UI behavior:
  - unavailable modes are disabled in `ComparisonModeSelector`,
  - disabled modes show reason tooltips,
  - `Run Comparison` is gated by source-data presence, mode availability, and execution state.

This mirrors the adapter boundary rule: observation-only server preview is allowed only when adapter supports it; Phase 0 keeps environment comparisons disabled except `current-vs-saved`.

#### Guardrails (observation-only)

Compare tab is read-only for environment state:

- No deploy/promote/rollback actions are rendered in Compare UI.
- All environment interaction is preview/read access (`getDeploymentContext`, `previewOnServer`) only.
- No mutation operations are invoked from comparison workflow.

#### Snapshot storage model (separate from TestCase)

`ComparisonSnapshot` persistence is intentionally independent from test-case persistence (Q2 resolution):

- Test case key: `keyra:testcases:{mappingId}`.
- Comparison snapshot key: `keyra:comparison-snapshots:{mappingId}`.
- Linking key: `ComparisonSnapshot.testCaseId`.
- `TestCase` type is not extended with embedded comparison data.

Save flow in Compare:
- existing selected test case -> save snapshot linked to that `testCaseId`,
- scratchpad (no selected test case) -> create new test case first, then save linked snapshot.

Test-case list integration:
- rows display snapshot indicator (icon + count) when linked snapshots exist,
- expandable read-only snapshot view shows mode, capture time, match/diff summary, side labels, and delete action.

### Diff Infrastructure and Diff-First UX (FS-035)

**Categorized Diff Mismatch Types (`DiffChangeType`):**

Six specific categories replace the coarse `added | removed | changed` union:

| Category | Meaning |
|---|---|
| `missing_field` | Path exists in expected, absent in actual |
| `extra_field` | Path exists in actual, absent in expected |
| `value_mismatch` | Same path, same JS type, different value |
| `type_mismatch` | Same path, different JS types (e.g. string vs number) |
| `null_mismatch` | Same path, one side is null and the other is not |
| `structural_mismatch` | Same path, object/array vs primitive (or array vs object) |

Classification priority: null_mismatch → structural_mismatch → type_mismatch → value_mismatch.

**`DiffEntry` type:** includes optional `actualType` / `expectedType` string fields populated for type/null/structural mismatches.

**`DiffSummary` type:** `{ total: number; byCategory: Record<DiffChangeType, number> }` — always a complete record with all six categories initialized to 0.

**`DiffResult` type:** `{ entries: readonly DiffEntry[]; isEqual: boolean; summary: DiffSummary }`.

**`DiffDisplay` component (FS-035 T-02):**
- Renders a diff summary header with per-category breakdown when mismatches exist
- Each entry row shows: category badge (label + Lucide icon + color), path, type annotation for type/null/structural mismatches, value display (expected-only for missing_field, actual-only for extra_field, both for others)
- Category colors: missing_field/type_mismatch/structural_mismatch = red; extra_field/value_mismatch/null_mismatch = amber

**Diff-first UX (FS-035 T-04):**
- After execution completes (executing → success transition), if expected output is available and parseable, `computeDiff` is called and the result stored in `diffResult` state
- `activeTab` auto-switches to `'diff'` when expected output exists
- `diffResult` is passed to `ExecutionSummaryBar` (affects verdict + shows diff summary label badge)
- Diff tab label shows a mismatch count badge (red) when mismatches exist, or a green check when output matches
- `deriveExecutionVerdict` considers `diffResult.isEqual` — a diff mismatch causes `'fail'` verdict even with no error diagnostics

**`deriveExecutionVerdict(state, diffResult?)` utility:**
- `idle` → `'idle'`; `executing` → `'executing'`; `error | timeout` → `'error'`
- `success` + error diagnostics → `'fail'`; `success` + diff mismatch → `'fail'`; otherwise → `'pass'`
- When `diffResult` is `undefined` or `null` (no expected output), verdict is `'pass'` if no error diagnostics (AE-06)

**`formatDiffSummary(summary)` utility:**
- Generates human-readable label: `"3 mismatches: 1 missing, 2 value"` or `"1 mismatch: 1 type"`
- Returns empty string when `total === 0`
- Uses short category labels: missing, extra, value, type, null, structural

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

**FS-038 update:** Both surfaces now use the new chain-based builder in builder mode (see "Chain-Based Builder Model" section below). The legacy `UnifiedExpressionBuilder` is retained in the codebase for backward compatibility but is no longer the primary builder surface.

#### Component hierarchy (Rules View) — FS-038

`ExpressionBuilderPanel`
- mode toggle (Builder / Editor)
- decomposition warning (`ComplexExpressionWarning`) when editor expression cannot hydrate builder
- conditional main surface:
  - `RawDslEditor` (editor mode)
  - `ChainBuilderShell` (builder mode) — see Chain-Based Builder Model below
- `ExpressionPreview`
- `FunctionReferencePanel`

#### Component hierarchy (Target View / ScalarFieldBuilder) — FS-038, updated FS-040

```
ScalarFieldBuilder
├── Header (target path, type badge, required/optional, status, Builder|Editor toggle, ⋮ overflow menu)
│   └── HeaderOverflowMenu (Remove mapping with alertdialog confirmation)
├── BuilderFeedbackArea (FS-040 T-02 — pinned, always visible)
│   ├── Expression row (syntax-highlighted DSL; "Expression (incomplete)" label when chain incomplete)
│   ├── Result row (useExpressionPreview; "Load test data" prompt when sourceData null)
│   └── Validation row (Structure badge + Output Type badge)
├── UnsavedDiffPanel (FS-040 T-05 — collapsible, always rendered)
│   ├── Trigger button (aria-expanded, unsaved badge when hasUnsavedChanges)
│   └── Expanded content (Last saved vs Current draft, status badge, Revert to saved button)
├── Expression Area (drop zone for DnD):
│   ├── ChainBuilderShell (builder mode) — see Chain-Based Builder Model below
│   └── RawDslEditor (editor mode)
└── Action Row (AI placeholder buttons: Suggest, Explain, Fix; Reset draft with confirmation; Discard changes)
```

Note: "Remove mapping" is in the header overflow menu (⋮), not in the action row.

#### State model (legacy — pre-FS-038)

`UnifiedExpressionBuilder` owns a discriminated union state model:

`ExpressionBuilderState`
- `mode: 'value'` — source selections + transform pipeline (+ optional static value)
- `mode: 'conditional'` — condition tree + then/else branches
- `mode: 'valueMap'` — input source + mapping rows + fallback

This model is retained for backward compatibility. New builder surfaces use `ChainBuilderState` (see below).

---

### Chain-Based Builder Model (FS-038)

FS-038 redesigns the Builder panel with a chain-based model that replaces the 3-mode tab system (Value/Conditional/ValueMap) with a progressive, entry-point-first flow.

---

### FS-039 Chain Model (ChainState)

FS-039 introduces a new `ChainState` type system in `chain-builder-state.ts` that supersedes the FS-038 `ChainBuilderState` for scalar field authoring. The FS-038 types are retained for backward compatibility.

#### ChainState type system

```typescript
interface ChainState {
  source: ChainSource;
  steps: readonly ChainStep[];
}

type ChainSource =
  | { kind: 'field'; path: string }
  | { kind: 'static'; value: StaticValueBranch }
  | { kind: 'none' };

type ChainStep = TransformStep | ConditionStep | ValueMapStep;

interface TransformStep {
  type: 'transform';
  functionName: string;
  args: readonly ArgumentSlotRef[];
}

interface ConditionStep {
  type: 'condition';
  clauses: readonly ConditionClause[];  // IF + else-if clauses
  elseValue: BranchChainValue;          // required ELSE
}

interface ValueMapStep {
  type: 'valueMap';
  mappings: readonly ValueMapEntry[];
  defaultValue: BranchChainValue;       // required default
}
```

#### OperandValue and currentValue default

Condition left operands use `OperandValue` with four kinds:

| Kind | Description |
|---|---|
| `currentValue` | Substitutes the accumulated chain expression (default for left operand) |
| `field` | A source schema field path |
| `static` | A literal constant |
| `expression` | A raw DSL expression string |

The `currentValue` kind is the default for condition left operands. In the UI it renders as an explicit labeled token ("current value"). Users can switch to `field`/`static`/`expression` via a "Change input" escape hatch.

**Generator behavior:** when `operand.kind === 'currentValue'`, `generateChainExpression` substitutes the accumulated expression string built from the source + all preceding steps.

**Decomposer behavior:** `decomposeToChain` detects `currentValue` by reconstructing the left operand expression string and comparing it to the accumulated chain expression. If they match, the operand is reconstructed as `{ kind: 'currentValue' }`.

#### Conditions are total (else required)

`ConditionStep.elseValue` is always required — conditions must have an else branch. The UI renders the ELSE branch as non-removable.

#### Value maps have required default

`ValueMapStep.defaultValue` is always required. The UI renders the default row as non-removable.

#### Step collapse/expand (accordion)

`ChainBuilder.tsx` manages `expandedStepIndex: number | null`. Only one step can be expanded at a time. New steps auto-expand on creation. Completed steps can be collapsed to their summary text (via `chain-summary.ts`). The `isStepComplete(step)` check gates collapse: transform steps require a non-empty `functionName`; condition/valueMap steps are always collapsible.

#### Component boundary decision

`ChainBuilder.tsx` is a **new component**, not a refactor of `UnifiedExpressionBuilder`. This boundary was chosen because:
- The FS-039 `ChainState` model is structurally different from `ExpressionBuilderState`
- `UnifiedExpressionBuilder` is retained for the Rules View `ExpressionBuilderPanel` surface
- A clean boundary avoids entangling the two state models during migration

#### Legacy retirement strategy

- `UnifiedExpressionBuilder`, `ExpressionBuilderState`, `pipeline-expression-generator.ts`, `pipeline-decomposer.ts`, `source-card-expression-generator.ts`, `source-card-decomposer.ts` are retained during the FS-039 migration.
- These will be retired in a follow-up cleanup spec once the Rules View is migrated to `ChainBuilder`.
- `applyRule()` and `unsavedRuleCount` are deprecated aliases retained for backward compat.

---

#### Entry-point model

The user first selects how the base value is established:

| Entry Type | Description |
|---|---|
| `source` | Value derived from a source schema field (default) |
| `static` | Value is a literal constant (string, number, boolean, null) |
| `external` | Future placeholder — disabled in FS-038 |

#### Chain semantics

After the base value is established, the user adds logic steps that operate on the accumulated current value:

```
base value (source or static)
  → [TransformLogicStep]  — wraps current value in a DSL function
  → [ConditionLogicStep]  — wraps current value in an if() call
  → [ValueMapLogicStep]   — wraps current value in a valueMap() call
  → ... (any step kind can follow any other)
  → final expression
```

Each step's output becomes the current value for the next step.

#### ChainBuilderState type system

```typescript
interface ChainBuilderState {
  entryType: BuilderEntryType;       // 'source' | 'static' | 'external'
  sourcePath?: string;               // defined when entryType === 'source'
  staticValue?: StaticValueBranch;   // defined when entryType === 'static'
  logicSteps: readonly LogicStep[];  // ordered chain of steps
  expandedStepIndex: number | null;  // single-expansion constraint
}

type LogicStep = TransformLogicStep | ConditionLogicStep | ValueMapLogicStep;

interface TransformLogicStep {
  kind: 'transform';
  functionName: string;
  args: readonly ArgumentSlotRef[];  // additional args only (implicit first arg = current value)
}

interface ConditionLogicStep {
  kind: 'condition';
  useCurrentValue: boolean;          // left operand defaults to current value
  customLeftOperand?: ConditionOperand;
  operator: ConditionOperatorType;
  rightOperand: ConditionOperand;
  thenBranch: ChainBranch;
  elseBranch: ChainBranch;           // always required
  elseIfSteps?: readonly ElseIfStep[];
}

interface ValueMapLogicStep {
  kind: 'valueMap';
  mappings: readonly ChainValueMapEntry[];
  defaultValue: ChainBranch;         // always required
}
```

Defined in: `ui/src/features/mappings/lib/chain-builder-state.ts`

#### Generator and decomposer

| File | Purpose |
|---|---|
| `chain-expression-generator.ts` | `generateExpressionFromChain(state) → string` — FS-038 forward path: state → DSL; `generateChainExpression(chain) → string` — FS-039 forward path |
| `chain-decomposer.ts` | `decomposeToChainState(expression) → DecomposeChainResult` — FS-038 reverse path: DSL → ChainBuilderState; `decomposeToChain(expression) → DecomposeChainResult039` — FS-039 reverse path: DSL → ChainState with OperandValue reconstruction |

The decomposer handles all standard patterns: `source("x")`, `upper(source("x"))`, `if(...)`, `valueMap(...)`, `static("value")`, and multi-step transform chains.

Complex expressions that cannot be decomposed fall back to Editor mode with a `ComplexExpressionWarning`.

#### Component hierarchy (chain builder surface)

`ChainBuilderShell` — shell layout with pinned Expression/Result sections
- header: type badge, target path, required tag, Builder/Editor toggle
- AI bar: disabled placeholder buttons (Suggest/Explain/Fix), conditional Clear
- pinned: `LiveExpressionDisplay` + `LiveResultDisplay`
- scrollable content slot:
  - `EntryPointSelector` — segmented control (Source / Static / External)
  - `ChainSourceCard` (source entry) — drop zone + source chip + "+ Add logic"
  - `StaticValueInput` (static entry) — literal input with type inference + validation
  - `LogicStepList` — ordered list of collapsible step containers
    - `CollapsibleStepContainer` — single-expansion wrapper with summary/form toggle
      - `TransformStepForm` — function picker + additional params (implicit first arg hidden)
      - `ChainConditionForm` — IF/THEN/ELSE with required else, else-if up to 5 levels
      - `ChainValueMapForm` — switch-statement UX with required default
    - `AddLogicPicker` — horizontal 3-option picker (Transformation/Condition/Value map)

#### Progressive disclosure

The "+ Add logic" button is shown after the source card or static input. Clicking it reveals `AddLogicPicker`. Selecting a kind appends a new step and expands it for editing. Completed steps collapse to one-line summaries (`summarizeLogicStep`).

#### Single-expansion constraint

Only one step can be expanded at a time. `ChainBuilderState.expandedStepIndex` tracks the currently expanded step. Expanding a new step collapses the previously expanded one.

#### Backward compatibility

- Legacy decomposers (`pipeline-decomposer.ts`, `source-card-decomposer.ts`) are retained for fallback paths.
- `UnifiedExpressionBuilder` and its state model (`ExpressionBuilderState`) are retained in the codebase.
- The chain decomposer is tried first; if it fails, the legacy decomposer is tried; if both fail, Editor mode is used.
- Legacy components will be retired in a follow-up cleanup spec.

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

## Linked Debugging Model (FS-036)

The Test Lab (TestLabPage) supports cross-panel linked selection: clicking a diagnostic, trace entry, output path, or diff entry highlights the corresponding item in all other panels simultaneously.

### DebugSelection State Model

```typescript
type DebugSelectionSource = 'diagnostics' | 'trace' | 'output' | 'diff';

interface DebugSelection {
  targetPath: string;          // Primary linking dimension (dot-separated path)
  ruleIndex?: number;          // Secondary linking dimension (undefined for diff/output sources)
  source: DebugSelectionSource; // Which panel fired the selection
}
```

### useLinkedDebugSelection Hook

Located at `ui/src/features/mappings/hooks/use-linked-debug-selection.ts`.

```typescript
function useLinkedDebugSelection(
  executionStatus?: string
): UseLinkedDebugSelectionResult;

interface UseLinkedDebugSelectionResult {
  selection: DebugSelection | null;
  select: (selection: DebugSelection) => void;
  clear: () => void;
  isTargetSelected: (targetPath: string) => boolean;
  isRuleSelected: (ruleIndex: number) => boolean;
}
```

- Instantiated at page level in `TestLabInner` (not a context provider).
- Auto-clears when `executionStatus` transitions to `'executing'` (AE-11).
- `isRuleSelected(n)` returns `false` when `selection.ruleIndex` is `undefined` (no false positives from diff/output selections).

### Panel Interaction Matrix

| Panel | Fires selection | Receives highlight |
|---|---|---|
| DiagnosticsDisplay | `onSelect` → `source: 'diagnostics'` | `selectedTargetPath`, `selectedRuleIndex` |
| TraceDisplay | `onSelect` → `source: 'trace'` | `selectedRuleIndex`, `selectedTargetPath`; auto-scrolls when source ≠ 'trace' |
| OutputDisplay | `onPathClick` → `source: 'output'` | `highlightPath` (key-value pair highlight) |
| DiffDisplay | `onSelect` → `source: 'diff'` | `selectedTargetPath`; auto-scrolls when externally selected |

### Linking Dimensions

- **Primary:** `targetPath` — dot-separated output field path (e.g., `Order.Header.DocumentType`). Used by all four panels.
- **Secondary:** `ruleIndex` — integer rule index. Used by diagnostics ↔ trace linking. Not available from diff or output sources.

### Jump-to-Rule Route State (T-07)

When a debug selection is active in TestLabPage, a "Jump to rule" button appears in the top bar. Clicking it navigates to the Mapping Editor in the same tab:

```typescript
navigate(`/projects/${projectId}/mappings/${mappingId}`, {
  state: { selectedTargetPath: debugSelection.selection.targetPath },
});
```

The MappingEditor route page (`ui/src/routes/pages/MappingEditor.tsx`) consumes this on mount:

```typescript
useEffect(() => {
  const incomingPath = location.state?.selectedTargetPath;
  if (incomingPath && typeof incomingPath === 'string') {
    setSelectedTargetPath(incomingPath);
    navigate(location.pathname, { replace: true, state: {} });
  }
}, []);
```

This uses React Router v6 transient route state — not visible in the URL, lost on refresh (desired behavior). Normal `navigate()` (without `replace`) preserves back-button history.

### Failure Explainer Module

Located at `ui/src/features/mappings/lib/failure-explainer.ts`.

```typescript
function explainDiagnostic(
  diagnostic: Diagnostic,
  traceEntry?: TraceEntry,
): FailureExplanation | null;

interface FailureExplanation {
  summary: string;
  suggestion?: string;
}
```

Pattern matching order (most specific → least specific):
1. Null output + source resolution failure → source path explanation
2. Type mismatch (code or message) → type mismatch explanation
3. Missing/unresolved source path → source path explanation
4. Unknown function → DSL function explanation
5. General null output (no specific pattern) → general null explanation
6. No match → `null`

Code-based matching always takes precedence over message-text fallbacks. The function is pure and deterministic — no side effects.

Wired into `DiagnosticsDisplay` via the `explainDiagnostic` prop (dependency injection — the component does not import the module directly). Explanations render below each diagnostic message when the function returns non-null.

### Module Structure Additions (FS-036)

```text
ui/src/features/mappings/
  hooks/
    use-linked-debug-selection.ts   Cross-panel debug selection state hook
  lib/
    failure-explainer.ts            Plain-language diagnostic explanation patterns
  types.ts                          DebugSelection, DebugSelectionSource, FailureExplanation types
```

---

### Module Structure Additions (FS-038)

```text
ui/src/features/mappings/
  lib/
    chain-builder-state.ts          ChainBuilderState, LogicStep union, factory functions,
                                    isChainComplete, summarizeLogicStep, type guards;
                                    FS-039: ChainState, ChainStep, OperandValue, Predicate,
                                    ConditionClause, FS039ConditionStep, FS039ValueMapStep,
                                    FS039TransformStep, DraftRulesMap, DraftFieldState
    chain-expression-generator.ts   generateExpressionFromChain(state) → DSL string (FS-038);
                                    generateChainExpression(chain) → DSL string (FS-039)
    chain-decomposer.ts             decomposeToChainState(expression) → DecomposeChainResult (FS-038);
                                    decomposeToChain(expression) → DecomposeChainResult039 (FS-039)
  components/
    ChainBuilderShell.tsx           Shell layout: pinned Expression/Result, AI bar, scrollable slot
    EntryPointSelector.tsx          Segmented control: Source / Static / External
    ChainSourceCard.tsx             Source entry card with DnD drop zone and "+ Add logic"
    StaticValueInput.tsx            Literal value input with type inference and validation
    AddLogicPicker.tsx              Three-option picker: Transformation / Condition / Value map
    TransformStepForm.tsx           Transform step form (implicit first arg hidden)
    ChainConditionForm.tsx          Condition step form: IF/THEN/ELSE with required else, else-if
    ChainValueMapForm.tsx           Value map step form: switch-statement UX with required default
    CollapsibleStepContainer.tsx    Single-expansion collapsible wrapper with summary/form toggle
    LogicStepList.tsx               Ordered step list with single-expansion constraint
```

Modified files:
- `components/ScalarFieldBuilder.tsx` — builder mode now uses chain builder surface (T-12)
- `components/ExpressionBuilderPanel.tsx` — builder mode now uses chain builder surface (T-13)

---

---

## Builder Panel Enhancements (FS-040)

FS-040 introduces two-level validation, a pinned feedback area, a redesigned action row, and per-field unsaved diff capability to the `ScalarFieldBuilder` panel.

### Builder Validation Model (FS-040 T-01, T-02)

Validation runs at two independent levels:

**Level 1 — Structural validation** (synchronous, Builder state inspection):
- Checks whether the current `ChainBuilderState` is complete enough to produce a valid expression.
- Mode-specific rules: Value mode requires a source path or static value; Conditional mode requires a condition + both branches; ValueMap mode requires an input source + at least one mapping row + a default.
- In Editor mode, structural validation is bypassed (the raw DSL is the source of truth).
- Returns `structureValid: boolean` and `structureIssues: StructureIssue[]` with BA-friendly messages.

**Level 2 — Output type validation** (AST-based, engine boundary):
- Calls `inferExpressionType(expression)` via the engine to derive the inferred output `ValueType`.
- Compares against `selectedTargetType` using a compatibility matrix.
- `unknown` / `any` inferred type → no mismatch (treated as compatible).
- Returns `outputTypeValid: boolean` and `outputTypeMismatch: OutputTypeMismatch | null`.

**Gating:**
- `canApply = structureValid && isParseValid && expression.trim() !== ''`
- `canSave = canApply && outputTypeValid`
- Apply is gated by structural + parse validity. Save is additionally gated by output type validity.

**Hook contract — `useBuilderValidation`:**

```ts
interface UseBuilderValidationInput {
  builderState: ExpressionBuilderState | null; // null for ChainBuilderState (structural deferred)
  expression: string;
  targetType: TargetFieldType;
  mode: 'builder' | 'editor';
  parseResult: ParseResult | null;
  isParseValid: boolean;
}

interface BuilderValidationState {
  structureValid: boolean;
  structureIssues: StructureIssue[];
  outputTypeValid: boolean;
  outputTypeMismatch: OutputTypeMismatch | null;
  canApply: boolean;
  canSave: boolean;
}
```

### Builder Feedback Area (FS-040 T-02)

`BuilderFeedbackArea` is a pinned panel rendered between the header and the expression area in `ScalarFieldBuilder`. It is always visible regardless of builder/editor mode.

**Rows:**
- **Expression row:** syntax-highlighted DSL expression using `tokenizeDsl`. Shows `"Expression (incomplete)"` label when the chain is incomplete; empty placeholder when expression is blank.
- **Result row:** live evaluation result via `useExpressionPreview`. Shows `"Load test data to see live results."` when `sourceData` is null.
- **Validation row:** two badges:
  - *Structure badge* — green (valid) / amber (issues) / neutral (editor mode or empty).
  - *Output type badge* — green (compatible) / amber (mismatch with inferred vs expected types) / neutral (unknown/any).

`BuilderFeedbackArea` replaces the former `LiveExpressionDisplay` + `LiveResultDisplay` sections that were previously rendered inside `UnifiedExpressionBuilder` and `ChainBuilderShell`. Those component files are retained but no longer rendered in the scalar field builder path.

**Suggested Sources removed:** The conditional Suggested Sources row (source field suggestions based on name matching) has been removed from `ScalarFieldBuilder` in FS-040. The feedback area provides richer, always-visible expression context in its place.

### Action Row Redesign (FS-040 T-04)

The action row in `ScalarFieldBuilder` was redesigned for FS-040:

- **AI placeholder buttons** (Suggest, Explain, Fix): retained as disabled placeholders with descriptive `title` / `aria-label` tooltips explaining the future capability.
- **Reset draft** (`RotateCcw` icon): replaces the old "Clear" button. For trivial expressions (matching `TRIVIAL_EXPRESSION_RE`), clears immediately. For non-trivial expressions, shows an inline confirmation (`confirmingReset` state) with Confirm / Cancel.
- **Remove mapping**: moved out of the action row into the header overflow menu (⋮ `HeaderOverflowMenu` sub-component). Uses `role="alertdialog"` confirmation before firing `onClearMapping`.
- **Discard changes**: visible when `isDirty` (draft exists for the current field); fires `revertDraft`.

**`HeaderOverflowMenu`** is a `useState`-based dropdown (no external library). Closes on outside `mousedown` and Escape key. The confirmation dialog is a fixed-position overlay with `role="alertdialog"`.

### Unsaved Diff (FS-040 T-05)

Per-target-field unsaved diff capability compares the current draft expression against the last-persisted rule baseline.

**`useUnsavedDiff` hook:**

```ts
type UnsavedDiffStatus = 'no-mapping' | 'new' | 'unchanged' | 'modified' | 'removed';

interface UnsavedDiffState {
  status: UnsavedDiffStatus;
  savedExpression: string | null;   // null when no saved rule exists
  currentExpression: string;
  hasUnsavedChanges: boolean;       // true for new / modified / removed
}

function useUnsavedDiff(input: {
  targetPath: string;
  currentExpression: string;
  savedRules: readonly MappingRule[];
}): UnsavedDiffState
```

Status semantics:
- `no-mapping` — no saved rule and no current expression (field untouched)
- `new` — no saved rule but current expression exists (new mapping being authored)
- `unchanged` — saved rule exists and expressions are identical (whitespace-trimmed comparison)
- `modified` — saved rule exists and expressions differ
- `removed` — saved rule exists but current expression is empty (mapping being deleted)

The hook is pure (no side effects, memoized on inputs). Comparison is whitespace-trimmed.

**`UnsavedDiffPanel` component:**

Collapsible panel rendered below `BuilderFeedbackArea` in `ScalarFieldBuilder`. Always rendered; expand/collapse state is local (`isDiffExpanded`).

- **Trigger button:** `aria-expanded`, `aria-controls`. Shows an amber badge with the status label when `hasUnsavedChanges` is true.
- **Expanded content:** status badge (colour-coded per status), "Last saved" expression block, "Current draft" expression block (both syntax-highlighted via `tokenizeDsl`), "Revert to saved" button (visible only for `modified` and `removed` statuses).
- **Revert to saved:** fires `handleRevertToSaved` in `ScalarFieldBuilder`, which calls `revertDraft(targetPath)`, restores the saved expression into local state, re-decomposes it into `ChainBuilderState` (or falls back to editor mode with a warning), and collapses the panel.

**Baseline source:** `useMappingEditor.savedRules` — a `readonly MappingRule[]` snapshot of the last-persisted rules, updated on every successful `save()`. Passed to `ScalarFieldBuilder` as the `savedRules` prop and forwarded to `useUnsavedDiff`.

**Scope:** per-field diff only. Global diff across all fields is provided by `UnsavedChangesOverlay` (FS-039 T-10).

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
