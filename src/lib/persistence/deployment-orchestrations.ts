import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES } from './config.js';
import type {
  CreateDeploymentOrchestrationInput,
  DeploymentOrchestrationItem,
  UpdateDeploymentOrchestrationStatusInput,
} from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function createOrchestrationId(): string {
  return globalThis.crypto.randomUUID();
}

export async function create(input: CreateDeploymentOrchestrationInput): Promise<DeploymentOrchestrationItem> {
  const requestedAt = nowIso();
  const orchestrationId = input.orchestrationId ?? createOrchestrationId();

  const item: DeploymentOrchestrationItem = {
    orchestrationId,
    mappingId: input.mappingId,
    operationType: input.operationType,
    targetEnvironment: input.targetEnvironment,
    ...(input.sourceEnvironment ? { sourceEnvironment: input.sourceEnvironment } : {}),
    ...(input.artifactId ? { artifactId: input.artifactId } : {}),
    status: 'queued',
    attemptCount: 0,
    requestId: input.requestId,
    requestedBy: input.requestedBy,
    requestedAt,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.deploymentOrchestrations,
      Item: item,
      ...(input.orchestrationId
        ? {
            ConditionExpression: 'attribute_not_exists(orchestrationId)',
          }
        : {}),
    }),
  );

  return item;
}

export async function get(orchestrationId: string): Promise<DeploymentOrchestrationItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.deploymentOrchestrations,
      Key: { orchestrationId },
    }),
  );

  return (result.Item as DeploymentOrchestrationItem | undefined) ?? null;
}

export async function updateStatus(input: UpdateDeploymentOrchestrationStatusInput): Promise<void> {
  const names: Record<string, string> = {
    '#status': 'status',
  };

  const values: Record<string, unknown> = {
    ':status': input.status,
  };

  const setClauses = ['#status = :status'];

  if (typeof input.attemptCount === 'number') {
    names['#attemptCount'] = 'attemptCount';
    values[':attemptCount'] = input.attemptCount;
    setClauses.push('#attemptCount = :attemptCount');
  }

  if (typeof input.requestId === 'string') {
    names['#requestId'] = 'requestId';
    values[':requestId'] = input.requestId;
    setClauses.push('#requestId = :requestId');
  }

  if (typeof input.artifactId === 'string') {
    names['#artifactId'] = 'artifactId';
    values[':artifactId'] = input.artifactId;
    setClauses.push('#artifactId = :artifactId');
  }

  if (typeof input.lastErrorCode === 'string') {
    names['#lastErrorCode'] = 'lastErrorCode';
    values[':lastErrorCode'] = input.lastErrorCode;
    setClauses.push('#lastErrorCode = :lastErrorCode');
  }

  if (typeof input.lastErrorMessage === 'string') {
    names['#lastErrorMessage'] = 'lastErrorMessage';
    values[':lastErrorMessage'] = input.lastErrorMessage;
    setClauses.push('#lastErrorMessage = :lastErrorMessage');
  }

  const completedAt = input.completedAt ?? (input.status === 'succeeded' || input.status === 'failed' || input.status === 'timed_out' ? nowIso() : undefined);
  if (completedAt) {
    names['#completedAt'] = 'completedAt';
    values[':completedAt'] = completedAt;
    setClauses.push('#completedAt = :completedAt');
  }

  await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.deploymentOrchestrations,
      Key: { orchestrationId: input.orchestrationId },
      UpdateExpression: `SET ${setClauses.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export const deploymentOrchestrations = {
  create,
  get,
  updateStatus,
};
