# SPEC

## Title

Project-Level Reusable Value Tables for Mapping Rules

---

## ID

FS-096  
Assigned sequentially. `FS` = Feature Spec.

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-19  
Last Updated: 2026-06-19  
Type: cross-cutting

If unknown during early drafting, use `TBD`.

`Type` indicates the primary execution domain. Used to route tasks to the correct agent (`task` or `ui-task`). Cross-cutting specs may produce tasks of mixed types — declare the type per task in that case.

---

## Status

draft

- `draft` = initial spec created, not yet refined
- `refining` = questions, tradeoffs, or repo grounding still being resolved
- `ready` = refined enough for reliable task generation and planning review
- `in_progress` = one or more tasks are being executed
- `completed` = implementation and verification finished
- `archived` = retired, replaced, or no longer relevant

This status tracks the overall lifecycle of the change, not just document editing.

This spec becomes part of the planning package together with its derived task set.

---

## Revision

Rev: 2

Rev bump required when any of the following materially change:

- intended behavior
- scope boundaries
- acceptance examples
- verification expectations
- materially affected system areas

See `Change Log` for revision history.

---

## Summary

KeyRa currently supports only inline `valueMap()` tables embedded in individual rules. This spec adds reusable, revisioned **project value tables** that can be referenced by mapping rules while preserving deterministic, offline-safe execution in browser preview and Lambda runtime. Project tables are owned and versioned at project scope, but each rule owns lookup direction, no-match behavior, and pinned revision adoption. Success is lower TTFSM through reusable mapping assets without introducing live runtime dependencies or silent behavior drift.

---

## Problem

Inline-only value maps force users to recreate the same lookup rows across multiple rules and mappings, causing repeated data entry, inconsistent copies, and brittle updates. There is no project-level reusable table with revision history, no pinned adoption workflow, and no usage visibility across mappings. This increases setup friction and makes safe change management hard, especially when business code tables evolve over time.

---

## Goal

Introduce project-owned reusable value tables with immutable revisions that mapping rules can reference via explicit directional lookups. Ensure saved mappings and deployments remain deterministic through pinned revisions and resolved lookup data embedded in mapping config/snapshot artifacts. Preserve inline `valueMap()` compatibility and support explicit user-controlled migration paths from inline to project scope.

---

## Assumptions

- Existing engine architecture remains pure TypeScript with zero runtime I/O dependencies.
- Browser preview and runtime Lambda must continue to execute from mapping config + execution input only.
- `ApiAdapter` remains the sole UI persistence interface; LocalStorage and HTTP behaviors must remain functionally equivalent.
- Existing mapping save/version/deploy separation and immutable deployment snapshot model remain canonical.
- Existing architecture docs (`ui-application.md`, `backend-api.md`, `persistence-model.md`, `mapping-engine.md`, `deployments.md`) are the correct update targets; no new top-level subsystem document is required.

---

## Current Context

Repository-grounded context loaded before drafting:

- `forge/architecture/INDEX.md` reviewed first; relevant architecture documents loaded: `ui-application.md`, `backend-api.md`, `persistence-model.md`, `mapping-engine.md`, `deployments.md`, `project-structure.md`.
- Related in-progress specs reviewed: FS-092 (mapping editor IA), FS-093 (multi-input/enrichment model), FS-094/FS-095 (smart builder model and parameter-aware actions).
- Current DSL/engine architecture documents only inline `valueMap` behavior and do not yet define reusable `valueTable(...)` accessor semantics.
- Current backend/persistence architecture does not yet model project-level value-table entities/revisions or mapping-to-table usage indexes.
- Active work includes FS-095 (UI-guided builder improvements) and should be kept compatible with any map-values method updates.
- Next available FS number, after scanning `forge/active/` and `forge/completed/`, is FS-096.

---

## Scope

### In Scope

- Product behavior and UX for reusable project value tables.
- Project-level value-table management route, list, editor, usage, archive/export/import/duplicate flows.
- Mapping Editor and Builder integration for project-table selection, direction selection, and pinned revision visibility.
- Inline vs project-level value table coexistence and conversion flow.
- Directional validity and uniqueness rules (including ambiguous reverse mappings).
- Immutable table revisioning and explicit mapping revision adoption flow.
- Mapping config schema additions for pinned table revision + resolved entries.
- DSL additions for `valueTable(tableKey, inputSideKey, outputSideKey)` and `valueMap` argument validation expansion.
- Engine parser/validation/execution changes for reusable table references using config-provided resolved data.
- ApiAdapter, LocalStorageAdapter, HttpAdapter contract updates.
- Backend API routes, request/response contracts, optimistic UI expectations.
- Persistence model for metadata, revisions, usage indexing, archive state, and canonical S3 row-payload storage.
- Preview, testing, deployment snapshot, promote, rollback behavior with pinned resolved data.
- Import/export/duplication behavior for mapping-only and project-level artifacts.
- Usage tracking and “newer revision available” notifications.
- Migration/backward compatibility strategy and automated test requirements.

### Out of Scope

- Company/global reusable table libraries across projects.
- More than two table sides/columns in one value table.
- Composite keys, range/wildcard/regex/effective-date matching.
- Environment-specific table values.
- Runtime API/database lookups for table data.
- Automatic conflict resolution for ambiguous reverse direction.
- Per-mapping row override layers on top of table revisions.
- Approval workflows/governance workflows for table changes.

---

## Non-Goals

- Replacing inline `valueMap()` as an authoring option.
- Making project value tables live runtime dependencies.
- Auto-upgrading mappings to latest table revision.
- Auto-applying AI suggestions that mutate table/rule state without explicit user confirmation.
- Coupling Save and Deploy operations.

---

## Relevant Areas

- `ui/src/features/projects/*` (Project Overview and project-level management surfaces)
- `ui/src/features/mappings/components/*` (Map values method UX in Builder/Editor)
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/local-storage-adapter.ts`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/lib/types/domain.ts`
- `src/engine/dsl/*`
- `src/engine/functions/lookup.ts`
- `src/engine/validate/*`
- `src/engine/types/*`
- `src/lambda/project/*`
- `src/lambda/mapping/*`
- `src/lambda/deployment/*`
- `src/lib/persistence/*`
- `tests/engine/*`
- `tests/lambda/*`
- `ui/src/**/*.test.{ts,tsx}`
- `forge/architecture/ui-application.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/persistence-model.md`
- `forge/architecture/mapping-engine.md`
- `forge/architecture/deployments.md`
- `forge/architecture/INDEX.md`

---

## Dependencies / Blockers

- Alignment with FS-092 Mapping Editor route boundaries and authoring-only posture.
- Alignment with FS-093 canonical mapping config evolution and snapshot compatibility rules.
- Alignment with FS-094/FS-095 smart builder action patterns for map-values UX updates.
- Requires architecture document updates across existing docs; no new architecture doc bootstrap required.

If none:
- none

---

## Constraints

- Mapping engine remains a pure TypeScript library with zero cloud/network dependencies.
- Engine execution must not fetch project value tables at runtime.
- Browser preview and runtime Lambda behavior must match for table lookups.
- Mapping config must remain self-contained, deterministic, exportable, and offline executable.
- Save and deploy remain separate actions.
- Deployment snapshots are immutable.
- Promotion reuses identical artifact.
- Rollback restores exact previously embedded table data.
- Project value table edits must never silently alter saved mappings or deployed environments.
- AI outputs remain suggestion-only and require explicit user acceptance.

---

## Proposed Behavior

### User Flow

1. User opens project-level Value Mappings management at `/projects/:projectId/value-mappings`.
2. User creates a project value table with name, description, side labels/keys/types, and rows (grid, paste, CSV import).
3. System computes direction validity (`Side A -> Side B`, `Side B -> Side A`) based on uniqueness of selected input side.
4. User saves table edits; system creates immutable next revision.
5. In Mapping Editor, user chooses Map values method, then selects table scope:
   - Project value table, or
   - Inline value map.
6. For project table selection, user explicitly chooses one valid direction using side labels (not generic A/B text).
7. Rule config stores pinned table revision + selected direction + no-match behavior + resolved lookup entries.
8. Later table edit creates new revision; existing mappings remain pinned until user explicitly reviews/adopts newer revision.
9. Adoption marks mapping changed/unsaved, reruns validation/tests, and requires save to persist updated mapping revision.
10. Deploy snapshot embeds exact resolved table data used by that mapping version; promotion and rollback preserve that exact data.

### System Behavior

#### Product and UX

- Add project-level value-table management route and Project Overview section with:
  - active table count,
  - mapping usage count,
  - manage action,
  - empty-state guidance.
- Value table list supports: search, sort, create/view/edit/duplicate/archive/export CSV/view usage/review stale mappings.
- Editor supports: row grid, add/delete rows, spreadsheet paste, CSV import/export, duplicate detection, direction-validity summary, explicit save.
- Phase 1 value types: `string | number | boolean`.
- Guided mapping UI disables invalid directions and surfaces duplicate-key diagnostics by value + conflicting rows.
- Builder panel shows compact table metadata and direction details; full table grid shown in modal/drawer/page (not narrow panel embed).

#### Table Ownership and Revisioning

- Project table definition is project-owned and direction-neutral.
- Each save creates immutable `ProjectValueTableRevision`.
- Project table record tracks `currentRevision` and status (`active|archived`).
- Mapping rule chooses direction and no-match behavior per usage.
- Deletion blocked when referenced; archive allowed with continued execution for existing pinned mappings.

#### DSL and Engine

- Preserve existing inline syntax:
  - `valueMap(inputExpr, { ... }, fallback)`.
- Add accessor syntax:
  - `valueMap(inputExpr, valueTable(tableKey, inputSideKey, outputSideKey), fallback)`.
- `valueMap` mappings argument expands from object-literal-only to either:
  - object literal, or
  - valid `valueTable(...)` object-producing expression.
- Parser validates grammar compatibility and function arity.
- Static validation detects unknown table key, unknown side key, same-side usage, invalid direction, duplicate input-side keys, missing pinned revision/resolved data, type mismatches, archived-table-new-selection rule violations.
- Runtime lookup uses resolved entries embedded in mapping config only.

#### Data Models

Recommended canonical entities:

```ts
interface ProjectValueTable {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description?: string;
  sideA: { key: string; label: string; type: 'string' | 'number' | 'boolean' };
  sideB: { key: string; label: string; type: 'string' | 'number' | 'boolean' };
  currentRevision: number;
  status: 'active' | 'archived';
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy?: string;
}

interface ProjectValueTableRevision {
  valueTableId: string;
  revision: number;
  sideA: { key: string; label: string; type: 'string' | 'number' | 'boolean' };
  sideB: { key: string; label: string; type: 'string' | 'number' | 'boolean' };
  rows: Array<{
    id: string;
    sideAValue: string | number | boolean;
    sideBValue: string | number | boolean;
    description?: string;
  }>;
  directionSupport: { aToB: boolean; bToA: boolean };
  createdAt: string;
  createdBy?: string;
}
```

Recommended mapping config addition (resolved self-contained form):

```json
{
  "rules": [
    {
      "target": "Order.status",
      "expression": "valueMap(source(\"status\"), valueTable(\"order-status\", \"oms-status\", \"cdm-status\"), \"UNKNOWN\")",
      "valueTableRef": {
        "scope": "project",
        "valueTableId": "vt_123",
        "tableKey": "order-status",
        "revision": 4,
        "inputSideKey": "oms-status",
        "outputSideKey": "cdm-status",
        "inputType": "string",
        "outputType": "string",
        "resolvedEntries": [
          { "in": "confirmed", "out": "OPEN", "rowId": "r1" },
          { "in": "shipped", "out": "COMPLETED", "rowId": "r3" }
        ],
        "sourceMeta": {
          "tableName": "Order Status Codes",
          "revisionCreatedAt": "2026-06-19T00:00:00.000Z"
        }
      },
      "noMatchBehavior": {
        "mode": "fallback_value",
        "fallbackValue": "UNKNOWN"
      }
    }
  ]
}
```

Inline usage remains supported and unchanged.

#### Revision Adoption and Update Review

- Mapping pinned revisions do not auto-update.
- UI shows newer revision availability when present.
- Adoption flow shows row diff (added/removed/changed), side label/type changes, direction-support impact, duplicate-key impact, and test impact summary.
- Explicit adoption only; save creates new mapping revision/version flow remains unchanged.

#### Usage Tracking

- Project table usage view shows mapping references with mapping version, pinned revision, selected direction, latest revision status, direction support status against latest, and navigation links.
- Mapping save/update pipelines maintain usage index records for quick lookup.

#### Backend API and Persistence Decisions (Resolved)

- **Revision row storage (resolved):**
  - Store the complete row payload for **every** project value-table revision as an immutable JSON object in S3.
  - DynamoDB stores only metadata and index-oriented fields (table metadata, revision metadata, S3 object key, content hash, row count, direction-support flags, status, timestamps, usage/index records).
  - No row-count or serialized-size threshold path is used in Phase 1.
  - S3 is the single canonical location for revision row payloads across all table sizes.

- **Revision diff API shape (resolved):**
  - Diff responses always include a full-summary block for the entire comparison (added/removed/changed/unchanged counts plus direction-support impact).
  - Row-level `changes` are paginated and include complete before/after row payloads for the requested page.
  - Cursor pagination is deterministic.
  - Recommended defaults: `pageSize=100`, maximum `pageSize=500`.
  - Small diffs may be fully returned in the first page.
  - Phase 1 computes diffs by loading both immutable S3 revision objects; persisted/cached derived diff artifacts are deferred until performance evidence requires them.

#### Deployment and Runtime

- Deployment artifacts embed exact resolved table data for each rule usage.
- Runtime execute uses deployed artifact only; no project-table fetch at execution time.
- Existing deployed environments remain unaffected by project table edits until new mapping save+deploy.

#### Import/Export/Duplicate

- Project export includes table metadata and required revisions referenced by exported mappings.
- Mapping-only export includes pinned resolved entries so it remains executable without project table availability.
- Project duplication copies active tables and required revisions; mapping references rewritten to duplicated resources; resolved mapping data preserved.
- CSV import supports column mapping/confirmation, type validation, duplicate detection, preview, row-level errors.

### Failure / Edge Behavior

- Duplicate input values on selected input side -> direction invalid.
- Null/blank input-side rows invalidate that direction.
- Guided UI disables invalid directions.
- Raw DSL with invalid direction fails validation.
- Unknown table/side key or same input/output side fails validation.
- Missing resolved table data or missing pinned revision fails validation/execution preflight.
- No-match behavior obeys rule-level mode only:
  - return null + warning,
  - return input value,
  - return fallback value (type-compatible).
- Archived table cannot be newly selected; existing pinned mappings remain executable.
- Referenced table deletion blocked with conflict diagnostics.

---

## Acceptance Examples

### AE-01 — Create project value table

**Given**
- project has no value tables

**When**
- user creates a table with Side A/Side B labels, keys, types, and rows

**Then**
- table is stored as active with immutable revision `1`
- direction support is computed and shown

### AE-02 — Spreadsheet paste/import rows

**Given**
- value table editor is open

**When**
- user pastes or imports CSV rows

**Then**
- rows are parsed with type validation and row-level errors
- user can preview and save valid result

### AE-03 — Direction validity computed by uniqueness

**Given**
- table rows contain duplicate values on one side

**When**
- system computes direction support

**Then**
- only directions with unique input-side values are marked valid
- duplicate value and conflicting rows are identified

### AE-04 — Select project table in Builder

**Given**
- mapping rule uses Map values

**When**
- user selects `Project value table`

**Then**
- picker shows table labels, direction support, entry count, usage count
- user can choose existing table or create new inline/project table

### AE-05 — Explicit direction selection

**Given**
- selected project table supports at least one direction

**When**
- user chooses lookup direction

**Then**
- side labels are used in UI
- preview/type/no-match/DSL/diagnostics update for chosen direction

### AE-06 — Invalid direction disabled in guided mode

**Given**
- selected reverse direction is ambiguous

**When**
- user opens direction selector

**Then**
- invalid direction is disabled with reason

### AE-07 — Invalid direction rejected in raw DSL

**Given**
- raw DSL uses invalid project-table direction

**When**
- validation runs

**Then**
- validation fails with table/revision/direction/duplicate details

### AE-08 — Inline valueMap compatibility

**Given**
- existing mapping uses inline object literal `valueMap`

**When**
- mapping is parsed/validated/previewed/saved/deployed/rolled back

**Then**
- behavior remains unchanged

### AE-09 — Save inline table as project table

**Given**
- rule currently uses inline table

**When**
- user chooses convert/promote and confirms

**Then**
- project table is created
- rule updates to project table reference only after confirmation

### AE-10 — Mapping pins table revision

**Given**
- mapping selects project table revision 3

**When**
- mapping is saved

**Then**
- config stores pinned revision metadata + resolved entries

### AE-11 — Editing table creates new revision

**Given**
- project table current revision is 3

**When**
- user edits and saves rows

**Then**
- revision 4 is created immutably
- revision 3 remains unchanged

### AE-12 — Pinned mapping unaffected by table edits

**Given**
- mapping is pinned to revision 3
- project table current revision becomes 4

**When**
- mapping is loaded/executed without adoption

**Then**
- mapping continues using revision 3 resolved entries

### AE-13 — Explicit revision adoption

**Given**
- newer table revision exists

**When**
- user reviews diff and adopts newer revision

**Then**
- mapping is marked changed/unsaved
- validation/tests rerun

### AE-14 — No-match behavior: return null warning

**Given**
- lookup has no match
- mode = return null

**When**
- rule executes

**Then**
- output null is returned
- warning includes table/revision/direction/input value

### AE-15 — No-match behavior: return input value

**Given**
- lookup has no match
- mode = return input

**When**
- rule executes

**Then**
- original input value is returned with trace metadata

### AE-16 — No-match behavior: fallback value

**Given**
- lookup has no match
- mode = fallback value

**When**
- rule executes

**Then**
- fallback is returned if type-compatible
- invalid fallback type fails validation

### AE-17 — Offline preview determinism

**Given**
- browser has no backend connection

**When**
- preview runs for mapping using project table

**Then**
- execution succeeds using resolved entries in mapping draft/config

### AE-18 — Deployment snapshot immutability

**Given**
- mapping version deployed with table revision 3

**When**
- project table later reaches revision 5

**Then**
- existing deployed envs and snapshot remain on revision 3 data

### AE-19 — Promotion reuses identical artifact

**Given**
- DEV deployment artifact includes table revision 3 entries

**When**
- promotion to PREPROD/PROD occurs

**Then**
- same artifact identity/data is reused unchanged

### AE-20 — Rollback restores embedded table data

**Given**
- rollback to prior snapshot is requested

**When**
- runtime activates rollback artifact

**Then**
- original embedded table revision data is restored exactly

### AE-21 — Delete referenced table blocked

**Given**
- table is referenced by one or more mappings

**When**
- delete is requested

**Then**
- operation is rejected with usage details

### AE-22 — Archive behavior

**Given**
- table is archived

**When**
- user creates new rule

**Then**
- archived table cannot be selected
- existing pinned mappings still execute

### AE-23 — Adapter parity

**Given**
- LocalStorageAdapter and HttpAdapter modes

**When**
- user performs value-table CRUD/revision/usage flows

**Then**
- behavior and response semantics are equivalent

### AE-24 — Diagnostics registry coverage

**Given**
- value-table reference errors occur

**When**
- parse/validate/execute runs

**Then**
- stable diagnostic codes identify table/revision/direction/rule context

---

## Open Questions

- none

---

## Verification Strategy

- Engine unit/integration tests:
  - parser + validator grammar and diagnostics for `valueTable(...)` (AE-07, AE-24)
  - `valueMap` inline and project-table argument handling (AE-08, AE-10, AE-16)
  - direction uniqueness and ambiguous reverse behavior (AE-03, AE-06, AE-07)
  - runtime lookup and fallback modes (AE-14/15/16/17)
- Backend tests:
  - value-table CRUD/revision/archive/usage APIs, conflict blocks, diff endpoints (AE-01/02/11/21/22)
  - mapping-save pin + resolved data embedding + adoption workflows (AE-10/12/13)
  - export/import/duplicate contracts (AE-02/09 plus export invariants)
  - diff endpoint pagination/summary contract and deterministic cursor behavior (resolved Q2)
- Deployment/runtime tests:
  - snapshot embedding immutability, promotion identity, rollback correctness (AE-18/19/20)
- UI tests:
  - project management route/list/editor flows and direction validity UX (AE-01/02/03/04/05/06)
  - Mapping Builder project-table selection/pinning/review newer revision/adopt flow (AE-04/05/10/13)
  - inline/project conversion flows and archived behavior (AE-09/22)
- Adapter parity tests:
  - LocalStorageAdapter vs HttpAdapter contract equivalence for all value-table operations (AE-23)
- Quality gates:
  - typecheck, lint, targeted unit/integration suites in touched domains.

---

## Task Generation Notes

- This is cross-cutting; split tasks by domain and assign `Agent` per task:
  - UI surfaces and React interactions -> `ui-task`
  - DSL/engine/backend/persistence/architecture -> `task`
- Include an explicit architecture update task (`Agent: task`) because existing subsystems are materially impacted.
- Keep engine parsing/validation work separate from runtime execution behavior to reduce risk.
- Keep backend API/persistence work separate from UI integration work.
- Keep adapter contract/model updates explicit to guarantee LocalStorage/HTTP parity.
- Include deployment snapshot invariants in dedicated backend/runtime task coverage.
- If spec revisions materially change contracts, regenerate affected tasks to avoid drift.

---

## Change Log

- Rev 2 — 2026-06-19
  - Resolved Q1: all value-table revision row payloads are stored in S3 as immutable JSON (no size threshold split path).
  - Resolved Q2: revision diff API returns full summary + paginated row-level before/after changes with deterministic cursor pagination (default 100, max 500).
  - Updated persistence/API behavior sections to codify these decisions.

- Rev 1 — 2026-06-19
  - Initial draft
  - Defines project-level reusable value tables, immutable revisions, mapping pinning, DSL/engine changes, API/persistence contracts, and phased cross-domain tasks.
