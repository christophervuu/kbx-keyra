# SPEC

## Title

FS-077 — CDM Re-sync Re-ingestion + Dependency Resolution

---

## ID

FS-077

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-02  
Last Updated: 2026-06-02  
Type: backend

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Extend CDM re-sync so a detected upstream change triggers a full backend re-ingestion pipeline, not metadata-only refresh. The pipeline must resolve valid cross-folder relative `$ref` dependencies used by CommonDataModels schemas (CoreSchemas, Definitions, and referenced Events), then rebuild parsed schema nodes, embedding text, embeddings, and OpenSearch index artifacts. Re-sync must return a clear no-op on unchanged commits, an actionable failure when dependency resolution fails, and a best-effort field-level diff summary when re-ingestion succeeds.

---

## Problem

Current CDM sync foundation does not yet guarantee that upstream schema changes are fully re-parsed and re-indexed. For CommonDataModels, schemas can reference files outside `JSONSchemas/CommonDataModels/`; without dependency resolution, parse/validation/indexing can be incomplete or incorrect. This creates stale AI retrieval context and weak sync trust because callers cannot tell what structurally changed after re-sync.

---

## Goal

When a linked CDM schema changes in GitHub:

1. Detect commit change (`stored commitSha` vs latest upstream commit).
2. Re-fetch and re-parse schema content.
3. Resolve valid relative `$ref` dependencies across allowed folders.
4. Rebuild `SchemaNodes`, embedding text, embeddings, and OpenSearch index.
5. Return a diff summary (`fields added`, `fields removed`, `fields modified` best effort).
6. Update metadata and activity records with deterministic success/no-op/failure outcomes.

---

## Assumptions

- FS-076 foundation contracts and endpoints exist or are completed before this spec executes.
- CDM source metadata for linked schemas includes repo/path/branch/commit fields required for re-sync.
- Existing schema ingestion modules (`src/lib/schema/*`) remain the canonical parse/index pipeline.
- OpenSearch remains a derived index; source-of-truth persistence remains DynamoDB + S3.
- Step Functions orchestration path is available for large schema re-ingestion where needed.

---

## Current Context

- Active related spec: `forge/active/FS-076/spec.md` establishes read-only CDM browse/link/manual re-sync baseline.
- Existing architecture coverage already exists for this subsystem area:
  - `forge/architecture/schema-ingestion.md`
  - `forge/architecture/backend-api.md`
  - `forge/architecture/persistence-model.md`
  - `forge/architecture/ai-runtime.md` (AI retrieval context dependency)
- Persistence model currently stores schema metadata/sync state and schema-node index artifacts; full re-ingestion flow is documented in schema-ingestion architecture.
- Known schema sync status values in backend code still include legacy values (`not-synced`, `local-changes`) and require reconciliation with CDM-focused statuses introduced by FS-076/FS-077 behavior.

---

## Scope

### In Scope

- Commit comparison during CDM re-sync (`stored commitSha` vs latest upstream commit).
- Re-fetch changed schema file from `JSONSchemas/CommonDataModels/`.
- Relative `$ref` dependency resolution for valid references into:
  - `JSONSchemas/CoreSchemas/`
  - `JSONSchemas/Definitions/`
  - `JSONSchemas/Events/` (when referenced)
- Full re-ingestion on detected change:
  - schema parse/re-parse
  - `SchemaNodes` rebuild
  - embedding text regeneration
  - re-embedding
  - OpenSearch re-index
- Re-sync result diff summary response:
  - fields added
  - fields removed
  - fields modified (best effort)
- Metadata + activity updates for success, no-op, and failure outcomes.
- Failure-safe behavior preventing partial active-state corruption.

### Out of Scope

- Independent browsing/linking workflows for CoreSchemas/Definitions/Events.
- Automatic repair/migration of historical broken CDM mappings.
- CI parity/automation alignment with SchemaMonitor tooling (informational only).
- New UI redesign beyond consuming/visible sync result payloads from existing surfaces.

---

## Non-Goals

- Expanding CDM integration to write/publish GitHub operations.
- Building generalized multi-repository `$ref` resolution beyond scoped CDM dependency folders.
- Replacing existing schema ingestion architecture with a separate ingestion stack.

---

## Relevant Areas

- `src/lambda/schema/` (sync handler orchestration and response shape) ?
- `src/lib/schema/parser/*`
- `src/lib/schema/dynamo/*`
- `src/lib/schema/opensearch/*`
- `src/lib/schema/embedding-text.ts`
- `src/lib/persistence/schema-metadata.ts`
- `src/lib/persistence/schema-nodes.ts`
- `src/lib/persistence/types.ts`
- `src/lambda/shared/*` (errors/response/activity integration touchpoints) ?
- `tests/lambda/schema/**/*.test.ts`
- `tests/lib/schema/**/*.test.ts`
- `tests/integration/schema-ingestion/**/*.test.ts`
- `forge/architecture/schema-ingestion.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/persistence-model.md`
- `forge/architecture/INDEX.md`

---

## Dependencies / Blockers

- Depends on FS-076 contracts/flows being implemented for CDM re-sync entrypoint behavior.
- Depends on GitHub read access for CDM repo and dependency folders.
- Depends on OpenSearch + embedding pipeline availability for successful rebuild path.

---

## Constraints

- `JSONSchemas/Sample Payloads/` is excluded from schema dependency sources.
- Re-sync must fail safely with no partial active-state corruption.
- Dependency resolution must allow only valid relative references under permitted roots.
- Unchanged upstream commit must return deterministic no-op result.
- Large schema re-ingestion may route through Step Functions and must preserve consistent terminal status semantics.
- Step Functions routing reuses existing 500-field threshold from ingestion pipeline (same threshold, same orchestration entry).
- `update-available` status is persisted only during explicit re-sync check/calls — no background or lightweight status probes in this iteration.

---

## Proposed Behavior

### User Flow

1. User triggers CDM re-sync for a linked schema.
2. Backend compares stored `commitSha` with latest upstream commit for linked path.
3. If unchanged, backend returns no-op response immediately (`synced`, no rebuild).
4. If changed, backend re-fetches schema + resolves permitted relative dependencies.
5. Backend executes full re-ingestion and indexing rebuild.
6. Backend returns success response including diff summary and updated sync metadata.
7. If dependency resolution or ingestion fails, backend returns explicit failure reason and preserves prior active state.

### System Behavior

- Re-sync request pipeline:
  1. Validate linked CDM source metadata and root/path constraints.
  2. Fetch latest upstream commit and compare with stored commit.
   3. On change, fetch primary schema plus transitive relative `$ref` files under allowed folders.
   4. Dependency resolution is strict all-or-nothing — if any required `$ref` target is disallowed, missing, or unresolvable, the entire re-sync fails before any parse or index work begins.
   5. Build parse context using fetched dependency file set.
   6. Re-run ingestion pipeline (parse → nodes → embedding text → embeddings → OpenSearch index).
   7. Compute field-level best-effort diff between prior and refreshed schema-node sets using path + structural fingerprint (type, isArray, depth) for `modified` detection.
   8. Commit metadata/activity updates only after successful rebuild.
- Suggested result contract includes explicit mode:
  - `status: "no-op" | "updated" | "failed"`
  - `reason` (for failed)
  - `diffSummary` (for updated)
  - commit metadata (`previousCommitSha`, `currentCommitSha`)

### Failure / Edge Behavior

- Invalid/out-of-scope `$ref` target path → fail re-sync with deterministic validation reason.
- Missing dependency file for required `$ref` → fail re-sync with unresolved dependency reason.
- Parser/indexer failure during rebuild → terminal failed result; prior active indexed state remains intact.
- Unchanged commit → no-op result; no parse/index work is executed.
- Dependency cycles or excessive depth → fail with bounded traversal error (no infinite recursion).

---

## Acceptance Examples

### AE-01 — Changed commit triggers full re-ingestion pipeline

**Given**
- A linked CDM schema with stored `commitSha=A`
- Upstream latest commit for same path is `commitSha=B` (`B != A`)

**When**
- Re-sync is requested

**Then**
- Backend re-fetches schema content
- Rebuilds parsed schema nodes, embeddings, and OpenSearch index
- Persists `commitSha=B`
- Returns `status=updated`

### AE-02 — Relative `$ref` dependencies resolve across allowed folders

**Given**
- A CDM schema references relative files under `../CoreSchemas` and `../Definitions`

**When**
- Re-sync re-ingestion executes

**Then**
- Dependencies are fetched/resolved successfully
- Parse/validation uses resolved dependency content
- Re-ingestion succeeds

### AE-03 — Events dependency is resolved when referenced

**Given**
- A CDM schema contains a valid relative `$ref` into `JSONSchemas/Events/`

**When**
- Re-sync executes

**Then**
- Events dependency is resolved and included in parse context
- Re-ingestion succeeds if all dependencies are valid

### AE-04 — Unchanged commit returns deterministic no-op

**Given**
- Stored and upstream commit SHA values are equal

**When**
- Re-sync is requested

**Then**
- Response returns `status=no-op`
- No schema parse/re-index work runs
- Metadata and activity reflect no update required

### AE-05 — Diff summary returns added/removed/modified fields using path + structural fingerprint

**Given**
- Re-sync detects schema structural changes

**When**
- Re-ingestion succeeds

**Then**
- Response includes best-effort `diffSummary` with:
  - `added[]` — paths present in refreshed schema but absent in prior
  - `removed[]` — paths present in prior schema but absent in refreshed
  - `modified[]` — paths present in both but with differing structural fingerprint (type, isArray, or depth)
- Matching heuristic uses path + structural fingerprint (type, isArray, depth), not path-only

### AE-06 — Dependency resolution failure is explicit and safe

**Given**
- A changed schema contains an unresolved or disallowed relative `$ref`

**When**
- Re-sync executes

**Then**
- Response returns `status=failed` with clear failure reason
- No partial active-state corruption occurs
- Prior ready schema/index state remains usable

### AE-07 — AI retrieval uses refreshed schema nodes after success

**Given**
- Re-sync updated schema successfully

**When**
- A downstream AI retrieval/query operation uses schema node context

**Then**
- Retrieval reflects refreshed nodes from the latest successful re-ingestion

---

## Open Questions

All questions resolved at Rev 2 — see Change Log for decision rationale.

- none

---

## Verification Strategy

- **Unit tests**
  - dependency resolver path normalization, allowlist enforcement, cycle/depth guards (AE-02, AE-03, AE-06)
  - commit comparison gate and no-op short-circuit (AE-04)
  - diff summary generation logic (AE-05)
- **Integration tests (lambda + ingestion pipeline)**
  - changed-commit full rebuild path (AE-01)
  - dependency failure rollback-safe path (AE-06)
  - unchanged-commit no-op path (AE-04)
- **Index/query validation**
  - confirm refreshed nodes are queryable post-success and used by retrieval-dependent flows (AE-07)
- **Quality gates**
  - typecheck/lint for touched backend modules
  - targeted backend test suites for schema ingestion + CDM sync modules

---

## Task Generation Notes

- All tasks are backend/indexing/architecture and should route to `Agent: task`.
- Sequence to reduce risk:
  1. Contract + sync-state/result model alignment
  2. Dependency resolver module and guardrails
  3. Re-sync orchestration into full re-ingestion with atomic commit behavior
  4. Diff summary generation + response integration
  5. Activity/metadata updates and no-op/failure semantics
  6. End-to-end verification coverage
  7. Architecture document updates (`schema-ingestion.md`, `backend-api.md`, `persistence-model.md`, `INDEX.md`)
- This spec modifies existing ingestion/backend subsystems; include explicit architecture update task.

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Q1: `modified` diff detection uses path + structural fingerprint (type, isArray, depth), not path-only.
  - Resolved Q2: Dependency resolution is strict all-or-nothing per re-sync — unresolvable refs fail the entire operation before any parse/index work begins.
  - Resolved Q3: Step Functions routing for large schemas reuses existing 500-field ingestion threshold (no separate re-sync threshold).
  - Resolved Q4: `update-available` is persisted only during explicit re-sync check/calls; no background or lightweight status probes.
  - Reflected all four decisions in Constraints, Proposed Behavior, and AE-05 sections.
- Rev 1 — 2026-06-02
  - Initial draft
  - Defined changed-commit full re-ingestion requirement for CDM re-sync
  - Added cross-folder `$ref` dependency resolution scope and safe-failure constraint
  - Added diff summary + no-op contract expectations
