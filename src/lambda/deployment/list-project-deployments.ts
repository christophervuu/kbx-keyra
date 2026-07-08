import {
  ERROR_CODES,
  errorResponse,
  internalError,
  jsonResponse,
  parsePathParam,
  parseQueryParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import {
  listByAttention as listDeploymentSummariesByAttention,
  listByProject as listDeploymentSummariesByProject,
} from '../../lib/persistence/deployment-summaries.js';
import type {
  DeploymentAttentionState,
  DeploymentEnvironment,
  DeploymentFreshness,
  DeploymentOperationStatus,
} from '../../lib/persistence/types.js';
import {
  createFilterHash,
  decodeCursor,
  hasFailure,
  listDeploymentSummaries,
  parsePageSize,
  parseVersionFilter,
  toResponseRow,
  validOperationStatuses,
  type DeploymentSummaryFilters,
} from './deployment-summary-listing.js';

function parseEnvironment(value: string | null): DeploymentEnvironment | null {
  if (value === null) {
    return null;
  }

  return value === 'DEV' || value === 'PREPROD' || value === 'PROD' ? value : null;
}

function parseFreshness(value: string | null): DeploymentFreshness | null {
  if (value === null) {
    return null;
  }

  return value === 'NOT_DEPLOYED' || value === 'CURRENT' || value === 'STALE' ? value : null;
}

function parseAttentionState(value: string | null): DeploymentAttentionState | null {
  if (value === null) {
    return null;
  }

  return value === 'OK' || value === 'NEEDS_ATTENTION' ? value : null;
}

function parseOperationStatus(value: string | null): DeploymentOperationStatus | null {
  if (value === null) {
    return null;
  }

  return validOperationStatuses().includes(value as DeploymentOperationStatus)
    ? (value as DeploymentOperationStatus)
    : null;
}

function parseNonEmpty(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const projectId = parsePathParam(event, 'projectId') ?? parsePathParam(event, 'id');
  if (!projectId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: projectId', 400, false);
  }

  const rawEnvironment = parseQueryParam(event, 'environment');
  const rawFreshness = parseQueryParam(event, 'freshness');
  const rawAttentionState = parseQueryParam(event, 'attentionState');
  const rawOperationStatus = parseQueryParam(event, 'operationStatus') ?? parseQueryParam(event, 'status');
  const rawVersion = parseQueryParam(event, 'version');
  const rawSearch = parseQueryParam(event, 'search');
  const rawPageSize = parseQueryParam(event, 'pageSize');
  const rawCursor = parseQueryParam(event, 'cursor');

  const environment = parseEnvironment(rawEnvironment);
  if (rawEnvironment !== null && !environment) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid query parameter: environment', 400, false);
  }

  const freshness = parseFreshness(rawFreshness);
  if (rawFreshness !== null && !freshness) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid query parameter: freshness', 400, false);
  }

  const attentionState = parseAttentionState(rawAttentionState);
  if (rawAttentionState !== null && !attentionState) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid query parameter: attentionState', 400, false);
  }

  const operationStatus = parseOperationStatus(rawOperationStatus);
  if (rawOperationStatus !== null && !operationStatus) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid query parameter: operationStatus', 400, false);
  }

  const version = parseVersionFilter(rawVersion);
  if (rawVersion !== null && version === null) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid query parameter: version', 400, false);
  }

  const pageSize = parsePageSize(rawPageSize);
  if (pageSize === null) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid query parameter: pageSize', 400, false);
  }

  const search = parseNonEmpty(rawSearch);

  const filters: DeploymentSummaryFilters = {
    ...(environment ? { environment } : {}),
    ...(freshness ? { freshness } : {}),
    ...(attentionState ? { attentionState } : {}),
    ...(operationStatus ? { operationStatus } : {}),
    ...(version !== null ? { version } : {}),
    ...(search ? { search } : {}),
  };

  let cursorOffset = 0;
  if (rawCursor !== null) {
    const decoded = decodeCursor(rawCursor);
    if (!decoded) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid query parameter: cursor', 400, false);
    }

    const filterHash = createFilterHash(filters, `project:${projectId}`);
    if (decoded.fh !== filterHash || decoded.sv !== 1) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid cursor for current filter set', 400, false);
    }

    cursorOffset = decoded.o;
  }

  const startedAt = Date.now();

  try {
    const projectRows = await listDeploymentSummariesByProject(projectId);
    const rows = attentionState
      ? (await listDeploymentSummariesByAttention(attentionState)).filter((row) => row.projectId === projectId)
      : projectRows;

    const listing = listDeploymentSummaries(rows, filters, pageSize, cursorOffset, `project:${projectId}`);
    const response = {
      projectId,
      items: listing.pageRows.map(toResponseRow),
      page: {
        pageSize: listing.pageSize,
        nextCursor: listing.nextCursor,
        returned: listing.pageRows.length,
        totalMatched: listing.matchedRows.length,
      },
      summary: {
        failedCount: listing.matchedRows.filter(hasFailure).length,
        attentionCount: listing.matchedRows.filter((row) => row.attentionState === 'NEEDS_ATTENTION').length,
      },
    };

    console.info(JSON.stringify({
      eventType: 'deployment-summary-list',
      scope: 'project',
      requestPath: '/projects/{projectId}/deployments',
      projectId,
      durationMs: Date.now() - startedAt,
      sourceCount: listing.sourceRows.length,
      matchedCount: listing.matchedRows.length,
      returnedCount: listing.pageRows.length,
      pageSize,
      hasNextCursor: listing.nextCursor !== null,
    }));

    return jsonResponse(200, response);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
