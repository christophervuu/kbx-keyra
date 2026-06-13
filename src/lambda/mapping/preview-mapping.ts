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
import { getCurrent } from '../../lib/persistence/deployments.js';
import { normalizeRuntimeDeploymentEnvironment, type RuntimeDeploymentEnvironment } from '../../lib/persistence/types.js';
import {
  create as createDeploymentOrchestration,
  updateStatus as updateDeploymentOrchestrationStatus,
} from '../../lib/persistence/deployment-orchestrations.js';
import { getRuntimeApiClient } from '../deployment/runtime-api-client.js';
import { executeRuntimeOperationWithRetry } from '../deployment/orchestration-retry.js';

interface MappingMetadata {
  readonly mappingId: string;
}

interface PreviewRequest {
  readonly environment: RuntimeDeploymentEnvironment;
  readonly sourceData: Readonly<Record<string, unknown>>;
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

async function createOrchestrationContext(input: {
  mappingId: string;
  environment: RuntimeDeploymentEnvironment;
}): Promise<OrchestrationContext> {
  const requestId = generateRequestId();
  const orchestration = await createDeploymentOrchestration({
    mappingId: input.mappingId,
    operationType: 'preview',
    targetEnvironment: input.environment,
    requestId,
    requestedBy: 'system',
  });

  await updateDeploymentOrchestrationStatus({
    orchestrationId: orchestration.orchestrationId,
    status: 'in_progress',
    attemptCount: 1,
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

    const orchestration = await createOrchestrationContext({
      mappingId,
      environment: request.environment,
    });

    const retryResult = await executeRuntimeOperationWithRetry({
      mappingId,
      environment: request.environment,
      operationType: 'preview',
      orchestrationId: orchestration.orchestrationId,
      requestId: orchestration.requestId,
      runtimeApiClient: getRuntimeApiClient(),
      executeAttempt: async () =>
        getRuntimeApiClient().preview({
          mappingId,
          environment: request.environment,
          sourceData: request.sourceData,
          requestId: orchestration.requestId,
          orchestrationId: orchestration.orchestrationId,
          triggeredBy: 'system',
        }),
    });

    if (!retryResult.ok) {
      const isNotDeployed = retryResult.errorCode === ERROR_CODES.SOURCE_NOT_FOUND;
      const normalizedCode: (typeof ERROR_CODES)[keyof typeof ERROR_CODES] = isNotDeployed
        ? ERROR_CODES.NOT_DEPLOYED
        : (retryResult.errorCode as (typeof ERROR_CODES)[keyof typeof ERROR_CODES]);
      const normalizedStatus = isNotDeployed ? 404 : retryResult.statusCode;
      const normalizedMessage = isNotDeployed
        ? `NOT_DEPLOYED: no active deployment found for '${mappingId}' in environment '${request.environment}'`
        : retryResult.message;

      await updateDeploymentOrchestrationStatus({
        orchestrationId: orchestration.orchestrationId,
        status: retryResult.finalStatus,
        attemptCount: retryResult.attemptCount,
        requestId: retryResult.requestId,
        lastErrorCode: normalizedCode,
        lastErrorMessage: normalizedMessage,
      });

      return errorResponse(
        normalizedCode,
        normalizedMessage,
        normalizedStatus,
        retryResult.retryable,
        retryResult.requestId,
        {
          orchestrationId: orchestration.orchestrationId,
          environment: request.environment,
          mappingId,
          attemptCount: retryResult.attemptCount,
          finalStatus: retryResult.finalStatus,
        },
      );
    }

    const previewData = retryResult.data;
    if (!previewData) {
      const message = 'Runtime preview response missing data payload.';
      await updateDeploymentOrchestrationStatus({
        orchestrationId: orchestration.orchestrationId,
        status: 'failed',
        attemptCount: retryResult.attemptCount,
        requestId: retryResult.requestId,
        lastErrorCode: ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        lastErrorMessage: message,
      });

      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        message,
        500,
        false,
        retryResult.requestId,
        {
          orchestrationId: orchestration.orchestrationId,
          environment: request.environment,
          mappingId,
        },
      );
    }

    const current = await getCurrent(mappingId, request.environment);

    await updateDeploymentOrchestrationStatus({
      orchestrationId: orchestration.orchestrationId,
      status: 'succeeded',
      attemptCount: retryResult.attemptCount,
      artifactId: previewData.artifactId ?? undefined,
      requestId: retryResult.requestId,
    });

    return jsonResponse(200, {
      output: (previewData.output ?? {}) as Readonly<Record<string, unknown>>,
      diagnostics: previewData.diagnostics,
      metadata: {
        environment: previewData.environment,
        artifactId: previewData.artifactId,
        artifactHash: previewData.artifactHash,
        deployedAt: current?.deployedAt ?? null,
        sourceType: current?.sourceType ?? null,
        sourceNumber: current?.sourceNumber ?? null,
        engineVersion: null,
      },
    }, retryResult.requestId);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
