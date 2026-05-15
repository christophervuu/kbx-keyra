/**
 * Inline ingestion threshold (field count).
 *
 * Schemas with fewer fields than this threshold process synchronously
 * in a single Lambda invocation.
 */
export const INLINE_FIELD_THRESHOLD = 500;

/**
 * DynamoDB BatchWriteItem maximum item count per request.
 *
 * This mirrors AWS service limits and should not be increased.
 */
export const DYNAMO_BATCH_SIZE = 25;

/**
 * OpenSearch bulk indexing document batch size.
 *
 * Chosen to balance throughput and request payload size.
 */
export const OPENSEARCH_BULK_SIZE = 500;

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

/**
 * Returns the effective inline ingestion threshold.
 *
 * Reads `SCHEMA_INLINE_FIELD_THRESHOLD` from environment and falls back to
 * `INLINE_FIELD_THRESHOLD` when unset or invalid.
 */
export function getInlineFieldThreshold(): number {
  const value = getEnvValue('SCHEMA_INLINE_FIELD_THRESHOLD');

  if (!value) {
    return INLINE_FIELD_THRESHOLD;
  }

  const normalized = value.trim();

  if (!/^-?\d+$/.test(normalized)) {
    return INLINE_FIELD_THRESHOLD;
  }

  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return INLINE_FIELD_THRESHOLD;
  }

  return parsed;
}
