import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ComplexExpressionWarning } from './ComplexExpressionWarning';
import { InputTray } from './InputTray';
import type { StagedInputField } from './SourceSchemaPanel';
import { findSmartBuilderActionById, getSmartBuilderActionParameters } from '../lib/smart-builder-action-catalog';
import {
  resolveChangeLogicOptionsFromDraft,
  resolveSmartBuilderActions,
  resolveSmartBuilderActionsFromDraft,
} from '../lib/smart-builder-action-resolver';
import {
  getAllowedConditionOperatorsForLeftType,
  getBuilderInputUsages,
  getConditionCompatibilityIssues,
  resolveBuilderArgumentValueType,
} from '../lib/smart-builder-state';
import type {
  BuilderArgumentValue,
  BuilderComposition,
  BuilderInput,
  BuilderInputTransform,
  BuilderPredicate,
  BuilderProjectValueMapSelection,
  SmartBuilderActionParameterValue,
  SmartBuilderHydrationResult,
} from '../lib/smart-builder-state';

import type {
  ValueMapMatchMode,
  ValueTableDirection,
  ValueTableNoMatchMode,
  ValueTablePrimitiveValue,
  ValueTableScope,
} from '@/lib/types/domain';

interface ConditionValidationState {
  readonly status: 'ready' | 'incomplete' | 'invalid';
  readonly message: string;
}

type ConditionSlotKey = `left-${number}` | `right-${number}` | 'then' | 'otherwise';
type ConditionPickerMode = 'fixed' | 'input';

function quoteDslString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function literalToDsl(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return quoteDslString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return quoteDslString(JSON.stringify(value));
}

function parseConstantNameFromExpression(expression: string): string | null {
  const match = expression.trim().match(/^constant\("([^"]+)"\)$/);
  return match?.[1] ?? null;
}

function isConfiguredStaticValue(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (value === null) return true;
  return false;
}

function isArgumentExplicitlySet(value: BuilderArgumentValue): boolean {
  if (value.kind === 'input') return value.inputId.trim().length > 0;
  if (value.kind === 'expression') return value.expression.trim().length > 0;
  return isConfiguredStaticValue(value.value);
}

interface ValueMapProjectTableOption {
  readonly tableId: string;
  readonly label: string;
  readonly revision: number;
  readonly status: 'active' | 'archived';
  readonly usageCount: number;
  readonly rowCount: number;
}

interface ValueMapDirectionOption {
  readonly direction: ValueTableDirection;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason?: string;
}

const ARRAY_HANDOFF_ACTION_IDS = new Set<string>([
  'array.map',
  'array.filter',
  'array.find',
  'array.array',
  'array.merge',
]);

export interface ValueMapProjectUiState {
  readonly scope: ValueTableScope;
  readonly matchMode: ValueMapMatchMode;
  readonly tableId: string | null;
  readonly direction: ValueTableDirection | null;
  readonly pinnedRevision: number | null;
  readonly currentRevision: number | null;
  readonly newerRevisionAvailable: boolean;
  readonly selectedDirectionInvalidReason?: string;
  readonly selectedTableName?: string;
  readonly noMatchMode: ValueTableNoMatchMode;
  readonly fallbackValue?: ValueTablePrimitiveValue;
  readonly projectSelection?: BuilderProjectValueMapSelection | null;
  readonly availableTables: readonly ValueMapProjectTableOption[];
  readonly directionOptions: readonly ValueMapDirectionOption[];
}

interface SmartBuilderPanelProps {
  readonly targetPath: string;
  readonly targetType: string;
  readonly hydration: SmartBuilderHydrationResult;
  readonly className?: string;
  readonly onEnterAdvancedMode?: () => void;
  readonly onConditionFocusedSlotChange?: (slotId: string | null) => void;
  readonly onStageField?: (field: StagedInputField) => void;
  readonly onRequestArrayBuilderHandoff?: () => void;
  readonly onInputToggle?: (input: BuilderInput) => void;
  readonly onInputRemove?: (inputId: string) => void;
  readonly onUpdateConditionComposition?: (composition: Extract<BuilderComposition, { kind: 'condition' }>) => void;
  readonly onApplyAction?: (
    actionId: string,
    options?: {
      editingStepIndex?: number;
      editingStepScope?: 'value-step' | 'result-step';
      calculationInputId?: string;
      setAsStartInputId?: string;
      directInputId?: string;
      fixedValue?: unknown;
      constantName?: string;
      concatParts?: readonly BuilderArgumentValue[];
      concatMove?: {
        readonly fromIndex: number;
        readonly toIndex: number;
      };
      coalesceValues?: readonly BuilderArgumentValue[];
      coalesceMove?: {
        readonly fromIndex: number;
        readonly toIndex: number;
      };
      coalesceFallbackValue?: unknown;
      clearCoalesceFallback?: boolean;
      calculationLiteralOperand?: unknown;
      calculationSetLiteralOperandAtIndex?: number;
      calculationMoveOperation?: {
        readonly fromIndex: number;
        readonly toIndex: number;
      };
      outputStepMove?: {
        readonly fromIndex: number;
        readonly toIndex: number;
      };
      outputStepRemoveIndex?: number;
      valueStepMove?: {
        readonly fromIndex: number;
        readonly toIndex: number;
      };
      valueStepRemoveIndex?: number;
      valueStepTarget?:
        | { readonly kind: 'direct' }
        | { readonly kind: 'concat-part'; readonly partIndex: number };
    },
  ) => void;
  readonly onBeginActionParameterEdit?: (
    actionId: string,
    values?: Readonly<Record<string, SmartBuilderActionParameterValue>>,
  ) => void;
  readonly onUpdateActionParameterDraft?: (
    actionId: string,
    fieldId: string,
    value: SmartBuilderActionParameterValue | '',
  ) => void;
  readonly onResetActionParameterDraft?: (actionId: string) => void;
  readonly onCancelActionParameterDraft?: () => void;
  readonly activeActionId?: string | null;
  readonly actionAnnouncement?: string | null;
  readonly valueMapProjectState?: ValueMapProjectUiState;
  readonly onValueMapScopeChange?: (scope: ValueTableScope) => void;
  readonly onValueMapProjectTableSelect?: (tableId: string) => void;
  readonly onValueMapDirectionSelect?: (direction: ValueTableDirection) => void;
  readonly onValueMapMatchModeChange?: (mode: ValueMapMatchMode) => void;
  readonly onValueMapNoMatchModeChange?: (mode: ValueTableNoMatchMode) => void;
  readonly onValueMapFallbackValueChange?: (value: string) => void;
  readonly onValueMapInlineMappingAdd?: () => void;
  readonly onValueMapInlineMappingUpdate?: (index: number, patch: { whenValue?: string; outputValue?: string }) => void;
  readonly onValueMapInlineMappingRemove?: (index: number) => void;
  readonly onValueMapConvertInlineToProject?: () => void;
  readonly onValueMapAdoptLatestRevision?: () => void;
  readonly sourceSampleData?: unknown;
  readonly enrichmentSampleData?: Readonly<Record<string, unknown>>;
  readonly showUndoButton?: boolean;
}

export function SmartBuilderPanel({
  targetPath,
  targetType,
  hydration,
  className = '',
  onEnterAdvancedMode,
  onConditionFocusedSlotChange,
  onStageField,
  onRequestArrayBuilderHandoff,
  onInputToggle,
  onInputRemove,
  onUpdateConditionComposition,
  onApplyAction,
  onBeginActionParameterEdit,
  onUpdateActionParameterDraft,
  onResetActionParameterDraft,
  onCancelActionParameterDraft,
  activeActionId = null,
  actionAnnouncement = null,
  valueMapProjectState,
  onValueMapScopeChange,
  onValueMapProjectTableSelect,
  onValueMapDirectionSelect,
  onValueMapMatchModeChange,
  onValueMapNoMatchModeChange,
  onValueMapFallbackValueChange,
  onValueMapInlineMappingAdd,
  onValueMapInlineMappingUpdate,
  onValueMapInlineMappingRemove,
  onValueMapConvertInlineToProject,
  onValueMapAdoptLatestRevision,
  sourceSampleData = null,
  enrichmentSampleData = {},
  showUndoButton = true,
}: SmartBuilderPanelProps) {
  const conditionSlotButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const previousFocusedSlotIdRef = useRef<string | null>(null);
  const [showAddInput, setShowAddInput] = useState(false);
  const [pickerMode, setPickerMode] = useState<'base' | 'step' | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [expandedDisabledId, setExpandedDisabledId] = useState<string | null>(null);
  const [parameterEditorStepIndex, setParameterEditorStepIndex] = useState<number | null>(null);
  const [parameterEditorStepScope, setParameterEditorStepScope] = useState<'value-step' | 'result-step' | null>(null);
  const [openParameterDropdownId, setOpenParameterDropdownId] = useState<string | null>(null);
  const fixedValueInputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const [activeConditionSlot, setActiveConditionSlot] = useState<ConditionSlotKey | null>(null);
  const [stepPickerScope, setStepPickerScope] = useState<'result' | { readonly kind: 'direct' } | { readonly kind: 'concat-part'; readonly partIndex: number }>('result');
  const [openConcatPartMenuIndex, setOpenConcatPartMenuIndex] = useState<number | null>(null);
  const [parameterEditorValueStepTarget, setParameterEditorValueStepTarget] = useState<
    { readonly kind: 'direct' } | { readonly kind: 'concat-part'; readonly partIndex: number } | null
  >(null);
  const [conditionPickerModeBySlot, setConditionPickerModeBySlot] = useState<Partial<Record<ConditionSlotKey, ConditionPickerMode>>>({});
  const [parameterDropdownPosition, setParameterDropdownPosition] = useState<{
    readonly top: number;
    readonly left: number;
    readonly width: number;
  } | null>(null);

  useEffect(() => {
    if (hydration.kind !== 'guided') {
      previousFocusedSlotIdRef.current = null;
      return;
    }

    const currentFocusedSlotId = hydration.draft.focusedSlotId ?? null;
    const previousFocusedSlotId = previousFocusedSlotIdRef.current;
    previousFocusedSlotIdRef.current = currentFocusedSlotId;

    if (previousFocusedSlotId && !currentFocusedSlotId) {
      const rawPreviousKey = previousFocusedSlotId.startsWith('condition:')
        ? previousFocusedSlotId.replace('condition:', '')
        : previousFocusedSlotId === 'fallback:default'
          ? 'fallback:default'
          : null;

      const previousKey = rawPreviousKey === 'left'
        ? 'left-0'
        : rawPreviousKey === 'right'
          ? 'right-0'
          : rawPreviousKey === 'else'
            ? 'otherwise'
            : rawPreviousKey;

      const focusId = requestAnimationFrame(() => {
        if (previousKey) {
          conditionSlotButtonRefs.current.get(previousKey)?.focus();
        }
      });

      return () => {
        cancelAnimationFrame(focusId);
      };
    }
  }, [hydration]);

  const isFixedValueUnset = hydration.kind === 'guided'
    && hydration.draft.composition?.kind === 'direct'
    && hydration.draft.composition.value?.kind === 'static'
    && !isArgumentExplicitlySet(hydration.draft.composition.value);

  useEffect(() => {
    if (!isFixedValueUnset) return;
    const focusId = requestAnimationFrame(() => {
      fixedValueInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(focusId);
  }, [isFixedValueUnset]);

  void activeActionId;
  void sourceSampleData;
  void enrichmentSampleData;

  const openParameterDropdown = (fieldId: string, anchor: HTMLInputElement) => {
    const rect = anchor.getBoundingClientRect();
    setOpenParameterDropdownId(fieldId);
    setParameterDropdownPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  };

  if (hydration.kind === 'advanced') {
    return (
      <section
        className={`flex h-full flex-col ${className}`}
        data-testid="smart-builder-panel"
        aria-label={`Smart builder for ${targetPath} (${targetType})`}
      >
        <div className="space-y-2.5 px-3 py-3" data-testid="smart-builder-complex-banner">
          <ComplexExpressionWarning
            reason="This saved expression is too complex for guided editing."
            onStayInEditor={() => {
              onEnterAdvancedMode?.();
            }}
            onTryBuilder={() => {
              onEnterAdvancedMode?.();
            }}
          />
        </div>
      </section>
    );
  }

  const actions = resolveSmartBuilderActionsFromDraft(hydration.draft);
  const changeLogicOptions = resolveChangeLogicOptionsFromDraft(hydration.draft);
  const inputUsages = getBuilderInputUsages(hydration.draft);
  const pendingActionDraft = hydration.draft.pendingActionDraft ?? null;
  const hasArrayScope =
    hydration.draft.targetType === 'array'
    || hydration.draft.inputs.some((input) => input.sourceKind === 'item' || input.sourceKind === 'parent');
  const conditionComposition = hydration.draft.composition?.kind === 'condition'
    ? hydration.draft.composition
    : null;
  const hasEnabledArrayActions = actions.some(
    (entry) => ARRAY_HANDOFF_ACTION_IDS.has(entry.action.id) && entry.availability.enabled,
  );
  const conditionCompatibilityIssues = conditionComposition
    ? getConditionCompatibilityIssues(hydration.draft, conditionComposition)
    : [];

  const conditionValidationState: ConditionValidationState | null = conditionComposition
    ? (() => {
      const firstClause = conditionComposition.clauses[0];
      if (!firstClause || firstClause.predicates.length === 0) {
        return {
          status: 'incomplete',
          message: 'Add at least one condition.',
        };
      }

      const isConditionValueIncomplete = (value: BuilderArgumentValue): boolean => {
        if (value.kind === 'static') {
          return typeof value.value === 'string' ? value.value.trim().length === 0 : false;
        }
        if (value.kind === 'expression') return value.expression.trim().length === 0;
        return value.inputId.trim().length === 0;
      };

      const hasIncompletePredicate = firstClause.predicates.some((predicate) => {
        if (isConditionValueIncomplete(predicate.left)) return true;
        if (predicate.operator === 'isNull' || predicate.operator === 'isNotNull' || predicate.operator === 'isTruthy' || predicate.operator === 'isFalsy') {
          return false;
        }
        if (!predicate.right) return true;
        return isConditionValueIncomplete(predicate.right);
      });

      if (hasIncompletePredicate) {
        return {
          status: 'incomplete',
          message: 'Finish each IF condition to continue.',
        };
      }

      if (isConditionValueIncomplete(firstClause.thenOutput) || isConditionValueIncomplete(conditionComposition.elseOutput)) {
        return {
          status: 'incomplete',
          message: 'THEN and OTHERWISE values are required.',
        };
      }

      if (conditionCompatibilityIssues.length > 0) {
        return {
          status: 'invalid',
          message: 'Fix highlighted condition value mismatches.',
        };
      }

      return {
        status: 'ready',
        message: 'Condition is complete.',
      };
    })()
    : null;

  const updateCondition = (next: Extract<BuilderComposition, { kind: 'condition' }>) => {
    onUpdateConditionComposition?.(next);
  };

  const parseConditionSlotIndex = (slot: ConditionSlotKey): number | null => {
    if (!slot.startsWith('left-') && !slot.startsWith('right-')) return null;
    const [, rawIndex] = slot.split('-');
    const index = Number(rawIndex);
    return Number.isInteger(index) ? index : null;
  };

  const openConditionSlotPicker = (slot: ConditionSlotKey, defaultMode: ConditionPickerMode) => {
    setActiveConditionSlot(slot);
    setConditionPickerModeBySlot((current) => ({
      ...current,
      [slot]: current[slot] ?? defaultMode,
    }));
  };

  const closeConditionSlotPicker = () => {
    setActiveConditionSlot(null);
  };

  const updateConditionSlotMode = (slot: ConditionSlotKey, mode: ConditionPickerMode) => {
    setConditionPickerModeBySlot((current) => ({ ...current, [slot]: mode }));
  };

  const toConditionFocusSlotId = (slot: ConditionSlotKey): string => {
    if (slot === 'then') return 'condition:then';
    if (slot === 'otherwise') return 'condition:else';
    return slot.startsWith('left-') ? 'condition:left' : 'condition:right';
  };

  const describeConditionValue = (value: BuilderArgumentValue): string => {
    return (() => {
      if (value.kind === 'input') {
        const input = hydration.draft.inputs.find((entry) => entry.id === value.inputId);
        return input?.label ?? value.inputId;
      }
      if (value.kind === 'expression') return value.expression;
      if (value.value === null) return 'null';
      if (typeof value.value === 'string') return value.value;
      return String(value.value);
    })();
  };

  const toOperatorLabel = (operator: BuilderPredicate['operator']) => {
    switch (operator) {
      case 'eq': return 'Equals';
      case 'neq': return 'Not equals';
      case 'gt': return 'Greater than';
      case 'gte': return 'Greater or equal';
      case 'lt': return 'Less than';
      case 'lte': return 'Less or equal';
      case 'contains': return 'Contains';
      case 'isNull': return 'Is empty';
      case 'isNotNull': return 'Is not empty';
      case 'isTruthy': return 'Is true';
      case 'isFalsy': return 'Is false';
      default: return operator;
    }
  };

  const renderConditionFixedValueEditor = (
    slot: ConditionSlotKey,
    valueType: BuilderInput['valueType'],
    value: BuilderArgumentValue,
    composition: Extract<BuilderComposition, { kind: 'condition' }>,
  ) => {
    const staticValue = value.kind === 'static' ? value.value : '';

    if (valueType === 'number' || valueType === 'integer') {
      return (
        <input
          type="number"
          data-testid={`smart-condition-picker-fixed-number-${slot}`}
          className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
          value={typeof staticValue === 'number' ? String(staticValue) : ''}
          placeholder="Enter number"
          onChange={(event) => {
            const raw = event.target.value;
            const nextValue = raw === '' ? '' : Number(raw);
            updateConditionSlotArgument(composition, slot, {
              kind: 'static',
              value: nextValue,
              transforms: value.transforms,
            });
          }}
        />
      );
    }

    if (valueType === 'boolean') {
      const normalized = typeof staticValue === 'boolean'
        ? (staticValue ? 'true' : 'false')
        : '';
      return (
        <select
          data-testid={`smart-condition-picker-fixed-boolean-${slot}`}
          className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
          value={normalized}
          onChange={(event) => {
            const raw = event.target.value;
            const nextValue = raw === 'true' ? true : raw === 'false' ? false : '';
            updateConditionSlotArgument(composition, slot, {
              kind: 'static',
              value: nextValue,
              transforms: value.transforms,
            });
          }}
        >
          <option value="">Select…</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      );
    }

    return (
      <input
        type="text"
        data-testid={`smart-condition-picker-fixed-string-${slot}`}
        className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
        value={typeof staticValue === 'string' ? staticValue : ''}
        placeholder="Enter text"
        onChange={(event) => {
          updateConditionSlotArgument(composition, slot, {
            kind: 'static',
            value: event.target.value,
            transforms: value.transforms,
          });
        }}
      />
    );
  };

  const renderConditionValuePicker = (
    slot: ConditionSlotKey,
    composition: Extract<BuilderComposition, { kind: 'condition' }>,
    valueType: BuilderInput['valueType'],
  ) => {
    const currentValue = getConditionSlotArgument(composition, slot)
      ?? { kind: 'static' as const, value: '' };
    const mode = conditionPickerModeBySlot[slot]
      ?? ((currentValue.kind === 'input' || currentValue.kind === 'expression') ? 'input' : 'fixed');
    const isInputSlot = mode === 'input';

    return (
      <div className="mt-1.5 rounded border border-slate-800 bg-slate-950/40 px-2 py-2" data-testid={`smart-condition-picker-${slot}`}>
        <p className="text-[11px] font-semibold text-slate-300">Choose value</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            data-testid={`smart-condition-picker-mode-fixed-${slot}`}
            className={`rounded border px-2 py-0.5 text-[11px] ${mode === 'fixed' ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
            onClick={() => {
              updateConditionSlotMode(slot, 'fixed');
              if (currentValue.kind !== 'static') {
                updateConditionSlotArgument(composition, slot, {
                  kind: 'static',
                  value: '',
                  transforms: currentValue.transforms,
                });
              }
            }}
          >
            Fixed value
          </button>
          <button
            type="button"
            data-testid={`smart-condition-picker-mode-input-${slot}`}
            className={`rounded border px-2 py-0.5 text-[11px] ${mode === 'input' ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
            onClick={() => updateConditionSlotMode(slot, 'input')}
          >
            Input field
          </button>
        </div>

        {mode === 'fixed' && (
          <div className="mt-2" data-testid={`smart-condition-picker-fixed-editor-${slot}`}>
            {renderConditionFixedValueEditor(slot, valueType, currentValue, composition)}
          </div>
        )}

        {isInputSlot && (
          <div className="mt-2 space-y-1.5" data-testid={`smart-condition-picker-input-editor-${slot}`}>
            {(currentValue.kind === 'input' || currentValue.kind === 'expression') && (
              <button
                type="button"
                data-testid={`smart-condition-picker-input-current-${slot}`}
                className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-left text-xs text-slate-100 hover:border-slate-500"
                onClick={() => onConditionFocusedSlotChange?.(toConditionFocusSlotId(slot))}
              >
                {describeConditionValue(currentValue) || 'Select value'}
              </button>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                data-testid={`smart-condition-picker-input-tray-${slot}`}
                className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                onClick={() => onConditionFocusedSlotChange?.(toConditionFocusSlotId(slot))}
              >
                Select from input tray
              </button>
              <button
                type="button"
                data-testid={`smart-condition-picker-input-browse-${slot}`}
                className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                onClick={() => onConditionFocusedSlotChange?.(toConditionFocusSlotId(slot))}
              >
                Browse source fields
              </button>
            </div>
          </div>
        )}

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            data-testid={`smart-condition-picker-done-${slot}`}
            className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
            onClick={() => closeConditionSlotPicker()}
          >
            Done
          </button>
        </div>
      </div>
    );
  };

  const getConditionSlotArgument = (
    composition: Extract<BuilderComposition, { kind: 'condition' }>,
    slot: ConditionSlotKey,
  ): BuilderArgumentValue | null => {
    if (slot === 'then') return composition.clauses[0]?.thenOutput ?? null;
    if (slot === 'otherwise') return composition.elseOutput;
    const index = parseConditionSlotIndex(slot);
    if (index === null) return null;
    const predicate = composition.clauses[0]?.predicates[index];
    if (!predicate) return null;
    return slot.startsWith('left-') ? predicate.left : (predicate.right ?? null);
  };

  const updateConditionSlotArgument = (
    composition: Extract<BuilderComposition, { kind: 'condition' }>,
    slot: ConditionSlotKey,
    nextValue: BuilderArgumentValue,
  ) => {
    if (slot === 'then') {
      const firstClause = composition.clauses[0];
      if (!firstClause) return;
      updateCondition({
        ...composition,
        clauses: [
          { ...firstClause, thenOutput: nextValue },
          ...composition.clauses.slice(1),
        ],
      });
      return;
    }

    if (slot === 'otherwise') {
      updateCondition({ ...composition, elseOutput: nextValue });
      return;
    }

    const index = parseConditionSlotIndex(slot);
    if (index === null) return;
    const predicates = (composition.clauses[0]?.predicates ?? []).map((entry, rowIndex) => {
      if (rowIndex !== index) return entry;
      if (slot.startsWith('left-')) {
        return { ...entry, left: nextValue };
      }
      return { ...entry, right: nextValue };
    });

    updateCondition({
      ...composition,
      clauses: [
        {
          ...composition.clauses[0]!,
          predicates,
        },
        ...composition.clauses.slice(1),
      ],
    });
  };


  const mappingMethodId = (() => {
    const composition = hydration.draft.composition;
    if (!composition) return 'base.none';
    if (composition.kind === 'direct') {
      if (composition.value?.kind === 'static') return 'base.fixed';
      if (composition.value?.kind === 'expression' && parseConstantNameFromExpression(composition.value.expression)) {
        return 'base.constant';
      }
      return 'base.direct';
    }
    if (composition.kind === 'default') return 'base.direct';
    if (composition.kind === 'concat') return 'text.concat';
    if (composition.kind === 'coalesce') return 'null.coalesce';
    if (composition.kind === 'condition') return 'condition.compare';
    if (composition.kind === 'valueMap') return 'lookup.valueMap';
    if (composition.kind === 'advancedExpression') return 'advanced.expression';
    if (composition.kind === 'math') {
      const firstOperator = composition.operations?.[0]?.operator ?? composition.operator;
      const hasSingleOperation = (composition.operations?.length ?? 0) === 1
        || ((composition.inputIds?.length ?? 0) === 2 && typeof composition.operator === 'string');
      if (hasSingleOperation && firstOperator) {
        if (firstOperator === 'add') return 'number.add';
        if (firstOperator === 'subtract') return 'number.subtract';
        if (firstOperator === 'multiply') return 'number.multiply';
        if (firstOperator === 'divide') return 'number.divide';
      }
      return 'base.calculation';
    }
    return 'base.none';
  })();
  const mappingMethodLabel =
    mappingMethodId === 'text.concat'
      ? 'Combine values'
      : mappingMethodId === 'null.coalesce'
        ? 'Use first available'
        : mappingMethodId === 'condition.compare'
          ? 'Conditional'
          : mappingMethodId === 'lookup.valueMap'
            ? 'Value Mapping'
            : mappingMethodId === 'advanced.expression'
              ? 'Edit expression'
              : mappingMethodId === 'base.calculation'
                ? 'Calculation'
                : mappingMethodId === 'number.add'
                  ? 'Add numbers'
                  : mappingMethodId === 'number.subtract'
                    ? 'Subtract numbers'
                    : mappingMethodId === 'number.multiply'
                      ? 'Multiply numbers'
                      : mappingMethodId === 'number.divide'
                        ? 'Divide numbers'
                        : mappingMethodId === 'base.none'
                          ? 'Needs action'
                        : mappingMethodId === 'base.fixed'
                          ? 'Fixed value'
                          : mappingMethodId === 'base.constant'
                            ? 'Constant'
                            : 'Use one value';
  const isMethodNeedsAction = mappingMethodId === 'base.none';

  const defaultPrimaryInput = (() => {
    if (hydration.draft.composition?.kind === 'direct') {
      if (hydration.draft.composition.value?.kind === 'input') {
        return hydration.draft.inputs.find((input) => input.id === hydration.draft.composition?.value?.inputId) ?? null;
      }
      return hydration.draft.inputs.find((input) => input.id === hydration.draft.composition?.inputId) ?? hydration.draft.inputs[0] ?? null;
    }
    if (hydration.draft.composition?.kind === 'default') {
      return hydration.draft.inputs.find((input) => input.id === hydration.draft.composition?.inputId) ?? hydration.draft.inputs[0] ?? null;
    }
    if (mappingMethodId === 'base.direct') {
      return hydration.draft.inputs[0] ?? null;
    }
    return null;
  })();

  const calculationRows = (() => {
    const composition = hydration.draft.composition;
    if (composition?.kind !== 'math') return null;

    if (composition.startInputId && composition.operations) {
      const start = hydration.draft.inputs.find((input) => input.id === composition.startInputId);
      if (!start) return null;

      return {
        start,
        operations: composition.operations
          .map((operation) => {
            const operand = operation.operand
              ? operation.operand
              : operation.inputId
                ? { kind: 'input' as const, inputId: operation.inputId }
                : null;
            return operand ? { operator: operation.operator, operand } : null;
          })
          .filter((row): row is {
            operator: 'add' | 'subtract' | 'multiply' | 'divide';
            operand: BuilderArgumentValue;
          } => Boolean(row)),
      };
    }

    const orderedInputs = (composition.inputIds ?? hydration.draft.inputs.map((input) => input.id))
      .map((id) => hydration.draft.inputs.find((input) => input.id === id))
      .filter((input): input is BuilderInput => Boolean(input));
    const [start, ...rest] = orderedInputs;
    if (!start) return null;
    return {
      start,
      operations: rest.map((input) => ({
        operator: composition.operator ?? 'add',
        operand: { kind: 'input' as const, inputId: input.id },
      })),
    };
  })();

  const calculationLiteralDivideByZero = (() => {
    if (!calculationRows) return false;
    return calculationRows.operations.some((operation) =>
      operation.operator === 'divide'
      && operation.operand.kind === 'static'
      && Number(operation.operand.value) === 0,
    );
  })();

  const describeCalculationOperand = (operand: BuilderArgumentValue): string => {
    if (operand.kind === 'input') {
      const input = hydration.draft.inputs.find((entry) => entry.id === operand.inputId);
      return input?.label ?? 'input';
    }
    if (operand.kind === 'static') {
      return literalToDsl(operand.value);
    }
    return operand.expression;
  };

  const actionIdForCalculationOperator = (operator: 'add' | 'subtract' | 'multiply' | 'divide'): 'number.add' | 'number.subtract' | 'number.multiply' | 'number.divide' => (
    operator === 'add'
      ? 'number.add'
      : operator === 'subtract'
        ? 'number.subtract'
        : operator === 'multiply'
          ? 'number.multiply'
          : 'number.divide'
  );

  const usedInputIds = (() => {
    const composition = hydration.draft.composition;
    if (!composition) return new Set<string>();

    if (composition.kind === 'direct') {
      if (composition.value?.kind === 'input') {
        return new Set([composition.value.inputId]);
      }
      if (composition.value && composition.value.kind !== 'input') {
        return new Set<string>();
      }
      return new Set([composition.inputId]);
    }
    if (composition.kind === 'concat' || composition.kind === 'coalesce' || composition.kind === 'arrayBuild' || composition.kind === 'arrayMerge') {
      const ids = composition.inputIds ?? hydration.draft.inputs.map((input) => input.id);
      return new Set(ids);
    }
    if (composition.kind === 'default') {
      const ids = new Set<string>([composition.inputId]);
      if (composition.fallback.kind === 'input') ids.add(composition.fallback.inputId);
      return ids;
    }
    if (composition.kind === 'math') {
      if (composition.startInputId && composition.operations) {
        const ids = new Set<string>([composition.startInputId]);
        composition.operations.forEach((entry) => {
          if (entry.inputId) ids.add(entry.inputId);
          if (entry.operand?.kind === 'input') ids.add(entry.operand.inputId);
        });
        return ids;
      }
      const ids = composition.inputIds ?? hydration.draft.inputs.map((input) => input.id);
      return new Set(ids);
    }
    if (composition.kind === 'valueMap') return new Set([composition.inputId]);
    if (composition.kind === 'condition') {
      const ids = new Set<string>();
      for (const clause of composition.clauses) {
        for (const predicate of clause.predicates) {
          if (predicate.left.kind === 'input') ids.add(predicate.left.inputId);
          if (predicate.right?.kind === 'input') ids.add(predicate.right.inputId);
        }
        if (clause.thenOutput.kind === 'input') ids.add(clause.thenOutput.inputId);
      }
      if (composition.elseOutput.kind === 'input') ids.add(composition.elseOutput.inputId);
      return ids;
    }

    return new Set<string>();
  })();

  const unusedInputs = hydration.draft.inputs.filter((input) => !usedInputIds.has(input.id));
  const canSuggestCombineValues = hydration.draft.inputs.length > 1
    && hydration.draft.inputs.every((input) => input.valueType === 'string');

  const composePreview = (() => {
    if (hydration.draft.inputs.length === 0) return '--';
    if (mappingMethodId === 'text.concat') {
      const concatComposition = hydration.draft.composition?.kind === 'concat'
        ? hydration.draft.composition
        : null;
      const partLabels = (concatComposition?.parts ?? [])
        .map((part) => {
          if (part.kind === 'input') {
            const input = hydration.draft.inputs.find((entry) => entry.id === part.inputId);
            return input?.label ?? 'input';
          }
          if (part.kind === 'static') {
            if (typeof part.value === 'string' && part.value.length === 1 && part.value === ' ') return '[space]';
            return literalToDsl(part.value);
          }
          return part.expression;
        });
      return partLabels.length > 0 ? partLabels.join(' + ') : '--';
    }
    if (mappingMethodId === 'null.coalesce') {
      const coalesceComposition = hydration.draft.composition?.kind === 'coalesce'
        ? hydration.draft.composition
        : null;
      const labels = (coalesceComposition?.values ?? [])
        .map((value) => {
          if (value.kind === 'input') {
            const input = hydration.draft.inputs.find((entry) => entry.id === value.inputId);
            return input?.label ?? 'input';
          }
          if (value.kind === 'static') return literalToDsl(value.value);
          return value.expression;
        });
      const fallback = coalesceComposition?.fallback;
      if (fallback) {
        if (fallback.kind === 'static') labels.push(`fallback ${literalToDsl(fallback.value)}`);
        else if (fallback.kind === 'input') {
          const input = hydration.draft.inputs.find((entry) => entry.id === fallback.inputId);
          labels.push(`fallback ${input?.label ?? 'input'}`);
        } else {
          labels.push(`fallback ${fallback.expression}`);
        }
      }
      return labels.length > 0 ? labels.join(' -> ') : '--';
    }
    if ((mappingMethodId === 'base.calculation'
      || mappingMethodId === 'number.add'
      || mappingMethodId === 'number.subtract'
      || mappingMethodId === 'number.multiply'
      || mappingMethodId === 'number.divide') && calculationRows) {
      const symbol = (operator: 'add' | 'subtract' | 'multiply' | 'divide') => (
        operator === 'add' ? '+' : operator === 'subtract' ? '-' : operator === 'multiply' ? '×' : '÷'
      );
      return [
        calculationRows.start.label,
        ...calculationRows.operations.map((operation) => `${symbol(operation.operator)} ${describeCalculationOperand(operation.operand)}`),
      ].join(' ');
    }
    if (mappingMethodId === 'base.direct') {
      return defaultPrimaryInput?.label ?? hydration.draft.inputs[0]?.label ?? '--';
    }
    if (mappingMethodId === 'base.fixed') {
      const fixed = hydration.draft.composition?.kind === 'direct' && hydration.draft.composition.value?.kind === 'static'
        ? hydration.draft.composition.value.value
        : '';
      return literalToDsl(fixed);
    }
    if (mappingMethodId === 'base.constant') {
      const constantName = hydration.draft.composition?.kind === 'direct' && hydration.draft.composition.value?.kind === 'expression'
        ? parseConstantNameFromExpression(hydration.draft.composition.value.expression)
        : null;
      return constantName ? `constant(${quoteDslString(constantName)})` : 'constant("DEFAULT_CONSTANT")';
    }
    if (mappingMethodId === 'base.none') {
      return 'Choose how selected inputs should be used.';
    }
    return hydration.draft.inputs.map((input) => input.label).join(', ');
  })();

  const shouldRenderMethodPreview = mappingMethodId !== 'base.direct' && mappingMethodId !== 'base.fixed';
  const showFinalTransformations = mappingMethodId !== 'base.direct';
  const valueMapComposition = hydration.draft.composition?.kind === 'valueMap'
    ? hydration.draft.composition
    : null;
  const valueMapLookupInput = valueMapComposition
    ? hydration.draft.inputs.find((input) => input.id === valueMapComposition.inputId) ?? null
    : null;
  void onValueMapConvertInlineToProject;

  const basePickerActions = changeLogicOptions.map((option) => ({
    id: option.id,
    label: option.label,
    enabled: option.enabled && option.id !== mappingMethodId,
    reason: option.id === mappingMethodId ? 'Already selected.' : option.reason,
  }));

  const stepPickerScopedInputs = (() => {
    if (stepPickerScope === 'result') {
      return hydration.draft.inputs;
    }

    const composition = hydration.draft.composition;
    if (stepPickerScope.kind === 'direct') {
      if (composition?.kind === 'direct') {
        const selectedInputId = composition.value?.kind === 'input'
          ? composition.value.inputId
          : composition.inputId;
        const selectedInput = hydration.draft.inputs.find((input) => input.id === selectedInputId)
          ?? defaultPrimaryInput;
        return selectedInput ? [selectedInput] : [];
      }
      return defaultPrimaryInput ? [defaultPrimaryInput] : [];
    }

    if (stepPickerScope.kind === 'concat-part' && composition?.kind === 'concat') {
      const selectedPart = composition.parts?.[stepPickerScope.partIndex];
      if (selectedPart?.kind === 'input') {
        const selectedInput = hydration.draft.inputs.find((input) => input.id === selectedPart.inputId);
        return selectedInput ? [selectedInput] : [];
      }
    }

    return [] as BuilderInput[];
  })();

  const stepPickerResolvedActions = resolveSmartBuilderActions({
    targetType: hydration.draft.targetType,
    isRequired: hydration.draft.isRequired,
    inputs: stepPickerScopedInputs,
    hasArrayScope,
    pendingActionDraft: hydration.draft.pendingActionDraft,
  });

  const stepPickerActions = (() => {
    if (mappingMethodId === 'base.none') {
      return [] as { id: string; label: string; enabled: boolean; reason: string }[];
    }
    const isResultScope = stepPickerScope === 'result';
    const options = stepPickerResolvedActions
      .filter((entry) => {
        if (entry.action.id === 'advanced.expression') {
          return false;
        }
        return isResultScope
          ? entry.action.role === 'outputStep'
          : entry.action.role === 'inputTransform' || entry.action.id === 'null.default' || entry.action.id === 'convert.cast';
      })
      .map((entry) => ({ id: entry.action.id, label: entry.action.label }));
    const resolvedById = new Map(stepPickerResolvedActions.map((entry) => [entry.action.id, entry]));
    return options.map((option) => {
      const resolved = resolvedById.get(option.id);
      return {
        id: option.id,
        label: option.label,
        enabled: resolved?.availability.enabled ?? false,
        reason: resolved?.availability.reason ?? 'Unavailable in current context.',
      };
    });
  })();

  const valueMapFallbackInputType = (() => {
    if (!valueMapProjectState) return 'text' as const;
    const fallbackValue = valueMapProjectState.fallbackValue;
    if (typeof fallbackValue === 'number') return 'number' as const;
    return 'text' as const;
  })();

  const showBuildOutput = (() => {
    return true;
  })();
  const showInitialStartGuidance = hydration.draft.inputs.length === 0;

  const effectivePickerMode = pickerMode ?? (isMethodNeedsAction ? 'base' : null);
  const activePickerActions =
    effectivePickerMode === 'base'
      ? basePickerActions
      : effectivePickerMode === 'step'
        ? stepPickerActions
        : [];
  const supportsPickerSearch = effectivePickerMode !== 'base';
  const normalizedPickerQuery = supportsPickerSearch ? pickerQuery.trim().toLowerCase() : '';
  const visibleEnabledPickerActions = activePickerActions.filter((action) => {
    if (!action.enabled) return false;
    if (!normalizedPickerQuery) return true;
    return action.label.toLowerCase().includes(normalizedPickerQuery);
  });
  const visibleDisabledPickerActions = activePickerActions.filter((action) => {
    if (action.enabled || !normalizedPickerQuery) return false;
    return `${action.label} ${action.reason ?? ''}`.toLowerCase().includes(normalizedPickerQuery);
  });

  const stepPickerBlock = mappingMethodId !== 'lookup.valueMap' && effectivePickerMode === 'step'
    ? (
      <div className="mt-3 rounded border border-slate-700 bg-slate-950/50 px-2.5 py-2" data-testid={`smart-${effectivePickerMode}-picker`}>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {effectivePickerMode === 'base'
              ? 'Choose mapping method'
              : stepPickerScope === 'result'
                ? 'Add final transformation'
                : 'Add transformation'}
          </p>
          {!isMethodNeedsAction && (
            <button
              type="button"
              className="text-[11px] text-slate-500 hover:text-slate-300"
              data-testid="smart-picker-close"
              onClick={() => setPickerMode(null)}
            >
              Close
            </button>
          )}
        </div>

        {supportsPickerSearch && (
          <input
            type="search"
            value={pickerQuery}
            onChange={(event) => {
              setPickerQuery(event.target.value);
              setExpandedDisabledId(null);
            }}
            placeholder="Search actions..."
            data-testid="smart-picker-search"
            className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
        )}

        <div className="mt-2 space-y-1.5" data-testid="smart-picker-enabled-actions">
          {visibleEnabledPickerActions.map((action) => (
            <button
              key={action.id}
              type="button"
              data-testid={`smart-picker-action-${action.id}`}
              className="w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1.5 text-left text-xs text-slate-100 hover:border-slate-500"
              onClick={() => {
                const parameterDefinitions = getSmartBuilderActionParameters(action.id);
                if (parameterDefinitions.length > 0) {
                  onBeginActionParameterEdit?.(action.id);
                  setParameterEditorStepIndex(null);
                  setParameterEditorStepScope(stepPickerScope === 'result' ? 'result-step' : 'value-step');
                  setParameterEditorValueStepTarget(
                    stepPickerScope === 'result' ? null : stepPickerScope,
                  );
                  setPickerMode(null);
                  return;
                }

                onApplyAction?.(action.id, stepPickerScope === 'result'
                  ? { editingStepScope: 'result-step' }
                  : {
                      editingStepScope: 'value-step',
                      valueStepTarget: stepPickerScope,
                    });
                setParameterEditorStepIndex(null);
                setParameterEditorStepScope(null);
                setParameterEditorValueStepTarget(null);
                setPickerMode(null);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>

        {(supportsPickerSearch && normalizedPickerQuery.length > 0 && visibleDisabledPickerActions.length > 0) && (
          <ul className="mt-2 space-y-1.5" data-testid="smart-picker-disabled-actions">
            {visibleDisabledPickerActions.map((action) => {
              const expanded = expandedDisabledId === action.id;
              return (
                <li
                  key={action.id}
                  className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5"
                  data-testid={`smart-picker-disabled-${action.id}`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      setExpandedDisabledId((prev) => (prev === action.id ? null : action.id));
                    }}
                  >
                    <p className="text-xs text-slate-300">{action.label}</p>
                    {expanded && <p className="text-[11px] text-slate-500">{action.reason}</p>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    )
    : null;

  const actionParameterIssuesByFieldId = (() => {
    const grouped = new Map<string, string>();
    for (const issue of pendingActionDraft?.validation.issues ?? []) {
      if (!grouped.has(issue.fieldId)) {
        grouped.set(issue.fieldId, issue.message);
      }
    }
    return grouped;
  })();

  const pendingParameterDefinitions = pendingActionDraft
    ? getSmartBuilderActionParameters(pendingActionDraft.actionId)
    : [];

  const pendingActionLabel = pendingActionDraft
    ? (findSmartBuilderActionById(pendingActionDraft.actionId)?.label ?? pendingActionDraft.actionId)
    : null;

  const pendingNullDefaultFallbackMode = (() => {
    if (!pendingActionDraft || pendingActionDraft.actionId !== 'null.default') return 'fixed';
    const explicit = pendingActionDraft.values.fallbackMode;
    if (typeof explicit === 'string' && explicit.length > 0) return explicit;
    const legacy = pendingActionDraft.values.fallbackExpression;
    if (typeof legacy === 'string') {
      const trimmed = legacy.trim();
      if (trimmed === 'null') return 'null';
      if (/^constant\("[\s\S]*"\)$/.test(trimmed)) return 'constant';
      if (/^source\("[\s\S]*"\)$/.test(trimmed)) return 'input';
    }
    return 'fixed';
  })();

  const pendingNullDefaultInputOptions = pendingActionDraft?.actionId === 'null.default'
    ? hydration.draft.inputs.map((input) => ({ id: input.id, label: input.label }))
    : [];
  const pendingNullDefaultSelectedInputId = (() => {
    if (!pendingActionDraft || pendingActionDraft.actionId !== 'null.default') return '';
    const raw = pendingActionDraft.values.fallbackInputId;
    if (typeof raw === 'string' && raw.length > 0) return raw;
    return pendingNullDefaultInputOptions[0]?.id ?? '';
  })();
  const pendingNullDefaultConstantName = (() => {
    if (!pendingActionDraft || pendingActionDraft.actionId !== 'null.default') return 'DEFAULT_CONSTANT';
    const explicit = pendingActionDraft.values.fallbackConstantName;
    if (typeof explicit === 'string') return explicit;
    const legacy = pendingActionDraft.values.fallbackExpression;
    if (typeof legacy === 'string') {
      const match = legacy.trim().match(/^constant\("([\s\S]*)"\)$/);
      if (match?.[1] !== undefined) {
        return match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
    }
    return 'DEFAULT_CONSTANT';
  })();
  const pendingNullDefaultFixedString = (() => {
    if (!pendingActionDraft || pendingActionDraft.actionId !== 'null.default') return '';
    const explicit = pendingActionDraft.values.fallbackFixedString;
    if (typeof explicit === 'string') return explicit;
    const legacy = pendingActionDraft.values.fallbackExpression;
    if (typeof legacy === 'string') {
      const trimmed = legacy.trim();
      const quoted = trimmed.match(/^"([\s\S]*)"$/);
      if (quoted?.[1] !== undefined) {
        return quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
    }
    return '';
  })();
  const pendingNullDefaultFixedNumber = (() => {
    if (!pendingActionDraft || pendingActionDraft.actionId !== 'null.default') return 0;
    const explicit = pendingActionDraft.values.fallbackFixedNumber;
    if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
    const legacy = pendingActionDraft.values.fallbackExpression;
    if (typeof legacy === 'string' && legacy.trim().length > 0 && Number.isFinite(Number(legacy.trim()))) {
      return Number(legacy.trim());
    }
    return 0;
  })();
  const pendingNullDefaultFixedBoolean = (() => {
    if (!pendingActionDraft || pendingActionDraft.actionId !== 'null.default') return false;
    const explicit = pendingActionDraft.values.fallbackFixedBoolean;
    if (typeof explicit === 'boolean') return explicit;
    const legacy = pendingActionDraft.values.fallbackExpression;
    if (legacy === 'true') return true;
    if (legacy === 'false') return false;
    return false;
  })();
  const nullDefaultInputModeMissingInput = pendingActionDraft?.actionId === 'null.default'
    && pendingNullDefaultFallbackMode === 'input'
    && pendingNullDefaultInputOptions.length === 0;
  const parameterApplyLabel = pendingActionDraft?.actionId === 'null.default' && parameterEditorStepScope === 'result-step'
    ? 'Add step'
    : 'Apply';
  const isParameterApplyDisabled = Boolean(
    !pendingActionDraft?.validation.isValid || nullDefaultInputModeMissingInput,
  );

  const resolveParameterizedActionForTransformStep = (
    step: BuilderInputTransform,
  ): { actionId: string; values: Readonly<Record<string, SmartBuilderActionParameterValue>> } | null => {
    const args = step.args ?? [];
    const asStaticNumber = (index: number): number | undefined => {
      const arg = args[index];
      return arg?.kind === 'static' && typeof arg.value === 'number' ? arg.value : undefined;
    };
    const asStaticString = (index: number): string | undefined => {
      const arg = args[index];
      return arg?.kind === 'static' && typeof arg.value === 'string' ? arg.value : undefined;
    };

    switch (step.functionName) {
      case 'substring': {
        const start = asStaticNumber(0) ?? 0;
        const length = asStaticNumber(1);
        return {
          actionId: 'text.substring',
          values: length === undefined ? { start } : { start, length },
        };
      }
      case 'replaceAll':
      case 'replace': {
        return {
          actionId: 'text.replace',
          values: {
            match: asStaticString(0) ?? '',
            replacement: asStaticString(1) ?? '',
            mode: step.functionName === 'replace' ? 'first' : 'all',
          },
        };
      }
      case 'split': {
        const delimiter = asStaticString(0) ?? ' ';
        const limit = asStaticNumber(1);
        return {
          actionId: 'text.split',
          values: limit === undefined ? { delimiter } : { delimiter, limit },
        };
      }
      case 'formatDate': {
        return {
          actionId: 'date.format',
          values: {
            inputFormat: asStaticString(0) ?? 'ISO8601',
            outputFormat: asStaticString(1) ?? 'YYYY-MM-DD',
          },
        };
      }
      case 'round': {
        return {
          actionId: 'number.round',
          values: { decimals: asStaticNumber(0) ?? 0 },
        };
      }
      case 'nth': {
        return {
          actionId: 'array.nth',
          values: { index: asStaticNumber(0) ?? 0 },
        };
      }
      case 'join': {
        return {
          actionId: 'array.join',
          values: { separator: asStaticString(0) ?? ',' },
        };
      }
      case 'cast': {
        return {
          actionId: 'convert.cast',
          values: { targetType: asStaticString(0) ?? 'string' },
        };
      }
      case 'default': {
        const fallbackArg = args[0];
        const fallbackExpression = fallbackArg?.kind === 'expression'
          ? fallbackArg.expression
          : fallbackArg?.kind === 'input'
            ? `source(${quoteDslString(fallbackArg.inputId)})`
            : typeof fallbackArg?.value === 'string'
              ? quoteDslString(fallbackArg.value)
              : typeof fallbackArg?.value === 'number' || typeof fallbackArg?.value === 'boolean'
                ? String(fallbackArg.value)
                : fallbackArg?.value === null
                  ? 'null'
                  : '""';

        const fallbackMode = fallbackArg?.kind === 'input'
          ? 'input'
          : fallbackArg?.kind === 'expression' && /^constant\("[\s\S]*"\)$/.test(fallbackExpression.trim())
            ? 'constant'
            : fallbackArg?.kind === 'static' && fallbackArg.value === null
              ? 'null'
              : 'fixed';

        const fallbackConstantName = (() => {
          if (fallbackMode !== 'constant') return 'DEFAULT_CONSTANT';
          const match = fallbackExpression.trim().match(/^constant\("([\s\S]*)"\)$/);
          return match?.[1]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\') ?? 'DEFAULT_CONSTANT';
        })();

        const fallbackInputId = (() => {
          if (fallbackArg?.kind === 'input') return fallbackArg.inputId;
          const match = fallbackExpression.trim().match(/^source\("([\s\S]*)"\)$/);
          const sourcePath = match?.[1]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\') ?? '';
          if (!sourcePath) return '';
          const matchedInput = hydration.draft.inputs.find((input) => input.path === sourcePath);
          return matchedInput?.id ?? '';
        })();

        const fallbackFixedString = fallbackArg?.kind === 'static' && typeof fallbackArg.value === 'string'
          ? fallbackArg.value
          : '';
        const fallbackFixedNumber = fallbackArg?.kind === 'static' && typeof fallbackArg.value === 'number'
          ? fallbackArg.value
          : 0;
        const fallbackFixedBoolean = fallbackArg?.kind === 'static' && typeof fallbackArg.value === 'boolean'
          ? fallbackArg.value
          : false;
        return {
          actionId: 'null.default',
          values: {
            fallbackMode,
            fallbackExpression,
            fallbackInputId,
            fallbackConstantName,
            fallbackFixedString,
            fallbackFixedNumber,
            fallbackFixedBoolean,
          },
        };
      }
      default:
        return null;
    }
  };

  const activeDropdownDefinition = openParameterDropdownId
    ? pendingParameterDefinitions.find((definition) =>
      definition.id === openParameterDropdownId
      && definition.kind === 'string'
      && (definition.options?.length ?? 0) > 0)
    : undefined;

  const activeDropdownOptions = (() => {
    if (!activeDropdownDefinition || !pendingActionDraft) return [];
    const rawQuery = String(pendingActionDraft.values[activeDropdownDefinition.id] ?? '').trim();
    const hasExactPreset = (activeDropdownDefinition.options ?? []).some(
      (option) => option.value === rawQuery,
    );
    const normalizedQuery = hasExactPreset ? '' : rawQuery.toLowerCase();
    return (activeDropdownDefinition.options ?? []).filter((option) => {
      if (!normalizedQuery) return true;
      return option.label.toLowerCase().includes(normalizedQuery)
        || option.value.toLowerCase().includes(normalizedQuery);
    });
  })();

  const shouldRenderParameterDropdown = Boolean(
    pendingActionDraft
    && openParameterDropdownId
    && activeDropdownDefinition
    && parameterDropdownPosition
    && activeDropdownOptions.length > 0,
  );

  const parameterEditorBlock = pendingActionDraft && pendingParameterDefinitions.length > 0
    ? (
      <div className="mt-3 rounded border border-slate-700 bg-slate-950/50 px-2.5 py-2" data-testid="smart-parameter-editor">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400" data-testid="smart-parameter-editor-title">
          Configure {pendingActionLabel}
        </p>

        <div className="mt-2 space-y-2" data-testid="smart-parameter-fields">
          {pendingActionDraft.actionId === 'null.default' ? (
            <div data-testid="smart-null-default-parameter-fields" className="space-y-2">
              <div>
                <p className="mb-1 block text-[11px] text-slate-300">Fallback value from</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { value: 'fixed', label: 'Fixed value' },
                    { value: 'input', label: 'Input field' },
                    { value: 'constant', label: 'Constant' },
                    { value: 'null', label: 'Null value' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      data-testid={`smart-null-default-mode-${option.value}`}
                      className={`rounded border px-2 py-1 text-left text-xs ${pendingNullDefaultFallbackMode === option.value ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500'}`}
                      onClick={() => onUpdateActionParameterDraft?.(pendingActionDraft.actionId, 'fallbackMode', option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {pendingNullDefaultFallbackMode === 'fixed' && (
                <div data-testid="smart-null-default-fixed-editor">
                  {targetType === 'number' || targetType === 'integer' ? (
                    <input
                      data-testid="smart-null-default-fixed-number"
                      type="number"
                      className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                      value={String(pendingNullDefaultFixedNumber)}
                      onChange={(event) => onUpdateActionParameterDraft?.(pendingActionDraft.actionId, 'fallbackFixedNumber', event.target.value)}
                    />
                  ) : targetType === 'boolean' ? (
                    <select
                      data-testid="smart-null-default-fixed-boolean"
                      className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                      value={pendingNullDefaultFixedBoolean ? 'true' : 'false'}
                      onChange={(event) => onUpdateActionParameterDraft?.(pendingActionDraft.actionId, 'fallbackFixedBoolean', event.target.value === 'true')}
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  ) : (
                    <input
                      data-testid="smart-null-default-fixed-string"
                      type="text"
                      className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                      value={pendingNullDefaultFixedString}
                      placeholder="Enter fallback value"
                      onChange={(event) => onUpdateActionParameterDraft?.(pendingActionDraft.actionId, 'fallbackFixedString', event.target.value)}
                    />
                  )}
                </div>
              )}

              {pendingNullDefaultFallbackMode === 'input' && (
                <div data-testid="smart-null-default-input-editor">
                  {pendingNullDefaultInputOptions.length > 0 ? (
                    <select
                      data-testid="smart-null-default-input-select"
                      className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                      value={pendingNullDefaultSelectedInputId}
                      onChange={(event) => onUpdateActionParameterDraft?.(pendingActionDraft.actionId, 'fallbackInputId', event.target.value)}
                    >
                      {pendingNullDefaultInputOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[11px] text-amber-300" data-testid="smart-null-default-input-empty">
                      Add an input to use as fallback.
                    </p>
                  )}
                </div>
              )}

              {pendingNullDefaultFallbackMode === 'constant' && (
                <div data-testid="smart-null-default-constant-editor">
                  <input
                    data-testid="smart-null-default-constant-input"
                    type="text"
                    className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                    value={pendingNullDefaultConstantName}
                    placeholder="DEFAULT_CONSTANT"
                    onChange={(event) => onUpdateActionParameterDraft?.(pendingActionDraft.actionId, 'fallbackConstantName', event.target.value)}
                  />
                </div>
              )}

              {pendingNullDefaultFallbackMode === 'null' && (
                <p className="text-[11px] text-slate-400" data-testid="smart-null-default-null-note">
                  Result will remain null when value is missing.
                </p>
              )}
            </div>
          ) : pendingParameterDefinitions.map((definition) => {
            const rawValue = pendingActionDraft.values[definition.id];
            const fieldError = actionParameterIssuesByFieldId.get(definition.id);
            const sharedInputClassName = [
              'h-8 w-full rounded border bg-slate-900 px-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none',
              fieldError ? 'border-red-700 focus:border-red-500' : 'border-slate-700 focus:border-blue-500',
            ].join(' ');

            return (
              <div key={definition.id} data-testid={`smart-parameter-field-${definition.id}`}>
                <label className="mb-1 block text-[11px] text-slate-300" htmlFor={`smart-parameter-input-${definition.id}`}>
                  {definition.label}{definition.required ? ' *' : ''}
                </label>

                {definition.kind === 'enum' ? (
                  <select
                    id={`smart-parameter-input-${definition.id}`}
                    data-testid={`smart-parameter-input-${definition.id}`}
                    className={sharedInputClassName}
                    value={typeof rawValue === 'string' ? rawValue : ''}
                    onChange={(event) => {
                      onUpdateActionParameterDraft?.(pendingActionDraft.actionId, definition.id, event.target.value);
                    }}
                  >
                    {(definition.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : definition.kind === 'boolean' ? (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-200" htmlFor={`smart-parameter-input-${definition.id}`}>
                    <input
                      id={`smart-parameter-input-${definition.id}`}
                      data-testid={`smart-parameter-input-${definition.id}`}
                      type="checkbox"
                      checked={Boolean(rawValue)}
                      onChange={(event) => {
                        onUpdateActionParameterDraft?.(pendingActionDraft.actionId, definition.id, event.target.checked);
                      }}
                    />
                    {definition.description ?? 'Enabled'}
                  </label>
                ) : (
                  (() => {
                    const hasStringOptions = definition.kind === 'string' && (definition.options?.length ?? 0) > 0;

                    return (
                      <input
                        id={`smart-parameter-input-${definition.id}`}
                        data-testid={`smart-parameter-input-${definition.id}`}
                        type={definition.kind === 'number' || definition.kind === 'integer' ? 'number' : 'text'}
                        step={definition.kind === 'integer' ? 1 : undefined}
                        min={definition.constraints?.min}
                        max={definition.constraints?.max}
                        value={rawValue === undefined ? '' : String(rawValue)}
                        onFocus={(event) => {
                          if (hasStringOptions) {
                            openParameterDropdown(definition.id, event.currentTarget);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape' && hasStringOptions) {
                            setOpenParameterDropdownId((current) => (current === definition.id ? null : current));
                            setParameterDropdownPosition(null);
                          }
                        }}
                        onChange={(event) => {
                          const nextValue: SmartBuilderActionParameterValue | '' = event.target.value;
                          onUpdateActionParameterDraft?.(pendingActionDraft.actionId, definition.id, nextValue);
                          if (hasStringOptions) {
                            openParameterDropdown(definition.id, event.currentTarget);
                          }
                        }}
                        onBlur={() => {
                          if (!hasStringOptions) return;
                          window.setTimeout(() => {
                            setOpenParameterDropdownId((current) => (current === definition.id ? null : current));
                            setParameterDropdownPosition(null);
                          }, 80);
                        }}
                        className={sharedInputClassName}
                      />
                    );
                  })()
                )}

                {fieldError && (
                  <p className="mt-1 text-[11px] text-red-400" data-testid={`smart-parameter-error-${definition.id}`}>
                    {fieldError}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {(!pendingActionDraft.validation.isValid || nullDefaultInputModeMissingInput) && (
          <p className="mt-2 text-[11px] text-red-400" data-testid="smart-parameter-editor-error">
            {nullDefaultInputModeMissingInput
              ? 'Add an input fallback before applying.'
              : 'Fix highlighted fields before applying.'}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            data-testid="smart-parameter-apply"
            className="rounded border border-blue-700 bg-blue-900/30 px-2 py-1 text-[11px] text-blue-100 enabled:hover:bg-blue-900/50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isParameterApplyDisabled}
            onClick={() => {
              const applyOptions = {
                ...(parameterEditorStepIndex === null ? {} : { editingStepIndex: parameterEditorStepIndex }),
                ...(parameterEditorStepScope ? { editingStepScope: parameterEditorStepScope } : {}),
                ...(parameterEditorStepScope === 'value-step' && parameterEditorValueStepTarget
                  ? { valueStepTarget: parameterEditorValueStepTarget }
                  : {}),
              };
              onApplyAction?.(pendingActionDraft.actionId, Object.keys(applyOptions).length > 0 ? applyOptions : undefined);
              if (pendingActionDraft.actionId === 'null.default') {
                onConditionFocusedSlotChange?.(null);
              }
              setParameterEditorStepIndex(null);
              setParameterEditorStepScope(null);
              setParameterEditorValueStepTarget(null);
            }}
          >
            {parameterApplyLabel}
          </button>
          <button
            type="button"
            data-testid="smart-parameter-reset"
            className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
            onClick={() => {
              onResetActionParameterDraft?.(pendingActionDraft.actionId);
            }}
          >
            Reset defaults
          </button>
          <button
            type="button"
            data-testid="smart-parameter-cancel"
            className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
              onClick={() => {
                if (pendingActionDraft.actionId === 'null.default') {
                  onConditionFocusedSlotChange?.(null);
                }
                setParameterEditorStepIndex(null);
                setParameterEditorStepScope(null);
                setParameterEditorValueStepTarget(null);
                onCancelActionParameterDraft?.();
              }}
            >
            Cancel
          </button>
        </div>
      </div>
    )
    : null;

  return (
    <section
      className={`flex h-full flex-col ${className}`}
      data-testid="smart-builder-panel"
      aria-label={`Smart builder for ${targetPath} (${targetType})`}
    >
      <div className="sr-only" aria-live="polite" data-testid="smart-action-live-region">{actionAnnouncement ?? ''}</div>

      <div className="min-h-0 flex-1 space-y-2.5 px-3 py-3">
        <div>
          {showUndoButton && (hydration.draft.undoHistory?.length ?? 0) > 0 && (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                data-testid="smart-undo-change"
                className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                onClick={() => onApplyAction?.('base.undo')}
                aria-label="Undo last Smart Builder change"
              >
                Undo
              </button>
            </div>
          )}

          <InputTray
            inputs={hydration.draft.inputs}
            usages={inputUsages}
            onRemoveInput={onInputRemove}
            onToggleAddInput={() => setShowAddInput((prev) => !prev)}
            showBuilderEmptyGuidance={showInitialStartGuidance}
          />

          <div className="mt-2" data-testid="smart-add-input-section">
            {showAddInput && (
              <div className="mt-2 rounded border border-slate-700 bg-slate-900/30 px-2.5 py-2" data-testid="smart-add-input-options">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Add input</p>
                <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="smart-add-enrichment"
                className="rounded border border-slate-700 px-2 py-1.5 text-left text-xs text-slate-200 hover:border-slate-500"
                onClick={() => {
                  onStageField?.({
                    path: 'field',
                    kind: 'enrichment',
                    alias: 'ENR1',
                    label: 'Enrichment input',
                    valueType: 'unknown',
                    expression: 'get(external("ENR1"), "field")',
                  });
                }}
              >
                Enrichment input
              </button>
                  {hasArrayScope && (
                    <>
                      <button
                        type="button"
                        data-testid="smart-add-item"
                        className="rounded border border-slate-700 px-2 py-1.5 text-left text-xs text-slate-200 enabled:hover:border-slate-500"
                        onClick={() => {
                          const input = hydration.draft.inputs.find((entry) => entry.sourceKind === 'item' && entry.path === 'value');
                          if (input) {
                            onInputToggle?.(input);
                            return;
                          }

                          onStageField?.({
                            path: 'value',
                            kind: 'item',
                            label: 'Array item',
                            valueType: 'unknown',
                            expression: 'item("value")',
                          });
                        }}
                      >
                        Item()
                      </button>
                      <button
                        type="button"
                        data-testid="smart-add-parent"
                        className="rounded border border-slate-700 px-2 py-1.5 text-left text-xs text-slate-200 enabled:hover:border-slate-500"
                        onClick={() => {
                          const input = hydration.draft.inputs.find((entry) => entry.sourceKind === 'parent' && entry.path === 'value');
                          if (input) {
                            onInputToggle?.(input);
                            return;
                          }

                          onStageField?.({
                            path: 'value',
                            kind: 'parent',
                            label: 'Array parent',
                            valueType: 'unknown',
                            expression: 'parent("value")',
                          });
                        }}
                      >
                        Parent()
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* coalesce editor is rendered inside Build Output with method-specific controls */}
        </div>

          {showBuildOutput && (
          <div className="rounded border border-slate-700 bg-slate-900/30 px-2.5 py-2" data-testid="smart-mapping-recipe">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Build Output</p>

            <div className="flex items-center justify-between" data-testid="smart-recipe-base-row">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Logic</p>
              {!isMethodNeedsAction && (
              <button
                type="button"
                data-testid="smart-recipe-change-base"
                className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                onClick={() => {
                  setPickerMode((prev) => (prev === 'base' ? null : 'base'));
                  setPickerQuery('');
                  setExpandedDisabledId(null);
                }}
              >
                Change logic
              </button>
              )}
            </div>

            <p className="mt-1 text-xs text-slate-100" data-testid="smart-recipe-base-label">{mappingMethodLabel}</p>
            {mappingMethodId === 'base.fixed' && hydration.draft.composition?.kind === 'direct' && hydration.draft.composition.value?.kind === 'static' && (
              <div className="mt-2 space-y-1" data-testid="smart-fixed-value-section">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Fixed value</p>
                {(targetType === 'number' || targetType === 'integer') ? (
                  <input
                    ref={(node) => {
                      fixedValueInputRef.current = node;
                    }}
                    type="number"
                    data-testid="smart-fixed-value-input"
                    className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                    value={
                      typeof hydration.draft.composition.value.value === 'number'
                        ? String(hydration.draft.composition.value.value)
                        : ''
                    }
                    aria-label={`Fixed value for ${targetPath}`}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const next = raw === '' ? '' : Number(raw);
                      onApplyAction?.('base.fixed', { fixedValue: next });
                    }}
                  />
                ) : targetType === 'boolean' ? (
                  <select
                    ref={(node) => {
                      fixedValueInputRef.current = node;
                    }}
                    data-testid="smart-fixed-value-boolean"
                    className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                    value={typeof hydration.draft.composition.value.value === 'boolean'
                      ? (hydration.draft.composition.value.value ? 'true' : 'false')
                      : ''}
                    aria-label={`Fixed value for ${targetPath}`}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const next = raw === 'true' ? true : raw === 'false' ? false : '';
                      onApplyAction?.('base.fixed', { fixedValue: next });
                    }}
                  >
                    <option value="">Select fixed value</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : targetType === 'null' ? (
                  <button
                    type="button"
                    data-testid="smart-fixed-value-use-null"
                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-slate-500"
                    onClick={() => {
                      onApplyAction?.('base.fixed', { fixedValue: null, fixedValueExplicitlySet: true });
                    }}
                  >
                    Use null
                  </button>
                ) : (
                  <input
                    ref={(node) => {
                      fixedValueInputRef.current = node;
                    }}
                    type="text"
                    data-testid="smart-fixed-value-input"
                    className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                    value={
                      typeof hydration.draft.composition.value.value === 'string'
                        ? hydration.draft.composition.value.value
                        : ''
                    }
                    placeholder="Enter fixed value"
                    aria-label={`Fixed value for ${targetPath}`}
                    onChange={(event) => {
                      onApplyAction?.('base.fixed', { fixedValue: event.target.value });
                    }}
                  />
                )}
                {targetType === 'string' && (
                  <button
                    type="button"
                    data-testid="smart-fixed-value-use-empty-string"
                    className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                    onClick={() => {
                      onApplyAction?.('base.fixed', { fixedValue: '', fixedValueExplicitlySet: true });
                    }}
                  >
                    Use empty string
                  </button>
                )}
              </div>
            )}
            {effectivePickerMode === 'base' && (
              <div className="mt-3 rounded border border-slate-700 bg-slate-950/50 px-2.5 py-2" data-testid="smart-base-picker">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Choose output logic
                  </p>
                  {!isMethodNeedsAction && (
                    <button
                      type="button"
                      className="text-[11px] text-slate-500 hover:text-slate-300"
                      data-testid="smart-picker-close"
                      onClick={() => setPickerMode(null)}
                    >
                      Close
                    </button>
                  )}
                </div>

                <div className="mt-2 space-y-1.5" data-testid="smart-picker-enabled-actions">
                  {basePickerActions.filter((action) => action.enabled).map((action) => (
                    <div key={action.id}>
                      <button
                        type="button"
                        data-testid={`smart-picker-action-${action.id}`}
                        className="w-full rounded border border-slate-700 bg-slate-900/70 px-2 py-1.5 text-left text-xs text-slate-100 hover:border-slate-500"
                        onClick={() => {
                          const parameterDefinitions = getSmartBuilderActionParameters(action.id);
                          if (parameterDefinitions.length > 0) {
                            onBeginActionParameterEdit?.(action.id);
                            setParameterEditorStepIndex(null);
                            setParameterEditorStepScope(null);
                            setParameterEditorValueStepTarget(null);
                            setPickerMode(null);
                            return;
                          }

                          onApplyAction?.(action.id);
                          setParameterEditorStepIndex(null);
                          setParameterEditorStepScope(null);
                          setParameterEditorValueStepTarget(null);
                          setPickerMode(null);
                        }}
                      >
                        {action.label}
                      </button>
                    </div>
                  ))}
                </div>

                {basePickerActions.some((action) => !action.enabled) && (
                  <details className="mt-2" data-testid="smart-base-picker-unavailable">
                    <summary className="cursor-pointer text-[11px] text-slate-400">Unavailable options</summary>
                    <ul className="mt-1 space-y-1.5" data-testid="smart-base-picker-unavailable-list">
                      {basePickerActions.filter((action) => !action.enabled).map((action) => (
                        <li
                          key={`unavailable-${action.id}`}
                          className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5"
                          data-testid={`smart-picker-disabled-${action.id}`}
                        >
                          <p className="text-xs text-slate-300">{action.label}</p>
                          {action.reason && <p className="text-[11px] text-slate-500">{action.reason}</p>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {mappingMethodId === 'base.direct' && !defaultPrimaryInput && (
              <p className="mt-1 text-xs text-slate-400" data-testid="smart-recipe-base-empty-direct">Select an input to continue.</p>
            )}
            {mappingMethodId === 'base.direct' && hydration.draft.inputs.length > 0 && (
              <div className="mt-2 space-y-1" data-testid="smart-direct-value-section">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Selected value</p>
                <div className="space-y-1" role="radiogroup" aria-label="Use one value">
                  {hydration.draft.inputs.map((input) => {
                    const selected = input.id === defaultPrimaryInput?.id;
                    const selectedValue = (() => {
                      if (!selected) return null;

                      const composition = hydration.draft.composition;
                      if (composition?.kind === 'direct') {
                        if (composition.value?.kind === 'input' && composition.value.inputId === input.id) {
                          const directTransforms = composition.value.transforms ?? [];
                          return {
                            ...composition.value,
                            transforms: directTransforms.length > 0 ? directTransforms : (hydration.draft.postSteps ?? []),
                          };
                        }
                        const seededTransforms = input.transforms ?? [];
                        return {
                          kind: 'input',
                          inputId: input.id,
                          transforms: seededTransforms.length > 0 ? seededTransforms : (hydration.draft.postSteps ?? []),
                        } as BuilderArgumentValue;
                      }

                      if (composition?.kind === 'default' && composition.inputId === input.id) {
                        return {
                          kind: 'input',
                          inputId: input.id,
                          transforms: [
                            ...(input.transforms ?? []),
                            { functionName: 'default', args: [composition.fallback] },
                          ],
                        } as BuilderArgumentValue;
                      }

                      return {
                        kind: 'input',
                        inputId: input.id,
                        transforms: input.transforms ?? [],
                      } as BuilderArgumentValue;
                    })();
                    return (
                      <div key={input.id}>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            data-testid={`smart-direct-value-option-${input.id}`}
                            className={`flex-1 rounded border px-2 py-1.5 text-left text-xs ${selected ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-slate-700 bg-slate-900/70 text-slate-100 hover:border-slate-500'}`}
                            onClick={() => {
                              if (selected) return;
                              onApplyAction?.('base.direct.select', { directInputId: input.id });
                            }}
                          >
                            {input.label}
                          </button>
                          {selected && (
                            <button
                              type="button"
                              data-testid="smart-direct-value-add-step"
                              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-slate-500"
                              aria-label={`Add step for ${input.label}`}
                              onClick={() => {
                                setStepPickerScope({ kind: 'direct' });
                                setPickerMode('step');
                                setOpenConcatPartMenuIndex(null);
                                setPickerQuery('');
                                setExpandedDisabledId(null);
                              }}
                            >
                              + Add transformation
                            </button>
                          )}
                        </div>

                        {selected && stepPickerScope !== 'result' && stepPickerBlock}

                        {selected && selectedValue && (selectedValue.transforms?.length ?? 0) > 0 && (
                          <ol className="mt-1 space-y-1 pl-3" data-testid="smart-direct-value-steps-list">
                            {(selectedValue.transforms ?? []).map((step, stepIndex) => (
                              <li key={`direct-step-${step.functionName}-${stepIndex}`} className="rounded border border-slate-800 bg-slate-950/30 px-2 py-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-slate-300">{step.functionName}</span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      data-testid={`smart-direct-value-step-move-up-${stepIndex}`}
                                      disabled={stepIndex === 0}
                                      className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-200 disabled:opacity-50"
                                      aria-label={`Move ${step.functionName} step up for ${input.label}`}
                                      onClick={() => onApplyAction?.('base.valueStep.move', {
                                        valueStepTarget: { kind: 'direct' },
                                        valueStepMove: { fromIndex: stepIndex, toIndex: stepIndex - 1 },
                                      })}
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`smart-direct-value-step-move-down-${stepIndex}`}
                                      disabled={stepIndex >= (selectedValue.transforms?.length ?? 0) - 1}
                                      className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-200 disabled:opacity-50"
                                      aria-label={`Move ${step.functionName} step down for ${input.label}`}
                                      onClick={() => onApplyAction?.('base.valueStep.move', {
                                        valueStepTarget: { kind: 'direct' },
                                        valueStepMove: { fromIndex: stepIndex, toIndex: stepIndex + 1 },
                                      })}
                                    >
                                      ↓
                                    </button>
                                    {(() => {
                                      const parameterized = resolveParameterizedActionForTransformStep(step);
                                      if (!parameterized) return null;
                                      return (
                                        <button
                                          type="button"
                                          data-testid={`smart-direct-value-step-edit-${stepIndex}`}
                                          className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200"
                                          onClick={() => {
                                            onBeginActionParameterEdit?.(parameterized.actionId, parameterized.values);
                                            setParameterEditorStepIndex(stepIndex);
                                            setParameterEditorStepScope('value-step');
                                            setParameterEditorValueStepTarget({ kind: 'direct' });
                                          }}
                                        >
                                          Edit
                                        </button>
                                      );
                                    })()}
                                    <button
                                      type="button"
                                      data-testid={`smart-direct-value-step-remove-${stepIndex}`}
                                      className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200"
                                      aria-label={`Remove ${step.functionName} step from ${input.label}`}
                                      onClick={() => onApplyAction?.('base.valueStep.remove', {
                                        valueStepTarget: { kind: 'direct' },
                                        valueStepRemoveIndex: stepIndex,
                                      })}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {shouldRenderMethodPreview && (
              <p className="mt-1 text-xs text-slate-400" data-testid="smart-recipe-base-preview">{composePreview}</p>
            )}

            {mappingMethodId === 'condition.compare' && conditionComposition && conditionComposition.clauses.length > 0 && (
              <div className="mt-3 rounded border border-slate-800 bg-slate-950/30 px-2.5 py-2" data-testid="smart-condition-editor">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">IF</p>
                  {(conditionComposition.clauses[0]?.predicates.length ?? 0) > 1 && (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-300" htmlFor="smart-condition-match-mode-select">
                      Apply to
                      <select
                        id="smart-condition-match-mode-select"
                        data-testid="smart-condition-match-mode-select"
                        className="h-7 rounded border border-slate-700 bg-slate-900 px-2 text-[11px] text-slate-100"
                        value={conditionComposition.matchMode}
                        onChange={(event) => {
                          const nextMode = event.target.value === 'any' ? 'any' : 'all';
                          updateCondition({ ...conditionComposition, matchMode: nextMode });
                        }}
                      >
                        <option value="all">All</option>
                        <option value="any">Any</option>
                      </select>
                      conditions
                    </label>
                  )}
                </div>

                <div className="mt-2 space-y-2" data-testid="smart-condition-rows">
                  {(conditionComposition.clauses[0]?.predicates ?? []).map((predicate, index) => (
                    <div key={`predicate-${index}`} className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5" data-testid={`smart-condition-row-${index}`}>
                      {index > 0 && (
                        <p className="mb-1 text-[11px] text-slate-400" data-testid={`smart-condition-row-joiner-${index}`}>
                          {conditionComposition.matchMode === 'any' ? 'OR' : 'AND'}
                        </p>
                      )}
                      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-1.5">
                        <div>
                          <button
                            type="button"
                            data-testid={`smart-condition-left-${index}`}
                            ref={(element) => {
                              if (element) {
                                conditionSlotButtonRefs.current.set(`left-${index}`, element);
                                return;
                              }
                              conditionSlotButtonRefs.current.delete(`left-${index}`);
                            }}
                            className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-left text-xs text-slate-100 hover:border-slate-500"
                            onClick={() => {
                              openConditionSlotPicker(`left-${index}`, 'input');
                              onConditionFocusedSlotChange?.('condition:left');
                            }}
                          >
                            {describeConditionValue(predicate.left) || 'Select value'}
                          </button>
                          {activeConditionSlot === `left-${index}` && renderConditionValuePicker(
                            `left-${index}`,
                            conditionComposition,
                            resolveBuilderArgumentValueType(hydration.draft, predicate.left),
                          )}
                        </div>
                        <select
                          data-testid={`smart-condition-operator-${index}`}
                          className="h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                          value={predicate.operator}
                          onChange={(event) => {
                            const operator = event.target.value as BuilderPredicate['operator'];
                            const predicates = (conditionComposition.clauses[0]?.predicates ?? []).map((entry, rowIndex) =>
                              rowIndex === index
                                ? {
                                  ...entry,
                                  operator,
                                  ...(operator === 'isNull' || operator === 'isNotNull' || operator === 'isTruthy' || operator === 'isFalsy'
                                    ? { right: undefined }
                                    : entry.right ? {} : { right: { kind: 'static' as const, value: '' } }),
                                }
                                : entry,
                            );
                            updateCondition({
                              ...conditionComposition,
                              clauses: [
                                {
                                  ...conditionComposition.clauses[0]!,
                                  predicates,
                                },
                                ...conditionComposition.clauses.slice(1),
                              ],
                            });
                          }}
                        >
                          {getAllowedConditionOperatorsForLeftType(
                            resolveBuilderArgumentValueType(hydration.draft, predicate.left),
                          ).map((operator) => (
                            <option key={operator} value={operator}>{toOperatorLabel(operator)}</option>
                          ))}
                        </select>
                        {(predicate.operator === 'isNull' || predicate.operator === 'isNotNull' || predicate.operator === 'isTruthy' || predicate.operator === 'isFalsy') ? (
                          <span className="pt-2 text-[11px] text-slate-500">No value needed</span>
                        ) : (
                          <div>
                          <button
                            type="button"
                            data-testid={`smart-condition-right-${index}`}
                            ref={(element) => {
                              if (element) {
                                conditionSlotButtonRefs.current.set(`right-${index}`, element);
                                return;
                              }
                              conditionSlotButtonRefs.current.delete(`right-${index}`);
                            }}
                            className="h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-left text-xs text-slate-100 hover:border-slate-500"
                            onClick={() => {
                              openConditionSlotPicker(`right-${index}`, predicate.right?.kind === 'static' ? 'fixed' : 'input');
                                onConditionFocusedSlotChange?.('condition:right');
                              }}
                            >
                              {describeConditionValue(predicate.right ?? { kind: 'static', value: '' }) || 'Select value'}
                            </button>
                            {activeConditionSlot === `right-${index}` && renderConditionValuePicker(
                              `right-${index}`,
                              conditionComposition,
                              resolveBuilderArgumentValueType(hydration.draft, predicate.left),
                            )}
                          </div>
                        )}
                      </div>

                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  data-testid="smart-condition-add"
                  aria-label="Add condition"
                  className="mt-2 rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                  onClick={() => {
                    const firstPredicate = conditionComposition.clauses[0]?.predicates[0];
                    const nextPredicate: BuilderPredicate = {
                      left: firstPredicate?.left ?? { kind: 'static', value: '' },
                      operator: 'eq',
                      right: { kind: 'static', value: '' },
                    };
                    updateCondition({
                      ...conditionComposition,
                      clauses: [
                        {
                          ...conditionComposition.clauses[0]!,
                          predicates: [...(conditionComposition.clauses[0]?.predicates ?? []), nextPredicate],
                        },
                        ...conditionComposition.clauses.slice(1),
                      ],
                    });
                  }}
                >
                  + Add condition
                </button>

                {conditionCompatibilityIssues.length > 0 && (
                  <div
                    className="mt-2 rounded border border-red-700/60 bg-red-950/20 px-2 py-1.5"
                    data-testid="smart-condition-compatibility-errors"
                  >
                    <p className="text-[11px] text-red-300">Incompatible condition values detected:</p>
                    <ul className="mt-1 list-disc pl-4 text-[11px] text-red-200">
                      {conditionCompatibilityIssues.map((issue, issueIndex) => (
                        <li key={`condition-issue-${issue.clauseIndex}-${issue.predicateIndex}-${issueIndex}`}>
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2">
                      <button
                        type="button"
                        data-testid="smart-condition-transform-affordance"
                        className="rounded border border-red-600/60 px-2 py-0.5 text-[11px] text-red-200 hover:border-red-500"
                        onClick={() => onConditionFocusedSlotChange?.('condition:left')}
                      >
                        Add transform to selected field
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">THEN</p>
                    <button
                      type="button"
                      data-testid="smart-condition-then"
                      ref={(element) => {
                        if (element) {
                          conditionSlotButtonRefs.current.set('then', element);
                          return;
                        }
                        conditionSlotButtonRefs.current.delete('then');
                      }}
                      aria-label="THEN value"
                      className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-left text-xs text-slate-100 hover:border-slate-500"
                      onClick={() => {
                        openConditionSlotPicker('then', conditionComposition.clauses[0]?.thenOutput.kind === 'static' ? 'fixed' : 'input');
                        onConditionFocusedSlotChange?.('condition:then');
                      }}
                    >
                      {describeConditionValue(conditionComposition.clauses[0]?.thenOutput ?? { kind: 'static', value: '' }) || 'Select value'}
                    </button>
                    {activeConditionSlot === 'then' && renderConditionValuePicker(
                      'then',
                      conditionComposition,
                      hydration.draft.targetType,
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">OTHERWISE</p>
                    <button
                      type="button"
                      data-testid="smart-condition-otherwise"
                      ref={(element) => {
                        if (element) {
                          conditionSlotButtonRefs.current.set('otherwise', element);
                          return;
                        }
                        conditionSlotButtonRefs.current.delete('otherwise');
                      }}
                      aria-label="OTHERWISE value"
                      className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-left text-xs text-slate-100 hover:border-slate-500"
                      onClick={() => {
                        openConditionSlotPicker('otherwise', conditionComposition.elseOutput.kind === 'static' ? 'fixed' : 'input');
                        onConditionFocusedSlotChange?.('condition:else');
                      }}
                    >
                      {describeConditionValue(conditionComposition.elseOutput) || 'Select value'}
                    </button>
                    {activeConditionSlot === 'otherwise' && renderConditionValuePicker(
                      'otherwise',
                      conditionComposition,
                      hydration.draft.targetType,
                    )}
                  </div>
                </div>

                <div
                  className={`mt-3 rounded border px-2 py-1.5 ${conditionValidationState?.status === 'ready'
                    ? 'border-emerald-700/40 bg-emerald-950/20'
                    : conditionValidationState?.status === 'invalid'
                      ? 'border-red-700/60 bg-red-950/20'
                      : 'border-amber-700/60 bg-amber-950/20'}`}
                  data-testid="smart-condition-status"
                >
                  {conditionValidationState?.status === 'ready' ? (
                    <p className="text-[11px] text-emerald-300" data-testid="smart-condition-status-ready">
                      {conditionValidationState.message}
                    </p>
                  ) : conditionValidationState?.status === 'invalid' ? (
                    <p className="text-[11px] text-red-200" data-testid="smart-condition-status-blocked">
                      {conditionValidationState.message}
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-200" data-testid="smart-condition-status-blocked">
                      {conditionValidationState?.message ?? 'Finish condition values to continue.'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {mappingMethodId === 'text.concat' && (
            <div className="mt-2" data-testid="smart-concat-parts-controls">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Combine parts</p>
                <div className="flex flex-wrap gap-1">
                  {[
                    { key: 'space', label: 'Space', value: ' ' },
                    { key: 'comma', label: 'Comma', value: ', ' },
                    { key: 'dash', label: 'Dash', value: '-' },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      data-testid={`smart-concat-add-literal-${option.key}`}
                      className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                      onClick={() => {
                        const current = hydration.draft.composition?.kind === 'concat'
                          ? (hydration.draft.composition.parts ?? [])
                          : [];
                        onApplyAction?.('text.concat', {
                          concatParts: [...current, { kind: 'static', value: option.value }],
                        });
                      }}
                    >
                      + {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {hydration.draft.composition?.kind === 'concat' && (hydration.draft.composition.parts?.length ?? 0) > 0 ? (
                <ol className="mt-2 space-y-1" data-testid="smart-concat-parts-list">
                  {(hydration.draft.composition.parts ?? []).map((part, index, parts) => {
                    const label = part.kind === 'input'
                      ? (hydration.draft.inputs.find((input) => input.id === part.inputId)?.label ?? 'input')
                      : part.kind === 'static'
                        ? literalToDsl(part.value)
                        : part.expression;
                    return (
                      <li key={`concat-part-${index}`} className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5" data-testid={`smart-concat-part-${index}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-200">{label}</span>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              data-testid={`smart-concat-move-up-${index}`}
                              disabled={index === 0}
                              className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 enabled:hover:border-slate-500 disabled:opacity-40"
                              aria-label={`Move ${label} up`}
                              onClick={() => onApplyAction?.('text.concat', { concatMove: { fromIndex: index, toIndex: index - 1 } })}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              data-testid={`smart-concat-move-down-${index}`}
                              disabled={index >= parts.length - 1}
                              className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 enabled:hover:border-slate-500 disabled:opacity-40"
                              aria-label={`Move ${label} down`}
                              onClick={() => onApplyAction?.('text.concat', { concatMove: { fromIndex: index, toIndex: index + 1 } })}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              data-testid={`smart-concat-part-menu-toggle-${index}`}
                              className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                              aria-label={`Open menu for ${label}`}
                              onClick={() => {
                                setOpenConcatPartMenuIndex((prev) => (prev === index ? null : index));
                              }}
                            >
                              ⋮
                            </button>
                          </div>
                        </div>

                        {openConcatPartMenuIndex === index && (
                          <div className="mt-1 rounded border border-slate-800 bg-slate-950/40 p-1" data-testid={`smart-concat-part-menu-${index}`}>
                            <button
                              type="button"
                              data-testid={`smart-concat-part-menu-add-step-${index}`}
                              className="w-full rounded px-2 py-1 text-left text-[11px] text-slate-200 hover:bg-slate-800"
                              onClick={() => {
                                setStepPickerScope({ kind: 'concat-part', partIndex: index });
                                setPickerMode('step');
                                setOpenConcatPartMenuIndex(null);
                                setPickerQuery('');
                                setExpandedDisabledId(null);
                              }}
                            >
                              Add transformation
                            </button>
                            {part.kind !== 'expression' && (
                              <button
                                type="button"
                                data-testid={`smart-concat-part-menu-replace-${index}`}
                                className="mt-0.5 w-full rounded px-2 py-1 text-left text-[11px] text-slate-200 hover:bg-slate-800"
                                onClick={() => {
                                  setOpenConcatPartMenuIndex(null);
                                }}
                              >
                                Replace value
                              </button>
                            )}
                            {part.kind === 'static' && (
                              <button
                                type="button"
                                data-testid={`smart-concat-part-menu-edit-${index}`}
                                className="mt-0.5 w-full rounded px-2 py-1 text-left text-[11px] text-slate-200 hover:bg-slate-800"
                                onClick={() => {
                                  const nextLiteral = window.prompt('Edit literal value', typeof part.value === 'string' ? part.value : String(part.value ?? ''));
                                  if (nextLiteral === null) return;
                                  const current = hydration.draft.composition?.kind === 'concat'
                                    ? [...(hydration.draft.composition.parts ?? [])]
                                    : [];
                                  const targetPart = current[index];
                                  if (!targetPart || targetPart.kind !== 'static') return;
                                  current[index] = { ...targetPart, value: nextLiteral };
                                  onApplyAction?.('text.concat', { concatParts: current });
                                  setOpenConcatPartMenuIndex(null);
                                }}
                              >
                                Edit value
                              </button>
                            )}
                            <button
                              type="button"
                              data-testid={`smart-concat-part-menu-remove-${index}`}
                              className="mt-0.5 w-full rounded px-2 py-1 text-left text-[11px] text-slate-200 hover:bg-slate-800"
                              onClick={() => {
                                onApplyAction?.('text.concat', {
                                  concatParts: parts.filter((_, partIndex) => partIndex !== index),
                                });
                                setOpenConcatPartMenuIndex(null);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        )}

                        {stepPickerScope !== 'result'
                          && stepPickerScope.kind === 'concat-part'
                          && stepPickerScope.partIndex === index
                          && stepPickerBlock}

                        {(part.transforms?.length ?? 0) > 0 && (
                          <ol className="mt-1 space-y-1 pl-3" data-testid={`smart-concat-part-steps-${index}`}>
                            {(part.transforms ?? []).map((step, stepIndex) => (
                              <li key={`concat-part-step-${index}-${step.functionName}-${stepIndex}`} className="rounded border border-slate-800 bg-slate-950/30 px-2 py-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-slate-300">{step.functionName}</span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      data-testid={`smart-concat-part-step-move-up-${index}-${stepIndex}`}
                                      disabled={stepIndex === 0}
                                      className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-200 disabled:opacity-50"
                                      aria-label={`Move ${step.functionName} step up for ${label}`}
                                      onClick={() => onApplyAction?.('base.valueStep.move', {
                                        valueStepTarget: { kind: 'concat-part', partIndex: index },
                                        valueStepMove: { fromIndex: stepIndex, toIndex: stepIndex - 1 },
                                      })}
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`smart-concat-part-step-move-down-${index}-${stepIndex}`}
                                      disabled={stepIndex >= (part.transforms?.length ?? 0) - 1}
                                      className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-200 disabled:opacity-50"
                                      aria-label={`Move ${step.functionName} step down for ${label}`}
                                      onClick={() => onApplyAction?.('base.valueStep.move', {
                                        valueStepTarget: { kind: 'concat-part', partIndex: index },
                                        valueStepMove: { fromIndex: stepIndex, toIndex: stepIndex + 1 },
                                      })}
                                    >
                                      ↓
                                    </button>
                                    {(() => {
                                      const parameterized = resolveParameterizedActionForTransformStep(step);
                                      if (!parameterized) return null;
                                      return (
                                        <button
                                          type="button"
                                          data-testid={`smart-concat-part-step-edit-${index}-${stepIndex}`}
                                          className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200"
                                          onClick={() => {
                                            onBeginActionParameterEdit?.(parameterized.actionId, parameterized.values);
                                            setParameterEditorStepIndex(stepIndex);
                                            setParameterEditorStepScope('value-step');
                                            setParameterEditorValueStepTarget({ kind: 'concat-part', partIndex: index });
                                          }}
                                        >
                                          Edit
                                        </button>
                                      );
                                    })()}
                                    <button
                                      type="button"
                                      data-testid={`smart-concat-part-step-remove-${index}-${stepIndex}`}
                                      className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200"
                                      aria-label={`Remove ${step.functionName} step from ${label}`}
                                      onClick={() => onApplyAction?.('base.valueStep.remove', {
                                        valueStepTarget: { kind: 'concat-part', partIndex: index },
                                        valueStepRemoveIndex: stepIndex,
                                      })}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="mt-1 text-xs text-slate-400" data-testid="smart-concat-parts-empty">No parts yet.</p>
              )}

              <div className="mt-2 flex flex-wrap gap-1">
                {hydration.draft.inputs.map((input) => (
                  <button
                    key={`concat-add-input-${input.id}`}
                    type="button"
                    data-testid={`smart-concat-add-input-${input.id}`}
                    className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                    onClick={() => {
                      const current = hydration.draft.composition?.kind === 'concat'
                        ? (hydration.draft.composition.parts ?? [])
                        : [];
                      onApplyAction?.('text.concat', {
                        concatParts: [...current, { kind: 'input', inputId: input.id }],
                      });
                    }}
                  >
                    + {input.label}
                  </button>
                ))}
              </div>
            </div>
          )}

            {mappingMethodId === 'null.coalesce' && hydration.draft.composition?.kind === 'coalesce' && (
              <div className="mt-2" data-testid="smart-coalesce-values-controls">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-slate-400">Ordered values</p>
                </div>

                {(hydration.draft.composition.values?.length ?? 0) > 0 ? (
                  <ol className="mt-2 space-y-1" data-testid="smart-coalesce-values-list">
                    {(hydration.draft.composition.values ?? []).map((value, index, values) => {
                      const label = value.kind === 'input'
                        ? (hydration.draft.inputs.find((input) => input.id === value.inputId)?.label ?? 'input')
                        : value.kind === 'static'
                          ? literalToDsl(value.value)
                          : value.expression;
                      return (
                        <li key={`coalesce-value-${index}`} className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5" data-testid={`smart-coalesce-value-${index}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-200">{label}</span>
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                data-testid={`smart-coalesce-move-up-${index}`}
                                disabled={index === 0}
                                className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 enabled:hover:border-slate-500 disabled:opacity-40"
                                onClick={() => onApplyAction?.('null.coalesce', { coalesceMove: { fromIndex: index, toIndex: index - 1 } })}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                data-testid={`smart-coalesce-move-down-${index}`}
                                disabled={index >= values.length - 1}
                                className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 enabled:hover:border-slate-500 disabled:opacity-40"
                                onClick={() => onApplyAction?.('null.coalesce', { coalesceMove: { fromIndex: index, toIndex: index + 1 } })}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                data-testid={`smart-coalesce-remove-value-${index}`}
                                className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                                onClick={() => onApplyAction?.('null.coalesce', {
                                  coalesceValues: values.filter((_, valueIndex) => valueIndex !== index),
                                })}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="mt-1 text-xs text-slate-400" data-testid="smart-coalesce-values-empty">No values yet.</p>
                )}

                <div className="mt-2 flex flex-wrap gap-1">
                  {hydration.draft.inputs.map((input) => (
                    <button
                      key={`coalesce-add-input-${input.id}`}
                      type="button"
                      data-testid={`smart-coalesce-add-input-${input.id}`}
                      className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                      onClick={() => {
                        const current = hydration.draft.composition?.kind === 'coalesce'
                          ? (hydration.draft.composition.values ?? [])
                          : [];
                        onApplyAction?.('null.coalesce', {
                          coalesceValues: [...current, { kind: 'input', inputId: input.id }],
                        });
                      }}
                    >
                      + {input.label}
                    </button>
                  ))}
                </div>

                <div className="mt-2 rounded border border-slate-800 bg-slate-950/30 px-2 py-1.5" data-testid="smart-coalesce-fallback-controls">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-400">Optional fallback</p>
                    {hydration.draft.composition.fallback && (
                      <button
                        type="button"
                        data-testid="smart-coalesce-fallback-clear"
                        className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                        onClick={() => onApplyAction?.('null.coalesce', { clearCoalesceFallback: true })}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    data-testid="smart-coalesce-fallback-input"
                    className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                    placeholder="Fallback value"
                    value={hydration.draft.composition.fallback?.kind === 'static' ? String(hydration.draft.composition.fallback.value ?? '') : ''}
                    onChange={(event) => onApplyAction?.('null.coalesce', { coalesceFallbackValue: event.target.value })}
                  />
                </div>
              </div>
            )}

          {mappingMethodId === 'lookup.valueMap' && valueMapProjectState && valueMapComposition && (
            <div className="mt-3 rounded border border-slate-800 bg-slate-950/30 px-2.5 py-2" data-testid="smart-value-map-config">
              <div className="mb-2 rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5" data-testid="smart-value-map-lookup-selector">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Lookup value</p>
                  <span className="text-[11px] text-blue-300">Used as lookup value</span>
                </div>
                <div className="mt-1 space-y-1" role="radiogroup" aria-label="Value mapping lookup value">
                  {hydration.draft.inputs.map((input) => {
                    const selected = valueMapComposition.inputId === input.id;
                    return (
                      <button
                        key={`smart-value-map-lookup-${input.id}`}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        data-testid={`smart-value-map-lookup-option-${input.id}`}
                        className={`w-full rounded border px-2 py-1 text-left text-xs ${selected ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-slate-700 bg-slate-900/70 text-slate-100 hover:border-slate-500'}`}
                        onClick={() => {
                          if (selected) return;
                          onApplyAction?.('lookup.valueMap', {
                            directInputId: input.id,
                            valueMapScope: valueMapProjectState.scope,
                            valueMapProjectSelection: valueMapComposition.project
                              ? {
                                matchMode: valueMapComposition.project.matchMode
                                  ?? (valueMapProjectState.matchMode === 'ignore-case' ? 'ignore-case' : 'exact'),
                                ref: valueMapComposition.project.ref,
                              }
                              : undefined,
                            valueMapMatchMode: valueMapProjectState.matchMode === 'ignore-case' ? 'ignore-case' : 'exact',
                            valueMapNoMatchMode: valueMapProjectState.noMatchMode,
                            valueMapFallbackValue: valueMapProjectState.fallbackValue,
                          });
                        }}
                      >
                        {input.label}
                      </button>
                    );
                  })}
                </div>
                {valueMapLookupInput && (
                  <p className="mt-1 text-[11px] text-slate-400" data-testid="smart-value-map-lookup-current">
                    Current lookup: {valueMapLookupInput.label}
                  </p>
                )}
              </div>

              <p className="text-[11px] uppercase tracking-wide text-slate-500">Value table scope</p>
              <div className="mt-1 flex gap-1.5" role="group" aria-label="Value map scope">
                <button
                  type="button"
                  data-testid="smart-value-map-scope-inline"
                  className={`rounded border px-2 py-1 text-[11px] ${valueMapProjectState.scope === 'inline' ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                  onClick={() => onValueMapScopeChange?.('inline')}
                >
                  Inline value map
                </button>
                <button
                  type="button"
                  data-testid="smart-value-map-scope-project"
                  className={`rounded border px-2 py-1 text-[11px] ${valueMapProjectState.scope === 'project' ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                  onClick={() => onValueMapScopeChange?.('project')}
                >
                  Project value table
                </button>
              </div>

              {valueMapProjectState.scope === 'project' ? (
                <>
                  <label className="mt-2 block text-[11px] text-slate-400" htmlFor="smart-value-map-table-select">Project table</label>
                  <select
                    id="smart-value-map-table-select"
                    data-testid="smart-value-map-table-select"
                    className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                    value={valueMapProjectState.tableId ?? ''}
                    onChange={(event) => {
                      if (event.target.value) onValueMapProjectTableSelect?.(event.target.value);
                    }}
                  >
                    <option value="">Select project table…</option>
                    {valueMapProjectState.availableTables.map((table) => (
                      <option key={table.tableId} value={table.tableId}>
                        {table.label} · r{table.revision} · {table.rowCount} rows
                      </option>
                    ))}
                  </select>

                  {valueMapProjectState.directionOptions.length > 0 && (
                    <div className="mt-2" data-testid="smart-value-map-direction-group">
                      <p className="text-[11px] text-slate-400">Lookup direction</p>
                      <div className="mt-1 space-y-1">
                        {valueMapProjectState.directionOptions.map((option) => (
                          <button
                            key={option.direction}
                            type="button"
                            data-testid={`smart-value-map-direction-${option.direction}`}
                            disabled={!option.enabled}
                            className={`w-full rounded border px-2 py-1 text-left text-[11px] ${valueMapProjectState.direction === option.direction ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-slate-700 text-slate-200'} disabled:cursor-not-allowed disabled:opacity-50`}
                            onClick={() => onValueMapDirectionSelect?.(option.direction)}
                          >
                            <span>{option.label}</span>
                            {!option.enabled && option.reason && (
                              <span className="ml-2 text-slate-400">{option.reason}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {valueMapProjectState.newerRevisionAvailable && (
                    <div className="mt-2 rounded border border-amber-700/60 bg-amber-900/20 px-2 py-1.5" data-testid="smart-value-map-newer-revision">
                      <p className="text-[11px] text-amber-200">A newer table revision is available.</p>
                      <button
                        type="button"
                        data-testid="smart-value-map-adopt-latest"
                        className="mt-1 rounded border border-amber-700 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-900/30"
                        onClick={() => onValueMapAdoptLatestRevision?.()}
                      >
                        Review newer revision
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-2" data-testid="smart-value-map-inline-editor">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-slate-400">Inline mappings</p>
                    <button
                      type="button"
                      data-testid="smart-value-map-inline-add"
                      className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                      onClick={() => onValueMapInlineMappingAdd?.()}
                    >
                      + Add row
                    </button>
                  </div>

                  {valueMapComposition.mappings.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-400" data-testid="smart-value-map-inline-empty">No inline mappings yet.</p>
                  ) : (
                    <div className="mt-2 space-y-1.5" data-testid="smart-value-map-inline-rows">
                      {valueMapComposition.mappings.map((entry, index) => (
                        <div key={`inline-value-map-row-${index}`} className="rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5" data-testid={`smart-value-map-inline-row-${index}`}>
                          <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1.5">
                            <input
                              type="text"
                              data-testid={`smart-value-map-inline-when-${index}`}
                              value={entry.whenValue}
                              onChange={(event) => onValueMapInlineMappingUpdate?.(index, { whenValue: event.target.value })}
                              className="h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                              placeholder="Input value"
                            />
                            <span className="text-[11px] text-slate-500">→</span>
                            <input
                              type="text"
                              data-testid={`smart-value-map-inline-output-${index}`}
                              value={entry.output.kind === 'static' ? String(entry.output.value ?? '') : ''}
                              onChange={(event) => onValueMapInlineMappingUpdate?.(index, { outputValue: event.target.value })}
                              className="h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                              placeholder="Output value"
                            />
                            <button
                              type="button"
                              data-testid={`smart-value-map-inline-remove-${index}`}
                              className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                              onClick={() => onValueMapInlineMappingRemove?.(index)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}

              <div className="mt-2" data-testid="smart-value-map-no-match">
                <label className="text-[11px] text-slate-400" htmlFor="smart-value-map-match-mode">Match mode</label>
                <select
                  id="smart-value-map-match-mode"
                  data-testid="smart-value-map-match-mode"
                  className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                  value={valueMapProjectState.matchMode}
                  onChange={(event) => onValueMapMatchModeChange?.(event.target.value as ValueMapMatchMode)}
                >
                  <option value="exact">Exact</option>
                  <option value="ignore-case">Ignore case</option>
                </select>
                <label className="mt-1.5 block text-[11px] text-slate-400" htmlFor="smart-value-map-no-match-mode">No match behavior</label>
                <select
                  id="smart-value-map-no-match-mode"
                  data-testid="smart-value-map-no-match-mode"
                  className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                  value={valueMapProjectState.noMatchMode}
                  onChange={(event) => onValueMapNoMatchModeChange?.(event.target.value as ValueTableNoMatchMode)}
                >
                  <option value="fallback_value">Use fallback value</option>
                  <option value="return_input">Return input value</option>
                  <option value="return_null">Return null</option>
                </select>
                {valueMapProjectState.noMatchMode === 'fallback_value' && (
                  <input
                    type={valueMapFallbackInputType}
                    data-testid="smart-value-map-fallback-input"
                    value={String(valueMapProjectState.fallbackValue ?? '')}
                    onChange={(event) => onValueMapFallbackValueChange?.(event.target.value)}
                    className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                    placeholder={valueMapFallbackInputType === 'number' ? 'Fallback number' : 'Fallback value'}
                  />
                )}
              </div>

            </div>
          )}

          {hydration.draft.inputs.length > 0
            && !isMethodNeedsAction
            && mappingMethodId !== 'lookup.valueMap'
            && mappingMethodId !== 'condition.compare' && (
            <>
              {(mappingMethodId === 'base.calculation'
                || mappingMethodId === 'number.add'
                || mappingMethodId === 'number.subtract'
                || mappingMethodId === 'number.multiply'
                || mappingMethodId === 'number.divide') && calculationRows && (
                <div className="mt-3 rounded border border-slate-800 bg-slate-950/30 px-2 py-2" data-testid="smart-calculation-editor">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Formula</p>
                  <div className="mt-1 space-y-1 text-xs text-slate-300" data-testid="smart-calculation-rows">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        Start with <span className="font-medium text-slate-100">{calculationRows.start.label}</span>
                      </span>
                      <button
                        type="button"
                        data-testid={`smart-calculation-set-start-${calculationRows.start.id}`}
                        className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                        onClick={() => onApplyAction?.('number.add', { setAsStartInputId: calculationRows.start.id })}
                      >
                        Starting value
                      </button>
                    </div>
                    {calculationRows.operations.map((row, operationIndex) => (
                      <div key={`${row.operator}-${operationIndex}`} className="space-y-1 rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            {row.operator === 'add' ? '+' : row.operator === 'subtract' ? '-' : row.operator === 'multiply' ? '×' : '÷'}{' '}
                            <span className="font-medium text-slate-100">{describeCalculationOperand(row.operand)}</span>
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {row.operand.kind === 'input' && (
                              <button
                                type="button"
                                data-testid={`smart-calculation-set-start-${row.operand.inputId}`}
                                className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                                onClick={() => onApplyAction?.('number.add', { setAsStartInputId: row.operand.inputId })}
                              >
                                Set as start
                              </button>
                            )}
                            <button
                              type="button"
                              data-testid={`smart-calculation-move-up-${operationIndex}`}
                              aria-label={`Move operation ${operationIndex + 1} up`}
                              disabled={operationIndex === 0}
                              className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 enabled:hover:border-slate-500 disabled:opacity-40"
                              onClick={() => onApplyAction?.('number.add', { calculationMoveOperation: { fromIndex: operationIndex, toIndex: operationIndex - 1 } })}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              data-testid={`smart-calculation-move-down-${operationIndex}`}
                              aria-label={`Move operation ${operationIndex + 1} down`}
                              disabled={operationIndex >= calculationRows.operations.length - 1}
                              className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 enabled:hover:border-slate-500 disabled:opacity-40"
                              onClick={() => onApplyAction?.('number.add', { calculationMoveOperation: { fromIndex: operationIndex, toIndex: operationIndex + 1 } })}
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1" data-testid={`smart-calculation-operators-${operationIndex}`}>
                          <button
                            type="button"
                            data-testid={`smart-calculation-operator-add-${operationIndex}`}
                            className={`rounded border px-2 py-0.5 text-[11px] ${row.operator === 'add' ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                            onClick={() => onApplyAction?.('number.add', row.operand.kind === 'input'
                              ? { calculationInputId: row.operand.inputId }
                              : {
                                calculationSetLiteralOperandAtIndex: operationIndex,
                                calculationLiteralOperand: row.operand.kind === 'static' ? row.operand.value : 0,
                              })}
                          >
                            + Add
                          </button>
                          <button
                            type="button"
                            data-testid={`smart-calculation-operator-subtract-${operationIndex}`}
                            className={`rounded border px-2 py-0.5 text-[11px] ${row.operator === 'subtract' ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                            onClick={() => onApplyAction?.('number.subtract', row.operand.kind === 'input'
                              ? { calculationInputId: row.operand.inputId }
                              : {
                                calculationSetLiteralOperandAtIndex: operationIndex,
                                calculationLiteralOperand: row.operand.kind === 'static' ? row.operand.value : 0,
                              })}
                          >
                            − Subtract
                          </button>
                          <button
                            type="button"
                            data-testid={`smart-calculation-operator-multiply-${operationIndex}`}
                            className={`rounded border px-2 py-0.5 text-[11px] ${row.operator === 'multiply' ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                            onClick={() => onApplyAction?.('number.multiply', row.operand.kind === 'input'
                              ? { calculationInputId: row.operand.inputId }
                              : {
                                calculationSetLiteralOperandAtIndex: operationIndex,
                                calculationLiteralOperand: row.operand.kind === 'static' ? row.operand.value : 0,
                              })}
                          >
                            × Multiply
                          </button>
                          <button
                            type="button"
                            data-testid={`smart-calculation-operator-divide-${operationIndex}`}
                            className={`rounded border px-2 py-0.5 text-[11px] ${row.operator === 'divide' ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                            onClick={() => onApplyAction?.('number.divide', row.operand.kind === 'input'
                              ? { calculationInputId: row.operand.inputId }
                              : {
                                calculationSetLiteralOperandAtIndex: operationIndex,
                                calculationLiteralOperand: row.operand.kind === 'static' ? row.operand.value : 0,
                              })}
                          >
                            ÷ Divide
                          </button>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <input
                            type="number"
                            step="any"
                            data-testid={`smart-calculation-literal-${operationIndex}`}
                            className="h-7 w-32 rounded border border-slate-700 bg-slate-900 px-2 text-[11px] text-slate-100"
                            placeholder="Literal operand"
                            value={row.operand.kind === 'static' && typeof row.operand.value === 'number' ? String(row.operand.value) : ''}
                            onChange={(event) => {
                              const nextValue = event.target.value === '' ? 0 : Number(event.target.value);
                              if (!Number.isFinite(nextValue)) return;
                              onApplyAction?.(actionIdForCalculationOperator(row.operator), {
                                calculationSetLiteralOperandAtIndex: operationIndex,
                                calculationLiteralOperand: nextValue,
                              });
                            }}
                          />
                          <button
                            type="button"
                            data-testid={`smart-calculation-use-literal-${operationIndex}`}
                            className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                            onClick={() => onApplyAction?.(actionIdForCalculationOperator(row.operator), {
                              calculationSetLiteralOperandAtIndex: operationIndex,
                              calculationLiteralOperand: row.operand.kind === 'static' ? row.operand.value : 0,
                            })}
                          >
                            Use literal
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {calculationLiteralDivideByZero && (
                    <p className="mt-2 text-[11px] text-amber-300" data-testid="smart-calculation-divide-by-zero-warning">
                      Warning: calculation divides by a literal 0 operand.
                    </p>
                  )}
                  {hydration.draft.expression.trim().length > 0 && (
                    <p className="mt-2 break-all font-mono text-[11px] text-slate-400" data-testid="smart-calculation-expression-preview">
                      {hydration.draft.expression}
                    </p>
                  )}
                </div>
              )}

              {showFinalTransformations && (
                <div className="mt-3" data-testid="smart-recipe-steps" aria-label="Final transformations">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Final transformations</p>
                  <button
                    type="button"
                    data-testid="smart-recipe-add-step"
                    className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                    onClick={() => {
                      setStepPickerScope('result');
                      setPickerMode((prev) => (prev === 'step' ? null : 'step'));
                      setPickerQuery('');
                      setExpandedDisabledId(null);
                    }}
                  >
                    + Add transformation
                  </button>
                </div>
                {hydration.draft.postSteps.length > 0 && (
                  <ol className="mt-1 space-y-1 text-xs text-slate-300" data-testid="smart-recipe-steps-list">
                    {hydration.draft.postSteps.map((step, index) => (
                      <li key={`${step.functionName}-${index}`} className="rounded border border-slate-800 bg-slate-950/30 px-2 py-1">
                        <div className="flex items-center justify-between gap-2">
                          <span>{index + 1}. {step.functionName}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              data-testid={`smart-recipe-step-move-up-${index}`}
                              disabled={index === 0}
                              className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => onApplyAction?.('base.resultStep.move', { outputStepMove: { fromIndex: index, toIndex: index - 1 } })}
                              aria-label={`Move result step ${index + 1} up`}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              data-testid={`smart-recipe-step-move-down-${index}`}
                              disabled={index === hydration.draft.postSteps.length - 1}
                              className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => onApplyAction?.('base.resultStep.move', { outputStepMove: { fromIndex: index, toIndex: index + 1 } })}
                              aria-label={`Move result step ${index + 1} down`}
                            >
                              ↓
                            </button>
                            {(() => {
                              const parameterized = resolveParameterizedActionForTransformStep(step);
                              if (!parameterized) return null;
                              return (
                                <button
                                  type="button"
                                  data-testid={`smart-recipe-step-edit-${index}`}
                                  className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                                  onClick={() => {
                                    onBeginActionParameterEdit?.(parameterized.actionId, parameterized.values);
                                    setParameterEditorStepIndex(index);
                                    setParameterEditorStepScope('result-step');
                                  }}
                                >
                                  Edit
                                </button>
                              );
                            })()}
                            <button
                              type="button"
                              data-testid={`smart-recipe-step-remove-${index}`}
                              className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                              onClick={() => onApplyAction?.('base.resultStep.remove', { outputStepRemoveIndex: index })}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                </div>
              )}
            </>
          )}

          {isMethodNeedsAction && hydration.draft.inputs.length >= 2 && (
            <div
              className="mt-2 rounded border border-slate-700 bg-slate-900/40 px-2 py-1.5"
              data-testid="smart-base-needs-action"
            >
              <p className="text-[11px] text-slate-300">
                Multiple inputs are available. Choose output logic to use them.
              </p>
            </div>
          )}

          {!isMethodNeedsAction && unusedInputs.length > 0 && (
            <div className="mt-2 rounded border border-slate-700 bg-slate-900/40 px-2 py-1.5" data-testid="smart-unused-input-notice">
              <p className="text-[11px] text-slate-300">{unusedInputs.length} available input{unusedInputs.length === 1 ? '' : 's'} not used by current output logic.</p>
              <button
                type="button"
                data-testid="smart-unused-input-change-logic"
                className="mt-1 rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                onClick={() => {
                  setPickerMode('base');
                  setPickerQuery('');
                  setExpandedDisabledId(null);
                }}
              >
                Change logic
              </button>
              {canSuggestCombineValues && (
                <button
                  type="button"
                  data-testid="smart-unused-input-combine"
                  className="ml-1 mt-1 rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                  onClick={() => onApplyAction?.('text.concat')}
                >
                  Combine available values
                </button>
              )}
              {(mappingMethodId === 'base.calculation'
                || mappingMethodId === 'number.add'
                || mappingMethodId === 'number.subtract'
                || mappingMethodId === 'number.multiply'
                || mappingMethodId === 'number.divide') && (
                <div className="mt-1 space-y-1" data-testid="smart-unused-input-calculation-actions">
                  {unusedInputs.map((input) => (
                    <div key={input.id} className="rounded border border-amber-800/60 px-2 py-1">
                      <p className="text-[11px] text-amber-100">{input.label} is not used in this calculation yet.</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <button
                          type="button"
                          data-testid={`smart-unused-input-add-${input.id}`}
                          className="rounded border border-amber-700 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-900/30"
                          onClick={() => onApplyAction?.('number.add', { calculationInputId: input.id })}
                        >
                          + Add
                        </button>
                        <button
                          type="button"
                          data-testid={`smart-unused-input-subtract-${input.id}`}
                          className="rounded border border-amber-700 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-900/30"
                          onClick={() => onApplyAction?.('number.subtract', { calculationInputId: input.id })}
                        >
                          − Subtract
                        </button>
                        <button
                          type="button"
                          data-testid={`smart-unused-input-multiply-${input.id}`}
                          className="rounded border border-amber-700 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-900/30"
                          onClick={() => onApplyAction?.('number.multiply', { calculationInputId: input.id })}
                        >
                          × Multiply
                        </button>
                        <button
                          type="button"
                          data-testid={`smart-unused-input-divide-${input.id}`}
                          className="rounded border border-amber-700 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-900/30"
                          onClick={() => onApplyAction?.('number.divide', { calculationInputId: input.id })}
                        >
                          ÷ Divide
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {parameterEditorBlock}

            {stepPickerScope === 'result' && stepPickerBlock}
          </div>
          )}

        {hasEnabledArrayActions && (
          <div
            className="mt-2 rounded border border-amber-800/60 bg-amber-950/25 px-2.5 py-2"
            data-testid="smart-array-handoff"
          >
            <p className="text-xs font-medium text-amber-200">Array action selected</p>
            <p className="mt-1 text-[11px] text-amber-300/90">
              Deep array authoring is handled in Array Builder to preserve item()/parent() scope semantics.
            </p>
            <button
              type="button"
              data-testid="smart-array-handoff-open"
              onClick={() => {
                onRequestArrayBuilderHandoff?.();
              }}
              className="mt-2 rounded border border-amber-700 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-900/30"
            >
              Open Array Builder
            </button>
          </div>
        )}
      </div>

      {shouldRenderParameterDropdown && parameterDropdownPosition && createPortal(
        <div
          className="fixed z-[70] rounded border border-slate-700 bg-slate-900 py-1 shadow-lg"
          style={{
            top: parameterDropdownPosition.top,
            left: parameterDropdownPosition.left,
            width: parameterDropdownPosition.width,
          }}
          data-testid={`smart-parameter-dropdown-${activeDropdownDefinition?.id}`}
        >
          {activeDropdownOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs text-slate-100 hover:bg-slate-800"
              data-testid={`smart-parameter-option-${activeDropdownDefinition?.id}-${option.value}`}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                if (!pendingActionDraft || !activeDropdownDefinition) return;
                onUpdateActionParameterDraft?.(pendingActionDraft.actionId, activeDropdownDefinition.id, option.value);
                setOpenParameterDropdownId(null);
                setParameterDropdownPosition(null);
              }}
            >
              <span>{option.label}</span>
              {option.label !== option.value && (
                <span className="font-mono text-[10px] text-slate-400">{option.value}</span>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}

    </section>
  );
}
