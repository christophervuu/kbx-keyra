import {
  DynamoServiceError,
  ERROR_CODES,
  S3ServiceError,
  errorResponse,
  getObject,
  getItem,
  internalError,
  jsonResponse,
  notFound,
  parseBody,
  parsePathParam,
  putObject,
  updateItem,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import {
  normalizeSchemaOrigin,
  normalizeSchemaReviewState,
  normalizeSchemaSourceKind,
  normalizeSchemaStatus,
  normalizeSchemaSyncStatus,
  schemaDataFormatFromSourceKind,
  type CanonicalSchemaOrigin,
  type SchemaDataFormat,
  type SchemaReviewIssueCode,
  type SchemaReviewIssueSummary,
  type SchemaReviewState,
  type SchemaSourceKind,
  type SchemaStatus,
} from '../../lib/persistence/types.js';
import { applySchemaPatches, SchemaPatchError, type SchemaPatchOperation } from '../../lib/schema/patch-engine.js';

type SchemaFormat = 'json-schema' | 'xsd';
type SchemaSyncStatus = 'synced' | 'update-available' | 'sync-failed' | 'not-synced' | 'local-changes';
type SchemaSourceInfo =
  | { type: 'upload' }
  | { type: 'github'; repo: string; repoId?: number; branch: string; path: string; commitSha?: string };

type SchemaMetadataRecord = {
  readonly schemaId: string;
  readonly name: string;
  readonly format: SchemaFormat;
  readonly fieldCount: number;
  readonly origin?: CanonicalSchemaOrigin | 'published' | 'local';
  readonly ownership?: 'cdm' | 'user';
  readonly readonly?: boolean;
  readonly status?: SchemaStatus | 'ingesting';
  readonly scope?: 'global' | 'project';
  readonly description?: string;
  readonly inferred?: boolean;
  readonly sourceKind?: SchemaSourceKind;
  readonly reviewState?: SchemaReviewState;
  readonly reviewIssues?: readonly SchemaReviewIssueSummary[];
  readonly inferenceIssueCounts?: Partial<Record<SchemaReviewIssueCode, number>>;
  readonly reviewedAt?: string;
  readonly reviewedBy?: string;
  readonly samplePayloadCount?: number;
  readonly samplePayloads?: readonly unknown[];
  readonly disambiguator?: string;
  readonly syncStatus?: SchemaSyncStatus;
  readonly source: SchemaSourceInfo;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly dataFormat?: SchemaDataFormat;
};

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SCHEMAS_TABLE = getEnvValue('SCHEMAS_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET');

function getSchemasTableOrThrow(): string {
  const table = SCHEMAS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: SCHEMAS_TABLE');
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

function asSchemaFormat(value: unknown): SchemaFormat | null {
  if (value === 'json-schema' || value === 'xsd') {
    return value;
  }

  return null;
}

function asSchemaScope(value: unknown): 'global' | 'project' | null {
  if (value === 'global' || value === 'project') {
    return value;
  }

  return null;
}

function asSchemaStatus(value: unknown): SchemaStatus | 'ingesting' | null {
  if (value === 'ready' || value === 'processing' || value === 'needs_review' || value === 'error' || value === 'ingesting') {
    return value;
  }

  return null;
}

function normalizeSchemaRecordForResponse(schema: SchemaMetadataRecord): SchemaMetadataRecord {
  const sourceKind = normalizeSchemaSourceKind({
    sourceKind: schema.sourceKind,
    format: schema.format,
    inferred: schema.inferred,
  });

  return {
    ...schema,
    origin: normalizeSchemaOrigin(schema.origin),
    sourceKind,
    dataFormat: schemaDataFormatFromSourceKind(sourceKind),
    status: normalizeSchemaStatus({
      status: schema.status,
      inferred: schema.inferred,
      reviewedAt: schema.reviewedAt,
    }),
    reviewState: normalizeSchemaReviewState({
      reviewState: schema.reviewState,
      inferred: schema.inferred,
      reviewedAt: schema.reviewedAt,
    }),
    syncStatus: normalizeSchemaSyncStatus(schema.syncStatus ?? 'sync-failed'),
  };
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

function contentKey(schemaId: string, format: SchemaFormat): string {
  return `schemas/${schemaId}/content.${format === 'xsd' ? 'xsd' : 'json'}`;
}

function normalizePatchOperations(value: unknown): SchemaPatchOperation[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized: SchemaPatchOperation[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') {
      return null;
    }

    const record = candidate as Record<string, unknown>;
    if (record.op === 'set') {
      if (typeof record.pointer !== 'string') {
        return null;
      }

      normalized.push({
        op: 'set',
        pointer: record.pointer,
        value: record.value,
      });
      continue;
    }

    if (record.op === 'remove') {
      if (typeof record.pointer !== 'string') {
        return null;
      }

      normalized.push({
        op: 'remove',
        pointer: record.pointer,
      });
      continue;
    }

    if (record.op === 'addField') {
      if (
        typeof record.parentPointer !== 'string'
        || typeof record.fieldName !== 'string'
        || !record.fieldSchema
        || typeof record.fieldSchema !== 'object'
        || Array.isArray(record.fieldSchema)
      ) {
        return null;
      }

      normalized.push({
        op: 'addField',
        parentPointer: record.parentPointer,
        fieldName: record.fieldName,
        fieldSchema: record.fieldSchema as Record<string, unknown>,
        ...(typeof record.required === 'boolean' ? { required: record.required } : {}),
      });
      continue;
    }

    return null;
  }

  return normalized;
}

function isMetadataMutation(input: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(input, 'name')
    || Object.prototype.hasOwnProperty.call(input, 'description')
    || Object.prototype.hasOwnProperty.call(input, 'scope')
    || Object.prototype.hasOwnProperty.call(input, 'format')
    || Object.prototype.hasOwnProperty.call(input, 'fieldCount')
    || Object.prototype.hasOwnProperty.call(input, 'status')
    || Object.prototype.hasOwnProperty.call(input, 'reviewedAt')
    || Object.prototype.hasOwnProperty.call(input, 'reviewedBy')
    || Object.prototype.hasOwnProperty.call(input, 'disambiguator')
  );
}

function aggregateReviewIssues(input: {
  inferred?: boolean;
  reviewedAt?: string;
  reviewState?: SchemaReviewState;
  inferenceIssueCounts?: Partial<Record<SchemaReviewIssueCode, number>>;
}): readonly SchemaReviewIssueSummary[] {
  const reviewState = normalizeSchemaReviewState({
    reviewState: input.reviewState,
    inferred: input.inferred,
    reviewedAt: input.reviewedAt,
  });

  if (reviewState === 'reviewed') {
    return [];
  }

  const counts = input.inferenceIssueCounts;
  if (!counts) {
    return [];
  }

  const keys: readonly SchemaReviewIssueCode[] = [
    'low_sample_evidence',
    'type_ambiguity_conflict',
    'optionality_uncertainty',
    'empty_shape_unknown',
    'field_name_quality',
    'missing_description',
  ];

  return keys
    .map((code) => ({ code, count: Math.max(0, Math.floor(counts[code] ?? 0)), blocking: false as const }))
    .filter((entry) => entry.count > 0);
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const schemaId = parsePathParam(event, 'id');
  if (!schemaId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false);
  }

  const body = parseBody(event);
  if (!body) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing or invalid JSON request body', 400, false);
  }

  const input = body as Record<string, unknown>;
  const requestedPatches = Object.prototype.hasOwnProperty.call(input, 'patches')
    ? normalizePatchOperations(input.patches)
    : null;

  if (Object.prototype.hasOwnProperty.call(input, 'patches') && !requestedPatches) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: patches must be a valid schema patch operation array', 400, false);
  }

  const requestedFormat = Object.prototype.hasOwnProperty.call(input, 'format')
    ? asSchemaFormat(input.format)
    : null;

  if (Object.prototype.hasOwnProperty.call(input, 'format') && !requestedFormat) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: format must be json-schema or xsd', 400, false);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'scope')) {
    const scope = asSchemaScope(input.scope);
    if (!scope) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: scope must be global or project', 400, false);
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'status')) {
    const status = asSchemaStatus(input.status);
    if (!status) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: status must be ready, processing, needs_review, error, or ingesting', 400, false);
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'fieldCount')) {
    const fieldCount = input.fieldCount;
    if (typeof fieldCount !== 'number' || !Number.isFinite(fieldCount) || fieldCount < 0) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: fieldCount must be a non-negative number', 400, false);
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'name') && typeof input.name !== 'string') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: name must be a string', 400, false);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'description') && typeof input.description !== 'string') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: description must be a string', 400, false);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'reviewedAt') && typeof input.reviewedAt !== 'string') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: reviewedAt must be an ISO date string', 400, false);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'reviewedBy') && typeof input.reviewedBy !== 'string') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: reviewedBy must be a string', 400, false);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'disambiguator') && typeof input.disambiguator !== 'string') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: disambiguator must be a string', 400, false);
  }

  try {
    const existing = await getItem<SchemaMetadataRecord>({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId },
    });

    if (!existing) {
      const err = notFound('Schema', schemaId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
    }

    const effectiveFormat = requestedFormat ?? existing.format;
    const now = new Date().toISOString();
    const didUpdateContent = Object.prototype.hasOwnProperty.call(input, 'content');
    const didPatchContent = Array.isArray(requestedPatches) && requestedPatches.length > 0;

    if (didPatchContent && didUpdateContent) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Provide either content or patches, not both', 400, false);
    }

    if (didPatchContent && effectiveFormat !== 'json-schema') {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Patch operations are supported only for json-schema format',
        400,
        false,
      );
    }

    if (didUpdateContent || didPatchContent) {
      let serialized: string | null;

      if (didPatchContent) {
        try {
          const currentRaw = await getObject({
            Bucket: getContentBucketOrThrow(),
            Key: contentKey(schemaId, effectiveFormat),
          });
          const parsedCurrent = JSON.parse(currentRaw) as Record<string, unknown>;
          serialized = JSON.stringify(
            applySchemaPatches({
              content: parsedCurrent,
              patches: requestedPatches,
              changeSummary: typeof input.changeSummary === 'string' ? input.changeSummary : undefined,
            }).content,
          );
        } catch (error) {
          if (error instanceof SchemaPatchError) {
            const code = ERROR_CODES.VALIDATION_ERROR;
            return errorResponse(code, error.message, 400, false);
          }

          if (error instanceof SyntaxError) {
            return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Existing schema content is not valid JSON', 400, false);
          }

          throw error;
        }
      } else {
        serialized = toContentString(input.content, effectiveFormat);
      }

      if (!serialized) {
        return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid field: content', 400, false);
      }

      await putObject({
        Bucket: getContentBucketOrThrow(),
        Key: contentKey(schemaId, effectiveFormat),
        Body: serialized,
        ContentType: effectiveFormat === 'xsd' ? 'application/xml' : 'application/json',
      });
    }

    if (!didUpdateContent && !didPatchContent && !isMetadataMutation(input)) {
      return jsonResponse(200, normalizeSchemaRecordForResponse(existing));
    }

    const nextReviewedAt = Object.prototype.hasOwnProperty.call(input, 'reviewedAt')
      ? (input.reviewedAt as string)
      : existing.reviewedAt;

    const explicitStatus = asSchemaStatus(input.status);
    const nextStatus = normalizeSchemaStatus({
      status: explicitStatus ?? existing.status,
      inferred: existing.inferred,
      reviewedAt: nextReviewedAt,
    });

    const nextReviewState = normalizeSchemaReviewState({
      reviewState: existing.reviewState,
      inferred: existing.inferred,
      reviewedAt: nextReviewedAt,
    });

    const nextSourceKind = normalizeSchemaSourceKind({
      sourceKind: existing.sourceKind,
      format: effectiveFormat,
      inferred: existing.inferred,
    });

    const nextSyncStatus: SchemaSyncStatus = (didUpdateContent || didPatchContent) && normalizeSchemaSyncStatus(existing.syncStatus ?? 'sync-failed') === 'synced'
      ? 'sync-failed'
      : normalizeSchemaSyncStatus(existing.syncStatus ?? 'sync-failed');

    const nextReviewedBy = Object.prototype.hasOwnProperty.call(input, 'reviewedBy')
      ? (input.reviewedBy as string)
      : existing.reviewedBy;
    const nextDisambiguator = Object.prototype.hasOwnProperty.call(input, 'disambiguator')
      ? (input.disambiguator as string)
      : existing.disambiguator;

    const setClauses: string[] = [
      '#name = :name',
      '#description = :description',
      '#scope = :scope',
      '#format = :format',
      '#fieldCount = :fieldCount',
      '#status = :status',
      '#reviewState = :reviewState',
      '#reviewIssues = :reviewIssues',
      '#sourceKind = :sourceKind',
      '#dataFormat = :dataFormat',
      '#syncStatus = :syncStatus',
      '#updatedAt = :updatedAt',
    ];
    const removeClauses: string[] = [];

    if (nextReviewedAt !== undefined) {
      setClauses.push('#reviewedAt = :reviewedAt');
    } else {
      removeClauses.push('#reviewedAt');
    }

    if (nextReviewedBy !== undefined) {
      setClauses.push('#reviewedBy = :reviewedBy');
    } else {
      removeClauses.push('#reviewedBy');
    }

    if (nextDisambiguator !== undefined) {
      setClauses.push('#disambiguator = :disambiguator');
    } else {
      removeClauses.push('#disambiguator');
    }

    const updateExpression = [
      `SET ${setClauses.join(', ')}`,
      removeClauses.length > 0 ? `REMOVE ${removeClauses.join(', ')}` : undefined,
    ].filter((clause): clause is string => Boolean(clause)).join(' ');

    const expressionAttributeValues: Record<string, unknown> = {
      ':name': Object.prototype.hasOwnProperty.call(input, 'name') ? input.name : existing.name,
      ':description': Object.prototype.hasOwnProperty.call(input, 'description') ? input.description : (existing.description ?? ''),
      ':scope': Object.prototype.hasOwnProperty.call(input, 'scope') ? input.scope : (existing.scope ?? 'project'),
      ':format': effectiveFormat,
      ':fieldCount': Object.prototype.hasOwnProperty.call(input, 'fieldCount') ? input.fieldCount : existing.fieldCount,
      ':status': nextStatus,
      ':reviewState': nextReviewState,
      ':reviewIssues': aggregateReviewIssues({
        inferred: existing.inferred,
        reviewedAt: nextReviewedAt,
        reviewState: nextReviewState,
        inferenceIssueCounts: existing.inferenceIssueCounts,
      }),
      ':sourceKind': nextSourceKind,
      ':dataFormat': schemaDataFormatFromSourceKind(nextSourceKind),
      ':syncStatus': nextSyncStatus,
      ':updatedAt': now,
      ...(nextReviewedAt !== undefined ? { ':reviewedAt': nextReviewedAt } : {}),
      ...(nextReviewedBy !== undefined ? { ':reviewedBy': nextReviewedBy } : {}),
      ...(nextDisambiguator !== undefined ? { ':disambiguator': nextDisambiguator } : {}),
    };

    const updated = await updateItem<SchemaMetadataRecord>({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: {
        '#name': 'name',
        '#description': 'description',
        '#scope': 'scope',
        '#format': 'format',
        '#fieldCount': 'fieldCount',
        '#status': 'status',
        '#reviewedAt': 'reviewedAt',
        '#reviewedBy': 'reviewedBy',
        '#disambiguator': 'disambiguator',
        '#reviewState': 'reviewState',
        '#reviewIssues': 'reviewIssues',
        '#sourceKind': 'sourceKind',
        '#dataFormat': 'dataFormat',
        '#syncStatus': 'syncStatus',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    const normalized = updated ?? existing;

    return jsonResponse(200, normalizeSchemaRecordForResponse(normalized));
  } catch (error) {
    if (error instanceof DynamoServiceError || error instanceof S3ServiceError) {
      const appError = error.appError;
      return errorResponse(appError.code, appError.message, appError.statusCode, appError.retryable, appError.requestId);
    }

    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
  }
}
