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
import {
  create as createDeploymentOrchestration,
  updateStatus as updateDeploymentOrchestrationStatus,
} from '../../lib/persistence/deployment-orchestrations.js';
import { getConfig as getVersionConfig } from '../../lib/persistence/mapping-versions.js';
import { validateCdmDeployGuard } from './cdm-deploy-guard.js';
import {
  assertArtifactPayloadWithinLimit,
  buildRuntimeDeployArtifact,
  getRuntimeRelayClient,
} from './runtime-relay.js';
import { executeRuntimeOperationWithRetry } from './orchestration-retry.js';
import { getRuntimeApiClient } from './runtime-api-client.js';

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

interface OrchestrationContext {
  readonly orchestrationId: string;
  readonly requestId: string;
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

async function createOrchestrationContext(input: {
  mappingId: string;
  fromEnvironment: DeploymentEnvironment;
  toEnvironment: DeploymentEnvironment;
  artifactId: string;
}): Promise<OrchestrationContext> {
  const requestId = generateRequestId();
  const orchestration = await createDeploymentOrchestration({
    mappingId: input.mappingId,
    operationType: 'promote',
    targetEnvironment: input.toEnvironment,
    sourceEnvironment: input.fromEnvironment,
    artifactId: input.artifactId,
    requestId,
    requestedBy: 'system',
  });

  await updateDeploymentOrchestrationStatus({
    orchestrationId: orchestration.orchestrationId,
    status: 'in_progress',
    attemptCount: 1,
    artifactId: input.artifactId,
    requestId,
  });

  return {
    orchestrationId: orchestration.orchestrationId,
    requestId,
  };
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

    const artifactId = source.artifactId ?? artifact.artifactId;
    const artifactHash = source.artifactHash ?? artifact.artifactHash;

    const promoteArtifact = {
      ...artifact,
      artifactId,
      snapshotId: artifactId,
      artifactHash,
      sourceConfigHash: artifactHash,
    };

    const orchestration = await createOrchestrationContext({
      mappingId,
      fromEnvironment: request.fromEnvironment,
      toEnvironment: request.toEnvironment,
      artifactId,
    });

    const payloadCheck = assertArtifactPayloadWithinLimit(promoteArtifact);
    if (!payloadCheck.ok) {
      await updateDeploymentOrchestrationStatus({
        orchestrationId: orchestration.orchestrationId,
        status: 'failed',
        attemptCount: 1,
        artifactId,
        requestId: orchestration.requestId,
        lastErrorCode: ERROR_CODES.PAYLOAD_TOO_LARGE,
        lastErrorMessage: `Payload too large (${payloadCheck.payloadBytes} > ${payloadCheck.limitBytes})`,
      });

      return errorResponse(
        ERROR_CODES.PAYLOAD_TOO_LARGE,
        `Promotion artifact payload is too large (${payloadCheck.payloadBytes} bytes > limit ${payloadCheck.limitBytes} bytes). Reduce artifact size below the 5MB MVP limit.`,
        413,
        false,
        orchestration.requestId,
        {
          orchestrationId: orchestration.orchestrationId,
          artifactId,
          snapshotId: artifactId,
          payloadBytes: payloadCheck.payloadBytes,
          limitBytes: payloadCheck.limitBytes,
        },
      );
    }

    const retryResult = await executeRuntimeOperationWithRetry<void>({
      mappingId,
      environment: request.toEnvironment,
      operationType: 'promote',
      orchestrationId: orchestration.orchestrationId,
      requestId: orchestration.requestId,
      artifactId,
      runtimeApiClient: getRuntimeApiClient(),
      executeAttempt: async () => {
        const relay = await getRuntimeRelayClient().pushArtifact(request.toEnvironment, promoteArtifact, {
          requestId: orchestration.requestId,
          orchestrationId: orchestration.orchestrationId,
          operation: 'promote',
          promotedFrom: request.fromEnvironment,
          triggeredBy: 'system',
        });

        if (relay.ok) {
          return {
            ok: true,
            statusCode: relay.statusCode,
            requestId: relay.requestId,
            data: undefined,
          };
        }

        return {
          ok: false,
          statusCode: mapRelayStatusCodeToHttp(relay.statusCode),
          requestId: relay.requestId,
          errorCode: relay.errorCode,
          message: relay.message,
          retryable: relay.retryable,
        };
      },
    });

    if (!retryResult.ok) {
      return errorResponse(
        retryResult.errorCode as (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
        retryResult.message,
        retryResult.statusCode,
        retryResult.retryable,
        retryResult.requestId,
        {
          orchestrationId: orchestration.orchestrationId,
          environment: request.toEnvironment,
          artifactId,
          snapshotId: artifactId,
          promotedFrom: request.fromEnvironment,
          attemptCount: retryResult.attemptCount,
          finalStatus: retryResult.finalStatus,
        },
      );
    }

    const created = await createDeployment({
      mappingId,
      environment: request.toEnvironment,
      sourceType: 'version',
      sourceNumber: source.sourceNumber,
      deployedBy: 'system',
      artifactId,
      artifactHash,
      ...(cdmGuard.cdmTraceability.length > 0 ? { cdmSchemaTraceability: cdmGuard.cdmTraceability } : {}),
      promotedFrom: request.fromEnvironment,
      config,
    });

    await updateDeploymentOrchestrationStatus({
      orchestrationId: orchestration.orchestrationId,
      status: 'succeeded',
      attemptCount: retryResult.attemptCount,
      artifactId,
      requestId: retryResult.requestId,
    });

    return jsonResponse(201, {
      ...created,
      orchestrationId: orchestration.orchestrationId,
    }, retryResult.requestId);
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
