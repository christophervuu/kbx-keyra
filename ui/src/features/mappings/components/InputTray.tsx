import { useEffect, useMemo, useRef, useState } from 'react';

import { ConfirmDialog } from './ConfirmDialog';

import type {
  BuilderInput,
  BuilderInputUsage,
  BuilderInputUsageLocation,
} from '../lib/smart-builder-state';

interface InputTrayProps {
  readonly inputs: readonly BuilderInput[];
  readonly usages?: readonly BuilderInputUsage[];
  readonly className?: string;
  readonly onRemoveInput?: (inputId: string) => void;
  readonly onToggleAddInput?: () => void;
  readonly showBuilderEmptyGuidance?: boolean;
  readonly onUseFixedValue?: () => void;
}

const TYPE_BADGES: Record<BuilderInput['valueType'], { short: string; tone: string; label: string }> = {
  string: { short: 'STR', tone: 'bg-blue-900/60 text-blue-300', label: 'String' },
  number: { short: 'NUM', tone: 'bg-green-900/60 text-green-300', label: 'Number' },
  integer: { short: 'INT', tone: 'bg-green-900/60 text-green-300', label: 'Integer' },
  boolean: { short: 'BOL', tone: 'bg-purple-900/60 text-purple-300', label: 'Boolean' },
  object: { short: 'OBJ', tone: 'bg-slate-700/80 text-slate-300', label: 'Object' },
  array: { short: 'ARR', tone: 'bg-amber-900/60 text-amber-300', label: 'Array' },
  null: { short: 'NUL', tone: 'bg-slate-800/60 text-slate-400', label: 'Null' },
  any: { short: 'ANY', tone: 'bg-slate-700/80 text-slate-300', label: 'Any' },
  union: { short: 'UNI', tone: 'bg-slate-700/80 text-slate-300', label: 'Union' },
  unknown: { short: 'UNK', tone: 'bg-slate-700/80 text-slate-300', label: 'Unknown' },
};

const USAGE_LABELS: Record<BuilderInputUsageLocation, string> = {
  direct: 'Direct mapping',
  'concat-part': 'Combine part',
  'coalesce-operand': 'First available operand',
  'coalesce-fallback': 'First available fallback',
  'default-primary': 'Default primary value',
  'default-fallback': 'Default fallback',
  'math-start': 'Calculation start',
  'math-operand': 'Calculation operand',
  'condition-left': 'IF left value',
  'condition-right': 'IF right value',
  then: 'THEN output',
  otherwise: 'OTHERWISE output',
  'value-map-lookup': 'Used as lookup value',
  'value-map-output': 'Mapped output',
  'value-map-fallback': 'Lookup fallback',
  'array-build-item': 'Array item',
  'array-merge-item': 'Merge input',
  'result-step-arg': 'Final transformation argument',
};

function formatSampleValue(input: BuilderInput): string {
  if (input.sampleValue === undefined) {
    return 'No sample';
  }

  if (input.sampleValue === null) {
    return 'null';
  }

  if (typeof input.sampleValue === 'string') {
    return input.sampleValue;
  }

  return JSON.stringify(input.sampleValue);
}

function toGroupMeta(input: BuilderInput): { key: string; label: string } {
  switch (input.sourceKind) {
    case 'primary':
      return { key: 'primary', label: 'Primary source' };
    case 'enrichment':
      return {
        key: `enrichment:${input.externalName ?? 'unknown'}`,
        label: `Enrichment input${input.externalName ? `: ${input.externalName}` : ''}`,
      };
    case 'item':
      return { key: 'item', label: 'Array item' };
    case 'parent':
      return { key: 'parent', label: 'Array parent' };
    default:
      return { key: 'builder-values', label: 'Builder values' };
  }
}

function describeUsage(usage: BuilderInputUsage): string {
  const base = USAGE_LABELS[usage.location];
  if (usage.location === 'concat-part' && usage.valueIndex !== undefined) {
    return `${base} ${usage.valueIndex + 1}`;
  }
  if (usage.location === 'coalesce-operand' && usage.valueIndex !== undefined) {
    return `${base} ${usage.valueIndex + 1}`;
  }
  if (usage.location === 'math-operand' && usage.operationIndex !== undefined) {
    return `${base} ${usage.operationIndex + 1}`;
  }
  if (usage.location === 'value-map-output' && usage.mappingIndex !== undefined) {
    return `${base} row ${usage.mappingIndex + 1}`;
  }
  if (
    usage.location === 'result-step-arg'
    && usage.stepIndex !== undefined
    && usage.argIndex !== undefined
  ) {
    return `${base} (step ${usage.stepIndex + 1}, arg ${usage.argIndex + 1})`;
  }

  if (usage.clauseIndex === undefined) return base;

  const conditionLabel = `condition ${usage.clauseIndex + 1}`;
  if (usage.predicateIndex === undefined) return `${base} (${conditionLabel})`;
  return `${base} (${conditionLabel}, check ${usage.predicateIndex + 1})`;
}

export function InputTray({
  inputs,
  usages = [],
  className = '',
  onRemoveInput,
  onToggleAddInput,
  showBuilderEmptyGuidance = false,
  onUseFixedValue,
}: InputTrayProps) {
  const [pendingReferencedRemove, setPendingReferencedRemove] = useState<{
    readonly inputId: string;
    readonly label: string;
    readonly usages: readonly BuilderInputUsage[];
  } | null>(null);
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const [heightOverflow, setHeightOverflow] = useState(false);

  const dedupedInputs = useMemo(() => {
    const seen = new Set<string>();
    return inputs.filter((input) => {
      const identity = `${input.id}::${input.path ?? ''}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }, [inputs]);

  const usagesByInputId = useMemo(() => {
    const map = new Map<string, BuilderInputUsage[]>();
    usages.forEach((usage) => {
      const current = map.get(usage.inputId) ?? [];
      current.push(usage);
      map.set(usage.inputId, current);
    });
    return map;
  }, [usages]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; rows: BuilderInput[] }>();
    dedupedInputs.forEach((input) => {
      const groupMeta = toGroupMeta(input);
      const existing = map.get(groupMeta.key);
      if (existing) {
        existing.rows.push(input);
      } else {
        map.set(groupMeta.key, {
          label: groupMeta.label,
          rows: [input],
        });
      }
    });
    return Array.from(map.entries()).map(([key, value]) => ({
      key,
      ...value,
    }));
  }, [dedupedInputs]);

  useEffect(() => {
    const contentHeight = scrollRegionRef.current?.scrollHeight ?? 0;
    setHeightOverflow(contentHeight > 320);
  }, [grouped]);

  const shouldEnableScroll = dedupedInputs.length > 5 || heightOverflow;

  const resolveSummary = (input: BuilderInput): string => {
    switch (input.sourceKind) {
      case 'enrichment':
        return input.path ? `${input.externalName ?? 'alias'}.${input.path}` : (input.externalName ?? '—');
      case 'constant':
        return input.constantName ?? '—';
      case 'static':
        return input.staticValue === undefined ? '—' : JSON.stringify(input.staticValue);
      case 'expression':
        return input.rawExpression ?? '—';
      default:
        return input.path ?? input.externalName ?? '—';
    }
  };

  const handleRemoveInput = (input: BuilderInput) => {
    if (!onRemoveInput) return;
    const inputUsages = usagesByInputId.get(input.id) ?? [];
    if (inputUsages.length === 0) {
      onRemoveInput(input.id);
      return;
    }

    setPendingReferencedRemove({
      inputId: input.id,
      label: input.label,
      usages: inputUsages,
    });
  };

  return (
    <section className={className} data-testid="smart-input-tray" aria-label="Selected inputs">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400" data-testid="smart-input-tray-count">
          Inputs {dedupedInputs.length}
        </p>
        {onToggleAddInput && (
          <button
            type="button"
            data-testid="smart-add-input-toggle"
            className="rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-200 hover:border-slate-500"
            onClick={onToggleAddInput}
          >
            Add Input
          </button>
        )}
      </div>

      {inputs.length === 0 ? (
        <div
          className="rounded border border-dashed border-slate-700 bg-slate-900/40 px-3 py-3 text-xs text-slate-400"
          data-testid="smart-input-tray-empty"
        >
          {showBuilderEmptyGuidance ? (
            <div data-testid="smart-builder-empty-state">
              <p className="text-sm font-medium text-slate-100">No inputs selected yet.</p>
              <p className="mt-1 text-xs text-slate-400">
                Select a field from Input Fields or add another value.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5" data-testid="smart-builder-empty-actions">
                <button
                  type="button"
                  data-testid="smart-empty-use-fixed-value"
                  className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                  onClick={() => onUseFixedValue?.()}
                >
                  Use fixed value
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500" data-testid="smart-builder-empty-advanced-note">
                More complex logic can be created in Advanced DSL.
              </p>
            </div>
          ) : (
            <>No inputs selected yet.</>
          )}
        </div>
      ) : (
        <div
          ref={scrollRegionRef}
          className="space-y-2"
          data-testid="smart-input-tray-scroll-region"
          data-scroll-enabled={shouldEnableScroll ? 'true' : 'false'}
          data-height-overflow={heightOverflow ? 'true' : 'false'}
          style={{ maxHeight: 320, overflowY: shouldEnableScroll ? 'auto' : undefined }}
        >
          {grouped.map((group) => (
            <section
              key={group.key}
              className="rounded border border-slate-800/80 bg-slate-900/20"
              data-testid={`smart-input-tray-group-${group.key}`}
            >
              <header className="border-b border-slate-800/70 px-2.5 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
              </header>
              <ul className="space-y-1.5 p-2" data-testid="smart-input-tray-list">
                {group.rows.map((input) => {
                  const typeBadge = TYPE_BADGES[input.valueType] ?? TYPE_BADGES.unknown;
                  const usageList = usagesByInputId.get(input.id) ?? [];
                  const usageCount = usageList.length;
                  const usageStateLabel = usageCount === 0
                    ? 'Available'
                    : usageCount === 1
                      ? `Used in ${describeUsage(usageList[0]!)}`
                      : `Used ${usageCount} times`;
                  return (
                    <li
                      key={input.id}
                      className="min-h-14 rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5"
                      data-testid={`smart-input-tray-item-${input.id}`}
                      tabIndex={0}
                      aria-label={`Input ${input.label}. Type ${typeBadge.label}. ${usageStateLabel}.`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          data-testid={`smart-input-tray-type-${input.id}`}
                          className={`mt-0.5 inline-flex min-w-[2.7rem] justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${typeBadge.tone}`}
                          aria-label={`Type: ${typeBadge.label}`}
                        >
                          {typeBadge.short}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-slate-100" title={input.label}>{input.label}</p>
                          <p
                            className="truncate font-mono text-[11px] text-slate-400"
                            title={resolveSummary(input)}
                            data-testid={`smart-input-tray-path-${input.id}`}
                          >
                            {resolveSummary(input)}
                          </p>
                          <p
                            className="truncate text-[11px] text-slate-500"
                            title={formatSampleValue(input)}
                            data-testid={`smart-input-tray-sample-${input.id}`}
                          >
                            Sample: {formatSampleValue(input)}
                          </p>

                          {usageCount === 0 ? (
                            <p className="text-[11px] text-slate-500" data-testid={`smart-input-tray-usage-${input.id}`}>
                              Available
                            </p>
                          ) : usageCount === 1 ? (
                            <p className="text-[11px] text-blue-300" data-testid={`smart-input-tray-usage-${input.id}`}>
                              Used in: {describeUsage(usageList[0]!)}
                            </p>
                          ) : (
                            <details data-testid={`smart-input-tray-usage-${input.id}`}>
                              <summary className="cursor-pointer text-[11px] text-blue-300">Used {usageCount}×</summary>
                              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-300" data-testid={`smart-input-tray-usage-details-${input.id}`}>
                                {usageList.map((usage, index) => (
                                  <li key={`${input.id}-usage-${index}`}>{describeUsage(usage)}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                          <p className="sr-only" data-testid={`smart-input-tray-state-${input.id}`}>
                            State: {usageStateLabel}
                          </p>
                        </div>

                        {onRemoveInput && (
                          <button
                            type="button"
                            data-testid={`smart-input-tray-remove-${input.id}`}
                            onClick={() => handleRemoveInput(input)}
                            aria-label={`Remove input ${input.label}`}
                            className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-300 hover:border-slate-500 hover:text-slate-100"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingReferencedRemove !== null}
        title="Remove referenced input"
        message={pendingReferencedRemove ? (
          <div data-testid="smart-input-tray-remove-confirm">
            <p className="text-xs font-medium text-amber-200">
              Remove “{pendingReferencedRemove.label}” and clear all references?
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-amber-100" data-testid="smart-input-tray-remove-confirm-usages">
              {pendingReferencedRemove.usages.map((usage, index) => (
                <li key={`remove-usage-${index}`}>{describeUsage(usage)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        confirmLabel="Remove and clear usages"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (!pendingReferencedRemove) return;
          onRemoveInput?.(pendingReferencedRemove.inputId);
          setPendingReferencedRemove(null);
        }}
        onCancel={() => setPendingReferencedRemove(null)}
      />
    </section>
  );
}
