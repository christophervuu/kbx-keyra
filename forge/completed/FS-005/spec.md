# SPEC

## Title

Implement Array Functions and Scope Stack Management

---

## ID

FS-005

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

Implement all array-related DSL functions (11 new implementations in `arrays.ts`) and wire them into the evaluator's scope stack. This includes the three scope-creating functions (`map`, `filter`, `find`) that are the most architecturally complex part of the engine — they call back into `evaluate()` for each element while pushing and popping scopes — plus array construction (`array`, `merge`, `flatten`, `first`, `nth`), array-to-scalar (`join`, `count`), and the `get()` accessor. The existing `item()`, `parent()`, and `source()` implementations (FS-004) already read from the scope stack context — this spec activates them by implementing the functions that push and pop scopes. The scope stack is the mechanism that makes `item()`, `parent()`, and `source()` resolve correctly at any nesting depth.

---

## Problem

The engine can parse DSL expressions and evaluate scalar functions, but has no ability to iterate over arrays, create scoped contexts, or produce array outputs. Array mapping is the most common transformation pattern in real-world integrations — without it, the engine cannot handle multi-element source-to-target transformations, cross-array lookups, filtering, or nested object construction.

The scope stack infrastructure exists structurally (defined in FS-003) but is inert — no functions push or pop from it, so `item()` and `parent()` cannot resolve in any real context.

---

## Goal

After this spec is implemented:
- All 11 new array functions are registered, callable, and compose correctly
- Existing `item()`, `parent()`, and `source()` resolve correctly via the scope stack (verified, not reimplemented)
- `map()` can transform arrays using both object template mode and expression mode
- `filter()` and `find()` iterate with boolean conditions, managing scope per element
- The scope stack correctly supports arbitrary nesting depth (within the 32-level recursion limit)
- Scope cleanup is guaranteed even when expression evaluation errors occur mid-iteration
- All null/empty behaviors match the specification table exactly

---

## Assumptions

- FS-003 (evaluator) is complete — `evaluate()`, `EvaluationContext`, `resolvePath()`, recursion depth tracking, and trace collection are functional
- FS-004 (core functions) is complete — `item()`, `parent()`, `source()` implementations exist in `src/engine/functions/source-access.ts` and read from `context.currentItem`/`context.parentItem`
- The evaluator's function dispatch currently evaluates all arguments before calling the function implementation
- `pushScope()`/`popScope()` operations exist structurally on the scope stack but have no consumers yet
- `ObjectTemplate` is a supported AST node type (parser produces it from `{ "key": expression }` syntax)
- The function registry supports variadic argument signatures (for `array()`, `merge()`)

---

## Current Context

The expression evaluator (FS-003) established the scope stack as a LIFO array on `EvaluationContext`. Before every function dispatch, the evaluator derives `currentItem` (top of stack) and `parentItem` (second-to-top). If missing, `item()` emits E010 and `parent()` emits E013.

The function implementations (FS-004) registered `item()`, `parent()`, and `source()` in `src/engine/functions/source-access.ts`. These implementations read from pre-resolved `context.currentItem` and `context.parentItem` — they assume the evaluator has already populated those fields from the scope stack.

The evaluator currently evaluates all function arguments eagerly before dispatch. This creates a design challenge for `map()`, `filter()`, and `find()` — their second argument (template/condition) must NOT be evaluated once with the current scope but rather re-evaluated per element with a new scope pushed. A lazy/deferred argument mechanism is needed.

Module structure: `src/engine/functions/` contains category files. Array functions will be added as a new `arrays.ts` category file and registered through the existing `registerAllFunctions()` barrel.

---

## Scope

### In Scope

- Lazy argument mechanism for scope-creating functions (evaluator dispatch change)
- `pushScope()`/`popScope()` operational wiring (if not already functional)
- Implementation of 11 new functions in `arrays.ts`:
  - Scope-creating: `map()`, `filter()`, `find()`
  - Array construction: `array()`, `merge()`, `flatten()`, `first()`, `nth()`
  - Array-to-scalar: `join()`, `count()`
  - Object accessor: `get()`
- Verification that existing `item()`, `parent()`, `source()` (in `source-access.ts`) work correctly with scope stack (no code changes expected — they already read from `context.currentItem`/`context.parentItem`)
- Object template evaluation within `map()` (nested templates supported)
- Null/empty behavior for all functions per DSL Arrays spec §5
- Error/warning diagnostics: E010, E013, E015, E016, E017, E018, E019, W004
- `try/finally` scope safety in all scope-creating functions
- Registration of all functions in the registry via `registerAllFunctions()`
- Comprehensive unit tests for each function
- Integration/composition tests covering §6 patterns
- Architecture update to `mapping-engine.md`

### Out of Scope

- Named scopes (§8.1 future extension)
- `sort()`, `distinct()`, `reduce()`, `groupBy()` (§8 future extensions)
- Schema validation of paths (FS-006)
- Full execute pipeline (FS-007)
- Any non-array function implementations already in FS-004
- Performance optimization (indexBy, hash maps for cross-reference)
- `split()` function (already in FS-004 string category)

---

## Non-Goals

- This spec does not introduce runtime performance guardrails for O(n*m) cross-reference patterns
- This spec does not implement validation-time detection of `item()` outside array context (that is FS-006 concern)
- This spec does not change the parser — `ObjectTemplate` AST nodes are already produced by FS-002
- This spec does not introduce a general "thunk" or "closure" concept to the DSL type system

---

## Relevant Areas

- `src/engine/functions/arrays.ts` (new file — 11 functions)
- `src/engine/functions/index.ts` (register array functions)
- `src/engine/functions/source-access.ts` (verify-only — no code changes expected per Q2 resolution)
- `src/engine/dsl/evaluator.ts` (lazy argument dispatch)
- `src/engine/dsl/types.ts` (lazyArgs field on FunctionSignature)
- `src/engine/types/registry.ts` (FunctionSignature type update)
- `tests/engine/functions/arrays.test.ts` (new file)
- `tests/engine/functions/arrays-integration.test.ts` (new file)
- `forge/architecture/mapping-engine.md` (architecture update)

---

## Dependencies / Blockers

- Depends on FS-001 (completed) — engine scaffold and registry
- Depends on FS-002 (completed) — DSL parser producing ObjectTemplate AST nodes
- Depends on FS-003 (completed) — evaluator, EvaluationContext, scope stack, resolvePath
- Depends on FS-004 (completed) — item/parent/source implementations, registerAllFunctions barrel

---

## Constraints

- Zero runtime dependencies (pure TypeScript)
- All functions are pure — scope manipulation happens via context, not global state
- Scope stack must be correctly maintained even if an expression throws — try/finally pattern mandatory
- `parent()` reaches exactly one level up — no depth parameter in v1.0
- Triple nesting is supported but `parent()` only reaches one level (documented limitation)
- Array functions must compose correctly: `map(filter(...), ...)`, `flatten(map(...))`, etc.
- Function names are case-sensitive per DSL spec §2.2
- `handlesNull: true` functions (`join`, `count`) must receive null arrays without short-circuiting
- 32-level recursion limit applies to nested evaluation (deeply nested templates count)
- `ObjectTemplate` evaluation must be recursive — nested templates are unlimited depth (bounded by recursion limit)

---

## Proposed Behavior

### User Flow

Not applicable — this is an engine-internal implementation. Users interact with array functions through the DSL expression builder in the mapping studio UI.

### System Behavior

#### Lazy Argument Mechanism

The evaluator's function dispatch is extended with a `lazyArgs` field on `FunctionSignature`. This is an array of argument indices (0-based) that should NOT be pre-evaluated. Instead, the raw `AstNode` is passed to the function implementation at those positions.

For `map(array, template)`: argument index 1 is lazy.
For `filter(array, condition)`: argument index 1 is lazy.
For `find(array, condition)`: argument index 1 is lazy.

The evaluator dispatch logic becomes:
1. Look up function in registry
2. Check arity
3. For each argument: if index is in `lazyArgs`, pass the AST node directly; otherwise, evaluate recursively
4. Run null propagation check (only on evaluated args)
5. Run type check (only on evaluated args)
6. Call implementation with mixed args (values + AST nodes)

#### Scope-Creating Function Pattern (map/filter/find)

```
function mapImpl(args, context):
  array = args[0]           // already evaluated to a value
  templateNode = args[1]    // raw AstNode (lazy)

  if array is null → return null
  if array is [] → return []

  results = []
  for element in array:
    context.pushScope(element)
    try:
      result = context.evaluate(templateNode, context)
      results.push(result.value)
      // collect diagnostics from result
    finally:
      context.popScope()

  return results
```

#### Object Template Evaluation

When `context.evaluate()` is called on an `ObjectTemplate` node, the evaluator:
1. Creates an empty object
2. For each property in the template, evaluates the value expression (which may call `item()`, `parent()`, etc.)
3. Assigns the result to the property key
4. Returns the completed object

Nested `ObjectTemplate` nodes are handled recursively by the same mechanism.

#### Scope Stack State

| Operation | Stack Before | Stack After |
|-----------|-------------|-------------|
| `map()` starts iterating element X | `[...existing]` | `[...existing, X]` |
| `map()` finishes element X | `[...existing, X]` | `[...existing]` |
| Nested `map()` iterating Y inside outer X | `[...existing, X]` | `[...existing, X, Y]` |
| `find()` inside `map()` testing candidate Z | `[...existing, X]` | `[...existing, X, Z]` |

#### Scope-Reading Resolution

| Function | Reads From | Stack Position |
|----------|-----------|----------------|
| `item(path)` | `scopeStack[top]` | Top |
| `parent(path)` | `scopeStack[top - 1]` | Second-to-top |
| `source(path)` | `context.sourceData` | Ignores stack entirely |

### Failure / Edge Behavior

#### Scope Safety

If an expression within `map()`/`filter()`/`find()` produces an error or throws:
- The scope MUST be popped (guaranteed by try/finally)
- The error is collected as a diagnostic
- For `map()`: the element produces `null` in the output array
- For `filter()`: the element is excluded
- For `find()`: the element is skipped (iteration continues)

#### Type Errors in Conditions

`filter()` and `find()` require boolean conditions:
- Non-boolean, non-null result → E017 diagnostic
- `null` condition → element excluded (for filter) / skipped (for find)
- Evaluation continues for remaining elements

#### Empty Results

- `filter()` producing `[]` → E016 warning (informational, execution continues)
- `find()` with no match → `null` + E019 warning

#### Out-of-Bounds Access

- `nth()` with index beyond array length → `null` + W004 warning
- Negative index: `-1` = last, `-2` = second-to-last, etc.

#### Null Propagation Exceptions

| Function | `handlesNull` | Null Input Behavior |
|----------|--------------|---------------------|
| `count()` | `true` | Returns `0` (not null) |
| `join()` | `true` | Null array returns `null`; null elements within array are skipped |
| `merge()` | `true` | Null arguments treated as empty (skipped) |
| `first()` | `false` | Standard: null → null |
| `nth()` | `false` | Standard: null → null |
| `flatten()` | `false` | Standard: null → null |
| `map()` | `true` | Null array → null (not short-circuited by propagation) |
| `filter()` | `true` | Null array → null |
| `find()` | `true` | Null array → null |

---

## Acceptance Examples

### AE-01 — Basic map() with object template

**Given**
- Source data: `{ "items": [{ "sku": "A", "name": "Alpha" }, { "sku": "B", "name": "Beta" }] }`
- Expression: `map(source("items"), { "code": item("sku"), "label": item("name") })`

**When**
- Expression is evaluated

**Then**
- Result: `[{ "code": "A", "label": "Alpha" }, { "code": "B", "label": "Beta" }]`
- No diagnostics

### AE-02 — map() expression mode with primitive array

**Given**
- Source data: `{ "tags": ["gift", "priority"] }`
- Expression: `map(source("tags"), upper(item("")))`

**When**
- Expression is evaluated

**Then**
- Result: `["GIFT", "PRIORITY"]`

### AE-03 — map() null array returns null

**Given**
- Source data: `{ "items": null }`
- Expression: `map(source("items"), { "x": item("y") })`

**When**
- Expression is evaluated

**Then**
- Result: `null`

### AE-04 — filter() keeps matching elements unchanged

**Given**
- Source data: `{ "items": [{ "price": 10 }, { "price": 50 }, { "price": 30 }] }`
- Expression: `filter(source("items"), gt(item("price"), 20))`

**When**
- Expression is evaluated

**Then**
- Result: `[{ "price": 50 }, { "price": 30 }]`
- Elements are originals (not transformed)

### AE-05 — filter() empty result emits E016 warning

**Given**
- Source data: `{ "items": [{ "price": 5 }, { "price": 10 }] }`
- Expression: `filter(source("items"), gt(item("price"), 100))`

**When**
- Expression is evaluated

**Then**
- Result: `[]`
- Diagnostics include E016 (warning severity)

### AE-06 — find() returns first match

**Given**
- Source data: `{ "items": [{ "id": 1 }, { "id": 2 }, { "id": 3 }] }`
- Expression: `find(source("items"), gt(item("id"), 1))`

**When**
- Expression is evaluated

**Then**
- Result: `{ "id": 2 }` (first match, not `{ "id": 3 }`)

### AE-07 — find() no match returns null with E019

**Given**
- Source data: `{ "items": [{ "id": 1 }] }`
- Expression: `find(source("items"), eq(item("id"), 99))`

**When**
- Expression is evaluated

**Then**
- Result: `null`
- Diagnostics include E019 (warning severity)

### AE-08 — item() outside array context emits E010

**Given**
- Source data: `{ "x": 1 }`
- Expression: `item("x")`
- Scope stack is empty

**When**
- Expression is evaluated

**Then**
- Result: `null`
- Diagnostics include E010 (error severity)

### AE-09 — parent() in nested map reads outer element

**Given**
- Source data: `{ "departments": [{ "name": "Eng", "employees": [{ "id": 1 }, { "id": 2 }] }] }`
- Expression: `map(source("departments"), { "staff": map(item("employees"), { "empId": item("id"), "dept": parent("name") }) })`

**When**
- Expression is evaluated

**Then**
- Result: `[{ "staff": [{ "empId": 1, "dept": "Eng" }, { "empId": 2, "dept": "Eng" }] }]`

### AE-10 — parent() in single-level map emits E013

**Given**
- Source data: `{ "items": [{ "x": 1 }] }`
- Expression: `map(source("items"), { "bad": parent("x") })`

**When**
- Expression is evaluated

**Then**
- Result: `[{ "bad": null }]`
- Diagnostics include E013 (error severity)

### AE-11 — source() always reads root inside nested map

**Given**
- Source data: `{ "orderId": "ORD-1", "items": [{ "sku": "A" }] }`
- Expression: `map(source("items"), { "sku": item("sku"), "order": source("orderId") })`

**When**
- Expression is evaluated

**Then**
- Result: `[{ "sku": "A", "order": "ORD-1" }]`

### AE-12 — Scope cleanup after map completes

**Given**
- A map() call completes successfully
- Subsequently, `item("x")` is evaluated outside any array context

**When**
- `item("x")` is evaluated after map() returns

**Then**
- Result: `null`
- Diagnostics include E010 (scope was correctly popped)

### AE-13 — Scope cleanup on error mid-iteration

**Given**
- Source data: `{ "items": [{ "x": 1 }, { "x": 2 }] }`
- map() is iterating; an expression error occurs on element 1

**When**
- The error occurs during evaluation of element 1's template

**Then**
- The scope is correctly popped (try/finally)
- Element 1 produces null in the result
- Element 2 is still processed (iteration continues)
- Result: `[null, <element 2 result>]`

### AE-14 — Cross-array lookup pattern (find + parent + get)

**Given**
- Source data:
```json
{
  "lineItems": [{ "lineId": "L1", "sku": "A" }, { "lineId": "L2", "sku": "B" }],
  "taxLines": [{ "lineRef": "L1", "tax": 5.0 }, { "lineRef": "L2", "tax": 3.0 }]
}
```
- Expression: `map(source("lineItems"), { "sku": item("sku"), "tax": get(find(source("taxLines"), eq(item("lineRef"), parent("lineId"))), "tax") })`

**When**
- Expression is evaluated

**Then**
- Result: `[{ "sku": "A", "tax": 5.0 }, { "sku": "B", "tax": 3.0 }]`

### AE-15 — array() builds array from individual elements

**Given**
- Source data: `{ "a": 1, "b": null, "c": 3 }`
- Expression: `array(source("a"), source("b"), source("c"))`

**When**
- Expression is evaluated

**Then**
- Result: `[1, null, 3]` (null element included)

### AE-16 — merge() concatenates arrays, skips null

**Given**
- Source data: `{ "x": [1, 2], "y": null, "z": [3] }`
- Expression: `merge(source("x"), source("y"), source("z"))`

**When**
- Expression is evaluated

**Then**
- Result: `[1, 2, 3]` (null arg skipped)

### AE-17 — flatten() removes one level of nesting

**Given**
- Source data: `{ "nested": [[1, 2], [3, [4]], [5]] }`
- Expression: `flatten(source("nested"))`

**When**
- Expression is evaluated

**Then**
- Result: `[1, 2, 3, [4], 5]` (only one level flattened)

### AE-18 — join() with null elements skipped

**Given**
- Source data: `{ "values": ["a", null, "b"] }`
- Expression: `join(source("values"), ",")`

**When**
- Expression is evaluated

**Then**
- Result: `"a,b"` (null skipped)

### AE-19 — count() null array returns 0

**Given**
- Source data: `{ "items": null }`
- Expression: `count(source("items"))`

**When**
- Expression is evaluated

**Then**
- Result: `0` (not null — exception to null propagation)

### AE-20 — get() reads field from object

**Given**
- Source data: `{ "items": [{ "sku": "A", "name": "Alpha" }] }`
- Expression: `get(first(source("items")), "name")`

**When**
- Expression is evaluated

**Then**
- Result: `"Alpha"`

### AE-21 — get() non-object emits E018

**Given**
- Expression: `get("not_an_object", "field")`

**When**
- Expression is evaluated

**Then**
- Result: `null`
- Diagnostics include E018 (error severity)

### AE-22 — nth() negative index

**Given**
- Source data: `{ "items": [10, 20, 30] }`
- Expression: `nth(source("items"), -1)`

**When**
- Expression is evaluated

**Then**
- Result: `30` (last element)

### AE-23 — nth() out of bounds emits W004

**Given**
- Source data: `{ "items": [10, 20] }`
- Expression: `nth(source("items"), 5)`

**When**
- Expression is evaluated

**Then**
- Result: `null`
- Diagnostics include W004 (warning severity)

### AE-24 — filter() then map() composition

**Given**
- Source data: `{ "items": [{ "price": 10, "name": "Cheap" }, { "price": 80, "name": "Premium" }] }`
- Expression: `map(filter(source("items"), gt(item("price"), 50)), { "label": item("name") })`

**When**
- Expression is evaluated

**Then**
- Result: `[{ "label": "Premium" }]`

### AE-25 — flatten(map()) pattern

**Given**
- Source data: `{ "depts": [{ "emps": [{ "id": 1 }] }, { "emps": [{ "id": 2 }, { "id": 3 }] }] }`
- Expression: `flatten(map(source("depts"), item("emps")))`

**When**
- Expression is evaluated

**Then**
- Result: `[{ "id": 1 }, { "id": 2 }, { "id": 3 }]`

### AE-26 — filter() non-boolean condition emits E017

**Given**
- Source data: `{ "items": [{ "x": 1 }] }`
- Expression: `filter(source("items"), item("x"))` (condition is number, not boolean)

**When**
- Expression is evaluated

**Then**
- Element is excluded (non-boolean treated as non-true)
- Diagnostics include E017 (error severity)

### AE-27 — Lazy argument: template is re-evaluated per element

**Given**
- Source data: `{ "items": [{ "n": 1 }, { "n": 2 }, { "n": 3 }] }`
- Expression: `map(source("items"), item("n"))`

**When**
- Expression is evaluated

**Then**
- Result: `[1, 2, 3]` (proves template expression is re-evaluated per element, not once)

---

## Open Questions

- none

---

## Verification Strategy

All acceptance examples (AE-01 through AE-27) require automated test coverage. No manual verification steps are needed — this is pure engine logic.

Test organization:
- `tests/engine/functions/arrays.test.ts` — unit tests for each array function (AE-01 through AE-23)
- `tests/engine/functions/arrays-integration.test.ts` — composition and pattern tests (AE-24 through AE-27, plus §6 pattern coverage)
- Scope stack correctness tests integrated into both files

Build/typecheck expectations:
- `tsc --noEmit` passes with no errors
- All existing tests continue to pass (no regressions in FS-001 through FS-004)
- New test files pass

---

## Task Generation Notes

Decompose into 7 tasks:

1. **T-01: Lazy argument infrastructure** — Add `lazyArgs` to FunctionSignature, update evaluator dispatch. This is a cross-cutting change that unblocks T-02 and T-03. Agent: `task`.
2. **T-02: Implement map()** — The most complex function. Depends on T-01. Object template mode + expression mode + scope push/pop + try/finally. Agent: `task`.
3. **T-03: Implement filter() and find()** — Same scope pattern as map() but with boolean conditions and different return semantics. Depends on T-01. Can parallelize with T-02. Agent: `task`.
4. **T-04: Implement array(), merge(), flatten(), first(), nth()** — Simpler functions with no scope creation. Can start independently of T-01 (no lazy args needed). Agent: `task`.
5. **T-05: Implement join(), count(), and get()** — Array-to-scalar and object accessor. handlesNull behavior. Can start independently. Agent: `task`.
6. **T-06: Integration and composition tests** — §6 pattern coverage, triple nesting, complex compositions. Depends on T-02, T-03, T-04, T-05. Agent: `task`.
7. **T-07: Architecture update** — Update mapping-engine.md with lazy args pattern, scope-creating function interaction, null/empty table. Depends on T-01 (design finalized). Agent: `task`.

T-04 and T-05 are independent of T-01 and can be worked in parallel with T-02/T-03.
T-06 depends on all implementation tasks.
T-07 can start once T-01 design is finalized.

---

## Change Log

- Rev 1 — 2026-04-30
  - Initial draft
  - Resolved Q1: Confirmed `lazyArgs` flag on `FunctionSignature` as the deferred argument mechanism (declarative, extensible, generic dispatch)
  - Resolved Q2: Confirmed `item()`/`parent()`/`source()` from FS-004 need no code changes — they already read from `context.currentItem`/`context.parentItem` populated by the evaluator
  - Resolved Q3: Confirmed file split — 11 array functions in new `arrays.ts`, scope-reading functions remain in `source-access.ts` (unchanged)
