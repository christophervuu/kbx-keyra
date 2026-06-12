import {
  ERROR_CODES,
  conflict,
  deleteItem,
  deleteObject,
  errorResponse,
  getItem,
  internalError,
  jsonResponse,
  notFound,
  parsePathParam,
  query,
  scan,
  updateItem,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

type SchemaFormat = 'json-schema' | 'xsd';

interface SchemaMetadata {
  readonly schemaId: string;
  readonly format: SchemaFormat;
}

interface ProjectRecord {
  readonly projectId: string;
  readonly schemaRefs?: ReadonlyArray<{ readonly schemaId?: string }>;
  readonly linkedSchemaIds?: ReadonlyArray<string>;
}

interface MappingRecord {
  readonly mappingId: string;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
}

interface SchemaNodeKey {
  readonly schemaId: string;
  readonly path: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SCHEMAS_TABLE = getEnvValue('SCHEMAS_TABLE');
const SCHEMA_NODES_TABLE = getEnvValue('SCHEMA_NODES_TABLE');
const PROJECTS_TABLE = getEnvValue('PROJECTS_TABLE');
const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET');

function getSchemasTableOrThrow(): string {
  const table = SCHEMAS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: SCHEMAS_TABLE');
  }

  return table;
}

function getSchemaNodesTableOrThrow(): string {
  const table = SCHEMA_NODES_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: SCHEMA_NODES_TABLE');
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

function getMappingsTableOrThrow(): string {
  const table = MAPPINGS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return table;
}

function contentKey(schemaId: string, format: SchemaFormat): string {
  return `schemas/${schemaId}/content.${format === 'xsd' ? 'xsd' : 'json'}`;
}

function normalizeLinkedSchemaIds(project: Pick<ProjectRecord, 'linkedSchemaIds' | 'schemaRefs'>): readonly string[] {
  const values = Array.isArray(project.linkedSchemaIds)
    ? project.linkedSchemaIds
    : (project.schemaRefs ?? []).map((ref) => ref.schemaId ?? '');

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

function projectReferencesSchema(project: ProjectRecord, schemaId: string): boolean {
  const inSchemaRefs = (project.schemaRefs ?? []).some((ref) => ref.schemaId === schemaId);
  const inLinkedSchemaIds = normalizeLinkedSchemaIds(project).includes(schemaId);
  return inSchemaRefs || inLinkedSchemaIds;
}

async function pruneSchemaFromProjects(schemaId: string, projects: readonly ProjectRecord[]): Promise<void> {
  const updates = projects.filter((project) => projectReferencesSchema(project, schemaId));

  for (const project of updates) {
    const nextSchemaRefs = (project.schemaRefs ?? []).filter((ref) => ref.schemaId !== schemaId);
    const nextLinkedSchemaIds = normalizeLinkedSchemaIds({
      linkedSchemaIds: project.linkedSchemaIds,
      schemaRefs: nextSchemaRefs,
    }).filter((id) => id !== schemaId);

    await updateItem({
      TableName: getProjectsTableOrThrow(),
      Key: { projectId: project.projectId },
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
}

async function findDependentMappings(schemaId: string): Promise<readonly string[]> {
  const mappings = await scan<MappingRecord>({
    TableName: getMappingsTableOrThrow(),
  });

  return mappings
    .filter((mapping) => mapping.sourceSchemaId === schemaId || mapping.targetSchemaId === schemaId)
    .map((mapping) => mapping.mappingId)
    .filter((id): id is string => typeof id === 'string' && id.trim() !== '');
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const schemaId = parsePathParam(event, 'id');
  if (!schemaId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false);
  }

  try {
    const schema = await getItem<SchemaMetadata>({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId },
    });

    if (!schema) {
      const err = notFound('Schema', schemaId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const dependentMappings = await findDependentMappings(schemaId);
    if (dependentMappings.length > 0) {
      const err = conflict(`Schema is referenced by mappings: [${dependentMappings.join(', ')}]`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const projects = await scan<ProjectRecord>({
      TableName: getProjectsTableOrThrow(),
    });

    await pruneSchemaFromProjects(schemaId, projects);

    const nodes = await query<SchemaNodeKey>({
      TableName: getSchemaNodesTableOrThrow(),
      KeyConditionExpression: '#schemaId = :schemaId',
      ExpressionAttributeNames: {
        '#schemaId': 'schemaId',
      },
      ExpressionAttributeValues: {
        ':schemaId': schemaId,
      },
    });

    for (const node of nodes) {
      await deleteItem({
        TableName: getSchemaNodesTableOrThrow(),
        Key: { schemaId: node.schemaId, path: node.path },
      });
    }

    await deleteItem({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId },
    });

    await deleteObject({
      Bucket: getContentBucketOrThrow(),
      Key: contentKey(schemaId, schema.format),
    });

    return jsonResponse(204, null);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
