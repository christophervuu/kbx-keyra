# SPEC

## Title

Schema Ingestion and Indexing Pipeline

---

## ID

FS-056

---

## Metadata

Owner: @christophervuu  
Reviewers: TBD  
Created: 2026-05-14  
Last Updated: 2026-05-14  
Type: backend

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Build the Phase 1 schema ingestion pipeline that accepts uploaded schema content (JSON Schema, XSD), parses it into a tree of SchemaNode records, persists SchemaMetadata and SchemaNodes to DynamoDB, stores original and processed schema content in S3, indexes schema nodes into OpenSearch Serverless for keyword and structural retrieval, and exposes a query endpoint for fast schema node search. The pipeline supports all schema sizes through a unified conceptual flow: inline processing for schemas under 500 fields, and Step Functions orchestration for very large schemas (up to 23,000+ fields). This is the highest-risk technical slice in Phase 1 and directly unlocks the TTFSM metric by making large schemas navigable and queryable.

---

## Problem

Today, schema handling is entirely client-side. The Phase 0 `LocalStorageAdapter` stores raw schema files and parses them in-browser on every access. There is no persistent tree representation, no indexing, no search capability, and no ability to handle schemas that exceed browser memory or processing time limits. Large schemas (1,000–23,000+ fields) are the primary user pain point: they are slow to parse in the browser, impossible to search efficiently, and block AI/RAG features that depend on indexed schema nodes.

Without a backend ingestion pipeline, Phase 1 cannot deliver persistent schema storage, and Phase 2 AI features (auto-map, RAG retrieval) have no foundation to build on.

---

## Goal

After this spec is implemented:
1. Uploading a schema triggers a backend ingestion pipeline that produces a complete, queryable tree representation.
2. SchemaMetadata records track schema lifecycle state (`ingesting` → `ready` | `error`).
3. SchemaNode records in DynamoDB represent every field in the schema with full structural metadata.
4. Original and processed schema content is stored in S3.
5. OpenSearch Serverless contains indexed documents for every schema node, supporting keyword and structural queries.
6. A query endpoint returns schema node search results with sub-second latency for typical queries.
7. Schemas with 500 fields complete ingestion inline within a single Lambda invocation.
8. Schemas with 23,000+ fields complete ingestion via Step Functions orchestration within acceptable time bounds.

---

## Assumptions

- DynamoDB tables will be provisioned with on-demand capacity mode.
- OpenSearch Serverless collection `keyra-schema-nodes` will be created as part of infrastructure setup (IaC out of scope for this spec; manual or script-based provisioning acceptable for initial delivery).
- The `POST /schemas` API Gateway route and Lambda integration exist or will be created as part of this work.
- The schema content received by the ingestion Lambda is the raw file content (JSON string for JSON Schema; XML string for XSD).
- The UI's `HttpAdapter` (FS-055) will call the `POST /schemas` endpoint; this spec does not modify the frontend.
- Embedding generation (vector fields for k-NN search) is **deferred** to a subsequent AI/RAG spec. OpenSearch documents are indexed with keyword-searchable fields only in this iteration; the `embedding` vector field is defined in the index mapping but left empty.
- Authentication/authorization is not in scope (per NG1 in the product spec).

---

## Current Context

### Existing Backend Structure

Per `forge/architecture/project-structure.md`, backend source lives in:
- `src/lambda/` — Lambda handlers (currently only `ai/` subdirectory)
- `src/lib/` — Shared utilities across lambdas (currently only `ai/` subdirectory)

This spec introduces:
- `src/lambda/schema/` — Schema ingestion and query Lambda handlers
- `src/lib/schema/` — Shared schema processing modules (parser, DynamoDB writer, S3 storage, OpenSearch indexer)

### Data Model (from Product Spec Section 15)

**DynamoDB — SchemaNodes table:**
| Key | Type | Description |
|-----|------|-------------|
| `schemaId` (PK) | String | Unique schema identifier |
| `path` (SK) | String | Full dot-notation path |
| `fieldName` | String | Leaf name |
| `type` | String | Data type |
| `description` | String | From schema or AI-generated |
| `depth` | Number | Nesting level |
| `isArray` | Boolean | Whether this node is an array |
| `isRequired` | Boolean | Whether parent marks this required |
| `parentPath` | String | Path of the parent node |
| `childCount` | Number | Number of direct children |
| `subtreeFieldCount` | Number | Total leaf fields in subtree |
| `embeddingText` | String | Natural-language description for embedding |

GSIs: `fieldName-index` (PK=fieldName, SK=schemaId#path), `parentPath-index` (PK=schemaId, SK=parentPath)

**DynamoDB — SchemaMetadata table:**
| Key | Type | Description |
|-----|------|-------------|
| `schemaId` (PK) | String | |
| `name` | String | Display name |
| `format` | String | `json-schema` or `xsd` |
| `fieldCount` | Number | Total leaf fields |
| `origin` | String | `cdm`, `published`, or `local` |
| `status` | String | `ingesting`, `ready`, `error` |
| `source` | Map | GitHub source info or `{ type: "upload" }` |
| `createdAt` | String | ISO 8601 |
| `updatedAt` | String | ISO 8601 |

**S3:**
- `schemas/{schemaId}/content.json` — Processed schema content
- `schemas/{schemaId}/original.*` — Original uploaded file

**OpenSearch Serverless — `keyra-schema-nodes` collection:**
| Field | Type | Purpose |
|-------|------|---------|
| `schemaId` | Keyword | Filter by schema |
| `path` | Text + Keyword | Keyword search on full path |
| `fieldName` | Text + Keyword | Keyword search on field name |
| `embeddingText` | Text | BM25 full-text search |
| `embedding` | knn_vector (1536) | Vector similarity search (populated later) |
| `type` | Keyword | Filter by data type |
| `depth` | Integer | Filter by nesting level |
| `parentPath` | Keyword | Structural queries |
| `isArray` | Boolean | Filter arrays |

### Ingestion Threshold

Per the product spec: schemas with < 500 fields process inline (single Lambda invocation). Schemas with >= 500 fields trigger Step Functions orchestration. The Step Functions path processes nodes in batches (no single Lambda call processes > 500 nodes). The threshold is configurable via `SCHEMA_INLINE_FIELD_THRESHOLD` environment variable (default: `500`).

### Related In-Progress Specs

- **FS-054** (Architecture Reconciliation) — documentation-only, no code conflict
- **FS-055** (HttpAdapter) — will consume this spec's endpoints; no blocking dependency in either direction

---

## Scope

### In Scope

1. **Schema parsing** — JSON Schema → SchemaNode tree; XSD → SchemaNode tree
2. **SchemaMetadata persistence** — create/update metadata record in DynamoDB with status lifecycle
3. **SchemaNodes persistence** — batch-write node records to DynamoDB (respecting 25-item BatchWriteItem limit)
4. **S3 content storage** — store original file and processed content
5. **OpenSearch indexing** — create index mapping; index node documents for keyword/structural search
6. **Inline ingestion path** — `ingestSchema` Lambda processes small schemas (< 500 fields) synchronously
7. **Step Functions orchestration** — state machine definition for large schema ingestion
8. **Step Functions worker** — batch processor Lambda for large schema node processing
9. **Query endpoint** — `querySchemaNodes` Lambda with keyword + structural search via OpenSearch
10. **Embedding text generation** — produce the `embeddingText` field for each node (path + field names + types + descriptions), ready for future vector embedding

### Out of Scope

1. **Schema inference from sample JSON/XML** — deferred to a subsequent spec; only formal schema formats (JSON Schema, XSD) are parsed
2. **Vector embedding generation** — the `embedding` knn_vector field is defined but not populated; embedding generation requires GitHub Models integration (Phase 2 AI)
3. **Frontend changes** — no UI modifications; FS-055 handles HttpAdapter wiring
4. **IaC/CDK provisioning** — DynamoDB tables, S3 bucket, OpenSearch collection, and Step Functions state machine are created manually or via scripts; formal IaC is a separate concern
5. **Schema update/re-ingestion** — re-processing an existing schema (e.g., after CDM re-sync) is a separate spec
6. **Delete schema cleanup** — `deleteSchema` Lambda is a separate spec
7. **Authentication/authorization** — per product spec NG1
8. **Hybrid search (vector + keyword fusion)** — keyword-only search in this iteration; hybrid search ships with embedding generation

---

## Non-Goals

- This spec does not implement the full RAG pipeline. It builds the indexing foundation that RAG depends on.
- This spec does not optimize for minimal OpenSearch cost. The index is created with the full field mapping to avoid re-indexing when embeddings are added.
- This spec does not define how the UI polls for ingestion status of large schemas. The API returns an execution ARN; status polling UX is a separate concern.

---

## Relevant Areas

- `src/lambda/schema/` (new)
- `src/lib/schema/` (new)
- `src/lib/schema/parser/` (new)
- `src/lib/schema/dynamo/` (new)
- `src/lib/schema/s3/` (new)
- `src/lib/schema/opensearch/` (new)
- `tests/lambda/schema/` (new)
- `tests/lib/schema/` (new)
- Step Functions state machine definition (JSON/YAML, placement TBD)
- `forge/architecture/schema-ingestion.md` (new)
- `forge/architecture/project-structure.md` (update)
- `forge/architecture/INDEX.md` (update)

---

## Dependencies / Blockers

- **AWS infrastructure** must be available (DynamoDB tables, S3 bucket, OpenSearch collection, Step Functions state machine). These can be created manually for initial development.
- **No blocking dependency on FS-055** — the HttpAdapter and this pipeline can be developed in parallel; the HttpAdapter will call the endpoint this spec creates.
- Depends on AWS SDK v3 being available as a project dependency (currently used by AI lambdas).

---

## Constraints

- Must handle schemas up to 23,000+ fields without timeout or memory exhaustion.
- Single Lambda execution time is bounded by API Gateway's 29-second timeout for the inline path.
- Inline/Step Functions threshold is configurable via `SCHEMA_INLINE_FIELD_THRESHOLD` environment variable (default: `500`). Schemas with fewer fields than the threshold process inline; at or above the threshold triggers Step Functions.
- DynamoDB BatchWriteItem limit is 25 items per call; writes must be batched accordingly.
- OpenSearch bulk indexing should batch documents (recommended 500–1000 per bulk request).
- Node `path` values must use dot-notation (e.g., `Order.Header.DocumentType`) matching the product spec's SchemaNodes table definition.
- The `ingestSchema` Lambda must return immediately for large schemas with a Step Functions execution ARN (not block until completion).
- Schema formats must be detected reliably from content (JSON object with `$schema` or `properties`/`type` = JSON Schema; XML with `<xs:schema>` or `<xsd:schema>` = XSD).
- All Lambda handlers follow the existing pattern in `src/lambda/ai/` (typed event, handler function, structured response).
- Parse Lambda on Step Functions path: 1024MB minimum memory allocation; prefer operational tuning before implementing stream parsing.
- XSD `xs:choice` alternatives are represented as sibling nodes, all `isRequired: false` — a lossy structural approximation of choice semantics.
- OpenSearch indexing failure is non-blocking for schema readiness; DynamoDB is the source of truth.
- TypeScript strict mode; zero runtime dependencies on UI code.

---

## Proposed Behavior

### User Flow

1. User uploads a schema file via the UI (triggers `POST /schemas` with schema content + metadata).
2. The `ingestSchema` Lambda:
   - Detects format (JSON Schema or XSD).
   - Creates SchemaMetadata record with `status: "ingesting"`.
   - Stores original file in S3.
   - Counts fields to determine path (inline vs. Step Functions).
3. **Inline path (< 500 fields):**
   - Parses schema into SchemaNode tree.
   - Generates `embeddingText` for each node.
   - Batch-writes SchemaNodes to DynamoDB.
   - Bulk-indexes documents into OpenSearch.
   - Stores processed content in S3.
   - Updates SchemaMetadata to `status: "ready"`.
   - Returns complete SchemaMetadata to caller.
4. **Step Functions path (>= 500 fields):**
   - Starts Step Functions execution with `{ schemaId, s3Key }`.
   - Returns `{ schemaId, status: "ingesting", executionArn }` to caller immediately.
   - Step Functions state machine:
     a. Parse schema into SchemaNode tree (in a Lambda with extended timeout).
     b. Chunk nodes into batches of ≤ 500.
     c. Fan out: parallel batch-processing Lambdas write DynamoDB + index OpenSearch per batch.
     d. Fan in: aggregate results.
     e. Update SchemaMetadata to `status: "ready"` (or `"error"` on failure).
5. User queries schema nodes via `POST /schemas/:id/query`.
   - Returns matching nodes with relevance ranking.

### System Behavior

**Schema Parsing:**
- JSON Schema: traverse `properties`, `items`, `$defs`/`definitions` (local refs only), `allOf`/`anyOf`/`oneOf` (shallow merge). Each property becomes a SchemaNode. Objects contribute depth. Arrays set `isArray: true` on the node and recurse into `items`.
- XSD: traverse `xs:element`, `xs:complexType`, `xs:sequence`, `xs:choice`. Map XSD types to simplified type strings (`xs:string` → `string`, `xs:integer` → `number`, etc.). Array indicators: `maxOccurs="unbounded"` or `maxOccurs` > 1.

**Embedding Text Generation:**
- Format: `"{path} | {fieldName} ({type}) | {description}"`
- Example: `"Order.Header.DocumentType | DocumentType (string) | The type of business document"`
- If no description: `"{path} | {fieldName} ({type})"`

**DynamoDB Write Strategy:**
- Use `BatchWriteItem` with 25-item chunks.
- Implement exponential backoff retry for `UnprocessedItems`.
- Write SchemaMetadata first (so status is visible), then SchemaNodes.

**OpenSearch Indexing Strategy:**
- Use bulk API with batches of 500 documents.
- Documents indexed with `_id` = `{schemaId}#{path}` for idempotent upserts.
- Refresh policy: `wait_for` on final batch to ensure immediate queryability.

**Query Endpoint:**
- Accepts: `{ query: string, filters?: { type?: string[], isArray?: boolean, depth?: number }, includeParentChain?: boolean }`
- Executes OpenSearch multi-match query on `fieldName`, `path`, `embeddingText` with BM25 scoring.
- When `includeParentChain: true`: enriches top results with structural context from DynamoDB (parent chain via `parentPath-index` GSI). Default: `false` (no enrichment).
- Returns: `SchemaSearchResult[]` with `{ path, fieldName, type, score, parentChain? }`

### Failure / Edge Behavior

- **Parse failure:** SchemaMetadata set to `status: "error"` with error details. No SchemaNodes written. Original file retained in S3 for debugging.
- **Partial write failure (DynamoDB):** Retry with exponential backoff. After max retries, set metadata to `status: "error"`.
- **OpenSearch indexing failure:** Non-fatal for ingestion completion. SchemaMetadata still moves to `status: "ready"` if DynamoDB writes succeed. A `searchIndexStatus` field (or similar) can indicate indexing lag. Log errors for operational visibility.
- **Step Functions execution failure:** Catch state transitions to error handler that sets SchemaMetadata `status: "error"`.
- **Empty schema (0 fields):** Valid edge case. SchemaMetadata created with `fieldCount: 0`, `status: "ready"`. No SchemaNodes written.
- **Duplicate upload (same schemaId):** Not in scope for this spec — assumed new `schemaId` per upload.
- **Content too large for Lambda memory:** Step Functions path handles this; the initial parse Lambda has 1024MB+ memory allocation.
- **XSD with external references (imports/includes):** Not resolved. Parse what is present in the uploaded file only. External references are logged as warnings and skipped.

---

## Acceptance Examples

### AE-01 — Small JSON Schema inline ingestion (50 fields)

**Given**
- A JSON Schema with 50 leaf fields is uploaded via `POST /schemas`
- Request body includes `{ name: "Small Order", content: "<json-schema-string>", format: "json-schema", origin: "local" }`

**When**
- The `ingestSchema` Lambda processes the request

**Then**
- SchemaMetadata record exists in DynamoDB with `status: "ready"`, `fieldCount: 50`
- 50 SchemaNode records exist in DynamoDB with correct paths, types, depths, and parentPaths
- Original schema stored at `schemas/{schemaId}/original.json` in S3
- Processed content stored at `schemas/{schemaId}/content.json` in S3
- 50 documents indexed in OpenSearch with matching `schemaId` and `path` values
- Response includes complete SchemaMetadata with `status: "ready"`
- Total processing time < 5 seconds

### AE-02 — Medium JSON Schema inline ingestion (499 fields)

**Given**
- A JSON Schema with 499 leaf fields (just under the threshold)

**When**
- The `ingestSchema` Lambda processes the request

**Then**
- Processes inline (no Step Functions execution started)
- All 499 SchemaNode records in DynamoDB
- All 499 documents in OpenSearch
- SchemaMetadata `status: "ready"`
- Total processing time < 25 seconds

### AE-03 — Large JSON Schema triggers Step Functions (500 fields)

**Given**
- A JSON Schema with exactly 500 fields

**When**
- The `ingestSchema` Lambda processes the request

**Then**
- SchemaMetadata created with `status: "ingesting"`
- Step Functions execution started
- Response returns immediately with `{ schemaId, status: "ingesting", executionArn }`
- Response time < 3 seconds (does not wait for completion)

### AE-04 — Very large schema completes via Step Functions (23,000 fields)

**Given**
- A JSON Schema with 23,000 leaf fields is uploaded
- Step Functions execution is triggered

**When**
- The state machine completes all batch processing

**Then**
- 23,000 SchemaNode records exist in DynamoDB
- 23,000 documents indexed in OpenSearch
- SchemaMetadata updated to `status: "ready"`, `fieldCount: 23000`
- Total Step Functions execution time < 5 minutes

### AE-05 — XSD schema parsing

**Given**
- An XSD file with 100 elements is uploaded with `format: "xsd"`

**When**
- The `ingestSchema` Lambda processes the request

**Then**
- SchemaNodes are created with correct paths derived from XSD element hierarchy
- Types are mapped from XSD types to simplified strings (`xs:string` → `string`, `xs:integer` → `number`, `xs:boolean` → `boolean`, `xs:decimal` → `number`, `xs:date` → `string`)
- Array-type nodes have `isArray: true` where `maxOccurs` > 1
- SchemaMetadata `format: "xsd"`, `status: "ready"`

### AE-06 — Schema node query by field name

**Given**
- A schema with 500 fields has been ingested and indexed
- Fields include `PostalCode`, `ZipCode`, `Address.PostalCode`, `Billing.Address.PostalCode`

**When**
- `POST /schemas/:id/query` with `{ query: "postal code" }`

**Then**
- Results include all nodes containing "postal" or "code" in fieldName or path
- Results are ranked by relevance (BM25 score)
- Response time < 500ms
- Each result includes `path`, `fieldName`, `type`, `score`
- `parentChain` is not included (opt-in not requested)

### AE-07 — Schema node query with structural enrichment (opt-in)

**Given**
- A schema has been ingested with the node `Order.Parties.Buyer.Address.PostalCode`
- Parent chain: `Order` → `Order.Parties` → `Order.Parties.Buyer` → `Order.Parties.Buyer.Address`

**When**
- `POST /schemas/:id/query` with `{ query: "PostalCode", includeParentChain: true }`

**Then**
- Result includes `parentChain: ["Order", "Order.Parties", "Order.Parties.Buyer", "Order.Parties.Buyer.Address"]`
- Parent chain retrieved from DynamoDB `parentPath-index` GSI

### AE-08 — Query with type filter

**Given**
- A schema with mixed field types (string, number, boolean, array)

**When**
- `POST /schemas/:id/query` with `{ query: "amount", filters: { type: ["number"] } }`

**Then**
- Only nodes with `type: "number"` are returned
- String fields named "amount" are excluded

### AE-09 — Parse failure sets error status

**Given**
- An invalid/malformed file is uploaded as `format: "json-schema"`

**When**
- The `ingestSchema` Lambda attempts to parse

**Then**
- SchemaMetadata `status: "error"`
- No SchemaNode records written
- Original file still stored in S3
- Response includes error details

### AE-10 — Empty schema (0 fields)

**Given**
- A JSON Schema with `{ "type": "object", "properties": {} }` is uploaded

**When**
- The `ingestSchema` Lambda processes the request

**Then**
- SchemaMetadata created with `fieldCount: 0`, `status: "ready"`
- No SchemaNode records written (correct — no fields)
- Document count in OpenSearch for this schemaId: 0

### AE-11 — Embedding text generation format

**Given**
- A node at path `Order.Header.DocumentType` with type `string` and description `"The type of business document"`

**When**
- Embedding text is generated during ingestion

**Then**
- `embeddingText` = `"Order.Header.DocumentType | DocumentType (string) | The type of business document"`

### AE-12 — Embedding text without description

**Given**
- A node at path `Invoice.LineItems.Quantity` with type `number` and no description

**When**
- Embedding text is generated during ingestion

**Then**
- `embeddingText` = `"Invoice.LineItems.Quantity | Quantity (number)"`

---

## Open Questions

- none (all resolved at Rev 2)

---

## Verification Strategy

### Automated Tests

- **Unit tests** for schema parser (JSON Schema → SchemaNode[], XSD → SchemaNode[]):
  - Covers AE-01, AE-05, AE-09, AE-10, AE-11, AE-12
  - Edge cases: nested objects, arrays, `$ref` resolution, `allOf` merge, empty properties
- **Unit tests** for DynamoDB write module:
  - BatchWriteItem chunking, retry logic, metadata lifecycle
- **Unit tests** for OpenSearch indexing module:
  - Bulk document formatting, batch sizing, idempotent upserts
- **Unit tests** for query endpoint:
  - Query construction, filter application, result enrichment
- **Integration tests** (against local DynamoDB + OpenSearch):
  - AE-01: 50-field schema end-to-end inline path
  - AE-02: 499-field schema stays inline
  - AE-03/AE-04: >= 500 fields triggers Step Functions path
  - AE-06/AE-07/AE-08: query behavior with real indexed data
- **Performance tests:**
  - 500-field inline path completes < 25 seconds
  - 23,000-field Step Functions path completes < 5 minutes
  - Query response time < 500ms on 500-field schema

### Manual Verification

- Deploy to AWS and verify DynamoDB table contents after ingestion
- Verify OpenSearch index via Kibana/Dev Tools
- Verify Step Functions execution graph for large schema

---

## Task Generation Notes

Tasks should be decomposed along module boundaries for independent development and testing:

1. **Types and interfaces** — shared TypeScript types for SchemaNode, SchemaMetadata, pipeline inputs/outputs (foundational, no dependencies)
2. **Schema parser** — JSON Schema + XSD parsing logic (pure functions, no AWS dependencies)
3. **S3 storage module** — upload original + processed content
4. **DynamoDB writer module** — SchemaMetadata + SchemaNodes batch write with retry
5. **OpenSearch indexer module** — index creation + bulk document indexing
6. **Inline ingestion Lambda** — orchestrates parser + S3 + DynamoDB + OpenSearch for small schemas
7. **Step Functions definition** — state machine JSON/ASL definition
8. **Step Functions worker Lambda** — batch processor invoked by state machine
9. **Query Lambda** — `querySchemaNodes` endpoint
10. **Integration/performance tests** — 500-field and 23,000-field verification paths
11. **Architecture document** — `schema-ingestion.md` + INDEX.md + project-structure.md updates

All tasks are `Agent: task` (backend work). Tasks 1–5 are parallelizable. Task 6 depends on 1–5. Tasks 7–8 depend on 1–5. Task 9 depends on 5. Task 10 depends on 6, 8, 9. Task 11 can be done in parallel with anything.

---

## Change Log

- Rev 2 — 2026-05-14
  - All open questions resolved:
    - Q1 resolved: Threshold configurable via `SCHEMA_INLINE_FIELD_THRESHOLD` env var (default 500). < threshold → inline; >= threshold → Step Functions.
    - Q2 resolved: `parentChain` enrichment is opt-in via `includeParentChain` query parameter (default `false`).
    - Q3 resolved: Parse Lambda memory starts at 1024MB. Prefer operational tuning (raise to 1536/2048MB) before implementing stream parsing.
    - Q4 resolved: Non-blocking. Schema transitions to `ready` when DynamoDB/S3 succeed regardless of OpenSearch indexing status.
    - Q5 resolved: XSD `xs:choice` alternatives represented as sibling nodes, all `isRequired: false`. Documented as lossy structural approximation of choice semantics.
  - No scope change
- Rev 1 — 2026-05-14
  - Initial draft
