# SPEC

## Title

Define KeyRa runtime deployment model for Sandbox → Dev → Preprod → Prod

---

## ID

FS-081

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-03  
Last Updated: 2026-06-03  
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Define a production deployment architecture where KeyRa authoring/control stays in Sandbox (`kbxt-platform-integrations-qa`) while runtime execution happens in isolated Dev, Preprod, and Prod accounts. Deployments remain immutable snapshot artifacts, promotion reuses the same artifact across environments, and rollback moves an environment-local active pointer without mutating artifacts. The model explicitly separates control-plane responsibilities from runtime-plane responsibilities and removes dependency on cross-account role assumption.

---

## Problem

The current product draft and prior architecture references model deployment as DEV/QA/PROD and implicitly rely on centralized deployment control assumptions that do not match the actual AWS account layout. KeyRa now needs an explicit account-aware deployment model where sandbox authoring can deploy and promote artifacts into separate runtime accounts without cross-account role assumption, while preserving snapshot immutability, Save ≠ Deploy semantics, and environment-local runtime execution.

---

## Goal

Provide a deterministic deployment model for Sandbox authoring → Dev → Preprod → Prod that:
- preserves immutable snapshot artifacts and same-artifact promotion,
- keeps runtime execution fully local to each target environment,
- supports rollback via active-pointer changes,
- defines minimal runtime footprint per environment,
- and clarifies what must change from DEV/QA/PROD terminology and behavior in the current product draft.

---

## Assumptions

- Sandbox/control plane remains hosted in account `503561435751` (`kbxt-platform-integrations-qa`).
- Runtime environments are separate AWS accounts:
  - Dev: `897699593484` (`kbxt-b2b-integrations-dev`)
  - Preprod: `527737084689` (`kbxt-b2b-integrations-pre-prod`)
  - Prod: `410618142059` (`kbxt-b2b-integrations-prod`)
- Cross-account role assumption is not available for deployment orchestration.
- Deploy endpoints are internal-only for this phase; authentication/authorization hardening is deferred.
- Mapping engine remains a pure TypeScript library with zero cloud dependencies.
- Runtime traffic (Step Functions / business workflows) must execute mappings from resources in the local runtime account only.

---

## Current Context

- `forge/architecture/deployments.md` currently documents deployment APIs and storage around a DEV/QA/PROD model.
- `specs/PRODUCT-TECHNICAL.md` Section 12 defines immutable snapshot deployment/promotion/rollback semantics and environment-local runtime execution, but uses DEV/QA/PROD naming and assumes cross-environment write via IAM role assumption.
- Existing architecture docs (`deployments.md`, `backend-api.md`, `infrastructure.md`, `phase-1-readiness.md`) do not yet codify the Sandbox control-plane account with separate Dev/Preprod/Prod runtime accounts and no cross-account role assumption.
- In-progress active specs are minimal (`forge/active/FS-019`) and unrelated to deployment architecture.

---

## Scope

### In Scope

- Control-plane vs runtime-plane separation model for KeyRa deployments.
- Runtime deployment architecture for Sandbox authoring to Dev/Preprod/Prod runtime environments.
- Responsibilities split between sandbox/control services and per-environment runtime services.
- Minimal runtime footprint required in each runtime account.
- Deployment artifact model:
  - immutable snapshot payload contents,
  - schema content handling,
  - active snapshot pointer model.
- Promotion behavior that preserves same-artifact semantics without cross-account role assumption.
- Rollback behavior as active-pointer movement.
- Server-side preview implications under this environment model.
- Environment-model updates from current DEV/QA/PROD draft to Sandbox/Dev/Preprod/Prod.
- Risks, assumptions, non-goals, and open questions for execution-phase specs.

### Out of Scope

- AuthN/AuthZ design for deploy/promote/rollback/preview endpoints.
- CI/CD pipeline design for multi-account provisioning.
- Runtime business workflow redesign outside deployment/preview boundaries.
- Approval workflows for Prod promotion.
- Full UI implementation details beyond model-impact requirements.

---

## Non-Goals

- Converting Save into Deploy (Save remains independent).
- Introducing cross-account runtime reads from sandbox during execution.
- Rewriting mapping engine behavior or adding cloud dependencies to the engine.
- Defining final security controls for internal deployment endpoints in this spec.

---

## Relevant Areas

- `forge/architecture/deployments.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/infrastructure.md`
- `forge/architecture/phase-1-readiness.md`
- `specs/PRODUCT-TECHNICAL.md` (environment model terminology + deployment section)
- `src/lambda/deployment/*` ?
- `src/lib/persistence/deployments.ts` ?
- `src/lib/persistence/types.ts` ?
- `ui/src/lib/api/types.ts` ?
- `ui/src/features/projects/components/ProjectDeploymentsPage.tsx` ?
- `ui/src/features/mappings/*` (server-preview environment selection surfaces) ?

---

## Dependencies / Blockers

- Depends on existing deployment subsystem baseline from FS-064 and subsequent deployment-related specs (including FS-079).
- Depends on infrastructure/network feasibility for sandbox control plane to reach internal deployment endpoints in Dev/Preprod/Prod.
- No direct blocker from active FS-019.

---

## Constraints

- No cross-account role assumption in deployment flow.
- Runtime environments must not fetch deployment state from sandbox at request execution time.
- Artifact promotion must preserve byte-equivalent artifact identity (same artifact upward).
- Rollback must be pointer-based and append-only in history/audit terms.
- Deploy/promote/rollback endpoints treated as internal-only in this phase.
- Environment naming/model must move from DEV/QA/PROD to DEV/PREPROD/PROD runtime targets with SANDBOX as control plane.
- Canonical artifact transfer for this phase is direct payload push from sandbox control plane to runtime deploy API.
- Deploy API must enforce a configured maximum payload size and reject oversize artifacts with actionable diagnostics.
- Retry semantics are client-driven idempotent retries keyed by `artifactId`/`snapshotId`.
- Network assumption for this phase is HTTPS runtime endpoints reachable from sandbox via internal public endpoint allowlisting; private connectivity is deferred.

---

## Proposed Behavior

### User Flow

1. User authors and saves mappings in Sandbox control plane.
2. User triggers deploy to Dev from Sandbox deployment UI.
3. Sandbox creates (or resolves) an immutable deployment artifact from the selected source snapshot and sends it to Dev runtime deploy endpoint.
4. Dev runtime stores artifact locally, updates local active pointer, and returns deployed metadata.
5. User promotes the same artifact Dev → Preprod, then Preprod → Prod from Sandbox.
6. Promotion uses the same artifact identity (no regeneration).
7. Rollback in any runtime environment selects a previously deployed artifact and moves that environment’s active pointer to it.
8. Server-side preview for a selected runtime environment executes against that environment’s active local artifact.

### System Behavior

#### A) Plane Separation

**Control Plane (Sandbox account)**
- Authoring, save/version workflows, and deployment orchestration API.
- Canonical deployment artifact registry/metadata (artifact IDs, hashes, provenance, source mapping revision/version, createdAt).
- Promotion orchestration and environment rollout state tracking.
- No runtime transformation execution dependency from target environments.

**Runtime Plane (Dev / Preprod / Prod accounts)**
- Environment-local deployment ingestion endpoint (internal).
- Environment-local artifact store (S3/prefix or equivalent) containing immutable runtime artifacts.
- Environment-local active-pointer store (`mappingId -> artifactId` + metadata).
- Environment-local generic mapping runtime Lambda that resolves active artifact locally and executes engine.

#### B) Minimal Per-Environment Runtime Footprint

Each runtime account must include, at minimum:
1. **Deploy Ingestion API** (internal endpoint): import/activate artifact by validated manifest.
2. **Artifact Storage**: immutable snapshot objects and optional schema payload bundle.
3. **Active Pointer Store**: O(1) lookup for active artifact per mapping.
4. **Runtime Executor**: generic mapping Lambda using local pointer + local artifact.
5. **Deployment History Store**: append-only records for deploy/promote/rollback events in that environment.

#### C) Deployment Artifact Model

Each immutable artifact includes:
- `artifactId` (globally unique, stable across promotions)
- `artifactHash` (content hash of snapshot payload)
- `mappingId`
- `sourceDescriptor`:
  - `sourceType` (`revision` | `version`)
  - `sourceNumber`
  - `sourceConfigHash`
- `engineVersion`
- `mappingConfig` (full executable mapping snapshot)
- `schemaRefs` with immutable provenance (including commit SHA/version identity as available)
- `schemaPayloadMode`:
  - `embedded` schema content bundle OR
  - `resolvedRefs` requiring guaranteed local availability before activation
- `createdAt` and control-plane provenance metadata

Rules:
- Artifacts are immutable and never overwritten.
- Promotion cannot rebuild or mutate artifact payload.
- Rollback references existing artifactId and moves pointer.

#### D) Promotion Without Cross-Account Role Assumption

Promotion is **orchestrated relay**, not IAM role-assumed write:
- Sandbox control plane calls target environment internal deploy endpoint.
- For this phase, sandbox POSTs the full deployment artifact in the runtime deploy API request body.
- Runtime deploy API enforces maximum payload size; oversize artifacts are rejected with deterministic remediation guidance.
- Signed pull URL transfer is explicitly deferred to a later enhancement.
- Target runtime verifies `artifactId` + `artifactHash` before activation.
- On success, target runtime writes local history + active pointer update.

This preserves same-artifact promotion while avoiding cross-account AssumeRole.

Idempotent retry contract:
- Client retries are keyed by `artifactId`/`snapshotId`.
- Repeated delivery of the same artifact to the same environment must be safe and deterministic.

#### E) Rollback Behavior

- Rollback is environment-local pointer reassignment to a previously imported artifact.
- No artifact mutation, no deletion, no content rewrite.
- New rollback event is appended to deployment history with `rollbackOf` reference.
- If requested artifact is not present locally, runtime returns `artifact_not_available_for_rollback` and does not auto-import in this phase.
- Control plane surfaces remediation: rollback unavailable in target environment; redeploy/promote the desired snapshot explicitly.

#### E1) Artifact Retention Policy (MVP)

- Retention is configurable by environment policy, but MVP default is to retain all artifacts locally.
- Runtime environments are not required to guarantee infinite retention in long-term architecture.
- Rollback guarantees apply to artifacts retained within the configured rollback window.
- Lifecycle/archival policy is deferred; this spec requires policy hooks without enforcing non-MVP archival behavior.

#### F) Server-Side Preview Implications

- Server preview remains environment-specific.
- Sandbox preview orchestration must call the selected runtime environment preview endpoint.
- Preview execution in each environment must resolve active artifact from that environment’s local pointer store and local artifact storage.
- Preview response should include environment + artifact identity metadata so users can verify what snapshot produced output.

#### G) Environment Model Changes vs Current Draft

From current product draft:
- Replace logical deployment chain **DEV → QA → PROD** with **DEV → PREPROD → PROD**.
- Introduce **SANDBOX** explicitly as **control plane only** (authoring/orchestration), not part of runtime promotion chain.
- Update API/domain enums and UI labels accordingly:
  - Runtime environments: `DEV | PREPROD | PROD`
  - Control-plane context: `SANDBOX` (non-runtime target)
- Existing data/model fields that currently encode QA must migrate to PREPROD-compatible terminology via follow-up implementation spec/task.
- Migration policy for existing records:
  - Persisted historical values may retain raw `QA` for audit fidelity.
  - Domain/presentation layers normalize `QA` to `PREPROD` for behavior and UI.
  - Canonical forward enum is `SANDBOX | DEV | PREPROD | PROD`.

### Failure / Edge Behavior

- If artifact hash verification fails in target runtime, deployment is rejected and pointer is unchanged.
- If direct artifact payload exceeds configured limit, runtime rejects with deterministic payload-too-large diagnostic and remediation guidance.
- If artifact transfer succeeds but activation fails, runtime returns failure; no partial pointer movement.
- If promotion requested for artifact not active in source runtime (policy mismatch), control plane rejects promotion unless explicit override policy is defined.
- If rollback target artifact is missing locally, runtime returns `artifact_not_available_for_rollback`; control plane instructs redeploy/promote remediation.
- Runtime preview for environment with no active artifact returns deterministic `not-deployed` style error.
- Save operations remain unaffected by any deploy/promotion failures.

---

## Acceptance Examples

### AE-01 — Deploy from Sandbox to Dev writes local runtime state

**Given**
- Mapping `m1` is saved in Sandbox with deployable source snapshot

**When**
- User deploys to Dev

**Then**
- Sandbox produces immutable artifact `a1`
- Dev runtime stores `a1` in Dev-local artifact storage
- Dev active pointer for `m1` points to `a1`
- Deploy history in Dev records the event

### AE-02 — Promote Dev → Preprod reuses same artifact

**Given**
- Dev currently runs artifact `a1` for mapping `m1`

**When**
- User promotes to Preprod

**Then**
- Preprod runtime activates artifact `a1` (same artifactId/hash)
- No regenerated artifact payload is created
- Preprod history records promotion with provenance link

### AE-03 — Runtime execution does not read sandbox deployment state

**Given**
- Preprod has active artifact `a1` for `m1`

**When**
- Preprod generic mapping runtime executes `m1`

**Then**
- It resolves active pointer and artifact from Preprod-local resources only
- No runtime fetch to sandbox control-plane deployment state occurs

### AE-04 — Rollback moves pointer only

**Given**
- Prod has deployed artifacts `a1`, then `a2` for `m1`

**When**
- User rolls back Prod to `a1`

**Then**
- Prod active pointer changes from `a2` to `a1`
- A rollback event is appended in history
- No artifact mutation or deletion occurs

### AE-05 — Server-side preview reflects selected runtime environment artifact

**Given**
- Dev active artifact is `a1`; Preprod active artifact is `a2`

**When**
- User runs server preview against Preprod

**Then**
- Preview executes with Preprod-local active artifact `a2`
- Response includes environment `PREPROD` and artifact identity metadata

### AE-06 — QA terminology is removed from runtime deployment model

**Given**
- Deployment environment model is surfaced in API/domain/UI

**When**
- Runtime environments are listed

**Then**
- Values are `DEV`, `PREPROD`, `PROD`
- `QA` is not used as runtime environment label
- `SANDBOX` is represented as control plane context, not deploy target

---

## Open Questions

- none

---

## Verification Strategy

- **Architecture/document verification (AE-01..AE-06):**
  - Update deployment/infrastructure/backend architecture docs to codify plane separation, runtime footprint, artifact identity rules, promotion, rollback, and preview routing.
- **Backend contract verification (AE-01..AE-05):**
  - Contract tests for control-plane orchestration API and runtime deploy endpoints (artifact hash validation, pointer updates, append-only history).
  - Contract tests for max payload-size rejection and idempotent retry by `artifactId`/`snapshotId`.
  - Integration tests ensuring no runtime dependency on sandbox state during execution.
- **Model migration verification (AE-06):**
  - Domain/API normalization tests mapping raw `QA` records to canonical `PREPROD` while preserving raw audit value.
  - UI-facing contract tests for environment selector and labels.
- **Quality gates:**
  - typecheck, lint, and targeted integration tests for deployment/preview surfaces.

---

## Task Generation Notes

- This is a cross-cutting spec with backend + architecture + UI contract impact.
- Generate explicit architecture-update task(s) (`Agent: task`) for `deployments.md`, `backend-api.md`, `infrastructure.md`, and `phase-1-readiness.md`.
- Separate control-plane orchestration work from runtime-plane ingestion/runtime execution work.
- Keep UI environment-model updates isolated as `ui-task` (labels/enums/selector contracts) rather than mixed into backend tasks.
- Follow-up implementation should sequence model/contract definitions before endpoint and storage migrations.

---

## Change Log

- Rev 2 — 2026-06-03
  - Resolved all open questions with explicit MVP decisions.
  - Set canonical transfer to direct payload push; deferred signed pull URL.
  - Added configured max deploy payload limit + deterministic oversize rejection requirement.
  - Set retry model to client-driven idempotent retry keyed by `artifactId`/`snapshotId`.
  - Set rollback-missing-artifact behavior to fail with remediation (`artifact_not_available_for_rollback`), no auto-import.
  - Added retention policy baseline: configurable, MVP defaults to retain all locally.
  - Set network assumption to HTTPS internal public endpoint allowlist for sandbox→runtime; private connectivity deferred.
  - Set QA migration policy: normalize to PREPROD in domain/presentation while preserving raw historical value for audit.

- Rev 1 — 2026-06-03
  - Initial draft defining Sandbox control plane and Dev/Preprod/Prod runtime deployment model without cross-account role assumption.
  - Added artifact identity, promotion relay, rollback pointer model, and server-preview implications.
  - Captured open questions for transfer mechanism, retention policy, and QA→PREPROD migration details.
