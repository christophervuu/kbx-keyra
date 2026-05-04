import { useParams } from 'react-router-dom';

import { AdvancedTestingPage } from '@/features/mappings/components/AdvancedTestingPage';

/**
 * Route page for `/projects/:projectId/mappings/:mappingId/test`.
 * Thin wrapper — extracts route params and delegates to `AdvancedTestingPage`.
 */
export default function MappingAdvancedTesting() {
  const { projectId = '', mappingId = '' } = useParams<{
    projectId: string;
    mappingId: string;
  }>();

  return <AdvancedTestingPage projectId={projectId} mappingId={mappingId} />;
}
