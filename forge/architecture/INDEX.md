# Architecture Index

This file is the entry point for all architecture reference documents in this repository.

Agents must load this file before beginning any spec drafting or task execution. Load the specific documents relevant to the work area — do not load all documents indiscriminately.

This file must be kept current. When an architecture document is created or meaningfully updated, update the entry here.

---

## Documents

| Document                                       | Covers                                                                                                                                                                                                    | Last Updated |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| [project-structure.md](./project-structure.md) | Repository layout — where source code, UI code, and tests live. File and folder conventions within `src/`, `ui/`, and `tests/`.                                                                           | 2026-04-30   |
| [mapping-engine.md](./mapping-engine.md)       | Mapping engine public API, internal module boundaries, function registry pattern, execution + validate pipelines, parser/evaluator architecture, type system, constraints, and error handling philosophy. | 2026-05-01   |
| [ui-application.md](./ui-application.md)       | UI application architecture — adapter pattern, state management (AsyncState), engine integration boundary/hooks, Mapping Editor three-column target-driven layout with inline preview strip and Advanced Testing page (FS-020, FS-021), Schema Detail page architecture (FS-015), routing, component organization, technology stack, and Phase 0 constraints. | 2026-05-04   |
| [e2e-testing.md](./e2e-testing.md)             | E2E test infrastructure — Playwright configuration, page object conventions, fixture patterns, storage helpers, selector strategy, performance budget, and CI integration.                                                  | 2026-05-02   |

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
