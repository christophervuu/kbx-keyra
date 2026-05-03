/**
 * array-expression-generator.ts
 *
 * Converts ArrayBuilder state into a valid KeyRa DSL expression.
 *
 * Supported patterns:
 *   - '1:1 map'          → map(source("path"), { "field": item("field"), ... })
 *   - 'filter-then-map'  → map(filter(source("path"), item("field")), { ... })
 *   - 'merge-arrays'     → concat(source("arr1"), source("arr2"))
 *   - 'build-from-scalars' → array(source("f1"), source("f2"), ...)
 *   - 'advanced'         → raw DSL passthrough
 */

export type ArrayPattern =
  | '1:1 map'
  | 'filter-then-map'
  | 'merge-arrays'
  | 'build-from-scalars'
  | 'advanced';

export interface FieldMapping {
  /** Target item field name (e.g. "sku") */
  targetField: string;
  /** Source item field name (e.g. "productCode") */
  sourceField: string;
}

export interface ArrayBuilderState {
  /** Source array path (e.g. "order.items") */
  sourceArrayPath: string;
  /** Selected mapping pattern */
  pattern: ArrayPattern;
  /** Field-to-field mappings for Step 3 */
  fieldMappings: FieldMapping[];
  /** Raw DSL expression (used when pattern === 'advanced') */
  rawExpression: string;
  /** Additional source arrays for merge-arrays pattern */
  additionalSourcePaths: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildObjectTemplate(fieldMappings: FieldMapping[]): string {
  if (fieldMappings.length === 0) return '{}';
  const pairs = fieldMappings
    .map((m) => `"${escapeString(m.targetField)}": item("${escapeString(m.sourceField)}")`)
    .join(', ');
  return `{${pairs}}`;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Generates a DSL expression from the array builder state.
 * Returns an empty string if the state is incomplete.
 */
export function generateArrayExpression(state: ArrayBuilderState): string {
  const { sourceArrayPath, pattern, fieldMappings, rawExpression, additionalSourcePaths } = state;

  if (!sourceArrayPath && pattern !== 'advanced') return '';

  switch (pattern) {
    case '1:1 map': {
      const template = buildObjectTemplate(fieldMappings);
      return `map(source("${escapeString(sourceArrayPath)}"), ${template})`;
    }

    case 'filter-then-map': {
      // Generates: map(filter(source("path"), item("")), { ... })
      // The filter condition is a placeholder — user can refine in raw DSL
      const template = buildObjectTemplate(fieldMappings);
      return `map(filter(source("${escapeString(sourceArrayPath)}"), item("")), ${template})`;
    }

    case 'merge-arrays': {
      const allPaths = [sourceArrayPath, ...additionalSourcePaths].filter(Boolean);
      if (allPaths.length === 0) return '';
      if (allPaths.length === 1) return `source("${escapeString(allPaths[0])}")`;
      const args = allPaths.map((p) => `source("${escapeString(p)}")`).join(', ');
      return `concat(${args})`;
    }

    case 'build-from-scalars': {
      // Build array from individual scalar source fields
      const args = fieldMappings.map((m) => `source("${escapeString(m.sourceField)}")`).join(', ');
      return args ? `array(${args})` : '';
    }

    case 'advanced':
      return rawExpression;

    default:
      return '';
  }
}
