import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { EditorTopBar } from './EditorTopBar';
import type { DeployBadgeInfo, SaveStatus } from './EditorTopBar';
import { MappingEditorPage } from './MappingEditorPage';
import { PanelPlaceholder } from './PanelPlaceholder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const DEFAULT_TOP_BAR_PROPS = {
  mappingName: 'Order Transform',
  version: 3,
  saveStatus: 'saved' as SaveStatus,
  deployStatuses: [
    { environment: 'DEV', status: 'deployed' },
    { environment: 'QA', status: 'not-deployed' },
    { environment: 'PROD', status: 'not-deployed' },
  ] as DeployBadgeInfo[],
  sourceSchemaName: 'OrderRequest',
  targetSchemaName: 'PurchaseOrder',
  projectId: 'proj-1',
  mappingId: 'mapping-1',
};

// ---------------------------------------------------------------------------
// PanelPlaceholder
// ---------------------------------------------------------------------------

describe('PanelPlaceholder', () => {
  it('renders the panel name text', () => {
    render(<PanelPlaceholder name="Source Schema (Panel 1)" />);
    expect(screen.getByText('Source Schema (Panel 1)')).toBeInTheDocument();
  });

  it('has a data-testid derived from the name', () => {
    render(<PanelPlaceholder name="Rule List (Panel 3)" />);
    expect(screen.getByTestId('panel-placeholder-rule-list-panel-3')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// EditorTopBar
// ---------------------------------------------------------------------------

describe('EditorTopBar', () => {
  it('renders mapping name', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    expect(screen.getByText('Order Transform')).toBeInTheDocument();
  });

  it('renders version badge', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    expect(screen.getByText('v3')).toBeInTheDocument();
  });

  it('renders save status "Saved"', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="saved" />);
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saved');
  });

  it('renders save status "Unsaved changes"', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="unsaved" />);
    expect(screen.getByTestId('save-status')).toHaveTextContent('Unsaved changes');
  });

  it('renders save status "Saving…"', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="saving" />);
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saving');
  });

  it('renders save status "Save failed"', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="error" />);
    expect(screen.getByTestId('save-status')).toHaveTextContent('Save failed');
  });

  it('renders deploy status badges for each environment', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    const badges = screen.getByTestId('deploy-badges');
    expect(badges).toHaveTextContent('DEV');
    expect(badges).toHaveTextContent('QA');
    expect(badges).toHaveTextContent('PROD');
  });

  it('renders source and target schema names', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    const schemaNames = screen.getByTestId('schema-names');
    expect(schemaNames).toHaveTextContent('OrderRequest');
    expect(schemaNames).toHaveTextContent('PurchaseOrder');
  });

  it('renders "No source" when sourceSchemaName is null', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} sourceSchemaName={null} />);
    expect(screen.getByTestId('schema-names')).toHaveTextContent('No source');
  });

  it('renders "No target" when targetSchemaName is null', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} targetSchemaName={null} />);
    expect(screen.getByTestId('schema-names')).toHaveTextContent('No target');
  });

  it('renders "Go to Deploy Page" link with correct href', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    const link = screen.getByTestId('deploy-page-link');
    expect(link).toHaveAttribute('href', '/projects/proj-1/mappings/mapping-1/deploy');
  });
});

// ---------------------------------------------------------------------------
// MappingEditorPage
// ---------------------------------------------------------------------------

describe('MappingEditorPage', () => {
  it('renders the top bar', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('editor-top-bar')).toBeInTheDocument();
  });

  it('renders all 8 panel slots', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    for (let i = 1; i <= 8; i++) {
      expect(screen.getByTestId(`panel-slot-${i}`)).toBeInTheDocument();
    }
  });

  it('renders mapping name in top bar', () => {
    renderWithRouter(
      <MappingEditorPage projectId="proj-1" mappingId="mapping-1" mappingName="Test Mapping" />,
    );
    expect(screen.getByText('Test Mapping')).toBeInTheDocument();
  });

  it('renders version badge in top bar', () => {
    renderWithRouter(
      <MappingEditorPage projectId="proj-1" mappingId="mapping-1" version={5} />,
    );
    expect(screen.getByText('v5')).toBeInTheDocument();
  });

  it('renders default placeholder in Panel 3 when no ruleListContent provided', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    const panel3 = screen.getByTestId('panel-slot-3');
    expect(panel3).toHaveTextContent('Rule List (Panel 3)');
  });

  it('renders custom content in Panel 3 slot when ruleListContent is provided', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        ruleListContent={<div data-testid="custom-rule-list">My Rules</div>}
      />,
    );
    expect(screen.getByTestId('custom-rule-list')).toBeInTheDocument();
    expect(screen.queryByText('Rule List (Panel 3)')).not.toBeInTheDocument();
  });

  it('renders deploy page link with correct route params', () => {
    renderWithRouter(
      <MappingEditorPage projectId="my-project" mappingId="my-mapping" />,
    );
    const link = screen.getByTestId('deploy-page-link');
    expect(link).toHaveAttribute('href', '/projects/my-project/mappings/my-mapping/deploy');
  });

  it('renders default deploy statuses as not-deployed', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    const badges = screen.getByTestId('deploy-badges');
    // All 3 environments should show
    expect(badges).toHaveTextContent('DEV');
    expect(badges).toHaveTextContent('QA');
    expect(badges).toHaveTextContent('PROD');
  });

  it('renders the page container with correct testid', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('mapping-editor-page')).toBeInTheDocument();
  });
});
