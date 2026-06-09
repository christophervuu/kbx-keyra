import {
  errorResponse,
  internalError,
  jsonResponse,
  scan,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import {
  normalizeSchemaOrigin,
  normalizeSchemaReviewState,
  normalizeSchemaSourceKind,
  normalizeSchemaStatus,
  normalizeSchemaSyncStatus,
  schemaDataFormatFromSourceKind,
  type SchemaReviewState,
  type SchemaSourceKind,
} from '../../lib/persistence/types.js';
import { buildCdmManifestMetadataItems } from '../../lib/schema/cdm/index.js';

interface SchemaMetadata {
  readonly schemaId: string;
  readonly name: string;
  readonly format: 'json-schema' | 'xsd';
  readonly fieldCount: number;
  readonly origin: 'cdm' | 'uploaded' | 'inferred' | 'published' | 'local';
  readonly status: 'ingesting' | 'ready' | 'error';
  readonly scope?: 'global' | 'project';
  readonly description?: string;
  readonly updatedBy?: string;
  readonly inferred?: boolean;
  readonly dataFormat?: 'json' | 'xml';
  readonly syncStatus: 'synced' | 'update-available' | 'sync-failed' | 'not-synced' | 'local-changes';
  readonly source: unknown;
  readonly sourceRepoId?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly ownership?: 'cdm' | 'user';
  readonly readonly?: boolean;
  readonly sourceKind?: SchemaSourceKind;
  readonly reviewState?: SchemaReviewState;
  readonly reviewedAt?: string;
  readonly samplePayloadCount?: number;
  readonly samplePayloads?: readonly unknown[];
}

function mergeWithCdmManifest(entries: readonly SchemaMetadata[]): SchemaMetadata[] {
  const persistedById = new Map(entries.map((entry) => [entry.schemaId, entry]));
  const seeded = buildCdmManifestMetadataItems().map((item) => {
    const existing = persistedById.get(item.schemaId);

    if (existing) {
      return {
        ...existing,
        origin: 'cdm' as const,
        ownership: 'cdm' as const,
        readonly: true,
        sourceKind: item.sourceKind,
      };
    }

    return {
      ...item,
      sourceRepoId:
        typeof item.source === 'object'
        && item.source !== null
        && 'repoId' in item.source
        && typeof (item.source as { repoId?: unknown }).repoId === 'number'
          ? (item.source as { repoId: number }).repoId
          : undefined,
    };
  });

  const seededIds = new Set(seeded.map((entry) => entry.schemaId));
  const nonSeeded = entries.filter((entry) => !seededIds.has(entry.schemaId));

  return [...seeded, ...nonSeeded];
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SCHEMAS_TABLE = getEnvValue('SCHEMAS_TABLE');

function getSchemasTableOrThrow(): string {
  const table = SCHEMAS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: SCHEMAS_TABLE');
  }

  return table;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  void event;

  try {
    const schemas = await scan<SchemaMetadata>({
      TableName: getSchemasTableOrThrow(),
    });

    const normalizedSchemas = mergeWithCdmManifest(schemas).map((schema) => ({
      ...schema,
      origin: normalizeSchemaOrigin(schema.origin),
      sourceKind: normalizeSchemaSourceKind({
        sourceKind: schema.sourceKind,
        format: schema.format,
        inferred: schema.inferred,
      }),
      dataFormat: schemaDataFormatFromSourceKind(
        normalizeSchemaSourceKind({
          sourceKind: schema.sourceKind,
          format: schema.format,
          inferred: schema.inferred,
        }),
      ),
      reviewState: normalizeSchemaReviewState({
        reviewState: schema.reviewState,
        inferred: schema.inferred,
        reviewedAt: schema.reviewedAt,
      }),
      status: normalizeSchemaStatus({
        status: schema.status,
        inferred: schema.inferred,
        reviewedAt: schema.reviewedAt,
      }),
      syncStatus: normalizeSchemaSyncStatus(schema.syncStatus),
      ownership: schema.ownership ?? (normalizeSchemaOrigin(schema.origin) === 'cdm' ? 'cdm' : 'user'),
      readonly: schema.readonly ?? normalizeSchemaOrigin(schema.origin) === 'cdm',
    }));

    return jsonResponse(200, normalizedSchemas);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
