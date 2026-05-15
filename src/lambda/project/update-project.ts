import {
  ERROR_CODES,
  errorResponse,
  getItem,
  internalError,
  jsonResponse,
  notFound,
  parseBody,
  parsePathParam,
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

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const PROJECTS_TABLE = getEnvValue('PROJECTS_TABLE');

function getProjectsTableOrThrow(): string {
  const table = PROJECTS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: PROJECTS_TABLE');
  }

  return table;
}

function toProjectMetadata(project: ProjectRecord): ProjectMetadata {
  return {
    projectId: project.projectId,
    name: project.name,
    description: project.description,
    slug: project.slug,
    mappingCount: 0,
    schemaCount: project.schemaRefs.length,
    updatedAt: project.updatedAt,
  };
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
      ...(Array.isArray(body.tags) ? { tags: body.tags as string[] } : {}),
      updatedAt: new Date().toISOString(),
    };

    await updateItem({
      TableName: getProjectsTableOrThrow(),
      Key: { projectId },
      UpdateExpression:
        'SET #name = :name, #description = :description, #slug = :slug, #schemaRefs = :schemaRefs, #tags = :tags, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#name': 'name',
        '#description': 'description',
        '#slug': 'slug',
        '#schemaRefs': 'schemaRefs',
        '#tags': 'tags',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':name': updated.name,
        ':description': updated.description,
        ':slug': updated.slug,
        ':schemaRefs': updated.schemaRefs,
        ':tags': updated.tags,
        ':updatedAt': updated.updatedAt,
      },
      ReturnValues: 'ALL_NEW',
    });

    return jsonResponse(200, toProjectMetadata(updated));
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
