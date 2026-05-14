/**
 * ChainValueMapForm — FS-038 T-10
 *
 * Inline value map builder for the chain model.
 *
 * Renders a switch-statement-style lookup table:
 *   - Header: "When {currentValueLabel} equals:"
 *   - Mapping rows: [input value] → [output value] with remove button
 *   - [+ Add case] button to add rows
 *   - Default row: always present, required, non-removable
 *   - Collapsed summary: "map {field}: A→Active, B→Inactive (default: Unknown)"
 *   - Click-to-expand from collapsed summary
 *
 * AE-09: value map with required default and switch-statement UX
 */

import { useCallback, useState } from 'react';
import { X, Plus, ChevronDown, ChevronUp } from 'lucide-react';

import type {
  ValueMapLogicStep,
  ChainValueMapEntry,
  ChainBranch,
  StaticValueBranch,
} from '../lib/chain-builder-state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainValueMapFormProps {
  /** Zero-based index of this step in the chain. */
  readonly stepIndex: number;
  /** The current value map step state. */
  readonly step: ValueMapLogicStep;
  /** Fires when any field in this step changes. */
  readonly onStepChange: (index: number, step: ValueMapLogicStep) => void;
  /** Fires when the user removes this step. */
  readonly onRemoveStep: (index: number) => void;
  /** Label for the current accumulated value (shown in header). */
  readonly currentValueLabel?: string;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function branchDisplayValue(branch: ChainBranch): string {
  if (branch.kind === 'static') {
    const v = branch.value;
    if (v.type === 'null') return 'null';
    if (v.type === 'boolean') return String(v.value);
    return String(v.value);
  }
  if (branch.kind === 'source') return branch.path || '(field)';
  return branch.raw || '(expression)';
}

function isBranchEmpty(branch: ChainBranch): boolean {
  if (branch.kind === 'static') {
    const v = branch.value;
    if (v.type === 'null') return false;
    return String(v.value) === '';
  }
  if (branch.kind === 'source') return branch.path === '';
  return branch.raw === '';
}

function makeEmptyStaticBranch(): ChainBranch {
  return { kind: 'static', value: { type: 'string', value: '' } };
}

function makeEmptyMappingRow(): ChainValueMapEntry {
  return {
    whenValue: '',
    outputValue: makeEmptyStaticBranch(),
  };
}

/**
 * Produces a one-line readable summary of the value map step.
 * Format: map: A→Active, B→Inactive (default: Unknown)
 * Truncates if > 3 mappings.
 */
export function summarizeValueMapStep(step: ValueMapLogicStep): string {
  const truncate = (s: string, max = 15) => s.length > max ? s.slice(0, max) + '…' : s;

  const shown = step.mappings.slice(0, 2);
  const rest = step.mappings.length - shown.length;

  const pairs = shown
    .map((m) => `${truncate(m.whenValue)}→${truncate(branchDisplayValue(m.outputValue))}`)
    .join(', ');

  const more = rest > 0 ? ` (+${rest} more)` : '';
  const def = `default: ${truncate(branchDisplayValue(step.defaultValue))}`;

  if (pairs === '') return `map: (${def})`;
  return `map: ${pairs}${more} (${def})`;
}

// ---------------------------------------------------------------------------
// OutputValueEditor sub-component
// ---------------------------------------------------------------------------

interface OutputValueEditorProps {
  readonly branch: ChainBranch;
  readonly onChange: (branch: ChainBranch) => void;
  readonly testIdPrefix: string;
}

function OutputValueEditor({ branch, onChange, testIdPrefix }: OutputValueEditorProps) {
  const handleStaticValueChange = useCallback(
    (value: string) => {
      if (branch.kind !== 'static') return;
      onChange({ kind: 'static', value: { ...branch.value, value } as StaticValueBranch });
    },
    [branch, onChange],
  );

  const handleStaticTypeChange = useCallback(
    (type: StaticValueBranch['type']) => {
      if (type === 'null') {
        onChange({ kind: 'static', value: { type: 'null' } });
      } else if (type === 'boolean') {
        onChange({ kind: 'static', value: { type: 'boolean', value: false } });
      } else if (type === 'number') {
        onChange({ kind: 'static', value: { type: 'number', value: 0 } });
      } else {
        onChange({ kind: 'static', value: { type: 'string', value: '' } });
      }
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0" data-testid={testIdPrefix}>
      <select
        value={branch.kind}
        onChange={(e) => {
          const k = e.target.value as ChainBranch['kind'];
          if (k === 'static') onChange({ kind: 'static', value: { type: 'string', value: '' } });
          else if (k === 'source') onChange({ kind: 'source', path: '', steps: [] });
          else onChange({ kind: 'expression', raw: '' });
        }}
        aria-label="Output value kind"
        className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 shrink-0"
        data-testid={`${testIdPrefix}-kind`}
      >
        <option value="static">Value</option>
        <option value="source">Field</option>
        <option value="expression">Expr</option>
      </select>

      {branch.kind === 'static' && (
        <>
          <select
            value={branch.value.type}
            onChange={(e) => { handleStaticTypeChange(e.target.value as StaticValueBranch['type']); }}
            aria-label="Output value type"
            className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 shrink-0"
            data-testid={`${testIdPrefix}-static-type`}
          >
            <option value="string">Str</option>
            <option value="number">Num</option>
            <option value="boolean">Bool</option>
            <option value="null">Null</option>
          </select>
          {branch.value.type === 'null' ? (
            <span className="text-xs text-zinc-500 italic px-1">null</span>
          ) : branch.value.type === 'boolean' ? (
            <select
              value={String(branch.value.value)}
              onChange={(e) => {
                onChange({ kind: 'static', value: { type: 'boolean', value: e.target.value === 'true' } });
              }}
              aria-label="Output boolean value"
              className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
              data-testid={`${testIdPrefix}-static-boolean`}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              type={branch.value.type === 'number' ? 'number' : 'text'}
              value={String(branch.value.value)}
              onChange={(e) => { handleStaticValueChange(e.target.value); }}
              placeholder="Output value…"
              aria-label="Output value"
              className="flex-1 min-w-0 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
              data-testid={`${testIdPrefix}-static-input`}
            />
          )}
        </>
      )}

      {branch.kind === 'source' && (
        <input
          type="text"
          value={branch.path}
          onChange={(e) => { onChange({ kind: 'source', path: e.target.value, steps: [] }); }}
          placeholder="Field path…"
          aria-label="Output field path"
          className="flex-1 min-w-0 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          data-testid={`${testIdPrefix}-source-input`}
        />
      )}

      {branch.kind === 'expression' && (
        <input
          type="text"
          value={branch.raw}
          onChange={(e) => { onChange({ kind: 'expression', raw: e.target.value }); }}
          placeholder="DSL expression…"
          aria-label="Output DSL expression"
          className="flex-1 min-w-0 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          data-testid={`${testIdPrefix}-expression-input`}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Inline value map builder for the chain model.
 */
export function ChainValueMapForm({
  stepIndex,
  step,
  onStepChange,
  onRemoveStep,
  currentValueLabel = 'the current value',
  className,
}: ChainValueMapFormProps) {
  const [collapsed, setCollapsed] = useState(false);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const update = useCallback(
    (partial: Partial<ValueMapLogicStep>) => {
      onStepChange(stepIndex, { ...step, ...partial });
    },
    [stepIndex, step, onStepChange],
  );

  const handleRemove = useCallback(() => {
    onRemoveStep(stepIndex);
  }, [stepIndex, onRemoveStep]);

  // -------------------------------------------------------------------------
  // Mapping row management
  // -------------------------------------------------------------------------

  const handleAddRow = useCallback(() => {
    update({ mappings: [...step.mappings, makeEmptyMappingRow()] });
  }, [update, step.mappings]);

  const handleRemoveRow = useCallback(
    (index: number) => {
      update({ mappings: step.mappings.filter((_, i) => i !== index) });
    },
    [update, step.mappings],
  );

  const handleRowWhenValueChange = useCallback(
    (index: number, whenValue: string) => {
      update({
        mappings: step.mappings.map((m, i) => (i === index ? { ...m, whenValue } : m)),
      });
    },
    [update, step.mappings],
  );

  const handleRowOutputChange = useCallback(
    (index: number, outputValue: ChainBranch) => {
      update({
        mappings: step.mappings.map((m, i) => (i === index ? { ...m, outputValue } : m)),
      });
    },
    [update, step.mappings],
  );

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  const defaultEmpty = isBranchEmpty(step.defaultValue);
  const applyDisabled = defaultEmpty;

  // -------------------------------------------------------------------------
  // Collapsed summary
  // -------------------------------------------------------------------------

  if (collapsed) {
    return (
      <div
        className={[
          'overflow-hidden rounded-lg border border-slate-700 bg-slate-900/60',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid={`chain-value-map-form-${stepIndex}`}
      >
        <button
          type="button"
          onClick={() => { setCollapsed(false); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-800/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
          aria-label="Expand value map step"
          data-testid={`chain-value-map-summary-${stepIndex}`}
        >
          <span className="flex-1 truncate font-mono text-[11px] text-slate-400">
            {summarizeValueMapStep(step)}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Expanded form
  // -------------------------------------------------------------------------

  return (
    <div
      className={[
        'overflow-hidden rounded-lg border border-slate-700 bg-slate-900/60',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`chain-value-map-form-${stepIndex}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-3 py-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
            Value Map
          </span>
          <p
            className="text-[11px] text-zinc-500 mt-0.5"
            data-testid={`chain-value-map-header-label-${stepIndex}`}
          >
            When {currentValueLabel} equals:
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setCollapsed(true); }}
            aria-label="Collapse value map step"
            className="rounded p-0.5 text-slate-500 transition-colors hover:text-slate-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
            data-testid={`chain-value-map-collapse-${stepIndex}`}
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleRemove}
            aria-label="Remove value map step"
            className="rounded p-0.5 text-slate-500 transition-colors hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
            data-testid={`chain-value-map-remove-${stepIndex}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {/* Column headers */}
        <div className="flex items-center gap-2 px-1">
          <span className="flex-1 text-[11px] text-slate-500">When equals</span>
          <span className="w-4 text-[11px] text-slate-500" aria-hidden="true">→</span>
          <span className="flex-1 text-[11px] text-slate-500">Output</span>
          <span className="w-5" aria-hidden="true" />
        </div>

        {/* Mapping rows */}
        <div
          className="space-y-1.5"
          data-testid={`chain-value-map-rows-${stepIndex}`}
        >
          {step.mappings.map((mapping, i) => (
            <div
              key={i}
              className="flex items-center gap-2"
              data-testid={`chain-value-map-row-${stepIndex}-${i}`}
            >
              {/* Input value */}
              <input
                type="text"
                value={mapping.whenValue}
                onChange={(e) => { handleRowWhenValueChange(i, e.target.value); }}
                placeholder="Match value…"
                aria-label={`Mapping ${i + 1} input value`}
                className="flex-1 min-w-0 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
                data-testid={`chain-value-map-row-input-${stepIndex}-${i}`}
              />

              {/* Arrow */}
              <span className="shrink-0 text-xs text-slate-500" aria-hidden="true">→</span>

              {/* Output value */}
              <OutputValueEditor
                branch={mapping.outputValue}
                onChange={(b) => { handleRowOutputChange(i, b); }}
                testIdPrefix={`chain-value-map-row-output-${stepIndex}-${i}`}
              />

              {/* Remove row */}
              <button
                type="button"
                onClick={() => { handleRemoveRow(i); }}
                aria-label={`Remove mapping row ${i + 1}`}
                className="shrink-0 text-zinc-500 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded p-0.5 transition-colors"
                data-testid={`chain-value-map-row-remove-${stepIndex}-${i}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        {/* [+ Add case] */}
        <button
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded px-2 py-1 border border-dashed border-blue-800 hover:border-blue-600 transition-colors"
          data-testid={`chain-value-map-add-case-${stepIndex}`}
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          Add case
        </button>

        {/* Default row */}
        <div
          className="space-y-1 border-t border-slate-700/50 pt-2"
          data-testid={`chain-value-map-default-${stepIndex}`}
        >
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-semibold text-slate-400">Default →</span>
            <OutputValueEditor
              branch={step.defaultValue}
              onChange={(b) => { update({ defaultValue: b }); }}
              testIdPrefix={`chain-value-map-default-output-${stepIndex}`}
            />
          </div>
          {defaultEmpty && (
            <p
              className="text-[11px] text-amber-400 pl-16"
              role="alert"
              aria-live="polite"
              data-testid={`chain-value-map-default-required-${stepIndex}`}
            >
              Default value is required
            </p>
          )}
        </div>

        {/* Apply disabled notice */}
        {applyDisabled && (
          <p
            className="text-[11px] italic text-slate-500"
            data-testid={`chain-value-map-apply-disabled-${stepIndex}`}
          >
            Set a default value to apply.
          </p>
        )}
      </div>
    </div>
  );
}
