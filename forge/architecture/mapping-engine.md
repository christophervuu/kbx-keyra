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

### Future Entry Points

- `parse(expression)` — Parse a single DSL expression into an AST. Will be added when the parser is implemented.

---

## Module Structure

```
src/engine/
  index.ts              Public API entry point — exports validate, execute, types, registry
  validate.ts           validate() implementation
  execute.ts            execute() implementation
  types/
    index.ts            Barrel export for all types
    config.ts           MappingConfig, MappingRule, SchemaRef, MappingConfigBlock
    results.ts          ExecutionResult, ValidationResult, Diagnostic, TraceEntry
    registry.ts         FunctionSignature, FunctionImplementation, RegisteredFunction
    options.ts          EngineOptions, Environment, UnmappedTargetStrategy, ValueType
  diagnostics/
    index.ts            Barrel export for diagnostics
    codes.ts            All KEYRA-E### and KEYRA-W### constants with message templates
    format.ts           Message template interpolation utility
  registry/
    index.ts            Barrel export for registry
    function-registry.ts  FunctionRegistry class — registration, lookup, listing
  dsl/                  (future) DSL parser and expression evaluator
```

---

## Internal Module Boundaries

| Module | Responsibility | May Import From |
|--------|---------------|-----------------|
| `types/` | Type definitions only. No runtime code. | Nothing (leaf module) |
| `diagnostics/` | Error/warning code constants and message formatting | `types/` |
| `registry/` | Function registration and lookup | `types/` |
| `validate.ts` | Mapping config validation | `types/`, `diagnostics/`, `registry/`, `dsl/` (future) |
| `execute.ts` | Mapping execution | `types/`, `diagnostics/`, `registry/`, `dsl/` (future) |
| `dsl/` (future) | DSL parsing, expression evaluation | `types/`, `diagnostics/`, `registry/` |

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
