import {
  BatchWriteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  type BatchWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES } from './config.js';
import type { SchemaNodeIdentity, SchemaNodeItem } from './types.js';

const DYNAMO_BATCH_SIZE = 25;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 100;
const DEFAULT_QUERY_LIMIT = 50;
const IDENTITY_SCHEMA_PREFIX = 'IDENTITY#';

function identitySchemaId(schemaVersionId: string): string {
  return `${IDENTITY_SCHEMA_PREFIX}${schemaVersionId}`;
}

function jsonPointerDepth(pointer: string): number {
  if (pointer === '') {
    return 0;
  }

  return pointer.split('/').length - 1;
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getEmbeddingDimension(): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const raw = env?.SCHEMA_NODE_EMBEDDING_DIMENSION;
  if (!raw) {
    return 12;
  }

  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 128) {
    return 12;
  }

  return parsed;
}

function computeEmbedding(text: string, dimension: number): readonly number[] {
  const vector = new Array<number>(dimension).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const hash = hashString(token);
    const sign = hash % 2 === 0 ? 1 : -1;
    const index = hash % dimension;
    vector[index] = (vector[index] ?? 0) + (sign * (1 + Math.min(token.length, 24) / 24));
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
  if (norm === 0) {
    return vector;
  }

  return vector.map((value) => value / norm);
}

function buildFallbackEmbeddingText(item: Pick<SchemaNodeItem, 'path' | 'fieldName' | 'type'>): string {
  return `${item.path} | ${item.fieldName} (${item.type})`;
}

function normalizeNodeItem(raw: SchemaNodeItem): SchemaNodeItem {
  const embeddingDimension = getEmbeddingDimension();
  const embeddingText = typeof raw.embeddingText === 'string' && raw.embeddingText.trim() !== ''
    ? raw.embeddingText
    : buildFallbackEmbeddingText(raw);

  const normalizedEmbedding = Array.isArray(raw.embedding)
    ? raw.embedding.filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    )
    : [];

  const embedding = normalizedEmbedding.length > 0
    ? normalizedEmbedding
    : computeEmbedding(embeddingText, embeddingDimension);

  return {
    ...raw,
    embeddingText,
    embedding,
  };
}

function logMissingRetrievalFields(stage: string, schemaId: string, items: readonly SchemaNodeItem[]): void {
  let missingEmbeddingText = 0;
  let missingEmbeddingVector = 0;

  for (const item of items) {
    if (!item.embeddingText || item.embeddingText.trim() === '') {
      missingEmbeddingText += 1;
    }

    if (!Array.isArray(item.embedding) || item.embedding.length === 0) {
      missingEmbeddingVector += 1;
    }
  }

  if (missingEmbeddingText > 0 || missingEmbeddingVector > 0) {
    console.warn('[schema-nodes] missing retrieval fields detected', {
      stage,
      schemaId,
      totalItems: items.length,
      missingEmbeddingText,
      missingEmbeddingVector,
    });
  }
}

type BatchWriteRequest = NonNullable<BatchWriteCommandInput['RequestItems']>[string][number];

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function batchWriteWithRetry(requests: BatchWriteRequest[]): Promise<void> {
  let pending = requests;
  let retries = 0;

  while (pending.length > 0) {
    const response = await dynamoClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAMES.schemaNodes]: pending,
        },
      }),
    );

    pending = response.UnprocessedItems?.[TABLE_NAMES.schemaNodes] ?? [];
    if (pending.length === 0) {
      return;
    }

    if (retries >= MAX_RETRIES) {
      throw new Error(
        `Batch write retry exhaustion for table '${TABLE_NAMES.schemaNodes}': ${pending.length} unprocessed item(s) remaining after ${MAX_RETRIES} retries.`,
      );
    }

    const delayMs = BASE_BACKOFF_MS * (2 ** retries);
    retries += 1;
    await sleep(delayMs);
  }
}

export async function batchWrite(schemaId: string, nodes: SchemaNodeItem[]): Promise<void> {
  if (nodes.length === 0) {
    return;
  }

  const normalizedNodes = nodes.map((node) => ({
    ...node,
    schemaId,
  }));

  const chunks = chunk(normalizedNodes, DYNAMO_BATCH_SIZE);
  for (const nodeChunk of chunks) {
    const requests: BatchWriteRequest[] = nodeChunk.map((node) => ({
      PutRequest: {
        Item: node,
      },
    }));
    await batchWriteWithRetry(requests);
  }
}

export async function listBySchema(schemaId: string): Promise<SchemaNodeItem[]> {
  const results: SchemaNodeItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const response = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.schemaNodes,
        KeyConditionExpression: 'schemaId = :sid',
        ExpressionAttributeValues: {
          ':sid': schemaId,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    if (response.Items) {
      const rawBatch = response.Items as SchemaNodeItem[];
      logMissingRetrievalFields('listBySchema', schemaId, rawBatch);
      results.push(...rawBatch.map(normalizeNodeItem));
    }

    lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return results;
}

export async function queryContains(schemaId: string, query: string, limit = DEFAULT_QUERY_LIMIT): Promise<SchemaNodeItem[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const effectiveLimit = Math.max(1, limit);
  const results: SchemaNodeItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const response = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.schemaNodes,
        KeyConditionExpression: 'schemaId = :sid',
        FilterExpression: 'contains(#path, :q) OR contains(#fieldName, :q)',
        ExpressionAttributeNames: {
          '#path': 'path',
          '#fieldName': 'fieldName',
        },
        ExpressionAttributeValues: {
          ':sid': schemaId,
          ':q': normalizedQuery,
        },
        Limit: effectiveLimit,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    if (response.Items?.length) {
      const remaining = effectiveLimit - results.length;
      const rawBatch = (response.Items as SchemaNodeItem[]).slice(0, remaining);
      logMissingRetrievalFields('queryContains', schemaId, rawBatch);
      const batch = rawBatch.map(normalizeNodeItem);
      results.push(...batch);
    }

    lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey && results.length < effectiveLimit);

  return results;
}

export async function backfillRetrievalFields(schemaId: string): Promise<{ scanned: number; written: number }> {
  const nodes = await listBySchema(schemaId);
  if (nodes.length === 0) {
    return {
      scanned: 0,
      written: 0,
    };
  }

  await batchWrite(schemaId, nodes);

  console.info('[schema-nodes] retrieval fields backfill completed', {
    schemaId,
    scanned: nodes.length,
    written: nodes.length,
  });

  return {
    scanned: nodes.length,
    written: nodes.length,
  };
}

export async function deleteBySchema(schemaId: string): Promise<void> {
  const keys: Array<{ schemaId: string; path: string }> = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const response = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.schemaNodes,
        KeyConditionExpression: 'schemaId = :sid',
        ExpressionAttributeValues: {
          ':sid': schemaId,
        },
        ProjectionExpression: '#schemaId, #path',
        ExpressionAttributeNames: {
          '#schemaId': 'schemaId',
          '#path': 'path',
        },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    for (const item of response.Items ?? []) {
      const record = item as { schemaId?: unknown; path?: unknown };
      if (typeof record.schemaId === 'string' && typeof record.path === 'string') {
        keys.push({ schemaId: record.schemaId, path: record.path });
      }
    }

    lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  if (keys.length === 0) {
    return;
  }

  const keyChunks = chunk(keys, DYNAMO_BATCH_SIZE);
  for (const keyChunk of keyChunks) {
    const requests: BatchWriteRequest[] = keyChunk.map((key) => ({
      DeleteRequest: {
        Key: key,
      },
    }));
    await batchWriteWithRetry(requests);
  }
}

function toIdentitySidecarItem(identity: SchemaNodeIdentity): Record<string, unknown> {
  return {
    schemaId: identitySchemaId(identity.schemaVersionId),
    path: identity.jsonPointer,
    fieldName: '__identity__',
    type: 'identity',
    description: identity.fieldId,
    depth: jsonPointerDepth(identity.jsonPointer),
    isArray: false,
    isRequired: false,
    parentPath: identity.parentFieldId ?? null,
    childCount: 0,
    subtreeFieldCount: 1,
    embeddingText: `identity ${identity.fieldId} ${identity.jsonPointer}`,
    schemaVersionId: identity.schemaVersionId,
    fieldId: identity.fieldId,
    jsonPointer: identity.jsonPointer,
    ...(identity.parentFieldId ? { parentFieldId: identity.parentFieldId } : {}),
  };
}

function toSchemaNodeIdentity(item: Record<string, unknown>): SchemaNodeIdentity | null {
  const schemaVersionId = item.schemaVersionId;
  const fieldId = item.fieldId;
  const jsonPointer = item.jsonPointer;
  const parentFieldId = item.parentFieldId;

  if (typeof schemaVersionId !== 'string' || typeof fieldId !== 'string' || typeof jsonPointer !== 'string') {
    return null;
  }

  return {
    schemaVersionId,
    fieldId,
    jsonPointer,
    ...(typeof parentFieldId === 'string' ? { parentFieldId } : {}),
  };
}

export async function putSchemaNodeIdentity(identity: SchemaNodeIdentity): Promise<void> {
  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.schemaNodes,
      Item: toIdentitySidecarItem(identity),
    }),
  );
}

export async function batchWriteSchemaNodeIdentities(
  schemaVersionId: string,
  identities: readonly SchemaNodeIdentity[],
): Promise<void> {
  if (identities.length === 0) {
    return;
  }

  const normalized = identities.map((identity) => ({
    ...identity,
    schemaVersionId,
  }));

  const identityChunks = chunk(normalized, DYNAMO_BATCH_SIZE);
  for (const identityChunk of identityChunks) {
    const requests: BatchWriteRequest[] = identityChunk.map((identity) => ({
      PutRequest: {
        Item: toIdentitySidecarItem(identity),
      },
    }));

    await batchWriteWithRetry(requests);
  }
}

export async function getSchemaNodeIdentity(
  schemaVersionId: string,
  jsonPointer: string,
): Promise<SchemaNodeIdentity | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.schemaNodes,
      Key: {
        schemaId: identitySchemaId(schemaVersionId),
        path: jsonPointer,
      },
    }),
  );

  if (!result.Item || typeof result.Item !== 'object') {
    return null;
  }

  return toSchemaNodeIdentity(result.Item as Record<string, unknown>);
}

export async function listSchemaNodeIdentities(schemaVersionId: string): Promise<SchemaNodeIdentity[]> {
  const identities: SchemaNodeIdentity[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.schemaNodes,
        KeyConditionExpression: 'schemaId = :schemaId',
        ExpressionAttributeValues: {
          ':schemaId': identitySchemaId(schemaVersionId),
        },
        ScanIndexForward: true,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    for (const raw of result.Items ?? []) {
      if (!raw || typeof raw !== 'object') {
        continue;
      }

      const identity = toSchemaNodeIdentity(raw as Record<string, unknown>);
      if (identity) {
        identities.push(identity);
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return identities;
}

export const schemaNodes = {
  batchWriteSchemaNodeIdentities,
  batchWrite,
  getSchemaNodeIdentity,
  listSchemaNodeIdentities,
  listBySchema,
  putSchemaNodeIdentity,
  queryContains,
  backfillRetrievalFields,
  deleteBySchema,
};
