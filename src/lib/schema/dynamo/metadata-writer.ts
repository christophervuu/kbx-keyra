import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import type { SchemaMetadata, SchemaStatus } from '../types.js';

type DynamoSender = Pick<DynamoDBDocumentClient, 'send'>;

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SCHEMA_METADATA_TABLE = getEnvValue('SCHEMA_METADATA_TABLE');

const dynamoClient: DynamoSender = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type MetadataWriterErrorCode =
  | 'SCHEMA_DYNAMO_CONFIG_ERROR'
  | 'SCHEMA_DYNAMO_PUT_ERROR'
  | 'SCHEMA_DYNAMO_UPDATE_ERROR'
  | 'SCHEMA_DYNAMO_GET_ERROR';

export class MetadataWriterError extends Error {
  constructor(
    public readonly code: MetadataWriterErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MetadataWriterError';
  }
}

function getMetadataTableOrThrow(): string {
  const table = SCHEMA_METADATA_TABLE?.trim();
  if (!table) {
    throw new MetadataWriterError(
      'SCHEMA_DYNAMO_CONFIG_ERROR',
      'Missing required environment variable: SCHEMA_METADATA_TABLE',
    );
  }

  return table;
}

export async function createSchemaMetadata(metadata: SchemaMetadata): Promise<void> {
  const table = getMetadataTableOrThrow();
  const now = new Date().toISOString();

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: table,
        Item: {
          ...metadata,
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
  } catch (error) {
    throw new MetadataWriterError(
      'SCHEMA_DYNAMO_PUT_ERROR',
      `Failed to create schema metadata for schemaId '${metadata.schemaId}'`,
      error,
    );
  }
}

type MetadataUpdateFields = Partial<Omit<SchemaMetadata, 'schemaId' | 'status' | 'createdAt' | 'updatedAt'>>
  & Record<string, unknown>;

/**
 * Sync outcome metadata passed to `updateSyncMetadata`.
 */
export interface SyncOutcomeMetadata {
  readonly syncStatus: 'synced' | 'update-available' | 'sync-failed';
  readonly lastSyncResult: 'no-op' | 'updated' | 'failed';
  readonly lastSyncTimestamp: string;
  readonly lastSyncCommitSha?: string;
  readonly lastSyncReason?: string;
  readonly commitSha?: string;
}

export async function updateSchemaStatus(
  schemaId: string,
  status: SchemaStatus,
  updates: MetadataUpdateFields = {},
): Promise<void> {
  const table = getMetadataTableOrThrow();
  const now = new Date().toISOString();

  const expressionNames: Record<string, string> = {
    '#status': 'status',
    '#updatedAt': 'updatedAt',
  };

  const expressionValues: Record<string, unknown> = {
    ':status': status,
    ':updatedAt': now,
  };

  const sets = ['#status = :status', '#updatedAt = :updatedAt'];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      continue;
    }

    const nameToken = `#${key}`;
    const valueToken = `:${key}`;
    expressionNames[nameToken] = key;
    expressionValues[valueToken] = value;
    sets.push(`${nameToken} = ${valueToken}`);
  }

  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: table,
        Key: {
          schemaId,
        },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
      }),
    );
  } catch (error) {
    throw new MetadataWriterError(
      'SCHEMA_DYNAMO_UPDATE_ERROR',
      `Failed to update schema status for schemaId '${schemaId}'`,
      error,
    );
  }
}

/**
 * Update CDM sync outcome fields on the SchemaMetadata record (FS-077 T-05).
 *
 * Sets `syncStatus`, `lastSyncResult`, `lastSyncTimestamp`, and optionally
 * `source.#commitSha`, `lastSyncCommitSha`, and `lastSyncReason` in a single
 * transactional-like update call.
 */
export async function updateSyncMetadata(
  schemaId: string,
  outcome: SyncOutcomeMetadata,
): Promise<void> {
  const table = getMetadataTableOrThrow();
  const now = outcome.lastSyncTimestamp;

  const expressionNames: Record<string, string> = {
    '#syncStatus': 'syncStatus',
    '#lastSyncResult': 'lastSyncResult',
    '#lastSyncTimestamp': 'lastSyncTimestamp',
    '#updatedAt': 'updatedAt',
  };

  const expressionValues: Record<string, unknown> = {
    ':syncStatus': outcome.syncStatus,
    ':lastSyncResult': outcome.lastSyncResult,
    ':lastSyncTimestamp': now,
    ':updatedAt': now,
  };

  const sets = [
    '#syncStatus = :syncStatus',
    '#lastSyncResult = :lastSyncResult',
    '#lastSyncTimestamp = :lastSyncTimestamp',
    '#updatedAt = :updatedAt',
  ];

  if (outcome.lastSyncReason !== undefined) {
    expressionNames['#lastSyncReason'] = 'lastSyncReason';
    expressionValues[':lastSyncReason'] = outcome.lastSyncReason;
    sets.push('#lastSyncReason = :lastSyncReason');
  }

  if (outcome.lastSyncCommitSha !== undefined) {
    expressionNames['#lastSyncCommitSha'] = 'lastSyncCommitSha';
    expressionValues[':lastSyncCommitSha'] = outcome.lastSyncCommitSha;
    sets.push('#lastSyncCommitSha = :lastSyncCommitSha');
  }

  if (outcome.commitSha !== undefined) {
    expressionNames['#source'] = 'source';
    expressionNames['#commitSha'] = 'commitSha';
    expressionValues[':commitSha'] = outcome.commitSha;
    sets.push('#source.#commitSha = :commitSha');
  }

  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: table,
        Key: { schemaId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
      }),
    );
  } catch (error) {
    throw new MetadataWriterError(
      'SCHEMA_DYNAMO_UPDATE_ERROR',
      `Failed to update sync metadata for schemaId '${schemaId}'`,
      error,
    );
  }
}

export async function getSchemaMetadata(schemaId: string): Promise<SchemaMetadata | null> {
  const table = getMetadataTableOrThrow();

  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: table,
        Key: {
          schemaId,
        },
      }),
    );

    if (!result.Item) {
      return null;
    }

    return result.Item as SchemaMetadata;
  } catch (error) {
    throw new MetadataWriterError(
      'SCHEMA_DYNAMO_GET_ERROR',
      `Failed to get schema metadata for schemaId '${schemaId}'`,
      error,
    );
  }
}
