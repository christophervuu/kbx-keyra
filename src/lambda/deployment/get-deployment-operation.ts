import {
  ERROR_CODES,
  errorResponse,
  internalError,
  jsonResponse,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { getOperationRecord } from '../../lib/persistence/deployment-orchestrations.js';

function toResponse(record: Awaited<ReturnType<typeof getOperationRecord>>): Record<string, unknown> {
  const requestedBy = record?.requestedBy;
  return {
    operationId: record?.operationId,
    mappingId: record?.mappingId,
    projectId: record?.projectId ?? null,
    operationType: record?.operationType,
    operationStatus: record?.operationStatus,
    operationStage: record?.operationStage ?? null,
    sourceEnvironment: record?.sourceEnvironment ?? null,
    targetEnvironment: record?.targetEnvironment ?? null,
    sourceVersion: record?.sourceVersion ?? null,
    artifactId: record?.artifactId ?? null,
    artifactHash: record?.artifactHash ?? null,
    requestedBy: requestedBy
      ? {
          actorType: requestedBy.actorType,
          actorId: requestedBy.actorId,
          ...(requestedBy.actorDisplayName ? { actorDisplayName: requestedBy.actorDisplayName } : {}),
          ...(requestedBy.actorEmail ? { actorEmail: requestedBy.actorEmail } : {}),
        }
      : null,
    requestedAt: record?.requestedAt,
    startedAt: record?.startedAt ?? null,
    completedAt: record?.completedAt ?? null,
    failureCode: record?.failureCode ?? null,
    failureMessage: record?.failureMessage ?? null,
    retryable: record?.retryable ?? null,
    retryOfOperationId: record?.retryOfOperationId ?? null,
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const operationId = parsePathParam(event, 'operationId') ?? parsePathParam(event, 'id');
  if (!operationId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: operationId', 400, false);
  }

  try {
    const operation = await getOperationRecord(operationId);
    if (!operation) {
      return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Deployment operation with id '${operationId}' not found`, 404, false);
    }

    return jsonResponse(200, toResponse(operation));
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
