import { useCallback, useEffect, useRef, useState } from 'react';

import { usePreviewSetters } from '../../context/preview-context';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALIDATION_DEBOUNCE_MS = 150;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceDataInputProps {
  /**
   * Called whenever the raw input value changes (both valid and invalid).
   * Pass the raw string when JSON is valid, null when invalid or empty.
   */
  onRawChange: (raw: string | null) => void;
  /**
   * Initial value to pre-populate the textarea. Changing this prop after
   * mount updates validation/output state; route-level composition may still
   * use a React key reset when loading a test case.
   */
  initialValue?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Source Data Input for the Preview Panel.
 *
 * Renders a monospace textarea for pasting/typing JSON source data.
 * Validates the input on change (debounced 150ms):
 *  - Valid JSON:   clears error, publishes parsed object to PreviewContext,
 *                 calls `onRawChange(raw)` so the execution hook can run.
 *  - Invalid JSON: shows inline error with parse error message, sets
 *                 PreviewContext.sourceData to null, calls `onRawChange(null)`.
 *  - Empty input:  no error shown, sourceData null, Run stays disabled.
 *
 * Must be rendered inside `<PreviewProvider>`.
 */
export function SourceDataInput({ onRawChange, initialValue }: SourceDataInputProps) {
  const [value, setValue] = useState(initialValue ?? '');
  const [parseError, setParseError] = useState<string | null>(null);

  const { setSourceData } = usePreviewSetters();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validate = useCallback(
    (raw: string) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      if (raw.trim() === '') {
        // Empty — no error, sourceData null
        setParseError(null);
        setSourceData(null);
        onRawChange(null);
        return;
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        try {
          const parsed: unknown = JSON.parse(raw);
          setParseError(null);
          setSourceData(parsed);
          onRawChange(raw);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Invalid JSON';
          setParseError(msg);
          setSourceData(null);
          onRawChange(null);
        }
      }, VALIDATION_DEBOUNCE_MS);
    },
    [onRawChange, setSourceData],
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Validate/emit preloaded value so parent run gating reflects initial input.
  useEffect(() => {
    validate(initialValue ?? '');
  }, [initialValue, validate]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const raw = e.target.value;
      setValue(raw);
      validate(raw);
    },
    [validate],
  );

  const inputId = 'source-data-input';
  const errorId = 'source-data-input-error';

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1" data-testid="source-data-input-container">
      <label htmlFor={inputId} className="sr-only">
        Source data (JSON)
      </label>
      <textarea
        id={inputId}
        value={value}
        onChange={handleChange}
        placeholder="Paste or type JSON source data..."
        spellCheck={false}
        aria-label="Source data (JSON)"
        aria-describedby={parseError !== null ? errorId : undefined}
        aria-invalid={parseError !== null ? true : undefined}
        data-testid="source-data-textarea"
        className={[
          'min-h-0 w-full flex-1 resize-none rounded border bg-zinc-900 p-2 font-mono text-xs text-zinc-200',
          'placeholder:text-zinc-600',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          'min-h-[80px]',
          parseError !== null
            ? 'border-red-500 focus-visible:ring-red-500'
            : 'border-zinc-700',
        ].join(' ')}
      />
      {parseError !== null && (
        <p
          id={errorId}
          role="alert"
          data-testid="source-data-error"
          className="text-[11px] leading-snug text-red-400"
        >
          {parseError}
        </p>
      )}
    </div>
  );
}
