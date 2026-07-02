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

The engine root barrel (`src/engine/index.ts`) exports two primary entry points plus supporting APIs:

| Function | Purpose |
|----------|---------|
| `validate(config, sourceSchema, targetSchema, options?)` | Validate a mapping config without executing it. Checks DSL syntax, path validity, type compatibility, array context correctness. Returns diagnostics. |
| `execute(config, sourceData, sourceSchema, targetSchema, options?)` | Execute a mapping config against source data. Evaluates all rules, applies bulk behaviors, returns transformed output + diagnostics + optional trace. |

Both functions are pure — same inputs always produce same outputs.

### Additional Entry Points

- `parse(expression, options?)` — Parse a single DSL expression into an AST + diagnostics.
- `evaluate(node, context)` — Evaluate a parsed AST node against runtime context and return value + diagnostics (+ optional trace).
- `resolvePath(obj, path)` — Resolve DSL dot/bracket paths against runtime objects (used by context-reading functions).

### Additional Root Exports (Current Implementation)

- `registerAllFunctions` — Register all built-in DSL functions into a registry instance.
- `SUPPORTED_FORMAT_TOKENS`, `FORMAT_PRESETS` — date formatting metadata exported from engine functions.
- `types/*` — all exported engine public types.
- `diagnostics/*` — `DIAGNOSTIC_CODES`, `formatDiagnosticMessage`.
- `registry/*` — registry APIs (`createRegistry`, `defaultRegistry`, `FunctionRegistry`, etc.).

---

## Module Structure

```
src/engine/
  index.ts              Public API entry point — exports validate, execute, parse, evaluate, resolvePath, registerAllFunctions, SUPPORTED_FORMAT_TOKENS, FORMAT_PRESETS, types, diagnostics, registry
  execute.ts            execute() implementation
  execute/
    index.ts            Barrel export for execute utilities
    set-at-path.ts      Dot-notation target-path assembly helper
    ast-cache.ts        Per-execution expression→AST cache utility
  validate.ts           validate() implementation
  validate/
    index.ts            Barrel export for validation sub-modules
    schema-tree.ts      SchemaTree contract + JSON Schema adapter + XSD permissive stub
    source-paths.ts     source("...") path existence checks (E030)
    target-paths.ts     rule.target path checks (E031) + duplicate target detection warning
    type-inference.ts   Best-effort static expression type inference utility
    type-compatibility.ts Rule output type vs target schema type checks (E005)
    array-context.ts    item()/parent()/filter/find context checks (E010/E013/E017)
    constants-externals.ts constant()/external() reference checks (E011/E012)
    coverage.ts         Required target field coverage computation
    ast-utils.ts        Shared AST traversal helpers for validation passes
  types/
    index.ts            Barrel export for all types
    config.ts           MappingConfig, MappingRule, SchemaRef, MappingConfigBlock
    results.ts          ExecutionResult, ValidationResult, Diagnostic, TraceEntry, ExecutionStats
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
  functions/
    index.ts            Barrel — registerAllFunctions() populates a registry with built-in functions
    arrays.ts           map, filter, find, array, merge, flatten, first, nth, join, count, get
    source-access.ts    source, item, parent, constant, external, static
    type-conversion.ts  cast
    null-handling.ts    default, coalesce, isNull
    conditional.ts      if, eq, neq, gt, gte, lt, lte, and, or, not
    lookup.ts           valueMap
    string.ts           concat, substring, upper, lower, trim, replace, replaceAll, contains, length, split
    date.ts             formatDate, dateDiffSeconds
    math.ts             add, subtract, multiply, divide, round, abs
```

---

## Internal Module Boundaries

| Module         | Responsibility                                                                                                        | May Import From                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `types/`       | Type definitions only. No runtime code.                                                                               | Nothing (leaf module)                                                                 |
| `diagnostics/` | Error/warning code constants and message formatting                                                                   | `types/`                                                                              |
| `registry/`    | Function registration and lookup                                                                                      | `types/`                                                                              |
| `execute/`     | Execute helper utilities (`setAtPath`, `AstCache`)                                                                    | `types/`, `dsl/`                                                                      |
| `validate.ts`  | Mapping config validation                                                                                             | `types/`, `diagnostics/`, `registry/`, `dsl/`                                         |
| `validate/`    | Validation sub-pass implementations (schema abstraction, path checks, type/context checks, references, coverage)      | `types/`, `diagnostics/`, `registry/`, `dsl/`                                         |
| `execute.ts`   | Execute orchestrator (pre-flight validation, parse/evaluate loop, bulk behaviors, result assembly)                    | `types/`, `diagnostics/`, `registry/`, `dsl/`, `execute/`, `validate.ts`, `validate/` |
| `dsl/`         | DSL tokenization, parsing, AST construction, registry-aware parse diagnostics, expression evaluation, path resolution | `types/`, `diagnostics/`, `registry/`                                                 |
| `functions/`   | Built-in DSL function implementations and grouped registration                                                        | `types/`, `diagnostics/`, `registry/`, `dsl/`                                         |

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

## Execute Pipeline

`execute()` is implemented as the runtime transformation pipeline for mapping configs. It orchestrates parse → evaluate → output assembly and applies post-rule bulk behaviors with deterministic diagnostics.

### Phase Sequence

```
Engine Input: MappingConfig + SourceData + SourceSchema + TargetSchema + Options
         │
         ▼
   ┌────────────────────┐
   │ Phase 1            │  Optional pre-flight validation gate
   │ validateBefore...  │  validate(...) and abort on errors
   └─────────┬──────────┘
             ▼
   ┌────────────────────┐
   │ Phase 2            │  Parse all rule expressions
   │ Parse + AST Cache  │  expression-string keyed cache
   └─────────┬──────────┘
             ▼
   ┌────────────────────┐
   │ Phase 3            │  Build EvaluationContext
   │ Build Context      │  source/constants/externals/registry/scope
   └─────────┬──────────┘
             ▼
   ┌────────────────────┐
   │ Phase 4            │  Iterate rules in order and evaluate ASTs
   │ Iterate + Evaluate │  per-rule isolation and diagnostics
   └─────────┬──────────┘
             ▼
   ┌────────────────────┐
   │ Phase 5            │  Target path assembly via setAtPath
   │ Path Assembly      │  dot-notation + intermediate object creation
   └─────────┬──────────┘
             ▼
   ┌────────────────────┐
   │ Phase 6            │  Bulk behaviors
   │ Bulk Behaviors     │  unmappedTargets → nullSubtrees
   └─────────┬──────────┘
             ▼
   ┌────────────────────┐
   │ Phase 7            │  Sort diagnostics and assemble result
   │ Assemble Output    │  output + diagnostics + trace? + stats
   └─────────┬──────────┘
             ▼
Output: ExecutionResult { output, diagnostics, trace?, stats }
```

### Rule Iteration Model

- Rules execute sequentially in config order (`rules[0] ... rules[n-1]`).
- Order is observable: later rules can overwrite earlier target writes (last-write-wins).
- Parse and evaluation failures are isolated to the rule being processed.
- Rule failures coerce that rule's target output value to `null`; pipeline continues.

### EvaluationContext Construction (Execute Stage)

Execute creates a runtime `EvaluationContext` once per execute call with:

- `sourceData`
- `constants` from `config.config.constants`
- `externalSources` from `options.externalSources ?? {}`
- `registry` (`defaultRegistry`)
- `options`
- `scopeStack` (mutable per-evaluation stack)
- callbacks: `evaluate`, `addDiagnostic`, `pushScope`, `popScope`

Each rule resets `scopeStack` before evaluation to prevent cross-rule scope leakage.

### Target Path Assembly (`setAtPath`)

`setAtPath` (`src/engine/execute/set-at-path.ts`) handles output assembly:

- dot-notation path support (`Order.Header.Type`)
- auto-creates intermediate objects
- overwrites scalar intermediates when deeper object paths are required
- deterministic last-write-wins behavior for conflicts

### AST Caching (`AstCache`)

`AstCache` (`src/engine/execute/ast-cache.ts`) is a per-execution `Map<string, AstNode | null>`:

- key: expression string
- value: parsed AST or `null` for parse-failures
- avoids repeated parsing for duplicate expressions
- caches failed parses to avoid repeated invalid-expression parse cost

### Bulk Behavior Application Order

Bulk behaviors execute after rule iteration:

1. **unmappedTargets**
   - `omit`: no-op
   - `null`: set required unmapped target leaves to `null`
   - `error`: emit `KEYRA-W005` diagnostics for required unmapped target leaves
2. **nullSubtrees**
   - force configured paths to `null`
   - applied after unmapped behavior so it overrides prior values

Unmapped behavior uses `SchemaTree.getRequiredLeafPaths()` from `validate/schema-tree.ts`.

### Trace Recording

When `options.trace === true`, execute emits one `TraceEntry` per rule with:

- `ruleIndex`, `targetPath`, `expression`
- `inputValue` (source snapshot/reference)
- `outputValue` (rule-level output after failure coercion)
- `diagnostics` for that rule
- `durationMs` (per-rule elapsed time)

Trace preserves rule order and includes failed rules.

### Stats Computation

Execute computes `ExecutionStats` for every call:

- `rulesEvaluated`
- `rulesSucceeded`
- `rulesFailed`
- `durationMs` (full pipeline)

Invariant: `rulesSucceeded + rulesFailed = rulesEvaluated`.

### `validateBeforeExecute` Gate

When `options.validateBeforeExecute === true`:

- execute runs `validate(config, sourceSchema, targetSchema, options)` before parsing rules
- if validation fails (`valid === false`), execute aborts early with:
  - `output: null`
  - validation diagnostics
  - zero rule counts
  - measured duration

### Error Handling in Execute

- Data and expression issues return diagnostics; they do not throw.
- One rule failure never aborts full rule iteration.
- Parse failures and error diagnostics nullify only the affected rule output.
- Diagnostics are sorted by `ruleIndex` then severity for deterministic output.

### Performance Characteristics

- synchronous, single-pass rule loop
- in-memory pure execution (no I/O)
- AST caching amortizes repeated expression parse costs
- target benchmark covered by integration test: 500 rules / 1000 fields under 2s

### parse → evaluate → execute → output Connection

- `parse()` turns expression text into AST + parse diagnostics
- `evaluate()` computes runtime value + rule diagnostics
- `execute()` orchestrates parse/evaluate, path assembly, bulk behaviors, trace/stats, and returns `ExecutionResult`

This is the capstone runtime chain from DSL expression text to transformed output object.

---

## Validate Pipeline

`validate()` is implemented as a deterministic, multi-pass static-analysis pipeline. It validates mapping rules against schema structure and function signatures without executing rules against source data.

### Pass Sequence

```
Engine Input: MappingConfig + SourceSchema + TargetSchema + Options
         │
         ▼
   ┌─────────┐
   │ Parse    │  Parse each rule expression and collect parser diagnostics
   └────┬─────┘
        ▼
   ┌──────────┐
   │ Paths     │  Validate source("...") calls and rule.target paths
   └────┬─────┘
        ▼
   ┌──────────┐
   │ Types     │  Infer expression output types and compare to target field types
   └────┬─────┘
        ▼
   ┌──────────┐
   │ Context   │  Validate array-scope semantics (item/parent/filter/find)
   └────┬─────┘
        ▼
   ┌──────────┐
   │ References│ Validate constant/external references
   └────┬─────┘
        ▼
   ┌──────────┐
   │ Coverage  │  Compute required-target coverage metrics
   └────┬─────┘
        ▼
   ┌──────────┐
   │ Aggregate │  Merge diagnostics + compute valid + attach coverage
   └────┬─────┘
        ▼
Output: ValidationResult { valid, diagnostics, coverage? }
```

### Pass Behavior

1. **Parse** — parses every rule expression and preserves parse diagnostics with rule location metadata (`ruleIndex`, `targetPath`, `expression`). Rules with no AST are excluded from downstream AST-based passes.
2. **Paths** — checks source path references against source schema (when source schema is provided) and rule targets against target schema (when target schema is provided). Duplicate targets are emitted as warnings regardless of schema availability.
3. **Types** — infers expression output type and compares with target field type for static compatibility checks (only when both source and target schemas are available).
4. **Context** — enforces array-context rules for `item()`, `parent()`, and boolean requirements for `filter()/find()` predicates (requires source schema context).
5. **References** — validates `constant()` and `external()` names against mapping config declarations.
6. **Coverage** — computes required-leaf target coverage statistics when target schema is available.
7. **Aggregate** — concatenates pass diagnostics and computes `valid` from severity (`false` if any `error`, warnings/info do not invalidate).

Passes are intentionally independent: a failure in one pass does not short-circuit the rest. This improves editor feedback density by surfacing all detectable issues from a single validate call.

Conditional execution note:
- If `sourceSchema` is absent, source-dependent passes are skipped.
- If `targetSchema` is absent, target-dependent passes are skipped.
- `References` and duplicate-target detection still run without schema inputs.

### SchemaTree (Validation Schema Abstraction)

`SchemaTree` is the internal schema contract used by validation passes.

```ts
interface SchemaTree {
  readonly diagnostics: readonly Diagnostic[];
  hasPath(path: string): boolean;
  getTypeAtPath(path: string): ValueType | undefined;
  getRequiredLeafPaths(): string[];
  isArrayPath(path: string): boolean;
}
```

What it represents:
- A simplified, validation-focused view of a schema's structural shape.
- Fast path/type lookups needed by static analysis passes.

How it is built:
- **JSON Schema adapter** builds a traversable tree for object/array structure, required fields, and path/type checks.
- **XSD adapter (current stub)** returns a permissive tree (`hasPath() => true`, unknown types, no required leaves) plus an info diagnostic to avoid false-positive schema errors while XSD parsing is not implemented.

Phase 0 simplification: XSD validation is intentionally permissive (structure accepted, types/requireds not enforced) to keep editor/runtime workflows unblocked before full XSD structural parsing. Phase 1 expansion would require a real XSD-to-SchemaTree adapter with path/type/required extraction parity to JSON Schema.

Boundary (explicit): **the validator uses schemas for static checks; it does not parse, ingest, store, version, or manage schemas.** Schema lifecycle ownership remains outside the engine (backend/domain services).

### Type Inference Model

Validation type inference is best-effort, not a full type system. It infers types from:
- literals
- known function signatures
- schema-backed path reads (`source()`, `item()`, etc.) when statically resolvable

When inference is uncertain, it returns `undefined`. Callers treat `undefined` as "cannot prove mismatch" and skip that check to avoid false positives.

### Coverage Model

Coverage is structural and target-required-field oriented:
- `total`: required target leaf fields
- `mapped`: required leaves with at least one rule targeting them
- `percentage`: mapped / total
- `unmappedFields`: required leaves with no mapping rule

If no required target leaves exist, coverage is `100%` (vacuous truth). Coverage indicates rule presence, not semantic correctness of expressions.

## FS-093 Enrichment Externals Contract

FS-093 formalizes how enrichment inputs map onto existing engine external-source semantics while preserving the pure no-I/O boundary.

Canonical engine input contract:

- Engine receives:
  - primary input as `sourceData`
  - enrichment payloads through `options.externalSources`
- Engine does not perform connector I/O (REST/gRPC/DynamoDB/API calls); enrichment data is caller-supplied.

Validation contract:

- `validate()` reference checks continue to validate `external("alias")` references against declared external aliases.
- Mapping-layer canonical declaration is `enrichmentSources`; compatibility `config.externalSources` is passed/derived so validation remains deterministic for both canonical and legacy mappings.

Execution contract:

- `external("alias")` resolves values from runtime `externalSources` context.
- `get(external("alias"), "path")` remains the canonical enrichment field-read pattern.
- Missing required enrichment aliases are handled at runtime preflight layer before rule execution.
- Missing optional/legacy schema-less externals remain warning/null behavior consistent with existing engine diagnostic philosophy.

Compatibility notes:

- Existing mappings that never use `external()` remain unchanged.
- Legacy mappings with only `config.externalSources` remain executable through compatibility normalization at mapping/runtime layers.

## FS-096 Project Value-Table Contract

FS-096 extends lookup semantics to support reusable project tables while preserving engine purity/no-I/O behavior.

DSL/function contract additions:

- `valueMap(value, mappings, fallback?)` now accepts `mappings` as either:
  - inline object literal (legacy behavior), or
  - `valueTable(tableKey, inputSideKey, outputSideKey)` expression.
- `valueTable(...)` resolves against the current rule's embedded project `valueTableRef` metadata and produces an object-compatible lookup surface.

Rule model additions (engine config shape):

- Optional `rule.valueTableRef` supports project-pinned references:
  - `scope`, `valueTableId`, `tableKey`, `revision`, `inputSideKey`, `outputSideKey`, `inputType`, `outputType`, `resolvedEntries[]`
- Optional `rule.noMatchBehavior` supports deterministic no-match behavior:
  - `return_null`
  - `return_input`
  - `fallback_value` (type-checked)

Validation contract additions (`validateValueTables` pass):

- `KEYRA-E060`: invalid `valueMap` mappings argument shape.
- `KEYRA-E061`: invalid/unknown table key shape or mismatched table key.
- `KEYRA-E062`: missing pinned revision/resolved entries.
- `KEYRA-E063`: same-side input/output direction.
- `KEYRA-E064`: side/type mismatch.
- `KEYRA-E065`: duplicate input-side values for selected direction.
- `KEYRA-E066`: fallback mode missing required `fallbackValue`.
- `KEYRA-E067`: fallback value type mismatch.
- Diagnostics retain rule/path/expression context and stable code semantics.

Execution contract additions (`lookup.ts`):

- For project table refs, `valueMap` matches against embedded `resolvedEntries` only.
- On no match, emits `KEYRA-W003` and applies rule-level `noMatchBehavior` deterministically.
- Inline object-literal `valueMap` behavior remains backward compatible.

No-I/O invariant (engine boundary):

- Engine does not fetch project value tables, revisions, or external storage.
- All project-table runtime data must be embedded in mapping config before engine execution.

## FS-102 Value Mapping Domain Contract

FS-102 evolves FS-096 value-table behavior into the Value Mapping domain model while preserving engine determinism and backward compatibility.

Canonical engine-facing behavior:

- Public/product terminology is **Value Mapping**.
- Existing `valueTableRef`-based rule bindings remain compatible; FS-102 extends metadata semantics (scope/revision/overlay/match/fallback provenance) without requiring a big-bang rename at engine boundary.
- Reusable asset lifecycle details are not encoded into DSL arguments; rule binding metadata carries reusable-reference identity and resolved executable lookup data.

DSL compatibility contract:

- Inline lookup signatures remain valid:
  - `valueMap(value, mappings)`
  - `valueMap(value, mappings, fallback)`
- FS-102 adds optional inline match-mode argument:
  - `valueMap(value, mappings, fallback?, matchMode?)`
- For reusable project/global value mappings, runtime behavior is resolved from binding metadata before engine execution, not from asset references in expression arguments.

Match-mode contract additions:

- `ValueMapMatchMode = 'exact' | 'ignore-case'`.
- `exact` remains the default for migrated and existing expressions/usages.
- `ignore-case` uses locale-independent `String.prototype.toLowerCase()` on string lookup keys only.
- Explicit exclusions in ignore-case mode:
  - no trim
  - no accent folding
  - no punctuation/symbol normalization
  - no locale-specific casing rules
  - no additional type casting
- The same normalization helper must be used by validation collision checks and runtime lookup execution.

Collision/validation compatibility requirements:

- Duplicate normalized lookup keys are blocking for the active direction+match-mode combination.
- Direction remains usage-level (`a-to-b` / `b-to-a`) and validation inspects the active input side.
- Deterministic diagnostics must continue to carry rule/path/expression context.

Execution boundary invariants (unchanged):

- Engine executes against already-resolved lookup rows only.
- Engine does not perform repository/library/persistence I/O for mutable value-mapping assets.
- Browser and Lambda must produce identical lookup outcomes for identical resolved bindings.

### Performance Characteristics and Design Choices

- Validate is synchronous and deterministic for interactive editor use.
- Public API accepts raw schema inputs; internal schema conversion is cached by object reference (WeakMap) to amortize repeated validations in keystroke-driven flows.
- Sub-validators are small modules with focused responsibilities to keep the hot path testable and maintainable.

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
- `pushScope` / `popScope` — scope stack lifecycle operations used by scope-creating functions
- `currentItem` / `parentItem` — populated by evaluator from scope stack before dispatch
- `addDiagnostic` — callback for function implementations to append diagnostics to current evaluation result

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
3. Argument preparation:
   - evaluate eager arguments recursively
   - pass lazy arguments (`FunctionSignature.lazyArgs`) as raw AST nodes
4. Null propagation check (eager arguments only)
5. Runtime type check (eager arguments only)
6. Implementation invocation

Null propagation is centralized:

- Default: required `null` argument short-circuits to `null` + `KEYRA-W001`
- Bypass: functions with `FunctionSignature.handlesNull === true` receive null arguments normally
- Exception list is defined by DSL spec and implemented via registration metadata (not hardcoded in evaluator)

Deferred argument evaluation is declarative:

- `FunctionSignature.lazyArgs?: number[]` lists argument indices that must be passed as raw AST nodes
- Scope-creating functions (`map`, `filter`, `find`) use `lazyArgs: [1]` for template/condition expressions
- This avoids function-name special-casing in evaluator dispatch and keeps the pattern extensible for future functions

Type mismatch behavior is strict and deterministic:

- `KEYRA-E005` halts the function call (returns `null`)
- No implicit type coercion

### Recursion and Diagnostic/Trace Collection

- Recursion depth is bounded by `options.maxRecursionDepth` (default `32`)
- Depth exceed emits `KEYRA-E004` and returns `null` at overflow node
- Diagnostics accumulate across recursive sub-evaluations; evaluator never throws for data errors
- Function implementation throws are caught and converted to diagnostics (`KEYRA-E002` with implementation-error message context)

Trace collection:

- Enabled by `options.trace === true`
- `traceVerbosity: "functions"` (default) → trace `FunctionCall` nodes only
- `traceVerbosity: "all"` → trace all AST nodes including literals

### Function Implementation Pattern

Built-in DSL functions are implemented under `src/engine/functions/` with one file per category plus a barrel.

Implementation contract:

1. Define a `FunctionSignature` (parameter names/types, optional/variadic flags, `handlesNull` behavior).
2. Define a `FunctionImplementation` receiving evaluated args + `EvaluationContext`.
3. Register via category registration function and `registerAllFunctions(registry)`.

#### Scope-Creating Functions

Scope-creating array functions (`map`, `filter`, `find`) have additional responsibilities:

- Receive mixed args (evaluated values + raw AST nodes via `lazyArgs`)
- Manage scope stack lifecycle per element (`pushScope` / `popScope`)
- Re-enter evaluator with `context.evaluate(astNode, context)` for each iteration
- Guarantee scope cleanup with `try/finally`
- Merge diagnostics emitted by sub-evaluations into the parent evaluation

Canonical lifecycle:

1. Receive evaluated array arg + lazy AST arg
2. For each element:
   - `pushScope(element)`
   - evaluate deferred AST node
   - collect value/diagnostics
   - `popScope()` in `finally`
3. Return aggregated result (`map` values, `filter` originals, `find` first match)

Function implementations are intentionally focused on core logic:

- They do **not** perform arity checks (handled by evaluator).
- They do **not** perform standard type checks (handled by evaluator).
- They do **not** perform standard null propagation (handled by evaluator).
- They **do** implement special null behavior for `handlesNull: true` functions.
- They emit function-specific diagnostics via `context.addDiagnostic(...)` (e.g., `source` W002, `cast` E020/E021, `divide` E050, `valueMap` E060/W003, `formatDate` E040).

`registerAllFunctions(registry)` composes all category registration functions and is called during engine initialization to populate `defaultRegistry` with all built-ins.

---

## Array Functions and Scope Stack

Array functions are the only evaluator consumers that mutate scope stack state during expression execution. They enable nested context access for `item()` and `parent()` while preserving `source()` as a root-only accessor.

### Why Deferred Arguments Are Required

The evaluator normally evaluates function arguments before invocation. That behavior is incorrect for scope-creating functions because `map/filter/find` must evaluate their second argument **per element**, not once.

- `map(array, template)`
- `filter(array, condition)`
- `find(array, condition)`

Each function declares `lazyArgs: [1]` so argument 2 is passed as an AST node and re-evaluated inside the iteration scope.

### Scope-Creating Runtime Contract

Per element, scope-creating functions follow:

1. `pushScope(element)`
2. `context.evaluate(deferredAst, context)`
3. collect result and diagnostics
4. `popScope()` in `finally`

This guarantees scope correctness even on evaluation errors.

### Scope Resolution Model

Before each function dispatch, evaluator derives:

- `currentItem` = top of stack
- `parentItem` = second-to-top

Functions then resolve as follows:

- `item(path)` → `currentItem`
- `parent(path)` → `parentItem`
- `source(path)` → `sourceData` (ignores scope stack)

### Scope Stack State Diagram

```
root sourceData
  └─ map(source("departments"))     stack: [department]
      └─ map(item("employees"))      stack: [department, employee]
          └─ find(source("tax"), ...) stack: [department, employee, taxCandidate]
```

At each depth:

- `item()` reads nearest scope (stack top)
- `parent()` reads one level up (stack top - 1)
- `source()` remains root-scoped

### Null / Empty Behavior Reference

| Input | `map()` | `filter()` | `find()` | `count()` | `first()` | `nth()` | `join()` | `flatten()` | `merge()` arg | `array()` arg |
|------|---------|------------|----------|-----------|-----------|---------|----------|-------------|---------------|---------------|
| `null` | `null` | `null` | `null` | `0` | `null` | `null` | `null` | `null` | skipped | included as `null` |
| `[]` | `[]` | `[]` | `null` | `0` | `null` | `null` | `""` | `[]` | contributes nothing | N/A |
| array with `null` elements | processed normally | null condition excludes element | null condition skips element | counted | may return null element | may return null element | null elements skipped | null elements preserved | N/A | N/A |

Design notes:

- `count(null) = 0` (explicit exception to null propagation)
- `merge()` treats null args as empty for resilient multi-source composition
- `array()` preserves null args to keep positional intent
- `join()` skips null elements rather than rendering `"null"`

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
| `MappingRule` | Single rule (target path, declared rule type, DSL expression, description) |
| `SchemaRef` | Reference to a schema (id, type, optional commitSha) |
| `MappingConfigBlock` | Mapping-level settings (unmapped strategy, constants, externals) |
| `EngineOptions` | Runtime options (trace mode, max depth, etc.) |

`MappingRule.type` uses `RuleType = 'string' | 'number' | 'boolean' | 'array' | 'object'`.
It does not include `'null'` or `'any'`.

### Core Output Types

| Type | Description |
|------|-------------|
| `ExecutionResult` | Transformed data + diagnostics + optional trace |
| `ValidationResult` | Validity boolean + diagnostics |
| `CoverageResult` | Coverage metrics (`total`, `mapped`, `percentage`, optional `unmappedFields`) |
| `Diagnostic` | Individual error/warning (code, severity, message, location) |
| `TraceEntry` | Per-rule execution record (input, expression, output) |

### Registry Types

| Type | Description |
|------|-------------|
| `FunctionSignature` | Parameter definitions + return type for a DSL function |
| `FunctionImplementation` | Callable that executes function logic with `EvaluationContext` |
| `RegisteredFunction` | Complete registration entry (name + signature + implementation) |

---

## Constraints

- **Zero runtime dependencies (engine boundary)** — `src/engine/**` must not depend on cloud/UI/runtime SDKs. This constraint applies to the engine module boundary, not the repository package as a whole.
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
- Note: `KEYRA-E012` intentionally uses an `E`-prefixed code with `warning` severity (external source unavailable); severity is authoritative for validity decisions.
- The only exceptions that throw are programming errors (e.g., duplicate function registration) — not data errors.

---

## Testing Strategy

- **Unit tests** — `tests/engine/` mirrors `src/engine/` structure
- **Fixture tests** — `tests/engine/fixtures/` contains JSON mapping configs + sample data + expected output for integration-style testing
- **Test isolation** — use `createRegistry()` for isolated registry instances in tests
- **No mocking of engine internals** — test through the public API where possible

---

## Versioning

The engine tracks compatibility with the DSL specification version:
- `MappingConfig.engineVersion` declares what DSL version the config was authored against
- The engine must parse any config authored against an equal or older minor version
- Major version bumps may require migration (future: `migrate()` utility)
