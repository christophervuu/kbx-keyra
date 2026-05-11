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
      explain-rule.ts AI explain-rule lambda handler consuming shared runtime
      suggest-expression.ts AI suggest-expression lambda handler consuming shared runtime
    preview/          Preview lambda (previewMapping)
  lib/                Shared utilities used across lambdas
    ai/               Shared AI runtime modules (types, config, adapters, orchestration)
      index.ts          AI runtime public barrel exports
      types.ts          AI runtime shared types and adapter interfaces
      config.ts         AI runtime configuration loader from environment
      prompt-registry.ts Prompt registry adapters (DynamoDB + local) with caching
      dsl-asset-loader.ts DSL reference asset loaders (S3 + local) with caching
      prompt-renderer.ts Prompt template placeholder renderer
      model-client.ts   GitHub Models client wrapper (OpenAI SDK)
      output-parser.ts  Model output JSON parsing into AIResponse shape
      invoke-ai.ts      AI runtime orchestration entry point
  types/              Shared types across backend
```

**Rules:**
- The engine (`src/engine/`) has zero imports from `src/lambda/`, `ui/`, or any cloud SDK. It is a pure library.
- Lambda handlers import from `src/engine/` and `src/lib/` only — not from each other.
- Types shared between engine and UI are defined in `src/engine/types/` and imported by both.
- `src/lib/ai/` is backend-only and must not import from `src/engine/` or `ui/`.

---

## `ui/` — Frontend Source

```
ui/
  src/
    main.tsx              App entry point
    App.tsx               Root component and router setup
    routes/               Route path constants and placeholder pages
      index.ts            Barrel export for route constants
      paths.ts            Route path string constants (PATHS object); includes MAPPING_TEST = '/projects/:projectId/mappings/:mappingId/test-lab' (FS-021 T-05, FS-032 T-01)
      pages/              Placeholder page components (one per route)
        HomeDashboard.tsx   Renders HomeDashboardPage from features/home (FS-014 T-11)
        CreateProject.tsx          Renders CreateProjectPage from features/projects (FS-013 T-09)
        ProjectOverview.tsx       Renders ProjectOverviewPage from features/projects (FS-013 T-08)
        ProjectSettings.tsx
        ProjectDeployments.tsx
        CreateMapping.tsx          Renders CreateMappingPage from features/projects (FS-013 T-10)
        MappingEditor.tsx
        MappingDeployment.tsx
        MappingTestLab.tsx          Thin wrapper: extracts projectId/mappingId from route params, renders TestLabPage (FS-021 T-06, FS-032 T-01)
        SchemaLibrary.tsx          Renders SchemaLibraryPage from features/schemas (FS-016 T-04)
        SchemaDetail.tsx
        TemplateLibrary.tsx
        Settings.tsx
        NotFound.tsx
    features/             Feature-scoped code — one folder per major screen or domain
        schemas/            Schema Library, Schema Detail, and schema tree components (FS-009)
        index.ts          Feature barrel (re-exports shared types + parsers + hooks + components)
        types.ts          Feature-specific types (SchemaTreeViewProps, SchemaParseError, parser fn types, SchemaLibraryItem, SchemaLibraryFilters, SchemaLibrarySort, SyncStatus, DisplayFormat — FS-016 T-01)
        components/       Schema tree view components (T-05+)
          index.ts        Components barrel
          SchemaActions.tsx        Context-dependent action buttons: Edit, Auto-describe (placeholder), Sync (placeholder), Re-sync (CDM placeholder), Promote to Global, Replace file, Remove, View Raw; confirm modals for Promote and Remove; Remove blocked by usage mappings (FS-015 T-07)
          InferredSchemaBanner.tsx Amber warning banner shown when schema.inferred === true; dismiss persisted to localStorage key keyra:schema-banner-dismissed:{schemaId} (FS-015 T-08)
          ViewRawModal.tsx         Modal with regex-based syntax-highlighted JSON/XSD content in <pre>; clipboard copy button with "Copied!" feedback; focus trap + ESC close (FS-015 T-08)
          ReplaceFileDialog.tsx    Two-step dialog: confirm message → file picker (.json/.xsd) → parse → adapter.updateSchema → onReplaced callback; inline error on parse failure (FS-015 T-08)
          SchemaLibraryCard.tsx    Clickable card for a single schema in the library: name, origin badge (emoji+color), scope badge, field count, format, sync status indicator, project usage count with tooltip; keyboard nav + react-router navigation (FS-016 T-02)
          SchemaLibrarySearch.tsx  Controlled search input: placeholder, clear button, optional "Showing X of Y" count, aria-label (FS-016 T-03)
          SchemaLibraryFiltersPanel.tsx  Multi-select filter toggles for origin/format/scope using pill-style ToggleButtons; fieldset/legend/aria-label groups (FS-016 T-03)
          SchemaLibrarySortControl.tsx  Sort field <select> + direction toggle button; aria-label="Sort schemas" (FS-016 T-03)
          ActiveFilterChips.tsx    Renders active filter values as removable chips with × buttons; Clear all button; hidden when no filters active (FS-016 T-03)
          SchemaLibraryNoResults.tsx   Centered empty state shown when filters yield zero results; "Clear filters" button (FS-016 T-03)
          SchemaLibrarySkeleton.tsx    6-card animate-pulse skeleton grid; role="status" + sr-only "Loading schemas" (FS-016 T-04)
          SchemaLibraryEmptyState.tsx  Zero-schemas empty state: Database icon, "No schemas available" heading + subtext (FS-016 T-04)
          SchemaLibraryPage.tsx        Assembled Schema Library page: wires useSchemaLibrary hook to search/filter/sort controls + card grid; handles loading/error/empty/no-results/loaded states (FS-016 T-04)
          MappingStatusIcon.tsx    Mapping status icon (mapped/unmapped/warning) with aria-labels
          SchemaDetailPage.tsx     Schema Detail feature page: metadata display, inline editing (non-CDM), edit mode tree controls, save/cancel toolbar, loading/error/not-found states (FS-015 T-02/T-04/T-05)
          SchemaGitStatus.tsx      Git/repository status section: upload-source "local only" notice, GitHub source card with repo/branch/path/SHA/timestamp, synced/not-synced/local-changes indicator (FS-015 T-03)
          SchemaUsageSection.tsx   Usage section: lists referencing projects (links to Project Overview) and mappings (links to Mapping Editor) with role badges; empty state; loading skeleton (FS-015 T-06)
          SchemaSearchInput.tsx    Search input with clear button (debounced, result count)
          SchemaTreeNodeIcon.tsx   Type→icon mapping component (color-coded Lucide icons)
          SchemaTreeNodeRow.tsx    Single tree row; editable mode adds inline rename input + EditableNodeControls action strip (FS-015 T-05)
          EditableNodeControls.tsx Inline edit control strip: type select, required toggle, rename, description, add child, delete with confirm (FS-015 T-05)
          SchemaTreeToolbar.tsx    Toolbar: Expand All, Collapse All, Expand to depth (1/2/3)
          SchemaTreeView.tsx       Virtualized container with search, toolbar, selection, keyboard nav, states, and tree rendering; threads editable+onNodeEdit to rows (FS-015 T-05)
          SchemaTreeView.test.tsx  Component tests (72 tests: rendering, virtualization, search, selection, mapping status, toolbar, keyboard nav)
          __tests__/
            SchemaDetailPage.test.tsx     Component tests (13 tests: T-02 + T-04 tree section + edit mode)
            SchemaDetailEditing.test.tsx  Component tests (4 tests: save flow, confirm delete, edit mode controls) (FS-015 T-05)
            SchemaGitStatus.test.tsx      Component tests (8 tests: upload local-only, GitHub fields, synced/not-synced/local-changes indicators, absent SHA dash, no last-synced row, accessible label)
            SchemaUsageSection.test.tsx   Component tests (5 tests: loading skeleton, empty state, project link, source mapping, target mapping) (FS-015 T-06)
            SchemaActions.test.tsx        Component tests (12 tests: CDM vs non-CDM visibility, Edit hidden while editing, placeholder tooltips, Promote flow, Remove blocked/confirm/delete) (FS-015 T-07)
            SchemaT08Features.test.tsx    Component tests: InferredSchemaBanner (4 tests), ViewRawModal (5 tests), ReplaceFileDialog (5 tests) (FS-015 T-08)
            SchemaLibraryCard.test.tsx   Component tests: name, origin badges (3 origins × color), scope badges, field count, format, sync status (5 variants), project count, click/Enter/Space navigation, tabIndex, aria-label, tooltip (FS-016 T-02)
            SchemaLibraryControls.test.tsx  Component tests: SchemaLibrarySearch (9), SchemaLibraryFiltersPanel (10), SchemaLibrarySortControl (8), ActiveFilterChips (10), SchemaLibraryNoResults (3) (FS-016 T-03)
            SchemaLibraryPage.test.tsx   Integration tests: data-testid, loading skeleton, error+retry, empty state, loaded cards, no-results, search/filter/sort interactions (FS-016 T-04)
        hooks/            Feature-specific React hooks
          index.ts        Hooks barrel
          use-flattened-tree.ts       DFS flatten of tree based on expand state (virtualizer input)
          use-flattened-tree.test.ts  Hook unit tests (7 tests)
          use-tree-keyboard-nav.ts    Keyboard navigation hook (arrow keys, Home/End, Enter/Space, aria-activedescendant)
          use-tree-search.ts          Search state management (debounce, filter, expand preservation)
          use-schema-detail.ts        Loads schema by ID, parses content, exposes loading/error/not-found/updateMetadata/setParsedSchema (FS-015 T-02)
          use-schema-editor.ts        Edit-mode state + all tree operations + save flow wired to adapter (FS-015 T-05)
          use-schema-usage.ts         Derives referencing projects and mappings for a schema; returns UsageProject[], UsageMapping[], isLoading (FS-015 T-06)
          use-schema-library.ts       Loads all schemas+projects, enriches into SchemaLibraryItem[], exposes filter/sort state and actions (FS-016 T-01)
          __tests__/
            use-schema-library.test.ts  Hook tests: loading/success/error states, enrichment, project usage counts, sync status derivation, filter/sort state updates (FS-016 T-01)
        lib/              Schema parsing logic and utilities
          index.ts        Lib barrel
          tree-filter.ts  Pure filter function (case-insensitive substring, ancestor propagation)
          tree-filter.test.ts  Filter unit tests (11 tests including performance)
          schema-editor-ops.ts        Immutable tree manipulation: toggleRequired, changeType, renameField, updateDescription, addField, removeField, addNestedObject, addArrayField (FS-015 T-05)
          tree-to-json-schema.ts      Reconstruct JSON Schema from SchemaTreeNode[] tree; preserves top-level keys from original; countAllNodes helper (FS-015 T-05)
          schema-filters.ts           Pure filter (filterSchemas) and sort (sortSchemas) utilities for Schema Library; AND-between/OR-within logic (FS-016 T-01)
          __tests__/
            schema-editor-ops.test.ts   Unit tests for all 8 tree operations
            tree-to-json-schema.test.ts Unit tests including round-trip test
            schema-filters.test.ts      Unit tests: search by name/description, origin/format/scope OR+AND logic, all sort fields asc/desc (FS-016 T-01)
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
        types.ts          Feature-shared mapping types (TargetFilter/TargetSort/EditorView, linked debug selection, comparison mode config)
        types.test.ts     Type contract tests for mappings shared types (including FS-037 comparison types)
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
          EditorTopBar.tsx           Top bar (name, version, save status, deploy badges, schema names, deploy link); FS-039 T-11: unsavedCount→unsavedChangeCount, onViewUnsavedChanges prop, "View changes" button with badge (visible when unsavedChangeCount > 0), Save disabled when unsavedChangeCount === 0; T-12: route blocker uses hasUnsavedChanges, dialog "Discard and leave?" with revertAllDrafts on confirm
          ErrorTooltip.tsx           Inline error tooltip card: code badge + message, severity-driven color scheme (red/yellow/blue), positioned relative to editor (T-04)
          ExpressionBuilderPanel.tsx Panel 4 shell: mode toggle calls switchToEditor/switchToBuilder, empty state, builder/editor content slots (T-01/T-05); ComplexExpressionWarning when decomposition fails (T-08); unsaved-changes indicator (AE-12)
          ExpressionBuilderPanel.test.tsx Component tests (12 tests: empty state, mode toggle, slots, unsaved indicator, decomposition warning, stay/try actions)
          ExpressionPreviewStep.tsx  Step 4 preview: syntax-highlighted expression (tokenizeDsl), validation status indicator, "Use Expression" + "Copy" buttons, evaluation placeholder (T-06)
          ExpressionPreviewStep.test.tsx Component tests (8 tests: highlighting, valid/invalid status, button states, copy, placeholder)
          GuidedBuilder.tsx          Guided expression builder orchestrator: 4-step flow (source→transform→args→preview), forwardRef GuidedBuilderRef.insertSourceField(), direct copy + static value shortcuts (T-05); Step 3 ArgumentConfigurator + Step 4 ExpressionPreviewStep, generateExpression + parse validation (T-06); array context detection + map()/filter() routing to ObjectTemplateBuilder/ConditionBuilder (T-07) — replaced by UnifiedExpressionBuilder in FS-023 T-07
          GuidedBuilder.test.tsx     Component tests (18 tests: step flow, shortcuts, ref API, back navigation)
          UnifiedExpressionBuilder.tsx  FS-023 single-form multi-mode builder shell: mode tabs, confirmation dialog, Value mode source section, Direct Copy (T-03); transform pipeline wired (T-04); ConditionalModeBuilder wired (T-05); ValueMapModeBuilder wired (T-06); LiveExpressionDisplay + LiveResultDisplay wired (T-07); FS-029 Source Card builder integrated (T-09): SourceCard/ConnectorPrompt/ArgumentForm/BuilderEntryActions wired; dual expression generation (SC state vs legacy pipeline) — deprecated, preserved for backward compat
          UnifiedExpressionBuilder.test.tsx  FS-023 component tests (23 tests: mode tabs, mode switch confirmation, source chip picker, static toggle, Direct Copy)
          UnifiedExpressionBuilder.integration.test.tsx  FS-029 integration tests (T-09): Source Card builder area, AE-01 DirectCopy via SourceChipPicker, AE-02 SourceWithTransform, AE-03 Add Transformation from empty state, AE-04 ConnectorPrompt with 2 sources, mode switch confirmation with SC state, static mode hides SC builder
          ChainBuilder.tsx             FS-039 T-06 new chain-based builder orchestration surface: manages ChainState (FS-039 model), hydrates via decomposeToChain(), generates DSL via generateChainExpression(), source entry (field/static toggle + ChainSourceCard/StaticValueInput), ordered step list (ChainStepCard wrappers with accordion expand/collapse — T-07), [+ Add Step] gated on structural validity (AE-22/AE-23), step picker (type-filtered transforms + condition + value map), no mode tabs; expandedStepIndex state for accordion (T-07)
          ChainBuilder.test.tsx        FS-039 T-06 component tests (rendering, source entry, step list, [+ Add Step] visibility, condition/value-map placeholders, step picker, expression generation, hydration, accessibility)
          ChainStepCard.tsx            FS-039 T-07 accordion wrapper for a single chain step: collapsed header (summary + type label + icon + remove + toggle), expanded body (full step editor); aria-expanded, keyboard nav, incomplete-step collapse guard; accentColor variants (blue/amber/purple)
          ChainStepCard.test.tsx       FS-039 T-07 component tests (rendering, expand/collapse behavior, incomplete-step guard, remove, accessibility, summary truncation, accent colors)
          ConditionStepEditor.tsx      FS-039 T-08 full condition step editor: IF/THEN/ELSE structure, left operand defaults to currentValue chip (AE-24), "Change input" kind selector (currentValue/field/static/expression), AND-combined predicates, else-if support, required ELSE branch (non-removable), BranchChainEditor for then/else, OperandValueEditor, PredicateEditor, ConditionClauseEditor sub-components
          ConditionStepEditor.test.tsx FS-039 T-08 component tests (structure, left operand current-value default, kind switching, operator, unary operators, AND predicates, else-if add/remove, ELSE non-removable, THEN/ELSE branch editors, accessibility)
          ValueMapStepEditor.tsx       FS-039 T-09 full value map step editor: mapping rows (when→map to), [+ Add Mapping], remove per row, required default case (non-removable), BranchChainEditor for row outputs and default; MappingRowEditor sub-component
          ValueMapStepEditor.test.tsx  FS-039 T-09 component tests (structure, add/remove rows, when input, default non-removable, row/default output chains, accessibility, stepIndex)
          UnsavedChangesOverlay.tsx    FS-039 T-10 modal overlay for unsaved changes diff: change list grouped by type (Modified/Added/Removed), each entry shows field path (clickable navigate), saved vs draft expression, per-field Revert button; backdrop dismiss, Escape key close, focus trap, aria-modal dialog semantics
          UnsavedChangesOverlay.test.tsx  FS-039 T-10 component tests (structure/aria, count header, grouping, Modified/Added/Removed entry rendering, revert callbacks, navigate+close, close button/backdrop/Escape, empty state)
          SourceChipPicker.tsx         FS-023 chip-based multi-select source field picker with search, static value toggle (T-03)
          SourceCard.tsx               FS-029 Source Card component: source path chip, [+ Add Transformation] button, inline transform badge, ArgumentForm render prop slot, remove actions (T-02)
          SourceCard.test.tsx          FS-029 component tests (AE-01/02/06: base state, picker interaction, transform state, remove transform, accessibility, keyboard nav)
          ArgumentSlotInput.tsx        FS-029 single argument slot sub-component: source/literal mode toggle, source path input, inline nested transform (AE-07), dropdown when hints provided, validation indicator (T-03)
          ArgumentForm.tsx             FS-029 argument form: renders all parameter slots from DSL_FUNCTION_CATALOG, PARAMETER_HINTS_STUB for dropdowns (replaced by T-04), variadic [+ Add value] button (T-03)
          ArgumentForm.test.tsx        FS-029 component tests (T-03): ArgumentForm rendering, formatDate/cast/concat/upper scenarios, slot change propagation, validation, ArgumentSlotInput mode toggle, source/literal/dropdown modes, AE-07 nested transforms, accessibility
          ConnectorPrompt.tsx          FS-029 automatic connector prompt (AE-04): renders when 2+ sources pending combination; CONNECTOR_CANDIDATES derived from DSL_FUNCTION_CATALOG (multi-input, non-SourceAccess/Array); emits onFunctionSelected callback (T-05)
          ConnectorPrompt.test.tsx     FS-029 component tests (T-05): visibility guard (0/1/2/3 sources), structure/aria, dropdown options (concat/coalesce/add/subtract present, SourceAccess/single-input excluded), function selection callback, CONNECTOR_CANDIDATES export
          BuilderEntryActions.tsx      FS-029 empty-state entry point (AE-03): dual [+ Add Source] / [+ Add Transformation] buttons; source picker popover (schema search, single-select); reuses TransformFunctionPicker; mutual exclusion between pickers; emits onSourceSelected/onFunctionSelected (T-06)
          BuilderEntryActions.test.tsx FS-029 component tests (T-06): rendering, accessibility (aria-labels, aria-expanded, keyboard focusable), source picker open/close/filter/null-schema, source selection callback, function picker open/close, function selection callback, mutual exclusion
          TransformFunctionPicker.tsx  FS-023 categorized function picker popover for pipeline (T-04): search, category accordions, SourceAccess excluded
          TransformPipeline.tsx        FS-023 ordered transform step list with add/remove/reorder controls and function picker integration (T-04)
          TransformPipeline.test.tsx   FS-023 component tests (24 tests: picker, pipeline CRUD, reorder AE-12, AE-02, AE-03 integration)
          TransformPipelineStep.tsx    FS-023 single transform step card: auto-wired param, dynamic additional params, up/down/remove (T-04)
          ConditionRowEditor.tsx       FS-023 single condition row: left operand input, operator dropdown, right operand input (hidden for isNull/isNotNull) (T-05)
          BranchValueSelector.tsx      FS-023 branch kind selector (Static/Field/Else-if); depth cap at 5 shows info nudge; receives ConditionalModeBuilder as render prop to avoid circular import (T-05)
          ConditionalModeBuilder.tsx   FS-023 IF/THEN/ELSE conditional form: ConditionGroupEditor (recursive AND/OR groups), BranchValueSelector for then/else; nested else-if up to depth 5 (T-05)
          ConditionalModeBuilder.test.tsx  FS-023 component tests (24 tests: structure, operators, compound conditions, branch selector, depth cap, expression generation AE-04/05/15, integration)
          ValueMapModeBuilder.tsx      FS-023 Value Map mode: single-select source picker, editable when→mapTo table, fallback (null or specific value); incomplete rows shown with warning icon and skipped in DSL (T-06)
          ValueMapModeBuilder.test.tsx FS-023 component tests (25 tests: structure, source picker, mapping table CRUD, fallback, expression generation AE-06, integration)
          LiveExpressionDisplay.tsx    FS-023 always-visible generated DSL expression with syntax highlighting; click-to-edit fires onSwitchToEditor; empty placeholder when no expression (T-07). No longer rendered inside UnifiedExpressionBuilder or ChainBuilderShell — superseded by BuilderFeedbackArea (FS-040 T-02)
          LiveResultDisplay.tsx        FS-023 evaluated expression result display; "Load test data" prompt when sourceData null (AE-08); uses useExpressionPreview (T-07). No longer rendered inside UnifiedExpressionBuilder or ChainBuilderShell — superseded by BuilderFeedbackArea (FS-040 T-02)
          LiveExpressionDisplay.test.tsx  FS-023 component tests (22 tests: LiveExpressionDisplay, LiveResultDisplay, ScalarFieldBuilder integration AE-07/08/09/10/11/16, decomposer integration)
          BuilderFeedbackArea.tsx      FS-040 pinned feedback panel: Expression row (syntax-highlighted, incomplete label), Result row (useExpressionPreview), Validation row (Structure + Output Type badges); always visible in ScalarFieldBuilder regardless of mode (T-02); FS-043 T-13: optional `resultSlot` prop replaces default ResultRow — used by ArrayBuilder to inject ArrayResultPreview
          BuilderFeedbackArea.test.tsx FS-040 component tests for BuilderFeedbackArea (T-02)
          ArrayBuilder.tsx             FS-043 T-04/T-10/T-12/T-13 new right-panel component for array-type target fields; two-layer builder shell; renders ArrayModeSelector + CollectionEditorSlot + ItemTemplateEditor; T-10: nested focused panel (NestedArrayPanel) replaces outer content when activeNestedPath is set; breadcrumb + "Back to parent" navigation; depth limit enforced at nestingDepth >= 2; T-12: CollectionEditorSlot renders CustomExpressionEditor for customExpression mode; T-13: passes ArrayResultPreview as resultSlot to BuilderFeedbackArea
          ArrayModeSelector.tsx        FS-043 T-04 mode picker: 5 mode cards (map/filterMap/buildFromValues/mergeArrayBranches/customExpression) with icon + label + description; Custom Expression visually separated as Advanced; role=radiogroup; keyboard navigable
          MapCollectionEditor.tsx      FS-043 T-04 source array picker for Map/FilterMap modes; lists array-type fields from parsed source schema; compact summary after selection (collapsible); role=listbox; keyboard navigable
          FilterMapCollectionEditor.tsx FS-043 T-05 collection editor for Filter+Map mode; wraps MapCollectionEditor + collapsible FilterPredicateEditor; shows predicate summary when collapsed
          FilterPredicateEditor.tsx    FS-043 T-05 simplified boolean-focused filter predicate builder; 8 operators (eq/neq/gt/gte/lt/lte/isNull/isNotNull); raw DSL fallback toggle; generates boolean DSL expression
          BuildFromValuesEditor.tsx    FS-043 T-05 multi-entry builder for Build from Values mode; ordered entry list with drag-and-drop + keyboard up/down reorder; add/remove entries; null filtering toggle
          ValueEntryEditor.tsx         FS-043 T-05 single value entry editor; renders object (per-field) or primitive inputs; each field supports sourceField/static/expression/empty kinds
          MergeBranchEditor.tsx        FS-043 T-06 single branch editor for Merge Array Branches mode; source array picker + item template placeholder; expand/collapse with summary; remove button (disabled at min 2)
          MergeBranchesEditor.tsx      FS-043 T-06 branch list manager; vertical list of MergeBranchEditor instances; add branch button (disabled at max 10); cap message at 10; generates merge(map(...), ...) pattern
          ItemFieldRow.tsx             FS-043 T-07/T-09 single item field row; logic type selector (Item field/Root source/Static/Cross-array Lookup); field picker per scope; CrossArrayLookupEditor integration; expression preview; accordion expand/collapse
          ItemTemplateEditor.tsx       FS-043 T-07/T-10 item template layer; derives item fields from target array node children; accordion single-expansion; mapped/total count badge; nested array entry point (NestedArrayRow with "Configure nested array" button); depth-limit enforcement at nestingDepth >= 2
          ModeSwitchConfirmDialog.tsx  FS-043 T-08 confirmation dialog for incompatible mode switches; shows kept/discarded items; Confirm/Cancel/Restore previous draft buttons; focus trap
          CrossArrayLookupEditor.tsx   FS-043 T-09 guided 5-step cross-array lookup form; lookup array picker (root-level arrays from source schema); match field + return field pickers (filtered to lookup array item fields); compare-against scope toggle (parent/item) + field picker; optional fallback input; expression preview; compact summary via summarizeLookup()
          CustomExpressionEditor.tsx   FS-043 T-12 raw DSL editor surface for Custom Expression mode; wraps RawDslEditor with parse status badge (valid/invalid/empty), unrecognized-expression banner (AE-12), "Reset to structured mode" action, "Restore previous draft" action (AE-13); autocomplete via useDslAutocomplete; error list from useDslValidation
          ArrayResultPreview.tsx       FS-043 T-13 array-specific result preview; handles null/empty/array/non-array result states; item count badge; first 10 items as formatted JSON with expand toggle; "Showing N of M items" truncation summary; merge branch contribution summary (real sub-evaluation + positional heuristic fallback marked "(estimated)"); mode-specific contextual hints for null/empty states
          UnsavedDiffPanel.tsx         FS-040 T-05 collapsible per-field diff panel: trigger button with unsaved badge, expanded view shows last-saved vs current draft (syntax-highlighted), status badge (no-mapping/new/modified/removed/unchanged), "Revert to saved" action for modified/removed states
          UnsavedDiffPanel.test.tsx    FS-040 T-05 component tests (trigger, expand/collapse, status badges, revert button visibility, ARIA)
          ExplanationPanel.tsx         FS-041 inline AI explanation panel: success state (Lightbulb icon + explanation text + dismiss), error state (AlertTriangle icon + error message + Try again button); role=status/alert; aria-live=polite; data-testid=explanation-panel
          SuggestExpressionInline.tsx FS-042 inline NL→Rule panel: instruction input (`inputting`/`loading`) + suggestion result (`success`) + error state (`error`), Accept/Dismiss actions, Ctrl+Enter submit, Escape dismiss
          SuggestExpressionInline.test.tsx FS-042 component tests (state rendering, keyboard shortcuts, generate/accept/dismiss flows, error state)
          ObjectTemplateBuilder.tsx  Key-value pair editor for map() object template: add/remove pairs, key text inputs, ArgumentSlot value slots in array context (T-07)
          ObjectTemplateBuilder.test.tsx Component tests (6 tests: empty state, pair rendering, add field, key change, remove field, argument slots)
          RawDslEditor.tsx           Raw DSL textarea + overlay syntax-highlighting editor; bracket matching; error decoration overlay with wavy underlines + ErrorTooltip; aria-invalid; optional autocomplete integration via AutocompleteState prop (T-02, T-03, T-04)
          RawDslEditor.test.tsx      Component tests (25 tests: rendering, token colors, placeholder, readOnly, onChange, onCursorChange, bracket matching, ref API, error decoration overlay, aria-invalid, tooltip)
          MappingEditorPage.tsx      Three-column + bottom-area layout shell (FS-020 T-01, updated FS-022 T-01, T-02): Source panel (pixel-width, collapsible with expand strip), Target Worklist (pixel-width, never collapses), Builder/Editor (flex-1), full-width bottom area; slots: sourceContent, targetWorklistContent, builderContent, bottomContent; drag handles between columns and above bottom; layout managed by useResizableLayout hook (FS-022 T-02)
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
          InlinePreviewStrip.tsx     Collapsed bar + expanded strip; auto-preview via lastApplyTimestamp; output flash animation; Run disabled when sourceData empty; keyboard accessible (FS-021 T-05)
          InlinePreviewStrip.test.tsx Component tests (25 tests: collapsed/expanded states, auto-run, flash animation, run disabled, keyboard nav)
          ConnectedInlinePreviewStrip.tsx  Owns usePreviewExecution + local state; renders inside PreviewProvider; used as bottomContent in MappingEditor (FS-021 T-05); FS-039 T-13: replaced lastApplyTimestamp with selectedTargetPath+getDraftExpression; debounced auto-preview watches draft expression (300ms)
          TestLabPage.tsx            Full-page test lab: multi-panel simultaneous layout (2×2 wide, vertical stack medium, tab fallback narrow); resizable main split; ExecutionSummaryBar; ResultPanel wrappers; useTestLabLayout hook; own isolated PreviewProvider (FS-021 T-06, FS-032 T-03, FS-033)
          TestLabPage.test.tsx       Component tests (layout, breakpoint rendering, panel collapse, dividers, Run button, trace toggle, auto-run toggle, back link, empty states, localStorage fallback)
          preview/          Preview & Testing Panel components (FS-012, FS-033)
            index.ts              Preview barrel (re-exports all preview components)
            ResultPanel.tsx       Reusable panel chrome: header (title + optional badge + collapse toggle) + content area; children always mounted; CSS hidden for collapse; ARIA aria-expanded on toggle (FS-033)
            ResultPanel.test.tsx  Component tests (header rendering, badge variants, collapse toggle, content visibility, empty state, testId/className)
            ExecutionSummaryBar.tsx  Sticky compact execution status bar: idle | executing | success (duration + rule stats + diagnostic severity badges) | error | timeout; pure component from PreviewExecutionState (FS-033)
            ExecutionSummaryBar.test.tsx  Component tests (all state variants, diagnostic badge counts, zero-count suppression, rule stats formatting, aria-live)
            index.ts              Preview barrel (re-exports all preview components)
            PreviewPanel.tsx      Panel 5 shell: toolbar (Run/auto-run/trace), Test Case Manager, 4-tab bar (Output/Diagnostics/Trace/Diff), stats bar, empty/loading states, wired to usePreviewExecution (FS-012 T-06); accepts mappingId prop for test case scoping
          comparison/       Comparison tab components (FS-037)
            ComparisonModeSelector.tsx       Segmented mode selector: all 5 comparison modes as radio buttons, disabled+tooltip for unavailable modes, Phase 0 messaging, aria-checked, radiogroup role (FS-037 T-05)
            ComparisonModeSelector.test.tsx  Component tests (all 5 modes rendered, selected mode aria-checked, onModeChange fires, disabled modes not clickable, Phase 0 all-disabled, mixed availability, reason tooltip, screen-reader text, labels)
            EnvironmentMetadataBar.tsx       Compact metadata bar: client/server context badge (blue/green/amber/red), version, relative deployment timestamp with ISO tooltip, engine version, unsaved badge, saved-at timestamp (FS-037 T-06)
            EnvironmentMetadataBar.test.tsx  Component tests (client badge, version format, no timestamp for client, unsaved badge, saved-at, server DEV/QA/PROD badges, snapshot version, deployment timestamp, engine version)
            ComparisonSidePanel.tsx          Single comparison side panel: idle placeholder, executing spinner, success (metadata bar + JSON output), error (metadata bar + error message) (FS-037 T-06)
            ComparisonSidePanel.test.tsx     Component tests (left/right test-ids, idle placeholder, executing spinner, success output, error message, fallback error text, metadata bar presence per state)
            ComparisonDiffDisplay.tsx        Read-only diff display: idle/executing=null, one-side-null=cannot-compute, match=green indicator, diff=count+entry list with left/right labels, value truncation, color conventions matching DiffDisplay (FS-037 T-07)
            ComparisonDiffDisplay.test.tsx   Component tests (idle/executing null, cannot-compute for null sides, match indicator, diff count, diff entries, label references, missing/extra field labels, value truncation)
            CompareTab.tsx                   Composed Compare tab: mode selector + run button (top bar), two side panels (50/50 split), diff display (below), Save Comparison button (after run); wires useEnvironmentComparison; no deploy/promote/rollback elements (FS-037 T-08, T-09)
            CompareTab.test.tsx              Component tests (renders all elements, run button disabled without source data, no deploy elements, idle side panels, mode selector, default mode selection, Save Comparison not shown before run)
            ComparisonSnapshotView.tsx       Read-only snapshot indicator badge (GitCompare icon + count, aria-expanded) and expandable snapshot list (mode, timestamp, match/diff summary, left/right labels, delete button) (FS-037 T-09)
            ComparisonSnapshotView.test.tsx  Component tests (indicator count/aria, onToggle, view empty state, snapshot item, match/diff summary, mode label, labels, onDelete)
            index.ts                         Barrel export for all comparison components
            PreviewPanel.test.tsx Component tests (render, tabs, toolbar disabled states, ARIA)
            SourceDataInput.tsx   JSON textarea with 150ms debounced validation, inline error, publishes to PreviewContext, accepts initialValue for test case loading (FS-012 T-07)
            SourceDataInput.test.tsx Component tests (valid/invalid/empty states, debounce, aria-invalid, error clear)
            OutputDisplay.tsx     Output tab content: syntax-highlighted JSON (keys/strings/numbers/booleans/null in distinct Tailwind colors) with per-state empty/error/timeout views (FS-012 T-08)
            OutputDisplay.test.tsx Component tests (all state variants, token colors, aria-label, overflow-auto)
            DiagnosticsDisplay.tsx Diagnostics tab content: severity-categorised list (error/warning/info) with icons, targetPath, expression; empty success state (FS-012 T-09)
            DiagnosticsDisplay.test.tsx Component tests (all state variants, severity colors, aria, scrollability)
            TraceDisplay.tsx      Trace tab content: collapsible execution trace entries (sequence, targetPath, duration, expression, value); disabled/empty states (FS-012 T-10)
            TraceDisplay.test.tsx Component tests (expand/collapse, aria-expanded, aria-label, disabled/empty states)
            DiffDisplay.tsx       Diff tab content: expected output textarea + categorized diff rendering (6 mismatch types with icons, diff summary header, type annotations, value display per category); accepts initialExpectedOutput + onExpectedRawChange for test case integration (FS-012 T-11, FS-035 T-01, T-02)
            DiffDisplay.test.tsx  Component tests (all states, AE-05 scenario, invalid JSON error, aria, diff summary header, type annotations, value display per category)
            TestCaseManager.tsx   Test case save/load/delete UI: native select dropdown, inline save form with name input, delete-per-row button, quota error display (FS-012 T-12)
            TestCaseManager.test.tsx Component tests (save/load/delete flows, quota error, accessibility)
            TestCaseListPanel.tsx  Vertical test case list with selection, pass/fail/error icon indicators (CheckCircle2/XCircle/AlertCircle), inline rename, duplicate/delete actions, Scratchpad pseudo-entry, Add New/Save As toolbar, Run All/Rerun Failed batch toolbar with progress and summary (FS-034 T-03, T-04, T-06, FS-035 T-05)
            TestCaseListPanel.test.tsx Component tests (scratchpad, empty state, selection, badges, rename, duplicate, delete with confirmation, Add New, Save As flow, Run All/Rerun Failed enable/disable, progress, summary, cancel, toolbar slot, accessibility)
            SuiteSummary.tsx      Inline batch suite summary: header with total/passed/failed/errored counts; scrollable per-test rows with verdict icon, name, duration, error count; clickable rows load test results into standard tabs (FS-035 T-06)
            SuiteSummary.test.tsx Component tests (header counts, per-test rows, verdict icons, click handler, accessibility)
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
          use-builder-validation.ts      FS-040 T-01 two-level validation orchestrator: structural checks per Builder mode (Value/Conditional/ValueMap) + output type inference via engine boundary; returns BuilderValidationState with canApply/canSave
          use-builder-validation.test.ts FS-040 T-01 unit tests (structural checks per mode, Editor mode bypass, output type inference, canApply/canSave derivation)
          use-unsaved-diff.ts            FS-040 T-05 per-target unsaved diff hook: compares current draft expression vs last-saved rule baseline; returns UnsavedDiffState with status (no-mapping/new/unchanged/modified/removed) and hasUnsavedChanges
          use-unsaved-diff.test.ts       FS-040 T-05 unit tests (all 5 status branches, whitespace trimming, currentExpression passthrough, empty savedRules)
          use-mapping-editor.ts          Orchestration hook: load/save config+schemas, local rules state, Ctrl+S, beforeunload, unsaved detection, applyRule(), unsavedRuleCount, canNavigateAway(), onRuleApplied callback (FS-021 T-02)
          use-mapping-editor.test.tsx    Hook unit tests (26 tests: loading, save, unsaved detection, keyboard, beforeunload, actions)
          use-array-builder-state.ts     FS-043 T-04/T-10/T-11/T-12 array builder state hook: manages ArrayBuilderState, hydrates from expression, exposes all actions through T-08 + T-10 nested navigation + T-11 validationState (deriveArrayValidation computed from state+schema) + T-12 setCustomExpression + isFromUnrecognized flag; accepts optional parsedSourceSchema + targetArrayNode for validation
          use-preview-execution.ts       Preview execution lifecycle hook: manual run(), auto-run (500ms debounce), 2s timeout guard, trace toggle, publishes to PreviewContext (FS-012 T-04)
          use-preview-execution.test.ts  Hook unit tests (idle state, guards, success, error, trace flag, auto-run debounce, timeout)
          use-resizable-layout.ts        Resizable panel layout hook: pixel-based column widths, bottom height, collapse states, drag logic, localStorage persistence under keyra:editor-layout (FS-022 T-02)
          use-resizable-layout.test.ts   Hook unit tests (defaults, localStorage read/write, clamp, collapse/expand, drag min-width enforcement)
          use-test-cases.ts              Test case CRUD hook: save/load/delete/rename/duplicate/update, localStorage persistence keyed by mappingId (keyra:testcases:{id}), quota error handling (FS-012 T-05, FS-034 T-01)
          use-test-cases.test.ts         Hook unit tests (save, persist, load, delete, rename, duplicate, update, mappingId reload, corrupted storage, quota error)
          use-test-run-results.ts        Test run result persistence hook: recordResult/clearResult/clearAll, sessionStorage keyed by mappingId (keyra:test-results:{id}), corruption handling; cleared on tab/window close (FS-034 T-02, FS-035 T-05)
          use-test-run-results.test.ts   Hook unit tests (initial state, record, upsert, multi-result, clear, clearAll, mappingId reload, corruption, write failure)
          use-batch-execution.ts         Sequential batch execution hook: runAll/rerunFailed/cancel, pass/fail/error from error diagnostics or engine throw, onCaseComplete callback, cancellation ref, unmount cleanup (FS-034 T-05, FS-035 T-06)
          use-batch-execution.test.ts    Hook unit tests (sequential execution, pass/fail, invalid JSON, engine throw, config null, onCaseComplete, rerunFailed filter, cancellation)
          use-test-lab-layout.ts         Test Lab multi-panel layout state: breakpoint detection (wide/medium/narrow via matchMedia), panel collapsed states, split ratios (mainSplit/columnSplit/rowSplit), trace auto-expand/collapse, localStorage persistence under keyra:testlab-layout (FS-033)
          use-test-lab-layout.test.ts    Hook unit tests (defaults, breakpoint detection, togglePanel, output no-op at medium, trace auto-behavior, split ratio clamping, localStorage read/write/fallback, storage write failure)
          use-linked-debug-selection.ts  Linked debug selection state hook (FS-036 T-01): select/clear/isPathSelected/isRuleSelected; auto-clears on executionStatus === 'executing'
          use-linked-debug-selection.test.ts  Hook unit tests (select, clear, isPathSelected, isRuleSelected, auto-clear on executing, multiple runs)
          use-server-preview.ts          Server-side preview hook (FS-037 T-02): wraps adapter.previewOnServer() with 10s timeout, Phase 0 offline detection (isAvailable), stable execute callback via ref pattern
          use-server-preview.test.ts     Hook unit tests (idle state, success, timeout, Phase 0 offline error, sticky isAvailable=false, generic error, sequential calls, adapter call args)
          use-explain-rule.ts            FS-041 Explain Rule hook: manages async lifecycle for adapter.explainRule(); idle/loading/success/error state; AbortController cleanup on unmount + re-invocation; user-friendly error mapping (offline, rate-limit, network, unexpected-response, generic)
          use-explain-rule.test.ts       FS-041 hook unit tests (idle state, loading, success, error, dismiss, re-explain, abort on re-invocation, offline error, cleanup on unmount)
          use-suggest-expression.ts      FS-042 Suggest Expression hook: async lifecycle state (`idle|inputting|loading|success|error`), openInput/generate/dismiss/reset actions, abort-on-reinvoke/unmount/reset, user-friendly error mapping
          use-suggest-expression.test.ts FS-042 hook unit tests (state transitions, offline/network/rate-limit mapping, abort semantics, unmount cleanup)
          use-deployment-context.ts      Deployment context hook (FS-037 T-03): loads DeploymentContext via adapter, derives per-environment status map, isModeAvailable() gates comparison modes by deploy status, refresh(), Phase 0 error → all env modes unavailable
          use-deployment-context.test.ts Hook unit tests (load success, environmentStatus map, isModeAvailable per mode, Phase 0 error handling, current-vs-saved always available, refresh, all-deployed)
          use-environment-comparison.ts  Comparison orchestration hook (FS-037 T-04): two-sided parallel execution via Promise.allSettled, client-side (working/saved config) and server-side (direct adapter call with 10s timeout), stale-run cancellation via runId ref, diff via computeDiff(), canRun gating
          use-environment-comparison.test.ts Hook unit tests (idle state, canRun gating, current-vs-saved, diff on mismatch, server-side delegation, dual-server parallel, partial failure, JSON parse error, mode change reset, unavailable mode)
          use-comparison-snapshots.ts    ComparisonSnapshot CRUD hook (FS-037 T-09): localStorage persistence under keyra:comparison-snapshots:{mappingId}, saveSnapshot (generates ID), snapshotsForTestCase filter, deleteSnapshot, deleteSnapshotsForTestCase
          use-comparison-snapshots.test.ts Hook unit tests (init empty, save+persist, snapshotsForTestCase filter, deleteSnapshot, deleteSnapshotsForTestCase, load from storage, corrupted storage graceful fallback)
        context/          Feature-scoped React contexts
          preview-context.tsx  PreviewContext (read) + PreviewSettersContext (write) + PreviewProvider + usePreviewContext() + usePreviewSetters() (FS-012 T-03)
        lib/              Pure utility functions
          index.ts        Lib barrel
          dsl-tokenizer.ts           Regex-based DSL tokenizer: tokenizeDsl(), findMatchingBracket(), DslToken, DslTokenType (T-02)
          dsl-tokenizer.test.ts      Tokenizer unit tests (17 tests: all token types, edge cases, bracket matching)
          expression-generator.ts    Pure DSL generation from BuilderState: generateExpression(), makeSourceArg/makeLiteralArg/makeNestedArg helpers, BuilderArgument, BuilderState types (T-06)
          expression-generator.test.ts Unit tests (14 tests: direct copy, static types, concat, nested functions, escaping)
          expression-builder-state.ts  FS-023 expression-builder state model types (Value/Conditional/ValueMap modes); FS-029 Source Card builder types (SourceCardValueModeState, ArgumentSlot, InlineTransform, ArgumentFormNode, DirectCopyState, SourceWithTransformState, FunctionCallState, PendingConnectorState) with type guards and factory functions
          expression-builder-state.test.ts  FS-029 unit tests for Source Card state model (factory functions, type guards, slot helpers, AE-01/02/03/04/06/07 coverage)
          array-decomposer.ts            FS-043 T-03 array expression decomposer: decomposeArrayExpression(string)→DecomposeArrayResult; pattern detection order: merge→filterMap→map→buildFromValues→customFallback; delegates leaf field decomposition to decomposeToChain(); detects cross-array lookup (default/get/find pattern); detects nested map() as nested arrays; graceful fallback to success:false with rawExpression for unrecognized patterns; pure function
          array-decomposer.test.ts       FS-043 T-03 unit tests: all four structured patterns, cross-array lookup (item/parent scope, with/without fallback), nested map() detection, unrecognized patterns (success:false), edge cases (empty/parse error/scalar), round-trip fidelity for all supported patterns
          array-expression-generator.ts  FS-043 T-02 array DSL expression generator: generateArrayExpression(ArrayBuilderState)→string for all five modes (map/filterMap/buildFromValues/mergeArrayBranches/customExpression); generateFilterPredicate (structured boolean + raw fallback); generateCrossArrayLookup (default/get/find pattern); generateObjectTemplate; generateValueEntry; generateMergeBranchExpression; delegates leaf chains to generateChainExpression(); legacy shim: generateLegacyArrayExpression + ArrayBuilderState/ArrayPattern/FieldMapping types for backward compat with use-array-builder.ts + ArrayMappingBuilder.tsx (deprecated, replaced in T-04+)
          array-expression-generator.test.ts  FS-043 T-02 unit tests: all five modes, filter predicate operators (all 8), cross-array lookup (item/parent scope, with/without fallback), build-from-values (object/primitive entries, null filtering), merge branches, incomplete/empty state returns empty string, parse verification via engine parse() for canonical AE patterns
          array-builder-state.ts       FS-043 T-01 array builder state model: ArrayBuilderState (mode + collectionState + itemTemplate + completionStatus), CollectionState discriminated union (MapCollectionState/FilterMapCollectionState/BuildFromValuesCollectionState/MergeBranchesCollectionState/CustomExpressionCollectionState), FilterPredicateState (structured boolean-focused + raw fallback), ValueEntry (object/primitive, reorderable), MergeBranch (max 10), ItemTemplateState with nestedArrays map, ItemFieldMapping (chain/crossArrayLookup/empty), CrossArrayLookupState, CompletionStatus, deriveCompletionStatus(), isCompatibleModeSwitch(), getModePreservationRules(), factory functions, type guards
          array-builder-state.test.ts  FS-043 T-01 unit tests: deriveCompletionStatus (all 4 status values), isCompatibleModeSwitch (all 20 directional mode pairs), getModePreservationRules (all transitions), factory functions, type guards
          array-validation.ts          FS-043 T-11 multi-level array validation: ArrayValidationState, ArrayValidationEntry (level/fieldPath/message/severity), deriveArrayValidation(state, expression, sourceSchema, targetArrayNode)→ArrayValidationState; collection-level (source type, filter predicate completeness, merge branch source types), item-level (required field coverage), leaf-level (type compatibility), final-output (expression empty check); incomplete≠invalid distinction (AE-10); getFieldValidationEntries() helper
          builder-validation-types.ts  FS-040 builder validation model types: BuilderValidationState, BuilderValidationIssue, OutputTypeMismatch — two-level validation (structural + output type) for the Builder panel
          chain-builder-state.ts       FS-038 chain-based builder state model (ChainBuilderState, LogicStep union, TransformLogicStep, ConditionLogicStep, ValueMapLogicStep, ChainBranch, ConditionOperand, factory functions, completeness checks, step summaries, type guards); FS-039 unified chain model types (ChainState, ChainSource field/static/none, ChainStep union, FS039ConditionStep with required elseBranch, FS039ValueMapStep with required defaultValue, OperandValue with currentValue/field/static/expression kinds, Predicate, ConditionClause, DraftRulesMap, DraftFieldState, DraftValidationState) with factory functions and type guards
          chain-builder-state.test.ts  FS-038 unit tests for chain builder state (factory functions, completeness, summaries, type guards); FS-039 type-level and runtime tests (ChainSource variants, OperandValue all 4 kinds, FS039ConditionStep non-optional elseBranch, FS039ValueMapStep non-optional defaultValue, ChainState structural composition, post-condition/post-valueMap steps, DraftFieldState, DraftRulesMap)
          chain-expression-generator.ts  FS-038 ChainBuilderState→DSL generator (generateExpressionFromChain); FS-039 ChainState→DSL generator (generateChainExpression): handles all ChainSource variants, TransformStep nesting, ConditionStep with OperandValue resolution (currentValue substitutes accumulated chain expression, field→source(), static→literal, expression→passthrough), AND-combined predicates, else-if via multiple ConditionClause entries, ValueMapStep with recursive output chains, post-condition/post-valueMap transform steps (AE-22/AE-23)
          chain-expression-generator.test.ts  FS-038 generator tests (AE-01/02/05/06/07/08/09/18, multi-step chains, branch kinds, elseIf, literal type detection); FS-039 generator tests (ChainSource variants, all 4 OperandValue kinds, currentValue accumulator substitution, AND-combined predicates, else-if, ValueMapStep, post-condition/post-valueMap steps, nested branch chains, all operator variants)
          chain-summary.ts             FS-039 T-07 pure summary text renderers: summarizeSource (field/static/none), summarizeStep (transform/condition/valueMap), summarizeChain (last step or source); truncation at ~80 chars; operator labels; predicate/clause/branch summaries
          chain-summary.test.ts        FS-039 T-07 unit tests for summarizeSource, summarizeStep (all step types), summarizeChain; truncation; operator labels; unary operators; multi-clause conditions
          pipeline-expression-generator.ts  FS-023 pure state→DSL generator for unified expression builder
          pipeline-decomposer.ts        FS-023 DSL→ExpressionBuilderState decomposer with mode auto-detection (AE-09/10/16)
          source-card-expression-generator.ts  FS-029 pure SourceCardValueModeState→DSL generator (T-07): DirectCopy/SourceWithTransform/FunctionCall/PendingConnector variants; recursive slot resolution (source, literal, expression, inline transform); literal type detection (string/number/boolean); string escaping
          source-card-expression-generator.test.ts  FS-029 generator tests (T-07): AE-01/02/03/04/07 canonical cases, nested transforms, expression slots, PendingConnector→null, literal type detection, string escaping, variadic functions
          source-card-decomposer.ts       FS-029 DSL→SourceCardValueModeState decomposer (T-08): source→DirectCopy, single-input-transform(source,...)→SourceWithTransform, fn(args)→FunctionCall; recursive slot decomposition (source/literal/expression/inline-transform); SINGLE_INPUT_TRANSFORMS heuristic; null for unsupported patterns
          source-card-decomposer.test.ts  FS-029 decomposer tests (T-08): AE-01/02/03/07 decomposition, round-trip generate(decompose(expr))===expr, literal types, null/unsupported inputs, SourceWithTransform vs FunctionCall heuristic, variadic, string escaping
          transform-chain-utils.ts        FS-030 shared chain utilities (T-05): getChainOutputType(), getCompatibleChainableTransforms(), re-exports CHAINABLE_TRANSFORMS from decomposer
          transform-chain-utils.test.ts   FS-030 unit tests for chain utilities (T-05): getChainOutputType (empty/sourceType/known-fn/unknown-fn), getCompatibleChainableTransforms (number/string/any/boolean filtering)
          __tests__/
            pipeline-expression-generator.test.ts  FS-023 unit tests for state→DSL generation across AE-01/02/03/04/05/06/14/15
            pipeline-decomposer.test.ts  FS-023 unit tests for DSL→state decomposition (28 tests: pipeline, conditional, valueMap, failures, roundtrips)
            execution-result-utils.test.ts  FS-035 unit tests for deriveExecutionVerdict (all verdict cases, AE-06) and formatDiffSummary (total=0, singular/plural, category labels)
          autocomplete-utils.ts      detectAutocompleteContext(), flattenSchemaPaths(), filterSuggestions(); AutocompleteContext, SchemaPathEntry types (T-03)
          autocomplete-utils.test.ts Utility unit tests (25 tests: context detection for all kinds, schema flattening, prefix filtering)
          infer-rule-type.ts         Maps outermost expression function name to display label
          infer-rule-type.test.ts    Unit tests (14 tests: all rule type patterns)
          execution-result-utils.ts  deriveExecutionVerdict (idle/executing/pass/fail/error from PreviewExecutionState + optional DiffResult) + formatDiffSummary (human-readable diff summary label) (FS-035 T-03, T-04)
          failure-explainer.ts       explainDiagnostic() — pattern-matches Diagnostic + optional TraceEntry to produce FailureExplanation (summary + suggestion); 5 patterns: null+source, type mismatch, missing path, unknown function, general null (FS-036 T-08)
          failure-explainer.test.ts  Unit tests for all 5 patterns + no-match case + edge cases
      deployments/        Deployment Page (mapping-level and project-level)
      templates/          Template Library
      settings/           Global Settings
    components/           Shared UI components used across features
      index.ts            Barrel export for all shared components
      Button.tsx          Button with variants (primary/secondary/ghost/danger) and sizes
      Card.tsx            Container component with optional title/description header
      ConfirmDialog.tsx   Focus-trapped confirmation dialog (modal overlay, Escape to close, message: string|ReactNode) — lifted from mappings feature (FS-013 T-07)
      InlineEditableText.tsx  Click-to-edit text/textarea: saves on Enter or blur, Escape cancels, display/edit mode toggle (lifted from projects feature in FS-015 T-02)
      PageHeader.tsx      Page title + optional description + action slot
      StatusBadge.tsx     Deploy status colored badge (dot + label)
      layout/             App shell components
        AppLayout.tsx     Layout wrapper (NavBar + Breadcrumbs + Outlet)
        NavBar.tsx        Top navigation bar with app name + nav links
        Breadcrumbs.tsx   Route-derived breadcrumb bar
        index.ts          Barrel export
    hooks/                Shared React hooks
    lib/
      api/                ApiAdapter interface + LocalStorageAdapter + HybridAdapter + AI API client
                          types.ts              ApiAdapter contract
                          local-storage-adapter.ts  Phase 0 localStorage implementation
                          hybrid-adapter.ts     FS-041/FS-042 HybridAdapter: extends LocalStorageAdapter, overrides explainRule() and suggestExpression() to call backend via HTTP
                          ai-api-client.ts      FS-041/FS-042 HTTP client functions for AI endpoints: explainRuleHttp(apiUrl, input) + suggestExpressionHttp(apiUrl, input); endpoint-specific timeout, envelope parsing, error mapping
                          adapter-provider.tsx  AdapterProvider + useAdapter() React context
                          bootstrap.ts          createAdapter(): returns HybridAdapter when VITE_API_URL set, LocalStorageAdapter otherwise
      data/               Shared static data consumed cross-feature
        dsl-functions.ts  DSL_FUNCTION_CATALOG: all registered functions with categories, params, descriptions (T-01)
        dsl-functions.test.ts  Catalog tests (5 tests: coverage, required fields, valid categories, no duplicates)
        parameter-hints.ts  PARAMETER_HINTS registry: (functionName, parameterName) → ParameterHint (EnumParameterHint | TokenParameterHint); getParameterHint/hintToSlotOptions helpers; format tokens derived from @keyra/engine SUPPORTED_FORMAT_TOKENS/FORMAT_PRESETS (T-04)
        parameter-hints.test.ts  Registry tests: SUPPORTED_FORMAT_TOKENS/FORMAT_PRESETS engine exports, formatDate/cast hint entries, getParameterHint/hintToSlotOptions helpers (T-04)
      engine/             Browser integration layer for src/engine (imported via @keyra/engine alias)
        index.ts          Exports validateMapping(), executeMapping(), toEngineConfig adapter, parse, defaultRegistry, FunctionRegistry, evaluate, resolvePath, and re-exports engine types; FS-040 T-01: inferExpressionType() lightweight AST output-type inference (source/item/parent → 'any', registry-based return types for known functions)
      state/              Global state (Context + useReducer)
      types/              UI-specific TypeScript types
        domain.ts         Shared domain model types (includes SchemaTreeNode, ParsedSchema, SchemaNodeType, MappingNodeStatus)
        diff.ts           Preview/testing diff types: DiffChangeType (6 categories: missing_field, extra_field, value_mismatch, type_mismatch, null_mismatch, structural_mismatch), DiffEntry (+ actualType/expectedType), DiffSummary (total + byCategory), DiffResult (+ summary) (FS-035 T-01)
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
    ai/               AI lambda handler tests
      explain-rule.test.ts  Tests for ai explain-rule lambda request validation and status mapping
      suggest-expression.test.ts Tests for ai suggest-expression lambda request validation, mapping, and status handling
      fixtures/       Local runner fixtures for explain-rule handler requests and assertions
        valid-direct-source/ Fixture for source("id") example request
        valid-conditional-document-type/ Fixture for conditional expression example request
        invalid-missing-expression/ Fixture for request validation example (400)
        suggest-expression/ Fixture set for suggest-expression handler request/assertion pairs
          valid-default-currency/ Valid NL→rule request fixture with targetDescription
          valid-concat-fields/ Valid NL→rule request fixture for concat use case
          invalid-missing-instruction/ Invalid request fixture missing instruction (400)
          invalid-empty-source-context/ Invalid request fixture with empty sourceContext (400)
  lib/                Shared backend utility tests
    ai/               AI runtime module tests
      types.test.ts    AI runtime type exports/importability tests
      config.test.ts   AI runtime configuration parsing/defaults tests
      prompt-registry.test.ts Prompt registry adapter unit tests
      dsl-asset-loader.test.ts DSL asset loader adapter unit tests
      prompt-renderer.test.ts Prompt rendering placeholder replacement tests
      model-client.test.ts Model client wrapper request/error handling tests
      output-parser.test.ts Output parser JSON/error normalization tests
      invoke-ai.test.ts invokeAI orchestration unit tests (mocked adapters)
      integration.test.ts AI runtime integration test with local adapters + mocked model
      fixtures/       AI runtime test fixtures (local prompt JSON and DSL reference files)
        local-runtime/ Local-mode fixture files for integration test
          explain-rule.json Prompt fixture for explain-rule pipeline
          nl-to-rule.json   Prompt fixture for nl-to-rule pipeline
          dsl-reference.md  DSL reference fixture content
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
