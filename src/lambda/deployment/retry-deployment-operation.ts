import {
  ERROR_CODES,
  errorResponse,
  jsonResponse,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { createOperationRecord, getOperationRecord } from '../../lib/persistence/deployment-orchestrations.js';
import type { DeploymentOperationRecord } from '../../lib/persistence/deployment-orchestrations.js';

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

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const operationId = parsePathParam(event, 'operationId') ?? parsePathParam(event, 'id');
  if (!operationId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: operationId', 400, false);
  }

  const idempotencyKey = parseIdempotencyKey(event);
  if (!idempotencyKey) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required header: Idempotency-Key', 400, false);
  }

  const existing = await getOperationRecord(operationId);
  if (!existing) {
    return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Deployment operation with id '${operationId}' not found`, 404, false);
  }

  const retryOperationId = ['op', 'retry', operationId, idempotencyKey].join(':');
  const already = await getOperationRecord(retryOperationId);
  if (!already) {
    const retryRecord: DeploymentOperationRecord = {
      orchestrationId: retryOperationId,
      operationId: retryOperationId,
      mappingId: existing.mappingId,
      ...(existing.projectId ? { projectId: existing.projectId } : {}),
      operationType: 'RETRY',
      operationStatus: 'QUEUED',
      operationStage: 'VALIDATING_REQUEST',
      ...(existing.sourceEnvironment ? { sourceEnvironment: existing.sourceEnvironment } : {}),
      ...(existing.targetEnvironment ? { targetEnvironment: existing.targetEnvironment } : {}),
      ...(typeof existing.sourceVersion === 'number' ? { sourceVersion: existing.sourceVersion } : {}),
      ...(existing.artifactId ? { artifactId: existing.artifactId } : {}),
      ...(existing.artifactHash ? { artifactHash: existing.artifactHash } : {}),
      requestedBy: existing.requestedBy,
      retryOfOperationId: operationId,
      requestedAt: new Date().toISOString(),
      idempotencyKey,
    };

    await createOperationRecord(retryRecord);
  }

  return jsonResponse(202, {
    operationId: retryOperationId,
    operationType: 'RETRY',
    status: 'QUEUED',
    statusUrl: `/deployment-operations/${encodeURIComponent(retryOperationId)}`,
    requestedAt: new Date().toISOString(),
    retryOfOperationId: operationId,
  });
}
