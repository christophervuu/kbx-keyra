// ---------------------------------------------------------------------------
// CDM Sync Activity Logger (FS-077 T-05)
//
// Records the outcome of each CDM re-sync operation in a dedicated
// SynchronousActivity DynamoDB table for observability and audit.
// ---------------------------------------------------------------------------

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

import type { CdmReSyncStatus, SyncActivityItem } from './types.js';

type DynamoSender = Pick<DynamoDBDocumentClient, 'send'>;

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SYNC_ACTIVITY_TABLE = getEnvValue('SYNC_ACTIVITY_TABLE');

const dynamoClient: DynamoSender = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type SyncActivityErrorCode = 'SYNC_ACTIVITY_CONFIG_ERROR' | 'SYNC_ACTIVITY_PUT_ERROR';

export class SyncActivityError extends Error {
  constructor(
    public readonly code: SyncActivityErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SyncActivityError';
  }
}

function getTableOrThrow(): string {
  const table = SYNC_ACTIVITY_TABLE?.trim();
  if (!table) {
    throw new SyncActivityError(
      'SYNC_ACTIVITY_CONFIG_ERROR',
      'Missing required environment variable: SYNC_ACTIVITY_TABLE',
    );
  }

  return table;
}

export interface LogSyncActivityInput {
  readonly schemaId: string;
  readonly outcome: CdmReSyncStatus;
  readonly previousCommitSha?: string;
  readonly currentCommitSha?: string;
  readonly reason?: string;
  readonly diffSummary?: { readonly added: readonly string[]; readonly removed: readonly string[]; readonly modified: readonly string[] };
}

/**
 * Write a sync activity entry to the SyncActivity table.
 *
 * The entry is best-effort: callers should not fail the sync operation if
 * activity logging fails.
 */
export async function logSyncActivity(input: LogSyncActivityInput): Promise<void> {
  const table = getTableOrThrow();
  const now = new Date().toISOString();

  const item: SyncActivityItem = {
    schemaId: input.schemaId,
    timestamp: now,
    outcome: input.outcome,
    previousCommitSha: input.previousCommitSha,
    currentCommitSha: input.currentCommitSha,
    reason: input.reason,
    addedCount: input.diffSummary?.added.length,
    removedCount: input.diffSummary?.removed.length,
    modifiedCount: input.diffSummary?.modified.length,
  };

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: table,
        Item: item,
      }),
    );
  } catch (error) {
    throw new SyncActivityError(
      'SYNC_ACTIVITY_PUT_ERROR',
      `Failed to log sync activity for schemaId '${input.schemaId}'`,
      error,
    );
  }
}
