import {
  ERROR_CODES,
  conflict,
  errorResponse,
  generateRequestId,
  getItem,
  getObject,
  jsonResponse,
  parseBody,
  parsePathParam,
  putObject,
  putItem,
  updateItem,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import {
  computeConfigHash,
  listSchemaNodeIdentities,
  type MappingConfig,
  type MappingRevisionItem,
  type MappingItem,
} from '../../lib/persistence/index.js';
import { computeSchemaIdentityDiff } from '../../lib/schema/index.js';

interface ImmutableSchemaRef {
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly schemaVersionId: string;
  readonly contentHash: string;
}

type UpgradeRole = 'source' | 'target' | 'enrichment';

interface PreviewPayload {
  readonly mappingId: string;
  readonly projectId?: string;
  readonly baseMappingRevision: number;
  readonly role: UpgradeRole;
  readonly enrichmentAlias?: string;
  readonly from: ImmutableSchemaRef;
  readonly to: ImmutableSchemaRef;
  readonly suggestionIds: readonly string[];
}

interface ApplyRequest {
  readonly expectedMappingRevision: number;
  readonly previewId: string;
  readonly acceptedSuggestions: readonly string[];
  readonly confirm: boolean;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const MAPPING_REVISIONS_TABLE = getEnvValue('MAPPING_REVISIONS_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET') ?? getEnvValue('STORAGE_BUCKET');

function getMappingsTableOrThrow(): string {
  const table = MAPPINGS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return table;
}

function getMappingRevisionsTableOrThrow(): string {
  const table = MAPPING_REVISIONS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPING_REVISIONS_TABLE');
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

function parseApplyRequest(body: Record<string, unknown> | null): ApplyRequest | null {
  if (!body) {
    return null;
  }

  const expectedMappingRevision =
    typeof body.expectedMappingRevision === 'number' && Number.isInteger(body.expectedMappingRevision)
      ? body.expectedMappingRevision
      : NaN;
  const previewId = typeof body.previewId === 'string' ? body.previewId.trim() : '';
  const acceptedSuggestions = Array.isArray(body.acceptedSuggestions)
    ? body.acceptedSuggestions.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const confirm = body.confirm === true;

  if (!Number.isFinite(expectedMappingRevision) || expectedMappingRevision <= 0 || !previewId) {
    return null;
  }

  return {
    expectedMappingRevision,
    previewId,
    acceptedSuggestions,
    confirm,
  };
}

function decodePreviewId(previewId: string): PreviewPayload | null {
  try {
    const decoded = Buffer.from(previewId, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded) as PreviewPayload;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getCurrentRevision(item: MappingItem): number {
  return item.revision ?? item.version ?? 0;
}

function toRevisionS3Key(mappingId: string, revision: number): string {
  return `mappings/${mappingId}/revisions/r${revision}.json`;
}

function updatePinnedRef(
  config: MappingConfig,
  role: UpgradeRole,
  destination: ImmutableSchemaRef,
  enrichmentAlias?: string,
): MappingConfig {
  if (role === 'source') {
    return {
      ...config,
      sourceSchemaRef: {
        ...(config.sourceSchemaRef ?? { schemaId: destination.schemaId, type: 'local' }),
        schemaId: destination.schemaId,
        schemaVersion: destination.schemaVersion,
        schemaVersionId: destination.schemaVersionId,
        contentHash: destination.contentHash,
      },
    };
  }

  if (role === 'target') {
    return {
      ...config,
      targetSchemaRef: {
        ...(config.targetSchemaRef ?? { schemaId: destination.schemaId, type: 'local' }),
        schemaId: destination.schemaId,
        schemaVersion: destination.schemaVersion,
        schemaVersionId: destination.schemaVersionId,
        contentHash: destination.contentHash,
      },
    };
  }

  return {
    ...config,
    enrichmentSources: (config.enrichmentSources ?? []).map((entry) => {
      if (entry.alias !== enrichmentAlias) {
        return entry;
      }

      return {
        ...entry,
        schemaId: destination.schemaId,
        schemaVersion: destination.schemaVersion,
        schemaVersionId: destination.schemaVersionId,
        contentHash: destination.contentHash,
      };
    }),
  };
}

function hasAnyBlockingChanges(preview: PreviewPayload): boolean {
  return preview.suggestionIds.length > 0;
}

function equalStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const setA = new Set(a);
  if (setA.size !== b.length) {
    return false;
  }

  return b.every((entry) => setA.has(entry));
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false, requestId);
  }

  const body = parseBody(event) as Record<string, unknown> | null;
  const request = parseApplyRequest(body);
  if (!request) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid request body. Expected { expectedMappingRevision, previewId, acceptedSuggestions[], confirm:true }',
      400,
      false,
      requestId,
    );
  }

  const preview = decodePreviewId(request.previewId);
  if (!preview) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid previewId', 400, false, requestId);
  }

  if (!request.confirm) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Schema upgrade apply requires explicit confirm=true', 400, false, requestId);
  }

  if (preview.mappingId !== mappingId) {
    return errorResponse(ERROR_CODES.CONFLICT, 'Preview invalid: mapping mismatch', 409, false, requestId);
  }

  const accepted = [...new Set(request.acceptedSuggestions)].sort();
  const expectedSuggestions = [...new Set(preview.suggestionIds)].sort();
  if (!equalStringSet(accepted, expectedSuggestions)) {
    const err = conflict('Preview invalid: acceptedSuggestions must exactly match preview suggestion set', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  try {
    const mapping = await getItem<MappingItem>({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
    });

    if (!mapping) {
      return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Mapping with id '${mappingId}' not found`, 404, false, requestId);
    }

    const currentRevision = getCurrentRevision(mapping);
    if (currentRevision !== request.expectedMappingRevision || currentRevision !== preview.baseMappingRevision) {
      const err = conflict(
        `Preview invalid: mapping revision changed from ${preview.baseMappingRevision} to ${currentRevision}`,
        requestId,
      );
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    const currentConfigRaw = await getObject({
      Bucket: getContentBucketOrThrow(),
      Key: mapping.configS3Key,
    });
    const currentConfig = JSON.parse(currentConfigRaw) as MappingConfig;

    const currentSidecar = await listSchemaNodeIdentities(preview.from.schemaVersionId);
    const nextSidecar = await listSchemaNodeIdentities(preview.to.schemaVersionId);
    if (currentSidecar.length === 0 || nextSidecar.length === 0) {
      return errorResponse(
        ERROR_CODES.CONFLICT,
        'Preview invalid: schema identity sidecar changed/unavailable for destination',
        409,
        false,
        requestId,
      );
    }

    const latestDiff = computeSchemaIdentityDiff(currentSidecar, nextSidecar);
    const latestSuggestionIds = [
      ...latestDiff.renamed.map((entry) => `${mappingId}:rename:${entry.fromJsonPointer}->${entry.toJsonPointer}`),
      ...latestDiff.moved.map((entry) => `${mappingId}:move:${entry.fromJsonPointer}->${entry.toJsonPointer}`),
    ].sort();
    if (!equalStringSet(latestSuggestionIds, expectedSuggestions)) {
      const err = conflict('Preview invalid: suggestion baseline changed; refresh preview', requestId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    if (hasAnyBlockingChanges(preview) && accepted.length === 0) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Schema upgrade apply requires explicit acceptedSuggestions for all preview suggestions',
        400,
        false,
        requestId,
      );
    }

    const nextRevision = currentRevision + 1;
    const updatedConfig = {
      ...updatePinnedRef(currentConfig, preview.role, preview.to, preview.enrichmentAlias),
      version: nextRevision,
    } satisfies MappingConfig;
    const configHash = await computeConfigHash({ ...updatedConfig, version: 0 } as MappingConfig);
    const updatedAt = new Date().toISOString();
    const revisionConfigS3Key = toRevisionS3Key(mappingId, nextRevision);

    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: revisionConfigS3Key,
      Body: JSON.stringify(updatedConfig),
      ContentType: 'application/json',
    });

    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: mapping.configS3Key,
      Body: JSON.stringify(updatedConfig),
      ContentType: 'application/json',
    });

    await updateItem({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
      ConditionExpression: 'attribute_exists(mappingId) AND #revision = :expectedRevision',
      UpdateExpression:
        'SET #revision = :revision, #version = :version, #updatedAt = :updatedAt, #configHash = :configHash, #sourceSchemaId = :sourceSchemaId, #targetSchemaId = :targetSchemaId, #enrichmentSources = :enrichmentSources',
      ExpressionAttributeNames: {
        '#revision': 'revision',
        '#version': 'version',
        '#updatedAt': 'updatedAt',
        '#configHash': 'configHash',
        '#sourceSchemaId': 'sourceSchemaId',
        '#targetSchemaId': 'targetSchemaId',
        '#enrichmentSources': 'enrichmentSources',
      },
      ExpressionAttributeValues: {
        ':expectedRevision': currentRevision,
        ':revision': nextRevision,
        ':version': nextRevision,
        ':updatedAt': updatedAt,
        ':configHash': configHash,
        ':sourceSchemaId': updatedConfig.sourceSchemaRef?.schemaId ?? null,
        ':targetSchemaId': updatedConfig.targetSchemaRef?.schemaId ?? null,
        ':enrichmentSources': updatedConfig.enrichmentSources ?? [],
      },
      ReturnValues: 'ALL_NEW',
    });

    await putItem({
      TableName: getMappingRevisionsTableOrThrow(),
      Item: {
        mappingId,
        revision: nextRevision,
        savedAt: updatedAt,
        savedBy: 'system',
        ruleCount: updatedConfig.rules.length,
        configS3Key: revisionConfigS3Key,
        configHash,
      } satisfies MappingRevisionItem,
    });

    console.info('[schema-upgrade-apply] apply-completed', {
      eventType: 'mapping-schema-upgrade-applied',
      mappingId,
      projectId: mapping.projectId,
      actor: 'system',
      emittedAt: updatedAt,
      schemaId: preview.to.schemaId,
      fromSchemaVersion: preview.from.schemaVersion,
      fromSchemaVersionId: preview.from.schemaVersionId,
      toSchemaVersion: preview.to.schemaVersion,
      toSchemaVersionId: preview.to.schemaVersionId,
      role: preview.role,
      enrichmentAlias: preview.enrichmentAlias,
      mappingRevisionFrom: currentRevision,
      mappingRevisionTo: nextRevision,
      affectedCount: {
        acceptedSuggestions: accepted.length,
      },
    });

    return jsonResponse(
      200,
      {
        mappingId,
        revision: nextRevision,
        upgradedRole: preview.role,
        upgradedTo: preview.to,
        noChange: false,
      },
      requestId,
    );
  } catch (error) {
    const maybe = error as { name?: string };
    if (maybe?.name === 'ConditionalCheckFailedException') {
      const err = conflict('Preview invalid: mapping revision changed before apply', requestId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    return errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to apply schema upgrade', 500, true, requestId);
  }
}
