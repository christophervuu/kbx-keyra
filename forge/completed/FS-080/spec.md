# SPEC

## Title

FS-080 — GitHub Resilience for CDM Read Flows

---

## ID

FS-080

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

Harden CDM GitHub read flows so KeyRa remains usable during transient GitHub/API failures and produces actionable diagnostics when failures occur. The change adds bounded caching for CDM browse data, retry/backoff+jitter for transient failures, and canonical error-class mapping consumed by UI messaging and retry actions. Success means browse/link/sync failures are visible, recoverable where possible, and never silently hidden.

---

## Problem

GitHub-backed CDM read operations (browse/link/sync) can fail due to rate limiting, transient network issues, auth/path errors, or timeouts. Current behavior risks brittle UX, weak operational debugging, and user confusion during outages. Without explicit resilience controls, users can be blocked by temporary failures and teams cannot quickly diagnose incidents.

---

## Goal

Make CDM browse/link/sync robust and diagnosable by introducing:

1. Configurable TTL cache for CDM file listings under `JSONSchemas/CommonDataModels/`.
2. Bounded retry with exponential backoff + jitter for transient failures.
3. Canonical failure-class normalization for UI (`rate-limited`, `unauthorized/forbidden`, `not-found/path-mismatch`, `timeout/transient`).
4. Friendly UI error messaging with explicit retry affordances.
5. Structured logging/telemetry fields sufficient for incident triage.

---

## Assumptions

- FS-076 provides baseline CDM browse/link/sync contracts and root restrictions.
- FS-077 provides re-sync correctness/re-ingestion behavior and should execute first for data correctness.
- FS-078 provides UI consistency baseline that FS-080 extends with resilience messaging.
- FS-079 provides deployment guardrail baseline and is sequenced before this operational hardening.
- Existing backend shared error envelope and request correlation mechanisms remain canonical.

---

## Current Context

- `forge/active/` currently includes related in-progress CDM specs `FS-076`, `FS-077`, `FS-078`, and `FS-079`; this spec is explicitly sequenced after them.
- `forge/architecture/backend-api.md` already defines standardized backend error envelopes, request IDs, and retryable semantics.
- `forge/architecture/ui-application.md` documents HTTP client retry behavior and async error handling surfaces, but CDM-specific failure normalization/messaging contract is not yet explicit.
- Existing architecture coverage for backend/UI/infrastructure exists; this spec modifies behavior within existing subsystems and does not introduce a new subsystem.

---

## Scope

### In Scope

- TTL cache for CDM file-listing reads under `JSONSchemas/CommonDataModels/` (configurable TTL).
- Retry policy for transient GitHub read failures with exponential backoff + jitter and bounded attempts.
- Failure normalization classes for CDM browse/link/sync:
  - `rate-limited`
  - `unauthorized-forbidden`
  - `not-found-path-mismatch`
  - `timeout-transient`
- UI error handling updates for friendly messages, clear guidance, and retry actions.
- Logging/telemetry contract additions for CDM GitHub read operations:
  - `operation`
  - `repo/path`
  - `statusCode`
  - `retryCount`
  - `failureClass`
  - `correlationId`/`requestId`
- Explicit behavior to avoid silent sync-failure swallowing and to keep stale/failed sync state visible.

### Out of Scope

- Webhook/event-driven automatic re-sync.
- Broad observability platform rollout or new external telemetry stack.
- Non-CDM GitHub write/publish flows.
- Large UX redesign outside error messaging/recovery affordances for affected CDM surfaces.

---

## Non-Goals

- Replacing current CDM functional contracts from FS-076/077.
- Redesigning auth model or GitHub credentials strategy.
- Guaranteeing zero user-visible errors during sustained GitHub outage.

---

## Relevant Areas

- `src/lambda/schema/*` (CDM browse/link/sync handlers) ?
- `src/lambda/shared/errors.ts`
- `src/lambda/shared/response.ts`
- `src/lib/*` GitHub client integration/resilience helpers ?
- `src/lib/persistence/schema-metadata.ts` (sync-status visibility guarantees) ?
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/lib/api/http-client.ts`
- `ui/src/lib/state/app-error.ts`
- `ui/src/features/projects/components/SchemaLinkPicker.tsx` ?
- `ui/src/features/schemas/components/SchemaGitStatus.tsx`
- `ui/src/features/schemas/components/SchemaActions.tsx`
- `tests/lambda/**/*.test.ts`
- `ui/src/**/*.test.tsx`
- `forge/architecture/backend-api.md`
- `forge/architecture/ui-application.md`

---

## Dependencies / Blockers

- Recommended sequencing dependency: FS-076 → FS-077 → FS-078 → FS-079 → FS-080.
- Depends on baseline CDM endpoints and sync-state model from prior specs.
- Depends on GitHub read access being configured in backend environments.

---

## Constraints

- Must never silently swallow sync failures.
- Cached responses must not mask stale or failed sync state.
- UI must remain usable under partial outage (degraded but non-crashing behavior).
- Retry policy must be bounded (no unbounded loops).
- CDM root/path restrictions remain enforced; resilience logic must not widen allowed path scope.

---

## Proposed Behavior

### User Flow

1. User opens CDM browse flow.
2. If GitHub is healthy, fresh listing is returned and cache is refreshed.
3. If transient GitHub read fails and recent cache exists, UI loads cached listing with degraded-state indicator and retry affordance.
4. If link/sync fails, UI shows friendly class-specific message and explicit retry action; screen remains interactive.
5. When retry succeeds, error/degraded state clears and current sync status is reflected.

### System Behavior

- Add cache layer for CDM listing reads keyed by repo+branch+path (scoped to allowed CDM root) with configurable TTL defaults:
  - local: 30s
  - dev: 60s
  - prod: 300s
- Add outage-only stale-cache grace behavior beyond TTL, with explicit degraded signaling and a bounded max-staleness window (recommended baseline: up to 15 minutes in prod).
- Add bounded retry utility for transient GitHub read operations (network/timeouts/5xx/429 where policy allows) using exponential backoff + jitter.
- Define deterministic classification mapping from GitHub/transport failures to canonical CDM failure classes in backend taxonomy/codes.
- Keep user-facing copy mapping in a UI-side mapping table keyed by backend failure class.
- Expose `retry-after` metadata to UI for rate-limited responses when upstream metadata is available.
- Ensure sync operation failures are persisted/returned as explicit failed outcomes (no success fallthrough).
- Ensure listing cache fallback does not alter schema-level sync status semantics; cached listing and sync state are treated as separate truths.
- Emit structured logs/telemetry per attempt and terminal outcome with required fields and correlation/request IDs.

### Failure / Edge Behavior

- `rate-limited`: show guidance to retry later; include retry CTA and preserve usable UI where cached data exists. When available, surface `retry-after` hint to support user timing guidance.
- `unauthorized-forbidden`: show access/permission guidance; do not auto-retry indefinitely.
- `not-found-path-mismatch`: show clear path/repository mismatch guidance; mark non-retryable unless input changes.
- `timeout-transient`: apply bounded retries automatically; on terminal failure, show retry CTA.
- Cache miss + outage: surface friendly error without crash; allow user to retry.
- Cache hit + outage (within stale grace window): serve cache with explicit degraded marker; do not report as fully synced/fresh.
- Cache beyond stale grace window: do not serve as usable fallback; return explicit failure state with retry guidance.

---

## Acceptance Examples

### AE-01 — Browse falls back to cache during short GitHub interruption

**Given**
- A recent cached CDM listing exists within TTL
- GitHub listing request fails transiently

**When**
- User opens CDM browser

**Then**
- Cached listing is returned
- UI indicates degraded/cached state
- UI exposes retry action

### AE-02 — Transient failures retry within bounded backoff policy

**Given**
- CDM read operation encounters transient timeout/network/5xx failure

**When**
- Operation executes

**Then**
- Retries occur automatically with exponential backoff + jitter
- Retry count is bounded by configured max attempts
- Terminal failure/success is returned explicitly

### AE-03 — Failure class normalization is deterministic

**Given**
- CDM browse/link/sync operations fail for representative classes (429, 401/403, 404/path mismatch, timeout/transient)

**When**
- Errors are mapped for UI/API consumption

**Then**
- Each failure maps to the canonical class expected by UI
- UI renders class-specific friendly guidance

### AE-04 — UI remains usable and non-crashing on GitHub failure

**Given**
- GitHub read operations fail for one or more CDM actions

**When**
- User interacts with affected schema/project surfaces

**Then**
- UI does not crash
- Existing data/surfaces remain navigable
- Retry actions are available on recoverable failures

### AE-05 — Sync failures are explicit and never silently swallowed

**Given**
- A CDM sync operation fails terminally

**When**
- Sync request completes

**Then**
- Response/state is failure (not success)
- Sync failure status is visible to user
- Logs include failure class and correlation/request identifiers

### AE-06 — Logging/telemetry supports incident debugging

**Given**
- A CDM GitHub read failure incident occurs

**When**
- Engineers inspect logs/telemetry

**Then**
- They can identify operation, repo/path, status code, retry count, failure class, and request lineage IDs

---

## Open Questions

- none

---

## Verification Strategy

- **Backend unit/integration tests**
  - AE-01: cache hit fallback behavior and degraded indicator contract.
  - AE-02: retry/backoff bounded behavior and terminal outcome handling.
  - AE-03/AE-05: deterministic failure classification and explicit sync-failure semantics.
  - AE-06: structured log field presence assertions in targeted tests.
- **UI tests**
  - AE-03/AE-04: friendly class-specific error rendering and non-crashing recovery behavior.
  - AE-01/AE-04: cached/degraded state rendering and retry interaction.
- **Quality gates**
  - typecheck/lint for touched backend and UI areas.
  - targeted test suites for CDM handlers, shared API client logic, and affected UI components.

---

## Task Generation Notes

- This is cross-cutting and must be decomposed by domain:
  - backend/cache/retry/classification/logging tasks → `Agent: task`
  - UI messaging/retry/degraded-state tasks → `Agent: ui-task`
- Sequence should prioritize backend resilience primitives before UI wiring.
- Include an explicit architecture update task (existing subsystem impact on `backend-api.md` and `ui-application.md`).

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Q1: TTL defaults set to local 30s, dev 60s, prod 300s.
  - Resolved Q2: Added outage-only stale-cache grace window behavior with bounded max staleness (recommended up to 15 minutes in prod).
  - Resolved Q3: Failure taxonomy/codes remain backend-owned; user-facing copy mapping is UI-owned via class-to-copy table.
  - Resolved Q4: Rate-limit responses now expose `retry-after` metadata to UI when available.
- Rev 1 — 2026-06-02
  - Initial draft
  - Added cache + retry/backoff + failure-normalization + UI resilience requirements for CDM GitHub read flows
  - Added explicit constraints against silent sync-failure swallowing and stale-state masking
