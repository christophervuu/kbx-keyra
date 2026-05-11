/**
 * CustomExpressionEditor.tsx — FS-043 T-12
 *
 * Raw DSL editor surface for the Custom Expression mode of the Array Builder.
 *
 * Features:
 *   - Wraps RawDslEditor with syntax highlighting, bracket matching, autocomplete
 *   - Parse status indicator (valid / invalid / empty)
 *   - Banner when loaded from an unrecognized expression (AE-12):
 *     "This expression uses a pattern not supported by the structured builder."
 *   - "Reset to structured mode" action — clears raw expression and returns to mode selector
 *   - When returning from structured mode: shows best-effort generated DSL (no banner)
 *   - "Restore previous structured draft" option when `previousStructuredDraft` is available (AE-13)
 *
 * Backward compatibility (AE-11 / AE-12):
 *   - Recognized patterns (map, filterMap, buildFromValues, mergeArrayBranches) are loaded
 *     in their structured modes by the decomposer (T-03) — this editor is only shown for
 *     unrecognized patterns or when the user explicitly selects Custom Expression.
 *   - The `isFromUnrecognized` prop drives the banner display.
 */

import { useRef, useCallback, useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, RotateCcw, History } from 'lucide-react';

import { RawDslEditor } from './RawDslEditor';
import { useDslValidation } from '../hooks/use-dsl-validation';
import { useDslAutocomplete } from '../hooks/use-dsl-autocomplete';
import type { ParsedSchema } from '@/lib/types/domain';
import type { RawDslEditorRef } from './RawDslEditor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomExpressionEditorProps {
  /** The current raw DSL expression. */
  readonly value: string;
  /** Fires on every expression change. */
  readonly onChange: (value: string) => void;
  /**
   * True when this editor was loaded from an expression that the decomposer
   * could not recognize as a structured pattern (AE-12).
   * Shows the "unrecognized pattern" banner.
   */
  readonly isFromUnrecognized?: boolean;
  /**
   * True when a previous structured draft is available to restore (AE-13).
   * Shows the "Restore previous draft" option.
   */
  readonly canRestorePreviousDraft?: boolean;
  /**
   * Fires when the user clicks "Reset to structured mode".
   * The parent should clear the expression and switch to mode selector.
   */
  readonly onResetToStructured: () => void;
  /**
   * Fires when the user clicks "Restore previous draft" (AE-13).
   * Only called when `canRestorePreviousDraft` is true.
   */
  readonly onRestorePreviousDraft?: () => void;
  /** Parsed source schema — for autocomplete. */
  readonly parsedSourceSchema?: ParsedSchema | null;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Sub-component: ParseStatusBadge
// ---------------------------------------------------------------------------

function ParseStatusBadge({
  expression,
  hasErrors,
}: {
  expression: string;
  hasErrors: boolean;
}) {
  if (!expression.trim()) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-600" aria-hidden="true" />
        Empty
      </span>
    );
  }
  if (hasErrors) {
    return (
      <span
        data-testid="parse-status-invalid"
        className="inline-flex items-center gap-1 text-[10px] text-red-400"
      >
        <XCircle size={10} aria-hidden="true" />
        Invalid expression
      </span>
    );
  }
  return (
    <span
      data-testid="parse-status-valid"
      className="inline-flex items-center gap-1 text-[10px] text-green-400"
    >
      <CheckCircle size={10} aria-hidden="true" />
      Valid expression
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CustomExpressionEditor({
  value,
  onChange,
  isFromUnrecognized = false,
  canRestorePreviousDraft = false,
  onResetToStructured,
  onRestorePreviousDraft,
  parsedSourceSchema = null,
  className = '',
}: CustomExpressionEditorProps) {
  const editorRef = useRef<RawDslEditorRef>(null);
  const [cursor, setCursor] = useState(0);

  const { diagnostics, errorDecorations } = useDslValidation(value);
  const hasErrors = diagnostics.some((d) => d.severity === 'error');

  const autocomplete = useDslAutocomplete({
    expression: value,
    cursorPosition: cursor,
    parsedSourceSchema: parsedSourceSchema ?? null,
  });

  const handleCursorChange = useCallback((pos: number) => {
    setCursor(pos);
  }, []);

  const handleAutocompleteConfirm = useCallback(() => {
    const result = autocomplete.confirm();
    if (!result || !editorRef.current) return;
    editorRef.current.insertText(result.insertText);
  }, [autocomplete]);

  return (
    <div
      data-testid="custom-expression-editor"
      className={['space-y-3', className].filter(Boolean).join(' ')}
    >
      {/* Unrecognized expression banner (AE-12) */}
      {isFromUnrecognized && (
        <div
          data-testid="unrecognized-expression-banner"
          className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/20 px-3 py-2.5"
          role="alert"
        >
          <AlertTriangle
            size={13}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-amber-400"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[11px] font-medium text-amber-300">
              Unrecognized expression pattern
            </p>
            <p className="text-[10px] text-amber-500/80">
              This expression uses a pattern not supported by the structured builder.
              Edit here or reset to use a structured mode.
            </p>
          </div>
        </div>
      )}

      {/* Editor header: label + parse status */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          DSL Expression
        </span>
        <ParseStatusBadge expression={value} hasErrors={hasErrors} />
      </div>

      {/* Raw DSL editor */}
      <RawDslEditor
        ref={editorRef}
        value={value}
        onChange={onChange}
        onCursorChange={handleCursorChange}
        placeholder="Enter array DSL expression…"
        autocomplete={autocomplete}
        errorDecorations={errorDecorations}
        className="min-h-[120px]"
      />

      {/* Error list */}
      {hasErrors && (
        <ul
          data-testid="custom-expression-errors"
          className="space-y-1"
          aria-label="Expression errors"
        >
          {diagnostics
            .filter((d) => d.severity === 'error')
            .map((d, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 rounded px-2 py-1 text-[10px] text-red-400 bg-red-950/30"
              >
                <XCircle size={9} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>{d.message}</span>
              </li>
            ))}
        </ul>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-slate-700/60 pt-2">
        {/* Restore previous draft (AE-13) */}
        {canRestorePreviousDraft && onRestorePreviousDraft ? (
          <button
            type="button"
            data-testid="restore-previous-draft-btn"
            onClick={onRestorePreviousDraft}
            className={[
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
            ].join(' ')}
          >
            <History size={10} aria-hidden="true" />
            Restore previous draft
          </button>
        ) : (
          <span />
        )}

        {/* Reset to structured mode */}
        <button
          type="button"
          data-testid="reset-to-structured-btn"
          onClick={onResetToStructured}
          className={[
            'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
            'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-slate-100',
          ].join(' ')}
        >
          <RotateCcw size={10} aria-hidden="true" />
          Reset to structured mode
        </button>
      </div>
    </div>
  );
}
