# FS-054 T-02 — Mapping Engine Audit Findings

Date: 2026-05-14  
Task: `forge/active/FS-054/tasks/T-02.md`  
Scope: Content-level audit of `src/engine/` against `forge/architecture/mapping-engine.md`

---

## 1) Public API Alignment

### Confirmed
1. `validate` is documented and exported (`src/engine/index.ts` line 12).
2. `execute` is documented and exported (`src/engine/index.ts` line 11).
3. `parse`, `evaluate`, and `resolvePath` are documented as additional entry points and exported via `export * from './dsl/index.js'` (`src/engine/index.ts` line 9; `src/engine/dsl/index.ts` lines 15–16, 20).

### Drift / Gaps
4. Root API currently exports `registerAllFunctions`, `SUPPORTED_FORMAT_TOKENS`, and `FORMAT_PRESETS` (`src/engine/index.ts` line 10), but `mapping-engine.md` Public API section does not explicitly list these root exports.
5. Root API exports complete registry APIs via `export * from './registry/index.js'` (`createRegistry`, `defaultRegistry`, `FunctionRegistry`, etc.), but Public API section frames only validate/execute + parse/evaluate/resolvePath.
6. Root API exports diagnostics constants/helpers (`DIAGNOSTIC_CODES`, `formatDiagnosticMessage`) via `export * from './diagnostics/index.js'`; this is not explicitly called out in Public API section.

Assessment: **Mostly aligned with additive undocumented exports**; no documented export appears missing.

---

## 2) Module Structure Alignment

### Confirmed
1. Core module tree is accurate: `dsl/`, `validate/`, `execute/`, `types/`, `diagnostics/`, `registry/`, `functions/` all exist.
2. `validate/schema-tree.ts` does include JSON Schema adapter + permissive XSD stub exactly as documented.
3. `execute/` helper directory and files (`set-at-path.ts`, `ast-cache.ts`) exist as documented.

### Drift / Gaps
4. `functions/date.ts` currently registers **both** `formatDate` and `dateDiffSeconds`; module structure section lists only `formatDate` for date module coverage.
5. `functions/string.ts` currently includes `split`; module structure section string function list ends at `length` and omits `split`.
6. `types/options.ts` includes `TraceVerbosity`; module structure line for `options.ts` mentions this, but wording `externalSources, validateBeforeExecute` is field-level detail that may be better represented in type section for consistency.

Assessment: **Strong structural alignment**, with function-catalog omissions in architecture doc.

---

## 3) Type Contract Alignment

### Confirmed
1. `ExecutionResult` shape (output, diagnostics, optional trace, optional stats) matches architecture narrative.
2. `ValidationResult` shape (valid, diagnostics, optional coverage) matches architecture narrative.
3. `EngineOptions` includes `trace`, `traceVerbosity`, `maxRecursionDepth`, `environment`, `externalSources`, `validateBeforeExecute` as expected from FS-007 updates.

### Drift / Gaps
4. `CoverageResult` includes optional `unmappedFields?: readonly string[]`; architecture coverage summary references unmapped fields conceptually but the type summary table does not explicitly mention `CoverageResult` fields.
5. `RuleType` in `types/config.ts` is `'string' | 'number' | 'boolean' | 'array' | 'object'` (no `'null'`); architecture type summary should avoid implying full `ValueType` parity at rule declaration level.
6. `FunctionImplementation` now accepts `EvaluationContext` (not narrower `ExecutionContext`), and this is correctly reflected in prose; ensure T-05 preserves this explicit distinction in type section for clarity.

Assessment: **Aligned with minor doc specificity gaps**, not contradictory.

---

## 4) Pipeline Alignment (validate + execute)

### Confirmed
1. Execute pipeline phases documented (validate gate → parse/cache → context → iterate/evaluate → path assembly → bulk behaviors → output assembly) match `src/engine/execute.ts` flow.
2. Validate pipeline pass ordering in docs matches `src/engine/validate.ts` orchestration (parse, paths, types, context, references, coverage, aggregate).
3. Bulk behavior order documented as `unmappedTargets` then `nullSubtrees` matches implementation (`applyUnmappedTargets` then `applyNullSubtrees`).

### Drift / Gaps
4. `src/engine/validate.ts` still contains stale scaffold comment (“no-op validator”) at lines 22–25, which contradicts both implementation and architecture doc.
5. Execute uses `inputValue: sourceData` in trace entries for every rule (full source snapshot reference); architecture trace section implies per-rule trace with input/output, but this detail could be clarified for reader expectations.
6. Validate pass dependency gating is schema-availability-aware (passes skip when source/target schema unavailable); docs imply pass sequence but should explicitly note conditional pass execution by schema presence.

Assessment: **Pipeline behavior is implemented and largely documented; one stale inline code comment and a few clarifications needed.**

---

## 5) Pattern Alignment (registry, diagnostics, null propagation, scope, cache)

### Confirmed
1. Registry pattern is accurate: name-keyed map, duplicate registration throws, default singleton + factory (`createRegistry`).
2. Null propagation + `handlesNull` + `lazyArgs` model is implemented in evaluator as documented.
3. Scope stack model for `map/filter/find` with `pushScope/popScope` and `try/finally` cleanup is implemented as documented.

### Drift / Gaps
4. Function implementation runtime exceptions are currently converted to `KEYRA-E002` with synthesized message in evaluator catch block; docs describe conversion to diagnostics but do not mention reuse of `E002` code for implementation errors.
5. Diagnostic code naming has `KEYRA-E012` with warning severity (external source not available). Architecture doc uses code references but does not call out this intentional severity/code-prefix mismatch.
6. Date function pattern now includes shared token exports used by UI (`SUPPORTED_FORMAT_TOKENS`, `FORMAT_PRESETS`) — this cross-boundary metadata export pattern is currently under-documented in mapping-engine architecture.

Assessment: **Core patterns align; a few implementation-specific diagnostics/export conventions are under-documented.**

---

## 6) Constraint Verification

### Confirmed
1. Engine module itself has no direct imports from AWS SDK/OpenAI/UI/Lambda (`src/engine/**` search shows none).
2. Engine orchestrators are pure I/O-free functions (no fs/network/db usage in `src/engine/execute.ts` or `src/engine/validate.ts`).
3. Deterministic execution properties hold structurally (ordered iteration, sorted diagnostics, pure transform helpers).

### Caveats / Clarifications
4. Repository `package.json` contains runtime dependencies (`@aws-sdk/*`, `openai`) for non-engine backend modules; architecture constraint should remain framed as **engine-module boundary** rather than package-level dependency graph.
5. “No `any` in public API types” is directionally true; most exported types use `unknown`, but some API surfaces intentionally use broad types (e.g., `ExecutionResult.output: unknown`) — acceptable but worth precision in wording.
6. Dual format (ESM/CJS) is supported at package export level and consistent with architecture constraint.

Assessment: **Constraints hold for engine boundary**; doc wording should avoid confusion with whole-repo dependencies.

---

## 7) Phase 0 Simplifications / Deferred Areas

### Confirmed simplifications
1. XSD validation remains permissive stub (`hasPath() => true`, unknown types, no required leaves) with info diagnostic (`KEYRA-I001`) — exactly Phase 0 simplification.
2. Validation is static-analysis focused and intentionally avoids schema lifecycle concerns (no fetch/ingest/store/version responsibilities).
3. Execute/validate are synchronous in-memory transforms designed for editor responsiveness and deterministic behavior.

### Newly surfaced / should be explicit in doc
4. `tests/engine/fixtures/` is now implemented despite doc wording “will contain” (testing strategy section is partially stale tense).
5. `dateDiffSeconds` exists and is registered but not reflected in architecture function catalog; this is not a simplification, but it is an undocumented implemented expansion.
6. Root export of date-format token metadata for UI (`SUPPORTED_FORMAT_TOKENS`, `FORMAT_PRESETS`) reflects practical Phase 0 cross-layer support pattern that architecture doc does not currently capture.

Assessment: **Primary simplification (XSD) is correctly represented; testing/function-catalog/export notes need reconciliation.**

---

## 8) Actionable Inputs for T-05

1. Update Public API section to explicitly include current root exports beyond validate/execute/parse/evaluate/resolvePath (or clearly classify them as “advanced/metadata exports”).
2. Update function catalog/module structure to include `split` and `dateDiffSeconds`.
3. Add note clarifying engine constraint boundary: zero cloud/UI dependencies applies to `src/engine/**`, not whole package.
4. Clarify validate pass execution is conditional when source/target schema is absent.
5. Add explicit note that implementation exceptions during function execution are converted to diagnostics (currently emitted with `KEYRA-E002` message form).
6. Refresh Testing Strategy wording from future tense (“will contain fixtures”) to present tense.
7. Ensure type section explicitly calls out `CoverageResult` fields and optional `unmappedFields`.

---

## 9) Acceptance Check Traceability (T-02)

- Audit findings cover major sections of `mapping-engine.md`: ✅
- Public API exports reconciled: ✅
- Type contracts compared with differences noted: ✅
- Validate and execute pipelines checked: ✅
- Function registry and DSL architecture checked: ✅
- ≥3 concrete findings per audit section (confirmations + drifts): ✅
- Findings structured for T-05 actionability: ✅
