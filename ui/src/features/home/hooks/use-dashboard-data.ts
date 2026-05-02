// Hook: useDashboardData (FS-014 T-02)
// Loads all projects, schemas, and per-project mappings from the adapter,
// computes aggregated DashboardMetrics, and builds the ProjectListItem[] view model.

import { useCallback, useEffect, useState } from 'react';

import { useAdapter } from '@/lib/api';
import type { MappingMetadata, ProjectMetadata } from '@/lib/types/domain';

import type {
  DashboardLoadState,
  DashboardMetrics,
  ProjectListItem,
  ProjectWorstStatus,
} from '../types';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Derives the single worst status for a project from its mapping array. */
export function deriveWorstStatus(mappings: MappingMetadata[]): ProjectWorstStatus {
  if (mappings.length === 0) return 'no-mappings';
  if (mappings.some((m) => m.status === 'has-errors')) return 'has-errors';
  if (mappings.some((m) => m.status === 'draft')) return 'draft';
  return 'ready';
}

function buildProjectListItem(
  project: ProjectMetadata,
  mappings: MappingMetadata[],
): ProjectListItem {
  return {
    projectId: project.projectId,
    name: project.name,
    description: project.description,
    mappingCount: mappings.length,
    updatedAt: project.updatedAt,
    worstStatus: deriveWorstStatus(mappings),
    devDeploy: 'not-deployed',
    qaDeploy: 'not-deployed',
    prodDeploy: 'not-deployed',
  };
}

function computeMetrics(
  projects: ProjectMetadata[],
  allMappings: MappingMetadata[][],
  schemaCount: number,
): DashboardMetrics {
  const flat = allMappings.flat();
  return {
    totalProjects: projects.length,
    totalMappings: flat.length,
    totalSchemas: schemaCount,
    statusBreakdown: {
      ready: flat.filter((m) => m.status === 'ready').length,
      draft: flat.filter((m) => m.status === 'draft').length,
      hasErrors: flat.filter((m) => m.status === 'has-errors').length,
    },
    deployedCount: 0, // Phase 0 — always 0
  };
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseDashboardDataResult {
  loadState: DashboardLoadState;
  metrics: DashboardMetrics | null;
  projects: ProjectListItem[];
  schemaCount: number;
  retry: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDashboardData(): UseDashboardDataResult {
  const adapter = useAdapter();

  const [loadState, setLoadState] = useState<DashboardLoadState>('loading');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [schemaCount, setSchemaCount] = useState(0);

  // Incrementing this triggers a re-fetch (retry pattern from use-project-overview)
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setMetrics(null);
      setProjects([]);
      setSchemaCount(0);

      try {
        // Load projects and schemas in parallel
        const [projectList, schemaList] = await Promise.all([
          adapter.listProjects(),
          adapter.listSchemas(),
        ]);

        if (cancelled) return;

        // Load all project mappings in parallel (N+1 is acceptable for localStorage Phase 0)
        const mappingArrays = await Promise.all(
          projectList.map((p) => adapter.listMappings(p.projectId)),
        );

        if (cancelled) return;

        const projectItems = projectList.map((p, i) =>
          buildProjectListItem(p, mappingArrays[i] ?? []),
        );

        setMetrics(computeMetrics(projectList, mappingArrays, schemaList.length));
        setProjects(projectItems);
        setSchemaCount(schemaList.length);
        setLoadState('loaded');
      } catch {
        if (cancelled) return;
        setLoadState('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [adapter, fetchKey]);

  const retry = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  return { loadState, metrics, projects, schemaCount, retry };
}
