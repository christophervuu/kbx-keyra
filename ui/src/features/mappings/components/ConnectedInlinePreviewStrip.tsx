import { useCallback, useState } from 'react';

import { InlinePreviewStrip } from './InlinePreviewStrip';
import { usePreviewExecution } from '../hooks/use-preview-execution';
import { useTestCases } from '../hooks/use-test-cases';

import type { MappingConfig, SchemaDetail } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectedInlinePreviewStripProps {
  /** Current mapping config with live rules. Null while loading. */
  config: MappingConfig | null;
  /** Source schema detail for engine execution. Null while loading. */
  sourceSchemaDetail: SchemaDetail | null;
  /** Target schema detail for engine execution. Null while loading. */
  targetSchemaDetail: SchemaDetail | null;
  /** Project ID — used to build the testing page URL */
  projectId: string;
  /** Mapping ID — used to build the testing page URL */
  mappingId: string;
  /**
   * Incremented each time a rule is applied (from useMappingEditor).
   * Triggers auto-preview when autoPreview is on and sourceData is non-empty.
   */
  lastApplyTimestamp: number | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ConnectedInlinePreviewStrip — wires `usePreviewExecution` (which requires
 * `<PreviewProvider>`) to `InlinePreviewStrip`.
 *
 * Must be rendered inside `<PreviewProvider>` (i.e. inside `MappingEditorPage`).
 * `MappingEditor.tsx` passes only the props that are available above the
 * provider boundary; all execution state is owned here.
 */
export function ConnectedInlinePreviewStrip({
  config,
  sourceSchemaDetail,
  targetSchemaDetail,
  projectId,
  mappingId,
  lastApplyTimestamp,
}: ConnectedInlinePreviewStripProps) {
  const [sourceData, setSourceData] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const { testCases, loadTestCase } = useTestCases(mappingId);

  const handleLoadTestCase = useCallback(
    (id: string) => {
      const tc = loadTestCase(id);
      if (tc) setSourceData(tc.sourceData);
    },
    [loadTestCase],
  );

  const { state, run } = usePreviewExecution({
    config,
    sourceSchemaDetail,
    targetSchemaDetail,
    sourceDataRaw: sourceData.trim() ? sourceData : null,
  });

  const output = state.status === 'success' ? state.result.output : null;
  const status =
    state.status === 'success'
      ? {
          errors: state.result.diagnostics.filter((d) => d.severity === 'error').length,
          warnings: state.result.diagnostics.filter((d) => d.severity === 'warning').length,
        }
      : null;

  return (
    <InlinePreviewStrip
      sourceData={sourceData}
      onSourceDataChange={setSourceData}
      onRun={run}
      output={output}
      isRunning={state.status === 'executing'}
      status={status}
      testingPageUrl={`/projects/${projectId}/mappings/${mappingId}/test`}
      isCollapsed={isCollapsed}
      onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
      lastApplyTimestamp={lastApplyTimestamp}
      testCases={testCases}
      onLoadTestCase={handleLoadTestCase}
    />
  );
}
