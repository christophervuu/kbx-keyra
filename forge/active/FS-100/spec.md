# SPEC

## Title

End-to-End Mapping Deployment and KeyRa Runtime Execution (SANDBOX → DEV → PREPROD → PROD)

---

## ID

FS-100

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-25  
Last Updated: 2026-06-25  
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Deliver a complete deployment/runtime vertical slice so an existing saved mapping can be deployed to SANDBOX, executed through the SANDBOX runtime Lambda using the same runtime path as Step Functions, promoted unchanged to DEV/PREPROD/PROD, and rolled back by active-pointer reassignment. Canonicalize all environment semantics to `SANDBOX → DEV → PREPROD → PROD`, replace deployment-page transitional behavior with deploy-context-driven pipeline UX, and resolve current load failures through route/config/CORS/error normalization grounded in repository findings.

---

## Problem

The current deployment surface is transitional: the page still loads revisions/versions/current/history through multiple requests, defaults to DEV-centric UX, and lacks SANDBOX-first behavior. There is a concrete contract gap (`/mappings/:mappingId/revisions` used by UI but not wired in `template.yaml`) and an unimplemented aggregate deployment-context route in `HttpAdapter` (`featureNotEnabled`). Runtime/control-plane contracts are also partially drifted (artifact-oriented runtime client payload vs snapshot-oriented runtime deploy handler; preview path default `/internal/preview` without runtime route wiring).

---

## Goal

1. Make existing mappings deployable and executable end-to-end in SANDBOX first.
2. Preserve immutable snapshot identity across promotions and rollback semantics.
3. Establish canonical runtime request/response/error contracts with explicit compatibility behavior.
4. Replace current page load fragility with aggregate deployment-context API and regression coverage.
5. Provide explicit backend-mode migration/import path for browser-local mapping records.

---

## Assumptions

- Engine remains a pure TypeScript library with no direct cloud/network I/O.
- Runtime invocation environment is selected by infrastructure (target Lambda), not request field.
- Legacy QA records may exist and must be normalized to PREPROD on read.
- Existing architecture docs cover affected subsystems; updates are via architecture-update task.

---

## Current Context

- Loaded architecture docs: `INDEX.md`, `deployments.md`, `backend-api.md`, `persistence-model.md`, `infrastructure.md`, `ui-application.md`, `e2e-testing.md`.
- Related active specs: FS-081, FS-082, FS-083.
- Deployment page today uses `use-deployment-page.ts` with parallel calls:
  - `listRevisions`, `listVersions`, `getCurrentDeployments`, `listDeployments`.
- `HttpAdapter.getDeploymentContext()` is currently unimplemented (`featureNotEnabled`).
- Runtime invoke paths currently use HTTP runtime API client and environment base URLs.

---

## Scope

### In Scope

- Canonical environment migration across UI/backend/runtime/persistence/tests/docs.
- SANDBOX deploy from saved version with immutable snapshot + atomic pointer update.
- Promotion path SANDBOX→DEV→PREPROD→PROD using exact snapshot identity/hash.
- Environment-scoped rollback to previously deployed snapshot.
- Runtime contract normalization (`mappingId`, `sourceData`, optional enrichments/context).
- Aggregate `deploy-context` endpoint + deployment page redesign around it.
- Local-only mapping import/migration path for backend mode.
- CORS and error normalization across 2xx/4xx/5xx for deployment-related API paths.
- Server-side preview using control-plane API -> preview Lambda -> environment runtime Lambda direct invoke.

### Out of Scope

- Approval workflow for PROD.
- Mapping editing from deployment page.
- Auto-deploy on save.
- Runtime outbound connector calls.

---

## Non-Goals

- Rebuilding promoted artifacts.
- Arbitrary environment skipping in normal UX.
- Per-mapping runtime Lambda deployments.
- Making browser invoke runtime Lambdas directly.

---

## Relevant Areas

- UI: `ui/src/features/deployments/**/*`, `ui/src/lib/api/*`, `ui/src/features/home/**/*`, `ui/src/features/projects/**/*`
- Backend/runtime: `src/lambda/deployment/**/*`, `src/lambda/runtime/**/*`, `src/lambda/mapping/preview-mapping.ts`, `src/lambda/shared/*`
- Persistence: `src/lib/persistence/**/*`
- Infra: `template.yaml`
- Tests: `tests/lambda/deployment/**/*`, `tests/lambda/runtime/**/*`, `tests/integration/persistence/**/*`, UI deployment tests

---

## Dependencies / Blockers

- None requiring product-owner decisions.
- Missing/partial infrastructure implementation is execution scope, not a planning blocker.

---

## Constraints

- Active snapshot pointer must update last and conditionally.
- Runtime must reject cross-environment override behavior.
- Backend mode deployment must not depend on browser-local mapping state.
- Physical infra names are stack outputs/parameters; spec uses logical resource contracts.

---

## Repository Discovery Findings (Resolved Q1/Q2/Q3/Q4/Q5)

### Q1 — Deployment-page load failure finding

Current Deployment Page request set (on mount):
- `GET /mappings/{mappingId}/revisions`
- `GET /mappings/{mappingId}/versions`
- `GET /mappings/{mappingId}/deployments/current`
- `GET /mappings/{mappingId}/deployments?environment=...`

Effective URL generation:
- `trimTrailingSlash(VITE_API_URL) + path` (from `http-client.ts`).

Finding:
- UI calls `/mappings/{mappingId}/revisions` (via `HttpAdapter.listRevisions`), but this route is not wired in `template.yaml` (versions/deployments routes exist; revisions route missing).
- This is a concrete backend contract/route mismatch, not purely a product CORS decision issue.
- GET load path likely fails before deployment-context work even starts because `Promise.all` rejects if one request fails.

Required implementation acceptance for this finding:
1. Root cause documented with exact request/response evidence (HAR + API logs) before UI completion.
2. Preflight succeeds where applicable.
3. 2xx responses include valid CORS headers.
4. 4xx/5xx responses include valid CORS headers.
5. UI displays normalized backend error (with request id) instead of generic network-only error.
6. Regression test covers deployment-context request handling and failure normalization.

### Q2 — Local-only persistence and migration finding

Adapter behavior:
- Backend mode uses `HttpAdapter` when `VITE_API_URL` is set.
- `HttpAdapter extends LocalStorageAdapter`; non-overridden behaviors can still be local-only.

Current classification:
1. **Already backend persisted:** projects, schemas, mappings, versions, deployments, value tables through HTTP APIs.
2. **Backend persisted but missing deployment-required normalization:** legacy mapping/env/schema/enrichment fields requiring migration/backfill.
3. **Browser-only persisted:** mapping drafts, test cases, comparison snapshots, session-scoped test results/auto-map suggestions (and LocalStorageAdapter entities in offline mode).
4. **Demo/seed data not auto-migrated:** local adapter bootstrap/demo records.
5. **Invalid legacy records:** records failing normalization/dependency checks requiring user intervention/reporting.

Decision:
- In backend mode, deployable mappings must be fully retrievable from backend persistence.
- No silent startup migration of browser data.
- Provide explicit one-time import/migration utility with summary: imported/skipped/failed; idempotent behavior.

### Q3 — Existing runtime contract finding

Current runtime execute request (actual):
```ts
{ mappingId: string, sourceData: object, externalSources?: Record<string, unknown> }
```
Current runtime execute response (actual):
```ts
{ mappingId, snapshotId, output, diagnostics, stats }
```

Canonical request for FS-100:
```ts
interface MappingRuntimeRequest {
  mappingId: string;
  sourceData: unknown;
  enrichmentInputs?: Record<string, unknown>;
  executionContext?: { correlationId?: string; trace?: boolean };
}
```

Canonical response for FS-100:
```ts
type MappingRuntimeResponse =
  | { outputFormat: 'json'; output: Record<string, unknown> | unknown[]; diagnostics: Diagnostic[]; metadata: RuntimeExecutionMetadata }
  | { outputFormat: 'xml'; output: string; diagnostics: Diagnostic[]; metadata: RuntimeExecutionMetadata };
```

Delta + compatibility rule:
- Existing `{ mappingId, sourceData }` remains valid subset; do not break callers.
- Support `externalSources` compatibility alias while canonicalizing to `enrichmentInputs` in handler contract layers.
- Do not silently change response shape for existing runtime consumers; transition with explicit compatibility adapter mode and migrate known callers in same release.

### Q4 — Invocation path decision (resolved)

Decided architecture for this spec:
- **Step Functions:** direct environment-specific Lambda invocation.
- **Server-side preview:** browser -> control-plane API Gateway -> preview Lambda -> direct invoke target runtime Lambda.
- **Deploy/promote:** artifact/pointer operations, not runtime execution calls.
- **Runtime API Gateway endpoint:** optional external HTTP surface only.

Migration note from current repository:
- Current `runtime-api-client` is HTTP API based. FS-100 migrates control-plane runtime invocation to direct Lambda invoke for Step Functions and preview paths while retaining optional HTTP surface where required.

### Q5 — Existing infrastructure findings

| Environment | Account/Region | Runtime Lambda | Active pointer store | Snapshot store | Schema store | Deployment role | Preview invoke role |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SANDBOX | Discovered control-plane env; runtime resources for SANDBOX not implemented in current template | Not implemented | Not implemented | Not implemented | Not implemented | Not implemented | Not implemented |
| DEV | Parameterized by `EnvironmentName=dev` in runtime stack | Implemented (`Runtime*Function` set) | Implemented (`RuntimeActiveSnapshotsTable`) | Implemented (`RuntimeArtifactsBucket` + `SnapshotsPrefix`) | Implemented (`SchemasPrefix` in runtime artifacts bucket) | Not implemented as explicit narrow deployment-writer role in current template | Not implemented as explicit preview-only invoke role |
| PREPROD | Parameterized by `EnvironmentName=preprod` | Implemented (same stack pattern) | Implemented | Implemented | Implemented | Not implemented (explicit role missing) | Not implemented (explicit role missing) |
| PROD | Parameterized by `EnvironmentName=prod` | Implemented (same stack pattern) | Implemented | Implemented | Implemented | Not implemented (explicit role missing) | Not implemented (explicit role missing) |

Logical resource contract for FS-100 (authoritative):
- `ActiveSnapshots`
- `DeploymentRecords`
- `SnapshotArtifacts`
- `SchemaArtifacts`
- `KeyRaRuntimeRole`
- `KeyRaDeploymentWriterRole`
- `KeyRaRuntimeInvokeRole`

Physical names remain stack parameters/outputs.

---

## Proposed Behavior

### User Flow

1. User opens existing mapping with saved version.
2. Deployment page loads via aggregate `deploy-context`.
3. User deploys saved version to SANDBOX.
4. KeyRa creates immutable snapshot, verifies artifact readability, writes deployment record, then updates SANDBOX active pointer.
5. Step Function invokes SANDBOX runtime Lambda directly; runtime resolves active snapshot and returns transformed output.
6. User promotes snapshot DEV→PREPROD→PROD sequentially without rebuilding.
7. User can rollback each environment to previously deployed snapshot.
8. Preview invokes selected environment runtime Lambda through control-plane preview service.

### System Behavior

1) **Canonical environment model**
- SANDBOX deploy; DEV/PREPROD/PROD promote; rollback per environment.
- QA is compatibility-only for historical read normalization.

2) **Control plane vs runtime plane**
- Control plane: mapping persistence, versioning, deploy orchestration, readiness, history, runtime health summary.
- Runtime plane: execute using environment-local active snapshot/artifacts only.

3) **Runtime request/response and failures**
- Canonical contracts above.
- Structured fatal errors: `MappingNotDeployed`, `ArtifactNotFound`, `ArtifactCorrupt`, `EngineVersionUnsupported`, `MissingEnrichmentInput`, `SerializationFailed`, `SnapshotInvalid`.
- Warnings returned in successful diagnostics.

4) **Atomic deployment semantics**
- Load saved version -> validate -> resolve schema artifacts -> build snapshot/hash -> write artifacts -> verify read/hash -> write deployment record -> update active pointer last.
- Idempotency key required for deploy/promote/rollback.

5) **Promotion semantics**
- Promote only sequentially from preceding environment active snapshot.
- Preserve snapshot identity/hash.
- No editor-state rebuild.

6) **Rollback semantics**
- Pointer-only reassignment to previously deployed snapshot in selected environment.
- No new snapshot generation; no runtime code redeploy.

7) **Schema policy**
- SANDBOX may run unpublished schema artifacts but marks snapshot non-promotable.
- DEV+ requires immutable/locked schema provenance.

8) **Deployment-context API**
- `GET /mappings/:mappingId/deploy-context` becomes canonical page bootstrap and replaces multi-request load path.

9) **Error handling and CORS**
- Normalize error envelopes with request ids.
- Ensure CORS headers present on success and all error paths, including gateway-generated 4xx/5xx.

10) **Invocation architecture**
- Step Functions direct Lambda invoke per environment.
- Preview Lambda direct invokes target environment runtime Lambda.
- API Gateway runtime surface optional, not required for AWS-internal calls.

---

## Acceptance Examples

### AE-01 — Deploy existing saved version to SANDBOX
Given existing saved mapping version; when deploy to SANDBOX; then immutable snapshot stored and active pointer updates atomically last.

### AE-02 — SANDBOX runtime executes via Step Functions path
Given active SANDBOX snapshot; when Step Function invokes SANDBOX runtime Lambda; then runtime returns output/diagnostics/metadata.

### AE-03 — Promotion preserves artifact identity
Given active SANDBOX snapshot; when promoted to DEV; then DEV uses same snapshot identity/hash.

### AE-04 — Rollback re-points pointer without rebuild
Given prior snapshot in environment history; when rollback executed; then pointer updates to prior snapshot only.

### AE-05 — Missing required enrichment fails
Given required enrichment declaration; when omitted; then runtime fails with `MissingEnrichmentInput`.

### AE-06 — Missing optional enrichment warns and succeeds
Given optional enrichment declaration; when omitted; then runtime succeeds with warning diagnostic.

### AE-07 — Deployment page loads from deploy-context
Given deployment page open; when deploy-context request succeeds; then page renders four-stage pipeline from one aggregate payload.

### AE-08 — BA-friendly normalized technical errors
Given deployment-context request fails; when UI renders error; then concise message + expandable technical details with request id are shown.

### AE-09 — QA historical records normalize to PREPROD
Given historical QA records; when read by APIs/UI; then surfaced as PREPROD while preserving history fidelity.

### AE-10 — Idempotency prevents duplicate operations
Given repeated command with same idempotency key; when retried; then same operation result returned without duplicate mutation.

### AE-11 — Non-promotable schema state blocks DEV+
Given SANDBOX snapshot with unpublished/mutable schema provenance; when promote attempted; then promotion blocked with explicit readiness reason.

### AE-12 — Deterministic end-to-end fixture
Given fixture mapping and payloads; when deploy/execute/redeploy/rollback/promote sequence runs; then outputs and snapshot identity assertions pass deterministically.

### AE-13 — Deployment-route root cause captured and regression-protected
Given current load failure; when discovery and fix are completed; then exact failing request evidence is documented and regression tests cover deploy-context route/error/CORS behavior.

---

## Open Questions

- none

---

## Verification Strategy

- Backend/runtime tests:
  - deploy/promotion/rollback atomicity, idempotency, pointer conditional writes
  - runtime contract + error taxonomy + compatibility adapter behavior
  - direct-invoke preview/runtime path behavior
- API/CORS tests:
  - deployment-context success + 4xx + 5xx headers and normalized envelopes
- Migration/import tests:
  - explicit import utility behavior (imported/skipped/failed), idempotency, no silent startup migration
- UI tests:
  - four-stage order and actions
  - deploy-context-driven load and normalized error display
- E2E acceptance fixture:
  - SANDBOX deploy/execute -> update/deploy -> rollback -> promote -> DEV parity

---

## Task Generation Notes

- Keep backend/runtime/infra/migration/architecture tasks on `Agent: task`.
- Keep UI-only tasks on `Agent: ui-task`.
- SANDBOX executable path and deployment-context route parity precede full UI polish.

---

## Change Log

- Rev 1 — 2026-06-25
  - Initial draft.
- Rev 2 — 2026-06-25
  - Resolved Q1–Q5 with repository-discovery findings and explicit architecture decisions.
  - Added existing contract finding, infrastructure findings table, direct-invoke decision, and AE-13 regression requirement.
  - Converted open questions into implementation scope; no product-owner questions remain.
