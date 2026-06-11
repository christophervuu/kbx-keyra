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
  version: 3,
  saveStatus: 'saved' as SaveStatus,
  deployStatus: null as HighestDeployStatus | null,
  unsavedChangeCount: 0,
  onViewUnsavedChanges: vi.fn(),
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

  it('renders revision badge', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    expect(screen.getByTestId('revision-badge')).toHaveTextContent('Rev 3');
  });

  it('renders version badge as "—" when no currentVersion', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    expect(screen.getByTestId('version-badge')).toHaveTextContent('—');
  });

  it('renders version badge with number when currentVersion is set', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} currentVersion={2} />);
    expect(screen.getByTestId('version-badge')).toHaveTextContent('v2');
  });

  it('renders save status "Saved ✓"', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="saved" />);
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saved');
  });

  it('renders save status with unsaved count', () => {
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="unsaved" unsavedChangeCount={3} />,
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
    const deployStatus: HighestDeployStatus = { environment: 'PREPROD', deployedVersion: 1 };
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} version={3} deployStatus={deployStatus} />,
    );
    expect(screen.getByTestId('deploy-badge')).toHaveTextContent('PREPROD (stale)');
  });

  it('renders source and target schema names', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    const schemaNames = screen.getByTestId('schema-names');
    expect(schemaNames).toHaveTextContent('OrderRequest');
    expect(schemaNames).toHaveTextContent('PurchaseOrder');
  });

  it('renders sample selector slot when provided', () => {
    renderWithRouter(
      <EditorTopBar
        {...DEFAULT_TOP_BAR_PROPS}
        sampleSelectorSlot={<button data-testid="sample-selector-slot">Sample picker</button>}
      />,
    );
    expect(screen.getByTestId('sample-selector-slot')).toBeInTheDocument();
  });

  it('renders "No source" when sourceSchemaName is null', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} sourceSchemaName={null} />);
    expect(screen.getByTestId('schema-names')).toHaveTextContent('No source');
  });

  it('renders "No target" when targetSchemaName is null', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} targetSchemaName={null} />);
    expect(screen.getByTestId('schema-names')).toHaveTextContent('No target');
  });


  it('hides deploy badge when showDeployControls=false while keeping deployment route-out available', () => {
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} showDeployControls={false} />,
    );
    expect(screen.queryByTestId('deploy-badge')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('more-menu-button'));
    expect(screen.getByTestId('more-menu-deployment')).toBeEnabled();
  });

  it('routes Mapping settings action from More menu when onConfigToggle is provided', () => {
    const onConfigToggle = vi.fn();
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} onConfigToggle={onConfigToggle} />);

    fireEvent.click(screen.getByTestId('more-menu-button'));
    const button = screen.getByTestId('more-menu-settings');
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(onConfigToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onSave when Save button is clicked', () => {
    const onSave = vi.fn();
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="unsaved" unsavedChangeCount={1} onSave={onSave} />,
    );
    fireEvent.click(screen.getByTestId('save-button'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('Save button is disabled when unsavedChangeCount is 0', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} unsavedChangeCount={0} />);
    expect(screen.getByTestId('save-button')).toBeDisabled();
  });

  it('renders project name link', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    expect(screen.getByTestId('project-name-link')).toHaveTextContent('My Project');
  });

  it('renders disabled Auto-map button', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    const btn = screen.getByTestId('automap-button');
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it('Auto-map button has correct tooltip text', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    expect(screen.getByTestId('automap-button')).toHaveAttribute(
      'title',
      'AI-powered auto-mapping \u2014 coming soon',
    );
  });

  it('renders live Auto-map button when onAutoMap is provided', () => {
    const onAutoMap = vi.fn();
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} onAutoMap={onAutoMap} />);
    const btn = screen.getByTestId('automap-button');
    expect(btn).not.toBeDisabled();
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('renders scoped Auto-map label when autoMapScopeCount is provided', () => {
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} onAutoMap={vi.fn()} autoMapScopeCount={7} />,
    );
    expect(screen.getByTestId('automap-button')).toHaveTextContent('Auto-map (7)');
    expect(screen.getByTestId('automap-scope-label')).toHaveTextContent('Scope: 7 visible fields');
  });

  it('renders View Issues button with issue count when provided', () => {
    renderWithRouter(
      <EditorTopBar
        {...DEFAULT_TOP_BAR_PROPS}
        onViewIssues={vi.fn()}
        issueCount={2}
      />,
    );

    expect(screen.getByTestId('view-issues-button')).toBeInTheDocument();
    expect(screen.getByTestId('view-issues-count')).toHaveTextContent('2');
  });

  it('routes More menu actions through callbacks', () => {
    const onHistoryToggle = vi.fn();
    const onOpenTestLab = vi.fn();
    const onOpenDeploymentPage = vi.fn();
    const onExportMapping = vi.fn();
    const onImportMapping = vi.fn();
    const onConfigToggle = vi.fn();

    renderWithRouter(
      <EditorTopBar
        {...DEFAULT_TOP_BAR_PROPS}
        onHistoryToggle={onHistoryToggle}
        onOpenTestLab={onOpenTestLab}
        onOpenDeploymentPage={onOpenDeploymentPage}
        onExportMapping={onExportMapping}
        onImportMapping={onImportMapping}
        onConfigToggle={onConfigToggle}
      />,
    );

    fireEvent.click(screen.getByTestId('more-menu-button'));
    fireEvent.click(screen.getByTestId('more-menu-history'));
    expect(onHistoryToggle).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('more-menu-button'));
    fireEvent.click(screen.getByTestId('more-menu-test-lab'));
    expect(onOpenTestLab).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('more-menu-button'));
    fireEvent.click(screen.getByTestId('more-menu-deployment'));
    expect(onOpenDeploymentPage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('more-menu-button'));
    fireEvent.click(screen.getByTestId('more-menu-export'));
    expect(onExportMapping).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('more-menu-button'));
    fireEvent.click(screen.getByTestId('more-menu-import'));
    expect(onImportMapping).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('more-menu-button'));
    fireEvent.click(screen.getByTestId('more-menu-settings'));
    expect(onConfigToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onAutoMap when live Auto-map button is clicked', () => {
    const onAutoMap = vi.fn();
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} onAutoMap={onAutoMap} />);
    fireEvent.click(screen.getByTestId('automap-button'));
    expect(onAutoMap).toHaveBeenCalledTimes(1);
  });

  it('disables live Auto-map button and shows spinner when isAutoMapLoading is true', () => {
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} onAutoMap={vi.fn()} isAutoMapLoading={true} />,
    );
    const btn = screen.getByTestId('automap-button');
    expect(btn).toBeDisabled();
    // Spinner element is present (animate-spin class)
    expect(btn.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders top header controls in requested order', () => {
    renderWithRouter(
      <EditorTopBar
        {...DEFAULT_TOP_BAR_PROPS}
        saveStatus="unsaved"
        unsavedChangeCount={2}
        onConfigToggle={vi.fn()}
        onHistoryToggle={vi.fn()}
      />,
    );

    const breadcrumb = screen.getByTestId('editor-breadcrumb');
    const revisionBadge = screen.getByTestId('revision-badge');
    const versionBadge = screen.getByTestId('version-badge');
    const deployBadge = screen.getByTestId('deploy-badge');
    const saveStatus = screen.getByTestId('save-status');
    const autoMap = screen.getByTestId('automap-button');
    const more = screen.getByTestId('more-menu-button');
    const save = screen.getByTestId('save-button');

    expect(breadcrumb.compareDocumentPosition(revisionBadge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(revisionBadge.compareDocumentPosition(versionBadge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(versionBadge.compareDocumentPosition(deployBadge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(deployBadge.compareDocumentPosition(saveStatus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(saveStatus.compareDocumentPosition(autoMap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(autoMap.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(more.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders separator to the right of unsaved changes section', () => {
    const { container } = renderWithRouter(
      <EditorTopBar
        {...DEFAULT_TOP_BAR_PROPS}
        saveStatus="unsaved"
        unsavedChangeCount={2}
      />,
    );

    const saveStatus = screen.getByTestId('save-status');
    const separator = Array.from(container.querySelectorAll('span')).find((el) => el.textContent?.trim() === '|');

    expect(separator).toBeDefined();
    expect(saveStatus.compareDocumentPosition(separator as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // FS-063 T-06: revision/version badges, canSave, draft indicator, Version button
  // ---------------------------------------------------------------------------

  it('shows currentRevision in revision badge when provided', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} currentRevision={7} />);
    expect(screen.getByTestId('revision-badge')).toHaveTextContent('Rev 7');
  });

  it('falls back to version in revision badge when currentRevision is absent', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} version={4} />);
    expect(screen.getByTestId('revision-badge')).toHaveTextContent('Rev 4');
  });

  it('Save button is disabled when canSave=false regardless of unsavedChangeCount', () => {
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} canSave={false} unsavedChangeCount={5} />,
    );
    expect(screen.getByTestId('save-button')).toBeDisabled();
  });

  it('Save button is enabled when canSave=true', () => {
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} canSave={true} unsavedChangeCount={0} />,
    );
    expect(screen.getByTestId('save-button')).not.toBeDisabled();
  });

  it('draft indicator is not rendered when hasDraft=false', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} hasDraft={false} />);
    expect(screen.queryByTestId('draft-indicator')).not.toBeInTheDocument();
  });

  it('draft indicator is rendered when hasDraft=true', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} hasDraft={true} />);
    expect(screen.getByTestId('draft-indicator')).toBeInTheDocument();
  });

  it('Version button is not rendered when onCreateVersion is absent', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    expect(screen.queryByTestId('version-button')).not.toBeInTheDocument();
  });

  it('Version button is rendered when onCreateVersion is provided', () => {
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} onCreateVersion={vi.fn()} />,
    );
    expect(screen.getByTestId('version-button')).toBeInTheDocument();
  });

  it('Version button calls onCreateVersion when clicked', () => {
    const onCreateVersion = vi.fn();
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} onCreateVersion={onCreateVersion} />,
    );
    fireEvent.click(screen.getByTestId('version-button'));
    expect(onCreateVersion).toHaveBeenCalledTimes(1);
  });

  it('Version button is disabled while saving', () => {
    renderWithRouter(
      <EditorTopBar
        {...DEFAULT_TOP_BAR_PROPS}
        saveStatus="saving"
        onCreateVersion={vi.fn()}
      />,
    );
    expect(screen.getByTestId('version-button')).toBeDisabled();
  });

  it('Version button appears before Save button in document order', () => {
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} canSave={true} onCreateVersion={vi.fn()} />,
    );
    const versionBtn = screen.getByTestId('version-button');
    const saveBtn = screen.getByTestId('save-button');
    expect(versionBtn.compareDocumentPosition(saveBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(screen.getByTestId('source-panel')).toBeInTheDocument();
    expect(screen.getByTestId('target-worklist')).toBeInTheDocument();
    expect(screen.getByTestId('builder-panel')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-area')).toBeInTheDocument();
  });

  it('does not render a global-toolbar element', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.queryByTestId('global-toolbar')).not.toBeInTheDocument();
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

  it('renders revision badge in top bar', () => {
    renderWithRouter(
      <MappingEditorPage projectId="proj-1" mappingId="mapping-1" version={5} />,
    );
    expect(screen.getByTestId('revision-badge')).toHaveTextContent('Rev 5');
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

  it('target worklist is always rendered regardless of other slots', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    const worklist = screen.getByTestId('target-worklist');
    expect(worklist).toBeInTheDocument();
  });

  it('target worklist does not have a hidden class', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    const worklist = screen.getByTestId('target-worklist');
    expect(worklist.className).not.toContain('hidden');
  });

  it('target panel uses flex-1 to fill remaining space', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('target-worklist').className).toContain('flex-1');
  });

  it('renders resize handle between source and target columns', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('resize-handle-source')).toBeInTheDocument();
  });

  it('renders resize handle between target and builder columns', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('resize-handle-builder')).toBeInTheDocument();
  });

  it('renders bottom resize handle', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('bottom-resize-handle')).toBeInTheDocument();
  });

  it('source panel has non-zero inline width by default', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    const panel = screen.getByTestId('source-panel');
    const width = (panel as HTMLElement).style.width;
    expect(width).toBeTruthy();
    expect(parseInt(width)).toBeGreaterThan(0);
  });

  it('builder panel has non-zero inline width by default', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    const panel = screen.getByTestId('builder-panel');
    const width = (panel as HTMLElement).style.width;
    expect(width).toBeTruthy();
    expect(parseInt(width)).toBeGreaterThan(0);
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

  it('does not render deploy badge in focused authoring shell mode', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        showDeployControls={false}
      />,
    );
    expect(screen.queryByTestId('deploy-badge')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('more-menu-button'));
    expect(screen.getByTestId('more-menu-deployment')).toBeEnabled();
  });

  it('passes sample selector slot through to top bar', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        sampleSelectorSlot={<button data-testid="page-sample-slot">Sample</button>}
      />,
    );

    expect(screen.getByTestId('page-sample-slot')).toBeInTheDocument();
  });
});
