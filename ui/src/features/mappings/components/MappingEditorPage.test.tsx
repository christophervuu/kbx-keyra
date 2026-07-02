import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { EditorTopBar } from './EditorTopBar';
import type { HighestDeployStatus, SaveStatus } from './EditorTopBar';
import { MappingEditorPage } from './MappingEditorPage';
import { PanelPlaceholder } from './PanelPlaceholder';

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

describe('EditorTopBar', () => {
  it('renders breadcrumb nav with Home / Projects / project / mapping', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);

    expect(screen.getByTestId('editor-breadcrumb')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByTestId('project-name-link')).toHaveTextContent('My Project');
    expect(screen.getByTestId('mapping-name-breadcrumb')).toHaveTextContent('Order Transform');
  });

  it('renders source -> target heading', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    expect(screen.getByTestId('schema-names')).toHaveTextContent('OrderRequest → PurchaseOrder');
  });

  it('renders fallback source/target labels when null', () => {
    renderWithRouter(
      <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} sourceSchemaName={null} targetSchemaName={null} />,
    );
    expect(screen.getByTestId('schema-names')).toHaveTextContent('No source → No target');
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

  it('renders Browse Inputs button in header utility area', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} />);
    expect(screen.getByTestId('browse-source-button')).toBeInTheDocument();
    expect(screen.getByTestId('browse-source-button')).toHaveTextContent('Browse Inputs');
  });

  it('renders required/warning/error summary counts', () => {
    renderWithRouter(
      <EditorTopBar
        {...DEFAULT_TOP_BAR_PROPS}
        requiredMappedCount={42}
        requiredFieldCount={58}
        warningCount={8}
        errorCount={2}
      />,
    );

    expect(screen.getByTestId('required-mapped-summary')).toHaveTextContent('42 / 58 required fields mapped');
    expect(screen.getByTestId('warning-summary')).toHaveTextContent('8 warnings');
    expect(screen.getByTestId('error-summary')).toHaveTextContent('2 errors');
  });

  it('renders save status variants', () => {
    const { rerender } = renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="saved" />);
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saved');

    rerender(
      <MemoryRouter>
        <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="unsaved" unsavedChangeCount={3} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('save-status')).toHaveTextContent('3 unsaved changes');

    rerender(
      <MemoryRouter>
        <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="saving" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saving');

    rerender(
      <MemoryRouter>
        <EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="error" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('save-status')).toHaveTextContent('Save failed');
  });

  it('calls onViewUnsavedChanges when unsaved label is clicked', () => {
    const onViewUnsavedChanges = vi.fn();
    renderWithRouter(
      <EditorTopBar
        {...DEFAULT_TOP_BAR_PROPS}
        saveStatus="unsaved"
        unsavedChangeCount={2}
        onViewUnsavedChanges={onViewUnsavedChanges}
      />,
    );

    fireEvent.click(screen.getByTestId('save-status'));
    expect(onViewUnsavedChanges).toHaveBeenCalledTimes(1);
  });

  it('calls onSave when Save button is clicked', () => {
    const onSave = vi.fn();
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} saveStatus="unsaved" unsavedChangeCount={1} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('save-button'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('Save button is disabled when unsavedChangeCount is 0', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} unsavedChangeCount={0} />);
    expect(screen.getByTestId('save-button')).toBeDisabled();
  });

  it('Save button is enabled when canSave=true', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} canSave={true} unsavedChangeCount={0} />);
    expect(screen.getByTestId('save-button')).not.toBeDisabled();
  });

  it('Save button remains disabled when canSave=false even if unsavedChangeCount > 0', () => {
    renderWithRouter(<EditorTopBar {...DEFAULT_TOP_BAR_PROPS} canSave={false} unsavedChangeCount={3} saveStatus="unsaved" />);
    expect(screen.getByTestId('save-button')).toBeDisabled();
  });

  it('routes More menu actions through callbacks', () => {
    const onHistoryToggle = vi.fn();
    const onOpenTestLab = vi.fn();
    const onOpenRulesView = vi.fn();
    const onOpenTargetView = vi.fn();
    const onOpenDeploymentPage = vi.fn();
    const onExportMapping = vi.fn();
    const onImportMapping = vi.fn();
    const onConfigToggle = vi.fn();

    renderWithRouter(
      <EditorTopBar
        {...DEFAULT_TOP_BAR_PROPS}
        onHistoryToggle={onHistoryToggle}
        onOpenTestLab={onOpenTestLab}
        onOpenRulesView={onOpenRulesView}
        onOpenTargetView={onOpenTargetView}
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
    fireEvent.click(screen.getByTestId('more-menu-rules-view'));
    expect(onOpenRulesView).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('more-menu-button'));
    fireEvent.click(screen.getByTestId('more-menu-target-view'));
    expect(onOpenTargetView).toHaveBeenCalledTimes(1);

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

  it('routes More → Layout submenu actions through callbacks and reflects selected option', () => {
    const onSetEditorPanelLayout = vi.fn();
    const onResetEditorPanelLayout = vi.fn();

    renderWithRouter(
      <EditorTopBar
        {...DEFAULT_TOP_BAR_PROPS}
        editorPanelLayout="input-first"
        onSetEditorPanelLayout={onSetEditorPanelLayout}
        onResetEditorPanelLayout={onResetEditorPanelLayout}
      />,
    );

    fireEvent.click(screen.getByTestId('more-menu-button'));
    fireEvent.click(screen.getByTestId('more-menu-layout'));

    expect(screen.getByTestId('layout-option-input-first')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('layout-option-target-first')).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByTestId('layout-option-target-first'));
    expect(onSetEditorPanelLayout).toHaveBeenCalledWith('target-first');

    fireEvent.click(screen.getByTestId('more-menu-button'));
    fireEvent.click(screen.getByTestId('more-menu-layout'));
    fireEvent.click(screen.getByTestId('layout-reset-default'));
    expect(onResetEditorPanelLayout).toHaveBeenCalledTimes(1);
  });

  it('renders one-time layout announcement and supports change/dismiss actions', () => {
    const onDismissEditorLayoutAnnouncement = vi.fn();

    renderWithRouter(
      <EditorTopBar
        {...DEFAULT_TOP_BAR_PROPS}
        showEditorLayoutAnnouncement={true}
        onDismissEditorLayoutAnnouncement={onDismissEditorLayoutAnnouncement}
      />,
    );

    fireEvent.click(screen.getByTestId('more-menu-button'));
    expect(screen.getByTestId('editor-layout-announcement')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('editor-layout-announcement-change'));
    expect(screen.getByTestId('layout-submenu')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('editor-layout-announcement-dismiss'));
    expect(onDismissEditorLayoutAnnouncement).toHaveBeenCalledTimes(1);
  });
});

describe('MappingEditorPage', () => {
  it('renders the top bar', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('editor-top-bar')).toBeInTheDocument();
  });

  it('renders overview mode with only the Mapping Fields card', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" panelMode="overview" />);
    expect(screen.getByTestId('mapping-fields-card')).toBeInTheDocument();
    expect(screen.getByTestId('target-worklist')).toBeInTheDocument();
    expect(screen.queryByTestId('source-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('builder-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bottom-area')).not.toBeInTheDocument();
  });

  it('uses near-full-width primary workspace in automap overview mode', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        panelMode="overview"
        isAutoMapMode={true}
      />,
    );

    const mappingCard = screen.getByTestId('mapping-fields-card');
    expect(mappingCard.className).toContain('w-[min(96%,1600px)]');
    expect(screen.queryByTestId('source-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('builder-card')).not.toBeInTheDocument();
  });
  it('does not render a global-toolbar element', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.queryByTestId('global-toolbar')).not.toBeInTheDocument();
  });

  it('renders the page container with correct testid', () => {
    renderWithRouter(<MappingEditorPage projectId="proj-1" mappingId="mapping-1" />);
    expect(screen.getByTestId('mapping-editor-page')).toBeInTheDocument();
  });

  it('renders mapping name in top bar (sr-only mapping text)', () => {
    renderWithRouter(
      <MappingEditorPage projectId="proj-1" mappingId="mapping-1" mappingName="Test Mapping" />,
    );
    expect(screen.getByTestId('mapping-name')).toHaveTextContent('Test Mapping');
  });

  it('renders summary counts in top bar when provided', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        requiredMappedCount={7}
        requiredFieldCount={9}
        warningCount={2}
        errorCount={1}
      />,
    );

    expect(screen.getByTestId('required-mapped-summary')).toHaveTextContent('7 / 9 required fields mapped');
    expect(screen.getByTestId('warning-summary')).toHaveTextContent('2 warnings');
    expect(screen.getByTestId('error-summary')).toHaveTextContent('1 error');
  });

  it('renders placeholder in source panel when source-browse mode is active', () => {
    renderWithRouter(
      <MappingEditorPage projectId="proj-1" mappingId="mapping-1" panelMode="source-browse" />,
    );
    expect(screen.getByTestId('source-panel')).toHaveTextContent('Source Schema');
  });
  it('renders custom content in source panel when sourceContent is provided', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        panelMode="source-browse"
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

  it('renders placeholder in builder panel when row-editing mode is active', () => {
    renderWithRouter(
      <MappingEditorPage projectId="proj-1" mappingId="mapping-1" panelMode="row-editing" />,
    );
    expect(screen.getByTestId('builder-panel')).toHaveTextContent('Builder / Editor');
  });
  it('renders custom content in builder panel when builderContent is provided', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        panelMode="row-editing"
        builderContent={<div data-testid="custom-builder">Builder</div>}
      />,
    );
    expect(screen.getByTestId('custom-builder')).toBeInTheDocument();
  });

  it('shows Source card only in source-browse mode', () => {
    renderWithRouter(
      <MappingEditorPage projectId="proj-1" mappingId="mapping-1" panelMode="source-browse" />,
    );
    expect(screen.getByTestId('source-card')).toBeInTheDocument();
    expect(screen.queryByTestId('builder-card')).not.toBeInTheDocument();
  });
  it('shows Source and Builder cards in row-editing mode', () => {
    renderWithRouter(
      <MappingEditorPage projectId="proj-1" mappingId="mapping-1" panelMode="row-editing" />,
    );
    expect(screen.getByTestId('source-card')).toBeInTheDocument();
    expect(screen.getByTestId('builder-card')).toBeInTheDocument();
  });

  it('uses target-first row-editing panel order by default (Target → Input → Builder)', () => {
    renderWithRouter(
      <MappingEditorPage projectId="proj-1" mappingId="mapping-1" panelMode="row-editing" />,
    );

    const mappingCard = screen.getByTestId('mapping-fields-card');
    const sourceCard = screen.getByTestId('source-card');
    const builderCard = screen.getByTestId('builder-card');

    expect((mappingCard.compareDocumentPosition(sourceCard) & Node.DOCUMENT_POSITION_FOLLOWING) > 0).toBe(true);
    expect((sourceCard.compareDocumentPosition(builderCard) & Node.DOCUMENT_POSITION_FOLLOWING) > 0).toBe(true);
  });

  it('uses input-first row-editing panel order when configured (Input → Target → Builder)', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        panelMode="row-editing"
        editorPanelLayout="input-first"
      />,
    );

    const mappingCard = screen.getByTestId('mapping-fields-card');
    const sourceCard = screen.getByTestId('source-card');
    const builderCard = screen.getByTestId('builder-card');

    expect((sourceCard.compareDocumentPosition(mappingCard) & Node.DOCUMENT_POSITION_FOLLOWING) > 0).toBe(true);
    expect((mappingCard.compareDocumentPosition(builderCard) & Node.DOCUMENT_POSITION_FOLLOWING) > 0).toBe(true);
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

  it('target panel uses flex-1 to fill remaining space in non-overview modes', () => {
    renderWithRouter(
      <MappingEditorPage projectId="proj-1" mappingId="mapping-1" panelMode="row-editing" />,
    );
    expect(screen.getByTestId('target-worklist').className).toContain('flex-1');
  });

  it('keeps bottomContent out of visible layout for all modes', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        panelMode="row-editing"
        bottomContent={<div data-testid="custom-bottom">Preview Panel</div>}
      />,
    );
    expect(screen.queryByTestId('custom-bottom')).not.toBeInTheDocument();
    expect(screen.getByTestId('bottom-area-removed')).toBeInTheDocument();
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

  it('wires Browse Inputs button pressed state through props', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        isBrowseSourceActive={true}
      />,
    );
    expect(screen.getByTestId('browse-source-button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onToggleBrowseSource when Browse Inputs button is clicked', () => {
    const onToggleBrowseSource = vi.fn();
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        onToggleBrowseSource={onToggleBrowseSource}
      />,
    );
    fireEvent.click(screen.getByTestId('browse-source-button'));
    expect(onToggleBrowseSource).toHaveBeenCalledTimes(1);
  });

  it('renders hide buttons on Source and Builder cards and triggers callbacks', () => {
    const onHideSourcePanel = vi.fn();
    const onHideBuilderPanel = vi.fn();

    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        panelMode="row-editing"
        onHideSourcePanel={onHideSourcePanel}
        onHideBuilderPanel={onHideBuilderPanel}
      />,
    );

    fireEvent.click(screen.getByTestId('hide-source-panel'));
    fireEvent.click(screen.getByTestId('hide-builder-panel'));

    expect(onHideSourcePanel).toHaveBeenCalledTimes(1);
    expect(onHideBuilderPanel).toHaveBeenCalledTimes(1);
  });

  it('does not render Source/Builder cards when hidden flags are true', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        panelMode="row-editing"
        hideSourcePanel={true}
        hideBuilderPanel={true}
      />,
    );

    expect(screen.queryByTestId('source-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('builder-card')).not.toBeInTheDocument();
  });

  it('uses wider builder card and narrower mapping card when targetPanelCondensed=true in row-editing mode', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        panelMode="row-editing"
        targetPanelCondensed={true}
      />,
    );

    const mappingCard = screen.getByTestId('mapping-fields-card');
    const builderCard = screen.getByTestId('builder-card');

    expect(mappingCard.className).toContain('w-[44%]');
    expect(builderCard.className).toContain('w-[36%]');
    expect(builderCard.className).toContain('min-w-[420px]');
  });

  it('renders Fields | Output segmented tabs when enabled with correct selected semantics', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        showPanelViewToggle={true}
        activePanelView="fields"
      />,
    );

    expect(screen.getByTestId('target-panel-view-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('target-panel-tab-fields')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('target-panel-tab-output')).toHaveAttribute('aria-selected', 'false');
  });

  it('supports keyboard navigation for segmented tabs', () => {
    const onActivePanelViewChange = vi.fn();
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        showPanelViewToggle={true}
        activePanelView="fields"
        onActivePanelViewChange={onActivePanelViewChange}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('target-panel-tab-fields'), { key: 'ArrowRight' });
    expect(onActivePanelViewChange).toHaveBeenCalledWith('output');

    fireEvent.keyDown(screen.getByTestId('target-panel-tab-fields'), { key: 'End' });
    expect(onActivePanelViewChange).toHaveBeenCalledWith('output');

    fireEvent.keyDown(screen.getByTestId('target-panel-tab-output'), { key: 'Home' });
    expect(onActivePanelViewChange).toHaveBeenCalledWith('fields');
  });

  it('keeps fields/output panels mounted and toggles visibility by activePanelView', () => {
    renderWithRouter(
      <MappingEditorPage
        projectId="proj-1"
        mappingId="mapping-1"
        showPanelViewToggle={true}
        activePanelView="output"
      />,
    );

    expect(screen.getByTestId('target-panel-view-fields').className).toContain('hidden');
    expect(screen.getByTestId('target-panel-view-output').className).not.toContain('hidden');
  });
});
