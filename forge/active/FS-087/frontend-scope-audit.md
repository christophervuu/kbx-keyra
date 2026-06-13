# FS-087 Frontend Scope Assumption Audit (T-01)

Date: 2026-06-08  
Spec: `forge/active/FS-087/spec.md` (Rev 2)  
Task: `forge/active/FS-087/tasks/T-01.md`

## Purpose

Identify all frontend schema scope assumptions (`global` / `project` / `project-level` / `Local` as category/scope) and produce a deterministic implementation delta.

This audit covers:
- UI schema surfaces,
- project schema flows,
- mapping schema selectors,
- shared UI/domain types,
- API adapters and adapter-facing contracts,
- high-signal tests that enforce legacy behavior.

---

## Audit Method

Repository search + targeted file review over:
- `ui/src/features/schemas/**/*`
- `ui/src/features/projects/**/*`
- `ui/src/features/mappings/**/*` (schema selection + reference use)
- `ui/src/lib/types/domain.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/local-storage-adapter.ts`
- `ui/src/lib/api/http-adapter.ts`

Search patterns included:
- `SchemaScope`, `scope: 'global'|'project'`, `metadata.scope`, `scope badge`
- `Global`, `Project-Level`, `Local`, `JSON Schema`, `Promote to Global`
- `schemaRefs`, `addSchemaRef`, `linkedSchemaIds`
- `sourceSchemaRef`, `targetSchemaRef`

---

## Executive Summary

Frontend currently has broad scope-coupled behavior in:
1. **Shared contracts** (`SchemaScope`, `SchemaMetadata.scope`, project `schemaRefs`).
2. **Schema Library filtering and cards** (scope filters + scope badges).
3. **Schema Detail and Schema Actions** (scope badge + Promote-to-Global behavior).
4. **Project schema cards/upload/link flows** (scope labeling and scope selection UI).
5. **Project data orchestration and mapping creation selectors** (project `schemaRefs` as the selection universe).

Key aligned findings to FS-087 Rev 2:
- `JSON Schema` label is still widespread in user-visible schema surfaces and tests.
- `Local` is still used as user-facing origin category in multiple components.
- Project linkage is still `schemaRefs`-first in hooks and create flows.

There are also frontend areas already aligned or largely unaffected:
- `LinkedSchemasDialog` already renders normalized format labels (`JSON`, `XSD`, `Inferred JSON/XML`) and maps non-CDM origins to `Uploaded`.
- Mapping editor core loading uses explicit `sourceSchemaRef` / `targetSchemaRef` IDs (aligned with FS-087 requirement to keep explicit refs).

---

## Findings Matrix

| Area | File(s) | Scope Assumption | Impact Type | Required? | Follow-on |
|---|---|---|---|---|---|
| Shared domain type | `ui/src/lib/types/domain.ts` | `SchemaScope`, `SchemaMetadata.scope`; `SchemaOrigin` includes `local`; Project uses `schemaRefs` only | Type contract + migration compatibility | **Yes** | T-03 |
| Adapter contracts | `ui/src/lib/api/types.ts` | No direct scope logic, but inherits domain types (`SchemaMetadata`, `ProjectDetail`) | Type contract propagation | **Yes (via type updates)** | T-03 |
| Local storage schema normalization | `ui/src/lib/api/local-storage-adapter.ts` | Defaults `scope` to `global`; persists/updates `scope`; allows `origin: local`; project linkage via `schemaRefs` writes | Behavior + compatibility | **Yes** | T-03, T-08 |
| HTTP adapter | `ui/src/lib/api/http-adapter.ts` | No explicit scope branching; mostly pass-through | Unaffected behavior (contract-only dependency) | **Partially** | T-03 (type alignment only) |
| Schema library hook | `ui/src/features/schemas/hooks/use-schema-library.ts` | Uses project `schemaRefs` for usage; enriches `scope`; exposes `toggleScopeFilter`; display format `JSON Schema` | Behavior + UI copy | **Yes** | T-05, T-06 |
| Schema library filtering | `ui/src/features/schemas/lib/schema-filters.ts` | Filters by `scopes`; origin order includes `local`; display format includes `JSON Schema` | Behavior + UI copy | **Yes** | T-05 |
| Schema library filter UI | `ui/src/features/schemas/components/SchemaLibraryFiltersPanel.tsx`, `ActiveFilterChips.tsx` | Scope filter controls + `Global` / `Project-Level` chips; `Local` origin option | UI copy + behavior | **Yes** | T-05 |
| Schema library card UI | `ui/src/features/schemas/components/SchemaLibraryCard.tsx` | Scope badge rendered; origin label `Local`; display format `JSON Schema` | UI copy + behavior | **Yes** | T-05 |
| Schema detail metadata | `ui/src/features/schemas/components/SchemaDetailPage.tsx` | Origin labels include `Local`; scope badge (`Global` / `Project-Level`); format label `JSON Schema` | UI copy + behavior | **Yes** | T-05 |
| Schema detail actions | `ui/src/features/schemas/components/SchemaActions.tsx` | `isProjectScoped` branching; `Promote to Global`; updates schema `scope` | Behavior + UI copy | **Yes** | T-05, T-04 |
| Project feature-local types | `ui/src/features/projects/types.ts` | `SchemaScope = 'global' | 'project-level'`; card scope modeled directly | Type contract | **Yes** | T-03, T-05 |
| Project schema cards | `ui/src/features/projects/components/SchemaCard.tsx` | Scope badge (`Global/Project`); origin `Local`; format badge `JSON Schema`; local origin skip-sync behavior | UI copy + behavior | **Yes** | T-05, T-06 |
| Project overview data hook | `ui/src/features/projects/hooks/use-project-overview.ts` | Project links managed as rich `schemaRefs`; add/remove schema mutate `schemaRefs` arrays | Behavior + compatibility | **Yes** | T-03, T-06 |
| Schema upload dialog | `ui/src/features/projects/components/SchemaUploadDialog.tsx` | Scope radio (`global` vs `project-level`); writes `origin` as `local` or non-canonical value; produces `SchemaRef type: local` | Behavior + migration compatibility | **Yes** | T-03, T-06, T-08 |
| Create mapping selector | `ui/src/features/projects/components/CreateMappingPage.tsx` | Loads selectable schemas from project `schemaRefs` only; sets schemaRef type `local` | Behavior | **Yes** | T-06, T-07 |
| Schema management section | `ui/src/features/projects/components/SchemaManagementSection.tsx` | Remove dialog currently warning-only for referenced mappings; not hard-block | Behavior | **Yes** | T-06 |
| Schema link picker | `ui/src/features/projects/components/SchemaLinkPicker.tsx` | CDM-only linking UI; no scope filter assumptions; still callback contract expects `SchemaRef` rich object | Mostly unaffected (model contract dependent) | **Partial** | T-06, T-03 |
| Schema usage derivation | `ui/src/features/schemas/hooks/use-schema-usage.ts` | Uses project `schemaRefs` for usage derivation | Behavior + compatibility | **Yes** | T-03, T-06 |
| Linked schemas dialog | `ui/src/features/projects/components/LinkedSchemasDialog.tsx` | Already normalizes format labels away from `JSON Schema`; origin shown as Uploaded/CDM | Largely aligned | **No major change** | T-06 regression check |
| Mapping editor hook | `ui/src/features/mappings/hooks/use-mapping-editor.ts` | Uses explicit `sourceSchemaRef` / `targetSchemaRef` IDs to load schemas | Aligned with target model | **No change for scope model** | T-07 regression check |

---

## JSON Label Normalization Callouts (`JSON` vs `JSON Schema`)

User-facing `JSON Schema` labels still present in:
- `ui/src/features/schemas/components/SchemaLibraryFiltersPanel.tsx`
- `ui/src/features/schemas/components/SchemaLibraryCard.tsx`
- `ui/src/features/schemas/components/SchemaDetailPage.tsx`
- `ui/src/features/projects/components/SchemaCard.tsx`
- `ui/src/features/projects/components/CreateMappingPage.tsx` (`FORMAT_LABELS`)
- supporting test fixtures/assertions in schema/project tests

Already normalized in:
- `ui/src/features/projects/components/LinkedSchemasDialog.tsx` (uses `JSON` / `Inferred JSON`)

Action: unify schema format presentation primitives and update affected surfaces/tests in T-05/T-06/T-07.

---

## Required Delta by Task

### T-03 (model/contracts)
- Replace scope-first contracts with shared-library semantics.
- Add project linkage transition toward `linkedSchemaIds` with read-time `schemaRefs` compatibility.
- Normalize `origin: local -> uploaded` in frontend read/write paths.
- Ensure adapter/domain contracts no longer require scope for access decisions.

### T-05 (schema UI terminology)
- Remove scope filters/chips/badges from schema library/detail/cards.
- Replace user-facing `Local` origin category with `Uploaded`.
- Replace `JSON Schema` labels with `JSON` in user-facing schema surfaces.
- Remove `Promote to Global` action and any scope-concept copy.

### T-06 (project schema flows)
- Convert project schema management to linked-schema semantics.
- Ensure Add Schema flow supports shared link/upload language.
- Enforce unlink hard-block when project mappings depend on schema (not warning-only).
- Keep linked-schema dialog behavior aligned and stable.

### T-07 (mapping schema selectors)
- Expand create/edit mapping selectors to all shared schemas, not only project `schemaRefs`.
- Preserve explicit mapping `sourceSchemaRef`/`targetSchemaRef` references.
- Ensure non-linked selection behavior is compatible with project linkage model.

### T-08 (compatibility)
- Add read-time compatibility for legacy scope and project linkage models in local adapter state.

---

## Explicit Unaffected / Low-Impact Areas

- `ui/src/lib/api/http-adapter.ts` has no direct scope-branching logic; impact is primarily from shared type contract changes.
- `ui/src/features/mappings/hooks/use-mapping-editor.ts` explicit schema reference loading is already aligned to FS-087’s mapping reference model.
- `ui/src/features/projects/components/LinkedSchemasDialog.tsx` already applies normalized display labels and can be reused with minimal copy changes.

---

## Risks

1. **Test suite coupling risk**: Many tests assert legacy labels (`Global`, `Project-Level`, `Local`, `JSON Schema`) and will fail without coordinated updates.
2. **Contract ripple risk**: `SchemaScope`, `schemaRefs`, and `SchemaOrigin` are deeply shared across features/adapters.
3. **Flow inconsistency risk**: If T-06 and T-07 are implemented independently, project-link vs mapping-selector behavior may drift.
4. **Backward compatibility risk**: localStorage fixtures and adapter tests rely on persisted legacy shapes.

---

## Acceptance Check Coverage (T-01)

- Complete frontend scope-assumption audit traceable to concrete file paths: **Satisfied**.
- Required UI/type/adapter updates explicitly identified: **Satisfied**.
- Unaffected areas explicitly documented: **Satisfied**.

