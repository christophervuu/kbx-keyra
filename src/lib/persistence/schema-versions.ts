import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES } from './config.js';
import type { CreateSchemaVersionInput, CreateSchemaVersionResult, SchemaDraftItem, SchemaVersionItem } from './types.js';
import { schemaContent } from './s3/schema-content.js';

function nowIso(): string {
  return new Date().toISOString();
}

function isConditionalCheckFailed(error: unknown): boolean {
  const typed = error as { name?: string; Code?: string } | null | undefined;
  return typed?.name === 'ConditionalCheckFailedException' || typed?.Code === 'ConditionalCheckFailedException';
}

async function listDescending(schemaId: string): Promise<SchemaVersionItem[]> {
  const items: SchemaVersionItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.schemaVersions,
        KeyConditionExpression: 'schemaId = :schemaId',
        ExpressionAttributeValues: {
          ':schemaId': schemaId,
        },
        ScanIndexForward: false,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    if (result.Items) {
      items.push(...(result.Items as SchemaVersionItem[]));
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return items;
}

export async function list(schemaId: string): Promise<SchemaVersionItem[]> {
  return listDescending(schemaId);
}

export async function getByIdempotencyKey(schemaId: string, idempotencyKey: string): Promise<SchemaVersionItem | null> {
  const versions = await listDescending(schemaId);
  return versions.find((item) => item.idempotencyKey === idempotencyKey) ?? null;
}

export async function getByDraftRevision(schemaId: string, draftRevision: number): Promise<SchemaVersionItem | null> {
  const versions = await listDescending(schemaId);
  return versions.find((item) => item.draftRevision === draftRevision) ?? null;
}

export async function get(schemaId: string, version: number): Promise<SchemaVersionItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.schemaVersions,
      Key: {
        schemaId,
        version,
      },
    }),
  );

  return (result.Item as SchemaVersionItem | undefined) ?? null;
}

export async function getLatest(schemaId: string): Promise<SchemaVersionItem | null> {
  return (await listDescending(schemaId))[0] ?? null;
}

export async function createFromDraft(schemaId: string, draft: SchemaDraftItem, input: CreateSchemaVersionInput): Promise<CreateSchemaVersionResult> {
  if (input.expectedDraftRevision !== undefined && input.expectedDraftRevision !== draft.revision) {
    throw new Error(
      `Schema draft revision conflict for schema '${schemaId}': expected ${input.expectedDraftRevision}, actual ${draft.revision}`,
    );
  }

  if (input.idempotencyKey) {
    const existingByIdempotency = await getByIdempotencyKey(schemaId, input.idempotencyKey);
    if (existingByIdempotency) {
      if (existingByIdempotency.draftRevision !== draft.revision) {
        throw new Error(
          `Idempotency key reuse conflict for schema '${schemaId}': key already used for draft revision ${existingByIdempotency.draftRevision}`,
        );
      }

      return {
        noChange: false,
        replayed: true,
        item: existingByIdempotency,
      };
    }
  }

  const existingByDraftRevision = await getByDraftRevision(schemaId, draft.revision);
  if (existingByDraftRevision) {
    if (input.idempotencyKey && existingByDraftRevision.idempotencyKey && existingByDraftRevision.idempotencyKey !== input.idempotencyKey) {
      throw new Error(
        `Schema version already created from draft revision ${draft.revision} with a different idempotency key`,
      );
    }

    return {
      noChange: false,
      replayed: true,
      item: existingByDraftRevision,
    };
  }

  const latest = await getLatest(schemaId);
  if (latest && latest.contentHash === draft.contentHash) {
    if (input.idempotencyKey) {
      const existingNoChange = await getByIdempotencyKey(schemaId, input.idempotencyKey);
      if (existingNoChange) {
        return {
          noChange: true,
          replayed: true,
        };
      }
    }

    return {
      noChange: true,
    };
  }

  const nextVersion = (latest?.version ?? 0) + 1;
  const content = await schemaContent.getDraftRevision(schemaId, draft.revision);
  if (!content) {
    throw new Error(`Schema draft content missing for schema '${schemaId}' revision ${draft.revision}`);
  }

  const contentS3Key = await schemaContent.putVersion(schemaId, nextVersion, content);
  const item: SchemaVersionItem = {
    schemaId,
    version: nextVersion,
    schemaVersionId: crypto.randomUUID(),
    draftRevision: draft.revision,
    basedOnVersion: draft.basedOnVersion,
    contentHash: draft.contentHash,
    contentS3Key,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.changeSummary ? { changeSummary: input.changeSummary } : {}),
    versionStatus: 'ready',
    indexStatus: 'pending',
    impactStatus: 'pending',
    sampleValidationStatus: 'pending',
    createdAt: nowIso(),
    createdBy: input.createdBy,
  };

  let conditionalConflictDetected = false;

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.schemaVersions,
      Item: item,
      ConditionExpression: 'attribute_not_exists(schemaId) AND attribute_not_exists(#version)',
      ExpressionAttributeNames: {
        '#version': 'version',
      },
    }),
  ).catch(async (error) => {
    if (!isConditionalCheckFailed(error)) {
      throw error;
    }

    conditionalConflictDetected = true;
  });

  if (conditionalConflictDetected) {
    const existingAfterConditional = await getByDraftRevision(schemaId, draft.revision);
    if (existingAfterConditional) {
      return {
        noChange: false,
        replayed: true,
        item: existingAfterConditional,
      };
    }

    throw new Error(
      `Schema version create conflict for schema '${schemaId}' draft revision ${draft.revision}`,
    );
  }

  return {
    noChange: false,
    item,
  };
}

export async function updateDerivedStatuses(
  schemaId: string,
  version: number,
  input: {
    readonly indexStatus?: SchemaVersionItem['indexStatus'];
    readonly impactStatus?: SchemaVersionItem['impactStatus'];
    readonly sampleValidationStatus?: SchemaVersionItem['sampleValidationStatus'];
  },
): Promise<SchemaVersionItem | null> {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const updates: string[] = [];

  if (input.indexStatus) {
    names['#indexStatus'] = 'indexStatus';
    values[':indexStatus'] = input.indexStatus;
    updates.push('#indexStatus = :indexStatus');
  }

  if (input.impactStatus) {
    names['#impactStatus'] = 'impactStatus';
    values[':impactStatus'] = input.impactStatus;
    updates.push('#impactStatus = :impactStatus');
  }

  if (input.sampleValidationStatus) {
    names['#sampleValidationStatus'] = 'sampleValidationStatus';
    values[':sampleValidationStatus'] = input.sampleValidationStatus;
    updates.push('#sampleValidationStatus = :sampleValidationStatus');
  }

  if (updates.length === 0) {
    return get(schemaId, version);
  }

  const result = await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.schemaVersions,
      Key: {
        schemaId,
        version,
      },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }),
  );

  return (result.Attributes as SchemaVersionItem | undefined) ?? null;
}

export const schemaVersions = {
  createFromDraft,
  get,
  getByDraftRevision,
  getByIdempotencyKey,
  getLatest,
  list,
  updateDerivedStatuses,
};
