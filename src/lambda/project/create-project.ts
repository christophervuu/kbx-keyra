import {
  ERROR_CODES,
  errorResponse,
  internalError,
  jsonResponse,
  parseBody,
  putItem,
  requireFields,
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

function generateProjectId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }

  return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  const body = parseBody(event);
  const validation = requireFields(body, ['name', 'slug']);
  if (!validation.ok) {
    const err = validation.error;
    return errorResponse(err?.code ?? ERROR_CODES.VALIDATION_ERROR, err?.message ?? 'Validation failed', err?.statusCode ?? 400, err?.retryable ?? false);
  }

  const now = new Date().toISOString();
  const schemaRefs = Array.isArray(body?.schemaRefs) ? (body.schemaRefs as SchemaRef[]) : [];
  const linkedSchemaIds = normalizeLinkedSchemaIds({
    linkedSchemaIds: body?.linkedSchemaIds,
    schemaRefs,
  });
  const project: ProjectRecord = {
    projectId: generateProjectId(),
    name: String(body?.name ?? ''),
    description: typeof body?.description === 'string' ? body.description : '',
    slug: String(body?.slug ?? ''),
    linkedSchemaIds,
    schemaRefs,
    tags: Array.isArray(body?.tags) ? (body.tags as string[]) : [],
    createdAt: now,
    updatedAt: now,
  };

  try {
    await putItem({
      TableName: getProjectsTableOrThrow(),
      Item: project,
    });

    return jsonResponse(201, toProjectMetadata(project));
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
