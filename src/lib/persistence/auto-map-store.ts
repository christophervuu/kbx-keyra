import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES } from './config.js';
import {
  buildInsertIfAbsentConditionExpression,
  buildRunNotSupersededCondition,
  buildSessionNotSupersededCondition,
  runSk,
  sessionMetaSk,
  sessionPk,
  workUnitSk,
  type AutoMapRunItem,
  type AutoMapRunStatus,
  type AutoMapSessionItem,
  type AutoMapSessionStatus,
  type AutoMapSuggestionItem,
  type AutoMapWorkUnitItem,
  type AutoMapWorkUnitStatus,
} from './auto-map.js';

function tableName(): string {
  return TABLE_NAMES.autoMap;
}

export async function putAutoMapSession(item: AutoMapSessionItem): Promise<void> {
  await dynamoClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: item,
    }),
  );
}

export async function getAutoMapSession(sessionId: string): Promise<AutoMapSessionItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: tableName(),
      Key: {
        PK: sessionPk(sessionId),
        SK: sessionMetaSk(),
      },
    }),
  );

  return (result.Item as AutoMapSessionItem | undefined) ?? null;
}

export async function listOpenSessionsByMapping(mappingId: string): Promise<AutoMapSessionItem[]> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `MAPPING#${mappingId}`,
      },
      ScanIndexForward: false,
    }),
  );

  return (result.Items as AutoMapSessionItem[] | undefined) ?? [];
}

export async function supersedeSession(sessionId: string, updatedAt: string): Promise<void> {
  await dynamoClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: {
        PK: sessionPk(sessionId),
        SK: sessionMetaSk(),
      },
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt REMOVE GSI2PK, GSI2SK',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': 'superseded',
        ':updatedAt': updatedAt,
      },
    }),
  );
}

export async function updateSessionRunPointer(sessionId: string, runId: string, updatedAt: string): Promise<void> {
  const existing = await getAutoMapSession(sessionId);
  if (!existing) {
    return;
  }

  await dynamoClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: {
        PK: sessionPk(sessionId),
        SK: sessionMetaSk(),
      },
      UpdateExpression:
        'SET #lastRunId = :runId, #updatedAt = :updatedAt, #status = :status, GSI2PK = :gsi2pk, GSI2SK = :gsi2sk',
      ExpressionAttributeNames: {
        '#lastRunId': 'lastRunId',
        '#updatedAt': 'updatedAt',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':runId': runId,
        ':updatedAt': updatedAt,
        ':status': 'generating',
        ':gsi2pk': `MAPPING#${existing.mappingId}`,
        ':gsi2sk': `OPEN#${updatedAt}#${sessionId}`,
      },
    }),
  );
}

export async function putAutoMapRun(item: AutoMapRunItem): Promise<void> {
  await dynamoClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: item,
    }),
  );
}

export async function putAutoMapRunIfAbsent(item: AutoMapRunItem): Promise<void> {
  const condition = buildInsertIfAbsentConditionExpression();
  await dynamoClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: item,
      ...condition,
    }),
  );
}

export async function listAutoMapRuns(sessionId: string): Promise<AutoMapRunItem[]> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :runPrefix)',
      ExpressionAttributeValues: {
        ':pk': `SESSION#${sessionId}`,
        ':runPrefix': 'RUN#',
      },
      ScanIndexForward: false,
    }),
  );

  return (result.Items as AutoMapRunItem[] | undefined) ?? [];
}

export async function getAutoMapRun(sessionId: string, runId: string): Promise<AutoMapRunItem | null> {
  const runs = await listAutoMapRuns(sessionId);
  return runs.find((run) => run.runId === runId) ?? null;
}

export async function updateAutoMapRunStatus(input: {
  readonly sessionId: string;
  readonly runId: string;
  readonly fromCreatedAt: string;
  readonly status: AutoMapRunStatus;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly failure?: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
}): Promise<void> {
  const condition = buildSessionNotSupersededCondition('sessionStatus');
  const names: Record<string, string> = {
    '#status': 'status',
    '#updatedAt': 'updatedAt',
    '#sessionStatus': condition.ExpressionAttributeNames['#sessionStatus'] as string,
  };
  const values: Record<string, unknown> = {
    ':status': input.status,
    ':updatedAt': input.updatedAt,
    ...condition.ExpressionAttributeValues,
  };

  const setParts = ['#status = :status', '#updatedAt = :updatedAt'];
  if (input.startedAt) {
    names['#startedAt'] = 'startedAt';
    values[':startedAt'] = input.startedAt;
    setParts.push('#startedAt = :startedAt');
  }

  if (input.completedAt) {
    names['#completedAt'] = 'completedAt';
    values[':completedAt'] = input.completedAt;
    setParts.push('#completedAt = :completedAt');
  }

  if (input.failure) {
    names['#failure'] = 'failure';
    values[':failure'] = input.failure;
    setParts.push('#failure = :failure');
  }

  await dynamoClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: {
        PK: sessionPk(input.sessionId),
        SK: runSk(input.fromCreatedAt, input.runId),
      },
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ConditionExpression: condition.ConditionExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export async function updateAutoMapRunProgress(input: {
  readonly sessionId: string;
  readonly runId: string;
  readonly fromCreatedAt: string;
  readonly progress: AutoMapRunItem['progress'];
  readonly counts: AutoMapRunItem['counts'];
  readonly updatedAt: string;
}): Promise<void> {
  const condition = buildSessionNotSupersededCondition('sessionStatus');
  await dynamoClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: {
        PK: sessionPk(input.sessionId),
        SK: runSk(input.fromCreatedAt, input.runId),
      },
      UpdateExpression: 'SET #progress = :progress, #counts = :counts, #updatedAt = :updatedAt',
      ConditionExpression: condition.ConditionExpression,
      ExpressionAttributeNames: {
        '#progress': 'progress',
        '#counts': 'counts',
        '#updatedAt': 'updatedAt',
        '#sessionStatus': condition.ExpressionAttributeNames['#sessionStatus'] as string,
      },
      ExpressionAttributeValues: {
        ':progress': input.progress,
        ':counts': input.counts,
        ':updatedAt': input.updatedAt,
        ...condition.ExpressionAttributeValues,
      },
    }),
  );
}

export async function listAutoMapSuggestions(sessionId: string): Promise<AutoMapSuggestionItem[]> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :suggestionPrefix)',
      ExpressionAttributeValues: {
        ':pk': `SESSION#${sessionId}`,
        ':suggestionPrefix': 'SUGGESTION#',
      },
      ScanIndexForward: true,
    }),
  );

  return (result.Items as AutoMapSuggestionItem[] | undefined) ?? [];
}

export async function getAutoMapSuggestion(
  sessionId: string,
  suggestionId: string,
): Promise<AutoMapSuggestionItem | null> {
  const suggestions = await listAutoMapSuggestions(sessionId);
  return suggestions.find((suggestion) => suggestion.suggestionId === suggestionId) ?? null;
}

export async function putAutoMapSuggestion(item: AutoMapSuggestionItem): Promise<void> {
  await dynamoClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: item,
    }),
  );
}

export async function putAutoMapSuggestions(items: readonly AutoMapSuggestionItem[]): Promise<void> {
  for (const item of items) {
    await putAutoMapSuggestion(item);
  }
}

export async function putAutoMapWorkUnit(item: AutoMapWorkUnitItem): Promise<void> {
  await dynamoClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: item,
    }),
  );
}

export async function putAutoMapWorkUnitIfAbsent(item: AutoMapWorkUnitItem): Promise<void> {
  const condition = buildInsertIfAbsentConditionExpression();
  await dynamoClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: item,
      ...condition,
    }),
  );
}

export async function listAutoMapWorkUnits(sessionId: string, runId: string): Promise<AutoMapWorkUnitItem[]> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :workUnitPrefix)',
      ExpressionAttributeValues: {
        ':pk': `SESSION#${sessionId}`,
        ':workUnitPrefix': `WORK_UNIT#${runId}#`,
      },
      ScanIndexForward: true,
    }),
  );

  return (result.Items as AutoMapWorkUnitItem[] | undefined) ?? [];
}

export async function updateAutoMapWorkUnitStatus(input: {
  readonly sessionId: string;
  readonly runId: string;
  readonly order: number;
  readonly workUnitId: string;
  readonly status: AutoMapWorkUnitStatus;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly generatedSuggestions?: number;
  readonly failedTargets?: number;
  readonly outcome?: AutoMapWorkUnitItem['outcome'];
  readonly failure?: AutoMapWorkUnitItem['failure'];
}): Promise<void> {
  const condition = buildRunNotSupersededCondition('runStatus', 'sessionStatus');

  const names: Record<string, string> = {
    '#status': 'status',
    '#updatedAt': 'updatedAt',
    '#runStatus': condition.ExpressionAttributeNames['#runStatus'] as string,
    '#sessionStatus': condition.ExpressionAttributeNames['#sessionStatus'] as string,
  };
  const values: Record<string, unknown> = {
    ':status': input.status,
    ':updatedAt': input.updatedAt,
    ...condition.ExpressionAttributeValues,
  };
  const setParts = ['#status = :status', '#updatedAt = :updatedAt'];

  if (input.startedAt) {
    names['#startedAt'] = 'startedAt';
    values[':startedAt'] = input.startedAt;
    setParts.push('#startedAt = :startedAt');
  }

  if (input.completedAt) {
    names['#completedAt'] = 'completedAt';
    values[':completedAt'] = input.completedAt;
    setParts.push('#completedAt = :completedAt');
  }

  if (typeof input.generatedSuggestions === 'number') {
    names['#generatedSuggestions'] = 'generatedSuggestions';
    values[':generatedSuggestions'] = input.generatedSuggestions;
    setParts.push('#generatedSuggestions = :generatedSuggestions');
  }

  if (typeof input.failedTargets === 'number') {
    names['#failedTargets'] = 'failedTargets';
    values[':failedTargets'] = input.failedTargets;
    setParts.push('#failedTargets = :failedTargets');
  }

  if (input.outcome) {
    names['#outcome'] = 'outcome';
    values[':outcome'] = input.outcome;
    setParts.push('#outcome = :outcome');
  }

  if (input.failure) {
    names['#failure'] = 'failure';
    values[':failure'] = input.failure;
    setParts.push('#failure = :failure');
  }

  await dynamoClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: {
        PK: sessionPk(input.sessionId),
        SK: workUnitSk(input.runId, input.order, input.workUnitId),
      },
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ConditionExpression: condition.ConditionExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export async function updateAutoMapSessionSummary(input: {
  readonly sessionId: string;
  readonly status: AutoMapSessionStatus;
  readonly updatedAt: string;
  readonly reviewCounts: AutoMapSessionItem['reviewCounts'];
  readonly completedAt?: string;
  readonly clearOpenSessionIndex?: boolean;
}): Promise<void> {
  const condition = buildSessionNotSupersededCondition('status');

  const names: Record<string, string> = {
    '#status': 'status',
    '#updatedAt': 'updatedAt',
    '#reviewCounts': 'reviewCounts',
    ...condition.ExpressionAttributeNames,
  };
  const values: Record<string, unknown> = {
    ':status': input.status,
    ':updatedAt': input.updatedAt,
    ':reviewCounts': input.reviewCounts,
    ...condition.ExpressionAttributeValues,
  };

  const setParts = ['#status = :status', '#updatedAt = :updatedAt', '#reviewCounts = :reviewCounts'];
  const removeParts: string[] = [];

  if (input.completedAt) {
    names['#completedAt'] = 'completedAt';
    values[':completedAt'] = input.completedAt;
    setParts.push('#completedAt = :completedAt');
  }

  if (input.clearOpenSessionIndex) {
    removeParts.push('GSI2PK', 'GSI2SK');
  }

  const removeExpression = removeParts.length > 0 ? ` REMOVE ${removeParts.join(', ')}` : '';

  await dynamoClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: {
        PK: sessionPk(input.sessionId),
        SK: sessionMetaSk(),
      },
      UpdateExpression: `SET ${setParts.join(', ')}${removeExpression}`,
      ConditionExpression: condition.ConditionExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}
