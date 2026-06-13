import {
  ERROR_CODES,
  errorResponse,
  internalError,
  jsonResponse,
  notFound,
  parsePathParam,
  getItem,
  query,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { normalizeSchemaOrigin, normalizeSchemaSyncStatus } from '../../lib/persistence/types.js';

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

interface MappingMetadata {
  readonly mappingId: string;
  readonly projectId: string;
  readonly name: string;
  readonly version: number;
  readonly status: 'draft' | 'ready' | 'has-errors';
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly ruleCount: number;
  readonly coverage: number;
  readonly updatedAt: string;
}

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
  readonly syncStatus: 'synced' | 'update-available' | 'sync-failed' | 'not-synced' | 'local-changes';
  readonly source: Record<string, unknown>;
  readonly sourceRepoId?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ProjectDetail extends ProjectRecord {
  readonly mappings: readonly MappingMetadata[];
  readonly schemas: readonly SchemaMetadata[];
}

function normalizeLinkedSchemaIds(project: Pick<ProjectRecord, 'linkedSchemaIds' | 'schemaRefs'>): readonly string[] {
  const values = Array.isArray(project.linkedSchemaIds)
    ? project.linkedSchemaIds
    : (project.schemaRefs ?? []).map((schemaRef) => schemaRef.schemaId);

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

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const PROJECTS_TABLE = getEnvValue('PROJECTS_TABLE');
const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const SCHEMAS_TABLE = getEnvValue('SCHEMAS_TABLE');

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

function getSchemasTableOrThrow(): string {
  const table = SCHEMAS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: SCHEMAS_TABLE');
  }

  return table;
}

function toMappingMetadataArray(items: unknown[]): MappingMetadata[] {
  return items
    .map((item) => item as Partial<MappingMetadata>)
    .filter((item) => typeof item.mappingId === 'string' && typeof item.projectId === 'string' && typeof item.name === 'string')
    .map((item) => ({
      mappingId: item.mappingId as string,
      projectId: item.projectId as string,
      name: item.name as string,
      version: typeof item.version === 'number' ? item.version : 1,
      status: (item.status as MappingMetadata['status']) ?? 'draft',
      sourceSchemaId: typeof item.sourceSchemaId === 'string' ? item.sourceSchemaId : undefined,
      targetSchemaId: typeof item.targetSchemaId === 'string' ? item.targetSchemaId : undefined,
      ruleCount: typeof item.ruleCount === 'number' ? item.ruleCount : 0,
      coverage: typeof item.coverage === 'number' ? item.coverage : 0,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
    }));
}

async function loadSchemas(schemaIds: readonly string[]): Promise<SchemaMetadata[]> {
  const schemas: SchemaMetadata[] = [];
  for (const schemaId of schemaIds) {
    const schema = await getItem<SchemaMetadata>({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId },
    });

    if (schema) {
      schemas.push({
        ...schema,
        origin: normalizeSchemaOrigin(schema.origin),
        syncStatus: normalizeSchemaSyncStatus(schema.syncStatus),
      });
    }
  }

  return schemas;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const projectId = parsePathParam(event, 'id');
  if (!projectId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false);
  }

  try {
    const project = await getItem<ProjectRecord>({
      TableName: getProjectsTableOrThrow(),
      Key: { projectId },
    });

    if (!project) {
      const err = notFound('Project', projectId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const mappingItems = await query<unknown>({
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

    const schemaIds = normalizeLinkedSchemaIds(project);

    const detail: ProjectDetail = {
      ...project,
      linkedSchemaIds: schemaIds,
      mappings: toMappingMetadataArray(mappingItems),
      schemas: await loadSchemas(schemaIds),
    };

    return jsonResponse(200, detail);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
