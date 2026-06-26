// Hook: useDashboardData (FS-014 T-02)
// Loads all projects, schemas, and per-project mappings from the adapter,
// computes aggregated DashboardMetrics, and builds the ProjectListItem[] view model.

import { useCallback, useEffect, useState } from 'react';

import { useAdapter } from '@/lib/api';
import type { CurrentDeployments } from '@/lib/api/types';
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

/**
 * Computes the worst deployment status across multiple CurrentDeployments
 * for a single environment.
 *
 * Priority: stale > not-deployed > deployed (current).
 * If any mapping is stale, the project env is stale.
 * If any mapping has a current deploy (and none are stale), it's deployed.
 * Otherwise not-deployed.
 */
function worstEnvDeployStatus(
  deploymentsList: Array<CurrentDeployments | null>,
  env: 'DEV' | 'PREPROD' | 'PROD',
): 'deployed' | 'stale' | 'not-deployed' {
  let hasCurrent = false;
  for (const dep of deploymentsList) {
    const status = dep?.[env]?.status ?? 'not-deployed';
    if (status === 'stale') return 'stale';
    if (status === 'current') hasCurrent = true;
  }
  return hasCurrent ? 'deployed' : 'not-deployed';
}

function buildProjectListItem(
  project: ProjectMetadata,
  mappings: MappingMetadata[],
  deploymentsList: Array<CurrentDeployments | null>,
  schemaCount: number,
): ProjectListItem {
  return {
    projectId: project.projectId,
    name: project.name,
    description: project.description,
    mappingCount: mappings.length,
    schemaCount,
    updatedAt: project.updatedAt,
    worstStatus: deriveWorstStatus(mappings),
    sandboxDeploy: worstEnvDeployStatus(deploymentsList, 'DEV'),
    devDeploy: worstEnvDeployStatus(deploymentsList, 'DEV'),
    preprodDeploy: worstEnvDeployStatus(deploymentsList, 'PREPROD'),
    prodDeploy: worstEnvDeployStatus(deploymentsList, 'PROD'),
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

        // Fetch current deployments for every mapping in parallel (best-effort)
        const deploymentArrays: Array<Array<CurrentDeployments | null>> = await Promise.all(
          mappingArrays.map((mappings) =>
            Promise.all(
              mappings.map((m) =>
                adapter
                  .getCurrentDeployments(m.mappingId)
                  .catch(() => null as CurrentDeployments | null),
              ),
            ),
          ),
        );

        if (cancelled) return;

        const projectItems = projectList.map((p, i) => {
          const projectMappings = mappingArrays[i] ?? [];

          const sourceSchemaIds = projectMappings
            .map((mapping) => mapping.sourceSchemaId)
            .filter((id): id is string => Boolean(id));
          const targetSchemaIds = projectMappings
            .map((mapping) => mapping.targetSchemaId)
            .filter((id): id is string => Boolean(id));
          const uniqueSchemaIds = new Set([...sourceSchemaIds, ...targetSchemaIds]);

          return buildProjectListItem(
            p,
            projectMappings,
            deploymentArrays[i] ?? [],
            uniqueSchemaIds.size,
          );
        });

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
