# KeyRa DSL Specification

**Version:** 1.2.0
**Status:** Draft
**Date:** 2026-04-24
**Companion:** `specs/KEYRA-DSL-ARRAYS.md` (array semantics, published separately)

---

## 1. Overview

The KeyRa DSL is a declarative, function-based expression language for defining data transformation rules. Every mapping rule assigns a DSL expression to a target field path. The engine evaluates the expression against source data to produce the target value.

### 1.1 Design Principles

| Principle                 | Implication                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Readable by BAs**       | Function names are descriptive English words, not symbols or operators.                                       |
| **Parseable by machines** | Deterministic grammar. JSON-serializable. No ambiguous syntax.                                                |
| **Generatable by AI**     | The full syntax reference fits within an LLM system prompt. Produces valid expressions with high reliability. |
| **Composable**            | Any function can be an argument to any other function (where types align). Deep nesting is valid.             |
| **Safe by default**       | Null propagates predictably. Type mismatches produce diagnostics, not crashes.                                |
| **Extensible**            | New functions are added by registering a name + signature + implementation. The grammar itself never changes. |

### 1.2 What an Expression Is

An expression is one of:
- A **literal** (`"USD"`, `42`, `true`, `null`)
- A **function call** (`functionName(arg1, arg2, ...)`) where each argument is itself an expression

That's the entire grammar. There are no operators (`+`, `-`, `==`), no variable assignments, no loops, and no semicolons. Everything is a function call or a literal.

---

## 2. Grammar

### 2.1 Literals

| Type | Syntax | Examples | Notes |
|------|--------|----------|-------|
| String | Double-quoted | `"USD"`, `"Hello World"`, `""` | Supports escape sequences: `\"`, `\\`, `\n`, `\t` |
| Number | JSON number format | `42`, `3.14`, `-100`, `0.001` | No leading zeros (except `0.x`). No `NaN` or `Infinity`. |
| Boolean | Keywords | `true`, `false` | Case-sensitive. `True` and `TRUE` are invalid. |
| Null | Keyword | `null` | Case-sensitive. Represents absence of a value. |

### 2.2 Function Calls

```
functionName(arg1, arg2, ..., argN)
```

**Rules:**
- Function names are `camelCase` and consist of `[a-zA-Z]` characters only.
- Arguments are **positional** (not named).
- Arguments are separated by commas.
- Arguments can be: literals, other function calls (nesting), or object templates (for `map()` only — see Arrays spec).
- Trailing commas are **not** permitted.
- Whitespace (spaces, tabs, newlines) between tokens is ignored.
- Function names are case-sensitive: `source()` is valid, `Source()` is not.

**Nesting example:**
```
default(upper(source("customer.loyaltyTier")), "STANDARD")
```
This reads `customer.loyaltyTier` from source data, uppercases it, and falls back to `"STANDARD"` if the result is null.

### 2.3 Path Syntax

Paths reference fields in source data. They appear as string arguments to `source()`, `item()`, and similar accessor functions.

#### Dot Notation (default)

```
source("customer.firstName")
source("billingAddress.city")
source("payment.authorizedAmount")
```

Each segment between dots is a field name. The engine traverses the source object one level per segment.

#### Bracket Notation (escape hatch)

For field names containing dots, hyphens, spaces, or other special characters that would break dot notation:

```
source("Invoice['Ship-To'].Address.City")
source("Envelope['ST.01']")
source("Header['ISA.06'].SenderID")
source("responses[0].value")
source("codes['404'].message")
```

**Rules:**
- Bracket notation uses single quotes inside square brackets: `['fieldName']`
- Numeric indices use bare numbers: `[0]`, `[1]`
- Dot notation and bracket notation can be mixed in the same path.
- The parser tries dot notation first. Brackets are required only when a field name contains reserved characters (`.`, `[`, `]`, `-`, spaces).

#### Root Reference

An empty path references the entire source document:

```
source("")
```

This is primarily useful for passing the full source to array functions.

### 2.4 Comments

The DSL does **not** support comments. Expressions are stored as single values in mapping configs. Human-readable context belongs in the rule's `description` metadata field, not in the expression itself.

### 2.5 Maximum Expression Length

No hard limit enforced by the grammar. The engine validates that expressions parse within a configurable recursion depth (default: 32 levels of nesting). Exceeding this produces `KEYRA-E004`.

---

## 3. Type System

### 3.1 Supported Types

| Type | Description | JSON Representation |
|------|-------------|---------------------|
| `string` | Text | `"hello"` |
| `number` | Integer or floating-point | `42`, `3.14` |
| `boolean` | True or false | `true`, `false` |
| `null` | Absence of value | `null` |
| `array` | Ordered collection | `[...]` (see Arrays spec) |
| `object` | Key-value map | `{...}` (see Arrays spec for object templates) |

### 3.2 Type Coercion Rules

The DSL does **not** perform implicit type coercion. Types must match function signatures, or the BA must use `cast()` explicitly. This prevents subtle bugs.

**Example of what fails without explicit cast:**
```
concat(source("firstName"), source("age"))
```
If `age` is a number, this produces `KEYRA-E005` (type mismatch). The correct expression:
```
concat(source("firstName"), cast(source("age"), "string"))
```

### 3.3 Cast Compatibility Matrix

`cast(value, targetType)` supports these conversions:

| From ↓ / To → | `"string"`                                           | `"number"`                                            | `"boolean"`                                                                |
| ------------- | ---------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `string`      | No-op                                                | Parses numeric string. `KEYRA-E020` if not parseable. | `"true"` → `true`, `"false"` → `false`, `""` → `false`, any other → `true` |
| `number`      | Formats as string (`42` → `"42"`, `3.14` → `"3.14"`) | No-op                                                 | `0` → `false`, any other → `true`                                          |
| `boolean`     | `true` → `"true"`, `false` → `"false"`               | `true` → `1`, `false` → `0`                           | No-op                                                                      |
| `null`        | Returns `null`                                       | Returns `null`                                        | Returns `null`                                                             |
| `array`       | `KEYRA-E020`                                         | `KEYRA-E020`                                          | `KEYRA-E020`                                                               |
| `object`      | `KEYRA-E020`                                         | `KEYRA-E020`                                          | `KEYRA-E020`                                                               |

### 3.4 Null Propagation

**Default behavior:** Most functions propagate null — if any **required** argument is null, the result is null.

**Exceptions** (functions that handle null explicitly):
| Function | Null Behavior |
|----------|--------------|
| `default(value, fallback)` | Returns `fallback` when `value` is null. That's its purpose. |
| `coalesce(...values)` | Skips null values. Returns first non-null. |
| `isNull(value)` | Returns `true` when value is null. |
| `if(condition, then, else)` | Null condition is treated as `false` (takes the `else` branch). |
| `join(array, separator)` | Skips null elements in the array. |
| `count(array)` | Returns `0` for null array. |
| `contains(haystack, needle)` | Returns `false` if either argument is null. |
| `valueMap(value, mappings, fallback?, matchMode?)` | Null value returns `fallback` (or `null` if no fallback). |

All other functions: **null in → null out**, and the engine emits `KEYRA-W001` (null propagation warning).

---

## 4. Function Catalog

Every function entry includes:
- **Signature** with parameter names and types
- **Returns** type and description
- **Null behavior** (if different from default propagation)
- **Errors** produced
- **Examples** with input → output

---

### 4.1 Source Access

#### `source(path: string): any`

Read a value from the source data at the given path.

- **Returns:** The value at the path, or `null` if the path does not exist.
- **Null behavior:** Missing path returns `null` and emits `KEYRA-W002`.
- **Errors:** `KEYRA-E030` during validation if path does not exist in the source schema (catches typos before execution).

**Examples:**
```
source("orderId")                          → "ORD-2026-00421"
source("customer.firstName")               → "Christopher"
source("billingAddress.postalCode")        → "67202"
source("nonexistent.field")                → null (+ KEYRA-W002)
source("")                                 → {entire source object}
```

---

#### `item(path: string): any`

Read a value from the current array element during `map()` or `filter()`.

- **Returns:** The value at the path within the current array element.
- **Errors:** `KEYRA-E010` if used outside an array context.
- **Full specification:** See `specs/KEYRA-DSL-ARRAYS.md`.

---

#### `constant(name: string): any`

Read a value from the mapping config's `constants` map.

- **Returns:** The constant value.
- **Errors:** `KEYRA-E011` if the constant name is not defined in the mapping config.

**Examples:**
```
Given config.constants = { "COMPANY_CODE": "ACME", "DEFAULT_CURRENCY": "USD" }

constant("COMPANY_CODE")                   → "ACME"
constant("DEFAULT_CURRENCY")               → "USD"
constant("UNDEFINED_KEY")                  → KEYRA-E011
```

---

#### `external(name: string): any`

Read a value from a runtime external source. External sources are injected at execution time (e.g., lookup tables, API results, environment variables).

- **Returns:** The external value.
- **Errors:** `KEYRA-E012` (warning) if the external source is not available at execution time.
- **Validation:** `KEYRA-E012` at validation time if the name is not declared in the mapping config's `externalSources` array.

**Examples:**
```
Given externalSources includes "carrierLookup"

external("carrierLookup")                  → {value injected at runtime}
external("undeclaredSource")               → KEYRA-E012
```

---

#### `static(value: any): any`

Return a hardcoded value. Functionally equivalent to using a literal directly, but makes intent explicit in the rule list.

- **Returns:** The value passed in, unchanged.
- **Null behavior:** `static(null)` returns `null` (no warning).

**Examples:**
```
static("KEYRA_DEMO")                       → "KEYRA_DEMO"
static(42)                                 → 42
static(true)                               → true
static(null)                               → null
```

**Style guidance:** Use `static()` in the **rule list** to make intent clear — it signals "this target field always gets this value, regardless of source data." Use bare literals (e.g., `"USD"`) as **arguments to other functions** (e.g., `default(source("currency"), "USD")`). The expression builder UI enforces this convention: when a BA creates a rule with a hardcoded value and no transforms, it generates `static("value")`. When a literal is used as a function argument, it remains a bare literal.

---

### 4.2 Type Conversion

#### `cast(value: any, targetType: string): any`

Convert a value to the specified type per the cast matrix (§3.3).

- **Parameters:**
  - `value` — the value to convert (any type)
  - `targetType` — one of: `"string"`, `"number"`, `"boolean"`
- **Returns:** The converted value.
- **Null behavior:** `cast(null, anyType)` returns `null`.
- **Errors:**
  - `KEYRA-E020` if the conversion is not supported (e.g., array → string).
  - `KEYRA-E020` if a string cannot be parsed as a number (e.g., `cast("abc", "number")`).
  - `KEYRA-E021` if `targetType` is not one of the three recognized type strings.

**Examples:**
```
cast(42, "string")                         → "42"
cast("3.14", "number")                     → 3.14
cast(0, "boolean")                         → false
cast("not-a-number", "number")             → KEYRA-E020
cast(source("items"), "string")            → KEYRA-E020 (array → string)
cast(null, "string")                       → null
```

**Implementation note:** Although `targetType` is a string literal in the DSL grammar (preserving the "everything is a literal or function call" principle), it is treated as an enum (`'string' | 'number' | 'boolean'`) in the engine's TypeScript implementation. The expression builder UI presents a dropdown for this argument — not a free-text field — making invalid values impossible through the guided interface. The raw editor relies on `KEYRA-E021` validation to catch typos instantly.

---

### 4.3 Null Handling

#### `default(value: any, fallback: any): any`

Returns `value` if it is non-null; otherwise returns `fallback`.

- **Null behavior:** This function exists specifically to handle null. It does NOT propagate null.
- **Note:** `fallback` is always evaluated (not short-circuited). If `fallback` is an expensive function call, it runs even when `value` is non-null.

**Examples:**
```
default(source("shippingAddress.line2"), "")           → "" (because line2 is null)
default(source("billingAddress.line1"), "N/A")         → "123 Main St" (non-null, returns value)
default(null, "fallback")                              → "fallback"
default("present", "fallback")                         → "present"
```

---

#### `coalesce(...values: any[]): any`

Returns the first non-null value from the argument list. Returns `null` if all arguments are null.

- **Parameters:** Variable number of arguments (minimum 1).
- **Null behavior:** Explicitly skips nulls. Returns `null` only if every argument is null.
- **Errors:** `KEYRA-E003` if called with zero arguments.

**Examples:**
```
coalesce(source("preferredName"), source("firstName"), "Unknown")
  → if preferredName is null but firstName is "Christopher" → "Christopher"

coalesce(null, null, null)                 → null
coalesce(null, "found")                    → "found"
coalesce("first", "second")               → "first"
```

---

### 4.4 Conditional Logic

#### `if(condition: boolean, then: any, else: any): any`

Evaluate `condition`. If truthy, return `then`; otherwise return `else`.

- **Parameters:**
  - `condition` — a boolean expression (typically produced by a comparison function)
  - `then` — returned when condition is `true`
  - `else` — returned when condition is `false` or `null`
- **Null behavior:** Null condition is treated as `false` (takes the `else` branch). `then` and `else` follow standard null propagation of whatever they contain.
- **Note:** Both `then` and `else` are always evaluated (not short-circuited).

**Examples:**
```
if(source("customer.isBusinessCustomer"), "BUSINESS", "CONSUMER")
  → "CONSUMER" (because isBusinessCustomer is false)

if(gt(source("payment.authorizedAmount"), 1000), "HIGH_VALUE", "STANDARD")
  → "STANDARD" (because 148.47 is not > 1000)

if(null, "yes", "no")                     → "no" (null treated as false)
```

---

#### Comparison Functions

All comparison functions return `boolean`. Null propagation applies (null in → null out) except where noted.

##### `eq(a: any, b: any): boolean`
Returns `true` if `a` and `b` are strictly equal (same type and value).

```
eq(source("channel"), "web")               → true
eq(source("payment.authorizedAmount"), 148.47) → true
eq(42, "42")                               → false (different types)
eq(null, null)                             → true (special case: null equals null)
```

**Null behavior (special):** `eq(null, null)` returns `true`. `eq(null, anything)` returns `false`. This is an exception to standard null propagation — it would be useless if `eq(x, null)` always returned null.

---

##### `neq(a: any, b: any): boolean`
Returns `true` if `a` and `b` are not strictly equal.

```
neq(source("channel"), "store")            → true
neq(null, null)                            → false
```

**Null behavior:** Mirrors `eq` — `neq(null, null)` returns `false`, `neq(null, anything)` returns `true`.

---

##### `gt(a: number, b: number): boolean`
Returns `true` if `a` is greater than `b`.

```
gt(source("payment.authorizedAmount"), 100) → true (148.47 > 100)
gt(5, 10)                                  → false
```

- **Errors:** `KEYRA-E005` if either argument is not a number (after null check).

---

##### `gte(a: number, b: number): boolean`
Returns `true` if `a` is greater than or equal to `b`.

```
gte(10, 10)                                → true
gte(5, 10)                                 → false
```

- **Errors:** `KEYRA-E005` if either argument is not a number.

---

##### `lt(a: number, b: number): boolean`
Returns `true` if `a` is less than `b`.

```
lt(source("items[0].unitPrice"), 100)      → true (89.99 < 100)
```

- **Errors:** `KEYRA-E005` if either argument is not a number.

---

##### `lte(a: number, b: number): boolean`
Returns `true` if `a` is less than or equal to `b`.

```
lte(0, 0)                                 → true
```

- **Errors:** `KEYRA-E005` if either argument is not a number.

---

##### `isNull(value: any): boolean`
Returns `true` if `value` is null.

- **Null behavior (special):** Does NOT propagate null. That would defeat its purpose.

```
isNull(source("shippingAddress.line2"))    → true (line2 is null)
isNull(source("orderId"))                  → false
isNull(null)                               → true
```

---

##### `and(a: boolean, b: boolean): boolean`
Logical AND.

```
and(gt(source("payment.authorizedAmount"), 0), eq(source("status"), "confirmed"))
  → true (148.47 > 0 AND status is "confirmed")
```

- **Null behavior:** `and(null, true)` → `null`. `and(null, false)` → `false` (short-circuit: if either side is definitely false, result is false regardless of null).

---

##### `or(a: boolean, b: boolean): boolean`
Logical OR.

```
or(eq(source("channel"), "web"), eq(source("channel"), "mobile"))
  → true (channel is "web")
```

- **Null behavior:** `or(null, false)` → `null`. `or(null, true)` → `true` (short-circuit: if either side is definitely true, result is true regardless of null).

---

##### `not(a: boolean): boolean`
Logical NOT.

```
not(source("customer.isBusinessCustomer")) → true (because isBusinessCustomer is false)
not(true)                                  → false
not(null)                                  → null
```

---

### 4.5 Lookup

#### `valueMap(value: any, mappings: object, fallback?: any, matchMode?: string): any`

Look up `value` in a static mapping table. Returns the corresponding mapped value, or `fallback` if no match is found.

- **Parameters:**
  - `value` — the value to look up (typically a string, but any type is accepted; matched by strict equality)
  - `mappings` — an object literal where keys are the possible input values and values are the desired outputs
  - `fallback` (optional) — returned if `value` does not match any key. Defaults to `null`.
  - `matchMode` (optional) — one of: `"exact"` (default), `"ignore-case"`.
- **Null behavior:** If `value` is null, returns `fallback` (or `null` if no fallback).
- **Errors:** `KEYRA-E060` if `mappings` is not an object literal.
- **Errors:** `KEYRA-E068` if `matchMode` is provided but is not `"exact"` or `"ignore-case"`.
- **Note:** Keys in the mappings object are always strings (JSON object keys). The engine converts `value` to a string for lookup purposes when matching keys. The returned value retains its original type from the mappings object.
- **Ignore-case contract:** In `ignore-case` mode, normalization is locale-independent and applies to string lookup keys only using `String.prototype.toLowerCase()`. No trimming, accent folding, punctuation removal, locale normalization, or cross-type coercion is applied.

**Examples:**
```
valueMap(source("channel"), {
  "web": "WEB_PORTAL",
  "store": "RETAIL_STORE",
  "mobile": "MOBILE_APP"
}, "UNKNOWN")
  → "WEB_PORTAL" (channel is "web")

valueMap(source("status"), {
  "confirmed": "OPEN",
  "shipped": "IN_PROGRESS",
  "cancelled": "CANCELLED"
})
  → "OPEN"

valueMap(source("payment.method"), {
  "card": "CREDIT_CARD",
  "paypal": "PAYPAL"
}, "OTHER")
  → "CREDIT_CARD"

valueMap(source("billingAddress.country"), {
  "US": "USA",
  "CA": "CAN",
  "MX": "MEX"
})
  → "USA"

valueMap(source("status"), {
  "confirmed": "OPEN"
}, "UNKNOWN", "ignore-case")
  → "OPEN" (when status is `"CONFIRMED"`)

valueMap(null, {"a": "b"}, "default")     → "default"
valueMap("unknown_key", {"a": "b"})       → null (no fallback provided)
```

**When to use `valueMap` vs. `if`:**
- Use `valueMap` when mapping discrete values (2+ possible inputs to outputs). Cleaner than nested `if` chains.
- Use `if` for boolean conditions, numeric comparisons, or complex logic that isn't a simple lookup.

---

### 4.6 String Operations

#### `concat(...values: string[]): string`

Concatenate all arguments into a single string.

- **Parameters:** Variable number of string arguments (minimum 1).
- **Null behavior:** Null arguments propagate — if ANY argument is null, the result is null. Use `default()` to guard: `concat(source("first"), " ", default(source("last"), ""))`.
- **Errors:** `KEYRA-E005` if any non-null argument is not a string. Use `cast()` to convert.

**Examples:**
```
concat(source("customer.firstName"), " ", source("customer.lastName"))
  → "Christopher Vuu"

concat("****", source("payment.last4"))
  → "****4242"

concat(source("customer.firstName"), null)
  → null (null propagation)

concat(source("customer.firstName"), " ", default(source("customer.middleName"), ""), " ", source("customer.lastName"))
  → "Christopher  Vuu" (double space if middleName is null but defaulted to "")
```

---

#### `substring(value: string, start: number, end?: number): string`

Extract a portion of the string from index `start` (inclusive) to `end` (exclusive). Zero-based indexing.

- **Parameters:**
  - `value` — the source string
  - `start` — start index (inclusive). If negative, counts from end.
  - `end` (optional) — end index (exclusive). If omitted, extracts to end of string.
- **Errors:** `KEYRA-E005` if `value` is not a string or `start`/`end` are not numbers.

**Examples:**
```
substring("Hello World", 0, 5)            → "Hello"
substring("Hello World", 6)               → "World"
substring("Hello", -3)                    → "llo"
```

---

#### `upper(value: string): string`

Convert string to uppercase.

**Examples:**
```
upper(source("customer.loyaltyTier"))      → "GOLD" (loyaltyTier is "gold")
upper("hello")                             → "HELLO"
upper(null)                                → null
```

---

#### `lower(value: string): string`

Convert string to lowercase.

**Examples:**
```
lower("HELLO")                             → "hello"
lower(source("payment.cardBrand"))         → "visa" (cardBrand is "visa", already lowercase)
```

---

#### `trim(value: string): string`

Remove leading and trailing whitespace.

**Examples:**
```
trim("  hello  ")                          → "hello"
trim(source("orderId"))                    → "ORD-2026-00421" (no effect if no whitespace)
```

---

#### `replace(value: string, search: string, replacement: string): string`

Replace the **first occurrence** of `search` in `value` with `replacement`.

- **Parameters:** All must be strings.
- **Behavior:** Literal string matching (not regex). Case-sensitive.
- **Returns:** The modified string, or the original string if `search` is not found.

**Examples:**
```
replace("hello world", "world", "there")   → "hello there"
replace("aaa", "a", "b")                  → "baa" (first occurrence only)
replace("hello", "xyz", "abc")            → "hello" (no match, unchanged)
```

---

#### `replaceAll(value: string, search: string, replacement: string): string`

Replace **all occurrences** of `search` in `value` with `replacement`.

- **Behavior:** Literal string matching (not regex). Case-sensitive.

**Examples:**
```
replaceAll("aaa", "a", "b")               → "bbb"
replaceAll("316-555-0182", "-", "")        → "3165550182"
replaceAll("hello", "xyz", "abc")          → "hello" (no match, unchanged)
```

---

#### `contains(haystack: string, needle: string): boolean`

Returns `true` if `haystack` contains `needle`. Case-sensitive.

- **Null behavior (special):** Returns `false` if either argument is null (does not propagate null).

**Examples:**
```
contains(source("notes"), "gift wrap")     → true ("Customer requested gift wrap" contains "gift wrap")
contains(source("notes"), "rush")          → false
contains(null, "test")                     → false
contains("hello", null)                    → false

// Case-insensitive check:
contains(lower(source("notes")), "gift wrap")  → true
```

---

#### `length(value: string): number`

Returns the number of characters in the string.

**Examples:**
```
length("hello")                            → 5
length("")                                 → 0
length(source("orderId"))                  → 16
length(null)                               → null
```

#### `split(value: string, separator: string): array`

Split a string into an array of substrings, divided by `separator`.

- **Parameters:**
  - `value` — the string to split
  - `separator` — the delimiter string (literal matching, not regex)
- **Returns:** An array of strings.
- **Null behavior:** Null `value` returns `null`. Null `separator` returns `null`.
- **Errors:** `KEYRA-E005` if either non-null argument is not a string.

**Examples:**
```
split("electronics,sale,featured", ",")     → ["electronics", "sale", "featured"]
split("hello", ",")                         → ["hello"] (separator not found)
split("", ",")                              → [""]
split("a--b--c", "--")                      → ["a", "b", "c"]
split(null, ",")                            → null

// Common pattern: split then transform
map(split(source("tags"), ","), trim(item("")))
// "electronics, sale, featured" → ["electronics", "sale", "featured"]
```

---

### 4.7 Date Operations

#### `formatDate(value: string, inputFormat: string, outputFormat: string): string`

Parse a date string using `inputFormat`, then format it using `outputFormat`.

- **Parameters:**
  - `value` — the date string to parse
  - `inputFormat` — format pattern describing the input
  - `outputFormat` — format pattern for the output
- **Errors:** `KEYRA-E040` if `value` cannot be parsed with `inputFormat`.

**Supported Format Tokens:**

| Token | Meaning | Example |
|-------|---------|---------|
| `YYYY` | Four-digit year | `2026` |
| `MM` | Two-digit month (01-12) | `03` |
| `DD` | Two-digit day (01-31) | `31` |
| `HH` | Two-digit hour, 24h (00-23) | `14` |
| `mm` | Two-digit minute (00-59) | `22` |
| `ss` | Two-digit second (00-59) | `19` |
| `ISO8601` | Special: full ISO 8601 format | `2026-03-31T14:22:19Z` |

**Using `ISO8601`:**
- As `inputFormat`: parses standard ISO 8601 strings (with or without timezone).
- As `outputFormat`: produces `YYYY-MM-DDTHH:mm:ssZ`.
- `ISO8601` cannot be combined with other tokens. It stands alone.

**Examples:**
```
formatDate(source("createdAt"), "ISO8601", "YYYY-MM-DD")
  → "2026-03-31" (createdAt is "2026-03-31T14:22:19Z")

formatDate("03/31/2026", "MM/DD/YYYY", "YYYY-MM-DD")
  → "2026-03-31"

formatDate("2026-04-02", "YYYY-MM-DD", "MM/DD/YYYY")
  → "04/02/2026"

formatDate("not-a-date", "YYYY-MM-DD", "MM/DD/YYYY")
  → KEYRA-E040
```

---

### 4.8 Math Operations

All math functions accept `number` arguments and return `number`. Null propagation applies. `KEYRA-E005` if any argument is not a number.

#### `add(a: number, b: number): number`
```
add(source("items[0].unitPrice"), source("items[0].taxAmount"))
  → 96.87 (89.99 + 6.88)
```

#### `subtract(a: number, b: number): number`
```
subtract(source("items[0].unitPrice"), source("items[0].discountAmount"))
  → 80.99 (89.99 - 9.0)
```

#### `multiply(a: number, b: number): number`
```
multiply(source("items[1].unitPrice"), source("items[1].quantity"))
  → 59.98 (29.99 × 2)
```

#### `divide(a: number, b: number): number`
- **Errors:** `KEYRA-E050` if `b` is `0`.

```
divide(100, 4)                             → 25
divide(100, 0)                             → KEYRA-E050
```

#### `round(value: number, decimals?: number): number`
Round to `decimals` decimal places. Default: `0` (round to integer). Uses "round half up" (banker's rounding is NOT used).

```
round(3.14159, 2)                          → 3.14
round(3.145, 2)                            → 3.15
round(3.7)                                 → 4
```

#### `abs(value: number): number`
Absolute value.

```
abs(-42)                                   → 42
abs(42)                                    → 42
```

---

### 4.9 Array Operations (Summary)

Array operations are defined in the companion spec `specs/KEYRA-DSL-ARRAYS.md`. This section provides function signatures for reference.

| Function  | Signature                                          | Brief Description                                                         |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| `map`     | `map(array: array, template_or_expression): array` | Transform each element. `item()` available in template/expression.        |
| `filter`  | `filter(array: array, condition: boolean): array`  | Select elements where condition is true.                                  |
| `find`    | `find(array: array, condition: boolean): any`      | First element matching condition. Returns `null` if no match.             |
| `get`     | `get(object: any, path: string): any`              | Read a field from any in-memory object value.                             |
| `array`   | `array(...elements: any[]): array`                 | Build an array from individual expressions.                               |
| `merge`   | `merge(...arrays: array[]): array`                 | Combine multiple arrays into one. Null arrays treated as empty.           |
| `flatten` | `flatten(array: array): array`                     | Flatten one level of nesting.                                             |
| `count`   | `count(array: array): number`                      | Return element count. Returns `0` for null.                               |
| `first`   | `first(array: array): any`                         | Return first element, or `null` if empty.                                 |
| `nth`     | `nth(array: array, index: number): any`            | Element at index. Negative = from end.                                    |
| `join`    | `join(array: array, separator: string): string`    | Join string elements with separator. Skips nulls. Returns `""` for empty. |
| `item`    | `item(path: string): any`                          | Current element in `map()`/`filter()`/`find()`.                           |
| `parent`  | `parent(path: string): any`                        | Outer element in nested array contexts.                                   |
| `split`   | `split(value: string, separator: string): array`   | Split a string into an array by delimiter.                                |

#### `join` Detail (included here because it returns `string`, not `array`)

**`join(array: array, separator: string): string`**

Concatenate all elements of a string array into a single string, with `separator` between each element.

- **Null behavior:** Null elements are skipped. Null array returns `null`. Empty array returns `""`.
- **Errors:** `KEYRA-E005` if any non-null element is not a string. Use `map()` with `cast()` to convert first.

**Examples:**
```
join(source("tags"), ",")                  → "gift,priority"
join(source("tags"), ", ")                 → "gift, priority"
join(source("tags"), "")                   → "giftpriority"
```

---

## 5. Error Codes

### 5.1 Error Severity Levels

| Severity | Meaning | Engine Behavior |
|----------|---------|-----------------|
| `error` | Expression cannot be evaluated. | Execution halts for this rule. Target field receives `null` (or is omitted, per config). |
| `warning` | Expression evaluated but with a concern. | Execution continues. Diagnostic is recorded. |
| `info` | Informational. No action needed. | Execution continues. |

### 5.2 Full Error Registry

#### Syntax & Structure Errors (E001–E009)

| Code | Severity | Message | Cause |
|------|----------|---------|-------|
| `KEYRA-E001` | error | Invalid syntax: {detail} | Expression does not conform to the grammar. |
| `KEYRA-E002` | error | Unknown function: `{name}` | Function name is not in the registry. |
| `KEYRA-E003` | error | Wrong number of arguments for `{name}`: expected {expected}, got {actual} | Argument count does not match function signature. |
| `KEYRA-E004` | error | Expression exceeds maximum nesting depth ({depth}) | Recursion depth exceeded (default limit: 32). |
| `KEYRA-E005` | error | Type mismatch in `{function}`: expected `{expected}`, got `{actual}` for argument `{argName}` | Argument type does not match the function's signature. |

#### Array Context Errors (E010–E019)

| Code | Severity | Message | Cause |
|------|----------|---------|-------|
| `KEYRA-E010` | error | `item()` used outside array context | `item()` appears in an expression that is not inside a `map()`, `filter()`, or `find()`. |
| `KEYRA-E013` | error | `parent()` used outside nested array context | `parent()` appears in a context with fewer than 2 levels of array nesting. |
| `KEYRA-E015` | error | `map()` template must be an object literal or an expression | Second argument to `map()` is neither `{ ... }` nor a valid expression. |
| `KEYRA-E017` | error | `filter()`/`find()` condition must evaluate to a boolean | Condition returned a non-boolean, non-null value. |
| `KEYRA-E018` | error | `get()` first argument must be an object, got `{type}` | Passed a string, number, or array to `get()` instead of an object. |

#### Constant & External Errors (E011–E012)

| Code | Severity | Message | Cause |
|------|----------|---------|-------|
| `KEYRA-E011` | error | Undefined constant: `{name}` | Constant name not found in `config.constants`. |
| `KEYRA-E012` | warning | External source not available: `{name}` | External source not declared or not provided at runtime. |

#### Cast Errors (E020–E029)

| Code | Severity | Message | Cause |
|------|----------|---------|-------|
| `KEYRA-E020` | error | Unsupported cast: `{fromType}` → `{toType}` | Cast matrix does not support this conversion. |
| `KEYRA-E021` | error | Unknown target type: `{targetType}`. Expected "string", "number", or "boolean" | Invalid `targetType` argument to `cast()`. |

#### Schema Path Errors (E030–E039)

| Code | Severity | Message | Cause |
|------|----------|---------|-------|
| `KEYRA-E030` | error | Source path not found in schema: `{path}` | Validation-time check. The path does not exist in the source schema. |
| `KEYRA-E031` | error | Target path not found in schema: `{path}` | The target field path does not exist in the target schema. |

#### Date Errors (E040–E049)

| Code | Severity | Message | Cause |
|------|----------|---------|-------|
| `KEYRA-E040` | error | Date parse failed: value `"{value}"` does not match format `"{format}"` | `formatDate()` cannot parse the input. |

#### Math Errors (E050–E059)

| Code | Severity | Message | Cause |
|------|----------|---------|-------|
| `KEYRA-E050` | error | Division by zero | Second argument to `divide()` is `0`. |

#### Lookup Errors (E060–E069)

| Code | Severity | Message | Cause |
|------|----------|---------|-------|
| `KEYRA-E060` | error | `valueMap` mappings argument must be an object literal | Second argument is not a `{...}` object. |
| `KEYRA-E068` | error | Invalid valueMap match mode: `{mode}`. Expected `exact` or `ignore-case` | Fourth `valueMap` argument is neither `exact` nor `ignore-case`. |

#### Warnings (W001–W099)

| Code | Severity | Message | Cause |
|------|----------|---------|-------|
| `KEYRA-W001` | warning | Null propagation: `{function}` received null argument `{argName}` | A function received null and returned null per propagation rules. |
| `KEYRA-W002` | warning | Source path resolved to null at runtime: `{path}` | `source()` path exists in schema but has no value in the data. |
| `KEYRA-W003` | warning | `valueMap` no match for value `"{value}"` — returning fallback | Value not found in mappings. Returned fallback or null. |
| `KEYRA-W004` | warning | Array index out of bounds: index `{index}`, array length `{length}` | `nth()` index exceeds array length. Returns `null`. |
| `KEYRA-W005` | warning | Required target field `{path}` has no mapping rule — defaulting to null | Unmapped field handling detected a required field with no rule. |

#### Array-Specific Warnings (E016, E019)

| Code | Severity | Message | Cause |
|------|----------|---------|-------|
| `KEYRA-E016` | warning | `filter()` produced empty array — all elements filtered out | All elements failed the condition. May indicate a logic error. |
| `KEYRA-E019` | warning | `find()` matched no elements — returning null | No element satisfied the condition. |

### 5.3 Diagnostic Object Structure

Every diagnostic emitted by the engine has this shape:

```json
{
  "code": "KEYRA-E005",
  "severity": "error",
  "message": "Type mismatch in `concat`: expected `string`, got `number` for argument `values[1]`",
  "ruleIndex": 7,
  "targetPath": "buyer.fullName",
  "expression": "concat(source(\"customer.firstName\"), source(\"customer.age\"))",
  "location": {
    "function": "concat",
    "argumentIndex": 1
  }
}
```

---

## 6. Mapping Config Format

### 6.1 Full Config Structure

The mapping config is a versioned JSON document that wraps the rules array with metadata and configuration.

> FS-105 compatibility note: DSL expression grammar is unchanged. The schema-reference contract in mapping config is updated to immutable version pinning (`schemaVersion`, `schemaVersionId`, `contentHash`) instead of `type: local|github` + `commitSha`.

```json
{
  "name": "Order Practice Mapping",
  "version": 1,
  "engineVersion": "1.0.0",
  "sourceSchemaRef": {
    "schemaId": "practice-source",
    "schemaVersion": 3,
    "schemaVersionId": "e2d9d786-61df-4c12-9e09-2b8843cf78c4",
    "contentHash": "sha256:3f6e..."
  },
  "targetSchemaRef": {
    "schemaId": "practice-target",
    "schemaVersion": 5,
    "schemaVersionId": "d12f7e6c-f74a-4a96-a6fb-849fa867e4f5",
    "contentHash": "sha256:8a2b..."
  },
  "config": {
    "unmappedTargets": "omit",
    "nullSubtrees": [],
    "constants": {},
    "externalSources": []
  },
  "rules": [
    {
      "target": "transaction.id",
      "type": "string",
      "expression": "source(\"orderId\")",
      "description": "Direct copy of order ID"
    }
  ]
}
```

### 6.2 Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name for the mapping. |
| `version` | number | Yes | Auto-incremented integer on each save (v1, v2, v3...). |
| `engineVersion` | string | Yes | Semver string of the DSL spec version this config was authored against (e.g., `"1.1.0"`). Used for compatibility checks. |
| `sourceSchemaRef` | object | Yes | Reference to the source schema immutable pin. Contains `schemaId`, `schemaVersion`, `schemaVersionId`, and `contentHash`. |
| `targetSchemaRef` | object | Yes | Reference to the target schema immutable pin. Same structure as `sourceSchemaRef`. |
| `config` | object | Yes | Mapping-level configuration. See §6.3. |
| `rules` | array | Yes | Ordered array of mapping rules. See §6.4. |

### 6.3 Config Block

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `unmappedTargets` | string | `"omit"` | Strategy for target fields that have no mapping rule. One of: `"null"`, `"omit"`, `"error"`. See §7. |
| `nullSubtrees` | string[] | `[]` | Array of target path prefixes to suppress unmapped-field warnings for. See §7.3. |
| `constants` | object | `{}` | Key-value pairs accessible via `constant("name")` in expressions. |
| `externalSources` | string[] | `[]` | Declared external source names. Used for validation — `external("name")` produces `KEYRA-E012` if the name is not in this list. |

### 6.4 Rule Format

Each rule in the `rules` array has this shape:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `target` | string | Yes | Dot-notation path to the target field (e.g., `"buyer.fullName"`). |
| `type` | string | Yes | Expected output type: `"string"`, `"number"`, `"boolean"`, `"array"`, `"object"`. Used for validation and display. |
| `expression` | string | Yes | The DSL expression that computes the target value. |
| `description` | string | No | Human-readable description of what this rule does. Used by "Explain Rule" AI, diagnostics panel, and self-documentation. Not evaluated by the engine. |

**Example rule with all fields:**

```json
{
  "target": "buyer.fullName",
  "type": "string",
  "expression": "concat(source(\"customer.firstName\"), \" \", source(\"customer.lastName\"))",
  "description": "Combine first and last name with a space separator"
}
```

**Why `description` matters:**
- The "Explain Rule" AI feature uses it as context, improving explanation quality.
- Diagnostics reference it so BAs see human-readable intent alongside error messages.
- AI-generated rules should always include a description — the AI prompt registry instructs models to generate one.
- Manual rules benefit from it for team readability, but it is not enforced.

---

## 7. Unmapped Target Field Handling

When the engine executes a mapping, every target field in the target schema is in one of two states: **mapped** (a rule exists for it) or **unmapped** (no rule targets it). This section defines how the engine handles unmapped fields.

### 7.1 Strategies

The `config.unmappedTargets` field selects one of three strategies:

| Strategy | Value | Behavior |
|----------|-------|----------|
| **Omit** | `"omit"` | Unmapped target fields are excluded from the output entirely. Required unmapped fields emit `KEYRA-W005`. **This is the default.** |
| **Null** | `"null"` | Unmapped target fields are included in the output with value `null`. Required unmapped fields emit `KEYRA-W005`. |
| **Error** | `"error"` | Unmapped **required** target fields produce `KEYRA-E031`. Unmapped optional fields are omitted. Forces BAs to explicitly map every required field. |

### 7.2 Hybrid Behavior (Default: `"omit"`)

The recommended default is `"omit"` with warnings for required fields. This produces clean output while still catching accidentally unmapped required fields:

| Field Status | `"omit"` Behavior | `"null"` Behavior | `"error"` Behavior |
|-------------|--------------------|--------------------|---------------------|
| Mapped (expression returns value) | Included in output | Included in output | Included in output |
| Mapped (expression returns null) | Included as `null` | Included as `null` | Included as `null` |
| Unmapped + required by target schema | Omitted + `KEYRA-W005` warning | Included as `null` + `KEYRA-W005` warning | `KEYRA-E031` error — execution halts for this field |
| Unmapped + optional | Omitted silently | Included as `null` silently | Omitted silently |

**Why `"omit"` is the default:**
- A target schema with 23,000 fields and 200 mapped rules would produce 22,800 null fields under the `"null"` strategy. That's noise.
- `"omit"` produces clean, minimal output. BAs see only what they mapped.
- `KEYRA-W005` warnings ensure required fields are not silently missed — they surface in the Diagnostics panel.
- `"error"` is available for strict/production-bound mappings where every required field must be explicitly handled.

### 7.3 Null Subtrees

The `config.nullSubtrees` array allows BAs to declare: "I know I'm not mapping this entire section — don't warn me about every field in it."

```json
{
  "config": {
    "unmappedTargets": "omit",
    "nullSubtrees": ["addresses.billTo", "specialHandling"]
  }
}
```

**Behavior:** Any target field whose path starts with a `nullSubtrees` prefix is treated as **intentionally unmapped**. The engine:
- Does **not** emit `KEYRA-W005` for these fields (regardless of whether they are required).
- Does **not** include them in the output (under `"omit"`) or sets them to `null` (under `"null"`).
- Does **not** produce `KEYRA-E031` (under `"error"`).

This prevents the Diagnostics panel from flooding with warnings when a BA intentionally skips an entire section of the target schema.

**Use cases:**
- Target schema has a `BillTo` party block with 50 fields. The mapping only handles `ShipTo`. Adding `"addresses.billTo"` to `nullSubtrees` suppresses 50 warnings.
- Target schema has optional sections that are never populated for a given integration (e.g., `specialHandling` is irrelevant for a particular document type).

### 7.4 Engine Post-Processing Pipeline

After all rules are evaluated, the engine runs a post-processing step for unmapped field handling:

```
Rules evaluated → raw output built
         │
         ▼
    ┌─────────────────────────┐
    │  Unmapped field handling │
    │                          │
    │  For each target schema  │
    │  field NOT in the rules: │
    │                          │
    │  1. In nullSubtree?      │──→ Skip silently (no output, no warning)
    │  2. Required field?      │──→ Per strategy:
    │     "omit"  → omit + W005│
    │     "null"  → null + W005│
    │     "error" → E031       │
    │  3. Optional field?      │──→ Per strategy:
    │     "omit"  → omit       │
    │     "null"  → null       │
    │     "error" → omit       │
    └─────────────────────────┘
         │
         ▼
    Final output + diagnostics
```

### 7.5 Relationship to `KEYRA-E031`

`KEYRA-E031` serves two purposes depending on context:

| Context | Meaning |
|---------|---------|
| **Validation time** (§5.2) | A rule's `target` path does not exist in the target schema. This is a typo/authoring error. Always an error. |
| **Unmapped handling** (`"error"` strategy) | A required target field has no mapping rule at all. Only raised when `unmappedTargets` is set to `"error"`. |

These are distinct situations: one is "you wrote a path wrong" and the other is "you forgot to write a rule." The error code is reused because both relate to target path issues, but the `message` field distinguishes them:
- Validation: `"Target path not found in schema: {path}"`
- Unmapped: `"Required target field {path} has no mapping rule"`

---

## 8. Execution Order

### 8.1 Rule Evaluation Order

Rules are evaluated in the order they appear in the `rules` array. This matters when:
- A later rule references the output of an earlier rule (future: `target()` accessor — not in v1.0).
- Bulk behaviors (unmapped targets → null) apply after all rules execute (see §7.4).

### 8.2 Expression Evaluation Order

Within a single expression, evaluation is **inside-out** (innermost function calls first):

```
default(upper(source("customer.loyaltyTier")), "STANDARD")
```

1. `source("customer.loyaltyTier")` → `"gold"`
2. `upper("gold")` → `"GOLD"`
3. `default("GOLD", "STANDARD")` → `"GOLD"` (non-null, returns value)

### 8.3 Full Execution Pipeline

```
Input: MappingConfig + SourceData
         │
         ▼
    ┌─────────┐
    │  Parse   │  Deserialize mapping config JSON into internal representation.
    │          │  Resolve schema references. Normalize rule formats.
    └────┬────┘
         │
         ▼
    ┌──────────┐
    │ Validate  │  Check all rules for: valid DSL syntax, valid source/target paths
    │           │  against schemas, type compatibility, array context correctness.
    │           │  Produce diagnostics with stable error codes + rule locations.
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │ Execute   │  Apply rules to source data in order. Evaluate DSL expressions.
    │           │  Handle arrays, conditionals, type conversions, defaults.
    └────┬─────┘
         │
         ▼
    ┌──────────────────┐
    │ Unmapped Handling │  Apply unmappedTargets strategy (§7.4).
    │                   │  Check nullSubtrees. Emit W005 / E031 as needed.
    └────┬─────────────┘
         │
         ▼
    ┌──────────┐
    │ Output    │  Transformed data (JSON object) + Diagnostics array.
    │           │  Optional: execution trace (which rule, what input, what output).
    └──────────┘
```

---

## 9. Versioning & Compatibility

### 9.1 Spec Versioning

The DSL specification follows semver:
- **Patch** (1.0.x): Documentation fixes, example additions. No behavior changes.
- **Minor** (1.x.0): New functions added. Existing functions unchanged. All existing expressions remain valid.
- **Major** (x.0.0): Breaking changes to existing function behavior or grammar.

### 9.2 Engine Compatibility

- The mapping config includes `engineVersion` (e.g., `"1.1.0"`).
- The engine **must** parse any expression written against an equal or older **minor** version.
- Major version bumps may require migration. The engine provides a `migrate(config, fromVersion, toVersion)` utility.

### 9.3 Adding New Functions

To add a new function to the DSL:
1. Define the signature, behavior, null handling, errors, and examples in this spec.
2. Register the function in the engine's function registry.
3. Update the AI prompt registry so GitHub Models can generate expressions using the new function.
4. Bump the spec's minor version.

No grammar changes are needed. The grammar (`functionName(args...)`) is universal.

---

## 10. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-04-23 | Initial draft. Grammar, type system, 32 functions across 9 categories, error codes, execution order. |
| 1.1.0 | 2026-04-24 | Added: §6 Mapping Config Format (full config structure, rule format with `description` field). Added: §7 Unmapped Target Field Handling (`unmappedTargets` strategy, `nullSubtrees`, post-processing pipeline). Added: `KEYRA-W005` warning code. Added: array functions to §4.9 summary table (`find`, `get`, `array`, `merge`, `nth`, `item`, `parent`). Consolidated array error codes into §5.2. Added: §8.3 full execution pipeline. Added: §10 Changelog. |
| 1.2.0 | 2026-07-01 | Updated `valueMap` signature to `valueMap(value, mappings, fallback?, matchMode?)` with backward compatibility for prior signatures. Added `matchMode` values (`exact`, `ignore-case`) and locale-independent ignore-case normalization contract (`String.prototype.toLowerCase()` on string lookup keys only). Added `KEYRA-E068` for invalid match mode arguments. |

---

## 11. Practice Reference

To validate this spec against a realistic scenario, see the practice mapping set in the project's working documents. The following table confirms every mapping type is covered:

| Mapping Type | Example Rule # | DSL Functions Used |
|--------------|---------------|--------------------|
| Direct copy | #1, #6, #8, #12–16, #18, #20–22, #24, #28–29, #39–41, #43, #45 | `source()` |
| Static value | #3 | `static()` |
| Date format | #2 | `formatDate()` |
| Value lookup | #4, #5, #17, #23, #25, #38, #42 | `valueMap()` |
| Uppercase | #11, #26 | `upper()` |
| Concatenation | #7, #27 | `concat()` |
| Strip characters | #9 | `replaceAll()` |
| Null default | #19 | `default()` |
| Boolean conditional | #10, #46 | `if()`, `contains()` |
| Numeric conditional | #37 | `if()`, `gt()` |
| Array join | #44 | `join()` |
| Array mapping | #30–36 | `map()`, `item()` (see Arrays spec) |

---

*End of DSL specification. Array semantics are defined in `specs/KEYRA-DSL-ARRAYS.md`.*
