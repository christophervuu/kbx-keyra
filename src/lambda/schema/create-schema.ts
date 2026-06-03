import {
  DynamoServiceError,
  ERROR_CODES,
  S3ServiceError,
  errorResponse,
  internalError,
  jsonResponse,
  parseBody,
  putItem,
  putObject,
  requireFields,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

type SchemaFormat = 'json-schema' | 'xsd';
type SchemaOrigin = 'cdm' | 'published' | 'local';
type SchemaIngestStatus = 'ingesting' | 'ready' | 'error';
type SchemaScope = 'global' | 'project';
type SchemaSyncStatus = 'synced' | 'update-available' | 'sync-failed' | 'not-synced' | 'local-changes';

interface SchemaNodeRecord {
  readonly schemaId: string;
  readonly path: string;
  readonly fieldName: string;
  readonly type: string;
  readonly depth: number;
  readonly parentPath?: string;
  readonly isArray: boolean;
  readonly isRequired: boolean;
  readonly childCount: number;
  readonly description?: string;
}

interface SchemaSourceUpload {
  readonly type: 'upload';
}

interface SchemaSourceGitHub {
  readonly type: 'github';
  readonly repo: string;
  readonly repoId?: number;
  readonly branch: string;
  readonly path: string;
  readonly commitSha?: string;
}

type SchemaSource = SchemaSourceUpload | SchemaSourceGitHub;

interface SchemaMetadata {
  readonly schemaId: string;
  readonly name: string;
  readonly format: SchemaFormat;
  readonly fieldCount: number;
  readonly origin: SchemaOrigin;
  readonly status: SchemaIngestStatus;
  readonly scope: SchemaScope;
  readonly description?: string;
  readonly updatedBy?: string;
  readonly inferred?: boolean;
  readonly syncStatus: SchemaSyncStatus;
  readonly source: SchemaSource;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const INLINE_THRESHOLD = 500;

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SCHEMAS_TABLE = getEnvValue('SCHEMAS_TABLE');
const SCHEMA_NODES_TABLE = getEnvValue('SCHEMA_NODES_TABLE');
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

function getContentBucketOrThrow(): string {
  const bucket = CONTENT_BUCKET?.trim();
  if (!bucket) {
    throw new Error('Missing required environment variable: CONTENT_BUCKET');
  }

  return bucket;
}

function generateSchemaId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function asSchemaFormat(value: unknown): SchemaFormat | null {
  if (value === 'json-schema' || value === 'xsd') {
    return value;
  }

  return null;
}

function asSchemaOrigin(value: unknown): SchemaOrigin | null {
  if (value === 'cdm' || value === 'published' || value === 'local') {
    return value;
  }

  return null;
}

function asSchemaScope(value: unknown): SchemaScope {
  return value === 'global' ? 'global' : 'project';
}

function asSchemaSyncStatus(value: unknown): SchemaSyncStatus {
  if (
    value === 'synced'
    || value === 'update-available'
    || value === 'sync-failed'
    || value === 'not-synced'
    || value === 'local-changes'
  ) {
    return value;
  }

  return 'synced';
}

function asSource(value: unknown): SchemaSource {
  if (typeof value === 'object' && value !== null) {
    const source = value as Record<string, unknown>;
    if (
      source.type === 'github'
      && typeof source.repo === 'string'
      && typeof source.branch === 'string'
      && typeof source.path === 'string'
    ) {
      return {
        type: 'github',
        repo: source.repo,
        ...(typeof source.repoId === 'number' ? { repoId: source.repoId } : {}),
        branch: source.branch,
        path: source.path,
        ...(typeof source.commitSha === 'string' ? { commitSha: source.commitSha } : {}),
      };
    }
  }

  return { type: 'upload' };
}

function toContentString(content: unknown, format: SchemaFormat): string | null {
  if (format === 'xsd') {
    return typeof content === 'string' && content.trim() !== '' ? content : null;
  }

  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content) as unknown;
      return JSON.stringify(parsed);
    } catch {
      return null;
    }
  }

  if (typeof content === 'object' && content !== null) {
    return JSON.stringify(content);
  }

  return null;
}

function estimateFieldCount(content: string, format: SchemaFormat): number {
  if (format === 'xsd') {
    const matches = content.match(/<\s*(xs|xsd):element\b/gi);
    return matches?.length ?? 0;
  }

  const propertyMatches = content.match(/"properties"/g);
  const itemMatches = content.match(/"items"/g);
  return (propertyMatches?.length ?? 0) + (itemMatches?.length ?? 0);
}

function childCountFromSchema(schema: Record<string, unknown>): number {
  const properties = schema.properties;
  if (typeof properties !== 'object' || properties === null) {
    return 0;
  }

  return Object.keys(properties as Record<string, unknown>).length;
}

function inferNodeType(schema: Record<string, unknown>): string {
  if (typeof schema.type === 'string') {
    return schema.type;
  }

  if (schema.items !== undefined) {
    return 'array';
  }

  if (schema.properties !== undefined) {
    return 'object';
  }

  return 'any';
}

function isArraySchema(schema: Record<string, unknown>): boolean {
  return schema.type === 'array' || schema.items !== undefined;
}

function generateJsonSchemaNodes(schemaId: string, raw: string): SchemaNodeRecord[] {
  const root = JSON.parse(raw) as Record<string, unknown>;
  const nodes: SchemaNodeRecord[] = [];

  function visit(
    current: Record<string, unknown>,
    currentPath: string,
    parentPath: string | undefined,
    depth: number,
    required: ReadonlySet<string>,
  ): void {
    const properties = current.properties;
    if (typeof properties !== 'object' || properties === null) {
      return;
    }

    const propertyMap = properties as Record<string, unknown>;
    for (const [fieldName, value] of Object.entries(propertyMap)) {
      if (typeof value !== 'object' || value === null) {
        continue;
      }

      const fieldSchema = value as Record<string, unknown>;
      const path = currentPath ? `${currentPath}.${fieldName}` : fieldName;
      const node: SchemaNodeRecord = {
        schemaId,
        path,
        fieldName,
        type: inferNodeType(fieldSchema),
        depth,
        ...(typeof parentPath === 'string' && parentPath !== '' ? { parentPath } : {}),
        isArray: isArraySchema(fieldSchema),
        isRequired: required.has(fieldName),
        childCount: childCountFromSchema(fieldSchema),
        ...(typeof fieldSchema.description === 'string' ? { description: fieldSchema.description } : {}),
      };
      nodes.push(node);

      const nextRequired = new Set<string>(
        Array.isArray(fieldSchema.required)
          ? fieldSchema.required.filter((entry): entry is string => typeof entry === 'string')
          : [],
      );

      visit(fieldSchema, path, path, depth + 1, nextRequired);

      if (typeof fieldSchema.items === 'object' && fieldSchema.items !== null) {
        visit(fieldSchema.items as Record<string, unknown>, path, path, depth + 1, new Set<string>());
      }
    }
  }

  const rootRequired = new Set<string>(Array.isArray(root.required) ? root.required.filter((entry): entry is string => typeof entry === 'string') : []);
  visit(root, '', undefined, 1, rootRequired);
  return nodes;
}

function generateXsdNodes(schemaId: string, raw: string): SchemaNodeRecord[] {
  const elementRegex = /<\s*(?:xs|xsd):element\b([^>]*)>/gi;
  const attrNameRegex = /\bname\s*=\s*"([^"]+)"/i;
  const attrTypeRegex = /\btype\s*=\s*"([^"]+)"/i;

  const nodes: SchemaNodeRecord[] = [];
  let match: RegExpExecArray | null = null;
  let fallbackIndex = 0;

  while ((match = elementRegex.exec(raw)) !== null) {
    const attrs = match[1] ?? '';
    const nameMatch = attrs.match(attrNameRegex);
    const typeMatch = attrs.match(attrTypeRegex);
    const fieldName = nameMatch?.[1] ?? `element_${++fallbackIndex}`;
    nodes.push({
      schemaId,
      path: fieldName,
      fieldName,
      type: typeMatch?.[1] ?? 'any',
      depth: 1,
      isArray: false,
      isRequired: false,
      childCount: 0,
    });
  }

  return nodes;
}

function contentKey(schemaId: string, format: SchemaFormat): string {
  return `schemas/${schemaId}/content.${format === 'xsd' ? 'xsd' : 'json'}`;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);
  const required = requireFields(body, ['name', 'format', 'origin', 'content']);
  if (!required.ok) {
    const err = required.error;
    return errorResponse(err?.code ?? ERROR_CODES.VALIDATION_ERROR, err?.message ?? 'Validation failed', err?.statusCode ?? 400, err?.retryable ?? false);
  }

  const format = asSchemaFormat(body?.format);
  if (!format) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: format must be json-schema or xsd', 400, false);
  }

  const origin = asSchemaOrigin(body?.origin);
  if (!origin) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: origin must be cdm, published, or local', 400, false);
  }

  const content = toContentString(body?.content, format);
  if (!content) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: content', 400, false);
  }

  try {
    const schemaId = generateSchemaId();
    const now = new Date().toISOString();
    const estimated = estimateFieldCount(content, format);
    const inline = estimated <= INLINE_THRESHOLD;

    const nodes = inline
      ? (format === 'json-schema' ? generateJsonSchemaNodes(schemaId, content) : generateXsdNodes(schemaId, content))
      : [];

    const metadata: SchemaMetadata = {
      schemaId,
      name: String(body?.name ?? ''),
      format,
      fieldCount: inline ? nodes.length : 0,
      origin,
      status: inline ? 'ready' : 'ingesting',
      scope: asSchemaScope(body?.scope),
      ...(typeof body?.description === 'string' ? { description: body.description } : {}),
      ...(typeof body?.updatedBy === 'string' ? { updatedBy: body.updatedBy } : {}),
      inferred: typeof body?.inferred === 'boolean' ? body.inferred : false,
      syncStatus: asSchemaSyncStatus(body?.syncStatus),
      source: asSource(body?.source),
      createdAt: now,
      updatedAt: now,
    };

    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: contentKey(schemaId, format),
      Body: content,
      ContentType: format === 'xsd' ? 'application/xml' : 'application/json',
    });

    await putItem({
      TableName: getSchemasTableOrThrow(),
      Item: metadata,
    });

    if (inline) {
      for (const node of nodes) {
        await putItem({
          TableName: getSchemaNodesTableOrThrow(),
          Item: node,
        });
      }
    } else {
      console.log('Schema async ingestion kickoff intended', { schemaId, estimatedFieldCount: estimated });
    }

    return jsonResponse(201, metadata);
  } catch (error) {
    if (error instanceof DynamoServiceError || error instanceof S3ServiceError) {
      const appError = error.appError;
      console.error('create-schema downstream service failure', {
        requestId: appError.requestId,
        code: appError.code,
        statusCode: appError.statusCode,
        retryable: appError.retryable,
        message: appError.message,
      });
      return errorResponse(appError.code, appError.message, appError.statusCode, appError.retryable, appError.requestId);
    }

    const err = internalError();
    console.error('create-schema unexpected failure', {
      requestId: err.requestId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error value',
    });
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
  }
}
