# SPEC

## Title

Draft / Revision / Version Semantics for Mappings

---

## ID

FS-063

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-01  
Last Updated: 2026-06-01  
Type: cross-cutting

---

## Status

completed

---

## Revision

Rev: 1

---

## Summary

Replace the current "every save is a version" model with three distinct concepts: working drafts (autosaved editor state), revisions (user-triggered saves), and versions (explicit user action on a saved revision). This gives users control over meaningful version milestones while preserving safe autosave and concurrency protection.

---

## Problem

Today every save operation creates a new user-visible version in the Mapping Editor. This clutters version history with incremental saves that carry no semantic significance to the user. There is no way to distinguish routine saves from deliberate version checkpoints.

---

## Goal

Users can save freely without polluting version history. Versions are created only when the user explicitly chooses to create one, representing meaningful milestones. The system continues to protect against data loss (autosave) and concurrency conflicts.

---

## Assumptions

- Pre-production; no migration of existing test data required
- Single-user-at-a-time concurrency model (optimistic locking) remains
- No version notes/comments required for now
- Authentication/authorization model unchanged

---

## Current Context

The current persistence model (`persistence-model.md`) defines:
- `Mappings` table with a `version` field that auto-increments on every `mappings.update()` call
- `MappingVersions` table (PK=`mappingId`, SK=`version` number) storing snapshot metadata + S3 config key
- S3 stores versioned configs at `mappings/{mappingId}/versions/v{N}.json`
- `update-mapping` handler performs optimistic concurrency check then increments version

The UI (`EditorTopBar`) shows a single version number and Save button. `useMappingEditor` commits on every save. Version history is a flat list of all saves.

---

## Scope

### In Scope

- Product semantics: draft vs revision vs version definitions and relationships
- Data model changes: new table/attribute structure for revisions and versions
- API changes: new/modified endpoints for save-revision, create-version, list-revisions, list-versions
- Editor UX: distinct Save and Version actions, display of current revision + version
- History UX: separate Revisions and Versions sections/tabs
- Autosave/draft persistence (client-side or server-side)
- Optimistic concurrency on revision creation
- No-op save detection (skip revision if nothing changed)

### Out of Scope

- Deployment policy by environment
- Stale badges across environments
- Promotion/rollback rules
- Version notes/comments
- Migration of existing test data

---

## Non-Goals

- Multi-user real-time collaboration
- Branching or merge semantics
- Deployment triggers from version creation

---

## Relevant Areas

- `src/lib/persistence/mappings.ts`
- `src/lib/persistence/mapping-versions.ts`
- `src/lib/persistence/types.ts`
- `src/lambda/mapping/update-mapping.ts`
- `src/lambda/mapping/save-version.ts`
- `src/lambda/mapping/list-versions.ts`
- `src/lambda/mapping/get-version.ts`
- `ui/src/features/mappings/hooks/use-mapping-editor.ts`
- `ui/src/features/mappings/components/EditorTopBar.tsx`
- `ui/src/lib/api/types.ts` (ApiAdapter)
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/lib/api/local-storage-adapter.ts`
- `forge/architecture/persistence-model.md`
- `forge/architecture/backend-api.md`

---

## Dependencies / Blockers

- none

---

## Constraints

- Must preserve optimistic concurrency protection on save
- Autosave must not create user-visible history entries
- Version must always point to exactly one revision
- No-op saves (no change since last revision) must not create a new revision
- Must work with both `HttpAdapter` and `LocalStorageAdapter`

---

## Proposed Behavior

### User Flow

1. **Editing:** User edits mapping rules in the editor. Changes are periodically autosaved as a working draft (not visible in history).
2. **Save (creates revision):** User clicks Save. If the current state differs from the last saved revision, a new revision is created. If nothing changed, Save is a no-op (disabled or shows feedback).
3. **Version (creates version):** User clicks a separate Version action (single click, no confirmation). If unsaved draft changes exist, the system implicitly saves first (creating a revision), then creates a version pointing to that revision. Success toast: "Version {N} created from Revision {R}".
4. **History:** User opens history and sees two sections/tabs: Revisions (all explicit saves) and Versions (user-created milestones). Each version links to its underlying revision.

### System Behavior

**Data model (C1 model):**
- **Draft:** Client-side autosaved state (localStorage keyed by mappingId). Not persisted to backend. For local recovery within a session only; not for cross-device continuity.
- **Revision:** Server-persisted save. Has a monotonic revision number per mapping, timestamp, config snapshot in S3, content hash. Replaces the current `version` concept in `Mappings` table. Prune policy: retain most recent 50 unversioned revisions; revisions referenced by a version are never pruned.
- **Version:** Server-persisted milestone. Has a monotonic version number per mapping, timestamp, and a pointer (`revisionNumber`) to the revision it was created from. Never auto-pruned.

**Table changes:**
- `Mappings` table: rename conceptual field `version` → `revision` (current revision number). Add `latestVersion` (current version number, nullable — 0 or absent if no version created yet).
- Rename `MappingVersions` table → `MappingRevisions` (PK=`mappingId`, SK=`revision` number). Fields: `revision`, `savedAt`, `savedBy`, `ruleCount`, `configS3Key`, `configHash`.
- New `MappingVersions` table (PK=`mappingId`, SK=`version` number). Fields: `version`, `revisionNumber`, `createdAt`, `createdBy`.

**S3 layout:**
- `mappings/{mappingId}/revisions/r{N}.json` — revision config snapshots (replaces `versions/v{N}.json`)
- No separate S3 object for versions; a version references a revision's S3 key.

**API changes:**
- `PUT /mappings/:id` — saves a revision (increments revision number). Returns 304-equivalent (or success with same revision number) if config hash unchanged.
- `POST /mappings/:id/versions` — creates a version from latest revision. Body may include `{ implicitSave: true, config: ... }` to save-then-version atomically.
- `GET /mappings/:id/revisions` — list revisions (descending)
- `GET /mappings/:id/revisions/:revision` — get specific revision
- `GET /mappings/:id/versions` — list versions (descending)
- `GET /mappings/:id/versions/:version` — get specific version (includes revision pointer)

**Optimistic concurrency:**
- Save-revision uses the same pattern as today: client sends expected current revision number; server rejects with CONFLICT if mismatch.

**No-op detection:**
- Server computes a content hash (SHA-256 of the config JSON) on save. If hash matches the latest revision's `configHash`, no new revision is created. Response indicates no change.

**Draft autosave:**
- Client-side only (localStorage key `keyra:draft:{mappingId}`). Cleared on successful save. Restored on editor load if present.

### Failure / Edge Behavior

- **Concurrent edit conflict:** Same as today — CONFLICT error on save, user must reload.
- **Version with no revisions:** Not possible if Version implies save-first. If mapping has never been saved (brand new), Version should save first.
- **Draft recovery (same revision):** On editor load, if a local draft exists and the server revision matches the draft's base revision, prompt: "Restore draft" / "Discard draft".
- **Draft recovery (stale draft):** If a local draft exists but the server has a newer revision than the draft's base, prompt with context: "A local draft was found, but the mapping has newer saved changes on the server." Options: "Restore local draft" / "Load latest saved revision". No auto-merge.
- **Network failure during save:** Standard retry/error handling per backend-api.md resilience flow.
- **Network failure during version creation (after implicit save succeeded):** The revision is persisted; version creation can be retried. UI should indicate partial success.

---

## Acceptance Examples

### AE-01 — Save creates a revision

**Given**
- Mapping `m1` has revision 3 as latest
- User has edited rules (draft differs from revision 3)

**When**
- User clicks Save

**Then**
- Revision 4 is created with the current config
- EditorTopBar shows "Revision 4"
- Draft is cleared from localStorage
- No new version is created

### AE-02 — No-op save is suppressed

**Given**
- Mapping `m1` has revision 4 as latest
- User has made no changes since revision 4

**When**
- User clicks Save

**Then**
- No new revision is created
- UI indicates nothing to save (Save button disabled or brief feedback)

### AE-03 — Version from latest revision

**Given**
- Mapping `m1` has revision 5 as latest
- No unsaved draft changes exist
- Latest version is v2 (pointing to revision 3)

**When**
- User clicks Version

**Then**
- Version v3 is created pointing to revision 5
- EditorTopBar shows "Version 3" alongside "Revision 5"

### AE-04 — Version with implicit save

**Given**
- Mapping `m1` has revision 5 as latest
- User has unsaved draft changes

**When**
- User clicks Version

**Then**
- System saves first → revision 6 created
- Version v3 is created pointing to revision 6
- EditorTopBar shows "Version 3" and "Revision 6"
- Draft is cleared

### AE-05 — History shows revisions and versions separately

**Given**
- Mapping `m1` has revisions 1–6 and versions v1 (→r2), v2 (→r4), v3 (→r6)

**When**
- User opens version history

**Then**
- Two sections/tabs visible: "Revisions" and "Versions"
- Revisions tab shows r1–r6 with timestamps
- Versions tab shows v1–v3 with timestamps and linked revision numbers

### AE-06 — Autosave does not appear in history

**Given**
- User is editing mapping `m1`
- Autosave fires (writes draft to localStorage)

**When**
- User opens history

**Then**
- No entry for the autosaved draft appears in either Revisions or Versions

### AE-07 — Optimistic concurrency conflict on save

**Given**
- User A has mapping `m1` at revision 5 open
- Another process saved revision 6 in the meantime

**When**
- User A clicks Save (sending expectedRevision=5)

**Then**
- Server returns CONFLICT
- UI shows conflict error with reload option

---

## Open Questions

- none

---

## Resolved Questions

- `Q1.` **Draft autosave is client-only.** Drafts are stored in localStorage for local recovery only, not cross-device continuity. Server-side draft persistence can be added later if needed.
- `Q2.` **Retain most recent 50 unversioned revisions per mapping.** Versions are never auto-pruned. Revisions referenced by a version are retained regardless of count/age.
- `Q3.` **Single-click Version action, no confirmation.** Non-destructive action; no note required. Show success toast: "Version {N} created from Revision {R}".
- `Q4.` **Explicit prompt on draft restore.** On editor load, if a local draft exists and differs from the latest revision, prompt: "Restore draft" / "Discard draft". Draft is clearly labeled as local unsaved work.
- `Q5.` **Draft vs newer server revision: explicit prompt with context.** If a local draft exists but the server revision is newer than when the draft was saved, show: "A local draft was found, but the mapping has newer saved changes on the server." Options: "Restore local draft" / "Load latest saved revision". No auto-merge in v1.

---

## Verification Strategy

- **AE-01, AE-02, AE-07:** Backend integration tests (DynamoDB Local) for revision creation, no-op detection, and concurrency conflict
- **AE-03, AE-04:** Backend integration tests for version creation with and without implicit save
- **AE-05, AE-06:** UI component/integration tests for history display
- **AE-01–AE-04:** E2E tests through editor save/version flow
- All acceptance examples should have automated coverage

---

## Task Generation Notes

This is a cross-cutting spec. Tasks should be split by execution domain:

1. **Backend data model + persistence** (Agent: task) — new table schemas, revised persistence modules, S3 key changes
2. **Backend API handlers** (Agent: task) — new/modified endpoints for revision and version CRUD
3. **ApiAdapter contract + HttpAdapter** (Agent: task) — updated adapter interface, HTTP implementation
4. **LocalStorageAdapter** (Agent: task) — local implementation of revised semantics
5. **Editor hook + draft autosave** (Agent: ui-task) — `useMappingEditor` revision/version/draft model, localStorage draft
6. **Editor UX: Save + Version actions** (Agent: ui-task) — EditorTopBar updates, Version button, no-op save state
7. **History UX: Revisions + Versions tabs** (Agent: ui-task) — history drawer/panel redesign
8. **Architecture doc update** (Agent: task) — update `persistence-model.md` and `backend-api.md`

Tasks 1–2 should execute before 3–4, which should execute before 5–7. Task 8 can execute after 1–2.

---

## Change Log

- Rev 1 — 2026-06-01
  - Initial draft
  - Resolved Q1–Q5: client-only drafts, 50-revision prune (version-referenced exempt), no confirmation on Version, explicit draft restore prompt, stale-draft-vs-server prompt
