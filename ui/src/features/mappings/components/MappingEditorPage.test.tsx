import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { EditorTopBar } from './EditorTopBar';
import type { HighestDeployStatus, SaveStatus } from './EditorTopBar';
import { MappingEditorPage } from './MappingEditorPage';
import { PanelPlaceholder } from './PanelPlaceholder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const DEFAULT_TOP_BAR_PROPS = {
  projectName: 'My Project',
  projectId: 'proj-1',
  mappingName: 'Order Transform',
  mappingId: 'mapping-1',
  version: 3,
  saveStatus: 'saved' as SaveStatus,
  deployStatus: null as HighestDeployStatus | null,
  unsavedCount: 0,
  onSave: vi.fn(),
  sourceSchemaName: 'OrderRequest',
  targetSchemaName: 'PurchaseOrder',
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

  it('renders save status "Saved ✓"', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="saved" />);
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saved');
  });

  it('renders save status with unsaved count', () => {
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="unsaved" unsavedCount={3} />,
    );
    expect(screen.getByTestId('save-status')).toHaveTextContent('3 unsaved changes');
  });

  it('renders save status "Saving…"', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="saving" />);
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saving');
  });

  it('renders save status "Save failed"', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="error" />);
    expect(screen.getByTestId('save-status')).toHaveTextContent('Save failed');
  });

  it('renders "Not deployed" badge when deployStatus is null', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} deployStatus={null} />);
    expect(screen.getByTestId('deploy-badge')).toHaveTextContent('Not deployed');
  });

  it('renders highest deploy environment badge when deployStatus is provided', () => {
    const deployStatus: HighestDeployStatus = { environment: 'DEV', deployedVersion: 3 };
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} deployStatus={deployStatus} />);
    expect(screen.getByTestId('deploy-badge')).toHaveTextContent('DEV');
  });

  it('renders stale badge when saved version is ahead of deployed version', () => {
    const deployStatus: HighestDeployStatus = { environment: 'QA', deployedVersion: 1 };
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} version={3} deployStatus={deployStatus} />,
    );
    expect(screen.getByTestId('deploy-badge')).toHaveTextContent('QA (stale)');
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

  it('renders config toggle button when onConfigToggle is provided', () => {
    const onConfigToggle = vi.fn();
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} onConfigToggle={onConfigToggle} />);

    const button = screen.getByTestId('config-toggle-button');
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(onConfigToggle).toHaveBeenCalledTimes(1);
  });

  it('does not render config toggle button by default', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    expect(screen.queryByTestId('config-toggle-button')).not.toBeInTheDocument();
  });

  it('calls onSave when Save button is clicked', () => {
    const onSave = vi.fn();
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="unsaved" unsavedCount={1} onSave={onSave} />,
    );
    fireEvent.click(screen.getByTestId('save-button'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('Save button is disabled when saveStatus is "saved"', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="saved" />);
    expect(screen.getByTestId('save-button')).toBeDisabled();
  });

  it('renders project name link', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    expect(screen.getByTestId('project-name-link')).toHaveTextContent('My Project');
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

  it('renders all semantic slot areas', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('global-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('source-panel')).toBeInTheDocument();
    expect(screen.getByTestId('target-worklist')).toBeInTheDocument();
    expect(screen.getByTestId('builder-panel')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-area')).toBeInTheDocument();
  });

  it('renders the page container with correct testid', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('mapping-editor-page')).toBeInTheDocument();
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

  it('renders placeholder in source panel when no sourceContent provided', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('source-panel')).toHaveTextContent('Source Schema');
  });

  it('renders custom content in source panel when sourceContent is provided', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        sourceContent={<div data-testid="custom-source">Source Tree</div>}
      />,
    );
    expect(screen.getByTestId('custom-source')).toBeInTheDocument();
  });

  it('renders placeholder in target worklist when no targetWorklistContent provided', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('target-worklist')).toHaveTextContent('Target Worklist');
  });

  it('renders custom content in target worklist when targetWorklistContent is provided', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        targetWorklistContent={<div data-testid="custom-worklist">Worklist</div>}
      />,
    );
    expect(screen.getByTestId('custom-worklist')).toBeInTheDocument();
  });

  it('renders placeholder in builder panel when no builderContent provided', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('builder-panel')).toHaveTextContent('Builder / Editor');
  });

  it('renders custom content in builder panel when builderContent is provided', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        builderContent={<div data-testid="custom-builder">Builder</div>}
      />,
    );
    expect(screen.getByTestId('custom-builder')).toBeInTheDocument();
  });

  it('renders placeholder in bottom area when no bottomContent provided', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('bottom-area')).toHaveTextContent('Preview & Diagnostics');
  });

  it('renders resize handle in placeholder bottom area', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('bottom-resize-handle')).toBeInTheDocument();
  });

  it('renders custom content in bottom area when bottomContent is provided', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        bottomContent={<div data-testid="custom-bottom">Preview Panel</div>}
      />,
    );
    expect(screen.getByTestId('custom-bottom')).toBeInTheDocument();
  });

  it('renders placeholder in global toolbar when no toolbarContent provided', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('global-toolbar')).toHaveTextContent('Global Toolbar');
  });

  it('renders custom content in global toolbar when toolbarContent is provided', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        toolbarContent={<div data-testid="custom-toolbar">Toolbar</div>}
      />,
    );
    expect(screen.getByTestId('custom-toolbar')).toBeInTheDocument();
  });

  it('target worklist is always rendered regardless of other slots', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    const worklist = screen.getByTestId('target-worklist');
    expect(worklist).toBeInTheDocument();
  });

  it('source panel has lg: visibility class (collapses below 1024px)', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    const sourcePanel = screen.getByTestId('source-panel');
    expect(sourcePanel.className).toContain('hidden');
    expect(sourcePanel.className).toContain('lg:block');
  });

  it('target worklist does not have a hidden class', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    const worklist = screen.getByTestId('target-worklist');
    expect(worklist.className).not.toContain('hidden');
  });

  it('source panel has w-[15%] width class', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('source-panel').className).toContain('w-[15%]');
  });

  it('target worklist has lg:w-[35%] width class', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('target-worklist').className).toContain('lg:w-[35%]');
  });

  it('builder panel uses flex-1 to fill remaining space', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('builder-panel').className).toContain('flex-1');
  });

  it('renders deploy page link with correct route params', () => {
    renderWithRouter(
      <MappingEditorPage projectId="my-project" mappingId="my-mapping" />,
    );
    const link = screen.getByTestId('deploy-page-link');
    expect(link).toHaveAttribute('href', '/projects/my-project/mappings/my-mapping/deploy');
  });

  it('renders "Not deployed" badge by default when no deployStatus provided', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('deploy-badge')).toHaveTextContent('Not deployed');
  });

  it('renders highest deploy environment badge when deployStatus is provided', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        deployStatus={{ environment: 'PROD', deployedVersion: 3 }}
        version={3}
      />,
    );
    expect(screen.getByTestId('deploy-badge')).toHaveTextContent('PROD');
  });
});
