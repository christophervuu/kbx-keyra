# Schema Ingestion Pipeline

This document describes the architecture of the schema ingestion and indexing pipeline — the backend subsystem responsible for converting uploaded schemas into a queryable, indexed tree representation.

---

## 1) Overview

The schema ingestion pipeline is triggered when a user uploads a schema file (JSON Schema or XSD). It transforms raw schema content into:

1. **SchemaMetadata** — a DynamoDB record tracking schema identity and lifecycle state
2. **SchemaNodes** — a DynamoDB tree of individual field records with full structural metadata
3. **S3 content** — original file preservation and processed JSON content
4. **OpenSearch documents** — indexed nodes supporting keyword search and (future) vector similarity

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
        node-reader.ts           GSI queries (parent chain, children)
      s3/
        index.ts                 S3 barrel
        schema-storage.ts        Original + processed content storage
      opensearch/
        index.ts                 OpenSearch barrel
        mapping.ts               Index mapping definition
        indexer.ts               Bulk document indexing
        query.ts                 Search query construction
  lambda/
    schema/
      ingest-schema.ts           POST /schemas handler (inline + SFN dispatch)
      query-schema-nodes.ts      POST /schemas/:id/query handler
      process-batch.ts           Step Functions batch worker
      orchestration-tasks.ts     Step Functions helper tasks (parse, aggregate, error)
      step-functions/
        schema-ingestion.asl.json  State machine definition
```

**Module boundary rules:**
- `src/lib/schema/` has zero imports from `src/lambda/` — it is a pure library
- Lambda handlers import from `src/lib/schema/` only
- `src/lib/schema/` has no imports from `src/engine/` or `ui/`
- AWS SDK clients are instantiated at module level for Lambda cold start efficiency

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
  ├─ Generate embeddingText per node
  ├─ BatchWrite SchemaNodes → DynamoDB (25-item chunks)
  ├─ Bulk index → OpenSearch (500-doc batches)
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
  │   ├─ Chunk into batches of 500
  │   └─ Write batch manifests to S3
  │
  ├─ ProcessBatches (Map, max concurrency 10)
  │   └─ process-batch Lambda (per batch)
  │       ├─ Read batch from S3
  │       ├─ BatchWrite → DynamoDB
  │       └─ Bulk index → OpenSearch
  │
  ├─ AggregateResults (Lambda)
  │   ├─ Sum written/indexed counts
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
- Stores: field metadata, structural info, embeddingText

### S3

- `schemas/{schemaId}/original.{json|xsd}` — original upload
- `schemas/{schemaId}/content.json` — processed JSON representation
- `schemas/{schemaId}/batches/batch-{N}.json` — temporary batch files (Step Functions path)

### OpenSearch Serverless

- **Collection:** `keyra-schema-nodes`
- **Document ID:** `{schemaId}#{path}`
- **Fields:** schemaId (keyword), path (text+keyword), fieldName (text+keyword), embeddingText (text), embedding (knn_vector 1536), type (keyword), depth (integer), parentPath (keyword), isArray (boolean)

---

## 5) Key Design Decisions

### Threshold: 500 fields

The product spec defines < 500 as inline-safe within API Gateway's 29-second timeout. This accounts for:
- Parse time (~1s for 500 fields)
- DynamoDB writes (20 batch calls × ~200ms = ~4s)
- OpenSearch indexing (1 bulk call × ~1s)
- S3 storage (~500ms)
- Total: ~7s inline, well within 29s

### Batch Sizing

| Operation | Batch Size | Rationale |
|-----------|-----------|-----------|
| DynamoDB BatchWriteItem | 25 items | AWS hard limit per API call |
| OpenSearch bulk | 500 documents | Balance between HTTP overhead and payload size |
| Step Functions batch | 500 nodes | Match OpenSearch bulk size; keeps worker Lambda execution under 2 minutes |

### Embedding Text (Keyword-Only for Now)

The `embeddingText` field is generated during ingestion to support BM25 full-text search immediately. The `embedding` vector field is defined in the OpenSearch mapping but left empty until the AI/RAG spec introduces vector generation. This avoids re-indexing when embeddings are added.

### Non-Blocking OpenSearch Failures

OpenSearch indexing failure does not prevent SchemaMetadata from reaching `ready` status. DynamoDB is the source of truth. OpenSearch is a derived index that can be rebuilt from DynamoDB at any time. This prevents transient OpenSearch issues from blocking user workflows.

### Idempotent Operations

- DynamoDB PutItem with same PK/SK is a natural upsert
- OpenSearch index with explicit `_id` is a natural upsert
- Worker Lambda can be safely retried by Step Functions without creating duplicates

---

## 6) Query Architecture

The `querySchemaNodes` endpoint provides keyword-based schema node search:

1. **OpenSearch multi-match** on `fieldName` (boost 3×), `path` (boost 2×), `embeddingText` (boost 1×)
2. **Scoped** to single schema via `schemaId` term filter
3. **Optional filters** on `type`, `isArray`, `depth`
4. **Enriched** with parent chain from DynamoDB `parentPath-index` GSI

### Future: Hybrid Search

When vector embeddings are populated:
1. Add k-NN clause to query (script_score or knn query)
2. Use reciprocal rank fusion to merge BM25 and k-NN scores
3. Same endpoint, same response shape — only internal scoring changes

---

## 7) Error Handling

| Failure Mode | Behavior |
|-------------|----------|
| Invalid schema content | Set metadata `status: "error"`, return error details, no nodes written |
| DynamoDB write throttling | Exponential backoff retry (max 5 attempts, base 100ms) |
| DynamoDB write failure (after retries) | Set metadata `status: "error"` |
| OpenSearch bulk partial failure | Log errors, report counts, proceed (non-blocking) |
| OpenSearch complete failure | Log error, set warning flag, metadata still transitions to `ready` |
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

---

## 9) Future Extension Points

- **Vector embeddings:** Call GitHub Models `text-embedding-3-small` during ingestion, populate `embedding` field
- **Hybrid search:** Add k-NN + reciprocal rank fusion to query endpoint
- **Re-ingestion:** Detect schema changes, re-parse, diff nodes, update incrementally
- **Schema deletion:** Clean up DynamoDB nodes + OpenSearch docs + S3 content
- **Webhook-triggered ingestion:** GitHub webhook → re-ingest CDM schemas automatically
- **Schema inference:** Accept sample JSON/XML, infer schema structure, then run normal pipeline
