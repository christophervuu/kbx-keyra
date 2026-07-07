import { createHash } from 'node:crypto';

import type { MappingConfig } from './types.js';

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort((a, b) => a.localeCompare(b));
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = sortObject(record[key]);
    }
    return result;
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

export function computeStableJsonSha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function digestToHex(digest: ArrayBuffer): string {
  return toHex(new Uint8Array(digest));
}

/**
 * Computes deterministic SHA-256 hash for mapping config content.
 * Uses stable JSON stringification so key-order differences do not change the hash.
 */
export async function computeConfigHash(config: MappingConfig): Promise<string> {
  const json = stableStringify(config);

  if (globalThis.crypto?.subtle) {
    const encoder = new TextEncoder();
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(json));
    return digestToHex(digest);
  }

  return computeStableJsonSha256(config);
}
