import { DeleteCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES } from './config.js';
import type {
  CreateSchemaMetadataInput,
  SchemaIngestStatus,
  SchemaMetadataItem,
  SchemaReviewIssueCode,
  SchemaReviewIssueSummary,
  SchemaReviewState,
} from './types.js';
import { normalizeSchemaOrigin } from './types.js';
import { normalizeSchemaOwnership, normalizeSchemaSourceKind } from './types.js';
import { normalizeSchemaReviewState } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function createSchemaId(): string {
  return crypto.randomUUID();
}

export async function create(input: CreateSchemaMetadataInput): Promise<SchemaMetadataItem> {
  const timestamp = nowIso();
  const inferred = input.inferred ?? false;
  const samplePayloads = input.samplePayloads;
  const samplePayloadCount = input.samplePayloadCount ?? samplePayloads?.length;
  const review = aggregateReviewIssues({
    inferred,
    reviewedAt: input.reviewedAt,
    reviewState: input.reviewState,
    inferenceIssueCounts: input.inferenceIssueCounts,
  });
  const projectedSourceRepoId =
    input.source.type === 'github' && typeof input.source.repoId === 'number'
      ? input.source.repoId
      : undefined;

  const item: SchemaMetadataItem = {
    schemaId: createSchemaId(),
    name: input.name,
    format: input.format,
    fieldCount: input.fieldCount,
    origin: normalizeSchemaOrigin(input.origin),
    status: input.status ?? 'ingesting',
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    description: input.description,
    inferred,
    reviewState: review.reviewState,
    ...(review.reviewIssues.length > 0 ? { reviewIssues: review.reviewIssues } : {}),
    ...(input.inferenceIssueCounts !== undefined ? { inferenceIssueCounts: input.inferenceIssueCounts } : {}),
    sourceKind: normalizeSchemaSourceKind({
      sourceKind: input.sourceKind,
      format: input.format,
      inferred,
    }),
    ownership: normalizeSchemaOwnership({
      ownership: input.ownership,
      origin: input.origin,
    }),
    readonly: input.readonly,
    reviewedAt: input.reviewedAt,
    reviewedBy: input.reviewedBy,
    ...(samplePayloadCount !== undefined ? { samplePayloadCount } : {}),
    ...(samplePayloads !== undefined ? { samplePayloads } : {}),
    disambiguator: input.disambiguator,
    syncStatus: input.syncStatus ?? 'not-synced',
    source: input.source,
    sourceRepoId: projectedSourceRepoId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.schemaMetadata,
      Item: item,
    }),
  );

  return item;
}

export async function get(schemaId: string): Promise<SchemaMetadataItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.schemaMetadata,
      Key: {
        schemaId,
      },
    }),
  );

  return (result.Item as SchemaMetadataItem | undefined) ?? null;
}

export async function list(): Promise<SchemaMetadataItem[]> {
  const result = await dynamoClient.send(
    new ScanCommand({
      TableName: TABLE_NAMES.schemaMetadata,
    }),
  );

  return (result.Items as SchemaMetadataItem[] | undefined) ?? [];
}

export async function updateStatus(
  schemaId: string,
  status: SchemaIngestStatus,
  fieldCount?: number,
): Promise<SchemaMetadataItem> {
  const names: Record<string, string> = {
    '#status': 'status',
    '#updatedAt': 'updatedAt',
  };
  const values: Record<string, unknown> = {
    ':status': status,
    ':updatedAt': nowIso(),
  };

  const updates: string[] = ['#status = :status', '#updatedAt = :updatedAt'];

  if (fieldCount !== undefined) {
    names['#fieldCount'] = 'fieldCount';
    values[':fieldCount'] = fieldCount;
    updates.push('#fieldCount = :fieldCount');
  }

  const result = await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.schemaMetadata,
      Key: {
        schemaId,
      },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }),
  );

  return result.Attributes as SchemaMetadataItem;
}

const REVIEW_ISSUE_CODES: readonly SchemaReviewIssueCode[] = [
  'low_sample_evidence',
  'type_ambiguity_conflict',
  'optionality_uncertainty',
  'empty_shape_unknown',
  'field_name_quality',
  'missing_description',
] as const;

function toIssueSummary(
  counts: Readonly<Record<SchemaReviewIssueCode, number>>,
): readonly SchemaReviewIssueSummary[] {
  return REVIEW_ISSUE_CODES.map((code) => ({
    code,
    count: counts[code] ?? 0,
    blocking: false,
  })).filter((entry) => entry.count > 0);
}

export function aggregateReviewIssues(input: {
  inferred?: boolean;
  reviewedAt?: string;
  reviewState?: SchemaReviewState;
  inferenceIssueCounts?: Partial<Record<SchemaReviewIssueCode, number>>;
}): {
  reviewState: SchemaReviewState;
  reviewIssues: readonly SchemaReviewIssueSummary[];
  totalIssues: number;
  blockingIssueCount: number;
  hasBlockingIssues: boolean;
} {
  const reviewState = normalizeSchemaReviewState({
    reviewState: input.reviewState,
    inferred: input.inferred,
    reviewedAt: input.reviewedAt,
  });

  const normalizedCounts = REVIEW_ISSUE_CODES.reduce<Record<SchemaReviewIssueCode, number>>((acc, code) => {
    const value = input.inferenceIssueCounts?.[code];
    acc[code] = typeof value === 'number' && value > 0 ? Math.floor(value) : 0;
    return acc;
  }, {
    low_sample_evidence: 0,
    type_ambiguity_conflict: 0,
    optionality_uncertainty: 0,
    empty_shape_unknown: 0,
    field_name_quality: 0,
    missing_description: 0,
  });

  const reviewIssues = toIssueSummary(normalizedCounts);
  const totalIssues = reviewIssues.reduce((sum, issue) => sum + issue.count, 0);
  const blockingIssueCount = 0;

  return {
    reviewState,
    reviewIssues,
    totalIssues,
    blockingIssueCount,
    hasBlockingIssues: false,
  };
}

export async function markReviewed(schemaId: string): Promise<SchemaMetadataItem> {
  const existing = await get(schemaId);

  if (!existing) {
    throw new Error(`Schema with id '${schemaId}' not found`);
  }

  const review = aggregateReviewIssues({
    inferred: existing.inferred,
    reviewedAt: existing.reviewedAt,
    reviewState: existing.reviewState,
    inferenceIssueCounts: existing.inferenceIssueCounts,
  });

  const nextReviewedAt = nowIso();
  const nextStatus: SchemaIngestStatus = existing.status === 'error' ? 'error' : 'ready';

  const result = await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.schemaMetadata,
      Key: { schemaId },
      UpdateExpression: [
        'SET #reviewState = :reviewState',
        '#reviewedAt = :reviewedAt',
        '#status = :status',
        '#reviewIssues = :reviewIssues',
        '#updatedAt = :updatedAt',
      ].join(', '),
      ExpressionAttributeNames: {
        '#reviewState': 'reviewState',
        '#reviewedAt': 'reviewedAt',
        '#status': 'status',
        '#reviewIssues': 'reviewIssues',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':reviewState': 'reviewed',
        ':reviewedAt': nextReviewedAt,
        ':status': nextStatus,
        ':reviewIssues': review.reviewIssues,
        ':updatedAt': nextReviewedAt,
      },
      ReturnValues: 'ALL_NEW',
    }),
  );

  return result.Attributes as SchemaMetadataItem;
}

export async function remove(schemaId: string): Promise<void> {
  await dynamoClient.send(
    new DeleteCommand({
      TableName: TABLE_NAMES.schemaMetadata,
      Key: {
        schemaId,
      },
    }),
  );
}

export { remove as delete };

export const schemaMetadata = {
  aggregateReviewIssues,
  create,
  get,
  list,
  markReviewed,
  updateStatus,
  delete: remove,
};
