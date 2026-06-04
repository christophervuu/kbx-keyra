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
import { create as createDeployment } from '../../lib/persistence/deployments.js';
import { getConfig as getRevisionConfig } from '../../lib/persistence/mapping-revisions.js';
import { get as getVersion, getConfig as getVersionConfig } from '../../lib/persistence/mapping-versions.js';
import { validateCdmDeployGuard } from './cdm-deploy-guard.js';
import {
  assertArtifactPayloadWithinLimit,
  buildRuntimeDeployArtifact,
  getRuntimeRelayClient,
} from './runtime-relay.js';

type DeploymentEnvironment = 'DEV' | 'PREPROD' | 'PROD';
type DeploymentSourceType = 'revision' | 'version';

interface DeployRequest {
  readonly environment: DeploymentEnvironment;
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
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

function isSourceType(value: unknown): value is DeploymentSourceType {
  return value === 'revision' || value === 'version';
}

function parseDeployRequest(body: Record<string, unknown> | null): DeployRequest | null {
  if (!body) {
    return null;
  }

  const environment = body.environment;
  const sourceType = body.sourceType;
  const sourceNumber = body.sourceNumber;

  if (!isEnvironment(environment) || !isSourceType(sourceType)) {
    return null;
  }

  if (typeof sourceNumber !== 'number' || !Number.isInteger(sourceNumber) || sourceNumber <= 0) {
    return null;
  }

  return { environment, sourceType, sourceNumber };
}

function isRevisionDeployDisallowed(environment: DeploymentEnvironment, sourceType: DeploymentSourceType): boolean {
  return sourceType === 'revision' && environment !== 'DEV';
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const request = parseDeployRequest(parseBody(event));
  if (!request) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid deployment request body. Expected { environment: DEV|PREPROD|PROD, sourceType: revision|version, sourceNumber: integer>0 }',
      400,
      false,
    );
  }

  if (isRevisionDeployDisallowed(request.environment, request.sourceType)) {
    return errorResponse(
      ERROR_CODES.REVISION_NOT_DEPLOYABLE_TO_ENV,
      'Revision deployments are only allowed for DEV',
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
            message: 'Deployment blocked: referenced CDM schema state is not deployable',
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

    if (request.sourceType === 'revision') {
      const config = await getRevisionConfig(mappingId, request.sourceNumber);
      if (!config) {
        return errorResponse(
          ERROR_CODES.SOURCE_NOT_FOUND,
          `Revision source not found: ${mappingId}:${request.sourceNumber}`,
          404,
          false,
        );
      }

      const artifact = await buildRuntimeDeployArtifact({
        mappingId,
        sourceType: 'revision',
        sourceNumber: request.sourceNumber,
        config,
      });

      const payloadCheck = assertArtifactPayloadWithinLimit(artifact);
      if (!payloadCheck.ok) {
        return errorResponse(
          ERROR_CODES.DEPLOY_ARTIFACT_TOO_LARGE,
          `Deployment artifact payload is too large (${payloadCheck.payloadBytes} bytes > limit ${payloadCheck.limitBytes} bytes). Reduce mapping payload size or raise MAX_DEPLOY_ARTIFACT_PAYLOAD_BYTES.`,
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

      const relay = await getRuntimeRelayClient().pushArtifact(request.environment, artifact);
      if (!relay.ok) {
        return errorResponse(
          relay.errorCode as (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
          relay.message,
          mapRelayStatusCodeToHttp(relay.statusCode),
          relay.retryable,
          relay.requestId,
          {
            environment: request.environment,
            artifactId: artifact.artifactId,
            snapshotId: artifact.snapshotId,
          },
        );
      }

      const created = await createDeployment({
        mappingId,
        environment: request.environment,
        sourceType: 'revision',
        sourceNumber: request.sourceNumber,
        deployedBy: 'system',
        artifactId: artifact.artifactId,
        artifactHash: artifact.artifactHash,
        ...(cdmGuard.cdmTraceability.length > 0 ? { cdmSchemaTraceability: cdmGuard.cdmTraceability } : {}),
        config,
      });

      return jsonResponse(201, created);
    }

    const version = await getVersion(mappingId, request.sourceNumber);
    if (!version) {
      return errorResponse(
        ERROR_CODES.SOURCE_NOT_FOUND,
        `Version source not found: ${mappingId}:${request.sourceNumber}`,
        404,
        false,
      );
    }

    const config = await getVersionConfig(mappingId, request.sourceNumber);
    if (!config) {
      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        `Version config snapshot unavailable: ${mappingId}:${request.sourceNumber}`,
        500,
        false,
      );
    }

    const artifact = await buildRuntimeDeployArtifact({
      mappingId,
      sourceType: 'version',
      sourceNumber: version.version,
      config,
    });

    const payloadCheck = assertArtifactPayloadWithinLimit(artifact);
    if (!payloadCheck.ok) {
      return errorResponse(
        ERROR_CODES.DEPLOY_ARTIFACT_TOO_LARGE,
        `Deployment artifact payload is too large (${payloadCheck.payloadBytes} bytes > limit ${payloadCheck.limitBytes} bytes). Reduce mapping payload size or raise MAX_DEPLOY_ARTIFACT_PAYLOAD_BYTES.`,
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

    const relay = await getRuntimeRelayClient().pushArtifact(request.environment, artifact);
    if (!relay.ok) {
      return errorResponse(
        relay.errorCode as (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
        relay.message,
        mapRelayStatusCodeToHttp(relay.statusCode),
        relay.retryable,
        relay.requestId,
        {
          environment: request.environment,
          artifactId: artifact.artifactId,
          snapshotId: artifact.snapshotId,
        },
      );
    }

    const created = await createDeployment({
      mappingId,
      environment: request.environment,
      sourceType: 'version',
      sourceNumber: version.version,
      deployedBy: 'system',
      artifactId: artifact.artifactId,
      artifactHash: artifact.artifactHash,
      ...(cdmGuard.cdmTraceability.length > 0 ? { cdmSchemaTraceability: cdmGuard.cdmTraceability } : {}),
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
