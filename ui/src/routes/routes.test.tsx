import { render, screen } from '@testing-library/react';
import {
  Route,
  RouterProvider,
  createMemoryRouter,
  createRoutesFromElements,
} from 'react-router-dom';
import { describe, it, vi } from 'vitest';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
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

// Mock adapter that never resolves (keeps component in loading state)
const mockAdapter: ApiAdapter = {
  listSchemas: vi.fn(),
  getSchema: vi.fn().mockReturnValue(new Promise(() => {})),
  createSchema: vi.fn(),
  deleteSchema: vi.fn(),
  listMappings: vi.fn(),
  getMapping: vi.fn().mockReturnValue(new Promise(() => {})),
  createMapping: vi.fn(),
  updateMapping: vi.fn(),
  deleteMapping: vi.fn(),
  duplicateMapping: vi.fn(),
  listProjects: vi.fn(),
  getProject: vi.fn().mockReturnValue(new Promise(() => {})),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  getDeploymentContext: vi.fn(),
  deploy: vi.fn(),
  promote: vi.fn(),
  rollback: vi.fn(),
  getDeploymentDiff: vi.fn(),
  listCdmSchemas: vi.fn(),
  linkCdmSchema: vi.fn(),
  syncCdmSchema: vi.fn(),
  listPublishedSchemas: vi.fn(),
  publishSchemaToGitHub: vi.fn(),
  linkPublishedSchema: vi.fn(),
  autoMap: vi.fn(),
  autoMapSection: vi.fn(),
  suggestExpression: vi.fn(),
  explainRule: vi.fn(),
  smartFix: vi.fn(),
  validateMappings: vi.fn(),
  querySchemaNodes: vi.fn(),
  listActivity: vi.fn(),
  previewOnServer: vi.fn(),
} as ApiAdapter;

function renderWithRouter(path: string) {
  const router = createMemoryRouter(
    createRoutesFromElements(
      <>
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
      </>,
    ),
    {
      initialEntries: [path],
      future: {
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      },
    },
  );

  return render(
    <AdapterProvider adapter={mockAdapter}>
      <RouterProvider
        router={router}
        future={{
          v7_startTransition: true,
        }}
      />
    </AdapterProvider>,
  );
}

describe('Route rendering', () => {
  it('renders Home Dashboard at /', () => {
    renderWithRouter('/');

    expect(screen.getByTestId('page-home-dashboard')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Home Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('renders Create Project at /projects/new', () => {
    renderWithRouter('/projects/new');

    expect(screen.getByTestId('page-create-project')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Create Project' })).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('renders Project Overview at /projects/:projectId', () => {
    renderWithRouter('/projects/abc-123');

    expect(screen.getByTestId('page-project-overview')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project Overview' })).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('renders Project Settings at /projects/:projectId/settings', () => {
    renderWithRouter('/projects/abc-123/settings');

    expect(screen.getByTestId('page-project-settings')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project Settings' })).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('renders Project Deployments at /projects/:projectId/deployments', () => {
    renderWithRouter('/projects/abc-123/deployments');

    expect(screen.getByTestId('page-project-deployments')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project Deployments' })).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('renders Create Mapping at /projects/:projectId/mappings/new', () => {
    renderWithRouter('/projects/abc-123/mappings/new');

    expect(screen.getByTestId('page-create-mapping')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Create Mapping' })).toBeInTheDocument();
    expect(
      screen.getByText('Set up the mapping details and choose the schemas you want to map between.'),
    ).toBeInTheDocument();
  });

  it('renders Mapping Editor at /projects/:projectId/mappings/:mappingId', () => {
    renderWithRouter('/projects/abc-123/mappings/map-456');

    // MappingEditor now starts in loading state (useMappingEditor fetches data on mount)
    expect(screen.getByTestId('editor-loading')).toBeInTheDocument();
  });

  it('renders Mapping Deployment at /projects/:projectId/mappings/:mappingId/deploy', () => {
    renderWithRouter('/projects/abc-123/mappings/map-456/deploy');

    expect(screen.getByTestId('page-mapping-deployment')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mapping Deployment' })).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('renders Schema Library at /schemas', () => {
    renderWithRouter('/schemas');

    expect(screen.getByTestId('page-schema-library')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Schema Library' })).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('renders Schema Detail at /schemas/:schemaId', () => {
    renderWithRouter('/schemas/schema-789');

    expect(screen.getByTestId('page-schema-detail')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Schema Detail' })).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('renders Template Library at /templates', () => {
    renderWithRouter('/templates');

    expect(screen.getByTestId('page-template-library')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Template Library' })).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('renders Settings at /settings', () => {
    renderWithRouter('/settings');

    expect(screen.getByTestId('page-settings')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('renders Not Found for unknown paths (AE-10)', () => {
    renderWithRouter('/this/does/not/exist');

    expect(screen.getByTestId('page-not-found')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Not Found' })).toBeInTheDocument();
  });

  it('renders Not Found for partially matching paths', () => {
    renderWithRouter('/projects');

    expect(screen.getByTestId('page-not-found')).toBeInTheDocument();
  });
});
