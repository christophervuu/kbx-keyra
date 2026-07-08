import type { RuntimeEnvironment, ValueTableListOptions } from '@/lib/types/domain';

export interface ProjectListQuery {
  readonly query?: string;
  readonly tag?: string;
  readonly sortBy?: 'name' | 'updatedAt' | 'createdAt';
  readonly sortDirection?: 'asc' | 'desc';
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ProjectMappingsListQuery {
  readonly query?: string;
  readonly status?: 'draft' | 'ready' | 'has-errors';
  readonly sortBy?: 'name' | 'updatedAt' | 'createdAt';
  readonly sortDirection?: 'asc' | 'desc';
  readonly page?: number;
  readonly pageSize?: number;
}

export interface SchemasListQuery {
  readonly query?: string;
  readonly ownership?: 'cdm' | 'user';
  readonly status?: 'ready' | 'processing' | 'needs_review' | 'error' | 'ingesting';
  readonly format?: 'json' | 'xml';
  readonly sortBy?: 'name' | 'updatedAt' | 'createdAt';
  readonly sortDirection?: 'asc' | 'desc';
  readonly page?: number;
  readonly pageSize?: number;
}

interface DeploymentsHistoryQuery {
  readonly environment?: RuntimeEnvironment;
}

export interface DeploymentOverviewListQuery {
  readonly environment?: RuntimeEnvironment;
  readonly freshness?: 'NOT_DEPLOYED' | 'CURRENT' | 'STALE';
  readonly attentionState?: 'OK' | 'NEEDS_ATTENTION';
  readonly operationStatus?: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT';
  readonly version?: number;
  readonly search?: string;
  readonly pageSize?: number;
  readonly cursor?: string;
}

type StableValue =
  | null
  | string
  | number
  | boolean
  | readonly StableValue[]
  | { readonly [key: string]: StableValue };

function stableValue(value: unknown): StableValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(stableValue) as readonly StableValue[];
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));

    const result: Record<string, StableValue> = {};
    for (const [key, entryValue] of entries) {
      result[key] = stableValue(entryValue);
    }

    return result;
  }

  return String(value);
}

export function stableParams<T extends Record<string, unknown>>(params: T | undefined): StableValue {
  return stableValue(params ?? {});
}

export const queryKeys = {
  home: {
    family: () => ['home'] as const,
    dashboard: () => ['home', 'dashboard'] as const,
  },
  projects: {
    family: () => ['projects'] as const,
    lists: () => ['projects', 'list'] as const,
    all: (query?: ProjectListQuery) => ['projects', 'list', stableParams(query)] as const,
    details: () => ['projects', 'detail'] as const,
    detail: (projectId: string) => ['projects', 'detail', projectId] as const,
    mappings: (projectId: string, query?: ProjectMappingsListQuery) =>
      ['projects', 'mappings', projectId, stableParams(query)] as const,
  },
  mappings: {
    family: () => ['mappings'] as const,
    lists: () => ['mappings', 'list'] as const,
    details: () => ['mappings', 'detail'] as const,
    detail: (mappingId: string) => ['mappings', 'detail', mappingId] as const,
    versions: (mappingId: string) => ['mappings', 'versions', mappingId] as const,
    savedConfig: (mappingId: string) => ['mappings', 'saved-config', mappingId] as const,
    deploymentContext: (mappingId: string) => ['mappings', 'deployment-context', mappingId] as const,
    deploymentHistory: (mappingId: string, query?: DeploymentsHistoryQuery) =>
      ['mappings', 'deployment-history', mappingId, stableParams(query)] as const,
  },
  schemas: {
    family: () => ['schemas'] as const,
    lists: () => ['schemas', 'list'] as const,
    all: (query?: SchemasListQuery) => ['schemas', 'list', stableParams(query)] as const,
    details: () => ['schemas', 'detail'] as const,
    detail: (schemaId: string) => ['schemas', 'detail', schemaId] as const,
    usages: () => ['schemas', 'usage'] as const,
    usage: (schemaId: string) => ['schemas', 'usage', schemaId] as const,
  },
  deployments: {
    family: () => ['deployments'] as const,
    summaries: () => ['deployments', 'summary'] as const,
    summary: (environment?: RuntimeEnvironment) =>
      ['deployments', 'summary', stableParams(environment ? { environment } : undefined)] as const,
    globalOverviews: () => ['deployments', 'overview', 'global'] as const,
    globalOverview: (query?: DeploymentOverviewListQuery) =>
      ['deployments', 'overview', 'global', stableParams(query)] as const,
    projectOverviews: () => ['deployments', 'overview', 'project'] as const,
    projectOverview: (projectId: string, query?: DeploymentOverviewListQuery) =>
      ['deployments', 'overview', 'project', projectId, stableParams(query)] as const,
    contexts: () => ['deployments', 'context'] as const,
    context: (mappingId: string) => ['deployments', 'context', mappingId] as const,
    histories: () => ['deployments', 'history'] as const,
    history: (mappingId: string, query?: DeploymentsHistoryQuery) =>
      ['deployments', 'history', mappingId, stableParams(query)] as const,
  },
  settings: {
    family: () => ['settings'] as const,
    global: () => ['settings', 'global'] as const,
    project: (projectId: string) => ['settings', 'project', projectId] as const,
  },
  valueTables: {
    family: () => ['value-tables'] as const,
    lists: () => ['value-tables', 'list'] as const,
    list: (projectId: string, options?: ValueTableListOptions) =>
      ['value-tables', 'list', projectId, stableParams(options)] as const,
    details: () => ['value-tables', 'detail'] as const,
    detail: (valueTableId: string) => ['value-tables', 'detail', valueTableId] as const,
    revision: (valueTableId: string, revision: number) =>
      ['value-tables', 'revision', valueTableId, revision] as const,
    usage: (valueTableId: string) => ['value-tables', 'usage', valueTableId] as const,
  },
} as const;
