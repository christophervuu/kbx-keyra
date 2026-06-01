import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient, s3Client } from './clients.js';
import { BUCKET_NAME, TABLE_NAMES, mappingRevisionKey } from './config.js';
import { computeConfigHash } from './hash.js';
import type { MappingConfig, MappingRevisionItem, MappingVersionItem } from './types.js';

const MAX_UNVERSIONED_REVISIONS_PER_MAPPING = 50;

interface SaveMappingRevisionInput {
  readonly savedBy: string;
  readonly ruleCount: number;
  readonly config: MappingConfig;
}

interface SaveMappingRevisionResult {
  readonly noChange: boolean;
  readonly item: MappingRevisionItem;
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

async function listAscending(mappingId: string): Promise<MappingRevisionItem[]> {
  const items: MappingRevisionItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.mappingRevisions,
        KeyConditionExpression: 'mappingId = :mappingId',
        ExpressionAttributeValues: {
          ':mappingId': mappingId,
        },
        ScanIndexForward: true,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    if (result.Items) {
      items.push(...(result.Items as MappingRevisionItem[]));
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return items;
}

async function getVersionReferencedRevisions(mappingId: string): Promise<Set<number>> {
  const referenced = new Set<number>();
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

    const items = (result.Items as MappingVersionItem[] | undefined) ?? [];
    for (const item of items) {
      if (typeof item.revisionNumber === 'number') {
        referenced.add(item.revisionNumber);
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return referenced;
}

function pickPrunableRevisions(
  revisionsAscending: readonly MappingRevisionItem[],
  referencedRevisions: ReadonlySet<number>,
): MappingRevisionItem[] {
  const unversioned = revisionsAscending.filter((item) => !referencedRevisions.has(item.revision));

  if (unversioned.length <= MAX_UNVERSIONED_REVISIONS_PER_MAPPING) {
    return [];
  }

  const pruneCount = unversioned.length - MAX_UNVERSIONED_REVISIONS_PER_MAPPING;
  return unversioned.slice(0, pruneCount);
}

async function pruneExcessRevisions(mappingId: string): Promise<void> {
  try {
    const revisions = await listAscending(mappingId);
    const referenced = await getVersionReferencedRevisions(mappingId);
    const toDelete = pickPrunableRevisions(revisions, referenced);

    for (const revisionItem of toDelete) {
      await dynamoClient.send(
        new DeleteCommand({
          TableName: TABLE_NAMES.mappingRevisions,
          Key: {
            mappingId: revisionItem.mappingId,
            revision: revisionItem.revision,
          },
        }),
      );

      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: revisionItem.configS3Key,
        }),
      );
    }
  } catch (error) {
    console.warn('Failed to prune mapping revisions; continuing without failing save.', {
      mappingId,
      error,
    });
  }
}

export async function list(mappingId: string): Promise<MappingRevisionItem[]> {
  const items: MappingRevisionItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.mappingRevisions,
        KeyConditionExpression: 'mappingId = :mappingId',
        ExpressionAttributeValues: {
          ':mappingId': mappingId,
        },
        ScanIndexForward: false,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    if (result.Items) {
      items.push(...(result.Items as MappingRevisionItem[]));
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return items;
}

export async function get(mappingId: string, revision: number): Promise<MappingRevisionItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.mappingRevisions,
      Key: {
        mappingId,
        revision,
      },
    }),
  );

  return (result.Item as MappingRevisionItem | undefined) ?? null;
}

export async function getConfig(mappingId: string, revision: number): Promise<MappingConfig | null> {
  const revisionItem = await get(mappingId, revision);
  if (!revisionItem) {
    return null;
  }

  try {
    const output = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: revisionItem.configS3Key,
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

export async function save(mappingId: string, entry: SaveMappingRevisionInput): Promise<SaveMappingRevisionResult> {
  const latest = (await list(mappingId))[0] ?? null;
  const configHash = await computeConfigHash(entry.config);

  if (latest && latest.configHash === configHash) {
    return {
      noChange: true,
      item: latest,
    };
  }

  const nextRevision = (latest?.revision ?? 0) + 1;
  const configS3Key = mappingRevisionKey(mappingId, nextRevision);

  const configPayload: MappingConfig = {
    ...entry.config,
    id: mappingId,
    version: nextRevision,
  };

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: configS3Key,
      Body: JSON.stringify(configPayload),
      ContentType: 'application/json',
    }),
  );

  const item: MappingRevisionItem = {
    mappingId,
    revision: nextRevision,
    savedAt: nowIso(),
    savedBy: entry.savedBy,
    ruleCount: entry.ruleCount,
    configS3Key,
    configHash,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.mappingRevisions,
      Item: item,
    }),
  );

  await pruneExcessRevisions(mappingId);
  return {
    noChange: false,
    item,
  };
}

export const mappingRevisions = {
  save,
  list,
  get,
  getConfig,
};
