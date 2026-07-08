import {
  ERROR_CODES,
  deleteItem,
  deleteObject,
  errorResponse,
  getItem,
  internalError,
  jsonResponse,
  notFound,
  parsePathParam,
  query,
  updateItem,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { remove as removeDeploymentSummary } from '../../lib/persistence/deployment-summaries.js';

interface MappingMetadata {
  readonly mappingId: string;
  readonly projectId: string;
  readonly configS3Key: string;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
}

interface ProjectSchemaRef {
  readonly schemaId: string;
  readonly type: 'github' | 'local' | 'published';
  readonly commitSha?: string;
}

interface ProjectRecord {
  readonly projectId: string;
  readonly linkedSchemaIds?: readonly string[];
  readonly schemaRefs?: readonly ProjectSchemaRef[];
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const PROJECTS_TABLE = getEnvValue('PROJECTS_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET');

function getMappingsTableOrThrow(): string {
  const table = MAPPINGS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return table;
}

function getProjectsTableOrThrow(): string {
  const table = PROJECTS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: PROJECTS_TABLE');
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

function normalizeLinkedSchemaIds(project: Pick<ProjectRecord, 'linkedSchemaIds' | 'schemaRefs'>): readonly string[] {
  const values = Array.isArray(project.linkedSchemaIds)
    ? project.linkedSchemaIds
    : (project.schemaRefs ?? []).map((ref) => ref.schemaId);

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function isMissingS3ObjectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const typed = error as {
    appError?: { code?: unknown };
    code?: unknown;
    Code?: unknown;
    name?: unknown;
  };

  return (
    typed.appError?.code === ERROR_CODES.RESOURCE_NOT_FOUND
    || typed.appError?.code === 'RESOURCE_NOT_FOUND'
    || typed.code === 'RESOURCE_NOT_FOUND'
    || typed.Code === 'NoSuchKey'
    || typed.name === 'NoSuchKey'
  );
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  try {
    const existing = await getItem<MappingMetadata>({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
    });

    if (!existing) {
      const err = notFound('Mapping', mappingId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    await deleteItem({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
    });

    await removeDeploymentSummary(mappingId);

    const remainingMappings = await query<MappingMetadata>({
      TableName: getMappingsTableOrThrow(),
      IndexName: 'projectId-index',
      KeyConditionExpression: '#projectId = :projectId',
      ExpressionAttributeNames: {
        '#projectId': 'projectId',
      },
      ExpressionAttributeValues: {
        ':projectId': existing.projectId,
      },
    });

    const referencedSchemaIds = new Set<string>();
    for (const mapping of remainingMappings) {
      if (typeof mapping.sourceSchemaId === 'string' && mapping.sourceSchemaId.trim().length > 0) {
        referencedSchemaIds.add(mapping.sourceSchemaId);
      }
      if (typeof mapping.targetSchemaId === 'string' && mapping.targetSchemaId.trim().length > 0) {
        referencedSchemaIds.add(mapping.targetSchemaId);
      }
    }

    const project = await getItem<ProjectRecord>({
      TableName: getProjectsTableOrThrow(),
      Key: { projectId: existing.projectId },
    });

    if (project) {
      const nextSchemaRefs = (project.schemaRefs ?? []).filter((ref) => referencedSchemaIds.has(ref.schemaId));
      const nextLinkedSchemaIds = normalizeLinkedSchemaIds({
        linkedSchemaIds: project.linkedSchemaIds,
        schemaRefs: nextSchemaRefs,
      }).filter((schemaId) => referencedSchemaIds.has(schemaId));

      await updateItem({
        TableName: getProjectsTableOrThrow(),
        Key: { projectId: existing.projectId },
        UpdateExpression: 'SET #schemaRefs = :schemaRefs, #linkedSchemaIds = :linkedSchemaIds, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#schemaRefs': 'schemaRefs',
          '#linkedSchemaIds': 'linkedSchemaIds',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':schemaRefs': nextSchemaRefs,
          ':linkedSchemaIds': nextLinkedSchemaIds,
          ':updatedAt': new Date().toISOString(),
        },
      });
    }

    try {
      await deleteObject({
        Bucket: getContentBucketOrThrow(),
        Key: existing.configS3Key,
      });
    } catch (error) {
      // Mapping metadata is already removed. Treat missing config blob as a
      // successful idempotent delete and only fail on unexpected S3 errors.
      if (!isMissingS3ObjectError(error)) {
        throw error;
      }
    }

    return jsonResponse(204, null);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
