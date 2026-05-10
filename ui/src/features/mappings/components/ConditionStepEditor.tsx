/**
 * ConditionStepEditor.tsx — FS-039 T-08
 *
 * Full condition step editor for the chain-based Builder.
 *
 * Implements: AE-08, AE-09, AE-20, AE-21, AE-24
 *
 * Structure:
 *   - IF clause: predicate rows (AND-combined), left operand defaults to currentValue
 *   - THEN branch: embedded mini-chain editor
 *   - [+ Add else-if] to insert additional ConditionClause entries
 *   - ELSE branch: embedded mini-chain editor (always present, cannot be removed)
 *
 * Left operand behavior (AE-24):
 *   - Defaults to { kind: 'currentValue' } — shown as explicit labeled chip
 *   - "Change input" dropdown allows switching to field / static / expression
 *   - Summary text reflects current-value vs switched-input context
 *
 * This is a NEW component. ConditionalModeBuilder.tsx is NOT modified.
 */

import { useCallback, useState } from 'react';
import { Plus, X, ChevronDown, GitBranch } from 'lucide-react';

import {
  createEmptyChain,
  createEmptyConditionClause,
  createEmptyPredicate,
} from '../lib/chain-builder-state';
import type {
  FS039ConditionStep,
  ConditionClause,
  Predicate,
  OperandValue,
  ChainState,
  ConditionOperatorType,
  StaticValueBranch,
} from '../lib/chain-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPERATOR_OPTIONS: { value: ConditionOperatorType; label: string }[] = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equal' },
  { value: 'gt', label: 'greater than' },
  { value: 'gte', label: 'greater or equal' },
  { value: 'lt', label: 'less than' },
  { value: 'lte', label: 'less or equal' },
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'isTruthy', label: 'is truthy' },
  { value: 'isFalsy', label: 'is falsy' },
  { value: 'isNull', label: 'is null' },
  { value: 'isNotNull', label: 'is not null' },
];

const UNARY_OPERATORS = new Set<ConditionOperatorType>([
  'isTruthy',
  'isFalsy',
  'isNull',
  'isNotNull',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConditionStepEditorProps {
  /** The condition step being edited. */
  readonly step: FS039ConditionStep;
  /** Zero-based index of this step in the parent chain. */
  readonly stepIndex: number;
  /** Called when the step state changes. */
  readonly onChange: (updated: FS039ConditionStep) => void;
  /** Parsed source schema for field suggestions. */
  readonly parsedSourceSchema?: ParsedSchema | null;
  /** Optional className for the root element. */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// OperandValueEditor — edits a single OperandValue
// ---------------------------------------------------------------------------

interface OperandValueEditorProps {
  readonly operand: OperandValue;
  readonly onChange: (updated: OperandValue) => void;
  readonly parsedSourceSchema?: ParsedSchema | null;
  readonly label: string;
  readonly testIdPrefix: string;
  /** When true, shows the "current value" option (left operand only). */
  readonly allowCurrentValue?: boolean;
}

function OperandValueEditor({
  operand,
  onChange,
  parsedSourceSchema,
  label,
  testIdPrefix,
  allowCurrentValue = false,
}: OperandValueEditorProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const allPaths = parsedSourceSchema ? flattenSchemaPaths(parsedSourceSchema).map((e) => e.path) : [];
  const suggestions = allPaths.filter((p) =>
    searchQuery === '' || p.toLowerCase().includes(searchQuery.toLowerCase()),
  ).slice(0, 30);

  function handleKindChange(kind: OperandValue['kind']) {
    switch (kind) {
      case 'currentValue':
        onChange({ kind: 'currentValue' });
        break;
      case 'field':
        onChange({ kind: 'field', path: '' });
        break;
      case 'static':
        onChange({ kind: 'static', value: { type: 'string', value: '' } });
        break;
      case 'expression':
        onChange({ kind: 'expression', dsl: '' });
        break;
    }
    setSearchQuery('');
  }

  return (
    <div className="flex-1 min-w-0 space-y-1" data-testid={testIdPrefix}>
      {/* Kind selector */}
      <div
        className="flex rounded border border-zinc-700 overflow-hidden w-fit text-xs"
        role="group"
        aria-label={`${label} operand type`}
      >
        {allowCurrentValue && (
          <button
            type="button"
            onClick={() => { handleKindChange('currentValue'); }}
            aria-pressed={operand.kind === 'currentValue'}
            className={[
              'px-2 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              operand.kind === 'currentValue'
                ? 'bg-blue-700 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
            ].join(' ')}
            data-testid={`${testIdPrefix}-kind-current`}
          >
            Current value
          </button>
        )}
        <button
          type="button"
          onClick={() => { handleKindChange('field'); }}
          aria-pressed={operand.kind === 'field'}
          className={[
            'px-2 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
            operand.kind === 'field'
              ? 'bg-blue-700 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
          ].join(' ')}
          data-testid={`${testIdPrefix}-kind-field`}
        >
          Field
        </button>
        <button
          type="button"
          onClick={() => { handleKindChange('static'); }}
          aria-pressed={operand.kind === 'static'}
          className={[
            'px-2 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
            operand.kind === 'static'
              ? 'bg-blue-700 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
          ].join(' ')}
          data-testid={`${testIdPrefix}-kind-static`}
        >
          Value
        </button>
        <button
          type="button"
          onClick={() => { handleKindChange('expression'); }}
          aria-pressed={operand.kind === 'expression'}
          className={[
            'px-2 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
            operand.kind === 'expression'
              ? 'bg-blue-700 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
          ].join(' ')}
          data-testid={`${testIdPrefix}-kind-expression`}
        >
          Expression
        </button>
      </div>

      {/* Current value chip — no input needed */}
      {operand.kind === 'currentValue' && (
        <div
          className="inline-flex items-center gap-1 rounded-full bg-blue-900/40 border border-blue-700/50 px-2 py-0.5 text-xs text-blue-300"
          data-testid={`${testIdPrefix}-current-value-chip`}
          aria-label="Current chain value"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden="true" />
          current value
        </div>
      )}

      {/* Field input */}
      {operand.kind === 'field' && (
        <div className="relative">
          <input
            type="text"
            value={operand.path}
            onChange={(e) => {
              onChange({ kind: 'field', path: e.target.value });
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
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
              {suggestions.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); }}
                    onClick={() => {
                      onChange({ kind: 'field', path });
                      setSearchQuery('');
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-2 py-1 text-xs font-mono text-zinc-100 hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none"
                    data-testid={`${testIdPrefix}-suggestion-${path}`}
                  >
                    {path}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Static value input */}
      {operand.kind === 'static' && (
        <input
          type="text"
          value={operand.value.type !== 'null' ? String((operand.value as { value: string | number | boolean }).value ?? '') : ''}
          onChange={(e) => {
            const sv: StaticValueBranch = { type: 'string', value: e.target.value };
            onChange({ kind: 'static', value: sv });
          }}
          placeholder="Enter value…"
          aria-label={`${label} static value`}
          className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          data-testid={`${testIdPrefix}-static-input`}
        />
      )}

      {/* Expression input */}
      {operand.kind === 'expression' && (
        <input
          type="text"
          value={operand.dsl}
          onChange={(e) => { onChange({ kind: 'expression', dsl: e.target.value }); }}
          placeholder="DSL expression…"
          aria-label={`${label} DSL expression`}
          className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          data-testid={`${testIdPrefix}-expression-input`}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PredicateEditor — edits a single Predicate
// ---------------------------------------------------------------------------

interface PredicateEditorProps {
  readonly predicate: Predicate;
  readonly predicateIndex: number;
  readonly clauseIndex: number;
  readonly onChange: (updated: Predicate) => void;
  readonly onRemove?: () => void;
  readonly parsedSourceSchema?: ParsedSchema | null;
}

function PredicateEditor({
  predicate,
  predicateIndex,
  clauseIndex,
  onChange,
  onRemove,
  parsedSourceSchema,
}: PredicateEditorProps) {
  const isUnary = UNARY_OPERATORS.has(predicate.operator);
  const testPrefix = `predicate-${clauseIndex}-${predicateIndex}`;

  return (
    <div
      className="flex items-start gap-2 flex-wrap"
      data-testid={testPrefix}
    >
      {/* Left operand — allows currentValue */}
      <OperandValueEditor
        operand={predicate.left}
        onChange={(left) => { onChange({ ...predicate, left }); }}
        parsedSourceSchema={parsedSourceSchema}
        label="Left"
        testIdPrefix={`${testPrefix}-left`}
        allowCurrentValue
      />

      {/* Operator */}
      <div className="shrink-0 pt-5">
        <select
          value={predicate.operator}
          onChange={(e) => {
            onChange({ ...predicate, operator: e.target.value as ConditionOperatorType });
          }}
          aria-label="Comparison operator"
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
          data-testid={`${testPrefix}-operator`}
        >
          {OPERATOR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Right operand (hidden for unary operators) */}
      {!isUnary && (
        <OperandValueEditor
          operand={predicate.right}
          onChange={(right) => { onChange({ ...predicate, right }); }}
          parsedSourceSchema={parsedSourceSchema}
          label="Right"
          testIdPrefix={`${testPrefix}-right`}
        />
      )}

      {/* Remove predicate button */}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove condition ${predicateIndex + 1}`}
          className="mt-5 shrink-0 rounded p-0.5 text-zinc-500 hover:text-red-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 transition-colors"
          data-testid={`${testPrefix}-remove`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BranchChainEditor — minimal chain editor for then/else branches
// ---------------------------------------------------------------------------

/**
 * A minimal chain editor for condition branches.
 *
 * Branches support: source field selection OR static value, with no step
 * picker in this iteration (branch step editing is a future enhancement).
 * This keeps the branch editors shallow and avoids deep recursive complexity.
 */
interface BranchChainEditorProps {
  readonly chain: ChainState;
  readonly onChange: (updated: ChainState) => void;
  readonly parsedSourceSchema?: ParsedSchema | null;
  readonly label: string;
  readonly testIdPrefix: string;
  readonly canRemove?: boolean;
}

function BranchChainEditor({
  chain,
  onChange,
  parsedSourceSchema,
  label,
  testIdPrefix,
}: BranchChainEditorProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const allPaths = parsedSourceSchema ? flattenSchemaPaths(parsedSourceSchema).map((e) => e.path) : [];
  const suggestions = allPaths.filter((p) =>
    searchQuery === '' || p.toLowerCase().includes(searchQuery.toLowerCase()),
  ).slice(0, 30);

  const isField = chain.source.kind === 'field';
  const isStatic = chain.source.kind === 'static';

  function handleKindToggle(kind: 'field' | 'static') {
    if (kind === 'field') {
      onChange({ ...chain, source: { kind: 'field', path: '' } });
    } else {
      onChange({ ...chain, source: { kind: 'static', value: { type: 'string', value: '' } } });
    }
    setSearchQuery('');
  }

  return (
    <div className="space-y-1.5" data-testid={testIdPrefix}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>

      {/* Source kind toggle */}
      <div
        className="flex rounded border border-zinc-700 overflow-hidden w-fit text-xs"
        role="group"
        aria-label={`${label} branch source type`}
      >
        <button
          type="button"
          onClick={() => { handleKindToggle('field'); }}
          aria-pressed={isField}
          className={[
            'px-2 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
            isField ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
          ].join(' ')}
          data-testid={`${testIdPrefix}-kind-field`}
        >
          Field
        </button>
        <button
          type="button"
          onClick={() => { handleKindToggle('static'); }}
          aria-pressed={isStatic}
          className={[
            'px-2 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
            isStatic ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
          ].join(' ')}
          data-testid={`${testIdPrefix}-kind-static`}
        >
          Value
        </button>
      </div>

      {/* Field input */}
      {isField && (
        <div className="relative">
          <input
            type="text"
            value={chain.source.kind === 'field' ? chain.source.path : ''}
            onChange={(e) => {
              onChange({ ...chain, source: { kind: 'field', path: e.target.value } });
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => { setShowSuggestions(true); }}
            onBlur={() => { setTimeout(() => { setShowSuggestions(false); }, 150); }}
            placeholder="Search fields…"
            aria-label={`${label} branch source field`}
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            data-testid={`${testIdPrefix}-field-input`}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-full mt-0.5 z-30 bg-zinc-800 border border-zinc-600 rounded shadow-lg max-h-36 overflow-y-auto"
            >
              {suggestions.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); }}
                    onClick={() => {
                      onChange({ ...chain, source: { kind: 'field', path } });
                      setSearchQuery('');
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-2 py-1 text-xs font-mono text-zinc-100 hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none"
                    data-testid={`${testIdPrefix}-suggestion-${path}`}
                  >
                    {path}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Static value input */}
      {isStatic && (
        <input
          type="text"
          value={
            chain.source.kind === 'static' && chain.source.value.type !== 'null'
              ? String((chain.source.value as { value: string | number | boolean }).value ?? '')
              : ''
          }
          onChange={(e) => {
            onChange({
              ...chain,
              source: { kind: 'static', value: { type: 'string', value: e.target.value } },
            });
          }}
          placeholder="Enter value…"
          aria-label={`${label} branch static value`}
          className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          data-testid={`${testIdPrefix}-static-input`}
        />
      )}

      {/* Empty state */}
      {!isField && !isStatic && (
        <p className="text-xs text-zinc-600 italic">Select a source for this branch.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConditionClauseEditor — edits a single IF or ELSE-IF clause
// ---------------------------------------------------------------------------

interface ConditionClauseEditorProps {
  readonly clause: ConditionClause;
  readonly clauseIndex: number;
  readonly isElseIf: boolean;
  readonly onChange: (updated: ConditionClause) => void;
  readonly onRemove?: () => void;
  readonly parsedSourceSchema?: ParsedSchema | null;
}

function ConditionClauseEditor({
  clause,
  clauseIndex,
  isElseIf,
  onChange,
  onRemove,
  parsedSourceSchema,
}: ConditionClauseEditorProps) {
  function handlePredicateChange(predicateIndex: number, updated: Predicate) {
    const predicates = clause.predicates.map((p, i) => (i === predicateIndex ? updated : p));
    onChange({ ...clause, predicates });
  }

  function handleAddPredicate() {
    onChange({ ...clause, predicates: [...clause.predicates, createEmptyPredicate()] });
  }

  function handleRemovePredicate(predicateIndex: number) {
    onChange({
      ...clause,
      predicates: clause.predicates.filter((_, i) => i !== predicateIndex),
    });
  }

  function handleThenChange(thenBranch: ChainState) {
    onChange({ ...clause, thenBranch });
  }

  const clauseLabel = isElseIf ? `ELSE-IF (${clauseIndex})` : 'IF';

  return (
    <div
      className="space-y-3 rounded-lg border border-zinc-700/60 bg-zinc-900/40 p-3"
      data-testid={`condition-clause-${clauseIndex}`}
    >
      {/* Clause header */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">
          {clauseLabel}
        </span>
        <span className="flex-1" />
        {isElseIf && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove else-if clause ${clauseIndex}`}
            className="rounded p-0.5 text-zinc-500 hover:text-red-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 transition-colors"
            data-testid={`condition-clause-${clauseIndex}-remove`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Predicate rows */}
      <div className="space-y-2">
        {clause.predicates.map((predicate, predicateIndex) => (
          <div key={predicateIndex}>
            {predicateIndex > 0 && (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
                AND
              </p>
            )}
            <PredicateEditor
              predicate={predicate}
              predicateIndex={predicateIndex}
              clauseIndex={clauseIndex}
              onChange={(updated) => { handlePredicateChange(predicateIndex, updated); }}
              onRemove={
                clause.predicates.length > 1
                  ? () => { handleRemovePredicate(predicateIndex); }
                  : undefined
              }
              parsedSourceSchema={parsedSourceSchema}
            />
          </div>
        ))}
      </div>

      {/* Add condition (AND) */}
      <button
        type="button"
        onClick={handleAddPredicate}
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded px-1 transition-colors"
        data-testid={`condition-clause-${clauseIndex}-add-predicate`}
      >
        <Plus className="h-3 w-3" aria-hidden="true" />
        Add condition (AND)
      </button>

      {/* THEN branch */}
      <BranchChainEditor
        chain={clause.thenBranch}
        onChange={handleThenChange}
        parsedSourceSchema={parsedSourceSchema}
        label="THEN"
        testIdPrefix={`condition-clause-${clauseIndex}-then`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component: ConditionStepEditor
// ---------------------------------------------------------------------------

/**
 * ConditionStepEditor — full condition step editor for the chain-based Builder.
 *
 * Renders IF/THEN/ELSE structure with:
 *   - Left operand defaulting to currentValue (AE-24)
 *   - AND-combined predicates per clause
 *   - Else-if support
 *   - Required ELSE branch (cannot be removed)
 *   - Branch chain editors for THEN and ELSE
 */
export function ConditionStepEditor({
  step,
  stepIndex,
  onChange,
  parsedSourceSchema,
  className = '',
}: ConditionStepEditorProps) {
  // -------------------------------------------------------------------------
  // Clause handlers
  // -------------------------------------------------------------------------

  const handleClauseChange = useCallback(
    (clauseIndex: number, updated: ConditionClause) => {
      const conditions = step.conditions.map((c, i) => (i === clauseIndex ? updated : c));
      onChange({ ...step, conditions });
    },
    [step, onChange],
  );

  const handleAddElseIf = useCallback(() => {
    onChange({
      ...step,
      conditions: [...step.conditions, createEmptyConditionClause()],
    });
  }, [step, onChange]);

  const handleRemoveElseIf = useCallback(
    (clauseIndex: number) => {
      onChange({
        ...step,
        conditions: step.conditions.filter((_, i) => i !== clauseIndex),
      });
    },
    [step, onChange],
  );

  const handleElseChange = useCallback(
    (elseBranch: ChainState) => {
      onChange({ ...step, elseBranch });
    },
    [step, onChange],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={['space-y-3', className].filter(Boolean).join(' ')}
      data-testid={`condition-step-editor-${stepIndex}`}
    >
      {/* IF and ELSE-IF clauses */}
      {step.conditions.map((clause, clauseIndex) => (
        <ConditionClauseEditor
          key={clauseIndex}
          clause={clause}
          clauseIndex={clauseIndex}
          isElseIf={clauseIndex > 0}
          onChange={(updated) => { handleClauseChange(clauseIndex, updated); }}
          onRemove={
            clauseIndex > 0
              ? () => { handleRemoveElseIf(clauseIndex); }
              : undefined
          }
          parsedSourceSchema={parsedSourceSchema}
        />
      ))}

      {/* Add else-if */}
      <button
        type="button"
        onClick={handleAddElseIf}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 rounded px-1 transition-colors"
        data-testid={`condition-step-editor-${stepIndex}-add-elseif`}
      >
        <GitBranch className="h-3 w-3" aria-hidden="true" />
        Add else-if
      </button>

      {/* ELSE branch — always present, cannot be removed */}
      <div
        className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 p-3 space-y-2"
        data-testid={`condition-step-editor-${stepIndex}-else`}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            ELSE
          </span>
          {/* No remove button — ELSE is structurally required */}
        </div>
        <BranchChainEditor
          chain={step.elseBranch}
          onChange={handleElseChange}
          parsedSourceSchema={parsedSourceSchema}
          label="ELSE"
          testIdPrefix={`condition-step-editor-${stepIndex}-else-branch`}
        />
      </div>
    </div>
  );
}
