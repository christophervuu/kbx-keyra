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
import { evaluateVersionEligibility } from './version-eligibility.js';
import { resolveActorFromEvent } from './actor-context.js';
import { emitDeploymentMetric } from './observability.js';

type DeploymentEnvironment = 'DEV' | 'PREPROD' | 'PROD';

interface DeployMutationRequest {
  readonly version: number;
  readonly targetEnvironment: DeploymentEnvironment;
  readonly expectedActiveArtifactId: string | null;
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

function parseRequest(body: Record<string, unknown> | null): DeployMutationRequest | null {
  if (!body) {
    return null;
  }

  if ('sourceType' in body || 'sourceNumber' in body || 'revision' in body) {
    return null;
  }

  const version = body.version;
  const targetEnvironment = body.targetEnvironment;
  const expectedActiveArtifactId = body.expectedActiveArtifactId;
  const reason = body.reason;

  if (typeof version !== 'number' || !Number.isInteger(version) || version <= 0) {
    return null;
  }

  if (targetEnvironment !== 'DEV' && targetEnvironment !== 'PREPROD' && targetEnvironment !== 'PROD') {
    return null;
  }

  if (!(expectedActiveArtifactId === null || typeof expectedActiveArtifactId === 'string')) {
    return null;
  }

  if (reason !== undefined && typeof reason !== 'string') {
    return null;
  }

  return {
    version,
    targetEnvironment,
    expectedActiveArtifactId,
    ...(typeof reason === 'string' && reason.trim() ? { reason: reason.trim() } : {}),
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
      'Invalid deploy request body. Expected { version, targetEnvironment, expectedActiveArtifactId, reason? } and revision-style fields are not allowed.',
      400,
      false,
    );
  }

  if (request.targetEnvironment !== 'DEV') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'targetEnvironment must be DEV for deploy operations.', 400, false);
  }

  const eligibility = await evaluateVersionEligibility({ mappingId, version: request.version });
  if (!eligibility.eligible) {
    if (eligibility.reason === 'UNRESOLVED_VALUE_MAP_BINDINGS') {
      return errorResponse(ERROR_CODES.CONFLICT, eligibility.message, 409, false);
    }

    return errorResponse(
      eligibility.reason === 'VERSION_NOT_FOUND' ? ERROR_CODES.RESOURCE_NOT_FOUND : ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
      eligibility.message,
      eligibility.statusCode,
      false,
    );
  }

  const current = await getCurrent(mappingId, 'DEV');
  const currentArtifactId = current?.artifactId ?? null;
  if (currentArtifactId !== request.expectedActiveArtifactId) {
    return errorResponse(
      ERROR_CODES.CONFLICT,
      'Expected active artifact mismatch for DEV.',
      409,
      false,
      undefined,
      {
        expectedActiveArtifactId: request.expectedActiveArtifactId,
        currentActiveArtifactId: currentArtifactId,
      },
    );
  }

  const operationId = ['op', 'deploy', mappingId, String(request.version), request.targetEnvironment, idempotencyKey].join(':');
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
      operationType: 'DEPLOY',
      operationStatus: 'QUEUED',
      operationStage: 'VALIDATING_REQUEST',
      targetEnvironment: request.targetEnvironment,
      sourceVersion: request.version,
      requestedBy: actor,
      requestedAt: new Date().toISOString(),
      idempotencyKey,
    });
  }

  emitDeploymentMetric({
    metricName: 'deployment.operation.queued',
    mappingId,
    operationId,
    operationType: 'DEPLOY',
    operationStatus: 'QUEUED',
    environment: request.targetEnvironment,
    actor,
  });

  return jsonResponse(202, {
    operationId,
    operationType: 'DEPLOY',
    status: 'QUEUED',
    statusUrl: `/deployment-operations/${encodeURIComponent(operationId)}`,
    requestedAt: new Date().toISOString(),
  });
}
