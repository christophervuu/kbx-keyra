# SPEC

## Title

Replace OpenSearch with DynamoDB-only Schema Retrieval for AI RAG (Cost Reduction Phase)

---

## ID

FS-091

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-09  
Last Updated: 2026-06-09  
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

This spec removes OpenSearch Serverless from KeyRa runtime schema-retrieval paths used by AI features and replaces it with a DynamoDB-only retrieval pipeline. The new flow uses indexed lexical candidate generation, optional in-Lambda vector rerank, and bounded structural enrichment while keeping existing API contracts stable for UI clients. Success means AI routes continue to function with acceptable relevance/latency and materially lower monthly search infrastructure cost.

---

## Problem

KeyRa’s current AI schema retrieval depends on OpenSearch Serverless (OpenSearch-first query contract with DynamoDB fallback). That baseline cost is too high for current internal-tool usage volume, and maintaining always-on search infrastructure is not cost-efficient at this stage.

If OpenSearch remains a runtime dependency, search costs remain disproportionately high relative to product usage, and retrieval architecture complexity remains higher than needed for this phase.

---

## Goal

Adopt a single DynamoDB-backed retrieval architecture for AI schema context assembly and schema node querying, removing OpenSearch from runtime code paths and infrastructure while preserving practical latency and acceptable AI relevance quality.

---

## Assumptions

- Existing `SchemaNodes` DynamoDB structure and parent/child indexes remain available and extensible.
- Existing AI APIs (`aiAutoMap`, `aiSuggestExpression`, `aiSmartFix`, `aiValidateMappings`) must keep backward-compatible response shapes.
- Existing UI flows (authoring and preview loop) should not require UI contract changes in this phase.
- Query quality can remain acceptable using lexical retrieval + optional embedding rerank without dedicated search infrastructure.
- Feature flags are available for phased rollout (`opensearch`, `dynamodb`, `shadow` behavior).

---

## Current Context

- Architecture docs loaded for this work area: `forge/architecture/ai-runtime.md`, `schema-ingestion.md`, `backend-api.md`, `persistence-model.md`, `infrastructure.md`, `project-structure.md`.
- Current architecture still documents OpenSearch-first retrieval for AI-adjacent schema query and ingestion indexing.
- In-progress related active specs include FS-087/FS-088/FS-089/FS-090 (schema model/detail UX); this spec is backend/infra-focused and must preserve those schema metadata contracts.
- Existing subsystem coverage already exists for AI runtime, ingestion, backend API, persistence, and infra; no new subsystem architecture document is required.
- Next available spec number after scanning `forge/active/` and `forge/completed/` is `FS-091`.

---

## Scope

### In Scope

- Runtime retrieval migration from OpenSearch-first to DynamoDB-only for:
  - `aiAutoMap`
  - `aiSuggestExpression`
  - `aiSmartFix`
  - `aiValidateMappings`
  - `querySchemaNodes` if still OpenSearch-backed
- Introduce retriever abstraction and DynamoDB retriever implementation.
- DynamoDB lexical candidate retrieval model (token/index strategy) with deterministic candidate cap.
- Optional embedding rerank in Lambda over bounded candidate sets.
- Structural enrichment via existing DynamoDB parent/sibling/children relations with bounded expansion.
- Deterministic top-K output for prompt assembly and AI request context.
- Ingestion/indexing updates required to support Dynamo retrieval signals.
- Backfill path for existing schemas.
- Feature-flagged rollout with shadow comparison mode.
- Observability for retrieval latency, ranking stages, and quality proxy metrics.
- Infra changes to remove OpenSearch resources/permissions from runtime stack.
- Documentation updates (product technical + backend/ops/cost assumptions).

### Out of Scope

- Changes to mapping engine DSL behavior.
- Deployment/snapshot model redesign.
- Auth, tenancy, or permission model redesign.
- Introducing a new external vector database.
- Major UI workflow redesign.

---

## Non-Goals

- Achieving identical OpenSearch-era ranking behavior.
- Building generalized semantic search platform capabilities beyond this cost-reduction phase.
- Reworking AI prompt contracts beyond retrieval input assembly requirements.

---

## Relevant Areas

- `src/lambda/ai/auto-map.ts`
- `src/lambda/ai/suggest-expression.ts`
- `src/lambda/ai/smart-fix.ts`
- `src/lambda/ai/validate-mappings.ts`
- `src/lambda/schema/query-schema-nodes.ts`
- `src/lib/schema/opensearch/*`
- `src/lib/schema/dynamo/*`
- `src/lib/schema/types.ts`
- `src/lib/schema/constants.ts`
- `src/lib/persistence/schema-nodes.ts`
- `src/lambda/schema/ingest-schema.ts`
- `src/lambda/schema/process-batch.ts`
- `src/lambda/schema/orchestration-tasks.ts`
- `template.yaml`
- `tests/lambda/ai/*.test.ts`
- `tests/lambda/schema/query-schema-nodes.test.ts`
- `tests/lambda/schema/ingest-schema.test.ts`
- `tests/lib/schema/*`
- `forge/architecture/ai-runtime.md`
- `forge/architecture/schema-ingestion.md`
- `forge/architecture/backend-api.md`
- `forge/architecture/persistence-model.md`
- `forge/architecture/infrastructure.md`
- `forge/architecture/INDEX.md`
- `specs/PRODUCT-TECHNICAL.md`

---

## Dependencies / Blockers

- Depends on preserving existing schema metadata contracts established in FS-089/FS-090.
- Depends on representative benchmark fixtures (small/medium/large including ~23k-field schema) being available or created.
- Requires infra deployment sequencing to avoid cutting OpenSearch before Dynamo retrieval parity is validated.

---

## Constraints

- No breaking API changes for existing UI consumers.
- Retrieval pipeline must support all schema sizes with one canonical runtime path.
- Deterministic top-K behavior required for stable prompt assembly/debuggability.
- Candidate set must be hard-capped before rerank for latency control.
- Default environment caps for this phase are:
  - DEV: `lexicalCap=120`, `rerankCap=80`, `topK=12`, `contextExpansionCap=24`
  - QA: `lexicalCap=150`, `rerankCap=100`, `topK=15`, `contextExpansionCap=30`
  - PROD: `lexicalCap=180`, `rerankCap=120`, `topK=18`, `contextExpansionCap=36`
- Guardrail relationship: `rerankCap <= lexicalCap`, `topK << rerankCap`, and tightly bounded expansion.
- Retrieval latency targets:
  - small schema: p95 < 300ms
  - medium schema: p95 < 800ms
  - large schema: p95 < 1500ms
- Quality guardrail: suggestion acceptance rate drop must remain within 10% vs pre-migration baseline.
- Shadow parity gates for cutover:
  - Canonical metric: Top-K Jaccard overlap (K=10), averaged over sampled queries, target `>= 0.70`
  - Safety metric: NDCG@10 delta (DynamoDB vs OpenSearch weak-label baseline), target `>= -0.10`
- Client-side preview latency target (<2s) must not regress.
- Runtime OpenSearch dependency must be fully removable after cutover.

---

## Proposed Behavior

### User Flow

- End users continue using AI-assisted flows (auto-map, suggest expression, smart fix, validate mappings) with no contract changes in UI interactions.
- During rollout, behavior remains stable while backend can run shadow retrieval comparisons without exposing alternate outputs to users.
- After cutover, all AI retrieval-backed outcomes come from DynamoDB-only retrieval.

### System Behavior

1. **Retriever abstraction**
   - Introduce a schema retriever interface consumed by AI handlers and query endpoint.
   - Implement runtime-selectable retriever mode: `dynamodb`, `opensearch` (temporary), `shadow`.

2. **Dynamo lexical candidate generation**
   - Use indexed lexical signals (`fieldNameNormalized`, `pathTokens`, `type`, `depth`) from Dynamo-backed structures.
   - Use either/both:
     - SchemaNodes GSI-based lookups
     - Inverted token table (`schemaId#token` partition strategy)
   - Apply deterministic hard cap before rerank.

3. **Optional vector rerank in Lambda**
   - Compute query embedding once per retrieval request.
   - Compute cosine similarity only over capped candidates with stored node embeddings.
   - Embeddings remain per-node in DynamoDB in this phase.
   - Guardrail: if item-size pressure or high read-cost pressure is observed, migrate to hybrid embedding storage:
     - keep lexical/index metadata in DynamoDB
     - move embedding vectors to `schemas/{schemaId}/embeddings/{chunk}.json` in S3
     - fetch only rerank-candidate vectors by path
   - Blend lexical + vector + path/type boost scoring in deterministic order.

4. **Structural enrichment**
   - Fetch bounded parent/sibling/children context from Dynamo indexes.
   - Prevent unbounded fan-out to avoid prompt bloat/latency spikes.

5. **Output assembly**
   - Return deterministic top-K nodes + bounded context expansion.
   - Preserve existing response envelopes for AI routes and `querySchemaNodes` consumers.

6. **Ingestion and backfill**
   - Ingestion writes retrieval-ready lexical/embedding fields needed for Dynamo retrieval.
   - Backfill existing schemas to populate missing retrieval fields/tokens.

7. **Rollout and observability**
   - Shadow mode compares Dynamo vs OpenSearch retrieval quality/latency in logs/metrics.
   - Canonical shadow KPI is Top-K Jaccard overlap; NDCG@10 delta is a safety gate.
   - Phase scope uses global defaults with environment-level overrides only (no per-project/per-schema tuning presets).
   - Gradual cutover in non-prod then prod.
   - Remove OpenSearch infra/resources/ingestion writes after validation window.

### Failure / Edge Behavior

- If embedding generation/rerank is unavailable, retrieval falls back to lexical-only scoring without request failure.
- If token/index data is partially missing for a schema during migration, retrieval returns best-effort lexical results and emits migration-gap metrics.
- If candidate caps are exceeded, deterministic truncation is applied before rerank/enrichment.
- `querySchemaNodes` validation and error semantics remain consistent (400/404/500 behavior preserved).
- Shadow mode failures must not impact primary response path.

---

## Acceptance Examples

### AE-01 — AI routes use DynamoDB-only retriever in active mode

**Given**
- Runtime retriever mode is set to `dynamodb`
- Schema retrieval is needed by `aiAutoMap`, `aiSuggestExpression`, `aiSmartFix`, or `aiValidateMappings`

**When**
- An AI route executes retrieval

**Then**
- Retrieval uses DynamoDB-only pipeline
- No OpenSearch runtime call occurs in the serving path
- Response contract remains backward compatible

### AE-02 — Deterministic lexical + rerank + top-K output

**Given**
- A query and schema with candidate count above cap

**When**
- Retrieval executes candidate generation, optional rerank, and top-K selection

**Then**
- Candidate set is hard-capped deterministically before rerank
- Final ranking is deterministic for equivalent inputs
- Returned top-K output ordering is stable across repeated runs

### AE-03 — Structural enrichment remains bounded

**Given**
- Top-K nodes include deeply nested fields with many siblings/children

**When**
- Context enrichment runs

**Then**
- Parent/sibling/children expansion uses configured bounds
- Prompt context does not exceed configured expansion caps
- Retrieval latency remains within target envelopes for benchmark schemas

### AE-04 — Query endpoint parity without OpenSearch

**Given**
- `POST /schemas/:id/query` is called with valid request

**When**
- Endpoint executes schema node retrieval

**Then**
- Results are served by DynamoDB-only retrieval path
- Existing route contract and response shape remain compatible
- Error semantics remain unchanged for invalid/missing/failure cases

### AE-05 — Shadow mode logs quality/latency deltas without user impact

**Given**
- Runtime retriever mode is `shadow`

**When**
- Retrieval-backed request executes

**Then**
- Primary response uses DynamoDB output only
- OpenSearch path runs only for comparison logging/metrics (until decommission)
- Diff telemetry captures candidate counts, timing, and rank-overlap metrics

### AE-06 — Ingestion/backfill support Dynamo retrieval signals

**Given**
- A new or existing schema is processed

**When**
- Ingestion or backfill pipeline runs

**Then**
- Required lexical and embedding retrieval fields are persisted in Dynamo-backed storage
- Schema is queryable through Dynamo retrieval without OpenSearch index dependency

### AE-07 — OpenSearch infra removed after cutover

**Given**
- Cutover validation has passed in production window

**When**
- Infra cleanup executes

**Then**
- OpenSearch collection/resources/IAM permissions are removed from runtime stack
- Ingestion no longer writes OpenSearch documents
- Runtime operates without OpenSearch environment configuration

### AE-08 — Cost and quality goals are measurable and met

**Given**
- Baseline metrics before migration and measurement window after cutover

**When**
- Two-week post-cutover review runs

**Then**
- Search-related monthly run rate shows material reduction (target >70%)
- Suggestion acceptance-rate degradation remains within 10% threshold
- Latency SLO measurements meet defined p95 targets by schema size tier

---

## Open Questions

- none

---

## Verification Strategy

- **Automated unit tests**
  - Retrieval scoring/capping determinism (`AE-02`, `AE-03`)
  - Retriever mode routing and shadow execution behavior (`AE-01`, `AE-05`)
  - Ingestion tokenization/index-field generation (`AE-06`)
- **Automated integration tests**
  - AI handler retrieval integration with Dynamo-only path (`AE-01`, `AE-05`)
  - `querySchemaNodes` parity and error semantics (`AE-04`)
  - Backfill + queryability for legacy schemas (`AE-06`)
- **Performance/benchmark tests**
  - Representative small/medium/large schema latency measurements (`AE-03`, `AE-08`)
- **Infra/config validation**
  - Template/resource diff confirms OpenSearch removal and IAM cleanup (`AE-07`)
- **Operational validation**
  - Shadow telemetry review and cutover report (`AE-05`, `AE-08`)
  - Two-week post-cutover cost and quality review (`AE-08`)

---

## Task Generation Notes

- Decompose by backend runtime, ingestion/data model, observability, infra, and documentation concerns.
- All execution tasks in this spec are backend/infrastructure/architecture work; assign `Agent: task` for each.
- Include an explicit architecture update task because this spec materially changes existing AI runtime, ingestion, persistence, backend API, and infrastructure architecture docs.
- Sequence should allow safe rollout: abstraction + dual-mode support before decommission cleanup.
- Include a dedicated verification/benchmark task to enforce latency and quality guardrails before OpenSearch removal.

---

## Change Log

- Rev 1 — 2026-06-09
  - Initial draft
- Rev 2 — 2026-06-09
  - Resolved Q1: embeddings remain per-node in DynamoDB for this phase with a hard guardrail and defined hybrid S3 fallback trigger/path.
  - Resolved Q2: set environment default caps (DEV/QA/PROD) for lexical, rerank, top-K, and context expansion.
  - Resolved Q3: global defaults only in this phase (environment overrides allowed), no per-project/per-schema presets yet.
  - Resolved Q4: set canonical shadow parity KPI to Top-K Jaccard overlap (target >= 0.70 at K=10) plus safety gate NDCG@10 delta (target >= -0.10).
