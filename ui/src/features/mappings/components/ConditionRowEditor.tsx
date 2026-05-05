/**
 * ConditionRowEditor — a single condition row in the ConditionalModeBuilder.
 *
 * Renders:
 *  - Left operand: "Source field", "Value", or "Transform..." selector + input (T-03)
 *  - Comparison operator dropdown (human-readable labels)
 *  - Right operand: same as left (hidden for unary operators isNull/isNotNull)
 *  - Optional remove button
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { InlinePipelineBuilder } from './InlinePipelineBuilder';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type { ComparisonOperator, ConditionRow, Operand, ValueModeState } from '../lib/expression-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COMPARISON_OPTIONS: { value: ComparisonOperator; label: string }[] = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equal' },
  { value: 'gt', label: 'greater than' },
  { value: 'lt', label: 'less than' },
  { value: 'gte', label: 'greater or equal' },
  { value: 'lte', label: 'less or equal' },
  { value: 'contains', label: 'contains' },
  { value: 'isNull', label: 'is null' },
  { value: 'isNotNull', label: 'is not null' },
];

const UNARY_OPERATORS = new Set<ComparisonOperator>(['isNull', 'isNotNull']);

const EMPTY_PIPELINE_STATE: ValueModeState = { mode: 'value', sources: [], transforms: [] };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConditionRowEditorProps {
  readonly condition: ConditionRow;
  readonly onChange: (updated: ConditionRow) => void;
  readonly onRemove?: () => void;
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly rowIndex: number;
}

// ---------------------------------------------------------------------------
// Operand input sub-component
// ---------------------------------------------------------------------------

interface OperandInputProps {
  operand: Operand;
  onChange: (updated: Operand) => void;
  parsedSourceSchema: ParsedSchema | null;
  label: string;
  testIdPrefix: string;
  /** When true, shows the "Transform..." option for pipeline operands (T-03) */
  allowPipeline?: boolean;
}

function OperandInput({ operand, onChange, parsedSourceSchema, label, testIdPrefix, allowPipeline = false }: OperandInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const allPaths = useMemo(() => {
    if (!parsedSourceSchema) return [];
    return flattenSchemaPaths(parsedSourceSchema);
  }, [parsedSourceSchema]);

  const suggestions = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return allPaths.filter((p) => q === '' || p.path.toLowerCase().includes(q)).slice(0, 30);
  }, [allPaths, searchQuery]);

  const isPipeline = operand.kind === 'pipeline';
  const isSource = operand.kind === 'source';

  const handleKindChange = (kind: 'source' | 'static' | 'pipeline') => {
    if (kind === 'pipeline') {
      onChange({ kind: 'pipeline', value: '', pipelineState: EMPTY_PIPELINE_STATE });
    } else {
      onChange({ kind, value: '' });
    }
    setSearchQuery('');
  };

  const handleValueChange = (value: string) => {
    onChange({ ...operand, value });
  };

  const handleSelectPath = (path: string) => {
    onChange({ kind: 'source', value: path });
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const handlePipelineChange = (pipelineState: ValueModeState) => {
    onChange({ kind: 'pipeline', value: '', pipelineState });
  };

  return (
    <div className="flex-1 space-y-1" data-testid={testIdPrefix}>
      {/* Kind toggle */}
      <div className="flex rounded border border-zinc-700 overflow-hidden w-fit text-xs">
        <button
          type="button"
          onClick={() => { handleKindChange('source'); }}
          className={[
            'px-2 py-0.5 focus:outline-none',
            isSource ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
          ].join(' ')}
          aria-pressed={isSource}
          data-testid={`${testIdPrefix}-kind-source`}
        >
          Field
        </button>
        <button
          type="button"
          onClick={() => { handleKindChange('static'); }}
          className={[
            'px-2 py-0.5 focus:outline-none',
            operand.kind === 'static' ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
          ].join(' ')}
          aria-pressed={operand.kind === 'static'}
          data-testid={`${testIdPrefix}-kind-static`}
        >
          Value
        </button>
        {allowPipeline && (
          <button
            type="button"
            onClick={() => { handleKindChange('pipeline'); }}
            className={[
              'px-2 py-0.5 focus:outline-none',
              isPipeline ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
            ].join(' ')}
            aria-pressed={isPipeline}
            data-testid={`${testIdPrefix}-kind-pipeline`}
          >
            Transform…
          </button>
        )}
      </div>

      {/* Input */}
      {isPipeline ? (
        <InlinePipelineBuilder
          state={operand.pipelineState ?? EMPTY_PIPELINE_STATE}
          onChange={handlePipelineChange}
          parsedSourceSchema={parsedSourceSchema}
          testIdPrefix={`${testIdPrefix}-pipeline`}
        />
      ) : isSource ? (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={operand.kind === 'source' ? operand.value : searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
              if (operand.kind === 'source') onChange({ kind: 'source', value: e.target.value });
            }}
            onFocus={() => { setShowSuggestions(true); }}
            onBlur={() => { setTimeout(() => { setShowSuggestions(false); }, 150); }}
            placeholder="Search fields…"
            aria-label={`${label} source field`}
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            data-testid={`${testIdPrefix}-field-input`}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-full mt-0.5 z-30 bg-zinc-800 border border-zinc-600 rounded shadow-lg max-h-36 overflow-y-auto"
            >
              {suggestions.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); }}
                    onClick={() => { handleSelectPath(entry.path); }}
                    className="w-full text-left px-2 py-1 text-xs font-mono text-zinc-100 hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none"
                    data-testid={`${testIdPrefix}-suggestion-${entry.path}`}
                  >
                    {entry.path}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <input
          type="text"
          value={operand.value}
          onChange={(e) => { handleValueChange(e.target.value); }}
          placeholder="Enter value…"
          aria-label={`${label} value`}
          className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          data-testid={`${testIdPrefix}-value-input`}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * A single condition row: [left operand] [operator] [right operand] [remove].
 */
export function ConditionRowEditor({
  condition,
  onChange,
  onRemove,
  parsedSourceSchema,
  rowIndex,
}: ConditionRowEditorProps) {
  const isUnary = UNARY_OPERATORS.has(condition.comparison);

  const handleOperatorChange = useCallback(
    (op: ComparisonOperator) => {
      onChange({ ...condition, comparison: op });
    },
    [condition, onChange],
  );

  const handleLeftChange = useCallback(
    (left: Operand) => {
      onChange({ ...condition, leftOperand: left });
    },
    [condition, onChange],
  );

  const handleRightChange = useCallback(
    (right: Operand) => {
      onChange({ ...condition, rightOperand: right });
    },
    [condition, onChange],
  );

  return (
    <div
      className="flex items-start gap-2 flex-wrap"
      data-testid={`condition-row-${rowIndex}`}
    >
      {/* Left operand — supports pipeline transforms (T-03) */}
      <OperandInput
        operand={condition.leftOperand}
        onChange={handleLeftChange}
        parsedSourceSchema={parsedSourceSchema}
        label="Left"
        testIdPrefix={`condition-left-${rowIndex}`}
        allowPipeline
      />

      {/* Operator */}
      <div className="flex-shrink-0 pt-5">
        <select
          value={condition.comparison}
          onChange={(e) => { handleOperatorChange(e.target.value as ComparisonOperator); }}
          aria-label="Comparison operator"
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
          data-testid={`condition-operator-${rowIndex}`}
        >
          {COMPARISON_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Right operand (hidden for unary operators) */}
      {!isUnary && (
        <OperandInput
          operand={condition.rightOperand}
          onChange={handleRightChange}
          parsedSourceSchema={parsedSourceSchema}
          label="Right"
          testIdPrefix={`condition-right-${rowIndex}`}
        />
      )}

      {/* Remove button */}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove condition ${rowIndex + 1}`}
          className="mt-5 p-1 rounded text-zinc-500 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 flex-shrink-0"
          data-testid={`condition-row-remove-${rowIndex}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
