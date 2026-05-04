import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';

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
  /** Number of rules modified since last save (for unsaved indicator) */
  unsavedCount?: number;
  /** Callback for the Save button */
  onSave?: () => void;
  /** Source schema display name */
  sourceSchemaName?: string | null;
  /** Target schema display name */
  targetSchemaName?: string | null;
  /** Content for the Global Toolbar slot (above the three columns) */
  toolbarContent?: ReactNode;
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
}

// ---------------------------------------------------------------------------
// Placeholder labels
// ---------------------------------------------------------------------------

const PLACEHOLDER_LABELS = {
  toolbar: 'Global Toolbar',
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
 * Layout at 1280px+:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                          EditorTopBar (context bar)                  │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │                          GlobalToolbar                               │
 * ├──────────────┬──────────────────────────────────┬───────────────────┤
 * │    Source    │                                  │                   │
 * │    Schema    │      Target Worklist             │  Builder/Editor   │
 * │   (~15%)     │         (~35%)                  │     (~50%)        │
 * │ [collapsible │                                  │                   │
 * │  at 1024px]  │                                  │                   │
 * ├──────────────┴──────────────────────────────────┴───────────────────┤
 * │                    Preview Strip / Bottom Area (full-width)          │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * At 1024px: source column collapses (hidden, expand toggle available).
 * Target Worklist never collapses — it is the primary work queue.
 * Configuration and Version History are overlay drawers, not grid slots.
 */
export function MappingEditorPage({
  projectId,
  mappingId,
  projectName = 'Project',
  mappingName = 'Untitled Mapping',
  version = 1,
  saveStatus = 'saved',
  deployStatus = null,
  unsavedCount = 0,
  onSave = () => undefined,
  sourceSchemaName = null,
  targetSchemaName = null,
  toolbarContent,
  sourceContent,
  targetWorklistContent,
  builderContent,
  bottomContent,
  onHistoryToggle,
  onConfigToggle,
}: MappingEditorPageProps) {
  const [bottomHeight, setBottomHeight] = useState(260);
  const [isResizing, setIsResizing] = useState(false);

  const resizeStartYRef = useRef(0);
  const resizeStartHeightRef = useRef(260);

  const startResize = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();

      resizeStartYRef.current = event.clientY;
      resizeStartHeightRef.current = bottomHeight;
      setIsResizing(true);
    },
    [bottomHeight],
  );

  useEffect(() => {
    if (!isResizing) return;

    function handleResizeMove(event: MouseEvent) {
      const delta = resizeStartYRef.current - event.clientY;
      const minHeight = 180;
      const maxHeight = Math.max(320, Math.floor(window.innerHeight * 0.65));
      const nextHeight = Math.min(
        maxHeight,
        Math.max(minHeight, resizeStartHeightRef.current + delta),
      );

      setBottomHeight(nextHeight);
    }

    function handleResizeEnd() {
      setIsResizing(false);
    }

    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);

    return () => {
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isResizing]);

  return (
    <div
      className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden"
      data-testid="mapping-editor-page"
    >
      {/* Context bar (Row 2 of 2-row top area) */}
      <EditorTopBar
        projectName={projectName}
        projectId={projectId}
        mappingName={mappingName}
        mappingId={mappingId}
        version={version}
        deployStatus={deployStatus}
        saveStatus={saveStatus}
        unsavedCount={unsavedCount}
        onSave={onSave}
        sourceSchemaName={sourceSchemaName}
        targetSchemaName={targetSchemaName}
        onConfigToggle={onConfigToggle}
        onHistoryToggle={onHistoryToggle}
      />

      {/* Global Toolbar — full-width strip below context bar */}
      <div
        className="shrink-0 border-b border-slate-800 bg-slate-950"
        data-testid="global-toolbar"
      >
        {toolbarContent ?? (
          <div className="flex h-9 items-center px-3">
            <PanelPlaceholder name={PLACEHOLDER_LABELS.toolbar} />
          </div>
        )}
      </div>

      {/* Main content area — wrapped in PreviewProvider so all panels share preview state */}
      <PreviewProvider>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Three-column row — 15% / 35% / 50% at ≥1280px */}
          <div className="flex min-h-0 flex-1 gap-px bg-slate-800">
            {/* Left column: Source Schema — ~15%, collapsible at ≤1024px */}
            <div
              className="hidden w-[15%] shrink-0 overflow-auto bg-slate-950 lg:block"
              data-testid="source-panel"
            >
              {sourceContent ?? <PanelPlaceholder name={PLACEHOLDER_LABELS.source} />}
            </div>

            {/* Center column: Target Worklist — ~40% at <1024px (source hidden), ~35% at ≥1280px */}
            <div
              className="w-[40%] shrink-0 overflow-auto bg-slate-950 lg:w-[35%]"
              data-testid="target-worklist"
            >
              {targetWorklistContent ?? (
                <PanelPlaceholder name={PLACEHOLDER_LABELS.targetWorklist} />
              )}
            </div>

            {/* Right column: Builder / Editor — ~50%, fills remaining space */}
            <div
              className="min-w-0 flex-1 overflow-auto bg-slate-950"
              data-testid="builder-panel"
            >
              {builderContent ?? <PanelPlaceholder name={PLACEHOLDER_LABELS.builder} />}
            </div>
          </div>

          {/* Bottom area: Preview Strip / Testing — full-width */}
          <div className="shrink-0" data-testid="bottom-area">
            {bottomContent ?? (
              <div className="border-t border-slate-800 bg-slate-950">
                <div
                  role="separator"
                  aria-label="Resize bottom panel"
                  aria-orientation="horizontal"
                  data-testid="bottom-resize-handle"
                  onMouseDown={startResize}
                  className="h-1.5 cursor-row-resize border-b border-slate-800 bg-slate-900 hover:bg-slate-700"
                />
                <div style={{ height: `${bottomHeight}px` }} className="min-h-0">
                  <PanelPlaceholder name={PLACEHOLDER_LABELS.bottom} />
                </div>
              </div>
            )}
          </div>
        </div>
      </PreviewProvider>
    </div>
  );
}
