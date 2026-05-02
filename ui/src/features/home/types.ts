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
  readonly deployedCount: number; // always 0 in Phase 0
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
  readonly updatedAt: string;
  readonly worstStatus: ProjectWorstStatus;
  readonly devDeploy: DeployStatus;
  readonly qaDeploy: DeployStatus;
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
