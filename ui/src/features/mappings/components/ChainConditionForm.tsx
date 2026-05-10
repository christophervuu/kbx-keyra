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

import { useCallback, useState } from 'react';
import { X, Plus, ChevronDown, ChevronUp } from 'lucide-react';

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

function makeEmptyElseIfStep(): ElseIfStep {
  return {
    useCurrentValue: true,
    operator: 'eq',
    rightOperand: { kind: 'literal', value: '' },
    thenBranch: makeEmptyStaticBranch(),
  };
}

// ---------------------------------------------------------------------------
// BranchEditor sub-component
// ---------------------------------------------------------------------------

type BranchKind = 'static' | 'source' | 'expression';

interface BranchEditorProps {
  readonly branch: ChainBranch;
  readonly onChange: (branch: ChainBranch) => void;
  readonly label: string;
  readonly testIdPrefix: string;
}

function BranchEditor({ branch, onChange, label, testIdPrefix }: BranchEditorProps) {
  const currentKind: BranchKind = branch.kind;

  const handleKindChange = useCallback(
    (kind: BranchKind) => {
      if (kind === 'static') onChange({ kind: 'static', value: { type: 'string', value: '' } });
      else if (kind === 'source') onChange({ kind: 'source', path: '', steps: [] });
      else onChange({ kind: 'expression', raw: '' });
    },
    [onChange],
  );

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

  const handleSourcePathChange = useCallback(
    (path: string) => {
      onChange({ kind: 'source', path, steps: [] });
    },
    [onChange],
  );

  const handleExpressionChange = useCallback(
    (raw: string) => {
      onChange({ kind: 'expression', raw });
    },
    [onChange],
  );

  return (
    <div className="space-y-2" data-testid={testIdPrefix}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-zinc-300 w-12 shrink-0">{label}</span>
        {/* Kind toggle */}
        <div
          role="group"
          aria-label={`${label} branch kind`}
          className="inline-flex rounded border border-zinc-700 overflow-hidden text-xs"
          data-testid={`${testIdPrefix}-kind-toggle`}
        >
          {(['static', 'source', 'expression'] as BranchKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={currentKind === k}
              onClick={() => { handleKindChange(k); }}
              className={[
                'px-2 py-1 font-medium capitalize transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                currentKind === k
                  ? 'bg-blue-700 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
              ].join(' ')}
              data-testid={`${testIdPrefix}-kind-${k}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* Static branch */}
      {branch.kind === 'static' && (
        <div className="flex items-center gap-2 pl-14" data-testid={`${testIdPrefix}-static`}>
          {/* Type selector */}
          <select
            value={branch.value.type}
            onChange={(e) => { handleStaticTypeChange(e.target.value as StaticValueBranch['type']); }}
            aria-label={`${label} value type`}
            className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
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
              className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
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
              placeholder={branch.value.type === 'number' ? '0' : 'Value…'}
              aria-label={`${label} value`}
              className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
              data-testid={`${testIdPrefix}-static-input`}
            />
          )}
        </div>
      )}

      {/* Source branch */}
      {branch.kind === 'source' && (
        <div className="pl-14" data-testid={`${testIdPrefix}-source`}>
          <input
            type="text"
            value={branch.path}
            onChange={(e) => { handleSourcePathChange(e.target.value); }}
            placeholder="Field path…"
            aria-label={`${label} source field path`}
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            data-testid={`${testIdPrefix}-source-input`}
          />
        </div>
      )}

      {/* Expression branch */}
      {branch.kind === 'expression' && (
        <div className="pl-14" data-testid={`${testIdPrefix}-expression`}>
          <input
            type="text"
            value={branch.raw}
            onChange={(e) => { handleExpressionChange(e.target.value); }}
            placeholder="DSL expression…"
            aria-label={`${label} DSL expression`}
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            data-testid={`${testIdPrefix}-expression-input`}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OperandInput sub-component
// ---------------------------------------------------------------------------

interface OperandInputProps {
  readonly operand: ConditionOperand;
  readonly onChange: (operand: ConditionOperand) => void;
  readonly label: string;
  readonly testIdPrefix: string;
}

function OperandInput({ operand, onChange, label, testIdPrefix }: OperandInputProps) {
  const kind = operand.kind === 'currentValue' ? 'source' : operand.kind;

  return (
    <div className="flex-1 min-w-0" data-testid={testIdPrefix}>
      {operand.kind === 'currentValue' ? (
        <div
          className="px-2 py-1 rounded bg-zinc-700/60 border border-zinc-600 text-xs text-zinc-400 italic"
          data-testid={`${testIdPrefix}-current-value`}
        >
          current value
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as 'source' | 'literal';
              if (k === 'source') onChange({ kind: 'source', path: '' });
              else onChange({ kind: 'literal', value: '' });
            }}
            aria-label={`${label} operand kind`}
            className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
            data-testid={`${testIdPrefix}-kind`}
          >
            <option value="source">Field</option>
            <option value="literal">Value</option>
          </select>
          <input
            type="text"
            value={operand.kind === 'source' ? operand.path : operand.value}
            onChange={(e) => {
              if (operand.kind === 'source') onChange({ kind: 'source', path: e.target.value });
              else onChange({ kind: 'literal', value: e.target.value });
            }}
            placeholder={operand.kind === 'source' ? 'Field path…' : 'Value…'}
            aria-label={label}
            className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            data-testid={`${testIdPrefix}-input`}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConditionRow sub-component (IF row)
// ---------------------------------------------------------------------------

interface ConditionRowProps {
  readonly useCurrentValue: boolean;
  readonly customLeftOperand: ConditionOperand | undefined;
  readonly operator: ConditionOperatorType;
  readonly rightOperand: ConditionOperand;
  readonly onUseCurrentValueChange: (v: boolean) => void;
  readonly onCustomLeftOperandChange: (op: ConditionOperand) => void;
  readonly onOperatorChange: (op: ConditionOperatorType) => void;
  readonly onRightOperandChange: (op: ConditionOperand) => void;
  readonly testIdPrefix: string;
}

function ConditionRowFields({
  useCurrentValue,
  customLeftOperand,
  operator,
  rightOperand,
  onUseCurrentValueChange,
  onCustomLeftOperandChange,
  onOperatorChange,
  onRightOperandChange,
  testIdPrefix,
}: ConditionRowProps) {
  const isUnary = UNARY_OPERATORS.has(operator);
  const leftOperand: ConditionOperand = useCurrentValue
    ? { kind: 'currentValue' }
    : (customLeftOperand ?? { kind: 'source', path: '' });

  return (
    <div className="space-y-2" data-testid={testIdPrefix}>
      {/* Left operand row */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 w-6 shrink-0">IF</span>
        <OperandInput
          operand={leftOperand}
          onChange={(op) => {
            onUseCurrentValueChange(false);
            onCustomLeftOperandChange(op);
          }}
          label="Left operand"
          testIdPrefix={`${testIdPrefix}-left`}
        />
      </div>

      {/* Change input affordance */}
      {useCurrentValue && (
        <div className="pl-8">
          <button
            type="button"
            onClick={() => {
              onUseCurrentValueChange(false);
              onCustomLeftOperandChange({ kind: 'source', path: '' });
            }}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded underline underline-offset-2"
            data-testid={`${testIdPrefix}-change-input`}
          >
            Change input
          </button>
        </div>
      )}

      {/* Restore current value affordance */}
      {!useCurrentValue && (
        <div className="pl-8">
          <button
            type="button"
            onClick={() => { onUseCurrentValueChange(true); }}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded underline underline-offset-2"
            data-testid={`${testIdPrefix}-use-current-value`}
          >
            Use current value
          </button>
        </div>
      )}

      {/* Operator row */}
      <div className="flex items-center gap-2 pl-8">
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

      {/* Right operand row */}
      {!isUnary && (
        <div className="flex items-center gap-2 pl-8">
          <OperandInput
            operand={rightOperand}
            onChange={onRightOperandChange}
            label="Right operand"
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
  onRemoveStep,
  currentValueLabel = 'current value',
  className,
}: ChainConditionFormProps) {
  const [collapsed, setCollapsed] = useState(false);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const update = useCallback(
    (partial: Partial<ConditionLogicStep>) => {
      onStepChange(stepIndex, { ...step, ...partial });
    },
    [stepIndex, step, onStepChange],
  );

  const handleRemove = useCallback(() => {
    onRemoveStep(stepIndex);
  }, [stepIndex, onRemoveStep]);

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
  // Collapsed summary
  // -------------------------------------------------------------------------

  if (collapsed) {
    return (
      <div
        className={[
          'rounded-lg border border-zinc-700 bg-zinc-800/60 overflow-hidden',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid={`chain-condition-form-${stepIndex}`}
      >
        <button
          type="button"
          onClick={() => { setCollapsed(false); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-700/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 transition-colors"
          aria-label="Expand condition step"
          data-testid={`chain-condition-summary-${stepIndex}`}
        >
          <span className="text-[11px] font-mono text-zinc-400 flex-1 truncate">
            {summarizeConditionStep(step)}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" aria-hidden="true" />
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
        'rounded-lg border border-zinc-700 bg-zinc-800/60 overflow-hidden',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`chain-condition-form-${stepIndex}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700 bg-zinc-800">
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
          Condition
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setCollapsed(true); }}
            aria-label="Collapse condition step"
            className="text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded p-0.5 transition-colors"
            data-testid={`chain-condition-collapse-${stepIndex}`}
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleRemove}
            aria-label="Remove condition step"
            className="text-zinc-500 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded p-0.5 transition-colors"
            data-testid={`chain-condition-remove-${stepIndex}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {/* IF section */}
        <ConditionRowFields
          useCurrentValue={step.useCurrentValue}
          customLeftOperand={step.customLeftOperand}
          operator={step.operator}
          rightOperand={step.rightOperand}
          onUseCurrentValueChange={(v) => { update({ useCurrentValue: v }); }}
          onCustomLeftOperandChange={(op) => { update({ customLeftOperand: op }); }}
          onOperatorChange={(op) => { update({ operator: op }); }}
          onRightOperandChange={(op) => { update({ rightOperand: op }); }}
          testIdPrefix={`chain-condition-if-${stepIndex}`}
        />

        {/* THEN section */}
        <div
          className="border-t border-zinc-700/50 pt-3"
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
            className="border-t border-zinc-700/50 pt-3 space-y-3"
            data-testid={`chain-condition-elseif-${stepIndex}-${i}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Else if
              </span>
              <button
                type="button"
                onClick={() => { handleRemoveElseIf(i); }}
                aria-label={`Remove else-if ${i + 1}`}
                className="text-zinc-500 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded p-0.5 transition-colors"
                data-testid={`chain-condition-elseif-remove-${stepIndex}-${i}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
            <ConditionRowFields
              useCurrentValue={elseIf.useCurrentValue}
              customLeftOperand={elseIf.customLeftOperand}
              operator={elseIf.operator}
              rightOperand={elseIf.rightOperand}
              onUseCurrentValueChange={(v) => { handleElseIfChange(i, { useCurrentValue: v }); }}
              onCustomLeftOperandChange={(op) => { handleElseIfChange(i, { customLeftOperand: op }); }}
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
          className="border-t border-zinc-700/50 pt-3 space-y-2"
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
            className="text-[11px] text-zinc-500 italic"
            data-testid={`chain-condition-apply-disabled-${stepIndex}`}
          >
            Fill in all required branches to apply.
          </p>
        )}
      </div>
    </div>
  );
}
