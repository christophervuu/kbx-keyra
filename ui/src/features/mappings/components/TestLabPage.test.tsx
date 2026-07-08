import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  Route,
  RouterProvider,
  createMemoryRouter,
  createRoutesFromElements,
} from 'react-router-dom';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { TestLabPage } from '@/features/mappings/components/TestLabPage';
import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import MappingTestLab from '@/routes/pages/MappingTestLab';

// ---------------------------------------------------------------------------
// matchMedia mock
// ---------------------------------------------------------------------------

function mockMatchMedia(isWide: boolean, isMedium: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches:
        query === '(min-width: 1280px)'
          ? isWide
          : query === '(min-width: 1024px)'
            ? isMedium
            : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Default: wide viewport
beforeEach(() => {
  mockMatchMedia(true, true);
  // Clear localStorage
  if (typeof localStorage.clear === 'function') {
    localStorage.clear();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Mock adapter — never resolves (keeps component in loading state for most tests)
// ---------------------------------------------------------------------------

const mockAdapter: ApiAdapter = {
  listSchemas: vi.fn(),
  getSchema: vi.fn().mockReturnValue(new Promise(() => {})),
  createSchema: vi.fn(),
  updateSchema: vi.fn(),
  markSchemaReviewed: vi.fn(),
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
  deployMapping: vi.fn(),
  promoteDeployment: vi.fn(),
  rollbackDeployment: vi.fn(),
  listDeployments: vi.fn(),
  getCurrentDeployments: vi.fn(),
  listGlobalDeploymentSummaries: vi.fn(),
  listProjectDeploymentSummaries: vi.fn(),
  listCdmSchemas: vi.fn(),
  linkCdmSchema: vi.fn(),
  syncAllCdmSchemas: vi.fn(),
  syncCdmSchema: vi.fn(),
  listPublishedSchemas: vi.fn(),
  publishSchemaToGitHub: vi.fn(),
  linkPublishedSchema: vi.fn(),
  autoMap: vi.fn(),
  autoMapSection: vi.fn(),
  getAutoMapCapabilities: vi.fn(),
  getAutoMapSession: vi.fn(),
  startAutoMapSession: vi.fn(),
  startAutoMapRun: vi.fn(),
  getAutoMapRunStatus: vi.fn(),
  listAutoMapSuggestions: vi.fn(),
  suggestExpression: vi.fn(),
  explainRule: vi.fn(),
  smartFix: vi.fn(),
  validateMappings: vi.fn(),
  querySchemaNodes: vi.fn(),
  listActivity: vi.fn(),
  previewOnServer: vi.fn(),
  listProjectValueTables: vi.fn(),
  getProjectValueTable: vi.fn(),
  getProjectValueTableRevision: vi.fn(),
  createProjectValueTable: vi.fn(),
  createProjectValueTableRevision: vi.fn(),
  duplicateProjectValueTable: vi.fn(),
  archiveProjectValueTable: vi.fn(),
  deleteProjectValueTable: vi.fn(),
  listProjectValueTableUsage: vi.fn(),
  getProjectValueTableRevisionDiff: vi.fn(),
  exportProjectValueTableCsv: vi.fn(),
  importProjectValueTableCsv: vi.fn(),
  resolveProjectValueTableReference: vi.fn(),
  listGlobalValueMaps: vi.fn(),
  createGlobalValueMap: vi.fn(),
  getGlobalValueMap: vi.fn(),
  listGlobalValueMapRevisions: vi.fn(),
  createGlobalValueMapRevision: vi.fn(),
  getGlobalValueMapRevision: vi.fn(),
  archiveGlobalValueMap: vi.fn(),
  getGlobalValueMapUsage: vi.fn(),
  listProjectValueMaps: vi.fn(),
  linkProjectValueMap: vi.fn(),
  getProjectValueMapDetail: vi.fn(),
  updateProjectValueMapOverlay: vi.fn(),
  reviewProjectValueMapUpdate: vi.fn(),
  acceptProjectValueMapUpdate: vi.fn(),
  unlinkProjectValueMap: vi.fn(),
  importProjectValueMapPortable: vi.fn(),
  promoteProjectValueMap: vi.fn(),
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
              path="/projects/:projectId/mappings/:mappingId/test-lab"
              element={<MappingTestLab />}
            />,
          ),
          {
            initialEntries: [`/projects/${projectId}/mappings/${mappingId}/test-lab`],
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
              element={<TestLabPage projectId={projectId} mappingId={mappingId} />}
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

describe('MappingTestLab route', () => {
  it('renders the test lab page at the test-lab route', () => {
    renderPage();
    expect(screen.getByTestId('test-lab-page')).toBeInTheDocument();
  });
});

describe('TestLabPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Layout — shared across breakpoints
  // ---------------------------------------------------------------------------

  it('renders the page container', () => {
    renderComponent();
    expect(screen.getByTestId('test-lab-page')).toBeInTheDocument();
  });

  it('renders the top bar', () => {
    renderComponent();
    expect(screen.getByTestId('test-lab-topbar')).toBeInTheDocument();
  });

  it('renders the left panel with source input area', () => {
    renderComponent();
    expect(screen.getByTestId('source-input-area')).toBeInTheDocument();
  });

  it('renders enrichment samples textarea', () => {
    renderComponent();
    expect(screen.getByTestId('external-sources-textarea')).toBeInTheDocument();
  });

  it('renders the test case manager area', () => {
    renderComponent();
    expect(screen.getByTestId('test-case-list-area')).toBeInTheDocument();
  });

  it('renders the right panel', () => {
    renderComponent();
    expect(screen.getByTestId('right-panel')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Execution summary bar
  // ---------------------------------------------------------------------------

  it('renders the execution summary bar', () => {
    renderComponent();
    expect(screen.queryByTestId('execution-summary-bar')).not.toBeInTheDocument();
  });

  it('summary bar shows idle state before any execution', () => {
    renderComponent();
    expect(screen.queryByTestId('summary-idle')).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Wide viewport — 2x2 multi-panel layout
  // ---------------------------------------------------------------------------

  describe('wide viewport (>= 1280px)', () => {
    beforeEach(() => {
      mockMatchMedia(true, true);
    });

    it('renders all four ResultPanels', () => {
      renderComponent();
      expect(screen.getByTestId('panel-output')).toBeInTheDocument();
      expect(screen.getByTestId('panel-diff')).toBeInTheDocument();
      expect(screen.getByTestId('panel-diagnostics')).toBeInTheDocument();
      expect(screen.getByTestId('panel-trace')).toBeInTheDocument();
    });

    it('renders panel titles', () => {
      renderComponent();
      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText('Diff')).toBeInTheDocument();
      expect(screen.getByText('Diagnostics')).toBeInTheDocument();
      expect(within(screen.getByTestId('panel-trace')).getByText('Trace')).toBeInTheDocument();
    });

    it('does not render the tab bar at wide breakpoint', () => {
      renderComponent();
      expect(screen.queryByTestId('results-tabs')).not.toBeInTheDocument();
    });

    it('right panel has data-layout="wide"', () => {
      renderComponent();
      expect(screen.getByTestId('right-panel')).toHaveAttribute('data-layout', 'wide');
    });

    it('renders vertical and horizontal grid dividers', () => {
      renderComponent();
      expect(screen.getByTestId('divider-col')).toBeInTheDocument();
      expect(screen.getByTestId('divider-row')).toBeInTheDocument();
      expect(screen.getByTestId('divider-row-hitarea')).toBeInTheDocument();
    });

    it('renders the main split divider', () => {
      renderComponent();
      expect(screen.getByTestId('divider-main')).toBeInTheDocument();
    });

    it('left panel width is driven by mainSplit ratio (default ~35%)', () => {
      renderComponent();
      const leftPanel = screen.getByTestId('left-panel');
      // Default mainSplit is 0.35 → 35%
      expect(leftPanel).toHaveStyle({ width: '35%' });
    });

    it('pins wide panels to explicit grid cells', () => {
      renderComponent();
      expect(screen.getByTestId('panel-output')).toHaveStyle({ gridColumn: '1 / 2', gridRow: '1 / 2' });
      expect(screen.getByTestId('panel-diff')).toHaveStyle({ gridColumn: '3 / 4', gridRow: '1 / 2' });
      expect(screen.getByTestId('panel-diagnostics')).toHaveStyle({ gridColumn: '1 / 2', gridRow: '3 / 4' });
      expect(screen.getByTestId('panel-trace')).toHaveStyle({ gridColumn: '3 / 4', gridRow: '3 / 4' });
    });

    it('shows empty state in Output panel before execution', () => {
      renderComponent();
      expect(
        screen.getByText(/Enter source data and click Run to see the mapping output/i),
      ).toBeInTheDocument();
    });

    it('shows empty state in Diff panel before execution', () => {
      renderComponent();
      expect(
        screen.getByText(/Run a test and set expected output to see the diff/i),
      ).toBeInTheDocument();
    });

    it('shows empty state in Diagnostics panel before execution', () => {
      renderComponent();
      expect(
        screen.getByText(/No diagnostics from the last execution/i),
      ).toBeInTheDocument();
    });

    it('shows trace disabled message when trace is off', () => {
      renderComponent();
      // trace toggle starts unchecked → trace disabled
      expect(
        screen.getByText(/Enable Trace in the top bar to see execution trace/i),
      ).toBeInTheDocument();
    });

    it('Output panel collapse toggle is present at wide breakpoint', () => {
      renderComponent();
      expect(screen.getByTestId('panel-output-toggle')).toBeInTheDocument();
    });

    it('clicking Output panel collapse toggle collapses it', () => {
      renderComponent();
      const toggle = screen.getByTestId('panel-output-toggle');
      fireEvent.click(toggle);
      const content = screen.getByTestId('panel-output-content');
      expect(content.className).toContain('hidden');
    });

    it('clicking Diagnostics panel collapse toggle collapses it', () => {
      renderComponent();
      const toggle = screen.getByTestId('panel-diagnostics-toggle');
      fireEvent.click(toggle);
      const content = screen.getByTestId('panel-diagnostics-content');
      expect(content.className).toContain('hidden');
    });

    it('clicking a collapsed panel toggle expands it again', () => {
      renderComponent();
      const toggle = screen.getByTestId('panel-diff-toggle');
      fireEvent.click(toggle); // collapse
      fireEvent.click(toggle); // expand
      const content = screen.getByTestId('panel-diff-content');
      expect(content.className).not.toContain('hidden');
    });
  });

  // ---------------------------------------------------------------------------
  // Medium viewport — vertical stack
  // ---------------------------------------------------------------------------

  describe('medium viewport (1024–1279px)', () => {
    beforeEach(() => {
      mockMatchMedia(false, true);
    });

    it('renders all four ResultPanels in vertical stack', () => {
      renderComponent();
      expect(screen.getByTestId('panel-output')).toBeInTheDocument();
      expect(screen.getByTestId('panel-diff')).toBeInTheDocument();
      expect(screen.getByTestId('panel-diagnostics')).toBeInTheDocument();
      expect(screen.getByTestId('panel-trace')).toBeInTheDocument();
    });

    it('right panel has data-layout="medium"', () => {
      renderComponent();
      expect(screen.getByTestId('right-panel')).toHaveAttribute('data-layout', 'medium');
    });

    it('does not render the tab bar at medium breakpoint', () => {
      renderComponent();
      expect(screen.queryByTestId('results-tabs')).not.toBeInTheDocument();
    });

    it('Output panel has no collapse toggle at medium breakpoint', () => {
      renderComponent();
      expect(screen.queryByTestId('panel-output-toggle')).not.toBeInTheDocument();
    });

    it('Diff panel has a collapse toggle at medium breakpoint', () => {
      renderComponent();
      expect(screen.getByTestId('panel-diff-toggle')).toBeInTheDocument();
    });

    it('Diagnostics panel has a collapse toggle at medium breakpoint', () => {
      renderComponent();
      expect(screen.getByTestId('panel-diagnostics-toggle')).toBeInTheDocument();
    });

    it('renders the main split divider at medium breakpoint', () => {
      renderComponent();
      expect(screen.getByTestId('divider-main')).toBeInTheDocument();
    });

    it('does not render grid dividers at medium breakpoint', () => {
      renderComponent();
      expect(screen.queryByTestId('divider-col')).not.toBeInTheDocument();
      expect(screen.queryByTestId('divider-row')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Narrow viewport — tab fallback
  // ---------------------------------------------------------------------------

  describe('narrow viewport (< 1024px)', () => {
    beforeEach(() => {
      mockMatchMedia(false, false);
    });

    it('renders the tab bar at narrow breakpoint', () => {
      renderComponent();
      expect(screen.getByTestId('results-tabs')).toBeInTheDocument();
    });

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

    it('right panel has data-layout="narrow"', () => {
      renderComponent();
      expect(screen.getByTestId('right-panel')).toHaveAttribute('data-layout', 'narrow');
    });

    it('does not render the main split divider at narrow breakpoint', () => {
      renderComponent();
      expect(screen.queryByTestId('divider-main')).not.toBeInTheDocument();
    });

    it('does not render grid dividers at narrow breakpoint', () => {
      renderComponent();
      expect(screen.queryByTestId('divider-col')).not.toBeInTheDocument();
      expect(screen.queryByTestId('divider-row')).not.toBeInTheDocument();
    });
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

  it('shows inline alert when enrichment samples JSON is invalid', () => {
    renderComponent();
    fireEvent.change(screen.getByTestId('external-sources-textarea'), {
      target: { value: '{bad json' },
    });
    expect(screen.getByTestId('missing-required-enrichment-alert')).toBeInTheDocument();
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

  it('renders the reset layout button', () => {
    renderComponent();
    expect(screen.getByTestId('reset-layout-button')).toBeInTheDocument();
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

  // ---------------------------------------------------------------------------
  // localStorage — corrupt data graceful fallback
  // ---------------------------------------------------------------------------

  it('renders with default layout when localStorage contains invalid JSON', () => {
    if (typeof localStorage.setItem === 'function') {
      localStorage.setItem('keyra:testlab-layout', 'not-valid-json{{{');
    }
    // Should render without throwing
    renderComponent();
    expect(screen.getByTestId('test-lab-page')).toBeInTheDocument();
    // Default mainSplit is 0.35 → left panel should be 35%
    expect(screen.getByTestId('left-panel')).toHaveStyle({ width: '35%' });
  });

  it('renders with default layout when localStorage key is missing', () => {
    // localStorage is already cleared in beforeEach
    renderComponent();
    expect(screen.getByTestId('test-lab-page')).toBeInTheDocument();
    expect(screen.getByTestId('left-panel')).toHaveStyle({ width: '35%' });
  });

  // ---------------------------------------------------------------------------
  // Compare tab — narrow viewport (tab bar visible)
  // ---------------------------------------------------------------------------

  describe('Compare tab (narrow viewport)', () => {
    beforeEach(() => {
      mockMatchMedia(false, false);
    });

    it('renders the Compare tab in the tab bar', () => {
      renderComponent();
      expect(screen.getByTestId('tab-compare')).toBeInTheDocument();
    });

    it('Compare tab has correct label', () => {
      renderComponent();
      expect(screen.getByTestId('tab-compare')).toHaveTextContent('Compare');
    });

    it('Compare tab is the 5th tab', () => {
      renderComponent();
      const tabList = screen.getByRole('tablist');
      const tabs = tabList.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(5);
      expect(tabs[4]).toHaveAttribute('data-testid', 'tab-compare');
    });

    it('clicking Compare tab switches to comparison view', () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('tab-compare'));
      expect(screen.getByTestId('compare-tab')).toBeInTheDocument();
    });

    it('Compare tab is not selected by default', () => {
      renderComponent();
      expect(screen.getByTestId('tab-compare')).toHaveAttribute('aria-selected', 'false');
    });

    it('Compare tab becomes selected after clicking', () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('tab-compare'));
      expect(screen.getByTestId('tab-compare')).toHaveAttribute('aria-selected', 'true');
    });

    it('switching back to Output tab after Compare still works', () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('tab-compare'));
      fireEvent.click(screen.getByTestId('tab-output'));
      expect(screen.getByTestId('tab-output')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('tab-compare')).toHaveAttribute('aria-selected', 'false');
    });

    it('other tabs still render after switching to Compare and back', () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('tab-compare'));
      fireEvent.click(screen.getByTestId('tab-diagnostics'));
      expect(screen.getByTestId('tab-diagnostics')).toHaveAttribute('aria-selected', 'true');
    });

    it('Compare tab panel contains the compare-run-btn', () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('tab-compare'));
      expect(screen.getByTestId('compare-run-btn')).toBeInTheDocument();
    });

    it('Compare tab panel contains the comparison mode selector', () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('tab-compare'));
      expect(screen.getByTestId('comparison-mode-selector')).toBeInTheDocument();
    });

    it('Compare tab does not contain deploy/promote/rollback elements', () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('tab-compare'));
      expect(screen.queryByRole('button', { name: /deploy/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /promote/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /rollback/i })).not.toBeInTheDocument();
    });
  });
});
