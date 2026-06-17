import { useState } from 'react';
import { createPortal } from 'react-dom';

import { ComplexExpressionWarning } from './ComplexExpressionWarning';
import { ConditionBuilder } from './ConditionBuilder';
import { InputTray } from './InputTray';
import type { StagedInputField } from './SourceSchemaPanel';
import type { BuilderState } from '../lib/expression-generator';
import { findSmartBuilderActionById, getSmartBuilderActionParameters } from '../lib/smart-builder-action-catalog';
import { resolveSmartBuilderActionsFromDraft } from '../lib/smart-builder-action-resolver';
import type {
  BuilderInput,
  BuilderInputTransform,
  SmartBuilderActionParameterValue,
  SmartBuilderHydrationResult,
} from '../lib/smart-builder-state';

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
  readonly onApplyAction?: (actionId: string, options?: { editingStepIndex?: number }) => void;
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
  readonly concatSeparator?: string;
  readonly onConcatSeparatorChange?: (separator: string) => void;
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
  onApplyAction,
  onBeginActionParameterEdit,
  onUpdateActionParameterDraft,
  onResetActionParameterDraft,
  onCancelActionParameterDraft,
  activeActionId = null,
  actionAnnouncement = null,
  concatSeparator = ' ',
  onConcatSeparatorChange,
}: SmartBuilderPanelProps) {
  const [showAddInput, setShowAddInput] = useState(false);
  const [showConditionEditor, setShowConditionEditor] = useState(false);
  const [pickerMode, setPickerMode] = useState<'base' | 'step' | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [expandedDisabledId, setExpandedDisabledId] = useState<string | null>(null);
  const [parameterEditorStepIndex, setParameterEditorStepIndex] = useState<number | null>(null);
  const [openParameterDropdownId, setOpenParameterDropdownId] = useState<string | null>(null);
  const [parameterDropdownPosition, setParameterDropdownPosition] = useState<{
    readonly top: number;
    readonly left: number;
    readonly width: number;
  } | null>(null);
  void activeActionId;

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
  const pendingActionDraft = hydration.draft.pendingActionDraft ?? null;
  const hasArrayScope =
    hydration.draft.targetType === 'array'
    || hydration.draft.inputs.some((input) => input.sourceKind === 'item' || input.sourceKind === 'parent');
  const conditionComposition = hydration.draft.composition?.kind === 'condition'
    ? hydration.draft.composition
    : null;
  const hasEnabledArrayActions = actions.some(
    (entry) => entry.action.category === 'array' && entry.availability.enabled,
  );

  const conditionState: BuilderState | null = {
    functionName: conditionComposition?.clauses[0]?.predicates[0]?.operator ?? 'eq',
    arguments: [
      { kind: 'literal', value: 'left' },
      { kind: 'literal', value: 'right' },
    ],
  };

  const shouldRenderConditionEditor = conditionComposition !== null || showConditionEditor;

  const baseActionId = (() => {
    const composition = hydration.draft.composition;
    if (!composition || composition.kind === 'direct') return 'base.direct';
    if (composition.kind === 'concat') return 'text.concat';
    if (composition.kind === 'coalesce') return 'null.coalesce';
    if (composition.kind === 'condition') return 'condition.compare';
    if (composition.kind === 'valueMap') return 'lookup.valueMap';
    if (composition.kind === 'advancedExpression') return 'advanced.expression';
    if (composition.kind === 'math') {
      return composition.operator === 'add'
        ? 'number.add'
        : composition.operator === 'subtract'
          ? 'number.subtract'
          : composition.operator === 'multiply'
            ? 'number.multiply'
            : 'number.divide';
    }
    return 'base.direct';
  })();

  const baseActionLabel =
    baseActionId === 'text.concat'
      ? 'Combine text'
      : baseActionId === 'null.coalesce'
        ? 'Use first available'
        : baseActionId === 'condition.compare'
          ? 'Compare inputs'
          : baseActionId === 'lookup.valueMap'
            ? 'Map values'
            : baseActionId === 'advanced.expression'
              ? 'Edit expression'
              : baseActionId === 'number.add'
                ? 'Add numbers'
                : baseActionId === 'number.subtract'
                  ? 'Subtract numbers'
                  : baseActionId === 'number.multiply'
                    ? 'Multiply numbers'
                    : baseActionId === 'number.divide'
                      ? 'Divide numbers'
                      : 'Direct mapping';

  const usedInputIds = (() => {
    const composition = hydration.draft.composition;
    if (!composition) return new Set<string>();

    if (composition.kind === 'direct') return new Set([composition.inputId]);
    if (composition.kind === 'concat' || composition.kind === 'coalesce' || composition.kind === 'math' || composition.kind === 'arrayBuild' || composition.kind === 'arrayMerge') {
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
  const canSuggestCombineText = hydration.draft.inputs.length > 1
    && hydration.draft.inputs.every((input) => input.valueType === 'string');

  const composePreview = (() => {
    if (hydration.draft.inputs.length === 0) return '--';
    if (baseActionId === 'text.concat') {
      const separatorLabel = concatSeparator === ' '
        ? '[space]'
        : concatSeparator === ', '
          ? '[, ]'
          : concatSeparator === '-'
            ? '[-]'
            : concatSeparator === ''
              ? ''
              : `[${concatSeparator}]`;
      if (!separatorLabel) {
        return hydration.draft.inputs.map((input) => input.label).join(' + ');
      }
      return hydration.draft.inputs.map((input) => input.label).join(` + ${separatorLabel} + `);
    }
    if (baseActionId === 'null.coalesce') {
      return hydration.draft.inputs.map((input) => input.label).join(' -> first available');
    }
    if (baseActionId === 'number.add') {
      return hydration.draft.inputs.map((input) => input.label).join(' + ');
    }
    if (baseActionId === 'number.subtract') {
      return hydration.draft.inputs.map((input) => input.label).join(' - ');
    }
    if (baseActionId === 'number.multiply') {
      return hydration.draft.inputs.map((input) => input.label).join(' × ');
    }
    if (baseActionId === 'number.divide') {
      return hydration.draft.inputs.map((input) => input.label).join(' ÷ ');
    }
    if (baseActionId === 'base.direct') {
      return hydration.draft.inputs[0]?.label ?? '--';
    }
    return hydration.draft.inputs.map((input) => input.label).join(', ');
  })();

  const basePickerActions = (() => {
    const options = [
      { id: 'base.direct', label: 'Direct mapping', enabled: hydration.draft.inputs.length > 0, reason: 'Select at least one input first.' },
      { id: 'text.concat', label: 'Combine text' },
      { id: 'null.coalesce', label: 'Use first available' },
      { id: 'number.add', label: 'Add numbers' },
      { id: 'number.subtract', label: 'Subtract numbers' },
      { id: 'number.multiply', label: 'Multiply numbers' },
      { id: 'number.divide', label: 'Divide numbers' },
      { id: 'condition.compare', label: 'Compare inputs' },
      { id: 'lookup.valueMap', label: 'Map values' },
      { id: 'advanced.expression', label: 'Edit expression' },
    ];
    const resolvedById = new Map(actions.map((entry) => [entry.action.id, entry]));
    return options.map((option) => {
      if (option.id === 'base.direct') {
        return { id: option.id, label: option.label, enabled: option.enabled, reason: option.reason };
      }
      const resolved = resolvedById.get(option.id);
      return {
        id: option.id,
        label: option.label,
        enabled: resolved?.availability.enabled ?? false,
        reason: resolved?.availability.reason ?? 'Unavailable in current context.',
      };
    });
  })();

  const stepPickerActions = (() => {
    const options = actions
      .filter((entry) => entry.action.appliesTo === 'input' && entry.action.id !== 'advanced.expression')
      .map((entry) => ({ id: entry.action.id, label: entry.action.label }));
    const resolvedById = new Map(actions.map((entry) => [entry.action.id, entry]));
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

  const activePickerActions = pickerMode === 'base' ? basePickerActions : pickerMode === 'step' ? stepPickerActions : [];
  const normalizedPickerQuery = pickerQuery.trim().toLowerCase();
  const visibleEnabledPickerActions = activePickerActions.filter((action) => {
    if (!action.enabled) return false;
    if (!normalizedPickerQuery) return true;
    return action.label.toLowerCase().includes(normalizedPickerQuery);
  });
  const visibleDisabledPickerActions = activePickerActions.filter((action) => {
    if (action.enabled || !normalizedPickerQuery) return false;
    return `${action.label} ${action.reason ?? ''}`.toLowerCase().includes(normalizedPickerQuery);
  });

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

  return (
    <section
      className={`flex h-full flex-col ${className}`}
      data-testid="smart-builder-panel"
      aria-label={`Smart builder for ${targetPath} (${targetType})`}
    >
      <div className="sr-only" aria-live="polite" data-testid="smart-action-live-region">{actionAnnouncement ?? ''}</div>

      <div className="min-h-0 flex-1 space-y-2.5 px-3 py-3">
        <div>
          <InputTray
            inputs={hydration.draft.inputs}
            onRemoveInput={onInputRemove}
          />

          <div className="mt-2" data-testid="smart-add-input-section">
            <button
              type="button"
              data-testid="smart-add-input-toggle"
              className="rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-200 hover:border-slate-500"
              onClick={() => setShowAddInput((prev) => !prev)}
            >
              + Add input
            </button>

            {showAddInput && (
              <div className="mt-2 rounded border border-slate-700 bg-slate-900/30 px-2.5 py-2" data-testid="smart-add-input-options">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Add input</p>
                <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="smart-add-static"
                className="rounded border border-slate-700 px-2 py-1.5 text-left text-xs text-slate-200 hover:border-slate-500"
                onClick={() => {
                  const input = hydration.draft.inputs.find((entry) => entry.sourceKind === 'static' && entry.staticValue === '');
                  if (input) {
                    onInputToggle?.(input);
                    return;
                  }

                  onStageField?.({
                    path: 'fixedValue',
                    kind: 'static',
                    label: 'Fixed value',
                    staticValue: '',
                    valueType: 'string',
                    expression: 'static("")',
                  });
                }}
              >
                Fixed value
              </button>
              <button
                type="button"
                data-testid="smart-add-constant"
                className="rounded border border-slate-700 px-2 py-1.5 text-left text-xs text-slate-200 hover:border-slate-500"
                onClick={() => {
                  const input = hydration.draft.inputs.find((entry) => entry.sourceKind === 'constant' && entry.constantName === 'DEFAULT_CONSTANT');
                  if (input) {
                    onInputToggle?.(input);
                    return;
                  }

                  onStageField?.({
                    path: 'DEFAULT_CONSTANT',
                    kind: 'constant',
                    label: 'Constant',
                    constantName: 'DEFAULT_CONSTANT',
                    valueType: 'unknown',
                    expression: 'constant("DEFAULT_CONSTANT")',
                  });
                }}
              >
                Constant
              </button>
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
              <button
                type="button"
                data-testid="smart-add-expression"
                className="rounded border border-slate-700 px-2 py-1.5 text-left text-xs text-slate-200 hover:border-slate-500"
                onClick={() => {
                  const input = hydration.draft.inputs.find((entry) => entry.sourceKind === 'expression' && entry.rawExpression === 'source("path")');
                  if (input) {
                    onInputToggle?.(input);
                    return;
                  }

                  onStageField?.({
                    path: 'expression',
                    kind: 'expression',
                    label: 'Expression input',
                    rawExpression: 'source("path")',
                    valueType: 'unknown',
                    expression: 'source("path")',
                  });
                }}
              >
                Expression fallback
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

          {hydration.draft.inputs.length === 0 && (
            <div className="mt-2 rounded border border-slate-700 bg-slate-900/40 px-2.5 py-2" data-testid="smart-builder-empty-state">
              <p className="text-sm font-medium text-slate-100">Start by selecting input fields</p>
              <p className="mt-1 text-xs text-slate-400">
                Other ways to fill this field: fixed value, constant, enrichment input, or Advanced expression.
              </p>
            </div>
          )}
        </div>

        <div className="rounded border border-slate-700 bg-slate-900/30 px-2.5 py-2" data-testid="smart-mapping-recipe">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mapping recipe</p>

          <div className="flex items-center justify-between" data-testid="smart-recipe-base-row">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Base</p>
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
              Change
            </button>
          </div>

          <p className="mt-1 text-xs text-slate-100" data-testid="smart-recipe-base-label">{baseActionLabel}</p>
          <p className="mt-1 text-xs text-slate-400" data-testid="smart-recipe-base-preview">{composePreview}</p>

          {baseActionId === 'text.concat' && (
            <div className="mt-2" data-testid="smart-concat-separator-controls">
              <p className="mb-1 text-[11px] text-slate-400">Separator</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'space', label: 'Space', value: ' ' },
                  { key: 'comma', label: 'Comma', value: ', ' },
                  { key: 'dash', label: 'Dash', value: '-' },
                  { key: 'none', label: 'None', value: '' },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    data-testid={`smart-concat-separator-${option.key}`}
                    onClick={() => onConcatSeparatorChange?.(option.value)}
                    className={`rounded border px-2 py-1 text-[11px] ${concatSeparator === option.value ? 'border-blue-600 bg-blue-900/30 text-blue-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3" data-testid="smart-recipe-steps">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Steps</p>
              <button
                type="button"
                data-testid="smart-recipe-add-step"
                className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-200 hover:border-slate-500"
                onClick={() => {
                  setPickerMode((prev) => (prev === 'step' ? null : 'step'));
                  setPickerQuery('');
                  setExpandedDisabledId(null);
                }}
              >
                + Add step
              </button>
            </div>
            {(hydration.draft.inputs[0]?.transforms.length ?? 0) === 0 ? (
              <p className="mt-1 text-xs text-slate-400" data-testid="smart-recipe-steps-none">None</p>
            ) : (
              <ol className="mt-1 space-y-1 text-xs text-slate-300" data-testid="smart-recipe-steps-list">
                {(hydration.draft.inputs[0]?.transforms ?? []).map((step, index) => (
                  <li key={`${step.functionName}-${index}`} className="rounded border border-slate-800 bg-slate-950/30 px-2 py-1">
                    <div className="flex items-center justify-between gap-2">
                      <span>{index + 1}. {step.functionName}</span>
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
                            }}
                          >
                            Edit
                          </button>
                        );
                      })()}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {unusedInputs.length > 0 && (
            <div className="mt-2 rounded border border-amber-800/60 bg-amber-950/20 px-2 py-1.5" data-testid="smart-unused-input-notice">
              <p className="text-[11px] text-amber-200">{unusedInputs.length} selected input{unusedInputs.length === 1 ? ' is' : 's are'} not used.</p>
              {canSuggestCombineText && (
                <button
                  type="button"
                  data-testid="smart-unused-input-combine"
                  className="mt-1 rounded border border-amber-700 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-900/30"
                  onClick={() => onApplyAction?.('text.concat')}
                >
                  Combine selected text
                </button>
              )}
            </div>
          )}

          {pendingActionDraft && pendingParameterDefinitions.length > 0 && (
            <div className="mt-3 rounded border border-slate-700 bg-slate-950/50 px-2.5 py-2" data-testid="smart-parameter-editor">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400" data-testid="smart-parameter-editor-title">
                Configure {pendingActionLabel}
              </p>

              <div className="mt-2 space-y-2" data-testid="smart-parameter-fields">
                {pendingParameterDefinitions.map((definition) => {
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

              {!pendingActionDraft.validation.isValid && (
                <p className="mt-2 text-[11px] text-red-400" data-testid="smart-parameter-editor-error">
                  Fix highlighted fields before applying.
                </p>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  data-testid="smart-parameter-apply"
                  className="rounded border border-blue-700 bg-blue-900/30 px-2 py-1 text-[11px] text-blue-100 enabled:hover:bg-blue-900/50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!pendingActionDraft.validation.isValid}
                  onClick={() => {
                    onApplyAction?.(pendingActionDraft.actionId, parameterEditorStepIndex === null
                      ? undefined
                      : { editingStepIndex: parameterEditorStepIndex });
                    setParameterEditorStepIndex(null);
                  }}
                >
                  Apply
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
                    setParameterEditorStepIndex(null);
                    onCancelActionParameterDraft?.();
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {pickerMode !== null && (
            <div className="mt-3 rounded border border-slate-700 bg-slate-950/50 px-2.5 py-2" data-testid={`smart-${pickerMode}-picker`}>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {pickerMode === 'base' ? 'Change base mapping' : 'Add step'}
                </p>
                <button
                  type="button"
                  className="text-[11px] text-slate-500 hover:text-slate-300"
                  data-testid="smart-picker-close"
                  onClick={() => setPickerMode(null)}
                >
                  Close
                </button>
              </div>

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
                        setPickerMode(null);
                        return;
                      }

                      if (action.id === 'condition.if' || action.id === 'condition.compare' || action.id === 'condition.truthy') {
                        setShowConditionEditor(true);
                        onConditionFocusedSlotChange?.('condition:left');
                      }
                      onApplyAction?.(action.id);
                      setParameterEditorStepIndex(null);
                      setPickerMode(null);
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              {(normalizedPickerQuery.length > 0 && visibleDisabledPickerActions.length > 0) && (
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
          )}
        </div>

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

      {shouldRenderConditionEditor && (
        <div className="border-t border-slate-800 px-3 py-3" data-testid="smart-condition-editor">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Condition</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                data-testid="condition-slot-left"
                onClick={() => {
                  onConditionFocusedSlotChange?.('condition:left');
                }}
              >
                Fill left
              </button>
              <button
                type="button"
                className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                data-testid="condition-slot-right"
                onClick={() => {
                  onConditionFocusedSlotChange?.('condition:right');
                }}
              >
                Fill right
              </button>
              <button
                type="button"
                className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                data-testid="condition-slot-then"
                onClick={() => {
                  onConditionFocusedSlotChange?.('condition:then');
                }}
              >
                Fill THEN
              </button>
              <button
                type="button"
                className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                data-testid="condition-slot-else"
                onClick={() => {
                  onConditionFocusedSlotChange?.('condition:else');
                }}
              >
                Fill ELSE
              </button>
            </div>
          </div>
          <ConditionBuilder
            condition={conditionState}
            onChange={() => {
              onConditionFocusedSlotChange?.(null);
            }}
            parsedSourceSchema={null}
            arrayItemSchema={null}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
              data-testid="condition-focus-clear"
              onClick={() => {
                onConditionFocusedSlotChange?.(null);
              }}
            >
              Done selecting slot
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
