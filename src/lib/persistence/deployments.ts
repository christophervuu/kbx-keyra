import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { computeConfigHash } from './hash.js';
import { dynamoClient } from './clients.js';
import { TABLE_NAMES, deploymentCurrentKey, deploymentHistorySortKey } from './config.js';
import { put as putDeploymentSnapshot } from './s3/deployment-snapshot.js';
import type {
  CreateDeploymentInput,
  DeploymentCurrentItem,
  DeploymentEnvironment,
  DeploymentItem,
} from './types.js';

const ENVIRONMENTS: readonly DeploymentEnvironment[] = ['DEV', 'QA', 'PROD'];

function nowIso(): string {
  return new Date().toISOString();
}

function toDeploymentCurrentItem(item: DeploymentItem): DeploymentCurrentItem {
  return {
    mappingIdEnvironment: deploymentCurrentKey(item.mappingId, item.environment),
    mappingId: item.mappingId,
    environment: item.environment,
    deployedAt: item.deployedAt,
    sourceType: item.sourceType,
    sourceNumber: item.sourceNumber,
    configHash: item.configHash,
    configS3Key: item.configS3Key,
  };
}

export async function create(input: CreateDeploymentInput): Promise<DeploymentItem> {
  const deployedAt = nowIso();
  const configHash = await computeConfigHash(input.config);
  const snapshotMetadata = {
    ...(input.cdmSchemaTraceability ? { cdmSchemaTraceability: input.cdmSchemaTraceability } : {}),
  };
  const configS3Key = await putDeploymentSnapshot(input.mappingId, input.environment, deployedAt, input.config, snapshotMetadata);

  const item: DeploymentItem = {
    mappingId: input.mappingId,
    environmentDeployedAt: deploymentHistorySortKey(input.environment, deployedAt),
    environment: input.environment,
    sourceType: input.sourceType,
    sourceNumber: input.sourceNumber,
    configS3Key,
    configHash,
    deployedAt,
    deployedBy: input.deployedBy,
    ...(input.cdmSchemaTraceability ? { cdmSchemaTraceability: input.cdmSchemaTraceability } : {}),
    ...(input.promotedFrom ? { promotedFrom: input.promotedFrom } : {}),
    ...(input.rollbackOf ? { rollbackOf: input.rollbackOf } : {}),
  };

  const currentItem = toDeploymentCurrentItem(item);

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.deployments,
      Item: item,
    }),
  );

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.deploymentCurrent,
      Item: currentItem,
    }),
  );

  return item;
}

export async function getCurrent(mappingId: string, environment: DeploymentEnvironment): Promise<DeploymentCurrentItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.deploymentCurrent,
      Key: {
        mappingIdEnvironment: deploymentCurrentKey(mappingId, environment),
      },
    }),
  );

  return (result.Item as DeploymentCurrentItem | undefined) ?? null;
}

export async function getCurrentAll(mappingId: string): Promise<Record<DeploymentEnvironment, DeploymentCurrentItem | null>> {
  const entries = await Promise.all(ENVIRONMENTS.map((environment) => getCurrent(mappingId, environment)));

  return {
    DEV: entries[0] ?? null,
    QA: entries[1] ?? null,
    PROD: entries[2] ?? null,
  };
}

export async function listHistory(
  mappingId: string,
  environment?: DeploymentEnvironment,
  limit?: number,
): Promise<DeploymentItem[]> {
  const items: DeploymentItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const expressionAttributeValues: Record<string, unknown> = {
      ':mappingId': mappingId,
    };

    let keyConditionExpression = 'mappingId = :mappingId';

    if (environment) {
      keyConditionExpression += ' AND begins_with(environmentDeployedAt, :environmentPrefix)';
      expressionAttributeValues[':environmentPrefix'] = `${environment}#`;
    }

    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.deployments,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    if (result.Items) {
      items.push(...(result.Items as DeploymentItem[]));
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey && (limit === undefined || items.length < limit));

  if (typeof limit === 'number' && limit >= 0) {
    return items.slice(0, limit);
  }

  return items;
}

export const deployments = {
  create,
  getCurrent,
  getCurrentAll,
  listHistory,
};
