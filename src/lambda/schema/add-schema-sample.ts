import {
  ERROR_CODES,
  deleteItem,
  errorResponse,
  getItem,
  getObject,
  internalError,
  jsonResponse,
  parseBody,
  parsePathParam,
  putItem,
  putObject,
  query,
  updateItem,
  validationError,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import type {
  SchemaDataFormat,
  SchemaSamplePayloadMetadata,
  SchemaStatus,
} from '../../lib/persistence/types.js';

type SchemaFormat = 'json-schema' | 'xsd';

interface SchemaMetadataRecord {
  readonly schemaId: string;
  readonly format: SchemaFormat;
  readonly dataFormat?: SchemaDataFormat;
  readonly status?: SchemaStatus | 'ingesting';
  readonly samplePayloadCount?: number;
  readonly samplePayloads?: readonly SchemaSamplePayloadMetadata[];
  readonly updatedAt?: string;
}

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

interface AddSchemaSampleBody {
  readonly sampleName?: string;
  readonly sampleContent: unknown;
  readonly applySuggestedUpdates?: boolean;
}

interface DiffResponse {
  readonly additions: readonly string[];
  readonly typeConflicts: ReadonlyArray<{
    path: string;
    existingType: string;
    sampleType: string;
  }>;
  readonly requiredOptionalEvidence: ReadonlyArray<{
    path: string;
    appearsInCurrentSample: boolean;
    totalSamplesAfterSave: number;
  }>;
}

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

function schemaContentKey(schemaId: string, format: SchemaFormat): string {
  return `schemas/${schemaId}/content.${format === 'xsd' ? 'xsd' : 'json'}`;
}

function sampleContentKey(schemaId: string, sampleId: string, dataFormat: SchemaDataFormat): string {
  return `schemas/${schemaId}/samples/${sampleId}/payload.${dataFormat === 'xml' ? 'xml' : 'json'}`;
}

function createId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }

  return `sample-${Date.now()}`;
}

function resolveDataFormat(metadata: SchemaMetadataRecord): SchemaDataFormat {
  if (metadata.dataFormat === 'json' || metadata.dataFormat === 'xml') {
    return metadata.dataFormat;
  }

  return metadata.format === 'xsd' ? 'xml' : 'json';
}

function parseJsonSample(sampleContent: unknown): Record<string, unknown> | null {
  if (typeof sampleContent === 'string') {
    try {
      const parsed = JSON.parse(sampleContent) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }

      return null;
    } catch {
      return null;
    }
  }

  if (typeof sampleContent === 'object' && sampleContent !== null && !Array.isArray(sampleContent)) {
    return sampleContent as Record<string, unknown>;
  }

  return null;
}

function parseXmlSample(sampleContent: unknown): string | null {
  if (typeof sampleContent !== 'string') {
    return null;
  }

  const trimmed = sampleContent.trim();
  if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) {
    return null;
  }

  return trimmed;
}

function inferValueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    default:
      return 'any';
  }
}

function flattenSamplePaths(sample: Record<string, unknown>): ReadonlyMap<string, string> {
  const paths = new Map<string, string>();

  function visit(value: unknown, prefix: string): void {
    if (!prefix) {
      return;
    }

    const valueType = inferValueType(value);
    paths.set(prefix, valueType);

    if (valueType === 'object') {
      const record = value as Record<string, unknown>;
      for (const [key, next] of Object.entries(record)) {
        const nextPath = prefix ? `${prefix}.${key}` : key;
        visit(next, nextPath);
      }
      return;
    }

    if (valueType === 'array') {
      const array = value as unknown[];
      if (array.length > 0) {
        visit(array[0], prefix);
      }
    }
  }

  for (const [key, value] of Object.entries(sample)) {
    visit(value, key);
  }

  return paths;
}

function mergeSampleIntoJsonSchema(schema: Record<string, unknown>, sample: Record<string, unknown>): Record<string, unknown> {
  const base = typeof schema === 'object' && schema !== null ? structuredClone(schema) as Record<string, unknown> : {};
  if (base.type !== 'object') {
    base.type = 'object';
  }

  const rootProperties = typeof base.properties === 'object' && base.properties !== null
    ? base.properties as Record<string, unknown>
    : {};
  base.properties = rootProperties;

  function merge(targetSchema: Record<string, unknown>, value: unknown): void {
    const valueType = inferValueType(value);

    if (valueType === 'object') {
      if (targetSchema.type === undefined) {
        targetSchema.type = 'object';
      }

      const properties = typeof targetSchema.properties === 'object' && targetSchema.properties !== null
        ? targetSchema.properties as Record<string, unknown>
        : {};
      targetSchema.properties = properties;

      for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
        const nextSchema = typeof properties[key] === 'object' && properties[key] !== null
          ? properties[key] as Record<string, unknown>
          : {};
        properties[key] = nextSchema;
        merge(nextSchema, childValue);
      }
      return;
    }

    if (valueType === 'array') {
      if (targetSchema.type === undefined) {
        targetSchema.type = 'array';
      }

      if (targetSchema.items === undefined || typeof targetSchema.items !== 'object' || targetSchema.items === null) {
        targetSchema.items = {};
      }

      const items = targetSchema.items as Record<string, unknown>;
      const arrayValue = value as unknown[];
      if (arrayValue.length > 0) {
        merge(items, arrayValue[0]);
      }
      return;
    }

    if (targetSchema.type === undefined) {
      targetSchema.type = valueType;
    }
  }

  for (const [key, value] of Object.entries(sample)) {
    const nextSchema = typeof rootProperties[key] === 'object' && rootProperties[key] !== null
      ? rootProperties[key] as Record<string, unknown>
      : {};
    rootProperties[key] = nextSchema;
    merge(nextSchema, value);
  }

  return base;
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

  const rootRequired = new Set<string>(
    Array.isArray(root.required) ? root.required.filter((entry): entry is string => typeof entry === 'string') : [],
  );
  visit(root, '', undefined, 1, rootRequired);
  return nodes;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const schemaId = parsePathParam(event, 'id');
  if (!schemaId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false);
  }

  const body = parseBody(event) as AddSchemaSampleBody | null;
  if (!body || body.sampleContent === undefined) {
    const err = validationError('Missing required field: sampleContent');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }

  const applySuggestedUpdates = body.applySuggestedUpdates === true;

  try {
    const metadata = await getItem<SchemaMetadataRecord>({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId },
    });

    if (!metadata) {
      return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Schema with id '${schemaId}' not found`, 404, false);
    }

    const dataFormat = resolveDataFormat(metadata);

    const jsonSample = dataFormat === 'json' ? parseJsonSample(body.sampleContent) : null;
    const xmlSample = dataFormat === 'xml' ? parseXmlSample(body.sampleContent) : null;

    if ((dataFormat === 'json' && !jsonSample) || (dataFormat === 'xml' && !xmlSample)) {
      const err = validationError(`Sample payload format mismatch. Expected ${dataFormat.toUpperCase()} sample content.`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable);
    }

    const existingNodes = await query<SchemaNodeRecord>({
      TableName: getSchemaNodesTableOrThrow(),
      KeyConditionExpression: '#schemaId = :schemaId',
      ExpressionAttributeNames: {
        '#schemaId': 'schemaId',
      },
      ExpressionAttributeValues: {
        ':schemaId': schemaId,
      },
    });

    const existingTypeByPath = new Map(existingNodes.map((node) => [node.path, node.type]));
    const samplePathMap = dataFormat === 'json' && jsonSample ? flattenSamplePaths(jsonSample) : new Map<string, string>();

    const additions = Array.from(samplePathMap.entries())
      .filter(([path]) => !existingTypeByPath.has(path))
      .map(([path]) => path)
      .sort();

    const typeConflicts = Array.from(samplePathMap.entries())
      .filter(([path, sampleType]) => {
        const existingType = existingTypeByPath.get(path);
        return typeof existingType === 'string' && existingType !== sampleType && existingType !== 'any';
      })
      .map(([path, sampleType]) => ({
        path,
        existingType: existingTypeByPath.get(path) ?? 'any',
        sampleType,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    const totalSamplesAfterSave = (metadata.samplePayloadCount ?? metadata.samplePayloads?.length ?? 0) + 1;
    const requiredOptionalEvidence = Array.from(samplePathMap.keys())
      .sort()
      .slice(0, 50)
      .map((path) => ({
        path,
        appearsInCurrentSample: true,
        totalSamplesAfterSave,
      }));

    const diff: DiffResponse = {
      additions,
      typeConflicts,
      requiredOptionalEvidence,
    };

    const sampleId = createId();
    const createdAt = nowIso();
    const samplePayload: SchemaSamplePayloadMetadata = {
      sampleId,
      schemaId,
      name: typeof body.sampleName === 'string' && body.sampleName.trim() ? body.sampleName.trim() : `Sample ${totalSamplesAfterSave}`,
      dataFormat,
      contentRef: sampleContentKey(schemaId, sampleId, dataFormat),
      usedForInference: false,
      source: 'added_sample',
      sizeBytes: dataFormat === 'json'
        ? JSON.stringify(jsonSample).length
        : (xmlSample as string).length,
      createdAt,
      compatibility: 'unknown',
    };

    const nextSamples = [...(metadata.samplePayloads ?? []), samplePayload];
    const nextSamplePayloadCount = nextSamples.length;

    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: samplePayload.contentRef,
      Body: dataFormat === 'json' ? JSON.stringify(jsonSample) : (xmlSample as string),
      ContentType: dataFormat === 'xml' ? 'application/xml' : 'application/json',
    });

    let schemaMutated = false;
    let nextFieldCount: number | undefined;

    if (applySuggestedUpdates && dataFormat === 'json' && jsonSample) {
      const rawContent = await getObject({
        Bucket: getContentBucketOrThrow(),
        Key: schemaContentKey(schemaId, metadata.format),
      });

      const parsedSchema = JSON.parse(rawContent) as Record<string, unknown>;
      const mergedSchema = mergeSampleIntoJsonSchema(parsedSchema, jsonSample);
      const mergedRaw = JSON.stringify(mergedSchema);

      await putObject({
        Bucket: getContentBucketOrThrow(),
        Key: schemaContentKey(schemaId, metadata.format),
        Body: mergedRaw,
        ContentType: 'application/json',
      });

      for (const existing of existingNodes) {
        await deleteItem({
          TableName: getSchemaNodesTableOrThrow(),
          Key: {
            schemaId: existing.schemaId,
            path: existing.path,
          },
        });
      }

      const mergedNodes = generateJsonSchemaNodes(schemaId, mergedRaw);
      for (const node of mergedNodes) {
        await putItem({
          TableName: getSchemaNodesTableOrThrow(),
          Item: node,
        });
      }

      schemaMutated = true;
      nextFieldCount = mergedNodes.length;
    }

    const nextStatus = schemaMutated && metadata.status !== 'error' ? 'needs_review' : metadata.status;

    const updatedMetadata = await updateItem<SchemaMetadataRecord & { fieldCount?: number; status?: string }>({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId },
      UpdateExpression: [
        'SET #samplePayloads = :samplePayloads',
        '#samplePayloadCount = :samplePayloadCount',
        '#updatedAt = :updatedAt',
        '#status = :status',
        ...(typeof nextFieldCount === 'number' ? ['#fieldCount = :fieldCount'] : []),
      ].join(', '),
      ExpressionAttributeNames: {
        '#samplePayloads': 'samplePayloads',
        '#samplePayloadCount': 'samplePayloadCount',
        '#updatedAt': 'updatedAt',
        '#status': 'status',
        ...(typeof nextFieldCount === 'number' ? { '#fieldCount': 'fieldCount' } : {}),
      },
      ExpressionAttributeValues: {
        ':samplePayloads': nextSamples,
        ':samplePayloadCount': nextSamplePayloadCount,
        ':updatedAt': createdAt,
        ':status': nextStatus,
        ...(typeof nextFieldCount === 'number' ? { ':fieldCount': nextFieldCount } : {}),
      },
      ReturnValues: 'ALL_NEW',
    });

    return jsonResponse(200, {
      sample: samplePayload,
      diff,
      schemaUpdated: schemaMutated,
      mode: applySuggestedUpdates ? 'apply_all' : 'save_only',
      metadata: updatedMetadata,
    });
  } catch {
    const err = internalError('Failed to process schema sample payload');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
