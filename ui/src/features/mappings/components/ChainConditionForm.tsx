/**
 * ChainConditionForm — FS-038 T-09
 *
 * Inline condition builder for the chain model.
 *
 * Renders an IF / THEN / ELSE block inline in the chain:
 *   - IF: left operand (defaults to current accumulated value), operator, right operand
 *   - "Change input" affordance to switch left operand from current value to a custom field
 *   - THEN: branch value selector (static / source / expression)
 *   - ELSE: always present, required, same options as THEN
 *   - [+ Add else-if] up to 5 levels
 *   - Collapsed summary: one-line readable text
 *   - Click-to-expand from collapsed summary
 *
 * AE-08: condition with required else and collapsible summary
 * Q1/Q6: left operand defaults to current value; "Change input" escape hatch
 */

import { useCallback, useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';

import type {
  ConditionLogicStep,
  ConditionOperand,
  ConditionOperatorType,
  ChainBranch,
  ElseIfStep,
  StaticValueBranch,
} from '../lib/chain-builder-state';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPERATOR_OPTIONS: { value: ConditionOperatorType; label: string }[] = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equal to' },
  { value: 'gt', label: 'greater than' },
  { value: 'gte', label: 'greater than or equal to' },
  { value: 'lt', label: 'less than' },
  { value: 'lte', label: 'less than or equal to' },
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'isNull', label: 'is null' },
  { value: 'isNotNull', label: 'is not null' },
  { value: 'isTruthy', label: 'is true' },
  { value: 'isFalsy', label: 'is false' },
];

const UNARY_OPERATORS = new Set<ConditionOperatorType>([
  'isNull',
  'isNotNull',
  'isTruthy',
  'isFalsy',
]);

const MAX_ELSE_IF_LEVELS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainConditionFormProps {
  /** Zero-based index of this step in the chain. */
  readonly stepIndex: number;
  /** The current condition step state. */
  readonly step: ConditionLogicStep;
  /** Fires when any field in this step changes. */
  readonly onStepChange: (index: number, step: ConditionLogicStep) => void;
  /** Fires when the user removes this step. */
  readonly onRemoveStep: (index: number) => void;
  /** Label for the current accumulated value (shown in left operand). */
  readonly currentValueLabel?: string;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function operandLabel(operand: ConditionOperand): string {
  if (operand.kind === 'currentValue') return 'current value';
  if (operand.kind === 'source') return operand.path || '(empty field)';
  return operand.value || '(empty)';
}

function branchLabel(branch: ChainBranch): string {
  if (branch.kind === 'static') {
    const v = branch.value;
    if (v.type === 'null') return 'null';
    if (v.type === 'boolean') return String(v.value);
    return String(v.value);
  }
  if (branch.kind === 'source') return branch.path || '(field)';
  return branch.raw || '(expression)';
}

function operatorLabel(op: ConditionOperatorType): string {
  return OPERATOR_OPTIONS.find((o) => o.value === op)?.label ?? op;
}

/**
 * Produces a one-line readable summary of the condition step.
 * Format: if {left} {op} {right} then {then} else {else}
 */
export function summarizeConditionStep(step: ConditionLogicStep): string {
  const left = step.useCurrentValue ? 'current value' : operandLabel(step.customLeftOperand ?? { kind: 'currentValue' });
  const op = operatorLabel(step.operator);
  const isUnary = UNARY_OPERATORS.has(step.operator);
  const right = isUnary ? '' : ` "${operandLabel(step.rightOperand)}"`;
  const then = branchLabel(step.thenBranch);
  const els = branchLabel(step.elseBranch);

  const truncate = (s: string, max = 20) => s.length > max ? s.slice(0, max) + '…' : s;

  return `if ${truncate(left)} ${op}${right} then "${truncate(then)}" else "${truncate(els)}"`;
}

function makeEmptyStaticBranch(): ChainBranch {
  return { kind: 'static', value: { type: 'string', value: '' } };
}

function serializeBranchToText(branch: ChainBranch): string {
  if (branch.kind === 'expression') return branch.raw;
  if (branch.kind === 'source') return branch.path === '' ? '' : `source("${branch.path}")`;
  const v = branch.value;
  if (v.type === 'null') return 'null';
  return String(v.value);
}

function makeEmptyElseIfStep(): ElseIfStep {
  return {
    useCurrentValue: true,
    operator: 'eq',
    rightOperand: { kind: 'literal', value: '' },
    thenBranch: makeEmptyStaticBranch(),
  };
}

// ---------------------------------------------------------------------------
// BranchEditor sub-component (THEN / ELSE)
// ---------------------------------------------------------------------------

interface BranchEditorProps {
  readonly branch: ChainBranch;
  readonly onChange: (branch: ChainBranch) => void;
  readonly label: string;
  readonly testIdPrefix: string;
}

function BranchEditor({ branch, onChange, label, testIdPrefix }: BranchEditorProps) {
  const lastSimpleModeRef = useRef<'source' | 'static'>(
    branch.kind === 'expression' ? 'static' : branch.kind === 'source' ? 'source' : 'static',
  );
  if (branch.kind !== 'expression') {
    lastSimpleModeRef.current = branch.kind === 'source' ? 'source' : 'static';
  }
  const isExpression = branch.kind === 'expression';

  const handleStaticTypeChange = useCallback(
    (type: StaticValueBranch['type']) => {
      if (type === 'null') onChange({ kind: 'static', value: { type: 'null' } });
      else if (type === 'boolean') onChange({ kind: 'static', value: { type: 'boolean', value: false } });
      else if (type === 'number') onChange({ kind: 'static', value: { type: 'number', value: 0 } });
      else onChange({ kind: 'static', value: { type: 'string', value: '' } });
    },
    [onChange],
  );

  return (
    <div className="flex items-start gap-2" data-testid={testIdPrefix}>
      <span className="text-xs font-semibold text-zinc-300 w-12 shrink-0 pt-1">{label}</span>
      <div className="flex-1 space-y-1.5">
        {!isExpression && (
          <>
            <div
              role="group"
              aria-label={`${label} branch kind`}
              className="inline-flex rounded border border-zinc-700 overflow-hidden text-xs"
              data-testid={`${testIdPrefix}-kind-toggle`}
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
                data-testid={`${testIdPrefix}-kind-source`}
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
                data-testid={`${testIdPrefix}-kind-static`}
              >
                Static
              </button>
              <span
                role="radio"
                aria-checked={false}
                aria-disabled="true"
                title="External data sources — available in a future release"
                className="px-2.5 py-1 font-medium bg-zinc-800 text-zinc-600 opacity-50 cursor-not-allowed select-none"
                data-testid={`${testIdPrefix}-kind-external`}
              >
                External
              </span>
            </div>

            {branch.kind === 'source' && (
              <input
                type="text"
                value={branch.path}
                onChange={(e) => { onChange({ kind: 'source', path: e.target.value, steps: [] }); }}
                placeholder="Field path…"
                aria-label={`${label} source field path`}
                className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
                data-testid={`${testIdPrefix}-source-input`}
              />
            )}

            {branch.kind === 'static' && (
              <div className="flex items-center gap-1" data-testid={`${testIdPrefix}-static`}>
                <select
                  value={branch.value.type}
                  onChange={(e) => { handleStaticTypeChange(e.target.value as StaticValueBranch['type']); }}
                  aria-label={`${label} value type`}
                  className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 shrink-0"
                  data-testid={`${testIdPrefix}-static-type`}
                >
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="null">Null</option>
                </select>
                {branch.value.type === 'null' ? (
                  <span className="text-xs text-zinc-500 italic">null</span>
                ) : branch.value.type === 'boolean' ? (
                  <select
                    value={String(branch.value.value)}
                    onChange={(e) => {
                      onChange({ kind: 'static', value: { type: 'boolean', value: e.target.value === 'true' } });
                    }}
                    aria-label={`${label} boolean value`}
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
                    placeholder={branch.value.type === 'number' ? '0' : 'Value…'}
                    aria-label={`${label} value`}
                    className="flex-1 min-w-0 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
                    data-testid={`${testIdPrefix}-static-input`}
                  />
                )}
              </div>
            )}

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

        {isExpression && (
          <div className="space-y-1">
            <textarea
              value={branch.raw}
              onChange={(e) => { onChange({ kind: 'expression', raw: e.target.value }); }}
              placeholder="Enter expression…"
              aria-label={`${label} DSL expression`}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// RightOperandEditor sub-component (IF comparison value)
// ---------------------------------------------------------------------------

interface RightOperandEditorProps {
  readonly operand: ConditionOperand;
  readonly onChange: (operand: ConditionOperand) => void;
  readonly testIdPrefix: string;
}

type StaticType = 'string' | 'number' | 'boolean' | 'null';

function RightOperandEditor({ operand, onChange, testIdPrefix }: RightOperandEditorProps) {
  const [isExpression, setIsExpression] = useState(false);
  const [staticType, setStaticType] = useState<StaticType>('string');
  const isSource = operand.kind === 'source';
  const isLiteral = operand.kind === 'literal' || operand.kind === 'currentValue';

  const handleStaticTypeChange = (type: StaticType) => {
    setStaticType(type);
    if (type === 'null') onChange({ kind: 'literal', value: 'null' });
    else if (type === 'boolean') onChange({ kind: 'literal', value: 'false' });
    else onChange({ kind: 'literal', value: '' });
  };

  return (
    <div className="space-y-1.5" data-testid={testIdPrefix}>
      {!isExpression && (
        <>
          <div
            className="inline-flex rounded border border-zinc-700 overflow-hidden text-xs"
            role="group"
            aria-label="Comparison value kind"
            data-testid={`${testIdPrefix}-kind-toggle`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={isSource}
              onClick={() => { onChange({ kind: 'source', path: '' }); }}
              className={[
                'px-2.5 py-1 font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                isSource
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
              aria-checked={isLiteral}
              onClick={() => { onChange({ kind: 'literal', value: '' }); }}
              className={[
                'px-2.5 py-1 font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                isLiteral
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

          {isSource && (
            <input
              type="text"
              value={operand.kind === 'source' ? operand.path : ''}
              onChange={(e) => { onChange({ kind: 'source', path: e.target.value }); }}
              placeholder="Field path…"
              aria-label="Comparison source field"
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
              data-testid={`${testIdPrefix}-source-input`}
            />
          )}
          {isLiteral && (
            <div className="flex items-center gap-1" data-testid={`${testIdPrefix}-static`}>
              <select
                value={staticType}
                onChange={(e) => { handleStaticTypeChange(e.target.value as StaticType); }}
                aria-label="Comparison value type"
                className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 shrink-0"
                data-testid={`${testIdPrefix}-static-type`}
              >
                <option value="string">Str</option>
                <option value="number">Num</option>
                <option value="boolean">Bool</option>
                <option value="null">Null</option>
              </select>
              {staticType === 'null' ? (
                <span className="text-xs text-zinc-500 italic px-1">null</span>
              ) : staticType === 'boolean' ? (
                <select
                  value={operand.kind === 'literal' ? operand.value : 'false'}
                  onChange={(e) => { onChange({ kind: 'literal', value: e.target.value }); }}
                  aria-label="Boolean comparison value"
                  className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
                  data-testid={`${testIdPrefix}-static-boolean`}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type={staticType === 'number' ? 'number' : 'text'}
                  value={operand.kind === 'literal' ? operand.value : ''}
                  onChange={(e) => { onChange({ kind: 'literal', value: e.target.value }); }}
                  placeholder={staticType === 'number' ? '0' : 'Compare value…'}
                  aria-label="Comparison value"
                  className="flex-1 min-w-0 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
                  data-testid={`${testIdPrefix}-static-input`}
                />
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => { setIsExpression(true); }}
            className="text-[11px] text-zinc-500 hover:text-blue-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
            data-testid={`${testIdPrefix}-expression-link`}
          >
            Use advanced expression
          </button>
        </>
      )}

      {isExpression && (
        <div className="space-y-1">
          <textarea
            defaultValue={operand.kind === 'literal' ? operand.value : ''}
            onChange={(e) => { onChange({ kind: 'literal', value: e.target.value }); }}
            placeholder="Enter expression…"
            aria-label="Comparison expression"
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 resize-none"
            data-testid={`${testIdPrefix}-expression-input`}
          />
          <button
            type="button"
            onClick={() => { setIsExpression(false); onChange({ kind: 'literal', value: '' }); }}
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
// ConditionRow sub-component (IF row)
// ---------------------------------------------------------------------------

interface ConditionRowProps {
  readonly currentValueLabel: string;
  readonly operator: ConditionOperatorType;
  readonly rightOperand: ConditionOperand;
  readonly onOperatorChange: (op: ConditionOperatorType) => void;
  readonly onRightOperandChange: (op: ConditionOperand) => void;
  readonly testIdPrefix: string;
}

function ConditionRowFields({
  currentValueLabel,
  operator,
  rightOperand,
  onOperatorChange,
  onRightOperandChange,
  testIdPrefix,
}: ConditionRowProps) {
  const isUnary = UNARY_OPERATORS.has(operator);

  return (
    <div className="space-y-2" data-testid={testIdPrefix}>
      {/* IF label + current value display */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-zinc-300 w-12 shrink-0">IF</span>
        <div
          className="flex-1 px-2 py-1 rounded bg-zinc-700/60 border border-zinc-600 text-xs text-zinc-300 font-mono truncate"
          data-testid={`${testIdPrefix}-left-current-value`}
        >
          {currentValueLabel}
        </div>
      </div>

      {/* Operator */}
      <div className="flex items-center gap-2 pl-14">
        <select
          value={operator}
          onChange={(e) => { onOperatorChange(e.target.value as ConditionOperatorType); }}
          aria-label="Comparison operator"
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
          data-testid={`${testIdPrefix}-operator`}
        >
          {OPERATOR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Right operand */}
      {!isUnary && (
        <div className="pl-14">
          <RightOperandEditor
            operand={rightOperand}
            onChange={onRightOperandChange}
            testIdPrefix={`${testIdPrefix}-right`}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Inline condition builder for the chain model.
 */
export function ChainConditionForm({
  stepIndex,
  step,
  onStepChange,
  onRemoveStep: _onRemoveStep,
  currentValueLabel = 'current value',
  className,
}: ChainConditionFormProps) {
  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const update = useCallback(
    (partial: Partial<ConditionLogicStep>) => {
      onStepChange(stepIndex, { ...step, ...partial });
    },
    [stepIndex, step, onStepChange],
  );

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  function isBranchEmpty(branch: ChainBranch): boolean {
    if (branch.kind === 'static') {
      const v = branch.value;
      if (v.type === 'null') return false; // null is a valid explicit value
      return String(v.value) === '';
    }
    if (branch.kind === 'source') return branch.path === '';
    return branch.raw === '';
  }

  const elseEmpty = isBranchEmpty(step.elseBranch);
  const thenEmpty = isBranchEmpty(step.thenBranch);
  const applyDisabled = elseEmpty || thenEmpty;

  // -------------------------------------------------------------------------
  // Else-if management
  // -------------------------------------------------------------------------

  const elseIfSteps = step.elseIfSteps ?? [];
  const canAddElseIf = elseIfSteps.length < MAX_ELSE_IF_LEVELS;

  const handleAddElseIf = useCallback(() => {
    update({ elseIfSteps: [...elseIfSteps, makeEmptyElseIfStep()] });
  }, [update, elseIfSteps]);

  const handleRemoveElseIf = useCallback(
    (index: number) => {
      update({ elseIfSteps: elseIfSteps.filter((_, i) => i !== index) });
    },
    [update, elseIfSteps],
  );

  const handleElseIfChange = useCallback(
    (index: number, partial: Partial<ElseIfStep>) => {
      update({
        elseIfSteps: elseIfSteps.map((s, i) => (i === index ? { ...s, ...partial } : s)),
      });
    },
    [update, elseIfSteps],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={['space-y-4', className ?? ''].filter(Boolean).join(' ')}
      data-testid={`chain-condition-form-${stepIndex}`}
    >
      {/* IF section */}
      <ConditionRowFields
        currentValueLabel={currentValueLabel}
        operator={step.operator}
        rightOperand={step.rightOperand}
        onOperatorChange={(op) => { update({ operator: op }); }}
        onRightOperandChange={(op) => { update({ rightOperand: op }); }}
        testIdPrefix={`chain-condition-if-${stepIndex}`}
      />

      {/* THEN section */}
      <div
        className="border-t border-slate-700/50 pt-3"
        data-testid={`chain-condition-then-${stepIndex}`}
      >
        <BranchEditor
          branch={step.thenBranch}
          onChange={(b) => { update({ thenBranch: b }); }}
          label="THEN"
          testIdPrefix={`chain-condition-then-branch-${stepIndex}`}
        />
      </div>

      {/* Else-if steps */}
      {elseIfSteps.map((elseIf, i) => (
        <div
          key={i}
          className="space-y-3 border-t border-slate-700/50 pt-3"
          data-testid={`chain-condition-elseif-${stepIndex}-${i}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Else if
            </span>
            <button
              type="button"
              onClick={() => { handleRemoveElseIf(i); }}
              aria-label={`Remove else-if ${i + 1}`}
              className="rounded p-0.5 text-slate-500 transition-colors hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
              data-testid={`chain-condition-elseif-remove-${stepIndex}-${i}`}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          <ConditionRowFields
            currentValueLabel={currentValueLabel}
            operator={elseIf.operator}
            rightOperand={elseIf.rightOperand}
            onOperatorChange={(op) => { handleElseIfChange(i, { operator: op }); }}
            onRightOperandChange={(op) => { handleElseIfChange(i, { rightOperand: op }); }}
            testIdPrefix={`chain-condition-elseif-row-${stepIndex}-${i}`}
          />
          <BranchEditor
            branch={elseIf.thenBranch}
            onChange={(b) => { handleElseIfChange(i, { thenBranch: b }); }}
            label="THEN"
            testIdPrefix={`chain-condition-elseif-then-${stepIndex}-${i}`}
          />
        </div>
      ))}

      {/* ELSE section */}
      <div
        className="space-y-2 border-t border-slate-700/50 pt-3"
        data-testid={`chain-condition-else-${stepIndex}`}
      >
        <BranchEditor
          branch={step.elseBranch}
          onChange={(b) => { update({ elseBranch: b }); }}
          label="ELSE"
          testIdPrefix={`chain-condition-else-branch-${stepIndex}`}
        />
        {elseEmpty && (
          <p
            className="text-[11px] text-amber-400 pl-14"
            role="alert"
            aria-live="polite"
            data-testid={`chain-condition-else-required-${stepIndex}`}
          >
            Else branch is required
          </p>
        )}

        {/* [+ Add else-if] */}
        {canAddElseIf && (
          <button
            type="button"
            onClick={handleAddElseIf}
            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded px-2 py-1 border border-dashed border-blue-800 hover:border-blue-600 transition-colors"
            data-testid={`chain-condition-add-elseif-${stepIndex}`}
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Add else-if
          </button>
        )}
      </div>

      {/* Apply disabled notice */}
      {applyDisabled && (
        <p
          className="text-[11px] italic text-slate-500"
          data-testid={`chain-condition-apply-disabled-${stepIndex}`}
        >
          Fill in all required branches to apply.
        </p>
      )}
    </div>
  );
}
