## KeyRa Build Phases

### Phase 0: Foundation (Local-Only)

**What it builds:**
The entire UI application running against `LocalStorageAdapter` with zero backend. Users can create projects, upload schemas, author mappings with the full DSL editor, preview transformations client-side, and manage test cases. Everything persists in the browser.

**What ships:**
- Home Dashboard (FS-014)
- Project Overview & CRUD (FS-013)
- Schema Library & Detail pages (FS-015, FS-016)
- Mapping Editor with all panels:
  - Rule List & CRUD with inline validation (FS-010)
  - Expression Builder — guided + raw (FS-011)
  - Preview & Testing with execute(), diff, trace, test cases (FS-012)
  - Configuration Panel (FS-017)
  - Version History (FS-018)
- Schema Tree View parsing JSON Schema, XSD, and inferred schemas (FS-009)
- Mapping engine running entirely in-browser — `validate()` and `execute()`
- All data in localStorage

**What to verify before moving to Phase 1:**

| Test | Why |
|------|-----|
| **TTFSM end-to-end:** Create project → upload schemas → create mapping → add 10 rules → preview → correct output in < 2 seconds | This is the primary success metric. If the offline flow is slow or broken, adding a backend won't help. |
| **Engine in-browser:** `validate()` runs on every rule change with no visible lag. `execute()` produces correct output for all DSL function types (direct copy, conditional, array map, valueMap, formatDate, etc.) | The engine is the foundation. If it doesn't work in the browser, nothing downstream works. |
| **Large schema handling:** Parse and render a 1,000+ field schema. Tree virtualizes. Search returns results in < 300ms. | Phase 1 won't fix client-side performance. |
| **Round-trip persistence:** Save a project with mappings, schemas, and test cases → refresh browser → everything loads intact from localStorage | Proves the data model and adapter pattern work before swapping the adapter. |
| **Playwright E2E (FS-019):** Happy path passes. Validation error flow passes. Schema tree interaction passes. | Regression safety net before Phase 1 refactoring. |
| **Zero lint/typecheck errors.** `tsc --noEmit`, ESLint, Prettier all clean. | Technical debt compounds. Clean it now. |

**Exit criteria:** A BA can complete a full mapping workflow (create → author → validate → preview → save) entirely in the browser with no backend. The Playwright suite passes.

---

### Phase 1: Backend Integration

**What it builds:**
Swaps `LocalStorageAdapter` for `HttpAdapter`. Adds persistent storage (DynamoDB + S3), API Gateway, and Lambda functions. No AI, no GitHub, no deployment — just real persistence.

**What ships:**
- `HttpAdapter` implementation (FS-020)
- API Gateway with routes for project/mapping/schema CRUD
- Lambda functions for all CRUD operations
- DynamoDB tables: Projects, Mappings, SchemaMetadata
- S3 storage for schema content and mapping config versions
- Schema ingestion pipeline — parse uploaded schemas into `SchemaNodes` in DynamoDB, generate embeddings, index in OpenSearch (FS-021)
- Adapter bootstrap: `VITE_API_URL` set → HttpAdapter; unset → LocalStorageAdapter

**What to verify before moving to Phase 2:**

| Test | Why |
|------|-----|
| **Adapter transparency:** Run the entire Playwright E2E suite against `HttpAdapter` with zero test changes. Every test that passed in Phase 0 passes in Phase 1. | Proves the `ApiAdapter` abstraction works — components genuinely don't know which adapter is active. |
| **Multi-session persistence:** Save a mapping in one browser → open a different browser/incognito → project and mapping load correctly | This is the whole point of Phase 1. |
| **Schema ingestion for 500-field schema:** Upload → Lambda parses → 500 `SchemaNode` records in DynamoDB → OpenSearch indexed → query returns results | Proves the ingestion pipeline works for typical schemas. |
| **Schema ingestion for 23,000-field schema (Step Function path):** Upload → Step Function orchestrates parallel batches → all nodes stored → query returns results in < 2 seconds | Proves the large-schema path works before AI depends on it. |
| **Error handling:** API returns 500 → UI shows error with retry → retry succeeds → UI recovers | Backend failures must not crash the UI. |
| **Lambda cold start < 3 seconds** | Users won't tolerate slow first loads. |
| **LocalStorageAdapter still works when `VITE_API_URL` is unset** | Don't break offline mode. |

**Exit criteria:** The full UI works identically against the backend as it did against localStorage. Schema ingestion handles schemas from 10 to 23,000 fields. OpenSearch is populated and queryable.

---

### Phase 2: AI Features

**What it builds:**
AI-assisted mapping powered by GitHub Models. All AI output is a suggestion that users explicitly accept. The RAG pipeline uses the schema index from Phase 1.

**What ships:**
- Auto-Map: RAG retrieval → Tier 2 generates DSL rules → validate with engine → present as suggestions
- NL → DSL: natural language instruction → Tier 1 generates a single expression
- Explain Rule: DSL expression → Tier 1 generates plain-English explanation
- Smart Fix: failing expression + error diagnostic → Tier 2 generates corrected expression
- AI Validation: full mapping + schemas → Tier 2 generates validation report
- AI-Assisted Field Descriptions: field names/types → Tier 1 generates descriptions (Schema Detail page)
- Prompt Registry in DynamoDB (versioned prompts, cached in Lambda)
- Panel 6 (AI Features) in the Mapping Editor

**What to verify before moving to Phase 3:**

| Test | Why |
|------|-----|
| **Auto-map acceptance rate > 60%** for schemas < 500 fields | Primary AI success metric from the product spec. |
| **Every AI-generated expression passes `validate()`** before being shown to the user | Invalid suggestions destroy trust. The engine validates all AI output server-side before returning it. |
| **Suggestion → Accept → Preview loop < 30 seconds** | TTFSM depends on this iteration speed. |
| **AI suggestions are never auto-committed.** Every suggestion requires explicit Accept/Edit/Dismiss. | Core UX principle. Verify there's no code path that commits without user action. |
| **Smart Fix produces a valid correction** for the top 10 most common error codes (E001, E003, E005, E020, E030, etc.) | Covers the errors BAs will hit most often. |
| **RAG retrieval quality:** For a 23k-field schema, auto-map retrieves the correct source sections for each target section (spot-check 10 target fields) | If retrieval is wrong, generation is wrong regardless of model quality. |
| **Prompt rollback works:** Change a prompt → quality degrades → revert to previous version → quality restores | Safety net for prompt engineering iterations. |
| **Prompt test harness:** Golden test dataset (20-50 cases per feature) validates every prompt change | Prevents prompt regression. |
| **Structured output:** All AI responses conform to their defined JSON schema. No parse failures in the UI. | Malformed AI responses must not crash the UI. |
| **LocalStorageAdapter users see graceful degradation:** AI buttons show "Available when backend is connected" | Don't break offline mode. |

**Exit criteria:** A BA can auto-map a 100-field schema with > 60% acceptance, fix errors with Smart Fix, and explain rules in plain English. All AI features follow the suggestion pattern. The prompt test harness passes.

---

### Phase 3: GitHub Integration

**What it builds:**
Two-repo schema version control. CDM schemas (read-only) from `KBXT/CDM-Schemas`. User-uploaded schemas (read-write) to `KBXT/KeyRa-Schemas`. Git becomes the source of truth for schemas.

**What ships:**
- CDM schema linking: browse CDM repo → link to project → re-sync on demand
- Schema publishing: upload → review → explicit "Publish to GitHub" → commit to non-CDM repo
- Schema sync: detect changes in GitHub → re-ingest → show diff
- Structured folder paths in the non-CDM repo (`projects/{slug}/` and `shared/`)
- Sync status indicators throughout the UI (✓ Synced / ⚠ Not synced / ⚠ Local changes)
- Schema Detail page actions become functional (Sync to GitHub, Re-sync, Promote to Global)
- GitHub Lambdas (list files, link, sync, publish)

**What to verify before moving to Phase 4:**

| Test | Why |
|------|-----|
| **Link CDM schema → re-sync after CDM team pushes update → diff shows fields added/removed** | Core CDM workflow. |
| **Upload schema → publish to GitHub → file exists at correct path in non-CDM repo** | Core publishing workflow. |
| **Edit a published schema → UI shows "⚠ Local changes" → sync to GitHub → status returns to "✓ Synced"** | Edit → sync round-trip. |
| **CDM schemas are read-only in KeyRa.** No edit/replace/remove actions available. | Core constraint. |
| **Publishing requires explicit BA action.** No automatic commits. | Core UX principle. |
| **Schema sync status is accurate across all surfaces:** Project Overview cards, Schema Library, Schema Detail | Users must trust the indicators. |
| **GitHub API rate limits handled gracefully:** cached file listings, exponential backoff, clear error messages | Rate limit failures shouldn't crash the app. |
| **Re-ingestion on sync:** when a schema changes in GitHub and is re-synced, all SchemaNodes are re-parsed, re-embedded, and re-indexed | Stale index data would break AI features. |

**Exit criteria:** Schemas flow bidirectionally with GitHub. CDM is read-only. Non-CDM is read-write with explicit publish. All sync indicators are accurate. AI features (Phase 2) still work correctly against GitHub-synced schemas.

---

### Phase 4: Deployment Workflow

**What it builds:**
Environment-based deployment (DEV → QA → PROD) with immutable snapshots, promotion, rollback, and full deployment context. The Deployment Page becomes functional.

**What ships:**
- Deployment Page with all sections: Current State, Environment Comparison, Diff, Deploy Actions, History, Approval Placeholder
- Deploy to DEV (one-click with confirmation)
- Promote DEV → QA, QA → PROD (same artifact, no re-generation)
- Rollback to any previous snapshot
- Immutable snapshots in S3 (mapping config + schema refs + engine version)
- Deployments DynamoDB table
- Deploy status badges become live across all surfaces (Home Dashboard, Project Overview, Mapping Editor top bar)
- Project Deployment Dashboard (`/projects/:projectId/deployments`)
- Home Deployment Overview (Deployments tab on Home Dashboard)
- Generic Mapping Lambda per environment (the production runtime)
- Server-side preview: invoke a deployed environment's Lambda with sample data
- Deployment gate: blocked if schemas are unsynced or mapping has validation errors

**What to verify before moving to Phase 5:**

| Test | Why |
|------|-----|
| **Deploy to DEV → snapshot created in S3 → active pointer updated → generic mapping Lambda returns correct output** | End-to-end deploy + execute. |
| **Promote DEV → QA → same snapshotId in both environments.** No re-generation. | Promotion is a copy, not a rebuild. |
| **Rollback in PROD:** deploy v3 → deploy v5 → rollback to v3 → PROD serves v3's output | Rollback must be instant and correct. |
| **Deployment Page diff:** v5 deployed to DEV, v7 is latest → diff shows "+2 rules added, ~3 modified" | BAs need context before deploying. |
| **Deployment gate:** mapping with validation errors → deploy button disabled with explanation. Mapping referencing unsynced schema → deploy button disabled. | Prevent broken deployments. |
| **Server-side preview:** select QA → provide sample data → output matches what QA's Lambda produces → output labeled "Output from QA (v5, deployed 2026-04-20)" | BAs need to verify deployed behavior. |
| **Deploy badges accurate across all surfaces:** Home Dashboard, Project Overview, Mapping Editor top bar all show correct ●/◐/○/◌ state | Trust in deployment status. |
| **Stale detection:** save mapping (new version) after deploying → badges show ◐ Stale → deploy again → badges show ● Current | BAs need to know when deployed versions are behind. |
| **Snapshot immutability:** deployed snapshot cannot be modified. Editing and saving creates a new version, not an update to the snapshot. | Core architectural constraint. |
| **Environment isolation:** DEV Lambda only reads DEV's DynamoDB/S3. No cross-environment data leakage. | Infrastructure safety. |

**Exit criteria:** Full deploy → promote → rollback lifecycle works. Server-side preview validates deployed behavior. All deployment UX surfaces are accurate and functional.

---

### Phase 5: Governance & Activity (Future)

**What it builds:**
Approval workflows, activity feed, authentication, and user identity.

**What ships:**
- PROD deployment requires approval (approval state machine via Step Functions)
- Activity feed: global and per-project ("Mapping X deployed to QA", "Schema Y synced from GitHub")
- Authentication via Cognito
- User identity attached to all actions (created by, modified by, deployed by)
- The approval placeholder on the Deployment Page becomes functional

**What to verify:**

| Test | Why |
|------|-----|
| **PROD deploy requires approval.** BA clicks "Promote QA → PROD" → request enters approval queue → approver approves → deploy executes | Governance gate works. |
| **Activity feed shows real events** in correct chronological order, filterable by project and type | Operational visibility. |
| **Authentication:** unauthenticated requests are rejected. Authenticated requests include user identity. | Security baseline. |
| **All prior phase tests still pass with authentication enabled** | Auth shouldn't break existing flows. |

**Exit criteria:** PROD deployments are governed. Activity is tracked. Users are identified. All previous phase functionality continues to work.

---

## Summary

| Phase | Core Question It Answers | Backend Needed |
|-------|--------------------------|----------------|
| **0** | Can a BA create a correct mapping entirely in the browser? | Amplify only |
| **1** | Does the same experience work with real persistence? | API Gateway, Lambda, DynamoDB, S3, OpenSearch |
| **2** | Can AI accelerate mapping authoring while keeping humans in control? | + GitHub Models, Prompt Registry |
| **3** | Can schemas be version-controlled in GitHub? | + GitHub API Lambdas |
| **4** | Can mappings be safely deployed to environments? | + Deployments table, Snapshots, Generic Mapping Lambda |
| **5** | Can deployments be governed and audited? | + Cognito, Step Functions (approval), Activity table |

Each phase is independently valuable. Phase 0 is a usable tool. Each subsequent phase adds a capability layer without breaking what came before.