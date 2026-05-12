import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { EditorTopBar } from './EditorTopBar';
import type { HighestDeployStatus, SaveStatus } from './EditorTopBar';
import { PanelPlaceholder } from './PanelPlaceholder';
import { PreviewProvider } from '../context/preview-context';
import { useResizableLayout } from '../hooks/use-resizable-layout';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MappingEditorPageProps {
  /** Route param: project ID */
  projectId: string;
  /** Route param: mapping ID */
  mappingId: string;
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
  /** Callback to toggle the version history drawer */
  onHistoryToggle?: () => void;
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
}

// ---------------------------------------------------------------------------
// Placeholder labels
// ---------------------------------------------------------------------------

const PLACEHOLDER_LABELS = {
  source: 'Source Schema',
  targetWorklist: 'Target Worklist',
  builder: 'Builder / Editor',
  bottom: 'Preview & Diagnostics',
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
 * ├──────────────┬──────────────────────────────────┬───────────────────┤
 * │    Source    │                                  │                   │
 * │    Schema    │      Target Worklist             │  Builder/Editor   │
 * │  (resizable) │       (resizable)               │   (fills rest)    │
 * │ [collapsible]│                                  │                   │
 * ├──────────────┴──────────────────────────────────┴───────────────────┤
 * │                    Preview Strip / Bottom Area (full-width)          │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Column widths are pixel-based and user-resizable via drag handles.
 * Source panel is collapsible; a persistent expand strip replaces it when collapsed.
 * Target Worklist never collapses — it is the primary work queue.
 * Bottom area is collapsible via double-click on its resize handle.
 * Layout persists to localStorage under `keyra:editor-layout`.
 */
export function MappingEditorPage({
  projectId,
  mappingId,
  projectName = 'Project',
  mappingName = 'Untitled Mapping',
  version = 1,
  saveStatus = 'saved',
  deployStatus = null,
  unsavedChangeCount = 0,
  onViewUnsavedChanges,
  onSave = () => undefined,
  sourceSchemaName = null,
  targetSchemaName = null,
  sourceContent,
  targetWorklistContent,
  builderContent,
  bottomContent,
  onHistoryToggle,
  onConfigToggle,
  onAutoMap,
  isAutoMapLoading,
  isAutoMapMode = false,
  autoMapPendingCount = 0,
  autoMapSectionPath = null,
  onReturnToAutoMap,
}: MappingEditorPageProps) {
  const {
    layout,
    isDragging,
    sourceHandleProps,
    builderHandleProps,
    bottomHandleProps,
    expandSource,
  } = useResizableLayout();

  const { sourceWidth, targetWidth, bottomHeight, sourceCollapsed, bottomCollapsed } = layout;

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
        mappingId={mappingId}
        version={version}
        deployStatus={deployStatus}
        saveStatus={saveStatus}
        unsavedChangeCount={unsavedChangeCount}
        onViewUnsavedChanges={onViewUnsavedChanges}
        onSave={onSave}
        sourceSchemaName={sourceSchemaName}
        targetSchemaName={targetSchemaName}
        onConfigToggle={onConfigToggle}
        onHistoryToggle={onHistoryToggle}
        onAutoMap={onAutoMap}
        isAutoMapLoading={isAutoMapLoading}
        autoMapPendingCount={autoMapPendingCount}
        autoMapSectionPath={autoMapSectionPath}
        onReturnToAutoMap={onReturnToAutoMap}
      />

      {/* Main content area — wrapped in PreviewProvider so all panels share preview state */}
      <PreviewProvider>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Three-column row */}
          <div
            className={[
              'flex min-h-0 flex-1 bg-slate-800',
              isDragging ? 'select-none' : '',
            ].join(' ')}
          >
            {/* Left column: Source Schema — collapsible */}
            {sourceCollapsed ? (
              /* Collapsed expand strip */
              <button
                type="button"
                data-testid="expand-source"
                onClick={expandSource}
                aria-label="Expand Source panel"
                className="flex w-3.5 shrink-0 flex-col items-center justify-center gap-1 border-r border-slate-700 bg-slate-900 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500"
              >
                <ChevronRight size={10} aria-hidden="true" />
                <span
                  className="text-[9px] font-medium tracking-wide"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  Source
                </span>
              </button>
            ) : (
              <div
                data-testid="source-panel"
                className={[
                  'shrink-0 overflow-auto bg-slate-950',
                  isDragging ? '' : 'transition-[width] duration-200 ease-in-out',
                ].join(' ')}
                style={{ width: `${sourceWidth}px` }}
              >
                {sourceContent ?? <PanelPlaceholder name={PLACEHOLDER_LABELS.source} />}
              </div>
            )}

            {/* Drag handle: Source / Target */}
            <div
              role="separator"
              aria-label="Resize source panel"
              aria-orientation="vertical"
              data-testid="resize-handle-source"
              onMouseDown={sourceHandleProps.onMouseDown}
              onDoubleClick={sourceHandleProps.onDoubleClick}
              className="w-1.5 shrink-0 cursor-col-resize bg-slate-800 hover:bg-blue-500/20 active:bg-blue-500/30"
            />

            {/* Center column: Builder / Editor — never collapses */}
            <div
              data-testid="builder-panel"
              data-automap-mode={isAutoMapMode ? 'true' : undefined}
              className={[
                'shrink-0 overflow-auto bg-slate-950',
                isDragging ? '' : 'transition-[width] duration-200 ease-in-out',
              ].join(' ')}
              style={{ width: `${targetWidth}px` }}
            >
              {builderContent ?? <PanelPlaceholder name={PLACEHOLDER_LABELS.builder} />}
            </div>

            {/* Drag handle: Target / Builder */}
            <div
              role="separator"
              aria-label="Resize builder panel"
              aria-orientation="vertical"
              data-testid="resize-handle-builder"
              onMouseDown={builderHandleProps.onMouseDown}
              onDoubleClick={builderHandleProps.onDoubleClick}
              className="w-1.5 shrink-0 cursor-col-resize bg-slate-800 hover:bg-blue-500/20 active:bg-blue-500/30"
            />

            {/* Right column: Target Worklist — fills remaining space */}
            <div
              className="min-w-0 flex-1 overflow-auto bg-slate-950"
              data-testid="target-worklist"
            >
              {targetWorklistContent ?? (
                <PanelPlaceholder name={PLACEHOLDER_LABELS.targetWorklist} />
              )}
            </div>
          </div>

          {/* Bottom area: Preview Strip / Testing — full-width */}
          <div className="shrink-0" data-testid="bottom-area">
            {/* Resize handle — always rendered so tests can find it */}
            <div
              role="separator"
              aria-label="Resize bottom panel"
              aria-orientation="horizontal"
              data-testid="bottom-resize-handle"
              onMouseDown={bottomHandleProps.onMouseDown}
              onDoubleClick={bottomHandleProps.onDoubleClick}
              className="h-1.5 cursor-row-resize border-b border-slate-800 bg-slate-900 hover:bg-blue-500/20 active:bg-blue-500/30"
            />
            {bottomContent ? (
              <div
                className={[
                  'overflow-hidden',
                  isDragging ? '' : 'transition-[height] duration-200 ease-in-out',
                ].join(' ')}
                style={{ height: bottomCollapsed ? 0 : `${bottomHeight}px` }}
              >
                {bottomContent}
              </div>
            ) : (
              <div
                className={[
                  'overflow-hidden border-t border-slate-800 bg-slate-950',
                  isDragging ? '' : 'transition-[height] duration-200 ease-in-out',
                ].join(' ')}
                style={{ height: bottomCollapsed ? 0 : `${bottomHeight}px` }}
              >
                <PanelPlaceholder name={PLACEHOLDER_LABELS.bottom} />
              </div>
            )}
          </div>
        </div>
      </PreviewProvider>
    </div>
  );
}
