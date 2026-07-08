# SPEC

## Title

Deployment Management Completion, Environment Simplification, and Runtime-Safe Deployment Projections

---

## ID

FS-106

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-07-06  
Last Updated: 2026-07-07  
Type: cross-cutting

---

## Status

refining

---

## Revision

Rev: 2

---

## Summary

FS-106 completes KeyRa deployment management with a dedicated global deployment overview, completed project deployment experience, and an upgraded mapping deployment action surface while enforcing the final runtime environment model: `DEV -> PREPROD -> PROD`.

This revision introduces an explicit control-plane `DeploymentSummaries` projection table to support correct global filtering/sorting/pagination across all mappings, separates operation state dimensions (type/status/stage) from persistent deployment freshness and promotion state, and codifies runtime-vs-control-plane authority with mandatory reconciliation.

The design keeps immutable artifact promotion and pointer-based rollback semantics, removes revision-based deployment from public contracts, defines self-contained artifact packaging and deterministic hashing, and adds implementation-ready API/security/retention/observability/testing contracts.

---

## Problem

The prior FS-106 draft direction was correct but under-specified for implementation in several critical areas:

- Aggregate deployment listing strategy (mapping-first paging) could not guarantee globally correct filtering/sorting/pagination.
- Lifecycle/state model mixed operation progress, outcomes, and persistent deployment summary states.
- Runtime authority vs control-plane projection behavior was not explicit enough for timeout/partial-failure reconciliation.
- Mutation API contracts were not concrete enough (requests, responses, async status polling, idempotency).
- Deployment contract still implicitly overlapped with legacy revision-deploy support.
- Artifact identity/packaging and retention implementation details were not concrete enough for deterministic execution and rollback.
- Naming and plane boundaries needed stronger control-plane vs runtime distinction.

---

## Goal

Provide an implementation-ready deployment specification that requires no additional architecture decisions during task execution by defining:

1. Final user journeys and page hierarchy (`/deployments -> project deployments -> mapping deployment`).
2. Runtime authority and control-plane projection boundaries.
3. Projection-backed aggregate read model with deterministic filter/sort/pagination behavior.
4. Complete async mutation/operation API contracts.
5. Version-only deployability rules.
6. Self-contained immutable artifact contract and canonical hashing process.
7. Promotion/rollback/reconciliation/retention workflows.
8. Actor identity contract that works with or without full authentication rollout.
9. Plane-specific resource naming and cross-account invocation model.
10. Deployment-focused metrics, tests, and acceptance criteria.

---

## Assumptions

- Branch context: `feature/dev-checkpoint-2`.
- Existing architecture documents cover all impacted subsystems; no new architecture document bootstrap is required.
- Mapping engine behavior and parity guarantees remain unchanged.
- **Greenfield runtime deployment resources assumption:** DEV, PREPROD, and PROD KeyRa deployment resources are provisioned as greenfield resources for this scope. No KeyRa deployment artifacts/active pointers/histories are migrated from existing infrastructure. Non-KeyRa resources in those AWS accounts are unaffected.

---

## Current Context

Repository grounding (unchanged from Rev 1, now refined):

- Project deployment page exists but is placeholder (`Coming Soon`).
- No top-level `/deployments` route/page yet.
- Deployment UI/backend still contain SANDBOX-era structures.
- Existing deployment handlers are mapping-scoped, not aggregate projection-backed.
- Template/config include legacy environment/config naming drift.

Active specs loaded and considered: FS-019, FS-101, FS-102, FS-103, FS-104, FS-105.

---

## Scope

### In Scope

- Dedicated top-level global deployment page `/deployments`.
- Fully implemented project deployment page `/projects/{projectId}/deployments`.
- Mapping deployment page remains action surface with enhanced flows.
- Canonical environment model: `DEV | PREPROD | PROD` only.
- Control-plane `DeploymentSummaries` projection table and indexes.
- Async operation model with `operationId` polling and refresh recovery.
- Version-only DEV deployment; promotion-only PREPROD/PROD.
- Self-contained immutable artifact bundle/hash contract.
- Runtime activation authority + control-plane reconciliation.
- Scheduled retention cleanup workflow with protection rules.
- Actor metadata contract (`USER | SERVICE | DEVELOPMENT`).
- Plane-specific resource naming and cross-account invocation model.
- UI/API/Lambda/Step Functions/DynamoDB/S3/IAM/test/doc changes.

### Out of Scope

- SANDBOX data migration.
- Mapping Editor deployment actions.
- Presigned-pull artifact transfer or cross-account S3 replication in V1.
- EventBridge callback model in V1.
- PrivateLink/VPC-to-VPC private networking in V1.

---

## Non-Goals

- Redesign mapping authoring workflows.
- Change save/versioning semantics outside deployment eligibility rules.
- Introduce deployment action controls into global/project overview tables.

---

## Relevant Areas

- UI: `ui/src/routes`, `ui/src/features/deployments`, `ui/src/lib/api`, `ui/src/lib/query`, `ui/src/lib/types`, related tests.
- Backend/Lambda: `src/lambda/deployment/*`, `src/lambda/mapping/preview-mapping.ts`, operation handlers/status handlers.
- Persistence: `src/lib/persistence/deployments.ts`, `deployment-orchestrations.ts`, `types.ts`, new projection store module.
- Infra: `template.yaml`, runtime/control-plane IAM and API auth resources.
- Docs: `forge/architecture/*.md`, `specs/PRODUCT-TECHNICAL.md`.

---

## Dependencies / Blockers

- Architecture update task must complete first (T-01).
- Projection and operation contracts should be implemented before UI feature rollout.
- Cross-account IAM and runtime API `AWS_IAM` auth must be established before promotion hardening.

---

## Constraints

Locked product decisions (non-negotiable in FS-106):

- SANDBOX is removed.
- DEV starts from scratch with no SANDBOX migration.
- Environments are DEV, PREPROD, PROD.
- S3 buckets are:
  - `kbx-b2b-keyra-dev`
  - `kbx-b2b-keyra-preprod`
  - `kbx-b2b-keyra-prod`
- Lambda/DynamoDB physical names do not contain DEV/PREPROD/PROD suffixes.
- Version selection is only for DEV deployment.
- PREPROD/PROD are promotion-only.
- Promotion reuses exact immutable artifact bytes and hash.
- Rollback can target any retained eligible historical artifact.
- Global/project pages are overview + drill-down only.
- Mapping deployment page remains primary action surface.

---

## Proposed Behavior

### 1) Runtime authority vs control-plane authority

#### Runtime authority (per environment account)

Each runtime owns and is authoritative for:

- local immutable artifact bytes,
- active artifact pointer,
- runtime-local deployment history,
- runtime operation status,
- actual execution behavior.

The runtime active pointer is the source of truth for what executes.

#### Control-plane authority (DEV account)

Control plane owns:

- mapping versions and dependency metadata,
- deployment operations orchestration,
- aggregate `DeploymentSummaries` projection,
- user-facing aggregate deployment history views,
- audit coordination and reconciliation workflows.

`DeploymentSummaries` is eventually consistent UI/read-model data; it is not execution authority.

---

### 2) Deployment summary projection read model (required)

A dedicated control-plane table is required.

#### Table: `integrations-keyra-deployment-summaries`

Recommended fields:

```text
mappingId
projectId
projectName
mappingName
latestVersion
latestVersionCreatedAt

devActiveArtifactId
devActiveVersion
devFreshness
devLastOperationStatus

preprodActiveArtifactId
preprodActiveVersion
preprodFreshness
preprodLastOperationStatus

prodActiveArtifactId
prodActiveVersion
prodFreshness
prodLastOperationStatus

promotionState
attentionState
activeOperationId
lastActivityAt
lastActorId
lastActorDisplayName
updatedAt
```

#### Indexes

```text
GlobalActivityIndex
PK: globalPartition
SK: lastActivityAt

ProjectActivityIndex
PK: projectId
SK: lastActivityAt

AttentionIndex
PK: attentionState
SK: lastActivityAt
```

#### Projection update triggers

Projection is updated after:

- mapping creation,
- mapping version creation,
- DEV deployment accepted/succeeded/failed,
- PREPROD promotion accepted/succeeded/failed,
- PROD promotion accepted/succeeded/failed,
- rollback accepted/succeeded/failed,
- retry accepted/succeeded/failed,
- mapping deletion/archival,
- reconciliation events.

#### Projection failure handling

If runtime activation succeeds but projection update fails:

- operation remains non-terminal until reconciliation attempt,
- runtime remains authoritative for active artifact,
- reconciliation worker repairs projection and finalizes operation state,
- mismatch metric/audit event emitted.

---

### 3) Canonical domain state model (separated dimensions)

#### OperationType

```text
DEPLOY
PROMOTE
ROLLBACK
RETRY
```

#### OperationStatus

```text
QUEUED
RUNNING
SUCCEEDED
FAILED
TIMED_OUT
```

#### OperationStage

```text
VALIDATING_REQUEST
RESOLVING_VERSION
BUILDING_ARTIFACT
VALIDATING_ARTIFACT
TRANSFERRING_ARTIFACT
ACTIVATING_ARTIFACT
VERIFYING_RUNTIME
UPDATING_PROJECTION
FINALIZING
```

#### DeploymentFreshness (per environment)

```text
NOT_DEPLOYED
CURRENT
STALE
```

#### PromotionState

```text
NOT_APPLICABLE
ALIGNED
AVAILABLE
BLOCKED
```

#### ActivationReason (history events)

```text
DEPLOY
PROMOTE
ROLLBACK
```

Notes:

- `ROLLED_BACK` is not a freshness state.
- UI may render friendlier labels (e.g., show “Outdated” for `STALE`).

---

### 4) Version-only deployability rules

Public deployment contracts remove revision deployment.

#### Deployability rules

- Draft revisions are testable via preview/Test Lab only.
- Deployment requires immutable mapping version.
- DEV deployment accepts version number only.
- PREPROD/PROD receive only promoted active artifact from previous environment.
- New deployment history references mapping version only.

#### Eligible version definition

A version is eligible when all are true:

- exists,
- immutable,
- version config snapshot available,
- pinned dependencies available,
- mapping validation passes,
- schema/value-map dependency validation passes,
- engine/DSL compatibility supported,
- not invalid/incomplete/deleted.

Eligibility is evaluated from selected version pinned state, never from current draft state.

---

### 5) Mutation and operation API contracts

All mutating requests are async and return `202 Accepted`.
All mutation requests require `Idempotency-Key` header.

#### DEV deploy

```http
POST /mappings/{mappingId}/deployments
Idempotency-Key: {client-generated-key}
```

Request:

```json
{
  "version": 4,
  "targetEnvironment": "DEV",
  "expectedActiveArtifactId": "artifact-3",
  "reason": "Validate revised customer-code handling"
}
```

First deploy variant:

```json
{
  "version": 4,
  "targetEnvironment": "DEV",
  "expectedActiveArtifactId": null
}
```

#### Promotion

```http
POST /mappings/{mappingId}/promotions
Idempotency-Key: {client-generated-key}
```

```json
{
  "sourceEnvironment": "DEV",
  "targetEnvironment": "PREPROD",
  "expectedSourceArtifactId": "artifact-4",
  "expectedTargetArtifactId": "artifact-2",
  "reason": "Validated in DEV"
}
```

#### Rollback

```http
POST /mappings/{mappingId}/rollbacks
Idempotency-Key: {client-generated-key}
```

```json
{
  "environment": "PROD",
  "targetArtifactId": "artifact-7",
  "expectedActiveArtifactId": "artifact-9",
  "reason": "Customer validation failure"
}
```

#### Retry

```http
POST /deployment-operations/{operationId}/retry
Idempotency-Key: {client-generated-key}
```

Creates new `operationId` and sets `retryOfOperationId`.

#### Accepted response (all mutations)

```json
{
  "operationId": "operation-123",
  "operationType": "DEPLOY",
  "status": "QUEUED",
  "statusUrl": "/deployment-operations/operation-123",
  "requestedAt": "2026-07-07T12:00:00Z"
}
```

#### Operation status API

```http
GET /deployment-operations/{operationId}
```

Response fields:

```text
operationId
mappingId
projectId
operationType
operationStatus
operationStage
sourceEnvironment
targetEnvironment
sourceVersion
artifactId
artifactHash
requestedBy
requestedAt
startedAt
completedAt
failureCode
failureMessage
retryable
retryOfOperationId
```

UI behavior:

- poll operation status by `operationId`,
- on browser refresh, resume polling from persisted operation reference.

---

### 6) Aggregate read APIs and sorting/filtering

#### Global

```http
GET /deployments
```

Supports filters over full mapping population (not pre-paged subset):

- `projectId`
- `environment`
- `freshness` (`NOT_DEPLOYED|CURRENT|STALE`)
- `attentionState`
- `operationStatus`
- `version`
- `search`
- `pageSize`
- `cursor`

Default sorting:

```text
lastActivityAt DESC
projectName ASC
mappingName ASC
```

#### Project

```http
GET /projects/{projectId}/deployments
```

Same semantics, project scoped.

These APIs read from `DeploymentSummaries` projection indexes.

---

### 7) Immutable artifact packaging and hashing contract

#### Primary artifact model (V1)

Use **self-contained runtime bundle** (primary model).

Bundle contains:

```text
manifest
mapping config
compiled or normalized DSL
source schema runtime representation
target schema runtime representation
enrichment schema runtime representations
value-map snapshots
constants/defaults
engine compatibility metadata
```

#### Artifact identity rules

- `artifactHash` computed from canonical serialized runtime bundle bytes.
- Canonical serialization is deterministic.
- Environment, actor, reason, timestamps are deployment metadata only (not hashed).
- `artifactId` is content-addressed from hash or permanently bound to that hash.
- Same `artifactId` must never reference different bytes.
- Promotion transfers identical artifact bytes/hash/identity.
- Environment may store different S3 object key paths for local copy; identity/hash unchanged.
- Rollback never rebuilds artifact.

#### Manifest minimum fields

```text
artifactId
artifactHash
mappingId
mappingVersion
engineVersion
dslVersion
bundleFormatVersion
createdAt
createdByActor
sourceSchemaRefs[]
targetSchemaRef
enrichmentSchemaRefs[]
valueMapRefs[]
constantsHash
compiledDslHash
```

#### Validation steps

At ingest/activation:

1. validate manifest schema + required fields,
2. recompute canonical hash and match `artifactHash`,
3. verify dependency payload presence/consistency,
4. reject if bytes/hash mismatch.

---

### 8) Promotion and rollback flows

#### Promotion flow

1. Validate source/target env pair (`DEV->PREPROD`, `PREPROD->PROD`).
2. Validate expected source and expected target active artifacts.
3. Reuse source artifact bytes/identity.
4. Transfer to target runtime and activate pointer.
5. Persist history with `activationReason=PROMOTE`.
6. Update projection and finalize operation.

#### Rollback flow

1. Validate target historical artifact eligibility.
2. Validate expected current active artifact.
3. Repoint active pointer in target runtime to retained artifact.
4. Append history with `activationReason=ROLLBACK`.
5. Update projection and finalize operation.

---

### 9) Reconciliation workflow

Reconciliation is required for ambiguous or partial outcomes.

#### Trigger conditions

- runtime activation succeeded but control-plane timed out,
- operation stuck in `RUNNING` or `TIMED_OUT` without terminal projection update,
- projection mismatch detected.

#### Reconciliation actions

1. Query runtime operation status and active pointer endpoint.
2. Compare against control-plane operation + projection state.
3. Update operation to terminal status if runtime authoritative outcome found.
4. Repair `DeploymentSummaries` row.
5. Emit audit + mismatch metrics.

#### Scheduled reconciliation

A scheduled control-plane reconciliation job runs for stuck/ambiguous operations and mismatch repair.
Target: reconcile mismatch within 5 minutes.

---

### 10) Retention cleanup workflow

Do not use native S3 lifecycle for per-mapping retention counts.

Use scheduled cleanup Lambda/Step Functions:

1. list successful activations by mapping/environment,
2. sort by activation time desc,
3. apply retention counts (DEV 20, PREPROD 20, PROD 50),
4. exclude protected artifacts,
5. delete eligible local runtime objects,
6. mark related history entries not rollback-eligible,
7. emit cleanup metrics and audit events.

#### Artifact protection conditions

Protect artifact when:

- active in that environment,
- referenced by in-progress operation,
- inside rollback retention window,
- required as currently active promotion source.

Important nuance:

- environments own separate local artifact copies,
- cleanup may remove obsolete DEV local copy even if same artifact identity is active in PROD.

S3 lifecycle remains allowed only for temporary/transient objects (failed staging uploads, multipart cleanup, etc.).

---

### 11) Actor identity contract

Do not assume full auth rollout in this spec.

Actor metadata contract:

```text
actorType: USER | SERVICE | DEVELOPMENT
actorId: string
actorDisplayName?: string
actorEmail?: string
```

Behavior:

- authenticated user actions -> `USER`,
- reconciliation/cleanup automation -> `SERVICE`,
- local/dev unauthenticated mode -> `DEVELOPMENT` with explicit label,
- never silently persist generic `system` for user-initiated actions.

---

### 12) Plane-specific AWS resource naming

No Lambda/DynamoDB physical name contains DEV/PREPROD/PROD suffixes.
Control-plane and runtime responsibilities must be distinguishable by name.

#### Lambda examples

```text
kbx-integrations-keyra-control-list-deployments
kbx-integrations-keyra-control-deploy-mapping
kbx-integrations-keyra-control-promote-deployment
kbx-integrations-keyra-control-rollback-deployment
kbx-integrations-keyra-control-reconcile-deployments

kbx-integrations-keyra-runtime-ingest-artifact
kbx-integrations-keyra-runtime-activate-artifact
kbx-integrations-keyra-runtime-rollback-artifact
kbx-integrations-keyra-runtime-get-operation
kbx-integrations-keyra-runtime-execute-mapping
```

#### DynamoDB examples

```text
integrations-keyra-deployment-operations
integrations-keyra-deployment-summaries
integrations-keyra-deployments
integrations-keyra-deployment-current

integrations-keyra-runtime-active-snapshots
integrations-keyra-runtime-deployment-history
integrations-keyra-runtime-operation-status
```

#### Resource placement by plane

- **DEV control plane:** operation orchestration, projection table, aggregate APIs, reconciliation workers, audit coordination.
- **DEV runtime:** runtime ingest/activate/rollback/status/execute resources and local runtime deployment tables.
- **PREPROD runtime:** same runtime resource names as DEV runtime in PREPROD account.
- **PROD runtime:** same runtime resource names as DEV runtime in PROD account.

---

### 13) Final cross-account invocation model (V1)

Selected model:

1. DEV control-plane orchestrator assumes environment-specific runtime deployment role.
2. Assumed role calls runtime API Gateway endpoint.
3. Runtime endpoint uses `AWS_IAM` authorization.
4. Requests are SigV4-signed.
5. Artifact transfer is bounded direct payload push.
6. Runtime persists and activates artifact locally.
7. Runtime exposes operation-status and active-pointer endpoints for reconciliation.

Retained payload limit: **5 MB**.

Explicitly deferred:

- presigned S3 pull,
- cross-account S3 replication,
- EventBridge callbacks,
- PrivateLink,
- VPC-to-VPC networking.

---

### 14) Deployment diff behavior

What’s Changing diff remains required and becomes artifact/version aware.

Comparison basis:

- DEV deploy: selected mapping version vs active DEV artifact manifest.
- PREPROD promote: active DEV artifact vs active PREPROD artifact.
- PROD promote: active PREPROD artifact vs active PROD artifact.
- Rollback: active artifact vs selected rollback artifact.

Diff categories:

- mapping rule changes,
- source/target schema version changes,
- enrichment schema changes,
- value-map changes,
- constants/default changes,
- engine/DSL compatibility changes.

Diff source must use immutable version/artifact manifests, never editable draft state.

---

### 15) UI page hierarchy and behavior

#### Global `/deployments`

- one row per mapping including never deployed,
- overview/drill-down only,
- no mutating actions in table rows,
- failed/attention filters and summary counters,
- default sort by last activity desc.

#### Project `/projects/{projectId}/deployments`

- same read model/status components as global page,
- project summary + counts,
- drill-down to mapping deployment.

#### Mapping deployment page

- primary mutating action surface,
- DEV version selector (stable across refresh),
- promotion/rollback controls,
- operation polling and refresh resume,
- clear separation between operation failure and freshness state.

No deployment actions in Mapping Editor.

---

## Acceptance Examples

### AE-01 — Global filter correctness across entire population

**Given**
- 5,000 mappings across projects; failed mappings spread across pages.

**When**
- User filters global view by failed attention state.

**Then**
- Results include failed mappings across full population, not only a preselected mapping page.

### AE-02 — DEV deployment accepts immutable version only

**Given**
- Mapping version `v4` exists and is eligible.

**When**
- User requests DEV deployment for `v4`.

**Then**
- Mutation accepted; no revision/draft source accepted.

### AE-03 — Revision source rejected by new contracts

**Given**
- Client sends legacy `sourceType: revision` style payload.

**When**
- Request hits new deploy mutation endpoint.

**Then**
- Request is rejected with validation error.

### AE-04 — Immutable promotion preserves bytes/hash

**Given**
- DEV active artifact has hash `H1` and canonical bytes `B1`.

**When**
- Promoted to PREPROD and then PROD.

**Then**
- PREPROD/PROD active artifacts use same bytes/hash/identity (`B1/H1`).

### AE-05 — Metadata does not change artifact identity

**Given**
- Two deployments use same artifact with different actor/reason/time metadata.

**When**
- Artifact identity is evaluated.

**Then**
- `artifactId`/`artifactHash` remain unchanged.

### AE-06 — Timed-out request reconciles from runtime status

**Given**
- Runtime activation succeeded but control-plane request timed out.

**When**
- Reconciliation runs.

**Then**
- Operation/projection become consistent with runtime authority.

### AE-07 — Projection failure repaired

**Given**
- Runtime activation success and projection update failure.

**When**
- Scheduled reconciliation executes.

**Then**
- Projection is repaired and mismatch is audited/metric-emitted.

### AE-08 — Browser refresh resumes operation polling

**Given**
- Deploy operation in `RUNNING` state and browser refresh.

**When**
- User reopens mapping deployment page.

**Then**
- UI resumes polling by `operationId` and shows updated status within 5 seconds.

### AE-09 — Rollback reason required

**Given**
- User initiates rollback without reason.

**When**
- Mutation request is validated.

**Then**
- Request is rejected; reason is mandatory.

### AE-10 — PROD promotion reason required

**Given**
- User initiates PREPROD->PROD promotion without reason.

**When**
- Mutation request is validated.

**Then**
- Request is rejected; reason is mandatory.

### AE-11 — Cleanup protection and local-copy independence

**Given**
- Artifact identity active in PROD but obsolete in DEV.

**When**
- DEV cleanup runs.

**Then**
- DEV local copy may be removed if unprotected in DEV; PROD local copy remains.

### AE-12 — No executable contract accepts removed environments

**Given**
- Mutations/config/tests use environment values.

**When**
- Build/test validation runs.

**Then**
- No new executable contract accepts SANDBOX/QA/STAGING.

---

## Open Questions

- none

Resolved in Rev 2:

- Sorting: `lastActivityAt DESC, projectName ASC, mappingName ASC`.
- Reason policy:
  - DEV deployment reason optional,
  - PREPROD promotion reason optional,
  - PROD promotion reason required,
  - rollback reason required,
  - retry reason optional.

---

## Verification Strategy

### Scale assumptions for performance targets

Initial expected scale for acceptance targets:

- up to 5,000 mappings total,
- up to 200 projects,
- up to 100 mappings per project page typical,
- moderate concurrent operator activity (< 50 concurrent active deployment operations).

### Supporting metrics and targets

- `GET /deployments` p95 < 1.5s at expected scale.
- `GET /projects/{projectId}/deployments` p95 < 1.0s.
- Operation state visible after refresh within 5s.
- Runtime/projection mismatch reconciled within 5 min.
- Track:
  - time to identify failed deployment,
  - median time to successful rollback,
  - operation-refresh restore success rate,
  - mismatch count,
  - failure rate by environment/stage,
  - conflict rate,
  - % PROD promotions followed by rollback within 24h.

### Test strategy

#### Unit

- state model separation (type/status/stage/freshness/promotion).
- eligible-version validation.
- artifact canonical serialization/hash invariants.
- retention selection/protection.
- actor contract validation.

#### Integration

- async mutation + operation polling semantics.
- reconciliation of timeout/projection failure.
- global/project filtering correctness across full population.
- promotion identity invariants.
- rollback conflict handling.

#### UI

- global/project table filters/pagination/sorting/drill-down.
- mapping action flows with reason validation and polling resume.
- operation failure vs freshness distinction.

#### Infrastructure

- plane-specific naming validations.
- `AWS_IAM` runtime endpoint auth and assume-role flow.
- greenfield provisioning checks.

### Removed-environment repository gate

CI validation is scoped to executable/config paths only:

```text
src/
ui/src/
tests/
template.yaml
samconfig.toml
active deployment scripts
active runtime configuration
```

Historical documents/changelogs may mention legacy terms when marked as legacy context.

---

## Acceptance Criteria

1. Global and project status/sorting filters operate across full mapping population, not preselected pages.
2. Deployment summaries update after successful activation.
3. Runtime remains authoritative source for active artifact.
4. Failed projection updates are repaired by reconciliation.
5. Timed-out requests reconcile via runtime operation/pointer status.
6. New deploy APIs reject revision source contracts.
7. DEV deployment accepts immutable mapping versions only.
8. Canonical artifact bytes/hash are unchanged through DEV->PREPROD->PROD.
9. Environment-specific metadata does not alter artifact identity.
10. Cleanup never deletes active or in-use local artifact.
11. Cleanup may remove obsolete DEV local artifact even if same artifact identity is active in PROD.
12. Global status filtering remains correct across pagination.
13. Resource names distinguish control-plane vs runtime responsibility.
14. Browser refresh resumes polling via operation ID.
15. PROD promotion requires reason.
16. All rollbacks require reason.
17. Deployment diff compares immutable versions/artifacts.
18. UI distinguishes operation failure from deployment freshness.
19. No new executable contract accepts SANDBOX/QA/STAGING.
20. Actor metadata distinguishes user/service/development actions.
21. `/deployments` exists as top-level navigation destination.
22. Project deployments page is fully implemented (no placeholder).
23. Mapping page remains only mutation action surface.
24. PREPROD and PROD are promotion-only targets.
25. Rollback may target any retained eligible historical artifact.

---

## Task Generation Notes

- Existing FS-106 tasks require drift review against Rev 2.
- Task decomposition must include explicit workstreams for:
  - projection table + update pipeline,
  - operation API contracts and polling,
  - version-only deployability,
  - artifact bundle/hash implementation,
  - reconciliation worker,
  - cleanup workflow,
  - plane-specific infra naming/auth,
  - UI state model and filters.

---

## Phased Implementation Plan

1. **Phase 1 — Contract and architecture alignment**
   - finalize enums, API contracts, projection schema/indexes, authority model.
2. **Phase 2 — Persistence and operation backbone**
   - deployment operations API + operation polling + idempotency + version-only deploy validation.
3. **Phase 3 — Artifact and runtime flow hardening**
   - self-contained bundle generation/hash validation + immutable promote/rollback flows.
4. **Phase 4 — Projection and reconciliation**
   - projection update handlers + scheduled reconciliation + mismatch telemetry.
5. **Phase 5 — Retention cleanup and protection**
   - scheduled cleanup workflow + rollback eligibility state updates.
6. **Phase 6 — UI completion**
   - global page, project page, mapping page operation UX/polling/diff integration.
7. **Phase 7 — Infra/security and bootstrap**
   - plane-specific naming, IAM/SigV4 model, greenfield provisioning automation.
8. **Phase 8 — Verification and docs**
   - full test matrix, metric dashboards, docs and architecture updates.

---

## Explicit Resource/File Change Inventory

### Replace or significantly refactor

- `ui/src/routes/pages/ProjectDeployments.tsx` (placeholder -> full page)
- `ui/src/features/deployments/hooks/use-deployment-page.ts` (SANDBOX-era assumptions -> operationId polling model)
- `src/lambda/deployment/environment-config.ts` (remove SANDBOX/QA/STAGING executable acceptance)
- `src/lambda/deployment/list-deployments.ts` (projection-backed listing and filter semantics)
- `src/lambda/deployment/get-deployment-context.ts` (align state model and operation references)
- `template.yaml` (plane-specific naming/auth/resource placement updates)

### Remove from active executable contracts

- SANDBOX deployment target acceptance.
- QA compatibility behavior in new executable deploy contracts.
- revision-based deployment request contracts.

### Add

- `DeploymentSummaries` persistence module and table/index definitions.
- aggregate listing handlers for global/project projection reads.
- `GET /deployment-operations/{operationId}` handler.
- reconciliation worker/scheduler.
- retention cleanup worker/scheduler.
- artifact bundle canonical serializer/hash validator module.
- operation-stage aware status derivation module.
- UI operation polling resume store/logic.
- deployment diff service based on immutable manifests.

### Documentation/resources to update

- `forge/architecture/deployments.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/ui-application.md`
- `forge/architecture/persistence-model.md`
- `forge/architecture/infrastructure.md`
- `forge/architecture/INDEX.md`
- `specs/PRODUCT-TECHNICAL.md`

---

## Change Log

- Rev 1 — 2026-07-06
  - Initial FS-106 draft.
- Rev 2 — 2026-07-07
  - Added required deployment-summary projection table/index model and update/reconciliation contracts.
  - Separated operation type/status/stage from freshness/promotion state and history activation reason.
  - Added runtime-vs-control-plane authority model.
  - Added complete mutation and operation APIs with idempotency and 202 response contract.
  - Removed revision deployment from new public contracts and defined eligible-version criteria.
  - Completed immutable artifact bundle/hash/identity contract.
  - Replaced retention strategy with scheduled cleanup workflow and protection rules.
  - Added actor identity contract independent of full auth rollout.
  - Added plane-specific naming/resource placement model.
  - Selected final cross-account invocation contract (assume-role + API Gateway AWS_IAM + SigV4, 5MB push).
  - Added version/artifact-based deployment diff behavior.
  - Resolved sorting and reason-policy decisions and removed open questions.
  - Added expanded acceptance criteria and executable-path-only removed-environment gate.
