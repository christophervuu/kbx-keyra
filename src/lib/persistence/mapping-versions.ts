import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES } from './config.js';
import { getConfig as getRevisionConfig } from './mapping-revisions.js';
import type { MappingConfig, MappingVersionItem } from './types.js';

interface CreateMappingVersionInput {
  readonly revisionNumber: number;
  readonly createdBy: string;
}

/** @deprecated compatibility input (pre-FS-063) */
interface SaveMappingVersionInput {
  readonly version: number;
  readonly savedBy: string;
  readonly ruleCount: number;
  readonly config: MappingConfig;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function nextVersionNumber(mappingId: string): Promise<number> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: TABLE_NAMES.mappingVersions,
      KeyConditionExpression: 'mappingId = :mappingId',
      ExpressionAttributeValues: {
        ':mappingId': mappingId,
      },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );

  const latest = (result.Items?.[0] as MappingVersionItem | undefined)?.version ?? 0;
  return latest + 1;
}

export async function create(mappingId: string, input: CreateMappingVersionInput): Promise<MappingVersionItem> {
  const version = await nextVersionNumber(mappingId);
  const item: MappingVersionItem = {
    mappingId,
    version,
    revisionNumber: input.revisionNumber,
    createdAt: nowIso(),
    createdBy: input.createdBy,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.mappingVersions,
      Item: item,
    }),
  );

  return item;
}

/**
 * @deprecated Compatibility shim for pre-FS-063 callers.
 * Persists a milestone version using the provided explicit version number.
 */
export async function save(mappingId: string, entry: SaveMappingVersionInput): Promise<MappingVersionItem> {
  const item: MappingVersionItem = {
    mappingId,
    version: entry.version,
    revisionNumber: entry.version,
    createdAt: nowIso(),
    createdBy: entry.savedBy,
    savedAt: nowIso(),
    savedBy: entry.savedBy,
    ruleCount: entry.ruleCount,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.mappingVersions,
      Item: item,
    }),
  );

  return item;
}

export async function list(mappingId: string): Promise<MappingVersionItem[]> {
  const items: MappingVersionItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.mappingVersions,
        KeyConditionExpression: 'mappingId = :mappingId',
        ExpressionAttributeValues: {
          ':mappingId': mappingId,
        },
        ScanIndexForward: false,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    if (result.Items) {
      items.push(...(result.Items as MappingVersionItem[]));
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return items;
}

export async function get(mappingId: string, version: number): Promise<MappingVersionItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.mappingVersions,
      Key: {
        mappingId,
        version,
      },
    }),
  );

  return (result.Item as MappingVersionItem | undefined) ?? null;
}

/**
 * @deprecated Compatibility shim for pre-FS-063 callers.
 * Resolves version snapshots through the pointed revision.
 */
export async function getConfig(mappingId: string, version: number): Promise<MappingConfig | null> {
  const versionItem = await get(mappingId, version);
  if (!versionItem) {
    return null;
  }

  return getRevisionConfig(mappingId, versionItem.revisionNumber);
}

export const mappingVersions = {
  create,
  save,
  list,
  get,
  getConfig,
};
