/**
 * ConditionalModeBuilder — form-based conditional expression builder for the
 * UnifiedExpressionBuilder (FS-023 T-05).
 *
 * Renders an IF / THEN / ELSE block:
 *  - IF: condition group with AND/OR toggle, multiple condition rows, nested groups
 *  - THEN: BranchValueSelector
 *  - ELSE: BranchValueSelector (with else-if option)
 *
 * Supports recursive else-if nesting up to 5 levels.
 */

import { useCallback } from 'react';
import { Plus } from 'lucide-react';

import type {
  BranchValue,
  ConditionGroup,
  ConditionRow,
  ConditionalModeState,
} from '../lib/expression-builder-state';
import { BranchValueSelector } from './BranchValueSelector';
import { ConditionRowEditor } from './ConditionRowEditor';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConditionalModeBuilderProps {
  readonly state: ConditionalModeState;
  readonly onStateChange: (state: ConditionalModeState) => void;
  readonly parsedSourceSchema: ParsedSchema | null;
  /** Current else-if nesting depth (0 = top level) */
  readonly depth?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptyConditionRow(): ConditionRow {
  return {
    leftOperand: { kind: 'source', value: '' },
    comparison: 'eq',
    rightOperand: { kind: 'static', value: '' },
  };
}

function makeEmptyConditionGroup(): ConditionGroup {
  return {
    operator: 'and',
    conditions: [makeEmptyConditionRow()],
  };
}

function isConditionGroup(item: ConditionRow | ConditionGroup): item is ConditionGroup {
  return 'operator' in item;
}

// ---------------------------------------------------------------------------
// ConditionGroupEditor sub-component
// ---------------------------------------------------------------------------

interface ConditionGroupEditorProps {
  group: ConditionGroup;
  onChange: (updated: ConditionGroup) => void;
  parsedSourceSchema: ParsedSchema | null;
  nestingLevel: number;
  rowIndexOffset: number;
}

function ConditionGroupEditor({
  group,
  onChange,
  parsedSourceSchema,
  nestingLevel,
  rowIndexOffset,
}: ConditionGroupEditorProps) {
  const handleOperatorToggle = () => {
    onChange({ ...group, operator: group.operator === 'and' ? 'or' : 'and' });
  };

  const handleConditionChange = (index: number, updated: ConditionRow | ConditionGroup) => {
    const newConditions = group.conditions.map((c, i) => (i === index ? updated : c));
    onChange({ ...group, conditions: newConditions });
  };

  const handleConditionRemove = (index: number) => {
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== index) });
  };

  const handleAddRow = () => {
    onChange({ ...group, conditions: [...group.conditions, makeEmptyConditionRow()] });
  };

  const handleAddNestedGroup = () => {
    onChange({ ...group, conditions: [...group.conditions, makeEmptyConditionGroup()] });
  };

  const canAddNestedGroup = nestingLevel < 2; // max 2 levels of group nesting

  let flatRowIndex = rowIndexOffset;

  return (
    <div
      className={[
        'space-y-2',
        nestingLevel > 0 ? 'pl-3 border-l-2 border-zinc-600' : '',
      ].join(' ')}
      data-testid={nestingLevel === 0 ? 'condition-group-root' : `condition-group-nested-${nestingLevel}`}
    >
      {/* AND/OR operator toggle (only shown when >1 condition) */}
      {group.conditions.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Match</span>
          <button
            type="button"
            onClick={handleOperatorToggle}
            className="flex rounded border border-zinc-600 overflow-hidden text-xs"
            aria-label={`Logical operator: ${group.operator.toUpperCase()}`}
            data-testid="condition-group-operator-toggle"
          >
            <span
              className={[
                'px-2 py-0.5',
                group.operator === 'and' ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400',
              ].join(' ')}
            >
              ALL (AND)
            </span>
            <span
              className={[
                'px-2 py-0.5',
                group.operator === 'or' ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400',
              ].join(' ')}
            >
              ANY (OR)
            </span>
          </button>
          <span className="text-xs text-zinc-500">of the following:</span>
        </div>
      )}

      {/* Condition rows and nested groups */}
      {group.conditions.map((item, index) => {
        if (isConditionGroup(item)) {
          return (
            <ConditionGroupEditor
              key={index}
              group={item}
              onChange={(updated) => { handleConditionChange(index, updated); }}
              parsedSourceSchema={parsedSourceSchema}
              nestingLevel={nestingLevel + 1}
              rowIndexOffset={flatRowIndex}
            />
          );
        }
        const rowIdx = flatRowIndex++;
        return (
          <ConditionRowEditor
            key={index}
            condition={item}
            onChange={(updated) => { handleConditionChange(index, updated); }}
            onRemove={group.conditions.length > 1 ? () => { handleConditionRemove(index); } : undefined}
            parsedSourceSchema={parsedSourceSchema}
            rowIndex={rowIdx}
          />
        );
      })}

      {/* Add condition / nested group buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
          data-testid="add-condition-btn"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          Add condition
        </button>
        {canAddNestedGroup && (
          <button
            type="button"
            onClick={handleAddNestedGroup}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
            data-testid="add-nested-group-btn"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Add nested group
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Full conditional mode builder: IF condition THEN value ELSE value.
 * Supports recursive else-if nesting up to 5 levels.
 */
export function ConditionalModeBuilder({
  state,
  onStateChange,
  parsedSourceSchema,
  depth = 0,
}: ConditionalModeBuilderProps) {
  const handleConditionChange = useCallback(
    (condition: ConditionGroup) => {
      onStateChange({ ...state, condition });
    },
    [state, onStateChange],
  );

  const handleThenChange = useCallback(
    (thenBranch: BranchValue) => {
      onStateChange({ ...state, thenBranch });
    },
    [state, onStateChange],
  );

  const handleElseChange = useCallback(
    (elseBranch: BranchValue) => {
      onStateChange({ ...state, elseBranch });
    },
    [state, onStateChange],
  );

  return (
    <div
      className="space-y-4"
      data-testid="conditional-builder"
    >
      {/* IF section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-blue-400 uppercase tracking-wider w-10 shrink-0">IF</span>
          <div className="flex-1 h-px bg-zinc-700" />
        </div>
        <ConditionGroupEditor
          group={state.condition}
          onChange={handleConditionChange}
          parsedSourceSchema={parsedSourceSchema}
          nestingLevel={0}
          rowIndexOffset={0}
        />
      </div>

      {/* THEN section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-green-400 uppercase tracking-wider w-10 shrink-0">THEN</span>
          <div className="flex-1 h-px bg-zinc-700" />
        </div>
        <BranchValueSelector
          branch={state.thenBranch}
          onBranchChange={handleThenChange}
          parsedSourceSchema={parsedSourceSchema}
          allowElseIf={false}
          elseIfDepth={depth}
          testIdPrefix="branch-then"
          ConditionalModeBuilderComponent={ConditionalModeBuilder}
        />
      </div>

      {/* ELSE section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider w-10 shrink-0">ELSE</span>
          <div className="flex-1 h-px bg-zinc-700" />
        </div>
        <BranchValueSelector
          branch={state.elseBranch}
          onBranchChange={handleElseChange}
          parsedSourceSchema={parsedSourceSchema}
          allowElseIf={true}
          elseIfDepth={depth}
          testIdPrefix="branch-else"
          ConditionalModeBuilderComponent={ConditionalModeBuilder}
        />
      </div>
    </div>
  );
}
