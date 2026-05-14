/**
 * source-field-display.ts — FS-052 T-01
 *
 * Shared utilities for rendering source-field option rows consistently
 * across all source-field pickers in the Mapping Editor.
 *
 * Provides:
 * - `SOURCE_TYPE_BADGES` — per-type badge code + Tailwind color class
 * - `getTypeBadge(type)` — safe accessor with fallback to 'any'
 * - `resolveFieldTestValue(sourceData, fieldPath)` — dot-path resolver
 *   that returns a display-ready truncated string from loaded test data
 */

// ---------------------------------------------------------------------------
// Type badge map
// ---------------------------------------------------------------------------

export interface TypeBadge {
  /** Short display code shown in the badge (e.g. 'str', 'num') */
  readonly code: string;
  /** Tailwind color classes for the badge element */
  readonly className: string;
}

/**
 * Per-type badge definitions.
 *
 * Colors match the existing TYPE_COLORS / TYPE_BADGE_CLASSES convention
 * already established in SourceSchemaPanel, TargetFieldRow, and
 * ScalarFieldBuilder — keeping the visual language consistent.
 */
export const SOURCE_TYPE_BADGES: Record<string, TypeBadge> = {
  string:  { code: 'str',  className: 'bg-blue-900/60 text-blue-300' },
  number:  { code: 'num',  className: 'bg-green-900/60 text-green-300' },
  integer: { code: 'int',  className: 'bg-green-900/60 text-green-300' },
  boolean: { code: 'bool', className: 'bg-purple-900/60 text-purple-300' },
  object:  { code: 'obj',  className: 'bg-slate-700/80 text-slate-300' },
  array:   { code: 'arr',  className: 'bg-amber-900/60 text-amber-300' },
  null:    { code: 'null', className: 'bg-slate-800/60 text-slate-500' },
  enum:    { code: 'enum', className: 'bg-blue-900/60 text-blue-300' },
  any:     { code: 'any',  className: 'bg-slate-700/80 text-slate-300' },
  union:   { code: '|',    className: 'bg-slate-700/80 text-slate-300' },
};

const FALLBACK_BADGE: TypeBadge = { code: 'any', className: 'bg-slate-700/80 text-slate-300' };

/**
 * Returns the TypeBadge for the given schema type string.
 * Falls back to the 'any' badge for unknown types.
 */
export function getTypeBadge(type: string): TypeBadge {
  return SOURCE_TYPE_BADGES[type] ?? FALLBACK_BADGE;
}

/**
 * Returns just the badge code string for the given type.
 * Convenience wrapper over getTypeBadge.
 */
export function getTypeBadgeCode(type: string): string {
  return getTypeBadge(type).code;
}

// ---------------------------------------------------------------------------
// Test value resolution
// ---------------------------------------------------------------------------

const MAX_DISPLAY_LENGTH = 30;

/**
 * Resolves a dot-path field path into the given sourceData object and
 * returns a display-ready string for use in source-field option rows.
 *
 * Behaviour:
 * - Returns `undefined` when sourceData is null/undefined or the path
 *   cannot be resolved (missing key, null intermediate, etc.)
 * - Strings: quoted and truncated to MAX_DISPLAY_LENGTH chars (including
 *   the surrounding quotes). Appends `...` when truncated.
 * - Numbers, booleans, null: returned as String(value)
 * - Objects and arrays: serialized as single-line JSON, then truncated
 *   to MAX_DISPLAY_LENGTH chars with `...` appended when truncated.
 *
 * Path syntax:
 * - Dot-separated segments: `"address.city"`
 * - Array bracket notation is normalised: `"orders[0].name"` →
 *   segments `["orders", "0", "name"]`
 */
export function resolveFieldTestValue(
  sourceData: unknown,
  fieldPath: string,
): string | undefined {
  if (sourceData === null || sourceData === undefined) return undefined;

  // Normalise bracket notation: "a[0].b" → "a.0.b"
  const normalised = fieldPath.replace(/\[(\d+)\]/g, '.$1');
  const segments = normalised.split('.').filter((s) => s.length > 0);

  let current: unknown = sourceData;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return formatTestValue(current);
}

function formatTestValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return 'null';

  if (typeof value === 'string') {
    const quoted = `"${value}"`;
    return truncate(quoted);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  // Object or array — serialize as single-line JSON then truncate
  try {
    const json = JSON.stringify(value);
    return truncate(json);
  } catch {
    return undefined;
  }
}

function truncate(str: string): string {
  if (str.length <= MAX_DISPLAY_LENGTH) return str;
  return str.slice(0, MAX_DISPLAY_LENGTH) + '...';
}
