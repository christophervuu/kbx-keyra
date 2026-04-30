# SPEC

## Title

Implement the KeyRa DSL Expression Evaluator

---

## ID

FS-003

---

## Metadata

Owner: @christophervuu
Reviewers: TBD
Created: 2026-04-30
Last Updated: 2026-04-30
Type: engine

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Build the expression evaluator — the core execution engine that takes a parsed AST node (from FS-002's parser) and a runtime context, recursively evaluates it, and produces a value. The evaluator implements null propagation, the scope stack for array contexts, function dispatch via the registry, path resolution, and runtime type checking. It is the bridge between parsing (FS-002) and the full mapping execution pipeline (FS-007).

---

## Problem

The engine can parse DSL expressions into AST nodes (FS-002) and has a function registry for dispatch (FS-001), but there is no component that takes an AST node and evaluates it against runtime data. Without the evaluator, expressions cannot produce values, and the execution pipeline cannot proceed.

---

## Goal

A pure `evaluate()` function that accepts any AST node and an `EvaluationContext`, recursively evaluates the expression tree, and returns an `EvaluationResult` containing the computed value and any diagnostics or trace entries collected during evaluation.

The evaluator must be deterministic, perform no I/O, handle arbitrarily nested expressions gracefully, and centralize null propagation logic so that individual function implementations do not need to handle it.

---

## Assumptions

- FS-002 parser produces well-formed AST nodes matching `AstNode` discriminated union in `src/engine/dsl/types.ts`
- The function registry (FS-001) is stable and provides `getFunction(name)` lookup
- The existing `FunctionSignature` type can be extended with a null-propagation bypass flag without breaking existing registrations (no functions are registered yet in production)
- The DSL specification (v1.1.0) null propagation rules in §3.4 are stable
- Array scoping rules in `specs/KEYRA-DSL-ARRAYS.md` §2 are stable
- The `FunctionImplementation` type signature will be updated to accept `EvaluationContext` — this is acceptable since no production function implementations exist yet

---

## Current Context

The engine scaffold at `src/engine/` provides:
- **Types** (`types/`): `FunctionSignature`, `FunctionParameter`, `FunctionImplementation`, `ExecutionContext`, `Diagnostic`, `TraceEntry`, `EngineOptions`, `ValueType`
- **Diagnostics** (`diagnostics/`): All `KEYRA-E###` and `KEYRA-W###` codes with message templates, including E002, E003, E004, E005, E010, E013, W001 needed by the evaluator
- **Registry** (`registry/`): `FunctionRegistry` class with `getFunction()`, `hasFunction()`, `registerFunction()`
- **DSL** (`dsl/`): AST node types (`AstNode` discriminated union), `parse()` function producing `ParseResult`

The existing `ExecutionContext` (in `types/registry.ts`) is a minimal context passed to function implementations. The evaluator needs a richer `EvaluationContext` that contains the source data, scope stack, constants, externals, registry reference, options, and an `evaluate` callback for re-entrant evaluation. When calling function implementations, the evaluator constructs an `ExecutionContext` (populating `currentItem`/`parentItem` from the scope stack) and passes the full `EvaluationContext` for functions that need re-entry.

The `project-structure.md` already mentions `dsl/` as covering "DSL parser and expression evaluator", indicating the evaluator should reside within `src/engine/dsl/`.

---

## Scope

### In Scope

- `EvaluationContext` type — sourceData, scopeStack, constants, externalSources, registry, options, evaluate callback
- `EvaluationResult` type — value, diagnostics, trace entries
- `TraceVerbosity` type on `EngineOptions` — `"functions"` (default) vs `"all"` (includes literals)
- Core `evaluate(node, context)` function — recursive AST evaluation
- Literal evaluation — StringLiteral, NumberLiteral, BooleanLiteral, NullLiteral
- Function call dispatch — registry lookup, argument evaluation, call implementation
- Null propagation engine — centralized null-in/null-out logic with bypass for exception-list functions
- `handlesNull` flag on `FunctionSignature` — mechanism for null propagation bypass
- Scope stack — push/pop operations, item()/parent()/source() resolution
- Object template evaluation — evaluate each property value and assemble result
- Recursion depth tracking — configurable limit (default 32), emit E004 on exceed
- Path resolution utility — `resolvePath(obj, path)` supporting dot, bracket, numeric index notation
- Diagnostic collection — accumulate warnings and errors without halting
- Trace collection — record FunctionCall evaluation steps by default; optionally all nodes when verbosity is `"all"`
- Runtime type checking — emit E005 and halt the function call when argument types don't match signature
- `FunctionImplementation` type update — accepts `EvaluationContext` (replaces narrow `ExecutionContext`)
- Context construction — evaluator builds `ExecutionContext` (populating `currentItem`/`parentItem` from scope stack) before dispatching to implementations
- Barrel exports from `dsl/` and engine `index.ts`

### Out of Scope

- Specific DSL function implementations (source, concat, map, filter, etc.) — FS-004 and FS-005
- DSL parsing — FS-002, already complete
- Schema validation (E030/E031) — FS-006
- Full `execute()` pipeline (rule iteration, bulk behaviors, unmapped target strategy) — FS-007
- Integration with UI or backend
- `validate()` implementation
- Post-processing (nullSubtrees, W005)

---

## Non-Goals

- This spec does not implement any DSL functions — it only provides the dispatch mechanism
- This spec does not define how the full mapping pipeline orchestrates multiple rules — it evaluates a single expression
- This spec does not address performance optimization beyond bounded recursion — profiling is deferred
- This spec does not implement function argument coercion — type checking emits diagnostics, it does not auto-convert

---

## Relevant Areas

- `src/engine/dsl/` — evaluator implementation files
- `src/engine/dsl/types.ts` — AST node types consumed by the evaluator
- `src/engine/types/registry.ts` — `FunctionSignature`, `FunctionImplementation`, `ExecutionContext` (to be updated)
- `src/engine/types/results.ts` — `Diagnostic`, `TraceEntry` types
- `src/engine/types/options.ts` — `EngineOptions`, `ValueType` (to add `TraceVerbosity`)
- `src/engine/registry/function-registry.ts` — `FunctionRegistry` used for dispatch
- `src/engine/diagnostics/codes.ts` — diagnostic code definitions used by evaluator
- `src/engine/diagnostics/format.ts` — message template interpolation
- `src/engine/index.ts` — barrel export (to add evaluate)
- `tests/engine/dsl/` — evaluator test files

---

## Dependencies / Blockers

- Depends on FS-001 (completed) — engine scaffold with types, diagnostics, registry
- Depends on FS-002 (completed) — DSL parser producing AST nodes

---

## Constraints

- Zero runtime dependencies (pure TypeScript)
- Deterministic — same AST + same context always produces the same result
- No I/O — all data is passed in via EvaluationContext
- Must handle deeply nested expressions gracefully (recursion limit, not stack overflow)
- Must handle circular or pathological inputs without crashing (bounded recursion)
- Null propagation logic must be centralized (not duplicated per function)
- TypeScript strict mode — no `any` in public API types
- Must not import from `src/lambda/`, `ui/`, or any cloud SDK
- The evaluator dispatches to whatever is in the registry — it does not know about specific functions

---

## Proposed Behavior

### User Flow

Not applicable — this is a library internal. The evaluator is consumed by the execution pipeline (FS-007) and indirectly by the UI preview feature.

### System Behavior

#### Evaluation Flow

1. `evaluate(node, context)` is called with an AST node and evaluation context
2. The evaluator checks recursion depth — if exceeded, emits E004 and returns `{ value: null }`
3. Based on `node.type`:
   - **Literals**: Return the node's value directly (string, number, boolean, or null)
   - **FunctionCall**:
     a. Look up `node.name` in `context.registry` — emit E002 if not found, return null
     b. Check arity — emit E003 if argument count doesn't match signature, return null
     c. Recursively evaluate each argument AST node
     d. Type-check evaluated arguments against signature — emit E005 and return null on mismatch (no implicit coercion per DSL spec §3.2)
     e. Apply null propagation: if any required argument evaluated to null AND function does NOT have `handlesNull: true`, emit W001 and return null
     f. Construct `ExecutionContext` from `EvaluationContext` (populate `currentItem`/`parentItem` from scope stack)
     g. Call the function implementation with evaluated arguments and `EvaluationContext`
     h. Return the implementation's result
   - **ObjectTemplate**: Evaluate each property's value expression, assemble into `{ [key]: evaluatedValue }` object
4. If trace mode is enabled and the node matches the verbosity level, record the evaluation step
5. Return `EvaluationResult` with accumulated diagnostics

#### Function Implementation Context

Function implementations receive the full `EvaluationContext`. This design means:

- **Simple functions** (concat, upper, etc.) use only the `args` array — they ignore the context.
- **Array functions** (map, filter, find) use `context.evaluate(node, context)` to re-enter evaluation for each element. They push/pop the scope stack before/after iteration.
- **Context-reading functions** (item, parent, source) read from pre-populated `ExecutionContext` fields OR directly from `EvaluationContext`'s scope stack via context.

The evaluator populates `ExecutionContext.currentItem` and `ExecutionContext.parentItem` from the scope stack before each dispatch:
- `currentItem` = top of scope stack (or undefined if empty)
- `parentItem` = second-to-top of scope stack (or undefined if depth < 2)

This keeps scope stack mechanics as an internal evaluator concern — function implementations receive pre-resolved values and don't need to understand the stack.

#### Null Propagation

Default behavior: if any required argument evaluates to null, the function call short-circuits to null and emits KEYRA-W001.

Exception list (functions with `handlesNull: true` on their signature): `default`, `coalesce`, `isNull`, `if`, `join`, `count`, `contains`, `valueMap`, `eq`, `neq`. These functions receive null arguments without triggering automatic null propagation.

The bypass mechanism is a `handlesNull: boolean` flag on `FunctionSignature`. When true, the evaluator passes all arguments (including nulls) through to the implementation without short-circuiting.

#### Scope Stack

The scope stack is a LIFO structure on `EvaluationContext`:
- `pushScope(element)` — adds an element to the top of the stack (called by array function implementations like map/filter/find before iterating)
- `popScope()` — removes the top element (called after iteration)
- `item()` function reads from `ExecutionContext.currentItem` (populated from stack top) — emits E010 if stack is empty
- `parent()` function reads from `ExecutionContext.parentItem` (populated from second-to-top) — emits E013 if stack depth < 2
- `source()` always reads from `context.sourceData` regardless of stack depth

The evaluator itself does not call pushScope/popScope — array function implementations (FS-005) do. But the evaluator provides the context and stack structure they manipulate, and the evaluator supports re-entrant calls when array functions call back into `evaluate()` for each element.

#### Path Resolution

`resolvePath(obj: unknown, path: string): unknown` resolves a dot/bracket path against an object:
- Dot notation: `"address.city"` → `obj.address.city`
- Bracket notation: `"items['name']"` → `obj.items.name`
- Numeric indices: `"items[0]"` → `obj.items[0]`
- Mixed: `"orders[0].items['sku']"` → `obj.orders[0].items.sku`
- Empty path: `""` → returns the whole object
- Missing intermediate: `"a.b.c"` where `a.b` is undefined → returns null (does not throw)

#### Trace Collection

Trace entries record evaluation steps for debugging in the editor.

Default verbosity (`"functions"`): traces only `FunctionCall` nodes — records function name, evaluated argument values, and output value. Literals are not traced because `StringLiteral("hello") → "hello"` adds no debugging value.

Full verbosity (`"all"`): traces every AST node including literals. Available for deep debugging but not the default.

Verbosity is configured via `EngineOptions.traceVerbosity: TraceVerbosity` (type: `"functions" | "all"`, default `"functions"`). Trace collection is only active when `EngineOptions.trace` is `true`.

### Failure / Edge Behavior

- **Unknown function** (E002): Returns null, emits error diagnostic, evaluation continues
- **Wrong arity** (E003): Returns null, emits error diagnostic
- **Type mismatch** (E005): Returns null, emits error diagnostic — halts the function call (consistent with E002/E003 pattern; no implicit coercion per DSL spec §3.2)
- **Recursion exceeded** (E004): Returns null at the point of exceeding, emits error
- **item() outside array context** (E010): Returns null, emits error
- **parent() without nesting** (E013): Returns null, emits error
- **Null argument to standard function** (W001): Returns null, emits warning — evaluation continues for remaining rules
- **Function implementation throws**: The evaluator catches the exception, converts to a diagnostic, returns null — never propagates exceptions to the caller

---

## Acceptance Examples

### AE-01 — Literal evaluation

**Given**
- AST node: `{ type: 'StringLiteral', value: 'hello', start: 0, end: 7 }`
- Empty evaluation context (no source data needed)

**When**
- `evaluate(node, context)` is called

**Then**
- Result value is `'hello'`
- No diagnostics emitted

### AE-02 — Function dispatch with registered function

**Given**
- AST node: `{ type: 'FunctionCall', name: 'concat', arguments: [StringLiteral('a'), StringLiteral('b')], ... }`
- Registry contains a `concat` function registered with 2 string parameters
- `concat` implementation returns the concatenation of its arguments

**When**
- `evaluate(node, context)` is called

**Then**
- Arguments are evaluated (producing 'a' and 'b')
- `concat` implementation is called with `['a', 'b']`
- Result value is `'ab'`
- No diagnostics emitted

### AE-03 — Unknown function produces E002

**Given**
- AST node: `{ type: 'FunctionCall', name: 'nonexistent', arguments: [], ... }`
- Registry does not contain `nonexistent`

**When**
- `evaluate(node, context)` is called

**Then**
- Result value is `null`
- Diagnostics contain one entry with code `KEYRA-E002`, severity `error`

### AE-04 — Arity mismatch produces E003

**Given**
- AST node: `{ type: 'FunctionCall', name: 'concat', arguments: [StringLiteral('a')], ... }`
- Registry `concat` expects exactly 2 required parameters

**When**
- `evaluate(node, context)` is called

**Then**
- Result value is `null`
- Diagnostics contain one entry with code `KEYRA-E003`

### AE-05 — Null propagation for standard function

**Given**
- AST node: `{ type: 'FunctionCall', name: 'upper', arguments: [NullLiteral], ... }`
- Registry `upper` expects 1 string parameter, `handlesNull: false` (default)

**When**
- `evaluate(node, context)` is called

**Then**
- Result value is `null`
- `upper` implementation is NOT called
- Diagnostics contain one entry with code `KEYRA-W001`

### AE-06 — Null propagation bypass for exception-list function

**Given**
- AST node: `{ type: 'FunctionCall', name: 'default', arguments: [NullLiteral, StringLiteral('fallback')], ... }`
- Registry `default` has `handlesNull: true`
- `default` implementation returns the second argument when first is null

**When**
- `evaluate(node, context)` is called

**Then**
- `default` implementation IS called with `[null, 'fallback']`
- Result value is `'fallback'`
- No W001 diagnostic emitted

### AE-07 — Scope stack: item() reads top via ExecutionContext

**Given**
- EvaluationContext with scopeStack containing `[{ name: 'Alice' }]` (one element)
- AST node for `item('name')` — FunctionCall with name 'item', argument StringLiteral('name')
- Registry `item` implementation reads `context.currentItem` and resolves path against it

**When**
- `evaluate(node, context)` is called

**Then**
- Evaluator populates `ExecutionContext.currentItem` with `{ name: 'Alice' }` (stack top)
- `item` implementation receives it and resolves path `'name'`
- Result value is `'Alice'`

### AE-08 — Scope stack: item() outside context produces E010

**Given**
- EvaluationContext with empty scopeStack
- AST node for `item('name')`

**When**
- The `item` function implementation is called (via dispatch)

**Then**
- `ExecutionContext.currentItem` is undefined (empty stack)
- Result value is `null`
- Diagnostics contain `KEYRA-E010`

### AE-09 — Path resolution with dot notation

**Given**
- Object: `{ address: { city: 'Seattle', zip: '98101' } }`
- Path: `'address.city'`

**When**
- `resolvePath(obj, path)` is called

**Then**
- Returns `'Seattle'`

### AE-10 — Path resolution with bracket notation and numeric index

**Given**
- Object: `{ items: [{ sku: 'A1' }, { sku: 'B2' }] }`
- Path: `"items[1].sku"`

**When**
- `resolvePath(obj, path)` is called

**Then**
- Returns `'B2'`

### AE-11 — Path resolution with missing intermediate returns null

**Given**
- Object: `{ a: { b: null } }`
- Path: `"a.b.c"`

**When**
- `resolvePath(obj, path)` is called

**Then**
- Returns `null` (does not throw)

### AE-12 — Recursion depth exceeded produces E004

**Given**
- AST with 33 levels of nested FunctionCall nodes
- EvaluationContext with `options.maxRecursionDepth = 32`

**When**
- `evaluate(outermost, context)` is called

**Then**
- At depth 33, evaluation halts with E004 diagnostic
- Result value is `null` for the expression that exceeded the limit

### AE-13 — Object template evaluation

**Given**
- AST node: `{ type: 'ObjectTemplate', properties: [{ key: 'greeting', value: StringLiteral('hello') }, { key: 'count', value: NumberLiteral(42) }] }`

**When**
- `evaluate(node, context)` is called

**Then**
- Result value is `{ greeting: 'hello', count: 42 }`

### AE-14 — Nested function calls evaluate inside-out

**Given**
- AST: `concat(upper('a'), lower('B'))` — FunctionCall 'concat' with two FunctionCall arguments
- Registry has `upper` (returns uppercase), `lower` (returns lowercase), `concat` (joins strings)

**When**
- `evaluate(node, context)` is called

**Then**
- Inner calls evaluate first: `upper('a')` → `'A'`, `lower('B')` → `'b'`
- Outer call: `concat('A', 'b')` → `'Ab'`
- Result value is `'Ab'`

### AE-15 — Trace mode records function call evaluation steps

**Given**
- Trace mode enabled in context options (`trace: true`, default verbosity `"functions"`)
- AST: `upper('hello')`

**When**
- `evaluate(node, context)` is called

**Then**
- Result includes trace entries showing:
  - FunctionCall 'upper' evaluation: input args `['hello']`, output `'HELLO'`
- StringLiteral `'hello'` is NOT traced (default verbosity excludes literals)

### AE-16 — Multiple diagnostics collected from single evaluation

**Given**
- AST: `concat(unknown1(), unknown2())` where neither function is registered

**When**
- `evaluate(node, context)` is called

**Then**
- Diagnostics contain at least 2 entries (E002 for each unknown function)
- The outer concat also gets null arguments, potentially triggering W001 or its own E002 depending on order

### AE-17 — Type mismatch halts function call with E005

**Given**
- AST node: `{ type: 'FunctionCall', name: 'upper', arguments: [NumberLiteral(42)], ... }`
- Registry `upper` expects 1 string parameter

**When**
- `evaluate(node, context)` is called

**Then**
- Result value is `null`
- `upper` implementation is NOT called
- Diagnostics contain one entry with code `KEYRA-E005`

### AE-18 — Trace mode with "all" verbosity includes literals

**Given**
- Trace mode enabled with verbosity `"all"` (`trace: true`, `traceVerbosity: 'all'`)
- AST: `upper('hello')`

**When**
- `evaluate(node, context)` is called

**Then**
- Result includes trace entries showing:
  - StringLiteral evaluation: output `'hello'`
  - FunctionCall 'upper' evaluation: input args `['hello']`, output `'HELLO'`

---

## Open Questions

- none

---

## Verification Strategy

All acceptance examples (AE-01 through AE-18) require automated test coverage. Tests will be placed in `tests/engine/dsl/evaluator.test.ts`.

Verification includes:
- Unit tests for `resolvePath()` utility (AE-09, AE-10, AE-11 and additional edge cases)
- Unit tests for `evaluate()` with all AST node types (AE-01, AE-13)
- Unit tests for function dispatch (AE-02, AE-03, AE-04, AE-14)
- Unit tests for null propagation (AE-05, AE-06)
- Unit tests for type mismatch halt behavior (AE-17)
- Unit tests for scope stack behavior (AE-07, AE-08)
- Unit tests for recursion depth (AE-12)
- Unit tests for trace collection at both verbosity levels (AE-15, AE-18)
- Unit tests for diagnostic accumulation (AE-16)
- TypeScript strict typecheck passes for all new files
- No runtime dependencies added
- All exports accessible from `src/engine/index.ts`

---

## Task Generation Notes

Decompose into 6 tasks:

1. **Types and interfaces** (T-01) — define EvaluationContext (with `evaluate` callback), EvaluationResult, scope stack types, TraceVerbosity, extend FunctionSignature with `handlesNull`, update FunctionImplementation to accept EvaluationContext. Foundation task — everything depends on this.
2. **Path resolution utility** (T-02) — standalone `resolvePath()` function with its own focused tests. Minimal dependencies, used by function implementations.
3. **Core evaluate() function** (T-03) — the main implementation including literal evaluation, function dispatch with ExecutionContext construction from scope stack, null propagation, E005 halt-on-mismatch, recursion tracking, object template evaluation, configurable trace collection. Depends on T-01 and T-02.
4. **Public API export** (T-04) — barrel exports from `dsl/index.ts`, update `src/engine/index.ts`. Wire evaluate + resolvePath into the public surface.
5. **Comprehensive test suite** (T-05) — all test categories including AE-17 and AE-18. Depends on T-03 and T-04 being complete. Uses mock function implementations to exercise dispatch without depending on FS-004/FS-005.
6. **Architecture update** (T-06) — update `forge/architecture/mapping-engine.md` to document the evaluator module, EvaluationContext (with evaluate callback), ExecutionContext construction from scope stack, null propagation dispatch model, and trace verbosity configuration.

All tasks are `Agent: task` (engine work, no UI).

---

## Change Log

- Rev 1 — 2026-04-30
  - Initial draft
- Rev 2 — 2026-04-30
  - Resolved Q1: E005 (type mismatch) halts the function call and returns null — consistent with E002/E003 pattern, no implicit coercion per DSL spec §3.2
  - Resolved Q2: FunctionImplementation receives the full EvaluationContext; `evaluate` callback is placed on EvaluationContext for re-entrant calls from array functions
  - Resolved Q3: Trace records FunctionCall nodes only by default (`"functions"` verbosity); configurable to `"all"` for literals via TraceVerbosity in EngineOptions
  - Resolved Q4: Evaluator populates ExecutionContext.currentItem/parentItem from scope stack before dispatch — function implementations receive pre-resolved values, scope stack remains an internal evaluator concern
  - Added AE-17 (type mismatch halt) and AE-18 (trace verbosity "all") acceptance examples
  - Updated Proposed Behavior with "Function Implementation Context" and "Trace Collection" subsections
  - Updated Scope to include TraceVerbosity, FunctionImplementation update, and ExecutionContext construction
