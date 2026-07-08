import {
  ERROR_CODES,
  errorResponse,
  jsonResponse,
  parseBody,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import {
  acquireOperationLock,
  createOperationRecord,
  getOperationRecord,
} from '../../lib/persistence/deployment-orchestrations.js';
import { getCurrent } from '../../lib/persistence/deployments.js';
import { resolveActorFromEvent } from './actor-context.js';
import { emitDeploymentMetric } from './observability.js';

type DeploymentEnvironment = 'DEV' | 'PREPROD' | 'PROD';

interface RollbackMutationRequest {
  readonly environment: DeploymentEnvironment;
  readonly targetArtifactId: string;
  readonly expectedActiveArtifactId: string;
  readonly reason: string;
}

function parseIdempotencyKey(event: APIGatewayProxyEvent): string | null {
  const headers = event.headers;
  if (!headers) {
    return null;
  }

  const key = headers['Idempotency-Key'] ?? headers['idempotency-key'] ?? headers['x-idempotency-key'] ?? headers['X-Idempotency-Key'];
  if (typeof key !== 'string' || key.trim() === '') {
    return null;
  }

  return key.trim();
}

function parseRequest(body: Record<string, unknown> | null): RollbackMutationRequest | null {
  if (!body) {
    return null;
  }

  const environment = body.environment;
  const targetArtifactId = body.targetArtifactId;
  const expectedActiveArtifactId = body.expectedActiveArtifactId;
  const reason = body.reason;

  if (environment !== 'DEV' && environment !== 'PREPROD' && environment !== 'PROD') {
    return null;
  }

  if (typeof targetArtifactId !== 'string' || targetArtifactId.trim() === '') {
    return null;
  }

  if (typeof expectedActiveArtifactId !== 'string' || expectedActiveArtifactId.trim() === '') {
    return null;
  }

  if (typeof reason !== 'string' || reason.trim() === '') {
    return null;
  }

  return {
    environment,
    targetArtifactId: targetArtifactId.trim(),
    expectedActiveArtifactId: expectedActiveArtifactId.trim(),
    reason: reason.trim(),
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const actor = resolveActorFromEvent(event);
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const idempotencyKey = parseIdempotencyKey(event);
  if (!idempotencyKey) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required header: Idempotency-Key', 400, false);
  }

  const request = parseRequest(parseBody(event));
  if (!request) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid rollback request body. Expected { environment, targetArtifactId, expectedActiveArtifactId, reason }',
      400,
      false,
    );
  }

  const current = await getCurrent(mappingId, request.environment);
  if (!current?.artifactId || current.artifactId !== request.expectedActiveArtifactId) {
    return errorResponse(
      ERROR_CODES.CONFLICT,
      'Expected active artifact mismatch for rollback.',
      409,
      false,
      undefined,
      {
        expectedActiveArtifactId: request.expectedActiveArtifactId,
        currentActiveArtifactId: current?.artifactId ?? null,
      },
    );
  }

  const operationId = [
    'op',
    'rollback',
    mappingId,
    request.environment,
    request.targetArtifactId,
    idempotencyKey,
  ].join(':');

  const lockTtlSeconds = Number.parseInt(((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.DEPLOYMENT_OPERATION_LOCK_TTL_SECONDS ?? '300'), 10);
  const lock = await acquireOperationLock({
    mappingId,
    targetEnvironment: request.environment,
    ownerOperationId: operationId,
    ttlSeconds: Number.isFinite(lockTtlSeconds) && lockTtlSeconds > 0 ? lockTtlSeconds : 300,
  });
  if (lock.outcome === 'conflict') {
    return errorResponse(
      ERROR_CODES.CONFLICT,
      'Another deployment operation is already in progress for this mapping/environment.',
      409,
      false,
      undefined,
      {
        mappingId,
        targetEnvironment: request.environment,
        lockOwnerOperationId: lock.existingLockOwnerOperationId,
        lockExpiresAtEpochSeconds: lock.expiresAt,
      },
    );
  }

  const existing = await getOperationRecord(operationId);
  if (!existing) {
    await createOperationRecord({
      orchestrationId: operationId,
      operationId,
      mappingId,
      operationType: 'ROLLBACK',
      operationStatus: 'QUEUED',
      operationStage: 'VALIDATING_REQUEST',
      targetEnvironment: request.environment,
      artifactId: request.targetArtifactId,
      requestedBy: actor,
      requestedAt: new Date().toISOString(),
      idempotencyKey,
    });
  }

  emitDeploymentMetric({
    metricName: 'deployment.operation.queued',
    mappingId,
    operationId,
    operationType: 'ROLLBACK',
    operationStatus: 'QUEUED',
    environment: request.environment,
    artifactId: request.targetArtifactId,
    actor,
  });

  return jsonResponse(202, {
    operationId,
    operationType: 'ROLLBACK',
    status: 'QUEUED',
    statusUrl: `/deployment-operations/${encodeURIComponent(operationId)}`,
    requestedAt: new Date().toISOString(),
  });
}
