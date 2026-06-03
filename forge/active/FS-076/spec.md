# SPEC

## Title

FS-076 — CDM Integration Foundation (Read-Only, CommonDataModels-only)

---

## ID

FS-076

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

Implement the first production CDM integration slice for KeyRa focused strictly on read-only schema linking and manual sync from `KBXT/KBX-Canonicals` under `JSONSchemas/CommonDataModels/`. Users can browse CDM schema files, link a selected schema to a project, and explicitly re-sync later while seeing trustworthy sync state. CDM-linked schemas must be clearly labeled and protected from all edit/replace/remove/publish/promote actions. The flow must not invoke any GitHub write operation.

---

## Problem

KeyRa currently has placeholder GitHub integration methods and no end-to-end CDM linking path. Users cannot safely connect projects to canonical CDM schemas, cannot manually re-sync when upstream changes, and cannot trust sync indicators for CDM provenance. Without this foundation, schema governance is inconsistent and risks accidental mutation of canonical sources.

---

## Goal

Deliver a working CDM-only integration foundation where users can:

1. Browse CDM schema files from GitHub limited to `JSONSchemas/CommonDataModels/`.
2. Link a CDM schema to a project with persisted source metadata (`origin`, `repo`, `repoId`, `branch`, `path`, `commitSha`).
3. Trigger explicit on-demand re-sync for linked CDM schemas.
4. Reliably see sync states (`synced`, `update-available`, `sync-failed`).
5. Experience hard read-only UX enforcement for CDM schemas.
6. Complete all CDM operations without any GitHub write calls.

---

## Assumptions

- `KBXT/KBX-Canonicals` is accessible via backend GitHub API credentials in backend mode.
- The canonical CDM browse root for this phase is fixed to `JSONSchemas/CommonDataModels/`.
- CDM-linked schemas are represented as normal schema records with `origin: 'cdm'` plus source metadata.
- Existing Schema Detail and Project Overview surfaces remain the primary UI entry points for schema actions.
- Re-sync remains user-triggered only (no webhook or scheduled auto-sync in this phase).

---

## Current Context

- `ui/src/lib/api/types.ts` already defines GitHub integration adapter methods (`listCdmSchemas`, `linkCdmSchema`, `syncCdmSchema`), but `HttpAdapter` and `LocalStorageAdapter` currently return `FEATURE_NOT_ENABLED`/offline errors for CDM operations.
- `ui/src/lib/types/domain.ts` includes GitHub source metadata fields (`repo`, `branch`, `path`, `commitSha`) but does not currently include `repoId`.
- Existing schema UI surfaces already contain CDM vs non-CDM action branching and placeholder re-sync actions (`SchemaActions`, `SchemaGitStatus`, schema cards).
- Architecture docs (`ui-application.md`, `backend-api.md`, `phase-1-readiness.md`, `project-structure.md`) already cover GitHub integration as an existing subsystem area with deferred implementation details.
- There are no related CDM integration specs currently in `forge/active/` (only FS-019 is active and unrelated).

---

## Scope

### In Scope

- Backend read-only GitHub integration for listing files under `JSONSchemas/CommonDataModels/` only, one directory level per request (client-driven navigation).
- Backend link operation that creates/returns a project-attachable schema record with required CDM source metadata.
- Backend re-sync operation for linked CDM schema records (manual trigger only).
- Lightweight status-refresh reads that also compute `update-available` without requiring re-sync execution.
- CDM sync state model and UI presentation:
  - `synced`
  - `update-available`
  - `sync-failed`
- Project Overview “Link from CDM Library” flow constrained to CommonDataModels results only.
- CDM badge/read-only labeling across schema surfaces.
- Action-level read-only enforcement for CDM (no edit/replace/remove/publish/promote actions).
- Guardrails and tests proving no GitHub write calls occur in CDM operations.

### Out of Scope

- Browsing outside `JSONSchemas/CommonDataModels/`.
- Non-CDM GitHub publish/write flows.
- Auto-sync via webhooks or scheduled jobs.
- Diff visualization UI for sync changes.
- Governance automation beyond read-only enforcement.
- Auth model redesign or GitHub permissions model redesign.

---

## Non-Goals

- Implementing the published-schema read/write track.
- Introducing background sync orchestration.
- Expanding CDM coverage to additional repositories or roots.
- Reworking existing schema ingestion/indexing pipeline architecture beyond required link/sync integration points.

---

## Relevant Areas

- `src/lambda/` (new/existing GitHub/CDM handlers) ?
- `src/lib/` shared GitHub client/integration utilities ?
- `src/lib/persistence/schema-metadata.ts`
- `src/lambda/schema/*` (integration touchpoints for schema record creation/update) ?
- `ui/src/lib/api/types.ts`
- `ui/src/lib/types/domain.ts`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/features/projects/components/SchemaLinkPicker.tsx`
- `ui/src/features/projects/components/SchemaManagementSection.tsx`
- `ui/src/features/schemas/components/SchemaActions.tsx`
- `ui/src/features/schemas/components/SchemaGitStatus.tsx`
- `ui/src/features/schemas/components/SchemaDetailPage.tsx`
- `ui/src/features/projects/components/SchemaCard.tsx`
- `tests/lambda/**/*.test.ts`
- `ui/src/**/__tests__/*.test.tsx`
- `forge/architecture/backend-api.md`
- `forge/architecture/ui-application.md`
- `forge/architecture/phase-1-readiness.md`

---

## Dependencies / Blockers

- Depends on existing Phase 1 backend persistence/API baseline (FS-056..FS-064).
- Depends on backend runtime environment having GitHub read access.
- No blocking in-progress spec dependency identified in `forge/active/`.

---

## Constraints

- Must only read from `KBXT/KBX-Canonicals` (`repoId = 1052821334`) and path-root `JSONSchemas/CommonDataModels/`.
- Must not perform GitHub write operations for any CDM flow.
- Must preserve explicit user-triggered re-sync behavior.
- Must persist source-of-truth metadata on linked schema records: `origin=cdm`, `repo`, `repoId`, `branch`, `path`, `commitSha`.
- Must enforce CDM read-only actions across all relevant UI surfaces.
- Error messages in UI must be actionable and non-technical.

---

## Proposed Behavior

### User Flow

1. In Project Overview, user chooses **Link from CDM Library**.
2. CDM picker loads entries from `KBXT/KBX-Canonicals/JSONSchemas/CommonDataModels/` only.
3. User selects a schema file and confirms link.
4. Project shows linked schema with CDM badge/read-only labeling and current sync state.
5. User may click **Re-sync** on a CDM schema.
6. Re-sync checks upstream content/commit and updates stored schema metadata/content when changed.
7. UI reflects resulting sync state: synced, update available, or sync failed.

### System Behavior

- `listCdmSchemas(path?)` backend endpoint/service:
  - accepts optional subpath but rejects/normalizes requests outside the CDM root.
  - returns one directory level per request (no recursive default); client drives navigation by requesting child paths.
  - returns file entries only relevant to CDM library browsing.
- `linkCdmSchema(input)` backend endpoint/service:
  - fetches selected file content + commit SHA from GitHub read API.
  - creates or updates schema record metadata with CDM source fields.
  - is idempotent for duplicate link attempts within the same project for the same `repo+branch+path` (returns existing link/result rather than hard warning/error).
  - associates schema with project via existing project schema-link flow.
- `syncCdmSchema(schemaId)` backend endpoint/service:
  - reads linked schema source metadata.
  - fetches current upstream SHA/content.
  - if SHA changed, updates schema content + `commitSha`; otherwise returns already synced.
  - writes sync status outcome for UI consumption.
- Lightweight status-refresh read path:
  - computes `update-available` by comparing stored and upstream SHA without mutating schema content.
  - is used for trustworthy passive status display in addition to explicit re-sync outcomes.
- UI action gating:
  - CDM schemas expose only read-only actions (e.g., View Raw, Re-sync).
  - edit/replace/remove/publish/promote controls are hidden or disabled with clear messaging.

### Failure / Edge Behavior

- If GitHub read fails (network/rate-limit/auth), sync state becomes `sync-failed` and UI shows user-actionable retry guidance.
- If requested browse path escapes CDM root, backend returns validation error.
- If CDM link target is not a file or not found, operation fails with clear UI error.
- If re-sync detects no upstream change, status remains `synced` with unchanged `commitSha`.
- Status-refresh read may set/return `update-available` when upstream SHA differs, without applying content changes.
- If linked schema metadata is missing required CDM source fields, re-sync fails safely with explicit error and no destructive mutation.

---

## Acceptance Examples

### AE-01 — CDM browser is root-scoped to CommonDataModels

**Given**
- User opens Link from CDM Library in Project Overview

**When**
- CDM entries are loaded

**Then**
- Only items under `JSONSchemas/CommonDataModels/` are listed
- No entries from outside that root are returned

### AE-02 — Linking persists canonical source metadata

**Given**
- User links a CDM schema file

**When**
- Link operation succeeds

**Then**
- Schema record persists: `origin=cdm`, `repo=KBXT/KBX-Canonicals`, `repoId=1052821334`, `branch`, `path`, `commitSha`
- `repoId` is also projected into query/index fields for filtering/reporting
- Project reference to linked schema is created

### AE-03 — Manual re-sync updates commit SHA on upstream change

**Given**
- A CDM-linked schema exists with stored `commitSha`
- Upstream file has a newer commit

**When**
- User triggers Re-sync

**Then**
- Stored `commitSha` is updated
- Schema content is updated from upstream
- Sync state becomes `synced`

### AE-04 — Manual re-sync preserves SHA when no change exists

**Given**
- A CDM-linked schema exists and upstream commit is unchanged

**When**
- User triggers Re-sync

**Then**
- `commitSha` remains unchanged
- Sync state remains `synced`
- Response indicates no update applied

### AE-05 — Status refresh surfaces update-available without mutation

**Given**
- A CDM-linked schema exists with stored `commitSha`
- Upstream commit differs from stored SHA

**When**
- A lightweight status-refresh read runs

**Then**
- Status includes/returns `update-available`
- No schema content mutation occurs
- Stored `commitSha` is unchanged until explicit re-sync

### AE-06 — Sync failure is explicit and actionable

**Given**
- Re-sync encounters a GitHub read failure

**When**
- Re-sync request completes

**Then**
- Sync state is `sync-failed`
- UI shows non-technical actionable guidance (e.g., retry later, verify access)

### AE-07 — CDM schemas are enforced read-only across schema surfaces

**Given**
- A schema has `origin=cdm`

**When**
- User views Project Overview and Schema Detail surfaces

**Then**
- CDM badge/read-only label is shown
- Edit/Replace/Remove/Publish/Promote actions are unavailable

### AE-08 — Sync state badges render all required states

**Given**
- Schemas in states `synced`, `update-available`, `sync-failed`

**When**
- Schema cards/detail status sections render

**Then**
- Correct badge text/style appears for each state

### AE-09 — CDM operations perform no GitHub write calls

**Given**
- User performs CDM browse, link, and re-sync actions

**When**
- Operations execute in backend mode

**Then**
- Only GitHub read endpoints are called
- No create/update/delete GitHub content API calls are issued

---

## Open Questions

- none

---

## Verification Strategy

- **Backend unit/integration tests**
  - AE-01/AE-02: listing + link metadata persistence/index projection and root enforcement
  - AE-03/AE-04/AE-05/AE-06: re-sync changed/unchanged + status-refresh + error paths
  - AE-09: explicit assertions that write-capable GitHub client methods are never invoked
- **UI component/hook tests**
  - AE-01: CDM picker only displays CommonDataModels entries
  - AE-07/AE-08: badge rendering and action gating across Project Overview + Schema Detail components
  - AE-06: user-facing error messaging copy/behavior
- **Contract/adapter tests**
  - ensure `HttpAdapter` CDM methods map to backend endpoints and local adapter remains explicit offline-not-available
- **Quality gates**
  - typecheck/lint for touched backend + UI areas
  - targeted test suites for changed modules

---

## Task Generation Notes

- Decompose by execution domain:
  - backend/API/persistence/architecture tasks → `Agent: task`
  - React UI and feature-surface tasks → `Agent: ui-task`
- Sequence should isolate risk:
  1. Backend contract + domain model updates
  2. Backend handlers/services for browse/link/sync
  3. UI adapter wiring + picker integration
  4. UI read-only enforcement and state presentation
  5. End-to-end guardrails and regression tests
  6. Architecture doc update task
- Keep a dedicated architecture update task because this spec materially updates existing backend/UI GitHub integration architecture.

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Open Questions Q1-Q4
  - Confirmed one-level directory listing with client-driven CDM navigation
  - Confirmed `update-available` computed by both lightweight status-refresh reads and explicit re-sync flows
  - Confirmed duplicate link behavior is idempotent for same project + repo/branch/path
  - Confirmed `repoId` is persisted in source metadata and projected into query/index fields for filtering/reporting
  - Added AE-05 for status-refresh `update-available` behavior and renumbered downstream AEs
- Rev 1 — 2026-06-02
  - Initial draft
  - Scoped to CDM read-only integration for `KBXT/KBX-Canonicals/JSONSchemas/CommonDataModels/`
  - Added explicit no-write GitHub constraint and sync-state model
