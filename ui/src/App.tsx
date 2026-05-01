import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/components/layout';
import CreateMapping from '@/routes/pages/CreateMapping';
import CreateProject from '@/routes/pages/CreateProject';
import HomeDashboard from '@/routes/pages/HomeDashboard';
import MappingDeployment from '@/routes/pages/MappingDeployment';
import MappingEditor from '@/routes/pages/MappingEditor';
import NotFound from '@/routes/pages/NotFound';
import ProjectDeployments from '@/routes/pages/ProjectDeployments';
import ProjectOverview from '@/routes/pages/ProjectOverview';
import ProjectSettings from '@/routes/pages/ProjectSettings';
import SchemaDetail from '@/routes/pages/SchemaDetail';
import SchemaLibrary from '@/routes/pages/SchemaLibrary';
import Settings from '@/routes/pages/Settings';
import TemplateLibrary from '@/routes/pages/TemplateLibrary';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomeDashboard />} />
          <Route path="/projects/new" element={<CreateProject />} />
          <Route path="/projects/:projectId" element={<ProjectOverview />} />
          <Route path="/projects/:projectId/settings" element={<ProjectSettings />} />
          <Route path="/projects/:projectId/deployments" element={<ProjectDeployments />} />
          <Route path="/projects/:projectId/mappings/new" element={<CreateMapping />} />
          <Route path="/projects/:projectId/mappings/:mappingId" element={<MappingEditor />} />
          <Route
            path="/projects/:projectId/mappings/:mappingId/deploy"
            element={<MappingDeployment />}
          />
          <Route path="/schemas" element={<SchemaLibrary />} />
          <Route path="/schemas/:schemaId" element={<SchemaDetail />} />
          <Route path="/templates" element={<TemplateLibrary />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
