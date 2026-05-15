# FS-054 T-03 — UI Application Audit Findings

Date: 2026-05-14  
Task: `forge/active/FS-054/tasks/T-03.md`  
Scope: Content-level audit of `ui/src/` against `forge/architecture/ui-application.md`

---

## 1) Module Structure Alignment

### Confirmed
1. Core app shell structure is present as documented: `ui/src/{main.tsx, App.tsx, routes/, components/, features/, hooks/, lib/}`.
2. Adapter and engine boundary directories exist as documented: `ui/src/lib/{api,engine,state,types,data,utils}`.
3. Primary feature modules exist and are active: `home/`, `projects/`, `schemas/`, `mappings/` under `ui/src/features/`.

### Drift / Gaps
4. `ui-application.md` module structure section is incomplete relative to current repo: it explicitly details `schemas/` and `mappings/`, but `home/` and `projects/` are now major implemented feature modules and should be represented at comparable architectural granularity.
5. Module structure text still uses “route placeholder pages” phrasing in places, while routes now map to fully implemented feature pages (not placeholders).
6. Mappings module includes extensive substructures (comparison/, preview/, many hooks/components) that are only partially reflected in the current architecture tree; doc and implementation are directionally aligned but uneven in detail level.

Assessment: **Mostly aligned at top-level; partial under-documentation of current feature coverage.**

---

## 2) Adapter Pattern Alignment (`ApiAdapter`, `LocalStorageAdapter`, `HybridAdapter`, bootstrap)

### Confirmed
1. `ApiAdapter` is the single contract surface for data operations (`ui/src/lib/api/types.ts`).
2. `createAdapter()` behavior matches architecture doc: `VITE_API_URL` set → `HybridAdapter`; unset/empty → `LocalStorageAdapter` (`ui/src/lib/api/bootstrap.ts`).
3. `HybridAdapter` overrides the documented AI showcase slices only: `explainRule`, `suggestExpression`, `autoMapSection` (`ui/src/lib/api/hybrid-adapter.ts`).

### Drift / Gaps
4. `ApiAdapter` has grown significantly (schemas, mappings, versions, projects, templates, deployment, GitHub, AI, schema search, activity, server preview). Architecture adapter section describes pattern but does not provide an inventory-level view of the full contract; this is a Phase 1 planning gap.
5. `LocalStorageAdapter.querySchemaNodes()` currently returns `[]` (stub) and `listTemplates()` returns `[]`; this “implemented-but-placeholder” behavior is not clearly called out in architecture docs.
6. Offline behavior is mixed by method category:
   - many methods are functional local implementations,
   - GitHub/AI/server-preview methods throw `Error('Not available in offline mode')`,
   - not-found errors are thrown as structured objects in local adapter internals.
   This nuanced error behavior is only partially documented and matters for backend parity assumptions.

Assessment: **Pattern aligned; contract surface and placeholder/offline behavior need sharper documentation for Phase 1 readiness.**

---

## 3) State Management Alignment

### Confirmed
1. No external state management library (Redux/Zustand) is present in `ui/package.json`.
2. No external data-fetching/query library (e.g., TanStack Query) is present; `@tanstack/react-virtual` is used for virtualization only.
3. `AsyncState<T>` shape in `ui/src/lib/state/async-state.ts` matches architecture doc (`idle|loading|success|error|stale`).

### Drift / Gaps
4. `useAsyncState()` includes request-id race protection and stale/refresh transitions; architecture doc mentions race protection but could better emphasize this as a canonical concurrency-safe pattern.
5. UI uses extensive feature-local hooks in `mappings/hooks/` as de facto orchestration layer; doc captures many but not all hooks uniformly.
6. Local storage/session storage persistence is now a core state behavior in multiple hooks (`use-test-cases`, `use-test-run-results`, `use-auto-map-workspace`, comparison snapshots). This is documented in sections but not summarized as a broader state-management convention.

Assessment: **Strong alignment with minor documentation synthesis gaps.**

---

## 4) Routing Alignment

### Confirmed
1. Route table in architecture doc matches `ui/src/App.tsx` route registration:
   - `/`
   - `/projects/new`
   - `/projects/:projectId`
   - `/projects/:projectId/settings`
   - `/projects/:projectId/deployments`
   - `/projects/:projectId/mappings/new`
   - `/projects/:projectId/mappings/:mappingId`
   - `/projects/:projectId/mappings/:mappingId/deploy`
   - `/projects/:projectId/mappings/:mappingId/test-lab`
   - `/schemas`
   - `/schemas/:schemaId`
   - `/templates`
   - `/settings`
   - `*`
2. `PATHS` constants are present and consistent with `App.tsx` routes (`ui/src/routes/paths.ts`).
3. Focused workspace behavior (suppress breadcrumbs for Mapping Editor/Test Lab) matches `AppLayout.tsx` implementation.

### Drift / Gaps
4. Architecture text says dynamic breadcrumb segments display raw IDs; current breadcrumb system also supports contextual name registration via `BreadcrumbContext` in many pages — this could be stated more explicitly in routing section.
5. Routing uses React Router future flags (`v7_startTransition`, `v7_relativeSplatPath`) in router creation; architecture doc does not mention this runtime config detail.
6. “Placeholder pages” wording is stale relative to implemented route pages.

Assessment: **Route coverage is accurate; mostly wording/detail drift.**

---

## 5) Component Organization Alignment

### Confirmed
1. Shared primitives exist in `ui/src/components/` and shell components in `ui/src/components/layout/` as documented.
2. Feature code is organized under `ui/src/features/{feature}/` with internal `components/hooks/lib` structure.
3. Mappings feature architecture is heavily documented and largely reflects actual component topology.

### Drift / Gaps
4. Architecture rule states “No cross-feature direct imports; shared code must be lifted” but implementation currently has cross-feature imports (e.g., mappings/projects importing `useRecentActivity` from `features/home`; mappings and projects importing schema parser exports from `features/schemas`). This is a direct rule-vs-reality mismatch.
5. `ui/src/components/ConfirmDialog.tsx` and feature-local confirm dialogs coexist; architecture could clarify intended shared-vs-feature dialog pattern.
6. Several legacy/compatibility components remain in mappings feature (e.g., drawer legacy surfaces) and are documented in places, but lifecycle status is not always consistently flagged in module structure lists.

Assessment: **Organization is coherent, but one core documented rule (no cross-feature imports) is not currently true.**

---

## 6) Engine Integration Boundary Alignment

### Confirmed
1. UI consumes engine via `ui/src/lib/engine/index.ts` boundary module (not direct deep imports).
2. Boundary exports adapted helpers (`validateMapping`, `executeMapping`, `evaluateExpression`) plus raw engine APIs/types as documented.
3. Canonical hooks match architecture contracts:
   - `useEngineValidation` (debounced, nullable-input guards, typed summaries)
   - `useExpressionPreview` (debounced single-expression preview)

### Drift / Gaps
4. Engine boundary now includes `inferExpressionType()` and extra type exports; architecture mentions this partially in module entries but not prominently in integration pattern section.
5. `evaluateExpression()` enforces early short-circuit semantics (empty expression or null sourceData) and maps parse/eval failures to a single `error` string; this contract is useful and could be documented more explicitly as UI expectation.
6. Type adaptation from UI mapping types to engine mapping types includes normalization (`null|any` rule type fallback to `'string'` for engine compatibility); this is architectural and currently under-emphasized.

Assessment: **Boundary is solid and mostly documented; adapter-normalization details deserve explicit callout.**

---

## 7) Mapping Editor Architecture Alignment

### Confirmed
1. `MappingEditorPage` uses three-column + resizable layout with source collapse strip and bottom area behavior matching architecture sections.
2. View model includes `target | rules | automap`; Auto-Map workspace entry is explicit and not part of the standard target/rules segmented toggle.
3. Route-level composition in `routes/pages/MappingEditor.tsx` matches documented orchestration patterns (state ownership, workspace hook wiring, draft APIs, route blocker integration).

### Drift / Gaps
4. Architecture diagrams/ordering language occasionally label columns in ways that can be interpreted differently than current `MappingEditorPage` prop naming (`builderContent`/`targetWorklistContent` width ownership) — functionally aligned but potentially confusing.
5. Auto-Map and Test Lab sections are now very detailed and accurate, but dispersed; architectural “single source of truth” is present yet difficult to quickly parse for execution boundaries.
6. Some legacy compatibility surfaces remain in code while workspace model is primary; docs mention retirement notes but could normalize lifecycle labels consistently (active vs legacy vs retained-for-compatibility).

Assessment: **High alignment on behavior and composition; mostly documentation clarity/maintainability drift.**

---

## 8) Phase 1 Adapter Boundary Inventory (for T-07 input)

Current `ApiAdapter` contract groups and Phase 1 implications:

### A. Schemas (`list/get/create/update/delete`)
- **Current behavior:** localStorage-backed CRUD; immediate consistency; no pagination.
- **Phase 1 need:** HTTP CRUD with equivalent data shapes and error semantics.
- **Assumptions surfaced:** UI expects full-list returns (`listSchemas(): Promise<SchemaMetadata[]>`), synchronous-feeling updates, and direct object payloads.

### B. Mappings (`list/get/create/update/delete/duplicate`)
- **Current behavior:** localStorage CRUD + simple metadata derivation.
- **Phase 1 need:** persisted mapping store with version handling and conflict policy.
- **Assumptions surfaced:** no pagination on list; overwrite-style update via full `MappingConfig` payload.

### C. Version history (`list/get/saveMappingVersion`)
- **Current behavior:** localStorage key-per-mapping with max 50 entries.
- **Phase 1 need:** backend version persistence and retrieval APIs.
- **Assumptions surfaced:** version snapshots include full config and are addressable by numeric version.

### D. Projects (`list/get/create/update/delete`)
- **Current behavior:** localStorage CRUD, detail includes mappings.
- **Phase 1 need:** project APIs with embedded/linked mapping metadata behavior.
- **Assumptions surfaced:** list returns full set; no server-side filtering/pagination contract yet.

### E. Templates (`list/get`)
- **Current behavior:** stub/empty in LocalStorageAdapter.
- **Phase 1 need:** either real backend support or explicit UI gating.
- **Assumptions surfaced:** interface exists; consumers may still treat as optional/empty.

### F. Deployment (`getDeploymentContext/deploy/promote/rollback/getDeploymentDiff`)
- **Current behavior:** local simulated records.
- **Phase 1 need:** real environment/deploy snapshot services.
- **Assumptions surfaced:** environment names fixed (`DEV|QA|PROD`), operations return immediate `DeploymentRecord`.

### G. GitHub integrations (CDM + published schema methods)
- **Current behavior:** offline-mode throws in local adapter.
- **Phase 1 need:** backend proxy/integration APIs.
- **Assumptions surfaced:** methods already shape expected payload/response contracts.

### H. AI (`autoMap`, `autoMapSection`, `suggestExpression`, `explainRule`, `smartFix`, `validateMappings`)
- **Current behavior:**
  - Local adapter throws offline for all AI methods.
  - Hybrid adapter overrides: `explainRule`, `suggestExpression`, `autoMapSection` via HTTP client.
- **Phase 1 need:** broad HTTP-backed AI coverage for remaining methods and consistent error envelopes.
- **Assumptions surfaced:** UI expects stable AI response envelopes and user-friendly mapped errors.

### I. Schema search / Activity / Server preview
- **Current behavior:**
  - `querySchemaNodes` returns empty list in local adapter.
  - `listActivity` local list with optional filter/limit.
  - `previewOnServer` offline throw in local adapter.
- **Phase 1 need:** real indexed schema search, activity feed, and server preview execution.
- **Assumptions surfaced:** no pagination contract currently enforced in interface signatures.

Cross-cutting backend constraints implied by current interface:
1. Promise-based APIs with direct domain object returns (no explicit envelope type in adapter signatures).
2. No pagination parameters on list methods (UI expects full arrays today).
3. No auth/session parameters at adapter call sites (auth is externalized or absent in Phase 0).
4. Error handling is heterogeneous in Phase 0 (plain Error, structured objects) — Phase 1 should standardize.
5. UI hooks often assume quick responses and immediate consistency semantics.

---

## 9) Undocumented / Under-documented Conventions

1. **Cross-feature import practice has emerged** despite documented prohibition; de facto convention is “cross-feature import allowed when no shared home exists,” but this is not codified.
2. **Adapter placeholders as intentional stubs** (empty arrays/offline throws) are used as rollout strategy and should be documented consistently as phase boundaries.
3. **Rich hook orchestration pattern** in `features/mappings/hooks/` is now a core architectural convention (feature-level state machines + persistence wrappers), stronger than early architecture framing.

---

## 10) Actionable Inputs for T-06 and T-07

For T-06 (`ui-application.md` updates):
1. Update module structure coverage to include `home` and `projects` at first-class level.
2. Replace stale “placeholder pages” phrasing with implemented-page wording.
3. Reconcile “no cross-feature direct imports” rule with reality (either tighten code later or update architecture rule now).
4. Add explicit `ApiAdapter` contract surface summary (method groups) and call out placeholder/offline methods.
5. Add explicit notes for engine adapter normalization (`null|any` rule-type normalization) and `inferExpressionType` integration.

For T-07 (Phase 1 readiness doc input):
1. Use adapter inventory above as Phase 1 backend API boundary baseline.
2. Flag lack of pagination/auth/error standardization as Phase 1 design questions.
3. Flag current HybridAdapter AI slice as transition model to full HttpAdapter.
4. Flag template/search/server-preview partial implementations as unresolved backend integration surfaces.

---

## 11) Acceptance Check Traceability (T-03)

- Findings cover major sections of `ui-application.md`: ✅
- Adapter pattern + implementations reconciled: ✅
- Route table checked against `App.tsx`: ✅
- Feature module list reconciled vs `ui/src/features/`: ✅
- Engine integration boundary verified: ✅
- Phase 1 adapter boundary inventory captured across current `ApiAdapter` methods: ✅
- Findings structured for T-06/T-07 consumption: ✅
