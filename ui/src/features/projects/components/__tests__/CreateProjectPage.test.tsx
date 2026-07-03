import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { CreateProjectPage } from '../CreateProjectPage';

import { AdapterProvider, createQueryClient } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { ProjectDetail } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CREATED_PROJECT: ProjectDetail = {
  projectId: 'new-proj-1',
  name: 'My New Project',
  description: '',
  slug: 'my-new-project',
  schemaRefs: [],
  tags: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  mappings: [],
};

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn(),
    createSchema: vi.fn(),
    deleteSchema: vi.fn(),
    listMappings: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn(),
    createProject: vi.fn().mockResolvedValue(CREATED_PROJECT),
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
    smartFix: vi.fn(),
    previewMapping: vi.fn(),
    ...overrides,
  } as unknown as ApiAdapter;
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(adapter: ApiAdapter) {
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <AdapterProvider adapter={adapter}>
        <MemoryRouter initialEntries={['/projects/new']}>
          <Routes>
            <Route path="/projects/new" element={<CreateProjectPage />} />
            <Route
              path="/projects/:projectId"
              element={<div data-testid="project-overview-page">Overview</div>}
            />
            <Route path="/" element={<div data-testid="home-page">Home</div>} />
          </Routes>
        </MemoryRouter>
      </AdapterProvider>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateProjectPage', () => {
  it('preserves data-testid on root element', () => {
    renderPage(createMockAdapter());
    expect(screen.getByTestId('page-create-project')).toBeInTheDocument();
  });

  it('renders all form fields', () => {
    renderPage(createMockAdapter());
    expect(screen.getByLabelText(/project name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
  });

  it('Name field has required indicator', () => {
    renderPage(createMockAdapter());
    expect(screen.getByLabelText(/project name/i)).toHaveAttribute('aria-required', 'true');
  });

  it('submitting with empty name shows validation error and does not call adapter', async () => {
    const createProject = vi.fn();
    const adapter = createMockAdapter({ createProject });
    const user = userEvent.setup();
    renderPage(adapter);

    await user.click(screen.getByTestId('submit-button'));

    expect(screen.getByTestId('name-error')).toBeInTheDocument();
    expect(screen.getByText(/project name is required/i)).toBeInTheDocument();
    expect(createProject).not.toHaveBeenCalled();
  });

  it('submitting with valid name calls createProject with correct data', async () => {
    const createProject = vi.fn().mockResolvedValue(CREATED_PROJECT);
    const adapter = createMockAdapter({ createProject });
    const user = userEvent.setup();
    renderPage(adapter);

    await user.type(screen.getByLabelText(/project name/i), 'My New Project');
    await user.type(screen.getByLabelText(/description/i), 'A description');
    await user.type(screen.getByLabelText(/tags/i), 'alpha, beta');
    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My New Project',
          description: 'A description',
          tags: ['alpha', 'beta'],
          slug: 'my-new-project',
        }),
      );
    });
  });

  it('navigates to project overview on successful submit', async () => {
    const adapter = createMockAdapter();
    const user = userEvent.setup();
    renderPage(adapter);

    await user.type(screen.getByLabelText(/project name/i), 'My New Project');
    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('project-overview-page')).toBeInTheDocument();
    });
  });

  it('cancel button navigates to home', async () => {
    const adapter = createMockAdapter();
    const user = userEvent.setup();
    renderPage(adapter);

    await user.click(screen.getByTestId('cancel-button'));

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
  });

  it('shows submit error when createProject fails', async () => {
    const adapter = createMockAdapter({
      createProject: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    const user = userEvent.setup();
    renderPage(adapter);

    await user.type(screen.getByLabelText(/project name/i), 'My New Project');
    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('submit-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });

  it('tags are parsed from comma-separated input on submit', async () => {
    const createProject = vi.fn().mockResolvedValue(CREATED_PROJECT);
    const adapter = createMockAdapter({ createProject });
    const user = userEvent.setup();
    renderPage(adapter);

    await user.type(screen.getByLabelText(/project name/i), 'Test');
    await user.type(screen.getByLabelText(/tags/i), ' foo , bar ,  baz ');
    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['foo', 'bar', 'baz'] }),
      );
    });
  });

  it('clearing name error after typing', async () => {
    const adapter = createMockAdapter();
    const user = userEvent.setup();
    renderPage(adapter);

    await user.click(screen.getByTestId('submit-button'));
    expect(screen.getByTestId('name-error')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/project name/i), 'X');
    expect(screen.queryByTestId('name-error')).not.toBeInTheDocument();
  });
});
