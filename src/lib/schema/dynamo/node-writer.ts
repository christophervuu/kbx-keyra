import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import type { SchemaNode } from '../types.js';

type DynamoSender = Pick<DynamoDBDocumentClient, 'send'>;

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 100;
const DYNAMO_BATCH_SIZE = 25;

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SCHEMA_NODES_TABLE = getEnvValue('SCHEMA_NODES_TABLE');

const dynamoClient: DynamoSender = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type NodeWriterErrorCode = 'SCHEMA_DYNAMO_CONFIG_ERROR' | 'SCHEMA_DYNAMO_BATCH_ERROR';

export class NodeWriterError extends Error {
  constructor(
    public readonly code: NodeWriterErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NodeWriterError';
  }
}

function getNodesTableOrThrow(): string {
  const table = SCHEMA_NODES_TABLE?.trim();
  if (!table) {
    throw new NodeWriterError('SCHEMA_DYNAMO_CONFIG_ERROR', 'Missing required environment variable: SCHEMA_NODES_TABLE');
  }

  return table;
}

function chunkNodes(nodes: readonly SchemaNode[]): SchemaNode[][] {
  const chunks: SchemaNode[][] = [];
  for (let index = 0; index < nodes.length; index += DYNAMO_BATCH_SIZE) {
    chunks.push(nodes.slice(index, index + DYNAMO_BATCH_SIZE));
  }

  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface BatchWriteResult {
  readonly written: number;
  readonly failed: number;
}

type BatchPutRequest = {
  readonly PutRequest: {
    readonly Item: Record<string, unknown>;
  };
};

export async function batchWriteSchemaNodes(nodes: readonly SchemaNode[]): Promise<BatchWriteResult> {
  if (nodes.length === 0) {
    return {
      written: 0,
      failed: 0,
    };
  }

  const table = getNodesTableOrThrow();
  const chunks = chunkNodes(nodes);

  let written = 0;
  let failed = 0;

  for (const chunk of chunks) {
    let pendingItems: BatchPutRequest[] = chunk.map((item) => ({
      PutRequest: {
        Item: item as unknown as Record<string, unknown>,
      },
    }));

    let attempts = 0;

    while (pendingItems.length > 0 && attempts <= MAX_RETRIES) {
      try {
        const attemptItemCount = pendingItems.length;

        const response = await dynamoClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [table]: pendingItems,
            },
          }),
        );

        const unprocessedRaw = response.UnprocessedItems?.[table] ?? [];
        const unprocessed: BatchPutRequest[] = unprocessedRaw.filter(
          (entry): entry is BatchPutRequest =>
            typeof entry === 'object' && entry !== null && Boolean(entry.PutRequest?.Item),
        );

        const processedCount = attemptItemCount - unprocessed.length;
        written += processedCount;

        if (unprocessed.length === 0) {
          pendingItems = [];
          break;
        }

        pendingItems = unprocessed;
        attempts += 1;

        if (attempts > MAX_RETRIES) {
          break;
        }

        const delayMs = BASE_BACKOFF_MS * (2 ** (attempts - 1));
        await sleep(delayMs);
      } catch (error) {
        throw new NodeWriterError('SCHEMA_DYNAMO_BATCH_ERROR', 'Failed to batch write schema nodes to DynamoDB', error);
      }
    }

    failed += pendingItems.length;
  }

  return {
    written,
    failed,
  };
}
