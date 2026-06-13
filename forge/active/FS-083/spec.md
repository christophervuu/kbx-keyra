# SPEC

## Title

Define KeyRa control-plane deployment orchestration for remote environment APIs

> **Rev 2 resolves all 6 open questions from Rev 1.** See Design Decisions section and Change Log for details.

---

## ID

FS-083

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-03  
Last Updated: 2026-06-03  
Rev: 2  
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Define how the Sandbox-hosted KeyRa control plane orchestrates deploy, promote, rollback, and server-side preview by calling thin runtime APIs in Dev, Preprod, and Prod accounts. The model preserves immutable snapshot artifacts, same-artifact promotion, environment-local runtime execution, and Save != Deploy UX semantics. This spec introduces the control-plane orchestration contracts, status/history model, retry/error policy, and Deployment Page model changes needed to support remote runtime API calls without cross-account role assumption.

---

## Problem

Current deployment architecture establishes snapshot semantics and multi-account runtime direction, but it does not yet define a complete control-plane orchestration contract for remote environment APIs. Missing details include snapshot construction payloads, remote API request/response contracts, orchestration status transitions, retry/failure expectations, and how deployment/promote/rollback/preview events are represented in control-plane backend and Deployment Page UI models. Without this, implementation risks inconsistent behavior across environments and non-deterministic user feedback.

---

## Goal

Provide a deterministic orchestration spec for control-plane initiated deploy/promote/rollback/server-preview across runtime environment APIs that:
- preserves immutable snapshot lifecycle and same-artifact promotion,
- keeps runtime execution environment-local,
- defines control-plane status/history tracking and error/retry semantics,
- defines environment configuration contracts in settings/config,
- and updates Deployment Page behavior/model without violating deliberate environment-based deployment UX.

---

## Assumptions

- Control plane remains in `kbxt-platform-integrations-qa` (account `503561435751`).
- Runtime target accounts are:
  - Dev: `kbxt-b2b-integrations-dev` (`897699593484`)
  - Preprod: `kbxt-b2b-integrations-pre-prod` (`527737084689`)
  - Prod: `kbxt-b2b-integrations-prod` (`410618142059`)
- Cross-account role assumption is unavailable for this flow.
- Runtime environments expose thin internal deployment/preview APIs callable by control plane.
- Authorization/authentication hardening for runtime APIs is out of scope in this phase.
- Runtime accounts maintain local artifact storage and local active-pointer state.
- Existing deployment model from FS-081 and runtime bootstrap direction from FS-082 remain valid baselines.

---

## Current Context

- `forge/architecture/deployments.md` documents deployment semantics and persistence patterns but is still centered on direct internal deployment handlers, not full remote orchestration contract details from control plane to per-environment APIs.
- `forge/architecture/backend-api.md` defines canonical envelope/error semantics but does not fully define control-plane-to-runtime deployment API contracts.
- FS-081 and FS-082 in `forge/active/` establish environment model and runtime bootstrap direction; this spec narrows to control-plane orchestration behavior and contracts.
- Product requirements in `specs/PRODUCT-TECHNICAL.md` require deliberate deployment pages and Save != Deploy behavior; QA terminology appears in older sections and must align to PREPROD runtime naming.

---

## Scope

### In Scope

- Control-plane orchestration flow definitions for:
  - deploy,
  - promote,
  - rollback,
  - server-side preview.
- Control-plane snapshot construction contract for immutable deployment artifacts.
- Remote runtime API payload contracts (request/response/error envelope).
- Control-plane deployment status/history model and state transitions.
- Promotion semantics for re-sending the same artifact to the next environment.
- Rollback initiation behavior and reflected UI/backend state.
- Error handling and retry policy for control-plane remote runtime API calls.
- Environment settings/config model for runtime endpoint and orchestration policy.
- Deployment Page model impact (mapping-level deployment page + project-level read-only status surfaces).
- Assumptions, risks, non-goals, and open questions.

### Out of Scope

- Runtime API auth/authz mechanism design and secrets distribution.
- Full infra implementation details for connectivity and private networking.
- Approval workflow/state machine for production promotion.
- Broader editor/test-lab UX redesign unrelated to deployment orchestration.
- Replacing existing save/version workflows.

---

## Non-Goals

- Making Save operations implicitly deploy.
- Generating a new artifact during promote.
- Introducing runtime-time dependency on control-plane deployment state reads.
- Defining final compliance/security controls for internal runtime APIs.
- Reworking engine execute/validate core behavior.

---

## Relevant Areas

- `forge/architecture/deployments.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/infrastructure.md`
- `forge/architecture/phase-1-readiness.md`
- `specs/PRODUCT-TECHNICAL.md`
- `src/lambda/deployment/*` ?
- `src/lambda/runtime/*` ?
- `src/lib/persistence/deployments.ts` ?
- `src/lib/api/*` (control-plane adapter/orchestration) ?
- `ui/src/lib/api/types.ts` ?
- `ui/src/features/projects/components/*Deployment*` ?
- `ui/src/features/mappings/components/*deploy*` ?

---

## Dependencies / Blockers

- Depends on FS-081 decisions for SANDBOX control plane and DEV/PREPROD/PROD runtime model.
- Depends on FS-082 runtime environment bootstrap contracts exposing deploy/rollback/execute/health/status runtime APIs.
- Depends on existing deployment persistence and route baseline from FS-064/FS-079.
- Connectivity between control plane and runtime API endpoints must be available.

---

## Constraints

- No cross-account AssumeRole-based orchestration.
- Deployment artifact must be immutable and content-addressable (`artifactId` + hash).
- Promote must reuse the exact artifact identity from prior environment.
- Rollback must be pointer movement to previous artifact identity.
- Runtime execution and runtime preview in each env must use local pointer/storage state only.
- Save and Deploy remain separate user actions.
- Deployment UX remains explicit, deliberate, and environment-based.

---

## Proposed Behavior

### User Flow

1. User saves mapping changes in control plane (no deployment side effects).
2. On Mapping Deployment Page, user chooses environment and action (Deploy, Promote, Rollback).
3. Control plane constructs or resolves immutable artifact snapshot for selected source (`revision` or `version`).
4. Control plane calls target runtime environment deployment API.
5. Runtime validates payload integrity, stores/activates locally, and responds with outcome metadata.
6. Control plane updates orchestration status and history, then updates Deployment Page state.
7. For server-side preview, user selects an environment; control plane calls that environment’s preview endpoint and returns environment+artifact metadata with output.

### System Behavior

#### A) Snapshot construction in control plane

Control plane snapshot builder produces a canonical immutable artifact:

```json
{
  "artifactId": "art_...",
  "artifactHash": "sha256:...",
  "mappingId": "map_...",
  "sourceDescriptor": {
    "sourceType": "revision|version",
    "sourceNumber": 12,
    "sourceConfigHash": "sha256:..."
  },
  "engineVersion": "x.y.z",
  "mappingConfig": {"...": "..."},
  "schemaRefs": [
    {
      "schemaId": "sch_...",
      "role": "source|target",
      "origin": "uploaded|cdm|published",
      "provenance": {
        "repo": "KBXT/KBX-Canonicals",
        "path": "...",
        "commitSha": "..."
      }
    }
  ],
  "createdAt": "ISO-8601",
  "createdBy": "control-plane"
}
```

Rules:
- `artifactId` and `artifactHash` are stable for identical artifact bytes.
- Deploy uses a newly constructed artifact if source changed; otherwise control plane may reuse existing artifact record by hash.
- Promote must reference an existing artifact identity and cannot regenerate payload.

#### B) Control-plane → runtime API contracts

**Deploy API (runtime):** `POST /internal/deploy`

Request:
```json
{
  "requestId": "req_...",
  "mappingId": "map_...",
  "environment": "DEV|PREPROD|PROD",
  "operation": "deploy|promote",
  "artifact": { "...": "canonical artifact payload" },
  "controlPlaneMetadata": {
    "orchestrationId": "orc_...",
    "triggeredBy": "user|system",
    "promotedFrom": "DEV|PREPROD|null"
  }
}
```

Success response:
```json
{
  "success": true,
  "data": {
    "mappingId": "map_...",
    "environment": "PREPROD",
    "artifactId": "art_...",
    "artifactHash": "sha256:...",
    "activatedAt": "ISO-8601",
    "deploymentEventId": "dep_evt_...",
    "activePointerVersion": 18
  }
}
```

**Rollback API (runtime):** `POST /internal/rollback`

Request:
```json
{
  "requestId": "req_...",
  "mappingId": "map_...",
  "environment": "DEV|PREPROD|PROD",
  "targetArtifactId": "art_...",
  "reason": "user-request|incident|other",
  "controlPlaneMetadata": {
    "orchestrationId": "orc_...",
    "triggeredBy": "user|system"
  }
}
```

Success response includes new active pointer metadata and rollback event id.

**Preview API (runtime):** `POST /internal/preview`

Request includes mappingId + input payload; runtime resolves active local artifact.

Success response:
```json
{
  "success": true,
  "data": {
    "environment": "DEV|PREPROD|PROD",
    "mappingId": "map_...",
    "artifactId": "art_...",
    "artifactHash": "sha256:...",
    "executedAt": "ISO-8601",
    "output": {"...": "..."},
    "diagnostics": []
  }
}
```

Error responses use canonical error envelope (`code`, `message`, `statusCode`, `retryable`, `requestId`) with deployment-specific codes.

#### C) Control-plane status + history model

Control plane tracks orchestration separate from runtime-local event logs:

- `OrchestrationRecord` fields:
  - `orchestrationId`
  - `mappingId`
  - `operationType` (`deploy|promote|rollback|preview`)
  - `targetEnvironment`
  - `sourceEnvironment?`
  - `artifactId?`
  - `status` (`queued|in_progress|succeeded|failed|timed_out|retrying`)
  - `attemptCount`
  - `lastErrorCode?`
  - `lastErrorMessage?`
  - `requestedBy`
  - `requestedAt`, `completedAt?`

- `DeploymentHistoryView` for UI merges:
  - control-plane orchestration outcomes,
  - runtime acknowledged event metadata,
  - active artifact per environment.

Control plane remains source of orchestration audit trail; runtime remains source of environment-local active state and local event lineage.

#### D) Promotion behavior (same artifact re-send)

- Promote action uses active artifact from source environment in control-plane model.
- Control plane sends **same artifactId/hash payload** to next environment deploy API with `operation=promote` and `promotedFrom` metadata.
- Target runtime validates integrity and stores/activates locally (idempotent if already present with matching hash).
- Any hash mismatch for same artifactId is hard failure (`ARTIFACT_INTEGRITY_MISMATCH`) with no pointer change.

#### E) Rollback behavior and reflected state

- User selects historical artifact from Deployment Page history for an environment.
- Control plane sends rollback command to selected environment runtime API.
- On success:
  - runtime pointer changes to `targetArtifactId`,
  - runtime appends rollback event,
  - control plane records orchestration success and updates deployment status badges/history.
- On failure:
  - pointer unchanged,
  - control-plane orchestration marked failed with actionable error details,
  - UI reflects failed rollback attempt and current active artifact unchanged.

#### F) Error handling and retry expectations for remote calls

- Retry policy applies only to retryable transport/runtime errors (5xx/timeout/network/rate-limit).
- Default policy:
  - max attempts: 3
  - backoff: exponential with jitter
  - per-attempt timeout: configurable (default 10s deploy/rollback, 5s preview)
- Non-retryable 4xx (validation/integrity/not-found) fail fast.
- Retry metadata (`attemptCount`, last error, next retry delay) is persisted in orchestration record.
- Partial-success handling:
  - if control plane times out but runtime may have succeeded, reconciliation call to runtime status endpoint is required before marking final failure.
- Idempotency:
  - all runtime mutation calls include idempotency key (`orchestrationId` + `operation`) to avoid duplicate pointer mutations on retries.

#### G) Environment configuration representation

Control-plane environment config model:

```json
{
  "deploymentEnvironments": [
    {
      "key": "DEV",
      "accountId": "897699593484",
      "label": "Dev",
      "runtimeApiBaseUrl": "https://...",
      "previewApiPath": "/internal/preview",
      "deployApiPath": "/internal/deploy",
      "rollbackApiPath": "/internal/rollback",
      "statusApiPath": "/internal/status/{mappingId}",
      "requestTimeoutMs": 10000,
      "retryPolicy": { "maxAttempts": 3, "baseDelayMs": 400, "maxDelayMs": 5000 }
    }
  ],
  "promotionPolicy": {
    "sequence": ["DEV", "PREPROD", "PROD"],
    "allowSkip": false
  }
}
```

Notes:
- Environment settings are backend-owned configuration, not UI hardcoded constants.
- `SANDBOX` is control-plane context only and not deploy target in deployment environment lists.

#### H) Deployment Page model impact

Mapping Deployment Page model updates:
- Add orchestration status timeline per action (`queued`, `in_progress`, `retrying`, `succeeded`, `failed`) with request id linkage.
- Environment cards show:
  - active artifact id/hash short form,
  - active source descriptor,
  - last successful action timestamp,
  - last failed orchestration (if any) with actionable message.
- Promote buttons derive availability from promotion sequence and source active artifact state.
- Rollback modal targets artifact identity (not regenerated version payload).
- Action confirmations remain explicit (deliberate UX retained).

Project-level Deployments dashboard impact:
- remains read-only for actions,
- includes richer remote-orchestration-derived status badges and recent failure indicators.

Server preview UI impact:
- environment selector options: DEV/PREPROD/PROD only,
- preview result banner includes environment + artifact identity metadata.

### Failure / Edge Behavior

- Runtime unreachable: orchestration marked `retrying` then `failed` after max attempts; no optimistic pointer change shown.
- Runtime returns idempotent-already-applied outcome: treated as success and reconciled to current state.
- Promotion attempted without valid source active artifact: fail fast with deterministic non-retryable error.
- Rollback target artifact missing in runtime local store: fail with `ARTIFACT_NOT_PRESENT` unless runtime supports import-on-demand (future decision).
- Preview requested for not-deployed environment: deterministic `NOT_DEPLOYED` response.
- Save while orchestration is in progress: save allowed; deployment context for that in-flight operation remains pinned to the original artifact snapshot.

---

## Acceptance Examples

### AE-01 — Deploy orchestration succeeds with remote runtime acknowledgement

**Given**
- Mapping has a deployable snapshot source in control plane
- Dev runtime API is reachable

**When**
- User clicks Deploy to Dev

**Then**
- Control plane constructs immutable artifact
- Control plane calls Dev `/internal/deploy`
- Dev activates artifact locally and returns acknowledgement
- Control-plane orchestration record transitions to `succeeded`
- Deployment Page shows Dev active artifact and success event

### AE-02 — Promote re-sends same artifact to next environment

**Given**
- Dev active artifact is `art_123`

**When**
- User promotes Dev → Preprod

**Then**
- Control plane sends artifact `art_123` (same id/hash) to Preprod deploy API
- No new artifact payload is generated
- Preprod active artifact becomes `art_123`
- History records promotion provenance from Dev

### AE-03 — Rollback re-points to historical artifact

**Given**
- Prod currently points to `art_200` and history includes `art_150`

**When**
- User rolls back Prod to `art_150`

**Then**
- Control plane calls Prod rollback API with `targetArtifactId=art_150`
- Prod active pointer changes to `art_150`
- Rollback event is appended locally and reflected in control-plane history

### AE-04 — Retryable remote failure is retried and tracked

**Given**
- Deploy to Preprod initially times out due to transient runtime issue

**When**
- Control plane executes orchestration with retry policy

**Then**
- Orchestration status transitions `in_progress -> retrying -> succeeded|failed`
- Attempt count and latest error are persisted and visible in control-plane history
- Non-retryable validation/integrity errors are not retried

### AE-05 — Server preview executes selected environment local active artifact

**Given**
- Dev active artifact differs from Preprod active artifact

**When**
- User runs server preview for Preprod

**Then**
- Control plane calls Preprod preview API
- Preview executes against Preprod local active artifact
- Response includes `environment=PREPROD` and artifact identity

### AE-06 — Deployment Page remains deliberate and Save remains separate

**Given**
- User has unsaved or newly saved mapping edits

**When**
- User performs Save

**Then**
- No deployment orchestration call is made
- Deployment state remains unchanged until explicit Deploy/Promote/Rollback action

### AE-07 — Environment config drives runtime API routing

**Given**
- Control-plane settings contain endpoint and retry policy for each runtime environment

**When**
- User triggers deploy/promote/rollback/preview action

**Then**
- Control plane resolves runtime route and timeout/retry settings from config
- No hardcoded runtime URL/environments are required in UI logic

---

## Design Decisions

The following decisions resolve all six open questions from Rev 1. They are captured here as stable spec requirements; the underlying rationale is included for implementers.

### D1 — Artifact transfer: push full payload every promote

Control plane pushes the full artifact payload on every deploy *and* every promote. No preflight `hasArtifact` + lightweight activate optimization is used in MVP.

**Why:**
- Simpler contract — one code path for every artifact delivery.
- Fewer edge cases — no split "import vs activate" logic.
- Deterministic promotion behavior — runtime always receives the complete artifact to validate and activate.
- If the artifact `artifactId` + `artifactHash` already exists in runtime local storage, the runtime treats the deploy/promote request as idempotent and no-ops the storage write safely.

**Impact:** The artifact payload is included in every `POST /internal/deploy` request body regardless of operation type (`deploy` or `promote`). Promote still references the same identity; the runtime just re-validates and confirms rather than skipping the transfer.

### D2 — Maximum deploy payload size: 5 MB

Control plane rejects any deploy/promote request where the serialised artifact payload exceeds **5 MB** (raw JSON body size). The runtime may also enforce this limit inbound.

**Why 5 MB:**
- Comfortably below API Gateway 10 MB limits.
- Avoids accidental large-body edge cases without signed URL complexity.
- Sufficient for realistic mapping configs + schema bundles in MVP scenarios.
- Schema artifacts that regularly exceed this size should drive a signed URL fallback in a future phase.

**Failure behavior:** Control plane returns a deterministic `PAYLOAD_TOO_LARGE` error before any runtime API call is made. The error message includes the limit and guidance for reducing payload size.

### D3 — Reconciliation strategy: poll runtime status endpoint

When control plane times out waiting for a deploy/mutation response, the canonical reconciliation strategy is to **poll the runtime status endpoint** (`GET /internal/status/{mappingId}` or `GET /internal/status/{snapshotId}`).

**No callbacks or event bridge** in MVP.

**Pattern:**
- Control plane includes the `artifactId` (or snapshot identity) in the deploy request.
- On timeout, control plane calls the runtime status endpoint to resolve the ambiguous outcome.
- Runtime status endpoint returns one of: `not_found`, `received`, `stored`, `activated`, `failed`.
- If `activated` or `stored`, the orchestration is reconciled as `succeeded`.
- If `failed` or `not_found`, the orchestration transitions to `failed` with actionable error details.

### D4 — Rollback: only artifacts in runtime local storage

Rollback is permitted only to artifact IDs that currently exist in the target runtime environment's local storage. **No on-demand import from control plane** in MVP.

- If the requested `targetArtifactId` is not present locally, runtime returns `ARTIFACT_NOT_PRESENT`.
- Control plane surfaces this as a deterministic failure with remediation guidance (deploy the artifact first, then retry rollback).
- On-demand import behaviour is deferred until post-MVP.

### D5 — Environment config source: persisted admin settings record with env-var fallback

The canonical source for runtime environment endpoint configuration is a **persisted admin settings record in the control plane**. An environment-variable bootstrap fallback is supported for local development and initial deployment setup.

**Why:**
- Editable without redeploying the stack.
- Future admin/settings UI can surface these values.
- Better long-term than env-vars-only for a multi-account control plane.

**MVP implementation note:** Initial implementation may read from environment variables for expedience, but the target canonical model is the persisted settings record. The architecture should treat env-var reads as a fallback path, not the primary contract.

### D6 — QA → PREPROD normalization: preserve raw, normalize at view layer

Existing historical deployment records stored with `QA` as the environment label are handled as follows:

- **Raw value is preserved** in the persistence layer — no destructive migration.
- **Domain/view layer normalizes** `QA` to `PREPROD` in all API responses and UI display.
- **Audit details** may display the historical label context if needed (e.g., "Preprod (historical label: QA)" in detailed event views).
- No destructive backfill migration runs in MVP.

---

## Open Questions

- none resolved

---

## Verification Strategy

- **Automated contract tests (AE-01..AE-05, AE-07):**
  - request/response envelope tests for deploy/promote/rollback/preview orchestration endpoints,
  - runtime API stub integration tests for success/retry/failure/idempotency,
  - artifact identity and integrity mismatch checks.
- **Persistence/state tests (AE-01..AE-04):**
  - control-plane orchestration status transition tests,
  - history projection tests (including retry metadata and rollback lineage).
- **UI model tests (AE-05..AE-07):**
  - Deployment Page state-model tests for orchestration timeline + environment cards,
  - preview metadata rendering tests (environment + artifact identity),
  - Save != Deploy assertion tests.
- **Architecture/document consistency checks:**
  - updates in deployments/backend-api/infrastructure/phase-1-readiness align with this orchestration contract.
- **Quality gates:**
  - typecheck, lint, targeted backend integration tests, targeted UI state/model tests.

---

## Task Generation Notes

- This is cross-cutting with primary backend + architecture impact and a bounded UI model contract impact.
- Include explicit architecture update task (`Agent: task`) for existing architecture docs.
- Keep tasks domain-pure:
  - backend orchestration/persistence/contracts as `Agent: task`,
  - Deployment Page model and UI adapter/render contract as `Agent: ui-task`.
- Sequence:
  1. architecture alignment,
  2. contract + config model,
  3. deploy/promote orchestration,
  4. rollback + preview orchestration,
  5. UI model alignment,
  6. integration verification hardening.

---

## Change Log

- Rev 2 — 2026-06-03
  - Resolved all 6 open questions from Rev 1 (see Design Decisions section).
  - **D1:** Push full artifact payload on every promote (no preflight optimization).
  - **D2:** Max deploy payload size 5 MB; reject larger payloads with `PAYLOAD_TOO_LARGE`.
  - **D3:** Reconciliation strategy = poll runtime status endpoint on timeout (no callbacks/event bridge in MVP).
  - **D4:** Rollback only to artifacts in runtime local storage (no on-demand import in MVP).
  - **D5:** Environment config sourced from persisted admin settings record with env-var fallback for bootstrap.
  - **D6:** QA->PREPROD normalization preserves raw value at rest; normalizes at domain/view layer.
  - Updated spec title banner to reflect Rev 2 resolution status.

- Rev 1 — 2026-06-03
  - Initial draft for control-plane remote deployment orchestration (deploy/promote/rollback/preview).
  - Defined snapshot construction contract, runtime API payloads, orchestration status/history model, retry/error expectations, config representation, and Deployment Page model impact.
