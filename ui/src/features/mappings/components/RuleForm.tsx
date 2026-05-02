import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { Button } from '@/components';
import type { MappingRule } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RuleFormMode = 'add' | 'edit';

export interface RuleFormProps {
  /** Whether the form is in 'add' or 'edit' mode */
  mode: RuleFormMode;
  /** Initial values (populated in edit mode, empty in add mode) */
  initialValues?: Partial<Pick<MappingRule, 'target' | 'expression' | 'description'>>;
  /** Called when the form is submitted with valid data */
  onSave: (rule: Pick<MappingRule, 'target' | 'expression' | 'description'>) => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Form for adding or editing a mapping rule.
 * Fields: target path (required), expression (optional), description (optional).
 */
export function RuleForm({
  mode,
  initialValues,
  onSave,
  onCancel,
}: RuleFormProps) {
  const [target, setTarget] = useState(initialValues?.target ?? '');
  const [expression, setExpression] = useState(initialValues?.expression ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [targetError, setTargetError] = useState<string | null>(null);

  const targetInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Validate target (required)
    const trimmedTarget = target.trim();
    if (!trimmedTarget) {
      setTargetError('Target path is required');
      targetInputRef.current?.focus();
      return;
    }

    setTargetError(null);
    onSave({
      target: trimmedTarget,
      expression: expression.trim(),
      description: description.trim() || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-b border-slate-700 bg-slate-900/80 px-4 py-3"
      data-testid="rule-form"
      aria-label={mode === 'add' ? 'Add rule form' : 'Edit rule form'}
    >
      <div className="space-y-3">
        {/* Target path */}
        <div>
          <label
            htmlFor="rule-form-target"
            className="block text-xs font-medium text-slate-300"
          >
            Target Path <span className="text-red-400">*</span>
          </label>
          <input
            ref={targetInputRef}
            id="rule-form-target"
            type="text"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              if (targetError) setTargetError(null);
            }}
            placeholder="e.g. Order.Header.DocType"
            className={`mt-1 w-full rounded border bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
              targetError ? 'border-red-500' : 'border-slate-700'
            }`}
            aria-invalid={!!targetError}
            aria-describedby={targetError ? 'rule-form-target-error' : undefined}
            data-testid="rule-form-target-input"
          />
          {targetError && (
            <p
              id="rule-form-target-error"
              className="mt-1 text-xs text-red-400"
              role="alert"
            >
              {targetError}
            </p>
          )}
        </div>

        {/* Expression */}
        <div>
          <label
            htmlFor="rule-form-expression"
            className="block text-xs font-medium text-slate-300"
          >
            Expression
          </label>
          <textarea
            id="rule-form-expression"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder='e.g. source("orderDate")'
            rows={2}
            className="mt-1 w-full resize-y rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid="rule-form-expression-input"
          />
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="rule-form-description"
            className="block text-xs font-medium text-slate-300"
          >
            Description
          </label>
          <input
            id="rule-form-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid="rule-form-description-input"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" data-testid="rule-form-save">
          {mode === 'add' ? 'Add Rule' : 'Save Changes'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          data-testid="rule-form-cancel"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
