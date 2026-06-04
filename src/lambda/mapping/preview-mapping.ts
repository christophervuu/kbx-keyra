import { execute } from '../../engine/index.js';
import {
  ERROR_CODES,
  errorResponse,
  getItem,
  getObject,
  internalError,
  jsonResponse,
  parseBody,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { getCurrent } from '../../lib/persistence/deployments.js';
import { normalizeRuntimeDeploymentEnvironment, type RuntimeDeploymentEnvironment } from '../../lib/persistence/types.js';

interface MappingMetadata {
  readonly mappingId: string;
}

interface PreviewRequest {
  readonly environment: RuntimeDeploymentEnvironment;
  readonly sourceData: Readonly<Record<string, unknown>>;
}

interface DeploymentSnapshotPayload {
  readonly config?: unknown;
}

interface MappingConfig {
  readonly engineVersion?: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

function getMappingsTableOrThrow(): string {
  const table = getEnvValue('MAPPINGS_TABLE')?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return table;
}

function getStorageBucketOrThrow(): string {
  const bucket = getEnvValue('STORAGE_BUCKET')?.trim();
  if (!bucket) {
    throw new Error('Missing required environment variable: STORAGE_BUCKET');
  }

  return bucket;
}

function parseRuntimeEnvironment(value: unknown): RuntimeDeploymentEnvironment | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return normalizeRuntimeDeploymentEnvironment(value);
  } catch {
    return null;
  }
}

function parsePreviewRequest(body: Record<string, unknown> | null): PreviewRequest | null {
  if (!body) {
    return null;
  }

  const environment = parseRuntimeEnvironment(body.environment);
  const sourceData = body.sourceData;

  if (!environment || !sourceData || typeof sourceData !== 'object' || Array.isArray(sourceData)) {
    return null;
  }

  return {
    environment,
    sourceData: sourceData as Readonly<Record<string, unknown>>,
  };
}

function parseSnapshotConfig(payloadRaw: string): MappingConfig | null {
  const payload = JSON.parse(payloadRaw) as DeploymentSnapshotPayload;
  if (!payload || typeof payload !== 'object' || !payload.config || typeof payload.config !== 'object') {
    return null;
  }

  return payload.config as MappingConfig;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const request = parsePreviewRequest(parseBody(event));
  if (!request) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid preview request body. Expected { environment: DEV|PREPROD|PROD, sourceData: object }',
      400,
      false,
    );
  }

  try {
    const mapping = await getItem<MappingMetadata>({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
    });

    if (!mapping) {
      return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Mapping with id '${mappingId}' not found`, 404, false);
    }

    const current = await getCurrent(mappingId, request.environment);
    if (!current) {
      return errorResponse(
        ERROR_CODES.SOURCE_NOT_FOUND,
        `No active deployment found for '${mappingId}' in environment '${request.environment}'`,
        404,
        false,
      );
    }

    const rawSnapshot = await getObject({
      Bucket: getStorageBucketOrThrow(),
      Key: current.configS3Key,
    });

    const config = parseSnapshotConfig(rawSnapshot);
    if (!config) {
      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        `Deployment snapshot payload invalid: ${mappingId}:${current.configS3Key}`,
        500,
        false,
      );
    }

    const result = execute(
      config as Parameters<typeof execute>[0],
      request.sourceData,
      null,
      null,
    );

    return jsonResponse(200, {
      output: (result.output ?? {}) as Readonly<Record<string, unknown>>,
      diagnostics: result.diagnostics,
      metadata: {
        environment: request.environment,
        artifactId: current.artifactId ?? null,
        artifactHash: current.artifactHash ?? null,
        deployedAt: current.deployedAt,
        sourceType: current.sourceType,
        sourceNumber: current.sourceNumber,
        engineVersion: config.engineVersion ?? null,
      },
    });
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
