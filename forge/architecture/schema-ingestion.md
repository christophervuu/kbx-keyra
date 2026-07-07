# Schema Ingestion Pipeline

This document describes the architecture of the schema ingestion and retrieval-preparation pipeline — the backend subsystem responsible for converting uploaded schemas into a queryable, retrieval-ready tree representation.

---

## 1) Overview

The schema ingestion pipeline is triggered when a user uploads a schema file (JSON Schema or XSD). It transforms raw schema content into:

1. **SchemaMetadata** — a DynamoDB record tracking schema identity and lifecycle state
2. **SchemaNodes** — a DynamoDB tree of individual field records with structural + retrieval metadata
3. **S3 content** — original file preservation and processed JSON content

After FS-091 cutover (T-08), OpenSearch is decommissioned from serving and ingestion paths. Retrieval is DynamoDB-only at runtime.

The pipeline supports all schema sizes through a single conceptual flow with two execution paths:
- **Inline** (< 500 fields): processed synchronously within a single Lambda invocation
- **Orchestrated** (>= 500 fields): coordinated by AWS Step Functions with parallel batch processing

---

## 2) Module Structure

```
src/
  lib/
    schema/
      index.ts                   Barrel exports
      types.ts                   SchemaNode, SchemaMetadata, pipeline types
      retriever.ts               Runtime schema retriever abstraction (Dynamo-only serving mode post-cutover)
      constants.ts               Thresholds and batch size constants
      embedding-text.ts          Embedding text generation utility
      parser/
        index.ts                 Parser barrel
        parse-json-schema.ts     JSON Schema → SchemaNode[]
        parse-xsd.ts             XSD → SchemaNode[]
        utils.ts                 Shared traversal helpers
      dynamo/
        index.ts                 DynamoDB barrel
        metadata-writer.ts       SchemaMetadata CRUD
        node-writer.ts           BatchWriteItem with retry
        node-reader.ts           Parent-chain / children helpers
      s3/
        index.ts                 S3 barrel
        schema-storage.ts        Original + processed content storage
  lambda/
    schema/
      ingest-schema.ts             POST /schemas handler (inline + SFN dispatch)
      query-schema-nodes.ts        POST /schemas/:id/query handler
      process-batch.ts             Step Functions batch worker
      orchestration-tasks.ts       Step Functions helper tasks (parse, aggregate, error)
      step-functions/
        schema-ingestion.asl.json  State machine definition
```

**Module boundary rules:**
- `src/lib/schema/` has zero imports from `src/lambda/` — it is a pure library.
- Lambda handlers import from `src/lib/schema/` only.
- `src/lib/schema/` has no imports from `src/engine/` or `ui/`.
- AWS SDK clients are instantiated at module level for Lambda cold start efficiency.

---

## 3) Data Flow

### Inline Path (< 500 fields)

```
POST /schemas (API Gateway)
  │
  ▼
ingestSchema Lambda
  ├─ Generate schemaId (UUID v4)
  ├─ Create SchemaMetadata (status: "ingesting")
  ├─ Store original → S3
  ├─ Parse content → SchemaNode[]
  ├─ Count fields → confirm < 500
  ├─ Generate retrieval fields per node
  │    ├─ embeddingText
  │    ├─ lexical signals (fieldNameNormalized, pathTokens)
  │    └─ optional per-node embedding vector
  ├─ BatchWrite SchemaNodes → DynamoDB (25-item chunks)
  ├─ Store processed content → S3
  ├─ Update SchemaMetadata (status: "ready", fieldCount)
  └─ Return SchemaMetadata (201)
```

### Step Functions Path (>= 500 fields)

```
POST /schemas (API Gateway)
  │
  ▼
ingestSchema Lambda
  ├─ Generate schemaId
  ├─ Create SchemaMetadata (status: "ingesting")
  ├─ Store original → S3
  ├─ Start Step Functions execution
  └─ Return { schemaId, status: "ingesting", executionArn } (202)

Step Functions State Machine:
  │
  ├─ ParseSchema (Lambda)
  │   ├─ Read original from S3
  │   ├─ Parse → SchemaNode[]
  │   ├─ Generate retrieval fields per node
  │   ├─ Chunk into batches of 500
  │   └─ Write batch manifests to S3
  │
  ├─ ProcessBatches (Map, max concurrency 10)
  │   └─ process-batch Lambda (per batch)
  │       ├─ Read batch from S3
  │       └─ BatchWrite → DynamoDB
  │
  ├─ AggregateResults (Lambda)
  │   ├─ Sum written counts
  │   └─ Store processed content → S3
  │
  └─ UpdateMetadata (Lambda)
      └─ Set status: "ready", fieldCount

  [On error at any state] → HandleError → Set status: "error"
```

---

## 4) Data Model

### DynamoDB — SchemaMetadata

- **Table:** `KeyRa-SchemaMetadata`
- **PK:** `schemaId`
- **Status lifecycle:** `ingesting` → `ready` | `error`
- Stores: name, format, fieldCount, origin, status, source info, timestamps

### DynamoDB — SchemaNodes

- **Table:** `KeyRa-SchemaNodes`
- **PK:** `schemaId`, **SK:** `path` (dot-notation)
- **GSI `fieldName-index`:** PK=`fieldName`, SK=`schemaId#path`
- **GSI `parentPath-index`:** PK=`schemaId`, SK=`parentPath`
- Stores structural fields + retrieval fields:
  - `embeddingText`
  - optional `embedding` (per-node vector retained in Dynamo for this phase)
  - lexical signals such as `fieldNameNormalized` and `pathTokens`

### S3

- `schemas/{schemaId}/original.{json|xsd}` — original upload
- `schemas/{schemaId}/content.json` — processed JSON representation
- `schemas/{schemaId}/batches/batch-{N}.json` — temporary batch files (Step Functions path)

---

## 5) Key Design Decisions

### Threshold: 500 fields

The product spec defines < 500 as inline-safe within API Gateway's 29-second timeout. This accounts for parse + retrieval-field generation + DynamoDB writes + S3 storage in one request lifecycle.

### Batch sizing

| Operation | Batch Size | Rationale |
|-----------|-----------|-----------|
| DynamoDB BatchWriteItem | 25 items | AWS hard limit per API call |
| Step Functions batch | 500 nodes | Keeps worker execution bounded while reducing per-batch overhead |

### Retrieval-preparation invariants

- Every ingested node must have deterministic retrieval text (`embeddingText`).
- Lexical candidate generation fields are computed at ingestion time.
- Per-node Dynamo embeddings are retained for this phase to support bounded rerank.
- Tuning scope decision (FS-091 Rev 2): global defaults with environment-level overrides only (no per-project/per-schema tuning presets).
- Guardrail decision (FS-091 Rev 2): if item-size/read-cost pressure becomes material, move embeddings to chunked S3 storage while keeping lexical metadata in DynamoDB.

### Decommission posture

- OpenSearch indexing failures are no longer part of ingestion behavior because OpenSearch indexing is removed.
- Ingestion completion depends on parse/storage/Dynamo persistence only.

---

## 6) Query Architecture

The `querySchemaNodes` endpoint provides DynamoDB-backed schema node search:

1. Lexical candidate retrieval from Dynamo-backed fields
2. Deterministic candidate capping (`lexicalCap`)
3. Optional bounded in-Lambda embedding rerank (`rerankCap`)
4. Optional filters on `type`, `isArray`, `depth`
5. Optional structural enrichment with parent chain/context

### Query contract

- **Route:** `POST /schemas/:id/query`
- **Request body:**
  - `query: string` (required)
  - `filters?: { type?: string[]; isArray?: boolean; depth?: number }`
  - `includeParentChain?: boolean` (default `false`)
  - `includeContextExpansion?: boolean` (default `false`)
  - `limit?: number` (default `50`, max `50`)
- **Response shape:** `SchemaSearchResult[]` including
  - `path`, `fieldName`, `type`, `depth`, `isArray`, `score`, `embeddingText`
  - optional `parentChain` when requested

### Query error semantics

- `400` for invalid request body or missing `query`
- `404` when schema metadata does not exist for `schemaId`
- `500` for unexpected runtime failures in query path

---

## 7) Error Handling

| Failure Mode | Behavior |
|-------------|----------|
| Invalid schema content | Set metadata `status: "error"`, return error details, no nodes written |
| DynamoDB write throttling | Exponential backoff retry (max 5 attempts, base 100ms) |
| DynamoDB write failure (after retries) | Set metadata `status: "error"` |
| Step Functions task failure | Catch → HandleError state → set metadata `status: "error"` |
| Step Functions timeout | Catch → HandleError state → set metadata `status: "error"` |

---

## 8) Performance Targets

| Scenario | Target |
|----------|--------|
| 50-field inline ingestion | < 5 seconds |
| 499-field inline ingestion | < 25 seconds |
| 23,000-field Step Functions ingestion | < 5 minutes |
| Query response (500-field schema) | < 500ms |
| Parse only (23,000 fields, no I/O) | < 10 seconds |

FS-091 cutover retrieval-latency gates (p95):
- small `< 300ms`
- medium `< 800ms`
- large `< 1500ms`

FS-091 cutover parity gates:
- Top-K Jaccard overlap @10 average `>= 0.70`
- NDCG@10 delta average `>= -0.10`

---

## 9) Future Extension Points

- Refine lexical signals/tokenization strategy for recall at scale
- Hybrid embedding storage fallback (S3 chunk storage for vectors) under defined pressure triggers
- Re-ingestion diff-aware partial updates for very large schemas
- Webhook-triggered CDM ingestion automation
- Schema inference improvements for sample JSON/XML

---

## 10) Verification Coverage

Automated coverage for this subsystem is split across:

- `tests/lib/schema/` — parser, storage, DynamoDB, retriever, parity/gate helpers
- `tests/lambda/schema/` — ingest/query/worker/orchestration handlers
- `tests/integration/schema-ingestion/` — end-to-end orchestration behavior and performance guardrails

Integration coverage includes threshold behavior (50/499 inline, 500+ orchestrated), large-schema batching/chunking behavior, query filtering/enrichment, and FS-091 cutover-readiness gate assertions.

---

## 11) FS-105 lifecycle/indexing boundary addendum

FS-105 introduces lifecycle/readiness constraints that affect schema-ingestion responsibilities.

### 11.1 Ingestion ownership boundary

Schema-ingestion owns parse/index preparation and retrieval-facing node materialization. It does not own schema-family draft/version lifecycle transitions.

### 11.2 Immutable version indexing contract

When a new immutable schema version is created:

- immutable content commit and structural validation determine version usability,
- indexing is an asynchronous derived operation.

Therefore:

- ingestion/index failures after version commit must update index/readiness status surfaces,
- those failures must not invalidate already committed immutable version usability.

### 11.3 CDM re-sync contract compatibility

CDM re-sync remains read-only ingestion from GitHub and must materialize changes as immutable new versions rather than mutable edits of existing versions.

### 11.4 Deprecated user-schema Git behavior boundary

FS-105 retires non-CDM user-schema publish/sync behavior. This does not alter CDM ingestion flows documented in this subsystem.

