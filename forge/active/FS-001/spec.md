# SPEC

## Title

Scaffold the KeyRa mapping engine library (@keyra/engine)

---

## ID

FS-001

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

Rev: 1

---

## Summary

Create the foundational project structure, build tooling, TypeScript configuration, test harness, and core type definitions for the mapping engine. This is the skeleton that all subsequent engine work builds on. No DSL parsing or execution logic is implemented — only types, structure, stubs, and the function registry pattern.

---

## Problem

The mapping engine (`src/engine/`) does not exist yet. There is no project structure, build configuration, type system, or test infrastructure to support future engine development. Without a clean, validated scaffold, subsequent engine specs (DSL parser, expression evaluator, function implementations) have no foundation to build on.

---

## Goal

A fully buildable, testable, lint-clean TypeScript library skeleton at `src/engine/` that:

- Exports the two public entry points (`validate()` and `execute()`) with correct type signatures returning placeholder results
- Defines all core types and interfaces needed by the engine and its consumers (UI and Lambda)
- Defines all error/warning codes from the DSL specification as typed constants with message templates
- Provides the extensible function registry pattern where DSL functions will be registered
- Builds as ESM + CJS dual output importable from both Vite (browser) and Node/Lambda
- Has Vitest configured with a passing test and fixture directories ready for future integration tests
- Passes TypeScript strict mode, lint, and build without errors

---

## Assumptions

- The repository is a greenfield — `src/` and `tests/` are currently empty (only `.gitkeep`)
- The engine will be consumed as a workspace package or direct import (not published to npm yet)
- TypeScript strict mode is non-negotiable from the start
- Zero runtime dependencies is non-negotiable — only devDependencies for build and test tooling
- ESM is the primary module format; CJS is provided for Node compatibility
- The DSL specification (v1.1.0) and Arrays specification (v1.0.0) are the authoritative source for error codes, type shapes, and function signatures

---

## Current Context

The repository contains:
- `forge/` — workflow artifacts (specs, tasks, architecture docs)
- `specs/` — product and DSL specification documents
- `src/` — empty (`.gitkeep` only)
- `tests/` — empty (`.gitkeep` only)
- `ui/` — empty (`.gitkeep` only)

The project structure architecture document (`forge/architecture/project-structure.md`) defines:
- `src/engine/` as the engine root with subfolders: `dsl/`, `types/`, `diagnostics/`
- `src/engine/index.ts` as the entry point exporting `execute()`, `validate()`, `parse()`
- `tests/engine/` for engine tests with subfolders: `dsl/`, `execute/`, `validate/`
- Engine must have zero imports from `src/lambda/`, `ui/`, or any cloud SDK

No `package.json`, `tsconfig.json`, or build tooling exists yet at the repository root or within `src/`.

---

## Scope

### In Scope

- Repository root `package.json` with workspace configuration (if monorepo) or flat config
- TypeScript configuration (`tsconfig.json`) with strict mode enabled
- Build tooling configuration (tsup or equivalent) for ESM + CJS dual output
- Lint configuration (ESLint with TypeScript rules)
- `src/engine/` directory structure following `project-structure.md`
- Core type definitions: `MappingConfig`, `MappingRule`, `SchemaRef`, `ExecutionResult`, `Diagnostic`, `DiagnosticSeverity`, `TraceEntry`, `EngineOptions`, `ValidationResult`, `Environment` enum, `UnmappedTargetStrategy`, `MappingConfigBlock`, `RuleType`
- All error/warning codes from the DSL spec as a typed const object with message templates
- Function registry skeleton with registration mechanism (name + signature + implementation pattern)
- Public API stubs: `validate()` and `execute()` with correct signatures returning empty/placeholder results
- Vitest configuration and a trivial passing test
- Test fixture directory structure (`tests/engine/fixtures/`)
- Clean build, typecheck, lint, and test run

### Out of Scope

- DSL parser/lexer implementation
- Expression evaluator implementation
- Any actual function implementations (source, concat, map, etc.)
- Schema parsing (JSON Schema or XSD to internal tree)
- Integration with UI or backend
- CI/CD pipeline configuration
- npm publishing configuration

---

## Non-Goals

- This spec is not trying to implement any transformation logic
- This spec is not defining the DSL grammar or parser architecture (that is a future spec)
- This spec is not establishing the schema ingestion pipeline
- This spec is not creating the UI build or Lambda deployment setup

---

## Relevant Areas

- `src/engine/` — all engine source code
- `src/engine/index.ts` — public API entry point
- `src/engine/types/` — core type definitions
- `src/engine/diagnostics/` — error codes and diagnostic types
- `tests/engine/` — test files and fixtures
- `package.json` — package configuration (new file at repository root)
- `tsconfig.json` — TypeScript configuration (new file at repository root)
- `vitest.config.ts` — test runner configuration (new file)

---

## Dependencies / Blockers

- none

---

## Constraints

- Zero runtime dependencies (devDependencies for build/test only)
- TypeScript strict mode — no `any` in public API types
- Must be importable as ESM from a Vite browser bundle
- Must be importable from Node/Lambda (CJS or ESM)
- Engine performs no I/O — all inputs passed in, all outputs returned
- Must follow the directory structure defined in `forge/architecture/project-structure.md`
- Error codes must match the DSL specification exactly (codes, severities, message templates)

---

## Proposed Behavior

### User Flow

A developer working on the engine:
1. Clones the repository
2. Runs `npm install` (or equivalent) to install devDependencies
3. Runs `npm run build` — TypeScript compiles cleanly, produces ESM + CJS output
4. Runs `npm run typecheck` — zero errors
5. Runs `npm run lint` — zero errors
6. Runs `npm run test` — Vitest runs, trivial test passes
7. Imports `validate` or `execute` from `src/engine/index.ts` in other code (UI or Lambda)

### System Behavior

The public API stubs:
- `validate(config: MappingConfig, sourceSchema: unknown, targetSchema: unknown, options?: EngineOptions): ValidationResult` — returns an empty `ValidationResult` (no diagnostics, valid: true)
- `execute(config: MappingConfig, sourceData: unknown, sourceSchema: unknown, targetSchema: unknown, options?: EngineOptions): ExecutionResult` — returns an empty `ExecutionResult` (empty output object, no diagnostics, no trace)

The function registry:
- Provides `registerFunction(name: string, signature: FunctionSignature, implementation: FunctionImplementation): void`
- Provides `getFunction(name: string): RegisteredFunction | undefined`
- Provides `hasFunction(name: string): boolean`
- Provides `listFunctions(): string[]`
- Starts with zero registered functions (implementations come in future specs)

### Failure / Edge Behavior

- Calling `validate()` or `execute()` returns valid but empty results (no errors, no transformation)
- Calling `getFunction()` for an unregistered function returns `undefined`
- The library itself cannot fail during import — it has no initialization side effects

---

## Acceptance Examples

### AE-01 — Library builds without errors

**Given**
- The repository has been cloned and `npm install` has run

**When**
- `npm run build` is executed

**Then**
- Exit code is 0
- Output files exist in the designated output directory (ESM and CJS formats)
- No TypeScript errors are reported

### AE-02 — TypeScript strict mode passes

**Given**
- All source files in `src/engine/` are present

**When**
- `npm run typecheck` is executed (tsc --noEmit)

**Then**
- Exit code is 0
- No errors or warnings

### AE-03 — Lint passes

**Given**
- All source files in `src/engine/` are present

**When**
- `npm run lint` is executed

**Then**
- Exit code is 0
- No errors

### AE-04 — Tests pass

**Given**
- Vitest is configured and at least one test exists

**When**
- `npm run test` is executed

**Then**
- Exit code is 0
- At least one test runs and passes

### AE-05 — Public API is importable with correct types

**Given**
- A test file imports `validate` and `execute` from the engine entry point

**When**
- The test calls `validate()` with a minimal MappingConfig stub

**Then**
- Returns a `ValidationResult` with `valid: true` and empty `diagnostics` array

### AE-06 — Function registry supports registration and lookup

**Given**
- The function registry is imported

**When**
- `registerFunction("testFn", signature, implementation)` is called
- `hasFunction("testFn")` is called
- `getFunction("testFn")` is called

**Then**
- `hasFunction` returns `true`
- `getFunction` returns the registered function entry
- `listFunctions()` includes `"testFn"`

### AE-07 — Error codes are typed and complete

**Given**
- The error codes module is imported

**When**
- All codes from the DSL specification are accessed

**Then**
- Every `KEYRA-E###` and `KEYRA-W###` code exists as a typed constant
- Each code has a `code`, `severity`, and `messageTemplate` property
- TypeScript enforces correct usage (no arbitrary strings)

### AE-08 — No runtime dependencies

**Given**
- `package.json` exists

**When**
- The `dependencies` field is inspected

**Then**
- The `dependencies` field is either absent or an empty object
- All external packages are in `devDependencies` only

---

## Open Questions

- none

---

## Verification Strategy

All acceptance examples are verifiable through automated means:

- **AE-01, AE-02, AE-03, AE-04**: Verified by running build, typecheck, lint, and test scripts respectively. These are the primary gate.
- **AE-05, AE-06**: Verified through unit tests that import and exercise the public API stubs and function registry.
- **AE-07**: Verified through a unit test that imports the error codes module and asserts all expected codes exist with correct structure.
- **AE-08**: Verified by inspecting `package.json` — can be a test assertion or manual check.

The build validation task (T-06) serves as the integration gate — if build, typecheck, lint, and tests all pass green, the scaffold is complete.

---

## Task Generation Notes

This work decomposes into sequential scaffolding tasks. Each builds on the previous:

1. **Package and build tooling** — must come first as everything else depends on it
2. **Core types** — defines the type system other modules reference
3. **Error codes** — depends on diagnostic types from core types
4. **Function registry** — depends on types for function signatures
5. **Public API stubs** — ties everything together, depends on types + registry
6. **Test harness and build validation** — validates the complete scaffold

All tasks are `Agent: task` (engine work). No UI tasks in this spec.

The architecture document for the mapping engine subsystem (`forge/architecture/mapping-engine.md`) is created as part of this planning package since this introduces a new subsystem with no existing architecture coverage.

---

## Change Log

- Rev 1 — 2026-04-30
  - Initial draft
