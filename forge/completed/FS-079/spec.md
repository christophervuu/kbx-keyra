# SPEC

## Title

FS-079 — Deployment Guardrail: Block Unsynced CDM-Referenced Mappings

---

## ID

FS-079

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-02  
Last Updated: 2026-06-02  
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Add a backend-enforced deployment pre-check that blocks deploy/promote actions when a mapping references CDM schemas that are not in a deployable state. The guardrail validates CDM sync status, ingest readiness, and required source metadata completeness before deployment can proceed. The Deployment page must show schema-specific blocking reasons with remediation guidance, and successful deployment snapshots must include schema commit SHA metadata for traceability.

---

## Problem

Mappings that reference CDM schemas can currently be deployed even when those schemas are unsynced, failed to sync, not ingestion-ready, or missing canonical source metadata. This allows deployments with uncertain provenance and can create runtime correctness risk and low trust in deployment quality.

---

## Goal

Prevent deployment or promotion when referenced CDM schema state is not deployable, while providing clear schema-level remediation guidance and preserving traceability of deployed CDM versions via commit SHAs.

---

## Assumptions

- Mapping records contain stable references to source/target schema IDs used by deployment handlers.
- CDM schemas are represented in schema metadata with `origin='cdm'`, sync status fields, ingestion status, and source metadata.
- Existing deployment endpoints remain the enforcement point for deployability rules (`/deploy`, `/promote`).
- Deployment page already has a blocking-message surface that can be extended for schema-specific reasons.

---

## Current Context

- Architecture coverage exists for this subsystem in:
  - `forge/architecture/deployments.md`
  - `forge/architecture/backend-api.md`
  - `forge/architecture/ui-application.md`
  - `forge/architecture/schema-ingestion.md`
- Related active CDM specs exist:
  - `forge/active/FS-076/spec.md` (CDM integration foundation)
  - `forge/active/FS-077/spec.md` (CDM re-sync re-ingestion)
  - `forge/active/FS-078/spec.md` (consistent CDM UX)
- Deployment subsystem currently documents source-type/environment rules but does not yet codify CDM deploy-context schema gating.

---

## Scope

### In Scope

- Backend deploy-context validation for mappings that reference CDM schemas.
- Validation checks for each referenced CDM schema:
  - sync state is deployable
  - ingest state is ready
  - source metadata includes `repo`, `path`, and `commitSha`
- Block deploy/promote when any referenced CDM schema fails validation.
- Blocking response includes schema-specific failure reason(s).
- Deployment UI messaging shows schema-specific reason + remediation CTA.
- Successful deployment snapshot metadata includes referenced schema commit SHA(s) for traceability.

### Out of Scope

- Approval workflow implementation.
- Auto-sync execution during a deploy attempt.
- Broader lifecycle redesign of schema sync workflows.
- Non-CDM schema governance changes beyond existing deployment behavior.

---

## Non-Goals

- Converting save actions into deploy-gated operations (`Save ≠ Deploy` remains unchanged).
- Automatically fixing invalid schema states as part of deployment.
- Replacing existing deployment history/promotion/rollback architecture.

---

## Relevant Areas

- `src/lambda/deployment/deploy-mapping.ts`
- `src/lambda/deployment/promote-deployment.ts`
- `src/lambda/deployment/*` (shared validation extraction) ?
- `src/lib/persistence/deployments.ts` ?
- `src/lib/persistence/types.ts`
- `src/lib/persistence/schema-metadata.ts`
- `src/lambda/shared/errors.ts`
- `ui/src/features/projects/components/ProjectDeploymentsPage.tsx` ?
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/state/app-error.ts` ?
- `forge/architecture/deployments.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- Depends on CDM schema metadata/status contracts from FS-076 and FS-077.
- Depends on deployment endpoint behavior remaining backend-authoritative for gating.
- No direct blocker from unrelated active spec FS-019.

---

## Constraints

- Validation must be backend-enforced, not UI-only.
- Save and draft revision behaviors must remain unaffected.
- Blocking behavior must be deterministic and schema-specific.
- No false blocks for fully synced, ingestion-ready CDM schemas with complete metadata.
- Deploy snapshot traceability data must include schema commit SHA(s) when deployment succeeds.

---

## Proposed Behavior

### User Flow

1. User attempts deploy or promote for a mapping.
2. Backend resolves mapping-referenced schemas and evaluates CDM-referenced schemas for deployability.
3. If any referenced CDM schema is invalid, request is blocked.
4. Deployment page shows per-schema blocking reason and remediation CTA (e.g., re-sync schema).
5. After re-sync and successful ingest, user retries deploy/promote.
6. Deployment succeeds and snapshot traceability includes CDM schema commit SHA metadata.

### System Behavior

- Add deploy-context guardrail invoked before deployment write operations.
- For each referenced schema where `origin='cdm'`, enforce:
  - sync status is deployable (not unsynced/update-failed)
  - ingest status is ready
  - source metadata includes non-empty `repo`, `path`, `commitSha`
- If any violations exist, return a deterministic blocking error envelope containing:
  - blocked schema IDs/names
  - reference role (`source` or `target`) per schema
  - stable API enum reason code per schema:
    - `unsynced` — schema has never been synced or sync state is unknown
    - `update-failed` — last sync attempt failed
    - `metadata-incomplete` — source metadata fields (`repo`, `path`, `commitSha`) are missing or empty
    - `ingest-not-ready` — schema nodes/index not built or ingest status is not `ready`
    - `schema-missing` — referenced schema ID does not exist (distinct from metadata-incomplete)
  - remediation hint/CTA key
- Apply the same guardrail to deploy and promote entrypoints.
- On successful deployment, persist traceability metadata in **both** the deployment item metadata field and the deployment snapshot S3 body metadata, including referenced CDM schema commit SHA list with reference role association.

### Failure / Edge Behavior

- Mixed references (CDM + non-CDM): only CDM schemas are checked against this new guardrail; existing deploy checks for other constraints remain unchanged.
- Multiple invalid schemas: backend returns all blocking schemas/reasons in one response (not first-failure only).
- Missing schema record for a referenced CDM ID: treated as blocking `schema-missing` (canonical enum reason) with remediation guidance.
- Non-deploy actions (save/edit/version creation) are unaffected.

---

## Acceptance Examples

### AE-01 — Deploy is blocked when referenced CDM schema is not deployable

**Given**
- A mapping references one or more CDM schemas
- At least one referenced CDM schema is `unsynced`, `update-failed`, `metadata-incomplete`, or ingest-not-ready

**When**
- User calls deploy or promote

**Then**
- Backend rejects the request
- No deployment record or current-pointer update is written

### AE-02 — Block response identifies schema and exact reason

**Given**
- Deploy-context validation fails for referenced CDM schema(s)

**When**
- Deployment request returns error

**Then**
- Response includes each blocking schema and exact reason code
- UI can render schema-specific message + remediation CTA

### AE-03 — Re-sync + successful ingest clears block

**Given**
- A previously blocked CDM schema has been re-synced successfully and is ingest-ready with complete metadata

**When**
- User retries deploy/promote

**Then**
- Deployment guardrail no longer blocks due to that schema
- Request proceeds through normal deployment rules

### AE-04 — Successful deploy stores schema commit SHA traceability

**Given**
- Mapping references deployable CDM schema(s)

**When**
- Deployment succeeds

**Then**
- Deployment snapshot metadata includes referenced schema commit SHA values
- Traceability data is queryable from deployment record/detail response

### AE-05 — Fully valid CDM references are not falsely blocked

**Given**
- All referenced CDM schemas are synced, ingest-ready, and metadata-complete

**When**
- User deploys/promotes

**Then**
- No guardrail block is emitted
- Deployment behavior matches existing expected success flow

---

## Open Questions

- none — resolved in Rev 2

---

## Verification Strategy

- **Backend unit/integration tests**
  - AE-01/AE-02: deploy + promote blocked with deterministic schema-level reasons.
  - AE-03/AE-05: valid-state retry succeeds; no false-positive blocks.
  - AE-04: deployment record/snapshot includes CDM schema commit SHA traceability.
- **UI tests**
  - AE-02: Deployment page renders schema-specific reason and remediation CTA from backend response.
  - AE-03: message clears after successful re-sync/ingest state and retry success path.
- **Quality gates**
  - `npm run typecheck`
  - targeted Vitest suites for touched deployment handlers and deployment UI surfaces.

---

## Task Generation Notes

- Split by execution domain:
  - backend validation/contract/persistence updates → `Agent: task`
  - deployment page messaging/CTA rendering → `Agent: ui-task`
- Keep backend guardrail task independent from UI work so enforcement exists even without frontend changes.
- Include explicit architecture update task because this spec modifies existing deployment/backend/UI architecture behavior.

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Q1-Q4: reason taxonomy uses stable API enum values with `schema-missing` as distinct code; block response preserves source/target reference role; commit SHA traceability persisted in both deployment item metadata and snapshot body metadata.
- Rev 1 — 2026-06-02
  - Initial draft
  - Added backend deploy-context guardrail for CDM-referenced schemas
  - Added schema-specific UI blocking/remediation messaging and snapshot commit-SHA traceability requirements
