/**
 * DSL Function Catalog — shared static data for the expression builder, autocomplete,
 * function reference panel, and diagnostics display.
 *
 * This is a build-time static structure derived from the engine function registry.
 * Categories: String, Date, Math, Conditional, Lookup, Array, NullHandling, TypeConversion, SourceAccess.
 *
 * Source Access functions (source, item, parent, constant, external, static) are included
 * in a separate "SourceAccess" category. Consumers (e.g. the guided builder picker) should
 * filter this category out and handle source access specially.
 *
 * Consumed by: FS-011 (builder, autocomplete, reference), FS-012 (diagnostics), FS-010 (rule type inference).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FunctionCategory =
  | 'String'
  | 'Date'
  | 'Math'
  | 'Conditional'
  | 'Lookup'
  | 'Array'
  | 'NullHandling'
  | 'TypeConversion'
  | 'SourceAccess';

export interface FunctionCatalogParameter {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly variadic?: boolean;
}

export interface FunctionCatalogEntry {
  readonly name: string;
  readonly category: FunctionCategory;
  readonly description: string;
  readonly parameterCount: number | `${number}+`;
  readonly parameters: readonly FunctionCatalogParameter[];
  readonly returnType: string;
  readonly example: string;
}

export interface AutocompleteItem {
  readonly label: string;
  readonly insertText: string;
  readonly detail: string;
  readonly kind: 'function' | 'field' | 'constant' | 'external' | 'keyword';
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const DSL_FUNCTION_CATALOG: readonly FunctionCatalogEntry[] = [
  // ----- String -----
  {
    name: 'concat',
    category: 'String',
    description: 'Concatenates two or more string values.',
    parameterCount: '1+',
    parameters: [
      { name: 'value', type: 'string', required: true },
      { name: 'rest', type: 'string', required: false, variadic: true },
    ],
    returnType: 'string',
    example: 'concat(source("firstName"), " ", source("lastName"))',
  },
  {
    name: 'substring',
    category: 'String',
    description: 'Extracts a portion of a string by start (inclusive) and optional end (exclusive) index.',
    parameterCount: '2+',
    parameters: [
      { name: 'value', type: 'string', required: true },
      { name: 'start', type: 'number', required: true },
      { name: 'end', type: 'number', required: false },
    ],
    returnType: 'string',
    example: 'substring(source("code"), 0, 3)',
  },
  {
    name: 'upper',
    category: 'String',
    description: 'Converts a string to uppercase.',
    parameterCount: 1,
    parameters: [{ name: 'value', type: 'string', required: true }],
    returnType: 'string',
    example: 'upper(source("name"))',
  },
  {
    name: 'lower',
    category: 'String',
    description: 'Converts a string to lowercase.',
    parameterCount: 1,
    parameters: [{ name: 'value', type: 'string', required: true }],
    returnType: 'string',
    example: 'lower(source("name"))',
  },
  {
    name: 'trim',
    category: 'String',
    description: 'Removes leading and trailing whitespace from a string.',
    parameterCount: 1,
    parameters: [{ name: 'value', type: 'string', required: true }],
    returnType: 'string',
    example: 'trim(source("description"))',
  },
  {
    name: 'replace',
    category: 'String',
    description: 'Replaces the first occurrence of a search string with a replacement.',
    parameterCount: 3,
    parameters: [
      { name: 'value', type: 'string', required: true },
      { name: 'search', type: 'string', required: true },
      { name: 'replacement', type: 'string', required: true },
    ],
    returnType: 'string',
    example: 'replace(source("text"), "foo", "bar")',
  },
  {
    name: 'replaceAll',
    category: 'String',
    description: 'Replaces all occurrences of a search string with a replacement.',
    parameterCount: '2+',
    parameters: [
      { name: 'value', type: 'string', required: true },
      { name: 'search', type: 'string', required: true },
      { name: 'replacement', type: 'string', required: false },
    ],
    returnType: 'string',
    example: 'replaceAll(source("text"), "-", "_")',
  },
  {
    name: 'contains',
    category: 'String',
    description: 'Returns true if the haystack string contains the needle string.',
    parameterCount: 2,
    parameters: [
      { name: 'haystack', type: 'string', required: true },
      { name: 'needle', type: 'string', required: true },
    ],
    returnType: 'boolean',
    example: 'contains(source("tags"), "urgent")',
  },
  {
    name: 'length',
    category: 'String',
    description: 'Returns the character length of a string.',
    parameterCount: 1,
    parameters: [{ name: 'value', type: 'string', required: true }],
    returnType: 'number',
    example: 'length(source("code"))',
  },
  {
    name: 'split',
    category: 'String',
    description: 'Splits a string into an array using a separator string.',
    parameterCount: 2,
    parameters: [
      { name: 'value', type: 'string', required: true },
      { name: 'separator', type: 'string', required: true },
    ],
    returnType: 'array',
    example: 'split(source("tags"), ",")',
  },

  // ----- Date -----
  {
    name: 'formatDate',
    category: 'Date',
    description: 'Parses a date string with an input format and returns it reformatted. Use "ISO8601" for ISO 8601 input/output.',
    parameterCount: 3,
    parameters: [
      { name: 'value', type: 'string', required: true },
      { name: 'inputFormat', type: 'string', required: true },
      { name: 'outputFormat', type: 'string', required: true },
    ],
    returnType: 'string',
    example: 'formatDate(source("orderDate"), "ISO8601", "YYYY-MM-DD")',
  },
  {
    name: 'dateDiffSeconds',
    category: 'Date',
    description: 'Returns the difference in seconds between two date-time values (end - start) parsed with the same input format.',
    parameterCount: 3,
    parameters: [
      { name: 'start', type: 'string', required: true },
      { name: 'end', type: 'string', required: true },
      { name: 'inputFormat', type: 'string', required: true },
    ],
    returnType: 'number',
    example: 'dateDiffSeconds(source("lastRun.startedAt"), source("lastRun.endedAt"), "ISO8601")',
  },

  // ----- Math -----
  {
    name: 'add',
    category: 'Math',
    description: 'Returns the sum of two numbers.',
    parameterCount: 2,
    parameters: [
      { name: 'a', type: 'number', required: true },
      { name: 'b', type: 'number', required: true },
    ],
    returnType: 'number',
    example: 'add(source("qty"), 1)',
  },
  {
    name: 'subtract',
    category: 'Math',
    description: 'Returns the difference of two numbers (a - b).',
    parameterCount: 2,
    parameters: [
      { name: 'a', type: 'number', required: true },
      { name: 'b', type: 'number', required: true },
    ],
    returnType: 'number',
    example: 'subtract(source("total"), source("discount"))',
  },
  {
    name: 'multiply',
    category: 'Math',
    description: 'Returns the product of two numbers.',
    parameterCount: 2,
    parameters: [
      { name: 'a', type: 'number', required: true },
      { name: 'b', type: 'number', required: true },
    ],
    returnType: 'number',
    example: 'multiply(source("price"), source("qty"))',
  },
  {
    name: 'divide',
    category: 'Math',
    description: 'Returns the quotient of two numbers. Returns null and emits a diagnostic if b is 0.',
    parameterCount: 2,
    parameters: [
      { name: 'a', type: 'number', required: true },
      { name: 'b', type: 'number', required: true },
    ],
    returnType: 'number',
    example: 'divide(source("total"), source("count"))',
  },
  {
    name: 'round',
    category: 'Math',
    description: 'Rounds a number to an optional number of decimal places (default 0).',
    parameterCount: '1+',
    parameters: [
      { name: 'value', type: 'number', required: true },
      { name: 'decimals', type: 'number', required: false },
    ],
    returnType: 'number',
    example: 'round(source("amount"), 2)',
  },
  {
    name: 'abs',
    category: 'Math',
    description: 'Returns the absolute value of a number.',
    parameterCount: 1,
    parameters: [{ name: 'value', type: 'number', required: true }],
    returnType: 'number',
    example: 'abs(source("delta"))',
  },

  // ----- Conditional -----
  {
    name: 'if',
    category: 'Conditional',
    description: 'Returns the "then" value when condition is true, otherwise returns the "else" value.',
    parameterCount: 3,
    parameters: [
      { name: 'condition', type: 'boolean', required: true },
      { name: 'then', type: 'any', required: true },
      { name: 'else', type: 'any', required: true },
    ],
    returnType: 'any',
    example: 'if(eq(source("status"), "active"), static("Yes"), static("No"))',
  },
  {
    name: 'eq',
    category: 'Conditional',
    description: 'Returns true if two values are equal (null-safe).',
    parameterCount: 2,
    parameters: [
      { name: 'a', type: 'any', required: true },
      { name: 'b', type: 'any', required: true },
    ],
    returnType: 'boolean',
    example: 'eq(source("type"), "premium")',
  },
  {
    name: 'neq',
    category: 'Conditional',
    description: 'Returns true if two values are not equal (null-safe).',
    parameterCount: 2,
    parameters: [
      { name: 'a', type: 'any', required: true },
      { name: 'b', type: 'any', required: true },
    ],
    returnType: 'boolean',
    example: 'neq(source("status"), "cancelled")',
  },
  {
    name: 'gt',
    category: 'Conditional',
    description: 'Returns true if a is greater than b.',
    parameterCount: 2,
    parameters: [
      { name: 'a', type: 'number', required: true },
      { name: 'b', type: 'number', required: true },
    ],
    returnType: 'boolean',
    example: 'gt(source("amount"), 1000)',
  },
  {
    name: 'gte',
    category: 'Conditional',
    description: 'Returns true if a is greater than or equal to b.',
    parameterCount: 2,
    parameters: [
      { name: 'a', type: 'number', required: true },
      { name: 'b', type: 'number', required: true },
    ],
    returnType: 'boolean',
    example: 'gte(source("score"), 90)',
  },
  {
    name: 'lt',
    category: 'Conditional',
    description: 'Returns true if a is less than b.',
    parameterCount: 2,
    parameters: [
      { name: 'a', type: 'number', required: true },
      { name: 'b', type: 'number', required: true },
    ],
    returnType: 'boolean',
    example: 'lt(source("qty"), 10)',
  },
  {
    name: 'lte',
    category: 'Conditional',
    description: 'Returns true if a is less than or equal to b.',
    parameterCount: 2,
    parameters: [
      { name: 'a', type: 'number', required: true },
      { name: 'b', type: 'number', required: true },
    ],
    returnType: 'boolean',
    example: 'lte(source("age"), 18)',
  },
  {
    name: 'and',
    category: 'Conditional',
    description: 'Returns true if both boolean operands are true. Handles null with three-valued logic.',
    parameterCount: 2,
    parameters: [
      { name: 'a', type: 'boolean', required: true },
      { name: 'b', type: 'boolean', required: true },
    ],
    returnType: 'boolean',
    example: 'and(gt(source("qty"), 0), contains(source("status"), "active"))',
  },
  {
    name: 'or',
    category: 'Conditional',
    description: 'Returns true if at least one boolean operand is true. Handles null with three-valued logic.',
    parameterCount: 2,
    parameters: [
      { name: 'a', type: 'boolean', required: true },
      { name: 'b', type: 'boolean', required: true },
    ],
    returnType: 'boolean',
    example: 'or(eq(source("type"), "rush"), eq(source("priority"), "high"))',
  },
  {
    name: 'not',
    category: 'Conditional',
    description: 'Negates a boolean value.',
    parameterCount: 1,
    parameters: [{ name: 'a', type: 'boolean', required: true }],
    returnType: 'boolean',
    example: 'not(isNull(source("code")))',
  },

  // ----- Lookup -----
  {
    name: 'valueMap',
    category: 'Lookup',
    description: 'Maps an input value to an output value using a key-value object or valueTable binding. Optional fallback controls no-match behavior, and optional matchMode selects exact or ignore-case lookup.',
    parameterCount: '2+',
    parameters: [
      { name: 'value', type: 'any', required: true },
      { name: 'mappings', type: 'any', required: true },
      { name: 'fallback', type: 'any', required: false },
      { name: 'matchMode', type: 'string', required: false },
    ],
    returnType: 'any',
    example: 'valueMap(source("status"), { "A": "Active", "I": "Inactive" }, static("Unknown"), "ignore-case")',
  },

  // ----- Array -----
  {
    name: 'map',
    category: 'Array',
    description: 'Transforms each element of an array using a template expression. Use item() to reference the current element.',
    parameterCount: 2,
    parameters: [
      { name: 'array', type: 'array', required: true },
      { name: 'templateOrExpression', type: 'any', required: true },
    ],
    returnType: 'array',
    example: 'map(source("items"), { "id": item("sku"), "qty": item("quantity") })',
  },
  {
    name: 'filter',
    category: 'Array',
    description: 'Returns elements of an array where the condition evaluates to true. Use item() to reference the current element.',
    parameterCount: 2,
    parameters: [
      { name: 'array', type: 'array', required: true },
      { name: 'condition', type: 'any', required: true },
    ],
    returnType: 'array',
    example: 'filter(source("items"), gt(item("qty"), 0))',
  },
  {
    name: 'find',
    category: 'Array',
    description: 'Returns the first element of an array that matches the condition, or null if none match.',
    parameterCount: 2,
    parameters: [
      { name: 'array', type: 'array', required: true },
      { name: 'condition', type: 'any', required: true },
    ],
    returnType: 'any',
    example: 'find(source("items"), eq(item("id"), source("targetId")))',
  },
  {
    name: 'array',
    category: 'Array',
    description: 'Constructs an array from one or more values.',
    parameterCount: '1+',
    parameters: [
      { name: 'value', type: 'any', required: true },
      { name: 'rest', type: 'any', required: false, variadic: true },
    ],
    returnType: 'array',
    example: 'array(source("a"), source("b"), source("c"))',
  },
  {
    name: 'merge',
    category: 'Array',
    description: 'Merges multiple arrays into a single flat array. Null arguments are skipped.',
    parameterCount: '1+',
    parameters: [
      { name: 'array', type: 'any', required: true },
      { name: 'rest', type: 'any', required: false, variadic: true },
    ],
    returnType: 'array',
    example: 'merge(source("primaryItems"), source("secondaryItems"))',
  },
  {
    name: 'flatten',
    category: 'Array',
    description: 'Flattens one level of nesting from an array of arrays.',
    parameterCount: 1,
    parameters: [{ name: 'array', type: 'array', required: true }],
    returnType: 'array',
    example: 'flatten(source("nestedItems"))',
  },
  {
    name: 'first',
    category: 'Array',
    description: 'Returns the first element of an array, or null if empty.',
    parameterCount: 1,
    parameters: [{ name: 'array', type: 'array', required: true }],
    returnType: 'any',
    example: 'first(source("items"))',
  },
  {
    name: 'nth',
    category: 'Array',
    description: 'Returns the element at a given index (0-based). Negative indices count from the end.',
    parameterCount: 2,
    parameters: [
      { name: 'array', type: 'array', required: true },
      { name: 'index', type: 'number', required: true },
    ],
    returnType: 'any',
    example: 'nth(source("items"), 2)',
  },
  {
    name: 'join',
    category: 'Array',
    description: 'Joins string array elements into a single string with a separator. Null elements are skipped.',
    parameterCount: 2,
    parameters: [
      { name: 'array', type: 'array', required: true },
      { name: 'separator', type: 'string', required: true },
    ],
    returnType: 'string',
    example: 'join(source("tags"), ", ")',
  },
  {
    name: 'count',
    category: 'Array',
    description: 'Returns the number of elements in an array, or 0 for null.',
    parameterCount: 1,
    parameters: [{ name: 'array', type: 'array', required: true }],
    returnType: 'number',
    example: 'count(source("items"))',
  },
  {
    name: 'get',
    category: 'Array',
    description: 'Retrieves a value from an object by dot-notation path.',
    parameterCount: 2,
    parameters: [
      { name: 'object', type: 'any', required: true },
      { name: 'path', type: 'string', required: true },
    ],
    returnType: 'any',
    example: 'get(source("address"), "city")',
  },

  // ----- Null Handling -----
  {
    name: 'default',
    category: 'NullHandling',
    description: 'Returns the value if non-null, otherwise returns the fallback.',
    parameterCount: 2,
    parameters: [
      { name: 'value', type: 'any', required: true },
      { name: 'fallback', type: 'any', required: true },
    ],
    returnType: 'any',
    example: 'default(source("middleName"), static(""))',
  },
  {
    name: 'coalesce',
    category: 'NullHandling',
    description: 'Returns the first non-null value from one or more arguments.',
    parameterCount: '1+',
    parameters: [
      { name: 'value', type: 'any', required: true },
      { name: 'rest', type: 'any', required: false, variadic: true },
    ],
    returnType: 'any',
    example: 'coalesce(source("preferredName"), source("firstName"), static("Unknown"))',
  },
  {
    name: 'isNull',
    category: 'NullHandling',
    description: 'Returns true if the value is null.',
    parameterCount: 1,
    parameters: [{ name: 'value', type: 'any', required: true }],
    returnType: 'boolean',
    example: 'isNull(source("optionalField"))',
  },

  // ----- Type Conversion -----
  {
    name: 'cast',
    category: 'TypeConversion',
    description: 'Converts a value to the specified type ("string", "number", or "boolean").',
    parameterCount: 2,
    parameters: [
      { name: 'value', type: 'any', required: true },
      { name: 'targetType', type: 'string', required: true },
    ],
    returnType: 'any',
    example: 'cast(source("amount"), "string")',
  },

  // ----- Source Access -----
  {
    name: 'source',
    category: 'SourceAccess',
    description: 'Reads a value from the source data at the given dot-notation path.',
    parameterCount: 1,
    parameters: [{ name: 'path', type: 'string', required: true }],
    returnType: 'any',
    example: 'source("order.customerName")',
  },
  {
    name: 'item',
    category: 'SourceAccess',
    description: 'Reads a field from the current array element (inside map/filter/find).',
    parameterCount: 1,
    parameters: [{ name: 'path', type: 'string', required: true }],
    returnType: 'any',
    example: 'item("sku")',
  },
  {
    name: 'parent',
    category: 'SourceAccess',
    description: 'Reads a field from the parent scope (inside nested map/filter/find).',
    parameterCount: 1,
    parameters: [{ name: 'path', type: 'string', required: true }],
    returnType: 'any',
    example: 'parent("orderId")',
  },
  {
    name: 'constant',
    category: 'SourceAccess',
    description: 'Retrieves a named constant from the mapping configuration.',
    parameterCount: 1,
    parameters: [{ name: 'name', type: 'string', required: true }],
    returnType: 'any',
    example: 'constant("TAX_RATE")',
  },
  {
    name: 'external',
    category: 'SourceAccess',
    description: 'Retrieves a named external data source from the mapping configuration.',
    parameterCount: 1,
    parameters: [{ name: 'name', type: 'string', required: true }],
    returnType: 'any',
    example: 'external("lookupTable")',
  },
  {
    name: 'static',
    category: 'SourceAccess',
    description: 'Returns a literal value unchanged (string, number, boolean, or null).',
    parameterCount: 1,
    parameters: [{ name: 'value', type: 'any', required: true }],
    returnType: 'any',
    example: 'static("N/A")',
  },
] as const;
