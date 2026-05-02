/**
 * expression-generator.ts
 *
 * Pure DSL expression generation from guided-builder state.
 *
 * Single source of truth for converting BuilderState → DSL string.
 * Consumed by GuidedBuilder (T-06) and the mode toggle (T-08).
 *
 * Argument kinds:
 *  - source          → `source("path")`
 *  - item            → `item("path")`          (array context — current element)
 *  - parent          → `parent("path")`         (array context — parent scope)
 *  - literal         → `"string"` / `42` / `true` / `null`
 *  - nested-function → recursive generateExpression call
 *  - object-template → `{ "key": value, ... }`  (map() second argument)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single key-value entry inside an object template. */
export interface ObjectTemplateField {
  readonly key: string;
  readonly value: BuilderArgument;
}

/** A single argument value inside a function call. */
export type BuilderArgument =
  | { readonly kind: 'source'; readonly value: string }
  | { readonly kind: 'item'; readonly value: string }
  | { readonly kind: 'parent'; readonly value: string }
  | { readonly kind: 'literal'; readonly value: string | number | boolean | null }
  | { readonly kind: 'nested-function'; readonly value: BuilderState }
  | { readonly kind: 'object-template'; readonly fields: readonly ObjectTemplateField[] };

/** Represents a complete function-call expression node. */
export interface BuilderState {
  readonly functionName: string;
  readonly arguments: readonly BuilderArgument[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function quoteString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function generateArg(arg: BuilderArgument): string {
  switch (arg.kind) {
    case 'source':
      return `source(${quoteString(arg.value)})`;

    case 'item':
      return `item(${quoteString(arg.value)})`;

    case 'parent':
      return `parent(${quoteString(arg.value)})`;

    case 'literal': {
      const v = arg.value;
      if (v === null) return 'null';
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (typeof v === 'number') return String(v);
      return quoteString(v);
    }

    case 'nested-function':
      return generateExpression(arg.value);

    case 'object-template':
      return generateObjectTemplate(arg.fields);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render an object template expression string.
 *
 * @example
 * generateObjectTemplate([
 *   { key: 'name', value: { kind: 'item', value: 'fullName' } },
 *   { key: 'active', value: { kind: 'literal', value: true } },
 * ])
 * // → '{ "name": item("fullName"), "active": true }'
 */
export function generateObjectTemplate(fields: readonly ObjectTemplateField[]): string {
  if (fields.length === 0) return '{}';
  const entries = fields
    .map((f) => `${quoteString(f.key)}: ${generateArg(f.value)}`)
    .join(', ');
  return `{ ${entries} }`;
}

/**
 * Convert a BuilderState tree into a valid DSL expression string.
 *
 * @example
 * generateExpression({ functionName: 'source', arguments: [{ kind: 'literal', value: 'order.name' }] })
 * // → 'source("order.name")'
 *
 * @example
 * generateExpression({
 *   functionName: 'concat',
 *   arguments: [
 *     { kind: 'source', value: 'firstName' },
 *     { kind: 'source', value: 'lastName' },
 *     { kind: 'literal', value: ' ' },
 *   ],
 * })
 * // → 'concat(source("firstName"), source("lastName"), " ")'
 */
export function generateExpression(state: BuilderState): string {
  const args = state.arguments.map(generateArg).join(', ');
  return `${state.functionName}(${args})`;
}

// ---------------------------------------------------------------------------
// Convenience factories
// ---------------------------------------------------------------------------

/** Convenience: build a source("path") argument. */
export function makeSourceArg(path: string): BuilderArgument {
  return { kind: 'source', value: path };
}

/** Convenience: build an item("path") argument (array context). */
export function makeItemArg(path: string): BuilderArgument {
  return { kind: 'item', value: path };
}

/** Convenience: build a parent("path") argument (array context). */
export function makeParentArg(path: string): BuilderArgument {
  return { kind: 'parent', value: path };
}

/** Convenience: build a literal argument. */
export function makeLiteralArg(
  value: string | number | boolean | null,
): BuilderArgument {
  return { kind: 'literal', value };
}

/** Convenience: build a nested-function argument. */
export function makeNestedArg(state: BuilderState): BuilderArgument {
  return { kind: 'nested-function', value: state };
}

/** Convenience: build an object-template argument. */
export function makeObjectTemplateArg(
  fields: readonly ObjectTemplateField[],
): BuilderArgument {
  return { kind: 'object-template', fields };
}
