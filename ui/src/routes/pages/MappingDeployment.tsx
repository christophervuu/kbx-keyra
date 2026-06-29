import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
import { DeploymentPage } from '@/features/deployments';
import { useAdapter } from '@/lib/api';

/**
 * Route page for `/projects/:projectId/mappings/:mappingId/deploy`.
 * Thin wrapper — extracts route params and delegates to `DeploymentPage`.
 */
export default function MappingDeployment() {
  const adapter = useAdapter();
  const { projectId = '', mappingId = '' } = useParams<{
    projectId: string;
    mappingId: string;
  }>();

  const [projectBreadcrumbLabel, setProjectBreadcrumbLabel] = useState<string | undefined>(undefined);
  const [mappingBreadcrumbLabel, setMappingBreadcrumbLabel] = useState<string | undefined>(undefined);
  const [mappingName, setMappingName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!projectId || !mappingId) {
      return;
    }

    let cancelled = false;

    async function loadBreadcrumbLabels() {
      const [projectResult, mappingResult] = await Promise.allSettled([
        adapter.getProject(projectId),
        adapter.getMapping(mappingId),
      ]);

      if (cancelled) {
        return;
      }

      if (projectResult.status === 'fulfilled') {
        setProjectBreadcrumbLabel(projectResult.value.name);
      } else {
        setProjectBreadcrumbLabel(projectId);
      }

      if (mappingResult.status === 'fulfilled') {
        setMappingBreadcrumbLabel(mappingResult.value.name);
        setMappingName(mappingResult.value.name);
      } else {
        setMappingBreadcrumbLabel(mappingId);
        setMappingName(undefined);
      }
    }

    void loadBreadcrumbLabels();

    return () => {
      cancelled = true;
    };
  }, [adapter, mappingId, projectId]);

  useBreadcrumbLabel(projectId, projectBreadcrumbLabel);
  useBreadcrumbLabel(mappingId, mappingBreadcrumbLabel);

  return <DeploymentPage projectId={projectId} mappingId={mappingId} mappingName={mappingName} />;
}
