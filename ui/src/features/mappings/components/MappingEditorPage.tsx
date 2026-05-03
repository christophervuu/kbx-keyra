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
  /** Content for Panel 3 (Rule List) slot — accepts children from T-03+ */
  ruleListContent?: ReactNode;
  /** Content for Panel 1 (Source Schema) slot */
  panelOneContent?: ReactNode;
  /** Content for Panel 4 (Expression Builder) slot */
  expressionBuilderContent?: ReactNode;
  /** Content for Panel 5 (Preview) slot */
  previewContent?: ReactNode;
  /** Content for Panel 7 (Configuration) slot */
  configPanelContent?: ReactNode;
}

// ---------------------------------------------------------------------------
// Panel configuration
// ---------------------------------------------------------------------------

const PANEL_NAMES = {
  1: 'Source Schema (Panel 1)',
  2: 'Target Schema (Panel 2)',
  3: 'Rule List (Panel 3)',
  4: 'Expression Builder (Panel 4)',
  5: 'Preview (Panel 5)',
  6: 'Diagnostics (Panel 6)',
  7: 'Configuration (Panel 7)',
  8: 'History (Panel 8)',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Full Mapping Editor page shell with multi-panel layout.
 *
 * Layout at 1280px+:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                        EditorTopBar                              │
 * ├──────────┬─────────────────────────────────┬────────────────────┤
 * │ Panel 1  │                                 │     Panel 4        │
 * │ (Source) │         Panel 3                 │ (Expr Builder)     │
 * ├──────────┤       (Rule List)               ├────────────────────┤
 * │ Panel 2  │                                 │     Panel 5        │
 * │ (Target) │                                 │   (Preview)        │
 * ├──────────┴──────────────┬──────────────────┴────────────────────┤
 * │     Panel 6             │    Panel 7       │     Panel 8        │
 * │   (Diagnostics)         │ (Configuration)  │    (History)       │
 * └─────────────────────────┴──────────────────┴────────────────────┘
 *
 * At 1024px, columns compress proportionally.
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
  ruleListContent,
  panelOneContent,
  expressionBuilderContent,
  previewContent,
  configPanelContent,
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
      />

      {/* Panel grid — wrapped in PreviewProvider so all panels share preview state */}
      <PreviewProvider>
      <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr_240px] grid-rows-[1fr_1fr_180px] gap-px bg-slate-800 lg:grid-cols-[220px_1fr_280px]">
        {/* Panel 1: Source Schema — top-left */}
        <div className="row-span-1 bg-slate-950 p-1" data-testid="panel-slot-1">
          {panelOneContent ?? <PanelPlaceholder name={PANEL_NAMES[1]} />}
        </div>

        {/* Panel 3: Rule List — center, spans 2 rows */}
        <div className="row-span-2 overflow-auto bg-slate-950 p-1" data-testid="panel-slot-3">
          {ruleListContent ?? <PanelPlaceholder name={PANEL_NAMES[3]} />}
        </div>

        {/* Panel 4: Expression Builder — top-right */}
        <div className="row-span-1 overflow-hidden bg-slate-950 p-1" data-testid="panel-slot-4">
          {expressionBuilderContent ?? <PanelPlaceholder name={PANEL_NAMES[4]} />}
        </div>

        {/* Panel 2: Target Schema — middle-left */}
        <div className="row-span-1 bg-slate-950 p-1" data-testid="panel-slot-2">
          <PanelPlaceholder name={PANEL_NAMES[2]} />
        </div>

        {/* Panel 5: Preview — middle-right */}
        <div className="row-span-1 overflow-hidden bg-slate-950 p-1" data-testid="panel-slot-5">
          {previewContent ?? <PanelPlaceholder name={PANEL_NAMES[5]} />}
        </div>

        {/* Bottom row: Diagnostics, Configuration, History — spans full width (3 columns) */}
        <div className="bg-slate-950 p-1" data-testid="panel-slot-6">
          <PanelPlaceholder name={PANEL_NAMES[6]} />
        </div>

        <div className="bg-slate-950 p-1" data-testid="panel-slot-7">
          {configPanelContent ?? <PanelPlaceholder name={PANEL_NAMES[7]} />}
        </div>

        <div className="bg-slate-950 p-1" data-testid="panel-slot-8">
          <PanelPlaceholder name={PANEL_NAMES[8]} />
        </div>
      </div>
      </PreviewProvider>
    </div>
  );
}
