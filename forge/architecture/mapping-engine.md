# Mapping Engine

This document defines the architecture of the KeyRa mapping engine — a pure TypeScript library that validates and executes data transformation rules defined in the KeyRa DSL.

Agents must load this document before working on any task that touches `src/engine/` or `tests/engine/`.

This is a living document. Update it when the engine architecture changes. Do not let it drift from the actual implementation.

---

## Overview

The mapping engine is a **pure function library** — no I/O, no side effects, no cloud dependencies. It receives all inputs (mapping config, source data, schemas) and returns all outputs (transformed data, diagnostics, optional trace). It runs identically in:

- **Browser** — bundled into the UI via Vite for client-side preview
- **Node/Lambda** — deployed as part of the production transformation pipeline

The engine implements the KeyRa DSL as specified in `specs/KEYRA-DSL-SPECIFICATION.md` and `specs/KEYRA-DSL-ARRAYS.md`.

---

## Public API

The engine exposes two primary entry points:

| Function | Purpose |
|----------|---------|
| `validate(config, sourceSchema, targetSchema, options?)` | Validate a mapping config without executing it. Checks DSL syntax, path validity, type compatibility, array context correctness. Returns diagnostics. |
| `execute(config, sourceData, sourceSchema, targetSchema, options?)` | Execute a mapping config against source data. Evaluates all rules, applies bulk behaviors, returns transformed output + diagnostics + optional trace. |

Both functions are pure — same inputs always produce same outputs.

### Additional Entry Points

- `parse(expression, options?)` — Parse a single DSL expression into an AST + diagnostics.
- `evaluate(node, context)` — Evaluate a parsed AST node against runtime context and return value + diagnostics (+ optional trace).
- `resolvePath(obj, path)` — Resolve DSL dot/bracket paths against runtime objects (used by context-reading functions).

---

## Module Structure

```
src/engine/
  index.ts              Public API entry point — exports validate, execute, parse, evaluate, resolvePath, types, registry
  validate.ts           validate() implementation
  execute.ts            execute() implementation
  types/
    index.ts            Barrel export for all types
    config.ts           MappingConfig, MappingRule, SchemaRef, MappingConfigBlock
    results.ts          ExecutionResult, ValidationResult, Diagnostic, TraceEntry
    registry.ts         FunctionSignature, FunctionImplementation, RegisteredFunction
    options.ts          EngineOptions, TraceVerbosity, Environment, UnmappedTargetStrategy, ValueType
  diagnostics/
    index.ts            Barrel export for diagnostics
    codes.ts            All KEYRA-E### and KEYRA-W### constants with message templates
    format.ts           Message template interpolation utility
  registry/
    index.ts            Barrel export for registry
    function-registry.ts  FunctionRegistry class — registration, lookup, listing
  dsl/
    index.ts            Barrel export + parse()/evaluate()/resolvePath() public APIs
    types.ts            AST node types, parse/evaluator context/result types
    tokenizer.ts        Lexer: expression string → Token[] + diagnostics
    parser.ts           Recursive descent parser: Token[] → AstNode + diagnostics
    evaluator.ts        Recursive evaluator: AstNode + EvaluationContext → EvaluationResult
    resolve-path.ts     Dot/bracket path resolver used by source/item/parent/get functions
```

---

## Internal Module Boundaries

| Module | Responsibility | May Import From |
|--------|---------------|-----------------|
| `types/` | Type definitions only. No runtime code. | Nothing (leaf module) |
| `diagnostics/` | Error/warning code constants and message formatting | `types/` |
| `registry/` | Function registration and lookup | `types/` |
| `validate.ts` | Mapping config validation | `types/`, `diagnostics/`, `registry/`, `dsl/` |
| `execute.ts` | Mapping execution | `types/`, `diagnostics/`, `registry/`, `dsl/` |
| `dsl/` | DSL tokenization, parsing, AST construction, registry-aware parse diagnostics, expression evaluation, path resolution | `types/`, `diagnostics/`, `registry/` |

**Import rules:**
- No circular dependencies between modules
- `types/` is a leaf — it imports from nothing within the engine
- `diagnostics/` imports only from `types/`
- `registry/` imports only from `types/`
- Top-level modules (`validate.ts`, `execute.ts`) may import from any internal module
- No module imports from `src/lambda/`, `ui/`, or any cloud SDK

---

## Function Registry Pattern

The registry is the extensibility mechanism for the DSL. New functions are added by registering a name, signature, and implementation — the grammar never changes.

### Design

```typescript
// Registration
registerFunction("concat", concatSignature, concatImplementation);

// Lookup (used by the evaluator during execution)
const fn = getFunction("concat");
if (fn) {
  const result = fn.implementation(args, context);
}
```

### Key Properties

- **Name-keyed Map** — O(1) lookup by function name
- **Immutable once registered** — duplicate registration throws (prevents silent overwrites)
- **Factory-creatable** — `createRegistry()` produces isolated instances for testing
- **Default singleton** — a default registry is exported for production use
- **Case-sensitive** — per DSL spec §2.2, function names are case-sensitive

### Function Lifecycle (Future)

1. Function defined in DSL spec (signature, behavior, errors)
2. Implementation written (pure function matching FunctionImplementation type)
3. Registered in the registry during engine initialization
4. Available for the evaluator to call during expression execution

---

## Execution Pipeline (Target Architecture)

```
Engine Input: MappingConfig + SourceData + SourceSchema + TargetSchema + Options
         │
         ▼
    ┌─────────┐
    │  Parse   │  Parse each rule's DSL expression into an AST
    │          │  (dsl/tokenizer.ts → dsl/parser.ts → optional registry checks)
    └────┬────┘
         │
         ▼
    ┌──────────┐
    │ Validate  │  Check syntax, paths, types, array contexts
    │           │  Produce diagnostics with stable error codes
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │ Execute   │  Evaluate rules in order against source data
    │           │  parse() → evaluate() each expression AST
    │           │  Resolve function calls via registry
    │           │  Manage array scope stack for item()/parent()
    └────┬─────┘
         │
         ▼
    ┌───────────────────┐
    │ Post-Process       │  Apply unmapped target strategy
    │                    │  Check nullSubtrees
    │                    │  Emit W005 / E031 as needed
    └────┬──────────────┘
         │
         ▼
    Output: ExecutionResult { output, diagnostics, trace? }
```

---

## DSL Parser

The parser lives in `src/engine/dsl/` and is the first executable stage in the engine pipeline.

### Pipeline

`parse(expression, options?)` runs in three stages:

1. **Tokenize** (`tokenizer.ts`) — converts raw expression text into tokens with start/end character offsets
2. **Parse** (`parser.ts`) — recursive descent parse from `Token[]` into typed `AstNode`
3. **Validate (optional)** (`index.ts`) — if a `FunctionRegistry` is supplied, emit:
   - `KEYRA-E002` for unknown function names
   - `KEYRA-E003` for arity mismatches

Fatal parse diagnostics (`KEYRA-E001`, `KEYRA-E004`) nullify the returned AST.

### AST Node Hierarchy

The AST is a discriminated union on `type`:

- `StringLiteral` — `{ type, value, start, end }`
- `NumberLiteral` — `{ type, value, start, end }`
- `BooleanLiteral` — `{ type, value, start, end }`
- `NullLiteral` — `{ type, start, end }`
- `FunctionCall` — `{ type, name, arguments, start, end }`
- `ObjectTemplate` — `{ type, properties, start, end }`

`ObjectTemplate` properties use `{ key, value, start, end }` where `value` is another `AstNode`.

All positions are character offsets in the original expression string (0-indexed, start-inclusive, end-exclusive).

### `parse()` API Contract

```ts
parse(expression: string, options?: ParseOptions): ParseResult
```

- `ParseOptions`:
  - `registry?: FunctionRegistry`
  - `maxDepth?: number` (default: `32`)
- `ParseResult`:
  - `success: boolean`
  - `ast: AstNode | null`
  - `diagnostics: Diagnostic[]`

Current behavior:
- `success` reflects parse-validity (`ast !== null`)
- E002/E003 may be present while `success === true` if syntax is valid
- E001/E004 produce `ast: null` and `success: false`

### Error Production by Stage

| Stage | Codes | Meaning |
|------|-------|---------|
| Tokenize | `KEYRA-E001` | Invalid syntax at lexical level (unexpected char, invalid escape, unterminated string) |
| Parse | `KEYRA-E001`, `KEYRA-E004` | Structural syntax errors and max-depth violations |
| Registry validation (optional) | `KEYRA-E002`, `KEYRA-E003` | Unknown function names and arity mismatch |

---

## Expression Evaluator

The evaluator lives in `src/engine/dsl/evaluator.ts` and is the execution core for parsed DSL expressions.

### `evaluate()` API Contract

```ts
evaluate(node: AstNode, context: EvaluationContext): EvaluationResult
```

- Input:
  - `node: AstNode` — any parsed expression node (`StringLiteral`, `NumberLiteral`, `BooleanLiteral`, `NullLiteral`, `FunctionCall`, `ObjectTemplate`)
  - `context: EvaluationContext` — runtime data and execution helpers
- Output:
  - `EvaluationResult` — `{ value, diagnostics, trace? }`

`evaluate()` is pure and deterministic: same `node + context` always yields the same result.

### EvaluationContext Structure

`EvaluationContext` carries all runtime data the evaluator and registered functions need:

- `sourceData` — root source document (`source()` reads from this)
- `scopeStack` — array context stack used by `item()` / `parent()`
- `constants` — mapping constants map (`constant()` reads from this)
- `externalSources` — runtime externals (`external()` reads from this)
- `registry` — function registry for function lookup/dispatch
- `options` — evaluator options (`trace`, `traceVerbosity`, `maxRecursionDepth`, etc.)
- `evaluate` — callback for re-entrant evaluation from array functions (`map`, `filter`, `find`)
- `currentItem` / `parentItem` — populated by evaluator from scope stack before dispatch

### Scope Stack and ExecutionContext Construction

Array functions own stack lifecycle (`pushScope`/`popScope`) and call back into `evaluate()` per element.

Before every function dispatch, evaluator derives execution context from the stack:

- `currentItem` = top of stack
- `parentItem` = second-to-top

If missing:
- `item()` emits `KEYRA-E010`
- `parent()` emits `KEYRA-E013`

This keeps scope mechanics centralized in evaluator internals while function implementations consume pre-resolved context.

### Function Dispatch and Null Propagation

For `FunctionCall` nodes, evaluator executes:

1. Registry lookup (`KEYRA-E002` if missing)
2. Arity check (`KEYRA-E003` on mismatch)
3. Recursive argument evaluation
4. Null propagation check
5. Runtime type check
6. Implementation invocation

Null propagation is centralized:

- Default: required `null` argument short-circuits to `null` + `KEYRA-W001`
- Bypass: functions with `FunctionSignature.handlesNull === true` receive null arguments normally
- Exception list is defined by DSL spec and implemented via registration metadata (not hardcoded in evaluator)

Type mismatch behavior is strict and deterministic:

- `KEYRA-E005` halts the function call (returns `null`)
- No implicit type coercion

### Recursion and Diagnostic/Trace Collection

- Recursion depth is bounded by `options.maxRecursionDepth` (default `32`)
- Depth exceed emits `KEYRA-E004` and returns `null` at overflow node
- Diagnostics accumulate across recursive sub-evaluations; evaluator never throws for data errors
- Function implementation throws are caught and converted to diagnostics

Trace collection:

- Enabled by `options.trace === true`
- `traceVerbosity: "functions"` (default) → trace `FunctionCall` nodes only
- `traceVerbosity: "all"` → trace all AST nodes including literals

### Path Resolution Utility

`resolvePath()` lives in `src/engine/dsl/resolve-path.ts`.

```ts
resolvePath(obj: unknown, path: string): unknown
```

Supported path forms:

- Dot notation: `a.b.c`
- Bracket key notation: `items['sku']`
- Numeric indices: `items[0]`
- Mixed forms: `orders[0].items['sku']`

Behavior:

- Empty path returns root object
- Missing/null intermediate returns `null`
- Out-of-bounds array index returns `undefined`

---

## Type System Summary

### Core Input Types

| Type | Description |
|------|-------------|
| `MappingConfig` | Complete mapping document (name, version, schemas, config, rules) |
| `MappingRule` | Single rule (target path, expected type, DSL expression, description) |
| `SchemaRef` | Reference to a schema (id, type, optional commitSha) |
| `MappingConfigBlock` | Mapping-level settings (unmapped strategy, constants, externals) |
| `EngineOptions` | Runtime options (trace mode, max depth, etc.) |

### Core Output Types

| Type | Description |
|------|-------------|
| `ExecutionResult` | Transformed data + diagnostics + optional trace |
| `ValidationResult` | Validity boolean + diagnostics |
| `Diagnostic` | Individual error/warning (code, severity, message, location) |
| `TraceEntry` | Per-rule execution record (input, expression, output) |

### Registry Types

| Type | Description |
|------|-------------|
| `FunctionSignature` | Parameter definitions + return type for a DSL function |
| `FunctionImplementation` | Callable that executes the function logic |
| `RegisteredFunction` | Complete registration entry (name + signature + implementation) |

---

## Constraints

- **Zero runtime dependencies** — the engine must never add a runtime dependency. All logic is hand-written TypeScript.
- **Pure functions** — no I/O, no globals mutated, no network calls. Same inputs → same outputs.
- **TypeScript strict mode** — `strict: true`, no `any` in public API types.
- **Dual format** — builds to ESM (primary) and CJS (Node compat).
- **Schema-agnostic** — the engine receives resolved schemas; it does not fetch or parse them from storage.
- **Deterministic** — given the same config + data, the engine always produces the same output.

---

## Error Handling Philosophy

- Errors do not throw exceptions. They produce `Diagnostic` objects in the result.
- Every diagnostic has a stable code (`KEYRA-E###` or `KEYRA-W###`), severity, human-readable message, and location info.
- Errors halt the individual rule (target field gets `null` or is omitted). They do not halt the entire execution.
- Warnings are informational — execution continues normally.
- The only exceptions that throw are programming errors (e.g., duplicate function registration) — not data errors.

---

## Testing Strategy

- **Unit tests** — `tests/engine/` mirrors `src/engine/` structure
- **Fixture tests** — `tests/engine/fixtures/` will contain JSON mapping configs + sample data + expected output for integration-style testing
- **Test isolation** — use `createRegistry()` for isolated registry instances in tests
- **No mocking of engine internals** — test through the public API where possible

---

## Versioning

The engine tracks compatibility with the DSL specification version:
- `MappingConfig.engineVersion` declares what DSL version the config was authored against
- The engine must parse any config authored against an equal or older minor version
- Major version bumps may require migration (future: `migrate()` utility)
