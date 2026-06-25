import {
  classifySchemaSizeSegment,
  emitRetrievalTelemetry,
  readCorrelationId,
} from '../../lib/ai/telemetry.js';
import {
  ERROR_CODES,
  conflict,
  generateRequestId,
  getItem,
  getObject,
  notFound,
  parseBody,
  query,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { invokeAI, normalizeAIError } from '../../lib/ai/index.js';
import { validate } from '../../engine/index.js';
import {
  aiErrorResponse,
  aiJsonResponse,
  aiOptionsResponse,
  isOptionsRequest,
} from './cors.js';
import { logAiHandlerError, mapKnownAiFailure } from './error-logging.js';

interface SmartFixDiagnosticInput {
  readonly code: string;
  readonly message: string;
  readonly severity?: 'error' | 'warning' | 'info' | string;
  readonly path?: string;
}

interface SmartFixRequestBody {
  readonly mappingId: string;
  readonly ruleIndex: number;
  readonly targetPath: string;
  readonly targetType?: string;
  readonly failingExpression: string;
  readonly diagnostics: readonly SmartFixDiagnosticInput[];
  readonly diagnosticScope?: 'all' | 'single';
  readonly selectedDiagnosticIndex?: number;
  readonly ruleVersion?: number;
  readonly ruleHash?: string;
}

interface MappingMetadataRecord {
  readonly mappingId: string;
  readonly version: number;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly configS3Key?: string;
}

interface SchemaMetadataRecord {
  readonly schemaId: string;
  readonly format: 'json-schema' | 'xsd';
  readonly fieldCount?: number;
}

interface SchemaNodeRecord {
  readonly schemaId: string;
  readonly path: string;
  readonly fieldName: string;
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

interface SmartFixAIOutput {
  readonly correctedExpression?: string;
  readonly expression?: string;
  readonly explanation?: string;
  readonly changes?: string;
}

interface SmartFixSuccessData {
  readonly originalExpression: string;
  readonly suggestedExpression: string;
  readonly explanation: string;
  readonly validation: ExpressionValidationResult;
  readonly readyToApply: boolean;
  readonly diagnosticsScopeApplied: 'all' | 'single';
  readonly context: {
    readonly truncated: boolean;
    readonly approxTokenCount: number;
    readonly byteLength: number;
    readonly totalDiagnosticCount: number;
    readonly includedDiagnosticCount: number;
    readonly sourceNodeCount: number;
    readonly includedSourceNodeCount: number;
    readonly targetNodeCount: number;
    readonly includedTargetNodeCount: number;
  };
  readonly applyGuard: {
    readonly ruleVersion: number;
    readonly ruleHash: string;
  };
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

interface ContextAssemblyResult {
  readonly sourceContext: string;
  readonly targetContext: string;
  readonly diagnosticsContext: string;
  readonly truncated: boolean;
  readonly approxTokenCount: number;
  readonly byteLength: number;
  readonly sourceNodeCount: number;
  readonly includedSourceNodeCount: number;
  readonly targetNodeCount: number;
  readonly includedTargetNodeCount: number;
  readonly totalDiagnosticCount: number;
  readonly includedDiagnosticCount: number;
}

const MAX_CONTEXT_BYTES = 64 * 1024;
const MAX_CONTEXT_TOKENS = 8_000;
const APPROX_CHARS_PER_TOKEN = 4;

type Severity = 'error' | 'warning' | 'info';

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

function normalizeSeverity(value: string | undefined): Severity {
  if (value === 'error' || value === 'warning' || value === 'info') {
    return value;
  }

  return 'info';
}

function severityRank(value: Severity): number {
  switch (value) {
    case 'error':
      return 3;
    case 'warning':
      return 2;
    default:
      return 1;
  }
}

function formatDiagnosticLine(diagnostic: SmartFixDiagnosticInput): string {
  const severity = normalizeSeverity(diagnostic.severity);
  const pathSuffix = typeof diagnostic.path === 'string' && diagnostic.path.trim() !== ''
    ? ` @ ${diagnostic.path.trim()}`
    : '';

  return `- [${severity.toUpperCase()}] ${diagnostic.code}: ${diagnostic.message}${pathSuffix}`;
}

function getByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function estimateTokenCount(value: string): number {
  return Math.ceil(value.length / APPROX_CHARS_PER_TOKEN);
}

function appendWithinLimit(current: string, line: string): { value: string; appended: boolean } {
  const candidate = current === '' ? line : `${current}\n${line}`;
  if (getByteLength(candidate) > MAX_CONTEXT_BYTES || estimateTokenCount(candidate) > MAX_CONTEXT_TOKENS) {
    return { value: current, appended: false };
  }

  return { value: candidate, appended: true };
}

function buildSchemaLines(nodes: readonly SchemaNodeRecord[]): readonly string[] {
  return [...nodes]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((node) => {
      if (typeof node.description === 'string' && node.description.trim() !== '') {
        return `- ${node.path} (${node.type}) — ${node.description.trim()}`;
      }

      return `- ${node.path} (${node.type})`;
    });
}

function buildContextBundle(params: {
  diagnostics: readonly SmartFixDiagnosticInput[];
  sourceNodes: readonly SchemaNodeRecord[];
  targetNodes: readonly SchemaNodeRecord[];
}): ContextAssemblyResult {
  const prioritizedDiagnostics = [...params.diagnostics]
    .map((diagnostic, index) => ({ diagnostic, index }))
    .sort((a, b) => {
      const severityDiff = severityRank(normalizeSeverity(b.diagnostic.severity))
        - severityRank(normalizeSeverity(a.diagnostic.severity));
      if (severityDiff !== 0) {
        return severityDiff;
      }

      return b.index - a.index;
    });

  const sourceLines = buildSchemaLines(params.sourceNodes);
  const targetLines = buildSchemaLines(params.targetNodes);

  let diagnosticsContext = '';
  let sourceContext = '';
  let targetContext = '';

  let includedDiagnosticCount = 0;
  let includedSourceNodeCount = 0;
  let includedTargetNodeCount = 0;

  const diagnosticsHeader = 'Diagnostics:';
  const diagnosticsHeaderAttempt = appendWithinLimit('', diagnosticsHeader);
  if (diagnosticsHeaderAttempt.appended) {
    diagnosticsContext = diagnosticsHeaderAttempt.value;
  }

  for (const entry of prioritizedDiagnostics) {
    const line = formatDiagnosticLine(entry.diagnostic);
    const attempt = appendWithinLimit(diagnosticsContext, line);
    if (!attempt.appended) {
      break;
    }

    diagnosticsContext = attempt.value;
    includedDiagnosticCount += 1;
  }

  const sourceHeader = 'Source schema context:';
  const sourceHeaderAttempt = appendWithinLimit(diagnosticsContext, sourceHeader);
  if (sourceHeaderAttempt.appended) {
    diagnosticsContext = sourceHeaderAttempt.value;
  }

  for (const line of sourceLines) {
    const attempt = appendWithinLimit(diagnosticsContext, line);
    if (!attempt.appended) {
      break;
    }

    diagnosticsContext = attempt.value;
    includedSourceNodeCount += 1;
  }

  if (includedSourceNodeCount > 0) {
    sourceContext = ['Source schema context:', ...sourceLines.slice(0, includedSourceNodeCount)].join('\n');
  }

  const targetHeader = 'Target schema context:';
  const targetHeaderAttempt = appendWithinLimit(diagnosticsContext, targetHeader);
  if (targetHeaderAttempt.appended) {
    diagnosticsContext = targetHeaderAttempt.value;
  }

  for (const line of targetLines) {
    const attempt = appendWithinLimit(diagnosticsContext, line);
    if (!attempt.appended) {
      break;
    }

    diagnosticsContext = attempt.value;
    includedTargetNodeCount += 1;
  }

  if (includedTargetNodeCount > 0) {
    targetContext = ['Target schema context:', ...targetLines.slice(0, includedTargetNodeCount)].join('\n');
  }

  const truncated = includedDiagnosticCount < prioritizedDiagnostics.length
    || includedSourceNodeCount < sourceLines.length
    || includedTargetNodeCount < targetLines.length;

  return {
    sourceContext,
    targetContext,
    diagnosticsContext,
    truncated,
    approxTokenCount: estimateTokenCount(diagnosticsContext),
    byteLength: getByteLength(diagnosticsContext),
    sourceNodeCount: sourceLines.length,
    includedSourceNodeCount,
    targetNodeCount: targetLines.length,
    includedTargetNodeCount,
    totalDiagnosticCount: prioritizedDiagnostics.length,
    includedDiagnosticCount,
  };
}

function normalizeRuleType(value: string | undefined): 'string' | 'number' | 'boolean' | 'array' | 'object' {
  const normalized = (value ?? '').trim().toLowerCase();
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
  targetType?: string;
  sourceSchema: unknown;
  targetSchema: unknown;
}): ExpressionValidationResult {
  const result = validate(
    {
      name: 'Smart Fix Validation',
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

function parseSmartFixBody(body: Record<string, unknown>): SmartFixRequestBody | null {
  const mappingId = body.mappingId;
  const ruleIndex = body.ruleIndex;
  const targetPath = body.targetPath;
  const failingExpression = body.failingExpression;
  const diagnostics = body.diagnostics;

  if (typeof mappingId !== 'string' || mappingId.trim() === '') {
    return null;
  }

  if (typeof ruleIndex !== 'number' || !Number.isInteger(ruleIndex) || ruleIndex < 0) {
    return null;
  }

  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    return null;
  }

  if (typeof failingExpression !== 'string' || failingExpression.trim() === '') {
    return null;
  }

  if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
    return null;
  }

  const normalizedDiagnostics: SmartFixDiagnosticInput[] = [];
  for (const entry of diagnostics) {
    if (typeof entry !== 'object' || entry === null) {
      return null;
    }

    const record = entry as Record<string, unknown>;
    if (typeof record.code !== 'string' || record.code.trim() === '') {
      return null;
    }
    if (typeof record.message !== 'string' || record.message.trim() === '') {
      return null;
    }

    normalizedDiagnostics.push({
      code: record.code,
      message: record.message,
      severity: typeof record.severity === 'string' ? record.severity : undefined,
      path: typeof record.path === 'string' ? record.path : undefined,
    });
  }

  const diagnosticScope = body.diagnosticScope;
  if (diagnosticScope !== undefined && diagnosticScope !== 'all' && diagnosticScope !== 'single') {
    return null;
  }

  const selectedDiagnosticIndex = body.selectedDiagnosticIndex;
  if (selectedDiagnosticIndex !== undefined
    && (typeof selectedDiagnosticIndex !== 'number'
      || !Number.isInteger(selectedDiagnosticIndex)
      || selectedDiagnosticIndex < 0)) {
    return null;
  }

  const ruleVersion = body.ruleVersion;
  if (ruleVersion !== undefined && (typeof ruleVersion !== 'number' || !Number.isInteger(ruleVersion) || ruleVersion < 0)) {
    return null;
  }

  const ruleHash = body.ruleHash;
  if (ruleHash !== undefined && (typeof ruleHash !== 'string' || ruleHash.trim() === '')) {
    return null;
  }

  const targetType = typeof body.targetType === 'string' ? body.targetType : undefined;

  return {
    mappingId,
    ruleIndex,
    targetPath,
    targetType,
    failingExpression,
    diagnostics: normalizedDiagnostics,
    diagnosticScope,
    selectedDiagnosticIndex: typeof selectedDiagnosticIndex === 'number' ? selectedDiagnosticIndex : undefined,
    ruleVersion: typeof ruleVersion === 'number' ? ruleVersion : undefined,
    ruleHash: typeof ruleHash === 'string' ? ruleHash : undefined,
  };
}

function selectDiagnostics(
  diagnostics: readonly SmartFixDiagnosticInput[],
  scope: 'all' | 'single',
  selectedDiagnosticIndex: number | undefined,
): readonly SmartFixDiagnosticInput[] | null {
  if (scope === 'single') {
    if (typeof selectedDiagnosticIndex !== 'number' || selectedDiagnosticIndex >= diagnostics.length) {
      return null;
    }

    const selectedDiagnostic = diagnostics[selectedDiagnosticIndex];
    if (!selectedDiagnostic) {
      return null;
    }

    return [selectedDiagnostic];
  }

  return diagnostics;
}

function computeRuleHash(rule: { target: string; expression: string; type: string }): string {
  const text = JSON.stringify(rule);
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function resolveSuggestedExpression(data: SmartFixAIOutput): string | null {
  const candidate = typeof data.correctedExpression === 'string'
    ? data.correctedExpression
    : typeof data.expression === 'string'
      ? data.expression
      : null;

  if (candidate === null) {
    return null;
  }

  const trimmed = candidate.trim();
  if (trimmed === '') {
    return null;
  }

  return trimmed;
}

function resolveExplanation(data: SmartFixAIOutput): string {
  const candidate = typeof data.explanation === 'string' ? data.explanation : data.changes;
  if (typeof candidate !== 'string') {
    return '';
  }

  return candidate.trim();
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();

  if (isOptionsRequest(event)) {
    return aiOptionsResponse(requestId);
  }

  const correlationId = readCorrelationId(event.headers);
  const requestBody = parseBody(event);

  if (!requestBody) {
    return aiErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid request body', 400, false, requestId);
  }

  const parsed = parseSmartFixBody(requestBody);
  if (!parsed) {
    return aiErrorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Missing or invalid required Smart Fix fields',
      400,
      false,
      requestId,
    );
  }

  const scope = parsed.diagnosticScope ?? 'all';
  const selectedDiagnostics = selectDiagnostics(parsed.diagnostics, scope, parsed.selectedDiagnosticIndex);
  if (!selectedDiagnostics) {
    return aiErrorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid selectedDiagnosticIndex for diagnosticScope=single',
      400,
      false,
      requestId,
    );
  }

  try {
    const mapping = await getItem<MappingMetadataRecord>({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId: parsed.mappingId },
    });

    if (!mapping) {
      const err = notFound('Mapping', parsed.mappingId, requestId);
      return aiErrorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    if (!mapping.sourceSchemaId || !mapping.targetSchemaId || !mapping.configS3Key) {
      return aiErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `Mapping '${parsed.mappingId}' is missing required schema/config references`,
        400,
        false,
        requestId,
      );
    }

    const mappingConfigRaw = await getObject({
      Bucket: getContentBucketOrThrow(),
      Key: mapping.configS3Key,
    });
    const mappingConfig = JSON.parse(mappingConfigRaw) as MappingConfigRecord;

    const rules = Array.isArray(mappingConfig.rules) ? mappingConfig.rules : [];
    const selectedRule = rules[parsed.ruleIndex];
    if (!selectedRule || typeof selectedRule !== 'object') {
      return aiErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `Rule index '${parsed.ruleIndex}' is out of range for mapping '${parsed.mappingId}'`,
        400,
        false,
        requestId,
      );
    }

    const currentRule = {
      target: typeof selectedRule.target === 'string' ? selectedRule.target : '',
      expression: typeof selectedRule.expression === 'string' ? selectedRule.expression : '',
      type: typeof selectedRule.type === 'string' ? selectedRule.type : (parsed.targetType ?? 'string'),
    };

    if (currentRule.target !== parsed.targetPath) {
      return aiErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `Rule targetPath mismatch for index '${parsed.ruleIndex}'`,
        400,
        false,
        requestId,
      );
    }

    if (parsed.ruleVersion !== undefined && parsed.ruleVersion !== mapping.version) {
      const staleError = conflict(
        'Rule snapshot is stale. Re-run fix on latest rule before applying.',
        requestId,
      );
      return aiErrorResponse(
        staleError.code,
        staleError.message,
        staleError.statusCode,
        staleError.retryable,
        requestId,
      );
    }

    const computedRuleHash = computeRuleHash({
      target: currentRule.target,
      expression: currentRule.expression,
      type: currentRule.type,
    });

    if (parsed.ruleHash !== undefined && parsed.ruleHash !== computedRuleHash) {
      const staleError = conflict(
        'Rule hash mismatch. Re-run fix on latest rule before applying.',
        requestId,
      );
      return aiErrorResponse(
        staleError.code,
        staleError.message,
        staleError.statusCode,
        staleError.retryable,
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
      return aiErrorResponse(err.code, `Source ${err.message}`, err.statusCode, err.retryable, requestId);
    }

    if (!targetSchemaMeta) {
      const err = notFound('Schema', mapping.targetSchemaId, requestId);
      return aiErrorResponse(err.code, `Target ${err.message}`, err.statusCode, err.retryable, requestId);
    }

    const retrievalStartedAt = Date.now();
    const [sourceNodes, targetNodes] = await Promise.all([
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

    const context = buildContextBundle({
      diagnostics: selectedDiagnostics,
      sourceNodes,
      targetNodes,
    });

    emitRetrievalTelemetry('retrieval.completed', {
      handler: 'ai.smart-fix',
      request_id: requestId,
      correlation_id: correlationId,
      schema_id: mapping.sourceSchemaId,
      retriever_mode: 'dynamodb',
      schema_field_count: typeof sourceSchemaMeta.fieldCount === 'number'
        ? Math.floor(sourceSchemaMeta.fieldCount)
        : undefined,
      schema_size_segment: classifySchemaSizeSegment(sourceSchemaMeta.fieldCount),
      query_length: parsed.failingExpression.length,
      candidate_count: sourceNodes.length,
      result_count: context.includedSourceNodeCount,
      retrieval_ms: Date.now() - retrievalStartedAt,
      include_context_expansion: false,
    });

    if (context.includedDiagnosticCount === 0) {
      return aiErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'No diagnostics could be included within Smart Fix context limits',
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

    const result = await invokeAI<SmartFixAIOutput>('smart-fix', {
      mappingId: parsed.mappingId,
      ruleIndex: String(parsed.ruleIndex),
      targetPath: parsed.targetPath,
      targetType: parsed.targetType ?? currentRule.type,
      failingExpression: parsed.failingExpression,
      diagnosticsContext: context.diagnosticsContext,
      diagnosticsScope: scope,
      sourceContext: context.sourceContext,
      targetContext: context.targetContext,
      ruleVersion: String(mapping.version),
      ruleHash: computedRuleHash,
    }, {
      telemetry: {
        requestId,
        correlationId,
      },
    });

    if (result.success) {
      const suggestedExpression = resolveSuggestedExpression(result.data);
      if (!suggestedExpression) {
        const normalized = normalizeAIError({
          code: 'INVALID_MODEL_OUTPUT',
          message: 'Model response failed schema validation: corrected expression must be a non-empty string',
        });
        return aiErrorResponse(
          normalized.code,
          normalized.message,
          normalized.statusCode,
          normalized.retryable,
          requestId,
        );
      }

      const validation = validateGeneratedExpression({
        expression: suggestedExpression,
        targetPath: parsed.targetPath,
        targetType: parsed.targetType ?? currentRule.type,
        sourceSchema,
        targetSchema,
      });

      const successPayload: SmartFixSuccessData = {
        originalExpression: parsed.failingExpression,
        suggestedExpression,
        explanation: resolveExplanation(result.data),
        validation,
        readyToApply: validation.valid,
        diagnosticsScopeApplied: scope,
        context: {
          truncated: context.truncated,
          approxTokenCount: context.approxTokenCount,
          byteLength: context.byteLength,
          totalDiagnosticCount: context.totalDiagnosticCount,
          includedDiagnosticCount: context.includedDiagnosticCount,
          sourceNodeCount: context.sourceNodeCount,
          includedSourceNodeCount: context.includedSourceNodeCount,
          targetNodeCount: context.targetNodeCount,
          includedTargetNodeCount: context.includedTargetNodeCount,
        },
        applyGuard: {
          ruleVersion: mapping.version,
          ruleHash: computedRuleHash,
        },
      };

      return aiJsonResponse(
        200,
        {
          ...result,
          data: successPayload,
        },
        requestId,
      );
    }

    const normalized = normalizeAIError(result.error);
    return aiErrorResponse(
      normalized.code,
      normalized.message,
      normalized.statusCode,
      normalized.retryable,
      requestId,
    );
  } catch (error) {
    const known = mapKnownAiFailure(error);
    if (known) {
      return aiErrorResponse(known.code, known.message, known.statusCode, known.retryable, requestId);
    }

    logAiHandlerError('[smart-fix lambda]', requestId, error);
    return aiErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Unexpected error while handling request',
      500,
      true,
      requestId,
    );
  }
}
