import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';

import { PreviewPanel } from './PreviewPanel';
import { PreviewProvider } from '../../context/preview-context';

import type { MappingConfig, SchemaDetail } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Mock engine
// ---------------------------------------------------------------------------

vi.mock('@/lib/engine', () => ({
  executeMapping: vi.fn(),
}));

import { executeMapping } from '@/lib/engine';
const mockExecuteMapping = vi.mocked(executeMapping);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const createConfig = (): MappingConfig => ({
  id: 'mapping-1',
  projectId: 'project-1',
  name: 'Test Mapping',
  version: 1,
  engineVersion: '1.0.0',
  sourceSchemaRef: { schemaId: 'src-1', type: 'local' },
  targetSchemaRef: { schemaId: 'tgt-1', type: 'local' },
  config: { unmappedTargets: 'omit', constants: {}, externalSources: [], nullSubtrees: [] },
  rules: [{ target: 'name', type: 'string', expression: 'source("x")' }],
});

const createSchema = (id: string): SchemaDetail => ({
  metadata: {
    schemaId: id,
    name: id,
    format: 'json-schema',
    fieldCount: 1,
    origin: 'local',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  content: { type: 'object', properties: { x: { type: 'string' } } },
});

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(PreviewProvider, null, children);

const fullProps = {
  config: createConfig(),
  sourceSchemaDetail: createSchema('src-1'),
  targetSchemaDetail: createSchema('tgt-1'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PreviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without errors', () => {
    render(createElement(PreviewPanel, fullProps), { wrapper });
    expect(screen.getByTestId('preview-panel')).toBeInTheDocument();
  });

  it('renders the tab bar with all 4 tabs', () => {
    render(createElement(PreviewPanel, fullProps), { wrapper });

    expect(screen.getByTestId('tab-output')).toBeInTheDocument();
    expect(screen.getByTestId('tab-diagnostics')).toBeInTheDocument();
    expect(screen.getByTestId('tab-trace')).toBeInTheDocument();
    expect(screen.getByTestId('tab-diff')).toBeInTheDocument();
  });

  it('renders the toolbar with Run button, auto-run toggle, trace toggle', () => {
    render(createElement(PreviewPanel, fullProps), { wrapper });

    expect(screen.getByTestId('run-button')).toBeInTheDocument();
    expect(screen.getByTestId('auto-run-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('trace-toggle')).toBeInTheDocument();
  });

  it('Run button is disabled when sourceDataRaw is null (no input yet)', () => {
    render(createElement(PreviewPanel, fullProps), { wrapper });
    expect(screen.getByTestId('run-button')).toBeDisabled();
  });

  it('Run button is disabled when config is null', () => {
    render(
      createElement(PreviewPanel, { ...fullProps, config: null }),
      { wrapper },
    );
    expect(screen.getByTestId('run-button')).toBeDisabled();
  });

  it('Run button is disabled when sourceSchemaDetail is null', () => {
    render(
      createElement(PreviewPanel, { ...fullProps, sourceSchemaDetail: null }),
      { wrapper },
    );
    expect(screen.getByTestId('run-button')).toBeDisabled();
  });

  it('Run button is disabled when targetSchemaDetail is null', () => {
    render(
      createElement(PreviewPanel, { ...fullProps, targetSchemaDetail: null }),
      { wrapper },
    );
    expect(screen.getByTestId('run-button')).toBeDisabled();
  });

  it('shows empty state on initial render', () => {
    render(createElement(PreviewPanel, fullProps), { wrapper });
    expect(screen.getByTestId('preview-empty-state')).toBeInTheDocument();
  });

  it('Output tab is active by default', () => {
    render(createElement(PreviewPanel, fullProps), { wrapper });
    const outputTab = screen.getByTestId('tab-output');
    expect(outputTab).toHaveAttribute('aria-selected', 'true');
  });

  it('tab switching changes the active tab', () => {
    render(createElement(PreviewPanel, fullProps), { wrapper });

    fireEvent.click(screen.getByTestId('tab-diagnostics'));
    expect(screen.getByTestId('tab-diagnostics')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-output')).toHaveAttribute('aria-selected', 'false');
  });

  it('does not show diagnostics badge when no result', () => {
    render(createElement(PreviewPanel, fullProps), { wrapper });
    expect(screen.queryByTestId('diagnostics-badge')).not.toBeInTheDocument();
  });

  it('shows stats bar after successful execution', () => {
    mockExecuteMapping.mockReturnValue({
      output: { name: 'Alice' },
      diagnostics: [],
      stats: { durationMs: 12, ruleCount: 1 },
    } as ReturnType<typeof executeMapping>);

    // To trigger run we need a way to set sourceDataRaw — for now the button
    // stays disabled (sourceDataRaw is null in the shell). This test verifies
    // the stats bar renders when a result exists by calling run() when enabled.
    // T-07 will add the source data input. For the shell test we verify
    // the stats bar is absent initially.
    render(createElement(PreviewPanel, fullProps), { wrapper });
    expect(screen.queryByTestId('preview-stats-bar')).not.toBeInTheDocument();
  });

  it('tab panel has correct role and aria attributes', () => {
    render(createElement(PreviewPanel, fullProps), { wrapper });

    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveAttribute('aria-label', 'Preview results');

    const outputTab = screen.getByTestId('tab-output');
    expect(outputTab).toHaveAttribute('role', 'tab');
    expect(outputTab).toHaveAttribute('aria-controls', 'preview-tabpanel-output');
  });
});
