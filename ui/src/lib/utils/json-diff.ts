import type { DiffChangeType, DiffEntry, DiffResult, DiffSummary } from '@/lib/types/diff';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ValueKind = 'null' | 'primitive' | 'object' | 'array';

function getValueKind(value: unknown): ValueKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'primitive';
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Classify a mismatch where both sides exist at the same path but differ.
 *
 * Priority order:
 *   1. null_mismatch   — one side is null, the other is not
 *   2. structural_mismatch — one side is object/array, other is primitive/null
 *                            (or array vs object)
 *   3. type_mismatch   — same path, different JS typeof (e.g. string vs number)
 *   4. value_mismatch  — same type, different value
 */
function classifyMismatch(
  actual: unknown,
  expected: unknown,
): { type: DiffChangeType; actualType?: string; expectedType?: string } {
  const actualKind = getValueKind(actual);
  const expectedKind = getValueKind(expected);

  // 1. null_mismatch
  if (actualKind === 'null' || expectedKind === 'null') {
    return {
      type: 'null_mismatch',
      actualType: actualKind === 'null' ? 'null' : typeof actual,
      expectedType: expectedKind === 'null' ? 'null' : typeof expected,
    };
  }

  // 2. structural_mismatch — object/array vs primitive, or array vs object
  const actualIsComplex = actualKind === 'object' || actualKind === 'array';
  const expectedIsComplex = expectedKind === 'object' || expectedKind === 'array';

  if (actualIsComplex !== expectedIsComplex || actualKind !== expectedKind) {
    return {
      type: 'structural_mismatch',
      actualType: actualKind,
      expectedType: expectedKind,
    };
  }

  // 3. type_mismatch — both are primitives but different JS types
  if (typeof actual !== typeof expected) {
    return {
      type: 'type_mismatch',
      actualType: typeof actual,
      expectedType: typeof expected,
    };
  }

  // 4. value_mismatch — same type, different value
  return { type: 'value_mismatch' };
}

function compareValues(actual: unknown, expected: unknown, path: string, entries: DiffEntry[]): void {
  const actualKind = getValueKind(actual);
  const expectedKind = getValueKind(expected);

  // Both are arrays — recurse by index
  if (actualKind === 'array' && expectedKind === 'array') {
    const actualArr = actual as unknown[];
    const expectedArr = expected as unknown[];
    const maxLength = Math.max(actualArr.length, expectedArr.length);

    for (let index = 0; index < maxLength; index += 1) {
      const itemPath = `${path}[${index}]`;
      const actualHasIndex = index < actualArr.length;
      const expectedHasIndex = index < expectedArr.length;

      if (actualHasIndex && !expectedHasIndex) {
        entries.push({ path: itemPath, type: 'extra_field', actual: actualArr[index] });
        continue;
      }

      if (!actualHasIndex && expectedHasIndex) {
        entries.push({ path: itemPath, type: 'missing_field', expected: expectedArr[index] });
        continue;
      }

      compareValues(actualArr[index], expectedArr[index], itemPath, entries);
    }
    return;
  }

  // Both are plain objects — recurse by key
  if (actualKind === 'object' && expectedKind === 'object' && actual !== null && expected !== null) {
    const actualRecord = actual as Record<string, unknown>;
    const expectedRecord = expected as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(actualRecord), ...Object.keys(expectedRecord)])].sort();

    for (const key of keys) {
      const childPath = `${path}.${key}`;
      const actualHasKey = hasOwn(actualRecord, key);
      const expectedHasKey = hasOwn(expectedRecord, key);

      if (actualHasKey && !expectedHasKey) {
        entries.push({ path: childPath, type: 'extra_field', actual: actualRecord[key] });
        continue;
      }

      if (!actualHasKey && expectedHasKey) {
        entries.push({ path: childPath, type: 'missing_field', expected: expectedRecord[key] });
        continue;
      }

      compareValues(actualRecord[key], expectedRecord[key], childPath, entries);
    }
    return;
  }

  // Leaf comparison — values differ (or kinds differ)
  if (actual !== expected) {
    const classification = classifyMismatch(actual, expected);
    entries.push({
      path,
      actual,
      expected,
      ...classification,
    });
  }
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

const ALL_CATEGORIES: DiffChangeType[] = [
  'missing_field',
  'extra_field',
  'value_mismatch',
  'type_mismatch',
  'null_mismatch',
  'structural_mismatch',
];

function buildSummary(entries: readonly DiffEntry[]): DiffSummary {
  const byCategory = Object.fromEntries(
    ALL_CATEGORIES.map((cat) => [cat, 0]),
  ) as Record<DiffChangeType, number>;

  for (const entry of entries) {
    byCategory[entry.type] += 1;
  }

  return { total: entries.length, byCategory };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a structural diff between `actual` and `expected` JSON values.
 *
 * Returns a `DiffResult` with:
 * - `entries` — one entry per field-level mismatch, categorized by type
 * - `isEqual` — true when there are no entries
 * - `summary` — per-category counts for quick display
 *
 * FS-035 T-01: replaces coarse `added | removed | changed` with six specific
 * mismatch categories (missing_field, extra_field, value_mismatch,
 * type_mismatch, null_mismatch, structural_mismatch).
 */
export function computeDiff(actual: unknown, expected: unknown): DiffResult {
  const entries: DiffEntry[] = [];
  compareValues(actual, expected, 'root', entries);
  return {
    entries,
    isEqual: entries.length === 0,
    summary: buildSummary(entries),
  };
}
