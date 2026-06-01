import { useParams } from 'react-router-dom';

import { DeploymentPage } from '@/features/deployments';

/**
 * Route page for `/projects/:projectId/mappings/:mappingId/deploy`.
 * Thin wrapper — extracts route params and delegates to `DeploymentPage`.
 */
export default function MappingDeployment() {
  const { projectId = '', mappingId = '' } = useParams<{
    projectId: string;
    mappingId: string;
  }>();

  return <DeploymentPage projectId={projectId} mappingId={mappingId} />;
}
