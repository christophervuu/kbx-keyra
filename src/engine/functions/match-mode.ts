import type { ValueMapMatchMode } from '../types/index.js';

export const DEFAULT_VALUE_MAP_MATCH_MODE: ValueMapMatchMode = 'exact';

export function normalizeLookupKey(value: unknown, matchMode: ValueMapMatchMode): string {
  const key = String(value);

  if (matchMode === 'ignore-case' && typeof value === 'string') {
    return key.toLowerCase();
  }

  return key;
}

export function resolveValueMapMatchMode(value: unknown): ValueMapMatchMode | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (value === 'exact' || value === 'ignore-case') {
    return value;
  }

  return null;
}
