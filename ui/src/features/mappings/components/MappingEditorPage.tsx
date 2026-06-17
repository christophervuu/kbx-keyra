import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { EditorTopBar } from './EditorTopBar';
import type { HighestDeployStatus, SaveStatus } from './EditorTopBar';
import { PanelPlaceholder } from './PanelPlaceholder';
import { PreviewProvider } from '../context/preview-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MappingEditorPageProps {
  /** Route param: project ID */
  projectId: string;
  /** Route param: mapping ID */
  mappingId?: string;
  /** Human-readable project name (shown as link in context bar) */
  projectName?: string;
  /** Mapping display name */
  mappingName?: string;
  /** Mapping version number */
  version?: number;
  /** Current save status */
  saveStatus?: SaveStatus;
  /**
   * Highest deployed environment info.
   * Null when the mapping has never been deployed.
   */
  deployStatus?: HighestDeployStatus | null;
  /** Number of fields with unsaved draft changes (replaces unsavedCount) */
  unsavedChangeCount?: number;
  /** Callback to open the UnsavedChangesOverlay */
  onViewUnsavedChanges?: () => void;
  /** Callback for the Save button */
  onSave?: () => void;
  /** Current revision number (FS-063) */
  currentRevision?: number;
  /** Current version (milestone) number, or null when none created yet */
  currentVersion?: number | null;
  /** Whether there is a local autosaved draft */
  hasDraft?: boolean;
  /** Whether the Save button should be enabled */
  canSave?: boolean;
  /** Callback for the Version button */
  onCreateVersion?: () => void;
  /** Source schema display name */
  sourceSchemaName?: string | null;
  /** Target schema display name */
  targetSchemaName?: string | null;
  /** Content for the Source Schema panel (left column, collapsible) */
  sourceContent?: ReactNode;
  /** Content for the Target Worklist panel (center column, primary — never collapses) */
  targetWorklistContent?: ReactNode;
  /** Content for the Builder/Editor panel (right column) */
  builderContent?: ReactNode;
  /** Content for the full-width bottom area (Preview / Diagnostics / Testing) */
  bottomContent?: ReactNode;
  /** Staged layout mode for Mapping Fields / Source / Builder cards */
  panelMode?: 'overview' | 'source-browse' | 'row-editing';
  /** Callback to toggle the version history drawer */
  onHistoryToggle?: () => void;
  /** Callback to open consolidated issues panel */
  onViewIssues?: () => void;
  /** Consolidated warning/error count shown near View Issues */
  issueCount?: number;
  /** Required fields mapped summary numerator */
  requiredMappedCount?: number;
  /** Required fields mapped summary denominator */
  requiredFieldCount?: number;
  /** Warning count shown in header summary */
  warningCount?: number;
  /** Error count shown in header summary */
  errorCount?: number;
  /** Callback to route to Test Lab */
  onOpenTestLab?: () => void;
  /** Callback to open Rules view from header More menu */
  onOpenRulesView?: () => void;
  /** Callback to open Target properties view from header More menu */
  onOpenTargetView?: () => void;
  /** True when Mapping Editor is currently in Rules view */
  isRulesViewActive?: boolean;
  /** Callback to route to Deployment page */
  onOpenDeploymentPage?: () => void;
  /** Callback for export action */
  onExportMapping?: () => void;
  /** Callback for import action */
  onImportMapping?: () => void;
  /** Callback to toggle the configuration modal */
  onConfigToggle?: () => void;
  /** Callback fired when the user clicks the "Auto-map" button (header mode). */
  onAutoMap?: () => void;
  /** True while a header-level auto-map request is in flight. */
  isAutoMapLoading?: boolean;
  /**
   * True when the editor is in Auto-Map workspace mode (FS-048).
   * When true the center panel renders the workspace slot and the view toggle is hidden.
   */
  isAutoMapMode?: boolean;
  /**
   * Number of pending (unreviewed) auto-map suggestions across all sections (FS-048).
   * When > 0, a re-entry affordance pill is shown in the top bar.
   */
  autoMapPendingCount?: number;
  /** Section path with pending suggestions — passed through to EditorTopBar */
  autoMapSectionPath?: string | null;
  /** Called when the re-entry affordance pill is clicked */
  onReturnToAutoMap?: () => void;
  /** Number of visible target rows in current search/filter scope */
  autoMapScopeCount?: number;
  /** Whether to show deploy badge/link controls in the top bar */
  showDeployControls?: boolean;
  /** Optional sample selector control rendered in the top bar. */
  sampleSelectorSlot?: ReactNode;
  /** Loaded selected sample payload parsed as object for preview-context readers */
  selectedSampleSourceData?: unknown | null;
  /** Toggle Source browse mode (header Browse Source button). */
  onToggleBrowseSource?: () => void;
  /** Whether Source browse mode is active in header utility area. */
  isBrowseSourceActive?: boolean;
  /** Hide Source card while keeping staged layout mode active */
  hideSourcePanel?: boolean;
  /** Hide Builder card while keeping staged layout mode active */
  hideBuilderPanel?: boolean;
  /** Fired when Source panel close button is clicked */
  onHideSourcePanel?: () => void;
  /** Fired when Builder panel close button is clicked */
  onHideBuilderPanel?: () => void;
  /** Condensed target-worklist columns for focused row-editing state. */
  targetPanelCondensed?: boolean;
}

// ---------------------------------------------------------------------------
// Placeholder labels
// ---------------------------------------------------------------------------

const PLACEHOLDER_LABELS = {
  source: 'Source Schema',
  targetWorklist: 'Target Worklist',
  builder: 'Builder / Editor',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Full Mapping Editor page shell with target-driven three-column layout.
 *
 * Layout at 1024px+:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                          EditorTopBar (context bar)                  │
 * ├──────────────────────────────────────────────────┬───────────────────┤
 * │                                                  │  Source + Builder │
 * │                 Target Worklist                  │   detail pane      │
 * │                  (primary)                       │   (row-selected)   │
 * │                                                  │                   │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Column widths are pixel-based and user-resizable via drag handles.
 * Source panel is collapsible; a persistent expand strip replaces it when collapsed.
 * Target Worklist never collapses — it is the primary work queue.
 * Layout persists to localStorage under `keyra:editor-layout`.
 */
export function MappingEditorPage({
  projectId,
  projectName = 'Project',
  mappingName = 'Untitled Mapping',
  version = 1,
  saveStatus = 'saved',
  deployStatus = null,
  unsavedChangeCount = 0,
  onViewUnsavedChanges,
  onSave = () => undefined,
  currentRevision,
  currentVersion = null,
  hasDraft = false,
  canSave,
  onCreateVersion,
  sourceSchemaName = null,
  targetSchemaName = null,
  sourceContent,
  targetWorklistContent,
  builderContent,
  bottomContent,
  onHistoryToggle,
  onViewIssues,
  issueCount = 0,
  requiredMappedCount = 0,
  requiredFieldCount = 0,
  warningCount = 0,
  errorCount = 0,
  onOpenTestLab,
  onOpenRulesView,
  onOpenTargetView,
  isRulesViewActive = false,
  onOpenDeploymentPage,
  onExportMapping,
  onImportMapping,
  onConfigToggle,
  onAutoMap,
  isAutoMapLoading,
  isAutoMapMode = false,
  autoMapPendingCount = 0,
  autoMapSectionPath = null,
  onReturnToAutoMap,
  autoMapScopeCount,
  showDeployControls = true,
  sampleSelectorSlot,
  selectedSampleSourceData,
  panelMode = 'overview',
  onToggleBrowseSource,
  isBrowseSourceActive = false,
  hideSourcePanel = false,
  hideBuilderPanel = false,
  onHideSourcePanel,
  onHideBuilderPanel,
  targetPanelCondensed = false,
}: MappingEditorPageProps) {
  // FS-092: in-page bottom preview section is intentionally removed from Mapping Editor.
  // Keep prop for backward compatibility with existing call sites.
  void bottomContent;

  const isOverview = panelMode === 'overview';
  const showSourceCard = (panelMode === 'source-browse' || panelMode === 'row-editing') && !hideSourcePanel;
  const showBuilderCard = panelMode === 'row-editing' && !hideBuilderPanel;

  const mappingCardWidthClass = isOverview
    ? 'w-[min(78%,1200px)]'
    : showBuilderCard
      ? (targetPanelCondensed ? 'w-[44%]' : 'w-[56%]')
      : 'w-[68%]';

  return (
    <div
      className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden"
      data-testid="mapping-editor-page"
    >
      {/* Context bar */}
        <EditorTopBar
        projectName={projectName}
        projectId={projectId}
        mappingName={mappingName}
        version={version}
        currentRevision={currentRevision}
        currentVersion={currentVersion}
        hasDraft={hasDraft}
        canSave={canSave}
        onCreateVersion={onCreateVersion}
        deployStatus={deployStatus}
        saveStatus={saveStatus}
        unsavedChangeCount={unsavedChangeCount}
        onViewUnsavedChanges={onViewUnsavedChanges}
        onSave={onSave}
        sourceSchemaName={sourceSchemaName}
        targetSchemaName={targetSchemaName}
        onConfigToggle={onConfigToggle}
        onHistoryToggle={onHistoryToggle}
        onViewIssues={onViewIssues}
        issueCount={issueCount}
        requiredMappedCount={requiredMappedCount}
        requiredFieldCount={requiredFieldCount}
        warningCount={warningCount}
        errorCount={errorCount}
        onOpenTestLab={onOpenTestLab}
        onOpenRulesView={onOpenRulesView}
        onOpenTargetView={onOpenTargetView}
        isRulesViewActive={isRulesViewActive}
        onOpenDeploymentPage={onOpenDeploymentPage}
        onExportMapping={onExportMapping}
        onImportMapping={onImportMapping}
        onAutoMap={onAutoMap}
        isAutoMapLoading={isAutoMapLoading}
        autoMapPendingCount={autoMapPendingCount}
        autoMapSectionPath={autoMapSectionPath}
        onReturnToAutoMap={onReturnToAutoMap}
        autoMapScopeCount={autoMapScopeCount}
          showDeployControls={showDeployControls}
          sampleSelectorSlot={sampleSelectorSlot}
          onToggleBrowseSource={onToggleBrowseSource}
          isBrowseSourceActive={isBrowseSourceActive}
        />

      {/* Main content area — wrapped in PreviewProvider so all panels share preview state */}
      <PreviewProvider sourceData={selectedSampleSourceData}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-950">
          <div
            className={[
              'flex h-full min-h-0 flex-1 gap-3 px-3 pt-3 transition-all duration-200 ease-in-out',
              isOverview ? 'items-stretch justify-center' : 'items-stretch justify-start',
            ].join(' ')}
          >
            <section
              className={[
                'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40 shadow-[0_0_0_1px_rgba(15,23,42,0.2)] transition-all duration-200 ease-in-out',
                mappingCardWidthClass,
              ].join(' ')}
              data-testid="mapping-fields-card"
            >
              <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Target Mapping Fields
              </div>
              <div className="min-h-0 flex-1 overflow-auto" data-testid="target-worklist">
                {targetWorklistContent ?? (
                  <PanelPlaceholder name={PLACEHOLDER_LABELS.targetWorklist} />
                )}
              </div>
            </section>

            {showSourceCard && (
              <section
                className="flex h-full min-h-0 w-[22%] min-w-[260px] flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40 shadow-[0_0_0_1px_rgba(15,23,42,0.2)] transition-all duration-200 ease-in-out"
                data-testid="source-card"
              >
                <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <div className="flex items-center justify-between gap-2">
                    <span>Input Fields</span>
                    {onHideSourcePanel ? (
                      <button
                        type="button"
                        aria-label="Hide Source panel"
                        data-testid="hide-source-panel"
                        onClick={onHideSourcePanel}
                        className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-900 p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto" data-testid="source-panel">
                  {sourceContent ?? <PanelPlaceholder name={PLACEHOLDER_LABELS.source} />}
                </div>
              </section>
            )}

            {showBuilderCard && (
              <section
                className={[
                  'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40 shadow-[0_0_0_1px_rgba(15,23,42,0.2)] transition-all duration-200 ease-in-out',
                  targetPanelCondensed ? 'w-[36%] min-w-[420px]' : 'w-[24%] min-w-[300px]',
                ].join(' ')}
                data-testid="builder-card"
              >
                <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <div className="flex items-center justify-between gap-2">
                    <span>Builder</span>
                    {onHideBuilderPanel ? (
                      <button
                        type="button"
                        aria-label="Hide Builder panel"
                        data-testid="hide-builder-panel"
                        onClick={onHideBuilderPanel}
                        className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-900 p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div
                  data-testid="builder-panel"
                  data-automap-mode={isAutoMapMode ? 'true' : undefined}
                  className="min-h-0 flex-1 overflow-auto"
                >
                  {builderContent ?? <PanelPlaceholder name={PLACEHOLDER_LABELS.builder} />}
                </div>
              </section>
            )}
          </div>

          <div className="sr-only" data-testid="bottom-area-removed" />
        </div>
      </PreviewProvider>
    </div>
  );
}
