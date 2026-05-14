# SPEC

## Title

Phase 0 MVP Architecture Reconciliation Pass

---

## ID

FS-054

---

## Metadata

Owner: @christophervuu  
Reviewers: TBD  
Created: 2026-05-14  
Last Updated: 2026-05-14    
Type: workflow

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Perform a bounded architecture reconciliation pass to bring the `forge/architecture/` documents back into alignment with the actual Phase 0 MVP implementation. The mapping engine, UI application, project structure, and supporting documents are audited against the current repository state, updated where reality has drifted, and annotated with Phase 1-relevant assumptions and open questions. The outcome is a reliable architecture documentation baseline from which Phase 1 backend work can be planned.

---

## Problem

KeyRa 2.0 has reached Phase 0 MVP with a functioning frontend-first application, local storage behavior, and Mapping Editor authoring flow. Over the course of 53 feature specs (FS-001 through FS-053), many implementation decisions were made in chat context, task execution notes, and code — not all of which were fully reflected back into the formal architecture documents.

The architecture documents (`project-structure.md`, `mapping-engine.md`, `ui-application.md`, `e2e-testing.md`, `ai-runtime.md`) are updated incrementally per-spec, but incremental updates can miss:
- structural drift (files/folders that exist but are not documented, or documented but never created)
- intentional simplifications made during Phase 0 that were not formally captured
- emergent patterns that became convention but were never codified
- stale assumptions or descriptions that no longer match implementation
- missing Phase 1 boundary documentation (what the adapter layer assumes, what the backend will need to provide)

Starting Phase 1 backend work against potentially stale documentation risks building on incorrect assumptions and creates unnecessary re-derivation costs.

---

## Goal

After this reconciliation pass:
1. Architecture documents accurately describe the implemented Phase 0 MVP
2. `project-structure.md` reflects the actual repository file/folder layout
3. `mapping-engine.md` reflects the implemented engine API, modules, and patterns
4. `ui-application.md` reflects the implemented UI architecture, patterns, and component organization
5. Intentional Phase 0 deviations from original plans are explicitly documented
6. Phase 1-relevant assumptions, constraints, and open questions are captured in a structured format suitable for informing a subsequent Phase 1 backend spec
7. `INDEX.md` dates and coverage descriptions are current

---

## Assumptions

- The implementation in `ui/`, `src/engine/`, and `tests/` represents the intended Phase 0 MVP behavior
- Architecture documents should describe what IS implemented, not what was originally planned but not built
- Phase 0 simplifications (e.g., local-only storage, no real backend, HybridAdapter for AI showcase slices) are intentional and should be documented as such rather than treated as defects
- The e2e-testing and ai-runtime architecture documents may have less drift since they were introduced more recently (FS-019, FS-031)
- No code changes are required — this is a documentation-only reconciliation

---

## Current Context

The repository currently contains:
- **`src/engine/`** — Pure TypeScript mapping engine (validate, execute, parse, evaluate, DSL functions, registry). Covered by `mapping-engine.md`.
- **`src/lambda/`** — AWS Lambda handler stubs and AI lambda implementations. Partially covered by `ai-runtime.md` and `project-structure.md`.
- **`src/lib/`** — Shared backend utilities including AI runtime. Covered by `ai-runtime.md` and `project-structure.md`.
- **`ui/`** — React/Vite frontend application with features, shared libs, routing, and adapter layer. Covered by `ui-application.md`.
- **`tests/`** — Test files (engine, lambda, lib, ui). Covered by `project-structure.md`.
- **`specs/`** — Product/technical spec and DSL specifications. Referenced in `INDEX.md`.
- **`forge/`** — Workflow artifacts (active/completed specs, architecture, config).

Key observations from initial review:
- `project-structure.md` documents `src/types/` at top level, but this directory does not exist in the repository (only `src/engine/types/` exists)
- `ui-application.md` has grown substantially (700+ lines) through incremental per-spec updates and may benefit from structural review
- The architecture INDEX notes 5 documents with last-updated dates ranging from 2026-05-01 to 2026-05-14
- Active specs (FS-019, FS-031, FS-050–053) represent in-flight work that should be noted but not reconciled against

---

## Scope

### In Scope

- Auditing current repository structure (`ui/`, `src/`, `tests/`, top-level config) against `project-structure.md`
- Auditing mapping engine implementation against `mapping-engine.md`
- Auditing UI application implementation against `ui-application.md`
- Light review of `e2e-testing.md` and `ai-runtime.md` for obvious drift
- Updating all architecture documents where drift is found
- Documenting what was implemented as planned vs intentionally changed/simplified
- Identifying Phase 1-relevant assumptions, constraints, and open questions
- Updating `INDEX.md` coverage descriptions and dates
- Updating `project-structure.md` if actual folder/file layout has diverged

### Out of Scope

- Implementing Phase 1 backend work
- Making code changes to align implementation to documentation (documentation follows implementation)
- Redesigning Phase 0 architecture for elegance or consistency
- Auditing individual component implementations for correctness
- Reconciling against in-flight active specs (FS-019, FS-031, FS-050–053)
- Broad product changes unrelated to documentation accuracy
- Speculative future architecture beyond what is needed for Phase 1 planning context
- Performance auditing or optimization
- Test coverage auditing

---

## Non-Goals

- This is not a Phase 1 planning spec — it creates the foundation for one
- This is not a code quality or refactoring pass
- This is not an attempt to perfect every documentation detail — focus on material drift that could mislead Phase 1 planning
- This is not an architecture redesign — document what exists, not what should be

---

## Relevant Areas

- `forge/architecture/project-structure.md`
- `forge/architecture/mapping-engine.md`
- `forge/architecture/ui-application.md`
- `forge/architecture/e2e-testing.md`
- `forge/architecture/ai-runtime.md`
- `forge/architecture/INDEX.md`
- `src/engine/` (implementation reference)
- `src/lambda/` (implementation reference)
- `src/lib/` (implementation reference)
- `ui/src/` (implementation reference)
- `tests/` (structure reference)
- `specs/PRODUCT-TECHNICAL.md` (Phase 1 context reference)

---

## Dependencies / Blockers

- none

This is a documentation-only pass with no code dependencies. It can proceed independently of any in-flight feature specs.

---

## Constraints

- No code changes — documentation only
- Architecture documents must describe implemented reality, not aspirational state
- Updates must preserve the existing document structure and conventions
- Each document update must be verifiable by comparing documentation claims against repository contents
- Phase 1 assumptions section should be structured and actionable, not vague

---

## Proposed Behavior

### User Flow

This is an internal workflow spec. There is no user-facing flow.

### System Behavior

Each architecture document is audited against the current repository state:

1. **Structure audit**: Compare documented file/folder layouts against actual `ls`/`find` output. Identify entries that are documented but missing, or present but undocumented.

2. **Content audit**: Compare documented patterns, APIs, contracts, and conventions against actual implementation. Identify descriptions that no longer match code, or code patterns that have no documentation.

3. **Update pass**: For each identified drift point, update the documentation to match implementation. Where the implementation intentionally diverges from original plans, add explicit notes explaining the deviation.

4. **Phase 1 boundary capture**: For each document area that touches a Phase 1 boundary (adapter layer, API contract, backend integration points, schema ingestion, deployment model), capture:
   - What the current implementation assumes
   - What Phase 1 will need to provide
   - Open questions that Phase 1 planning must resolve

### Failure / Edge Behavior

- If a documented module/file cannot be located in the repository, the documentation entry is removed or marked as `[not yet implemented]` depending on whether it was planned future work vs. incorrectly documented as present
- If implementation contains patterns not described in any architecture doc, a decision must be made: add documentation if the pattern is architecturally significant, or skip if it is implementation detail
- If active specs (FS-050–053) have introduced changes that conflict with documentation, note the conflict but do not resolve — those specs will update docs on completion

---

## Acceptance Examples

### AE-01 — Structural drift detected and corrected

**Given**
- `project-structure.md` documents `src/types/` as a top-level directory

**When**
- Repository audit reveals `src/types/` does not exist (only `src/engine/types/` exists)

**Then**
- `project-structure.md` is updated to remove the non-existent `src/types/` entry
- The reconciliation summary notes this as a documentation correction

### AE-02 — Undocumented pattern codified

**Given**
- UI implementation uses `HybridAdapter` for AI showcase slices (FS-041/042/046)
- `ui-application.md` documents this pattern

**When**
- Audit confirms the documentation matches the implementation

**Then**
- No change needed — pattern is already documented
- Reconciliation summary confirms alignment

### AE-03 — Phase 1 assumption captured

**Given**
- `LocalStorageAdapter` implements the full `ApiAdapter` contract locally
- Phase 1 will require `HttpAdapter` to provide the same contract over HTTP

**When**
- Audit reviews the adapter boundary

**Then**
- A Phase 1 assumptions entry documents:
  - Current adapter methods and their contracts
  - Which methods are CRUD vs. compute-intensive
  - What backend API surface Phase 1 must provide
  - Open questions (e.g., pagination, optimistic updates, error contract)

### AE-04 — Intentional simplification documented

**Given**
- Original architecture planned for XSD schema support
- Implementation has only a permissive stub (SchemaTree always returns true for hasPath)

**When**
- Audit identifies the XSD stub as an intentional Phase 0 simplification

**Then**
- Documentation explicitly notes: "XSD support is stubbed in Phase 0 (permissive — no false positives). Full XSD parsing is deferred to Phase 1+ if required."

### AE-05 — INDEX.md dates and coverage accurate

**Given**
- Architecture documents have been updated during reconciliation

**When**
- Final reconciliation task runs

**Then**
- `INDEX.md` has updated `Last Updated` dates for all modified documents
- `INDEX.md` coverage descriptions accurately reflect current document scope
- Recent update note reflects the reconciliation pass

---

## Open Questions

- none

---

## Verification Strategy

Each task produces verifiable documentation outputs:

- **Structure audits (T-01)**: Every directory/file documented in `project-structure.md` can be confirmed to exist via filesystem traversal. Every directory/file in the repository that is architecturally significant is documented.
- **Content audits (T-02, T-03)**: Updated documentation claims can be verified against source code (exported APIs match documented APIs, module boundaries match documented boundaries, patterns described match patterns implemented).
- **Phase 1 assumptions (T-07)**: Each assumption entry references a concrete current implementation detail and a specific Phase 1 requirement or open question.
- **INDEX.md (T-08)**: Dates and coverage text are current and accurate.

Manual verification: a reader should be able to load any architecture document and trust that it describes the current repository state without needing to re-derive from code.

---

## Task Generation Notes

This spec decomposes into 8 tasks organized in three phases:

**Phase A — Audit (T-01 through T-03):**
- T-01: Repository structure audit (compare actual layout to `project-structure.md`)
- T-02: Mapping engine audit (compare `src/engine/` implementation to `mapping-engine.md`)
- T-03: UI application audit (compare `ui/src/` implementation to `ui-application.md`)

These three tasks can execute in parallel. Each produces an audit finding set (drift points, confirmations, missing items).

**Phase B — Update (T-04 through T-06):**
- T-04: Update `project-structure.md` based on T-01 findings
- T-05: Update `mapping-engine.md` based on T-02 findings
- T-06: Update `ui-application.md` based on T-03 findings

Each depends on its corresponding audit task. T-04/T-05/T-06 can execute in parallel with each other.

**Phase C — Consolidate (T-07, T-08):**
- T-07: Produce Phase 1 readiness document (`forge/architecture/phase-1-readiness.md`) consolidating all Phase 1-relevant findings from T-01–T-06
- T-08: Update `INDEX.md` dates/coverage and finalize reconciliation

T-07 depends on T-04, T-05, T-06. T-08 depends on T-07.

All tasks are `Agent: task` (no UI component work).

Light review of `e2e-testing.md` and `ai-runtime.md` is folded into T-01 (structural review) and T-07 (Phase 1 relevance). If material drift is found, an additional update task may be needed — but this is not expected.

---

## Change Log

- Rev 2 — 2026-05-14
  - All open questions resolved (Q1–Q3):
    - Q1 resolved: Create standalone `forge/architecture/phase-1-readiness.md` — consolidates backend-relevant findings with cross-references to source architecture docs; avoids scattering Phase 1 notes across multiple documents
    - Q2 resolved: Light audit only for `e2e-testing.md` and `ai-runtime.md` — confirm structural accuracy; only make deeper updates if obvious drift or Phase 1-impacting inaccuracies are found
    - Q3 resolved: `specs/PRODUCT-TECHNICAL.md` used as reference only — not treated as the primary reconciliation target; used to interpret intended direction and Phase 1 context
  - No scope, behavior, or acceptance example changes
- Rev 1 — 2026-05-14
  - Initial draft
