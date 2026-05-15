import {
  errorResponse,
  internalError,
  jsonResponse,
  query,
  scan,
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
const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');

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

async function getMappingCount(projectId: string): Promise<number> {
  const mappings = await query<unknown>({
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

  return mappings.length;
}

function toProjectMetadata(project: ProjectRecord, mappingCount: number): ProjectMetadata {
  return {
    projectId: project.projectId,
    name: project.name,
    description: project.description,
    slug: project.slug,
    mappingCount,
    schemaCount: project.schemaRefs.length,
    updatedAt: project.updatedAt,
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  void event;

  try {
    const projects = await scan<ProjectRecord>({
      TableName: getProjectsTableOrThrow(),
    });

    const withCounts = await Promise.all(
      projects.map(async (project) => toProjectMetadata(project, await getMappingCount(project.projectId))),
    );

    return jsonResponse(200, withCounts);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
