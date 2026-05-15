# FS-054 T-01 — Repository Structure Audit Findings

Date: 2026-05-14  
Task: `forge/active/FS-054/tasks/T-01.md`  
Scope: Filesystem structure audit against `forge/architecture/project-structure.md` + light structural checks for `e2e-testing.md` and `ai-runtime.md`

---

## 1) Summary

This audit found **material structural drift** between documented architecture structure and repository reality, primarily in:

- `src/lambda/` (documented as broad multi-domain Lambda tree; implemented currently as `ai/` only)
- `tests/` (`tests/e2e/` expected by `e2e-testing.md` but absent; `tests/ui/components/` documented but absent)
- `src/` top-level (`src/types/` documented but absent)

It also found a small number of **present-but-undocumented** significant areas (`tests/engine/fixtures/`, `tests/ui/hooks/`, `ui/src/lib/utils/` is documented and confirmed).

---

## 2) Confirmed Entries (documented and present)

### Root / top-level
- `src/` — present
- `ui/` — present
- `tests/` — present
- `forge/` — present

### `src/`
- `src/engine/` — present
- `src/lambda/` — present
- `src/lib/` — present
- `src/engine/{dsl,execute,validate,types,diagnostics,registry,functions}` — present
- `src/lib/ai/` and core files listed in architecture doc — present

### `ui/src/`
- `ui/src/{main.tsx,App.tsx,routes,components,hooks,features,lib}` — present
- `ui/src/features/{schemas,home,projects,mappings}` — present
- `ui/src/lib/{api,data,engine,state,types,utils}` — present

### `tests/`
- `tests/engine/` — present
- `tests/lambda/` — present
- `tests/lib/` — present
- `tests/ui/` — present
- `tests/lambda/ai/` — present
- `tests/lib/ai/` — present
- `tests/ui/features/` — present

---

## 3) Documented but Missing (drift)

## `src/` area

1. **`src/types/`**
   - Documented as: shared backend types directory
   - Actual: directory does **not** exist
   - Likely cause: never created; types are currently under `src/engine/types/`

2. **`src/lambda/{schema,mapping,project,deploy,github,preview}`**
   - Documented as: Lambda subdomains for CRUD/deploy/GitHub/preview
   - Actual: these directories do **not** exist (current `src/lambda/` contains only `ai/`)
   - Likely cause: Phase 1+ planned structure documented ahead of implementation

## `tests/` area

3. **`tests/ui/components/`**
   - Documented as: shared component tests area
   - Actual: directory does **not** exist
   - Likely cause: UI tests currently co-located in `ui/src/**` and feature-mirrored under `tests/ui/features/`

## `e2e-testing.md` structural paths

4. **`tests/e2e/` tree** (entire documented directory structure)
   - Documented as: Playwright E2E harness root containing `playwright.config.ts`, fixtures, page objects, specs
   - Actual: `tests/e2e/` directory does **not** exist
   - Likely cause: E2E architecture doc drafted before implementation; infra not yet present in repo

---

## 4) Present but Undocumented (architecturally significant)

## `tests/` area

1. **`tests/engine/fixtures/`**
   - Significant fixture corpus for execute/integration scenarios
   - Not explicitly represented in current `project-structure.md` test section at fixture-directory granularity

2. **`tests/ui/hooks/`**
   - Present and used for hook tests
   - Not explicitly represented in current `project-structure.md` test section (`tests/ui/features/` and `tests/ui/components/` only)

## Root area

3. **`scripts/`**
   - Present at repository root
   - Not represented in `project-structure.md` top-level layout

4. **`specs/`**
   - Present at repository root; contains product/technical and DSL specs
   - Not represented in `project-structure.md` top-level layout

> Note: `build/` and `dist/` are present, but these appear to be generated artifacts and are less likely to belong in canonical architecture structure docs unless intentionally documented as outputs.

---

## 5) Light Structural Review — `e2e-testing.md`

Result: **stale relative to repo structure**.

- Major path drift: the document assumes `tests/e2e/` exists; it does not.
- Therefore all nested path references in the architecture doc are currently non-existent in repository.
- This is Phase 1-relevant only insofar as it affects confidence in architecture docs; no code impact for current reconciliation scope.

---

## 6) Light Structural Review — `ai-runtime.md`

Result: **mostly structurally accurate with one omission**.

- Confirmed present: `src/lib/ai/*` core modules listed by the doc
- Confirmed present: `src/lambda/ai/explain-rule.ts` and `src/lambda/ai/suggest-expression.ts`
- Omission in module structure listing: `src/lambda/ai/auto-map.ts` exists in repo but is not listed in the doc’s module structure block

No missing-path errors were found in documented `ai-runtime.md` paths that would block comprehension of current runtime location.

---

## 7) Actionable Input for T-04

For `project-structure.md` updates, T-04 should at minimum:

1. Remove or annotate `src/types/` (missing)
2. Remove or clearly mark `src/lambda/{schema,mapping,project,deploy,github,preview}` as planned/not-yet-implemented (currently missing)
3. Correct `tests/ui/components/` entry (missing) and reflect actual test organization
4. Add explicit mention of `tests/engine/fixtures/` and `tests/ui/hooks/` where appropriate
5. Consider whether top-level `scripts/` and `specs/` should be represented in top-level layout

For later architecture tasks (T-07/T-08), note:
- `e2e-testing.md` currently describes non-existent infra (`tests/e2e/`), likely requiring either annotation or update in final consolidation if still out-of-sync
- `ai-runtime.md` may need a minor module-structure addition for `auto-map.ts`

---

## 8) Acceptance Check Traceability (T-01)

- Findings document produced: ✅
- Known drift point `src/types/` identified: ✅
- Significant directories in `src/`, `ui/src/`, `tests/` accounted for (confirmed/missing/undocumented): ✅
- `e2e-testing.md` + `ai-runtime.md` path accuracy checked: ✅
- Findings structured and actionable for T-04: ✅
