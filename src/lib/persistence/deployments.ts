import { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { computeConfigHash } from './hash.js';
import { dynamoClient } from './clients.js';
import {
  RUNTIME_TABLE_NAMES,
  TABLE_NAMES,
  deploymentCurrentKey,
  deploymentHistorySortKey,
  schemaVersionContentKey,
} from './config.js';
import { put as putDeploymentSnapshot, remove as removeDeploymentSnapshot } from './s3/deployment-snapshot.js';
import type {
  ActiveSnapshotItem,
  AppendDeploymentHistoryInput,
  DeploymentHistoryItem,
  CreateRollbackDeploymentInput,
  CreateDeploymentInput,
  DeployedSchemaArtifactRef,
  DeploymentCurrentItem,
  DeploymentEnvironment,
  DeploymentItem,
  UpsertActiveSnapshotInput,
} from './types.js';
import { normalizeRuntimeDeploymentEnvironment } from './types.js';

const ENVIRONMENTS: readonly DeploymentEnvironment[] = ['DEV', 'PREPROD', 'PROD'];

const TERMINAL_OPERATION_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'TIMED_OUT']);

export class DeploymentArtifactIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeploymentArtifactIntegrityError';
  }
}

export class ActiveSnapshotConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActiveSnapshotConflictError';
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

async function putRuntimeHistoryEvent(item: DeploymentHistoryItem): Promise<void> {
  await dynamoClient.send(
    new PutCommand({
      TableName: RUNTIME_TABLE_NAMES.deploymentHistory,
      Item: item,
    }),
  );
}

function isConditionalCheckFailed(error: unknown): boolean {
  const typed = error as { name?: string; Code?: string } | null | undefined;
  return typed?.name === 'ConditionalCheckFailedException' || typed?.Code === 'ConditionalCheckFailedException';
}

function toDeploymentCurrentItem(item: DeploymentItem): DeploymentCurrentItem {
  return {
    mappingIdEnvironment: deploymentCurrentKey(item.mappingId, item.environment),
    mappingId: item.mappingId,
    environment: item.environment,
    deployedAt: item.deployedAt,
    sourceType: item.sourceType,
    sourceNumber: item.sourceNumber,
    ...(item.artifactId ? { artifactId: item.artifactId } : {}),
    ...(item.artifactHash ? { artifactHash: item.artifactHash } : {}),
    configHash: item.configHash,
    configS3Key: item.configS3Key,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function normalizeSchemaRefsFromConfig(config: CreateDeploymentInput['config']): readonly DeployedSchemaArtifactRef[] {
  const refs: DeployedSchemaArtifactRef[] = [];

  const sourceRef = config.sourceSchemaRef;
  if (
    sourceRef
    && isNonEmptyString(sourceRef.schemaId)
    && isPositiveInteger(sourceRef.schemaVersion)
    && isNonEmptyString(sourceRef.schemaVersionId)
    && isNonEmptyString(sourceRef.contentHash)
  ) {
    refs.push({
      role: 'source',
      schemaId: sourceRef.schemaId,
      schemaVersion: sourceRef.schemaVersion,
      schemaVersionId: sourceRef.schemaVersionId,
      contentHash: sourceRef.contentHash,
      contentS3Key: schemaVersionContentKey(sourceRef.schemaId, sourceRef.schemaVersion),
    });
  }

  const targetRef = config.targetSchemaRef;
  if (
    targetRef
    && isNonEmptyString(targetRef.schemaId)
    && isPositiveInteger(targetRef.schemaVersion)
    && isNonEmptyString(targetRef.schemaVersionId)
    && isNonEmptyString(targetRef.contentHash)
  ) {
    refs.push({
      role: 'target',
      schemaId: targetRef.schemaId,
      schemaVersion: targetRef.schemaVersion,
      schemaVersionId: targetRef.schemaVersionId,
      contentHash: targetRef.contentHash,
      contentS3Key: schemaVersionContentKey(targetRef.schemaId, targetRef.schemaVersion),
    });
  }

  const enrichments = Array.isArray(config.enrichmentSources) ? config.enrichmentSources : [];
  for (const enrichment of enrichments) {
    if (
      !isNonEmptyString(enrichment.schemaId)
      || !isPositiveInteger(enrichment.schemaVersion)
      || !isNonEmptyString(enrichment.schemaVersionId)
      || !isNonEmptyString(enrichment.contentHash)
    ) {
      continue;
    }

    refs.push({
      role: 'enrichment',
      schemaId: enrichment.schemaId,
      schemaVersion: enrichment.schemaVersion,
      schemaVersionId: enrichment.schemaVersionId,
      contentHash: enrichment.contentHash,
      contentS3Key: schemaVersionContentKey(enrichment.schemaId, enrichment.schemaVersion),
      ...(isNonEmptyString(enrichment.alias) ? { alias: enrichment.alias } : {}),
    });
  }

  return refs;
}

export async function create(input: CreateDeploymentInput): Promise<DeploymentItem> {
  const deployedAt = nowIso();
  const configHash = await computeConfigHash(input.config);

  if (input.artifactHash && input.artifactHash !== configHash) {
    throw new DeploymentArtifactIntegrityError(
      `Artifact hash mismatch for mapping '${input.mappingId}' in ${input.environment}: provided=${input.artifactHash} computed=${configHash}`,
    );
  }

  const snapshotMetadata = {
    schemaRefs: normalizeSchemaRefsFromConfig(input.config),
    ...(input.cdmSchemaTraceability ? { cdmSchemaTraceability: input.cdmSchemaTraceability } : {}),
  };
  const configS3Key = await putDeploymentSnapshot(input.mappingId, input.environment, deployedAt, input.config, snapshotMetadata);

  const item: DeploymentItem = {
    mappingId: input.mappingId,
    environmentDeployedAt: deploymentHistorySortKey(input.environment, deployedAt),
    environment: input.environment,
    sourceType: input.sourceType,
    sourceNumber: input.sourceNumber,
    ...(input.artifactId ? { artifactId: input.artifactId } : {}),
    ...(input.artifactHash ? { artifactHash: input.artifactHash } : {}),
    configS3Key,
    configHash,
    deployedAt,
    deployedBy: input.deployedBy,
    rollbackEligible: true,
    rollbackEligibilityUpdatedAt: deployedAt,
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

export async function createRollback(input: CreateRollbackDeploymentInput): Promise<DeploymentItem> {
  const deployedAt = nowIso();

  const item: DeploymentItem = {
    mappingId: input.mappingId,
    environmentDeployedAt: deploymentHistorySortKey(input.environment, deployedAt),
    environment: input.environment,
    sourceType: input.sourceType,
    sourceNumber: input.sourceNumber,
    ...(input.artifactId ? { artifactId: input.artifactId } : {}),
    ...(input.artifactHash ? { artifactHash: input.artifactHash } : {}),
    configS3Key: input.configS3Key,
    configHash: input.configHash,
    deployedAt,
    deployedBy: input.deployedBy,
    rollbackEligible: true,
    rollbackEligibilityUpdatedAt: deployedAt,
    rollbackOf: input.rollbackOf,
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

  const found = (result.Item as DeploymentCurrentItem | undefined) ?? null;
  if (found) {
    return found;
  }

  // FS-081 legacy compatibility: PREPROD falls back to persisted QA key.
  if (environment !== 'PREPROD') {
    return null;
  }

  const legacy = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.deploymentCurrent,
      Key: {
        mappingIdEnvironment: deploymentCurrentKey(mappingId, 'QA'),
      },
    }),
  );

  return (legacy.Item as DeploymentCurrentItem | undefined) ?? null;
}

export async function getCurrentAll(mappingId: string): Promise<Record<DeploymentEnvironment, DeploymentCurrentItem | null>> {
  const entries = await Promise.all(ENVIRONMENTS.map((environment) => getCurrent(mappingId, environment)));

  return {
    DEV: entries[0] ?? null,
    PREPROD: entries[1] ?? null,
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

  // FS-081 legacy compatibility: PREPROD filter must include legacy persisted QA records.
  const needsLegacyPreprodFilter = environment === 'PREPROD';

  do {
    const expressionAttributeValues: Record<string, unknown> = {
      ':mappingId': mappingId,
    };

    let keyConditionExpression = 'mappingId = :mappingId';

    if (environment && !needsLegacyPreprodFilter) {
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
      const queriedItems = result.Items as DeploymentItem[];
      const normalized = needsLegacyPreprodFilter
        ? queriedItems.filter((item) => normalizeRuntimeDeploymentEnvironment(item.environment) === 'PREPROD')
        : queriedItems;

      items.push(...normalized);
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey && (limit === undefined || items.length < limit));

  if (typeof limit === 'number' && limit >= 0) {
    return items.slice(0, limit);
  }

  return items;
}

export interface RetentionCleanupTarget {
  readonly mappingId: string;
  readonly environment: DeploymentEnvironment;
}

export interface RetentionCleanupProtection {
  readonly activeArtifactId: string | null;
  readonly inProgressArtifactIds?: readonly string[];
  readonly rollbackWindowArtifactIds?: readonly string[];
  readonly promotionSourceArtifactIds?: readonly string[];
}

export interface RetentionCleanupSelectionInput {
  readonly mappingId: string;
  readonly environment: DeploymentEnvironment;
  readonly retainSuccessfulActivations: number;
  readonly protection: RetentionCleanupProtection;
}

export interface RetentionCleanupSelectionResult {
  readonly protectedItems: DeploymentItem[];
  readonly deleteCandidates: DeploymentItem[];
}

function normalizeIsoDate(item: DeploymentItem): string {
  if (isNonEmptyString(item.deployedAt)) {
    return item.deployedAt;
  }

  const separator = item.environmentDeployedAt.indexOf('#');
  return separator > -1 ? item.environmentDeployedAt.slice(separator + 1) : item.environmentDeployedAt;
}

function toArtifactSet(values: readonly (string | null | undefined)[]): Set<string> {
  const set = new Set<string>();

  for (const value of values) {
    if (!isNonEmptyString(value)) {
      continue;
    }

    set.add(value);
  }

  return set;
}

function toUniqueHistory(items: readonly DeploymentItem[]): DeploymentItem[] {
  const seen = new Set<string>();
  const rows: DeploymentItem[] = [];

  for (const item of items) {
    if (seen.has(item.environmentDeployedAt)) {
      continue;
    }

    seen.add(item.environmentDeployedAt);
    rows.push(item);
  }

  return rows;
}

export async function listRetentionCleanupTargets(): Promise<RetentionCleanupTarget[]> {
  const targets: RetentionCleanupTarget[] = [];
  const seen = new Set<string>();
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamoClient.send(
      new ScanCommand({
        TableName: TABLE_NAMES.deployments,
        ProjectionExpression: 'mappingId, #environment',
        ExpressionAttributeNames: {
          '#environment': 'environment',
        },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    for (const row of (result.Items as Array<{ mappingId?: unknown; environment?: unknown }> | undefined) ?? []) {
      if (!isNonEmptyString(row.mappingId) || !isNonEmptyString(row.environment)) {
        continue;
      }

      const normalized = normalizeRuntimeDeploymentEnvironment(row.environment);
      const key = `${row.mappingId}#${normalized}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      targets.push({
        mappingId: row.mappingId,
        environment: normalized,
      });
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return targets.sort((a, b) => `${a.mappingId}#${a.environment}`.localeCompare(`${b.mappingId}#${b.environment}`));
}

export async function listInProgressOperationArtifactIds(
  mappingId: string,
  environment: DeploymentEnvironment,
): Promise<string[]> {
  const artifactIds = new Set<string>();
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamoClient.send(
      new ScanCommand({
        TableName: TABLE_NAMES.deploymentOrchestrations,
        FilterExpression: 'attribute_exists(operationId) AND mappingId = :mappingId AND targetEnvironment = :targetEnvironment',
        ProjectionExpression: 'artifactId, operationStatus',
        ExpressionAttributeValues: {
          ':mappingId': mappingId,
          ':targetEnvironment': environment,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    for (const row of (result.Items as Array<{ artifactId?: unknown; operationStatus?: unknown }> | undefined) ?? []) {
      if (!isNonEmptyString(row.artifactId) || !isNonEmptyString(row.operationStatus)) {
        continue;
      }

      if (TERMINAL_OPERATION_STATUSES.has(row.operationStatus)) {
        continue;
      }

      artifactIds.add(row.artifactId);
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return [...artifactIds.values()].sort();
}

export async function selectRetentionCleanupCandidates(
  input: RetentionCleanupSelectionInput,
): Promise<RetentionCleanupSelectionResult> {
  const history = toUniqueHistory(await listHistory(input.mappingId, input.environment));
  const ordered = [...history].sort((a, b) => normalizeIsoDate(b).localeCompare(normalizeIsoDate(a)));
  const retainCount = Math.max(0, Math.floor(input.retainSuccessfulActivations));

  const protectedArtifactIds = toArtifactSet([
    input.protection.activeArtifactId,
    ...(input.protection.inProgressArtifactIds ?? []),
    ...(input.protection.rollbackWindowArtifactIds ?? []),
    ...(input.protection.promotionSourceArtifactIds ?? []),
  ]);

  const protectedItems: DeploymentItem[] = [];
  const deleteCandidates: DeploymentItem[] = [];

  for (const [index, item] of ordered.entries()) {
    const insideRetentionCount = index < retainCount;
    const protectedByArtifactReference = item.artifactId ? protectedArtifactIds.has(item.artifactId) : false;

    if (insideRetentionCount || protectedByArtifactReference) {
      protectedItems.push(item);
      continue;
    }

    deleteCandidates.push(item);
  }

  return {
    protectedItems,
    deleteCandidates,
  };
}

export async function updateRollbackEligibility(
  mappingId: string,
  environment: DeploymentEnvironment,
  rollbackEligibleArtifactIds: readonly string[],
): Promise<number> {
  const eligibleSet = toArtifactSet(rollbackEligibleArtifactIds);
  const history = toUniqueHistory(await listHistory(mappingId, environment));
  const updatedAt = nowIso();
  let updatedCount = 0;

  for (const item of history) {
    const expectedEligible = Boolean(item.artifactId && eligibleSet.has(item.artifactId));
    const currentEligible = item.rollbackEligible ?? true;
    if (currentEligible === expectedEligible) {
      continue;
    }

    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAMES.deployments,
        Key: {
          mappingId: item.mappingId,
          environmentDeployedAt: item.environmentDeployedAt,
        },
        UpdateExpression: 'SET rollbackEligible = :rollbackEligible, rollbackEligibilityUpdatedAt = :rollbackEligibilityUpdatedAt',
        ExpressionAttributeValues: {
          ':rollbackEligible': expectedEligible,
          ':rollbackEligibilityUpdatedAt': updatedAt,
        },
      }),
    );

    updatedCount += 1;
  }

  return updatedCount;
}

export async function deleteDeploymentHistoryEntries(items: readonly DeploymentItem[]): Promise<number> {
  let deleted = 0;

  for (const item of items) {
    if (isNonEmptyString(item.configS3Key)) {
      await removeDeploymentSnapshot(item.configS3Key);
    }

    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAMES.deployments,
        Key: {
          mappingId: item.mappingId,
          environmentDeployedAt: item.environmentDeployedAt,
        },
      }),
    );

    deleted += 1;
  }

  return deleted;
}

export async function upsertActiveSnapshot(input: UpsertActiveSnapshotInput): Promise<ActiveSnapshotItem> {
  const item: ActiveSnapshotItem = {
    mappingId: input.mappingId,
    activeSnapshotId: input.activeSnapshotId,
    snapshotHash: input.snapshotHash,
    activatedAt: nowIso(),
    activatedBy: input.activatedBy,
    sourceType: input.sourceType,
    sourceNumber: input.sourceNumber,
    ...(input.schemaBundleRef ? { schemaBundleRef: input.schemaBundleRef } : {}),
  };

  const commandInput: {
    TableName: string;
    Item: ActiveSnapshotItem;
    ConditionExpression?: string;
    ExpressionAttributeValues?: Record<string, unknown>;
  } = {
    TableName: RUNTIME_TABLE_NAMES.activeSnapshots,
    Item: item,
  };

  if (Object.hasOwn(input, 'expectedCurrentSnapshotId')) {
    if (input.expectedCurrentSnapshotId === null) {
      commandInput.ConditionExpression = 'attribute_not_exists(mappingId)';
    } else if (typeof input.expectedCurrentSnapshotId === 'string' && input.expectedCurrentSnapshotId.trim() !== '') {
      commandInput.ConditionExpression = 'activeSnapshotId = :expectedSnapshotId';
      commandInput.ExpressionAttributeValues = {
        ':expectedSnapshotId': input.expectedCurrentSnapshotId,
      };
    }
  }

  try {
    await dynamoClient.send(new PutCommand(commandInput));
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      throw new ActiveSnapshotConflictError(
        `Active snapshot conditional update failed for mapping '${input.mappingId}'`,
      );
    }

    throw error;
  }

  return item;
}

export async function getActiveSnapshot(mappingId: string): Promise<ActiveSnapshotItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: RUNTIME_TABLE_NAMES.activeSnapshots,
      Key: { mappingId },
    }),
  );

  return (result.Item as ActiveSnapshotItem | undefined) ?? null;
}

export async function appendDeploymentHistory(input: AppendDeploymentHistoryInput): Promise<DeploymentHistoryItem> {
  const item: DeploymentHistoryItem = {
    mappingId: input.mappingId,
    eventAt: input.eventAt ?? nowIso(),
    eventType: input.eventType,
    snapshotId: input.snapshotId,
    snapshotHash: input.snapshotHash,
    requestedBy: input.requestedBy,
    sourceType: input.sourceType,
    sourceNumber: input.sourceNumber,
    ...(input.rollbackOf ? { rollbackOf: input.rollbackOf } : {}),
    requestId: input.requestId,
  };

  await putRuntimeHistoryEvent(item);
  return item;
}

export async function listDeploymentHistory(mappingId: string, limit?: number): Promise<DeploymentHistoryItem[]> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: RUNTIME_TABLE_NAMES.deploymentHistory,
      KeyConditionExpression: 'mappingId = :mappingId',
      ExpressionAttributeValues: {
        ':mappingId': mappingId,
      },
      ScanIndexForward: false,
      ...(typeof limit === 'number' ? { Limit: limit } : {}),
    }),
  );

  return (result.Items as DeploymentHistoryItem[] | undefined) ?? [];
}

export const deployments = {
  create,
  createRollback,
  getCurrent,
  getCurrentAll,
  listHistory,
  listRetentionCleanupTargets,
  listInProgressOperationArtifactIds,
  selectRetentionCleanupCandidates,
  updateRollbackEligibility,
  deleteDeploymentHistoryEntries,
  upsertActiveSnapshot,
  getActiveSnapshot,
  appendDeploymentHistory,
  listDeploymentHistory,
};
