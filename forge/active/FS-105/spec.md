# SPEC

## Title

Full Schema CRUD, Immutable Versioning, and Mapping Impact Management

---

## ID

FS-105

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-07-06  
Last Updated: 2026-07-06  
Type: cross-cutting

---

## Status

ready

---

## Revision

Rev: 2

---

## Summary

KeyRa will provide complete lifecycle management for user-owned schemas: safe draft editing, draft revisions, immutable versions, version-pinned mappings, role-aware impact analysis, explicit upgrade workflows, sample payload CRUD, and archive/delete safety.

User-owned schema GitHub publish/sync behavior is retired. KeyRa (DynamoDB/S3) is the source of truth for user-owned schemas, while CDM remains read-only and is ingested as immutable versions.

This revision resolves lifecycle atomicity, version identity/hash rules, JSON Schema support boundaries, async readiness semantics, migration scope, and deployment artifact contracts so backend/UI/migration/deployment work can execute consistently.

---

## Problem

Current behavior is inconsistent with safe schema lifecycle management:

- editing is partial and can be lossy for advanced/unknown JSON Schema constructs,
- user-schema GitHub publish/sync semantics still leak into active model language,
- mapping schema references are not fully normalized to immutable pinned versions,
- version lifecycle and concurrency/idempotency contracts are under-specified,
- impact/upgrade and migration contracts need stricter deterministic rules,
- deployment/schema artifact contracts need explicit immutable reference semantics.

---

## Goal

Enable non-technical users to safely create, edit, validate, version, reuse, archive, and manage user-owned schemas without silently breaking mappings or deployments, while preserving reproducibility and protecting TTFSM.

---

## Assumptions

- Branch context is `feature/dev-checkpoint-2`.
- Existing architecture documents cover all affected subsystems; FS-105 updates existing docs rather than creating a new subsystem document.
- Mapping DSL grammar remains unchanged; mapping configuration schema-reference contract changes.
- Phase 1 provides full structural CRUD for JSON Schema and inferred JSON only; full structural XSD editing is deferred.

---

## Current Context

Repository grounding confirms:

- Existing schema editor hooks/ops are reusable but current full-save path (`tree-to-json-schema`) is lossy for unsupported nested schema keywords.
- Schema API/adapters currently include legacy publish/sync-era surfaces and metadata compatibility fields.
- Persistence and deployment already have immutable snapshot patterns that can be extended for schema-version references.
- In-progress active specs (FS-019/101/102/103/104) do not block FS-105 but require compatibility alignment.
- Next available spec number is FS-105.

---

## Scope

### In Scope

- Canonical schema lifecycle model (draft/revision/version/archive/deprecate/delete-guard).
- Full user-owned JSON/inferred-JSON structural CRUD with safe non-lossy editing.
- Stable field identity sidecar model (`fieldId`) and version diff classification.
- Version-pinned mapping schema references for source/target/enrichment.
- Role-aware impact analysis and explicit mapping-upgrade preview/apply flow.
- Sample payload CRUD, default sample, and compatibility tracking independent of schema version creation.
- Version/index/impact/sample-validation status separation.
- Async orchestration for large/long-running operations.
- Deployment artifact manifest contracts with immutable schema-version refs.
- One-time migration covering active + historical artifacts.
- Retirement of non-CDM user-schema GitHub publish/sync behaviors.
- Updates to canonical architecture + product/DSL reference documentation.

### Out of Scope

- Full-fidelity structural XSD editing.
- Realtime collaborative editing.
- Automatic schema upgrades or DSL rewrites.
- Automatic deployment.
- Reintroducing user-schema GitHub publishing.

---

## Non-Goals

- DSL syntax change to reference `fieldId` directly.
- Runtime dependency on mutable latest schema content.
- Creating separate small-vs-large ingestion pipelines.

---

## Relevant Areas

- UI schemas: `ui/src/features/schemas/**/*`
- UI mappings: `ui/src/features/mappings/**/*`, `ui/src/routes/pages/MappingEditor.tsx`
- Adapter contracts: `ui/src/lib/api/*`, `ui/src/lib/types/domain.ts`
- Backend schema/mapping/deployment handlers: `src/lambda/schema/*`, `src/lambda/mapping/*`, `src/lambda/deployment/*`
- Persistence/schema services: `src/lib/persistence/*`, `src/lib/schema/*`
- Infra/orchestration: `template.yaml`, schema Step Functions resources
- Canonical docs to update:
  - `forge/architecture/{ui-application,backend-api,persistence-model,schema-ingestion,deployments,mapping-engine,infrastructure,INDEX}.md`
  - `specs/PRODUCT-TECHNICAL.md`
  - `specs/KEYRA-DSL-SPECIFICATION.md`

---

## Dependencies / Blockers

- Requires coordinated contract updates across backend/UI/adapters before implementation sequencing.
- Requires migration dry-run + parity report before cutover.
- Requires explicit retire/decommission plan for non-CDM user-schema GitHub route/permission/config surfaces.

---

## Constraints

- KeyRa is source of truth for user-owned schemas.
- Do not use `Published`, `Local`, `Global`, `Project-Level` as behavioral categories.
- CDM remains read-only and versioned immutably on re-sync.
- Mappings pin exact immutable versions; never resolve against dynamic latest.
- Untouched unsupported schema content must remain semantically equivalent.
- Draft update and version creation must be concurrency-safe and idempotent.
- Deployment execution remains artifact/snapshot-resolved and immutable.

---

## Proposed Behavior

### User Flow

1. User creates schema family (blank/upload/infer/duplicate) and gets mutable draft.
2. User edits draft via guided operations (validated add flow, guarded destructive actions, undo/redo, raw view).
3. User saves draft revisions and explicitly selects **Create version** to produce immutable versions (`v1+`).
4. Mapping creation defaults to latest usable non-deprecated version, but selected version is explicit and pinned.
5. New schema versions show update indicators; existing mappings remain on current pinned versions.
6. User runs upgrade preview, reviews impacts/suggestions/tests, explicitly accepts/apply, then saves new mapping revision.
7. Samples are managed at schema-family level; sample/default changes do not create schema versions.
8. User archives schema family for new selection hiding while preserving existing resolution/history/deployments.

### System Behavior

#### Canonical lifecycle state model

```text
Schema family
├── mutable current draft
├── zero or more draft revisions
└── zero or more immutable versions
```

Rules:

- One active draft per schema family in Phase 1.
- Draft stores `basedOnVersion`.
- New schema starts with draft and no versions.
- `Save draft` creates a draft revision only when canonical content changed.
- `Create version` captures one exact draft revision.
- After successful version creation, draft becomes clean and based on the new version.
- Restoring a version replaces current draft content only; immutable versions are never edited.
- If canonical content hash equals latest version, return `noChange` and allocate no new version number.
- Failed/cancelled version creation consumes no visible version number.

#### Version identity + hashing

- `schemaVersionId` is UUID-backed immutable identity.
- Unique key remains `(schemaId, version)` for monotonic numbering.
- `contentHash` is deterministic SHA-256 over canonical representation:
  - JSON Schema: deterministic canonical JSON (recursive key sorting + normalized JSON values).
  - XML/XSD: canonical XML strategy or exact normalized persisted bytes (single defined approach for implementation).

#### Version readiness separation

Version usability and derived artifact readiness are separated:

```ts
versionStatus: 'creating' | 'ready' | 'failed' | 'deprecated';
indexStatus: 'pending' | 'ready' | 'failed';
impactStatus: 'pending' | 'ready' | 'failed';
sampleValidationStatus: 'pending' | 'ready' | 'failed';
```

A version becomes usable when immutable content + structural validation + canonical tree + metadata commit succeed; indexing/impact/sample validation proceed asynchronously.

#### Supported JSON Schema dialects + capability matrix (Phase 1)

Accepted dialects:

- Draft 7
- 2019-09
- 2020-12

Guided editor capability matrix:

| Construct | View | Preserve | Guided edit |
| --- | ---: | ---: | ---: |
| `type` | Yes | Yes | Yes |
| `properties` | Yes | Yes | Yes |
| `required` | Yes | Yes | Yes |
| arrays/items | Yes | Yes | Supported subset |
| `enum` | Yes | Yes | Yes |
| numeric/string constraints | Yes | Yes | Defined subset |
| `$ref` / `$defs` | Yes | Yes | Restricted |
| `oneOf` / `anyOf` / `allOf` | Yes | Yes | Restricted/read-only |
| unknown extensions | Yes | Yes | Raw-only |

Product promise: full CRUD for KeyRa-supported editable structures, with lossless preservation and operation-level restrictions where safe modification is not provable.

#### Canonical safe editing representation

- Raw JSON Schema document is authoritative content.
- Guided edits are typed patch commands.
- Patch targets use canonical JSON Pointer, not display dot-path.
- Patches apply on a lossless AST/document model.
- Full resulting doc is validated before draft persistence.
- Untouched subtrees preserve keys/values semantically (reformatting allowed).

#### Stable field identity sidecar

Internal sidecar model (not injected into user raw schema by default):

```ts
interface SchemaNodeIdentity {
  schemaVersionId: string;
  fieldId: string;
  jsonPointer: string;
  parentFieldId?: string;
}
```

Rules:

- v1 generation assigns IDs for upload/inference.
- rename/move/type/required/description changes preserve `fieldId`.
- duplicate creates new IDs for duplicated subtree.
- delete + re-add creates new ID.
- restore from version restores that version’s IDs into draft.
- CDM uncertain rename lineage is suggestion-only; never auto-accepted.

#### Mapping impact + upgrade contract

- Impact extraction uses parsed DSL AST accessor traversal (not string search).
- Target impact uses canonical rule target paths.
- Upgrade apply requires mapping OCC + preview validity:

```ts
applySchemaUpgrade(mappingId, {
  expectedMappingRevision: number,
  previewId: string,
  acceptedSuggestions: string[],
});
```

Preview invalidates if mapping revision changed, destination version changed/unavailable, or suggestion baseline no longer matches.

Impact scope:

- update indicators/reports: current active mapping revisions,
- deletion guard: all retained mapping revisions + immutable mapping versions + deployment snapshots,
- library usage count: active mappings, with historical counts separate.

#### Sample selection precedence + bounded compatibility

Selection precedence:

1. mapping-specific selected sample (if exists and load-compatible),
2. schema-family default sample,
3. first compatible available sample,
4. none.

Deleting a sample referenced by mapping preferences:

- clear/migrate stale mapping preferences,
- show affected mapping count before deletion,
- do not treat editor preference as runtime deployment dependency.

Compatibility recalculation:

- eager: latest version + versions pinned by active mappings,
- lazy-on-view: unreferenced historical versions.

#### Archive/deprecate semantics

- Version deprecation supported in Phase 1 (`ready | deprecated`).
- Deprecated versions remain resolvable by existing mappings, hidden by default for new mapping selection but selectable via explicit reveal with warning.
- Archived schema family:
  - hidden from default new selection,
  - existing mappings pinned to archived versions may open/validate/save/deploy with warning,
  - existing mapping cannot switch another role to archived family,
  - family can be restored.

#### Deployment artifact schema reference contract

```ts
interface DeployedSchemaArtifactRef {
  schemaId: string;
  schemaVersion: number;
  schemaVersionId: string;
  contentHash: string;
  contentS3Key: string;       // immutable version-specific key
  parsedArtifactS3Key?: string;
}
```

Use immutable version-specific keys + hash verification; promote same artifact manifest unchanged across environments. Avoid unnecessary per-deploy schema recopy when immutable artifact keys already satisfy runtime isolation.

#### Migration contract

Migration covers:

- schema families/versions,
- active mappings,
- all retained mapping revisions,
- immutable mapping versions,
- deployment snapshots,
- project schema links,
- enrichment references,
- archived/legacy schemas still referenced,
- duplicate legacy records and orphaned refs.

Migration requirements:

- idempotent,
- restartable,
- dry-run/report mode,
- per-record failure reporting,
- no destructive cleanup until parity pass,
- rollback or compatibility-read path during cutover,
- unresolved-reference report.

#### GitHub removal boundaries

Retire only non-CDM user-schema repository behavior:

- non-CDM publish/sync Lambdas/routes/UI/state/env,
- deployment gates tied to user-schema Git sync.

Preserve:

- CDM read-only GitHub ingestion,
- GitHub Models AI integration,
- unrelated development GitHub integrations.

### Failure / Edge Behavior

- Draft OCC mismatch returns conflict with refresh guidance.
- Unsupported unsafe edit operation returns deterministic unsupported error; no lossy fallback save.
- Version create retries are idempotent by idempotency key.
- Index/impact/sample-validation failure degrades those features but does not invalidate a `ready` immutable version.
- Delete blocked responses enumerate exact blockers.

---

## Acceptance Examples

### AE-01 — New schema requires explicit version creation
Given a newly created/uploaded schema draft  
When user saves draft only  
Then it is not mapping-selectable until explicit **Create version** produces `v1`.

### AE-02 — Legacy schema migration creates immutable v1 without output drift
Given pre-migration schemas/mappings/deployments  
When migration runs  
Then schema content is captured as immutable `v1`, mappings pin to `v1`, and outputs are unchanged.

### AE-03 — Metadata-only family edits do not create new version
Given schema latest version `v3`  
When display metadata/default sample changes  
Then latest version remains `v3`.

### AE-04 — Structural edits require explicit new version
Given draft based on `v3`  
When field structure changes and user creates version  
Then immutable `v4` is created and older versions remain unchanged.

### AE-05 — Untouched unsupported content remains semantically equivalent
Given imported schema with unsupported nested keywords  
When unrelated field edit is saved  
Then untouched unsupported subtrees preserve all keys/values semantically.

### AE-06 — Add-field validates before insert
Given add-field dialog  
When required fields invalid/duplicate/malformed  
Then add is blocked and no placeholder node is inserted.

### AE-07 — Destructive edits require explicit summary confirmation
Given destructive change with descendants/mapping usage  
When user confirms action  
Then confirmation includes removed descendant count and affected mapping count.

### AE-08 — Existing mapping remains pinned after new schema version
Given mapping pinned to `v2`  
When `v3` is created  
Then mapping remains on `v2` with `Update available` indicator.

### AE-09 — Upgrade apply creates new mapping revision only after explicit acceptance
Given upgrade preview to newer schema  
When user accepts selected suggestions and confirms apply then saves  
Then a new mapping revision is created with updated schema version pin.

### AE-10 — No automatic DSL rewrites
Given rename/move suggestions are generated  
When user does not accept them  
Then DSL remains unchanged.

### AE-11 — Impact analysis is role-aware
Given same schema diff used as source/target/enrichment across mappings  
When impact report is generated  
Then breaking classifications and affected rules are role-specific.

### AE-12 — Stable identity classifies rename/move correctly
Given node rename + move while preserving `fieldId`  
When comparing versions  
Then diff reports rename/move rather than independent add/remove.

### AE-13 — CDM re-sync creates immutable new version only
Given CDM schema referenced by mappings  
When upstream CDM changes and re-sync runs  
Then new immutable version is created and existing mapping pins remain unchanged.

### AE-14 — Sample edits do not create schema version
Given schema at `v5`  
When sample is added/updated/deleted or default changes  
Then latest schema version remains `v5`.

### AE-15 — Default sample delete requires replacement or clear
Given default sample selected  
When deleting it  
Then user must choose replacement or explicitly clear default.

### AE-16 — Draft optimistic concurrency blocks stale overwrite
Given draft advanced in another tab  
When stale tab saves with old expected revision  
Then save is rejected with conflict.

### AE-17 — Archived family behavior for existing vs new mappings
Given schema family archived  
When opening existing pinned mapping  
Then mapping remains editable/deployable with warning; new mappings cannot select archived family.

### AE-18 — Permanent delete is blocked by immutable dependencies
Given schema referenced by retained mapping/deployment artifacts  
When delete is requested  
Then deletion is blocked with explicit blocker list.

### AE-19 — Deployment reproducibility across later schema changes
Given deployment snapshot references immutable schema-version artifacts  
When newer schema versions are created later  
Then deployed runtime behavior remains unchanged.

### AE-20 — User-schema Git publish/sync behavior retired
Given user-owned schema surfaces  
When viewing actions/status/deploy gating  
Then publish/sync-to-GitHub behavior is absent and not required.

### AE-21 — Version creation captures exact draft revision
Given create-version requested with `expectedDraftRevision=12`  
When draft revision 13 is saved concurrently  
Then created version captures revision 12 content exactly; revision 13 remains active draft.

### AE-22 — Version creation retry is idempotent
Given create-version request retried with same idempotency key  
When retry arrives after partial/slow processing  
Then system returns same resulting job/version without duplicate version allocation.

### AE-23 — No-op version request does not allocate new version number
Given draft canonical hash equals latest version hash  
When create-version is requested  
Then result is `noChange` and version sequence is unchanged.

### AE-24 — Index failure does not invalidate valid immutable version
Given version content/metadata committed successfully  
When indexing fails asynchronously  
Then version remains resolvable and selectable; index-dependent features show degraded status.

### AE-25 — Impact extraction uses parsed DSL, not text search
Given nested/complex expressions with multiple accessor calls  
When impact analysis runs  
Then referenced paths are discovered from parsed AST without text false matches.

### AE-26 — Historical artifacts are migrated
Given retained mapping revisions/versions and deployments  
When migration completes  
Then all retained artifacts carry immutable schema-version refs.

### AE-27 — Archived schema warning behavior in existing mapping
Given mapping pinned to archived schema version  
When user edits/saves/deploys mapping  
Then operations are allowed with warning and no forced migration.

### AE-28 — User-schema Git removal does not break CDM or AI
Given non-CDM Git publishing removed  
When CDM read-only sync and AI features are used  
Then both continue functioning.

### AE-29 — Stable field identity lifecycle rules hold
Given rename/move/duplicate/delete-readd operations  
When diffing identities  
Then rename/move preserve IDs; duplicate and delete-readd create new IDs.

### AE-30 — Sample fallback precedence is enforced after sample deletion
Given mapping-selected sample is deleted  
When Mapping Editor opens  
Then stale preference is cleared and fallback precedence selects next source.

---

## Open Questions

- none

---

## Verification Strategy

- **Unit tests:** safe patching, field identity sidecar lifecycle, no-change versioning, hash canonicalization, AST path extraction.
- **Integration tests:** lifecycle endpoints, OCC/idempotency, status transitions, impact/upgrade contracts, archive/delete guard behavior.
- **Adapter tests:** Http/local parity for schema lifecycle and sample semantics.
- **Migration tests:** idempotent dry-run + restart, historical artifact coverage, unresolved-reference reporting, parity of outputs pre/post.
- **E2E tests:** create/edit/version/pin/upgrade/archive/sample flows and retired publish/sync behaviors.

Performance targets:

| Operation | Target |
| --- | ---: |
| Cached Schema Detail render | visible content < 250ms |
| Draft save initiation p95 | < 1s |
| Draft save completion p95 | < 2s |
| Version create request acceptance p95 | < 1s |
| Normal schema version load p95 | < 2s |
| Impact summary cached load p95 | < 2s |
| Guided edit local response | < 100ms |
| Large-schema operation | async; progress visible < 2s |

---

## Task Generation Notes

- Cross-cutting decomposition by domain is required.
- Include explicit documentation update tasks for:
  - architecture docs,
  - `specs/PRODUCT-TECHNICAL.md`,
  - `specs/KEYRA-DSL-SPECIFICATION.md`.
- Keep UI tasks (`ui-task`) separate from backend/migration/deployment/docs tasks (`task`).
- Sequence:
  1) contract/documentation alignment,
  2) core lifecycle/persistence,
  3) API/orchestration/migration,
  4) adapters,
  5) UI,
  6) verification/performance gate.

---

## Change Log

- Rev 1 — 2026-07-06
  - Initial draft.
- Rev 2 — 2026-07-06
  - Removed remaining publish terminology for user schemas.
  - Added explicit lifecycle state machine and transition/atomicity rules.
  - Added UUID `schemaVersionId` + canonical content hashing decisions.
  - Added version-vs-index/impact/sample readiness status separation.
  - Added supported JSON Schema dialects and guided capability matrix.
  - Locked canonical editing representation to lossless AST + JSON Pointer patches.
  - Added stable `fieldId` sidecar storage model and lifecycle rules.
  - Added version idempotency/concurrency and upgrade OCC contracts.
  - Added sample precedence and bounded compatibility recalculation rules.
  - Clarified deployment schema artifact manifest strategy and immutable key usage.
  - Expanded migration scope and idempotent operational requirements.
  - Clarified GitHub removal boundaries (non-CDM only).
  - Added version deprecation semantics.
  - Added archive behavior rules for existing mappings.
  - Added concrete performance targets and AE-21 through AE-30.
