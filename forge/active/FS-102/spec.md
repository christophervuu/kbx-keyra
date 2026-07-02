# SPEC

## Title

Global Value Mapping Library, Project Inheritance, Overrides, and Match Policies

---

## ID

FS-102

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

Rev: 1

---

## Summary

KeyRa currently supports reusable project-scoped value tables (`valueTable(...)`) with pinned revisions, resolved entries, and deterministic deployment/runtime behavior. This spec extends that model into a Global Value Mapping Library that projects can link by pinned global revision and customize with lightweight overlays (override/add/exclude) instead of full table copies.

The change introduces explicit match-mode policies (`exact`, `ignore-case`) while preserving existing `valueMap()` behavior defaults and fallback/null semantics. It also defines update-review flows, orphaned override handling, export/import portability, and immutable deployment snapshot requirements so runtime behavior remains deterministic.

---

## Problem

Project-only value mappings force users to recreate common business code tables across projects, creating drift and increasing time-to-first-successful-mapping. Existing tables do not distinguish standard/global values from project exceptions, and updating shared value sets across projects is manual.

Additionally, `valueMap()` currently performs exact key matching only. Users receiving inconsistent source casing must normalize data manually before lookup, creating repetitive authoring overhead and avoidable mapping complexity.

---

## Goal

Enable centrally managed, versioned global value maps that can be linked into projects with explicit revision pinning and safe project-level customization. Add explicit, backward-compatible text match policies so mappings can choose exact or case-insensitive string lookup without changing existing behavior.

Success means:
- reusable global maps reduce duplicate setup work,
- project exceptions are overlay-based and stable via row IDs,
- deployments remain immutable/deterministic,
- browser/Lambda execution parity is preserved,
- legacy mappings continue to execute unchanged.

---

## Assumptions

- Existing project value-table architecture from FS-096 is the canonical baseline and should be extended, not replaced.
- Mapping rules continue to persist pinned, resolved lookup rows for deterministic execution (`valueTableRef.resolvedEntries` pattern).
- Deployment runtime must remain no-live-fetch for mutable value-map data.
- Existing DSL `valueMap(value, mappings, fallback?)` remains supported.
- Existing project value tables may need terminology migration to value maps, but compatibility aliases are retained in API/storage contracts during transition.

---

## Current Context

Repository grounding (confirmed):

- Canonical project lookup reference model today is metadata on each rule (`rule.valueTableRef`) with embedded `resolvedEntries`, consumed by engine lookup and runtime snapshots:
  - `src/engine/types/config.ts`
  - `src/engine/functions/lookup.ts`
  - `src/engine/validate/value-tables.ts`
  - `src/lambda/runtime/execute.ts`
- Current DSL supports `valueMap(..., { ... }, fallback?)` and `valueMap(..., valueTable(tableKey, inputSideKey, outputSideKey), fallback?)`.
- Current persistence is DynamoDB metadata + immutable S3 row payload per revision:
  - `ValueTables` and `ValueTableRevisions` in `forge/architecture/persistence-model.md`
  - implementation in `src/lib/persistence/value-tables.ts` and `src/lambda/project/value-tables.ts`
- Current project API surface is `/projects/:id/value-tables*` and `/value-tables/*` with resolve endpoint returning pinned `resolvedEntries`.
- Deployment architecture already codifies immutable snapshot behavior and no runtime table fetch.
- Decision: UI and new public domain contracts use **Value Mapping** terminology, preferred API surface is `/value-maps`, and `/value-tables` remains a temporary compatibility alias routed through the same canonical service.

Related in-progress specs checked: `forge/active/FS-019/spec.md`, `forge/active/FS-101/spec.md` (no scope conflict).

Next available FS number determined from `forge/active` + `forge/completed`: **FS-102**.

---

## Scope

### In Scope

- Global value-map asset model, metadata, status, revision history, and usage reporting.
- Immutable global revisions with stable row identity (`rowId`).
- Project link model to pinned global revision plus project overlay revision.
- Overlay operations: override inherited row, add project row, exclude inherited row.
- Effective map resolution algorithm and provenance metadata.
- Update-available detection and review/accept workflow with orphan handling.
- Match-mode model (`exact` | `ignore-case`) at map default and usage override levels.
- Direction-aware collision validation and diagnostics.
- Backend APIs for global maps, project links/overlays, update review/accept, promotion.
- Mapping Builder and project/global value mapping UI updates.
- Export/import/duplication behavior for pinned global revisions and overlays.
- Deployment snapshot inclusion of fully resolved effective rows + selected match/direction/fallback.
- Migration of existing project value tables/maps to new scoped model.
- Architecture document updates and index updates.

### Out of Scope

- RBAC/approval workflows for global map changes.
- Automatic push of global revisions into linked projects.
- Runtime fuzzy/regex/trim/punctuation/accent-insensitive matching.
- Environment-specific overlays or mapping-specific row overlays.
- Runtime lookup against mutable global data stores.

---

## Non-Goals

- Replace `valueMap()` with a new incompatible function family.
- Introduce locale-specific case rules in this iteration.
- Add wildcard/range/date-range value-map row semantics.
- Auto-merge project maps into global library by name similarity.

---

## Relevant Areas

- `src/engine/types/config.ts`
- `src/engine/functions/lookup.ts`
- `src/engine/validate/value-tables.ts`
- `src/engine/diagnostics/codes.ts`
- `src/lambda/project/value-tables.ts` (or renamed/superseding value-maps handlers)
- `src/lambda/project/index.ts`
- `src/lib/persistence/value-tables.ts` (or renamed/superseding value-maps persistence)
- `src/lib/persistence/types.ts`
- `src/lambda/runtime/execute.ts`
- `src/lambda/deployment/runtime-relay.ts`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/lib/api/local-storage-adapter.ts`
- `ui/src/lib/types/*`
- `ui/src/features/projects/components/ProjectValueMappingsPage.tsx`
- `ui/src/routes/pages/MappingEditor.tsx`
- `ui/src/features/mappings/lib/smart-builder-expression-generator.ts`
- `specs/KEYRA-DSL-SPECIFICATION.md`
- `forge/architecture/{mapping-engine.md,backend-api.md,persistence-model.md,ui-application.md,deployments.md,INDEX.md}`

---

## Dependencies / Blockers

- Depends on FS-096 baseline contracts (project value-table architecture) as starting point.
- Requires coordinated migration plan across backend, UI adapter layer, and DSL docs to avoid contract split.
- No external system blocker identified.

---

## Constraints

- Preserve backward compatibility for existing expressions and snapshots.
- Keep browser/Lambda behavior deterministic and equivalent.
- Do not introduce runtime fetch of mutable global/project value-map stores during transform execution.
- Preserve explicit save/deploy separation.
- Collision handling must be deterministic and blocking (no last-row-wins fallback).
- Use one canonical persistence approach; avoid arbitrary DynamoDB/S3 threshold split.
- Do not perform a big-bang storage/resource rename in this feature.

---

## Proposed Behavior

### User Flow

1. User creates and manages reusable global maps in `/value-mappings`.
2. Editing a global map creates a new immutable revision; linked projects remain pinned.
3. In project Value Mappings, user links a global map revision or creates project-only map.
4. Project can customize linked map by explicit overrides, additions, and exclusions with visible provenance.
5. If newer global revision exists, project shows update available and offers review before accept.
6. Mapping Builder lets user select direction, match policy, and fallback behavior, then preview effective rows.

### System Behavior

- `ValueMapScope = "global" | "project"`.
- UI and new public contracts use **Value Mapping** naming; API preference is `/value-maps` with `/value-tables` compatibility aliases.
- One canonical `ValueMapService`/repository abstraction serves both preferred and compatibility routes.
- Every row has stable `rowId`; overlay operations reference inherited row IDs.
- Project link persists pinned global revision + overlay revision + overlay entries only (no full copy of inherited rows).
- Persistence model extends existing value-table asset + immutable revision structures with scope/ownership/status/revision metadata; no parallel global-map asset tables are introduced.
- Project-link and overlay entities are added to the same canonical persistence abstraction.
- Effective map resolution order:
  1. pinned global revision rows
  2. remove excluded rows
  3. apply overrides
  4. add project additions
- DSL and binding behavior:
  - Inline lookup extends to `valueMap(value, mappings, fallback?, matchMode?)`.
  - Existing signatures remain supported (`valueMap(value, mappings)` and `valueMap(value, mappings, fallback)`).
  - Reusable project/global map bindings keep lifecycle data in rule metadata (id/revision/overlay/direction/matchMode/fallback), not DSL args.
  - Reusable bindings are resolved into a pure executable lookup before engine execution.
- Match policy:
  - default remains `exact` for migrated and existing usages,
  - optional `ignore-case` normalizes **lookup input keys only** via locale-independent `String.prototype.toLowerCase()` on strings,
  - output value is returned exactly as configured.
- Ignore-case normalization exclusions: no trim, no accent folding, no punctuation stripping, no locale-specific mapping, no type casting.
- Same shared normalization function is used for collision validation and runtime lookup.
- Required fixtures include ASCII, accented strings, Turkish `I/İ`, and German `ß`.
- Usage-level match/fallback overrides are persisted into mapping revision/snapshot as explicit resolved behavior.
- Deployment snapshot stores effective rows with resolved direction/match/fallback and pinned global + overlay revisions.
- Mapping dependency states:
  - `current`
  - `needs-review`
  - `invalid`
- Publishing a new global revision marks project links `update available` only.
- Accepting a global revision update or changing effective overlay/default marks affected mappings `needs-review` without auto-creating mapping versions.
- Mapping review + save creates a new mapping version; existing environment-stale behavior applies after save.

### Failure / Edge Behavior

- Duplicate keys for active direction/match mode produce blocking diagnostics.
- Ignore-case collisions are blocked even if outputs match.
- Project addition colliding with inherited normalized key requires explicit user conversion to override or value change.
- Orphaned overlays (inherited row removed in candidate global revision) block update acceptance until resolved.
- Unlink/delete operations are blocked when map is referenced by project mappings.
- Archived global maps cannot be newly linked but remain valid for existing links and snapshots.
- New deployment is blocked while mapping dependencies are `needs-review` or `invalid`.
- Import with unavailable referenced global revision requires explicit resolution with choices:
  1. Create project-only copy (recommended primary action),
  2. Choose another global value mapping,
  3. Cancel import.
- Import must never silently relink to latest or silently detach.

---

## Acceptance Examples

### AE-01 — Global map creation and immutable revisions

**Given**
- user is in Global Value Mapping Library

**When**
- user creates `Order Status` and later edits rows/defaults and saves

**Then**
- revision `1` remains immutable and viewable
- save creates revision `2`
- linked projects remain pinned to previous revision until explicit acceptance

### AE-02 — Project link with inherited state

**Given**
- global map `order-status` revision `5` exists

**When**
- project links the map

**Then**
- project link stores pinned global revision `5`
- project state is `inherited`
- no overlay entries are created initially

### AE-03 — Override/add/exclude overlay behavior

**Given**
- project linked to global revision with row IDs

**When**
- user overrides one inherited row, adds one new row, excludes one inherited row

**Then**
- global rows stay unchanged
- overlay stores exactly 3 entries with explicit operations
- effective rows show provenance for override/add/exclude

### AE-04 — Stable row ID preserves override across global edits

**Given**
- project override references inherited `rowId=R1`

**When**
- global revision updates input/output text of row `R1`

**Then**
- project override remains attached to `R1`
- project customization is not silently dropped

### AE-05 — Update review and orphan handling

**Given**
- project pinned to v3 with overlay on row `R9`
- global v5 removes row `R9`

**When**
- user reviews update to v5

**Then**
- overlay entry is flagged orphaned
- accept update is blocked until orphan resolution is selected

### AE-06 — Exact mode backward compatibility

**Given**
- existing map usage with no explicit match mode

**When**
- mapping executes after migration

**Then**
- match behavior is exact and unchanged
- existing fixtures produce identical results

### AE-07 — Ignore-case lookup behavior

**Given**
- row `confirmed -> In_Progress`
- usage match mode `ignore-case`

**When**
- runtime input is `CONFIRMED`

**Then**
- lookup matches and returns `In_Progress`
- no trim/fuzzy/punctuation/accent normalization occurs

### AE-08 — Direction-specific collision validation

**Given**
- rows are unique on side A but duplicated (normalized) on side B

**When**
- user configures direction `B -> A` with ignore-case

**Then**
- configuration is blocked with duplicate-normalized-key diagnostic
- `A -> B` can still be valid

### AE-09 — Builder persistence of resolved behavior

**Given**
- user picks linked global map, direction, usage match override, and fallback override

**When**
- mapping is saved

**Then**
- saved mapping revision includes explicit resolved map reference/revisions, direction, match mode, fallback, and effective rows needed for deterministic runtime

### AE-10 — Deployment snapshot determinism

**Given**
- mapping deployed with linked global revision and overlay

**When**
- global map and project overlay are edited later

**Then**
- existing deployment runtime behavior remains unchanged
- runtime executes using snapshot-embedded effective rows only

### AE-11 — Archive and unlink protections

**Given**
- global map is referenced by at least one project and mapping

**When**
- user archives map or attempts unlink/delete where in use

**Then**
- archive succeeds and blocks new links only
- unlink/delete is blocked with usage details for referenced mappings

### AE-12 — Export/import portability with missing global revision

**Given**
- exported project references global map revision unavailable in destination

**When**
- user imports project

**Then**
- import requires explicit resolution before completion
- system offers:
  - **Create project-only copy** (recommended primary action) using exported effective rows,
  - **Choose another global value mapping**,
  - **Cancel import**
- system does not silently relink to newer global revision or silently detach

### AE-13 — Dependency review lifecycle and versioning

**Given**
- mapping depends on linked global value mapping

**When**
- user accepts a new linked global revision or changes effective overlay/default

**Then**
- affected mapping dependency state becomes `needs-review`
- mapping version is not auto-created
- after review and save, a new mapping version is created and standard stale rules apply

### AE-14 — Deployment gate on dependency state

**Given**
- mapping dependency state is `needs-review` or `invalid`

**When**
- user attempts new deployment

**Then**
- deployment is blocked with deterministic dependency-state diagnostics

---

## Open Questions

- none

---

## Verification Strategy

- Unit tests (engine + persistence):
  - AE-03, AE-04, AE-06, AE-07, AE-08, AE-13
- Backend integration tests:
  - AE-01, AE-02, AE-05, AE-11, AE-12, AE-14
- Deployment/runtime tests:
  - AE-09, AE-10, AE-14
- UI component/integration tests:
  - AE-01, AE-02, AE-03, AE-05, AE-08, AE-11, AE-12
- Browser/Lambda parity fixtures:
  - AE-06, AE-07, AE-08, AE-10 (including ASCII/accented/Turkish I/ß cases)
- Migration verification:
  - run pre/post fixture equivalence for existing mappings and snapshots
- Build/type/lint gates for touched areas.

---

## Task Generation Notes

- Split by execution domain:
  - `task`: architecture, engine/DSL, backend APIs, persistence/migration, deployment, test infra/docs.
  - `ui-task`: global/project mapping surfaces and Mapping Builder integration.
- Sequence high risk work first:
  1) architecture/domain contracts,
  2) persistence + API contracts,
  3) engine/DSL + diagnostics,
  4) UI integration,
  5) snapshot/export/import,
  6) parity/verification/documentation.
- Ensure one dedicated architecture update task is included and updates `forge/architecture/INDEX.md`.

---

## Change Log

- Rev 1 — 2026-07-01
  - Initial draft for global value mapping library + project inheritance overlays + match policy expansion, grounded in FS-096 implementation and architecture baselines.
  - Resolved Q1–Q6 with final contracts for Value Mapping terminology and `/value-maps` preferred APIs, `/value-tables` compatibility aliases, canonical single-service persistence extension strategy, `valueMap(..., fallback?, matchMode?)` inline expansion, locale-independent `toLowerCase()` normalization policy, mapping dependency lifecycle/deploy gating, and explicit import resolution choices.
