/**
 * FilterPredicateEditor.tsx — FS-043 T-05
 *
 * Simplified boolean-focused filter predicate builder for Filter + Map mode.
 *
 * Supports:
 *   - Field comparison: eq / neq / gt / gte / lt / lte
 *   - Null checks: isNull / isNotNull
 *   - Raw expression fallback for complex predicates (AND/OR, nested logic)
 *
 * Left operand defaults to an item field picker.
 * Right operand: static value input or source field reference.
 *
 * Fires onPredicateChange on every change.
 */

import { Code2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import type {
  FilterPredicateState,
  FilterOperator,
  FilterLeftOperand,
  FilterRightOperand,
} from '../lib/array-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterPredicateEditorProps {
  readonly predicate: FilterPredicateState;
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly onPredicateChange: (predicate: FilterPredicateState) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface OperatorOption {
  readonly value: FilterOperator;
  readonly label: string;
  readonly isUnary: boolean;
}

const OPERATOR_OPTIONS: OperatorOption[] = [
  { value: 'eq',       label: 'equals',           isUnary: false },
  { value: 'neq',      label: 'not equals',        isUnary: false },
  { value: 'gt',       label: 'greater than',      isUnary: false },
  { value: 'gte',      label: 'greater or equal',  isUnary: false },
  { value: 'lt',       label: 'less than',         isUnary: false },
  { value: 'lte',      label: 'less or equal',     isUnary: false },
  { value: 'isNull',   label: 'is null',           isUnary: true  },
  { value: 'isNotNull',label: 'is not null',       isUnary: true  },
];

const UNARY_OPERATORS = new Set<FilterOperator>(['isNull', 'isNotNull']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summarizePredicate(predicate: FilterPredicateState): string {
  if (predicate.kind === 'raw') {
    return predicate.dsl.trim() || 'Raw expression';
  }
  const { left, operator, right } = predicate;
  const leftStr =
    left.kind === 'itemField'
      ? `item("${left.fieldPath}")`
      : left.dsl || '…';
  const opLabel = OPERATOR_OPTIONS.find((o) => o.value === operator)?.label ?? operator;
  if (UNARY_OPERATORS.has(operator)) {
    return `${leftStr} ${opLabel}`;
  }
  const rightStr =
    right.kind === 'static'
      ? right.value || '…'
      : right.kind === 'sourceField'
        ? `source("${right.path}")`
        : right.kind === 'itemField'
          ? `item("${right.fieldPath}")`
          : '…';
  return `${leftStr} ${opLabel} ${rightStr}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LeftOperandInput({
  left,
  onChange,
}: {
  left: FilterLeftOperand;
  onChange: (left: FilterLeftOperand) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
        Field
      </label>
      <input
        type="text"
        value={left.kind === 'itemField' ? left.fieldPath : left.dsl}
        placeholder='e.g. status'
        aria-label="Filter field path"
        data-testid="filter-left-operand"
        onChange={(e) => {
          onChange({ kind: 'itemField', fieldPath: e.target.value });
        }}
        className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

function OperatorSelect({
  operator,
  onChange,
}: {
  operator: FilterOperator;
  onChange: (op: FilterOperator) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
        Operator
      </label>
      <select
        value={operator}
        aria-label="Filter operator"
        data-testid="filter-operator"
        onChange={(e) => { onChange(e.target.value as FilterOperator); }}
        className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {OPERATOR_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type RightOperandKind = 'static' | 'sourceField';

function RightOperandInput({
  right,
  parsedSourceSchema,
  onChange,
}: {
  right: FilterRightOperand;
  parsedSourceSchema: ParsedSchema | null;
  onChange: (right: FilterRightOperand) => void;
}) {
  const [inputKind, setInputKind] = useState<RightOperandKind>(
    right.kind === 'sourceField' ? 'sourceField' : 'static',
  );

  const sourcePaths = parsedSourceSchema
    ? flattenSchemaPaths(parsedSourceSchema).map((e) => e.path)
    : [];

  function handleKindChange(kind: RightOperandKind) {
    setInputKind(kind);
    if (kind === 'static') {
      onChange({ kind: 'static', value: '' });
    } else {
      onChange({ kind: 'sourceField', path: '' });
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Value
        </label>
        <div
          role="group"
          aria-label="Right operand type"
          className="inline-flex overflow-hidden rounded border border-slate-700"
        >
          {(['static', 'sourceField'] as RightOperandKind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={inputKind === k}
              data-testid={`filter-right-kind-${k}`}
              onClick={() => { handleKindChange(k); }}
              className={[
                'px-2 py-0.5 text-[10px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
                inputKind === k
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
              ].join(' ')}
            >
              {k === 'static' ? 'Static' : 'Field'}
            </button>
          ))}
        </div>
      </div>

      {inputKind === 'static' ? (
        <input
          type="text"
          value={right.kind === 'static' ? right.value : ''}
          placeholder='e.g. active'
          aria-label="Filter right operand static value"
          data-testid="filter-right-static"
          onChange={(e) => { onChange({ kind: 'static', value: e.target.value }); }}
          className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      ) : (
        <select
          value={right.kind === 'sourceField' ? right.path : ''}
          aria-label="Filter right operand source field"
          data-testid="filter-right-source"
          onChange={(e) => { onChange({ kind: 'sourceField', path: e.target.value }); }}
          className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select source field…</option>
          {sourcePaths.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FilterPredicateEditor({
  predicate,
  parsedSourceSchema,
  onPredicateChange,
  className = '',
}: FilterPredicateEditorProps) {
  const [isRawMode, setIsRawMode] = useState(predicate.kind === 'raw');

  const handleToggleRaw = useCallback(() => {
    if (!isRawMode) {
      // Switch to raw — carry over any existing structured predicate as a summary
      const summary =
        predicate.kind === 'structured'
          ? summarizePredicate(predicate)
          : '';
      setIsRawMode(true);
      onPredicateChange({ kind: 'raw', dsl: summary });
    } else {
      // Switch back to structured
      setIsRawMode(false);
      onPredicateChange({
        kind: 'structured',
        left: { kind: 'itemField', fieldPath: '' },
        operator: 'eq',
        right: { kind: 'none' },
      });
    }
  }, [isRawMode, predicate, onPredicateChange]);

  const handleLeftChange = useCallback(
    (left: FilterLeftOperand) => {
      if (predicate.kind !== 'structured') return;
      onPredicateChange({ ...predicate, left });
    },
    [predicate, onPredicateChange],
  );

  const handleOperatorChange = useCallback(
    (operator: FilterOperator) => {
      if (predicate.kind !== 'structured') return;
      const isUnary = UNARY_OPERATORS.has(operator);
      onPredicateChange({
        ...predicate,
        operator,
        right: isUnary ? { kind: 'none' } : predicate.right.kind === 'none' ? { kind: 'static', value: '' } : predicate.right,
      });
    },
    [predicate, onPredicateChange],
  );

  const handleRightChange = useCallback(
    (right: FilterRightOperand) => {
      if (predicate.kind !== 'structured') return;
      onPredicateChange({ ...predicate, right });
    },
    [predicate, onPredicateChange],
  );

  const isUnary =
    predicate.kind === 'structured' && UNARY_OPERATORS.has(predicate.operator);

  return (
    <div
      data-testid="filter-predicate-editor"
      className={['space-y-3', className].filter(Boolean).join(' ')}
    >
      {/* Raw mode toggle */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Condition
        </span>
        <button
          type="button"
          data-testid="filter-raw-toggle"
          aria-pressed={isRawMode}
          onClick={handleToggleRaw}
          title={isRawMode ? 'Switch to structured builder' : 'Switch to raw DSL expression'}
          className={[
            'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
            isRawMode
              ? 'bg-blue-900/40 text-blue-300'
              : 'text-slate-500 hover:text-slate-300',
          ].join(' ')}
        >
          <Code2 size={10} aria-hidden="true" />
          {isRawMode ? 'Structured' : 'Raw DSL'}
        </button>
      </div>

      {isRawMode ? (
        /* Raw expression input */
        <div className="space-y-1">
          <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            DSL expression
          </label>
          <textarea
            value={predicate.kind === 'raw' ? predicate.dsl : ''}
            placeholder='e.g. and(eq(item("status"), "active"), gt(item("amount"), 0))'
            aria-label="Raw filter predicate DSL"
            data-testid="filter-raw-dsl"
            rows={3}
            onChange={(e) => {
              onPredicateChange({ kind: 'raw', dsl: e.target.value });
            }}
            className="w-full resize-none rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-[10px] text-slate-500">
            Enter any valid boolean DSL expression. Use AND/OR for complex conditions.
          </p>
        </div>
      ) : (
        /* Structured builder */
        <div className="space-y-2">
          {predicate.kind === 'structured' && (
            <>
              <LeftOperandInput
                left={predicate.left}
                onChange={handleLeftChange}
              />
              <OperatorSelect
                operator={predicate.operator}
                onChange={handleOperatorChange}
              />
              {!isUnary && (
                <RightOperandInput
                  right={predicate.right}
                  parsedSourceSchema={parsedSourceSchema}
                  onChange={handleRightChange}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
