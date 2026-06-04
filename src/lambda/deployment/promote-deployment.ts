import {
  ERROR_CODES,
  errorResponse,
  generateRequestId,
  getItem,
  internalError,
  jsonResponse,
  parseBody,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { create as createDeployment, getCurrent } from '../../lib/persistence/deployments.js';
import { getConfig as getVersionConfig } from '../../lib/persistence/mapping-versions.js';
import { validateCdmDeployGuard } from './cdm-deploy-guard.js';
import {
  assertArtifactPayloadWithinLimit,
  buildRuntimeDeployArtifact,
  getRuntimeRelayClient,
} from './runtime-relay.js';

type DeploymentEnvironment = 'DEV' | 'PREPROD' | 'PROD';

interface PromoteRequest {
  readonly fromEnvironment: DeploymentEnvironment;
  readonly toEnvironment: DeploymentEnvironment;
}

interface MappingMetadata {
  readonly mappingId: string;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
}

function mapRelayStatusCodeToHttp(statusCode: number): number {
  if (statusCode >= 400 && statusCode < 600) {
    return statusCode;
  }

  return 503;
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

function isEnvironment(value: unknown): value is DeploymentEnvironment {
  return value === 'DEV' || value === 'PREPROD' || value === 'PROD';
}

function parsePromoteRequest(body: Record<string, unknown> | null): PromoteRequest | null {
  if (!body) {
    return null;
  }

  const fromEnvironment = body.fromEnvironment;
  const toEnvironment = body.toEnvironment;

  if (!isEnvironment(fromEnvironment) || !isEnvironment(toEnvironment)) {
    return null;
  }

  return { fromEnvironment, toEnvironment };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const request = parsePromoteRequest(parseBody(event));
  if (!request) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid promotion request body. Expected { fromEnvironment: DEV|PREPROD|PROD, toEnvironment: DEV|PREPROD|PROD }',
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

    const cdmGuard = await validateCdmDeployGuard(mapping);
    if (cdmGuard.blocked) {
      const requestId = generateRequestId();
      return jsonResponse(
        409,
        {
          error: {
            code: ERROR_CODES.DEPLOY_BLOCKED_CDM_SCHEMA_STATE,
            message: 'Promotion blocked: referenced CDM schema state is not deployable',
            statusCode: 409,
            retryable: false,
            requestId,
            details: {
              issues: cdmGuard.issues,
            },
          },
        },
        requestId,
      );
    }

    const source = await getCurrent(mappingId, request.fromEnvironment);
    if (!source) {
      return errorResponse(
        ERROR_CODES.SOURCE_NOT_FOUND,
        `No deployment found in ${request.fromEnvironment} for mapping '${mappingId}'`,
        404,
        false,
      );
    }

    if (source.sourceType !== 'version') {
      return errorResponse(
        ERROR_CODES.PROMOTION_REQUIRES_VERSION,
        'Promotion requires a version-backed source deployment',
        400,
        false,
      );
    }

    const config = await getVersionConfig(mappingId, source.sourceNumber);
    if (!config) {
      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        `Version config snapshot unavailable: ${mappingId}:${source.sourceNumber}`,
        500,
        false,
      );
    }

    const artifact = await buildRuntimeDeployArtifact({
      mappingId,
      sourceType: 'version',
      sourceNumber: source.sourceNumber,
      config,
    });

    const payloadCheck = assertArtifactPayloadWithinLimit(artifact);
    if (!payloadCheck.ok) {
      return errorResponse(
        ERROR_CODES.DEPLOY_ARTIFACT_TOO_LARGE,
        `Promotion artifact payload is too large (${payloadCheck.payloadBytes} bytes > limit ${payloadCheck.limitBytes} bytes). Reduce mapping payload size or raise MAX_DEPLOY_ARTIFACT_PAYLOAD_BYTES.`,
        413,
        false,
        undefined,
        {
          artifactId: artifact.artifactId,
          snapshotId: artifact.snapshotId,
          payloadBytes: payloadCheck.payloadBytes,
          limitBytes: payloadCheck.limitBytes,
        },
      );
    }

    const relay = await getRuntimeRelayClient().pushArtifact(request.toEnvironment, artifact);
    if (!relay.ok) {
      return errorResponse(
        relay.errorCode as (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
        relay.message,
        mapRelayStatusCodeToHttp(relay.statusCode),
        relay.retryable,
        relay.requestId,
        {
          environment: request.toEnvironment,
          artifactId: artifact.artifactId,
          snapshotId: artifact.snapshotId,
          promotedFrom: request.fromEnvironment,
        },
      );
    }

    const created = await createDeployment({
      mappingId,
      environment: request.toEnvironment,
      sourceType: 'version',
      sourceNumber: source.sourceNumber,
      deployedBy: 'system',
      artifactId: artifact.artifactId,
      artifactHash: artifact.artifactHash,
      ...(cdmGuard.cdmTraceability.length > 0 ? { cdmSchemaTraceability: cdmGuard.cdmTraceability } : {}),
      promotedFrom: request.fromEnvironment,
      config,
    });

    return jsonResponse(201, created);
  } catch (error) {
    const isArtifactIntegrityError =
      (error as { name?: string } | null | undefined)?.name === 'DeploymentArtifactIntegrityError';

    if (isArtifactIntegrityError) {
      const message = (error as { message?: string } | null | undefined)?.message ?? 'Artifact integrity mismatch';
      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        message,
        500,
        false,
      );
    }

    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
