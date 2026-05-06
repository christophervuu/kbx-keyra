/**
 * UnifiedExpressionBuilder — single-form multi-mode expression builder (FS-023).
 *
 * Replaces the old 4-step GuidedBuilder wizard with a unified form that has
 * three modes selectable via a segmented control:
 *   - Value: source field(s) + optional transform pipeline
 *   - Conditional: if/else branching
 *   - Value Map: key-value lookup table
 *
 * T-03: outer shell, mode tabs, Value mode source section, Direct Copy
 * T-04: transform pipeline wired in
 * T-05: Conditional mode (placeholder)
 * T-06: Value Map mode (placeholder)
 * T-07: Live Expression/Result displays wired in
 */

import { useCallback, useEffect, useState } from 'react';

import { ConfirmDialog } from './ConfirmDialog';
import { ConditionalModeBuilder } from './ConditionalModeBuilder';
import { LiveExpressionDisplay } from './LiveExpressionDisplay';
import { LiveResultDisplay } from './LiveResultDisplay';
import { SourceChipPicker } from './SourceChipPicker';
import { TransformPipeline } from './TransformPipeline';
import { ValueMapModeBuilder } from './ValueMapModeBuilder';
import { generateExpressionFromState } from '../lib/pipeline-expression-generator';
import type {
  ConditionalModeState,
  ExpressionBuilderState,
  SourceSelection,
  StaticValue,
  TransformStep,
  ValueMapModeState,
  ValueModeState,
} from '../lib/expression-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnifiedExpressionBuilderProps {
  /** Current expression string (used to pre-populate state on mount) */
  readonly expression: string;
  /** Fires on every expression update as the user edits */
  readonly onExpressionChange: (expr: string) => void;
  /** Fires when the user triggers a direct apply (e.g. Direct Copy) */
  readonly onApply: (targetPath: string, expression: string) => void;
  /** The currently selected target field path */
  readonly selectedTargetPath: string;
  /** Source schema for field picking */
  readonly parsedSourceSchema: ParsedSchema | null;
  /** Optional test data for live result evaluation (T-07) */
  readonly sourceData?: unknown;
  /** Fires when user clicks the live expression to switch to Editor mode (T-07) */
  readonly onSwitchToEditor?: () => void;
  /**
   * Pre-decomposed builder state to hydrate from (T-01).
   * When provided, the component initializes its internal state from this value
   * instead of starting empty. Changing this prop resets the builder state.
   */
  readonly initialState?: ExpressionBuilderState | null;
  readonly className?: string;
}

type ActiveMode = 'value' | 'conditional' | 'valueMap';

const MODE_LABELS: { id: ActiveMode; label: string }[] = [
  { id: 'value', label: 'Value' },
  { id: 'conditional', label: 'Conditional' },
  { id: 'valueMap', label: 'Value Map' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptyValueState(): ValueModeState {
  return { mode: 'value', inputType: 'source', sources: [], transforms: [] };
}

function isStateNonEmpty(state: ExpressionBuilderState): boolean {
  if (state.mode === 'value') {
    return state.sources.length > 0 || state.staticValue !== undefined;
  }
  if (state.mode === 'conditional') {
    return true; // conditional always has some structure
  }
  if (state.mode === 'valueMap') {
    return state.inputSource.length > 0 || state.mappings.length > 0;
  }
  return false;
}

function makeEmptyStateForMode(mode: ActiveMode): ExpressionBuilderState {
  if (mode === 'value') return makeEmptyValueState();
  if (mode === 'conditional') {
    return {
      mode: 'conditional',
      condition: { operator: 'and', conditions: [] },
      thenBranch: { kind: 'static', value: '' },
      elseBranch: { kind: 'static', value: '' },
    };
  }
  return { mode: 'valueMap', inputSource: '', mappings: [], fallback: { kind: 'null' } };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Unified expression builder with mode tabs (Value | Conditional | Value Map).
 */
export function UnifiedExpressionBuilder({
  expression: _expression,
  onExpressionChange,
  onApply: _onApply,
  selectedTargetPath: _selectedTargetPath,
  parsedSourceSchema,
  sourceData,
  onSwitchToEditor,
  initialState,
  className,
}: UnifiedExpressionBuilderProps) {
  const [activeMode, setActiveMode] = useState<ActiveMode>('value');
  const [builderState, setBuilderState] = useState<ExpressionBuilderState>(makeEmptyValueState);
  const [showModeConfirmation, setShowModeConfirmation] = useState(false);
  const [pendingMode, setPendingMode] = useState<ActiveMode | null>(null);
  const [currentExpression, setCurrentExpression] = useState('');

  // Hydrate from initialState when it changes (T-01)
  useEffect(() => {
    if (initialState != null) {
      setBuilderState(initialState);
      setActiveMode(initialState.mode);
    } else {
      setBuilderState(makeEmptyValueState());
      setActiveMode('value');
    }
  }, [initialState]);

  // Sync expression out whenever builderState changes
  useEffect(() => {
    const expr = generateExpressionFromState(builderState);
    setCurrentExpression(expr);
    if (expr) {
      onExpressionChange(expr);
    }
  }, [builderState, onExpressionChange]);

  // -------------------------------------------------------------------------
  // Mode switching
  // -------------------------------------------------------------------------

  const handleModeClick = useCallback(
    (mode: ActiveMode) => {
      if (mode === activeMode) return;
      if (isStateNonEmpty(builderState)) {
        setPendingMode(mode);
        setShowModeConfirmation(true);
      } else {
        setActiveMode(mode);
        setBuilderState(makeEmptyStateForMode(mode));
      }
    },
    [activeMode, builderState],
  );

  const handleModeConfirm = useCallback(() => {
    if (pendingMode) {
      setActiveMode(pendingMode);
      setBuilderState(makeEmptyStateForMode(pendingMode));
    }
    setShowModeConfirmation(false);
    setPendingMode(null);
  }, [pendingMode]);

  const handleModeCancel = useCallback(() => {
    setShowModeConfirmation(false);
    setPendingMode(null);
  }, []);

  // -------------------------------------------------------------------------
  // Value mode: source changes
  // -------------------------------------------------------------------------

  const handleSourcesChange = useCallback(
    (sources: SourceSelection[]) => {
      setBuilderState((prev) => {
        if (prev.mode !== 'value') return prev;
        return { ...prev, sources };
      });
    },
    [],
  );

  const handleStaticModeChange = useCallback(
    (enabled: boolean) => {
      setBuilderState((prev) => {
        if (prev.mode !== 'value') return prev;
        if (enabled) {
          return { ...prev, inputType: 'static', sources: [], staticValue: { type: 'string', value: '' } };
        }
        const { staticValue: _sv, ...rest } = prev;
        return { ...rest, inputType: 'source', sources: [] };
      });
    },
    [],
  );

  const handleStaticValueChange = useCallback(
    (value: StaticValue) => {
      setBuilderState((prev) => {
        if (prev.mode !== 'value') return prev;
        return { ...prev, staticValue: value };
      });
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Value mode: transform changes
  // -------------------------------------------------------------------------

  const handleTransformsChange = useCallback(
    (transforms: TransformStep[]) => {
      setBuilderState((prev) => {
        if (prev.mode !== 'value') return prev;
        return { ...prev, transforms };
      });
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Conditional mode: state changes
  // -------------------------------------------------------------------------

  const handleConditionalStateChange = useCallback(
    (conditionalState: ConditionalModeState) => {
      setBuilderState(conditionalState);
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Value Map mode: state changes
  // -------------------------------------------------------------------------

  const handleValueMapStateChange = useCallback(
    (valueMapState: ValueMapModeState) => {
      setBuilderState(valueMapState);
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const valueModeState = builderState.mode === 'value' ? builderState : null;
  const isStaticMode = valueModeState?.inputType === 'static';

  // Compute source description for the pipeline's auto-wired label
  const sourceDescription: string = (() => {
    if (!valueModeState) return '';
    if (valueModeState.staticValue) {
      const sv = valueModeState.staticValue;
      if (sv.type === 'null') return 'static(null)';
      if (sv.type === 'boolean') return `static(${sv.value})`;
      if (sv.type === 'number') return `static(${sv.value})`;
      return `static("${sv.value}")`;
    }
    if (valueModeState.sources.length === 1) {
      return `source("${valueModeState.sources[0].path}")`;
    }
    if (valueModeState.sources.length > 1) {
      return `${valueModeState.sources.length} sources`;
    }
    return 'source';
  })();

  return (
    <div
      className={['flex flex-col gap-4', className ?? ''].filter(Boolean).join(' ')}
      data-testid="unified-expression-builder"
    >
      {/* Mode segmented control */}
      <div
        role="tablist"
        aria-label="Expression builder mode"
        className="flex rounded-md border border-zinc-700 overflow-hidden w-fit"
        data-testid="expression-builder-mode-tabs"
      >
        {MODE_LABELS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeMode === id}
            onClick={() => { handleModeClick(id); }}
            className={[
              'px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              activeMode === id
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700',
            ].join(' ')}
            data-testid={`mode-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Mode content */}
      {activeMode === 'value' && (
        <div className="space-y-4" data-testid="value-mode-section">
          {/* Source section */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Source</h3>
            <SourceChipPicker
              parsedSourceSchema={parsedSourceSchema}
              selectedSources={valueModeState?.sources ?? []}
              onSourcesChange={handleSourcesChange}
              staticMode={isStaticMode}
              onStaticModeChange={handleStaticModeChange}
              staticValue={valueModeState?.staticValue}
              onStaticValueChange={handleStaticValueChange}
            />
          </div>

          {/* Transform pipeline (T-04) */}
          {!isStaticMode && (
            <TransformPipeline
              transforms={valueModeState?.transforms ?? []}
              onTransformsChange={handleTransformsChange}
              sourceDescription={sourceDescription}
            />
          )}
        </div>
      )}

      {activeMode === 'conditional' && (
        <div data-testid="conditional-mode-section">
          <ConditionalModeBuilder
            state={
              builderState.mode === 'conditional'
                ? builderState
                : {
                    mode: 'conditional',
                    condition: { operator: 'and', conditions: [] },
                    thenBranch: { kind: 'static', value: '' },
                    elseBranch: { kind: 'static', value: '' },
                  }
            }
            onStateChange={handleConditionalStateChange}
            parsedSourceSchema={parsedSourceSchema}
          />
        </div>
      )}

      {activeMode === 'valueMap' && (
        <div data-testid="value-map-mode-section">
          <ValueMapModeBuilder
            state={
              builderState.mode === 'valueMap'
                ? builderState
                : { mode: 'valueMap', inputSource: '', mappings: [], fallback: { kind: 'null' } }
            }
            onStateChange={handleValueMapStateChange}
            parsedSourceSchema={parsedSourceSchema}
          />
        </div>
      )}

      {/* Live Expression / Live Result (T-07) */}
      <LiveExpressionDisplay
        expression={currentExpression}
        onClickToEdit={onSwitchToEditor ?? (() => {})}
        data-testid="live-expression-display"
      />
      <LiveResultDisplay
        expression={currentExpression}
        sourceData={sourceData ?? null}
      />

      {/* Mode switch confirmation dialog */}
      <ConfirmDialog
        open={showModeConfirmation}
        title="Switch builder mode?"
        message="Switching modes will reset the current expression. Continue?"
        confirmLabel="Switch"
        cancelLabel="Cancel"
        onConfirm={handleModeConfirm}
        onCancel={handleModeCancel}
      />
    </div>
  );
}
