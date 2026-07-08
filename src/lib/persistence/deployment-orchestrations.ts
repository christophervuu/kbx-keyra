import { DeleteCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES } from './config.js';
import type {
  CreateDeploymentOrchestrationInput,
  DeploymentEnvironment,
  DeploymentOperationStatus,
  DeploymentOperationType,
  DeploymentOrchestrationItem,
  UpdateDeploymentOrchestrationStatusInput,
} from './types.js';

export interface DeploymentOperationRecord {
  readonly orchestrationId: string;
  readonly operationId: string;
  readonly mappingId: string;
  readonly projectId?: string;
  readonly operationType: DeploymentOperationType;
  readonly operationStatus: DeploymentOperationStatus;
  readonly operationStage?:
    | 'VALIDATING_REQUEST'
    | 'RESOLVING_VERSION'
    | 'BUILDING_ARTIFACT'
    | 'VALIDATING_ARTIFACT'
    | 'TRANSFERRING_ARTIFACT'
    | 'ACTIVATING_ARTIFACT'
    | 'VERIFYING_RUNTIME'
    | 'UPDATING_PROJECTION'
    | 'FINALIZING';
  readonly sourceEnvironment?: DeploymentEnvironment;
  readonly targetEnvironment?: DeploymentEnvironment;
  readonly sourceVersion?: number;
  readonly artifactId?: string;
  readonly artifactHash?: string;
  readonly requestedBy: {
    readonly actorType: 'USER' | 'SERVICE' | 'DEVELOPMENT';
    readonly actorId: string;
    readonly actorDisplayName?: string;
    readonly actorEmail?: string;
  };
  readonly requestedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly failureCode?: string;
  readonly failureMessage?: string;
  readonly retryable?: boolean;
  readonly retryOfOperationId?: string;
  readonly idempotencyKey?: string;
}

export interface DeploymentOperationLock {
  readonly orchestrationId: string;
  readonly mappingId: string;
  readonly targetEnvironment: DeploymentEnvironment;
  readonly lockOwnerOperationId: string;
  readonly expiresAt: number;
  readonly updatedAt: string;
}

export interface AcquireOperationLockResult {
  readonly outcome: 'acquired' | 'already_owned' | 'conflict';
  readonly lockKey: string;
  readonly existingLockOwnerOperationId?: string;
  readonly expiresAt?: number;
}

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

export async function createOperationRecord(input: DeploymentOperationRecord): Promise<DeploymentOperationRecord> {
  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.deploymentOrchestrations,
      Item: input,
      ConditionExpression: 'attribute_not_exists(orchestrationId)',
    }),
  );

  return input;
}

export async function getOperationRecord(operationId: string): Promise<DeploymentOperationRecord | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.deploymentOrchestrations,
      Key: { orchestrationId: operationId },
    }),
  );

  return (result.Item as DeploymentOperationRecord | undefined) ?? null;
}

export async function listReconciliationCandidates(): Promise<DeploymentOperationRecord[]> {
  const result = await dynamoClient.send(
    new ScanCommand({
      TableName: TABLE_NAMES.deploymentOrchestrations,
      FilterExpression: 'attribute_exists(operationId) AND (#status = :running OR #status = :timedOut)',
      ExpressionAttributeNames: {
        '#status': 'operationStatus',
      },
      ExpressionAttributeValues: {
        ':running': 'RUNNING',
        ':timedOut': 'TIMED_OUT',
      },
    }),
  );

  return ((result.Items as DeploymentOperationRecord[] | undefined) ?? [])
    .sort((a, b) => String(a.requestedAt).localeCompare(String(b.requestedAt)));
}

export async function updateOperationRecordStatus(input: {
  readonly operationId: string;
  readonly operationStatus: DeploymentOperationStatus;
  readonly operationStage?: DeploymentOperationRecord['operationStage'];
  readonly completedAt?: string;
  readonly failureCode?: string;
  readonly failureMessage?: string;
  readonly retryable?: boolean;
}): Promise<void> {
  const now = nowIso();
  const names: Record<string, string> = {
    '#operationStatus': 'operationStatus',
  };
  const values: Record<string, unknown> = {
    ':operationStatus': input.operationStatus,
  };
  const setClauses = ['#operationStatus = :operationStatus'];

  if (input.operationStage) {
    names['#operationStage'] = 'operationStage';
    values[':operationStage'] = input.operationStage;
    setClauses.push('#operationStage = :operationStage');
  }

  const shouldComplete = input.operationStatus === 'SUCCEEDED' || input.operationStatus === 'FAILED' || input.operationStatus === 'TIMED_OUT';
  if (shouldComplete) {
    names['#completedAt'] = 'completedAt';
    values[':completedAt'] = input.completedAt ?? now;
    setClauses.push('#completedAt = :completedAt');
  }

  if (input.failureCode) {
    names['#failureCode'] = 'failureCode';
    values[':failureCode'] = input.failureCode;
    setClauses.push('#failureCode = :failureCode');
  }

  if (input.failureMessage) {
    names['#failureMessage'] = 'failureMessage';
    values[':failureMessage'] = input.failureMessage;
    setClauses.push('#failureMessage = :failureMessage');
  }

  if (typeof input.retryable === 'boolean') {
    names['#retryable'] = 'retryable';
    values[':retryable'] = input.retryable;
    setClauses.push('#retryable = :retryable');
  }

  await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.deploymentOrchestrations,
      Key: { orchestrationId: input.operationId },
      UpdateExpression: `SET ${setClauses.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(orchestrationId)',
    }),
  );
}

export function operationLockKey(mappingId: string, targetEnvironment: DeploymentEnvironment): string {
  return `lock:${mappingId}:${targetEnvironment}`;
}

export async function getOperationLock(mappingId: string, targetEnvironment: DeploymentEnvironment): Promise<DeploymentOperationLock | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.deploymentOrchestrations,
      Key: { orchestrationId: operationLockKey(mappingId, targetEnvironment) },
    }),
  );

  return (result.Item as DeploymentOperationLock | undefined) ?? null;
}

export async function acquireOperationLock(input: {
  readonly mappingId: string;
  readonly targetEnvironment: DeploymentEnvironment;
  readonly ownerOperationId: string;
  readonly ttlSeconds: number;
}): Promise<AcquireOperationLockResult> {
  const lockKey = operationLockKey(input.mappingId, input.targetEnvironment);
  const existing = await getOperationLock(input.mappingId, input.targetEnvironment);
  const nowEpoch = Math.floor(Date.now() / 1000);

  if (existing && existing.lockOwnerOperationId === input.ownerOperationId && existing.expiresAt > nowEpoch) {
    return {
      outcome: 'already_owned',
      lockKey,
      existingLockOwnerOperationId: existing.lockOwnerOperationId,
      expiresAt: existing.expiresAt,
    };
  }

  const expiresAt = nowEpoch + Math.max(1, Math.floor(input.ttlSeconds));
  const item: DeploymentOperationLock = {
    orchestrationId: lockKey,
    mappingId: input.mappingId,
    targetEnvironment: input.targetEnvironment,
    lockOwnerOperationId: input.ownerOperationId,
    expiresAt,
    updatedAt: nowIso(),
  };

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAMES.deploymentOrchestrations,
        Item: item,
        ConditionExpression: 'attribute_not_exists(orchestrationId) OR expiresAt < :nowEpoch',
        ExpressionAttributeValues: {
          ':nowEpoch': nowEpoch,
        },
      }),
    );
  } catch {
    const current = await getOperationLock(input.mappingId, input.targetEnvironment);
    return {
      outcome: 'conflict',
      lockKey,
      existingLockOwnerOperationId: current?.lockOwnerOperationId,
      expiresAt: current?.expiresAt,
    };
  }

  return {
    outcome: 'acquired',
    lockKey,
    expiresAt,
  };
}

export async function releaseOperationLock(input: {
  readonly mappingId: string;
  readonly targetEnvironment: DeploymentEnvironment;
  readonly ownerOperationId: string;
}): Promise<boolean> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAMES.deploymentOrchestrations,
        Key: { orchestrationId: operationLockKey(input.mappingId, input.targetEnvironment) },
        ConditionExpression: 'lockOwnerOperationId = :ownerOperationId',
        ExpressionAttributeValues: {
          ':ownerOperationId': input.ownerOperationId,
        },
      }),
    );

    return true;
  } catch {
    return false;
  }
}

export const deploymentOrchestrations = {
  create,
  get,
  updateStatus,
  createOperationRecord,
  getOperationRecord,
  listReconciliationCandidates,
  updateOperationRecordStatus,
  operationLockKey,
  getOperationLock,
  acquireOperationLock,
  releaseOperationLock,
};
