# SPEC

## Title

Phase 1 Infrastructure and Environment Configuration

---

## ID

FS-062

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

Rev: 1

---

## Summary

Provision and configure the AWS infrastructure needed for KeyRa Phase 1 backend integration. This spec creates the deployable substrate: API Gateway REST API, Lambda function definitions, DynamoDB tables (Projects, Mappings, SchemaMetadata, SchemaNodes, MappingVersions), S3 bucket and prefix conventions, OpenSearch Serverless collection and index, Step Functions state machine for large schema ingestion, and environment configuration for both local development and deployed environments. This is infrastructure-only work that enables FS-056, FS-057, and FS-058 to deploy and execute.

---

## Problem

The Phase 1 backend specs (FS-056, FS-057, FS-058) define application logic — Lambda handlers, persistence modules, ingestion pipelines — but assume an AWS environment already exists. No infrastructure-as-code (IaC) definitions exist in the repository. There are no DynamoDB tables to write to, no API Gateway to route through, no S3 bucket to store content in, no OpenSearch collection to index into, and no Step Functions state machine to orchestrate. Without this substrate, backend code cannot be tested against real AWS services or deployed to any environment.

Additionally, local development requires DynamoDB Local, LocalStack S3, and mock OpenSearch configurations. No standardized local setup exists, meaning developers cannot run backend integration tests without manual AWS configuration.

---

## Goal

After this spec is implemented:

1. A SAM (Serverless Application Model) template defines all Phase 1 AWS resources in a single deployable stack.
2. All five DynamoDB tables are provisioned with correct key schemas, GSIs, and billing configuration.
3. An S3 bucket is provisioned with appropriate lifecycle rules and CORS.
4. API Gateway REST API is configured with all Phase 1 routes, CORS preflight, and Lambda integrations.
5. Lambda functions are defined with correct runtimes, memory, timeout, environment variables, and IAM permissions.
6. OpenSearch Serverless collection and index are configured for schema node indexing.
7. Step Functions state machine is defined for large schema ingestion orchestration.
8. A local development configuration enables `sam local` invocation, DynamoDB Local, and LocalStack S3 without AWS credentials.
9. Environment variable conventions are standardized across local, dev, and production.
10. Cold start mitigation strategies are documented and configured (provisioned concurrency for critical paths, minimal bundle sizes).

---

## Assumptions

- AWS SAM is the IaC framework (lightweight, Lambda-native, supports `sam local invoke` and `sam local start-api`).
- Single-stack deployment for Phase 1 (no multi-stack separation needed at this scale).
- Node.js 20.x Lambda runtime (matches project TypeScript toolchain).
- DynamoDB on-demand (PAY_PER_REQUEST) billing for Phase 1 (no capacity planning needed).
- OpenSearch Serverless (not managed OpenSearch) for zero-ops indexing.
- Single AWS region deployment (`us-east-1`) for Phase 1.
- No custom domain or TLS certificate configuration (Phase 1 uses default API Gateway URL).
- No authentication/authorization layer at infrastructure level (Phase 1 is unauthenticated).

---

## Current Context

The repository has:
- `src/lambda/ai/` — three existing AI Lambda handlers (explain-rule, suggest-expression, auto-map) that predate Phase 1 IaC. These use a manual deployment approach.
- `src/lib/ai/` — AI runtime utilities that reference environment variables but have no IaC backing.
- No `template.yaml`, `samconfig.toml`, `cdk.json`, or any IaC file in the repository.
- No `docker-compose.yml` for local service emulation.
- Existing architecture documents (backend-api.md, persistence-model.md, schema-ingestion.md) define the logical resources but not their IaC representation.

The persistence-model.md architecture document specifies:
- Table names: `keyra-projects`, `keyra-mappings`, `keyra-schema-metadata`, `keyra-schema-nodes`, `keyra-mapping-versions`
- S3 bucket configured via `STORAGE_BUCKET` environment variable
- DynamoDB endpoint override via `DYNAMODB_ENDPOINT` for local dev
- S3 endpoint override via `S3_ENDPOINT` for LocalStack

The backend-api.md architecture document specifies:
- 20 routes across project, mapping, and schema domains
- CORS headers on all responses
- One handler per Lambda function pattern
- Environment variable conventions for table names and bucket

The schema-ingestion.md architecture document specifies:
- OpenSearch Serverless collection `keyra-schema-nodes`
- Step Functions state machine `schema-ingestion.asl.json`
- Inline (< 500 fields) vs orchestrated (>= 500 fields) execution paths
- Batch sizing: DynamoDB 25 items, OpenSearch 500 docs, Step Functions batch 500 nodes

---

## Scope

### In Scope

- SAM template (`template.yaml`) defining all Phase 1 resources
- SAM configuration (`samconfig.toml`) for parameter overrides per environment
- DynamoDB table resource definitions (5 tables, GSIs, on-demand billing)
- S3 bucket resource definition with CORS and lifecycle rules
- API Gateway REST API with all Phase 1 routes and CORS preflight
- Lambda function resource definitions with packaging, runtime, memory, timeout, env vars, IAM roles
- OpenSearch Serverless collection, access policy, data access policy, and index mapping
- Step Functions state machine resource definition
- Lambda layer for shared dependencies (AWS SDK, common utilities)
- Environment variable mapping (local → dev → prod)
- Local development setup: `docker-compose.yml` (DynamoDB Local + LocalStack), `sam local` configuration
- `.env.example` and environment documentation
- Cold start mitigation configuration (memory sizing, provisioned concurrency flag)
- Build/package scripts for Lambda bundling (esbuild)

### Out of Scope

- Deployment pipeline/workflow (CI/CD, GitHub Actions) — separate spec
- GitHub integration infrastructure (webhooks, OAuth app)
- AI runtime infrastructure beyond what exists (PromptRegistry DynamoDB table, model endpoint config)
- Custom domain names, TLS certificates, Route53
- Authentication/authorization (Cognito, API keys, IAM auth)
- Monitoring/alerting (CloudWatch alarms, dashboards)
- Multi-region or disaster recovery configuration
- Cost optimization beyond on-demand billing
- VPC configuration

---

## Non-Goals

- This spec does not implement Lambda handler application code (that is FS-056, FS-057, FS-058).
- This spec does not define the persistence module TypeScript code (that is FS-058).
- This spec does not define API response shapes or error envelopes (that is FS-057).
- This spec is not responsible for choosing or implementing a deployment strategy (blue/green, canary).

---

## Relevant Areas

- `template.yaml` (new — SAM template at repo root)
- `samconfig.toml` (new — SAM deployment config at repo root)
- `docker-compose.yml` (new — local services at repo root)
- `.env.example` (new — environment variable reference)
- `scripts/setup-local.sh` (new — local environment bootstrap)
- `scripts/create-opensearch-index.ts` (new — index mapping setup)
- `src/lambda/` — existing and planned handler locations
- `esbuild.config.ts` or `build.ts` (new — Lambda bundling config) ?
- `forge/architecture/infrastructure.md` (new — architecture document)

---

## Dependencies / Blockers

- FS-058 (persistence model) defines the DynamoDB table schemas this spec provisions — schema definitions are stable in architecture docs.
- FS-057 (backend API) defines the route table this spec wires in API Gateway — route table is stable in architecture docs.
- FS-056 (schema ingestion) defines the Step Functions flow and OpenSearch mapping — definitions are stable in architecture docs.
- No hard blockers: architecture documents are authoritative and stable enough to proceed.

---

## Constraints

- Must use resource names and configurations consistent with `forge/architecture/persistence-model.md`, `backend-api.md`, and `schema-ingestion.md`.
- Environment variable names must match those already documented in architecture (`PROJECTS_TABLE`, `MAPPINGS_TABLE`, etc.).
- Must not break existing `src/lambda/ai/` handlers or their manual deployment approach. AI Lambdas are excluded from this SAM template until a dedicated AI infra spec lands.
- Lambda bundle size must stay under 5MB per function (esbuild tree-shaking).
- API Gateway timeout must be set to 29 seconds (maximum allowed, needed for inline schema ingestion).
- DynamoDB tables must use on-demand billing (no capacity units to manage in Phase 1).
- Local development must work without AWS credentials (using local emulators only).
- All resource names must be parameterized (stage-prefixed) to support multiple environments from one template.

---

## Proposed Behavior

### User Flow

This spec has no direct user-facing behavior. The "user" is a developer working on Phase 1 backend code.

**Local Development Flow:**
1. Developer runs `docker-compose up` to start DynamoDB Local and LocalStack.
2. Developer runs `scripts/setup-local.sh` to create tables and bucket in local emulators.
3. Developer uses `sam local start-api` to run API Gateway + Lambda locally.
4. Integration tests run against local endpoints with env vars pointing to emulators.

**Deployment Flow:**
1. `sam build` bundles each Lambda function via esbuild.
2. `sam deploy --config-env {stage}` provisions all resources in AWS.
3. Stack outputs provide API Gateway URL, table names, bucket name for downstream configuration.

### System Behavior

**SAM Template Structure:**

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Parameters:
  Stage:          # dev | staging | prod
  StorageBucketName:
  OpenSearchEndpoint:

Globals:
  Function:
    Runtime: nodejs20.x
    MemorySize: 256
    Timeout: 29
    Environment:
      Variables:
        STAGE: !Ref Stage
        PROJECTS_TABLE: !Ref ProjectsTable
        MAPPINGS_TABLE: !Ref MappingsTable
        SCHEMA_METADATA_TABLE: !Ref SchemaMetadataTable
        SCHEMA_NODES_TABLE: !Ref SchemaNodesTable
        MAPPING_VERSIONS_TABLE: !Ref MappingVersionsTable
        STORAGE_BUCKET: !Ref StorageBucket
        OPENSEARCH_ENDPOINT: !Ref OpenSearchEndpoint

Resources:
  # API Gateway
  # DynamoDB Tables (5)
  # S3 Bucket
  # Lambda Functions (20+)
  # Step Functions State Machine
  # IAM Roles
  # OpenSearch Serverless Collection + Policies

Outputs:
  ApiUrl:
  StorageBucketName:
  # Table ARNs for cross-stack reference
```

**DynamoDB Tables (from persistence-model.md):**

| Table | PK | SK | GSIs | Billing |
|-------|----|----|------|---------|
| `{Stage}-keyra-projects` | `projectId` | — | — | PAY_PER_REQUEST |
| `{Stage}-keyra-mappings` | `mappingId` | — | `projectId-index` (PK=projectId) | PAY_PER_REQUEST |
| `{Stage}-keyra-schema-metadata` | `schemaId` | — | — | PAY_PER_REQUEST |
| `{Stage}-keyra-schema-nodes` | `schemaId` | `path` | `fieldName-index`, `parentPath-index` | PAY_PER_REQUEST |
| `{Stage}-keyra-mapping-versions` | `mappingId` | `version` | — | PAY_PER_REQUEST |

**S3 Bucket:**
- Name: `{Org}-keyra-{Stage}-{AccountId}` (org-prefixed for clarity and safety)
- CORS: Allow `*` origins, GET/PUT/DELETE methods
- Lifecycle: Expire `schemas/*/batches/` prefix after 7 days (temp Step Functions artifacts)

**API Gateway:**
- REST API type (not HTTP API) for consistency with SAM Lambda proxy integration
- Binary media types: none needed (JSON only)
- Stage: `{Stage}`
- CORS: Configured via SAM `Cors` property on `AWS::Serverless::Api`

**Lambda Packaging:**
- esbuild bundling via SAM `BuildMethod: esbuild`
- External: `@aws-sdk/*` (provided by runtime)
- Entry points: one per handler file
- Source maps enabled for dev/staging
- Tree-shaking: enabled

**OpenSearch Serverless:**
- Collection: `{Stage}-keyra-schema-nodes`, type `SEARCH`
- Encryption policy: AWS-owned key
- Network policy: Public access (Phase 1 — no VPC)
- Data access policy: Allow Lambda execution role full CRUD on collection indexes
- Index mapping: per schema-ingestion.md Section 4
- Provisioning: Target IaC (SAM/CloudFormation), but may be provisioned separately as a prerequisite in Phase 1 if that reduces delivery friction

**Step Functions:**
- State machine name: `{Stage}-keyra-schema-ingestion`
- Definition: `src/lambda/schema/step-functions/schema-ingestion.asl.json`
- IAM: Allow invoke of `process-batch`, `orchestration-tasks` Lambdas
- Timeout: 15 minutes (for 23,000-field schemas)

**Cold Start Mitigation:**
- Base memory: 256MB (sufficient for Node.js 20 fast init)
- Critical path functions (schema ingestion, schema query): 512MB for faster cold start
- Provisioned concurrency: Configurable via parameter, disabled by default (cost), enabled for prod schema-query
- SDK client reuse: architecture already mandates module-level client instantiation

### Failure / Edge Behavior

- **Template validation failure**: `sam validate` catches syntax/reference errors before deploy.
- **Table already exists**: SAM updates are idempotent — existing tables are updated in-place (DynamoDB does not support key schema changes after creation; if needed, require table replacement with data migration).
- **OpenSearch collection creation timeout**: Collection creation can take 5–10 minutes. CloudFormation custom resource with appropriate timeout.
- **Local setup failure**: `setup-local.sh` is idempotent — re-running creates tables that don't exist and skips existing ones.
- **Lambda bundle too large**: esbuild bundling with tree-shaking keeps bundles small. Build script reports bundle size and fails if > 5MB.

---

## Acceptance Examples

### AE-01 — SAM template validates and builds successfully

**Given**
- The `template.yaml` file exists at the repository root
- All referenced Lambda handler entry points exist (even as stubs)

**When**
- `sam validate` is executed

**Then**
- Validation passes with no errors
- All resource references resolve correctly

### AE-02 — Local development environment starts successfully

**Given**
- Docker is running
- `docker-compose.yml` is present

**When**
- `docker-compose up -d` is executed
- `scripts/setup-local.sh` is executed

**Then**
- DynamoDB Local is accessible at `http://localhost:8000`
- LocalStack S3 is accessible at `http://localhost:4566`
- All 5 DynamoDB tables are created with correct schemas and GSIs
- S3 bucket is created with expected name

### AE-03 — Lambda functions have correct environment configuration

**Given**
- The SAM template is deployed (or inspected)

**When**
- Any Lambda function resource is examined

**Then**
- It has `PROJECTS_TABLE`, `MAPPINGS_TABLE`, `SCHEMA_METADATA_TABLE`, `SCHEMA_NODES_TABLE`, `MAPPING_VERSIONS_TABLE`, `STORAGE_BUCKET` environment variables
- Runtime is `nodejs20.x`
- Timeout is 29 seconds
- Memory is >= 256MB

### AE-04 — API Gateway routes match backend-api.md route table

**Given**
- The SAM template defines an API Gateway resource

**When**
- The route definitions are enumerated

**Then**
- All 20 routes from `forge/architecture/backend-api.md` Section 2 are present
- Each route has a corresponding Lambda function integration
- CORS preflight (OPTIONS) is configured for all resource paths

### AE-05 — DynamoDB tables have correct key schemas and GSIs

**Given**
- The SAM template defines DynamoDB table resources

**When**
- Table definitions are examined

**Then**
- Projects: PK=`projectId` (S), no SK, no GSI
- Mappings: PK=`mappingId` (S), no SK, GSI `projectId-index` (PK=`projectId`)
- SchemaMetadata: PK=`schemaId` (S), no SK, no GSI
- SchemaNodes: PK=`schemaId` (S), SK=`path` (S), GSI `fieldName-index` (PK=`fieldName`, SK=`schemaId#path` as single concatenated attribute), GSI `parentPath-index` (PK=`schemaId`, SK=`parentPath`)
- MappingVersions: PK=`mappingId` (S), SK=`version` (N)

### AE-06 — Step Functions state machine is defined correctly

**Given**
- The SAM template defines a Step Functions state machine resource

**When**
- The state machine definition is examined

**Then**
- It references `process-batch` and `orchestration-tasks` Lambda functions
- Map state has `MaxConcurrency: 10`
- State machine timeout is 15 minutes
- Error handling catches all task failures and routes to error handler

### AE-07 — esbuild bundling produces correct Lambda packages

**Given**
- Lambda handler source files exist

**When**
- `sam build` is executed

**Then**
- Each function is bundled independently via esbuild
- `@aws-sdk/*` is marked as external (not bundled)
- Bundle size per function is < 5MB
- Source maps are generated for non-production builds

### AE-08 — OpenSearch Serverless resources are defined

**Given**
- The SAM template includes OpenSearch Serverless resources

**When**
- Resources are examined

**Then**
- Collection type is `SEARCH`
- Encryption policy references the collection
- Network policy allows public access
- Data access policy grants Lambda role index/document CRUD permissions

---

## Open Questions

- none

---

## Verification Strategy

- **AE-01, AE-07**: Automated — `sam validate` and `sam build` in CI or local script.
- **AE-02**: Automated — integration test setup script verifies local services are accessible and tables exist.
- **AE-03, AE-04, AE-05, AE-06, AE-08**: Automated — unit tests that parse `template.yaml` and assert resource properties (or manual template review + `sam validate`).
- **Cold start**: Manual — measure cold start latency for critical Lambda functions after deployment; document results.
- **Bundle size**: Automated — build script reports sizes and fails if threshold exceeded.

---

## Task Generation Notes

All tasks are `Agent: task` (infrastructure/config work, no UI).

Decomposition:
1. **IaC scaffold**: Create `template.yaml` skeleton with Parameters, Globals, and Outputs. Create `samconfig.toml`. This is the foundation other tasks build on.
2. **DynamoDB tables**: Define all 5 table resources with correct schemas and GSIs. Can be tested with `sam validate`.
3. **S3 bucket**: Define bucket resource with CORS, lifecycle rules, and parameterized naming.
4. **API Gateway + Lambda functions**: Define REST API, all routes, Lambda function resources, and IAM roles. Largest task — may be split by domain (project, mapping, schema) if too large.
5. **OpenSearch Serverless**: Define collection, encryption policy, network policy, data access policy. Include index mapping setup script.
6. **Step Functions**: Define state machine resource, IAM permissions, and reference the ASL definition.
7. **Lambda bundling**: Configure esbuild via SAM `BuildMethod`, externals, source maps. Verify with `sam build`.
8. **Local development setup**: Create `docker-compose.yml`, `setup-local.sh`, `.env.example`, and document the local workflow.
9. **Architecture document**: Create `forge/architecture/infrastructure.md` and update INDEX.

Tasks 1–3 are sequential (scaffold first). Tasks 4–7 can proceed in parallel after 1. Task 8 depends on 1–3 (needs table/bucket names). Task 9 can proceed independently.

---

## Change Log

- Rev 1 — 2026-05-14
  - Initial draft
  - Resolved Q1: OpenSearch targets IaC but may be provisioned separately in Phase 1 if needed
  - Resolved Q2: AI Lambdas excluded from Phase 1 SAM stack
  - Resolved Q3: S3 bucket uses `{Org}-keyra-{Stage}-{AccountId}` naming convention
  - Resolved Q4: SAM Accelerate optional, not required for Phase 1 baseline
  - Resolved Q5: `fieldName-index` GSI uses single concatenated `schemaId#path` sort key attribute
