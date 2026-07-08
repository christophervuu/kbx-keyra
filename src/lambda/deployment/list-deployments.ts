import {
  ERROR_CODES,
  errorResponse,
  internalError,
  jsonResponse,
  parseQueryParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import {
  listByAttention as listDeploymentSummariesByAttention,
  listByProject as listDeploymentSummariesByProject,
  listGlobal as listDeploymentSummariesGlobal,
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

interface GlobalDeploymentSummaryFilters extends DeploymentSummaryFilters {
  readonly projectId?: string;
}

async function loadGlobalCandidateRows(filters: GlobalDeploymentSummaryFilters): Promise<
  Awaited<ReturnType<typeof listDeploymentSummariesGlobal>>
> {
  if (filters.attentionState) {
    const attentionRows = await listDeploymentSummariesByAttention(filters.attentionState);
    if (filters.environment === undefined && filters.projectId === undefined) {
      return attentionRows;
    }
  }

  if (filters.projectId) {
    return listDeploymentSummariesByProject(filters.projectId);
  }

  return listDeploymentSummariesGlobal();
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const rawProjectId = parseQueryParam(event, 'projectId');
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

  const filters: GlobalDeploymentSummaryFilters = {
    ...(rawProjectId ? { projectId: rawProjectId } : {}),
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

    const filterHash = createFilterHash(filters, `global:${filters.projectId ?? ''}`);
    if (decoded.fh !== filterHash || decoded.sv !== 1) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid cursor for current filter set', 400, false);
    }

    cursorOffset = decoded.o;
  }

  const startedAt = Date.now();

  try {
    const rows = await loadGlobalCandidateRows(filters);
    const listing = listDeploymentSummaries(rows, filters, pageSize, cursorOffset, `global:${filters.projectId ?? ''}`);

    const response = {
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
      scope: 'global',
      requestPath: '/deployments',
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
