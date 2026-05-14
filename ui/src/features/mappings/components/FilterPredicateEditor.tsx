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
import { useCallback, useContext, useMemo, useRef, useState } from 'react';

import type {
  FilterPredicateState,
  FilterOperator,
  FilterLeftOperand,
  FilterRightOperand,
} from '../lib/array-builder-state';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import { resolveFieldTestValue } from '../lib/source-field-display';
import { PreviewContext } from '../context/preview-context';
import { SourceFieldOptionRow } from './SourceFieldOptionRow';

import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterPredicateEditorProps {
  readonly predicate: FilterPredicateState;
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly sourceArrayPath: string;
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

function getSourceArrayItemFieldPaths(
  parsedSourceSchema: ParsedSchema | null,
  sourceArrayPath: string,
): string[] {
  if (!parsedSourceSchema || !sourceArrayPath.trim()) return [];

  const prefix = `${sourceArrayPath}.`;
  const result = flattenSchemaPaths(parsedSourceSchema)
    .map((entry) => entry.path)
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length))
    .filter((path) => path.length > 0);

  return Array.from(new Set(result));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LeftOperandInput({
  left,
  sourceArrayPath,
  parsedSourceSchema,
  onChange,
}: {
  left: FilterLeftOperand;
  sourceArrayPath: string;
  parsedSourceSchema: ParsedSchema | null;
  onChange: (left: FilterLeftOperand) => void;
}) {
  const itemFieldOptions = getSourceArrayItemFieldPaths(parsedSourceSchema, sourceArrayPath);

  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
        Field
      </label>
      <select
        value={left.kind === 'itemField' ? left.fieldPath : ''}
        aria-label="Filter field path"
        data-testid="filter-left-operand"
        disabled={!sourceArrayPath.trim()}
        onChange={(e) => {
          onChange({ kind: 'itemField', fieldPath: e.target.value });
        }}
        className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">
          {sourceArrayPath.trim() ? 'Select item field…' : 'Select source array first…'}
        </option>
        {itemFieldOptions.map((path) => (
          <option key={path} value={path}>{path}</option>
        ))}
      </select>
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

type RightOperandKind = 'sourceField' | 'static' | 'external';

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

  const sourceEntries = parsedSourceSchema
    ? flattenSchemaPaths(parsedSourceSchema)
    : [];

  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [sourceQuery, setSourceQuery] = useState('');
  const sourceInputRef = useRef<HTMLInputElement>(null);

  const previewCtx = useContext(PreviewContext);
  const sourceData = previewCtx?.sourceData ?? null;

  const filteredSourceEntries = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return sourceEntries;
    return sourceEntries.filter((e) => e.path.toLowerCase().includes(q));
  }, [sourceEntries, sourceQuery]);

  function handleKindChange(kind: RightOperandKind) {
    if (kind === 'external') return;
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
          {(['sourceField', 'static', 'external'] as RightOperandKind[]).map((k) => (
            <button
              key={k}
              type="button"
              disabled={k === 'external'}
              aria-pressed={inputKind === k}
              data-testid={`filter-right-kind-${k}`}
              title={k === 'external' ? 'External - available later' : undefined}
              onClick={() => { handleKindChange(k); }}
              className={[
                'px-2 py-0.5 text-[10px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
                k === 'external' ? 'cursor-not-allowed opacity-60' : '',
                inputKind === k
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
              ].join(' ')}
            >
              {k === 'sourceField' ? 'Source' : k === 'static' ? 'Static' : 'External'}
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
        <div className="relative" data-testid="filter-right-source-picker">
          <input
            ref={sourceInputRef}
            type="text"
            value={sourcePickerOpen ? sourceQuery : (right.kind === 'sourceField' ? right.path : '')}
            aria-label="Filter right operand source field"
            aria-expanded={sourcePickerOpen}
            aria-controls="filter-right-source-listbox"
            data-testid="filter-right-source"
            placeholder="Search source fields…"
            onChange={(e) => {
              setSourceQuery(e.target.value);
              setSourcePickerOpen(true);
            }}
            onFocus={() => { setSourcePickerOpen(true); setSourceQuery(''); }}
            onBlur={() => { setTimeout(() => { setSourcePickerOpen(false); }, 150); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setSourcePickerOpen(false); sourceInputRef.current?.blur(); }
            }}
            className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {sourcePickerOpen && (
            <ul
              id="filter-right-source-listbox"
              role="listbox"
              aria-label="Filter right operand source field options"
              data-testid="filter-right-source-listbox"
              className="absolute left-0 right-0 top-full z-30 mt-0.5 max-h-48 overflow-y-auto rounded border border-slate-700 bg-slate-900 shadow-lg"
            >
              {filteredSourceEntries.length === 0 ? (
                <li className="px-3 py-2 text-xs text-slate-500 italic">
                  {sourceEntries.length === 0 ? 'No source schema loaded.' : 'No matching fields.'}
                </li>
              ) : (
                filteredSourceEntries.map((entry) => (
                  <li key={entry.path} role="option" aria-selected={right.kind === 'sourceField' && right.path === entry.path}>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => {
                        onChange({ kind: 'sourceField', path: entry.path });
                        setSourcePickerOpen(false);
                        setSourceQuery('');
                      }}
                      data-testid={`filter-right-source-option-${entry.path}`}
                      className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-slate-700 focus:bg-slate-700 focus:outline-none"
                    >
                      <SourceFieldOptionRow
                        path={entry.path}
                        type={entry.type}
                        testValue={resolveFieldTestValue(sourceData, entry.path)}
                      />
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
      <p className="text-[10px] text-slate-500">
        External values are planned and will be enabled in a future release.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FilterPredicateEditor({
  predicate,
  parsedSourceSchema,
  sourceArrayPath,
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
                sourceArrayPath={sourceArrayPath}
                parsedSourceSchema={parsedSourceSchema}
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
