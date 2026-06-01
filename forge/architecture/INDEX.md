# Architecture Index

This file is the entry point for all architecture reference documents in this repository.

Agents must load this file before beginning any spec drafting or task execution. Load the specific documents relevant to the work area — do not load all documents indiscriminately.

This file must be kept current. When an architecture document is created or meaningfully updated, update the entry here.

---

## Documents

| Document                                       | Covers                                                                                                                                                                                                    | Last Updated |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| [project-structure.md](./project-structure.md) | Repository layout — where source code, UI code, tests, scripts, and specs live. File and folder conventions within `src/`, `ui/`, and `tests/`, including Phase 0 implemented-vs-planned annotations for lambda domains and test placement guidance aligned to current repository reality. | 2026-05-15   |
| [mapping-engine.md](./mapping-engine.md)       | Mapping engine public API, internal module boundaries, function registry pattern, execution + validate pipelines, parser/evaluator architecture, type system, constraints, and error handling philosophy; includes documented root exports and explicit Phase 0 XSD simplification notes. | 2026-05-14   |
| [ui-application.md](./ui-application.md)       | UI application architecture — adapter pattern, state management (AsyncState), engine integration boundary/hooks, Mapping Editor layout/view architecture, routing, component organization, and Phase 0 constraints. Includes FS-048 Auto-Map Review Workspace architecture (mode switch `target|rules|automap`, `useAutoMapWorkspace`, persistence/staleness/refresh/preview model, and retirement of drawer composition). FS-051: Unified Builder Visual Shell — shared header/feedback/validation/content/action-row shell for both builders; Builder/Editor toggle pattern; overflow menu (⋮); capability-driven action row; completion status in both builders; ValidationSummaryRow shared component. FS-053: ParameterValueInput intent-based parameter input model (Source/Static/Item/Options/Expression-secondary); Options mode via PARAMETER_HINTS; ArgumentSlotInput deprecated. FS-055: HttpAdapter bootstrap selection (`VITE_API_URL` => `HttpAdapter`), shared `http-client.ts` envelope/error/retry contract, and `AdapterMethodNotImplementedError` placeholder pattern. | 2026-05-15   |
| [phase-1-readiness.md](./phase-1-readiness.md) | Phase 0 → Phase 1 backend readiness baseline — ApiAdapter boundary inventory, Phase 0 simplifications requiring resolution, backend design constraints implied by current frontend, AI showcase transition path, engine integration points, reconciliation summary, and actionable open questions for Phase 1 planning. | 2026-05-14   |
| [e2e-testing.md](./e2e-testing.md)             | E2E test infrastructure — Playwright configuration, page object conventions, fixture patterns, storage helpers, selector strategy, performance budget, and CI integration.                                                  | 2026-05-15   |
| [ai-runtime.md](./ai-runtime.md)               | Shared AI runtime — prompt loading, DSL asset resolution, prompt rendering, GitHub Models invocation, structured output parsing, orchestration entry point, adapter pattern for local testing, Lambda handler conventions.   | 2026-05-14   |
| [persistence-model.md](./persistence-model.md) | Phase 1 persistence layer — DynamoDB table schemas (Projects, Mappings, SchemaMetadata, SchemaNodes, MappingRevisions, MappingVersions), S3 object layout, access patterns, metadata-vs-blob rules, draft/revision/version model, `src/lib/persistence/` module architecture. | 2026-06-01   |
| [schema-ingestion.md](./schema-ingestion.md)   | Schema ingestion pipeline — upload → parse → store → index flow, inline vs Step Functions path, DynamoDB/S3/OpenSearch usage, module boundaries, batch sizing, query architecture, error handling, verification coverage, and performance targets. | 2026-05-15   |
| [backend-api.md](./backend-api.md)             | Phase 1 backend API architecture — Lambda handler conventions, API Gateway route table (revision/version endpoints included), DynamoDB table schemas and access patterns, S3 content storage, standardized error envelope (including request correlation IDs and TIMEOUT code), shared utility structure, error resilience flow contract, environment variables, CORS configuration, and testing approach (unit + DynamoDB Local integration). | 2026-06-01   |
| [infrastructure.md](./infrastructure.md)       | Phase 1 infrastructure — SAM template, resource definitions (DynamoDB, S3, API Gateway, Lambda, OpenSearch Serverless, Step Functions), naming conventions, environment configuration, local development setup, Lambda packaging, cold start strategy, deployment conventions. | 2026-05-31   |

**Recent update note (2026-06-01):** FS-063 updated `persistence-model.md` and `backend-api.md` for draft/revision/version semantics: split `MappingRevisions` + `MappingVersions` model, revision snapshot S3 layout (`mappings/{mappingId}/revisions/r{N}.json`), no-op hash detection + selective prune rules, and backend route/table mapping updates for revision/version endpoints. Previous (2026-05-31): FS-062 implementation completion aligned `infrastructure.md` with executed SAM/local-setup decisions: local bucket/env alias conventions (`STORAGE_BUCKET` + compatibility aliases), `docker compose` + `scripts/setup-local.sh` local flow, and bundle-size verification (`scripts/check-bundle-sizes.sh`) in the deployment pipeline. Previous (2026-05-15): FS-057 updated `backend-api.md` to reflect implemented Phase 1 route inventory (19 routes), handler conventions, shared lambda utilities, DynamoDB/S3 access patterns, environment variables, and integration-test strategy. FS-056 architecture docs refreshed to reflect completed schema query and integration/performance verification coverage (`schema-ingestion.md` + `project-structure.md`). FS-055 also updated `ui-application.md` for HttpAdapter-first bootstrap (`VITE_API_URL` → `HttpAdapter`), shared HTTP client error/retry normalization contract, and `AdapterMethodNotImplementedError` placeholder semantics; updated `phase-1-readiness.md` AI transition section to reflect HybridAdapter deprecation and new bootstrap behavior. Previous (2026-05-14): FS-062 added `infrastructure.md` (Phase 1 IaC and environment configuration architecture). FS-058 added `persistence-model.md` (Phase 1 DynamoDB/S3 persistence layer architecture). FS-057 added `backend-api.md` (Phase 1 backend API surface architecture). FS-056 added `schema-ingestion.md` (Phase 1 schema ingestion pipeline architecture). FS-054 reconciliation updates added `phase-1-readiness.md` and refreshed architecture accuracy in `project-structure.md`, `mapping-engine.md`, and `ui-application.md`.

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
