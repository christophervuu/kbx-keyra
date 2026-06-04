# Architecture Index

This file is the entry point for all architecture reference documents in this repository.

Agents must load this file before beginning any spec drafting or task execution. Load the specific documents relevant to the work area — do not load all documents indiscriminately.

This file must be kept current. When an architecture document is created or meaningfully updated, update the entry here.

---

## Documents

| Document | Covers | Last Updated |
| --- | --- | --- |
| [deployments.md](./deployments.md) | Deployment subsystem architecture: SANDBOX control-plane + DEV/PREPROD/PROD runtime model, deploy/promote/rollback semantics, artifact relay + payload/retry contracts, retention baseline, and CDM deploy guardrail/provenance contracts. | 2026-06-03 |
| [project-structure.md](./project-structure.md) | Repository layout and file/folder conventions for `src/`, `ui/`, and `tests/`. | 2026-05-15 |
| [mapping-engine.md](./mapping-engine.md) | Mapping engine architecture: public API, parser/evaluator, validate/execute pipelines, function registry, diagnostics, and constraints. | 2026-05-14 |
| [ui-application.md](./ui-application.md) | UI architecture: adapter/state/routing/component structure, mapping workspace contracts, and CDM UX contracts including FS-078 sync-status consistency, FS-079 deploy-block messaging, and FS-080 resilience degraded/retry/failure-class handling. | 2026-06-03 |
| [phase-1-readiness.md](./phase-1-readiness.md) | Phase 0→1 readiness baseline, backend constraints implied by UI, and transition guidance including FS-081 deployment environment migration constraints (`DEV/PREPROD/PROD` + `SANDBOX` control-plane context). | 2026-06-03 |
| [e2e-testing.md](./e2e-testing.md) | E2E infrastructure, conventions, and CI acceptance-gate posture. | 2026-06-02 |
| [ai-runtime.md](./ai-runtime.md) | Shared AI runtime architecture: prompt/routing/invocation/telemetry/error-normalization contracts and feature-specific runtime addenda. | 2026-06-03 |
| [persistence-model.md](./persistence-model.md) | Persistence layer architecture: DynamoDB/S3 schemas, access patterns, and metadata/blob boundaries. | 2026-06-01 |
| [schema-ingestion.md](./schema-ingestion.md) | Schema ingestion/indexing pipeline architecture: flow, module boundaries, failure handling, and performance targets. | 2026-05-15 |
| [backend-api.md](./backend-api.md) | Backend API architecture: handler conventions, route contracts, error envelopes, and cross-cutting addenda including FS-076 CDM read-only API, FS-078 sync-status normalization, FS-079 deploy guardrails, FS-080 CDM GitHub resilience semantics, and FS-081 runtime deployment model contracts. | 2026-06-03 |
| [infrastructure.md](./infrastructure.md) | Infrastructure architecture: SAM resources, environment config, packaging, local dev, deployment conventions, and FS-081 multi-account topology/runtime footprint assumptions. | 2026-06-03 |

**Recent update notes**

- **2026-06-03 (FS-081):** updated `deployments.md`, `backend-api.md`, `infrastructure.md`, and `phase-1-readiness.md` to codify SANDBOX control-plane + DEV/PREPROD/PROD runtime model, direct-push artifact transfer (signed-pull deferred), payload-size/idempotent retry contracts, pointer-only rollback with missing-artifact remediation, runtime-local execution/preview invariants, and QA->PREPROD normalization policy.

- **2026-06-03 (FS-080):** updated `backend-api.md` and `ui-application.md` to codify CDM GitHub read resilience contracts: backend failure taxonomy (`rate-limited`, `unauthorized-forbidden`, `not-found-path-mismatch`, `timeout-transient`) + stable error codes, bounded retry/backoff+jitter behavior, browse cache TTL defaults (local 30s/dev 60s/prod 300s) with outage-only stale-grace guidance, explicit `retry-after` propagation, sync no-silent-failure invariant, and structured telemetry/request-lineage fields.
- **2026-06-03 (FS-079):** updated `deployments.md`, `backend-api.md`, and `ui-application.md` to codify CDM deployment guardrail + provenance contracts: deploy/promote pre-check gating, stable CDM block reason taxonomy (`unsynced`, `update-failed`, `metadata-incomplete`, `ingest-not-ready`, `schema-missing`), and dual-location traceability persistence.
- **2026-06-03 (FS-078):** updated `ui-application.md` and `backend-api.md` for canonical cross-surface CDM UX consistency (origin label, sync-status vocabulary, badge semantics, action-policy alignment, and backend-owned legacy normalization).
- **2026-06-03 (FS-076):** updated `backend-api.md`, `ui-application.md`, and `phase-1-readiness.md` to document CDM read-only integration foundations (root guard, one-level browse semantics, source metadata persistence/index projection, idempotent duplicate-link behavior, manual re-sync + status-refresh, and no-write GitHub invariants).

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
