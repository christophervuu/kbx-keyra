# SPEC

## Title

Implement Core DSL Function Implementations

---

## ID

FS-004

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

Rev: 1

---

## Summary

Implement all non-array DSL functions defined in `specs/KEYRA-DSL-SPECIFICATION.md` §4 and register them in the engine's function registry. This includes ~37 functions across 8 categories (source access, type conversion, null handling, conditional logic, lookup, string operations, date operations, math operations). Each function is a self-contained pure implementation that receives evaluated arguments and an `EvaluationContext`, performs its core logic, and returns a result. The evaluator (FS-003) already handles dispatch, null propagation, arity/type checking, and scope stack context (E010/E013).

---

## Problem

The mapping engine has a complete expression evaluator (FS-003) that dispatches to registered functions, but the function registry is empty. No DSL functions are implemented yet, making the engine unable to evaluate any meaningful expression. Without function implementations, the engine cannot perform source access, type conversion, string manipulation, conditional logic, date formatting, math operations, or lookup table resolution.

---

## Goal

All non-array DSL functions from the specification are implemented, tested, and registered in the default function registry. After this spec is complete, the evaluator can execute any DSL expression that does not involve array-context functions (map, filter, find, flatten, merge, array, nth, first, get, join, count, split).

---

## Assumptions

- The expression evaluator (FS-003) is complete and correctly handles null propagation, arity checks, type checks, and scope stack context resolution.
- The evaluator calls `registered.implementation(args, invocationContext)` where `args` are pre-evaluated and `invocationContext` has `currentItem`/`parentItem` populated from the scope stack.
- The function registry (FS-001) supports `registerFunction(name, signature, implementation)`.
- `FunctionImplementation` type signature is `(args: readonly unknown[], context: EvaluationContext) => unknown`.
- The `resolvePath()` utility in `src/engine/dsl/resolve-path.ts` is complete and correct.
- Diagnostic codes in `src/engine/diagnostics/codes.ts` are already defined for all error/warning codes these functions need.

---

## Current Context

### Existing Infrastructure

The engine scaffold (FS-001) provides:
- `FunctionRegistry` class with `registerFunction`, `getFunction`, `hasFunction`, `listFunctions`
- `createRegistry()` factory for isolated test instances
- `defaultRegistry` singleton for production
- `FunctionSignature`, `FunctionImplementation`, `FunctionParameter` types

The evaluator (FS-003) provides:
- Full dispatch pipeline: registry lookup → arity check → argument evaluation → null propagation → type check → implementation call
- `handlesNull: true` flag on `FunctionSignature` bypasses null propagation (null args pass through to implementation)
- `withExecutionContext()` populates `currentItem`/`parentItem` from scope stack before dispatch
- E010/E013 checks for `item()`/`parent()` handled by evaluator before calling implementation
- Implementation throws are caught and converted to diagnostics

### Gap: Diagnostic Emission from Function Implementations

The current `FunctionImplementation` type returns `unknown` (just the value). Function implementations that need to emit diagnostics (e.g., `source` emitting W002, `constant` emitting E011, `divide` emitting E050) have no mechanism to do so. The evaluator's internal `state.diagnostics` array is not exposed to implementations.

This spec introduces an `addDiagnostic` callback on `EvaluationContext` that implementations call to emit function-specific diagnostics. The evaluator binds this callback to its internal diagnostics array when constructing the invocation context.

### File Organization

Currently `src/engine/` has no `functions/` directory. This spec introduces:
```
src/engine/functions/
  index.ts              Barrel — registers all functions into a given registry
  source-access.ts      source, item, parent, constant, external, static
  type-conversion.ts    cast
  null-handling.ts      default, coalesce, isNull
  conditional.ts        if, eq, neq, gt, gte, lt, lte, and, or, not
  lookup.ts             valueMap
  string.ts             concat, substring, upper, lower, trim, replace, replaceAll, contains, length
  date.ts               formatDate
  math.ts               add, subtract, multiply, divide, round, abs
```

---

## Scope

### In Scope

- Add `addDiagnostic` callback to `EvaluationContext` interface
- Update evaluator to bind `addDiagnostic` when creating invocation context
- Implement all non-array functions listed in the DSL spec §4:
  - **Source Access (6):** source, item, parent, constant, external, static
  - **Type Conversion (1):** cast
  - **Null Handling (3):** default, coalesce, isNull
  - **Conditional Logic (10):** if, eq, neq, gt, gte, lt, lte, and, or, not
  - **Lookup (1):** valueMap
  - **String Operations (9):** concat, substring, upper, lower, trim, replace, replaceAll, contains, length
  - **Date Operations (1):** formatDate
  - **Math Operations (6):** add, subtract, multiply, divide, round, abs
- Register all implementations in the default registry
- Unit tests for every function
- Architecture documentation update

### Out of Scope

- Array functions: map, filter, find, flatten, merge, array, nth, first, get — FS-005
- Array-input functions: join, count, split — FS-005 (they require array inputs and array-adjacent semantics)
- DSL parser changes (FS-002, complete)
- Expression evaluator logic changes beyond adding `addDiagnostic` (FS-003, complete)
- Schema validation (FS-006)
- Full execute pipeline (FS-007)
- Regex support in replace/replaceAll (DSL spec says literal string matching only)

---

## Non-Goals

- This spec does not aim to make the full engine pipeline operational end-to-end (that's FS-007).
- This spec does not implement any user-facing UI or API surface.
- This spec does not add external date libraries — `formatDate` is implemented with manual token parsing.

---

## Relevant Areas

- `src/engine/functions/` (new directory — all implementation files)
- `src/engine/dsl/types.ts` (add `addDiagnostic` to `EvaluationContext`)
- `src/engine/dsl/evaluator.ts` (bind `addDiagnostic` to invocation context)
- `src/engine/registry/function-registry.ts` (no changes expected, used via `defaultRegistry`)
- `src/engine/dsl/resolve-path.ts` (used by source/item/parent implementations)
- `src/engine/diagnostics/codes.ts` (referenced by implementations for code strings)
- `src/engine/diagnostics/format.ts` (used to format diagnostic messages)
- `src/engine/index.ts` (may need to re-export functions barrel)
- `tests/engine/functions/` (new — all test files)
- `forge/architecture/mapping-engine.md` (update)
- `forge/architecture/project-structure.md` (update)

---

## Dependencies / Blockers

- Depends on FS-001 (completed) — registry infrastructure
- Depends on FS-002 (completed) — parser (for integration testing context)
- Depends on FS-003 (completed) — evaluator handles dispatch, null propagation, type checking

---

## Constraints

- **Zero runtime dependencies** — all implementations are pure TypeScript, no external libraries
- **Pure functions** — no I/O, no side effects, no mutable globals
- **TypeScript strict mode** — no `any` in public types
- **Deterministic** — same inputs always produce same outputs
- **Case-sensitive** — function names are case-sensitive per DSL §2.2
- **No implicit type coercion** — functions assume correct types (evaluator validates)
- **formatDate** must implement all tokens (YYYY, MM, DD, HH, mm, ss, ISO8601) without external date libraries
- **round** uses "round half up" (not banker's rounding)
- **Functions do not validate arity or types** — they assume the evaluator has already done this
- **Functions do not handle null propagation** — except `handlesNull: true` functions which explicitly receive null

---

## Proposed Behavior

### User Flow

Not applicable — this is an engine-internal implementation. No UI surface.

### System Behavior

Each function implementation follows this pattern:

1. **Signature definition** — declares parameter names, types, required/optional, variadic, handlesNull flag
2. **Implementation function** — receives `(args: readonly unknown[], context: EvaluationContext) => unknown`
3. **Registration** — calls `registry.registerFunction(name, signature, implementation)`

The evaluator dispatches to registered functions after completing pre-checks. Function implementations:
- Can assume args match declared types (evaluator validates)
- Can assume non-null args for required params (evaluator propagates null, unless handlesNull)
- Emit diagnostics via `context.addDiagnostic(diagnostic)` for function-specific errors/warnings
- Return `null` when a function-specific error occurs (the diagnostic explains why)
- Return the computed value on success

#### handlesNull Functions

These functions receive null arguments directly (evaluator does not short-circuit):
- `default` — returns fallback when value is null
- `coalesce` — returns first non-null value
- `isNull` — returns true when value is null
- `if` — null condition treated as false
- `eq` — null-null returns true, null-other returns false
- `neq` — null-null returns false, null-other returns true
- `contains` — returns false if either argument is null
- `valueMap` — null value returns fallback

#### Diagnostic Emission Pattern

```typescript
// In a function implementation:
if (divisor === 0) {
  context.addDiagnostic({
    code: 'KEYRA-E050',
    severity: 'error',
    message: formatDiagnosticMessage('KEYRA-E050', {}),
  });
  return null;
}
```

### Failure / Edge Behavior

| Function | Error Case | Behavior |
|----------|-----------|----------|
| `source(path)` | Path resolves to null | Returns null + W002 |
| `item(path)` | No array context | E010 (handled by evaluator before call) |
| `parent(path)` | No nested context | E013 (handled by evaluator before call) |
| `constant(name)` | Undefined constant | Returns null + E011 |
| `external(name)` | Unavailable source | Returns null + E012 (warning) |
| `cast(value, type)` | Unsupported conversion | Returns null + E020 |
| `cast(value, type)` | Unknown target type | Returns null + E021 |
| `cast("abc", "number")` | Unparseable string | Returns null + E020 |
| `divide(a, 0)` | Division by zero | Returns null + E050 |
| `formatDate(v, in, out)` | Parse failure | Returns null + E040 |
| `valueMap(v, mappings)` | mappings not object | Returns null + E060 |
| `valueMap(v, mappings)` | No match, no fallback | Returns null + W003 |
| `valueMap(v, mappings, fb)` | No match, with fallback | Returns fallback + W003 |
| `concat(...args)` | Non-string non-null arg | E005 — but evaluator handles this via type check |
| `gt/gte/lt/lte(a, b)` | Non-number arg | E005 — evaluator handles via type check |
| `and/or(null, x)` | Null with definite result | Short-circuit to definite value |
| `and/or(null, null)` | Both null | Returns null |

---

## Acceptance Examples

### AE-01 — source() reads nested path from source data

**Given**
- sourceData: `{ "customer": { "firstName": "Christopher" } }`

**When**
- `source("customer.firstName")` is evaluated

**Then**
- Returns `"Christopher"`

### AE-02 — source() emits W002 for null-resolving path

**Given**
- sourceData: `{ "customer": { "firstName": "Christopher" } }`

**When**
- `source("customer.middleName")` is evaluated

**Then**
- Returns `null`
- Diagnostic W002 emitted with path `"customer.middleName"`

### AE-03 — constant() returns configured value

**Given**
- constants: `{ "COMPANY_CODE": "ACME" }`

**When**
- `constant("COMPANY_CODE")` is evaluated

**Then**
- Returns `"ACME"`

### AE-04 — constant() emits E011 for undefined constant

**Given**
- constants: `{ "COMPANY_CODE": "ACME" }`

**When**
- `constant("UNDEFINED_KEY")` is evaluated

**Then**
- Returns `null`
- Diagnostic E011 emitted

### AE-05 — cast() full matrix coverage

**Given**
- Various input values and target types

**When**
- `cast(42, "string")` → `"42"`
- `cast("3.14", "number")` → `3.14`
- `cast(0, "boolean")` → `false`
- `cast("true", "boolean")` → `true`
- `cast(true, "number")` → `1`
- `cast(false, "string")` → `"false"`
- `cast(null, "string")` → `null`

**Then**
- Each conversion matches the §3.3 cast matrix

### AE-06 — cast() emits E020 for unsupported conversion

**Given**
- An array value

**When**
- `cast(value, "string")` where value is `[1, 2, 3]`

**Then**
- Returns `null`
- Diagnostic E020 emitted with fromType `"array"`, toType `"string"`

### AE-07 — default() returns fallback for null

**Given**
- Arguments: `[null, "fallback"]`

**When**
- `default(null, "fallback")` is evaluated

**Then**
- Returns `"fallback"`

### AE-08 — coalesce() returns first non-null

**Given**
- Arguments: `[null, null, "found", "ignored"]`

**When**
- `coalesce(null, null, "found", "ignored")` is evaluated

**Then**
- Returns `"found"`

### AE-09 — if() treats null condition as false

**Given**
- Arguments: `[null, "yes", "no"]`

**When**
- `if(null, "yes", "no")` is evaluated

**Then**
- Returns `"no"`

### AE-10 — eq() with null-null returns true

**Given**
- Arguments: `[null, null]`

**When**
- `eq(null, null)` is evaluated

**Then**
- Returns `true`

### AE-11 — eq() with null and non-null returns false

**Given**
- Arguments: `[null, "hello"]`

**When**
- `eq(null, "hello")` is evaluated

**Then**
- Returns `false`

### AE-12 — and() null short-circuit behavior

**Given**
- Various null combinations

**When**
- `and(null, true)` → `null`
- `and(null, false)` → `false`
- `and(true, null)` → `null`
- `and(false, null)` → `false`

**Then**
- Short-circuit rules per DSL spec apply

### AE-13 — or() null short-circuit behavior

**Given**
- Various null combinations

**When**
- `or(null, false)` → `null`
- `or(null, true)` → `true`
- `or(true, null)` → `true`
- `or(false, null)` → `null`

**Then**
- Short-circuit rules per DSL spec apply

### AE-14 — valueMap() static lookup

**Given**
- Arguments: `["web", { "web": "WEB_PORTAL", "store": "RETAIL" }, "UNKNOWN"]`

**When**
- `valueMap("web", mappings, "UNKNOWN")` is evaluated

**Then**
- Returns `"WEB_PORTAL"`

### AE-15 — valueMap() no match emits W003

**Given**
- Arguments: `["mobile", { "web": "WEB_PORTAL" }, "UNKNOWN"]`

**When**
- `valueMap("mobile", mappings, "UNKNOWN")` is evaluated

**Then**
- Returns `"UNKNOWN"`
- Diagnostic W003 emitted

### AE-16 — concat() joins strings

**Given**
- Arguments: `["Hello", " ", "World"]`

**When**
- `concat("Hello", " ", "World")` is evaluated

**Then**
- Returns `"Hello World"`

### AE-17 — formatDate() reformats date

**Given**
- Arguments: `["2026-03-31T14:22:19Z", "ISO8601", "YYYY-MM-DD"]`

**When**
- `formatDate("2026-03-31T14:22:19Z", "ISO8601", "YYYY-MM-DD")` is evaluated

**Then**
- Returns `"2026-03-31"`

### AE-18 — formatDate() emits E040 on parse failure

**Given**
- Arguments: `["not-a-date", "YYYY-MM-DD", "MM/DD/YYYY"]`

**When**
- `formatDate("not-a-date", "YYYY-MM-DD", "MM/DD/YYYY")` is evaluated

**Then**
- Returns `null`
- Diagnostic E040 emitted

### AE-19 — divide() emits E050 for division by zero

**Given**
- Arguments: `[100, 0]`

**When**
- `divide(100, 0)` is evaluated

**Then**
- Returns `null`
- Diagnostic E050 emitted

### AE-20 — round() uses round-half-up

**Given**
- Various values

**When**
- `round(3.145, 2)` → `3.15`
- `round(3.7)` → `4`
- `round(2.5)` → `3`

**Then**
- Round half up is applied (not banker's rounding)

### AE-21 — contains() returns false for null arguments

**Given**
- Arguments with null

**When**
- `contains(null, "test")` → `false`
- `contains("hello", null)` → `false`

**Then**
- Returns `false` (does not propagate null)

### AE-22 — substring() with negative index

**Given**
- Arguments: `["Hello", -3]`

**When**
- `substring("Hello", -3)` is evaluated

**Then**
- Returns `"llo"`

### AE-23 — external() emits E012 warning for unavailable source

**Given**
- externalSources: `{}` (empty)

**When**
- `external("carrierLookup")` is evaluated

**Then**
- Returns `null`
- Diagnostic E012 (warning severity) emitted

### AE-24 — static() returns value unchanged

**Given**
- Arguments: `["KEYRA_DEMO"]`

**When**
- `static("KEYRA_DEMO")` is evaluated

**Then**
- Returns `"KEYRA_DEMO"`

### AE-25 — All functions registered in default registry

**Given**
- Default registry after initialization

**When**
- All function implementations are registered

**Then**
- `defaultRegistry.hasFunction("source")` → `true`
- `defaultRegistry.hasFunction("cast")` → `true`
- `defaultRegistry.hasFunction("formatDate")` → `true`
- ... (all 37 functions present)

---

## Open Questions

- none

---

## Verification Strategy

- **Unit tests** for every function implementation covering: happy path, null inputs, edge cases, diagnostic emission
- **cast**: test every cell in the §3.3 matrix (string↔number, string↔boolean, number↔boolean, null→each, array/object→each)
- **formatDate**: test every token individually, test ISO8601 as input and output, test invalid input → E040
- **valueMap**: test match, no-match with fallback, no-match without fallback, null value, non-object mappings → E060
- **eq/neq**: test null-null, null-value, value-value (same type), value-value (different type)
- **and/or**: test all null short-circuit combinations
- **Math functions**: test integers, floats, negative numbers, and division by zero
- **concat**: test 2+ args, verify evaluator catches type mismatch (integration test)
- **TypeScript typecheck** must pass for all new files
- **No runtime dependencies** — verify `package.json` unchanged
- All acceptance examples (AE-01 through AE-25) covered by automated tests

---

## Task Generation Notes

Decompose by category with an infrastructure task first and architecture update last:

1. **Infrastructure** (T-01) — Add `addDiagnostic` to `EvaluationContext`, update evaluator to bind it, create `src/engine/functions/` directory skeleton. This unblocks all function implementation tasks.
2. **Function categories** (T-02 through T-09) — One task per category. Each task implements all functions in the category, registers them, and provides full test coverage. These are parallelizable after T-01.
3. **Registration barrel** (T-10) — Create the barrel `src/engine/functions/index.ts` that calls all registrations, integrate into `defaultRegistry` population, and verify completeness.
4. **Architecture update** (T-11) — Update `mapping-engine.md` and `project-structure.md`.

All tasks are `Agent: task` (engine work, no UI).

Function implementation tasks (T-02–T-09) can execute in parallel once T-01 is complete. T-10 depends on all implementation tasks. T-11 depends on T-01 and T-10.

---

## Change Log

- Rev 1 — 2026-04-30
  - Initial draft
