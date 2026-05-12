# Architecture Index

This file is the entry point for all architecture reference documents in this repository.

Agents must load this file before beginning any spec drafting or task execution. Load the specific documents relevant to the work area — do not load all documents indiscriminately.

This file must be kept current. When an architecture document is created or meaningfully updated, update the entry here.

---

## Documents

| Document                                       | Covers                                                                                                                                                                                                    | Last Updated |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| [project-structure.md](./project-structure.md) | Repository layout — where source code, UI code, and tests live. File and folder conventions within `src/`, `ui/`, and `tests/`, including FS-048 Auto-Map workspace modules across mappings components/hooks/lib. | 2026-05-13   |
| [mapping-engine.md](./mapping-engine.md)       | Mapping engine public API, internal module boundaries, function registry pattern, execution + validate pipelines, parser/evaluator architecture, type system, constraints, and error handling philosophy. | 2026-05-01   |
| [ui-application.md](./ui-application.md)       | UI application architecture — adapter pattern, state management (AsyncState), engine integration boundary/hooks, Mapping Editor layout/view architecture, routing, component organization, and Phase 0 constraints. Includes FS-048 Auto-Map Review Workspace architecture (mode switch `target|rules|automap`, `useAutoMapWorkspace`, persistence/staleness/refresh/preview model, and retirement of drawer composition). | 2026-05-13   |
| [e2e-testing.md](./e2e-testing.md)             | E2E test infrastructure — Playwright configuration, page object conventions, fixture patterns, storage helpers, selector strategy, performance budget, and CI integration.                                                  | 2026-05-02   |
| [ai-runtime.md](./ai-runtime.md)               | Shared AI runtime — prompt loading, DSL asset resolution, prompt rendering, GitHub Models invocation, structured output parsing, orchestration entry point, adapter pattern for local testing, Lambda handler conventions.   | 2026-05-11   |

**Recent update note (2026-05-13):** `ui-application.md` and `project-structure.md` were updated for FS-048 Auto-Map Review Workspace architecture (`EditorView` workspace mode, `useAutoMapWorkspace`, sessionStorage persistence + stale detection + refresh merge + preview integration, and retirement of `AutoMapReviewDrawer` composition while retaining legacy files).

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
