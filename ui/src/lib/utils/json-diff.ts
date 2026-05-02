import type { DiffEntry, DiffResult } from '@/lib/types/diff';

type ValueKind = 'primitive' | 'object' | 'array';

function getValueKind(value: unknown): ValueKind {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value !== null && typeof value === 'object') {
    return 'object';
  }
  return 'primitive';
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function compareValues(actual: unknown, expected: unknown, path: string, entries: DiffEntry[]): void {
  const actualKind = getValueKind(actual);
  const expectedKind = getValueKind(expected);

  if (actualKind !== expectedKind) {
    entries.push({
      path,
      type: 'changed',
      actual,
      expected,
    });
    return;
  }

  if (actualKind === 'primitive' && actual !== expected) {
    entries.push({
      path,
      type: 'changed',
      actual,
      expected,
    });
    return;
  }

  if (actualKind === 'array' && Array.isArray(actual) && Array.isArray(expected)) {
    const maxLength = Math.max(actual.length, expected.length);

    for (let index = 0; index < maxLength; index += 1) {
      const itemPath = `${path}[${index}]`;
      const actualHasIndex = index < actual.length;
      const expectedHasIndex = index < expected.length;

      if (actualHasIndex && !expectedHasIndex) {
        entries.push({
          path: itemPath,
          type: 'added',
          actual: actual[index],
        });
        continue;
      }

      if (!actualHasIndex && expectedHasIndex) {
        entries.push({
          path: itemPath,
          type: 'removed',
          expected: expected[index],
        });
        continue;
      }

      compareValues(actual[index], expected[index], itemPath, entries);
    }
  }

  if (actualKind === 'object' && actual !== null && expected !== null) {
    const actualRecord = actual as Record<string, unknown>;
    const expectedRecord = expected as Record<string, unknown>;

    const keys = [...new Set([...Object.keys(actualRecord), ...Object.keys(expectedRecord)])].sort();

    for (const key of keys) {
      const childPath = `${path}.${key}`;
      const actualHasKey = hasOwn(actualRecord, key);
      const expectedHasKey = hasOwn(expectedRecord, key);

      if (actualHasKey && !expectedHasKey) {
        entries.push({
          path: childPath,
          type: 'added',
          actual: actualRecord[key],
        });
        continue;
      }

      if (!actualHasKey && expectedHasKey) {
        entries.push({
          path: childPath,
          type: 'removed',
          expected: expectedRecord[key],
        });
        continue;
      }

      compareValues(actualRecord[key], expectedRecord[key], childPath, entries);
    }
  }
}

export function computeDiff(actual: unknown, expected: unknown): DiffResult {
  const entries: DiffEntry[] = [];

  compareValues(actual, expected, 'root', entries);

  return {
    entries,
    isEqual: entries.length === 0,
  };
}
