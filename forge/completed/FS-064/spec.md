# SPEC

## Title

Environment Deployment Policy — Revision vs Version Deployability

---

## ID

FS-064

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-01  
Last Updated: 2026-06-01  
Type: cross-cutting

---

## Status

ready

---

## Revision

Rev: 1

---

## Summary

Define environment-specific deployment rules based on the revision/version model introduced in FS-063. Revisions are deployable to DEV only; versions are deployable to DEV, QA, and PROD. Drafts are never deployable. The deployment UI, snapshots, staleness indicators, promotion flows, and rollback semantics are updated to enforce and surface these rules.

---

## Problem

With the introduction of revisions and versions (FS-063), there is no deployment policy defining which artifact types can be deployed to which environments. Without this, QA and PROD could receive unversioned content, deployment history cannot distinguish the source type, and staleness indicators have no semantic foundation.

---

## Goal

Users can iterate freely in DEV using revisions while QA and PROD require explicit versioned artifacts. The deployment UI clearly separates deployable artifacts by type. Deployment history and environment comparison accurately reflect whether a deployment originated from a revision or version, with appropriate staleness semantics for each.

---

## Assumptions

- FS-063 (draft/revision/version semantics) is implemented or in progress
- Three target environments: DEV, QA, PROD
- No approval workflow for QA/PROD in this iteration (future spec)
- Single-tenant; no per-user deployment permissions yet

---

## Current Context

FS-063 establishes:
- **Draft:** Client-only autosaved state, never persisted to backend
- **Revision:** Server-persisted save with monotonic revision number, config snapshot in S3
- **Version:** Server-persisted milestone pointing to a specific revision

The persistence model (`persistence-model.md`) explicitly marks "Deployments table" as a future spec. No deployment infrastructure currently exists. The product spec references deployment concepts but no DynamoDB table or API routes have been defined.

The UI has a `StatusBadge` component and project/home pages that show mapping status, but no deployment indicators exist today.

---

## Scope

### In Scope

- Deployment target rules: which artifact types (revision/version) can target which environments (DEV/QA/PROD)
- Deployment UI: separate Revisions and Versions sections allowing users to pick deployable targets
- Deployment snapshot metadata: record whether deployed source was a revision or version, plus the specific number
- Revision-stale and version-stale definitions and detection
- Deployment indicators on project/home pages (current/stale/not-deployed badges per environment)
- Promotion flow: promote a version-backed deployment from DEV→QA→PROD
- Rollback: restore a previous deployment snapshot (immutable, compatible with revision or version source)
- Environment comparison: show what is deployed to each environment and whether it is stale
- Deployment history per mapping per environment

### Out of Scope

- Lower-level save/autosave/editor persistence semantics (FS-063)
- Approval workflows for QA/PROD promotion
- CI/CD pipeline integration or webhook triggers
- Deployment execution mechanics (runtime transformation engine invocation)
- Multi-tenant deployment isolation

---

## Non-Goals

- Automated deployment on version creation
- Environment-specific configuration overrides
- Blue/green or canary deployment strategies
- Deployment rollback approval gates

---

## Relevant Areas

- `forge/architecture/deployments.md` (new — created by this spec)
- `forge/architecture/persistence-model.md` (Deployments table addition)
- `forge/architecture/backend-api.md` (deployment routes)
- `src/lib/persistence/deployments.ts` (new)
- `src/lib/persistence/types.ts`
- `src/lambda/deployment/` (new handlers)
- `ui/src/features/deployments/` (new feature module)
- `ui/src/features/mappings/components/` (deployment indicators in editor)
- `ui/src/features/projects/components/` (deployment badges on overview)
- `ui/src/features/home/components/` (deployment badges on dashboard)
- `ui/src/components/StatusBadge.tsx` (extended for deployment states)
- `ui/src/lib/api/types.ts` (ApiAdapter deployment methods)

---

## Dependencies / Blockers

- Depends on FS-063 data model (revisions and versions must exist before deployments can reference them)

---

## Constraints

- Deployment snapshots are immutable once written (rollback replays a snapshot, never mutates)
- Must preserve compatibility with FS-063 optimistic concurrency model
- QA and PROD must only accept version-backed deployments — enforced at API level
- DEV accepts both revisions and versions
- Staleness must be computable without scanning all revisions/versions (use latest revision number and latest version number from Mappings table)

---

## Proposed Behavior

### User Flow

1. **Deploy to DEV:** User opens deployment UI for a mapping. Two sections are available: "Revisions" (lists recent revisions) and "Versions" (lists versions). User selects any revision or version and clicks Deploy to DEV. Deployment snapshot is created.

2. **Deploy to QA/PROD:** Only the "Versions" section is available (or Revisions section is visible but grayed out / deploy button disabled for QA/PROD targets). User selects a version and deploys to QA or PROD.

3. **Promotion:** User can promote a deployment from DEV→QA or QA→PROD. Promotion is only available when the deployed artifact is version-backed. A version deployed to DEV that is promoted to QA creates a new deployment snapshot for QA referencing the same version.

4. **Staleness indicators:** On project overview / home dashboard, each mapping shows per-environment badges:
   - "Not deployed" — no deployment exists for that environment
   - "Current" — deployed artifact matches the latest of its type (revision-current for DEV revision deployments, version-current for version deployments)
   - "Stale" — a newer revision or version exists beyond what was deployed

5. **Rollback:** User views deployment history for an environment, selects a previous snapshot, and rolls back. This creates a new deployment record pointing to the same immutable snapshot content.

6. **Environment comparison:** A view showing what is deployed to DEV / QA / PROD side-by-side with source type, number, and staleness.

### System Behavior

**Deployments table (DynamoDB):**

| Attribute | Key | Type | Description |
|-----------|-----|------|-------------|
| `mappingId` | PK | String (UUID) | Parent mapping |
| `environment#deployedAt` | SK | String | `{ENV}#{ISO8601}` — composite sort key |
| `environment` | — | String | `DEV` / `QA` / `PROD` |
| `sourceType` | — | String | `revision` / `version` |
| `sourceNumber` | — | Number | Revision or version number |
| `configS3Key` | — | String | S3 key of the deployed config snapshot |
| `configHash` | — | String | SHA-256 of config content |
| `deployedAt` | — | String | ISO 8601 |
| `deployedBy` | — | String | User identifier |
| `promotedFrom` | — | String | Environment promoted from (null if direct deploy) |
| `rollbackOf` | — | String | SK of the deployment this is a rollback of (null if not rollback) |

GSI: `environment-index` — PK=`mappingId`, SK=`environment` — for fetching current deployment per environment (most recent per env).

**DeploymentCurrent table (or latest-deployment tracking):**

| Attribute | Key | Type | Description |
|-----------|-----|------|-------------|
| `mappingId#environment` | PK | String | `{mappingId}#{ENV}` |
| `deployedAt` | — | String | ISO 8601 of current deployment |
| `sourceType` | — | String | `revision` / `version` |
| `sourceNumber` | — | Number | Current deployed number |
| `configHash` | — | String | For staleness comparison |

This denormalized table enables O(1) current-deployment lookups without scanning history.

**S3 layout:**
- `deployments/{mappingId}/{ENV}/{timestamp}.json` — immutable deployment snapshot (copy of config at deploy time)

**Staleness definitions:**

- **Revision-stale (DEV only):** The mapping's current `revision` number > the deployed `sourceNumber` where `sourceType=revision`. Meaning: newer saves exist beyond what was deployed.
- **Version-stale (any environment):** The mapping's current `latestVersion` > the deployed `sourceNumber` where `sourceType=version`. Meaning: a newer version milestone exists beyond what was deployed.

**API routes (new):**
- `POST /mappings/:id/deploy` — body: `{ environment, sourceType, sourceNumber }`. Validates deployability rules. Creates snapshot + deployment record.
- `POST /mappings/:id/promote` — body: `{ fromEnvironment, toEnvironment }`. Validates version-backed. Creates new deployment in target env.
- `POST /mappings/:id/rollback` — body: `{ environment, deploymentSK }`. Creates new deployment record pointing to snapshot of referenced deployment.
- `GET /mappings/:id/deployments` — query: `?environment=DEV` (optional filter). Returns deployment history.
- `GET /mappings/:id/deployments/current` — returns current deployment per environment (from DeploymentCurrent table).

**Deployment rules (enforced at API):**
- `sourceType=revision` → only `environment=DEV` allowed
- `sourceType=version` → `DEV`, `QA`, `PROD` allowed
- Promotion requires `sourceType=version` on the source deployment
- Rollback always allowed regardless of source type (replays existing snapshot)

### Failure / Edge Behavior

- **Deploy revision to QA/PROD:** API returns 400 with error code `REVISION_NOT_DEPLOYABLE_TO_ENV`
- **Promote non-version deployment:** API returns 400 with error code `PROMOTION_REQUIRES_VERSION`
- **Deploy deleted revision/version:** API validates that the referenced source still exists. If not, returns 404 with `SOURCE_NOT_FOUND`.
- **Concurrent deploy:** Last-write-wins for DeploymentCurrent. History is append-only so no conflict.
- **Rollback to snapshot whose S3 object is missing:** Returns 500 with `SNAPSHOT_INTEGRITY_ERROR` (should not happen if snapshots are immutable/never deleted).

---

## Acceptance Examples

### AE-01 — Deploy revision to DEV

**Given**
- Mapping `m1` has revision 5 as latest
- No deployment to DEV exists

**When**
- User deploys revision 5 to DEV

**Then**
- Deployment snapshot created at `deployments/m1/DEV/{ts}.json`
- DeploymentCurrent shows `m1#DEV` → revision 5
- Deployment history includes the entry with `sourceType=revision, sourceNumber=5`
- DEV badge shows "Current"

### AE-02 — Deploy revision to QA rejected

**Given**
- Mapping `m1` has revision 5

**When**
- API receives deploy request with `sourceType=revision, environment=QA`

**Then**
- API returns 400 `REVISION_NOT_DEPLOYABLE_TO_ENV`
- No deployment record created

### AE-03 — Deploy version to PROD

**Given**
- Mapping `m1` has version v3 (pointing to revision 6)

**When**
- User deploys version 3 to PROD

**Then**
- Deployment snapshot created with version 3's config
- DeploymentCurrent shows `m1#PROD` → version 3
- PROD badge shows "Current"

### AE-04 — Revision-stale in DEV

**Given**
- Mapping `m1` deployed to DEV with revision 5 (`sourceType=revision`)
- User saves new revision → revision 6 now exists

**When**
- Dashboard/project page loads

**Then**
- DEV badge shows "Stale" (deployed revision 5 < current revision 6)

### AE-05 — Version-stale in QA

**Given**
- Mapping `m1` deployed to QA with version 2
- User creates version 3

**When**
- Dashboard/project page loads

**Then**
- QA badge shows "Stale" (deployed version 2 < latest version 3)

### AE-06 — Promote DEV version deployment to QA

**Given**
- Mapping `m1` deployed to DEV with `sourceType=version, sourceNumber=3`

**When**
- User promotes from DEV to QA

**Then**
- New deployment record in QA with `sourceType=version, sourceNumber=3, promotedFrom=DEV`
- QA badge shows "Current" (matches latest version)

### AE-07 — Promote revision deployment to QA rejected

**Given**
- Mapping `m1` deployed to DEV with `sourceType=revision, sourceNumber=5`

**When**
- User attempts to promote DEV to QA

**Then**
- API returns 400 `PROMOTION_REQUIRES_VERSION`
- No QA deployment created
- UI disables or hides promote button for revision-backed deployments

### AE-08 — Rollback in PROD

**Given**
- Mapping `m1` has PROD deployment history: version 2 (older), version 3 (current)

**When**
- User rolls back PROD to the version 2 deployment snapshot

**Then**
- New deployment record created with `rollbackOf` pointing to the version 2 deployment SK
- DeploymentCurrent updated to reflect the rolled-back config
- PROD badge shows "Stale" (deployed source is version 2, latest version is 3)

### AE-09 — Deployment UI sections

**Given**
- Mapping `m1` has revisions r1–r6 and versions v1–v3
- Target environment is DEV

**When**
- User opens deployment UI

**Then**
- "Revisions" section shows r1–r6, each with Deploy to DEV button
- "Versions" section shows v1–v3, each with Deploy to DEV button

### AE-10 — Deployment UI for QA target

**Given**
- Same mapping with revisions and versions
- Target environment is QA

**When**
- User opens deployment UI

**Then**
- "Versions" section shows v1–v3 with Deploy to QA button
- "Revisions" section is either hidden or shows revisions with deploy disabled and tooltip explaining why

### AE-11 — Environment comparison view

**Given**
- Mapping `m1`: DEV has revision 6, QA has version 2, PROD not deployed

**When**
- User views environment comparison

**Then**
- Table shows:
  - DEV: Revision 6, Current/Stale indicator
  - QA: Version 2, Current/Stale indicator
  - PROD: Not deployed

---

## Open Questions

- none

---

## Resolved Questions

- `Q1.` **Dedicated page at `/mappings/:id/deploy`.** Deploy is a deliberate action distinct from editing; the editor links to the deploy page but does not carry inline deploy controls.
- `Q2.` **Unbounded deployment history for Phase 1.** Deployment events are audit-like and meaningful. Retention/archival revisited later if scale requires it.
- `Q3.` **Separate DeploymentCurrent table.** Clearer read path, simpler queries, separates immutable history from mutable current-pointer state.
- `Q4.` **Per-environment badges on the home dashboard.** Environment-specific status is core; worst-case aggregation hides useful detail. DEV/QA/PROD shown as separate indicators.

---

## Verification Strategy

- **AE-01, AE-02, AE-03:** Backend integration tests (DynamoDB Local) for deploy with valid/invalid sourceType+environment combinations
- **AE-04, AE-05:** Unit tests for staleness computation logic
- **AE-06, AE-07:** Backend integration tests for promotion validation
- **AE-08:** Backend integration test for rollback creating correct snapshot reference
- **AE-09, AE-10:** UI component tests for deployment section rendering based on target environment
- **AE-11:** UI component test for environment comparison view
- All acceptance examples should have automated coverage
- Typecheck and lint must pass across all touched areas

---

## Task Generation Notes

This is a cross-cutting spec. Tasks split by execution domain:

1. **Deployments persistence layer** (Agent: task) — DynamoDB table schemas, S3 snapshot storage, persistence module (`deployments.ts`)
2. **Deployment API handlers** (Agent: task) — deploy, promote, rollback, list, current endpoints with validation rules
3. **Staleness computation module** (Agent: task) — shared staleness logic (revision-stale, version-stale) usable by API and UI
4. **ApiAdapter deployment contract** (Agent: task) — deployment methods added to adapter interface + HttpAdapter + LocalStorageAdapter
5. **Deployment UI page — deploy flow** (Agent: ui-task) — deployment page with Revisions/Versions sections, environment target picker, deploy action
6. **Deployment UI — promotion and rollback** (Agent: ui-task) — deployment history, promote button, rollback action, environment comparison view
7. **Deployment badges on project/home pages** (Agent: ui-task) — per-environment current/stale/not-deployed badges
8. **Architecture document: deployments.md** (Agent: task) — create `forge/architecture/deployments.md` and add to INDEX.md

Tasks 1 must complete before 2–3. Tasks 2–3 must complete before 4. Task 4 must complete before 5–6. Task 7 depends on 4. Task 8 can execute after 1–2.

---

## Change Log

- Rev 1 — 2026-06-01
  - Initial draft
