import {
  ERROR_CODES,
  getItem,
  getObject,
  notFound,
  query,
  errorResponse,
  generateRequestId,
  jsonResponse,
  parseBody,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { invokeAI, normalizeAIError } from '../../lib/ai/index.js';
import { validate } from '../../engine/index.js';

interface MappingMetadataRecord {
  readonly mappingId: string;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
}

interface SchemaMetadataRecord {
  readonly schemaId: string;
  readonly format: 'json-schema' | 'xsd';
}

interface SchemaNodeRecord {
  readonly schemaId: string;
  readonly path: string;
  readonly fieldName: string;
  readonly type: string;
  readonly description?: string;
}

interface SuggestExpressionAIOutput {
  readonly expression: string;
  readonly explanation?: string;
}

interface ContextAssemblyResult {
  readonly sourceFields: string;
  readonly wasTruncated: boolean;
  readonly sourceNodeCount: number;
  readonly includedNodeCount: number;
  readonly approxTokenCount: number;
  readonly byteLength: number;
}

interface ValidationDiagnosticSummary {
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
}

interface ExpressionValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly ValidationDiagnosticSummary[];
}

const MAX_CONTEXT_BYTES = 64 * 1024;
const MAX_CONTEXT_TOKENS = 8_000;
const APPROX_CHARS_PER_TOKEN = 4;

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const SCHEMAS_TABLE = getEnvValue('SCHEMAS_TABLE');
const SCHEMA_NODES_TABLE = getEnvValue('SCHEMA_NODES_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET');

function getMappingsTableOrThrow(): string {
  const value = MAPPINGS_TABLE?.trim();
  if (!value) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return value;
}

function getSchemasTableOrThrow(): string {
  const value = SCHEMAS_TABLE?.trim();
  if (!value) {
    throw new Error('Missing required environment variable: SCHEMAS_TABLE');
  }

  return value;
}

function getSchemaNodesTableOrThrow(): string {
  const value = SCHEMA_NODES_TABLE?.trim();
  if (!value) {
    throw new Error('Missing required environment variable: SCHEMA_NODES_TABLE');
  }

  return value;
}

function getContentBucketOrThrow(): string {
  const value = CONTENT_BUCKET?.trim();
  if (!value) {
    throw new Error('Missing required environment variable: CONTENT_BUCKET');
  }

  return value;
}

function contentKey(schemaId: string, format: 'json-schema' | 'xsd'): string {
  return `schemas/${schemaId}/content.${format === 'xsd' ? 'xsd' : 'json'}`;
}

function parseSchemaContent(raw: string, format: 'json-schema' | 'xsd'): unknown {
  if (format === 'xsd') {
    return raw;
  }

  return JSON.parse(raw) as unknown;
}

function getByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function estimateTokenCount(value: string): number {
  return Math.ceil(value.length / APPROX_CHARS_PER_TOKEN);
}

function isWithinContextLimits(candidate: string): boolean {
  return getByteLength(candidate) <= MAX_CONTEXT_BYTES && estimateTokenCount(candidate) <= MAX_CONTEXT_TOKENS;
}

function buildSourceContext(nodes: readonly SchemaNodeRecord[]): ContextAssemblyResult {
  const sorted = [...nodes].sort((a, b) => a.path.localeCompare(b.path));
  const lines: string[] = [];

  for (const node of sorted) {
    const line = typeof node.description === 'string' && node.description.trim() !== ''
      ? `- ${node.path} (${node.type}) — ${node.description.trim()}`
      : `- ${node.path} (${node.type})`;
    const candidate = lines.length === 0 ? line : `${lines.join('\n')}\n${line}`;
    if (!isWithinContextLimits(candidate)) {
      break;
    }

    lines.push(line);
  }

  const sourceFields = lines.join('\n');
  return {
    sourceFields,
    wasTruncated: lines.length < sorted.length,
    sourceNodeCount: sorted.length,
    includedNodeCount: lines.length,
    approxTokenCount: estimateTokenCount(sourceFields),
    byteLength: getByteLength(sourceFields),
  };
}

function normalizeRuleType(targetType: string): 'string' | 'number' | 'boolean' | 'array' | 'object' {
  const normalized = targetType.trim().toLowerCase();

  if (normalized === 'number' || normalized === 'integer') {
    return 'number';
  }
  if (normalized === 'boolean') {
    return 'boolean';
  }
  if (normalized === 'array') {
    return 'array';
  }
  if (normalized === 'object') {
    return 'object';
  }

  return 'string';
}

function validateGeneratedExpression(params: {
  expression: string;
  targetPath: string;
  targetType: string;
  sourceSchema: unknown;
  targetSchema: unknown;
}): ExpressionValidationResult {
  const result = validate(
    {
      name: 'Suggest Expression Validation',
      version: 1,
      engineVersion: '1.0.0',
      sourceSchemaRef: { schemaId: 'source', type: 'local' },
      targetSchemaRef: { schemaId: 'target', type: 'local' },
      config: {
        unmappedTargets: 'omit',
        nullSubtrees: [],
        constants: {},
        externalSources: [],
      },
      rules: [
        {
          target: params.targetPath,
          type: normalizeRuleType(params.targetType),
          expression: params.expression,
        },
      ],
    },
    params.sourceSchema,
    params.targetSchema,
  );

  const diagnostics = result.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
  }));

  return {
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    diagnostics,
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();
  const requestBody = parseBody(event);

  if (!requestBody) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid request body', 400, false, requestId);
  }

  const instruction = requestBody.instruction;
  if (typeof instruction !== 'string' || instruction === '') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: instruction', 400, false, requestId);
  }

  const targetPath = requestBody.targetPath;
  if (typeof targetPath !== 'string' || targetPath === '') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: targetPath', 400, false, requestId);
  }

  const targetType = requestBody.targetType;
  if (typeof targetType !== 'string' || targetType === '') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: targetType', 400, false, requestId);
  }

  const mappingId = requestBody.mappingId;
  if (typeof mappingId !== 'string' || mappingId === '') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required field: mappingId', 400, false, requestId);
  }

  const targetDescription =
    typeof requestBody.targetDescription === 'string' ? requestBody.targetDescription : '';

  try {
    const mapping = await getItem<MappingMetadataRecord>({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
    });

    if (!mapping) {
      const err = notFound('Mapping', mappingId, requestId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    if (!mapping.sourceSchemaId || !mapping.targetSchemaId) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `Mapping '${mappingId}' is missing required source/target schema references`,
        400,
        false,
        requestId,
      );
    }

    const [sourceSchemaMeta, targetSchemaMeta] = await Promise.all([
      getItem<SchemaMetadataRecord>({
        TableName: getSchemasTableOrThrow(),
        Key: { schemaId: mapping.sourceSchemaId },
      }),
      getItem<SchemaMetadataRecord>({
        TableName: getSchemasTableOrThrow(),
        Key: { schemaId: mapping.targetSchemaId },
      }),
    ]);

    if (!sourceSchemaMeta) {
      const err = notFound('Schema', mapping.sourceSchemaId, requestId);
      return errorResponse(err.code, `Source ${err.message}`, err.statusCode, err.retryable, requestId);
    }

    if (!targetSchemaMeta) {
      const err = notFound('Schema', mapping.targetSchemaId, requestId);
      return errorResponse(err.code, `Target ${err.message}`, err.statusCode, err.retryable, requestId);
    }

    const sourceNodes = await query<SchemaNodeRecord>({
      TableName: getSchemaNodesTableOrThrow(),
      KeyConditionExpression: '#schemaId = :schemaId',
      ExpressionAttributeNames: {
        '#schemaId': 'schemaId',
      },
      ExpressionAttributeValues: {
        ':schemaId': mapping.sourceSchemaId,
      },
    });

    const sourceContext = buildSourceContext(sourceNodes);
    if (sourceContext.includedNodeCount === 0) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `Source schema '${mapping.sourceSchemaId}' has no retrievable context for suggestion generation`,
        400,
        false,
        requestId,
      );
    }

    const [sourceSchemaRaw, targetSchemaRaw] = await Promise.all([
      getObject({
        Bucket: getContentBucketOrThrow(),
        Key: contentKey(sourceSchemaMeta.schemaId, sourceSchemaMeta.format),
      }),
      getObject({
        Bucket: getContentBucketOrThrow(),
        Key: contentKey(targetSchemaMeta.schemaId, targetSchemaMeta.format),
      }),
    ]);

    const sourceSchema = parseSchemaContent(sourceSchemaRaw, sourceSchemaMeta.format);
    const targetSchema = parseSchemaContent(targetSchemaRaw, targetSchemaMeta.format);

    const result = await invokeAI<SuggestExpressionAIOutput>('nl-to-rule', {
      instruction,
      targetPath,
      targetType,
      targetDescription,
      sourceFields: sourceContext.sourceFields,
    });

    if (result.success) {
      const expression = result.data?.expression;
      if (typeof expression !== 'string' || expression.trim() === '') {
        const normalized = normalizeAIError({
          code: 'INVALID_MODEL_OUTPUT',
          message: 'Model response failed schema validation: expression must be a non-empty string',
        });
        return errorResponse(
          normalized.code,
          normalized.message,
          normalized.statusCode,
          normalized.retryable,
          requestId,
        );
      }

      const validation = validateGeneratedExpression({
        expression: expression.trim(),
        targetPath,
        targetType,
        sourceSchema,
        targetSchema,
      });

      return jsonResponse(
        200,
        {
          ...result,
          data: {
            ...result.data,
            expression: expression.trim(),
            validation,
            readyToApply: validation.valid,
            context: {
              sourceNodeCount: sourceContext.sourceNodeCount,
              includedNodeCount: sourceContext.includedNodeCount,
              truncated: sourceContext.wasTruncated,
              approxTokenCount: sourceContext.approxTokenCount,
              byteLength: sourceContext.byteLength,
            },
          },
        },
        requestId,
      );
    }

    const normalized = normalizeAIError(result.error);
    return errorResponse(
      normalized.code,
      normalized.message,
      normalized.statusCode,
      normalized.retryable,
      requestId,
    );
  } catch {
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Unexpected error while handling request',
      500,
      true,
      requestId,
    );
  }
}
