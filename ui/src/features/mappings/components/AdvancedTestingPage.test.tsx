import { render, screen, fireEvent } from '@testing-library/react';
import {
  Route,
  RouterProvider,
  createMemoryRouter,
  createRoutesFromElements,
} from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import { AdvancedTestingPage } from '@/features/mappings/components/AdvancedTestingPage';
import MappingAdvancedTesting from '@/routes/pages/MappingAdvancedTesting';

// ---------------------------------------------------------------------------
// Mock adapter — never resolves (keeps component in loading state for most tests)
// ---------------------------------------------------------------------------

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
  suggestExpression: vi.fn(),
  explainRule: vi.fn(),
  smartFix: vi.fn(),
  validateMappings: vi.fn(),
  querySchemaNodes: vi.fn(),
  listActivity: vi.fn(),
  previewOnServer: vi.fn(),
} as unknown as ApiAdapter;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(overrides: Partial<{ projectId: string; mappingId: string }> = {}) {
  const { projectId = 'proj-1', mappingId = 'mapping-1' } = overrides;
  return render(
    <AdapterProvider adapter={mockAdapter}>
      <RouterProvider
        router={createMemoryRouter(
          createRoutesFromElements(
            <Route
              path="/projects/:projectId/mappings/:mappingId/test"
              element={<MappingAdvancedTesting />}
            />,
          ),
          {
            initialEntries: [`/projects/${projectId}/mappings/${mappingId}/test`],
            future: { v7_startTransition: true, v7_relativeSplatPath: true },
          },
        )}
        future={{ v7_startTransition: true }}
      />
    </AdapterProvider>,
  );
}

function renderComponent(
  overrides: Partial<{ projectId: string; mappingId: string }> = {},
) {
  const { projectId = 'proj-1', mappingId = 'mapping-1' } = overrides;
  return render(
    <AdapterProvider adapter={mockAdapter}>
      <RouterProvider
        router={createMemoryRouter(
          createRoutesFromElements(
            <Route
              path="*"
              element={<AdvancedTestingPage projectId={projectId} mappingId={mappingId} />}
            />,
          ),
          {
            initialEntries: ['/'],
            future: { v7_startTransition: true, v7_relativeSplatPath: true },
          },
        )}
        future={{ v7_startTransition: true }}
      />
    </AdapterProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MappingAdvancedTesting route', () => {
  it('renders the advanced testing page at the test route', () => {
    renderPage();
    expect(screen.getByTestId('advanced-testing-page')).toBeInTheDocument();
  });
});

describe('AdvancedTestingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  it('renders the page container', () => {
    renderComponent();
    expect(screen.getByTestId('advanced-testing-page')).toBeInTheDocument();
  });

  it('renders the top bar', () => {
    renderComponent();
    expect(screen.getByTestId('advanced-testing-topbar')).toBeInTheDocument();
  });

  it('renders the left panel with source input area', () => {
    renderComponent();
    expect(screen.getByTestId('source-input-area')).toBeInTheDocument();
  });

  it('renders the test case manager area', () => {
    renderComponent();
    expect(screen.getByTestId('test-case-manager-area')).toBeInTheDocument();
  });

  it('renders the right panel', () => {
    renderComponent();
    expect(screen.getByTestId('right-panel')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------------

  it('renders all four result tabs', () => {
    renderComponent();
    expect(screen.getByTestId('tab-output')).toBeInTheDocument();
    expect(screen.getByTestId('tab-diagnostics')).toBeInTheDocument();
    expect(screen.getByTestId('tab-trace')).toBeInTheDocument();
    expect(screen.getByTestId('tab-diff')).toBeInTheDocument();
  });

  it('Output tab is selected by default', () => {
    renderComponent();
    expect(screen.getByTestId('tab-output')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-diagnostics')).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking Diagnostics tab selects it', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('tab-diagnostics'));
    expect(screen.getByTestId('tab-diagnostics')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-output')).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking Trace tab selects it', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('tab-trace'));
    expect(screen.getByTestId('tab-trace')).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking Diff tab selects it', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('tab-diff'));
    expect(screen.getByTestId('tab-diff')).toHaveAttribute('aria-selected', 'true');
  });

  // ---------------------------------------------------------------------------
  // Top bar controls
  // ---------------------------------------------------------------------------

  it('renders the Run button', () => {
    renderComponent();
    expect(screen.getByTestId('run-button')).toBeInTheDocument();
  });

  it('Run button is disabled when no source data is loaded', () => {
    renderComponent();
    expect(screen.getByTestId('run-button')).toBeDisabled();
  });

  it('renders the trace toggle', () => {
    renderComponent();
    expect(screen.getByTestId('trace-toggle')).toBeInTheDocument();
  });

  it('trace toggle starts unchecked', () => {
    renderComponent();
    expect(screen.getByTestId('trace-toggle')).not.toBeChecked();
  });

  it('clicking trace toggle checks it', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('trace-toggle'));
    expect(screen.getByTestId('trace-toggle')).toBeChecked();
  });

  it('renders the auto-run toggle', () => {
    renderComponent();
    expect(screen.getByTestId('auto-run-toggle')).toBeInTheDocument();
  });

  it('renders "Back to Editor" link', () => {
    renderComponent({ projectId: 'proj-1', mappingId: 'mapping-1' });
    expect(screen.getByTestId('back-to-editor-link')).toBeInTheDocument();
  });

  it('"Back to Editor" link has correct href', () => {
    renderComponent({ projectId: 'proj-1', mappingId: 'mapping-1' });
    expect(screen.getByTestId('back-to-editor-link')).toHaveAttribute(
      'href',
      '/projects/proj-1/mappings/mapping-1',
    );
  });

  // ---------------------------------------------------------------------------
  // Empty / idle state
  // ---------------------------------------------------------------------------

  it('shows empty results state when no execution has run', () => {
    renderComponent();
    expect(screen.getByTestId('results-empty-state')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Mapping context
  // ---------------------------------------------------------------------------

  it('renders mapping name in top bar', () => {
    renderComponent();
    expect(screen.getByTestId('mapping-name')).toBeInTheDocument();
  });

  it('renders mapping version in top bar', () => {
    renderComponent();
    expect(screen.getByTestId('mapping-version')).toBeInTheDocument();
  });
});
