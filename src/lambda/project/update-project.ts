import {
  ERROR_CODES,
  errorResponse,
  getItem,
  internalError,
  jsonResponse,
  notFound,
  parseBody,
  parsePathParam,
  query,
  updateItem,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

interface SchemaRef {
  readonly schemaId: string;
  readonly type: 'github' | 'local' | 'published';
  readonly commitSha?: string;
}

interface ProjectRecord {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly linkedSchemaIds?: readonly string[];
  readonly schemaRefs: readonly SchemaRef[];
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ProjectMetadata {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly mappingCount: number;
  readonly schemaCount: number;
  readonly updatedAt: string;
}

interface MappingRecord {
  readonly mappingId: string;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const PROJECTS_TABLE = getEnvValue('PROJECTS_TABLE');
const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const KEYRA_DEBUG_PROJECT_SCHEMA_UNLINK = getEnvValue('KEYRA_DEBUG_PROJECT_SCHEMA_UNLINK');

function isProjectUnlinkDebugEnabled(): boolean {
  if (!KEYRA_DEBUG_PROJECT_SCHEMA_UNLINK) {
    return false;
  }

  const normalized = KEYRA_DEBUG_PROJECT_SCHEMA_UNLINK.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function projectUnlinkDebugLog(message: string, payload?: unknown): void {
  if (!isProjectUnlinkDebugEnabled()) {
    return;
  }

  if (payload === undefined) {
    console.info(`[project-unlink-debug] ${message}`);
    return;
  }

  console.info(`[project-unlink-debug] ${message}`, payload);
}

function getProjectsTableOrThrow(): string {
  const table = PROJECTS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: PROJECTS_TABLE');
  }

  return table;
}

function getMappingsTableOrThrow(): string {
  const table = MAPPINGS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return table;
}

function toProjectMetadata(project: ProjectRecord): ProjectMetadata {
  const schemaCount = Array.isArray(project.linkedSchemaIds)
    ? project.linkedSchemaIds.length
    : project.schemaRefs.length;

  return {
    projectId: project.projectId,
    name: project.name,
    description: project.description,
    slug: project.slug,
    mappingCount: 0,
    schemaCount,
    updatedAt: project.updatedAt,
  };
}

function normalizeLinkedSchemaIds(input: { linkedSchemaIds?: unknown; schemaRefs?: readonly SchemaRef[] }): readonly string[] {
  const values = Array.isArray(input.linkedSchemaIds)
    ? input.linkedSchemaIds
    : (input.schemaRefs ?? []).map((schemaRef) => schemaRef.schemaId);

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

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const projectId = parsePathParam(event, 'id');
  if (!projectId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false);
  }

  const body = parseBody(event);
  if (body === null) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid request body', 400, false);
  }

  try {
    const existing = await getItem<ProjectRecord>({
      TableName: getProjectsTableOrThrow(),
      Key: { projectId },
    });

    if (!existing) {
      const err = notFound('Project', projectId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const updated: ProjectRecord = {
      ...existing,
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.description === 'string' ? { description: body.description } : {}),
      ...(typeof body.slug === 'string' ? { slug: body.slug } : {}),
      ...(Array.isArray(body.schemaRefs) ? { schemaRefs: body.schemaRefs as SchemaRef[] } : {}),
      ...(Array.isArray(body.linkedSchemaIds)
        ? { linkedSchemaIds: body.linkedSchemaIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '') }
        : {}),
      ...(Array.isArray(body.tags) ? { tags: body.tags as string[] } : {}),
      updatedAt: new Date().toISOString(),
    };

    const finalSchemaRefs = updated.schemaRefs ?? [];
    const finalLinkedSchemaIds = normalizeLinkedSchemaIds({
      linkedSchemaIds: updated.linkedSchemaIds,
      schemaRefs: finalSchemaRefs,
    });

    const currentLinkedSchemaIds = normalizeLinkedSchemaIds({
      linkedSchemaIds: existing.linkedSchemaIds,
      schemaRefs: existing.schemaRefs,
    });
    const removedLinkedSchemaIds = currentLinkedSchemaIds.filter((id) => !finalLinkedSchemaIds.includes(id));

    if (removedLinkedSchemaIds.length > 0) {
      const mappings = await query<MappingRecord>({
        TableName: getMappingsTableOrThrow(),
        IndexName: 'projectId-index',
        KeyConditionExpression: '#projectId = :projectId',
        ExpressionAttributeNames: {
          '#projectId': 'projectId',
        },
        ExpressionAttributeValues: {
          ':projectId': projectId,
        },
      });

      const dependentMappings = mappings
        .filter((mapping) =>
          removedLinkedSchemaIds.includes(mapping.sourceSchemaId ?? '')
          || removedLinkedSchemaIds.includes(mapping.targetSchemaId ?? ''),
        )
        .map((mapping) => ({
          mappingId: mapping.mappingId,
          sourceSchemaId: mapping.sourceSchemaId,
          targetSchemaId: mapping.targetSchemaId,
        }));

      if (dependentMappings.length > 0) {
        projectUnlinkDebugLog('unlink blocked by dependent mappings', {
          projectId,
          removedLinkedSchemaIds,
          dependentMappings,
        });
        return errorResponse(
          ERROR_CODES.CONFLICT,
          'Cannot unlink schema while mappings in this project still reference it',
          409,
          false,
          undefined,
          { dependentMappings },
        );
      }
    }

    await updateItem({
      TableName: getProjectsTableOrThrow(),
      Key: { projectId },
      UpdateExpression:
        'SET #name = :name, #description = :description, #slug = :slug, #schemaRefs = :schemaRefs, #linkedSchemaIds = :linkedSchemaIds, #tags = :tags, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#name': 'name',
        '#description': 'description',
        '#slug': 'slug',
        '#schemaRefs': 'schemaRefs',
        '#linkedSchemaIds': 'linkedSchemaIds',
        '#tags': 'tags',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':name': updated.name,
        ':description': updated.description,
        ':slug': updated.slug,
        ':schemaRefs': finalSchemaRefs,
        ':linkedSchemaIds': finalLinkedSchemaIds,
        ':tags': updated.tags,
        ':updatedAt': updated.updatedAt,
      },
      ReturnValues: 'ALL_NEW',
    });

    return jsonResponse(200, toProjectMetadata(updated));
  } catch (error) {
    const details = error as { message?: unknown; name?: unknown; code?: unknown };
    projectUnlinkDebugLog('update-project internal failure', {
      projectId,
      errorName: typeof details.name === 'string' ? details.name : null,
      errorCode: typeof details.code === 'string' ? details.code : null,
      errorMessage: typeof details.message === 'string' ? details.message : 'unknown error',
    });
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
