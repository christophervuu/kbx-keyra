import type { ReactNode } from 'react';

import { EditorTopBar } from './EditorTopBar';
import type { DeployBadgeInfo, SaveStatus } from './EditorTopBar';
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
  /** Mapping display name */
  mappingName?: string;
  /** Mapping version number */
  version?: number;
  /** Current save status */
  saveStatus?: SaveStatus;
  /** Deploy status for each environment */
  deployStatuses?: readonly DeployBadgeInfo[];
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
  /** Content for the Configuration panel (overlay/drawer — passed through to route composition) */
  configPanelContent?: ReactNode;
  /** Content for the History panel (overlay/drawer — passed through to route composition) */
  historyPanelContent?: ReactNode;
  /** Callback to toggle the version history drawer */
  onHistoryToggle?: () => void;
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
 * │                          EditorTopBar                                │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │                          GlobalToolbar                               │
 * ├──────────────┬──────────────────────────────────┬───────────────────┤
 * │    Source    │                                  │                   │
 * │    Schema    │      Target Worklist             │  Builder/Editor   │
 * │   (220px)    │      (center, flex-1)            │    (360px)        │
 * │ [collapsible │                                  │                   │
 * │  at 1024px]  │                                  │                   │
 * ├──────────────┴──────────────────────────────────┴───────────────────┤
 * │                    Preview & Diagnostics (full-width)                │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * At 1024px: source column collapses (hidden, expand toggle available).
 * Target Worklist never collapses — it is the primary work queue.
 * Configuration and Version History are overlay drawers, not grid slots.
 */
export function MappingEditorPage({
  projectId,
  mappingId,
  mappingName = 'Untitled Mapping',
  version = 1,
  saveStatus = 'saved',
  deployStatuses = [
    { environment: 'DEV', status: 'not-deployed' },
    { environment: 'QA', status: 'not-deployed' },
    { environment: 'PROD', status: 'not-deployed' },
  ],
  sourceSchemaName = null,
  targetSchemaName = null,
  toolbarContent,
  sourceContent,
  targetWorklistContent,
  builderContent,
  bottomContent,
  onHistoryToggle,
}: MappingEditorPageProps) {
  return (
    <div
      className="flex h-[calc(100vh-7rem)] flex-col overflow-hidden"
      data-testid="mapping-editor-page"
    >
      {/* Top bar */}
      <EditorTopBar
        mappingName={mappingName}
        version={version}
        saveStatus={saveStatus}
        deployStatuses={deployStatuses}
        sourceSchemaName={sourceSchemaName}
        targetSchemaName={targetSchemaName}
        projectId={projectId}
        mappingId={mappingId}
        onHistoryToggle={onHistoryToggle}
      />

      {/* Global Toolbar — full-width strip below top bar */}
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
          {/* Three-column row */}
          <div className="flex min-h-0 flex-1 gap-px bg-slate-800">
            {/* Left column: Source Schema — collapsible at ≤1024px */}
            <div
              className="hidden w-[220px] shrink-0 overflow-auto bg-slate-950 lg:block"
              data-testid="source-panel"
            >
              {sourceContent ?? <PanelPlaceholder name={PLACEHOLDER_LABELS.source} />}
            </div>

            {/* Center column: Target Worklist — primary, never collapses */}
            <div
              className="min-w-0 flex-1 overflow-auto bg-slate-950"
              data-testid="target-worklist"
            >
              {targetWorklistContent ?? (
                <PanelPlaceholder name={PLACEHOLDER_LABELS.targetWorklist} />
              )}
            </div>

            {/* Right column: Builder / Editor */}
            <div
              className="w-[360px] shrink-0 overflow-auto bg-slate-950"
              data-testid="builder-panel"
            >
              {builderContent ?? <PanelPlaceholder name={PLACEHOLDER_LABELS.builder} />}
            </div>
          </div>

          {/* Bottom area: Preview / Diagnostics / Testing — full-width */}
          <div
            className="h-[200px] shrink-0 border-t border-slate-800 bg-slate-950"
            data-testid="bottom-area"
          >
            {bottomContent ?? <PanelPlaceholder name={PLACEHOLDER_LABELS.bottom} />}
          </div>
        </div>
      </PreviewProvider>
    </div>
  );
}
