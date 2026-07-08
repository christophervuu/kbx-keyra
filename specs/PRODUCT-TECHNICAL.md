# KeyRa 2.0 — Product & Technical Specification

**Version:** 1.1
**Date:** 2026-07-07
**Status:** Updated (FS-106 Rev 2 alignment)
**Owner:** KeyRa Product Team

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Users & Personas](#2-users--personas)
3. [Success Metrics](#3-success-metrics)
4. [Goals & Non-Goals](#4-goals--non-goals)
5. [Navigation & Screen Architecture](#5-navigation--screen-architecture)
6. [Screen Specifications](#6-screen-specifications)
   - 6.1 Home Dashboard
   - 6.2 Project Overview
   - 6.3 Mapping Editor
   - 6.4 Deployment Page
   - 6.5 Schema Library
   - 6.6 Template Library
   - 6.7 Schema Detail
   - 6.8 Settings
7. [UI Responsibilities](#7-ui-responsibilities)
8. [Data Retrieval & API Client Layer](#8-data-retrieval--api-client-layer)
9. [Mapping Engine](#9-mapping-engine)
10. [KeyRa DSL](#10-keyra-dsl)
11. [Schema Management Lifecycle (FS-105)](#11-schema-management-lifecycle-fs-105)
12. [Deployment Workflow](#12-deployment-workflow)
13. [AI Capabilities](#13-ai-capabilities)
14. [Backend Architecture](#14-backend-architecture)
15. [Data Model](#15-data-model)
16. [API Route Map](#16-api-route-map)
17. [UX Principles & Design System](#17-ux-principles--design-system)
18. [Phased Build Plan](#18-phased-build-plan)
19. [Risks & Mitigations](#19-risks--mitigations)
20. [Open Questions](#20-open-questions)
21. [Glossary](#21-glossary)

---

## 1. Product Overview

KeyRa 2.0 is a web application that enables non-technical users to create, test, and deploy data mappings between JSON and XML schemas — without writing code or relying on developers. A "mapping" is a set of rules that describes how to transform data from a source format into a target format.

The application provides:

- A **visual mapping editor** powered by a custom DSL (Domain-Specific Language) for defining transformation rules. The DSL is designed to be readable and authorable by non-technical users, with guided builders for common patterns.
- A **portable mapping engine** — a pure TypeScript library that runs identically in the browser and in AWS Lambda. Users preview transformations instantly in the browser, and can optionally execute against the server-side engine to validate production parity.
- An **AI-assisted suggestion pipeline** backed by GitHub Models that can auto-generate mapping rules, translate natural language into DSL expressions, explain rules in plain English, and suggest fixes for errors.
- A **schema lifecycle platform** with KeyRa-managed user schema draft/revision/version management and CDM GitHub read-only ingestion.
- An **environment-based deployment workflow** (DEV → PREPROD → PROD) with immutable artifacts, operation-status polling, projection-backed overviews, and rollback capability. Deployed mapping configurations are consumed at runtime by a generic Lambda function — no code changes required to update transformation logic.

The frontend is a React/TypeScript/Vite application deployed on AWS Amplify. The backend is a serverless AWS stack (API Gateway, Lambda, DynamoDB, S3, Step Functions) that handles persistence, AI orchestration, schema ingestion/retrieval, and deployment management.

---

## 2. Users & Personas

### 2.1 Context

KeyRa exists to eliminate the developer handoff for data mappings. Before KeyRa, non-technical team members defined mapping requirements, then handed them to software engineers to implement in code. Every mapping change required a development cycle. With KeyRa, the people who understand the data — regardless of job title — author, test, and deploy mappings themselves.

### 2.2 Primary: Mapping Authors

**Background:** Non-technical to semi-technical. Understands business domains and the data formats involved in integrations. May have experience with spreadsheet formulas or simple configuration tools. Does not need to write code to use KeyRa.

This persona covers any team member who authors mappings — business analysts, integration specialists, or engineers who prefer a visual tool over hand-coding transformations.

**Goals:**
- Create a complete, correct mapping from source to target schema as quickly as possible.
- Validate mappings with real sample data before deploying.
- Understand what each mapping rule does without learning programming syntax.
- Deploy mappings to environments with confidence that nothing will break.
- Monitor project and mapping status at a glance — see which mappings are deployed, stale, or need attention across all projects.

**Frustrations (to solve):**
- Learning expression syntax is a barrier. Needs guided builders and AI assistance.
- Debugging transformation errors requires understanding internal engine behavior. Needs plain-language diagnostics.
- Large schemas (1,000+ fields) are overwhelming to navigate manually.
- Lack of visibility into what's deployed where across projects and environments.

**Typical session:** Upload or link a source and target schema → author mapping rules (up to 500, using AI suggestions and manual refinement) → preview with sample data → fix errors → save → navigate to the Deployment Page → deploy to an environment.

### 2.3 Supporting: Platform Maintainers

**Background:** Technical. Maintains the infrastructure that KeyRa's backend and the production mapping engine run on.

**Relationship to KeyRa:** Platform maintainers ensure the system is operational — infrastructure provisioning, monitoring, engine updates, and resolving production incidents. They may also maintain the generic mapping Lambda that executes deployed mappings at runtime (see Section 12.5). They can author mappings through the UI if needed, but their primary responsibility is the platform, not mapping logic.

**Note:** KeyRa's mapping engine and DSL are designed so that complex mappings (nested arrays, conditionals, cross-field lookups) are achievable by any user through guided builders and AI assistance — advanced features are progressive disclosure, not a separate persona.

---

## 3. Success Metrics

| Metric                                       | Definition                                                                                      | Target                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **TTFSM** (Time to First Successful Mapping) | Elapsed time from opening the tool to having a correct, validated mapping ready for deployment. | < 30 minutes for typical mappings (up to 500 fields) |
| **Preview loop latency**                     | Time from clicking "Preview" to seeing transformed output.                                      | < 2 seconds (client-side, zero backend dependency)   |
| **AI suggestion acceptance rate**            | % of AI-generated mapping rules accepted by users without modification.                         | > 60% for auto-map on schemas < 500 fields           |
| **Deployment confidence**                    | % of PROD deployments that do not require immediate rollback.                                   | > 95%                                                |
| **Schema coverage**                          | % of required target fields that have a mapping rule after initial authoring session.           | > 85% after auto-map + manual refinement             |

---

## 4. Goals & Non-Goals

### 4.1 Goals

- **G1:** Reduce TTFSM for users to under 30 minutes for typical mappings (up to 500 fields).
- **G2:** Support schemas ranging from a handful of fields to 23,000+ fields without degraded UX or AI accuracy.
- **G3:** Provide a client-side preview/test loop that executes in under 2 seconds with zero backend dependency.
- **G4:** Provide an optional server-side preview that executes against the production mapping engine, giving users confidence that their mapping will work in the actual runtime environment.
- **G5:** Enable environment-based deployment (DEV → PREPROD → PROD) with full audit trail and rollback capability.
- **G6:** Provide safe schema lifecycle management with immutable versioning for user-owned schemas in KeyRa, while keeping CDM GitHub integration read-only.
- **G7:** Provide AI-assisted mapping features that surface as reviewable suggestions — never auto-committed.
- **G8:** Make mappings debuggable through diagnostics with stable error codes, precise rule locations, and plain-language messages.
- **G9:** Build a portable, UI-independent mapping engine that runs identically in the browser (preview) and in the production runtime (deployed execution).
- **G10:** Provide project-level organization for grouping, browsing, and managing related mappings and schemas.
- **G11:** Enable users to discover, reuse, and share schemas and mapping templates across projects.

### 4.2 Non-Goals (Explicit Out of Scope)

- **NG1:** Authentication and authorization. The architecture must not preclude auth/tenancy, but no auth is implemented in initial phases.
- **NG2:** Multi-tenant data isolation. Single-tenant for now.
- **NG3:** Real-time collaboration (multi-user editing the same mapping simultaneously).
- **NG4:** Mobile-first design. Desktop browsers (1280px+ viewport) are the target.
- **NG5:** Production data transformation in the UI. The UI executes the mapping engine for preview and testing only — including optional server-side preview for parity validation. Actual production execution is handled by the backend infrastructure (see Section 12.5), not the UI.
- **NG6:** Approval workflows for PROD deployment. The UI will include a placeholder. The approval state machine is future work.
- **NG7:** CDM schema editing. CDM schemas are read-only in KeyRa.
- **NG8:** Fine-tuning or training custom AI/ML models. AI capabilities use prompt engineering with foundation models via GitHub Models.
- **NG9:** Real-time data connectors. KeyRa does not pull live data from source or target systems. Users provide sample data manually for preview and testing.

---

## 5. Navigation & Screen Architecture

### 5.1 Screen Hierarchy

```
HOME (Dashboard)
├── Overview metrics (projects, mappings, deployments at a glance)
├── Project list (search, filter, sort, create new project)
├── Activity feed (project activity + CDM schema updates, filterable)
     │
     ▼
PROJECT OVERVIEW
├── Project metadata (name, description, tags, dates)
├── Schema management (link global schemas + upload project-level schemas)
├── Mapping list (with read-only deploy status badges)
├── Actions: create mapping, add schema, open deployments, export, duplicate project
│    │                          │                │
│    ▼                          ▼                ▼
│  MAPPING EDITOR          DEPLOYMENT        PROJECT
│  ├── DSL rule authoring   DASHBOARD         DEPLOYMENT
│  ├── Schema browsers      (mapping-level)   DASHBOARD
│  ├── Preview & testing    ├── Current state  (project-level)
│  ├── AI features          ├── Env compare   ├── All mappings
│  ├── Diagnostics          ├── Change diff      deploy status
│  ├── Version history      ├── Deploy/       ├── Bulk promote/
│  │   (panel/drawer)         Promote/           rollback
│  └── Save (no deploy)      Rollback        └── Per-environment
│                           ├── History           overview
│                           └── Approval
│                              (future)
│
├── Project Settings (overrides for global defaults)
│
SUPPORTING SCREENS (accessible from global navigation)
├── Schema Library (browse schemas — CDM + user-owned)
├── Template Library (browse and apply mapping templates)
├── Schema Detail (view schema family, versions, metadata, usage)
└── Settings (global KeyRa configuration)
```

### 5.2 Frontend Routes

```
/                                                → Home Dashboard
/projects/new                                    → Create project wizard
/projects/:projectId                             → Project Overview
/projects/:projectId/settings                    → Project Settings
/deployments                                     → Global Deployment Overview
/projects/:projectId/deployments                 → Project Deployment Overview
/projects/:projectId/mappings/new                → Create mapping (select schemas)
/projects/:projectId/mappings/:mappingId         → Mapping Editor / Studio
/projects/:projectId/mappings/:mappingId/deploy  → Mapping Deployment Page
/schemas                                         → Schema Library (global schemas)
/schemas/:schemaId                               → Schema Detail
/templates                                       → Template Library
/settings                                        → Global Settings
```

### 5.3 Key Navigation Principles

1. **No dead ends.** Every screen has a clear "back" path and contextual breadcrumbs.
2. **Deploy is deliberate.** There is no deploy action in the Mapping Editor. Deployment lives on its own dedicated page, accessible from the Project Overview or via a read-only link in the editor.
3. **Save ≠ Deploy.** Saving a mapping persists changes. Deploying creates an immutable snapshot and pushes it to an environment. These are separate, intentional actions.
4. **Schemas are a project concern.** Schema management (linking, uploading, syncing) lives on the Project Overview, not inside the Mapping Editor.
5. **Three deployment surfaces with one action surface.** Global (`/deployments`) and project (`/projects/:projectId/deployments`) pages are overview + drill-down only. The Mapping Deployment Page provides detailed context and is the only mutating deployment surface.
6. **Schema availability and ownership.** CDM schemas are shared read-only assets. User-owned schemas are KeyRa-managed schema families; mappings select immutable versions explicitly and are never auto-upgraded.
7. **Settings inherit.** Project-level settings override global defaults. Mappings within a project inherit the project's settings unless explicitly overridden at the mapping level.

---

## 6. Screen Specifications

### 6.1 Home Dashboard

**Purpose:** Provide an at-a-glance overview of all projects, mappings, schemas, and deployments, and fast access to any of them.

**URL:** `/`

#### Sections

| Section                 | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Data Source                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| **Overview metrics**    | Total projects. Total mappings. Total global schemas. Mappings by deploy status (N in DEV, N in PREPROD, N in PROD). Recent warnings/errors.                                                                                                                                                                                                                                                                                                                                   | `GET /projects` (aggregated)    |
| **Project list** (tab)  | Searchable, sortable table or card grid. Columns: name, description, source schema, target schema, mapping count, last modified, deploy status summary badges. A primary "Create Project" action button in the section header. Each project row/card has actions: Edit (→ Project Overview), Delete.                                                                                                                                                                           | `GET /projects`                 |
| **Deployments** (navigation destination)   | Global deployment overview page (`/deployments`): one row per mapping, including never deployed. Columns: project, mapping, DEV/PREPROD/PROD status badges + version/freshness, last activity timestamp, action (link → Mapping Deployment Page). Searchable and filterable by project, environment, freshness, attention state, and operation status. Default sort: last activity desc. Read-only — no deploy actions. | `GET /deployments` (projection-backed) |
| **Schema Library link** | Prominent navigation link (not a tab) to the Schema Library (`/schemas`). Displayed alongside or above the tabs. Shows total available schema count (CDM + user-owned).                                                                                                                                                                                                                                                                                                         | Navigation only                 |
| **Activity feed**       | Chronological feed: "Mapping X deployed to PREPROD", "Schema Y version created", "Project Z created". Filterable by: All, My Projects, CDM Updates. CDM schema updates display with a 📚 badge. If a CDM update affects a schema used in one of the user's projects, it is flagged with higher priority (e.g., "⚠ CDM schema updated — 3 projects use this schema").                                                                                                          | `GET /activity`                 |

#### Deploy Status Badge

A compact visual indicator that appears on project cards and mapping rows throughout the application:

```
● Deployed (green)       — this version is live in the environment
◐ Stale (orange)         — mapping edited since last deploy to this environment
○ Not deployed (gray)    — never deployed to this environment
◌ Deploying (yellow)     — deployment in progress
```

On the home dashboard, these badges are **read-only indicators**. Clicking a project card navigates to the Project Overview, not to a deploy action.

#### States

| State     | Behavior                                                                                   |
| --------- | ------------------------------------------------------------------------------------------ |
| Loading   | Skeleton cards/rows while data loads                                                       |
| Empty     | "No projects yet" message with prominent "Create Your First Project" CTA                   |
| Error     | Inline error banner with retry button; previously loaded data remains visible if available |
| Populated | Full project list with metrics                                                             |

---

### 6.2 Project Overview

**Purpose:** Single place to manage everything about a project — metadata, schemas, mappings, and their deployment lifecycle.

**URL:** `/projects/:projectId`

#### Section A: Project Metadata

| Field | Editable | Notes |
|-------|----------|-------|
| Name | Yes | Required. Used to generate project slug for GitHub paths. |
| Description | Yes | Free text. Displayed on home dashboard. |
| Tags / Labels | Yes | For filtering on home dashboard. |
| Created date | Read-only | Auto-populated. |
| Modified date | Read-only | Auto-populated on any change. |
| Updated by | Read-only | Auto-populated with the user who last made a change. |

#### Section B: Schema Management

Schemas are attached to a project from two canonical sources.

**Option 1: Link from CDM Library (Read-only shared)**
- Browse company-standard schemas from the CDM GitHub repo.
- CDM schemas are read-only in KeyRa.
- CDM updates are ingested as immutable new versions when re-sync is run.
- The UI shows a file browser scoped to the CDM repo.
- Actions: View, Re-sync, Unlink from project.

**Option 2: Create/Import User-Owned Schema (KeyRa lifecycle)**
- Create from blank JSON Schema, upload JSON Schema/XSD, infer from sample JSON/XML, or duplicate existing schema family.
- User-owned schema lifecycle is managed in KeyRa with:
  - one active draft,
  - draft revisions,
  - immutable versions (`v1+`) created explicitly.
- **Sample data handling:** If the user uploads sample JSON or sample XML, KeyRa infers initial schema structure and flags it for review.
- Uploaded schemas are stored in original format; parser/editor support JSON Schema and XSD according to feature capability.
- Actions: View, Edit draft, Save draft, Create version, Compare versions, Restore to draft, Deprecate version, Archive family, Remove (guarded).

#### Schema Source-of-Truth Model

| Schema Type | Source of truth | Behavior |
|-------------|-----------------|----------|
| **CDM** | GitHub CDM repo (read-only) + KeyRa-ingested immutable versions | Re-sync pulls upstream changes and creates immutable new versions in KeyRa. |
| **User-owned** | KeyRa (DynamoDB/S3) | Draft/revision/version lifecycle is managed in KeyRa. Non-CDM publish/sync-to-GitHub is not part of canonical behavior. |

#### Schema Status Indicators (high-level)

```
Draft                   — mutable working state (not mapping-selectable)
Ready version           — immutable version selectable for mappings
Update available        — newer version exists than current mapping pin
Deprecated version      — selectable only via explicit reveal/warning flows
Archived family         — hidden from default new selection; existing pins remain resolvable
```

#### Deployment Gate

Deployments are blocked when required mapping/schema dependency checks fail (for example unresolved/invalid dependencies), but not by retired non-CDM Git sync requirements.

Schema cards display:

```
┌──────────────────────────────────────────────────────────────┐
│  📄 {Schema Name}                                             │
│  {Origin: CDM / User-owned}                                   │
│  {Lifecycle: Draft / vN / Archived}                           │
│                                                               │
│  Source: {CDM path or "KeyRa-managed"}                        │
│  Fields: {count}    Format: {JSON Schema / XSD / Inferred}    │
│  {Version/readiness status indicator}                         │
│                                                               │
│  [{contextual lifecycle actions}]                             │
└──────────────────────────────────────────────────────────────┘
```

#### Section C: Mapping List

A primary "Create Mapping" action button in the section header.

| Column | Description |
|--------|------------|
| Name | Mapping configuration name |
| Source → Target | Schema names with arrow |
| Rules | Count of DSL rules |
| Coverage | Percentage of required target fields that have a mapping rule |
| Status | Draft / Ready / Has Errors |
| DEV | Read-only deploy status badge (●/○/◐) with deployed version number |
| PREPROD | Read-only deploy status badge |
| PROD | Read-only deploy status badge |
| Last Modified | Timestamp |
| Updated By | User who last modified |
| Actions | Edit (→ editor), Deploy (→ deployment page), Duplicate, Delete |

Deploy status badges on the mapping list are **read-only indicators**. The "Deploy" action in the actions column navigates to the Deployment Page — it does not trigger an inline deploy.

#### Section D: Project Actions

- **Create Mapping:** Opens mapping creation wizard (select source + target schema, name the mapping).
- **Add Schema:** Opens the three-option schema picker described in Section B.
- **Open Deployments:** Navigates to the Project Deployment Overview (`/projects/:projectId/deployments`).
- **Duplicate Project:** Creates a copy of the project with all its mappings and schema links.
- **Export Project:** Bundles all mapping configs, schema references, and test cases into a `.keyra` file.
- **Import Mapping:** Upload a mapping config file to add to this project.
- **Project Settings:** Navigates to project-level settings (`/projects/:projectId/settings`).

---

### 6.3 Mapping Editor

**Purpose:** The primary workspace where users author, test, and refine mapping rules. This screen is optimized for focused, iterative work.

**URL:** `/projects/:projectId/mappings/:mappingId`

#### Top Bar

```
┌──────────────────────────────────────────────────────────────────────┐
│  {Mapping Name}  v{N} ({saved / unsaved changes})    DEV ● PREPROD ○ PROD ○ │
│  {Source Schema} → {Target Schema}                                      │
│  ℹ️ {Informational message if deployed version is stale}                │
│  [Go to Deploy Page]                                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

- Version indicator shows current version and save status.
- Deploy badges are **read-only**. No deploy actions exist on this screen.
- If the latest saved version has not been deployed to any environment, an informational message appears with a link to the Mapping Deployment Page (`/projects/:projectId/mappings/:mappingId/deploy`).

#### Core Panels

The editor is composed of panels. The exact layout (side-by-side, tabbed, or hybrid) is a design decision to be finalized during implementation, but the following panels exist:

**Panel 1: Source Schema Browser**
- Tree view of the source schema with expand/collapse, type icons, search, and required-field indicators.
- Required-field indicators help users understand which source fields should always be present in incoming data, and which are optional (and may need null handling via `default()` or `coalesce()`).
- Parsed client-side from JSON Schema or XSD content.
- Selecting a source field provides it as input to the expression builder.

**Panel 2: Target Schema Browser**
- Tree view of the target schema with expand/collapse, type icons, search, and required-field indicators.
- Each target field shows a visual indicator of its mapping status: mapped (checkmark), unmapped (empty), mapped with warnings (yellow indicator).
- Selecting a target field opens or navigates to its rule in the rule editor.

**Panel 3: Rule Editor**
- The primary authoring area. Displays the list of DSL mapping rules.
- Each rule shows: target field path, expression (formatted), type, and inline validation status.
- Supports: add rule, edit rule, delete rule, reorder rules, multi-select + bulk actions, copy/paste rules to clipboard.
- Inline validation runs the engine's `validate()` on every change. Errors display with stable codes, precise locations, and user-friendly messages. No backend call is needed.

**Panel 4: Expression Builder**
- A guided form that constructs DSL expressions without requiring raw syntax knowledge.
- Steps: select source field(s) → choose transform (cast, default, concat, conditional, etc.) → preview result.
- For advanced use: a raw DSL text editor with syntax highlighting and autocomplete (source field names, DSL function names).
- Both modes produce the same DSL expression.

**Panel 5: Preview & Testing**
- Source data input: paste JSON/XML, upload a file, or load a saved test case.
- Format auto-detection (JSON vs XML).
- **Client-side preview:** "Preview" button runs the mapping engine `execute()` in-browser against the current working config (including unsaved changes). Output appears alongside source. This is the default fast path — zero backend dependency, < 2 seconds.
- **Server-side preview (optional):** "Run on Server" action with an environment selector (DEV / PREPROD / PROD). Only environments with an active deployment are selectable. The backend retrieves the active snapshot for the selected environment, executes the mapping engine, and returns the transformed output + diagnostics. Output is labeled with the environment and snapshot version (e.g., "Output from PREPROD (v5, deployed 2026-04-20)"). This lets users answer: "What would this payload look like if it went through the mapping currently deployed in PREPROD?" — without deploying or modifying anything.
- Diff view: highlights matches, mismatches, missing fields, extra fields between actual output and expected output (if provided).
- Diagnostics panel: shows engine warnings, errors, and traces. Each diagnostic links to the rule that produced it.
- Test case management: save input + expected output as named test cases. Run all test cases, show pass/fail summary.
- Trace mode: step-by-step execution showing which rule fired, what input it saw, what it produced. Enabled by engine's `trace` option.

**Panel 6: AI Features**
- Accessible via contextual buttons throughout the editor (e.g., "Auto-map", "Suggest expression", "Explain", "Fix").
- All AI features follow the suggestion pattern: request → loading → review suggestion → accept / edit / dismiss.
- Details in Section 13.

**Panel 7: Configuration**
- Bulk behaviors: unmapped targets strategy (null / omit / error), null-out subtree (select subtree roots from tree), global default values.
- Array configuration: dedicated UI for array/repeating element rules.
- Metadata: external sources, constants, value mappings.
- Settings in this panel inherit from project-level settings and can be overridden per mapping.

**Panel 8: Version History**
- Accessible as a drawer or side panel within the editor.
- Shows a chronological list of saved versions (v1, v2, v3...) with timestamps and "Updated By" metadata.
- Selecting a version shows a diff against the current version (rules added, modified, removed).
- "Restore this version" action replaces the current working state with the selected version's config and creates a new version.
- "View Full History" link opens a dedicated view if the history is extensive.

#### What the Editor Does NOT Include

| Excluded | Reason | Where It Lives |
|----------|--------|---------------|
| Deploy actions | Deployment requires full context (diffs, environment state, history) that the editor does not have. | Mapping Deployment Page |
| Promote actions | Promotion is a deliberate, informed decision. | Mapping Deployment Page |
| Schema lifecycle actions | Schema management is a project-level concern. | Project Overview |
| Schema structural editing | Schema editing (refining inferred schemas, adjusting types/requirements) is a schema-level concern, not a mapping concern. | Schema Detail page or Project Overview |

#### Save Behavior

- "Save" persists the current mapping config (local storage in Phase 0, API call in Phase 1+).
- Auto-save on a configurable interval is optional (default: off).
- Save increments the version number (v1, v2, v3...).
- Save does NOT trigger any deployment action.

---

### 6.4 Deployment Page

Deployment visibility exists at three levels. Actions (deploy, promote, rollback) only exist at the mapping level.

#### 6.4.1 Home Deployment Overview

**Purpose:** At-a-glance deployment status across all projects and mappings.

**Location:** Deployments tab on the Home Dashboard (`/`)

**Content:**

| Column | Content |
|--------|---------|
| Project | Project name |
| Mapping | Mapping name |
| DEV | Deploy status badge + version |
| PREPROD | Deploy status badge + version |
| PROD | Deploy status badge + version |
| Last Deployed | Timestamp of most recent deployment (any environment) |
| Status | Current / Stale / Not deployed |
| Action | Link → Mapping Deployment Page |

- Searchable and filterable by project, environment, and status (stale, current, not deployed).
- Sortable by last deployed date (default: most recent first).
- Read-only — no deploy actions. Clicking a row navigates to the Mapping Deployment Page.
- Stale mappings are visually highlighted to draw attention.

#### 6.4.2 Project Deployment Overview

**Purpose:** Deployment status of all mappings within a single project. Helps users answer "what's deployed in this project, and is anything out of date?"

**URL:** `/projects/:projectId/deployments`

**Entry points:**
- "Open Deployments" action on the Project Overview.
- Clicking a project name in the Home Deployment Overview.

**Content:**

| Column | Content |
|--------|---------|
| Mapping | Mapping name |
| Latest Version | Most recent saved version number |
| DEV | Deploy status badge + deployed version |
| PREPROD | Deploy status badge + deployed version |
| PROD | Deploy status badge + deployed version |
| Last Deployed | Timestamp |
| Deployed By | User who last deployed (any environment) |
| Status | Current / Stale / Not deployed |
| Action | Link → Mapping Deployment Page |

- Summary bar at the top: "12 mappings. 8 current. 3 stale. 1 not deployed."
- Filter by status, environment.
- Read-only — no deploy actions at this level. Each row links to the Mapping Deployment Page for that mapping.

#### 6.4.3 Mapping Deployment Page

**Purpose:** Provide users with all the context needed to make an informed deployment decision for a single mapping. This is where deploy, promote, and rollback actions live.

**URL:** `/projects/:projectId/mappings/:mappingId/deploy`

**Entry points:**
- "Deploy" action on a mapping row in the Project Overview.
- "Deploy" link on a mapping row in the Project Deployment Dashboard.
- "Go to Deploy Page" link in the Mapping Editor top bar.
- Clicking a row in the Home Deployment Overview.

##### Section A: Current State

Displays the latest saved version of the mapping and its readiness:

| Field | Content |
|-------|---------|
| Latest saved version | Version number, save timestamp, author |
| Rule summary | Total rules, coverage percentage |
| Validation status | "✓ No validation errors" or "⚠ N warnings" or "✗ N errors — resolve before deploying" |
| Schema references | Source schema name, origin, version/commit. Target schema name, origin, version/commit. |
| Schema dependency status | "✓ All schema dependencies resolvable" or explicit dependency warning/block reason |

If the mapping has validation errors or unresolved/invalid schema dependencies, the deploy actions in Section D are disabled with an explanation.

##### Section B: Environment Comparison

A table showing the current state of each environment:

| Column | Content |
|--------|---------|
| Environment | DEV / PREPROD / PROD |
| Deployed Version | Version number currently active in this environment, or "Not deployed" |
| Deployed At | Timestamp |
| Deployed By | User |
| Status | Current (matches latest) / Stale (N versions behind) / Not deployed |

Below the table, a plain-language summary: "Latest: v7. DEV is 2 versions behind. PREPROD and PROD are 4 versions behind."

##### Section C: What's Changing (Diff)

Contextual diff that answers "what exactly will change if I deploy?"

- Automatically compares the latest saved version against the currently deployed version for the selected environment.
- **Rule-level diff:** rules added, rules modified (showing before/after), rules removed.
- **Schema-level diff:** if immutable schema version refs differ between deployed snapshot and current refs — fields added, removed, modified.
- "View Full Diff" expands to show a rule-by-rule comparison.
- If no version is deployed to the target environment, the diff shows "Initial deployment — all N rules are new."

##### Section D: Deploy Actions

| Action | Availability | Behavior |
|--------|-------------|----------|
| **Deploy to DEV** | Always available (if no validation errors and dependencies are deployable) | Creates a snapshot of current mapping + immutable schema refs + engine version. Deploys to DEV. |
| **Promote DEV → PREPROD** | Available when DEV has a deployed version newer than PREPROD | Takes the exact snapshot from DEV and makes it active in PREPROD. Does not create a new snapshot — reuses the same artifact. |
| **Promote PREPROD → PROD** | Available when PREPROD has a deployed version newer than PROD | Takes the exact snapshot from PREPROD and makes it active in PROD. PROD promotion requires explicit reason. |

Every deploy/promote action triggers a confirmation modal:

```
┌──────────────────────────────────────────────────────────────┐
│  Confirm Deployment                                           │
│                                                               │
│  You are deploying {Mapping Name} v{N} to {ENV}.             │
│                                                               │
│  This will:                                                   │
│  ✓ Create an immutable snapshot of the mapping config         │
│  ✓ Lock schema references to current versions                 │
│  ✓ Replace the current {ENV} deployment (v{M})               │
│                                                               │
│  Changes from v{M} → v{N}:                                   │
│    +{A} rules added, ~{B} modified, -{C} removed             │
│                                                               │
│  [Cancel]                              [Deploy to {ENV}]      │
└──────────────────────────────────────────────────────────────┘
```

##### Section E: Deployment History

Chronological list of all deployments for this mapping, filterable by environment.

| Column | Content |
|--------|---------|
| Version | Version number deployed |
| Environment | DEV / PREPROD / PROD |
| Deployed At | Timestamp |
| Deployed By | User |
| Status | Active / Superseded / Rolled back |
| Action | "Rollback to this version" (available for non-active entries) |

##### Section F: Approval Status (Future Placeholder)

A clearly marked placeholder section:

> 🔒 PROD deployments will require approval in a future release. For now, PROD deploys are direct.

This section is visible but non-functional. It communicates that governance is planned.

#### Deployment Concepts

| Concept      | Definition                                                                                                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Snapshot** | An immutable artifact containing: the full mapping config (DSL rules), immutable schema references (`schemaId`, `schemaVersion`, `schemaVersionId`, `contentHash`, artifact refs), the engine version, and a timestamp. Snapshots are never modified after creation. |
| **Deploy**   | Writing a snapshot to an environment. The environment's "active" pointer moves to this snapshot.                                                                                                                                  |
| **Promote**  | Copying an existing snapshot from one environment to another. The same artifact runs in both environments — no re-generation.                                                                                                     |
| **Rollback** | Moving an environment's "active" pointer back to a previously deployed snapshot. No data is deleted.                                                                                                                              |
| **Stale**    | A mapping has been saved (new version) since the last deploy to a given environment. The deployed version is behind the latest saved version.                                                                                     |

---

### 6.5 Schema Library

**Purpose:** Browse all available schemas across all projects. Helps users discover existing schemas to reuse.

**URL:** `/schemas`

#### Content

- Searchable, filterable list of all schemas (CDM + user-owned schema families).
- Filter by: origin (CDM / User-owned), format (JSON Schema / XSD / Inferred), lifecycle state (has draft / has ready versions / archived).
- Sort by: name, field count, last modified, origin.
- Each schema card shows: name, origin badge, lifecycle/version summary, field count, format, projects using it, and readiness summary.
- Clicking a schema card navigates to Schema Detail (`/schemas/:schemaId`).

#### Schema Origins

| Origin | Badge | Meaning | Lifecycle Notes |
|--------|-------|---------|-----------------|
| CDM | 📚 CDM | Pulled from the CDM repo. Read-only in KeyRa. | Re-sync may create immutable new versions in KeyRa. |
| User-owned | 📄 User | Created/imported in KeyRa and managed by schema family lifecycle. | Draft/revision/version lifecycle is KeyRa-native; non-CDM Git publish/sync is retired. |

#### States

| State | Behavior |
|-------|----------|
| Loading | Skeleton cards while data loads |
| Empty | "No schemas available" message with link to upload a schema from the Project Overview |
| Error | Inline error banner with retry button; previously loaded data remains visible if available |
| Populated | Full schema list with filters |

---

### 6.6 Template Library

**Purpose:** Browse curated mapping templates that provide starting points for common integration patterns.

**URL:** `/templates`

#### Content

- List of templates with: name, description, source schema type, target schema type, rule count, tags.
- "Preview" shows the template's rules and a description of what each does.
- "Use Template" copies the template's rules into a new mapping within a project.

Templates are stored in DynamoDB and managed by the KeyRa team (future: community-contributed).

---

### 6.7 Schema Detail

**Purpose:** View a single schema family's full content, metadata, versions, and usage — and for user-owned schemas, edit its draft structure.

**URL:** `/schemas/:schemaId`

#### Section A: Metadata

| Field | Editable | Notes |
|-------|----------|-------|
| Name | Yes (non-CDM only) | Display name used throughout the app |
| Description | Yes (non-CDM only) | Free text |
| Origin | Read-only | CDM / User-owned |
| Lifecycle | Read-only summary + actionable controls | Draft + immutable versions + archive/deprecate states |
| Format | Read-only | JSON Schema / XSD / Inferred |
| Field count | Read-only | Auto-calculated from schema content |
| Created date | Read-only | |
| Modified date | Read-only | |
| Updated by | Read-only | |

#### Section B: Version & Source Status

| Field | Content |
|-------|---------|
| Source model | CDM read-only Git source or KeyRa-managed user schema lifecycle |
| Current draft | Draft revision number + based-on version (if applicable) |
| Latest immutable version | Version number + `schemaVersionId` + content hash summary |
| Readiness statuses | `versionStatus`, `indexStatus`, `impactStatus`, `sampleValidationStatus` |

#### Section C: Schema Tree View

- Full interactive tree view of the schema (same component as the Mapping Editor's schema browsers).
- Expand/collapse, type icons, search, required-field indicators.
- For **user-owned schemas**, the tree view supports inline editing (see Section D).
- For **CDM schemas**, the tree view is read-only.

#### Section D: Schema Editing (User-owned only)

Available for user-owned schemas. Not available for CDM schemas.

**Editing capabilities:**

| Action | Description |
|--------|------------|
| **Mark field as required/optional** | Toggle the required flag on any field |
| **Change field type** | Adjust the data type (string, number, boolean, object, array) |
| **Add description** | Add or edit a human-readable description for any field |
| **Rename field** | Change a field's name |
| **Add field** | Add a new field to an object |
| **Remove field** | Delete a field from the schema |
| **Add nested object** | Insert a new object with child fields |
| **Add array** | Insert a new array field with item definition |

**AI-assisted field descriptions:**
- "Auto-describe fields" action available in the toolbar. Sends field names, types, paths, and structural context to the AI pipeline (Tier 1). Returns a human-readable description for each field based on naming conventions and structure (e.g., `postalCode` → "The ZIP or postal code of the address").
- Descriptions appear as suggestions — the user reviews and accepts, edits, or dismisses each one before they are saved.
- Particularly useful for inferred schemas (from sample data) and uploaded schemas with no existing descriptions.
- Better field descriptions improve downstream AI accuracy during auto-map, since the RAG embedding text includes field descriptions.

**Editing behavior:**
- Edits are made inline in the tree view or via a field detail panel.
- Changes are saved to the schema on explicit "Save" action.
- Saving edits creates/updates draft revisions (subject to no-change suppression).
- Creating immutable versions is explicit (`Create version`) and is not implied by draft save.
- Editing a schema does **not** automatically update mappings. Mappings pin immutable schema versions and require explicit upgrade flow to move pins.

**Inferred schema callout:**
- Schemas inferred from sample data display a persistent banner: "⚠ This schema was inferred from sample data and may be incomplete. Review and refine the structure before using it in mappings."
- The banner includes a "Dismiss" option once the user has reviewed and is satisfied with the structure.

#### Section E: Usage

| Content | Description |
|---------|------------|
| Projects using this schema | List of projects that have linked this schema, with links to each Project Overview |
| Mappings referencing this schema | List of mappings using this schema as source or target, with links to each Mapping Editor |

This helps users understand the impact of editing or removing a schema — if 5 mappings reference it, changes may require re-validation.

#### Section F: Actions

Actions depend on origin and status:

| Action                   | Availability                      | Behavior                                                                                           |
| ------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Edit**                 | Non-CDM only                      | Enables inline editing in the tree view (Section D)                                                |
| **Auto-describe fields** | Non-CDM only                      | AI generates human-readable descriptions for all fields. Results appear as reviewable suggestions. |
| **Create version**       | User-owned schemas with draft changes | Creates immutable next schema version from the selected draft revision.                           |
| **Compare versions**     | All schemas with 2+ versions         | Shows structural diff/impact summary between selected versions.                                   |
| **Restore to draft**     | User-owned schemas with existing versions | Replaces current draft content from a selected immutable version.                                |
| **Re-sync from GitHub**  | CDM schemas                          | Pulls latest from CDM source; ingests as immutable new version when changed.                      |
| **Deprecate version**    | Versioned schemas                    | Marks selected version deprecated (hidden by default for new selection).                          |
| **Archive family**       | User-owned schemas                   | Hides family from default new selection while preserving existing pinned resolution.               |
| **Replace file / import**| User-owned schemas                   | Imports new structure into draft lifecycle flow (does not mutate immutable versions).             |
| **Remove**               | User-owned schemas                   | Removes schema family only when dependency guards allow; otherwise blocked with explicit blockers. |
| **View Raw**             | All                                  | Shows the raw JSON Schema or XSD content.                                                         |

---

### 6.8 Settings

**Purpose:** Application-level configuration.

**URL:** `/settings`

#### Sections

| Section                 | Content                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend connection**  | API base URL. Connection status indicator.                                                                                               |
| **Environment URLs**    | DEV mapping Lambda URL. PREPROD mapping Lambda URL. PROD mapping Lambda URL. Used for server-side preview. Connection status per environment. |
| **GitHub connection**   | CDM repo path. Non-CDM repo path. Connection status.                                                                                     |
| **AI configuration**    | Model preferences (if overridable). No API keys stored in the UI — keys are backend environment variables.                               |
| **Display preferences** | Theme (future), default preview format (JSON/XML), editor font size.                                                                     |
| **About**               | Application version, engine version, build info.                                                                                         |

---

### 6.9 Project Settings

**Purpose:** Per-project configuration that overrides global defaults from Section 6.8.

**URL:** `/projects/:projectId/settings`

#### Sections

| Section | Content | Inherits From (6.8) |
|---------|---------|---------------------|
| **Unmapped targets strategy** | Default behavior for target fields with no mapping rule: null / omit / error. | N/A (mapping-specific) |
| **Null-out subtrees** | Default subtree roots to null out across all mappings in this project. | N/A (mapping-specific) |
| **Constants** | Key-value pairs shared across all mappings in this project (e.g., `COMPANY_CODE`, `DEFAULT_CURRENCY`). Individual mappings can override. | N/A (mapping-specific) |
| **Default preview format** | JSON or XML. Overrides global display preference. | Display preferences |
| **AI configuration** | Model tier preferences for this project (e.g., always use Tier 2 for auto-map). | AI configuration |
| **Schema defaults** | Project defaults for schema creation/import workflows and compatibility preferences. | Schema lifecycle settings |

#### Inheritance Model

- Project settings that are not explicitly set fall back to the global default from Section 6.8.
- Mapping-level overrides (Panel 7 in the Mapping Editor) take precedence over project settings.
- Inheritance chain: **Global (6.8) → Project (6.9) → Mapping (Panel 7)**.

#### States

| State      | Behavior                                                                            |
| ---------- | ----------------------------------------------------------------------------------- |
| Loading    | Skeleton rows while settings load                                                   |
| Default    | All settings showing inherited global values with "Using global default" indicators |
| Customized | Overridden settings shown with "Custom" badge and a "Reset to default" action       |
| Error      | Inline error banner with retry button                                               |

---

## 7. UI Responsibilities

This section defines what the UI owns versus what the backend owns. The boundary is clear: **the UI is a thick client that can do meaningful work offline/locally, and calls the backend only for AI, persistence, schema indexing/lifecycle operations, deployment, and server-side testing.**

### 7.1 Client-Side Responsibilities (No Backend Required)

| Responsibility | Description |
|---------------|-------------|
| **DSL rule authoring** | Create, edit, delete, reorder rules. Expression builder (guided + raw). Array configuration. Bulk behaviors. All edits happen in local state until explicit save. |
| **Schema browsing** | Parse and render JSON Schema / XSD as tree views. Expand/collapse, search, type indicators, required-field highlighting. Parsing happens client-side for responsiveness. |
| **Schema editing (user-owned)** | Inline editing of schema draft structure on the Schema Detail page: mark fields as required/optional, change field types, add/remove/rename fields, add descriptions. Draft save and version creation follow explicit lifecycle operations. CDM schemas remain read-only. |
| **Schema inference from sample data** | When a user uploads sample JSON or sample XML, the application infers a schema structure client-side. The inferred schema is flagged as "⚠ Inferred from sample data — may be incomplete" and can be refined via schema editing. |
| **DSL validation (inline)** | The mapping engine's `validate()` runs on every rule change. Inline errors with stable codes and user-friendly messages. No backend call. |
| **Preview & testing (client-side)** | Execute the mapping engine in-browser against the current working mapping config. Source data input → transformed output → diff → diagnostics → trace. Zero backend dependency. This is the TTFSM-critical hot path. |
| **Test case management** | Save input + expected output as named test cases. Run all, show pass/fail summary. Stored locally or persisted on save. |
| **Version history browsing** | Display version list, render diffs between versions, and initiate restore actions within the Mapping Editor's Version History panel. Version data is fetched from the backend, but diff rendering and navigation are client-side. |
| **Local storage (Phase 0)** | All projects, schemas, mappings, and test cases can be stored in `localStorage` / `IndexedDB`. Full offline capability for early iterations. |
| **Export & import** | Bundle mapping config + schema refs + test cases into `.keyra` files. Download/upload via browser. Copy/paste individual rules or expressions to clipboard for reuse across mappings. |
| **Mapping CRUD (local state)** | Create, edit, view, duplicate, and delete mappings within the UI's local state. Persistence is handled by the API client layer. |
| **Project & mapping settings** | Manage global settings, project-level settings, and mapping-level configuration overrides. Settings inheritance (global → project → mapping) is resolved client-side. Persistence is handled by the API client layer. |

### 7.2 Backend-Dependent Responsibilities

| Responsibility | Description |
|---------------|-------------|
| **Persistent storage** | Save/load projects, mappings, schemas to/from DynamoDB + S3 via API calls. |
| **Schema retrieval** | Fetch schemas, mappings, project metadata, and templates from the backend. |
| **Schema ingestion** | Upload a schema to the backend for parsing into tree nodes, embedding, and indexing. |
| **Server-side preview & testing** | Execute sample data against a deployed mapping in a specific environment by invoking that environment's generic mapping Lambda directly. The user selects an environment (DEV / PREPROD / PROD) and provides sample source data. KeyRa's backend calls the target environment's URL with the `mappingId` + `sourceData`. The environment's Lambda retrieves its own active snapshot and executes the mapping engine — the exact same code path that production traffic follows. Returns the transformed output + diagnostics. This lets users answer: "What would this payload look like if it went through the mapping currently deployed in PREPROD?" — without deploying or modifying anything. |
| **AI features** | All AI calls go through API Gateway → Lambda → GitHub Models. The UI never calls GitHub Models directly. Includes: auto-map, NL → DSL, explain rule, smart fix, AI validation, and AI-assisted field descriptions. |
| **Deployment** | Deploy, promote, and rollback actions call the backend to create/manage immutable snapshots and write them to target environment resources. |
| **GitHub operations** | CDM-only file listing/link/re-sync operations. Non-CDM user-schema publish/sync-to-GitHub is retired from canonical flows. |
| **Activity feed** | Fetch activity entries from the backend. Activity entries are written by backend Lambdas when actions occur (deployments, schema syncs, project creation, etc.) — the UI does not write activity entries directly. |

### 7.3 Client-Side vs Server-Side Preview

The Mapping Editor offers two preview modes. Both are accessible from Panel 5 (Preview & Testing).

| Mode | What it runs | Where it runs | Data source | When to use |
|------|-------------|---------------|-------------|-------------|
| **Client-side preview** | The mapping engine in-browser against the **current working config** (including unsaved changes). | Browser | Current editor state | Fast iteration during authoring. Default mode. < 2 seconds. |
| **Server-side preview** | The **actual environment's generic mapping Lambda** — the same Lambda that production traffic hits. | Target environment's infrastructure | Active snapshot in DEV / PREPROD / PROD | Validating that a specific environment produces the expected output. Verifying parity between what's deployed and what you expect. Debugging production issues with real payloads. |

**Server-side preview UX:**
1. User clicks "Run on Server" in the Preview & Testing panel.
2. An environment selector appears: DEV / PREPROD / PROD (only environments with an active deployment are selectable).
3. User provides sample source data (paste, upload, or load test case).
4. KeyRa's backend invokes the selected environment's generic mapping Lambda URL with `{ mappingId, sourceData }`. This is the exact same code path that production Step Functions use.
5. Output appears alongside the source data, with the same diff and diagnostics views as client-side preview.
6. A label indicates which environment and snapshot version produced the output: "Output from PREPROD (v5, deployed 2026-04-20)."

**Key distinction:** Client-side preview tests what you're *building*. Server-side preview tests what's *deployed* — by calling the actual production infrastructure. They may produce different results if the working config has diverged from the deployed snapshot.

**Why invoke the environment Lambda directly (not a separate copy):**
- Validates the real production path: same Lambda, same DynamoDB, same S3, same engine version.
- No parity risk from a separate copy of the engine with potentially different configuration.
- If the environment's Lambda has a bug or misconfiguration, the preview catches it.

### 7.4 Absolute Constraints

- **No API keys in the browser.** All secrets (GitHub tokens, AI API keys) live in Lambda environment variables or AWS Secrets Manager.
- **AI suggestions are never auto-committed.** Every AI output must be explicitly accepted by the user before becoming a real mapping rule or schema description.
- **The mapping engine has zero cloud dependencies.** It is a pure TypeScript library that knows nothing about UI, APIs, storage, or AI. It runs identically in the browser and in Lambda.
- **Save ≠ Deploy.** These are always separate actions. No implicit deployment on save.
- **Schema lifecycle actions are explicit.** Editing a schema does not automatically create immutable versions or update mapping pins. CDM re-sync remains explicit and user-owned schema lifecycle is KeyRa-native.

---

## 8. Data Retrieval & API Client Layer

### 8.1 Architecture

The UI uses a typed TypeScript service layer (`ApiAdapter` interface) that abstracts all backend communication. Components never call `fetch()` directly — they call methods on the adapter.

Two adapter implementations share the same interface:

- **`LocalStorageAdapter`** — Phase 0. All reads/writes go to browser storage. AI methods throw "not available."
- **`HttpAdapter`** — Phase 1+. All reads/writes go through API Gateway. Handles auth headers (future), error normalization, retry logic, and caching.

The active adapter is selected at bootstrap based on configuration (`VITE_API_URL` environment variable). Components are unaware of which adapter is active.

### 8.2 ApiAdapter Interface

```typescript
interface ApiAdapter {
  // ── Schemas ──────────────────────────────────
  listSchemas(): Promise<SchemaMetadata[]>;
  getSchema(id: string): Promise<SchemaDetail>;
  createSchema(input: CreateSchemaInput): Promise<SchemaMetadata>;
  deleteSchema(id: string): Promise<void>;

  // ── Mappings ─────────────────────────────────
  listMappings(projectId: string): Promise<MappingMetadata[]>;
  getMapping(id: string): Promise<MappingConfig>;
  createMapping(input: CreateMappingInput): Promise<MappingMetadata>;
  updateMapping(id: string, config: MappingConfig): Promise<MappingMetadata>;
  deleteMapping(id: string): Promise<void>;
  duplicateMapping(id: string, newName: string): Promise<MappingMetadata>;

  // ── Projects ─────────────────────────────────
  listProjects(): Promise<ProjectMetadata[]>;
  getProject(id: string): Promise<ProjectDetail>;
  createProject(input: CreateProjectInput): Promise<ProjectMetadata>;
  updateProject(id: string, input: UpdateProjectInput): Promise<ProjectMetadata>;
  deleteProject(id: string): Promise<void>;

  // ── Templates ────────────────────────────────
  listTemplates(): Promise<TemplateMetadata[]>;
  getTemplate(id: string): Promise<TemplateDetail>;

  // ── Deployment ───────────────────────────────
  getDeploymentContext(mappingId: string): Promise<DeploymentContext>;
  deploy(mappingId: string, environment: Environment): Promise<DeploymentRecord>;
  promote(mappingId: string, from: Environment, to: Environment): Promise<DeploymentRecord>;
  rollback(mappingId: string, environment: Environment, targetVersion: number): Promise<DeploymentRecord>;
  getDeploymentDiff(mappingId: string, fromVersion: number, toVersion: number): Promise<DeploymentDiff>;

  // ── GitHub: CDM Repo (read-only) ─────────────
  listCdmSchemas(path?: string): Promise<GitHubFile[]>;
  linkCdmSchema(input: LinkCdmSchemaInput): Promise<SchemaMetadata>;
  syncCdmSchema(schemaId: string): Promise<SchemaSyncResult>;

  // ── Schema lifecycle (user-owned, KeyRa-native) ─────────────
  saveSchemaDraft(schemaId: string, input: SaveSchemaDraftInput): Promise<SchemaDraftResult>;
  createSchemaVersion(schemaId: string, input: CreateSchemaVersionInput): Promise<CreateSchemaVersionResult>;
  listSchemaVersions(schemaId: string): Promise<SchemaVersionSummary[]>;
  compareSchemaVersions(schemaId: string, fromVersion: number, toVersion: number): Promise<SchemaVersionDiff>;
  restoreSchemaDraftFromVersion(schemaId: string, version: number): Promise<SchemaDraftResult>;

  // ── AI ───────────────────────────────────────
  autoMap(input: AutoMapInput): Promise<AutoMapResult>;
  suggestExpression(input: SuggestExpressionInput): Promise<SuggestExpressionResult>;
  explainRule(input: ExplainRuleInput): Promise<string>;
  smartFix(input: SmartFixInput): Promise<SmartFixResult>;
  validateMappings(input: ValidateMappingsInput): Promise<ValidationReport>;

  // ── Schema Search ──────────────���─────────────
  querySchemaNodes(schemaId: string, query: string): Promise<SchemaSearchResult[]>;

  // ── Activity ─────────────────────────────────
  listActivity(projectId?: string, limit?: number): Promise<ActivityEntry[]>;
  
  // ── Preview ──────────────────────────────────────
  previewOnServer(mappingId: string, input: ServerPreviewInput): Promise<ServerPreviewResult>;

interface ServerPreviewInput {
  environment: Environment;        // "DEV" | "PREPROD" | "PROD"
  sourceData: Record<string, any>; // Sample payload
}

interface ServerPreviewResult {
  output: Record<string, any>;     // Transformed data
  diagnostics: Diagnostic[];       // Warnings and errors
  metadata: {
    environment: Environment;
    snapshotVersion: number;
    deployedAt: string;            // ISO 8601
    engineVersion: string;
  };
}
```

### 8.3 UI State Management

Every data-fetching component uses a generic async state wrapper:

```typescript
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T; updatedAt: Date }
  | { status: 'error'; error: AppError; retryable: boolean }
  | { status: 'stale'; data: T; refreshing: boolean };
```

Optimistic updates: on save, the UI updates local state immediately, then confirms with the backend. On failure, it rolls back and shows an error notification.

---

## 9. Mapping Engine

### 9.1 Overview

The mapping engine is a **pure TypeScript library** with zero dependencies on UI frameworks, cloud services, or storage. It defines the KeyRa DSL, parses mapping configs, validates rules, executes transformations, and produces output with diagnostics.

The same library is:
- **Bundled into the UI** for client-side preview and testing.
- **Deployed in Lambda** for production transformation execution.
- **Tested independently** with unit tests and fixture tests.

### 9.2 Pipeline

```
Caller resolves schema refs from MappingConfig.sourceSchemaRef / targetSchemaRef
  → Fetches actual schema content (from cache, S3, localStorage, etc.)
  → Passes resolved schemas into the engine

         │
         ▼

Engine Input: MappingConfig + SourceSchema + TargetSchema + SourceData
         │
         ▼
    ┌─────────┐
    │  Parse   │  Deserialize mapping config JSON into internal representation.
    │          │  Normalize rule formats.
    └────┬────┘
         │
         ▼
    ┌──────────┐
    │ Validate  │  Check all rules for: valid DSL syntax, valid source paths
    │           │  against source schema (KEYRA-E030), valid target paths
    │           │  against target schema (KEYRA-E031), type compatibility
    │           │  between expression output types and target field types,
    │           │  array context consistency.
    │           │  Produce diagnostics with stable error codes + rule locations.
    │           │  Compute coverage: % of required target fields with a mapping rule.
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │ Execute   │  Apply rules to source data. Evaluate DSL expressions.
    │           │  Handle arrays, conditionals, type conversions, defaults.
    │           │  Apply bulk behaviors against target schema:
    │           │    - Unmapped target fields → null / omit / error (per config).
    │           │    - Null-out subtree: set all descendants of specified target
    │           │      paths to null.
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │ Output    │  Transformed data (JSON object) + Diagnostics array.
    │           │  Optional: execution trace (which rule, what input, what output).
    │           │  Optional: coverage report (mapped / unmapped / errored fields).
    └──────────┘
```

The engine is a **pure function** — it receives all inputs, performs no I/O, and returns all outputs. Schema resolution (fetching content from S3, DynamoDB, localStorage, or cache using the refs in the mapping config) is the caller's responsibility. This ensures the engine runs identically in the browser and in Lambda.

### 9.3 Capabilities

| Capability                          | Description                                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source path → target path rules** | Map a value from a source location to a target location.                                                                                                                     |
| **Transforms**                      | Cast (type conversion), string manipulation, number operations, date parse/format, defaults, null coalescing.                                                                |
| **Conditionals**                    | If/then/else logic within expressions.                                                                                                                                       |
| **Arrays**                          | Map items (transform each element), flatten/unflatten, filter, index selection.                                                                                              |
| **Bulk behaviors**                  | "Unmapped targets → null" (or omit, or error). "Null-out subtree" for specified target path prefixes. Configurable at the mapping level.                                     |
| **Diagnostics**                     | Every warning or error has: a stable code (e.g., `KEYRA-E001`), the rule index and target path that triggered it, a BA-friendly message, and a severity level.               |
| **Trace mode**                      | Optional execution trace that records: each rule evaluated, the input data it received, the expression evaluated, and the output produced. Used for debugging in the editor. |

### 9.4 Mapping Config Format

The mapping config is a versioned JSON document:

```json
{
  "name": "Invoice Header Mapping",
  "version": 7,
  "engineVersion": "2.0.0",
  "sourceSchemaRef": {
    "schemaId": "abc123",
    "schemaVersion": 4,
    "schemaVersionId": "e2d9d786-61df-4c12-9e09-2b8843cf78c4",
    "contentHash": "sha256:3f6e..."
  },
  "targetSchemaRef": {
    "schemaId": "xyz789",
    "schemaVersion": 7,
    "schemaVersionId": "d12f7e6c-f74a-4a96-a6fb-849fa867e4f5",
    "contentHash": "sha256:8a2b..."
  },
  "config": {
    "unmappedTargets": "null",
    "nullSubtrees": ["Order.Parties.BillTo"],
    "constants": { "COMPANY_CODE": "ACME" },
    "externalSources": ["carrierLookup"]
  },
  "rules": [
    {
      "target": "Order.Header.DocumentType",
      "type": "string",
      "expression": "if(lt(source(\"InvoiceAmount\"), 0), \"CreditMemo\", \"Invoice\")"
    },
    {
      "target": "Order.Header.DocumentDate",
      "type": "string",
      "expression": "formatDate(source(\"InvDate\"), \"MM/DD/YYYY\", \"YYYY-MM-DD\")"
    }
  ]
}
```

> **Note:** The full DSL specification is defined in a separate document (Section 10 provides an overview). The engine implements whatever the DSL spec defines.

> **Note:** External source resolution at runtime (how the generic mapping Lambda resolves declared external sources into actual values — e.g., DynamoDB lookup, Lambda invocation, Step Function input passthrough) is deferred to a dedicated specification. The engine's contract is that `externalSources` is a resolved key-value map provided by the caller. How the caller populates that map is an infrastructure concern outside the engine's scope.

---

## 10. KeyRa DSL

### 10.1 Overview

The KeyRa DSL is a declarative expression language for defining data transformation rules. It is designed to be:

- **Readable by users** — function names are descriptive English words, not symbols.
- **Parseable by machines** — deterministic grammar, JSON-serializable.
- **Generatable by AI** — the syntax reference fits within an LLM prompt and produces valid expressions.

### 10.2 Expression Types (Summary)

| Expression         | Example                                                     | Description                                                                                                                                                                                                                                                                                                         |     |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| Direct source path | `source("InvoiceDate")`                                     | Read a value from the source data.                                                                                                                                                                                                                                                                                  |     |
| Static value       | `static("ACME-CORP")`                                       | A hardcoded constant.                                                                                                                                                                                                                                                                                               |     |
| Type cast          | `cast(source("Amount"), "string")`                          | Convert a value to a different type. `targetType` is one of `"string"`, `"number"`, `"boolean"` — treated as an enum in the engine's TypeScript implementation and the expression builder UI (dropdown, not free text), though represented as a string literal in the DSL grammar to preserve syntactic simplicity. |     |
| Default            | `default(source("Currency"), "USD")`                        | Use a fallback if the source value is null/missing.                                                                                                                                                                                                                                                                 |     |
| Null coalesce      | `coalesce(source("ShipDate"), source("OrderDate"))`         | First non-null value from a list.                                                                                                                                                                                                                                                                                   |     |
| Conditional        | `if(lt(source("Amount"), 0), "CreditMemo", "Invoice")`      | If/then/else logic.                                                                                                                                                                                                                                                                                                 |     |
| String operations  | `concat(source("First"), " ", source("Last"))`              | Concatenation, substring, upper/lower, trim, replace.                                                                                                                                                                                                                                                               |     |
| Date operations    | `formatDate(source("InvDate"), "MM/DD/YYYY", "YYYY-MM-DD")` | Parse and reformat dates.                                                                                                                                                                                                                                                                                           |     |
| Array map          | `map(source("LineItems"), { "SKU": item("ProductCode") })`  | Transform each element of a source array.                                                                                                                                                                                                                                                                           |     |
| Array filter       | `filter(source("Lines"), gt(item("Amount"), 0))`            | Select array elements matching a condition.                                                                                                                                                                                                                                                                         |     |
| External source    | `external("carrierLookup")`                                 | Reference a value injected at runtime.                                                                                                                                                                                                                                                                              |     |
| Constant reference | `constant("COMPANY_CODE")`                                  | Reference a mapping-level constant.                                                                                                                                                                                                                                                                                 |     |

### 10.3 Full DSL Specification

The complete DSL grammar, function catalog, type system, and error codes are defined in a separate document: `specs/KEYRA-DSL-SPECIFICATION.md`. The mapping engine implements this specification. The AI prompt registry includes the DSL reference so that GitHub Models generates valid KeyRa DSL expressions.

FS-105 note: DSL expression grammar remains unchanged. The mapping configuration schema-reference contract is updated to immutable version pinning (`schemaVersion`, `schemaVersionId`, `contentHash`).

---

## 11. Schema Management Lifecycle (FS-105)

### 11.1 FS-105 superseding note

This section supersedes prior non-CDM publish/sync-to-GitHub contracts for user-owned schemas.

- User-owned schemas are KeyRa-managed lifecycle entities (DynamoDB/S3 source of truth).
- Non-CDM user-schema publish/sync-to-GitHub behavior is retired from canonical product behavior.
- CDM GitHub integration remains read-only and is not changed by FS-105.

### 11.2 Canonical schema lifecycle model

User-owned schemas follow schema-family lifecycle semantics:

1. Create/import schema family → mutable draft.
2. Save draft revisions (no new immutable version unless content changed and user explicitly versions).
3. Create immutable versions (`v1+`) explicitly.
4. Mapping refs pin immutable versions; no automatic upgrades.
5. Archive/deprecate lifecycle controls manage selection/visibility without breaking existing pinned mappings.

### 11.3 CDM model (unchanged in principle)

CDM schemas remain external read-only assets:

- KeyRa reads from CDM repo, never writes.
- Re-sync pulls upstream changes and creates immutable new KeyRa versions.
- Existing mapping pins remain unchanged until explicit upgrade flow is completed.

### 11.4 Deployment snapshot schema references

When a mapping is deployed, the deployment snapshot locks immutable schema references:

```json
{
  "sourceSchemaRef": {
    "schemaId": "abc123",
    "schemaVersion": 4,
    "schemaVersionId": "e2d9d786-61df-4c12-9e09-2b8843cf78c4",
    "contentHash": "sha256:3f6e..."
  },
  "targetSchemaRef": {
    "schemaId": "xyz789",
    "schemaVersion": 7,
    "schemaVersionId": "d12f7e6c-f74a-4a96-a6fb-849fa867e4f5",
    "contentHash": "sha256:8a2b..."
  }
}
```

Runtime executes against immutable snapshot/artifact references and does not resolve mutable latest schema state.

### 11.5 Mapping DSL compatibility boundary

FS-105 does not change DSL expression grammar. It changes mapping configuration schema-reference contracts to immutable version pinning semantics.



---

## 12. Deployment Workflow

### 12.1 Concepts

| Concept | Definition |
|---------|-----------|
| **Version** | An explicit immutable mapping version selected for DEV deployment (`v1`, `v2`, `v3` …). |
| **Artifact** | Immutable deployment bundle identity (`artifactId` + `artifactHash`) produced from canonical bundle bytes. Includes mapping config + immutable dependency/runtime metadata. |
| **Environment** | One of: `DEV`, `PREPROD`, `PROD`. Each runtime environment has an active artifact pointer. |
| **Deploy** | Start async DEV deployment from selected immutable mapping version. |
| **Promote** | Start async promotion of the currently active artifact (`DEV → PREPROD`, `PREPROD → PROD`) with no artifact rebuild. |
| **Rollback** | Start async rollback to a retained eligible historical artifact in a target environment. |
| **Operation** | Async deployment control-plane lifecycle record (`operationId`) with separated `operationType`, `operationStatus`, and `operationStage`. |
| **Freshness** | Read-model freshness state per environment: `NOT_DEPLOYED`, `CURRENT`, `STALE`. Distinct from operation failure state. |

### 12.2 Runtime and control-plane authority

- **Runtime authority (execution truth):** active artifact pointer, runtime-local artifacts/history, runtime operation outcome.
- **Control-plane authority (orchestration/read model):** operation coordination, global/project deployment summaries, reconciliation/repair workflows.
- Runtime active pointer is authoritative for execution behavior; projection rows are eventually consistent UX read models.

### 12.3 Canonical mutation + operation API model

All mutation endpoints are async and return `202 Accepted` with operation envelope. `Idempotency-Key` is required.

| Endpoint | Purpose |
|---|---|
| `POST /mappings/:id/deployments` | Start DEV deploy operation (version-only) |
| `POST /mappings/:id/promotions` | Start promotion operation |
| `POST /mappings/:id/rollbacks` | Start rollback operation |
| `POST /deployment-operations/:id/retry` | Start retry operation linked by `retryOfOperationId` |
| `GET /deployment-operations/:id` | Poll operation status/stage/outcome |

UI behavior contract:

- Poll by `operationId`.
- Persist active operation reference and resume polling after refresh/navigation.
- Distinguish operation outcome from freshness summary.

### 12.4 Promotion, rollback, and reason policy

- Deployment path is `DEV → PREPROD → PROD`.
- PREPROD/PROD are promotion-only targets.
- Promotion reuses exact artifact identity/bytes/hash.
- Rollback is pointer-based to retained eligible artifact.

Reason requirements:

- DEV deployment: optional
- DEV → PREPROD promotion: optional
- PREPROD → PROD promotion: required
- Rollback (all environments): required
- Retry: optional

### 12.5 Projection-backed overview surfaces

- Global route: `/deployments` (read-only overview + drill-down)
- Project route: `/projects/:projectId/deployments` (read-only overview + drill-down)
- Mapping route: `/projects/:projectId/mappings/:mappingId/deploy` (only mutating surface)

Overview surfaces read from projection-backed summaries and support full-population filter/sort/pagination semantics.

### 12.6 Reconciliation and retention contracts

Reconciliation:

- Required for timeout/partial-failure/projection-mismatch outcomes.
- Control plane reconciles runtime authority to operation + projection state.
- Target: projection/runtime mismatch reconciled within 5 minutes.

Retention cleanup:

- Scheduled cleanup workflow enforces per-environment retention:
  - DEV: 20 successful activations
  - PREPROD: 20
  - PROD: 50
- Cleanup never removes active/in-progress/protected artifacts.
- Environment-local copy independence is preserved (obsolete DEV local copy may be removed while same artifact identity remains active in PROD).

---

## 13. AI Capabilities

### 13.1 Provider

All AI features use **GitHub Models** (`https://models.github.ai/inference`) via the **OpenAI SDK**. The UI never calls this endpoint directly — all calls go through API Gateway → Lambda.

### 13.2 Models

| Tier | Model | Use Cases | Characteristics |
|------|-------|-----------|-----------------|
| **Tier 1 (Router/Fast)** | `openai/gpt-4.1-mini` | Classify source fields, identify relevant target sections, NL → expression, explain rule, AI-assisted field descriptions | Fast, cheap, good at classification and short-form generation |
| **Tier 2 (Reasoning)** | `openai/gpt-4.1` | Generate precise DSL mapping rules, smart fix, full validation analysis | Capable, slower, used only with focused context |
| **Embeddings** | `text-embedding-3-small` | Generate vectors for schema node descriptions during ingestion | 1536-dimension vectors, batch support |

### 13.3 AI Features

#### Auto-Map

- **Trigger:** User clicks "Auto-Map" on the Mapping Editor.
- **Input:** Source schema, target schema, business context (optional).
- **Process:** RAG pipeline retrieves relevant source schema sections for each target section → Tier 2 generates DSL rules per section → merge + validate with engine's `validate()`.
- **Output:** Array of suggested DSL mapping rules.
- **UX:** Suggestions appear with ✨ badges. User reviews each: accept, edit, or dismiss. "Accept All" available with confirmation.
- **Post-generation validation:** Every generated expression is run through the engine's `validate()` before being shown to the user. Expressions that fail validation are flagged with an inline error and a "Fix" button.

#### Natural Language → Rule

- **Trigger:** User types a natural language instruction (e.g., "default currency to USD if missing").
- **Input:** Instruction text, available source fields (via RAG retrieval), target field.
- **Process:** Tier 1 LLM call with DSL syntax reference + retrieved source field context.
- **Output:** A single DSL expression string.
- **UX:** Suggestion shown with preview of what it would produce. Accept or edit.

#### Explain Rule

- **Trigger:** User selects a rule and clicks "Explain."
- **Input:** Target field path, DSL expression.
- **Process:** Tier 1 LLM call.
- **Output:** Plain-English explanation (1–2 sentences).
- **UX:** Shown in a tooltip or inline panel.

#### Smart Fix

- **Trigger:** Preview shows an error. User clicks "Fix" on the affected rule.
- **Input:** Failing expression, error message (including stable error code), source schema context (via RAG retrieval).
- **Process:** Tier 2 LLM call with the error diagnostic, the failing expression, and relevant schema context.
- **Output:** Corrected DSL expression + explanation of what was wrong and what changed.
- **UX:** Suggestion shown with before/after comparison. Accept or edit. After accepting, user can verify the fix via client-side preview or server-side preview against a deployed environment.

#### AI Validation

- **Trigger:** User clicks "Validate with AI."
- **Input:** Full mapping config, business context, source/target schemas (via RAG retrieval), sample data (optional).
- **Process:** Tier 2 LLM call with structured output format.
- **Output:** Validation report: issues (with severity, affected rule, description, recommendation), metrics, suggested improvements.
- **UX:** Report displayed as a sortable table with links to affected rules.

#### AI-Assisted Field Descriptions

- **Trigger:** User clicks "Auto-describe fields" on the Schema Detail page (Section 6.7).
- **Input:** Field names, types, paths, and structural context for all fields in the schema.
- **Process:** Tier 1 LLM call. Fields are batched if the schema is large.
- **Output:** A human-readable description for each field based on naming conventions and structure (e.g., `postalCode` → "The ZIP or postal code of the address").
- **UX:** Descriptions appear as suggestions — the user reviews and accepts, edits, or dismisses each one before they are saved. Better field descriptions improve downstream auto-map accuracy since RAG embedding text includes field descriptions.

### 13.4 RAG (Retrieval-Augmented Generation) for All Schemas

All AI features that operate on schemas use the RAG pipeline — regardless of schema size. This is a single code path with no branching logic. For small schemas, the retriever returns all chunks (top-K ≥ total nodes), making it equivalent to a direct prompt with the full schema.

#### Schema Ingestion (Retrieval Preparation)

When a schema is uploaded or synced, it is processed into retrieval-ready `SchemaNode` records:

1. **Parse** the schema (JSON Schema or XSD) into a tree.
2. **Chunk** by object boundaries: each object with properties becomes a node. Array items become child nodes. Leaf fields are included in their parent node.
3. **Generate embedding text** for each node: a natural-language description including the node's path, field names, types, and descriptions (including AI-generated descriptions from Section 6.7 if available).
4. **Embed** using `text-embedding-3-small` via GitHub Models.
5. **Store** nodes in DynamoDB with lexical retrieval signals (`fieldNameNormalized`, `pathTokens`, `type`, `depth`) plus optional per-node embedding vectors for bounded rerank.

#### Retrieval at Mapping Time (DynamoDB-Only)

1. For each target section to map, normalize the query text and optional query embedding.
2. **Lexical candidate generation** from DynamoDB retrieval signals with deterministic cap (`lexicalCap`).
3. **Optional in-Lambda rerank** over capped candidates when embeddings are available (`rerankCap`).
4. **Enrich with structural context** from DynamoDB: bounded parent/sibling/children expansion (`contextExpansionCap`).
5. **Assemble focused prompt** with deterministic top-K + bounded context and generate mapping rules via Tier 2 LLM.

#### Runtime Modes, Cutover, and Rollback Posture

- `RAG_RETRIEVER=dynamodb` is the canonical and only supported serving mode after FS-091 cutover.
- Historical cutover validation used offline parity/latency gates (Jaccard@10 and NDCG@10 delta) captured in FS-091 benchmark artifacts.
- `opensearch` and `shadow` are decommissioned runtime modes; production rollback posture is to tune Dynamo caps/guards and use benchmark evidence, not to re-enable OpenSearch in serving paths.

#### Cost & Scaling Assumptions (FS-091)

| Dimension | Baseline (pre-cutover assumption) | Post-cutover model | Review cadence |
|---|---|---|---|
| Retrieval infrastructure fixed cost | OpenSearch Serverless always-on baseline (~$10-25/month, low usage) | OpenSearch removed from runtime stack; fixed OpenSearch retrieval cost = $0 in serving path | Monthly cost review |
| Retrieval variable cost | OpenSearch query + index operations | DynamoDB read/write + Lambda compute for lexical retrieval and bounded rerank | Monthly cost review |
| Quality guardrail | Baseline suggestion acceptance rate | Post-cutover acceptance-rate drop must remain <= 10% | Two-week post-cutover then monthly |
| Latency guardrail | Historical OpenSearch-era reference | Dynamo p95 targets: small <300ms, medium <800ms, large <1500ms | Two-week post-cutover then monthly |

Reconsider dedicated search infrastructure only if sustained thresholds are exceeded (for example: repeated p95 misses by schema tier, acceptance-rate drop >10%, or Dynamo/Lambda retrieval spend exceeding projected run-rate bands for multiple reviews).

#### Why RAG for All Sizes

| Schema Size | RAG Behavior | Benefit |
|-------------|-------------|---------|
| Small (< 100 fields) | Top-K may return all chunks. Effectively full-schema prompt. | Same code path. No branching. Embedding text enriches prompt context. |
| Medium (100–500 fields) | Top-K returns most chunks. Some low-relevance sections omitted. | Reduces noise. Keeps prompt focused. |
| Large (500–23k fields) | Top-K returns only the most relevant sections. | Fits within context window and latency targets. |

### 13.5 DSL-Aware Prompting

Every AI prompt includes the KeyRa DSL syntax reference so the model generates valid DSL expressions, not JSONata or arbitrary code. The DSL reference is injected into the system message of every AI call.

### 13.6 Structured Output

All AI features that produce machine-parseable results (auto-map, NL → rule, smart fix) use the OpenAI SDK's structured output mode (JSON mode with a defined schema). This ensures:
- Responses are valid JSON that the UI can parse without error handling for malformed output.
- The response schema defines the expected fields (e.g., `expression`, `explanation`, `confidence`).
- Responses that don't conform to the schema are rejected at the SDK level.

Example response schema for auto-map:
```json
{
  "rules": [
    {
      "target": "Order.Header.DocumentType",
      "expression": "if(lt(source(\"InvoiceAmount\"), 0), \"CreditMemo\", \"Invoice\")",
      "explanation": "Sets document type based on whether the invoice amount is negative",
      "confidence": "high"
    }
  ]
}
```

### 13.7 AI UX Pattern

All AI features follow a consistent interaction pattern:

1. **Request:** User triggers an AI action (button click or text input).
2. **Loading:** Loading indicator with context ("Generating mapping suggestions...").
3. **Review:** Results appear as suggestion cards — visually distinct from committed rules.
4. **Accept / Edit / Dismiss:** User explicitly acts on each suggestion. "Accept All" is available for batch operations but requires confirmation.
5. **Never auto-commit:** No AI output becomes a real mapping rule or schema description without explicit user action.

### 13.8 Prompt Registry

All prompts are managed in a centralized **prompt registry** — a versioned collection of prompt templates that each AI Lambda reads at execution time. This enables:
- **Version tracking:** Each prompt has a version number. Changes are tracked.
- **Rollback:** If a prompt change degrades quality, revert to the previous version.
- **A/B testing (future):** Route a percentage of requests to a new prompt version and compare acceptance rates.
- **Separation of concerns:** Prompt text lives outside Lambda code. Updating a prompt does not require a Lambda deployment.

#### Prompt Registry Structure

Each prompt entry contains:

| Field | Description |
|-------|-------------|
| `promptId` | Unique identifier (e.g., `auto-map`, `nl-to-rule`, `explain-rule`, `smart-fix`, `ai-validate`, `describe-fields`) |
| `version` | Integer, auto-incremented on change |
| `systemMessage` | The system prompt (includes DSL reference, role instructions, output format) |
| `userMessageTemplate` | The user message template with placeholders (e.g., `{{sourceContext}}`, `{{targetField}}`, `{{instruction}}`) |
| `model` | Which tier/model to use |
| `temperature` | Always `0` for deterministic output |
| `responseSchema` | JSON Schema defining the expected structured output |
| `maxTokens` | Response length limit |
| `updatedAt` | Timestamp |
| `updatedBy` | Who changed the prompt |

Storage: DynamoDB table (`PromptRegistry`) or a versioned JSON file in S3. For Phase 2, a DynamoDB table is simpler. Prompts are cached in Lambda memory with a short TTL (5 min) to avoid reading from DynamoDB on every AI call.

---

## 14. Backend Architecture

### 14.1 Overview

```
┌─────────┐     ┌──────────────────┐     ┌──────────────────────┐
│ Amplify │────▶│  API Gateway     │────▶│  Lambda Functions    │
│ (React) │     │                  │     │                      │
└─────────┘     └──────────────────┘     │  Schema Lambdas      │
                                         │  AI Lambdas          │
                                         │  Project Lambdas     │
                                         │  Deploy Lambdas      │
                                         │  GitHub Lambdas      │
                                         └──────┬───────────────┘
                                                │
                    ┌───────────────────────────┼──────────────┐
                    │                           │              │
                    ▼                           ▼              ▼
   ┌──────────────────────┐  ┌──────────────────┐  ┌──────────────┐
   │  DynamoDB            │  │  S3              │  │  GitHub      │
   │  (tree, metadata,    │  │  (schema content,│  │  Models      │
   │   projects, deploys, │  │   snapshots,     │  │  (LLM +      │
   │   mapping memory)    │  │   large files)   │  │   embeddings)│
   └──────────────────────┘  └──────────────────┘  └──────────────┘
                    │                                       │
                    ▼                                       ▼
   ┌──────────────────────┐              ┌──────────────────────┐
   │  DynamoDB Retrieval  │              │  GitHub API          │
   │  Signals + Rerank    │              │  (CDM repo read-only │
   │  (in Lambda runtime) │              │   ingestion)         │
   └──────────────────────┘              └──────────────────────┘

   ┌──────────────────────────────────────────────────────────┐
   │  Step Functions                                          │
   │  (large schema ingestion, full auto-map orchestration)   │
   └──────────────────────────────────────────────────────────┘
```

### 14.2 Service Responsibilities

| Service | Role |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AWS Amplify** | Hosts the React/TS/Vite frontend. Static site deployment. |
| **API Gateway** | Single entry point. Routes requests to Lambdas. Request validation, throttling, CORS. Future: Cognito authorizer for auth. |
| **Lambda** | Business logic. One function per concern. Handles: schema CRUD, mapping CRUD, project CRUD, AI orchestration, deployment management, GitHub API calls, and bounded retrieval rerank logic. |
| **DynamoDB** | Primary data store. Tree structure for schema nodes and retrieval signals, project/mapping metadata, deployment records, mapping memory (for RAG reuse). On-demand pricing. |
| **S3** | Bulk storage for objects exceeding DynamoDB's 400KB limit: full schema content, deployment snapshots, project export bundles, large test case data. |
| **Step Functions** | Orchestrates long-running operations that exceed Lambda's 29s API Gateway timeout: large schema ingestion (23k fields → parse → retrieval-ready write) and full auto-map on large schemas (parallel chunk processing). |
| **GitHub Models** | LLM inference and embeddings. Called by Lambdas only. Provides Tier 1 (gpt-4.1-mini), Tier 2 (gpt-4.1), and embeddings (text-embedding-3-small). |
| **GitHub API** | Accessed by Lambdas for CDM schema read-only ingestion flows. Non-CDM user-schema lifecycle is KeyRa-native and does not require publish/sync-to-GitHub. Authentication via GitHub App token or PAT stored in Secrets Manager. |

### 14.3 Lambda Functions

#### Schema Lambdas

| Lambda             | Trigger                   | Responsibility                                                                                                                                                                                        |
| ------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingestSchema`     | `POST /schemas`           | Receives schema content. Parses into tree nodes. For small schemas (< 500 fields): processes inline and writes retrieval-ready nodes to DynamoDB. For large schemas: starts Step Function, returns execution ARN. |
| `getSchema`        | `GET /schemas/:id`        | Returns schema metadata + content from DynamoDB/S3. |
| `deleteSchema`     | `DELETE /schemas/:id`     | Removes schema nodes from DynamoDB and removes content from S3. |
| `querySchemaNodes` | `POST /schemas/:id/query` | DynamoDB lexical retrieval with optional bounded embedding rerank and structural context enrichment from DynamoDB. |

#### AI Lambdas

All AI Lambdas read their prompt configuration (system message, user message template, model, temperature, response schema) from the **Prompt Registry** (DynamoDB) at execution time. Prompts are cached in Lambda memory with a 5-minute TTL to avoid reading from DynamoDB on every call. This means prompt updates take effect without redeploying Lambdas.

| Lambda                        | Trigger                       | Prompt ID         | Responsibility                                                                                                                                                                                   |
| ----------------------------- | ----------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kbx-keyra-automap`           | `POST /ai/auto-map`           | `auto-map`        | RAG retrieval of relevant source sections → Tier 2 generates DSL rules per section → merge + validate with engine's `validate()`. Large schemas use Step Function for parallel chunk processing. |
| `kbx-keyra-suggestexpression` | `POST /ai/suggest-expression` | `nl-to-rule`      | Tier 1 LLM call: natural language instruction + retrieved source field context → single DSL expression.                                                                                          |
| `kbx-keyra-explainrule`       | `POST /ai/explain-rule`       | `explain-rule`    | Tier 1 LLM call: DSL expression → plain-English explanation (1–2 sentences).                                                                                                                     |
| `kbx-keyra-smartfix`          | `POST /ai/smart-fix`          | `smart-fix`       | Tier 2 LLM call: failing expression + error diagnostic (stable code + message) + retrieved source context → corrected expression + explanation.                                                  |
| `kbx-keyra-validatemappings`  | `POST /ai/validate-mappings`  | `ai-validate`     | Tier 2 LLM call: full mapping config + schemas (via RAG) + sample data → structured validation report.                                                                                           |
| `kbx-keyra-describefeilds`    | `POST /ai/describe-fields`    | `describe-fields` | Tier 1 LLM call: field names, types, paths, structural context → human-readable description per field. Fields batched if schema is large.                                                        |

#### Project/Mapping Lambdas

| Lambda | Trigger | Responsibility |
|--------|---------|---------------|
| `createProject` | `POST /projects` | Creates project record in DynamoDB. |
| `getProject` | `GET /projects/:id` | Returns project metadata + references. |
| `listProjects` | `GET /projects` | Returns all projects with metadata. |
| `updateProject` | `PUT /projects/:id` | Updates project metadata. |
| `createMapping` | `POST /mappings` | Creates mapping config in DynamoDB + S3. |
| `getMapping` | `GET /mappings/:id` | Returns mapping config. |
| `updateMapping` | `PUT /mappings/:id` | Updates mapping config. Increments version. |
| `deleteMapping` | `DELETE /mappings/:id` | Removes mapping from DynamoDB + S3. |

#### Deployment Lambdas

| Lambda | Trigger | Responsibility |
|--------|---------|---------------|
| `getDeployContext` | `GET /mappings/:id/deploy-context` | Aggregates deployment bootstrap context: mapping/project metadata, environment states, and active operation references. |
| `startDeployOperation` | `POST /mappings/:id/deployments` | Validates version-only DEV deploy contract and starts async deploy operation (`202`). |
| `startPromotionOperation` | `POST /mappings/:id/promotions` | Validates sequential promotion contract and starts async promotion operation (`202`). |
| `startRollbackOperation` | `POST /mappings/:id/rollbacks` | Validates rollback contract (reason required) and starts async rollback operation (`202`). |
| `retryDeploymentOperation` | `POST /deployment-operations/:id/retry` | Starts retry operation linked to prior operation via `retryOfOperationId`. |
| `getDeploymentOperation` | `GET /deployment-operations/:id` | Returns operation status/stage/outcome payload for polling/resume UX. |
| `listDeployments` | `GET /deployments` | Returns projection-backed global deployment summaries (full-population filter/sort/pagination). |
| `listProjectDeployments` | `GET /projects/:id/deployments` | Returns projection-backed project deployment summaries. |
| `reconcileDeploymentOperations` | Scheduled | Repairs ambiguous/timed-out operation + projection mismatch states using runtime authority. |
| `cleanupDeploymentArtifacts` | Scheduled | Enforces retention/protection policy and updates rollback eligibility metadata. |

#### GitHub Lambdas

| Lambda | Trigger | Responsibility |
|--------|---------|---------------|
| `listCdmFiles` | `GET /github/cdm/files` | Reads file listing from CDM repo via GitHub API. Cached (5 min TTL). |
| `linkCdmSchema` | `POST /schemas/link-cdm` | Fetches file from CDM repo. Passes to ingestion pipeline. Stores GitHub source metadata. |
| `syncSchema` | `POST /schemas/:id/sync-cdm` | Fetches current file from CDM GitHub source. Creates immutable new KeyRa version when changed. |
| `saveSchemaDraft` | `PUT /schemas/:id/draft` | Saves mutable schema draft revision with OCC/no-change safeguards. |
| `createSchemaVersion` | `POST /schemas/:id/versions` | Creates immutable schema version from draft revision (`schemaVersionId`, `contentHash`). |
| `compareSchemaVersions` | `GET /schemas/:id/versions/diff` | Returns deterministic structural diff/impact summary between two immutable versions. |

#### Preview Lambdas

#### Preview Lambdas

| Lambda           | Trigger                      | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `previewMapping` | `POST /mappings/:id/preview` | Receives sample source data and a target environment (DEV / PREPROD / PROD). Looks up the target environment's generic mapping Lambda URL from configuration. Invokes that environment's Lambda with `{ mappingId, sourceData }` — the exact same invocation that production Step Functions use. Returns the environment Lambda's response (transformed output + diagnostics) back to the UI. Also returns metadata: environment name, snapshot version, deployed timestamp. Returns `404` if no active deployment exists for the selected environment. This is a pass-through that validates the real production path. |

---

## 15. Data Model

### 15.1 DynamoDB Tables

#### SchemaNodes

Stores the tree representation of every ingested schema.

| Key | Type | Description |
|-----|------|-------------|
| `schemaId` (PK) | String | Unique schema identifier |
| `path` (SK) | String | Full dot-notation path (e.g., `ShipmentOrder.Parties.Buyer.Address.PostalCode`) |
| `fieldName` | String | Leaf name (e.g., `PostalCode`) |
| `type` | String | Data type (`string`, `number`, `object`, `array`, etc.) |
| `description` | String | From schema or AI-generated |
| `depth` | Number | Nesting level |
| `isArray` | Boolean | Whether this node is an array |
| `isRequired` | Boolean | Whether the parent marks this as required |
| `parentPath` | String | Path of the parent node |
| `childCount` | Number | Number of direct children (0 for leaf nodes) |
| `subtreeFieldCount` | Number | Total leaf fields in this subtree (for chunk sizing) |
| `embeddingText` | String | Natural-language description used for embedding |

**GSIs:**
- `fieldName-index`: PK=`fieldName`, SK=`schemaId#path` — find all fields with a given name across schemas.
- `parentPath-index`: PK=`schemaId`, SK=`parentPath` — find all children of a node (tree traversal).

#### SchemaMetadata

| Key | Type | Description |
|-----|------|-------------|
| `schemaId` (PK) | String | |
| `name` | String | Display name |
| `format` | String | `json-schema` or `xsd` |
| `fieldCount` | Number | Total leaf fields |
| `origin` | String | `cdm` or `user` |
| `status` | String | `processing`, `ready`, `needs_review`, `error` |
| `source` | Map | CDM GitHub source metadata (read-only) or KeyRa lifecycle metadata for user-owned schemas |
| `createdAt` | String | ISO 8601 |
| `updatedAt` | String | ISO 8601 |

#### Projects

| Key | Type | Description |
|-----|------|-------------|
| `projectId` (PK) | String | |
| `name` | String | |
| `description` | String | |
| `slug` | String | URL-safe, used for GitHub folder paths |
| `schemaRefs` | List | Schema IDs attached to this project (compatibility shape; canonical refs are lifecycle/version aware) |
| `tags` | List | For filtering |
| `createdAt` | String | |
| `updatedAt` | String | |

#### Mappings

| Key | Type | Description |
|-----|------|-------------|
| `mappingId` (PK) | String | |
| `projectId` | String | |
| `name` | String | |
| `version` | Number | Auto-incremented on save |
| `sourceSchemaId` | String | |
| `targetSchemaId` | String | |
| `status` | String | `draft`, `ready`, `has-errors` |
| `ruleCount` | Number | |
| `coverage` | Number | Percentage of required target fields mapped |
| `configS3Key` | String | S3 key for full mapping config JSON |
| `createdAt` | String | |
| `updatedAt` | String | |

**GSI:** `projectId-index`: PK=`projectId` — list all mappings in a project.

#### Deployments

| Key | Type | Description |
|-----|------|-------------|
| `mappingId` (PK) | String | |
| `envVersion` (SK) | String | `{ENV}#{version}` (e.g., `DEV#7`) |
| `environment` | String | `DEV`, `PREPROD`, `PROD` |
| `version` | Number | Mapping version deployed |
| `snapshotId` | String | S3 key for immutable snapshot |
| `deployedAt` | String | |
| `deployedBy` | String | |
| `status` | String | `active`, `superseded`, `rolled-back` |

**GSI:** `active-index`: PK=`mappingId#environment`, SK=`deployedAt` — find current active deployment per environment.

#### Templates

| Key | Type | Description |
|-----|------|-------------|
| `templateId` (PK) | String | |
| `name` | String | |
| `description` | String | |
| `sourceSchemaType` | String | (e.g., "AP Invoice") |
| `targetSchemaType` | String | (e.g., "ERP Supplier Invoice") |
| `ruleCount` | Number | |
| `tags` | List | |
| `configS3Key` | String | S3 key for template config |

#### MappingMemory

Used by the AI pipeline for past-mapping reuse (RAG).

| Key | Type | Description |
|-----|------|-------------|
| `signatureHash` (PK) | String | Hash of source field name + target section |
| `ruleIndex` (SK) | Number | |
| `targetField` | String | |
| `expression` | String | DSL expression |
| `sourceSchemaName` | String | |
| `targetSchemaName` | String | |
| `projectId` | String | |
| `appliedAt` | String | |

#### PromptRegistry

Stores versioned prompt templates for all AI features. AI Lambdas read from this table at execution time (cached in Lambda memory with 5-minute TTL).

| Key | Type | Description |
|-----|------|-------------|
| `promptId` (PK) | String | Unique identifier (e.g., `auto-map`, `nl-to-rule`, `explain-rule`, `smart-fix`, `ai-validate`, `describe-fields`) |
| `version` (SK) | Number | Auto-incremented on change. Latest version is the active one. |
| `systemMessage` | String | System prompt including DSL reference, role instructions, output format constraints. |
| `userMessageTemplate` | String | User message template with placeholders (e.g., `{{sourceContext}}`, `{{targetField}}`, `{{instruction}}`). |
| `model` | String | Model identifier (e.g., `openai/gpt-4.1-mini`, `openai/gpt-4.1`). |
| `temperature` | Number | Always `0` for deterministic output. |
| `responseSchema` | String (JSON) | JSON Schema defining the expected structured output format. |
| `maxTokens` | Number | Response length limit. |
| `updatedAt` | String | ISO 8601 timestamp. |
| `updatedBy` | String | Who changed the prompt. |
| `notes` | String | Changelog note for this version (e.g., "Added few-shot examples for array mappings"). |

**GSI:** `latest-index`: PK=`promptId`, SK=`version` (descending) — quickly retrieve the latest version of any prompt.

**Access pattern:** AI Lambdas call `getLatestPrompt(promptId)` which reads the highest version number for the given `promptId`. Result is cached in Lambda memory. Cache is invalidated after 5 minutes or on cold start.

**Rollback:** To revert a prompt, create a new version that copies the content of the target version. This preserves a full audit trail — no versions are ever deleted or modified.

### 15.2 S3 Storage

| Key Pattern | Content | Notes |
|------------|---------|-------|
| `schemas/{schemaId}/content.json` | Full schema content (JSON or converted from XSD) | May exceed DynamoDB's 400KB limit |
| `schemas/{schemaId}/original.*` | Original uploaded file (preserves format) | For re-processing or export |
| `mappings/{mappingId}/v{N}.json` | Full mapping config at version N | Versioned history |
| `snapshots/{snapshotId}.json` | Immutable deployment snapshot | Never modified after creation |
| `exports/{projectId}/{timestamp}.keyra` | Project export bundles | Generated on demand |

### 15.3 DynamoDB Retrieval Signals (Post-FS-091)

Schema retrieval is now DynamoDB-only in serving paths.

Primary retrieval fields on `SchemaNodes` items:

| Field | Type | Purpose |
|-------|------|---------|
| `schemaId` | String (PK) | Scope retrieval to one schema |
| `path` | String (SK) | Stable node identity and deterministic tie-break |
| `fieldName` | String | Human-readable field label |
| `fieldNameNormalized` | String | Lexical matching signal |
| `pathTokens` | String[] | Tokenized path/field lexical matching |
| `embeddingText` | String | RAG context text and lexical enrichment |
| `embedding` | Number[] (optional) | Optional in-Lambda cosine rerank over capped candidate set |
| `type` | String | Filter/type boost |
| `depth` | Number | Depth filter/boost |
| `parentPath` | String | Structural enrichment |
| `isArray` | Boolean | Array-specific filtering/boost |

Serving-mode contract:

- Canonical mode: `RAG_RETRIEVER=dynamodb`
- Candidate-stage guards: `lexicalCap`, `rerankCap`, `topK`, `contextExpansionCap`
- Shadow/OpenSearch runtime modes are decommissioned after cutover (FS-091 T-08).

---

## 16. API Route Map

```
── Schemas ─────────────────────────────────────────────
POST   /schemas                        Create/upload schema
GET    /schemas                        List all schemas
GET    /schemas/:id                    Get schema detail
DELETE /schemas/:id                    Delete schema
POST   /schemas/:id/query             Search schema nodes (DynamoDB lexical + optional bounded rerank)

── Mappings ────────────────────────────────────────────
POST   /mappings                       Create mapping
GET    /mappings/:id                   Get mapping config
PUT    /mappings/:id                   Update mapping (save)
DELETE /mappings/:id                   Delete mapping
GET    /projects/:id/mappings          List mappings in project

── Projects ────────────────────────────────────────────
POST   /projects                       Create project
GET    /projects                       List projects
GET    /projects/:id                   Get project detail
PUT    /projects/:id                   Update project
DELETE /projects/:id                   Delete project

── Templates ───────────────────────────────────────────
GET    /templates                      List templates
GET    /templates/:id                  Get template detail

── Deployment ──────────────────────────────────────────
GET    /deployments                    Global deployment summaries (projection-backed)
GET    /projects/:id/deployments       Project deployment summaries (projection-backed)
GET    /mappings/:id/deploy-context    Full context for mapping deployment page
POST   /mappings/:id/deployments       Start DEV deploy operation (async, 202)
POST   /mappings/:id/promotions        Start promotion operation (async, 202)
POST   /mappings/:id/rollbacks         Start rollback operation (async, 202)
POST   /deployment-operations/:id/retry Retry operation (async, 202)
GET    /deployment-operations/:id      Operation status for polling/resume

── GitHub: CDM Repo (read-only) ────────────────────────
GET    /github/cdm/files               List files in CDM repo
POST   /schemas/link-cdm               Link CDM schema to project
POST   /schemas/:id/sync-cdm           Re-sync CDM schema (read-only source)
PUT    /schemas/:id/draft              Save schema draft revision
POST   /schemas/:id/versions           Create immutable schema version
GET    /schemas/:id/versions/diff      Compare immutable schema versions

── AI ──────────────────────────────────────────────────
POST   /ai/auto-map                    Generate mapping rules
POST   /ai/suggest-expression          NL → DSL expression
POST   /ai/explain-rule                Explain rule in plain English
POST   /ai/smart-fix                   Fix failing rule
POST   /ai/validate-mappings           AI validation report
POST   /ai/describe-fields             Generate human-readable field descriptions for a schema

── Activity ────────────────────────────────────────────
GET    /activity                       Activity feed (global or per-project)

── Preview ─────────────────────────────────────────────
POST   /mappings/:id/preview           Execute sample data against a deployed snapshot in a specific environment
```

---

## 17. UX Principles & Design System

### 17.1 Core Principles

| Principle                      | What it means                                                                                                                         | Example                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Suggest, never auto-commit** | AI output always lands in a "review" state. Users must explicitly accept.                                                             | Auto-map results show with ✨ badges. Users clicks "Accept" or "Edit" per rule.             |
| **Explain everything**         | Every rule, error, and action has a plain-English explanation available.                                                              | Hover over a DSL expression → "Converts the invoice date from MM/DD/YYYY to ISO format."   |
| **Progressive disclosure**     | Show the result first, details second. Don't overwhelm.                                                                               | Mapping table shows target field + preview value. Click to expand expression + trace.      |
| **Fast preview loop**          | Accepting suggestions → previewing results → fixing errors should take < 30 seconds per iteration.                                    | "Accept All → Preview" takes < 2 seconds.                                                  |
| **Graceful degradation**       | The app works fully without AI, without GitHub, and without a backend (Phase 0). Each capability is an accelerator, not a dependency. | All AI buttons are optional. Manual mapping always available. Local storage works offline. |
| **Informed deployment**        | Users see full context before deploying: what changed, what's currently deployed, what the impact is.                                 | Deployment Page shows diff, environment state, and schema versions.                        |
| **Save ≠ Deploy**              | These are always separate, intentional actions.                                                                                       | No implicit deployment on save. No deploy button in the editor.                            |

### 17.2 Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18+ |
| Language | TypeScript (strict mode) |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Routing | React Router v6 |
| State management | React Context + `useReducer` for global state; local `useState` for component state. Evaluated for Zustand if complexity warrants. |
| Data fetching | Custom `ApiAdapter` abstraction (Section 8). No external library required initially. Evaluated for TanStack Query if caching/deduplication needs grow. |

### 17.3 Accessibility Requirements

- Keyboard navigable: all interactive elements reachable via Tab. Enter/Space to activate. Escape to close modals/panels.
- ARIA labels on all icon-only buttons.
- Color contrast: WCAG AA minimum (4.5:1 for text, 3:1 for large text).
- Focus management: opening a modal traps focus. Closing returns focus to the trigger.
- Screen reader announcements for dynamic content (loading states, error messages, AI suggestions).

### 17.4 Responsiveness

- Target viewport: 1280px and above.
- Minimum supported: 1024px (panels may collapse to tabs).
- No mobile layout required. The Mapping Editor is a desktop-first workspace.

---

## 18. Phased Build Plan

### Phase 0: Foundation

**Scope:** Home Dashboard + Project Overview + Mapping Editor with local storage.

**Features:**
- Create, view, edit, delete projects and mappings.
- Upload schemas (JSON Schema, XSD, sample JSON, sample XML).
- DSL rule authoring with expression builder + raw editor.
- Client-side preview with engine execution, diff, and diagnostics.
- Test case management (save/run).
- Export/import `.keyra` files.
- All data stored in `localStorage` / `IndexedDB`.

**Backend needed:** Amplify only (static hosting). No API Gateway, no Lambda, no DynamoDB.

**Acceptance criteria:**
- Given a BA uploads a source and target schema, when they create a mapping and add 10 rules using the expression builder, then preview shows correct output within 2 seconds.
- Given a BA saves a project, when they refresh the browser, then the project loads from local storage with all rules intact.

### Phase 1: Backend Integration

**Scope:** Connect the UI to the AWS backend for persistent storage.

**Features:**
- `HttpAdapter` replaces `LocalStorageAdapter` when `VITE_API_URL` is configured.
- Schema upload → backend ingestion (parse into tree, store in DynamoDB + S3).
- Mapping save/load via API.
- Project CRUD via API.

**Backend needed:** API Gateway, Lambda, DynamoDB, S3.

**Acceptance criteria:**
- Given a BA saves a mapping, when another browser session loads the same project, then the mapping is available with all rules.
- Given a schema with 500 fields is uploaded, when ingestion completes, then all 500 nodes exist in DynamoDB.

### Phase 2: AI Features

**Scope:** AI-assisted mapping capabilities.

**Features:**
- Auto-map (small schemas: direct prompt; large schemas: RAG pipeline).
- NL → DSL expression.
- Explain rule.
- Smart fix.
- AI validation.
- All features surface as reviewable suggestions.

**Backend needed:** GitHub Models integration (via Lambda), DynamoDB retrieval signals + bounded in-Lambda rerank, Step Functions (for large schema ingestion/auto-map orchestration).

**Acceptance criteria:**
- Given a source and target schema with 100 fields each, when BA clicks Auto-Map, then at least 60% of suggested rules are accepted without modification.
- Given a failing rule with error "Expected string, got number", when BA clicks "Fix", then the suggested correction wraps the expression in `cast(..., "string")`.

### Phase 3: GitHub Integration

**Scope:** Two-repo schema management.

**Features:**
- Link CDM schemas from `KBXT/CDM-Schemas` (read-only).
- Re-sync CDM schemas.
- Create/import user-owned schemas and manage draft/revision/version lifecycle in KeyRa.
- Browse schema families/versions for reuse.

**Backend needed:** CDM GitHub read Lambdas, schema lifecycle APIs, persistence/versioning services.

**Acceptance criteria:**
- Given a BA links a CDM schema, when the CDM team pushes an update and the BA clicks Re-sync, then a new immutable KeyRa version is created and the diff summary shows fields added/removed.
- Given a BA edits a user-owned schema draft and clicks "Create version", then a new immutable schema version is created and existing mapping pins remain unchanged until explicit upgrade.

### Phase 4: Deployment Workflow

**Scope:** Environment-based deployment with full context.

**Features:**
- Deployment Page with all six sections (current state, environment comparison, diff, deploy actions, history, approval placeholder).
- Deploy to DEV.
- Promote DEV → PREPROD, PREPROD → PROD.
- Rollback to previous versions.
- Immutable snapshots in S3.
- Read-only deploy status badges on Home Dashboard and Project Overview.

**Backend needed:** Deployments DynamoDB table, snapshot storage in S3, deploy/promote/rollback Lambdas.

**Acceptance criteria:**
- Given a mapping at v7 with DEV on v5, when the BA opens the Deployment Page, then Section C shows "3 rules added, 7 modified, 1 removed" as the diff from v5 → v7.
- Given a mapping deployed to DEV at v7, when BA promotes DEV → PREPROD, then PREPROD runs the exact same snapshot (same snapshotId) as DEV.
- Given a mapping deployed to PROD at v3, when BA clicks "Rollback to v2", then PROD's active snapshot changes to v2's snapshot.

### Phase 5: Governance & Activity (Future)

**Scope:** Approval workflows, activity feed, auth integration.

**Features:**
- PROD deployment requires approval (approval state machine).
- Full activity feed (global and per-project).
- Authentication via Cognito.
- User identity attached to all actions.

**Backend needed:** Cognito, approval state machine (Step Functions), activity table in DynamoDB.

---

## 19. Risks & Mitigations

| Risk                               | Impact                                                                                                          | Likelihood | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI generates invalid DSL**       | Broken suggestions frustrate BAs                                                                                | Medium     | Validate every AI-generated expression with the engine's `validate()` before showing to BA. Show inline error if invalid.                                                                                                                                                                                                                                                                                                                                              |
| **Large schema ingestion timeout** | 23k-field schemas fail to process                                                                               | Medium     | Step Functions handles ingestion in parallel batches. No single Lambda call processes > 500 nodes.                                                                                                                                                                                                                                                                                                                                                                     |
| **GitHub API rate limits**         | Schema sync/publish fails during heavy use                                                                      | Low        | Cache file listings (5 min for CDM, 1 min for non-CDM). Batch operations. Use GitHub App token (higher rate limits than PATs).                                                                                                                                                                                                                                                                                                                                         |
| **Retrieval infrastructure cost drift** | DynamoDB/Lambda retrieval cost could grow with query volume and larger schemas | Medium | FS-091 removes OpenSearch always-on baseline cost and uses DynamoDB-only retrieval. Track two-week post-cutover quality/latency plus monthly spend review. Reconsider dedicated search infrastructure only if sustained thresholds are exceeded (for example: p95 latency misses by tier for 2 consecutive reviews, acceptance-rate drop >10%, or Dynamo retrieval spend trends above projected run-rate bands). |
| **DSL spec instability**           | Frequent DSL changes break saved mappings                                                                       | Medium     | Version the DSL spec. Engine supports forward-compatible parsing. Saved configs include `engineVersion`. Migration path for breaking changes.                                                                                                                                                                                                                                                                                                                          |
| **BA over-trusts AI suggestions**  | Incorrect mappings reach production                                                                             | Medium     | Never auto-commit. Require explicit "Accept" per rule. Require preview-pass before deploy. Show confidence indicators where possible.                                                                                                                                                                                                                                                                                                                                  |
| **Non-deterministic AI output**    | Same inputs produce different suggestions                                                                       | Medium     | `temperature: 0` for all LLM calls. Pin model versions. Use structured output mode.                                                                                                                                                                                                                                                                                                                                                                                    |
| **Browser storage limits**         | LocalStorage fills up for users with many/large projects                                                        | Low        | Phase 0: warn when storage exceeds 80% capacity. Phase 1: migrate to backend. IndexedDB has much higher limits than localStorage.                                                                                                                                                                                                                                                                                                                                      |
| **Snapshot storage growth**        | S3 costs grow with many deployments                                                                             | Low        | Snapshots are small (mapping config JSON). Set lifecycle policy to transition old superseded snapshots to Glacier after 90 days.                                                                                                                                                                                                                                                                                                                                       |
| **Prompt regression**              | A prompt change degrades AI suggestion quality (lower acceptance rate, more invalid DSL, worse field matching). | Medium     | **Prompt test harness:** A golden test dataset (20–50 cases per feature) validates every prompt change. Scorecard tracks parse success, validation pass, execution match, and acceptance rate. **Version rollback:** Prompt Registry stores all versions. Reverting is a single write (new version copying old content). **Monitoring (future):** Track AI suggestion acceptance rate per prompt version in production. Alert if acceptance rate drops below baseline. |

---

## 20. Open Questions

| #   | Question                                                                                                           | Impact                                                                     | Status                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | What is the complete KeyRa DSL specification?                                                                      | Blocks engine implementation, expression builder UI, and AI prompt design. | Resolved - see `specs/KEYRA-DSL-SPECIFICATION`                                                                            |
| 2   | Should "Deploy to DEV" be one-click from the Deployment Page, or require additional gates even for DEV?            | Affects TTFSM for iterative development.                                   | Proposed: one-click for DEV, promotion model for PREPROD/PROD.                                                            |
| 3   | What GitHub App or authentication method will be used for the GitHub API?                                          | Affects rate limits, permissions model, and setup complexity.              | TBD.                                                                                                                      |
| 4   | Should the template library be community-contributed or team-curated only?                                         | Affects template quality and governance.                                   | Proposed: team-curated for MVP, community-contributed future.                                                             |
| 5   | What is the maximum mapping config size to support?                                                                | Affects DynamoDB item size decisions and S3 usage patterns.                | Proposed: configs > 400KB stored in S3, referenced from DynamoDB.                                                         |
| 6   | How should mapping version numbers work — auto-increment or semver?                                                | Affects BA understanding and deployment identification.                    | Proposed: auto-increment (v1, v2, v3) for simplicity. Semver is overkill for BA-facing tool.                              |
| 7   | Should the engine support plugin/extension points for custom transforms?                                           | Affects engine architecture and DSL design.                                | Deferred to post-MVP.                                                                                                     |
| 8   | What is the expected concurrent user count?                                                                        | Affects DynamoDB capacity planning and API Gateway throttling config.      | TBD. Internal tool — likely < 50 concurrent users.                                                                        |
| 9   | How should external sources be resolved at runtime by the generic mapping Lambda?                                  | Affects production integration architecture and latency budget.            | Deferred to a dedicated spec. Engine contract is clean: receives a resolved key-value map from caller.                    |
| 10  | Should the engine support XML output serialization, and how should object keys map to XML elements vs. attributes? | Affects target system integration for XSD-based targets.                   | Deferred to a dedicated spec section or addendum. Engine produces a neutral JS object; serialization is a separate layer. |
| 11  | Should `eq(null, null) → true` be documented more prominently as a deviation from null propagation?                | May confuse BAs who expect consistent null behavior across all functions.  | Proposed: add a "null cheat sheet" quick-reference in the expression builder UI.                                          |

---

## 21. Glossary

| Term | Definition |
|------|-----------|
| **BA** | Business Analyst. The primary user of KeyRa. |
| **CDM** | Canonical Data Model. Company-wide standard schemas maintained by the DCA team. |
| **DCA** | Data & Content Architecture. The team that manages CDM schemas. |
| **DSL** | Domain-Specific Language. KeyRa's custom expression language for defining transformation rules. |
| **Environment** | A deployment target: DEV, PREPROD, or PROD. |
| **Expression** | A DSL statement that defines how to compute a target field value from source data. |
| **Mapping** | A set of DSL rules that transforms data from a source schema to a target schema. |
| **Mapping config** | The JSON document containing all rules, configuration, and metadata for a mapping. |
| **Preview** | Client-side execution of a mapping against sample data to verify correctness before deployment. |
| **Promote** | Copy a deployed snapshot from one environment to another (e.g., DEV → PREPROD). |
| **RAG** | Retrieval-Augmented Generation. A pattern that retrieves relevant context from a database before generating AI output, avoiding the need to include entire large schemas in a single prompt. |
| **Rule** | A single instruction mapping one target field to a DSL expression. |
| **Schema** | A structural definition of a data format (JSON Schema or XSD). Describes field names, types, nesting, and requirements. |
| **Snapshot** | An immutable artifact created at deploy time containing the full mapping config, schema references, and engine version. |
| **TTFSM** | Time to First Successful Mapping. The primary success metric. |
| **Tier 1 / Tier 2** | The two-tier AI model architecture. Tier 1 (fast/cheap) for routing and simple tasks. Tier 2 (capable/slower) for complex reasoning. |

---

*End of specification.*
