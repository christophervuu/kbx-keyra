# SPEC

## Title

Implement the Full validate() Pipeline

---

## ID

FS-006

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-04-30  
Last Updated: 2026-04-30    
Type: engine

---

## Status

completed

---

## Revision

Rev: 2

---

## Summary

Replace the `validate()` stub (from FS-001) with the complete static analysis implementation. The validator checks a mapping config against source and target schemas without executing rules against actual data. It catches path typos (E030/E031), type mismatches (E005), array context violations (E010/E013/E017), function arity problems (E002/E003), constant/external reference errors (E011/E012), coverage gaps, and duplicate target warnings. This is the hot path for the Mapping Editor's inline validation — runs on every rule change, zero backend dependency, must complete in < 2 seconds for 500 rules.

---

## Problem

The current `validate()` is a stub that always returns `{ valid: true, diagnostics: [] }`. This means:

- Business analysts get no feedback when they misspell a source or target path
- Type mismatches between rule output and target field type are undetectable until runtime execution
- Array context violations (`item()` outside `map()`, `parent()` without nested context) surface only at execution time
- Invalid constant/external references are silent until data flows through
- The Mapping Editor cannot provide inline validation UX as specified in §9.2

Without static validation, errors that should be caught during mapping authoring instead surface during preview or production execution — violating the TTFSM (Time To First Successful Mapping) target.

---

## Goal

A fully functional `validate()` that statically analyzes any `MappingConfig` against source and target schemas, returning:

- All syntax, path, type, context, reference, and arity errors as `Diagnostic` objects with rule-level location
- Coverage statistics showing what percentage of required target fields have mapping rules
- A `valid` boolean that is `false` if any error-severity diagnostic exists

The validator must be pure, client-side capable, and fast enough for interactive use (< 2s for 500 rules).

---

## Assumptions

- The parser (`parse()` from FS-002) is complete and stable
- The function registry (from FS-004/FS-005) is populated with all built-in function signatures
- Schemas will initially be supplied as JSON Schema objects; XSD support is deferred (stub acceptable)
- The existing `Diagnostic` type already supports `ruleIndex`, `targetPath`, and `expression` fields
- Error codes E030, E031, E005, E010, E013, E017, E011, E012 are already defined in `diagnostics/codes.ts`
- The validator does not need access to source data — all checks are static against schema structure

---

## Current Context

### Existing validate.ts

The current implementation at `src/engine/validate.ts` is a no-op stub:

```typescript
export function validate(
  config: MappingConfig,
  sourceSchema: unknown,
  targetSchema: unknown,
  options?: EngineOptions,
): ValidationResult {
  return { valid: true, diagnostics: [] };
}
```

### Current ValidationResult Type

```typescript
export interface ValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly coverage?: number;
}
```

The `coverage` field is a simple `number` — the requirements call for a richer structure with total/mapped/percentage/unmappedFields.

### Schema Parameters

The validate function currently accepts `sourceSchema: unknown` and `targetSchema: unknown`. This spec introduces a `SchemaTree` interface that the validator operates on internally, plus a lightweight adapter to convert JSON Schema to SchemaTree. The public API continues to accept raw JSON Schema objects — the validator converts internally and caches the resulting `SchemaTree` via a `WeakMap<object, SchemaTree>` keyed on the schema object reference. This means repeated calls with the same schema object (e.g., on every keystroke in the Mapping Editor) pay the conversion cost only once.

### Available Infrastructure

- `parse(expression, { registry })` returns `{ success, ast, diagnostics }` — already handles E001/E002/E003/E004
- `FunctionSignature` on each registered function provides parameter types and return type
- `FunctionRegistry` provides lookup by name and listing of all functions
- `AstNode` discriminated union with `FunctionCall`, literals, `ObjectTemplate`
- All error codes needed are already defined in `diagnostics/codes.ts`

---

## Scope

### In Scope

- `SchemaTree` interface definition (path existence lookup, type-at-path, required field listing, array detection)
- JSON Schema → SchemaTree adapter (minimal, validation-focused) with WeakMap caching
- XSD → SchemaTree stub (returns permissive tree with `hasPath` always true, emits `info` diagnostic)
- `KEYRA-W006` warning code for duplicate target detection
- Expansion of `ValidationResult` type to include structured coverage data
- Full validate() pipeline implementation:
  - Parse all rule expressions (collect syntax errors)
  - Source path validation (E030)
  - Target path validation (E031)
  - Type compatibility checking — rule output vs target declared type (E005)
  - Array context validation (E010, E013, E017)
  - Function arity/signature validation (E002, E003, E005 for arguments)
  - Constant reference validation (E011)
  - External reference validation (E012, warning)
  - Coverage computation (required target fields mapped percentage)
  - Duplicate target detection (warning)
- Static type inference utility (best-effort inference of AST expression output type)
- Unit tests for each validation pass
- Integration tests for full pipeline
- Architecture documentation update

### Out of Scope

- Runtime execution of rules against actual data (FS-007)
- Full schema ingestion/storage pipeline (backend concern)
- Schema editing or modification
- AI-powered validation (§13.3)
- Server-side preview execution
- Performance optimization beyond meeting the < 2s target
- Full XSD parsing (placeholder/stub only)
- UI integration (the UI consuming validate() is a separate spec)

---

## Non-Goals

- Replace or modify the parser (FS-002) — validate uses it as-is
- Replace or modify the evaluator (FS-003) — validate is static, not execution
- Implement runtime type checking (that's the evaluator's job at execution time)
- Schema version management or migration

---

## Relevant Areas

- `src/engine/validate.ts` — primary implementation target
- `src/engine/types/results.ts` — ValidationResult type expansion
- `src/engine/types/` — new SchemaTree types
- `src/engine/validate/` — new directory for validation sub-modules
- `src/engine/diagnostics/codes.ts` — add KEYRA-W006 for duplicate targets
- `tests/engine/validate/` — test directory
- `forge/architecture/mapping-engine.md` — architecture update

---

## Dependencies / Blockers

- Depends on FS-001 (completed) — engine scaffold
- Depends on FS-002 (completed) — parser provides parse()
- Depends on FS-003 (completed) — evaluator types (EvaluationContext, AstNode)
- Depends on FS-004 (completed) — function registry with signatures
- Depends on FS-005 (completed) — array function signatures (map/filter/find)

---

## Constraints

- **Zero runtime dependencies** — pure TypeScript, no external packages
- **Client-side capable** — no I/O, no backend calls, no Node-only APIs
- **Performance** — validate 500 rules against schemas with 1000+ fields in < 2 seconds on modern browser
- **Graceful degradation** — malformed/partial configs produce diagnostics, never throw
- **`valid` semantics** — false if ANY diagnostic has severity `error`; warnings don't affect `valid`
- **Location data** — every rule-level diagnostic must include `ruleIndex` and `targetPath`
- **Deterministic** — same config + schemas always produces same ValidationResult
- **TypeScript strict** — no `any` in public interface types

---

## Proposed Behavior

### User Flow

The Mapping Editor calls `validate(config, sourceSchema, targetSchema)` on every rule change. The returned diagnostics are displayed inline next to the relevant rule. Coverage percentage is shown in the mapping status bar. The call is synchronous and completes within the UI's responsiveness budget.

### System Behavior

The validate pipeline executes these passes in order:

1. **Parse pass** — parse each `rule.expression` via `parse(expr, { registry })`. Collect any diagnostics (E001–E004) with `ruleIndex` and `targetPath` attached. Rules with fatal parse errors (no AST) are excluded from subsequent passes but their diagnostics are retained.

2. **Source path pass** — for every `source("path")` call found in successfully parsed ASTs, check that `path` exists in the source SchemaTree. Emit E030 if not found.

3. **Target path pass** — for every `rule.target`, check that the path exists in the target SchemaTree. Emit E031 if not found.

4. **Duplicate target pass** — detect rules with identical `target` values. Emit a warning diagnostic for each duplicate (last-write-wins at runtime, but likely a mistake).

5. **Type compatibility pass** — infer the output type of each rule's expression (using function signatures) and compare against the target field's declared type in the target schema. Emit E005 on mismatch. Skip when type cannot be statically determined.

6. **Array context pass** — walk each rule's AST:
   - `item()` must appear inside `map()`/`filter()`/`find()` → E010
   - `parent()` must appear inside 2+ levels of array nesting → E013
   - `filter()`/`find()` conditions must have inferred boolean return type → E017

7. **Function validation pass** — for each function call in each AST:
   - Function exists in registry → E002 (already caught by parse, but re-affirmed)
   - Argument count matches signature → E003 (already caught by parse)
   - Argument types where statically inferrable → E005

8. **Constant/external pass** — verify:
   - `constant("name")` references exist in `config.constants` → E011
   - `external("name")` references exist in `config.externalSources` → E012 (warning)

9. **Coverage pass** — compute target field coverage:
   - Walk target SchemaTree for all required leaf fields
   - Count how many have a corresponding rule in `rules[]` (matched by `rule.target`)
   - Return as structured coverage data

10. **Aggregate** — combine all diagnostics, compute `valid` (no errors), attach coverage, return `ValidationResult`.

### Failure / Edge Behavior

- **Malformed expression** — parse() returns diagnostics, AST is null. Validation continues for other rules. The failing rule's parse diagnostics are included in the result.
- **Empty rules array** — valid=true, coverage computed (0% if required fields exist, 100% if no required fields).
- **Null/undefined schema** — if source or target schema is null/undefined/unresolvable, skip schema-dependent checks (path validation, type checking, coverage). Include a warning diagnostic indicating schema unavailability.
- **XSD schema detected** — return a permissive SchemaTree where `hasPath()` always returns `true`, `getTypeAtPath()` returns `undefined`, and `getRequiredLeafPaths()` returns `[]`. Emit a single `info`-severity diagnostic: "XSD schema support is not yet implemented — schema-dependent validation checks are skipped". This means E030/E031 never fire (no false positives), type checks are skipped (type unknown), and coverage shows 100% (no required fields detected). `valid` remains true.
- **Unknown function in AST** — already caught by parse with registry. If no registry provided, skip function-level validation.
- **Type inference failure** — when expression type cannot be statically determined (e.g., `source()` depends on runtime data), skip type check for that rule gracefully.
- **Schema with no required fields** — coverage is 100% (vacuously true).
- **Rule with empty target** — unusual but should not crash. Include in duplicate detection if applicable.

---

## Acceptance Examples

### AE-01 — Valid source path produces no diagnostic

**Given**
- Source schema has path `customer.firstName` (type: string)
- Rule expression: `source("customer.firstName")`
- Rule target: `output.name` (exists in target schema, type: string)

**When**
- validate() is called

**Then**
- No E030 diagnostic for this rule
- No E005 diagnostic (types match)
- valid = true (assuming no other errors)

### AE-02 — Invalid source path produces E030

**Given**
- Source schema does NOT have path `customer.middleName`
- Rule expression: `source("customer.middleName")`
- Rule target: `output.middle`

**When**
- validate() is called

**Then**
- Diagnostic with code `KEYRA-E030`, severity `error`, message containing `customer.middleName`
- Diagnostic includes `ruleIndex` matching the rule's position and `targetPath` = `output.middle`
- valid = false

### AE-03 — Invalid target path produces E031

**Given**
- Target schema does NOT have path `output.nonexistent`
- Rule target: `output.nonexistent`
- Rule expression: `source("customer.name")`

**When**
- validate() is called

**Then**
- Diagnostic with code `KEYRA-E031`, severity `error`, path = `output.nonexistent`
- valid = false

### AE-04 — Type mismatch between rule output and target

**Given**
- Rule expression: `source("customer.age")` — source schema declares `customer.age` as number
- Rule target: `output.ageLabel` — target schema declares `output.ageLabel` as string
- No cast() wrapping

**When**
- validate() is called

**Then**
- Diagnostic with code `KEYRA-E005`, indicating expected `string`, got `number`
- Diagnostic includes `ruleIndex` and `targetPath`
- valid = false

### AE-05 — cast() makes type compatible

**Given**
- Rule expression: `cast(source("customer.age"), "string")`
- Rule target: `output.ageLabel` — target schema declares string

**When**
- validate() is called

**Then**
- No E005 diagnostic (cast output is string, target expects string)
- valid = true (no errors)

### AE-06 — item() outside array context produces E010

**Given**
- Rule expression: `item("name")` (not inside any map/filter/find)
- Rule target: `output.name`

**When**
- validate() is called

**Then**
- Diagnostic with code `KEYRA-E010`
- valid = false

### AE-07 — item() inside map() is valid

**Given**
- Rule expression: `map(source("items"), item("name"))`
- Rule target: `output.names` (array type in target schema)

**When**
- validate() is called

**Then**
- No E010 diagnostic
- No type mismatch (map returns array, target is array)

### AE-08 — parent() in single-level map produces E013

**Given**
- Rule expression: `map(source("items"), parent("something"))`
- Rule target: `output.values`

**When**
- validate() is called

**Then**
- Diagnostic with code `KEYRA-E013`
- valid = false

### AE-09 — parent() in nested map is valid

**Given**
- Rule expression: `map(source("departments"), map(item("employees"), parent("deptName")))`
- Rule target: `output.nested`

**When**
- validate() is called

**Then**
- No E013 diagnostic for `parent()` (it has 2 levels of nesting)

### AE-10 — filter() condition with non-boolean type produces E017

**Given**
- Rule expression: `filter(source("items"), item("name"))` — `item("name")` returns string, not boolean
- Source schema: `items[].name` is type string

**When**
- validate() is called

**Then**
- Diagnostic with code `KEYRA-E017`
- valid = false

### AE-11 — filter() condition with boolean type is valid

**Given**
- Rule expression: `filter(source("items"), gt(item("price"), 100))`
- Source schema: `items[].price` is type number

**When**
- validate() is called

**Then**
- No E017 diagnostic (gt() returns boolean)

### AE-12 — Undefined constant produces E011

**Given**
- Config constants: `{ "TAX_RATE": 0.1 }`
- Rule expression: `constant("MISSING_CONSTANT")`

**When**
- validate() is called

**Then**
- Diagnostic with code `KEYRA-E011`, message containing `MISSING_CONSTANT`
- valid = false

### AE-13 — Valid constant produces no diagnostic

**Given**
- Config constants: `{ "TAX_RATE": 0.1 }`
- Rule expression: `constant("TAX_RATE")`

**When**
- validate() is called

**Then**
- No E011 diagnostic

### AE-14 — Undeclared external produces E012 warning

**Given**
- Config externalSources: `["pricing"]`
- Rule expression: `external("undeclaredSource")`

**When**
- validate() is called

**Then**
- Diagnostic with code `KEYRA-E012`, severity `warning`
- valid = true (warnings don't affect valid)

### AE-15 — Coverage computation — all required mapped

**Given**
- Target schema has 3 required leaf fields: `output.a`, `output.b`, `output.c`
- Rules map to all three targets

**When**
- validate() is called

**Then**
- coverage.total = 3
- coverage.mapped = 3
- coverage.percentage = 100
- coverage.unmappedFields is empty or undefined

### AE-16 — Coverage computation — partial mapping

**Given**
- Target schema has 4 required leaf fields: `output.a`, `output.b`, `output.c`, `output.d`
- Rules map to `output.a` and `output.c` only

**When**
- validate() is called

**Then**
- coverage.total = 4
- coverage.mapped = 2
- coverage.percentage = 50
- coverage.unmappedFields includes `output.b` and `output.d`

### AE-17 — Duplicate target detection

**Given**
- Two rules both target `output.name`

**When**
- validate() is called

**Then**
- Warning diagnostic about duplicate target `output.name`
- valid = true (it's a warning, not an error)

### AE-18 — Malformed expression does not halt pipeline

**Given**
- Rule 0: expression `source("valid.path")` — valid
- Rule 1: expression `source("also.valid` — unterminated string (parse error)
- Rule 2: expression `source("another.valid")` — valid

**When**
- validate() is called

**Then**
- Rule 1 produces E001 diagnostic with ruleIndex=1
- Rules 0 and 2 are still fully validated (path checks, type checks, etc.)
- valid = false (due to rule 1's parse error)

### AE-19 — Empty config with no rules

**Given**
- Config with empty rules array: `rules: []`
- Target schema has 2 required fields

**When**
- validate() is called

**Then**
- valid = true (no error diagnostics)
- coverage.total = 2, coverage.mapped = 0, coverage.percentage = 0
- coverage.unmappedFields lists both required fields

### AE-20 — Config with only warnings remains valid

**Given**
- All rules are syntactically and structurally correct
- One rule uses `external("undeclared")` producing E012 warning

**When**
- validate() is called

**Then**
- valid = true
- diagnostics contains one E012 warning

### AE-21 — Type inference skipped when undeterminable

**Given**
- Rule expression: `source("customer.data")` — source schema declares `customer.data` as type `object` (opaque, no further type info)
- Rule target: `output.payload` — target expects object

**When**
- validate() is called

**Then**
- No E005 diagnostic (type matches or cannot be further refined — no false positive)

### AE-22 — Scalar rule targeting array field produces E005

**Given**
- Rule expression: `source("customer.name")` — returns string
- Rule target: `output.names` — target schema declares this as array

**When**
- validate() is called

**Then**
- Diagnostic with code `KEYRA-E005`, expected `array`, got `string`
- valid = false

---

## Open Questions

- none

---

## Verification Strategy

All acceptance examples (AE-01 through AE-22) require automated unit test coverage. Tests will be organized in `tests/engine/validate/`:

- `schema-tree.test.ts` — SchemaTree adapter correctness (path lookup, type lookup, required field listing)
- `source-path.test.ts` — E030 cases (AE-01, AE-02)
- `target-path.test.ts` — E031 cases (AE-03)
- `type-compatibility.test.ts` — E005 cases (AE-04, AE-05, AE-21, AE-22)
- `array-context.test.ts` — E010/E013/E017 cases (AE-06 through AE-11)
- `constants-externals.test.ts` — E011/E012 cases (AE-12 through AE-14)
- `coverage.test.ts` — Coverage computation cases (AE-15, AE-16, AE-19)
- `duplicate-targets.test.ts` — AE-17
- `integration.test.ts` — Full pipeline cases (AE-18, AE-19, AE-20)

Performance verification: a benchmark test with 500 rules and 1000+ field schema must complete in < 2 seconds.

TypeScript strict compilation must pass with no errors.

---

## Task Generation Notes

Decompose into these areas:

1. **SchemaTree foundation** (T-01) — interface + JSON Schema adapter. Everything else depends on this.
2. **Type expansion** (T-02) — ValidationResult type update. Small, foundational.
3. **Path validation** (T-03, T-04) — source and target path checks. Depend on SchemaTree.
4. **Type inference** (T-05) — utility that infers expression output type from AST + registry signatures. Used by T-06 and T-07.
5. **Type compatibility** (T-06) — uses T-05 to compare rule output vs target type.
6. **Array context** (T-07) — AST walking for item/parent/filter context. Uses T-05 for E017.
7. **Function/reference validation** (T-08) — constant + external checks.
8. **Coverage** (T-09) — requires SchemaTree for required field enumeration.
9. **Orchestrator** (T-10) — wires all passes together in validate.ts.
10. **Integration tests** (T-11) — end-to-end pipeline tests.
11. **Architecture** (T-12) — update mapping-engine.md.

All tasks are `Agent: task` (engine work, no UI).

Parallelization: T-03, T-04, T-05, T-08 can run in parallel after T-01/T-02 complete. T-06, T-07 depend on T-05. T-09 depends on T-01/T-02. T-10 depends on T-03–T-09. T-11 depends on T-10. T-12 depends on T-10.

---

## Change Log

- Rev 2 — 2026-04-30
  - Resolved Q1: KEYRA-W006 confirmed as the duplicate target warning code
  - Resolved Q2: Public API accepts raw JSON Schema; internal WeakMap caching of SchemaTree by reference
  - Resolved Q3: XSD stub returns permissive tree (hasPath=true, getType=undefined, requiredLeafs=[]) + info diagnostic
  - Removed Open Questions section (all resolved)
- Rev 1 — 2026-04-30
  - Initial draft
