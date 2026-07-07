import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES } from './config.js';
import type { SaveSchemaDraftInput, SaveSchemaDraftResult, SchemaDraftItem } from './types.js';
import { schemaContent } from './s3/schema-content.js';
import { computeStableJsonSha256 } from './hash.js';

function nowIso(): string {
  return new Date().toISOString();
}

async function listDescending(schemaId: string): Promise<SchemaDraftItem[]> {
  const items: SchemaDraftItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.schemaDrafts,
        KeyConditionExpression: 'schemaId = :schemaId',
        ExpressionAttributeValues: {
          ':schemaId': schemaId,
        },
        ScanIndexForward: false,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    if (result.Items) {
      items.push(...(result.Items as SchemaDraftItem[]));
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return items;
}

export async function list(schemaId: string): Promise<SchemaDraftItem[]> {
  return listDescending(schemaId);
}

export async function getCurrent(schemaId: string): Promise<SchemaDraftItem | null> {
  const latest = (await listDescending(schemaId))[0] ?? null;
  return latest;
}

export async function get(schemaId: string, revision: number): Promise<SchemaDraftItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.schemaDrafts,
      Key: {
        schemaId,
        revision,
      },
    }),
  );

  return (result.Item as SchemaDraftItem | undefined) ?? null;
}

export async function save(schemaId: string, input: SaveSchemaDraftInput): Promise<SaveSchemaDraftResult> {
  const latest = await getCurrent(schemaId);

  if (input.expectedRevision !== undefined && input.expectedRevision !== latest?.revision) {
    throw new Error(`Schema draft revision conflict for schema '${schemaId}': expected ${input.expectedRevision}, actual ${latest?.revision ?? 0}`);
  }

  const contentHash = computeStableJsonSha256(input.content);
  if (latest && latest.contentHash === contentHash) {
    return {
      noChange: true,
      item: latest,
    };
  }

  const nextRevision = (latest?.revision ?? 0) + 1;
  const contentS3Key = await schemaContent.putDraftRevision(schemaId, nextRevision, input.content);
  const timestamp = nowIso();

  const item: SchemaDraftItem = {
    schemaId,
    revision: nextRevision,
    basedOnVersion: latest?.basedOnVersion ?? null,
    contentHash,
    contentS3Key,
    createdAt: timestamp,
    createdBy: input.updatedBy,
    updatedAt: timestamp,
    updatedBy: input.updatedBy,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.schemaDrafts,
      Item: item,
    }),
  );

  return {
    noChange: false,
    item,
  };
}

export async function setBasedOnVersion(schemaId: string, basedOnVersion: number, updatedBy: string): Promise<SchemaDraftItem | null> {
  const latest = await getCurrent(schemaId);
  if (!latest) {
    return null;
  }

  const next: SchemaDraftItem = {
    ...latest,
    basedOnVersion,
    updatedAt: nowIso(),
    updatedBy,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.schemaDrafts,
      Item: next,
    }),
  );

  return next;
}

export const schemaDrafts = {
  get,
  getCurrent,
  list,
  save,
  setBasedOnVersion,
};
