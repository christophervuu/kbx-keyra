# SPEC

## Title

Implement the Full execute() Pipeline

---

## ID

FS-007

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-01
Last Updated: 2026-05-01
Type: engine

---

## Status

completed

---

## Revision

Rev: 1

---

## Summary

Replace the execute() stub (from FS-001) with the complete execution pipeline. The execute pipeline orchestrates end-to-end data transformation: it parses rule expressions into ASTs (with caching), evaluates each rule against the source data using the evaluator, assembles a nested output object from target paths, applies bulk behaviors (unmappedTargets, nullSubtrees), collects diagnostics, optionally records per-rule execution traces, and computes execution statistics. This is the capstone pipeline that ties together parse (FS-002), evaluate (FS-003), core functions (FS-004), array functions (FS-005), and validate (FS-006) into the production execution path used by both the browser client-side preview and the Lambda transformation pipeline.

---

## Problem

The engine's execute() function is currently a stub that returns `{ output: {}, diagnostics: [] }`. No actual transformation occurs — rules are not parsed, not evaluated, and no output is produced. The engine cannot execute any mapping config against any source data. This blocks all downstream consumers: client-side preview in the Mapping Editor, Lambda production transformations, and test-case-runner scenarios.

---

## Goal

After this spec is implemented, `execute(config, sourceData, sourceSchema, targetSchema, options?)` produces a fully transformed output object by evaluating all rules in the mapping config against the provided source data. The pipeline handles errors gracefully per-rule, supports all three unmappedTargets strategies, applies nullSubtrees overrides, records optional execution traces for step-by-step debugging, computes execution statistics, and optionally runs pre-flight validation. The implementation is pure TypeScript with zero runtime dependencies and runs identically in browser and Lambda.

---

## Assumptions

- The parser (FS-002), evaluator (FS-003), core functions (FS-004), array functions (FS-005), and validate pipeline (FS-006) are all completed and functioning correctly.
- The current `execute()` stub signature (`config, sourceData, sourceSchema, targetSchema, options?`) is the correct public API shape.
- `defaultRegistry` is pre-populated with all built-in functions via `registerAllFunctions()` at engine initialization.
- MappingConfig, MappingRule, EngineOptions, ExecutionResult, TraceEntry, and Diagnostic types from `src/engine/types/` are the authoritative type definitions.
- The SchemaTree from `src/engine/validate/schema-tree.ts` is the correct abstraction for schema analysis when unmappedTargets requires schema introspection.
- `config.config.externalSources` (string array) declares which externals are expected; actual external data values are passed at call time via `options.externalSources`.

---

## Current Context

### execute.ts (current stub)

`src/engine/execute.ts` is a 30-line stub created in FS-001. It accepts `MappingConfig`, `sourceData`, `sourceSchema`, `targetSchema`, and optional `EngineOptions`, but voids all inputs and returns `{ output: {}, diagnostics: [], trace: options?.trace ? [] : undefined }`.

### Type definitions requiring extension

- `ExecutionResult` (in `src/engine/types/results.ts`) currently has `output`, `diagnostics`, and optional `trace`. It needs an optional `stats` field.
- `TraceEntry` (in `src/engine/types/results.ts`) currently has `ruleIndex`, `targetPath`, `expression`, `inputValue`, `outputValue`, and optional `diagnostics`. It needs an optional `durationMs` field.
- `EngineOptions` (in `src/engine/types/options.ts`) currently has `trace`, `traceVerbosity`, `maxRecursionDepth`, and `environment`. It needs `validateBeforeExecute` and `externalSources` fields.

### Integration surface

- `parse()` from `src/engine/dsl/index.ts` — parses expression strings into ASTs + diagnostics
- `evaluate()` from `src/engine/dsl/evaluator.ts` — evaluates AST nodes against EvaluationContext to produce values + diagnostics + optional trace
- `EvaluationContext` from `src/engine/dsl/types.ts` — the runtime context required by evaluate()
- `defaultRegistry` from `src/engine/registry/function-registry.ts` — the pre-populated function registry
- `getOrBuildSchemaTree()` from `src/engine/validate/schema-tree.ts` — builds SchemaTree for schema analysis (needed for unmappedTargets "null" and "error" strategies)
- `validate()` from `src/engine/validate.ts` — full validation pipeline (called only when `options.validateBeforeExecute` is true)

### Test structure

- `tests/engine/execute.test.ts` — existing stub tests (2 tests, will be rewritten)
- `tests/engine/execute/` — empty directory with `.gitkeep` (ready for sub-module tests)

---

## Scope

### In Scope

- Replace execute() stub with full implementation
- Extend EngineOptions with `externalSources?: Readonly<Record<string, unknown>>` and `validateBeforeExecute?: boolean`
- Add `ExecutionStats` interface and optional `stats` field to ExecutionResult
- Add optional `durationMs` field to TraceEntry
- Implement expression-string-keyed AST cache for parsed rule expressions
- Implement target path assembly (dot-notation to nested objects)
- Implement per-rule iteration with evaluate(), error isolation, and diagnostic collection
- Implement unmappedTargets strategy ("null", "omit", "error") using SchemaTree
- Implement nullSubtrees application after rule evaluation
- Implement per-rule trace recording when `options.trace` is true
- Implement stats computation (rulesEvaluated, rulesSucceeded, rulesFailed, durationMs)
- Implement optional pre-flight validation via `options.validateBeforeExecute`
- Ensure execute does not mutate sourceData, config, or options inputs
- Rewrite existing stub tests to cover real behavior
- Add comprehensive unit, integration, and performance tests
- Update `forge/architecture/mapping-engine.md` with execute pipeline internals

### Out of Scope

- Validation pipeline changes (FS-006, already complete)
- Schema parsing or schema lifecycle management
- AI features
- UI integration or Lambda infrastructure
- Production orchestration (Step Functions, snapshots)
- Deployment snapshot creation
- Server-side preview endpoint
- New DSL functions or parser changes
- Changes to evaluate() or any function implementations

---

## Non-Goals

- This spec does not implement streaming or incremental execution — all rules are evaluated synchronously in a single pass.
- This spec does not optimize for parallel rule evaluation — rules execute sequentially in array order.
- This spec does not add new diagnostic codes — it uses existing codes from `src/engine/diagnostics/codes.ts` (W005 for unmapped targets, and diagnostic codes from parse/evaluate).
- This spec does not implement config migration or version compatibility checks.

---

## Relevant Areas

- `src/engine/execute.ts` — main implementation target
- `src/engine/execute/` — new directory for execute utilities (set-at-path, ast-cache)
- `src/engine/types/results.ts` — ExecutionResult, TraceEntry, new ExecutionStats
- `src/engine/types/options.ts` — EngineOptions extensions
- `src/engine/types/index.ts` — barrel exports for new types
- `src/engine/index.ts` — public API exports (verify ExecutionStats export)
- `tests/engine/execute.test.ts` — rewritten stub tests
- `tests/engine/execute/` — new test files for utilities and integration
- `forge/architecture/mapping-engine.md` — architecture update
- `forge/architecture/project-structure.md` — if new files/folders are created

---

## Dependencies / Blockers

- Depends on FS-001 (completed) — engine scaffold, execute stub
- Depends on FS-002 (completed) — DSL parser (parse())
- Depends on FS-003 (completed) — DSL evaluator (evaluate())
- Depends on FS-004 (completed) — core DSL function implementations
- Depends on FS-005 (completed) — array functions and scope stack
- Depends on FS-006 (completed) — validate pipeline (for pre-flight validation and SchemaTree)

---

## Constraints

- Zero runtime dependencies — pure TypeScript only
- Must run identically in browser and Lambda — no Node-specific APIs (no `process.hrtime`, use `performance.now()` or `Date.now()` for timing)
- No I/O — all inputs passed in, all outputs returned
- Must not mutate input sourceData, config, or options objects
- Performance: 500 rules in < 2 seconds in-browser
- Must handle errors gracefully — one failing rule does not crash the pipeline
- Execute does NOT call validate() by default — validation is a separate concern; `options.validateBeforeExecute` (default: false) enables optional pre-flight
- TypeScript strict mode, no `any` in public API
- Deterministic — same config + sourceData + options always produces same output (excluding timing fields like `durationMs`)

---

## Proposed Behavior

### User Flow

The execute pipeline is invoked programmatically — there is no direct user interaction. Consumers call `execute(config, sourceData, sourceSchema, targetSchema, options?)` and receive an `ExecutionResult` with the transformed output, diagnostics, optional trace, and optional stats.

In the Mapping Editor, the client-side preview calls execute with the current mapping config and sample source data. Trace mode provides step-by-step debugging data for each rule. In Lambda, the same function processes production transformation requests.

### System Behavior

#### Phase 1: Optional Pre-flight Validation

If `options.validateBeforeExecute` is true, call `validate(config, sourceSchema, targetSchema, options)`. If validation returns `valid: false` (any error-severity diagnostic), abort execution immediately and return an `ExecutionResult` with `output: null`, the validation diagnostics, no trace, and stats showing zero rules evaluated.

#### Phase 2: Parse All Rule Expressions

For each rule in `config.rules`, parse the expression string into an AST using `parse(expression, { registry })`. Cache parsed ASTs by expression string — if the same expression string has been seen (within this execution or across executions of the same config), reuse the cached AST.

If parsing fails (AST is null), emit the parse diagnostics with `ruleIndex`, `targetPath`, and `expression` metadata attached. The rule's target field receives `null` in the output (or is omitted per config). Continue to the next rule.

#### Phase 3: Build Execution Context

Construct an `EvaluationContext` for rule evaluation:

- `sourceData` — the input data passed to execute()
- `constants` — from `config.config.constants`
- `externalSources` — from `options.externalSources` (default: `{}`)
- `registry` — the default function registry (or injected via options in future)
- `options` — engine options (trace, maxRecursionDepth, etc.)
- `scopeStack` — initially empty array
- `evaluate` — the evaluate function itself (for re-entrant calls from array functions)
- `addDiagnostic` — callback that appends to the current rule's diagnostic collection
- `pushScope` / `popScope` — scope stack management functions
- `currentItem` / `parentItem` — initially undefined (set by evaluator from scope stack)

#### Phase 4: Iterate Rules and Evaluate

For each rule in `config.rules` (array order, index 0 to N-1):

1. Retrieve or parse the rule's AST (from cache or fresh parse)
2. If AST is null (parse failure), skip evaluation — target gets null, diagnostics already collected
3. Reset the scope stack to empty for each rule (rules are independent at the top level)
4. Evaluate the AST against the execution context
5. Collect the result value and any diagnostics emitted during evaluation
6. If the evaluation produced an error-severity diagnostic, the rule's value is null
7. If trace mode is enabled, record a `TraceEntry` for this rule
8. Place the result value at the rule's target path in the output object using dot-notation path assembly

#### Phase 5: Target Path Assembly

Build the output object by setting values at target paths:

- Dot-notation paths create nested objects (e.g., `"Order.Header.DocumentType"` creates `{ Order: { Header: { DocumentType: <value> } } }`)
- Array target paths store array values directly (e.g., `"Order.LineItems"` when the value is an array)
- Intermediate objects are auto-created — setting `"Order.Header.DocumentType"` auto-creates `Order` and `Order.Header` as objects if they don't exist
- Conflicting paths: if two rules target the same path (one as object, one as scalar), the last rule wins with a warning diagnostic. If rule A sets `"Order.Header"` to `{ x: 1 }` and rule B sets `"Order.Header"` to `"flat"`, the output has `"Order.Header": "flat"` because B runs after A (last write wins)

#### Phase 6: Apply Bulk Behaviors

After all rules have been evaluated:

**Unmapped targets** (`config.config.unmappedTargets`):
- `"omit"` (default) — leave unmapped target schema fields absent from the output. No additional action needed.
- `"null"` — set all target schema fields that have no mapping rule to `null` in the output. Requires building a SchemaTree from targetSchema to enumerate required leaf paths, then setting each unmapped path to `null`.
- `"error"` — emit `KEYRA-W005` for each required target field with no mapping rule. The diagnostic message includes the field path. The field itself is left absent from the output.

**Null subtrees** (`config.config.nullSubtrees`):
- For each path in the array, set the field and all its descendants in the output to `null`.
- Null subtrees override any values that rules may have placed at those paths.
- Applied after rule evaluation but before final output assembly (i.e., after unmapped targets have been applied).
- If a nullSubtree path refers to a non-existent path in the output, it is silently ignored (no diagnostic).

#### Phase 7: Assemble Final Output

Produce the `ExecutionResult`:

- `output` — the transformed data object
- `diagnostics` — all diagnostics from parsing, evaluation, and bulk behavior application, sorted by ruleIndex (ascending, undefined-ruleIndex last), then by severity (error > warning > info)
- `trace` — present only when `options.trace` is true; ordered list of TraceEntry objects (one per rule evaluated)
- `stats` — execution statistics: `{ rulesEvaluated, rulesSucceeded, rulesFailed, durationMs }`

### Failure / Edge Behavior

- **Empty rules array**: Returns `{ output: {}, diagnostics: [], stats: { rulesEvaluated: 0, rulesSucceeded: 0, rulesFailed: 0, durationMs: <n> } }`.
- **All rules fail**: Returns output with all target paths set to null (or omitted), with all error diagnostics collected. Pipeline does not abort.
- **Parse failure on one rule**: That rule's target gets null; all other rules are evaluated normally. Parse diagnostics are included in the result.
- **Runtime error in evaluation (E005, E050, etc.)**: That rule's target gets null; pipeline continues. The error diagnostic is included in the result.
- **External source missing**: evaluator emits E012 (warning); rule returns null for the external call; pipeline continues.
- **Constant missing**: evaluator emits E011 (error); rule returns null; pipeline continues.
- **validateBeforeExecute fails**: Execution aborts with `output: null`, validation diagnostics returned.
- **Circular or conflicting target paths**: Last rule wins. If rule A sets `"Order.Header"` to an object and rule B sets `"Order.Header.X"` which requires `Order.Header` to be an object, and rule C sets `"Order.Header"` to a scalar, C's scalar overwrites A's object and B's nested value is lost. This is by design (documented in DSL spec §6.1).
- **nullSubtrees with nested paths**: Setting `"Order"` to null also nullifies `"Order.Header"`, `"Order.Header.DocumentType"`, etc. The entire subtree becomes null.
- **targetSchema is null/undefined when unmappedTargets is "null" or "error"**: Skip the unmapped targets pass silently — there's no schema to introspect. Emit no diagnostic for this case (the validate pipeline handles schema presence checks).

---

## Acceptance Examples

### AE-01 — Single rule produces correct output at target path

**Given**
- Config with one rule: `{ target: "OrderType", type: "string", expression: 'source("type")' }`
- Source data: `{ type: "PO" }`

**When**
- execute() is called

**Then**
- `result.output` is `{ OrderType: "PO" }`
- `result.diagnostics` is empty
- `result.stats.rulesEvaluated` is 1
- `result.stats.rulesSucceeded` is 1

### AE-02 — Multiple rules produce nested output object

**Given**
- Config with rules:
  - `{ target: "Order.Header.DocType", expression: 'source("header.docType")' }`
  - `{ target: "Order.Header.Date", expression: 'source("header.date")' }`
  - `{ target: "Order.Total", expression: 'source("total")' }`
- Source data: `{ header: { docType: "PO", date: "2026-01-01" }, total: 100 }`

**When**
- execute() is called

**Then**
- `result.output` is `{ Order: { Header: { DocType: "PO", Date: "2026-01-01" }, Total: 100 } }`

### AE-03 — Rule ordering: last write wins for same target path

**Given**
- Config with rules:
  - `{ target: "Status", expression: 'static("draft")' }`
  - `{ target: "Status", expression: 'static("final")' }`

**When**
- execute() is called

**Then**
- `result.output` is `{ Status: "final" }`

### AE-04 — Parse error: diagnostic emitted, target null, other rules unaffected

**Given**
- Config with rules:
  - `{ target: "Good", expression: 'static("ok")' }`
  - `{ target: "Bad", expression: 'invalid!!!syntax' }`
  - `{ target: "AlsoGood", expression: 'static("fine")' }`

**When**
- execute() is called

**Then**
- `result.output.Good` is `"ok"`
- `result.output.AlsoGood` is `"fine"`
- `result.diagnostics` contains at least one error with code `KEYRA-E001` and `ruleIndex: 1`
- `result.stats.rulesFailed` is 1
- `result.stats.rulesSucceeded` is 2

### AE-05 — Runtime error per rule doesn't abort pipeline

**Given**
- Config with rules:
  - `{ target: "A", expression: 'divide(10, 0)' }` (triggers E050)
  - `{ target: "B", expression: 'static("ok")' }`

**When**
- execute() is called

**Then**
- `result.output.B` is `"ok"`
- `result.diagnostics` contains a diagnostic with code `KEYRA-E050`
- `result.stats.rulesFailed` is 1
- `result.stats.rulesSucceeded` is 1

### AE-06 — unmappedTargets: "null" sets unmapped required fields to null

**Given**
- Config with unmappedTargets: "null", one rule for "Order.Type"
- Target schema with required fields: "Order.Type", "Order.Status", "Order.Priority"

**When**
- execute() is called

**Then**
- `result.output.Order.Type` has the rule's value
- `result.output.Order.Status` is `null`
- `result.output.Order.Priority` is `null`

### AE-07 — unmappedTargets: "omit" leaves unmapped fields absent

**Given**
- Config with unmappedTargets: "omit", one rule for "Order.Type"
- Target schema with required fields: "Order.Type", "Order.Status"

**When**
- execute() is called

**Then**
- `result.output.Order.Type` has the rule's value
- `result.output.Order` does NOT have a `Status` property

### AE-08 — unmappedTargets: "error" emits W005 for unmapped required fields

**Given**
- Config with unmappedTargets: "error", one rule for "Order.Type"
- Target schema with required fields: "Order.Type", "Order.Status"

**When**
- execute() is called

**Then**
- `result.diagnostics` contains a diagnostic with code `KEYRA-W005` and the path `Order.Status`
- `result.output.Order` does NOT have a `Status` property

### AE-09 — nullSubtrees overrides rule values

**Given**
- Config with nullSubtrees: ["Order.Header"], rules:
  - `{ target: "Order.Header.Type", expression: 'static("PO")' }`
  - `{ target: "Order.Total", expression: 'static(100)' }`

**When**
- execute() is called

**Then**
- `result.output.Order.Header` is `null`
- `result.output.Order.Total` is `100`

### AE-10 — Trace mode records entries per rule

**Given**
- Config with two rules
- Options: `{ trace: true }`

**When**
- execute() is called

**Then**
- `result.trace` is defined and has length 2
- `result.trace[0].ruleIndex` is 0
- `result.trace[1].ruleIndex` is 1
- Each trace entry has `targetPath`, `expression`, and `outputValue`

### AE-11 — External sources resolve correctly

**Given**
- Config with one rule: `{ target: "Rate", expression: 'external("exchangeRate")' }`
- Config declares `externalSources: ["exchangeRate"]`
- Options: `{ externalSources: { exchangeRate: 1.25 } }`

**When**
- execute() is called

**Then**
- `result.output.Rate` is `1.25`
- `result.diagnostics` is empty

### AE-12 — Missing external emits E012 warning

**Given**
- Config with one rule: `{ target: "Rate", expression: 'external("missing")' }`
- Config declares `externalSources: ["missing"]`
- Options: `{ externalSources: {} }`

**When**
- execute() is called

**Then**
- `result.diagnostics` contains a diagnostic with code `KEYRA-E012`
- Pipeline continues (no abort)

### AE-13 — Constants resolve from config

**Given**
- Config with constants: `{ VERSION: "2.0" }`, one rule: `{ target: "Ver", expression: 'constant("VERSION")' }`

**When**
- execute() is called

**Then**
- `result.output.Ver` is `"2.0"`

### AE-14 — AST caching: same expression not re-parsed

**Given**
- Config with two rules that share the same expression string `'static("same")'`

**When**
- execute() is called

**Then**
- Both target paths receive `"same"`
- The expression is parsed only once (verified via the AST cache returning the same object reference for both rules)

### AE-15 — Input immutability

**Given**
- sourceData: `{ a: 1 }`, config with rules

**When**
- execute() is called

**Then**
- sourceData is identical (deep equal) to its pre-execution state
- config is identical (deep equal) to its pre-execution state

### AE-16 — Stats computation

**Given**
- Config with 5 rules, 1 of which has a syntax error

**When**
- execute() is called

**Then**
- `result.stats.rulesEvaluated` is 5
- `result.stats.rulesSucceeded` is 4
- `result.stats.rulesFailed` is 1
- `result.stats.durationMs` is a positive number

### AE-17 — validateBeforeExecute aborts on validation errors

**Given**
- Config with a rule referencing a non-existent source path
- Source schema provided
- Options: `{ validateBeforeExecute: true }`

**When**
- execute() is called

**Then**
- `result.output` is `null`
- `result.diagnostics` contains validation diagnostics (e.g., E030)
- `result.stats.rulesEvaluated` is 0

### AE-18 — Array function integration: map() produces array at target path

**Given**
- Config with one rule: `{ target: "Names", type: "array", expression: 'map(source("items"), item("name"))' }`
- Source data: `{ items: [{ name: "A" }, { name: "B" }] }`

**When**
- execute() is called

**Then**
- `result.output.Names` is `["A", "B"]`

### AE-19 — Performance: 500 rules in < 2 seconds

**Given**
- Config with 500 simple rules (each a `source("field_N")` expression)
- Source data with 1000 fields

**When**
- execute() is called

**Then**
- Execution completes in < 2000ms
- All 500 rules are evaluated successfully

---

## Open Questions

- none

---

## Verification Strategy

All acceptance examples require automated test coverage:

- **AE-01 through AE-05**: Unit tests in `tests/engine/execute/` for core execution, target path assembly, error handling
- **AE-06 through AE-09**: Unit tests for bulk behavior (unmappedTargets, nullSubtrees)
- **AE-10 through AE-13**: Unit tests for trace mode, external sources, constants
- **AE-14**: Unit test verifying AST cache behavior (same object reference or equivalent mechanism)
- **AE-15**: Unit test asserting deep equality of inputs before and after execution
- **AE-16**: Unit test verifying stats computation
- **AE-17**: Unit test for validateBeforeExecute abort
- **AE-18**: Integration test with array functions
- **AE-19**: Performance benchmark test (separate file, may use a longer timeout)

Additional verification:
- TypeScript strict mode typecheck passes
- Lint passes
- All existing engine tests continue to pass (no regressions)
- Full test suite runs successfully

---

## Task Generation Notes

### Decomposition strategy

1. **Type extensions first** — extend EngineOptions, ExecutionResult, TraceEntry before any implementation (foundational).
2. **Utilities next** — setAtPath (target path assembly) and AST cache as independently testable units.
3. **Core pipeline** — the main execute() orchestrator, which is the largest task. Depends on types and utilities.
4. **Bulk behaviors** — unmappedTargets and nullSubtrees as additions to the core pipeline. Depends on core pipeline.
5. **Trace, stats, validateBeforeExecute** — cross-cutting additions to the pipeline. Depends on core pipeline.
6. **Tests split by scope** — core execution tests, bulk behavior/trace tests, and integration/performance tests as separate tasks.
7. **Architecture update last** — needs all implementation to be complete.

### Agent assignment

All tasks are `Agent: task` — this is pure engine work with no UI surface.

### Parallelism

- T-01 (types) is foundational — all others depend on it.
- T-02 (utilities) depends only on T-01.
- T-03 (core pipeline) depends on T-01, T-02.
- T-04 (bulk behaviors) depends on T-03.
- T-05 (trace/stats/validateBeforeExecute) depends on T-03.
- T-04 and T-05 are independent of each other (can parallelize).
- T-06 (core tests) depends on T-03.
- T-07 (integration tests) depends on T-04, T-05.
- T-08 (architecture) depends on T-04, T-05.

---

## Change Log

- Rev 1 — 2026-05-01
  - Initial draft
