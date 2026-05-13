/**
 * StaticValueInput — FS-038 T-06
 *
 * Text input for entering a static literal value with target-type validation.
 *
 * Behaviour:
 *   - User types a value; the component infers the DSL type from the input
 *   - Validates the inferred type against the target field's schema type
 *   - Shows a green checkmark for valid input, red X + error message for mismatch
 *   - Fires `onValueChange(value: StaticValueBranch)` on every valid change
 *   - Fires `onValidChange(isValid: boolean)` so parent can gate the Apply button
 *
 * Type inference rules (lenient for BA users):
 *   - "true" / "false"          → boolean
 *   - "null"                    → null
 *   - parseable finite number   → number
 *   - everything else           → string (auto-treated as string, no manual quoting needed)
 *
 * Validation rules:
 *   - target string:  any input is valid (string is always accepted)
 *   - target number / integer: input must infer as number
 *   - target boolean: input must infer as boolean
 *   - target null:    input must be "null"
 *   - target unknown: any input is valid
 *
 * Also renders a "+ Add logic" button below the input.
 */

import { Check, X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useState } from 'react';

import type { StaticValueBranch } from '../lib/chain-builder-state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StaticValueInputProps {
  /** Initial raw text value (empty string for new entry). */
  readonly initialValue?: string;
  /** The JSON Schema type of the target field (e.g. "string", "number", "boolean"). */
  readonly targetType: string;
  /** Fires when the parsed static value changes (only called for valid inputs). */
  readonly onValueChange: (value: StaticValueBranch) => void;
  /** Fires whenever validity changes — parent uses this to gate Apply. */
  readonly onValidChange: (isValid: boolean) => void;
  /** Fires when the user clicks "+ Add logic". */
  readonly onAddLogic: () => void;
  /** Controls whether the inline "+ Add logic" button is shown. */
  readonly showAddLogicButton?: boolean;
  /** Optional className for the root element. */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

type InferredType = 'string' | 'number' | 'boolean' | 'null';

/**
 * Infers the DSL type from a raw input string.
 * Lenient: unquoted text is treated as string (no manual quoting required).
 */
function inferType(raw: string): InferredType {
  const trimmed = raw.trim();
  if (trimmed === 'true' || trimmed === 'false') return 'boolean';
  if (trimmed === 'null') return 'null';
  if (trimmed !== '' && isFinite(Number(trimmed))) return 'number';
  return 'string';
}

/**
 * Converts a raw input string to a StaticValueBranch.
 */
function parseStaticValue(raw: string): StaticValueBranch {
  const trimmed = raw.trim();
  const type = inferType(raw);
  switch (type) {
    case 'boolean':
      return { type: 'boolean', value: trimmed === 'true' };
    case 'null':
      return { type: 'null' };
    case 'number':
      return { type: 'number', value: Number(trimmed) };
    case 'string':
      return { type: 'string', value: raw }; // preserve original (including spaces)
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Normalises a target type string to a canonical form for comparison.
 */
function normaliseTargetType(targetType: string): string {
  const t = targetType.toLowerCase().trim();
  if (t === 'integer') return 'number';
  return t;
}

/**
 * Returns true when the inferred type is compatible with the target type.
 */
function isTypeCompatible(inferred: InferredType, targetType: string): boolean {
  const normalised = normaliseTargetType(targetType);
  switch (normalised) {
    case 'string':
      return true; // any input is valid for string targets
    case 'number':
      return inferred === 'number';
    case 'boolean':
      return inferred === 'boolean';
    case 'null':
      return inferred === 'null';
    default:
      return true; // unknown target type — accept anything
  }
}

/**
 * Returns the human-readable error message for a type mismatch.
 */
function typeErrorMessage(targetType: string): string {
  const normalised = normaliseTargetType(targetType);
  return `Expected ${normalised}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * StaticValueInput — literal value entry with target-type validation.
 *
 * Renders a text input, a validation indicator, an optional error message,
 * and a "+ Add logic" button.
 */
export function StaticValueInput({
  initialValue = '',
  targetType,
  onValueChange,
  onValidChange,
  onAddLogic,
  showAddLogicButton = true,
  className,
}: StaticValueInputProps) {
  const [rawValue, setRawValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  const inferred = inferType(rawValue);
  const isEmpty = rawValue.trim() === '';
  const isValid = !isEmpty && isTypeCompatible(inferred, targetType);
  const showError = touched && !isEmpty && !isValid;
  const showSuccess = !isEmpty && isValid;

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setRawValue(next);
      setTouched(true);

      const nextInferred = inferType(next);
      const nextIsEmpty = next.trim() === '';
      const nextIsValid = !nextIsEmpty && isTypeCompatible(nextInferred, targetType);

      onValidChange(nextIsValid);
      if (nextIsValid) {
        onValueChange(parseStaticValue(next));
      }
    },
    [targetType, onValueChange, onValidChange],
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
  }, []);

  return (
    <div
      className={['flex flex-col gap-2', className ?? ''].filter(Boolean).join(' ')}
      data-testid="static-value-input"
    >
      {/* Target type label */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-zinc-500">Value</span>
        <span
          className="rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-zinc-700 text-zinc-400"
          data-testid="static-value-target-type"
        >
          {targetType}
        </span>
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={rawValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={getPlaceholder(targetType)}
          className={[
            'flex-1 rounded-md border bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors',
            showError
              ? 'border-red-500'
              : showSuccess
                ? 'border-green-600'
                : 'border-zinc-700',
          ].join(' ')}
          aria-label="Static value"
          aria-invalid={showError}
          aria-describedby={showError ? 'static-value-error' : undefined}
          data-testid="static-value-text-input"
        />

        {/* Validation indicator */}
        {showSuccess && (
          <Check
            className="h-4 w-4 flex-shrink-0 text-green-500"
            aria-label="Valid"
            data-testid="static-value-valid-icon"
          />
        )}
        {showError && (
          <X
            className="h-4 w-4 flex-shrink-0 text-red-500"
            aria-label="Invalid"
            data-testid="static-value-invalid-icon"
          />
        )}
      </div>

      {/* Error message */}
      {showError && (
        <p
          id="static-value-error"
          className="text-xs text-red-400"
          role="alert"
          data-testid="static-value-error"
        >
          {typeErrorMessage(targetType)}
        </p>
      )}

      {/* + Add logic button */}
      {showAddLogicButton && (
        <button
          type="button"
          onClick={onAddLogic}
          className="inline-flex items-center gap-1 self-start rounded px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-zinc-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Add logic step"
          data-testid="static-value-add-logic"
        >
          + Add logic
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPlaceholder(targetType: string): string {
  const normalised = normaliseTargetType(targetType);
  switch (normalised) {
    case 'number':
      return '42';
    case 'boolean':
      return 'true or false';
    case 'null':
      return 'null';
    default:
      return 'Enter a value…';
  }
}
