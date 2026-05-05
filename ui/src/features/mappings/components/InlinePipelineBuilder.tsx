/**
 * InlinePipelineBuilder — compact inline Source + Transform builder for use
 * within conditional branch values and condition left operands (T-03 / AE-06, AE-07).
 *
 * Value mode only — no nested Conditional or Value Map tabs.
 * Reuses SourceChipPicker and TransformPipeline with compact styling.
 */

import { useCallback, useEffect, useState } from 'react';

import { SourceChipPicker } from './SourceChipPicker';
import { TransformPipeline } from './TransformPipeline';
import { generateValueExpression } from '../lib/pipeline-expression-generator';
import type { SourceSelection, TransformStep, ValueModeState } from '../lib/expression-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InlinePipelineBuilderProps {
  /** Current pipeline state */
  readonly state: ValueModeState;
  /** Fires whenever the pipeline state changes */
  readonly onChange: (state: ValueModeState) => void;
  /** Source schema for field picking */
  readonly parsedSourceSchema: ParsedSchema | null;
  /** Optional test-id prefix */
  readonly testIdPrefix?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Compact inline builder for a Source + Transform pipeline.
 * Used within conditional branch values and condition left operands.
 */
export function InlinePipelineBuilder({
  state,
  onChange,
  parsedSourceSchema,
  testIdPrefix = 'inline-pipeline',
}: InlinePipelineBuilderProps) {
  const [localState, setLocalState] = useState<ValueModeState>(state);

  // Sync from parent when state reference changes (e.g. on hydration)
  useEffect(() => {
    setLocalState(state);
  }, [state]);

  const handleSourcesChange = useCallback(
    (sources: SourceSelection[]) => {
      const next: ValueModeState = { ...localState, sources };
      setLocalState(next);
      onChange(next);
    },
    [localState, onChange],
  );

  const handleTransformsChange = useCallback(
    (transforms: TransformStep[]) => {
      const next: ValueModeState = { ...localState, transforms };
      setLocalState(next);
      onChange(next);
    },
    [localState, onChange],
  );

  // Compute source description for the pipeline's auto-wired label
  const sourceDescription: string = (() => {
    if (localState.sources.length === 1) {
      return `source("${localState.sources[0].path}")`;
    }
    if (localState.sources.length > 1) {
      return `${localState.sources.length} sources`;
    }
    return 'source';
  })();

  const previewExpression = generateValueExpression(localState);

  return (
    <div
      className="space-y-2 rounded border border-zinc-700 bg-zinc-900/60 p-2"
      data-testid={testIdPrefix}
    >
      {/* Source picker */}
      <SourceChipPicker
        parsedSourceSchema={parsedSourceSchema}
        selectedSources={localState.sources}
        onSourcesChange={handleSourcesChange}
        staticMode={false}
        onStaticModeChange={() => {}}
      />

      {/* Transform pipeline */}
      <TransformPipeline
        transforms={localState.transforms}
        onTransformsChange={handleTransformsChange}
        sourceDescription={sourceDescription}
      />

      {/* Sub-expression preview */}
      {previewExpression && (
        <div
          className="rounded bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-300 break-all"
          data-testid={`${testIdPrefix}-preview`}
          aria-label="Generated sub-expression"
        >
          {previewExpression}
        </div>
      )}
    </div>
  );
}
