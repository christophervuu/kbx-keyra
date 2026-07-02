# SPEC

## Title

KeyRa 2.0 Browser Query Caching and Stale-While-Revalidate Navigation

---

## ID

FS-103

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-07-01  
Last Updated: 2026-07-01  
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Introduce a shared browser-side query/cache layer between React pages and `ApiAdapter` to make return navigation render immediately from in-memory cached data and refresh stale data in the background. The change standardizes query keys, freshness/retention policy, request deduplication, mutation invalidation, prefetching, and cache-clearing rules across KeyRa UI surfaces.

The backend remains the source of truth and `ApiAdapter` remains the transport/persistence boundary. This spec is limited to browser-session memory caching and stale-while-revalidate behavior; infrastructure-side caching and persistent/offline browser cache are explicitly out of scope.

---

## Problem

Current route-level data loading reissues many adapter calls when users move between recently visited pages. Users see repeated skeletons and slower navigation response, which degrades perceived responsiveness and contributes negatively to KeyRa’s TTFSM (Time to First Successful Mapping), especially in common flows such as Project Overview ↔ Mapping ↔ Project Overview.

Repository inspection shows data loading is mostly effect-driven per page/hook without a shared query cache and without automatic deduplication of concurrent identical requests. React Strict Mode is enabled in development (`ui/src/main.tsx`), increasing duplicate-request risk during mount/unmount cycles.

---

## Goal

Make repeat navigation between previously visited KeyRa pages feel immediate by rendering usable cached data first and revalidating in the background when stale, while preserving existing error safety and unsaved Mapping Editor behavior.

Success means:
- previously loaded page content appears immediately on return visits,
- background refresh does not block or blank the UI,
- refresh failures with cached data are non-blocking,
- concurrent consumers of identical data trigger only one adapter request,
- mutation results/invalidation keep all dependent views coherent without browser reload.

---

## Assumptions

- `@tanstack/react-query` is not currently installed; only `@tanstack/react-virtual` exists (`ui/package.json`).
- Components continue to access backend data via `ApiAdapter`; direct component-level `fetch()` remains prohibited.
- `HttpAdapter` vs `LocalStorageAdapter` selection is bootstrap-time via `VITE_API_URL` (`ui/src/lib/api/bootstrap.ts`), so backend mode changes effectively require app reload/rebootstrap.
- Existing Mapping Editor draft ownership (`keyra:draft:${mappingId}`) remains authoritative for unsaved working state.
- Existing architecture coverage exists in `forge/architecture/ui-application.md`; a new architecture document is not required.

---

## Current Context

Repository grounding highlights:

- No shared query caching library currently used; effect/state hooks drive loading and retries.
- `ApiAdapter` contract is broad and centralized (`ui/src/lib/api/types.ts`).
- Direct `fetch()` is isolated to API client internals (`ui/src/lib/api/http-client.ts`, `ui/src/lib/api/ai-api-client.ts`), not pages/components.
- High-traffic pages with multiple related fetches include:
  - Dashboard: `ui/src/features/home/hooks/use-dashboard-data.ts`
  - Project Overview: `ui/src/features/projects/hooks/use-project-overview.ts`
  - Schema Library/Detail: `ui/src/features/schemas/hooks/use-schema-library.ts`, `ui/src/features/schemas/hooks/use-schema-detail.ts`
  - Deployment page: `ui/src/features/deployments/hooks/use-deployment-page.ts`
  - Mapping Editor: `ui/src/features/mappings/hooks/use-mapping-editor.ts`, `ui/src/routes/pages/MappingEditor.tsx`
- In-progress specs checked (`FS-019`, `FS-101`, `FS-102`) with no direct scope conflict.

Next available FS number determined from `forge/active/` + `forge/completed/`: **FS-103**.

---

## Scope

### In Scope

- Add a shared client query/cache layer between React components and `ApiAdapter` using TanStack Query.
- Standardize typed query-key factory and centralized query option definitions.
- Browser-session in-memory cache supporting:
  - freshness/staleness policy,
  - inactive-cache retention/garbage collection,
  - stale-while-revalidate,
  - request deduplication,
  - background refresh,
  - retry coordination,
  - prefetch hooks,
  - targeted invalidation.
- Migrate backend-backed page resources to shared queries, including:
  - project lists/details,
  - project mappings and mapping metadata,
  - saved mapping configurations,
  - schema lists/details/content metadata,
  - deployment summaries/context/history,
  - global/project settings,
  - other backend-backed page resources discovered in inspection except activity feed.
- Preserve existing `ApiAdapter.listActivity()` usage and current Home activity behavior unchanged in FS-103.
- Ensure shared query infrastructure is designed to support a follow-up activity-feed migration.
- Distinct UI handling for:
  - initial loading (no data),
  - background refresh (has data),
  - initial error,
  - refresh error with cached data.
- Mutation cache update/invalidation matrix for project, mapping, schema, deployment, and settings mutations.
- Mapping Editor server-data boundary protections (canonical saved mapping vs unsaved local draft).
- Adapter/environment cache-clearing rules and development/debug reset behavior.
- Unit/integration/UI acceptance tests for cache behavior and request-count guarantees.

### Out of Scope

- AWS/API Gateway/CloudFront/Lambda/OpenSearch/DynamoDB infrastructure caching.
- Service worker offline caching.
- IndexedDB or cross-session query cache persistence/hydration.
- SSR and server-rendering cache concerns.
- Production runtime mapping snapshot caching changes.
- Caching AI prompts/suggestions/model outputs in shared query cache.
- Caching preview/test payload contents in shared query cache.
- Replacing backend persistence with browser storage.
- Activity-feed query caching migration (deferred until canonical ownership and backend/local merge behavior is defined).

---

## Non-Goals

- Redesign KeyRa core architecture boundaries (`React -> query layer -> ApiAdapter -> adapter impl`).
- Move React query lifecycle concepts into the `ApiAdapter` interface.
- Introduce global polling for all resources.
- Alter Mapping Editor unsaved-change UX contracts beyond protection from background overwrite.

---

## Relevant Areas

- `ui/package.json`
- `ui/src/main.tsx`
- `ui/src/lib/api/adapter-provider.tsx`
- `ui/src/lib/api/bootstrap.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/hooks/use-async-state.ts`
- `ui/src/lib/state/async-state.ts`
- `ui/src/features/home/hooks/use-dashboard-data.ts`
- `ui/src/features/projects/hooks/use-project-overview.ts`
- `ui/src/features/projects/components/CreateProjectPage.tsx`
- `ui/src/features/projects/components/CreateMappingPage.tsx`
- `ui/src/features/projects/components/ProjectValueMappingsPage.tsx`
- `ui/src/features/schemas/hooks/use-schema-library.ts`
- `ui/src/features/schemas/hooks/use-schema-detail.ts`
- `ui/src/features/schemas/hooks/use-schema-usage.ts`
- `ui/src/features/deployments/hooks/use-deployment-page.ts`
- `ui/src/features/mappings/hooks/use-mapping-editor.ts`
- `ui/src/routes/pages/MappingEditor.tsx`
- `ui/src/routes/pages/MappingDeployment.tsx`
- `ui/src/features/mappings/lib/auto-map-persistence.ts`
- `ui/src/features/mappings/hooks/use-test-cases.ts`
- `ui/src/features/mappings/hooks/use-test-run-results.ts`
- `tests/e2e/*` (adapter parity + request-count behavior additions)
- `forge/architecture/ui-application.md`
- `forge/architecture/e2e-testing.md`

---

## Dependencies / Blockers

- Depends on selecting and adding TanStack Query package version compatible with React 18 and existing tooling.
- Coordination required with in-progress UI work touching `MappingEditor` (`FS-101`, `FS-102`) to avoid merge drift.

---

## Constraints

- Must preserve adapter abstraction and keep direct network access inside API layer.
- Must not show data from one backend environment when connected to another.
- Must preserve editor unsaved-state ownership and avoid silent overwrites.
- Must support both `HttpAdapter` and `LocalStorageAdapter` modes.
- Must keep page content visible during background refresh.
- Must centralize cache timings by resource category (no one-size global values).

---

## Proposed Behavior

### User Flow

#### First visit (no cache)
1. Page renders existing initial skeleton/loading state.
2. Page executes canonical query via shared query layer.
3. On success, page content renders and response is cached.
4. On failure, page renders existing full error state with retry.

#### Return visit (cache present)
1. Page renders cached data immediately.
2. Initial skeleton is not shown.
3. Query layer evaluates freshness by resource policy.
4. If stale, background revalidation executes.
5. UI updates only when newer data arrives.

#### Background refresh failure (cache present)
1. Cached content remains visible.
2. Non-blocking refresh warning is shown.
3. Warning includes last successful update timestamp.
4. Manual retry action is available.
5. No full-page error takeover occurs.

### System Behavior

#### Query/cache architecture

```text
React pages/components
        ↓
Shared query/cache layer (TanStack Query)
        ↓
ApiAdapter
        ↓
HttpAdapter | LocalStorageAdapter
        ↓
Backend | local storage
```

#### Query-key strategy

- Define a centralized typed key factory (e.g., `queryKeys.projects.detail(projectId)`).
- Distinguish transport/backend identity from KeyRa runtime environments (DEV/QA/PROD).
- Domain query keys are deterministic and include IDs, filters, pagination, and resource-specific environment dimensions only when the resource is truly environment-scoped.
- Pages/hooks do not handcraft arbitrary key arrays.
- Keys support targeted invalidation at item/list/family levels.

#### Backend/adapter identity semantics

- Recreate or clear the `QueryClient` when backend URL or adapter identity changes.
- Do not include transport configuration (e.g., API base URL) in every domain key.
- Include DEV/QA/PROD discriminator in keys only for queries whose resource data is environment-specific.
- Incompatible backend data must never survive rebootstrap.

#### Freshness and retention defaults

Central query definitions will set `staleTime` (freshness) and `gcTime` (inactive retention) by resource family:

| Resource | Freshness (`staleTime`) | Retention (`gcTime`) |
|---|---:|---:|
| Project list | 60 seconds | 10 minutes |
| Project detail | 5 minutes | 15 minutes |
| Project mapping list | 60 seconds | 10 minutes |
| Saved mapping config | 10 minutes | 30 minutes |
| Schema list | 5 minutes | 15 minutes |
| Schema detail/content metadata | 30 minutes | 45 minutes |
| Deployment summaries/context | 15 seconds | 5 minutes |
| Deployment history | 60 seconds | 10 minutes |
| Settings | Infinity | Infinity |

Settings remain mutation-invalidated and are cleared when backend or adapter context changes.

#### Refresh triggers

- Enable stale-on-mount revalidation by default.
- Enable stale-on-window-focus for deployment-sensitive query families.
- Optionally enable stale-on-reconnect for operational views.
- Avoid global interval polling outside active deployment-progress workflows.

#### Deployment polling policy

- Active-operation polling stays in dedicated deployment workflow hooks.
- Those hooks may use TanStack Query dynamic `refetchInterval`.
- Generic/shared query definitions remain interval-free.
- Polling runs only while operation state is transitional.
- Polling stops on terminal states (success, failure, cancellation, equivalent terminal outcome).
- Polling stops when consuming workflow unmounts.
- `refetchIntervalInBackground` is `false` unless a future requirement explicitly changes it.
- Existing deployment polling cadence and timeout behavior are preserved where already implemented.
- Ordinary deployment context/history queries do not poll solely due to staleness.
- Manual refresh, focus revalidation, and active-operation polling are separate behaviors.

#### Request deduplication

- Identical in-flight queries are shared among all consumers.
- Concurrent mounts and rapid re-navigation reuse in-flight results.
- React Strict Mode mount behavior must not cause duplicate adapter calls for same key.
- There must be no concurrent duplicate adapter requests for the same canonical query key.

#### Mutation response handling and in-flight protection

- Before optimistic or canonical mutation cache updates, cancel relevant in-flight reads so older responses cannot overwrite mutation results.
- When mutation returns complete canonical resource, write detail cache directly with `setQueryData`.
- When endpoint returns a formally documented patch response, merge only fields explicitly guaranteed by that contract.
- When response is metadata-only or incomplete, default to targeted invalidation + refetch (no speculative merge).
- Deletes remove exact detail/dependent queries and invalidate affected collections/summaries.
- Do not introduce a generic merge utility that treats omitted fields as unchanged unless every participating endpoint guarantees that behavior.

After mutation success:
- write complete canonical responses directly,
- invalidate dependent summaries and collections,
- avoid immediate redundant GET requests when response is complete.

After mutation failure:
- restore optimistic snapshots where applicable,
- preserve canonical cached data,
- surface normalized mutation error.

#### Mutation invalidation matrix (implementation baseline)

| Mutation | Direct cache update candidates | Query families to invalidate | Exact queries to remove | Canonical-response dependency |
|---|---|---|---|---|
| Project create | `projects.detail(projectId)` from create response when complete | `projects.all`, dashboard summaries/totals, project picker collections | none | Direct detail write requires complete canonical project payload; otherwise invalidate lists/summaries only |
| Project update | `projects.detail(projectId)` when complete or documented patch fields only | `projects.all`, dashboard summaries/totals, project-linked summary cards | none | If metadata-only/incomplete response, invalidate `projects.detail(projectId)` and related summaries |
| Project delete | none | `projects.all`, dashboard summaries/totals, activity-derived project summaries (if present) | `projects.detail(projectId)`, `projects.mappings(projectId)`, `settings.project(projectId)`, project deployment-context/history keys | No direct write; always remove + invalidate |
| Mapping create | `mappings.detail(mappingId)` when complete | `projects.mappings(projectId)`, project summary, dashboard mapping totals | none | If create response lacks canonical detail, invalidate mapping collections/summaries |
| Mapping duplicate | `mappings.detail(newMappingId)` when complete | `projects.mappings(projectId)`, project summary, dashboard mapping totals | none | Same canonical dependency as create |
| Mapping save | `mappings.detail(mappingId)` and saved-mapping config key when complete | `projects.mappings(projectId)`, project summary, mapping deployment-context, deploy stale/current indicators, affected dashboard summaries | none | If response is metadata-only, invalidate detail + dependent families; do not guess merged rule/config state |
| Mapping delete | none | `projects.mappings(projectId)`, dashboard mapping summaries/totals | `mappings.detail(mappingId)`, `mappings.deploymentContext(mappingId)`, `mappings.deploymentHistory(mappingId)` | No direct write; always remove + invalidate |
| Schema create | `schemas.detail(schemaId)` when complete | `schemas.all`, schema usage families, affected project details/mapping metadata views | none | If create response incomplete, invalidate schema families |
| Schema edit | `schemas.detail(schemaId)` when complete or documented patch fields | `schemas.all`, schema usage families, affected project details/mapping metadata views | none | If metadata-only/incomplete response, invalidate `schemas.detail(schemaId)` + dependent families |
| Schema sync | `schemas.detail(schemaId)` only when sync returns canonical updated detail | `schemas.all`, schema usage families, affected project/mapping schema displays | none | Default to invalidate/refetch unless canonical detail guaranteed |
| Schema replace | `schemas.detail(schemaId)` when complete | `schemas.all`, schema usage families, affected project/mapping schema displays | none | If incomplete response, invalidate canonical detail + dependents |
| Schema publish | `schemas.detail(schemaId)` when complete | `schemas.all`, schema usage families, affected project/mapping schema displays | none | If response patch scope is narrow, merge only guaranteed fields; otherwise invalidate |
| Schema delete | none | `schemas.all`, schema usage families, affected project/mapping schema displays | `schemas.detail(schemaId)` and schema-specific content queries | No direct write; always remove + invalidate |
| Deploy | `mappings.deploymentContext(mappingId)` only if mutation returns full canonical context payload | deployment context/history families, mapping badges/status summaries, project/home deployment overviews | none | Most flows should invalidate families unless canonical context/history response is guaranteed |
| Promote | same as Deploy | same as Deploy + environment comparison families | none | Same dependency as Deploy |
| Rollback | same as Deploy | same as Deploy + environment comparison families | none | Same dependency as Deploy |
| Global settings update | `settings.global()` when complete or documented patch fields | settings-derived UI state families and dependent summaries | none | If response incomplete, invalidate `settings.global()` |
| Project settings update | `settings.project(projectId)` when complete or documented patch fields | project settings-derived UI state and project summary families | none | If response incomplete, invalidate `settings.project(projectId)` |

#### Prefetch behavior

- Add limited prefetch triggers on likely next navigation targets:
  - project row hover/focus,
  - mapping row hover/focus,
  - deployment navigation hover/focus.
- Prefetch uses same query definitions and cache keys as normal loads.
- Do not prefetch whole large collections indiscriminately.

#### Loading/refresh/error states

Adopt explicit view-state distinction:
- initial load (`isLoading` with no data),
- success fresh,
- success stale,
- background fetching (`isFetching` with data),
- initial error (no data),
- refresh error (data preserved).

#### Mapping Editor boundary

- Query cache stores canonical saved mapping only.
- Unsaved working changes stay in editor-local draft state (`draftRules` + persisted draft key).
- Background mapping refresh never auto-replaces unsaved draft.
- If newer server revision arrives while unsaved changes exist, show non-destructive notification and explicit reconcile action.

#### Cache clearing

Clear/invalidate incompatible caches on:
- adapter-mode changes (`LocalStorageAdapter` ↔ `HttpAdapter`),
- backend base URL/config changes,
- resource deletion,
- future sign-out / tenant change,
- explicit developer cache reset action.

#### Sensitive-data exclusion

Do not place in shared query cache by default:
- sample payload bodies,
- expected-output test payloads,
- preview execution outputs,
- trace outputs,
- AI prompts/responses,
- draft-only editor working state.

### Failure / Edge Behavior

- Offline/timeouts/server errors map through existing AppError normalization; no raw transport exceptions exposed to page UI.
- 404 after deletion removes stale detail views and routes user to list/not-found state without retaining zombie detail cache.
- Multi-query pages preserve successful sections when one section fails.
- Refresh errors are non-blocking when cache exists; initial errors remain blocking when no cache exists.

---

## Acceptance Examples

### AE-01 — First visit shows initial skeleton then data

**Given**
- no cache exists for a page query key

**When**
- user navigates to the page

**Then**
- initial skeleton displays
- one adapter request executes
- returned data renders and is cached

### AE-02 — Return visit renders cached data immediately

**Given**
- cached data exists for the destination page

**When**
- user navigates away and back

**Then**
- cached content renders immediately
- full initial skeleton does not reappear

### AE-03 — Stale return triggers background refresh

**Given**
- cached data exists but is stale by policy

**When**
- user revisits the page

**Then**
- cached content stays visible
- stale data refresh runs in background
- visible content updates only if response changed

### AE-04 — Refresh failure with cache is non-blocking

**Given**
- stale cached data exists
- background refresh fails

**When**
- refresh request completes with error

**Then**
- cached content remains visible
- non-blocking refresh warning appears with last-updated time and retry

### AE-05 — Query keys are centralized and deterministic

**Given**
- all page queries are registered in query definitions

**When**
- queries execute across routes/components

**Then**
- keys come from typed key factory only
- keys include IDs/filter/pagination/environment dimensions as required

### AE-06 — Concurrent identical consumers dedupe requests

**Given**
- multiple components request the same resource simultaneously

**When**
- query executes

**Then**
- exactly one adapter request is made
- all consumers receive same resolved data

### AE-07 — Strict Mode does not inflate duplicate calls for same key

**Given**
- app runs in React Strict Mode (development)

**When**
- a route mounts/remounts during development behavior

**Then**
- there are no concurrent duplicate adapter requests for the same canonical query key

### AE-08 — Project mutations keep dependent views coherent

**Given**
- project create/update/delete operations succeed

**When**
- mutation response arrives

**Then**
- relevant project list/detail/dashboard queries are updated or invalidated per matrix
- deleted project detail and dependent caches are removed

### AE-09 — Mapping save updates canonical caches without redundant GET

**Given**
- save mapping mutation returns canonical data needed for cache update

**When**
- save succeeds

**Then**
- mapping/detail summary caches update from mutation result
- no unnecessary immediate follow-up GET is required

### AE-10 — Schema mutations invalidate all affected surfaces

**Given**
- schema create/edit/sync/replace/publish/delete occurs

**When**
- mutation succeeds

**Then**
- schema list/detail/usage and dependent project/mapping displays refresh according to invalidation matrix

### AE-11 — Deployment mutations refresh deployment surfaces

**Given**
- deploy/promote/rollback succeeds

**When**
- mutation completes

**Then**
- deployment context/history/badges/project deployment summaries refresh consistently

### AE-12 — Mapping Editor unsaved draft is protected

**Given**
- mapping editor has unsaved draft changes

**When**
- background refresh returns newer saved mapping

**Then**
- unsaved draft is not overwritten
- user receives explicit non-destructive update notification

### AE-13 — Prefetch warms destination cache

**Given**
- user hovers or focuses a high-probability navigation target

**When**
- prefetch triggers

**Then**
- destination query cache warms using canonical key/query definition
- destination render can use warmed data without duplicate load path

### AE-14 — Sensitive payloads are excluded from shared cache

**Given**
- page manipulates sample payloads/preview outputs/AI prompt-like data

**When**
- user navigates across routes

**Then**
- those payloads are not persisted in shared query cache entries

### AE-15 — Backend/adapter change clears incompatible cache

**Given**
- active backend URL or adapter mode changes

**When**
- app reconfigures

**Then**
- incompatible cache entries are cleared
- data from prior backend is never rendered in current backend context

### AE-16 — Initial error and refresh error render differently

**Given**
- one page load fails without cache, and another refresh fails with cache

**When**
- UI renders each case

**Then**
- no-cache failure shows full error state
- cached-refresh failure shows non-blocking refresh warning only

### AE-17 — Works in both HttpAdapter and LocalStorageAdapter

**Given**
- identical navigation flow under each adapter mode

**When**
- queries execute and cache lifecycle runs

**Then**
- behavior matches acceptance criteria in both modes

### AE-18 — Inactive cache entries are garbage-collected

**Given**
- query entries become inactive beyond retention policy

**When**
- retention window elapses

**Then**
- cache entries are reclaimed and memory use remains bounded

### AE-19 — Metadata-only mutation invalidates canonical detail instead of speculative merge

**Given**
- a mutation endpoint returns metadata-only or incomplete payload

**When**
- mutation succeeds

**Then**
- relevant in-flight reads are cancelled before cache mutation handling
- canonical detail query is invalidated/refetched instead of speculative local merge
- dependent collections/summaries are invalidated according to mutation matrix

---

## Open Questions

- none

---

## Verification Strategy

Automated verification will include unit, integration, and UI acceptance tests with request spying to assert exact call counts.

- **Unit tests**
  - query-key factory determinism and parameter coverage (AE-05)
  - cache policy registry defaults per resource family (AE-03, AE-18)
  - cache-clearing policy functions for adapter/backend changes (AE-15)
  - mutation cache update/invalidation helper behavior (AE-08 to AE-11)

- **Integration tests (React + mocked adapter/request spies)**
  - first-load skeleton and cache population (AE-01)
  - return-navigation immediate render from cache (AE-02)
  - stale revalidate with preserved content (AE-03)
  - refresh error non-blocking behavior (AE-04, AE-16)
  - concurrent identical consumers dedupe to one request (AE-06, AE-07)
  - mapping editor unsaved-state protection on refresh (AE-12)
  - prefetch warms destination cache (AE-13)
  - sensitive payload non-retention assertions (AE-14)
  - metadata-only mutation invalidation behavior without speculative merge (AE-19)

- **E2E/acceptance tests**
  - adapter parity (`localStorage` + `httpBackend`) for cache behavior and request counts (AE-17)
  - deployment/manual refresh behavior in operational surfaces (AE-11)

- **Observability/developer diagnostics**
  - diagnostics are development-only.
  - prefer TanStack Query development tooling and request spies in tests.
  - do not introduce noisy permanent production cache hit/miss logging.

---

## Task Generation Notes

- Spec is **cross-cutting** with primarily UI execution and one explicit architecture-update task.
- `ui-task` tasks should cover query infrastructure, page/hook migration, state UX, mutation invalidation wiring, prefetch, sensitive-data exclusions, and test updates.
- Include one `task` agent task to update architecture documentation (`forge/architecture/ui-application.md`, `forge/architecture/e2e-testing.md`, and `forge/architecture/INDEX.md`) with finalized query/cache conventions.
- Keep tasks atomic by surface area to reduce merge risk with active Mapping Editor work.

---

## Change Log

- Rev 1 — 2026-07-01
  - Initial draft for browser-side shared query/cache layer and stale-while-revalidate behavior across KeyRa UI.

- Rev 2 — 2026-07-01
  - Resolved Q1/Q2/Q3: deferred activity-feed caching from FS-103, adopted explicit metadata-only mutation invalidation policy, and constrained polling to dedicated deployment workflow hooks with interval-free generic query definitions.
  - Corrected TTFSM wording to KeyRa canonical metric meaning (Time to First Successful Mapping).
  - Replaced timing ranges with exact initial `staleTime`/`gcTime` defaults and clarified settings invalidation/clear behavior.
  - Added explicit backend/adapter identity vs environment keying semantics.
  - Added mutation in-flight read cancellation requirement and implementation-facing mutation invalidation matrix.
  - Tightened Strict Mode dedup acceptance language and added AE-19 for metadata-only mutation invalidation behavior.
  - Restricted cache diagnostics to development-only tooling/test instrumentation.
