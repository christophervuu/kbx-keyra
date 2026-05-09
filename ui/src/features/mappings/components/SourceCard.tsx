/**
 * SourceCard — displays a selected source field path with an optional inline
 * transformation for the Source Card expression builder (FS-029 T-02).
 *
 * States:
 *   - Base: shows source path chip + [+ Add Transformation] button
 *   - Transform: shows source path chip + expanded Argument Form for the
 *     selected function (rendered via the `renderArgumentForm` render prop)
 *
 * The component is intentionally decoupled from ArgumentForm internals (T-03).
 * The parent wires the ArgumentForm via `renderArgumentForm`.
 */

import { useCallback, useRef, useState } from 'react';
import { X, Plus, Zap } from 'lucide-react';

import type {
  DirectCopyState,
  InlineTransform,
  SourceWithTransformState,
} from '../lib/expression-builder-state';
import {
  createDirectCopyState,
  createSourceWithTransformState,
} from '../lib/expression-builder-state';
import { TransformFunctionPicker } from './TransformFunctionPicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceCardProps {
  /** The source field path this card represents. */
  readonly source: string;
  /** The inline transform currently applied, if any. */
  readonly transform?: InlineTransform;
  /**
   * Fires whenever the card's state changes.
   * Emits either a DirectCopyState (no transform) or SourceWithTransformState.
   */
  readonly onStateChange: (state: DirectCopyState | SourceWithTransformState) => void;
  /** Optional: fires when the card itself is removed from the builder. */
  readonly onRemove?: () => void;
  /**
   * Render prop for the Argument Form.
   * Called when a transform is active. Receives the function name and the
   * current transform so the form can render and update argument slots.
   *
   * The render prop pattern keeps SourceCard decoupled from ArgumentForm
   * internals (T-03) while allowing full integration in T-09.
   */
  readonly renderArgumentForm?: (props: {
    functionName: string;
    transform: InlineTransform;
    sourcePath: string;
    onTransformChange: (updated: InlineTransform) => void;
  }) => React.ReactNode;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Source Card: the primary UX element for single-source paths in the
 * Source Card expression builder (FS-029).
 */
export function SourceCard({
  source,
  transform,
  onStateChange,
  onRemove,
  renderArgumentForm,
  className,
}: SourceCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const hasTransform = transform !== undefined;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleFunctionSelect = useCallback(
    (functionName: string) => {
      setPickerOpen(false);
      // Pre-fill first slot with this card's source (editable, not locked)
      const newTransform: InlineTransform = {
        functionName,
        args: [],
      };
      onStateChange(createSourceWithTransformState(source, newTransform));
    },
    [source, onStateChange],
  );

  const handleTransformChange = useCallback(
    (updated: InlineTransform) => {
      onStateChange(createSourceWithTransformState(source, updated));
    },
    [source, onStateChange],
  );

  const handleRemoveTransform = useCallback(() => {
    setPickerOpen(false);
    onStateChange(createDirectCopyState(source));
  }, [source, onStateChange]);

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false);
    // Return focus to the add button
    setTimeout(() => { addBtnRef.current?.focus(); }, 0);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={[
        'rounded-lg border border-zinc-700 bg-zinc-900',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="source-card"
    >
      {/* Card header: source path chip + actions */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Source path chip */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-900/60 border border-blue-700 min-w-0 flex-1"
          data-testid="source-card-path"
        >
          <span
            className="text-xs font-mono text-blue-400 shrink-0"
            aria-hidden="true"
          >
            ⬡
          </span>
          <span className="font-mono text-xs text-blue-100 truncate" title={source}>
            {source}
          </span>
        </div>

        {/* Transform indicator badge (when transform is active) */}
        {hasTransform && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-900/50 border border-amber-700 text-xs text-amber-300 shrink-0"
            data-testid="source-card-transform-badge"
            aria-label={`Transform: ${transform.functionName}`}
          >
            <Zap className="h-3 w-3" aria-hidden="true" />
            <span className="font-mono">{transform.functionName}</span>
          </span>
        )}

        {/* Remove transform button (when transform is active) */}
        {hasTransform && (
          <button
            type="button"
            onClick={handleRemoveTransform}
            aria-label={`Remove ${transform.functionName} transformation`}
            title="Remove transformation"
            className="shrink-0 text-zinc-500 hover:text-zinc-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded p-0.5 transition-colors"
            data-testid="source-card-remove-transform"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}

        {/* Remove card button */}
        {onRemove !== undefined && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove source ${source}`}
            title="Remove source"
            className="shrink-0 text-zinc-600 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded p-0.5 transition-colors"
            data-testid="source-card-remove"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Argument Form (when transform is active) */}
      {hasTransform && (
        <div
          className="border-t border-zinc-700 px-3 py-3 bg-zinc-800/50"
          data-testid="source-card-argument-form"
        >
          {renderArgumentForm !== undefined ? (
            renderArgumentForm({
              functionName: transform.functionName,
              transform,
              sourcePath: source,
              onTransformChange: handleTransformChange,
            })
          ) : (
            /* Fallback placeholder when ArgumentForm (T-03) is not yet wired */
            <ArgumentFormPlaceholder
              functionName={transform.functionName}
              sourcePath={source}
              transform={transform}
              onTransformChange={handleTransformChange}
            />
          )}
        </div>
      )}

      {/* Add Transformation button (base state only) */}
      {!hasTransform && (
        <div className="border-t border-zinc-700/50 px-3 py-2 relative">
          <button
            ref={addBtnRef}
            type="button"
            onClick={() => { setPickerOpen((v) => !v); }}
            aria-expanded={pickerOpen}
            aria-haspopup="listbox"
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 hover:border-zinc-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 transition-colors"
            data-testid="source-card-add-transform"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add Transformation
          </button>

          {/* Function picker popover */}
          {pickerOpen && (
            <div className="absolute left-3 top-full mt-1 z-30" data-testid="source-card-picker-popover">
              <TransformFunctionPicker
                onSelect={handleFunctionSelect}
                onClose={handlePickerClose}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ArgumentFormPlaceholder
//
// Minimal inline form used when the real ArgumentForm (T-03) is not yet wired.
// Renders the first argument slot pre-filled with the source path (editable)
// and shows a note for additional args. This is replaced by the real
// ArgumentForm in T-09 integration.
// ---------------------------------------------------------------------------

interface ArgumentFormPlaceholderProps {
  readonly functionName: string;
  readonly sourcePath: string;
  readonly transform: InlineTransform;
  readonly onTransformChange: (updated: InlineTransform) => void;
}

function ArgumentFormPlaceholder({
  functionName,
  sourcePath,
  transform,
  onTransformChange,
}: ArgumentFormPlaceholderProps) {
  return (
    <div className="space-y-2" data-testid="argument-form-placeholder">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
        {functionName}
      </p>

      {/* First argument: pre-filled with source */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 w-16 shrink-0">arg 1</span>
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-900/40 border border-blue-800 text-xs font-mono text-blue-200"
          data-testid="argument-form-placeholder-first-arg"
          aria-label={`First argument: source("${sourcePath}")`}
        >
          source("{sourcePath}")
        </div>
      </div>

      {/* Additional args from transform */}
      {transform.args.map((slot, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 w-16 shrink-0">arg {i + 2}</span>
          {slot.mode === 'literal' ? (
            <input
              type="text"
              value={slot.value}
              onChange={(e) => {
                const newArgs = transform.args.map((a, idx) =>
                  idx === i ? { mode: 'literal' as const, value: e.target.value } : a,
                );
                onTransformChange({ ...transform, args: newArgs });
              }}
              aria-label={`Argument ${i + 2} value`}
              className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
              data-testid={`argument-form-placeholder-arg-${i + 2}`}
            />
          ) : slot.mode === 'source' ? (
            <span className="text-xs font-mono text-blue-200">source("{slot.path}")</span>
          ) : (
            <span className="text-xs text-zinc-400 italic">[expression]</span>
          )}
        </div>
      ))}

      <p className="text-xs text-zinc-600 italic">
        Full argument form available after T-03 integration.
      </p>
    </div>
  );
}
