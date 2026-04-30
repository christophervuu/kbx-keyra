# KeyRa DSL — Array Specification

**Version:** 1.0.0
**Status:** Draft
**Date:** 2026-04-23
**Parent:** `specs/KEYRA-DSL-SPECIFICATION.md`

---

## 1. Overview

Arrays are the only part of the KeyRa DSL that introduces **scope** — a runtime context where `item()` refers to a different value for each element being processed. Every other DSL function is stateless: input in, output out. Array functions create an implicit loop and a scoped binding.

This spec defines:
- How array contexts work (scoping, nesting, shadowing)
- The full function catalog for sarray operations
- How to build arrays from non-array sources
- How to merge multiple source arrays into one target array
- How to cross-reference arrays by key
- Edge cases and null behavior

### 1.1 When Arrays Are Needed

| Scenario | Example |
|----------|---------|
| Source array → target array (1:1 transform) | `items[]` → `lineItems[]` |
| Source array → target array (filtered subset) | Only items with `discountAmount > 0` |
| Source array → single value | Join `tags[]` into a comma-separated string |
| Multiple source arrays → one target array | `domesticAddresses[]` + `internationalAddresses[]` → `allAddresses[]` |
| Individual scalars → target array | `primaryPhone`, `mobilePhone`, `faxNumber` → `contactMethods[]` |
| Cross-reference two arrays by key | `lineItems[]` + `taxLines[]` joined on `lineId` → `orderLines[]` |
| Scalar injected into every array element | `orderId` stamped onto every `lineItem` |
| Nested arrays | `departments[].employees[]` → `divisions[].staff[]` |

---

## 2. Scoping Rules

Scoping determines what `item()`, `parent()`, and `source()` refer to at any point in an expression. These rules are absolute — no exceptions.

### Rule 1: `item()` Refers to the Nearest Enclosing Array Context

An **array context** is created by: `map()`, `filter()`, `find()`. Inside any of these, `item()` is bound to the current element being processed.

```
map(source("items"), {
  "sku": item("sku")
})
```

Here, `item("sku")` reads the `sku` field from each element of `source("items")` as the engine iterates.

### Rule 2: `item()` Outside Any Array Context Is an Error

```
item("sku")
```

**Result:** `KEYRA-E010` — `item()` used outside array context.

This is a validation-time error caught before execution.

### Rule 3: `source()` Is Always Global

`source()` always reads from the root source document, regardless of how deeply nested the expression is within `map()`, `filter()`, or `find()` calls. It never reads from the current array element.

```
map(source("items"), {
  "sku": item("sku"),
  "orderId": source("orderId"),
  "currency": source("payment.currency")
})
```

`source("orderId")` reads `"ORD-2026-00421"` from the root document for every element — it does not look for `orderId` inside each item. This is how BAs inject document-level values into every array element.

### Rule 4: `parent()` Refers to the Enclosing Array Context's Current Element

When `map()`, `filter()`, or `find()` is nested inside another `map()`, `parent()` accesses the outer context's current element. `item()` refers to the inner context.

```
map(source("departments"), {
  "deptName": item("name"),
  "staff": map(item("employees"), {
    "employeeId": item("id"),
    "employeeName": item("name"),
    "department": parent("name")
  })
})
```

| Expression | Refers To |
|------------|-----------|
| Inner `item("id")` | Current employee |
| Inner `item("name")` | Current employee's name |
| `parent("name")` | Current department's name (outer `map()`) |
| `source("companyName")` | Root document (always global) |

### Rule 5: `parent()` Outside a Nested Array Context Is an Error

`parent()` requires at least two levels of array context. Using it in a top-level `map()` or outside any `map()` produces `KEYRA-E013`.

```
// Top-level map — only one array context. parent() has nothing to refer to.
map(source("items"), {
  "sku": item("sku"),
  "bad": parent("something")     ← KEYRA-E013
})
```

### Rule 6: `item("")` Returns the Entire Current Element

An empty path returns the whole element. Useful for arrays of primitives (strings, numbers) rather than arrays of objects.

```
// source("tags") is ["gift", "priority"]
map(source("tags"), upper(item("")))
// → ["GIFT", "PRIORITY"]
```

### Rule 7: `parent("")` Returns the Entire Outer Element

Same convention as `item("")` but for the outer array context.

```
map(source("departments"), {
  "staff": map(item("employees"), {
    "emp": item("name"),
    "dept": parent("")
  })
})
// parent("") returns the full department object: { "name": "Engineering", "employees": [...] }
```

### 2.1 Scope Stack Visualization

The engine maintains a scope stack. Each array function pushes a new scope; when it completes, the scope is popped.

```
[Global]                          ← source() reads from here (always)
  └─ map(source("departments"))   ← item() reads from current department
       └─ map(item("employees"))  ← item() reads from current employee
                                     parent() reads from current department
                                     source() still reads from root
```

| Stack Depth | `item()` | `parent()` | `source()` |
|-------------|----------|------------|------------|
| 0 (outside any map) | `KEYRA-E010` | `KEYRA-E013` | Root document |
| 1 (single map) | Current element | `KEYRA-E013` | Root document |
| 2 (nested map) | Inner element | Outer element | Root document |

### 2.2 Triple Nesting

Triple nesting (three levels of `map()`) is supported by the grammar but `parent()` only reaches one level up. For v1.0, this is a documented limitation:

```
map(source("a"), {
  "b": map(item("b"), {
    "c": map(item("c"), {
      "innerVal": item("x"),         ← current c element
      "midVal": parent("y"),         ← current b element
      "outerVal": ???                ← current a element — NOT ACCESSIBLE via parent()
    })
  })
})
```

**Workaround:** Restructure the template to pass the outer value down:

```
map(source("a"), {
  "aName": item("name"),
  "b": map(item("b"), {
    "bName": item("name"),
    "c": map(item("c"), {
      "innerVal": item("x"),
      "midVal": parent("name"),
      "outerVal": source("a[0].name")   ← only works if the index is known
    })
  })
})
```

If triple-nested scope access becomes a real requirement, a future minor version will introduce **named scopes** (see §8 Future Extensions). The grammar will not change — only an optional parameter is added to `map()`.

---

## 3. Function Catalog

### 3.1 `map(array, template_or_expression): array`

Transform each element of an array. Creates an array context where `item()` is available.

**Parameters:**
- `array` — an expression that evaluates to an array (typically `source("path")` or `item("path")` in nested contexts)
- `template_or_expression` — either:
  - An **object template** `{ "key": expression, ... }` — produces an array of objects
  - A **single expression** — produces an array of values

**Returns:** A new array with one output element per input element.

**Null behavior:**
- Null array → `null` (not an empty array).
- Empty array `[]` → `[]`.
- If an expression within the template evaluates to null for a given element, that field is null in the output object. The element itself is still included.

**Errors:**
- `KEYRA-E015` if the second argument is neither an object template nor a valid expression.

#### Object Template Mode

Each key in the template becomes a field in the output object. Each value is an expression evaluated per element.

```
map(source("items"), {
  "productCode": item("sku"),
  "description": item("name"),
  "qty": item("quantity"),
  "priceEach": item("unitPrice"),
  "lineDiscount": item("discountAmount"),
  "lineTax": item("taxAmount"),
  "hasDiscount": gt(item("discountAmount"), 0)
})
```

**Input:** `source("items")` is:
```json
[
  { "sku": "KB-1001", "name": "Mechanical Keyboard", "quantity": 1, "unitPrice": 89.99, "discountAmount": 9.0, "taxAmount": 6.88 },
  { "sku": "MS-2002", "name": "Wireless Mouse", "quantity": 2, "unitPrice": 29.99, "discountAmount": 0.0, "taxAmount": 4.61 }
]
```

**Output:**
```json
[
  { "productCode": "KB-1001", "description": "Mechanical Keyboard", "qty": 1, "priceEach": 89.99, "lineDiscount": 9.0, "lineTax": 6.88, "hasDiscount": true },
  { "productCode": "MS-2002", "description": "Wireless Mouse", "qty": 2, "priceEach": 29.99, "lineDiscount": 0.0, "lineTax": 4.61, "hasDiscount": false }
]
```

#### Expression Mode

The second argument is a single expression evaluated per element. Produces an array of values (not objects).

```
map(source("tags"), upper(item("")))
```

**Input:** `["gift", "priority"]`
**Output:** `["GIFT", "PRIORITY"]`

```
map(source("items"), item("sku"))
```

**Input:** `[{ "sku": "KB-1001", ... }, { "sku": "MS-2002", ... }]`
**Output:** `["KB-1001", "MS-2002"]`

#### Mixing `item()` and `source()` in Templates

`source()` reaches the root document. `item()` reads from the current element. Both can appear in the same template.

```
map(source("items"), {
  "productCode": item("sku"),
  "orderRef": source("orderId"),
  "currency": source("payment.currency"),
  "netPrice": subtract(item("unitPrice"), item("discountAmount"))
})
```

Every output element gets `orderRef: "ORD-2026-00421"` and `currency: "USD"` — the same values stamped on every row.

---

### 3.2 `filter(array, condition): array`

Select elements from an array where the condition evaluates to `true`. Creates an array context where `item()` is available **in the condition only**.

**Parameters:**
- `array` — an expression that evaluates to an array
- `condition` — a boolean expression evaluated per element. `item()` is available.

**Returns:** A new array containing only elements where the condition was `true`. Elements are **unchanged** — `filter()` does not transform, it selects.

**Null behavior:**
- Null array → `null`.
- Empty array → `[]`.
- If the condition evaluates to `null` for an element, that element is **excluded** (null is treated as not-true).

**Errors:**
- `KEYRA-E017` if the condition does not evaluate to a boolean (or null).

**Warnings:**
- `KEYRA-E016` (warning) if all elements are filtered out (result is empty array).

**Examples:**

```
filter(source("items"), gt(item("discountAmount"), 0))
```

**Input:** `[{ "sku": "KB-1001", "discountAmount": 9.0 }, { "sku": "MS-2002", "discountAmount": 0.0 }]`
**Output:** `[{ "sku": "KB-1001", "discountAmount": 9.0 }]`

#### Composition: `filter()` Then `map()`

A common pattern — filter first, then transform the subset:

```
map(
  filter(source("items"), gt(item("discountAmount"), 0)),
  {
    "sku": item("sku"),
    "discount": item("discountAmount")
  }
)
```

The `item()` inside `filter()`'s condition refers to each candidate element. The `item()` inside `map()`'s template refers to each element of the **filtered** result. Since `filter()` doesn't change element shape, these are the same objects — but the scopes are technically separate (filter's scope is popped before map's scope is pushed).

---

### 3.3 `find(array, condition): any`

Return the **first** element in the array where the condition evaluates to `true`. Creates an array context where `item()` is available in the condition.

**Parameters:**
- `array` — an expression that evaluates to an array
- `condition` — a boolean expression evaluated per element. `item()` is available. If used inside a `map()`, `parent()` is also available and refers to the outer `map()`'s current element.

**Returns:** The first matching element (an object or primitive), or `null` if no element matches.

**Null behavior:**
- Null array → `null`.
- Empty array → `null`.
- No match → `null` (+ `KEYRA-E019` warning).

**Errors:**
- `KEYRA-E017` if the condition does not evaluate to a boolean (or null).

**Warnings:**
- `KEYRA-E019` if no element matches the condition.

**Primary use case:** Cross-referencing two arrays by a shared key.

**Example: Cross-array lookup**

Source data:
```json
{
  "lineItems": [
    { "lineId": "L1", "sku": "KB-1001", "qty": 1 },
    { "lineId": "L2", "sku": "MS-2002", "qty": 2 }
  ],
  "taxLines": [
    { "lineRef": "L1", "taxAmount": 6.88 },
    { "lineRef": "L2", "taxAmount": 4.61 }
  ]
}
```

Expression:
```
map(source("lineItems"), {
  "sku": item("sku"),
  "qty": item("qty"),
  "tax": get(
    find(source("taxLines"), eq(item("lineRef"), parent("lineId"))),
    "taxAmount"
  )
})
```

**How scoping works here:**
- Outer: `map(source("lineItems"), ...)` — `item()` = current line item
- Inner: `find(source("taxLines"), ...)` — `item()` = current tax line candidate, `parent()` = current line item from outer `map()`
- `eq(item("lineRef"), parent("lineId"))` compares each tax line's `lineRef` against the current line item's `lineId`

**Output:**
```json
[
  { "sku": "KB-1001", "qty": 1, "tax": 6.88 },
  { "sku": "MS-2002", "qty": 2, "tax": 4.61 }
]
```

**Handling no match:**
```
map(source("lineItems"), {
  "sku": item("sku"),
  "tax": default(
    get(
      find(source("taxLines"), eq(item("lineRef"), parent("lineId"))),
      "taxAmount"
    ),
    0
  )
})
```

If `find()` returns `null` (no matching tax line), `get()` propagates null, and `default()` falls back to `0`.

---

### 3.4 `get(object, path): any`

Read a field from any in-memory object value using dot/bracket path notation. This is the complement to `source()` (which reads from the root document) and `item()` (which reads from the current array element). `get()` reads from an arbitrary value — typically the result of `find()`, `first()`, or `nth()`.

**Parameters:**
- `object` — any expression that evaluates to an object
- `path` — a string using the same dot/bracket path syntax as `source()` (see main DSL spec §2.3)

**Returns:** The value at the path within the object, or `null` if the path does not exist.

**Null behavior:**
- Null object → `null` (null propagation).
- Path not found → `null`.

**Errors:**
- `KEYRA-E018` if the first argument is not an object or null (e.g., passing a string or number).

**Examples:**

```
get(first(source("items")), "sku")
// → "KB-1001" (reads "sku" from the first element of items)

get(nth(source("items"), 1), "name")
// → "Wireless Mouse"

get(find(source("taxLines"), eq(item("lineRef"), "L1")), "taxAmount")
// → 6.88

get(null, "anything")
// → null
```

**When to use `get()` vs. `source()` vs. `item()`:**

| Function | Reads From | When to Use |
|----------|-----------|-------------|
| `source(path)` | Root source document | Always available. The primary accessor. |
| `item(path)` | Current array element in `map()`/`filter()`/`find()` | Inside array contexts only. |
| `parent(path)` | Outer array element in nested contexts | Inside nested array contexts only. |
| `get(object, path)` | Any in-memory value | Reading fields from the result of `find()`, `first()`, `nth()`, or any expression that returns an object. |

---

### 3.5 `array(...elements): array`

Build an array from individual expressions. Each argument becomes one element in the resulting array.

**Parameters:** Variable number of arguments (minimum 1). Each argument is any expression.

**Returns:** An array containing the evaluated value of each argument, in order.

**Null behavior:** Null arguments are **included** as null elements. The array is never silently shortened. Use `filter()` to remove nulls if desired.

**Errors:**
- `KEYRA-E003` if called with zero arguments.

**Primary use cases:**
- Building a target array from individual scalar source fields
- Wrapping a single value in an array

#### Building an Array from Scalars

Source:
```json
{
  "primaryPhone": "316-555-0182",
  "mobilePhone": "316-555-9999",
  "faxNumber": null
}
```

Expression:
```
array(
  { "type": "PRIMARY", "number": replaceAll(source("primaryPhone"), "-", "") },
  { "type": "MOBILE", "number": replaceAll(source("mobilePhone"), "-", "") },
  { "type": "FAX", "number": replaceAll(source("faxNumber"), "-", "") }
)
```

**Output (includes null):**
```json
[
  { "type": "PRIMARY", "number": "3165550182" },
  { "type": "MOBILE", "number": "3165559999" },
  { "type": "FAX", "number": null }
]
```

#### Filtering Out Null Entries

```
filter(
  array(
    { "type": "PRIMARY", "number": replaceAll(source("primaryPhone"), "-", "") },
    { "type": "MOBILE", "number": replaceAll(source("mobilePhone"), "-", "") },
    { "type": "FAX", "number": replaceAll(source("faxNumber"), "-", "") }
  ),
  not(isNull(item("number")))
)
```

**Output (FAX removed):**
```json
[
  { "type": "PRIMARY", "number": "3165550182" },
  { "type": "MOBILE", "number": "3165559999" }
]
```

#### Wrapping a Scalar in an Array

```
array(source("defaultWarehouse"))
```

**Input:** `"WH-001"`
**Output:** `["WH-001"]`

---

### 3.6 `merge(...arrays): array`

Combine multiple arrays into a single array, preserving order. First array's elements appear first, then second array's elements, and so on.

**Parameters:** Variable number of arguments (minimum 1). Each argument must evaluate to an array or null.

**Returns:** A single flat array containing all elements from all input arrays, in order.

**Null behavior:** Null arguments are treated as empty arrays (skipped). This is important because in real data, one of the source arrays may not exist.

**Errors:**
- `KEYRA-E003` if called with zero arguments.
- `KEYRA-E005` if any non-null argument is not an array.

**Difference from `flatten()`:**

| Function | Input | Output |
|----------|-------|--------|
| `merge(a, b, c)` | Multiple separate arrays as **arguments** | Single combined array |
| `flatten(x)` | One array that **contains** nested arrays | Single array, one level flattened |

`merge()` takes N arguments. `flatten()` takes 1 argument. Different use cases.

#### Merging Two Source Arrays with Different Transforms

Source:
```json
{
  "domesticAddresses": [
    { "city": "Wichita", "country": "US" },
    { "city": "Kansas City", "country": "US" }
  ],
  "internationalAddresses": [
    { "city": "Toronto", "country": "CA" }
  ]
}
```

Expression:
```
merge(
  map(source("domesticAddresses"), {
    "municipality": item("city"),
    "countryCode": valueMap(item("country"), { "US": "USA" }),
    "origin": static("DOMESTIC")
  }),
  map(source("internationalAddresses"), {
    "municipality": item("city"),
    "countryCode": valueMap(item("country"), { "CA": "CAN" }),
    "origin": static("INTERNATIONAL")
  })
)
```

**Output:**
```json
[
  { "municipality": "Wichita", "countryCode": "USA", "origin": "DOMESTIC" },
  { "municipality": "Kansas City", "countryCode": "USA", "origin": "DOMESTIC" },
  { "municipality": "Toronto", "countryCode": "CAN", "origin": "INTERNATIONAL" }
]
```

#### Merging Arrays with Scalars

Combine an array with constructed entries:

```
merge(
  map(source("items"), {
    "type": "PRODUCT",
    "description": item("name"),
    "amount": item("unitPrice")
  }),
  array(
    { "type": "SHIPPING", "description": "Shipping charge", "amount": source("shipping.cost") }
  )
)
```

This appends a shipping line to the product lines — a common integration pattern.

#### Null Source Array Handling

```
merge(
  source("domesticAddresses"),
  source("internationalAddresses")
)
```

If `internationalAddresses` does not exist (null), the result contains only the domestic addresses. No error, no warning.

---

### 3.7 `flatten(array): array`

Flatten one level of array nesting. Elements that are arrays are expanded inline; non-array elements are kept as-is.

**Parameters:**
- `array` — an expression that evaluates to an array

**Returns:** A new array with one level of nesting removed.

**Null behavior:**
- Null array → `null`.
- Empty array → `[]`.

**Depth:** Exactly one level. `flatten([[1, [2]], [3]])` → `[1, [2], 3]`. Deep flatten is not supported in v1.0.

**Examples:**

```
flatten(source("nestedArrays"))
```

**Input:** `[[1, 2], [3, 4], [5]]`
**Output:** `[1, 2, 3, 4, 5]`

```
// Collecting all employees from all departments into a flat list
flatten(map(source("departments"), item("employees")))
```

**Input:** `departments` has 2 entries with 2 and 1 employees respectively.
**Output:** Flat array of 3 employee objects.

**Note on `map()` expression mode:** The `flatten()` + `map()` pattern is needed when `map()` produces arrays (because each element's field is itself an array). Without expression mode, this would require restructuring.

---

### 3.8 `count(array): number`

Return the number of elements in an array.

**Parameters:**
- `array` — an expression that evaluates to an array

**Returns:** Integer count of elements.

**Null behavior (special):** Null array returns `0` (not null). This is an exception to standard null propagation. Rationale: "how many items are there?" has a meaningful answer when there are none.

**Examples:**

```
count(source("items"))                     → 2
count(source("tags"))                      → 2
count(filter(source("items"), gt(item("discountAmount"), 0)))  → 1
count(null)                                → 0
count(source("emptyArray"))                → 0 (if emptyArray is [])
```

---

### 3.9 `first(array): any`

Return the first element of an array, or `null` if the array is empty.

**Parameters:**
- `array` — an expression that evaluates to an array

**Returns:** The first element (object, string, number, etc.), or `null`.

**Null behavior:**
- Null array → `null`.
- Empty array → `null`.

**Examples:**

```
first(source("items"))
// → { "sku": "KB-1001", "name": "Mechanical Keyboard", ... }

get(first(source("items")), "sku")
// → "KB-1001"

first(source("tags"))
// → "gift"

first(filter(source("items"), gt(item("unitPrice"), 50)))
// → { "sku": "KB-1001", ... } (first item over $50)
```

---

### 3.10 `nth(array, index): any`

Return the element at a specific index. Supports negative indices (counting from end).

**Parameters:**
- `array` — an expression that evaluates to an array
- `index` — an integer. `0` = first element, `1` = second, `-1` = last, `-2` = second-to-last.

**Returns:** The element at the index, or `null` if out of bounds.

**Null behavior:**
- Null array → `null`.
- Out-of-bounds index → `null` (+ `KEYRA-E014` warning, not error).

**Design note:** Out-of-bounds produces a **warning** (not an error) and returns `null`. This is intentional — arrays may vary in length at runtime, and a missing element should be handleable via `default()`, not crash the mapping. This differs from the earlier proposal (§ Error Codes) where `KEYRA-E014` was an error. Changed to warning for runtime safety.

**Examples:**

```
nth(source("items"), 0)                    → first item object
nth(source("items"), 1)                    → second item object
nth(source("items"), -1)                   → last item object
nth(source("items"), 99)                   → null (+ KEYRA-W004)
nth(source("tags"), 0)                     → "gift"

get(nth(source("items"), 0), "sku")        → "KB-1001"

// Path syntax in source() also works for known indices:
source("items[0].sku")                     → "KB-1001"
// nth() is preferred when the index is computed or when you need the full element.
```

---

### 3.11 `join(array, separator): string`

Concatenate all elements of a string array into a single string, with a separator between each element. Defined in the main DSL spec but included here for completeness.

**Parameters:**
- `array` — an expression that evaluates to an array of strings (or primitives that will be cast to string)
- `separator` — a string inserted between each element

**Returns:** A single concatenated string.

**Null behavior:**
- Null array → `null`.
- Empty array → `""`.
- Null elements within the array are **skipped** (not rendered as "null").

**Errors:**
- `KEYRA-E005` if any non-null element is not a string. Use `map()` with `cast()` to convert first.

**Examples:**

```
join(source("tags"), ",")                  → "gift,priority"
join(source("tags"), ", ")                 → "gift, priority"
join(source("tags"), "")                   → "giftpriority"

// Join with transform:
join(map(source("tags"), upper(item(""))), ",")
// → "GIFT,PRIORITY"

// Join array of numbers (requires cast):
join(map(source("items"), cast(item("quantity"), "string")), ",")
// → "1,2"

// Array with nulls:
// source("values") = ["a", null, "b"]
join(source("values"), ",")                → "a,b" (null skipped)
```

---

### 3.12 `item(path): any`

Read a value from the current array element. Only valid inside an array context created by `map()`, `filter()`, or `find()`.

**Parameters:**
- `path` — a string using dot/bracket path notation (see main DSL spec §2.3). Empty string `""` returns the entire element.

**Returns:** The value at the path within the current element, or `null` if the path does not exist.

**Null behavior:**
- Path not found → `null` (+ `KEYRA-W002`).

**Errors:**
- `KEYRA-E010` if used outside an array context. This is a validation-time error.

**Examples:**

```
// Inside map():
map(source("items"), {
  "sku": item("sku"),                      → "KB-1001" (then "MS-2002")
  "price": item("unitPrice"),              → 89.99 (then 29.99)
  "nested": item("details.color")          → reads nested field via dot notation
})

// For primitive arrays:
// source("tags") = ["gift", "priority"]
map(source("tags"), upper(item("")))       → ["GIFT", "PRIORITY"]

// Inside filter():
filter(source("items"), gt(item("discountAmount"), 0))

// Inside find():
find(source("taxLines"), eq(item("lineRef"), "L1"))
```

---

### 3.13 `parent(path): any`

Read a value from the enclosing (outer) array context's current element. Only valid inside a nested array context — i.e., a `map()`/`filter()`/`find()` that is itself inside another `map()`.

**Parameters:**
- `path` — a string using dot/bracket path notation. Empty string `""` returns the entire outer element.

**Returns:** The value at the path within the outer context's current element, or `null` if the path does not exist.

**Null behavior:**
- Path not found → `null` (+ `KEYRA-W002`).

**Errors:**
- `KEYRA-E013` if used outside a nested array context (i.e., in a top-level `map()` or outside any `map()`).

**Scope depth:** `parent()` reaches exactly one level up. It does not support a depth argument in v1.0.

**Examples:**

```
// Nested map:
map(source("departments"), {
  "deptName": item("name"),
  "staff": map(item("employees"), {
    "employeeId": item("id"),
    "department": parent("name")           → current department's name
  })
})

// Cross-array lookup inside map (find creates a nested context):
map(source("lineItems"), {
  "sku": item("sku"),
  "tax": get(
    find(source("taxLines"), eq(item("lineRef"), parent("lineId"))),
    "taxAmount"
  )
})
// Here: find()'s item() = current taxLine, find()'s parent() = current lineItem from outer map()

// parent("") returns the entire outer element:
map(source("departments"), {
  "staff": map(item("employees"), {
    "fullDept": parent("")                 → entire department object
  })
})
```

---

## 4. Nested Object Templates

Object templates (the `{ ... }` syntax inside `map()` and `array()`) can be nested to produce nested output structures.

```
map(source("items"), {
  "product": {
    "code": item("sku"),
    "name": item("name")
  },
  "pricing": {
    "unitPrice": item("unitPrice"),
    "discount": item("discountAmount"),
    "net": subtract(item("unitPrice"), item("discountAmount"))
  }
})
```

**Output per element:**
```json
{
  "product": {
    "code": "KB-1001",
    "name": "Mechanical Keyboard"
  },
  "pricing": {
    "unitPrice": 89.99,
    "discount": 9.0,
    "net": 80.99
  }
}
```

**Rules:**
- Nesting depth in templates is unlimited (follows the same 32-level recursion limit as expressions).
- Nested templates are evaluated in the same array context as the parent template — `item()` and `parent()` bindings do not change.
- Templates are purely structural — they define the output shape. Logic lives in the expressions (the values).

---

## 5. Null and Empty Array Behavior Summary

This section consolidates all null/empty behaviors in one reference table.

| Input | `map()` | `filter()` | `find()` | `count()` | `first()` | `nth()` | `join()` | `flatten()` | `merge()` arg | `array()` arg |
|-------|---------|-----------|----------|----------|---------|--------|---------|------------|--------------|--------------|
| `null` | `null` | `null` | `null` | `0` | `null` | `null` | `null` | `null` | Treated as `[]` | Included as `null` element |
| `[]` (empty) | `[]` | `[]` | `null` | `0` | `null` | `null` | `""` | `[]` | Treated as `[]` | N/A (not an array input) |
| Array with null elements | Null elements processed normally | Null condition → excluded | Null condition → skipped | Counted | May return null element | May return null element | Null elements skipped | Null elements kept | N/A | N/A |

**Design rationale for asymmetry:**
- `count()` returns `0` for null because "how many?" has a meaningful zero answer.
- `merge()` skips null arguments because a missing source array shouldn't break a multi-source merge.
- `array()` includes null arguments because the BA explicitly listed each element — omitting one silently changes the array's structure.
- `join()` skips null elements because inserting the string "null" into a joined result is almost never desired.

---

## 6. Patterns and Recipes

### 6.1 Basic 1:1 Array Mapping

The most common pattern. Each source element becomes one target element.

```
// Rule for target "lineItems"
map(source("items"), {
  "productCode": item("sku"),
  "description": item("name"),
  "qty": item("quantity"),
  "priceEach": item("unitPrice"),
  "lineDiscount": item("discountAmount"),
  "lineTax": item("taxAmount"),
  "hasDiscount": gt(item("discountAmount"), 0)
})
```

### 6.2 Filter Then Map

Select a subset, then transform.

```
map(
  filter(source("items"), gt(item("discountAmount"), 0)),
  {
    "sku": item("sku"),
    "discountApplied": item("discountAmount")
  }
)
```

### 6.3 Inject Document-Level Fields into Array

Stamp every array element with a value from the root document.

```
map(source("items"), {
  "productCode": item("sku"),
  "orderRef": source("orderId"),
  "currency": source("payment.currency")
})
```

### 6.4 Build Array from Scalars

No source array exists — construct one from individual fields.

```
filter(
  array(
    { "type": "PRIMARY", "number": replaceAll(source("primaryPhone"), "-", "") },
    { "type": "MOBILE", "number": replaceAll(source("mobilePhone"), "-", "") },
    { "type": "FAX", "number": replaceAll(source("faxNumber"), "-", "") }
  ),
  not(isNull(item("number")))
)
```

### 6.5 Merge Multiple Source Arrays

Two source arrays with different transforms into one target array.

```
merge(
  map(source("domesticAddresses"), {
    "city": item("city"),
    "origin": static("DOMESTIC")
  }),
  map(source("internationalAddresses"), {
    "city": item("city"),
    "origin": static("INTERNATIONAL")
  })
)
```

### 6.6 Append a Constructed Entry to a Mapped Array

Product lines plus a shipping line.

```
merge(
  map(source("items"), {
    "type": static("PRODUCT"),
    "description": item("name"),
    "amount": item("unitPrice")
  }),
  array(
    { "type": "SHIPPING", "description": "Shipping", "amount": source("shipping.cost") }
  )
)
```

### 6.7 Cross-Reference Two Arrays by Key

Join line items with tax lines by matching `lineId` to `lineRef`.

```
map(source("lineItems"), {
  "sku": item("sku"),
  "qty": item("qty"),
  "tax": default(
    get(
      find(source("taxLines"), eq(item("lineRef"), parent("lineId"))),
      "taxAmount"
    ),
    0
  )
})
```

### 6.8 Wrap a Scalar in an Array

Target expects an array, source has a single value.

```
array(source("defaultWarehouse"))
// "WH-001" → ["WH-001"]
```

### 6.9 Array to String

Join a primitive array into a delimited string.

```
join(source("tags"), ",")
// ["gift", "priority"] → "gift,priority"
```

### 6.10 Nested Array Mapping

Departments containing employees — two levels.

```
map(source("departments"), {
  "deptName": item("name"),
  "headCount": count(item("employees")),
  "staff": map(item("employees"), {
    "employeeId": item("id"),
    "employeeName": item("name"),
    "department": parent("name")
  })
})
```

### 6.11 Flatten Nested Arrays

Collect all employees from all departments into a flat list.

```
flatten(map(source("departments"), item("employees")))
```

### 6.12 Conditional Array Mapping

Different target structure based on a condition within each element.

```
map(source("items"), {
  "code": item("sku"),
  "label": if(
    gt(item("discountAmount"), 0),
    concat(item("name"), " (DISCOUNTED)"),
    item("name")
  )
})
```

---

## 7. Error Codes

### 7.1 Array-Specific Errors

| Code | Severity | Message | Cause |
|------|----------|---------|-------|
| `KEYRA-E010` | error | `item()` used outside array context | `item()` appears in an expression that is not inside `map()`, `filter()`, or `find()`. Caught at validation time. |
| `KEYRA-E013` | error | `parent()` used outside nested array context | `parent()` appears in a context with fewer than 2 levels of array nesting. |
| `KEYRA-E015` | error | `map()` template must be an object literal or an expression | Second argument to `map()` is neither `{ ... }` nor a valid expression. |
| `KEYRA-E017` | error | `filter()`/`find()` condition must evaluate to a boolean | Condition returned a non-boolean, non-null value. |
| `KEYRA-E018` | error | `get()` first argument must be an object, got `{type}` | Passed a string, number, or array to `get()` instead of an object. |

### 7.2 Array-Specific Warnings

| Code | Severity | Message | Cause |
|------|----------|---------|-------|
| `KEYRA-W004` | warning | Array index out of bounds: index `{index}`, array length `{length}` | `nth()` index exceeds array length. Returns `null`. |
| `KEYRA-E016` | warning | `filter()` produced empty array — all elements filtered out | All elements failed the condition. May indicate a logic error. |
| `KEYRA-E019` | warning | `find()` matched no elements — returning null | No element satisfied the condition. |

---

## 8. Future Extensions

The following capabilities are **not** in v1.0 but are designed to be addable as minor version bumps with no grammar changes.

### 8.1 Named Scopes

Adds an optional scope name parameter to `map()` for triple-nested access:

```
map(source("a"), "outerScope", {
  "b": map(item("b"), "midScope", {
    "c": map(item("c"), {
      "innerVal": item("x"),
      "midVal": scope("midScope", "y"),
      "outerVal": scope("outerScope", "z")
    })
  })
})
```

- `scope(name, path)` replaces `parent()` for explicit multi-level access.
- `parent()` continues to work as "one level up" for backward compatibility.
- Only introduced if real-world triple nesting becomes a recurring need.

### 8.2 `sort(array, expression, direction)`

Sort array elements by a computed value.

```
sort(source("items"), item("unitPrice"), "desc")
// → items sorted by unitPrice descending
```

### 8.3 `distinct(array, expression?)`

Remove duplicate elements. Optional expression specifies the dedup key.

```
distinct(source("tags"))
// → unique tags

distinct(source("items"), item("sku"))
// → one element per unique sku
```

### 8.4 `reduce(array, accumulator, initialValue)`

General-purpose aggregation. Powerful but harder for BAs to understand — deferred to assess demand.

### 8.5 `groupBy(array, keyExpression)`

Group array elements by a computed key. Returns an object where keys are group values and values are arrays.

---

## 9. Versioning

This spec follows the versioning rules defined in the parent DSL spec (§7):

- **Minor version** bump when new array functions are added (e.g., `sort`, `distinct`).
- **Patch version** bump for documentation clarifications or new recipe examples.
- **Major version** bump only if existing function behavior changes (e.g., `count(null)` changing from `0` to `null`).

All existing expressions remain valid across minor versions. The engine must parse any expression written against an equal or older minor version.

---

*End of Array specification.*