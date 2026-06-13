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
  updateStatus as updateDeploymentOrchestrationStatus,
} from '../../lib/persistence/deployment-orchestrations.js';
import { getRuntimeApiClient } from './runtime-api-client.js';
import { executeRuntimeOperationWithRetry } from './orchestration-retry.js';

type DeploymentEnvironment = 'DEV' | 'PREPROD' | 'PROD';

interface RollbackRequest {
  readonly environment: DeploymentEnvironment;
  readonly deploymentSK: string;
}

interface MappingMetadata {
  readonly mappingId: string;
}

interface OrchestrationContext {
  readonly orchestrationId: string;
  readonly requestId: string;
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
  environment: DeploymentEnvironment;
  artifactId: string;
}): Promise<OrchestrationContext> {
  const requestId = generateRequestId();
  const orchestration = await createDeploymentOrchestration({
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

    const orchestration = await createOrchestrationContext({
      mappingId,
      environment: request.environment,
      artifactId: targetArtifactId,
    });

    const retryResult = await executeRuntimeOperationWithRetry<void>({
      mappingId,
      environment: request.environment,
      operationType: 'rollback',
      orchestrationId: orchestration.orchestrationId,
      requestId: orchestration.requestId,
      artifactId: targetArtifactId,
      targetArtifactId: targetArtifactId,
      runtimeApiClient: getRuntimeApiClient(),
      executeAttempt: async () => {
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

    return jsonResponse(201, {
      ...created,
      orchestrationId: orchestration.orchestrationId,
    }, retryResult.requestId);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
