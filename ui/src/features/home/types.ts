// Feature-local types for the Home Dashboard (FS-014)

import type { DeployStatus, MappingStatus } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface DashboardMetrics {
  readonly totalProjects: number;
  readonly totalMappings: number;
  readonly totalSchemas: number;
  readonly statusBreakdown: {
    readonly ready: number;
    readonly draft: number;
    readonly hasErrors: number;
  };
}

// ---------------------------------------------------------------------------
// Project list view model
// ---------------------------------------------------------------------------

export type ProjectWorstStatus = MappingStatus | 'no-mappings';

export interface ProjectListItem {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly mappingCount: number;
  readonly schemaCount?: number;
  readonly updatedAt: string;
  readonly worstStatus: ProjectWorstStatus;
  readonly sandboxDeploy: DeployStatus;
  readonly devDeploy: DeployStatus;
  readonly preprodDeploy: DeployStatus;
  readonly prodDeploy: DeployStatus;
}

// ---------------------------------------------------------------------------
// UI state discriminants
// ---------------------------------------------------------------------------

export type DashboardLoadState = 'loading' | 'loaded' | 'error';

export type ViewMode = 'grid' | 'table';

export type SortField = 'name' | 'updatedAt' | 'mappingCount';
export type SortDirection = 'asc' | 'desc';

export type StatusFilter = MappingStatus | 'all' | 'no-mappings';

// ---------------------------------------------------------------------------
// Recent activity (FS-049 T-03)
// ---------------------------------------------------------------------------

export interface RecentActivityEntry {
  /** Whether this entry refers to a project or a mapping. */
  readonly type: 'project' | 'mapping';
  /** Entity ID (projectId or mappingId). */
  readonly id: string;
  /** Parent projectId — required for mappings, optional for projects. */
  readonly projectId?: string;
  /** Display name of the entity. */
  readonly name: string;
  /** ISO 8601 timestamp of the last visit. */
  readonly timestamp: string;
}
