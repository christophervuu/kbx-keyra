import type {
  DeploymentAttentionState,
  DeploymentEnvironment,
  DeploymentFreshness,
  DeploymentOperationStatus,
  DeploymentSummaryItem,
} from '../../lib/persistence/types.js';

export interface DeploymentSummaryFilters {
  readonly environment?: DeploymentEnvironment;
  readonly freshness?: DeploymentFreshness;
  readonly attentionState?: DeploymentAttentionState;
  readonly operationStatus?: DeploymentOperationStatus;
  readonly version?: number;
  readonly search?: string;
}

export interface DeploymentSummaryCursorPayload {
  readonly o: number;
  readonly fh: string;
  readonly sv: number;
}

export interface DeploymentSummaryListResult {
  readonly sourceRows: readonly DeploymentSummaryItem[];
  readonly matchedRows: readonly DeploymentSummaryItem[];
  readonly pageRows: readonly DeploymentSummaryItem[];
  readonly pageSize: number;
  readonly nextCursor: string | null;
}

const SORT_VERSION = 1;

function environmentState(item: DeploymentSummaryItem, environment: DeploymentEnvironment): {
  readonly activeVersion: number | null;
  readonly freshness: DeploymentFreshness;
  readonly lastOperationStatus: DeploymentOperationStatus | null;
} {
  if (environment === 'DEV') {
    return {
      activeVersion: item.devActiveVersion,
      freshness: item.devFreshness,
      lastOperationStatus: item.devLastOperationStatus,
    };
  }

  if (environment === 'PREPROD') {
    return {
      activeVersion: item.preprodActiveVersion,
      freshness: item.preprodFreshness,
      lastOperationStatus: item.preprodLastOperationStatus,
    };
  }

  return {
    activeVersion: item.prodActiveVersion,
    freshness: item.prodFreshness,
    lastOperationStatus: item.prodLastOperationStatus,
  };
}

function includesSearch(item: DeploymentSummaryItem, search: string): boolean {
  const tokens = search
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return true;
  }

  const haystack = [item.projectName, item.mappingName, item.mappingId]
    .join(' ')
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function hasOperationStatus(item: DeploymentSummaryItem, status: DeploymentOperationStatus): boolean {
  return item.devLastOperationStatus === status
    || item.preprodLastOperationStatus === status
    || item.prodLastOperationStatus === status;
}

function hasFreshness(item: DeploymentSummaryItem, freshness: DeploymentFreshness): boolean {
  return item.devFreshness === freshness
    || item.preprodFreshness === freshness
    || item.prodFreshness === freshness;
}

function hasVersion(item: DeploymentSummaryItem, version: number): boolean {
  return item.latestVersion === version;
}

function compareRows(a: DeploymentSummaryItem, b: DeploymentSummaryItem): number {
  const byActivity = b.lastActivityAt.localeCompare(a.lastActivityAt);
  if (byActivity !== 0) {
    return byActivity;
  }

  const byProjectName = a.projectName.localeCompare(b.projectName);
  if (byProjectName !== 0) {
    return byProjectName;
  }

  const byMappingName = a.mappingName.localeCompare(b.mappingName);
  if (byMappingName !== 0) {
    return byMappingName;
  }

  return a.mappingId.localeCompare(b.mappingId);
}

export function parsePageSize(value: string | null): number | null {
  if (value === null) {
    return 100;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(parsed, 250);
}

export function parseVersionFilter(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function createFilterHash(filters: DeploymentSummaryFilters, scopeKey?: string): string {
  return JSON.stringify({
    scopeKey: scopeKey ?? null,
    environment: filters.environment ?? null,
    freshness: filters.freshness ?? null,
    attentionState: filters.attentionState ?? null,
    operationStatus: filters.operationStatus ?? null,
    version: filters.version ?? null,
    search: (filters.search ?? '').trim().toLowerCase(),
  });
}

export function encodeCursor(payload: DeploymentSummaryCursorPayload): string {
  return encodeURIComponent(JSON.stringify(payload));
}

export function decodeCursor(value: string): DeploymentSummaryCursorPayload | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as DeploymentSummaryCursorPayload;
    if (
      !parsed
      || typeof parsed !== 'object'
      || !Number.isSafeInteger(parsed.o)
      || parsed.o < 0
      || typeof parsed.fh !== 'string'
      || !Number.isSafeInteger(parsed.sv)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function listDeploymentSummaries(
  rows: readonly DeploymentSummaryItem[],
  filters: DeploymentSummaryFilters,
  pageSize: number,
  cursorOffset: number,
  scopeKey?: string,
): DeploymentSummaryListResult {
  const sorted = [...rows].sort(compareRows);

  const matchedRows = sorted.filter((item) => {
    if (filters.environment) {
      const state = environmentState(item, filters.environment);

      if (filters.freshness && state.freshness !== filters.freshness) {
        return false;
      }

      if (filters.operationStatus && state.lastOperationStatus !== filters.operationStatus) {
        return false;
      }

      if (filters.version !== undefined && state.activeVersion !== filters.version) {
        return false;
      }
    } else {
      if (filters.freshness && !hasFreshness(item, filters.freshness)) {
        return false;
      }

      if (filters.operationStatus && !hasOperationStatus(item, filters.operationStatus)) {
        return false;
      }

      if (filters.version !== undefined && !hasVersion(item, filters.version)) {
        return false;
      }
    }

    if (filters.attentionState && item.attentionState !== filters.attentionState) {
      return false;
    }

    if (filters.search && !includesSearch(item, filters.search)) {
      return false;
    }

    return true;
  });

  const pageRows = matchedRows.slice(cursorOffset, cursorOffset + pageSize);
  const nextOffset = cursorOffset + pageSize;
  const nextCursor = nextOffset < matchedRows.length
    ? encodeCursor({ o: nextOffset, fh: createFilterHash(filters, scopeKey), sv: SORT_VERSION })
    : null;

  return {
    sourceRows: sorted,
    matchedRows,
    pageRows,
    pageSize,
    nextCursor,
  };
}

export function hasFailure(item: DeploymentSummaryItem): boolean {
  return item.devLastOperationStatus === 'FAILED'
    || item.devLastOperationStatus === 'TIMED_OUT'
    || item.preprodLastOperationStatus === 'FAILED'
    || item.preprodLastOperationStatus === 'TIMED_OUT'
    || item.prodLastOperationStatus === 'FAILED'
    || item.prodLastOperationStatus === 'TIMED_OUT';
}

export function toResponseRow(item: DeploymentSummaryItem): Record<string, unknown> {
  return {
    mappingId: item.mappingId,
    projectId: item.projectId,
    projectName: item.projectName,
    mappingName: item.mappingName,
    latestVersion: item.latestVersion,
    latestVersionCreatedAt: item.latestVersionCreatedAt,
    promotionState: item.promotionState,
    attentionState: item.attentionState,
    activeOperationId: item.activeOperationId,
    lastActivityAt: item.lastActivityAt,
    lastActorId: item.lastActorId,
    ...(item.lastActorDisplayName ? { lastActorDisplayName: item.lastActorDisplayName } : {}),
    updatedAt: item.updatedAt,
    environments: {
      DEV: {
        activeArtifactId: item.devActiveArtifactId,
        activeVersion: item.devActiveVersion,
        freshness: item.devFreshness,
        lastOperationStatus: item.devLastOperationStatus,
      },
      PREPROD: {
        activeArtifactId: item.preprodActiveArtifactId,
        activeVersion: item.preprodActiveVersion,
        freshness: item.preprodFreshness,
        lastOperationStatus: item.preprodLastOperationStatus,
      },
      PROD: {
        activeArtifactId: item.prodActiveArtifactId,
        activeVersion: item.prodActiveVersion,
        freshness: item.prodFreshness,
        lastOperationStatus: item.prodLastOperationStatus,
      },
    },
  };
}

export function validOperationStatuses(): readonly DeploymentOperationStatus[] {
  return ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT'];
}
