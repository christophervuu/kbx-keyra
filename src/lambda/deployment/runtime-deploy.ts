import {
  ERROR_CODES,
  errorResponse,
  generateRequestId,
  internalError,
  jsonResponse,
  parseBody,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import {
  appendDeploymentHistory,
  listDeploymentHistory,
  upsertActiveSnapshot,
} from '../../lib/persistence/deployments.js';
import { putRuntimeSnapshot, RuntimeSnapshotHashMismatchError } from '../../lib/persistence/s3/deployment-snapshot.js';
import type { DeploymentSourceType } from '../../lib/persistence/types.js';

interface RuntimeDeployRequest {
  readonly mappingId: string;
  readonly snapshotId: string;
  readonly snapshotHash: string;
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
  readonly requestedBy?: string;
  readonly snapshotPayload?: unknown;
}

interface RuntimeRollbackRequest {
  readonly mappingId: string;
  readonly snapshotId: string;
  readonly requestedBy?: string;
}

function logRuntime(fields: {
  readonly eventType: 'deploy' | 'rollback';
  readonly requestId: string;
  readonly mappingId: string;
  readonly snapshotId?: string;
  readonly outcome: 'success' | 'validation-error' | 'not-found' | 'integrity-error' | 'error';
  readonly durationMs: number;
}): void {
  console.info(JSON.stringify(fields));
}

function isSourceType(value: unknown): value is DeploymentSourceType {
  return value === 'revision' || value === 'version';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseDeployRequest(body: Record<string, unknown> | null): RuntimeDeployRequest | null {
  if (!body) {
    return null;
  }

  const mappingId = body.mappingId;
  const snapshotId = body.snapshotId;
  const snapshotHash = body.snapshotHash;
  const sourceType = body.sourceType;
  const sourceNumber = body.sourceNumber;
  const requestedBy = body.requestedBy;

  if (!isNonEmptyString(mappingId) || !isNonEmptyString(snapshotId) || !isNonEmptyString(snapshotHash)) {
    return null;
  }

  if (!isSourceType(sourceType) || typeof sourceNumber !== 'number' || !Number.isInteger(sourceNumber) || sourceNumber <= 0) {
    return null;
  }

  if (requestedBy !== undefined && !isNonEmptyString(requestedBy)) {
    return null;
  }

  return {
    mappingId,
    snapshotId,
    snapshotHash,
    sourceType,
    sourceNumber,
    ...(requestedBy ? { requestedBy } : {}),
    ...(Object.hasOwn(body, 'snapshotPayload') ? { snapshotPayload: body.snapshotPayload } : {}),
  };
}

function parseRollbackRequest(body: Record<string, unknown> | null): RuntimeRollbackRequest | null {
  if (!body) {
    return null;
  }

  const mappingId = body.mappingId;
  const snapshotId = body.snapshotId;
  const requestedBy = body.requestedBy;

  if (!isNonEmptyString(mappingId) || !isNonEmptyString(snapshotId)) {
    return null;
  }

  if (requestedBy !== undefined && !isNonEmptyString(requestedBy)) {
    return null;
  }

  return {
    mappingId,
    snapshotId,
    ...(requestedBy ? { requestedBy } : {}),
  };
}

function hasDeployShape(body: Record<string, unknown> | null): boolean {
  return Boolean(body && Object.hasOwn(body, 'sourceType') && Object.hasOwn(body, 'sourceNumber') && Object.hasOwn(body, 'snapshotHash'));
}

async function handleDeploy(request: RuntimeDeployRequest, requestId: string): Promise<APIGatewayProxyResult> {
  const startedAt = Date.now();
  try {
    const snapshotWrite = await putRuntimeSnapshot({
      mappingId: request.mappingId,
      snapshotId: request.snapshotId,
      payload: request.snapshotPayload ?? request,
      contentHash: request.snapshotHash,
    });

    const active = await upsertActiveSnapshot({
      mappingId: request.mappingId,
      activeSnapshotId: request.snapshotId,
      snapshotHash: request.snapshotHash,
      activatedBy: request.requestedBy ?? 'control-plane',
      sourceType: request.sourceType,
      sourceNumber: request.sourceNumber,
    });

    const history = await appendDeploymentHistory({
      mappingId: request.mappingId,
      eventType: 'deploy',
      snapshotId: request.snapshotId,
      snapshotHash: request.snapshotHash,
      requestedBy: request.requestedBy ?? 'control-plane',
      sourceType: request.sourceType,
      sourceNumber: request.sourceNumber,
      requestId,
    });

    logRuntime({
      eventType: 'deploy',
      requestId,
      mappingId: request.mappingId,
      snapshotId: request.snapshotId,
      outcome: 'success',
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(
      201,
      {
        mappingId: request.mappingId,
        snapshotId: request.snapshotId,
        writeStatus: snapshotWrite.status,
        activeSnapshot: active,
        historyEvent: history,
      },
      requestId,
    );
  } catch (error) {
    if (error instanceof RuntimeSnapshotHashMismatchError) {
      logRuntime({
        eventType: 'deploy',
        requestId,
        mappingId: request.mappingId,
        snapshotId: request.snapshotId,
        outcome: 'integrity-error',
        durationMs: Date.now() - startedAt,
      });

      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        error.message,
        409,
        false,
        requestId,
      );
    }

    logRuntime({
      eventType: 'deploy',
      requestId,
      mappingId: request.mappingId,
      snapshotId: request.snapshotId,
      outcome: 'error',
      durationMs: Date.now() - startedAt,
    });

    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }
}

async function handleRollback(request: RuntimeRollbackRequest, requestId: string): Promise<APIGatewayProxyResult> {
  const startedAt = Date.now();
  try {
    const history = await listDeploymentHistory(request.mappingId);
    const target = history.find((item) => item.snapshotId === request.snapshotId);

    if (!target) {
      logRuntime({
        eventType: 'rollback',
        requestId,
        mappingId: request.mappingId,
        snapshotId: request.snapshotId,
        outcome: 'not-found',
        durationMs: Date.now() - startedAt,
      });

      return errorResponse(
        ERROR_CODES.SOURCE_NOT_FOUND,
        `Runtime snapshot not found: ${request.mappingId}:${request.snapshotId}`,
        404,
        false,
        requestId,
      );
    }

    const active = await upsertActiveSnapshot({
      mappingId: request.mappingId,
      activeSnapshotId: target.snapshotId,
      snapshotHash: target.snapshotHash,
      activatedBy: request.requestedBy ?? 'control-plane',
      sourceType: target.sourceType,
      sourceNumber: target.sourceNumber,
    });

    const rollbackEvent = await appendDeploymentHistory({
      mappingId: request.mappingId,
      eventType: 'rollback',
      snapshotId: target.snapshotId,
      snapshotHash: target.snapshotHash,
      requestedBy: request.requestedBy ?? 'control-plane',
      sourceType: target.sourceType,
      sourceNumber: target.sourceNumber,
      rollbackOf: target.eventAt,
      requestId,
    });

    logRuntime({
      eventType: 'rollback',
      requestId,
      mappingId: request.mappingId,
      snapshotId: target.snapshotId,
      outcome: 'success',
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(
      201,
      {
        mappingId: request.mappingId,
        snapshotId: target.snapshotId,
        activeSnapshot: active,
        historyEvent: rollbackEvent,
      },
      requestId,
    );
  } catch {
    logRuntime({
      eventType: 'rollback',
      requestId,
      mappingId: request.mappingId,
      snapshotId: request.snapshotId,
      outcome: 'error',
      durationMs: Date.now() - startedAt,
    });

    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startedAt = Date.now();
  const body = parseBody(event);
  const requestId = generateRequestId();

  if (hasDeployShape(body)) {
    const deployRequest = parseDeployRequest(body);
    if (!deployRequest) {
      logRuntime({
        eventType: 'deploy',
        requestId,
        mappingId: 'unknown',
        outcome: 'validation-error',
        durationMs: Date.now() - startedAt,
      });

      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid runtime deploy request body. Expected { mappingId, snapshotId, snapshotHash, sourceType, sourceNumber, snapshotPayload? }',
        400,
        false,
        requestId,
      );
    }

    return handleDeploy(deployRequest, requestId);
  }

  const rollbackRequest = parseRollbackRequest(body);
  if (!rollbackRequest) {
    logRuntime({
      eventType: 'rollback',
      requestId,
      mappingId: 'unknown',
      outcome: 'validation-error',
      durationMs: Date.now() - startedAt,
    });

    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid runtime rollback request body. Expected { mappingId, snapshotId }',
      400,
      false,
      requestId,
    );
  }

  return handleRollback(rollbackRequest, requestId);
}
