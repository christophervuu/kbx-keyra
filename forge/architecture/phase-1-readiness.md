# Phase 1 Readiness

This document captures the Phase 0 → Phase 1 backend boundary as observed during FS-054 architecture reconciliation.

It is a **readiness reference**, not a Phase 1 design proposal. It documents current contracts, simplifications, constraints, and open questions that Phase 1 planning must resolve.

---

## 1) Purpose and Scope

Purpose:
- Consolidate Phase 1-relevant findings from:
  - `project-structure.md`
  - `mapping-engine.md`
  - `ui-application.md`
  - current implementation (`ui/src/lib/api/*`, `ui/src/lib/engine/*`, `src/engine/*`, `src/lambda/ai/*`, `src/lib/ai/*`)

Scope:
- Capture adapter contract boundaries and current behavior
- Enumerate Phase 0 simplifications that require Phase 1 resolution
- Make frontend-imposed backend constraints explicit
- Document AI transition path (`HybridAdapter` showcase slice → full backend integration)
- Document engine integration points across browser and backend runtime

Out of scope:
- Backend technology selection
- Endpoint-by-endpoint API design
- Authentication architecture design details

---

## 2) Adapter Boundary Inventory

Source of truth: `ui/src/lib/api/types.ts` (`ApiAdapter`).

Columns:
- **Signature**: method contract at UI boundary
- **Current (Phase 0)**: `LocalStorageAdapter`/`HybridAdapter` behavior
- **Phase 1 requirement**: what backend must provide
- **Category**: CRUD / compute / AI / deployment / integration
- **Complexity notes**: pagination, consistency, latency, etc.

### 2.1 Schemas

| Signature | Current (Phase 0) | Phase 1 requirement | Category | Complexity notes |
|---|---|---|---|---|
| `listSchemas(): Promise<SchemaMetadata[]>` | localStorage full-array read | list endpoint returning `SchemaMetadata[]` shape | CRUD | UI expects full-list/no pagination today |
| `getSchema(id): Promise<SchemaDetail>` | local read; structured not-found error object | detail endpoint with same `SchemaDetail` shape | CRUD | Not-found semantics should be standardized |
| `createSchema(input): Promise<SchemaMetadata>` | local create + immediate availability | create endpoint with same output shape | CRUD | UI assumes immediate consistency |
| `updateSchema(id, input): Promise<SchemaMetadata>` | local merge update | update endpoint preserving current metadata conventions | CRUD | optimistic UI not required yet |
| `deleteSchema(id): Promise<void>` | local delete | delete endpoint | CRUD | referential integrity behavior must be defined |

### 2.2 Mappings

| Signature | Current (Phase 0) | Phase 1 requirement | Category | Complexity notes |
|---|---|---|---|---|
| `listMappings(projectId): Promise<MappingMetadata[]>` | local filtered list | project-scoped listing endpoint | CRUD | no pagination contract yet |
| `getMapping(id): Promise<MappingConfig>` | local config read | detail endpoint returning full `MappingConfig` | CRUD | overwrite/update model assumes full config payload |
| `createMapping(input): Promise<MappingMetadata>` | local create `version=1` | create endpoint with equivalent metadata output | CRUD | generated IDs/versioning must remain compatible |
| `updateMapping(id, config): Promise<MappingMetadata>` | full overwrite + metadata recompute | full update endpoint (or equivalent behavior) | CRUD | conflict/version policy required in multi-user model |
| `deleteMapping(id): Promise<void>` | local delete + local version-key cleanup | delete endpoint | CRUD | must define cascading behavior |
| `duplicateMapping(id, newName): Promise<MappingMetadata>` | local clone/reset-version | duplicate endpoint or server-side copy equivalent | CRUD | preserve semantic of clone + new identity |

### 2.3 Mapping Versions

| Signature | Current (Phase 0) | Phase 1 requirement | Category | Complexity notes |
|---|---|---|---|---|
| `listMappingVersions(mappingId): Promise<MappingVersionEntry[]>` | localStorage per-mapping key, sorted desc | historical version listing endpoint | CRUD | currently capped to 50 locally |
| `getMappingVersion(mappingId, version): Promise<MappingVersionEntry>` | local lookup by version number | endpoint for version retrieval by numeric version | CRUD | version identity semantics must stay stable |
| `saveMappingVersion(mappingId, entry): Promise<void>` | local append + prune oldest | snapshot persistence endpoint | CRUD | write path currently fire-and-forget in UI flows |

### 2.4 Projects

| Signature | Current (Phase 0) | Phase 1 requirement | Category | Complexity notes |
|---|---|---|---|---|
| `listProjects(): Promise<ProjectMetadata[]>` | full local array | list endpoint with same metadata shape | CRUD | UI expects full arrays |
| `getProject(id): Promise<ProjectDetail>` | local detail + embedded mapping metadata | detail endpoint compatible with `ProjectDetail` | CRUD | embedding vs linking mappings is a backend design decision |
| `createProject(input): Promise<ProjectMetadata>` | local create | create endpoint | CRUD | immediate availability assumed |
| `updateProject(id, input): Promise<ProjectMetadata>` | local partial merge | update endpoint | CRUD | no patch envelope in current contract |
| `deleteProject(id): Promise<void>` | local delete | delete endpoint | CRUD | define mapping/schema reference effects |

### 2.5 Templates

| Signature | Current (Phase 0) | Phase 1 requirement | Category | Complexity notes |
|---|---|---|---|---|
| `listTemplates(): Promise<TemplateMetadata[]>` | returns `[]` (intentional stub) | template listing support or explicit product-level gating | CRUD | currently optional/empty-tolerant UI behavior |
| `getTemplate(id): Promise<TemplateDetail>` | local not-found | detail endpoint if templates become active | CRUD | template subsystem maturity unresolved |

### 2.6 Deployment

| Signature | Current (Phase 0) | Phase 1 requirement | Category | Complexity notes |
|---|---|---|---|---|
| `getDeploymentContext(mappingId): Promise<DeploymentContext>` | local simulated env records | deployment-context endpoint | deployment | env model currently fixed `DEV/QA/PROD` |
| `deploy(mappingId, environment): Promise<DeploymentRecord>` | local simulated record create | real deploy orchestration | deployment | async/long-running behavior not modeled in adapter yet |
| `promote(mappingId, from, to): Promise<DeploymentRecord>` | local simulated promotion | promotion API | deployment | policy/approval concerns deferred |
| `rollback(mappingId, environment, targetVersion): Promise<DeploymentRecord>` | local simulated rollback | rollback API | deployment | auditability requirements likely in Phase 1 |
| `getDeploymentDiff(mappingId, fromVersion, toVersion): Promise<DeploymentDiff>` | placeholder diff shape | real comparison endpoint | deployment | diff fidelity requirements unresolved |

### 2.7 GitHub Integrations (CDM + published)

| Signature | Current (Phase 0) | Phase 1 requirement | Category | Complexity notes |
|---|---|---|---|---|
| `listCdmSchemas(path?)` | throws offline-mode error | backend integration/proxy for CDM listing | integration | pagination/filter semantics TBD |
| `linkCdmSchema(input)` | throws offline-mode error | schema-link endpoint | integration | idempotency expectations TBD |
| `syncCdmSchema(schemaId)` | throws offline-mode error | sync endpoint | integration | sync status lifecycle contract required |
| `listPublishedSchemas(path?)` | throws offline-mode error | published schema list endpoint | integration | branching/path scope unresolved |
| `publishSchemaToGitHub(schemaId, input)` | throws offline-mode error | publish endpoint | integration | commit strategy and conflict behavior TBD |
| `linkPublishedSchema(input)` | throws offline-mode error | link endpoint | integration | not-found/auth failure normalization needed |

### 2.8 AI

| Signature | Current (Phase 0) | Phase 1 requirement | Category | Complexity notes |
|---|---|---|---|---|
| `autoMap(input)` | offline throw in local adapter | backend AI endpoint + adapter impl | AI | full-section vs whole-mapping semantics need definition |
| `autoMapSection(input)` | HTTP in `HybridAdapter`; offline throw in local | keep/extend backend AI section endpoint | AI | currently showcase-integrated path |
| `suggestExpression(input)` | HTTP in `HybridAdapter`; offline throw in local | production-grade endpoint + standardized errors | AI | user-facing error mapping exists in UI |
| `explainRule(input)` | HTTP in `HybridAdapter`; offline throw in local | production-grade endpoint + standardized errors | AI | parity with existing showcase behavior needed |
| `smartFix(input)` | offline throw in local | backend AI endpoint + adapter impl | AI | currently no HTTP override |
| `validateMappings(input)` | offline throw in local | backend validation/report endpoint | AI/compute | contract shape exists, behavior not implemented |

### 2.9 Schema Search / Activity / Server Preview

| Signature | Current (Phase 0) | Phase 1 requirement | Category | Complexity notes |
|---|---|---|---|---|
| `querySchemaNodes(schemaId, query): Promise<SchemaSearchResult[]>` | returns `[]` (intentional stub) | indexed search endpoint | compute | ranking/pagination contract not yet defined |
| `listActivity(projectId?, limit?): Promise<ActivityEntry[]>` | local list + optional filter/limit | activity feed endpoint | compute | retention/window rules unresolved |
| `previewOnServer(mappingId, input): Promise<ServerPreviewResult>` | offline throw in local; compare hooks gate availability | server preview endpoint | compute/integration | latency/timeouts and execution budget are critical |

---

## 3) Phase 0 Simplifications Requiring Phase 1 Resolution

Each item includes what/why/Phase 1 action/priority.

1. **XSD validation permissive stub**  
   - What: `src/engine/validate/schema-tree.ts` uses permissive XSD tree (`hasPath() => true`, no required leaves, `KEYRA-I001`).  
   - Why: avoid blocking editor flows before full XSD parser support.  
   - Phase 1: implement real XSD-to-SchemaTree adapter with path/type/required extraction parity to JSON Schema.  
   - Priority: **high** (schema correctness boundary).

2. **Local-only data layer (`LocalStorageAdapter`)**  
   - What: core CRUD/state persists to browser storage only.  
   - Why: Phase 0 frontend-first MVP and rapid iteration.  
   - Phase 1: replace/augment with backend-backed adapter implementation while keeping `ApiAdapter` contract stable.  
   - Priority: **high**.

3. **AI and GitHub capability gaps behind offline throws**  
   - What: many methods throw `Error("Not available in offline mode")` in local adapter.  
   - Why: feature boundaries intentionally deferred.  
   - Phase 1: provide backend endpoints/integration and normalize error envelopes across methods.  
   - Priority: **high**.

4. **Template and schema-search placeholders**  
   - What: `listTemplates()` and `querySchemaNodes()` return empty arrays.  
   - Why: keep interface shape stable while subsystems are deferred.  
   - Phase 1: either implement real backend behavior or formally gate/hide these surfaces in product scope.  
   - Priority: **medium**.

5. **Deployment model is simulated locally**  
   - What: deploy/promote/rollback/diff use local simulated records.  
   - Why: avoid backend ops scope in Phase 0.  
   - Phase 1: implement real deployment lifecycle services and status/history contracts.  
   - Priority: **high**.

6. **Single-user immediate-consistency assumptions**  
   - What: UI hooks assume local immediate writes and read-after-write consistency.  
   - Why: local storage model and no concurrent users.  
   - Phase 1: define conflict/version semantics, multi-user editing behavior, and possible optimistic update strategy.  
   - Priority: **high**.

7. **No auth/authz contract at adapter call sites**  
   - What: adapter signatures do not include auth/session context.  
   - Why: Phase 0 local mode and no backend identity model.  
   - Phase 1: define backend auth boundary without breaking UI call ergonomics (e.g., transport/session layer concerns outside method signatures).  
   - Priority: **high**.

8. **E2E infrastructure documented but not present**  
   - What: `e2e-testing.md` describes `tests/e2e/` structure not present in repository.  
   - Why: architecture drafted ahead of implementation.  
   - Phase 1: decide whether to implement or explicitly re-scope E2E architecture baseline before backend rollout.  
   - Priority: **medium**.

---

## 4) Implementation Constraints on Backend Design

Frontend implementation currently constrains backend design in these ways:

1. **Direct domain-object returns in adapter signatures**  
   - Source: `ui/src/lib/api/types.ts`  
   - Constraint: backend adapter layer must map server responses to direct domain objects (`SchemaMetadata`, `MappingConfig`, etc.), not expose transport envelopes to feature code.

2. **No pagination parameters in list methods**  
   - Source: `ApiAdapter` list signatures  
   - Constraint: Phase 1 must either support full-array responses initially or introduce pagination with coordinated UI contract changes.

3. **Heterogeneous error handling today**  
   - Source: `local-storage-adapter.ts` (structured not-found objects + generic `Error` offline throws)  
   - Constraint: backend-facing adapter should normalize error contract for predictable UI behavior.

4. **Immediate consistency expectations in hooks**  
   - Source: UI orchestration hooks and local adapter semantics  
   - Constraint: eventually-consistent backend behavior needs explicit UX model (loading states, retries, stale markers).

5. **Full-config update semantics for mappings**  
   - Source: `updateMapping(id, config)` contract  
   - Constraint: backend must support overwrite-style update semantics (or equivalent deterministic merge behavior).

6. **Version model assumptions**  
   - Source: version APIs and editor/version-history flows  
   - Constraint: numeric version identity and retrievable full snapshots are part of current UI behavior.

7. **Fixed environment enum in deploy workflows**  
   - Source: `Environment` usage and deployment methods  
   - Constraint: backend environment model must remain compatible or require coordinated UI migration.

8. **Latency-sensitive preview/validation UX**  
   - Source: debounced validation/preview hooks and test-lab workflows  
   - Constraint: backend endpoints (especially preview/AI) must meet interactive latency expectations or provide explicit async UX transitions.

9. **Engine type-normalization boundary in UI adapter**  
   - Source: `ui/src/lib/engine/index.ts` (`null|any -> 'string'`)  
   - Constraint: backend validation/execution paths should align with same rule-type compatibility assumptions to avoid editor/runtime mismatch.

---

## 5) AI Showcase Transition Path

### Current state
- `createAdapter()` selects:
  - `LocalStorageAdapter` when `VITE_API_URL` is unset
  - `HybridAdapter` when set
- `HybridAdapter` overrides only:
  - `explainRule`
  - `suggestExpression`
  - `autoMapSection`
- Remaining AI methods still follow local offline behavior.

### Backend assets already present
- Lambda handlers under `src/lambda/ai/`:
  - `explain-rule.ts`
  - `suggest-expression.ts`
  - `auto-map.ts`
- Shared runtime under `src/lib/ai/`:
  - prompt registry + DSL asset loading + rendering + model client + output parsing + orchestration (`invoke-ai.ts`)
- Architecture reference: `forge/architecture/ai-runtime.md`.

### Phase 1 extension path
1. Expand backend coverage from showcase methods to full AI contract (`autoMap`, `smartFix`, `validateMappings`, etc.)
2. Introduce standardized error envelopes and auth-aware invocation path
3. Introduce full HTTP adapter (or equivalent) while retaining `ApiAdapter` call-site stability
4. Keep compatibility for current UI flows (`useSuggestExpression`, explain/auto-map workspace lifecycle)

### Compatibility considerations
- Preserve current response shapes used by UI hooks/components
- Preserve user-friendly error messaging expectations currently implemented in UI hooks
- Avoid regressions in offline/local development fallback model during migration

---

## 6) Engine Integration Points

### Current (Phase 0)
- UI consumes engine in-browser via `ui/src/lib/engine/index.ts` boundary.
- Core browser-side uses:
  - `validateMapping` (editor validation)
  - `executeMapping` / preview flows
  - `evaluateExpression` (single-expression preview)
  - `inferExpressionType` (UI-side type hints/validation)

### Existing backend-side engine adjacency
- Engine is already import-safe for backend/lambda usage (`src/engine/**` boundary purity).
- Lambda handlers can consume engine and shared runtime utilities via `src/engine/` and `src/lib/` boundaries.

### Phase 1 integration direction (non-prescriptive)
- Add backend execution/validation entry points where server-side consistency is required (preview/deploy/validation).
- Keep browser-side engine usage for interactive authoring where appropriate.
- Ensure parity between browser and server validation/diagnostic behavior.

### Bundle/deployment implications
- Browser bundle currently includes engine via alias boundary.
- Backend path should avoid duplicating divergent validation semantics.
- Engine remains deterministic and synchronous; throughput concerns shift to orchestration/runtime layers around engine execution.

### Performance expectations reference
- Engine architecture notes include deterministic synchronous pipeline and benchmark expectations in `mapping-engine.md`.

---

## 7) Reconciliation Summary

### Implemented as planned (high confidence)
- Mapping engine architecture is strongly aligned after T-05 reconciliation.
- UI routing and adapter bootstrap behavior align with implementation after T-06 updates.
- Project structure now reflects actual repository shape after T-04 updates.

### Intentionally simplified / changed in Phase 0
- XSD validation remains permissive stub.
- Local-only adapter remains primary data plane.
- AI/GitHub/deployment are partial or showcase-only integrations.
- Template/search subsystems have placeholder behavior.

### Still unresolved for Phase 1 planning
- Pagination strategy for list-heavy surfaces.
- Auth/authz model and tenancy boundary.
- Standardized backend error envelope and adapter normalization rules.
- Conflict/version semantics for concurrent edits.
- Scope and timing for non-showcase AI and GitHub methods.
- E2E architecture/documentation baseline vs actual implementation state.

---

## 8) Open Questions for Phase 1 Planning

1. **Pagination contract:** should list endpoints remain full-array for initial compatibility, or should UI move to paginated contracts in first Phase 1 increment?  
2. **Error model:** what canonical error envelope should backend return so adapter normalization can replace current mixed `Error`/object patterns?  
3. **Consistency model:** should mapping/project/schema writes be strictly read-after-write consistent, or can eventual consistency be introduced with explicit UI stale/refresh semantics?  
4. **Version/concurrency policy:** how should update conflicts be handled for `updateMapping(id, config)` and version save/restore flows in multi-user contexts?  
5. **Auth boundary:** where should identity/session concerns live (transport/client middleware/adapter provider) without changing `ApiAdapter` method signatures?  
6. **AI rollout sequencing:** which non-showcase AI methods (`autoMap`, `smartFix`, `validateMappings`) are Phase 1 required vs deferred?  
7. **GitHub integration scope:** should CDM/published schema flows ship in initial Phase 1 backend or remain disabled with explicit product gating?  
8. **Server preview SLA:** what timeout/latency/error budget should `previewOnServer` target to preserve current Test Lab/preview UX expectations?  
9. **Template subsystem:** implement real templates now or keep optional empty behavior with explicit UX constraints?  
10. **E2E baseline:** should `e2e-testing.md` be brought to implemented state before/with Phase 1 backend rollout to reduce integration risk?

---

## Cross-Reference Index

- Architecture docs:
  - `forge/architecture/project-structure.md`
  - `forge/architecture/mapping-engine.md`
  - `forge/architecture/ui-application.md`
  - `forge/architecture/ai-runtime.md`
- Source contracts/implementations:
  - `ui/src/lib/api/types.ts`
  - `ui/src/lib/api/local-storage-adapter.ts`
  - `ui/src/lib/api/hybrid-adapter.ts`
  - `ui/src/lib/api/bootstrap.ts`
  - `ui/src/lib/engine/index.ts`
  - `src/engine/validate/schema-tree.ts`
  - `src/lambda/ai/`
  - `src/lib/ai/`
