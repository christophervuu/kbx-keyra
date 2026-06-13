# SPEC

## Title

Support multi-input mappings with named enrichment payloads

---

## ID

FS-093
Assigned sequentially. `FS` = Feature Spec.

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-12  
Last Updated: 2026-06-12  
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

KeyRa currently executes mappings from a single primary source payload. This spec adds support for zero or more named enrichment inputs supplied by the calling workflow at runtime, while preserving the engine’s pure/no-I/O architecture and current save/deploy separation. Users can define enrichment schema inputs, author rules against primary + enrichment fields (including minimal mixed conditional builder support), and preview/execute mappings with versioned input sets containing `sourceData + externalSources`.

---

## Problem

Primary source payloads (for example Kafka events) often do not contain all fields needed by target contracts. Workflows already fetch supplemental data from external systems before calling KeyRa, but KeyRa’s mapping model and UI currently center on single-input mapping and do not provide a first-class enrichment input definition and runtime contract.

---

## Goal

Enable mappings to transform:

- primary source payload + zero or more named enrichment payloads -> target output

while keeping external I/O outside KeyRa and making enrichment usage fully available across backend contracts, Lambda runtime input, adapters, Mapping Editor authoring, and preview/test input sets.

---

## Assumptions

- KeyRa mapping engine remains pure and must not call REST/gRPC/DynamoDB directly.
- Calling workflow (Step Functions, orchestrator, client) resolves enrichment payloads before invoking KeyRa runtime.
- Existing mappings without enrichments must remain valid and executable without migration blockers.
- Existing architecture coverage for backend API, persistence model, UI application, mapping engine, and deployments is sufficient; this spec updates existing documents rather than introducing a new subsystem document.
- `external("alias")` remains the DSL access pattern for enrichment inputs.
- `enrichmentSources` is canonical; `config.externalSources` remains a derived compatibility surface for engine validation and legacy mapping continuity.

---

## Current Context

Repository and architecture context loaded before drafting:

- `forge/architecture/INDEX.md` reviewed, with relevant docs loaded: `backend-api.md`, `persistence-model.md`, `ui-application.md`, `mapping-engine.md`, `deployments.md`.
- Related in-progress specs reviewed: FS-087/FS-088/FS-089/FS-090/FS-092 (schema model, create-mapping UX, mapping-editor redesign).
- Existing backend architecture defines mapping CRUD + preview/runtime handlers and schema usage/conflict handling surfaces that must be extended for enrichment references.
- Existing mapping engine architecture already includes `external()` and validation pass for `config.externalSources`; this spec expands declaration/runtime contracts and editor-guided usage.
- Existing persistence and UI contracts are single-source oriented in many surfaces and must be made enrichment-aware while preserving backward compatibility.

---

## Scope

### In Scope

- Mapping model updates to support mapping-level enrichment input metadata (alias, schema, required, description).
- Runtime contract updates for generic mapping execution Lambda input (`mappingId`, `sourceData`, `externalSources`).
- Backend/Lambda updates for create/get/update/list/duplicate/preview/execute/schema-usage behavior.
- Validation updates to ensure `external("alias")` references declared enrichment aliases.
- Adapter/shared type updates (`ApiAdapter`, HTTP/local adapters, fixtures, mocks).
- Create Mapping page support for optional enrichment input configuration.
- Project Overview mapping summary support (`source + N enrichments -> target`) while preserving “linked schemas” header model.
- Mapping Editor input browsing and builder support for primary + enrichment fields.
- Preview/Test Case model updates to support input sets with named enrichment samples.
- Compatibility behavior for existing mappings/samples with no enrichments.
- Minimal deployment compatibility to include enrichment schema references/aliases in snapshot metadata where snapshot logic already exists.
- Architecture documentation updates for changed existing subsystems.

### Out of Scope

- Implementing enrichment resolvers/connectors (REST/gRPC/DynamoDB/API clients) inside KeyRa.
- Any engine-side external I/O behavior.
- Full Deployment Page redesign.
- Complete AI auto-map enrichment intelligence if existing auto-map remains stable without it.
- Introducing equal peer “source1/source2” UX model; terminology remains “Primary source” + “Enrichment inputs”.

---

## Non-Goals

- Do not make KeyRa runtime fetch enrichment data from external systems.
- Do not require enrichments on every mapping.
- Do not replace raw DSL authoring capability.
- Do not force immediate full conditional-builder parity if phased delivery is required.

---

## Relevant Areas

- `src/lib/persistence/types.ts`
- `src/lib/persistence/mappings.ts`
- `src/lambda/mapping/create-mapping.ts`
- `src/lambda/mapping/get-mapping.ts`
- `src/lambda/mapping/update-mapping.ts`
- `src/lambda/mapping/list-mappings.ts`
- `src/lambda/mapping/duplicate-mapping.ts`
- `src/lambda/mapping/delete-mapping.ts`
- `src/lambda/mapping/*preview*` ?
- `src/lambda/*generic mapping execution runtime*` ?
- `src/lambda/schema/delete-schema.ts`
- `src/engine/validate/constants-externals.ts`
- `src/engine/functions/source-access.ts`
- `ui/src/lib/types/domain.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/http-adapter.ts`
- `ui/src/lib/api/local-storage-adapter.ts`
- `ui/src/features/projects/components/CreateMappingPage.tsx`
- `ui/src/features/projects/components/ProjectOverviewPage.tsx` ?
- `ui/src/features/mappings/components/MappingEditorPage.tsx`
- `ui/src/features/mappings/components/*Builder*`
- `ui/src/features/mappings/hooks/use-preview-execution.ts`
- `forge/architecture/backend-api.md`
- `forge/architecture/persistence-model.md`
- `forge/architecture/ui-application.md`
- `forge/architecture/mapping-engine.md`
- `forge/architecture/deployments.md`

---

## Dependencies / Blockers

- Align with FS-087/FS-089 schema metadata and linked-schema semantics.
- Align with FS-088 Create Mapping single-page layout contract.
- Align with FS-092 Mapping Editor architecture (target-first grid + row details panels) when integrating input browser and builder terminology.
- Confirm actual runtime handler file(s) used for generic mapping execution/preview in current codebase during task execution.

---

## Constraints

- Preserve engine pure/no-I/O behavior.
- Preserve existing mappings and sample payloads with no enrichments.
- Keep project header metric as “linked schemas” only (no primary/target/enrichment breakdown in header).
- Save/deploy separation remains unchanged.
- Enrichment alias must be stable and unique per mapping because expressions reference alias names.
- Missing required enrichment payloads must hard-fail at preflight before expression execution.
- Missing optional enrichment payloads and legacy undeclared schema-less externals remain warning/null behavior.

---

## Proposed Behavior

### User Flow

1. User creates mapping with required Mapping Name, Primary Source Schema, and Target Schema.
2. User may optionally add one or more enrichment inputs (`alias + schema + required flag + description`) in a collapsible section.
3. In Mapping Editor, user browses input fields grouped as:
   - Primary source
   - Enrichment inputs (by alias)
4. Builder supports selecting enrichment fields without manual DSL entry and generates `get(external("alias"), "path")`.
5. Preview/Test uses an Input Set containing `sourceData` and optional `externalSources` payloads.
6. Runtime invocation sends `mappingId + sourceData + externalSources`; KeyRa resolves mapping and executes without external calls.

### System Behavior

- Mapping model adds `enrichmentSources[]` at mapping level:
  - `alias` (required, unique, camelCase)
  - `schemaId` (required)
  - `required` (default true)
  - `description` (optional)
- Canonicality/compatibility model:
  - `enrichmentSources` is canonical mapping-level definition.
  - `config.externalSources` is derived compatibility data for engine validation/legacy records.
  - If both exist, runtime/model logic treats `enrichmentSources` as source of truth and derives/unions `config.externalSources` for compatibility.
  - If only legacy `config.externalSources` exists, aliases are treated as schema-less legacy enrichment entries until explicitly upgraded.
- Runtime input contract for generic execution Lambda supports:
  - `mappingId`
  - `sourceData`
  - `externalSources: Record<alias, unknown>`
- Mapping runtime loads active mapping/snapshot by `mappingId`; caller does not provide mapping rules directly.
- Validation verifies each `external("alias")` call references declared mapping enrichment aliases.
- Schema dependency/usage logic treats enrichment schemas as linked dependencies and blocks schema deletion when referenced as enrichment.
- Get/list mapping APIs return enrichment summaries sufficient for project overview representation.
- Duplicate mapping preserves enrichment definitions.
- Preview execution accepts sample `sourceData + externalSources` input and surfaces missing-required enrichment issues clearly.
- Preview/test persistence uses versioned input sets:
  - `name`
  - `sourceData`
  - `externalSources`
  - optional `expectedOutput`
  - legacy single-source samples migrate to input sets with `externalSources: {}`
- Deployment snapshot metadata includes enrichment schema refs + alias + required flag when snapshot creation path exists.

### Failure / Edge Behavior

- Missing required enrichment payload at runtime yields deterministic hard preflight error (no partial execution).
- Missing optional enrichment payload does not hard-fail mapping by default; referenced expressions follow null/warning behavior.
- Undeclared alias usage (`external("foo")` with no matching enrichment definition) yields validation diagnostic.
- Alias collisions/reserved-name conflicts block create/update mapping validation.
- Existing legacy mappings with no `enrichmentSources` continue to load with default empty enrichments.

---

## Acceptance Examples

### AE-01 — Create legacy mapping without enrichments

**Given**
- user provides mapping name, primary source schema, and target schema

**When**
- user creates mapping with zero enrichment rows

**Then**
- mapping is created successfully and behaves exactly as current single-source mapping

### AE-02 — Create mapping with enrichments

**Given**
- user defines primary source + target and two enrichment inputs

**When**
- user creates mapping

**Then**
- mapping metadata persists enrichment definitions with stable aliases and schema references

### AE-03 — Alias validation

**Given**
- user adds enrichment inputs with duplicate alias or reserved keyword conflict

**When**
- user attempts save/create

**Then**
- validation blocks submission and displays deterministic alias validation feedback

### AE-04 — Project overview summary

**Given**
- mapping has primary source + 2 enrichment inputs + target

**When**
- project overview renders mappings table

**Then**
- row summary displays `source + 2 enrichments -> target` and detail tooltip shows primary/enrichment/target breakdown

### AE-05 — Mapping editor input browser grouping

**Given**
- mapping includes enrichment aliases `customerProfile` and `accountSettings`

**When**
- user opens input browser

**Then**
- fields are grouped into Primary Source and Enrichment Inputs with each alias selectable

### AE-06 — Guided enrichment field selection generates DSL

**Given**
- user selects enrichment alias and field in Builder

**When**
- user applies mapping source selection

**Then**
- expression generated is `get(external("alias"), "field.path")`

### AE-07 — Mixed primary + enrichment rule execution

**Given**
- expression references both `source()` and `external()`

**When**
- preview/runtime executes with both payloads

**Then**
- target value is computed correctly using both inputs

### AE-08 — Preview input set supports enrichments

**Given**
- input set contains `sourceData` and one enrichment sample payload

**When**
- user runs preview

**Then**
- preview sends both payload classes and renders result + diagnostics

### AE-09 — Runtime contract uses mappingId + inputs only

**Given**
- caller invokes generic mapping Lambda

**When**
- request includes `mappingId`, `sourceData`, `externalSources`

**Then**
- runtime resolves active mapping config by id and executes without caller-supplied rules/config

### AE-10 — Missing required enrichment diagnostic

**Given**
- mapping declares required enrichment alias and request omits it

**When**
- preview/runtime executes

**Then**
- system emits clear missing-enrichment diagnostic and follows configured fail/warn policy

### AE-11 — Backward compatibility for old mappings/samples

**Given**
- legacy mapping records and preview samples contain only source payload

**When**
- records are loaded and executed

**Then**
- behavior remains valid without migration breakage

### AE-12 — CRUD/list/duplicate preserve enrichment metadata

**Given**
- enriched mapping exists

**When**
- user gets/lists/updates/duplicates mapping

**Then**
- enrichment metadata is correctly preserved/returned across all flows

### AE-13 — Schema usage and delete guard includes enrichments

**Given**
- schema is referenced as enrichment in one or more mappings

**When**
- delete schema is attempted

**Then**
- operation is blocked with conflict details indicating enrichment usage references

### AE-14 — Engine external alias declaration validation

**Given**
- rule uses `external("customerProfile")` but mapping declares no such alias

**When**
- mapping validation runs

**Then**
- deterministic diagnostic is returned for undeclared external alias

### AE-15 — Canonical + compatibility enrichment field behavior

**Given**
- mapping contains `enrichmentSources` and/or legacy `config.externalSources`

**When**
- mapping is loaded and normalized

**Then**
- `enrichmentSources` is canonical and `config.externalSources` is derived/unioned compatibility data

### AE-16 — Required enrichment preflight hard fail

**Given**
- mapping defines required enrichment alias and runtime request omits payload

**When**
- preview/runtime invocation starts

**Then**
- invocation fails at preflight with deterministic error and does not continue execution

### AE-17 — Legacy sample migration to input sets

**Given**
- stored test samples use old single-source shape

**When**
- samples are loaded/migrated

**Then**
- each sample is represented as an input set with `externalSources: {}` and remains executable

---

## Open Questions

- none

---

## Verification Strategy

- Automated backend/unit/integration coverage for AE-01/02/03/09/10/11/12/13/14.
- Engine-level unit tests for external alias declaration and runtime diagnostic behavior (AE-07/10/14).
- Adapter contract and serialization tests for local + HTTP modes (AE-08/11/12).
- UI component/integration tests for Create Mapping enrichment management, Project Overview summary, Mapping Editor input browser and builder expression generation (AE-04/05/06).
- Preview/Test Lab integration coverage for input set payload composition and legacy sample migration (AE-08/10/11/17).
- Manual regression checks:
  - legacy mapping create/edit/save/deploy behavior,
  - no runtime external I/O calls introduced,
  - deployment snapshot compatibility metadata behavior.
- Standard quality gates for touched areas: lint, typecheck, and relevant test suites.

---

## Task Generation Notes

- Split by execution domain:
  - `task`: architecture/model, backend/Lambda, engine, adapters/types, integration verification
  - `ui-task`: Create Mapping, Project Overview, Mapping Editor, preview/test input-set UI
- Include explicit architecture update task for existing docs (`backend-api.md`, `persistence-model.md`, `ui-application.md`, `mapping-engine.md`, `deployments.md`, `INDEX.md`).
- Keep backend contract/migration work separate from UI authoring changes to avoid mixed-domain tasks.
- Ensure one dedicated verification task validates backward compatibility and enriched mapping E2E path.
- Defer Project Overview `Manage Inputs` action to Phase 2 (Phase 1 summary-only in overview row).
- Include minimal mixed primary/enrichment conditional builder support in Phase 1; defer advanced/nested conditional authoring to Phase 2.
- Replace guided UI terminology from “External source” to “Enrichment input”; keep `external(...)` language for Advanced Mode/raw DSL/technical diagnostics.

---

## Change Log

Each revision entry should state what changed and why.

- Rev 1 — 2026-06-12
  - Initial draft
- Rev 2 — 2026-06-12
  - Resolved Q1-Q7 with explicit decisions: canonical `enrichmentSources` + derived `config.externalSources`; required-missing enrichment hard preflight error; Project Overview `Manage Inputs` deferred to Phase 2; minimal mixed conditional builder included in Phase 1; guided UI terminology shifted to “Enrichment input”; legacy mapping normalization/defaulting rules codified; preview/test data persisted as versioned input sets with migration from single-source samples.
