import { Info, Loader2 } from 'lucide-react';

import { useSuggestionPreview } from '../hooks/use-suggestion-preview';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceSuggestionPreviewProps {
  /** The expression currently mapped to this field (null if no existing rule) */
  currentExpression: string | null;
  /** The AI-suggested expression */
  suggestedExpression: string;
  /** Source data to evaluate against (null when no sample data is loaded) */
  sourceData: unknown | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a preview result value for display.
 * Objects/arrays are pretty-printed as JSON; primitives are shown inline.
 */
function formatResult(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface PreviewOutputProps {
  label: string;
  expression: string | null;
  sourceData: unknown | null;
  testId: string;
}

function PreviewOutput({ label, expression, sourceData, testId }: PreviewOutputProps) {
  const { result, error, isEvaluating } = useSuggestionPreview(
    expression ?? '',
    sourceData,
  );

  return (
    <div className="flex flex-col gap-0.5" data-testid={testId}>
      <span className="text-[10px] text-slate-500">{label}</span>
      {expression === null ? (
        <span className="text-[10px] italic text-slate-500">No current rule</span>
      ) : isEvaluating ? (
        <span
          className="flex items-center gap-1 text-[10px] text-slate-500"
          data-testid={`${testId}-evaluating`}
        >
          <Loader2 size={9} className="animate-spin" aria-hidden="true" />
          Evaluating…
        </span>
      ) : error !== null ? (
        <span
          className="text-[10px] text-red-400"
          data-testid={`${testId}-error`}
        >
          Preview unavailable — {error}
        </span>
      ) : result === null ? (
        <span className="text-[10px] italic text-slate-500" data-testid={`${testId}-null`}>
          (no result)
        </span>
      ) : (
        <pre
          className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-800/60 px-2 py-1 font-mono text-[10px] text-slate-200"
          data-testid={`${testId}-result`}
        >
          {formatResult(result)}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkspaceSuggestionPreview
// ---------------------------------------------------------------------------

/**
 * WorkspaceSuggestionPreview — renders inside the suggestion card's preview slot.
 *
 * Shows two columns:
 * - "Current output:" — result of existing expression (or "No current rule")
 * - "Suggested output:" — result of suggested expression
 *
 * When sourceData is null, renders a "no source data" callout instead.
 */
export function WorkspaceSuggestionPreview({
  currentExpression,
  suggestedExpression,
  sourceData,
}: WorkspaceSuggestionPreviewProps) {
  if (sourceData === null) {
    return (
      <div
        data-testid="suggestion-preview-no-data"
        className="flex items-center gap-1.5 rounded border border-slate-700/50 bg-slate-800/30 px-2.5 py-1.5"
      >
        <Info size={11} className="shrink-0 text-slate-500" aria-hidden="true" />
        <p className="text-[10px] text-slate-500">
          Load sample source data to preview what this suggestion would produce.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="suggestion-preview"
      className="grid grid-cols-1 gap-2 rounded border border-slate-700/50 bg-slate-800/20 px-2.5 py-2 sm:grid-cols-2"
    >
      <PreviewOutput
        label="Current output:"
        expression={currentExpression}
        sourceData={sourceData}
        testId="preview-current"
      />
      <PreviewOutput
        label="Suggested output:"
        expression={suggestedExpression}
        sourceData={sourceData}
        testId="preview-suggested"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkspaceNoSourceDataCallout
// ---------------------------------------------------------------------------

/**
 * Workspace-level callout shown above the card list when no source data is loaded.
 * Informs the user that preview is available once sample data is loaded.
 */
export function WorkspaceNoSourceDataCallout() {
  return (
    <div
      data-testid="workspace-no-source-data-callout"
      className="mx-3 mt-2 flex items-center gap-2 rounded border border-slate-700/40 bg-slate-800/20 px-3 py-2"
    >
      <Info size={12} className="shrink-0 text-slate-500" aria-hidden="true" />
      <p className="text-[10px] text-slate-500">
        Load sample source data in the Preview panel to see what each suggestion would produce.
      </p>
    </div>
  );
}
