import {
  ERROR_CODES,
  errorResponse,
  generateRequestId,
  getItem,
  getObject,
  jsonResponse,
  notFound,
  parseBody,
  query,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { invokeAI, normalizeAIError, PROMPT_IDS } from '../../lib/ai/index.js';
import {
  classifySchemaSizeSegment,
  emitRetrievalTelemetry,
  readCorrelationId,
} from '../../lib/ai/telemetry.js';

type ValidationIssueCategory = 'correctness' | 'completeness' | 'maintainability' | 'risk';
type ValidationIssueSeverity = 'info' | 'warning' | 'error';

type SampleDataContentType = 'application/json' | 'text/json' | 'application/xml' | 'text/xml';

interface ValidateMappingsRequestBody {
  readonly mappingId: string;
  readonly sampleData?: {
    readonly contentType: SampleDataContentType;
    readonly content: string;
  };
}

interface MappingMetadataRecord {
  readonly mappingId: string;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly configS3Key?: string;
}

interface SchemaNodeRecord {
  readonly schemaId: string;
  readonly path: string;
  readonly type: string;
  readonly description?: string;
}

interface MappingRuleRecord {
  readonly target?: string;
  readonly type?: string;
  readonly expression?: string;
}

interface MappingConfigRecord {
  readonly rules?: readonly MappingRuleRecord[];
}

interface ValidateMappingsIssue {
  readonly id: string;
  readonly category: ValidationIssueCategory;
  readonly severity: ValidationIssueSeverity;
  readonly affectedRules: ReadonlyArray<{
    readonly ruleIndex?: number;
    readonly targetPath?: string;
  }>;
  readonly description: string;
  readonly recommendation: string;
}

interface ValidateMappingsReportSummary {
  readonly totalIssues: number;
  readonly bySeverity: Record<ValidationIssueSeverity, number>;
  readonly byCategory: Record<ValidationIssueCategory, number>;
}

interface ValidateMappingsReport {
  readonly summary: ValidateMappingsReportSummary;
  readonly issues: readonly ValidateMappingsIssue[];
  readonly notes?: string;
  readonly meta?: {
    readonly generatedAt?: string;
    readonly model?: string;
    readonly promptId?: string;
  };
}

const MAX_SAMPLE_DATA_BYTES = 1024 * 1024;

const ALLOWED_SAMPLE_DATA_CONTENT_TYPES = new Set<SampleDataContentType>([
  'application/json',
  'text/json',
  'application/xml',
  'text/xml',
]);

const CATEGORY_SET = new Set<ValidationIssueCategory>([
  'correctness',
  'completeness',
  'maintainability',
  'risk',
]);

const SEVERITY_SET = new Set<ValidationIssueSeverity>(['info', 'warning', 'error']);

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const SCHEMA_NODES_TABLE = getEnvValue('SCHEMA_NODES_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET');

function getMappingsTableOrThrow(): string {
  const value = MAPPINGS_TABLE?.trim();
  if (!value) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
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

function getByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function parseValidateMappingsBody(body: Record<string, unknown>): ValidateMappingsRequestBody | null {
  if (Array.isArray(body.mappingIds)) {
    return null;
  }

  const mappingId = body.mappingId;
  if (typeof mappingId !== 'string' || mappingId.trim() === '') {
    return null;
  }

  if (body.sampleData === undefined) {
    return { mappingId };
  }

  if (typeof body.sampleData !== 'object' || body.sampleData === null || Array.isArray(body.sampleData)) {
    return null;
  }

  const sampleData = body.sampleData as Record<string, unknown>;
  const contentType = sampleData.contentType;
  const content = sampleData.content;

  if (typeof contentType !== 'string' || !ALLOWED_SAMPLE_DATA_CONTENT_TYPES.has(contentType as SampleDataContentType)) {
    return null;
  }

  if (typeof content !== 'string' || content.trim() === '') {
    return null;
  }

  if (getByteLength(content) > MAX_SAMPLE_DATA_BYTES) {
    return {
      mappingId,
      sampleData: {
        contentType: contentType as SampleDataContentType,
        content,
      },
    };
  }

  return {
    mappingId,
    sampleData: {
      contentType: contentType as SampleDataContentType,
      content,
    },
  };
}

function validateSampleDataBounds(sampleData: ValidateMappingsRequestBody['sampleData']): string | null {
  if (!sampleData) {
    return null;
  }

  if (!ALLOWED_SAMPLE_DATA_CONTENT_TYPES.has(sampleData.contentType)) {
    return 'sampleData.contentType must be JSON/XML text (`application/json`, `text/json`, `application/xml`, or `text/xml`)';
  }

  if (getByteLength(sampleData.content) > MAX_SAMPLE_DATA_BYTES) {
    return 'sampleData.content exceeds maximum allowed payload size of 1 MB';
  }

  return null;
}

function buildSchemaContext(nodes: readonly SchemaNodeRecord[], label: string): string {
  const sorted = [...nodes].sort((a, b) => a.path.localeCompare(b.path));
  const lines = sorted.map((node) => {
    if (typeof node.description === 'string' && node.description.trim() !== '') {
      return `- ${node.path} (${node.type}) — ${node.description.trim()}`;
    }

    return `- ${node.path} (${node.type})`;
  });

  return `${label}\n${lines.join('\n')}`;
}

function parseMappingRules(configRaw: string): readonly MappingRuleRecord[] {
  const parsed = JSON.parse(configRaw) as MappingConfigRecord;
  return Array.isArray(parsed.rules) ? parsed.rules : [];
}

function isIssueCategory(value: unknown): value is ValidationIssueCategory {
  return typeof value === 'string' && CATEGORY_SET.has(value as ValidationIssueCategory);
}

function isIssueSeverity(value: unknown): value is ValidationIssueSeverity {
  return typeof value === 'string' && SEVERITY_SET.has(value as ValidationIssueSeverity);
}

function isAffectedRuleReference(value: unknown): value is { ruleIndex?: number; targetPath?: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const hasRuleIndex = typeof record.ruleIndex === 'number' && Number.isInteger(record.ruleIndex) && record.ruleIndex >= 0;
  const hasTargetPath = typeof record.targetPath === 'string' && record.targetPath.trim() !== '';

  return hasRuleIndex || hasTargetPath;
}

function isValidateMappingsIssue(value: unknown): value is ValidateMappingsIssue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.trim() === '') {
    return false;
  }

  if (!isIssueCategory(record.category) || !isIssueSeverity(record.severity)) {
    return false;
  }

  if (!Array.isArray(record.affectedRules) || !record.affectedRules.every((entry) => isAffectedRuleReference(entry))) {
    return false;
  }

  if (typeof record.description !== 'string' || record.description.trim() === '') {
    return false;
  }

  if (typeof record.recommendation !== 'string' || record.recommendation.trim() === '') {
    return false;
  }

  return true;
}

function isValidateMappingsSummary(value: unknown): value is ValidateMappingsReportSummary {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.totalIssues !== 'number' || !Number.isInteger(record.totalIssues) || record.totalIssues < 0) {
    return false;
  }

  const bySeverity = record.bySeverity;
  if (typeof bySeverity !== 'object' || bySeverity === null || Array.isArray(bySeverity)) {
    return false;
  }

  const bySeverityRecord = bySeverity as Record<string, unknown>;
  for (const key of ['info', 'warning', 'error'] as const) {
    if (typeof bySeverityRecord[key] !== 'number' || bySeverityRecord[key] < 0) {
      return false;
    }
  }

  const byCategory = record.byCategory;
  if (typeof byCategory !== 'object' || byCategory === null || Array.isArray(byCategory)) {
    return false;
  }

  const byCategoryRecord = byCategory as Record<string, unknown>;
  for (const key of ['correctness', 'completeness', 'maintainability', 'risk'] as const) {
    if (typeof byCategoryRecord[key] !== 'number' || byCategoryRecord[key] < 0) {
      return false;
    }
  }

  return true;
}

function isValidateMappingsReport(value: unknown): value is ValidateMappingsReport {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (!isValidateMappingsSummary(record.summary)) {
    return false;
  }

  if (!Array.isArray(record.issues) || !record.issues.every((issue) => isValidateMappingsIssue(issue))) {
    return false;
  }

  if (record.notes !== undefined && (typeof record.notes !== 'string' || record.notes.trim() === '')) {
    return false;
  }

  if (record.meta !== undefined) {
    if (typeof record.meta !== 'object' || record.meta === null || Array.isArray(record.meta)) {
      return false;
    }

    const meta = record.meta as Record<string, unknown>;
    if (meta.generatedAt !== undefined && typeof meta.generatedAt !== 'string') {
      return false;
    }
    if (meta.model !== undefined && typeof meta.model !== 'string') {
      return false;
    }
    if (meta.promptId !== undefined && typeof meta.promptId !== 'string') {
      return false;
    }
  }

  return true;
}

function isBatchPayload(requestBody: Record<string, unknown>): boolean {
  return Array.isArray(requestBody.mappingIds);
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();
  const correlationId = readCorrelationId(event.headers);
  const requestBody = parseBody(event);

  if (!requestBody) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid request body', 400, false, requestId);
  }

  if (isBatchPayload(requestBody)) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Batch validation is not supported in V1. Provide a single mappingId.',
      400,
      false,
      requestId,
    );
  }

  const parsed = parseValidateMappingsBody(requestBody);
  if (!parsed) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Missing or invalid required fields: mappingId and optional sampleData { contentType, content }',
      400,
      false,
      requestId,
    );
  }

  const sampleDataError = validateSampleDataBounds(parsed.sampleData);
  if (sampleDataError) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, sampleDataError, 400, false, requestId);
  }

  try {
    const mapping = await getItem<MappingMetadataRecord>({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId: parsed.mappingId },
    });

    if (!mapping) {
      const err = notFound('Mapping', parsed.mappingId, requestId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    if (!mapping.sourceSchemaId || !mapping.targetSchemaId || !mapping.configS3Key) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `Mapping '${parsed.mappingId}' is missing required schema/config references`,
        400,
        false,
        requestId,
      );
    }

    const retrievalStartedAt = Date.now();
    const [mappingConfigRaw, sourceNodes, targetNodes] = await Promise.all([
      getObject({
        Bucket: getContentBucketOrThrow(),
        Key: mapping.configS3Key,
      }),
      query<SchemaNodeRecord>({
        TableName: getSchemaNodesTableOrThrow(),
        KeyConditionExpression: '#schemaId = :schemaId',
        ExpressionAttributeNames: {
          '#schemaId': 'schemaId',
        },
        ExpressionAttributeValues: {
          ':schemaId': mapping.sourceSchemaId,
        },
      }),
      query<SchemaNodeRecord>({
        TableName: getSchemaNodesTableOrThrow(),
        KeyConditionExpression: '#schemaId = :schemaId',
        ExpressionAttributeNames: {
          '#schemaId': 'schemaId',
        },
        ExpressionAttributeValues: {
          ':schemaId': mapping.targetSchemaId,
        },
      }),
    ]);

    const rules = parseMappingRules(mappingConfigRaw);

    const sourceSchemaContext = buildSchemaContext(sourceNodes, 'Source schema context:');
    const targetSchemaContext = buildSchemaContext(targetNodes, 'Target schema context:');

    emitRetrievalTelemetry('retrieval.completed', {
      handler: 'ai.validate-mappings',
      request_id: requestId,
      correlation_id: correlationId,
      schema_id: mapping.sourceSchemaId,
      retriever_mode: 'dynamodb',
      schema_size_segment: classifySchemaSizeSegment(undefined),
      query_length: parsed.mappingId.length,
      candidate_count: sourceNodes.length,
      result_count: sourceNodes.length,
      retrieval_ms: Date.now() - retrievalStartedAt,
      include_context_expansion: false,
    });

    const result = await invokeAI<ValidateMappingsReport>(PROMPT_IDS.AI_VALIDATION, {
      mappingId: parsed.mappingId,
      mappingConfig: mappingConfigRaw,
      sourceSchemaContext,
      targetSchemaContext,
      rulesSummary: JSON.stringify({
        totalRules: rules.length,
        sample: rules.slice(0, 50),
      }),
      sampleData: parsed.sampleData
        ? JSON.stringify({
            contentType: parsed.sampleData.contentType,
            content: parsed.sampleData.content,
          })
        : '',
      sampleDataContentType: parsed.sampleData?.contentType ?? '',
      sampleDataProvided: parsed.sampleData ? 'true' : 'false',
    }, {
      telemetry: {
        requestId,
        correlationId,
      },
    });

    if (result.success) {
      if (!isValidateMappingsReport(result.data)) {
        const normalized = normalizeAIError({
          code: 'INVALID_MODEL_OUTPUT',
          message:
            'Model response failed schema validation: report must include summary and issues[] with canonical category/severity enums',
        });
        return errorResponse(
          normalized.code,
          normalized.message,
          normalized.statusCode,
          normalized.retryable,
          requestId,
        );
      }

      return jsonResponse(200, result, requestId);
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
