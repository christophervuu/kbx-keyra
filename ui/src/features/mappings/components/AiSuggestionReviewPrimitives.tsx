export interface AiGeneratedStateLabelProps {
  mode?: 'suggestion' | 'explanation';
  testId?: string;
}

/**
 * Shared generated-state label used across AI review surfaces.
 */
export function AiGeneratedStateLabel({
  mode = 'suggestion',
  testId,
}: AiGeneratedStateLabelProps) {
  const text =
    mode === 'explanation'
      ? 'AI-generated assistance. This explanation is not persisted to mapping content.'
      : 'AI-generated assistance. Suggestions are not persisted until you explicitly accept.';

  return (
    <p
      data-testid={testId}
      className="mb-2 text-[11px] text-blue-300/90"
    >
      {text}
    </p>
  );
}

export interface AiSuggestionComparisonBlockProps {
  currentExpression: string | null;
  suggestedExpression: string;
  currentLabel?: string;
  suggestedLabel?: string;
  emptyCurrentText?: string;
  testId?: string;
}

/**
 * Shared current-vs-generated expression comparison block.
 */
export function AiSuggestionComparisonBlock({
  currentExpression,
  suggestedExpression,
  currentLabel = 'Current expression',
  suggestedLabel = 'Generated suggestion',
  emptyCurrentText = 'No existing expression',
  testId = 'ai-suggestion-comparison',
}: AiSuggestionComparisonBlockProps) {
  return (
    <div
      data-testid={testId}
      className="mb-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2"
    >
      <div className="rounded border border-slate-700 bg-slate-900/50 p-2">
        <p className="mb-1 text-[11px] text-slate-500">{currentLabel}</p>
        {currentExpression !== null && currentExpression.trim().length > 0 ? (
          <code className="block whitespace-pre-wrap break-all text-xs text-slate-300">
            {currentExpression}
          </code>
        ) : (
          <p className="text-xs italic text-slate-500">{emptyCurrentText}</p>
        )}
      </div>

      <div className="rounded border border-blue-700/50 bg-blue-950/20 p-2">
        <p className="mb-1 text-[11px] text-blue-300">{suggestedLabel}</p>
        <code className="block whitespace-pre-wrap break-all text-xs text-slate-200">
          {suggestedExpression}
        </code>
      </div>
    </div>
  );
}
