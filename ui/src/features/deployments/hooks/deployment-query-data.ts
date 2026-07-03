import type { ApiAdapter } from '@/lib/api';
import type { CurrentDeployments, DeploymentRecord } from '@/lib/api/types';
import type { MappingVersion } from '@/lib/types';

export interface DeploymentPageQueryData {
  versions: readonly MappingVersion[];
  currentDeployments: CurrentDeployments;
  deploymentHistory: readonly DeploymentRecord[];
}

export async function loadDeploymentPageQueryData(
  adapter: ApiAdapter,
  mappingId: string,
): Promise<DeploymentPageQueryData> {
  await adapter.getDeploymentContext(mappingId);

  const [versionList, deployments, records] = await Promise.all([
    adapter.listVersions(mappingId),
    adapter.getCurrentDeployments(mappingId),
    adapter.listDeployments(mappingId),
  ]);

  const sortedVersions = [...versionList].sort((a, b) => b.version - a.version);
  const sortedHistory = [...records].sort(
    (a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime(),
  );

  return {
    versions: sortedVersions,
    currentDeployments: deployments,
    deploymentHistory: sortedHistory,
  };
}
