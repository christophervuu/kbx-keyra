import {
  computeConfigHash,
  type MappingConfig as PersistenceMappingConfig,
} from '../../lib/persistence/index.js';
import { upsert as upsertDeploymentSummary } from '../../lib/persistence/deployment-summaries.js';
import {
  ERROR_CODES,
  errorResponse,
  getItem,
  internalError,
  jsonResponse,
  notFound,
  parseBody,
  parsePathParam,
  putItem,
  putObject,
  query,
  requireFields,
  updateItem,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

interface SchemaRef {
  readonly schemaId: string;
  readonly type: 'github' | 'local' | 'published';
  readonly commitSha?: string;
}

interface MappingRule {
  readonly target: string;
  readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'any';
  readonly expression: string;
  readonly description?: string;
}

interface MappingConfigOptions {
  readonly unmappedTargets?: 'omit' | 'null' | 'error';
  readonly nullSubtrees?: readonly string[];
  readonly constants?: Readonly<Record<string, unknown>>;
  readonly externalSources?: readonly string[];
}

interface MappingConfig {
  readonly id?: string;
  readonly projectId?: string;
  readonly name: string;
  readonly version: number;
  readonly engineVersion: string;
  readonly sourceSchemaRef?: SchemaRef;
  readonly targetSchemaRef?: SchemaRef;
  readonly config: MappingConfigOptions;
  readonly rules: readonly MappingRule[];
}

interface MappingMetadata {
  readonly mappingId: string;
  readonly projectId: string;
  readonly name: string;
  readonly version: number;
  readonly revision?: number;
  readonly status: 'draft' | 'ready' | 'has-errors';
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly ruleCount: number;
  readonly coverage: number;
  readonly configS3Key: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface MappingRevisionItem {
  readonly mappingId: string;
  readonly revision: number;
  readonly savedAt: string;
  readonly savedBy: string;
  readonly ruleCount: number;
  readonly configS3Key: string;
  readonly configHash: string;
}

interface MappingVersionItem {
  readonly mappingId: string;
  readonly version: number;
  readonly revisionNumber: number;
  readonly createdAt: string;
  readonly createdBy: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const MAPPING_REVISIONS_TABLE = getEnvValue('MAPPING_REVISIONS_TABLE');
const MAPPING_VERSIONS_TABLE = getEnvValue('MAPPING_VERSIONS_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET');

function getMappingsTableOrThrow(): string {
  const table = MAPPINGS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return table;
}

function getMappingRevisionsTableOrThrow(): string {
  const table = MAPPING_REVISIONS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPING_REVISIONS_TABLE');
  }

  return table;
}

function getMappingVersionsTableOrThrow(): string {
  const table = MAPPING_VERSIONS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPING_VERSIONS_TABLE');
  }

  return table;
}

function getContentBucketOrThrow(): string {
  const bucket = CONTENT_BUCKET?.trim();
  if (!bucket) {
    throw new Error('Missing required environment variable: CONTENT_BUCKET');
  }

  return bucket;
}

function getCurrentRevision(metadata: MappingMetadata): number {
  return metadata.revision ?? metadata.version;
}

function toRevisionS3Key(mappingId: string, revision: number): string {
  return `mappings/${mappingId}/revisions/r${revision}.json`;
}

async function maybeImplicitSave(mappingId: string, body: Record<string, unknown>): Promise<number> {
  const mapping = await getItem<MappingMetadata>({
    TableName: getMappingsTableOrThrow(),
    Key: { mappingId },
  });

  if (!mapping) {
    const err = notFound('Mapping', mappingId);
    throw err;
  }

  const implicitSave = body.implicitSave === true;
  if (!implicitSave) {
    return getCurrentRevision(mapping);
  }

  const required = requireFields(body, ['projectId', 'name', 'config', 'rules']);
  if (!required.ok) {
    const err = required.error;
    throw {
      code: err?.code ?? ERROR_CODES.VALIDATION_ERROR,
      message: err?.message ?? 'Validation failed',
      statusCode: err?.statusCode ?? 400,
      retryable: err?.retryable ?? false,
    };
  }

  const nextRevision = getCurrentRevision(mapping) + 1;
  const config: MappingConfig = {
    id: mappingId,
    projectId: String(body.projectId),
    name: String(body.name),
    version: nextRevision,
    engineVersion: typeof body.engineVersion === 'string' ? body.engineVersion : '1.0.0',
    sourceSchemaRef: (body.sourceSchemaRef as SchemaRef | undefined) ?? undefined,
    targetSchemaRef: (body.targetSchemaRef as SchemaRef | undefined) ?? undefined,
    config: (body.config as MappingConfigOptions | undefined) ?? {},
    rules: Array.isArray(body.rules) ? (body.rules as MappingRule[]) : [],
  };

  const revisionConfigS3Key = toRevisionS3Key(mappingId, nextRevision);
  const configHash = await computeConfigHash({ ...config, version: 0 } as PersistenceMappingConfig);
  const now = new Date().toISOString();

  await putObject({
    Bucket: getContentBucketOrThrow(),
    Key: revisionConfigS3Key,
    Body: JSON.stringify(config),
    ContentType: 'application/json',
  });

  await putItem({
    TableName: getMappingRevisionsTableOrThrow(),
    Item: {
      mappingId,
      revision: nextRevision,
      savedAt: now,
      savedBy: 'system',
      ruleCount: config.rules.length,
      configS3Key: revisionConfigS3Key,
      configHash,
    } satisfies MappingRevisionItem,
  });

  await updateItem({
    TableName: getMappingsTableOrThrow(),
    Key: { mappingId },
    UpdateExpression: 'SET #revision = :revision, #version = :version, #updatedAt = :updatedAt, #configHash = :configHash',
    ExpressionAttributeNames: {
      '#revision': 'revision',
      '#version': 'version',
      '#updatedAt': 'updatedAt',
      '#configHash': 'configHash',
    },
    ExpressionAttributeValues: {
      ':revision': nextRevision,
      ':version': nextRevision,
      ':updatedAt': now,
      ':configHash': configHash,
    },
    ReturnValues: 'ALL_NEW',
  });

  return nextRevision;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const body = (parseBody(event) ?? {}) as Record<string, unknown>;

  try {
    let revisionNumber = await maybeImplicitSave(mappingId, body);

    const revisionExists = await getItem<MappingRevisionItem>({
      TableName: getMappingRevisionsTableOrThrow(),
      Key: { mappingId, revision: revisionNumber },
    });

    if (!revisionExists) {
      const revisions = await query<MappingRevisionItem>({
        TableName: getMappingRevisionsTableOrThrow(),
        KeyConditionExpression: '#mappingId = :mappingId',
        ExpressionAttributeNames: {
          '#mappingId': 'mappingId',
        },
        ExpressionAttributeValues: {
          ':mappingId': mappingId,
        },
        ScanIndexForward: false,
        Limit: 1,
      });
      revisionNumber = revisions[0]?.revision ?? revisionNumber;
    }

    if (revisionNumber <= 0) {
      const err = notFound('Mapping revision', `${mappingId}:latest`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const versions = await query<MappingVersionItem>({
      TableName: getMappingVersionsTableOrThrow(),
      KeyConditionExpression: '#mappingId = :mappingId',
      ExpressionAttributeNames: {
        '#mappingId': 'mappingId',
      },
      ExpressionAttributeValues: {
        ':mappingId': mappingId,
      },
      ScanIndexForward: false,
      Limit: 1,
    });

    const nextVersion = (versions[0]?.version ?? 0) + 1;
    const createdAt = new Date().toISOString();

    const item: MappingVersionItem = {
      mappingId,
      version: nextVersion,
      revisionNumber,
      createdAt,
      createdBy: 'system',
    };

    await putItem({
      TableName: getMappingVersionsTableOrThrow(),
      Item: item,
    });

    const mapping = await getItem<MappingMetadata>({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
    });

    if (mapping) {
      await upsertDeploymentSummary({
        mappingId,
        projectId: mapping.projectId,
        mappingName: mapping.name,
        latestVersion: nextVersion,
        latestVersionCreatedAt: createdAt,
        actorId: 'development:system',
        actorDisplayName: 'Development',
        occurredAt: createdAt,
      });
    }

    return jsonResponse(201, item);
  } catch (error) {
    console.error('save-version failed', {
      mappingId,
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
    });
    const maybe = error as { code?: string; message?: string; statusCode?: number; retryable?: boolean };
    const knownCodes = Object.values(ERROR_CODES) as string[];
    if (maybe.code && knownCodes.includes(maybe.code) && maybe.message && typeof maybe.statusCode === 'number') {
      return errorResponse(maybe.code as (typeof ERROR_CODES)[keyof typeof ERROR_CODES], maybe.message, maybe.statusCode, maybe.retryable ?? false);
    }

    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
