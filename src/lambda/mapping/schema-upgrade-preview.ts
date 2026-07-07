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
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { computeSchemaIdentityDiff, computeRoleImpactSummary, impactedPointerToDotPath } from '../../lib/schema/index.js';
import { listSchemaNodeIdentities, type MappingConfig } from '../../lib/persistence/index.js';

interface MappingMetadata {
  readonly mappingId: string;
  readonly projectId?: string;
  readonly revision?: number;
  readonly version: number;
  readonly configS3Key: string;
}

interface ImmutableSchemaRef {
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly schemaVersionId: string;
  readonly contentHash: string;
}

type UpgradeRole = 'source' | 'target' | 'enrichment';

interface UpgradePreviewRequest {
  readonly expectedMappingRevision: number;
  readonly role: UpgradeRole;
  readonly enrichmentAlias?: string;
  readonly destination: ImmutableSchemaRef;
}

interface UpgradeSuggestion {
  readonly suggestionId: string;
  readonly type: 'rename' | 'move';
  readonly fromPath: string;
  readonly toPath: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const SCHEMA_METADATA_TABLE = getEnvValue('SCHEMAS_TABLE') ?? getEnvValue('SCHEMA_METADATA_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET') ?? getEnvValue('STORAGE_BUCKET');

function getMappingsTableOrThrow(): string {
  const table = MAPPINGS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return table;
}

function getCurrentRevision(metadata: MappingMetadata): number {
  return metadata.revision ?? metadata.version;
}

function getContentBucketOrThrow(): string {
  const bucket = CONTENT_BUCKET?.trim();
  if (!bucket) {
    throw new Error('Missing required environment variable: CONTENT_BUCKET');
  }

  return bucket;
}

function toBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf-8').toString('base64url');
}

function parseImmutableSchemaRef(value: unknown): ImmutableSchemaRef | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const schemaId = typeof candidate.schemaId === 'string' ? candidate.schemaId.trim() : '';
  const schemaVersion =
    typeof candidate.schemaVersion === 'number' && Number.isInteger(candidate.schemaVersion)
      ? candidate.schemaVersion
      : NaN;
  const schemaVersionId = typeof candidate.schemaVersionId === 'string' ? candidate.schemaVersionId.trim() : '';
  const contentHash = typeof candidate.contentHash === 'string' ? candidate.contentHash.trim() : '';

  if (!schemaId || !Number.isFinite(schemaVersion) || schemaVersion <= 0 || !schemaVersionId || !contentHash) {
    return null;
  }

  return {
    schemaId,
    schemaVersion,
    schemaVersionId,
    contentHash,
  };
}

function parseRequest(body: Record<string, unknown> | null): UpgradePreviewRequest | null {
  if (!body) {
    return null;
  }

  const expectedMappingRevision =
    typeof body.expectedMappingRevision === 'number' && Number.isInteger(body.expectedMappingRevision)
      ? body.expectedMappingRevision
      : NaN;
  const role = body.role;
  const destination = parseImmutableSchemaRef(body.destination);
  const enrichmentAlias = typeof body.enrichmentAlias === 'string' ? body.enrichmentAlias.trim() : undefined;

  if (!Number.isFinite(expectedMappingRevision) || expectedMappingRevision <= 0) {
    return null;
  }

  if (role !== 'source' && role !== 'target' && role !== 'enrichment') {
    return null;
  }

  if (role === 'enrichment' && !enrichmentAlias) {
    return null;
  }

  if (!destination) {
    return null;
  }

  return {
    expectedMappingRevision,
    role,
    ...(enrichmentAlias ? { enrichmentAlias } : {}),
    destination,
  };
}

function getPinnedRef(config: MappingConfig, role: UpgradeRole, enrichmentAlias?: string): ImmutableSchemaRef | null {
  if (role === 'source') {
    return parseImmutableSchemaRef(config.sourceSchemaRef);
  }

  if (role === 'target') {
    return parseImmutableSchemaRef(config.targetSchemaRef);
  }

  const entry = config.enrichmentSources?.find((source) => source.alias === enrichmentAlias);
  return parseImmutableSchemaRef(entry);
}

function buildSuggestions(input: {
  readonly mappingId: string;
  readonly renamePairs: readonly Array<{ readonly fromJsonPointer: string; readonly toJsonPointer: string }>;
  readonly movePairs: readonly Array<{ readonly fromJsonPointer: string; readonly toJsonPointer: string }>;
}): readonly UpgradeSuggestion[] {
  const suggestions: UpgradeSuggestion[] = [];

  for (const entry of input.renamePairs) {
    const fromPath = impactedPointerToDotPath(entry.fromJsonPointer);
    const toPath = impactedPointerToDotPath(entry.toJsonPointer);
    suggestions.push({
      suggestionId: `${input.mappingId}:rename:${entry.fromJsonPointer}->${entry.toJsonPointer}`,
      type: 'rename',
      fromPath,
      toPath,
    });
  }

  for (const entry of input.movePairs) {
    const fromPath = impactedPointerToDotPath(entry.fromJsonPointer);
    const toPath = impactedPointerToDotPath(entry.toJsonPointer);
    suggestions.push({
      suggestionId: `${input.mappingId}:move:${entry.fromJsonPointer}->${entry.toJsonPointer}`,
      type: 'move',
      fromPath,
      toPath,
    });
  }

  return suggestions;
}

async function isArchivedSchema(schemaId: string): Promise<boolean> {
  if (!SCHEMA_METADATA_TABLE) {
    return false;
  }

  const item = await getItem<Record<string, unknown>>({
    TableName: SCHEMA_METADATA_TABLE,
    Key: { schemaId },
  });

  if (!item) {
    return false;
  }

  return item.archived === true || item.status === 'archived' || typeof item.archivedAt === 'string';
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false, requestId);
  }

  const body = parseBody(event) as Record<string, unknown> | null;
  const request = parseRequest(body);
  if (!request) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid request body. Expected { expectedMappingRevision, role, enrichmentAlias?, destination:{schemaId,schemaVersion,schemaVersionId,contentHash} }',
      400,
      false,
      requestId,
    );
  }

  try {
    const metadata = await getItem<MappingMetadata>({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
    });

    if (!metadata) {
      return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Mapping with id '${mappingId}' not found`, 404, false, requestId);
    }

    const currentRevision = getCurrentRevision(metadata);
    if (currentRevision !== request.expectedMappingRevision) {
      const err = conflict(
        `Preview invalid: mapping revision changed from ${request.expectedMappingRevision} to ${currentRevision}`,
        requestId,
      );
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    const configRaw = await getObject({
      Bucket: getContentBucketOrThrow(),
      Key: metadata.configS3Key,
    });
    const config = JSON.parse(configRaw) as MappingConfig;
    const currentPin = getPinnedRef(config, request.role, request.enrichmentAlias);

    if (!currentPin) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `Mapping is missing immutable schema pin for role '${request.role}'`,
        400,
        false,
        requestId,
      );
    }

    if (currentPin.schemaId !== request.destination.schemaId) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Schema upgrade destination must remain within the same schema family (schemaId mismatch)',
        400,
        false,
        requestId,
      );
    }

    if (await isArchivedSchema(request.destination.schemaId)) {
      const err = conflict('Schema upgrade blocked: destination schema family is archived', requestId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    const priorIdentities = await listSchemaNodeIdentities(currentPin.schemaVersionId);
    const destinationIdentities = await listSchemaNodeIdentities(request.destination.schemaVersionId);
    if (priorIdentities.length === 0 || destinationIdentities.length === 0) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Schema upgrade impact unavailable: missing schema identity sidecar for one or both versions',
        400,
        false,
        requestId,
      );
    }

    const identityDiff = computeSchemaIdentityDiff(priorIdentities, destinationIdentities);
    const roleImpact = computeRoleImpactSummary({
      mapping: config,
      role: request.role,
      identityDiff,
      enrichmentAlias: request.enrichmentAlias,
    });

    const suggestions = buildSuggestions({
      mappingId,
      renamePairs: identityDiff.renamed,
      movePairs: identityDiff.moved,
    });

    const previewPayload = {
      mappingId,
      projectId: metadata.projectId,
      baseMappingRevision: currentRevision,
      role: request.role,
      enrichmentAlias: request.enrichmentAlias,
      from: currentPin,
      to: request.destination,
      suggestionIds: suggestions.map((suggestion) => suggestion.suggestionId),
    };

    const warnings: string[] = [];
    if (await isArchivedSchema(currentPin.schemaId)) {
      warnings.push('Current pinned schema family is archived. Existing mapping remains editable/deployable with warning.');
    }

    const emittedAt = new Date().toISOString();
    console.info('[schema-upgrade-preview] preview-generated', {
      eventType: 'mapping-schema-upgrade-preview-generated',
      mappingId,
      projectId: metadata.projectId,
      actor: 'system',
      emittedAt,
      baseMappingRevision: currentRevision,
      schemaId: request.destination.schemaId,
      fromSchemaVersion: currentPin.schemaVersion,
      fromSchemaVersionId: currentPin.schemaVersionId,
      toSchemaVersion: request.destination.schemaVersion,
      toSchemaVersionId: request.destination.schemaVersionId,
      role: request.role,
      enrichmentAlias: request.enrichmentAlias,
      affectedCount: {
        breaking: roleImpact.breakingCount,
        nonBreaking: roleImpact.nonBreakingCount,
        rules: roleImpact.affectedRules.length,
        suggestions: suggestions.length,
      },
    });

    return jsonResponse(
      200,
      {
        previewId: toBase64Json(previewPayload),
        mappingId,
        baseMappingRevision: currentRevision,
        role: request.role,
        enrichmentAlias: request.enrichmentAlias,
        from: currentPin,
        to: request.destination,
        impact: roleImpact,
        diff: {
          added: identityDiff.added.map(impactedPointerToDotPath),
          removed: identityDiff.removed.map(impactedPointerToDotPath),
          renamed: identityDiff.renamed.map((entry) => ({
            fromPath: impactedPointerToDotPath(entry.fromJsonPointer),
            toPath: impactedPointerToDotPath(entry.toJsonPointer),
          })),
          moved: identityDiff.moved.map((entry) => ({
            fromPath: impactedPointerToDotPath(entry.fromJsonPointer),
            toPath: impactedPointerToDotPath(entry.toJsonPointer),
          })),
        },
        suggestions,
        warnings,
      },
      requestId,
    );
  } catch {
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to generate schema-upgrade preview', 500, true, requestId);
  }
}
