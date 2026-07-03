import type { ApiAdapter } from '@/lib/api';
import type { CurrentDeployments } from '@/lib/api/types';
import type { MappingMetadata, ProjectDetail, SchemaDetail } from '@/lib/types/domain';
import { normalizeProjectLinkedSchemaIds } from '@/lib/types/domain';

export interface ProjectOverviewQueryData {
  project: ProjectDetail;
  schemaDetails: SchemaDetail[];
  mappingsMeta: MappingMetadata[];
  deploymentsMap: Map<string, CurrentDeployments | null>;
}

export async function loadProjectOverviewQueryData(
  adapter: ApiAdapter,
  projectId: string,
): Promise<ProjectOverviewQueryData> {
  const detail = await adapter.getProject(projectId);

  const linkedSchemaIds = normalizeProjectLinkedSchemaIds(detail);

  const [schemaResults, deploymentResults] = await Promise.all([
    Promise.allSettled(linkedSchemaIds.map((schemaId) => adapter.getSchema(schemaId))),
    Promise.allSettled(detail.mappings.map((m) => adapter.getCurrentDeployments(m.mappingId))),
  ]);

  const loadedSchemas = schemaResults
    .filter((r): r is PromiseFulfilledResult<SchemaDetail> => r.status === 'fulfilled')
    .map((r) => r.value);

  const nextDeploymentsMap = new Map<string, CurrentDeployments | null>(
    detail.mappings.map((m, i) => [
      m.mappingId,
      deploymentResults[i]?.status === 'fulfilled'
        ? (deploymentResults[i] as PromiseFulfilledResult<CurrentDeployments>).value
        : null,
    ]),
  );

  return {
    project: {
      ...detail,
      linkedSchemaIds,
    },
    schemaDetails: loadedSchemas,
    mappingsMeta: [...detail.mappings],
    deploymentsMap: nextDeploymentsMap,
  };
}
