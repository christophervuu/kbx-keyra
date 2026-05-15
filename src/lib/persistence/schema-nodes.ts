import { BatchWriteCommand, QueryCommand, type BatchWriteCommandInput } from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES } from './config.js';
import type { SchemaNodeItem } from './types.js';

const DYNAMO_BATCH_SIZE = 25;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 100;
const DEFAULT_QUERY_LIMIT = 50;

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
      results.push(...(response.Items as SchemaNodeItem[]));
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
      results.push(...(response.Items as SchemaNodeItem[]).slice(0, remaining));
    }

    lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey && results.length < effectiveLimit);

  return results;
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

export const schemaNodes = {
  batchWrite,
  listBySchema,
  queryContains,
  deleteBySchema,
};
