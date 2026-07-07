import { ScanCommand, type ScanCommandInput, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES, schemaVersionContentKey } from './config.js';
import type {
  DeployedSchemaArtifactRef,
  DeploymentItem,
  MappingEnrichmentSource,
  MappingItem,
  SchemaRef,
} from './types.js';

export interface SchemaReferenceBackfillReport {
  readonly table: 'mappings' | 'deployments';
  readonly scanned: number;
  readonly updated: number;
  readonly skipped: number;
  readonly dryRun: boolean;
  readonly failures: readonly {
    readonly id: string;
    readonly reason: string;
  }[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function toBundleRef(role: DeployedSchemaArtifactRef['role'], ref: SchemaRef, alias?: string): DeployedSchemaArtifactRef | null {
  if (
    !isNonEmptyString(ref.schemaId)
    || !isPositiveInteger(ref.schemaVersion)
    || !isNonEmptyString(ref.schemaVersionId)
    || !isNonEmptyString(ref.contentHash)
  ) {
    return null;
  }

  return {
    role,
    schemaId: ref.schemaId,
    schemaVersion: ref.schemaVersion,
    schemaVersionId: ref.schemaVersionId,
    contentHash: ref.contentHash,
    contentS3Key: schemaVersionContentKey(ref.schemaId, ref.schemaVersion),
    ...(isNonEmptyString(alias) ? { alias } : {}),
  };
}

function toSchemaRefFromEnrichment(source: MappingEnrichmentSource): SchemaRef {
  return {
    schemaId: source.schemaId ?? '',
    type: 'local',
    schemaVersion: source.schemaVersion,
    schemaVersionId: source.schemaVersionId,
    contentHash: source.contentHash,
  };
}

function deriveSchemaRefsFromMappingItem(item: MappingItem): readonly DeployedSchemaArtifactRef[] {
  const refs: DeployedSchemaArtifactRef[] = [];
  const enrichments = Array.isArray(item.enrichmentSources) ? item.enrichmentSources : [];

  for (const enrichment of enrichments) {
    const mapped = toBundleRef('enrichment', toSchemaRefFromEnrichment(enrichment), enrichment.alias);
    if (mapped) {
      refs.push(mapped);
    }
  }

  return refs;
}

function deriveSchemaRefsFromDeploymentItem(item: DeploymentItem): readonly DeployedSchemaArtifactRef[] {
  const legacy = (item as DeploymentItem & {
    readonly schemaRefs?: readonly DeployedSchemaArtifactRef[];
  }).schemaRefs;

  return Array.isArray(legacy) ? legacy : [];
}

async function scanAll(tableName: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const input: ScanCommandInput = {
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
    };
    const result = await dynamoClient.send(new ScanCommand(input));
    if (result.Items) {
      items.push(...(result.Items as Record<string, unknown>[]));
    }
    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return items;
}

export async function backfillMappingSchemaPins(options?: { readonly dryRun?: boolean }): Promise<SchemaReferenceBackfillReport> {
  const dryRun = options?.dryRun === true;
  const items = (await scanAll(TABLE_NAMES.mappings)) as unknown as MappingItem[];

  let updated = 0;
  let skipped = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const item of items) {
    const mappingId = item.mappingId;
    if (!isNonEmptyString(mappingId)) {
      skipped += 1;
      continue;
    }

    const refs = deriveSchemaRefsFromMappingItem(item);
    if (refs.length === 0) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      updated += 1;
      continue;
    }

    try {
      await dynamoClient.send(
        new UpdateCommand({
          TableName: TABLE_NAMES.mappings,
          Key: { mappingId },
          UpdateExpression: 'SET #schemaRefs = :schemaRefs',
          ExpressionAttributeNames: { '#schemaRefs': 'schemaRefs' },
          ExpressionAttributeValues: { ':schemaRefs': refs },
        }),
      );
      updated += 1;
    } catch (error) {
      failures.push({
        id: mappingId,
        reason: error instanceof Error ? error.message : 'unknown-error',
      });
    }
  }

  return {
    table: 'mappings',
    scanned: items.length,
    updated,
    skipped,
    dryRun,
    failures,
  };
}

export async function backfillDeploymentSchemaBundles(options?: { readonly dryRun?: boolean }): Promise<SchemaReferenceBackfillReport> {
  const dryRun = options?.dryRun === true;
  const items = (await scanAll(TABLE_NAMES.deployments)) as unknown as DeploymentItem[];

  let updated = 0;
  let skipped = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const item of items) {
    const mappingId = item.mappingId;
    const environmentDeployedAt = item.environmentDeployedAt;
    if (!isNonEmptyString(mappingId) || !isNonEmptyString(environmentDeployedAt)) {
      skipped += 1;
      continue;
    }

    const refs = deriveSchemaRefsFromDeploymentItem(item);
    if (refs.length === 0) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      updated += 1;
      continue;
    }

    try {
      await dynamoClient.send(
        new UpdateCommand({
          TableName: TABLE_NAMES.deployments,
          Key: { mappingId, environmentDeployedAt },
          UpdateExpression: 'SET #schemaRefs = :schemaRefs',
          ExpressionAttributeNames: { '#schemaRefs': 'schemaRefs' },
          ExpressionAttributeValues: { ':schemaRefs': refs },
        }),
      );
      updated += 1;
    } catch (error) {
      failures.push({
        id: `${mappingId}:${environmentDeployedAt}`,
        reason: error instanceof Error ? error.message : 'unknown-error',
      });
    }
  }

  return {
    table: 'deployments',
    scanned: items.length,
    updated,
    skipped,
    dryRun,
    failures,
  };
}

export async function runSchemaReferenceBackfill(options?: {
  readonly dryRun?: boolean;
}): Promise<readonly SchemaReferenceBackfillReport[]> {
  return [
    await backfillMappingSchemaPins(options),
    await backfillDeploymentSchemaBundles(options),
  ] as const;
}
