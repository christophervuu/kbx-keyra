import { execute } from '../../engine/index.js';
import { getActiveSnapshot } from '../../lib/persistence/deployments.js';
import { RUNTIME_BUCKET_NAME, runtimeSnapshotKey } from '../../lib/persistence/config.js';
import {
  ERROR_CODES,
  errorResponse,
  generateRequestId,
  getObject,
  internalError,
  jsonResponse,
  parseBody,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

interface RuntimeExecuteRequest {
  readonly mappingId: string;
  readonly sourceData: Readonly<Record<string, unknown>>;
}

interface RuntimeSnapshotPayload {
  readonly mappingConfig?: unknown;
  readonly config?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseExecuteRequest(body: Record<string, unknown> | null): RuntimeExecuteRequest | null {
  if (!body) {
    return null;
  }

  const mappingId = body.mappingId;
  const sourceData = body.sourceData;

  if (!isNonEmptyString(mappingId) || !sourceData || typeof sourceData !== 'object' || Array.isArray(sourceData)) {
    return null;
  }

  return {
    mappingId,
    sourceData: sourceData as Readonly<Record<string, unknown>>,
  };
}

function parseSnapshotConfig(snapshotRaw: string): Parameters<typeof execute>[0] | null {
  const parsed = JSON.parse(snapshotRaw) as RuntimeSnapshotPayload;
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  if (parsed.mappingConfig && typeof parsed.mappingConfig === 'object') {
    return parsed.mappingConfig as Parameters<typeof execute>[0];
  }

  if (parsed.config && typeof parsed.config === 'object') {
    return parsed.config as Parameters<typeof execute>[0];
  }

  return null;
}

function logExecute(fields: {
  requestId: string;
  mappingId: string;
  snapshotId?: string;
  outcome: 'success' | 'not-deployed' | 'validation-error' | 'integrity-error' | 'error';
  durationMs: number;
}): void {
  console.info(
    JSON.stringify({
      eventType: 'execute',
      ...fields,
    }),
  );
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startedAt = Date.now();
  const requestId = generateRequestId();
  const request = parseExecuteRequest(parseBody(event));

  if (!request) {
    logExecute({
      requestId,
      mappingId: 'unknown',
      outcome: 'validation-error',
      durationMs: Date.now() - startedAt,
    });

    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid runtime execute request body. Expected { mappingId, sourceData }',
      400,
      false,
      requestId,
    );
  }

  try {
    const active = await getActiveSnapshot(request.mappingId);
    if (!active) {
      logExecute({
        requestId,
        mappingId: request.mappingId,
        outcome: 'not-deployed',
        durationMs: Date.now() - startedAt,
      });

      return errorResponse(
        ERROR_CODES.SOURCE_NOT_FOUND,
        `No active runtime snapshot found for mapping '${request.mappingId}'`,
        404,
        false,
        requestId,
      );
    }

    const snapshotKey = runtimeSnapshotKey(request.mappingId, active.activeSnapshotId);
    const rawSnapshot = await getObject({
      Bucket: RUNTIME_BUCKET_NAME,
      Key: snapshotKey,
    });

    const config = parseSnapshotConfig(rawSnapshot);
    if (!config) {
      logExecute({
        requestId,
        mappingId: request.mappingId,
        snapshotId: active.activeSnapshotId,
        outcome: 'integrity-error',
        durationMs: Date.now() - startedAt,
      });

      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        `Runtime snapshot payload invalid: ${request.mappingId}:${active.activeSnapshotId}`,
        500,
        false,
        requestId,
      );
    }

    const result = execute(config, request.sourceData, null, null);

    logExecute({
      requestId,
      mappingId: request.mappingId,
      snapshotId: active.activeSnapshotId,
      outcome: 'success',
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(
      200,
      {
        mappingId: request.mappingId,
        snapshotId: active.activeSnapshotId,
        output: (result.output ?? {}) as Readonly<Record<string, unknown>>,
        diagnostics: result.diagnostics,
        stats: result.stats,
      },
      requestId,
    );
  } catch {
    logExecute({
      requestId,
      mappingId: request.mappingId,
      outcome: 'error',
      durationMs: Date.now() - startedAt,
    });

    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }
}
