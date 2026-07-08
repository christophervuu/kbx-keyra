import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES } from './config.js';
import type {
  DeploymentAttentionState,
  DeploymentEnvironment,
  DeploymentOperationStatus,
  DeploymentPromotionState,
  DeploymentSummaryEnvironmentState,
  DeploymentSummaryItem,
  InitializeDeploymentSummaryInput,
  UpsertDeploymentSummaryInput,
} from './types.js';

const GLOBAL_PARTITION: DeploymentSummaryItem['globalPartition'] = 'GLOBAL';
const DEFAULT_ACTOR_ID = 'development:system';

function nowIso(): string {
  return new Date().toISOString();
}

function defaultEnvironmentState(): DeploymentSummaryEnvironmentState {
  return {
    activeArtifactId: null,
    activeVersion: null,
    freshness: 'NOT_DEPLOYED',
    lastOperationStatus: null,
  };
}

function computeAttentionState(item: DeploymentSummaryItem): DeploymentAttentionState {
  const statuses: Array<DeploymentOperationStatus | null> = [
    item.devLastOperationStatus,
    item.preprodLastOperationStatus,
    item.prodLastOperationStatus,
  ];

  return statuses.some((status) => status === 'FAILED' || status === 'TIMED_OUT')
    ? 'NEEDS_ATTENTION'
    : 'OK';
}

function hasActiveArtifact(item: DeploymentSummaryItem, environment: DeploymentEnvironment): boolean {
  if (environment === 'DEV') {
    return !!item.devActiveArtifactId;
  }

  if (environment === 'PREPROD') {
    return !!item.preprodActiveArtifactId;
  }

  return !!item.prodActiveArtifactId;
}

function computePromotionState(item: DeploymentSummaryItem): DeploymentPromotionState {
  if (!hasActiveArtifact(item, 'DEV')) {
    return 'NOT_APPLICABLE';
  }

  const devAlignedToPreprod = item.devActiveArtifactId !== null
    && item.preprodActiveArtifactId !== null
    && item.devActiveArtifactId === item.preprodActiveArtifactId;
  const preprodAlignedToProd = item.preprodActiveArtifactId !== null
    && item.prodActiveArtifactId !== null
    && item.preprodActiveArtifactId === item.prodActiveArtifactId;

  if (devAlignedToPreprod && preprodAlignedToProd) {
    return 'ALIGNED';
  }

  return 'AVAILABLE';
}

function mergeEnvironmentState(
  existing: DeploymentSummaryEnvironmentState,
  patch: Partial<DeploymentSummaryEnvironmentState> | undefined,
): DeploymentSummaryEnvironmentState {
  if (!patch) {
    return existing;
  }

  return {
    activeArtifactId: patch.activeArtifactId !== undefined ? patch.activeArtifactId : existing.activeArtifactId,
    activeVersion: patch.activeVersion !== undefined ? patch.activeVersion : existing.activeVersion,
    freshness: patch.freshness !== undefined ? patch.freshness : existing.freshness,
    lastOperationStatus: patch.lastOperationStatus !== undefined ? patch.lastOperationStatus : existing.lastOperationStatus,
  };
}

function fromItemEnvironmentState(item: DeploymentSummaryItem, environment: DeploymentEnvironment): DeploymentSummaryEnvironmentState {
  if (environment === 'DEV') {
    return {
      activeArtifactId: item.devActiveArtifactId,
      activeVersion: item.devActiveVersion,
      freshness: item.devFreshness,
      lastOperationStatus: item.devLastOperationStatus,
    };
  }

  if (environment === 'PREPROD') {
    return {
      activeArtifactId: item.preprodActiveArtifactId,
      activeVersion: item.preprodActiveVersion,
      freshness: item.preprodFreshness,
      lastOperationStatus: item.preprodLastOperationStatus,
    };
  }

  return {
    activeArtifactId: item.prodActiveArtifactId,
    activeVersion: item.prodActiveVersion,
    freshness: item.prodFreshness,
    lastOperationStatus: item.prodLastOperationStatus,
  };
}

function withEnvironmentState(
  item: DeploymentSummaryItem,
  environment: DeploymentEnvironment,
  state: DeploymentSummaryEnvironmentState,
): DeploymentSummaryItem {
  if (environment === 'DEV') {
    return {
      ...item,
      devActiveArtifactId: state.activeArtifactId,
      devActiveVersion: state.activeVersion,
      devFreshness: state.freshness,
      devLastOperationStatus: state.lastOperationStatus,
    };
  }

  if (environment === 'PREPROD') {
    return {
      ...item,
      preprodActiveArtifactId: state.activeArtifactId,
      preprodActiveVersion: state.activeVersion,
      preprodFreshness: state.freshness,
      preprodLastOperationStatus: state.lastOperationStatus,
    };
  }

  return {
    ...item,
    prodActiveArtifactId: state.activeArtifactId,
    prodActiveVersion: state.activeVersion,
    prodFreshness: state.freshness,
    prodLastOperationStatus: state.lastOperationStatus,
  };
}

function createInitialItem(input: InitializeDeploymentSummaryInput): DeploymentSummaryItem {
  const timestamp = input.occurredAt ?? nowIso();
  const envState = defaultEnvironmentState();

  return {
    mappingId: input.mappingId,
    globalPartition: GLOBAL_PARTITION,
    projectId: input.projectId,
    projectName: input.projectName ?? '',
    mappingName: input.mappingName,
    latestVersion: input.latestVersion ?? null,
    latestVersionCreatedAt: input.latestVersionCreatedAt ?? null,

    devActiveArtifactId: envState.activeArtifactId,
    devActiveVersion: envState.activeVersion,
    devFreshness: envState.freshness,
    devLastOperationStatus: envState.lastOperationStatus,

    preprodActiveArtifactId: envState.activeArtifactId,
    preprodActiveVersion: envState.activeVersion,
    preprodFreshness: envState.freshness,
    preprodLastOperationStatus: envState.lastOperationStatus,

    prodActiveArtifactId: envState.activeArtifactId,
    prodActiveVersion: envState.activeVersion,
    prodFreshness: envState.freshness,
    prodLastOperationStatus: envState.lastOperationStatus,

    promotionState: 'NOT_APPLICABLE',
    attentionState: 'OK',
    activeOperationId: null,
    lastActivityAt: timestamp,
    lastActorId: input.actorId ?? DEFAULT_ACTOR_ID,
    ...(input.actorDisplayName ? { lastActorDisplayName: input.actorDisplayName } : {}),
    updatedAt: timestamp,
  };
}

function normalizeFreshness(item: DeploymentSummaryItem): DeploymentSummaryItem {
  const highest = item.latestVersion ?? null;

  const normalize = (state: DeploymentSummaryEnvironmentState): DeploymentSummaryEnvironmentState => {
    if (state.activeVersion === null || state.activeArtifactId === null) {
      return {
        ...state,
        freshness: 'NOT_DEPLOYED',
      };
    }

    if (highest !== null && state.activeVersion < highest) {
      return {
        ...state,
        freshness: 'STALE',
      };
    }

    return {
      ...state,
      freshness: 'CURRENT',
    };
  };

  return {
    ...withEnvironmentState(
      withEnvironmentState(
        withEnvironmentState(item, 'DEV', normalize(fromItemEnvironmentState(item, 'DEV'))),
        'PREPROD',
        normalize(fromItemEnvironmentState(item, 'PREPROD')),
      ),
      'PROD',
      normalize(fromItemEnvironmentState(item, 'PROD')),
    ),
  };
}

function mergeSummary(existing: DeploymentSummaryItem, input: UpsertDeploymentSummaryInput): DeploymentSummaryItem {
  const timestamp = input.occurredAt ?? nowIso();
  const projectId = input.projectId ?? existing.projectId;
  const projectName = input.projectName ?? existing.projectName;
  const mappingName = input.mappingName ?? existing.mappingName;

  let merged: DeploymentSummaryItem = {
    ...existing,
    projectId,
    projectName,
    mappingName,
    latestVersion: input.latestVersion !== undefined ? input.latestVersion : existing.latestVersion,
    latestVersionCreatedAt:
      input.latestVersionCreatedAt !== undefined ? input.latestVersionCreatedAt : existing.latestVersionCreatedAt,
    activeOperationId:
      input.activeOperationId !== undefined ? input.activeOperationId : existing.activeOperationId,
    lastActivityAt: timestamp,
    lastActorId: input.actorId ?? existing.lastActorId,
    ...(input.actorDisplayName !== undefined
      ? (input.actorDisplayName ? { lastActorDisplayName: input.actorDisplayName } : {})
      : (existing.lastActorDisplayName ? { lastActorDisplayName: existing.lastActorDisplayName } : {})),
    updatedAt: nowIso(),
  };

  const patch = input.environmentStates;
  if (patch) {
    const dev = mergeEnvironmentState(fromItemEnvironmentState(merged, 'DEV'), patch.DEV);
    const preprod = mergeEnvironmentState(fromItemEnvironmentState(merged, 'PREPROD'), patch.PREPROD);
    const prod = mergeEnvironmentState(fromItemEnvironmentState(merged, 'PROD'), patch.PROD);
    merged = withEnvironmentState(withEnvironmentState(withEnvironmentState(merged, 'DEV', dev), 'PREPROD', preprod), 'PROD', prod);
  }

  if (input.operationStatus !== undefined && input.operationStatus !== null) {
    if (input.environmentStates?.DEV) {
      merged = withEnvironmentState(merged, 'DEV', {
        ...fromItemEnvironmentState(merged, 'DEV'),
        lastOperationStatus: input.operationStatus,
      });
    }
    if (input.environmentStates?.PREPROD) {
      merged = withEnvironmentState(merged, 'PREPROD', {
        ...fromItemEnvironmentState(merged, 'PREPROD'),
        lastOperationStatus: input.operationStatus,
      });
    }
    if (input.environmentStates?.PROD) {
      merged = withEnvironmentState(merged, 'PROD', {
        ...fromItemEnvironmentState(merged, 'PROD'),
        lastOperationStatus: input.operationStatus,
      });
    }
  }

  const freshnessNormalized = normalizeFreshness(merged);
  const promotionState = computePromotionState(freshnessNormalized);
  const attentionState = computeAttentionState(freshnessNormalized);

  return {
    ...freshnessNormalized,
    promotionState,
    attentionState,
  };
}

export async function get(mappingId: string): Promise<DeploymentSummaryItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.deploymentSummaries,
      Key: { mappingId },
    }),
  );

  return (result.Item as DeploymentSummaryItem | undefined) ?? null;
}

export async function initialize(input: InitializeDeploymentSummaryInput): Promise<DeploymentSummaryItem> {
  const item = createInitialItem(input);

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.deploymentSummaries,
      Item: item,
    }),
  );

  return item;
}

export async function upsert(input: UpsertDeploymentSummaryInput): Promise<DeploymentSummaryItem> {
  const existing = await get(input.mappingId);

  if (!existing) {
    if (!input.projectId || !input.mappingName) {
      throw new Error('DeploymentSummary upsert requires projectId and mappingName for first write.');
    }

    const initialized = createInitialItem({
      mappingId: input.mappingId,
      projectId: input.projectId,
      projectName: input.projectName,
      mappingName: input.mappingName,
      latestVersion: input.latestVersion,
      latestVersionCreatedAt: input.latestVersionCreatedAt,
      actorId: input.actorId,
      actorDisplayName: input.actorDisplayName,
      occurredAt: input.occurredAt,
    });

    const merged = mergeSummary(initialized, input);
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAMES.deploymentSummaries,
        Item: merged,
      }),
    );

    return merged;
  }

  if (!input.projectId && !existing.projectId) {
    throw new Error('DeploymentSummary upsert requires projectId.');
  }

  const merged = mergeSummary(existing, {
    ...input,
    projectId: input.projectId ?? existing.projectId,
  });
  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.deploymentSummaries,
      Item: merged,
    }),
  );

  return merged;
}

export async function remove(mappingId: string): Promise<void> {
  await dynamoClient.send(
    new DeleteCommand({
      TableName: TABLE_NAMES.deploymentSummaries,
      Key: { mappingId },
    }),
  );
}

interface ListByIndexInput {
  readonly indexName: 'GlobalActivityIndex' | 'ProjectActivityIndex' | 'AttentionIndex';
  readonly keyConditionExpression: string;
  readonly expressionAttributeNames: Record<string, string>;
  readonly expressionAttributeValues: Record<string, unknown>;
}

async function listByIndexAll(input: ListByIndexInput): Promise<DeploymentSummaryItem[]> {
  const rows: DeploymentSummaryItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAMES.deploymentSummaries,
        IndexName: input.indexName,
        KeyConditionExpression: input.keyConditionExpression,
        ExpressionAttributeNames: input.expressionAttributeNames,
        ExpressionAttributeValues: input.expressionAttributeValues,
        ScanIndexForward: false,
        ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
      }),
    );

    rows.push(...((result.Items as DeploymentSummaryItem[] | undefined) ?? []));
    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return rows;
}

export async function listGlobal(): Promise<DeploymentSummaryItem[]> {
  return listByIndexAll({
    indexName: 'GlobalActivityIndex',
    keyConditionExpression: '#globalPartition = :globalPartition',
    expressionAttributeNames: {
      '#globalPartition': 'globalPartition',
    },
    expressionAttributeValues: {
      ':globalPartition': GLOBAL_PARTITION,
    },
  });
}

export async function listByProject(projectId: string): Promise<DeploymentSummaryItem[]> {
  return listByIndexAll({
    indexName: 'ProjectActivityIndex',
    keyConditionExpression: '#projectId = :projectId',
    expressionAttributeNames: {
      '#projectId': 'projectId',
    },
    expressionAttributeValues: {
      ':projectId': projectId,
    },
  });
}

export async function listByAttention(attentionState: DeploymentAttentionState): Promise<DeploymentSummaryItem[]> {
  return listByIndexAll({
    indexName: 'AttentionIndex',
    keyConditionExpression: '#attentionState = :attentionState',
    expressionAttributeNames: {
      '#attentionState': 'attentionState',
    },
    expressionAttributeValues: {
      ':attentionState': attentionState,
    },
  });
}

export const deploymentSummaries = {
  get,
  initialize,
  upsert,
  remove,
  listGlobal,
  listByProject,
  listByAttention,
};
