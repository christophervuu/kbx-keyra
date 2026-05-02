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
        HomeDashboard.tsx   Renders HomeDashboardPage from features/home (FS-014 T-11)
        CreateProject.tsx          Renders CreateProjectPage from features/projects (FS-013 T-09)
        ProjectOverview.tsx       Renders ProjectOverviewPage from features/projects (FS-013 T-08)
        ProjectSettings.tsx
        ProjectDeployments.tsx
        CreateMapping.tsx          Renders CreateMappingPage from features/projects (FS-013 T-10)
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
      home/               Home Dashboard (FS-014)
        index.ts          Feature barrel (re-exports types, hooks, components)
        types.ts          Feature-local types (DashboardMetrics, ProjectListItem, DashboardLoadState, ViewMode, SortField, SortDirection, StatusFilter)
        components/
          index.ts        Components barrel
          MetricsBar.tsx  Summary metric cards: Projects/Mappings/Schemas counts, status breakdown (Ready/Draft/Has Errors), deployments; loading skeleton (FS-014 T-03)
          ProjectCard.tsx     Grid card: name, description (line-clamp-2), mapping count, worst-status badge, DEV/QA/PROD deploy badges, date; full-card click (FS-014 T-05)
          ProjectCardGrid.tsx Grid container: responsive 1/2/3-column CSS grid of ProjectCard (FS-014 T-05) — co-located in ProjectCard.tsx
          ProjectTable.tsx    Semantic table: 8-column thead (Name/Desc/Mappings/Status/DEV/QA/PROD/Last Modified), clickable/keyboard-navigable rows, worst-status badge, StatusBadge per env (FS-014 T-06)
          ProjectList.tsx     Search/sort/filter/view-toggle container; delegates to ProjectCardGrid or ProjectTable; "Showing X of Y" count; localStorage view-mode persistence (FS-014 T-04)
          DashboardEmptyState.tsx  Centered empty state: FolderOpen icon, "No projects yet" heading, subtext, "Create Your First Project" primary button → /projects/new (FS-014 T-08)
          DashboardSkeleton.tsx    Animated pulse skeleton: 5 metrics-bar card shapes + 6 project-card grid shapes; role=status + sr-only text (FS-014 T-09)
          DashboardErrorBanner.tsx Alert banner: role=alert, AlertTriangle icon, message prop (default "Failed to load dashboard data"), Retry button → onRetry (FS-014 T-09)
          DashboardTabs.tsx   Three-tab shell: Projects (renders children), Deployments (placeholder), Activity (placeholder); ARIA tablist/tab/tabpanel; useState local (FS-014 T-10)
          HomeDashboardPage.tsx  Final assembled page: PageHeader + DashboardTabs + MetricsBar + ProjectList + SchemaLibraryCard; wires useDashboardData + useViewMode; loading/error/empty/loaded states; data-testid="page-home-dashboard" (FS-014 T-11)
          ViewToggle.tsx      Grid/table toggle button group: aria-label + aria-pressed, active highlight, Lucide icons (FS-014 T-07)
          __tests__/
            MetricsBar.test.tsx  Component tests (9 tests: skeleton variants, counts, status breakdown, zero metrics)
            ProjectCard.test.tsx  Component tests (16 tests: name, description, mapping count singular/plural, worst-status badges, no-badge for no-mappings, DEV/QA/PROD labels, click, keyboard Enter/Space, empty description, tabIndex; grid renders all cards, empty grid, onClick delegation)
            ProjectTable.test.tsx Component tests (14 tests: all 8 column headers, row-per-project, description, mapping count, has-errors/ready/draft badges, no-mappings dash, 3× Not-deployed badges, click/Enter/Space row activation, tabIndex, empty tbody)
            ProjectList.test.tsx  Component tests (13 tests: render all, search input, filter by query, Showing X of Y, empty state, status filter, sort direction toggle, table view switch, grid view switch, localStorage persist, localStorage read, card click)
            DashboardEmptyState.test.tsx  Component tests (5 tests: heading, subtext, button, navigate to /projects/new, centered layout)
            DashboardStateComponents.test.tsx  Component tests (9 tests: skeleton status role, sr-only text, 6 card blocks, metrics blocks; error banner default message, custom message, role=alert, retry button, onRetry callback)
            DashboardTabs.test.tsx  Component tests (10 tests: tablist role, 3 tabs rendered, Projects active by default, children shown, aria-labelledby, Deployments/Activity placeholder messages, aria-selected toggling, Projects restoration, aria-controls)
            HomeDashboardPage.test.tsx  Integration tests (8 tests: data-testid, skeleton while loading, error banner, empty state, full dashboard, PageHeader, Schema Library card, retry re-fetch)
            ViewToggle.test.tsx   Component tests (6 tests: button rendering, aria-pressed active/inactive, onChange grid/table/re-click)
        hooks/
          index.ts        Hooks barrel
          use-dashboard-data.ts  Loads projects/schemas/mappings, computes DashboardMetrics, builds ProjectListItem[], retry support (FS-014 T-02)
          use-view-mode.ts       localStorage-persisted ViewMode hook; invalid value defaults to grid (FS-014 T-07)
          __tests__/
            use-dashboard-data.test.ts  Hook unit tests (13 tests: loading state, metrics aggregation, worst-status derivation, empty projects, error state, retry, parallel loading)
            use-view-mode.test.ts       Hook unit tests (7 tests: default grid, read grid/table, invalid value, setViewMode state+persist, switch back)
        lib/
          index.ts        Lib barrel
          filter-sort.ts  Pure filterProjects() and sortProjects() functions (FS-014 T-04)
          __tests__/
            filter-sort.test.ts  Unit tests (20 tests: search by name/desc, case-insensitivity, trim, status filter, combined, immutability; sort name/date/count asc+desc, empty/single)
      projects/           Project Overview, Project Settings, and project management (FS-013)
        index.ts          Feature barrel (re-exports types, hooks, components)
        types.ts          Feature-local types (SchemaScope, ProjectLoadState, SchemaCardData, MappingRowData, form data types)
        components/
          index.ts        Components barrel
          InlineEditableText.tsx    Toggles between display and text input/textarea on click; saves on Enter or blur (FS-013 T-04)
          InlineEditableTags.tsx    Tag pill display with inline edit: comma/Enter adds tags, Backspace removes, blur saves (FS-013 T-04)
          ProjectMetadataSection.tsx  Section A — project name/description/tags inline editing + read-only dates (FS-013 T-04)
          SchemaCard.tsx            Schema metadata card: name, format/origin/scope badges, field count, sync status, inferred warning, View/Remove actions (FS-013 T-05)
          SchemaLinkPicker.tsx      Modal picker: loads available schemas via adapter, filters attached, radio-style select + confirm (FS-013 T-05)
          SchemaManagementSection.tsx  Section B — schema grid/empty state, Upload/Link buttons, inline remove confirmation with mapping-reference warning (FS-013 T-05)
          MappingRow.tsx            Single table row: name link, source→target, rules, coverage%, status badge, DEV/QA/PROD deploy badges, edit/deploy/duplicate/delete actions (FS-013 T-06)
          MappingListSection.tsx    Section C — sortable mapping table, Create Mapping button, empty state, inline delete confirmation (FS-013 T-06)
          ProjectActionsSection.tsx Section D — primary actions (Create Mapping, Add Schema, Duplicate), placeholder actions (Export/Import disabled), Project Settings link, Delete Project with confirmation (FS-013 T-07)
          ProjectOverviewPage.tsx   Full page assembly: reads projectId from route params, calls useProjectOverview, renders loading/error/not-found/loaded states, composes sections A–D (FS-013 T-08)
          CreateProjectPage.tsx     Create Project form: name/description/tags fields, slug derivation, createProject() call, navigate to new project on success (FS-013 T-09)
          CreateMappingPage.tsx     Create Mapping 3-step wizard: name → source schema → target schema; skip option; createMapping() call; navigate to editor on success (FS-013 T-10)
          SchemaUploadDialog.tsx    Modal dialog: file picker (.json/.xsd/.xml), format detection, field count, inferred warning, scope selection, createSchema() + addSchemaRef() on confirm (FS-013 T-11)
          ProjectOverviewSkeleton.tsx  Animated pulse skeleton mimicking Sections A–D layout (FS-013 T-13)
          ProjectErrorState.tsx     Error state: alert icon, "Failed to load project", optional error detail, Retry button (FS-013 T-13)
          ProjectNotFoundState.tsx  Not-found state: icon, "Project not found", "Go to Dashboard" link (FS-013 T-13)
          __tests__/
            InlineEditableText.test.tsx         Component tests (8 tests)
            InlineEditableTags.test.tsx         Component tests (7 tests)
            ProjectMetadataSection.test.tsx     Component tests (9 tests)
            SchemaCard.test.tsx                 Component tests (11 tests)
            SchemaLinkPicker.test.tsx           Component tests (6 tests)
            SchemaManagementSection.test.tsx    Component tests (10 tests)
            MappingRow.test.tsx                 Component tests (12 tests: link, schema names, coverage, status badges, deploy badges, duplicate/delete callbacks)
            MappingListSection.test.tsx         Component tests (12 tests: heading, empty state, rows, default sort, sort toggle, create/delete/duplicate callbacks, column headers)
            ProjectActionsSection.test.tsx      Component tests (16 tests: button variants, disabled states, delete confirm counts, plural/singular, confirm/cancel callbacks, settings link route)
            ProjectOverviewPage.test.tsx        Component tests (6 tests: testid preservation, loading skeleton, all sections loaded, not-found state, error state, retry)
            CreateProjectPage.test.tsx          Component tests (10 tests: fields, required indicator, validation, createProject call, navigation, cancel, submit error, tag parsing)
            CreateMappingPage.test.tsx          Component tests (12 tests: step navigation, name validation, schema dropdowns, skip option, schema refs, navigate to editor, cancel, submit error)
            SchemaUploadDialog.test.tsx         Component tests (11 tests: open/closed, file input extensions, upload disabled before file, format badge, inferred warning, empty file error, FileReader error, createSchema+addSchemaRef, cancel, scope radios)
            ProjectStateComponents.test.tsx     Component tests (12 tests: skeleton pulse blocks, error state heading/detail/retry/role, not-found heading/message/link)
        hooks/
          index.ts        Hooks barrel
          use-project-overview.ts   Orchestration hook: load project + schemas + mappings, inline editing, schema/mapping/project actions (FS-013 T-03)
          __tests__/
            use-project-overview.test.ts  Hook unit tests (10 tests: load states, updateName, removeSchema, deleteMappingAction, duplicateMappingAction, deleteProjectAction, retry, schemasReferencingMapping)
        lib/
          index.ts        Lib barrel
          detect-schema-format.ts  Schema upload format detection utility (json-schema/xsd/sample-json/sample-xml/unknown)
          __tests__/
            detect-schema-format.test.ts  Unit tests for schema format detection heuristics (FS-013 T-02)
      mappings/           Mapping Editor (panels, expression builder, preview, AI features)
        index.ts          Feature barrel (re-exports hooks + components)
        components/       Editor page shell components
          index.ts        Components barrel
          ArgumentConfigurator.tsx    Renders one ArgumentSlot per function parameter; handles variadic "Add argument", known enum options (cast targetType), nestingLevel threading (T-06)
          ArgumentConfigurator.test.tsx Component tests (8 tests: fixed params, variadic slots, add argument, onChange, enum options, required indicators)
          ArgumentSlot.tsx           Single argument input slot: source / literal / function mode toggle, mini source-field picker with item()/source() section toggle in array context, type-appropriate inputs, nested builder render prop (T-06, T-07)
          ArgumentSlot.test.tsx      Component tests (13 tests: modes, source picker, literal types, boolean checkbox, enum select, nesting suppression)
          ArrayContextBanner.tsx     Info banner shown in Step 3 when inside map()/filter() array context: "use item() to access element fields" (T-07)
          ArrayContextBanner.test.tsx Component tests (4 tests: rendering, function name, role=status)
          AutocompleteDropdown.tsx    Portal-rendered suggestion dropdown: kind icons (ƒ/□/C/⊕), label, detail, selected highlight, click-to-select, backdrop close (T-03)
          AutocompleteDropdown.test.tsx Component tests (12 tests: rendering, aria, selection, icons, positioning, custom class)
          BulkActionBar.tsx          Bulk action toolbar (appears when rules are selected: copy, duplicate, delete)
          BuilderStepIndicator.tsx   Horizontal step indicator: active/completed/pending states, clickable completed steps, aria-current="step" (T-05)
          BuilderStepIndicator.test.tsx Component tests (7 tests: rendering, step states, click navigation)
          ConditionBuilder.tsx       Mini condition builder for filter() in array context: comparison function picker (eq/neq/gt/gte/lt/lte) + two ArgumentSlots (T-07)
          ConditionBuilder.test.tsx  Component tests (6 tests: default eq, all options, left/right slots, onChange, init from state)
          ComplexExpressionWarning.tsx Warning banner when Editor→Builder decomposition fails: reason text, "Stay in Editor" + "Try Builder anyway" buttons (T-08)
          ComplexExpressionWarning.test.tsx Component tests (6 tests: reason text, buttons, callbacks, role=alert)
          ConfirmDialog.tsx          Reusable focus-trapped confirmation dialog (modal overlay, Escape to close)
          ConfirmDialog.test.tsx     Component tests (12 tests: rendering, focus trap, keyboard, callbacks)
          DiagnosticDetail.tsx       Expandable diagnostic panel (code, severity badge, message, expression snippet)
          EditorTopBar.tsx           Top bar (name, version, save status, deploy badges, schema names, deploy link)
          ErrorTooltip.tsx           Inline error tooltip card: code badge + message, severity-driven color scheme (red/yellow/blue), positioned relative to editor (T-04)
          ExpressionBuilderPanel.tsx Panel 4 shell: mode toggle calls switchToEditor/switchToBuilder, empty state, builder/editor content slots (T-01/T-05); ComplexExpressionWarning when decomposition fails (T-08); unsaved-changes indicator (AE-12)
          ExpressionBuilderPanel.test.tsx Component tests (12 tests: empty state, mode toggle, slots, unsaved indicator, decomposition warning, stay/try actions)
          ExpressionPreviewStep.tsx  Step 4 preview: syntax-highlighted expression (tokenizeDsl), validation status indicator, "Use Expression" + "Copy" buttons, evaluation placeholder (T-06)
          ExpressionPreviewStep.test.tsx Component tests (8 tests: highlighting, valid/invalid status, button states, copy, placeholder)
          GuidedBuilder.tsx          Guided expression builder orchestrator: 4-step flow (source→transform→args→preview), forwardRef GuidedBuilderRef.insertSourceField(), direct copy + static value shortcuts (T-05); Step 3 ArgumentConfigurator + Step 4 ExpressionPreviewStep, generateExpression + parse validation (T-06); array context detection + map()/filter() routing to ObjectTemplateBuilder/ConditionBuilder (T-07)
          GuidedBuilder.test.tsx     Component tests (18 tests: step flow, shortcuts, ref API, back navigation)
          ObjectTemplateBuilder.tsx  Key-value pair editor for map() object template: add/remove pairs, key text inputs, ArgumentSlot value slots in array context (T-07)
          ObjectTemplateBuilder.test.tsx Component tests (6 tests: empty state, pair rendering, add field, key change, remove field, argument slots)
          RawDslEditor.tsx           Raw DSL textarea + overlay syntax-highlighting editor; bracket matching; error decoration overlay with wavy underlines + ErrorTooltip; aria-invalid; optional autocomplete integration via AutocompleteState prop (T-02, T-03, T-04)
          RawDslEditor.test.tsx      Component tests (25 tests: rendering, token colors, placeholder, readOnly, onChange, onCursorChange, bracket matching, ref API, error decoration overlay, aria-invalid, tooltip)
          MappingEditorPage.tsx      Multi-panel grid layout container (8 named panel slots)
          MappingEditorPage.test.tsx Component tests (22 tests: top bar, panels, slots, routing)
          NestedFunctionBuilder.tsx  Inline mini builder for nested function arguments: TransformPicker + ArgumentConfigurator, accordion-style, limited to nestingLevel < 2 (T-06)
          NestedFunctionBuilder.test.tsx Component tests (7 tests: initial state, function selection, args change, clear/reset)
          PanelPlaceholder.tsx       Generic placeholder for inactive panels
          RuleForm.tsx               Add/edit rule form (target, expression, description fields, validation)
          RuleForm.test.tsx          Component tests (14 tests: add/edit modes, validation, callbacks)
          RuleList.tsx               Rule list container (DnD reorder, CRUD state, multi-select, bulk actions, copy/paste, summary bar, keyboard nav, aria-activedescendant, empty/missing states)
          RuleList.test.tsx          Component tests (107 tests: rendering, CRUD, DnD reorder, move buttons, multi-select, bulk ops, copy/paste, announcements)
          RuleRow.tsx                Individual rule row (checkbox-first tab order, drag handle, move up/down, target, expression, type badge, validation icon, edit/copy/delete, isFocused ring, id for aria-activedescendant)
          SourceFieldPicker.tsx      Schema field picker: search input + autocomplete, removable field pills, type indicators, multi-select, static value toggle with type dropdown (T-05)
          SourceFieldPicker.test.tsx Component tests (15 tests: field mode, static mode, multi-select, remove, empty schema)
          TransformPicker.tsx        Categorized DSL function picker: accordion by category, search filter, name/description/paramCount display (T-05)
          TransformPicker.test.tsx   Component tests (9 tests: categories, search, click handler, SourceAccess excluded)
          ValidationSummaryBar.tsx   Validation summary (role=status, aria-live=polite, aria-atomic=true, aria-label, rule count, valid/warning/error counts, coverage %)
          accessibility.test.tsx     Accessibility tests (T-08: ARIA attrs, keyboard nav, focus trap, focus return, tab order, aria-controls/expanded)
          preview/          Preview & Testing Panel components (FS-012)
            index.ts              Preview barrel (re-exports all preview components)
            PreviewPanel.tsx      Panel 5 shell: toolbar (Run/auto-run/trace), Test Case Manager, 4-tab bar (Output/Diagnostics/Trace/Diff), stats bar, empty/loading states, wired to usePreviewExecution (FS-012 T-06); accepts mappingId prop for test case scoping
            PreviewPanel.test.tsx Component tests (render, tabs, toolbar disabled states, ARIA)
            SourceDataInput.tsx   JSON textarea with 150ms debounced validation, inline error, publishes to PreviewContext, accepts initialValue for test case loading (FS-012 T-07)
            SourceDataInput.test.tsx Component tests (valid/invalid/empty states, debounce, aria-invalid, error clear)
            OutputDisplay.tsx     Output tab content: syntax-highlighted JSON (keys/strings/numbers/booleans/null in distinct Tailwind colors) with per-state empty/error/timeout views (FS-012 T-08)
            OutputDisplay.test.tsx Component tests (all state variants, token colors, aria-label, overflow-auto)
            DiagnosticsDisplay.tsx Diagnostics tab content: severity-categorised list (error/warning/info) with icons, targetPath, expression; empty success state (FS-012 T-09)
            DiagnosticsDisplay.test.tsx Component tests (all state variants, severity colors, aria, scrollability)
            TraceDisplay.tsx      Trace tab content: collapsible execution trace entries (sequence, targetPath, duration, expression, value); disabled/empty states (FS-012 T-10)
            TraceDisplay.test.tsx Component tests (expand/collapse, aria-expanded, aria-label, disabled/empty states)
            DiffDisplay.tsx       Diff tab content: expected output textarea + structural diff rendering (added/removed/changed color-coded rows); accepts initialExpectedOutput + onExpectedRawChange for test case integration (FS-012 T-11)
            DiffDisplay.test.tsx  Component tests (all states, AE-05 scenario, invalid JSON error, aria)
            TestCaseManager.tsx   Test case save/load/delete UI: native select dropdown, inline save form with name input, delete-per-row button, quota error display (FS-012 T-12)
            TestCaseManager.test.tsx Component tests (save/load/delete flows, quota error, accessibility)
        hooks/            Feature-specific React hooks
          index.ts        Hooks barrel
          use-engine-validation.ts       Debounced validation hook (300ms, wraps engine validate())
          use-engine-validation.test.ts  Hook unit tests (14 tests: debounce, summary, coverage, error handling)
          use-expression-builder.ts      Expression builder state hook: mode toggle, rule loading, debounced commits, delegates parse to useDslValidation, exposes errorDecorations+isValidating (T-01, T-04)
          use-expression-builder.test.ts Hook unit tests (8 tests: empty state, rule loading, debounce, mode switching)
          use-dsl-autocomplete.ts        Context-aware autocomplete hook: context detection, suggestion generation, open/close/nav/confirm state (T-03)
          use-dsl-autocomplete.test.ts   Hook unit tests (15 tests: context kinds, filtering, open/close, keyboard nav, confirm, closing quote)
          use-dsl-validation.ts          Debounced DSL validation hook: 300ms debounce, engine parse() with defaultRegistry, maps diagnostics to ErrorDecoration[] with AST position resolution (T-04)
          use-dsl-validation.test.ts     Hook unit tests (13 tests: valid/invalid expressions, debounce, decoration mapping, severity, AST position resolution)
          use-mapping-editor.ts          Orchestration hook: load/save config+schemas, local rules state, Ctrl+S, beforeunload, unsaved detection
          use-mapping-editor.test.tsx    Hook unit tests (26 tests: loading, save, unsaved detection, keyboard, beforeunload, actions)
          use-preview-execution.ts       Preview execution lifecycle hook: manual run(), auto-run (500ms debounce), 2s timeout guard, trace toggle, publishes to PreviewContext (FS-012 T-04)
          use-preview-execution.test.ts  Hook unit tests (idle state, guards, success, error, trace flag, auto-run debounce, timeout)
          use-test-cases.ts              Test case CRUD hook: save/load/delete, localStorage persistence keyed by mappingId (keyra:testcases:{id}), quota error handling (FS-012 T-05)
          use-test-cases.test.ts         Hook unit tests (save, persist, load, delete, mappingId reload, corrupted storage, quota error)
        context/          Feature-scoped React contexts
          preview-context.tsx  PreviewContext (read) + PreviewSettersContext (write) + PreviewProvider + usePreviewContext() + usePreviewSetters() (FS-012 T-03)
        lib/              Pure utility functions
          index.ts        Lib barrel
          dsl-tokenizer.ts           Regex-based DSL tokenizer: tokenizeDsl(), findMatchingBracket(), DslToken, DslTokenType (T-02)
          dsl-tokenizer.test.ts      Tokenizer unit tests (17 tests: all token types, edge cases, bracket matching)
          expression-generator.ts    Pure DSL generation from BuilderState: generateExpression(), makeSourceArg/makeLiteralArg/makeNestedArg helpers, BuilderArgument, BuilderState types (T-06)
          expression-generator.test.ts Unit tests (14 tests: direct copy, static types, concat, nested functions, escaping)
          autocomplete-utils.ts      detectAutocompleteContext(), flattenSchemaPaths(), filterSuggestions(); AutocompleteContext, SchemaPathEntry types (T-03)
          autocomplete-utils.test.ts Utility unit tests (25 tests: context detection for all kinds, schema flattening, prefix filtering)
          infer-rule-type.ts         Maps outermost expression function name to display label
          infer-rule-type.test.ts    Unit tests (14 tests: all rule type patterns)
      deployments/        Deployment Page (mapping-level and project-level)
      templates/          Template Library
      settings/           Global Settings
    components/           Shared UI components used across features
      index.ts            Barrel export for all shared components
      Button.tsx          Button with variants (primary/secondary/ghost/danger) and sizes
      Card.tsx            Container component with optional title/description header
      ConfirmDialog.tsx   Focus-trapped confirmation dialog (modal overlay, Escape to close, message: string|ReactNode) — lifted from mappings feature (FS-013 T-07)
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
      data/               Shared static data consumed cross-feature
        dsl-functions.ts  DSL_FUNCTION_CATALOG: all registered functions with categories, params, descriptions (T-01)
        dsl-functions.test.ts  Catalog tests (5 tests: coverage, required fields, valid categories, no duplicates)
      engine/             Browser integration layer for src/engine (imported via @keyra/engine alias)
        index.ts          Exports validateMapping(), executeMapping(), toEngineConfig adapter, parse, defaultRegistry, FunctionRegistry, and re-exports engine types
      state/              Global state (Context + useReducer)
      types/              UI-specific TypeScript types
        domain.ts         Shared domain model types (includes SchemaTreeNode, ParsedSchema, SchemaNodeType, MappingNodeStatus)
        diff.ts           Preview/testing diff types (DiffChangeType, DiffEntry, DiffResult)
        index.ts          Types barrel
      utils/              Shared pure utility functions used across UI features
        json-diff.ts      Structural JSON diff utility for preview expected-vs-actual comparisons (FS-012)
        __tests__/        Utility unit tests
          json-diff.test.ts  Unit tests for computeDiff() coverage and edge cases
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
