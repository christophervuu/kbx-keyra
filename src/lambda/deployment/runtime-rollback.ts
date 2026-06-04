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
import { appendDeploymentHistory, listDeploymentHistory, upsertActiveSnapshot } from '../../lib/persistence/deployments.js';

interface RuntimeRollbackRequest {
  readonly mappingId: string;
  readonly snapshotId: string;
  readonly requestedBy?: string;
}

function logRuntime(fields: {
  readonly eventType: 'rollback';
  readonly requestId: string;
  readonly mappingId: string;
  readonly snapshotId?: string;
  readonly outcome: 'success' | 'validation-error' | 'not-found' | 'error';
  readonly durationMs: number;
}): void {
  console.info(JSON.stringify(fields));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startedAt = Date.now();
  const body = parseBody(event);
  const requestId = generateRequestId();
  const request = parseRollbackRequest(body);

  if (!request) {
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
