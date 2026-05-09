/**
 * ArgumentSlotInput — renders a single argument slot for the FS-029
 * Source Card expression builder (T-03).
 *
 * Each slot supports three modes:
 *   - 'source'  — a source field path with an optional inline nested transform
 *   - 'literal' — a freeform text/number input (or dropdown when hints exist)
 *   - (dropdown is a variant of literal mode driven by PARAMETER_HINTS)
 *
 * The slot is self-contained: it owns its mode toggle and emits the full
 * updated ArgumentSlot on every change via `onSlotChange`.
 *
 * Nested transforms (AE-07): when in source mode, a mini [+ Transform] action
 * lets the user wrap the source in a function (e.g. upper(source("x"))).
 * This produces an InlineTransform on the slot's source variant.
 */

import { Plus, X, Zap } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { ConditionRowEditor } from './ConditionRowEditor';
import { TransformFunctionPicker } from './TransformFunctionPicker';
import type { SchemaPathEntry } from '../lib/autocomplete-utils';
import type {
  ArgumentSlot,
  ComparisonOperator,
  ConditionRow,
  InlineTransform,
  Operand,
} from '../lib/expression-builder-state';
import {
  makeExpressionSlot,
  makeSourceSlot,
  makeSourceSlotWithTransform,
  makeLiteralSlot,
  makeSingleStepTransform,
} from '../lib/expression-builder-state';

import type { FunctionCatalogParameter } from '@/lib/data/dsl-functions';
import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import { getParameterHint } from '@/lib/data/parameter-hints';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Hint configuration for a parameter slot.
 * When provided, the slot renders a dropdown instead of a freeform text input.
 */
export interface SlotHint {
  /** Ordered list of suggested values shown in the dropdown. */
  readonly options: readonly string[];
  /** Whether the user can also type a freeform value (true = combobox, false = strict select). */
  readonly allowFreeform?: boolean;
}

export interface ArgumentSlotInputProps {
  /** Zero-based index of this slot within the parent ArgumentForm. */
  readonly slotIndex: number;
  /** The current slot value. */
  readonly slot: ArgumentSlot;
  /** Catalog parameter definition for this slot (provides name, type, required). */
  readonly parameter: FunctionCatalogParameter;
  /** User-facing parameter label shown in slot header. */
  readonly displayName?: string;
  /** Optional helper text that explains what this parameter means. */
  readonly description?: string;
  /** Optional hint config — when present, renders a dropdown. */
  readonly hint?: SlotHint;
  /** Optional source field options used by source-mode searchable picker. */
  readonly sourceOptions?: readonly SchemaPathEntry[];
  /** Fires when the slot value changes. */
  readonly onSlotChange: (updated: ArgumentSlot) => void;
  /** Optional: fires when this slot should be removed (variadic slots only). */
  readonly onRemove?: () => void;
  /** Example text shown as placeholder (from catalog entry.example). */
  readonly exampleHint?: string;
  /** Optional prefix for deterministic nested test IDs. */
  readonly testIdPrefix?: string;
}

type SlotMode = 'source' | 'literal' | 'expression';

const FILTER_BINARY_OPERATORS = new Set<ComparisonOperator>([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
]);

function isFilterConditionFunction(functionName: string): boolean {
  return functionName === 'filter' || functionName === 'find';
}

function makeDefaultArrayConditionSlot(): ArgumentSlot {
  return makeExpressionSlot({
    functionName: 'eq',
    slots: [
      makeExpressionSlot({
        functionName: 'item',
        slots: [makeLiteralSlot('')],
      }),
      makeLiteralSlot(''),
    ],
  });
}

function parseOperandFromFilterSlot(slot: ArgumentSlot): Operand | null {
  if (slot.mode === 'source') {
    return { kind: 'source', value: slot.path };
  }
  if (slot.mode === 'literal') {
    return { kind: 'static', value: slot.value };
  }
  if (slot.node.functionName === 'item') {
    const pathSlot = slot.node.slots[0];
    if (!pathSlot) return { kind: 'source', value: '' };
    if (pathSlot.mode === 'literal') return { kind: 'source', value: pathSlot.value };
    if (pathSlot.mode === 'source') return { kind: 'source', value: pathSlot.path };
    return null;
  }
  return null;
}

function makeFilterOperandSlot(operand: Operand): ArgumentSlot {
  if (operand.kind === 'source') {
    return makeExpressionSlot({
      functionName: 'item',
      slots: [makeLiteralSlot(operand.value)],
    });
  }
  return makeLiteralSlot(operand.value);
}

function parseFilterConditionSlotToRow(slot: ArgumentSlot): ConditionRow | null {
  if (slot.mode !== 'expression') {
    const leftOperand = parseOperandFromFilterSlot(slot);
    if (!leftOperand) return null;
    return {
      leftOperand,
      comparison: 'isTruthy',
      rightOperand: { kind: 'static', value: '' },
    };
  }

  const { functionName, slots } = slot.node;
  if (FILTER_BINARY_OPERATORS.has(functionName as ComparisonOperator)) {
    const leftOperand = parseOperandFromFilterSlot(slots[0] ?? makeLiteralSlot(''));
    const rightOperand = parseOperandFromFilterSlot(slots[1] ?? makeLiteralSlot(''));
    if (!leftOperand || !rightOperand) return null;
    return {
      leftOperand,
      comparison: functionName as ComparisonOperator,
      rightOperand,
    };
  }

  if (functionName === 'isNull') {
    const leftOperand = parseOperandFromFilterSlot(slots[0] ?? makeLiteralSlot(''));
    if (!leftOperand) return null;
    return {
      leftOperand,
      comparison: 'isNull',
      rightOperand: { kind: 'static', value: '' },
    };
  }

  if (functionName === 'not') {
    const inner = slots[0];
    if (!inner || inner.mode !== 'expression') return null;
    if (inner.node.functionName === 'isNull') {
      const leftOperand = parseOperandFromFilterSlot(inner.node.slots[0] ?? makeLiteralSlot(''));
      if (!leftOperand) return null;
      return {
        leftOperand,
        comparison: 'isNotNull',
        rightOperand: { kind: 'static', value: '' },
      };
    }
    const leftOperand = parseOperandFromFilterSlot(inner);
    if (!leftOperand) return null;
    return {
      leftOperand,
      comparison: 'isFalsy',
      rightOperand: { kind: 'static', value: '' },
    };
  }

  const leftOperand = parseOperandFromFilterSlot(slot);
  if (!leftOperand) return null;
  return {
    leftOperand,
    comparison: 'isTruthy',
    rightOperand: { kind: 'static', value: '' },
  };
}

function buildFilterConditionSlot(row: ConditionRow): ArgumentSlot {
  const left = makeFilterOperandSlot(row.leftOperand);

  if (FILTER_BINARY_OPERATORS.has(row.comparison)) {
    const right = makeFilterOperandSlot(row.rightOperand);
    return makeExpressionSlot({
      functionName: row.comparison,
      slots: [left, right],
    });
  }

  if (row.comparison === 'isNull') {
    return makeExpressionSlot({
      functionName: 'isNull',
      slots: [left],
    });
  }

  if (row.comparison === 'isNotNull') {
    return makeExpressionSlot({
      functionName: 'not',
      slots: [
        makeExpressionSlot({
          functionName: 'isNull',
          slots: [left],
        }),
      ],
    });
  }

  if (row.comparison === 'isFalsy') {
    return makeExpressionSlot({
      functionName: 'not',
      slots: [left],
    });
  }

  return left;
}

function buildArrayItemFieldOptions(
  arrayPath: string,
  sourceOptions?: readonly SchemaPathEntry[],
): SchemaPathEntry[] {
  if (!sourceOptions || sourceOptions.length === 0) return [];

  if (arrayPath !== '') {
    const prefix = `${arrayPath}.`;
    const nested = sourceOptions
      .filter((opt) => opt.path.startsWith(prefix))
      .map((opt) => ({
        path: opt.path.slice(prefix.length),
        type: opt.type,
      }))
      .filter((opt) => opt.path !== '');

    if (nested.length > 0) return nested;
  }

  return sourceOptions.map((opt) => ({ path: opt.path, type: opt.type }));
}

function buildDefaultSlotForParameter(
  functionName: string,
  param: FunctionCatalogParameter,
): ArgumentSlot {
  const hint = getParameterHint(functionName, param.name);
  if (hint?.type === 'enum') {
    return makeLiteralSlot(hint.options[0] ?? '');
  }
  if (hint?.type === 'tokens') {
    const preset = hint.presets[0] ?? hint.tokens[0] ?? '';
    return makeLiteralSlot(preset);
  }
  if (isFilterConditionFunction(functionName) && param.name === 'condition') {
    return makeDefaultArrayConditionSlot();
  }
  if (param.type === 'string' || param.type === 'number') {
    return makeLiteralSlot('');
  }
  return makeSourceSlot('');
}

function buildDefaultFunctionSlots(functionName: string): ArgumentSlot[] {
  const entry = DSL_FUNCTION_CATALOG.find((fn) => fn.name === functionName);
  if (!entry) return [];

  const requiredParams = entry.parameters.filter((p) => p.required && !p.variadic);
  return requiredParams.map((param) => buildDefaultSlotForParameter(functionName, param));
}

function buildDefaultTransformArgs(functionName: string): ArgumentSlot[] {
  const entry = DSL_FUNCTION_CATALOG.find((fn) => fn.name === functionName);
  if (!entry || entry.parameters.length <= 1) return [];

  return entry.parameters.slice(1).map((param) => buildDefaultSlotForParameter(functionName, param));
}

function resolveTransformParameter(functionName: string, index: number): FunctionCatalogParameter | undefined {
  const entry = DSL_FUNCTION_CATALOG.find((fn) => fn.name === functionName);
  if (!entry) return undefined;
  return entry.parameters[index + 1];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A single argument slot in the ArgumentForm.
 * Supports source mode (with optional nested transform) and literal mode
 * (freeform text or dropdown when hints are available).
 */
export function ArgumentSlotInput({
  slotIndex,
  slot,
  parameter,
  displayName,
  description,
  hint,
  sourceOptions,
  onSlotChange,
  onRemove,
  exampleHint,
  testIdPrefix = 'argument-slot-input',
}: ArgumentSlotInputProps) {
  const effectiveName = displayName ?? parameter.name;

  // Derive current mode from slot
  const currentMode: SlotMode = slot.mode;

  // Local source path state (for source mode)
  const [sourcePath, setSourcePath] = useState<string>(() =>
    slot.mode === 'source' ? slot.path : '',
  );

  // Local literal value state (for literal mode)
  const [literalValue, setLiteralValue] = useState<string>(() =>
    slot.mode === 'literal' ? slot.value : '',
  );

  // Nested transform picker state
  const [transformPickerOpen, setTransformPickerOpen] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [expressionPickerOpen, setExpressionPickerOpen] = useState(false);
  const transformBtnRef = useRef<HTMLButtonElement>(null);
  const expressionBtnRef = useRef<HTMLButtonElement>(null);

  // Current inline transform (only relevant in source mode)
  const currentTransform: InlineTransform | undefined =
    slot.mode === 'source' ? slot.transform : undefined;

  // -------------------------------------------------------------------------
  // Mode toggle
  // -------------------------------------------------------------------------

  const handleModeChange = useCallback(
    (newMode: SlotMode) => {
      if (newMode === 'source') {
        onSlotChange(makeSourceSlot(sourcePath));
      } else if (newMode === 'literal') {
        onSlotChange(makeLiteralSlot(literalValue));
      } else {
        setExpressionPickerOpen(true);
      }
    },
    [sourcePath, literalValue, onSlotChange],
  );

  // -------------------------------------------------------------------------
  // Source mode handlers
  // -------------------------------------------------------------------------

  const handleSourcePathChange = useCallback(
    (path: string) => {
      setSourcePath(path);
      if (currentTransform !== undefined) {
        onSlotChange(makeSourceSlotWithTransform(path, currentTransform));
      } else {
        onSlotChange(makeSourceSlot(path));
      }
    },
    [currentTransform, onSlotChange],
  );

  const handleTransformSelect = useCallback(
    (functionName: string) => {
      setTransformPickerOpen(false);
      const newTransform = makeSingleStepTransform(
        functionName,
        buildDefaultTransformArgs(functionName),
      );
      onSlotChange(makeSourceSlotWithTransform(sourcePath, newTransform));
    },
    [sourcePath, onSlotChange],
  );

  const handleRemoveTransform = useCallback(() => {
    onSlotChange(makeSourceSlot(sourcePath));
    setTimeout(() => { transformBtnRef.current?.focus(); }, 0);
  }, [sourcePath, onSlotChange]);

  const handleTransformPickerClose = useCallback(() => {
    setTransformPickerOpen(false);
    setTimeout(() => { transformBtnRef.current?.focus(); }, 0);
  }, []);

  const handleExpressionFunctionSelect = useCallback(
    (functionName: string) => {
      setExpressionPickerOpen(false);
      const node = {
        functionName,
        slots: buildDefaultFunctionSlots(functionName),
      };
      onSlotChange(makeExpressionSlot(node));
    },
    [onSlotChange],
  );

  const handleExpressionPickerClose = useCallback(() => {
    setExpressionPickerOpen(false);
    setTimeout(() => { expressionBtnRef.current?.focus(); }, 0);
  }, []);

  // -------------------------------------------------------------------------
  // Literal mode handlers
  // -------------------------------------------------------------------------

  const handleLiteralChange = useCallback(
    (value: string) => {
      setLiteralValue(value);
      onSlotChange(makeLiteralSlot(value));
    },
    [onSlotChange],
  );

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const isEmpty =
    (currentMode === 'source' && sourcePath === '') ||
    (currentMode === 'literal' && literalValue === '');
  const showValidationWarning = parameter.required && isEmpty;

  const slotTestId = `${testIdPrefix}-${slotIndex}`;
  const filteredSourceOptions = (sourceOptions ?? []).filter((opt) => {
    const q = sourcePath.toLowerCase();
    return q === '' || opt.path.toLowerCase().includes(q);
  });

  return (
    <div
      className={[
        'rounded-md border p-3 space-y-2',
        showValidationWarning ? 'border-amber-700/60 bg-amber-950/20' : 'border-zinc-700 bg-zinc-800/40',
      ].join(' ')}
      data-testid={slotTestId}
    >
      {/* Header: parameter name + type badge + optional remove */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-semibold text-zinc-200"
          data-testid={`${slotTestId}-param-name`}
        >
          {effectiveName}
        </span>
        <span
          className="text-xs font-mono text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-700/60"
          data-testid={`${slotTestId}-type-badge`}
        >
          {parameter.type}
        </span>
        {parameter.required && (
          <span className="text-xs text-amber-400" aria-label="required" data-testid={`${slotTestId}-required`}>
            *
          </span>
        )}
        {!parameter.required && (
          <span className="text-xs text-zinc-600" data-testid={`${slotTestId}-optional`}>
            optional
          </span>
        )}
        {showValidationWarning && (
          <span
            className="text-xs text-amber-400 ml-auto"
            role="alert"
            aria-live="polite"
            data-testid={`${slotTestId}-validation-warning`}
          >
            Required
          </span>
        )}
        {onRemove !== undefined && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove argument ${parameter.name}`}
            className="ml-auto text-zinc-500 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded p-0.5"
            data-testid={`${slotTestId}-remove`}
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {description !== undefined && description !== '' && (
        <p
          className="text-[11px] text-zinc-400"
          data-testid={`${slotTestId}-param-description`}
        >
          {description}
        </p>
      )}

      {/* Mode toggle: Source | Literal */}
      <div
        role="group"
        aria-label={`Input mode for ${effectiveName}`}
        className="inline-flex rounded border border-zinc-700 overflow-hidden text-xs"
        data-testid={`${slotTestId}-mode-toggle`}
      >
        {(['source', 'literal', 'expression'] as SlotMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={currentMode === m}
            onClick={() => { handleModeChange(m); }}
            className={[
              'px-2.5 py-1 font-medium capitalize transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              currentMode === m
                ? 'bg-blue-700 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
            ].join(' ')}
            data-testid={`${slotTestId}-mode-${m}`}
          >
            {m}
          </button>
        ))}
      </div>

      {expressionPickerOpen && currentMode !== 'expression' && (
        <div className="relative z-30" data-testid={`${slotTestId}-expression-picker`}>
          <TransformFunctionPicker
            includeSourceAccess
            onSelect={handleExpressionFunctionSelect}
            onClose={handleExpressionPickerClose}
          />
        </div>
      )}

      {/* Source mode content */}
      {currentMode === 'source' && (
        <div className="space-y-2">
          {/* Source path input */}
          <div className="relative">
            <input
              type="text"
              value={sourcePath}
              onChange={(e) => {
                handleSourcePathChange(e.target.value);
                setSourcePickerOpen(true);
              }}
              onFocus={() => { setSourcePickerOpen(true); }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSourcePickerOpen(false);
                if (e.key === 'ArrowDown') setSourcePickerOpen(true);
              }}
              placeholder={exampleHint ?? 'Field path…'}
              aria-label={`${effectiveName} source field path`}
              aria-expanded={sourcePickerOpen && (sourceOptions?.length ?? 0) > 0}
              aria-controls={`${slotTestId}-source-options`}
              role="combobox"
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
              data-testid={`${slotTestId}-source-input`}
            />

            {sourcePickerOpen && (sourceOptions?.length ?? 0) > 0 && (
              <div
                id={`${slotTestId}-source-options`}
                role="listbox"
                className="absolute left-0 right-0 top-full mt-1 z-30 max-h-44 overflow-y-auto rounded border border-zinc-600 bg-zinc-900 p-1 shadow-xl"
                data-testid={`${slotTestId}-source-suggestions`}
              >
                {filteredSourceOptions.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-zinc-500 italic" data-testid={`${slotTestId}-source-empty`}>
                    No matching fields
                  </p>
                ) : (
                  filteredSourceOptions.slice(0, 50).map((opt) => (
                    <button
                      key={opt.path}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => {
                        handleSourcePathChange(opt.path);
                        setSourcePickerOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none"
                      data-testid={`${slotTestId}-source-option-${opt.path}`}
                    >
                      <span className="truncate font-mono text-zinc-100">{opt.path}</span>
                      <span className="ml-auto shrink-0 text-zinc-500">{opt.type}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Inline transform display + controls */}
          {currentTransform !== undefined ? (
            <div
              className="space-y-2 rounded bg-amber-900/30 border border-amber-800/60 px-2 py-1.5"
              data-testid={`${slotTestId}-transform-display`}
            >
              {(() => {
                // Nested slot transforms are always single-step chains.
                const step = currentTransform.steps[0];
                if (!step) return null;
                const stepFunctionName = step.functionName;
                const stepArgs = step.args;
                return (
                  <>
                    <div className="flex items-center gap-2">
                      <Zap className="h-3 w-3 text-amber-400 shrink-0" aria-hidden="true" />
                      <span className="text-xs font-mono text-amber-300 flex-1">
                        {stepFunctionName}(…)
                      </span>
                      <button
                        type="button"
                        onClick={handleRemoveTransform}
                        aria-label={`Remove ${stepFunctionName} transform from ${effectiveName}`}
                        className="text-zinc-500 hover:text-zinc-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded p-0.5"
                        data-testid={`${slotTestId}-remove-transform`}
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>

                    {stepArgs.map((arg, index) => {
                      const param = resolveTransformParameter(stepFunctionName, index);
                      const argTestIdBase = `${slotTestId}-transform-arg-${index}`;
                      const fallbackParam: FunctionCatalogParameter = {
                        name: `arg${index + 2}`,
                        type: 'any',
                        required: false,
                      };
                      const effectiveParam = param ?? fallbackParam;
                      const isFilterConditionArg =
                        isFilterConditionFunction(stepFunctionName) &&
                        effectiveParam.name === 'condition';
                      const parsedFilterCondition = isFilterConditionArg
                        ? parseFilterConditionSlotToRow(arg)
                        : null;

                      const nestedHint = (() => {
                        const hintCfg = getParameterHint(stepFunctionName, effectiveParam.name);
                        if (!hintCfg) return undefined;
                        if (hintCfg.type === 'enum') {
                          return { options: hintCfg.options, allowFreeform: false };
                        }
                        if (hintCfg.type === 'tokens') {
                          return {
                            options: hintCfg.presets,
                            allowFreeform: hintCfg.allowFreeform ?? true,
                          };
                        }
                        return undefined;
                      })();

                      return (
                        <div key={index} className="space-y-1" data-testid={argTestIdBase}>
                          {isFilterConditionArg && parsedFilterCondition !== null ? (
                            <ConditionRowEditor
                              condition={parsedFilterCondition}
                              onChange={(updated) => {
                                if (currentTransform === undefined || currentMode !== 'source') return;
                                const nextArgs = stepArgs.map((currentArg, i) =>
                                  i === index ? buildFilterConditionSlot(updated) : currentArg,
                                );
                                onSlotChange(
                                  makeSourceSlotWithTransform(sourcePath, {
                                    steps: [{ functionName: stepFunctionName, args: nextArgs }],
                                  }),
                                );
                              }}
                              parsedSourceSchema={null}
                              sourceFieldOptions={buildArrayItemFieldOptions(sourcePath, sourceOptions)}
                              allowPipelineOperands={false}
                              rowIndex={index}
                            />
                          ) : (
                            <ArgumentSlotInput
                              slotIndex={index}
                              slot={arg}
                              parameter={effectiveParam}
                              hint={nestedHint}
                              sourceOptions={sourceOptions}
                              onSlotChange={(updated) => {
                                if (currentTransform === undefined || currentMode !== 'source') return;
                                const nextArgs = stepArgs.map((currentArg, i) =>
                                  i === index ? updated : currentArg,
                                );
                                onSlotChange(
                                  makeSourceSlotWithTransform(sourcePath, {
                                    steps: [{ functionName: stepFunctionName, args: nextArgs }],
                                  }),
                                );
                              }}
                              exampleHint={exampleHint}
                              testIdPrefix={`${slotTestId}-transform-arg`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          ) : (
            /* Add nested transform button */
            <div className="relative">
              <button
                ref={transformBtnRef}
                type="button"
                onClick={() => { setTransformPickerOpen((v) => !v); }}
                aria-expanded={transformPickerOpen}
                aria-haspopup="listbox"
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded px-1.5 py-0.5 border border-dashed border-zinc-700 hover:border-zinc-500 transition-colors"
                data-testid={`${slotTestId}-add-transform`}
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                Transform
              </button>

              {transformPickerOpen && (
                <div
                  className="absolute left-0 top-full mt-1 z-30"
                  data-testid={`${slotTestId}-transform-picker`}
                >
                  <TransformFunctionPicker
                    onSelect={handleTransformSelect}
                    onClose={handleTransformPickerClose}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expression mode content */}
      {currentMode === 'expression' && slot.mode === 'expression' && (
        <div className="space-y-2" data-testid={`${slotTestId}-expression-content`}>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-mono text-blue-300"
              data-testid={`${slotTestId}-expr-function-name`}
            >
              {slot.node.functionName}
            </span>
            <button
              ref={expressionBtnRef}
              type="button"
              onClick={() => { setExpressionPickerOpen((v) => !v); }}
              aria-expanded={expressionPickerOpen}
              className="text-xs text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded px-1.5 py-0.5 border border-dashed border-zinc-700 hover:border-zinc-500"
              data-testid={`${slotTestId}-expr-change-function`}
            >
              Change function
            </button>
          </div>

          {expressionPickerOpen && (
            <div data-testid={`${slotTestId}-expression-picker`} className="relative z-30">
              <TransformFunctionPicker
                includeSourceAccess
                onSelect={handleExpressionFunctionSelect}
                onClose={handleExpressionPickerClose}
              />
            </div>
          )}

          <div className="space-y-2" data-testid={`${slotTestId}-expr-slots`}>
            {slot.node.slots.map((exprSlot, index) => {
              const fn = DSL_FUNCTION_CATALOG.find((e) => e.name === slot.node.functionName);
              const param = fn?.parameters[index] ?? {
                name: `arg${index + 1}`,
                type: 'any',
                required: false,
              };
              return (
                <ArgumentSlotInput
                  key={index}
                  slotIndex={index}
                  slot={exprSlot}
                  parameter={param}
                  sourceOptions={sourceOptions}
                  onSlotChange={(updated) => {
                    const nextSlots = slot.node.slots.map((s, i) => (i === index ? updated : s));
                    onSlotChange(makeExpressionSlot({ ...slot.node, slots: nextSlots }));
                  }}
                  exampleHint={exampleHint}
                  testIdPrefix={`${slotTestId}-expr-slot`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Literal mode content */}
      {currentMode === 'literal' && (
        <div data-testid={`${slotTestId}-literal-content`}>
          {/* Dropdown mode (when hints are provided) */}
          {hint !== undefined && hint.options.length > 0 ? (
            <div className="space-y-2">
              <select
                value={hint.options.includes(literalValue) ? literalValue : ''}
                onChange={(e) => { handleLiteralChange(e.target.value); }}
                aria-label={`${effectiveName} suggestions`}
                className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                data-testid={`${slotTestId}-dropdown`}
              >
                <option value="" disabled>
                  Select {effectiveName}…
                </option>
                {hint.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>

              {(hint.allowFreeform ?? false) && (
                <input
                  type="text"
                  value={literalValue}
                  onChange={(e) => { handleLiteralChange(e.target.value); }}
                  placeholder={`Or type ${effectiveName.toLowerCase()}…`}
                  aria-label={`${effectiveName} custom value`}
                  className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
                  data-testid={`${slotTestId}-literal-input`}
                />
              )}
            </div>
          ) : (
            /* Freeform text input */
            <input
              type="text"
              value={literalValue}
              onChange={(e) => { handleLiteralChange(e.target.value); }}
              placeholder={exampleHint ?? `${parameter.type} value…`}
              aria-label={`${effectiveName} value`}
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
              data-testid={`${slotTestId}-literal-input`}
            />
          )}
        </div>
      )}
    </div>
  );
}
