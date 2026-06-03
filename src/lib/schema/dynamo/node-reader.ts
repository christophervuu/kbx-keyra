import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

import type { SchemaNode } from '../types.js';

type DynamoSender = Pick<DynamoDBDocumentClient, 'send'>;

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SCHEMA_NODES_TABLE = getEnvValue('SCHEMA_NODES_TABLE');

const dynamoClient: DynamoSender = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type NodeReaderErrorCode = 'SCHEMA_DYNAMO_CONFIG_ERROR' | 'SCHEMA_DYNAMO_QUERY_ERROR';

export class NodeReaderError extends Error {
  constructor(
    public readonly code: NodeReaderErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NodeReaderError';
  }
}

/**
 * Return all SchemaNode records for a given schemaId (partition-key query).
 *
 * Useful for snapshot comparisons such as pre-sync vs post-sync diff
 * computation.  Nodes are returned sorted by path for deterministic output.
 */
export async function getAllSchemaNodes(schemaId: string): Promise<SchemaNode[]> {
  const table = getNodesTableOrThrow();

  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: '#schemaId = :schemaId',
        ExpressionAttributeNames: {
          '#schemaId': 'schemaId',
        },
        ExpressionAttributeValues: {
          ':schemaId': schemaId,
        },
      }),
    );

    const items = (result.Items ?? []) as QueryResultItem[];

    return items
      .map(asSchemaNode)
      .filter((node): node is SchemaNode => node !== null)
      .sort((a, b) => a.path.localeCompare(b.path));
  } catch (error) {
    throw new NodeReaderError(
      'SCHEMA_DYNAMO_QUERY_ERROR',
      `Failed getAllSchemaNodes query for schemaId '${schemaId}'`,
      error,
    );
  }
}

function getNodesTableOrThrow(): string {
  const table = SCHEMA_NODES_TABLE?.trim();
  if (!table) {
    throw new NodeReaderError('SCHEMA_DYNAMO_CONFIG_ERROR', 'Missing required environment variable: SCHEMA_NODES_TABLE');
  }

  return table;
}

type QueryResultItem = Record<string, unknown>;

async function queryByParentPath(schemaId: string, parentPath: string): Promise<QueryResultItem[]> {
  const table = getNodesTableOrThrow();

  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: table,
        IndexName: 'parentPath-index',
        KeyConditionExpression: '#schemaId = :schemaId AND #parentPath = :parentPath',
        ExpressionAttributeNames: {
          '#schemaId': 'schemaId',
          '#parentPath': 'parentPath',
        },
        ExpressionAttributeValues: {
          ':schemaId': schemaId,
          ':parentPath': parentPath,
        },
      }),
    );

    return (result.Items ?? []) as QueryResultItem[];
  } catch (error) {
    throw new NodeReaderError('SCHEMA_DYNAMO_QUERY_ERROR', `Failed parentPath-index query for schemaId '${schemaId}'`, error);
  }
}

function asSchemaNode(item: QueryResultItem): SchemaNode | null {
  const schemaId = item.schemaId;
  const path = item.path;
  const fieldName = item.fieldName;
  const type = item.type;
  const depth = item.depth;
  const isArray = item.isArray;
  const isRequired = item.isRequired;
  const childCount = item.childCount;
  const subtreeFieldCount = item.subtreeFieldCount;
  const embeddingText = item.embeddingText;
  const parentPath = item.parentPath;
  const description = item.description;

  if (
    typeof schemaId !== 'string'
    || typeof path !== 'string'
    || typeof fieldName !== 'string'
    || typeof type !== 'string'
    || typeof depth !== 'number'
    || typeof isArray !== 'boolean'
    || typeof isRequired !== 'boolean'
    || typeof childCount !== 'number'
    || typeof subtreeFieldCount !== 'number'
    || typeof embeddingText !== 'string'
  ) {
    return null;
  }

  return {
    schemaId,
    path,
    fieldName,
    type,
    depth,
    isArray,
    isRequired,
    childCount,
    subtreeFieldCount,
    embeddingText,
    ...(typeof parentPath === 'string' && parentPath !== '' ? { parentPath } : {}),
    ...(typeof description === 'string' && description !== '' ? { description } : {}),
  };
}

function toParentChain(path: string): string[] {
  const segments = path.split('.').filter((segment) => segment !== '');
  if (segments.length <= 1) {
    return [];
  }

  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('.'));
}

export async function getParentChain(schemaId: string, path: string): Promise<string[]> {
  const chain = toParentChain(path);
  if (chain.length === 0) {
    return [];
  }

  const parents = chain.slice();
  const parentSet = new Set(parents);

  // Validate with parentPath-index lookups (best effort, rooted at direct parent)
  let currentParent = parents[parents.length - 1];
  while (currentParent) {
    const children = await queryByParentPath(schemaId, currentParent);
    if (children.length === 0) {
      break;
    }

    const nextParent = currentParent.includes('.')
      ? currentParent.slice(0, currentParent.lastIndexOf('.'))
      : '';

    if (!nextParent || !parentSet.has(nextParent)) {
      break;
    }

    currentParent = nextParent;
  }

  return parents;
}

export async function getNodeChildren(schemaId: string, parentPath: string): Promise<SchemaNode[]> {
  const items = await queryByParentPath(schemaId, parentPath);

  return items
    .map(asSchemaNode)
    .filter((node): node is SchemaNode => node !== null)
    .sort((a, b) => a.path.localeCompare(b.path));
}
