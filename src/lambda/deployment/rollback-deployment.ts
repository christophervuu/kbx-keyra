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
import { createRollback as createRollbackDeployment, listHistory } from '../../lib/persistence/deployments.js';
import {
  create as createDeploymentOrchestration,
  get as getDeploymentOrchestration,
  updateStatus as updateDeploymentOrchestrationStatus,
} from '../../lib/persistence/deployment-orchestrations.js';
import { upsert as upsertDeploymentSummary } from '../../lib/persistence/deployment-summaries.js';
import { DeploymentEnvironmentConfigError, getRuntimeApiClient } from './runtime-api-client.js';
import { executeRuntimeOperationWithRetry } from './orchestration-retry.js';

type DeploymentEnvironment = 'DEV' | 'PREPROD' | 'PROD';

interface RollbackRequest {
  readonly environment: DeploymentEnvironment;
  readonly deploymentSK: string;
}

interface MappingMetadata {
  readonly mappingId: string;
  readonly projectId?: string;
  readonly name?: string;
}

interface OrchestrationContext {
  readonly orchestrationId: string;
  readonly requestId: string;
}

interface ReplayResult {
  readonly replayed: true;
  readonly response: APIGatewayProxyResult;
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

function parseIdempotencyKey(event: APIGatewayProxyEvent): string | null {
  const headers = event.headers;
  if (!headers) {
    return null;
  }

  const key = headers['x-idempotency-key'] ?? headers['X-Idempotency-Key'];
  if (typeof key !== 'string' || key.trim() === '') {
    return null;
  }

  return key.trim();
}

function buildDeterministicOrchestrationId(input: {
  mappingId: string;
  environment: DeploymentEnvironment;
  deploymentSK: string;
  idempotencyKey: string;
}): string {
  return ['rollback', input.mappingId, input.environment, input.deploymentSK, input.idempotencyKey].join(':');
}

function isConditionalCheckFailed(error: unknown): boolean {
  const typed = error as { name?: string; Code?: string } | null | undefined;
  return typed?.name === 'ConditionalCheckFailedException' || typed?.Code === 'ConditionalCheckFailedException';
}

function mapErrorCodeToStatusCode(errorCode: string | undefined): number {
  switch (errorCode) {
    case ERROR_CODES.VALIDATION_ERROR:
      return 400;
    case ERROR_CODES.SOURCE_NOT_FOUND:
      return 404;
    case ERROR_CODES.CONFLICT:
    case ERROR_CODES.ARTIFACT_NOT_PRESENT:
      return 409;
    case ERROR_CODES.SERVICE_UNAVAILABLE:
      return 503;
    case ERROR_CODES.TIMEOUT:
      return 504;
    default:
      return 500;
  }
}

function isEnvironment(value: unknown): value is DeploymentEnvironment {
  return value === 'DEV' || value === 'PREPROD' || value === 'PROD';
}

function mapRuntimeRollbackClientError(error: unknown): {
  ok: false;
  statusCode: number;
  requestId: string;
  errorCode: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof DeploymentEnvironmentConfigError) {
    return {
      ok: false,
      statusCode: 500,
      requestId: generateRequestId(),
      errorCode: ERROR_CODES.VALIDATION_ERROR,
      message: `Runtime environment configuration error: ${error.message}`,
      retryable: false,
    };
  }

  const errorName = (error as { name?: unknown } | null | undefined)?.name;
  if (errorName === 'AbortError' || errorName === 'TimeoutError') {
    return {
      ok: false,
      statusCode: 504,
      requestId: generateRequestId(),
      errorCode: ERROR_CODES.TIMEOUT,
      message: 'Rollback timed out while contacting runtime services.',
      retryable: true,
    };
  }

  return {
    ok: false,
    statusCode: 503,
    requestId: generateRequestId(),
    errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
    message: 'Runtime API request failed due to transport error.',
    retryable: true,
  };
}

function mapUnexpectedRollbackError(error: unknown): {
  code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
  message: string;
  statusCode: number;
  retryable: boolean;
} {
  if (error instanceof DeploymentEnvironmentConfigError) {
    return {
      code: ERROR_CODES.VALIDATION_ERROR,
      message: `Runtime environment configuration error: ${error.message}`,
      statusCode: 500,
      retryable: false,
    };
  }

  const message = (error as { message?: unknown } | null | undefined)?.message;
  if (typeof message === 'string' && message.startsWith('Missing required environment variable:')) {
    return {
      code: ERROR_CODES.VALIDATION_ERROR,
      message,
      statusCode: 500,
      retryable: false,
    };
  }

  const errorName = (error as { name?: unknown } | null | undefined)?.name;
  if (errorName === 'ProvisionedThroughputExceededException' || errorName === 'ThrottlingException') {
    return {
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'Rollback temporarily unavailable due to persistence throttling.',
      statusCode: 503,
      retryable: true,
    };
  }

  if (errorName === 'AbortError' || errorName === 'TimeoutError') {
    return {
      code: ERROR_CODES.TIMEOUT,
      message: 'Rollback timed out while contacting runtime or persistence services.',
      statusCode: 504,
      retryable: true,
    };
  }

  const err = internalError();
  return {
    code: err.code,
    message: err.message,
    statusCode: err.statusCode,
    retryable: err.retryable,
  };
}

function parseRollbackRequest(body: Record<string, unknown> | null): RollbackRequest | null {
  if (!body) {
    return null;
  }

  const environment = body.environment;
  const deploymentSK = body.deploymentSK;

  if (!isEnvironment(environment)) {
    return null;
  }

  if (typeof deploymentSK !== 'string' || deploymentSK.trim() === '') {
    return null;
  }

  return {
    environment,
    deploymentSK: deploymentSK.trim(),
  };
}

async function createOrchestrationContext(input: {
  mappingId: string;
  projectId?: string;
  mappingName?: string;
  environment: DeploymentEnvironment;
  deploymentSK: string;
  artifactId: string;
  idempotencyKey?: string | null;
}): Promise<OrchestrationContext> {
  const requestId = generateRequestId();
  const orchestrationId = input.idempotencyKey
    ? buildDeterministicOrchestrationId({
        mappingId: input.mappingId,
        environment: input.environment,
        deploymentSK: input.deploymentSK,
        idempotencyKey: input.idempotencyKey,
      })
    : undefined;

  const orchestration = await createDeploymentOrchestration({
    ...(orchestrationId ? { orchestrationId } : {}),
    mappingId: input.mappingId,
    operationType: 'rollback',
    targetEnvironment: input.environment,
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

  if (input.projectId && input.mappingName) {
    await upsertDeploymentSummary({
      mappingId: input.mappingId,
      projectId: input.projectId,
      mappingName: input.mappingName,
      environmentStates: {
        [input.environment]: {
          lastOperationStatus: 'RUNNING',
        },
      },
      operationType: 'ROLLBACK',
      operationStatus: 'RUNNING',
      activeOperationId: orchestration.orchestrationId,
      actorId: 'development:system',
      actorDisplayName: 'Development',
    });
  }

  return {
    orchestrationId: orchestration.orchestrationId,
    requestId,
  };
}

async function buildReplayResponse(input: {
  mappingId: string;
  environment: DeploymentEnvironment;
  deploymentSK: string;
  orchestration: {
    orchestrationId: string;
    status: string;
    requestId: string;
    lastErrorCode?: string;
    lastErrorMessage?: string;
  };
}): Promise<APIGatewayProxyResult> {
  const status = input.orchestration.status;

  if (status === 'succeeded') {
    const history = await listHistory(input.mappingId, input.environment, 25);
    const matching = history.find((entry) => entry.rollbackOf === input.deploymentSK);

    if (matching) {
      return jsonResponse(
        200,
        {
          ...matching,
          orchestrationId: input.orchestration.orchestrationId,
          replayed: true,
        },
        input.orchestration.requestId,
      );
    }

    return jsonResponse(
      200,
      {
        orchestrationId: input.orchestration.orchestrationId,
        status,
        replayed: true,
      },
      input.orchestration.requestId,
    );
  }

  if (status === 'failed' || status === 'timed_out') {
    const errorCode = input.orchestration.lastErrorCode ?? ERROR_CODES.INTERNAL_ERROR;
    return errorResponse(
      errorCode as (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
      input.orchestration.lastErrorMessage ?? 'Previous idempotent rollback attempt failed.',
      mapErrorCodeToStatusCode(input.orchestration.lastErrorCode),
      errorCode === ERROR_CODES.TIMEOUT || errorCode === ERROR_CODES.SERVICE_UNAVAILABLE,
      input.orchestration.requestId,
      {
        orchestrationId: input.orchestration.orchestrationId,
        status,
        replayed: true,
      },
    );
  }

  return jsonResponse(
    202,
    {
      orchestrationId: input.orchestration.orchestrationId,
      status,
      replayed: true,
    },
    input.orchestration.requestId,
  );
}

async function createOrchestrationOrReplay(input: {
  mappingId: string;
  projectId?: string;
  mappingName?: string;
  environment: DeploymentEnvironment;
  deploymentSK: string;
  artifactId: string;
  idempotencyKey?: string | null;
}): Promise<OrchestrationContext | ReplayResult> {
  try {
    return await createOrchestrationContext(input);
  } catch (error) {
    if (!input.idempotencyKey || !isConditionalCheckFailed(error)) {
      throw error;
    }

    const orchestrationId = buildDeterministicOrchestrationId({
      mappingId: input.mappingId,
      environment: input.environment,
      deploymentSK: input.deploymentSK,
      idempotencyKey: input.idempotencyKey,
    });

    const existing = await getDeploymentOrchestration(orchestrationId);
    if (!existing) {
      throw error;
    }

    const response = await buildReplayResponse({
      mappingId: input.mappingId,
      environment: input.environment,
      deploymentSK: input.deploymentSK,
      orchestration: existing,
    });

    return {
      replayed: true,
      response,
    };
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const idempotencyKey = parseIdempotencyKey(event);
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const request = parseRollbackRequest(parseBody(event));
  if (!request) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid rollback request body. Expected { environment: DEV|PREPROD|PROD, deploymentSK: string }',
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

    const history = await listHistory(mappingId, request.environment);
    const target = history.find((entry) => entry.environmentDeployedAt === request.deploymentSK);

    if (!target) {
      return errorResponse(
        ERROR_CODES.SOURCE_NOT_FOUND,
        `Deployment snapshot not found: ${mappingId}:${request.deploymentSK}`,
        404,
        false,
      );
    }

    if (!target.configS3Key || !target.configHash) {
      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        `Rollback artifact metadata unavailable: ${mappingId}:${request.deploymentSK}`,
        500,
        false,
      );
    }

    if (!target.artifactId || !target.artifactHash) {
      return errorResponse(
        ERROR_CODES.ARTIFACT_NOT_PRESENT,
        'ARTIFACT_NOT_PRESENT: artifact metadata missing in target environment local history. Deploy/promote the desired artifact first.',
        409,
        false,
        undefined,
        {
          reason: 'ARTIFACT_NOT_PRESENT',
          environment: request.environment,
          deploymentSK: request.deploymentSK,
          remediation: 'deploy-or-promote-artifact-then-retry-rollback',
        },
      );
    }

    const targetArtifactId = target.artifactId;

    const orchestration = await createOrchestrationOrReplay({
      mappingId,
      projectId: mapping.projectId,
      mappingName: mapping.name,
      environment: request.environment,
      deploymentSK: request.deploymentSK,
      artifactId: targetArtifactId,
      idempotencyKey,
    });

    if ('replayed' in orchestration) {
      return orchestration.response;
    }

    const retryResult = await executeRuntimeOperationWithRetry<void>({
      mappingId,
      projectId: mapping.projectId,
      mappingName: mapping.name,
      environment: request.environment,
      operationType: 'rollback',
      orchestrationId: orchestration.orchestrationId,
      requestId: orchestration.requestId,
      artifactId: targetArtifactId,
      targetArtifactId: targetArtifactId,
      runtimeApiClient: getRuntimeApiClient(),
      executeAttempt: async () => {
        try {
          const runtimeResult = await getRuntimeApiClient().rollback({
            mappingId,
            environment: request.environment,
            targetArtifactId: targetArtifactId,
            reason: 'user-request',
            requestId: orchestration.requestId,
            orchestrationId: orchestration.orchestrationId,
            triggeredBy: 'system',
          });

          if (runtimeResult.ok) {
            return {
              ok: true,
              statusCode: runtimeResult.statusCode,
              requestId: runtimeResult.requestId,
              data: undefined,
            };
          }

          return runtimeResult;
        } catch (error) {
          return mapRuntimeRollbackClientError(error);
        }
      },
    });

    if (!retryResult.ok) {
      if (mapping.projectId && mapping.name) {
        await upsertDeploymentSummary({
          mappingId,
          projectId: mapping.projectId,
          mappingName: mapping.name,
          environmentStates: {
            [request.environment]: {
              lastOperationStatus: retryResult.finalStatus === 'timed_out' ? 'TIMED_OUT' : 'FAILED',
            },
          },
          operationType: 'ROLLBACK',
          operationStatus: retryResult.finalStatus === 'timed_out' ? 'TIMED_OUT' : 'FAILED',
          activeOperationId: null,
          actorId: 'development:system',
          actorDisplayName: 'Development',
        });
      }

      return errorResponse(
        retryResult.errorCode as (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
        retryResult.message,
        retryResult.statusCode,
        retryResult.retryable,
        retryResult.requestId,
        {
          orchestrationId: orchestration.orchestrationId,
          environment: request.environment,
          targetArtifactId: targetArtifactId,
          deploymentSK: request.deploymentSK,
          attemptCount: retryResult.attemptCount,
          finalStatus: retryResult.finalStatus,
        },
      );
    }

    const created = await createRollbackDeployment({
      mappingId,
      environment: request.environment,
      sourceType: target.sourceType,
      sourceNumber: target.sourceNumber,
      deployedBy: 'system',
      artifactId: targetArtifactId,
      artifactHash: target.artifactHash,
      configHash: target.configHash,
      configS3Key: target.configS3Key,
      rollbackOf: request.deploymentSK,
    });

    await updateDeploymentOrchestrationStatus({
      orchestrationId: orchestration.orchestrationId,
      status: 'succeeded',
      attemptCount: retryResult.attemptCount,
      artifactId: targetArtifactId,
      requestId: retryResult.requestId,
    });

    if (mapping.projectId && mapping.name) {
      await upsertDeploymentSummary({
        mappingId,
        projectId: mapping.projectId,
        mappingName: mapping.name,
        environmentStates: {
          [request.environment]: {
            activeArtifactId: created.artifactId ?? null,
            activeVersion: created.sourceType === 'version' ? created.sourceNumber : null,
            freshness: 'CURRENT',
            lastOperationStatus: 'SUCCEEDED',
          },
        },
        operationType: 'ROLLBACK',
        operationStatus: 'SUCCEEDED',
        activeOperationId: null,
        actorId: 'development:system',
        actorDisplayName: 'Development',
      });
    }

    return jsonResponse(201, {
      ...created,
      orchestrationId: orchestration.orchestrationId,
    }, retryResult.requestId);
  } catch (error) {
    const mapped = mapUnexpectedRollbackError(error);
    console.error(
      JSON.stringify({
        eventType: 'rollback',
        phase: 'rollback-handler',
        mappingId,
        environment: request.environment,
        deploymentSK: request.deploymentSK,
        errorName: (error as { name?: unknown } | null | undefined)?.name,
        errorMessage: (error as { message?: unknown } | null | undefined)?.message,
      }),
    );

    return errorResponse(mapped.code, mapped.message, mapped.statusCode, mapped.retryable);
  }
}
