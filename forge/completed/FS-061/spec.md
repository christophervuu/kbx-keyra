# SPEC

## Title

Multi-Session Persistence and Cross-Browser Consistency

---

## ID

FS-061

---

## Metadata

Owner: @christophervuu  
Reviewers: TBD  
Created: 2026-05-14  
Last Updated: 2026-05-14  
Type: backend

---

## Status

draft

---

## Revision

Rev: 1

---

## Summary

Validate and harden multi-session persistence for KeyRa Phase 1. Projects, mappings (including versioned configs), and schemas saved through the backend must be durable, consistent, and fully reconstructable from server state alone — with no hidden dependency on browser localStorage, session storage, or in-memory cache. This is the core business value of Phase 1: if users cannot trust that work persists, backend integration fails its primary purpose.

---

## Problem

Phase 0 persists all data in browser localStorage. The Phase 1 backend stack (FS-055 HttpAdapter, FS-057 API surface, FS-058 persistence layer) replaces this with DynamoDB + S3, but no explicit validation exists to guarantee that:

1. Data created in one browser session is fully loadable in a different session, browser, or profile.
2. The `HttpAdapter` path has no residual dependency on localStorage for state reconstruction.
3. Mapping version retrieval returns the correct historical config snapshot (not stale or defaulted data).
4. Schema metadata and full content (JSON Schema body or XSD) rehydrate identically across sessions.

Without explicit verification, subtle bugs could silently regress persistence guarantees — e.g., a missing S3 fetch in the version history flow, a localStorage fallback left in the adapter bootstrap path, or metadata fields that only hydrate when a local cache is warm.

---

## Goal

After this spec is implemented:

1. Integration tests prove that every entity type (project, mapping, mapping version, schema) created in one "session" is fully loadable in a simulated fresh session with no shared state.
2. The `HttpAdapter` code path contains zero reads from `localStorage` or `sessionStorage` for data reconstruction (diagnostic/logging use allowed).
3. Mapping version retrieval returns the exact config snapshot stored at save time, verified by deep equality.
4. Schema metadata and content (original + processed) are byte-for-byte consistent across sessions.
5. Acceptance criteria are deterministic, automatable, and runnable in CI against DynamoDB Local + LocalStack S3.

---

## Assumptions

- FS-058 persistence module is implemented (or being implemented concurrently) and provides the typed data-access methods.
- FS-057 API handlers exist (or are being implemented concurrently) and serve the endpoints consumed by HttpAdapter.
- FS-055 HttpAdapter is implemented and fulfills the `ApiAdapter` contract over HTTP.
- DynamoDB provides immediate read-after-write consistency for strongly consistent reads.
- S3 provides read-after-write consistency for new object PUTs (standard behavior since Dec 2020).
- No authentication/tenancy layer introduces session-dependent filtering that would affect test results.

---

## Current Context

The Phase 1 persistence stack is being built across three specs:

- **FS-058** defines the storage model (`src/lib/persistence/`) — DynamoDB tables + S3 key layout.
- **FS-057** defines the API surface (`src/lambda/`) — Lambda handlers that call into the persistence module.
- **FS-055** defines the client adapter (`ui/src/lib/api/http-adapter.ts`) — consumes HTTP endpoints.

Phase 0's `LocalStorageAdapter` stores everything in browser localStorage keyed by entity type. The `HybridAdapter` overrides only AI methods. When `VITE_API_URL` is set, FS-055's `HttpAdapter` should handle all CRUD with no localStorage fallback.

The current UI hooks (`useProjects`, `useMappings`, `useSchemas`, etc.) consume `ApiAdapter` methods and cache results in React state. This spec must ensure that the *server* is the single source of truth, not any client-side state that would break cross-session guarantees.

Key persistence model details (from `persistence-model.md`):
- Mapping configs stored in S3 at `mappings/{mappingId}/config.json`
- Version snapshots stored at `mappings/{mappingId}/versions/v{N}.json`
- Schema content stored at `schemas/{schemaId}/content.json` (or `.xsd`)
- DynamoDB items hold metadata + S3 key references
- Version auto-increment uses `SET version = version + :one`

---

## Scope

### In Scope

- Integration tests validating cross-session persistence for all Phase 1 entity types
- Audit of `HttpAdapter` and adapter bootstrap path for hidden localStorage dependencies
- Fixes to any code paths that read localStorage/sessionStorage when `HttpAdapter` is active
- Verification that mapping version retrieval reconstructs from DynamoDB metadata + S3 config
- Verification that schema metadata + content rehydrate correctly from DynamoDB + S3
- Test infrastructure for simulating "fresh session" (separate adapter instances, no shared state)

### Out of Scope

- Multi-user concurrent write conflict handling (future spec)
- Pagination behavior for large collections
- Performance benchmarks or latency SLAs
- Authentication/authorization mechanisms
- Offline fallback or progressive enhancement behavior
- UI component changes (this is backend/adapter verification)
- Schema ingestion pipeline (FS-056 scope)

---

## Non-Goals

- This spec does not implement new persistence features — it validates existing ones.
- This spec does not introduce optimistic concurrency or conflict resolution.
- This spec does not redesign the adapter pattern — it ensures the existing pattern fulfills durability promises.
- This spec does not address browser cache invalidation strategies for performance — only correctness.

---

## Relevant Areas

- `ui/src/lib/api/http-adapter.ts` — primary audit target for localStorage leaks
- `ui/src/lib/api/bootstrap.ts` — adapter selection logic
- `ui/src/lib/api/local-storage-adapter.ts` — reference for localStorage patterns to avoid
- `src/lib/persistence/` — persistence module under test
- `src/lambda/mapping/get-version.ts` — version retrieval handler
- `src/lambda/mapping/save-version.ts` — version save handler
- `src/lambda/schema/get-schema.ts` — schema detail handler (metadata + content)
- `src/lambda/schema/create-schema.ts` — schema creation handler
- `src/lib/persistence/s3/schema-content.ts` — schema S3 content helpers
- `src/lib/persistence/s3/mapping-config.ts` — mapping config S3 helpers
- `src/lib/persistence/mapping-versions.ts` — version persistence module
- `tests/lambda/integration/` — integration test location

---

## Dependencies / Blockers

- Depends on FS-058 persistence module being implemented (at minimum: `projects`, `mappings`, `schemaMetadata`, `mappingVersions`, and S3 helpers)
- Depends on FS-057 API handlers being implemented for the CRUD subset
- Depends on FS-055 HttpAdapter being implemented for client-side audit tasks
- DynamoDB Local and LocalStack must be available in the test environment

---

## Constraints

- Tests must run against DynamoDB Local + LocalStack S3 (no cloud dependencies in CI)
- No modification to the `ApiAdapter` interface contract
- No UI component changes
- Tests must be deterministic and repeatable (no reliance on external state between runs)
- Must not introduce new npm dependencies beyond what's needed for test infrastructure
- All tests must clean up their own data (isolated test state)

---

## Proposed Behavior

### User Flow

From the user's perspective, this spec validates the following experience:

1. User opens KeyRa in Chrome, creates a project with mappings, saves mapping versions, uploads schemas.
2. User closes Chrome entirely.
3. User opens KeyRa in Firefox (or a different Chrome profile, or an incognito window).
4. All projects, mappings, versions, and schemas are present and complete — no data loss, no stale state.

### System Behavior

**Cross-session persistence guarantees:**

- `GET /projects` returns all projects created by any prior session.
- `GET /mappings/:id` returns the full `MappingConfig` (DynamoDB metadata + S3 config blob) regardless of which session created it.
- `GET /mappings/:mappingId/versions/:version` returns the exact config snapshot saved at that version — DynamoDB version metadata + S3 versioned config blob.
- `GET /schemas/:id` returns schema metadata (DynamoDB) + full schema content (S3), regardless of creation session.
- No endpoint behavior depends on request headers containing cached state, localStorage tokens, or session-specific context (beyond auth, which is out of scope).

**HttpAdapter independence:**

- When `VITE_API_URL` is set, the `HttpAdapter` must not read from `localStorage` or `sessionStorage` for any data-reconstruction purpose.
- Adapter bootstrap (`createAdapter()`) must not seed, read, or sync localStorage when selecting `HttpAdapter`.
- UI hooks consuming the adapter must receive all data from HTTP responses only.

**Version integrity:**

- `mappingVersions.save(mappingId, entry)` writes the full `MappingConfig` to S3 and metadata to DynamoDB.
- `mappingVersions.get(mappingId, version)` reads metadata from DynamoDB, fetches the config from S3 using the stored `configS3Key`, and returns the complete `MappingVersionEntry`.
- The returned config is byte-for-byte (after JSON serialization) identical to what was saved.

**Schema rehydration:**

- `schemaMetadata.get(id)` returns all metadata fields as stored.
- Schema content (S3) is retrievable independently and matches the original upload.
- `fieldCount`, `format`, `status`, and `source` fields are all correctly persisted and returned.

### Failure / Edge Behavior

- If a mapping's S3 config blob is missing (orphaned DynamoDB record), `GET /mappings/:id` returns a structured error (not a partial/empty response).
- If a version's S3 snapshot is missing, `GET /mappings/:mappingId/versions/:version` returns a structured error.
- If schema content S3 object is missing, `GET /schemas/:id` returns metadata with an error indicator for the content portion (or a full error, per handler design).
- Tests must verify these failure modes explicitly.

---

## Acceptance Examples

### AE-01 — Project survives session boundary

**Given**
- Session A creates project `{ name: "Cross-Session Test", description: "Persistence validation" }` via `POST /projects`
- Session A receives `projectId: "proj-ae01"`

**When**
- Session B (fresh adapter instance, no shared memory) calls `GET /projects/proj-ae01`

**Then**
- Response contains `{ projectId: "proj-ae01", name: "Cross-Session Test", description: "Persistence validation" }`
- `createdAt` and `updatedAt` are valid ISO 8601 timestamps

### AE-02 — Mapping config round-trip across sessions

**Given**
- Session A creates a mapping with a non-trivial `MappingConfig` (3+ rules, source/target schema refs)
- Session A updates the mapping, incrementing the version

**When**
- Session B calls `GET /mappings/:mappingId`

**Then**
- Response includes full `MappingConfig` with all rules intact
- `version` field equals the last version set by Session A
- `sourceSchemaId` and `targetSchemaId` match what Session A set

### AE-03 — Mapping version retrieval returns exact snapshot

**Given**
- Session A saves mapping version 1 with config `C1` (2 rules)
- Session A saves mapping version 2 with config `C2` (4 rules)

**When**
- Session B calls `GET /mappings/:mappingId/versions/1`
- Session B calls `GET /mappings/:mappingId/versions/2`

**Then**
- Version 1 response contains config deeply equal to `C1` (2 rules)
- Version 2 response contains config deeply equal to `C2` (4 rules)
- Neither version returns a stale, merged, or default config

### AE-04 — Schema metadata and content rehydration

**Given**
- Session A creates a schema with metadata `{ name: "OrderSchema", format: "json-schema", fieldCount: 25 }` and uploads a JSON Schema body (1.5KB)

**When**
- Session B calls `GET /schemas/:schemaId`

**Then**
- Response metadata matches: `name`, `format`, `fieldCount`, `status` (should be `ready`), `origin`, `scope`
- Schema content (body) is retrievable and byte-equal to the original upload after JSON parse

### AE-05 — HttpAdapter has no localStorage dependency

**Given**
- `VITE_API_URL` is set
- `localStorage` and `sessionStorage` are empty (or blocked from reads)

**When**
- `createAdapter()` is called and the returned adapter is used for all CRUD operations

**Then**
- No `localStorage.getItem()` or `sessionStorage.getItem()` calls are made for data reconstruction
- All operations succeed via HTTP only
- Static analysis confirms no `localStorage` reads in `http-adapter.ts`

### AE-06 — Orphaned S3 reference returns structured error

**Given**
- A mapping DynamoDB record exists with `configS3Key: "mappings/orphan-id/config.json"`
- The referenced S3 object does NOT exist

**When**
- Session B calls `GET /mappings/orphan-id`

**Then**
- Response is HTTP 500 with error code `CONTENT_UNAVAILABLE` (or equivalent backend consistency code)
- Error message clearly indicates storage inconsistency (not "not found")
- Response does not expose raw AWS SDK errors to the client

---

## Open Questions

- none

### Resolved

- `Q1.` (Resolved) Missing S3 content returns **500** with a specific code such as `CONTENT_UNAVAILABLE`. Rationale: the entity exists but backing storage is inconsistent — this is not a user-facing "not found".
- `Q2.` (Resolved) Integration harness tests **both layers** — persistence module tests for correctness/edge cases, plus full-stack HttpAdapter → HTTP → Lambda → DynamoDB/S3 integration tests for real adapter behavior.
- `Q3.` (Resolved) Enforce via **ESLint rule** (`no-restricted-globals` or `no-restricted-properties`) scoped to backend-adapter-related code, plus code review convention. CI-enforced linting is the most reliable guardrail.

---

## Verification Strategy

**Automated integration tests** (primary verification):
- Persistence module layer: tests in `tests/lambda/integration/persistence/` validate AE-01 through AE-04 and AE-06 at the data-access level.
- Full-stack layer: tests in `tests/lambda/integration/full-stack/` validate select scenarios through HttpAdapter → HTTP → Lambda → DynamoDB/S3 (when API surface is available).
- Each test uses independent DynamoDB Local tables and LocalStack S3 bucket.
- "Session boundary" is simulated by creating fresh persistence module instances (no shared in-memory state).
- Tests verify deep equality of stored and retrieved data.

**Static analysis** (AE-05):
- Grep/lint check confirming `http-adapter.ts` contains no `localStorage.getItem`, `sessionStorage.getItem`, or `window.localStorage` reads.
- ESLint rule in `ui/src/lib/api/` restricting storage API access in adapter files (CI-enforced).

**Failure mode tests** (AE-06):
- Integration tests that deliberately create orphaned records and verify error responses.

**CI integration**:
- All tests must pass in CI using DynamoDB Local (port 8000) and LocalStack S3 (port 4566).
- Tests are idempotent and isolated (create their own tables/data, clean up after).

---

## Task Generation Notes

This spec decomposes into:

1. **Test infrastructure** (`task`): Set up the cross-session persistence test harness — DynamoDB Local table creation, S3 bucket setup, fresh-instance simulation utilities.
2. **Project round-trip tests** (`task`): Validate AE-01 for projects including all metadata fields.
3. **Mapping + version round-trip tests** (`task`): Validate AE-02 and AE-03 — full config persistence and version snapshot integrity.
4. **Schema rehydration tests** (`task`): Validate AE-04 — metadata + S3 content round-trip.
5. **HttpAdapter localStorage audit** (`task`): Static analysis + code fix for AE-05.
6. **Error mode validation** (`task`): Validate AE-06 — orphaned references and failure behavior.

All tasks are `Agent: task` — no UI component work involved.

Tasks 2–4 and 6 depend on Task 1 (test harness). Task 5 is independent.

---

## Change Log

- Rev 1 — 2026-05-14
  - Initial draft
  - Resolved Q1: orphaned S3 → 500 + `CONTENT_UNAVAILABLE` (not 404)
  - Resolved Q2: test both persistence module and full-stack layers
  - Resolved Q3: enforce localStorage prohibition via ESLint rule (CI-enforced)
