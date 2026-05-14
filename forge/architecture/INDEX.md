# Architecture Index

This file is the entry point for all architecture reference documents in this repository.

Agents must load this file before beginning any spec drafting or task execution. Load the specific documents relevant to the work area — do not load all documents indiscriminately.

This file must be kept current. When an architecture document is created or meaningfully updated, update the entry here.

---

## Documents

| Document                                       | Covers                                                                                                                                                                                                    | Last Updated |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| [project-structure.md](./project-structure.md) | Repository layout — where source code, UI code, and tests live. File and folder conventions within `src/`, `ui/`, and `tests/`, including FS-050 Project Overview refinement (ProjectHeader, ProjectSummaryRow, SchemaCard badges, MappingRow/MappingListSection updates, ProjectOverviewSkeleton new layout). | 2026-05-12   |
| [mapping-engine.md](./mapping-engine.md)       | Mapping engine public API, internal module boundaries, function registry pattern, execution + validate pipelines, parser/evaluator architecture, type system, constraints, and error handling philosophy. | 2026-05-01   |
| [ui-application.md](./ui-application.md)       | UI application architecture — adapter pattern, state management (AsyncState), engine integration boundary/hooks, Mapping Editor layout/view architecture, routing, component organization, and Phase 0 constraints. Includes FS-048 Auto-Map Review Workspace architecture (mode switch `target|rules|automap`, `useAutoMapWorkspace`, persistence/staleness/refresh/preview model, and retirement of drawer composition). FS-051: Unified Builder Visual Shell — shared header/feedback/validation/content/action-row shell for both builders; Builder/Editor toggle pattern; overflow menu (⋮); capability-driven action row; completion status in both builders; ValidationSummaryRow shared component. FS-053: ParameterValueInput intent-based parameter input model (Source/Static/Item/Options/Expression-secondary); Options mode via PARAMETER_HINTS; ArgumentSlotInput deprecated. | 2026-05-14   |
| [e2e-testing.md](./e2e-testing.md)             | E2E test infrastructure — Playwright configuration, page object conventions, fixture patterns, storage helpers, selector strategy, performance budget, and CI integration.                                                  | 2026-05-02   |
| [ai-runtime.md](./ai-runtime.md)               | Shared AI runtime — prompt loading, DSL asset resolution, prompt rendering, GitHub Models invocation, structured output parsing, orchestration entry point, adapter pattern for local testing, Lambda handler conventions.   | 2026-05-11   |

**Recent update note (2026-05-14):** `ui-application.md` updated for FS-053 Intent-Based Parameter Input: `ParameterValueInput` component added to module structure; `ArgumentForm` entry updated to note ParameterValueInput delegation; `ArgumentSlotInput` marked deprecated; new "Intent-Based Parameter Input Model" subsection documents mode model, Options resolution via PARAMETER_HINTS, empty string handling, and ArgumentForm integration. Previous (2026-05-12): FS-051 Unified Builder Visual Shell.

---

## Maintenance Rules

- Add a row when a new architecture document is created.
- Update the `Last Updated` date when a document is meaningfully changed.
- Do not remove rows without an explicit architecture task authorizing the removal.
- Documents are created by the spec agent during planning and updated by the task agent during execution of architecture tasks.

---
## Reference Specifications

| Document | Path | Covers |
|----------|------|--------|
| Product & Technical Spec | `specs/PRODUCT-TECHNICAL.md` | Full product requirements, screen specs, engine overview, backend architecture |
| DSL Specification | `specs/KEYRA-DSL-SPECIFICATION.md` | DSL grammar, function catalog, type system, error codes |
| DSL Arrays | `specs/KEYRA-DSL-ARRAYS.md` | Array scoping, map/filter/find, nested contexts |
