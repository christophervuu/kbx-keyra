/**
 * UnifiedExpressionBuilder — single-form multi-mode expression builder (FS-023).
 *
 * Replaces the old 4-step GuidedBuilder wizard with a unified form that has
 * three modes selectable via a segmented control:
 *   - Value: source field(s) + Source Card builder (FS-029)
 *   - Conditional: if/else branching
 *   - Value Map: key-value lookup table
 *
 * T-03: outer shell, mode tabs, Value mode source section, Direct Copy
 * T-04: transform pipeline wired in
 * T-05: Conditional mode (placeholder)
 * T-06: Value Map mode (placeholder)
 * T-07: Live Expression/Result displays wired in
 * T-09 (FS-029): Source Card builder replaces TransformPipeline in Value mode
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { ConfirmDialog } from './ConfirmDialog';
import { ConditionalModeBuilder } from './ConditionalModeBuilder';
import { SourceChipPicker } from './SourceChipPicker';
import { ValueMapModeBuilder } from './ValueMapModeBuilder';
// FS-029 Source Card builder components (T-09)
import { SourceCard } from './SourceCard';
import { ConnectorPrompt } from './ConnectorPrompt';
import { ArgumentForm } from './ArgumentForm';
import { BuilderEntryActions } from './BuilderEntryActions';
import { generateExpressionFromState } from '../lib/pipeline-expression-generator';
import { generateExpressionFromSourceCardState } from '../lib/source-card-expression-generator';
import { decomposeToSourceCardState } from '../lib/source-card-decomposer';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type {
  ConditionalModeState,
  ExpressionBuilderState,
  SourceSelection,
  StaticValue,
  ValueMapModeState,
  ValueModeState,
} from '../lib/expression-builder-state';
// Remove unused InlineTransform import — slots are now accessed via step.args
import type {
  ArgumentSlot,
  SourceCardValueModeState,
} from '../lib/expression-builder-state';
import {
  createDirectCopyState,
  createFunctionCallState,
  createPendingConnectorState,
  createSourceWithTransformState,
  makeSourceSlot,
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
    return true;
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
 * Value mode now uses the FS-029 Source Card builder (T-09).
 */
export function UnifiedExpressionBuilder({
  expression,
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

  // FS-029: Source Card builder state (null = not in SC mode / use legacy pipeline)
  // When non-null, this drives expression generation instead of the legacy generator.
  const [sourceCardState, setSourceCardState] = useState<SourceCardValueModeState | null>(null);

  // Hydrate from initialState when it changes (T-01)
  useEffect(() => {
    if (initialState != null) {
      setBuilderState(initialState);
      setActiveMode(initialState.mode);

      if (initialState.mode === 'value') {
        const sourceCardDecomposition = decomposeToSourceCardState(expression);
        setSourceCardState(sourceCardDecomposition);
      } else {
        setSourceCardState(null);
      }
    } else {
      setBuilderState(makeEmptyValueState());
      setActiveMode('value');
      setSourceCardState(null);
    }
  }, [initialState]);

  // Sync expression out whenever builderState or sourceCardState changes
  useEffect(() => {
    let expr: string;

    if (activeMode === 'value' && sourceCardState !== null) {
      // FS-029 path: generate from Source Card state
      expr = generateExpressionFromSourceCardState(sourceCardState) ?? '';
    } else {
      // Legacy path: generate from pipeline state
      expr = generateExpressionFromState(builderState);
    }

    setCurrentExpression(expr);
    if (expr) {
      onExpressionChange(expr);
    }
  }, [builderState, sourceCardState, activeMode, onExpressionChange]);

  // -------------------------------------------------------------------------
  // Mode switching
  // -------------------------------------------------------------------------

  const handleModeClick = useCallback(
    (mode: ActiveMode) => {
      if (mode === activeMode) return;
      const nonEmpty = isStateNonEmpty(builderState) || sourceCardState !== null;
      if (nonEmpty) {
        setPendingMode(mode);
        setShowModeConfirmation(true);
      } else {
        setActiveMode(mode);
        setBuilderState(makeEmptyStateForMode(mode));
        setSourceCardState(null);
      }
    },
    [activeMode, builderState, sourceCardState],
  );

  const handleModeConfirm = useCallback(() => {
    if (pendingMode) {
      setActiveMode(pendingMode);
      setBuilderState(makeEmptyStateForMode(pendingMode));
      setSourceCardState(null);
    }
    setShowModeConfirmation(false);
    setPendingMode(null);
  }, [pendingMode]);

  const handleModeCancel = useCallback(() => {
    setShowModeConfirmation(false);
    setPendingMode(null);
  }, []);

  // -------------------------------------------------------------------------
  // Value mode: legacy source changes (SourceChipPicker)
  // -------------------------------------------------------------------------

  const handleSourcesChange = useCallback(
    (sources: SourceSelection[]) => {
      setBuilderState((prev) => {
        if (prev.mode !== 'value') return prev;
        return { ...prev, sources };
      });
      // Sync into Source Card state when not in a standalone FunctionCall
      setSourceCardState((prev) => {
        if (prev?.variant === 'functionCall') return prev; // preserve function call
        if (sources.length === 0) return null;
        if (sources.length === 1) return createDirectCopyState(sources[0].path);
        return createPendingConnectorState(sources.map((s) => s.path));
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
      // Static mode uses legacy generator — clear SC state
      if (enabled) setSourceCardState(null);
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
  // FS-029: Source Card state transitions
  // -------------------------------------------------------------------------

  /**
   * Called by BuilderEntryActions when the user selects a source field
   * from the empty-state picker. Transitions to DirectCopy.
   */
  const handleEntrySourceSelected = useCallback((path: string) => {
    const newState = createDirectCopyState(path);
    setSourceCardState(newState);
    // Also sync into legacy sources for SourceChipPicker display
    setBuilderState((prev) => {
      if (prev.mode !== 'value') return prev;
      return { ...prev, sources: [{ path, type: 'string' }] };
    });
  }, []);

  /**
   * Called by BuilderEntryActions when the user selects a function
   * from the empty-state picker. Transitions to FunctionCall.
   */
  const handleEntryFunctionSelected = useCallback((functionName: string) => {
    const newState = createFunctionCallState(functionName, []);
    setSourceCardState(newState);
  }, []);

  /**
   * Called by SourceCard when the user adds/removes a transformation.
   * Receives the new DirectCopyState or SourceWithTransformState.
   */
  const handleSourceCardStateChange = useCallback(
    (newState: import('../lib/expression-builder-state').DirectCopyState | import('../lib/expression-builder-state').SourceWithTransformState) => {
      setSourceCardState(newState);
    },
    [],
  );

  /**
   * Called by SourceCard remove button. Clears the source card state.
   */
  const handleSourceCardRemove = useCallback((path: string) => {
    setSourceCardState((prev) => {
      if (prev === null) return null;
      if (prev.variant === 'directCopy' || prev.variant === 'sourceWithTransform') {
        return null;
      }
      if (prev.variant === 'pendingConnector') {
        const remaining = prev.sourcePaths.filter((p) => p !== path);
        if (remaining.length === 0) return null;
        if (remaining.length === 1) return createDirectCopyState(remaining[0]);
        return createPendingConnectorState(remaining);
      }
      return prev;
    });
    // Sync legacy sources
    setBuilderState((prev) => {
      if (prev.mode !== 'value') return prev;
      const remaining = prev.sources.filter((s) => s.path !== path);
      return { ...prev, sources: remaining };
    });
  }, []);

  /**
   * Called by ConnectorPrompt when the user selects a combining function.
   * Transitions PendingConnector → FunctionCall with sources pre-filled as slots.
   */
  const handleConnectorFunctionSelected = useCallback(
    (functionName: string) => {
      setSourceCardState((prev) => {
        if (prev?.variant !== 'pendingConnector') return prev;
        const slots: ArgumentSlot[] = prev.sourcePaths.map((p) => makeSourceSlot(p));
        return createFunctionCallState(functionName, slots);
      });
    },
    [],
  );

  /**
   * Called by ArgumentForm when slots change in a FunctionCall state.
   */
  const handleFunctionCallSlotsChange = useCallback((slots: ArgumentSlot[]) => {
    setSourceCardState((prev) => {
      if (prev?.variant !== 'functionCall') return prev;
      return createFunctionCallState(prev.node.functionName, slots);
    });
  }, []);

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
  // Derived values
  // -------------------------------------------------------------------------

  const valueModeState = builderState.mode === 'value' ? builderState : null;
  const isStaticMode = valueModeState?.inputType === 'static';
  const sourceOptions = useMemo(
    () => (parsedSourceSchema === null ? [] : flattenSchemaPaths(parsedSourceSchema)),
    [parsedSourceSchema],
  );

  // Compute source description for legacy pipeline label
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

  // Determine what to render in the Source Card builder area
  const scVariant = sourceCardState?.variant ?? null;
  const showBuilderEntryActions = !isStaticMode && scVariant === null && (valueModeState?.sources.length ?? 0) === 0;
  const showSourceCard = !isStaticMode && (scVariant === 'directCopy' || scVariant === 'sourceWithTransform');
  const showPendingConnector = !isStaticMode && scVariant === 'pendingConnector';
  const showFunctionCall = !isStaticMode && scVariant === 'functionCall';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

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

      {/* ── Value mode ── */}
      {activeMode === 'value' && (
        <div className="space-y-4" data-testid="value-mode-section">
          {/* Source section — SourceChipPicker (legacy, preserved for DnD + existing tests) */}
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

          {/* ── FS-029 Source Card builder area ── */}
          {!isStaticMode && (
            <div className="space-y-3" data-testid="source-card-builder">

              {/* Empty state: dual entry actions */}
              {showBuilderEntryActions && (
                <BuilderEntryActions
                  parsedSourceSchema={parsedSourceSchema}
                  onSourceSelected={handleEntrySourceSelected}
                  onFunctionSelected={handleEntryFunctionSelected}
                />
              )}

              {/* Single source card (DirectCopy or SourceWithTransform) */}
              {showSourceCard && (sourceCardState?.variant === 'directCopy' || sourceCardState?.variant === 'sourceWithTransform') && (
                <SourceCard
                  source={sourceCardState.sourcePath}
                  transform={
                    sourceCardState.variant === 'sourceWithTransform'
                      ? sourceCardState.transform
                      : undefined
                  }
                  onStateChange={handleSourceCardStateChange}
                  onRemove={() => { handleSourceCardRemove(sourceCardState.sourcePath); }}
                  renderArgumentForm={({ stepIndex = 0, step, onStepArgsChange }) => {
                    if (!step || !onStepArgsChange) return null;
                    return (
                      <ArgumentForm
                        functionName={step.functionName}
                        slots={step.args as ArgumentSlot[]}
                        parameterOffset={1}
                        sourceOptions={sourceOptions}
                        onSlotsChange={(slots) => {
                          onStepArgsChange(stepIndex, slots);
                        }}
                      />
                    );
                  }}
                />
              )}

              {/* Pending connector: 2+ sources awaiting combining function */}
              {showPendingConnector && sourceCardState?.variant === 'pendingConnector' && (
                <div className="space-y-2" data-testid="pending-connector-area">
                  {sourceCardState.sourcePaths.map((path) => (
                    <SourceCard
                      key={path}
                      source={path}
                      transform={undefined}
                      onStateChange={handleSourceCardStateChange}
                      onRemove={() => { handleSourceCardRemove(path); }}
                      renderArgumentForm={({ stepIndex = 0, step, onStepArgsChange }) => {
                        if (!step || !onStepArgsChange) return null;
                        return (
                          <ArgumentForm
                            functionName={step.functionName}
                            slots={step.args as ArgumentSlot[]}
                            parameterOffset={1}
                            sourceOptions={sourceOptions}
                            onSlotsChange={(slots) => {
                              onStepArgsChange(stepIndex, slots);
                            }}
                          />
                        );
                      }}
                    />
                  ))}
                  <ConnectorPrompt
                    sources={sourceCardState.sourcePaths as string[]}
                    onFunctionSelected={handleConnectorFunctionSelected}
                  />
                </div>
              )}

              {/* Function call: standalone ArgumentForm */}
              {showFunctionCall && sourceCardState?.variant === 'functionCall' && (
                <div data-testid="function-call-area">
                  <ArgumentForm
                    functionName={sourceCardState.node.functionName}
                    slots={sourceCardState.node.slots as ArgumentSlot[]}
                    sourceOptions={sourceOptions}
                    onSlotsChange={handleFunctionCallSlotsChange}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Conditional mode ── */}
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

      {/* ── Value Map mode ── */}
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
