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

import { useCallback, useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';

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

function serializeBranchToText(branch: ChainBranch): string {
  if (branch.kind === 'expression') return branch.raw;
  if (branch.kind === 'source') return branch.path === '' ? '' : `source("${branch.path}")`;
  const v = branch.value;
  if (v.type === 'null') return 'null';
  return String(v.value);
}

function OutputValueEditor({ branch, onChange, testIdPrefix }: OutputValueEditorProps) {
  // Remember the last non-expression mode for "Back to simple input"
  const lastSimpleModeRef = useRef<'source' | 'static'>(
    branch.kind === 'expression' ? 'static' : branch.kind === 'source' ? 'source' : 'static',
  );
  if (branch.kind !== 'expression') {
    lastSimpleModeRef.current = branch.kind === 'source' ? 'source' : 'static';
  }

  const isExpression = branch.kind === 'expression';

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
    <div className="space-y-1.5" data-testid={testIdPrefix}>
      {/* Primary mode toggle — hidden in expression mode */}
      {!isExpression && (
        <>
          <div
            role="group"
            aria-label="Output value mode"
            className="inline-flex rounded border border-zinc-700 overflow-hidden text-xs"
            data-testid={`${testIdPrefix}-mode-toggle`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={branch.kind === 'source'}
              onClick={() => { onChange({ kind: 'source', path: '', steps: [] }); }}
              className={[
                'px-2.5 py-1 font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                branch.kind === 'source'
                  ? 'bg-blue-700 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
              ].join(' ')}
              data-testid={`${testIdPrefix}-mode-source`}
            >
              Source
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={branch.kind === 'static'}
              onClick={() => { onChange({ kind: 'static', value: { type: 'string', value: '' } }); }}
              className={[
                'px-2.5 py-1 font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                branch.kind === 'static'
                  ? 'bg-blue-700 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
              ].join(' ')}
              data-testid={`${testIdPrefix}-mode-static`}
            >
              Static
            </button>
            <span
              role="radio"
              aria-checked={false}
              aria-disabled="true"
              title="External data sources — available in a future release"
              className="px-2.5 py-1 font-medium bg-zinc-800 text-zinc-600 opacity-50 cursor-not-allowed select-none"
              data-testid={`${testIdPrefix}-mode-external`}
            >
              External
            </span>
          </div>

          {/* Source mode input */}
          {branch.kind === 'source' && (
            <input
              type="text"
              value={branch.path}
              onChange={(e) => { onChange({ kind: 'source', path: e.target.value, steps: [] }); }}
              placeholder="Field path…"
              aria-label="Output field path"
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
              data-testid={`${testIdPrefix}-source-input`}
            />
          )}

          {/* Static mode inputs */}
          {branch.kind === 'static' && (
            <div className="flex items-center gap-1">
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
                  onChange={(e) => {
                    if (branch.kind !== 'static') return;
                    onChange({ kind: 'static', value: { ...branch.value, value: e.target.value } as StaticValueBranch });
                  }}
                  placeholder="Output value…"
                  aria-label="Output value"
                  className="flex-1 min-w-0 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
                  data-testid={`${testIdPrefix}-static-input`}
                />
              )}
            </div>
          )}

          {/* Use advanced expression link */}
          <button
            type="button"
            onClick={() => { onChange({ kind: 'expression', raw: serializeBranchToText(branch) }); }}
            className="text-[11px] text-zinc-500 hover:text-blue-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
            data-testid={`${testIdPrefix}-expression-link`}
          >
            Use advanced expression
          </button>
        </>
      )}

      {/* Expression mode */}
      {isExpression && (
        <div className="space-y-1">
          <textarea
            value={branch.raw}
            onChange={(e) => { onChange({ kind: 'expression', raw: e.target.value }); }}
            placeholder="Enter expression…"
            aria-label="Output expression"
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 resize-none"
            data-testid={`${testIdPrefix}-expression-input`}
          />
          <button
            type="button"
            onClick={() => {
              if (lastSimpleModeRef.current === 'source') {
                onChange({ kind: 'source', path: '', steps: [] });
              } else {
                onChange({ kind: 'static', value: { type: 'string', value: '' } });
              }
            }}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded px-1.5 py-0.5 border border-dashed border-zinc-700 hover:border-zinc-500"
            data-testid={`${testIdPrefix}-back-to-simple`}
          >
            Back to simple input
          </button>
        </div>
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
  onRemoveStep: _onRemoveStep,
  currentValueLabel = 'the current value',
  className,
}: ChainValueMapFormProps) {
  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const update = useCallback(
    (partial: Partial<ValueMapLogicStep>) => {
      onStepChange(stepIndex, { ...step, ...partial });
    },
    [stepIndex, step, onStepChange],
  );

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
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={['space-y-2', className ?? ''].filter(Boolean).join(' ')}
      data-testid={`chain-value-map-form-${stepIndex}`}
    >
      {/* Column headers */}
      <div className="flex items-start gap-2 px-1">
        <span
          className="flex-1 text-xs font-semibold text-slate-300"
          data-testid={`chain-value-map-header-label-${stepIndex}`}
        >
          When {currentValueLabel} equals:
        </span>
        <span className="w-4 text-[11px] text-slate-500 mt-0.5" aria-hidden="true">→</span>
        <span className="flex-1 text-xs font-semibold text-slate-300">Output</span>
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
              className="flex items-start gap-2"
              data-testid={`chain-value-map-row-${stepIndex}-${i}`}
            >
              {/* Input value */}
              <input
                type="text"
                value={mapping.whenValue}
                onChange={(e) => { handleRowWhenValueChange(i, e.target.value); }}
                placeholder="Match value…"
                aria-label={`Mapping ${i + 1} input value`}
                className="flex-1 min-w-0 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 mt-1"
                data-testid={`chain-value-map-row-input-${stepIndex}-${i}`}
              />

              {/* Arrow */}
              <span className="shrink-0 text-xs text-slate-500 mt-2" aria-hidden="true">→</span>

              {/* Output value */}
              <div className="flex-1 min-w-0">
                <OutputValueEditor
                  branch={mapping.outputValue}
                  onChange={(b) => { handleRowOutputChange(i, b); }}
                  testIdPrefix={`chain-value-map-row-output-${stepIndex}-${i}`}
                />
              </div>

              {/* Remove row */}
              <button
                type="button"
                onClick={() => { handleRemoveRow(i); }}
                aria-label={`Remove mapping row ${i + 1}`}
                className="shrink-0 text-zinc-500 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded p-0.5 transition-colors mt-1"
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
          <div className="flex items-start gap-2">
            <span className="shrink-0 text-xs font-semibold text-slate-400 mt-1">Default →</span>
            <div className="flex-1 min-w-0">
              <OutputValueEditor
                branch={step.defaultValue}
                onChange={(b) => { update({ defaultValue: b }); }}
                testIdPrefix={`chain-value-map-default-output-${stepIndex}`}
              />
            </div>
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
  );
}
