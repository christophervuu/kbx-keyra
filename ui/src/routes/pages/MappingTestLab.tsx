import { useParams } from 'react-router-dom';

import { TestLabPage } from '@/features/mappings/components/TestLabPage';

/**
 * Route page for `/projects/:projectId/mappings/:mappingId/test-lab`.
 * Thin wrapper — extracts route params and delegates to `TestLabPage`.
 */
export default function MappingTestLab() {
  const { projectId = '', mappingId = '' } = useParams<{
    projectId: string;
    mappingId: string;
  }>();

  return <TestLabPage projectId={projectId} mappingId={mappingId} />;
}
