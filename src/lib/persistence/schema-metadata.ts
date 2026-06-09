import { DeleteCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES } from './config.js';
import type { CreateSchemaMetadataInput, SchemaIngestStatus, SchemaMetadataItem } from './types.js';
import { normalizeSchemaOrigin } from './types.js';
import { normalizeSchemaOwnership, normalizeSchemaSourceKind } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function createSchemaId(): string {
  return crypto.randomUUID();
}

export async function create(input: CreateSchemaMetadataInput): Promise<SchemaMetadataItem> {
  const timestamp = nowIso();
  const projectedSourceRepoId =
    input.source.type === 'github' && typeof input.source.repoId === 'number'
      ? input.source.repoId
      : undefined;

  const item: SchemaMetadataItem = {
    schemaId: createSchemaId(),
    name: input.name,
    format: input.format,
    fieldCount: input.fieldCount,
    origin: normalizeSchemaOrigin(input.origin),
    status: input.status ?? 'ingesting',
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    description: input.description,
    inferred: input.inferred,
    sourceKind: normalizeSchemaSourceKind({
      sourceKind: input.sourceKind,
      format: input.format,
      inferred: input.inferred,
    }),
    ownership: normalizeSchemaOwnership({
      ownership: input.ownership,
      origin: input.origin,
    }),
    readonly: input.readonly,
    reviewedAt: input.reviewedAt,
    reviewedBy: input.reviewedBy,
    disambiguator: input.disambiguator,
    syncStatus: input.syncStatus ?? 'not-synced',
    source: input.source,
    sourceRepoId: projectedSourceRepoId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.schemaMetadata,
      Item: item,
    }),
  );

  return item;
}

export async function get(schemaId: string): Promise<SchemaMetadataItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.schemaMetadata,
      Key: {
        schemaId,
      },
    }),
  );

  return (result.Item as SchemaMetadataItem | undefined) ?? null;
}

export async function list(): Promise<SchemaMetadataItem[]> {
  const result = await dynamoClient.send(
    new ScanCommand({
      TableName: TABLE_NAMES.schemaMetadata,
    }),
  );

  return (result.Items as SchemaMetadataItem[] | undefined) ?? [];
}

export async function updateStatus(
  schemaId: string,
  status: SchemaIngestStatus,
  fieldCount?: number,
): Promise<SchemaMetadataItem> {
  const names: Record<string, string> = {
    '#status': 'status',
    '#updatedAt': 'updatedAt',
  };
  const values: Record<string, unknown> = {
    ':status': status,
    ':updatedAt': nowIso(),
  };

  const updates: string[] = ['#status = :status', '#updatedAt = :updatedAt'];

  if (fieldCount !== undefined) {
    names['#fieldCount'] = 'fieldCount';
    values[':fieldCount'] = fieldCount;
    updates.push('#fieldCount = :fieldCount');
  }

  const result = await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.schemaMetadata,
      Key: {
        schemaId,
      },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }),
  );

  return result.Attributes as SchemaMetadataItem;
}

export async function remove(schemaId: string): Promise<void> {
  await dynamoClient.send(
    new DeleteCommand({
      TableName: TABLE_NAMES.schemaMetadata,
      Key: {
        schemaId,
      },
    }),
  );
}

export { remove as delete };

export const schemaMetadata = {
  create,
  get,
  list,
  updateStatus,
  delete: remove,
};
