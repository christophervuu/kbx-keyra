
| #          | Spec                                    | Why This Order                                                                                                                                                           |
| ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **FS-002** | **DSL Parser**                          | Everything downstream needs parsed expressions. Tokenizer + AST generation from DSL strings.                                                                             |
| **FS-003** | **Expression Evaluator**                | Takes an AST node + runtime context → produces a value. Implements null propagation, scope stack, and function dispatch via the registry.                                |
| **FS-004** | **Core Function Implementations**       | Register the ~30 DSL functions (source, concat, cast, if, valueMap, formatDate, math, etc.) into the registry. Can be split into sub-specs by category if needed.        |
| **FS-005** | **Array Functions & Scoping**           | `map()`, `filter()`, `find()`, `get()`, `merge()`, `flatten()`, `array()` — the scope stack (`item()`/`parent()`) is the hard part.                                      |
| **FS-006** | **Validate Pipeline**                   | Full `validate()` implementation — schema path checking (E030/E031), type compatibility, array context validation, coverage computation.                                 |
| **FS-007** | **Execute Pipeline**                    | Full `execute()` implementation — rule iteration, bulk behaviors (unmapped targets, null subtrees), trace mode, diagnostic collection.                                   |
| **FS-008** | **UI Scaffold & App Shell**             | React/Vite/Tailwind project, routing, layout shell, `ApiAdapter` interface, `LocalStorageAdapter`, `AsyncState` wrapper, shared types/models. Everything builds on this. |
| **FS-009** | **Schema Tree View Component**          | Reusable tree view (expand/collapse, search, type icons, required indicators). Parses JSON Schema & XSD client-side. Needed by the editor's Panel 1 & 2.                 |
| **FS-010** | **Mapping Editor — Rule List & CRUD**   | Panel 3: display rules, add/edit/delete/reorder, inline validation via engine `validate()`, multi-select + bulk actions. The core authoring surface.                     |
| **FS-011** | **Mapping Editor — Expression Builder** | Panel 4: guided form mode (select source → pick transform → preview) + raw DSL editor with syntax highlighting & autocomplete. Both produce identical DSL strings.       |
| **FS-012** | **Mapping Editor — Preview & Testing**  | Panel 5: source data input (paste/upload/load test case), client-side `execute()`, output display, diff view, diagnostics panel, trace mode, test case save/run.         |
| **FS-013** | **Project Overview & CRUD**             | Section A–D: project metadata, schema upload (with client-side inference), mapping list with status/coverage, project actions. LocalStorage persistence.                 |
| **FS-014** | **Home Dashboard**                      | Overview metrics, project list (search/filter/sort), deploy status badges (read-only), create project CTA, empty/loading/error states.                                   |

Yes — if you’re planning to stand up the AWS infrastructure manually, then you do **not** need FSs for “create API Gateway,” “create DynamoDB table,” etc. You still **do** need to know what must exist in AWS, and you **do** need FSs for the code that KeyRa and the Lambdas must implement.

The clean split is:

- **Manual setup checklist** = cloud resources/config you can create yourself
- **FSs** = application/backend code behavior the coding agent should build

That said, one important correction:

> It’s not only “Lambda functions and KeyRa calling them via API.”

For Phase 1, you also need:
- **storage contracts** between Lambda and DynamoDB/S3
- **schema ingestion code**
- **adapter switching in the UI**
- **error handling/retry behavior**
- **search/query path for schema nodes**
- possibly **Step Functions** for the large-schema ingestion path if you want the 23k-field requirement in Phase 1

So yes, API Gateway + DynamoDB + S3 + OpenSearch can be manually provisioned, but the code still has to be written to use them consistently.

---

# 1. What you can set up manually in AWS

These do **not** need separate FSs if you’re comfortable creating them yourself.

## A. API Gateway
You need routes for:

### Projects
- `POST /projects`
- `GET /projects`
- `GET /projects/{id}`
- `PUT /projects/{id}`
- `DELETE /projects/{id}`

### Mappings
- `POST /mappings`
- `GET /mappings/{id}`
- `PUT /mappings/{id}`
- `DELETE /mappings/{id}`
- `GET /projects/{id}/mappings`

### Schemas
- `POST /schemas`
- `GET /schemas`
- `GET /schemas/{id}`
- `DELETE /schemas/{id}`
- `POST /schemas/{id}/query`

### Optional but likely needed in Phase 1
- `GET /activity`
- `GET /templates`
- `GET /templates/{id}`

You also need:
- CORS for your Vite/Amplify frontend origin
- JSON request/response handling
- integration to the correct Lambda per route
- stage URL that becomes `VITE_API_URL`

---

## B. DynamoDB tables

Minimum practical Phase 1 tables:

### `Projects`
Suggested fields:
- `projectId` (PK)
- `name`
- `description`
- `slug`
- `schemaRefs`
- `tags`
- `createdAt`
- `updatedAt`

### `Mappings`
Suggested fields:
- `mappingId` (PK)
- `projectId`
- `name`
- `version`
- `sourceSchemaId`
- `targetSchemaId`
- `status`
- `ruleCount`
- `coverage`
- `configS3Key`
- `createdAt`
- `updatedAt`

GSI:
- `projectId-index` on `projectId`

### `SchemaMetadata`
Suggested fields:
- `schemaId` (PK)
- `name`
- `format`
- `fieldCount`
- `origin`
- `status`
- `source`
- `createdAt`
- `updatedAt`

### `SchemaNodes`
Suggested keys:
- `schemaId` (PK)
- `path` (SK)

Suggested attributes:
- `fieldName`
- `type`
- `description`
- `depth`
- `isArray`
- `isRequired`
- `parentPath`
- `childCount`
- `subtreeFieldCount`
- `embeddingText`

Optional GSIs if you want the richer query patterns from the spec:
- `fieldName-index`
- `parentPath-index`

### Optional now / useful later
- `Templates`
- `Activity`

---

## C. S3 bucket(s)

You need object storage for:

### Schemas
- `schemas/{schemaId}/content.json`
- `schemas/{schemaId}/original.*`

### Mappings
- `mappings/{mappingId}/v{N}.json`

### Optional
- exports or future snapshots are not required for core Phase 1 unless you want them early

You should also decide:
- single bucket with prefixes vs multiple buckets
- versioning on/off
- lifecycle rules
- max upload size expectations

---

## D. OpenSearch Serverless
Needed if you want the schema query/retrieval path in Phase 1.

You need:
- a collection for schema node search
- index mapping for:
  - `schemaId`
  - `path`
  - `fieldName`
  - `embeddingText`
  - `embedding`
  - `type`
  - `depth`
  - `parentPath`
  - `isArray`

If you defer search, you could temporarily skip OpenSearch — but your Phase 1 exit criteria explicitly say:
- embeddings generated
- OpenSearch indexed
- query returns results

So by your current plan, **OpenSearch is in Phase 1**.

---

## E. Step Functions
Only needed if you want the **23,000-field schema path** in Phase 1 exactly as written.

If you want to fully satisfy:
- “Step Function path”
- parallel batches
- large schema ingestion < 2 seconds queryability after indexing

then yes, create:
- one state machine for large schema ingestion orchestration

If you want to simplify initial backend integration, this is the biggest candidate to push later — but your current phase definition includes it.

---

## F. IAM roles and permissions
You’ll need Lambda execution roles that allow:
- DynamoDB CRUD on the relevant tables
- S3 read/write on relevant prefixes
- OpenSearch write/query
- CloudWatch Logs
- optionally Step Functions start/status calls

---

## G. Lambda environment variables
You’ll want a consistent set, e.g.:

- `PROJECTS_TABLE`
- `MAPPINGS_TABLE`
- `SCHEMA_METADATA_TABLE`
- `SCHEMA_NODES_TABLE`
- `TEMPLATES_TABLE` (optional)
- `ACTIVITY_TABLE` (optional)
- `APP_BUCKET`
- `SCHEMA_SEARCH_ENDPOINT`
- `SCHEMA_SEARCH_INDEX`
- `INGESTION_STATE_MACHINE_ARN` (if using Step Functions)

Frontend:
- `VITE_API_URL`

---

# 2. What does need an FS for the coding agent

These are the things that require actual code and should be tracked as FSs.

---

## FS 1: HttpAdapter + adapter bootstrap

This is definitely needed.

### What it covers
- implement `HttpAdapter` for the `ApiAdapter` interface
- switch at app bootstrap:
  - `VITE_API_URL` set → `HttpAdapter`
  - unset → `LocalStorageAdapter`
- normalize backend errors into UI-safe errors
- add retry handling for retryable 5xx failures
- preserve component transparency so no UI component knows which adapter is active

### Why it matters
This is the backbone of Phase 1 validation:
- same UI
- same Playwright suite
- zero component rewrites

---

## FS 2: Project API integration

### What it covers
Lambda code + request/response contract for:
- create project
- list projects
- get project
- update project
- delete project

### Includes
- slug generation
- DynamoDB persistence
- response DTO shape expected by the UI
- consistent error envelopes

---

## FS 3: Mapping API integration

### What it covers
Lambda code + persistence for:
- create mapping
- get mapping
- update mapping
- delete mapping
- list mappings by project

### Includes
- metadata in DynamoDB
- full config versioned in S3
- version increment on save
- DTOs shaped for the Mapping Editor and Project Overview

This is core Phase 1.

---

## FS 4: Schema API integration

### What it covers
Lambda code for:
- create/upload schema
- list schemas
- get schema detail
- delete schema

### Includes
- storing original schema in S3
- storing normalized/parsed content in S3 as needed
- writing metadata to `SchemaMetadata`
- returning schema content in the format the UI expects

---

## FS 5: Schema ingestion pipeline

This is separate from “schema CRUD” because it’s materially different work.

### What it covers
- parse JSON Schema/XSD/inferred schema into node tree
- write `SchemaNodes` into DynamoDB
- generate `embeddingText`
- generate embeddings
- index into OpenSearch
- update ingestion status in `SchemaMetadata`

### Why separate
This is its own subsystem and likely the riskiest backend code in Phase 1.

---

## FS 6: Large-schema ingestion orchestration

Only needed if you are keeping the 23k-field requirement in Phase 1.

### What it covers
- batch splitting
- Step Function orchestration
- parallel node processing
- final status reconciliation
- failure handling / partial batch retry strategy

If you decide to manually create the Step Function but need code for workers/orchestration payloads, this still needs an FS.

---

## FS 7: Schema node query API

### What it covers
- `POST /schemas/{id}/query`
- OpenSearch hybrid query
- result shaping for the UI / future AI consumers
- enrich results with structural context from DynamoDB if needed

### Why it belongs in Phase 1
Your verification says:
- OpenSearch populated and queryable
- query returns results

So this is not optional if you want to validate ingestion properly.

---

## FS 8: Backend error contract + UI recovery

This is easy to underestimate, but you explicitly called it out in verification.

### What it covers
- standard backend error envelope
- mapping errors to retryable vs non-retryable
- UI error messaging and retry path
- non-crashing recovery behavior in `HttpAdapter` consumers

### Why it should be explicit
Because one of your exit tests is:
- API returns 500 → UI shows error with retry → retry succeeds → UI recovers

That’s a feature, not just an implementation detail.

---

## FS 9: LocalStorage fallback compatibility

You may bundle this with FS 1, but I’d keep it explicit if you want testable scope.

### What it covers
- ensure current `LocalStorageAdapter` still functions unchanged
- preserve offline mode when `VITE_API_URL` is unset
- guarantee no backend assumptions leak into shared UI flows

If you prefer, this can be an acceptance section under FS 1 instead of its own FS.

---

## FS 10: Activity/Templates integration if already used by the UI

Only if your current Phase 0 UX already depends on them enough to block parity.

### Activity
If the Home Dashboard is already expecting `GET /activity`, then you need:
- Lambda
- data shape
- backend-backed feed

### Templates
If the Template Library is already in active use and not stubbed, then you need:
- `GET /templates`
- `GET /templates/{id}`

If these screens are not part of your Phase 1 parity target yet, you can defer them.

---

# 3. What likely does NOT need an FS if you’re doing AWS manually

These are setup concerns, not coding-agent feature work:

- create API Gateway
- create DynamoDB tables
- create S3 bucket
- create OpenSearch collection
- create Step Function shell/state machine resource
- create IAM roles
- wire Lambda integrations in API Gateway
- configure CORS
- set environment variables/secrets

You still need them documented in a setup checklist, but they don’t need to become coding specs unless you want IaC generated.

---

# 4. Recommended Phase 1 FS list, given your manual AWS setup approach

If I strip out manual infra work, here’s the FS set I’d recommend:

1. **HttpAdapter and adapter bootstrap**
2. **Project CRUD backend integration**
3. **Mapping CRUD backend integration**
4. **Schema CRUD backend integration**
5. **Schema ingestion pipeline**
6. **Large-schema ingestion orchestration** *(only if keeping 23k schema support in Phase 1)*
7. **Schema query/search API**
8. **Backend error contract and UI recovery**
9. **Activity feed backend integration** *(optional based on current UI scope)*
10. **Template read API integration** *(optional based on current UI scope)*

If you want the leanest possible Phase 1, the real minimum is:

1. **HttpAdapter and bootstrap**
2. **Project CRUD**
3. **Mapping CRUD**
4. **Schema CRUD**
5. **Schema ingestion**
6. **Schema query/search**
7. **Error handling + retry/recovery**

And then:
- **Large-schema Step Function path** can be either included now or pushed to a Phase 1.5 / Phase 2 prerequisite

---

# 5. Manual AWS setup checklist I’d give you

Here’s the practical checklist version.

## Must exist before backend code works
- API Gateway with all Phase 1 routes
- Lambda functions wired to routes
- DynamoDB tables:
  - Projects
  - Mappings
  - SchemaMetadata
  - SchemaNodes
- GSI on `Mappings.projectId`
- S3 bucket with schema + mapping prefixes
- Lambda IAM roles
- CORS configured
- `VITE_API_URL` configured in frontend env

## Must exist before ingestion/search works
- OpenSearch Serverless collection
- schema node index mapping
- Lambda permissions for OpenSearch
- embedding provider credentials/config if embeddings are generated in Phase 1

## Must exist before 23k schema path works
- Step Functions state machine
- worker Lambdas or batch-capable ingestion Lambda
- state machine ARN in env vars

## Nice to have / optional for parity depending on UI
- Activity table + route
- Templates table + seed data + routes

---

# 6. Direct answer to your question

Short answer:

- **No**, manual AWS setup does **not** need its own FSs if you are doing it yourself.
- **Yes**, you still need a clear setup checklist of AWS resources and config.
- **No**, Phase 1 is not just “Lambdas + KeyRa calling them.”
- The coding-agent FSs should cover:
  - `HttpAdapter`
  - project/mapping/schema Lambda logic
  - schema ingestion
  - search/query
  - large-schema orchestration if required
  - error handling and retry/recovery

If you want, I can do the next step and turn this into two clean deliverables:

1. a **“Manual AWS Setup Checklist for Phase 1”**, and  
2. a **“Coding-Agent FS List for Phase 1”** in spec-ready wording.