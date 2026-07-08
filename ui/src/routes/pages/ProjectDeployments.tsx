import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
import { DeploymentOverviewPage } from '@/features/deployments';
import { useAdapter } from '@/lib/api';

export default function ProjectDeployments() {
  const adapter = useAdapter();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const [projectLabel, setProjectLabel] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let cancelled = false;

    void adapter
      .getProject(projectId)
      .then((project) => {
        if (cancelled) return;
        setProjectLabel(project.name);
      })
      .catch(() => {
        if (cancelled) return;
        setProjectLabel(projectId);
      });

    return () => {
      cancelled = true;
    };
  }, [adapter, projectId]);

  useBreadcrumbLabel(projectId, projectLabel);

  return <DeploymentOverviewPage scope="project" projectId={projectId} projectName={projectLabel} />;
}
