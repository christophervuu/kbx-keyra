import type { DashboardMetrics, ProjectListItem, ProjectWorstStatus } from '../types';

import type { ApiAdapter } from '@/lib/api';
import type { CurrentDeployments } from '@/lib/api/types';
import type { MappingMetadata, ProjectMetadata } from '@/lib/types/domain';

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

export interface DashboardQueryData {
  readonly metrics: DashboardMetrics;
  readonly projects: ProjectListItem[];
  readonly schemaCount: number;
}

export async function loadDashboardDataQueryData(adapter: ApiAdapter): Promise<DashboardQueryData> {
  // Load projects and schemas in parallel
  const [projectList, schemaList] = await Promise.all([
    adapter.listProjects(),
    adapter.listSchemas(),
  ]);

  // Load all project mappings in parallel
  const mappingArrays = await Promise.all(projectList.map((p) => adapter.listMappings(p.projectId)));

  // Fetch current deployments for every mapping in parallel (best-effort)
  const deploymentArrays: Array<Array<CurrentDeployments | null>> = await Promise.all(
    mappingArrays.map((mappings) =>
      Promise.all(
        mappings.map((m) =>
          adapter.getCurrentDeployments(m.mappingId).catch(() => null as CurrentDeployments | null),
        ),
      ),
    ),
  );

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

  return {
    metrics: computeMetrics(projectList, mappingArrays, schemaList.length),
    projects: projectItems,
    schemaCount: schemaList.length,
  };
}
