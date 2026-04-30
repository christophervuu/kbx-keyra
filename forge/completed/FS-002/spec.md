# SPEC

## Title

Implement the KeyRa DSL parser — tokenizer and AST generation

---

## ID

FS-002

---

## Metadata

Owner: @christophervuu
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

Build the DSL parser that transforms raw expression strings into a typed Abstract Syntax Tree (AST). This is the first logic implementation in the mapping engine — it takes raw DSL strings from `MappingConfig.rules[].expression` and produces structured AST nodes that the expression evaluator (future spec) will consume. The parser includes a tokenizer (lexer), AST node type hierarchy, recursive descent parser with position tracking, and diagnostics production for syntax and structural errors.

---

## Problem

The mapping engine scaffold (FS-001) provides the type system, diagnostics codes, and function registry, but has no ability to process DSL expressions. Raw expression strings cannot be validated, analyzed, or executed without first being parsed into a structured representation. The `src/engine/dsl/` directory is empty (`.gitkeep` only). Without a parser, no downstream engine work (expression evaluation, validation pipeline, UI syntax highlighting) can proceed.

---

## Goal

A complete, tested DSL parser at `src/engine/dsl/` that:

- Accepts any raw DSL expression string and produces either a typed AST or an array of diagnostics
- Handles all syntax forms defined in the DSL specification (literals, function calls, object templates)
- Tracks character positions for every AST node (enabling precise UI error highlighting)
- Validates function names and arities against the function registry when provided
- Enforces a configurable recursion depth limit
- Is deterministic, pure, and has zero runtime dependencies
- Exports a `parse()` function from `src/engine/index.ts`

---

## Assumptions

- The DSL specification v1.1.0 (`specs/KEYRA-DSL-SPECIFICATION.md` §2) is the authoritative grammar reference
- The Arrays specification v1.0.0 (`specs/KEYRA-DSL-ARRAYS.md`) is authoritative for object template syntax
- The engine scaffold from FS-001 is complete and stable (types, diagnostics codes, function registry)
- Diagnostic codes KEYRA-E001 through KEYRA-E004 are already defined in `src/engine/diagnostics/codes.ts`
- The `FunctionRegistry` class from FS-001 provides `hasFunction()` and `getFunction()` for name/arity validation
- No expression evaluation is needed at this stage — structure only
- No schema awareness is needed — path validation against schemas is the validator's job (future spec)

---

## Current Context

The engine scaffold exists at `src/engine/` with the following relevant pieces:

- **`src/engine/types/`** — Defines `FunctionSignature`, `FunctionParameter`, `Diagnostic`, `DiagnosticSeverity`, `DiagnosticLocation`
- **`src/engine/diagnostics/codes.ts`** — Defines `DIAGNOSTIC_CODES` with E001 (invalid syntax), E002 (unknown function), E003 (wrong arity), E004 (max nesting depth), and message templates with interpolation parameters
- **`src/engine/diagnostics/format.ts`** — Provides `formatDiagnosticMessage(code, params)` for message template interpolation
- **`src/engine/registry/function-registry.ts`** — `FunctionRegistry` class with `hasFunction(name)`, `getFunction(name)` (returns `RegisteredFunction` with `signature.parameters`)
- **`src/engine/index.ts`** — Barrel export for types, diagnostics, registry, validate, execute
- **`src/engine/dsl/`** — Empty directory (`.gitkeep` only)
- **`tests/engine/dsl/`** — Empty directory (`.gitkeep` only)

The architecture document (`forge/architecture/mapping-engine.md`) lists `dsl/` as "(future)" in the module structure and notes it may import from `types/`, `diagnostics/`, and `registry/`.

---

## Scope

### In Scope

- Token type definitions for all DSL token forms
- AST node type definitions as a TypeScript discriminated union
- Tokenizer (lexer) that converts expression strings to token streams with position tracking
- Recursive descent parser that produces typed AST from token streams
- Object template parsing (`{ "key": expression, ... }`) for use in `map()` arguments
- String escape sequence handling (`\"`, `\\`, `\n`, `\t`)
- Whitespace insensitivity between tokens
- Position tracking (start/end character offset) on every AST node
- Recursion depth enforcement (configurable, default 32)
- Diagnostic production for E001, E002, E003, E004
- Optional function name validation via registry (E002)
- Optional arity validation via registry (E003)
- `parse(expression, options?)` public API returning `ParseResult`
- `ParseOptions` type allowing registry injection and max depth configuration
- Export from `src/engine/index.ts`
- Comprehensive test coverage

### Out of Scope

- Expression evaluation (FS-003)
- Schema path validation (E030/E031) — that's the validate pipeline (future spec)
- Type checking of arguments against function signatures beyond arity
- Any function implementations
- Integration with UI (syntax highlighting, autocomplete)
- Pretty-printing/serialization of AST back to expression strings (nice-to-have for debugging but not required)

---

## Non-Goals

- This spec is not implementing any execution or evaluation logic
- This spec is not validating paths against schemas
- This spec is not performing type inference or type checking
- This spec is not creating a language server protocol implementation
- This spec is not adding any DSL grammar extensions beyond what the specification defines

---

## Relevant Areas

- `src/engine/dsl/` — all new parser source code
- `src/engine/dsl/types.ts` — AST node types, token types, ParseOptions, ParseResult
- `src/engine/dsl/tokenizer.ts` — lexer implementation
- `src/engine/dsl/parser.ts` — recursive descent parser
- `src/engine/dsl/index.ts` — barrel export and `parse()` function
- `src/engine/index.ts` — updated to export `parse` and DSL types
- `src/engine/diagnostics/codes.ts` — existing (consumed, not modified)
- `src/engine/registry/function-registry.ts` — existing (consumed for validation)
- `tests/engine/dsl/` — comprehensive test files
- `forge/architecture/mapping-engine.md` — architecture update

---

## Dependencies / Blockers

- Depends on FS-001 being completed (it is)
- No other blockers

---

## Constraints

- Zero runtime dependencies (pure TypeScript)
- Must handle all syntax defined in `specs/KEYRA-DSL-SPECIFICATION.md` §2 and object templates from `specs/KEYRA-DSL-ARRAYS.md`
- No expression evaluation — the parser produces structure only, never executes
- No schema awareness — path validation against schemas is the validator's job
- Recursion depth limit (default 32) must be enforced during parsing
- Parser must be deterministic — same input always produces same AST
- Trailing commas in argument lists are not permitted (produce E001)
- Function names are case-sensitive per DSL spec §2.2
- Function names consist of `[a-zA-Z]` characters only (camelCase)
- Must follow existing import rules: `dsl/` may import from `types/`, `diagnostics/`, `registry/`
- Must not import from `src/lambda/`, `ui/`, or any cloud SDK
- TypeScript strict mode — no `any` in public API types

---

## Proposed Behavior

### User Flow

A developer working on the engine:
1. Imports `parse` from `src/engine/index.ts`
2. Calls `parse(expression)` with a raw DSL expression string
3. Receives a `ParseResult` containing either a valid AST root node or an array of diagnostics
4. Optionally passes `ParseOptions` with a registry for function name/arity validation
5. Uses the AST node positions to map errors back to exact character locations in the original expression

### System Behavior

The `parse()` function:
1. Passes the expression string to the tokenizer, which produces an ordered array of tokens with position information
2. Passes the token stream to the parser, which recursively builds the AST
3. During parsing, enforces recursion depth limit (produces E004 if exceeded)
4. If `options.registry` is provided, validates function names (E002) and argument counts (E003)
5. If any errors are encountered, collects them as Diagnostic objects
6. Returns a `ParseResult` with either the AST root node (on success) or diagnostics array (on failure)

**Token types produced by the lexer:**
- `StringLiteral` — double-quoted content with escape sequences resolved
- `NumberLiteral` — JSON number format
- `BooleanLiteral` — `true` or `false` keywords
- `NullLiteral` — `null` keyword
- `Identifier` — function name (`[a-zA-Z]+`)
- `OpenParen` — `(`
- `CloseParen` — `)`
- `Comma` — `,`
- `OpenBrace` — `{`
- `CloseBrace` — `}`
- `Colon` — `:`
- `EOF` — end of input

**AST node types (discriminated union on `type` field):**
- `StringLiteral` — `{ type: "StringLiteral", value: string, start: number, end: number }`
- `NumberLiteral` — `{ type: "NumberLiteral", value: number, start: number, end: number }`
- `BooleanLiteral` — `{ type: "BooleanLiteral", value: boolean, start: number, end: number }`
- `NullLiteral` — `{ type: "NullLiteral", start: number, end: number }`
- `FunctionCall` — `{ type: "FunctionCall", name: string, arguments: AstNode[], start: number, end: number }`
- `ObjectTemplate` — `{ type: "ObjectTemplate", properties: ObjectTemplateProperty[], start: number, end: number }`

Where `ObjectTemplateProperty` is `{ key: string, value: AstNode, start: number, end: number }`.

**ParseResult structure:**
- On success: `{ success: true, ast: AstNode, diagnostics: [] }`
- On failure: `{ success: false, ast: null, diagnostics: Diagnostic[] }`
- Mixed: `{ success: true, ast: AstNode, diagnostics: Diagnostic[] }` (warnings but valid parse)

### Failure / Edge Behavior

| Input | Behavior |
|-------|----------|
| Empty string `""` | Produces E001: expected expression, found end of input |
| Whitespace-only `"   "` | Produces E001: expected expression, found end of input |
| Single literal `"hello"` | Valid — returns `StringLiteral` node |
| Single literal `42` | Valid — returns `NumberLiteral` node |
| Unknown function `foo(...)` when registry provided | Valid parse (AST produced), E002 diagnostic emitted |
| Wrong arity `concat("a")` when registry provided and concat expects 2+ | Valid parse (AST produced), E003 diagnostic emitted |
| Nesting exceeds depth limit | E004 at the point where depth is exceeded |
| Trailing comma `source("x",)` | E001: unexpected token `)` after comma |
| Unclosed parenthesis `source("x"` | E001: expected `)`, found end of input |
| Unclosed string `source("x` | E001: unterminated string literal |
| Invalid escape `"hello\q"` | E001: invalid escape sequence `\q` |
| Bare identifier without parens `source` | E001: expected `(` after function name |
| Object template with non-string key `{ 42: "x" }` | E001: object template keys must be strings |
| Deeply nested at exactly the limit | Valid — succeeds at depth 32 |
| Nested one beyond the limit | E004 |

---

## Acceptance Examples

### AE-01 — Simple string literal

**Given**
- Expression: `"hello world"`

**When**
- `parse('"hello world"')` is called

**Then**
- Returns `{ success: true, ast: { type: "StringLiteral", value: "hello world", start: 0, end: 13 }, diagnostics: [] }`

### AE-02 — Simple function call with path argument

**Given**
- Expression: `source("customer.firstName")`

**When**
- `parse('source("customer.firstName")')` is called

**Then**
- Returns success with AST: `FunctionCall` node, name `"source"`, one argument that is a `StringLiteral` with value `"customer.firstName"`
- Positions: FunctionCall start=0, end=28; StringLiteral start=7, end=27

### AE-03 — Nested function calls

**Given**
- Expression: `default(upper(source("customer.loyaltyTier")), "STANDARD")`

**When**
- `parse(...)` is called

**Then**
- Returns success with AST: `FunctionCall("default")` with two arguments:
  - `FunctionCall("upper")` with one argument: `FunctionCall("source")` with one argument: `StringLiteral("customer.loyaltyTier")`
  - `StringLiteral("STANDARD")`

### AE-04 — Object template in map()

**Given**
- Expression: `map(source("items"), { "sku": item("sku"), "price": item("unitPrice") })`

**When**
- `parse(...)` is called

**Then**
- Returns success with AST: `FunctionCall("map")` with two arguments:
  - `FunctionCall("source")` with `StringLiteral("items")`
  - `ObjectTemplate` with two properties:
    - key `"sku"`, value `FunctionCall("item")` with `StringLiteral("sku")`
    - key `"price"`, value `FunctionCall("item")` with `StringLiteral("unitPrice")`

### AE-05 — All literal types

**Given**
- Expressions: `"USD"`, `42`, `3.14`, `-100`, `true`, `false`, `null`

**When**
- Each is parsed individually

**Then**
- `"USD"` → `StringLiteral { value: "USD" }`
- `42` → `NumberLiteral { value: 42 }`
- `3.14` → `NumberLiteral { value: 3.14 }`
- `-100` → `NumberLiteral { value: -100 }`
- `true` → `BooleanLiteral { value: true }`
- `false` → `BooleanLiteral { value: false }`
- `null` → `NullLiteral`

### AE-06 — Escape sequences in strings

**Given**
- Expression: `"line1\nline2\ttab\\slash\"quote"`

**When**
- `parse(...)` is called

**Then**
- Returns success with `StringLiteral` node whose `value` is `line1\nline2\ttab\slash"quote` (escape sequences resolved to actual characters)

### AE-07 — E001 invalid syntax (unclosed parenthesis)

**Given**
- Expression: `source("customer.name"`

**When**
- `parse(...)` is called

**Then**
- Returns `{ success: false, ast: null, diagnostics: [{ code: "KEYRA-E001", severity: "error", message: "Invalid syntax: expected `)`, found end of input" }] }`

### AE-08 — E002 unknown function (with registry)

**Given**
- Expression: `unknownFunc("x")`
- Registry has no function named `unknownFunc`

**When**
- `parse('unknownFunc("x")', { registry })` is called

**Then**
- Returns success (AST is produced — parsing succeeds syntactically)
- Diagnostics include `{ code: "KEYRA-E002", severity: "error", message: "Unknown function: `unknownFunc`" }`

### AE-09 — E003 wrong number of arguments (with registry)

**Given**
- Expression: `concat("a")`
- Registry has `concat` registered with signature requiring 2+ arguments

**When**
- `parse('concat("a")', { registry })` is called

**Then**
- Returns success (AST is produced)
- Diagnostics include `{ code: "KEYRA-E003", ... }` with expected vs actual counts

### AE-10 — E004 maximum nesting depth exceeded

**Given**
- Expression with 33 levels of nested function calls (one beyond default limit)
- Default max depth of 32

**When**
- `parse(deeplyNestedExpression)` is called

**Then**
- Returns `{ success: false, ast: null, diagnostics: [{ code: "KEYRA-E004", ... }] }`

### AE-11 — Whitespace insensitivity

**Given**
- Expression: `  source(  "customer.name"  )  ` (extra spaces everywhere)

**When**
- `parse(...)` is called

**Then**
- Returns same AST as `source("customer.name")` — whitespace is ignored between tokens

### AE-12 — Empty input

**Given**
- Expression: `""`  (empty string, not a string literal — the raw input is zero characters)

**When**
- `parse("")` is called

**Then**
- Returns `{ success: false, ast: null, diagnostics: [{ code: "KEYRA-E001", severity: "error" }] }`

### AE-13 — Trailing comma produces E001

**Given**
- Expression: `concat("a", "b",)`

**When**
- `parse(...)` is called

**Then**
- Returns failure with E001 diagnostic indicating unexpected token `)` (trailing comma not permitted)

### AE-14 — Position tracking accuracy

**Given**
- Expression: `concat("hello", source("name"))`

**When**
- `parse(...)` is called

**Then**
- `FunctionCall("concat")`: start=0, end=31
- First arg `StringLiteral("hello")`: start=7, end=14
- Second arg `FunctionCall("source")`: start=16, end=30
- Inner `StringLiteral("name")`: start=23, end=29

---

## Open Questions

- none

---

## Verification Strategy

All acceptance examples are verifiable through automated unit tests:

- **AE-01 through AE-06**: Unit tests asserting correct AST structure for valid inputs
- **AE-07 through AE-10**: Unit tests asserting correct diagnostic production for invalid/problematic inputs
- **AE-11 through AE-14**: Unit tests asserting edge case handling and position tracking accuracy

Additional verification:
- TypeScript strict mode compilation passes for all new files
- Lint passes for all new files
- Build succeeds with the new `dsl/` module included
- `parse` is importable from `src/engine/index.ts`
- Every diagnostic code (E001, E002, E003, E004) has at least one test that triggers it
- Round-trip invariant: parsing deterministic — same input always yields same output (tested with repeated calls)

---

## Task Generation Notes

This work decomposes into six sequential tasks:

1. **AST and API type definitions** — Defines the AST node discriminated union, token types, `ParseOptions`, `ParseResult`. Pure types, no runtime code. This must come first as all other tasks depend on these types.

2. **Tokenizer** — Implements the lexer that converts expression strings to token streams. Depends on token types from T-01. Handles escape sequences, position tracking, and produces E001 for lexer-level errors (unterminated strings, invalid escapes).

3. **Recursive descent parser** — Implements the parser that consumes tokens and produces AST nodes. Depends on T-01 types and T-02 tokenizer. Handles function calls, object templates, nesting depth enforcement. Produces E001 for parser-level syntax errors, E004 for depth violations.

4. **Public API and registry validation** — Wires up the `parse()` function with `ParseOptions`, integrates function registry for E002/E003 validation, exports from `src/engine/index.ts`. Depends on T-03.

5. **Comprehensive test suite** — Tests every acceptance example, edge cases, all error codes. Depends on T-04 (needs working parse API).

6. **Architecture document update** — Updates `forge/architecture/mapping-engine.md` to document the parser's role, AST node hierarchy, and parse() API contract. Explicit architecture task.

All tasks are `Agent: task` (engine work). No UI tasks in this spec.

---

## Change Log

- Rev 1 — 2026-04-30
  - Initial draft
