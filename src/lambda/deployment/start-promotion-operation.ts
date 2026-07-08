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

interface PromoteMutationRequest {
  readonly sourceEnvironment: DeploymentEnvironment;
  readonly targetEnvironment: DeploymentEnvironment;
  readonly expectedSourceArtifactId: string;
  readonly expectedTargetArtifactId: string | null;
  readonly reason?: string;
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

function parseRequest(body: Record<string, unknown> | null): PromoteMutationRequest | null {
  if (!body) {
    return null;
  }

  const sourceEnvironment = body.sourceEnvironment;
  const targetEnvironment = body.targetEnvironment;
  const expectedSourceArtifactId = body.expectedSourceArtifactId;
  const expectedTargetArtifactId = body.expectedTargetArtifactId;
  const reason = body.reason;

  if ((sourceEnvironment !== 'DEV' && sourceEnvironment !== 'PREPROD' && sourceEnvironment !== 'PROD')
    || (targetEnvironment !== 'DEV' && targetEnvironment !== 'PREPROD' && targetEnvironment !== 'PROD')) {
    return null;
  }

  if (typeof expectedSourceArtifactId !== 'string' || expectedSourceArtifactId.trim() === '') {
    return null;
  }

  if (!(expectedTargetArtifactId === null || typeof expectedTargetArtifactId === 'string')) {
    return null;
  }

  if (reason !== undefined && typeof reason !== 'string') {
    return null;
  }

  return {
    sourceEnvironment,
    targetEnvironment,
    expectedSourceArtifactId: expectedSourceArtifactId.trim(),
    expectedTargetArtifactId,
    ...(typeof reason === 'string' && reason.trim() ? { reason: reason.trim() } : {}),
  };
}

function isSequentialPath(source: DeploymentEnvironment, target: DeploymentEnvironment): boolean {
  return (source === 'DEV' && target === 'PREPROD') || (source === 'PREPROD' && target === 'PROD');
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
      'Invalid promotion request body. Expected { sourceEnvironment, targetEnvironment, expectedSourceArtifactId, expectedTargetArtifactId, reason? }',
      400,
      false,
    );
  }

  if (!isSequentialPath(request.sourceEnvironment, request.targetEnvironment)) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid promotion path.', 400, false);
  }

  if (request.targetEnvironment === 'PROD' && (!request.reason || request.reason.trim() === '')) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'reason is required for PROD promotions.', 400, false);
  }

  const sourceCurrent = await getCurrent(mappingId, request.sourceEnvironment);
  const targetCurrent = await getCurrent(mappingId, request.targetEnvironment);
  if (!sourceCurrent?.artifactId || sourceCurrent.artifactId !== request.expectedSourceArtifactId) {
    return errorResponse(
      ERROR_CODES.CONFLICT,
      'Expected source artifact mismatch for promotion.',
      409,
      false,
      undefined,
      {
        expectedSourceArtifactId: request.expectedSourceArtifactId,
        currentSourceArtifactId: sourceCurrent?.artifactId ?? null,
      },
    );
  }

  const currentTargetArtifactId = targetCurrent?.artifactId ?? null;
  if (currentTargetArtifactId !== request.expectedTargetArtifactId) {
    return errorResponse(
      ERROR_CODES.CONFLICT,
      'Expected target artifact mismatch for promotion.',
      409,
      false,
      undefined,
      {
        expectedTargetArtifactId: request.expectedTargetArtifactId,
        currentTargetArtifactId,
      },
    );
  }

  const operationId = [
    'op',
    'promote',
    mappingId,
    request.sourceEnvironment,
    request.targetEnvironment,
    request.expectedSourceArtifactId,
    idempotencyKey,
  ].join(':');

  const lockTtlSeconds = Number.parseInt(((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.DEPLOYMENT_OPERATION_LOCK_TTL_SECONDS ?? '300'), 10);
  const lock = await acquireOperationLock({
    mappingId,
    targetEnvironment: request.targetEnvironment,
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
        targetEnvironment: request.targetEnvironment,
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
      operationType: 'PROMOTE',
      operationStatus: 'QUEUED',
      operationStage: 'VALIDATING_REQUEST',
      sourceEnvironment: request.sourceEnvironment,
      targetEnvironment: request.targetEnvironment,
      artifactId: request.expectedSourceArtifactId,
      requestedBy: actor,
      requestedAt: new Date().toISOString(),
      idempotencyKey,
    });
  }

  emitDeploymentMetric({
    metricName: 'deployment.operation.queued',
    mappingId,
    operationId,
    operationType: 'PROMOTE',
    operationStatus: 'QUEUED',
    environment: request.targetEnvironment,
    artifactId: request.expectedSourceArtifactId,
    actor,
  });

  return jsonResponse(202, {
    operationId,
    operationType: 'PROMOTE',
    status: 'QUEUED',
    statusUrl: `/deployment-operations/${encodeURIComponent(operationId)}`,
    requestedAt: new Date().toISOString(),
  });
}
