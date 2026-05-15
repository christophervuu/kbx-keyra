import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient, s3Client } from './clients.js';
import { BUCKET_NAME, TABLE_NAMES, mappingVersionKey } from './config.js';
import type { MappingConfig, MappingVersionItem } from './types.js';

const MAX_VERSIONS_PER_MAPPING = 50;

interface SaveMappingVersionInput {
  readonly version: number;
  readonly savedBy: string;
  readonly ruleCount: number;
  readonly config: MappingConfig;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function readObjectBodyAsString(output: GetObjectCommandOutput): Promise<string | null> {
  const body = output.Body;
  if (!body) {
    return null;
  }

  if (typeof body === 'string') {
    return body;
  }

  const candidate = body as { transformToString?: () => Promise<string> };
  if (typeof candidate.transformToString === 'function') {
    return candidate.transformToString();
  }

  return null;
}

async function listAscending(mappingId: string): Promise<MappingVersionItem[]> {
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
        ScanIndexForward: true,
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

async function pruneExcessVersions(mappingId: string): Promise<void> {
  try {
    const versions = await listAscending(mappingId);
    if (versions.length <= MAX_VERSIONS_PER_MAPPING) {
      return;
    }

    const excessCount = versions.length - MAX_VERSIONS_PER_MAPPING;
    const toDelete = versions.slice(0, excessCount);

    for (const versionItem of toDelete) {
      await dynamoClient.send(
        new DeleteCommand({
          TableName: TABLE_NAMES.mappingVersions,
          Key: {
            mappingId: versionItem.mappingId,
            version: versionItem.version,
          },
        }),
      );

      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: versionItem.configS3Key,
        }),
      );
    }
  } catch (error) {
    console.warn('Failed to prune mapping versions; continuing without failing save.', {
      mappingId,
      error,
    });
  }
}

export async function save(mappingId: string, entry: SaveMappingVersionInput): Promise<MappingVersionItem> {
  const configS3Key = mappingVersionKey(mappingId, entry.version);
  const savedAt = nowIso();

  const configPayload: MappingConfig = {
    ...entry.config,
    id: mappingId,
    version: entry.version,
  };

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: configS3Key,
      Body: JSON.stringify(configPayload),
      ContentType: 'application/json',
    }),
  );

  const item: MappingVersionItem = {
    mappingId,
    version: entry.version,
    savedAt,
    savedBy: entry.savedBy,
    ruleCount: entry.ruleCount,
    configS3Key,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.mappingVersions,
      Item: item,
    }),
  );

  await pruneExcessVersions(mappingId);
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

export async function getConfig(mappingId: string, version: number): Promise<MappingConfig | null> {
  const versionItem = await get(mappingId, version);
  if (!versionItem) {
    return null;
  }

  try {
    const output = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: versionItem.configS3Key,
      }),
    );

    const content = await readObjectBodyAsString(output);
    if (!content) {
      return null;
    }

    return JSON.parse(content) as MappingConfig;
  } catch (error) {
    const maybe = error as { name?: string; Code?: string } | undefined;
    if (maybe?.name === 'NoSuchKey' || maybe?.Code === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

export const mappingVersions = {
  save,
  list,
  get,
  getConfig,
};
