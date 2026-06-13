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
 * Schema ingestion orchestration batch size (nodes per Step Functions worker batch).
 */
export const INGESTION_BATCH_SIZE = 500;

/**
 * Runtime retrieval cap defaults by environment stage (FS-091 Rev 2).
 */
export interface RetrievalCaps {
  readonly lexicalCap: number;
  readonly rerankCap: number;
  readonly topK: number;
  readonly contextExpansionCap: number;
}

const RETRIEVAL_CAPS_BY_STAGE: Record<string, RetrievalCaps> = {
  DEV: {
    lexicalCap: 120,
    rerankCap: 80,
    topK: 12,
    contextExpansionCap: 24,
  },
  QA: {
    lexicalCap: 150,
    rerankCap: 100,
    topK: 15,
    contextExpansionCap: 30,
  },
  PROD: {
    lexicalCap: 180,
    rerankCap: 120,
    topK: 18,
    contextExpansionCap: 36,
  },
};

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

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function resolveStage(): string {
  const raw = getEnvValue('STAGE')?.trim();
  if (!raw) {
    return 'DEV';
  }

  return raw.toUpperCase();
}

/**
 * Returns effective retrieval caps for current runtime environment.
 *
 * Defaults come from STAGE-based presets; optional env overrides:
 * - RAG_LEXICAL_CAP
 * - RAG_RERANK_CAP
 * - RAG_TOPK
 * - RAG_CONTEXT_EXPANSION_CAP
 */
export function getRetrievalCaps(): RetrievalCaps {
  const stage = resolveStage();
  const base = RETRIEVAL_CAPS_BY_STAGE[stage] ?? RETRIEVAL_CAPS_BY_STAGE.DEV;
  const effectiveBase: RetrievalCaps = base ?? {
    lexicalCap: 120,
    rerankCap: 80,
    topK: 12,
    contextExpansionCap: 24,
  };

  const lexicalCap = parsePositiveInt(getEnvValue('RAG_LEXICAL_CAP')) ?? effectiveBase.lexicalCap;
  const rerankCapRaw = parsePositiveInt(getEnvValue('RAG_RERANK_CAP')) ?? effectiveBase.rerankCap;
  const topKRaw = parsePositiveInt(getEnvValue('RAG_TOPK')) ?? effectiveBase.topK;
  const contextExpansionCap =
    parsePositiveInt(getEnvValue('RAG_CONTEXT_EXPANSION_CAP')) ?? effectiveBase.contextExpansionCap;

  const rerankCap = Math.min(rerankCapRaw, lexicalCap);
  const topK = Math.min(topKRaw, rerankCap);

  return {
    lexicalCap,
    rerankCap,
    topK,
    contextExpansionCap,
  };
}
