import {
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
} from 'react-router-dom';

import { AppLayout } from '@/components/layout';
import CreateMapping from '@/routes/pages/CreateMapping';
import CreateProject from '@/routes/pages/CreateProject';
import HomeDashboard from '@/routes/pages/HomeDashboard';
import MappingDeployment from '@/routes/pages/MappingDeployment';
import MappingEditor from '@/routes/pages/MappingEditor';
import MappingTestLab from '@/routes/pages/MappingTestLab';
import NotFound from '@/routes/pages/NotFound';
import ProjectDeployments from '@/routes/pages/ProjectDeployments';
import ProjectOverview from '@/routes/pages/ProjectOverview';
import ProjectSettings from '@/routes/pages/ProjectSettings';
import ProjectValueMappings from '@/routes/pages/ProjectValueMappings';
import SchemaDetail from '@/routes/pages/SchemaDetail';
import SchemaLibrary from '@/routes/pages/SchemaLibrary';
import Settings from '@/routes/pages/Settings';
import TemplateLibrary from '@/routes/pages/TemplateLibrary';
import ValueMappingDetail from '@/routes/pages/ValueMappingDetail';
import ValueMappingsLibrary from '@/routes/pages/ValueMappingsLibrary';

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<AppLayout />}>
      <Route path="/" element={<HomeDashboard />} />
      <Route path="/value-mappings" element={<ValueMappingsLibrary />} />
      <Route path="/value-mappings/:valueMapId" element={<ValueMappingDetail />} />
      <Route path="/projects/new" element={<CreateProject />} />
      <Route path="/projects/:projectId" element={<ProjectOverview />} />
      <Route path="/projects/:projectId/settings" element={<ProjectSettings />} />
      <Route path="/projects/:projectId/deployments" element={<ProjectDeployments />} />
      <Route path="/projects/:projectId/value-mappings" element={<ProjectValueMappings />} />
      <Route path="/projects/:projectId/mappings/new" element={<CreateMapping />} />
      <Route path="/projects/:projectId/mappings/:mappingId" element={<MappingEditor />} />
      <Route
        path="/projects/:projectId/mappings/:mappingId/deploy"
        element={<MappingDeployment />}
      />
      <Route
        path="/projects/:projectId/mappings/:mappingId/test-lab"
        element={<MappingTestLab />}
      />
      <Route path="/schemas" element={<SchemaLibrary />} />
      <Route path="/schemas/:schemaId" element={<SchemaDetail />} />
      <Route path="/templates" element={<TemplateLibrary />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<NotFound />} />
    </Route>,
  ),
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  },
);

export { router };

export default function App() {
  return (
    <RouterProvider
      router={router}
      future={{
        v7_startTransition: true,
      }}
    />
  );
}
