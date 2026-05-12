/**
 * ChainBuilderShell — FS-038 T-04
 *
 * Shell layout component for the redesigned chain-based Builder panel.
 *
 * Layout (top to bottom, non-scrolling header + pinned sections):
 *   ┌──────────────────────────────────────────────────────┐
 *   │ Header: [type] [path] [required]    [Builder|Editor] │
 *   ├──────────────────────────────────────────────────────┤
 *   │ AI: [Suggest] [Explain] [Fix]              [Clear]   │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Expression: {live DSL string}                        │
 *   │ Result: {live evaluated value}                       │
 *   ├──────────────────────────────────────────────────────┤
 *   │ (scrollable content area — children prop)            │
 *   └──────────────────────────────────────────────────────┘
 *
 * The Expression and Result sections are pinned (AE-03) — they never scroll
 * out of view regardless of how much builder content is below them.
 *
 * The suggested-sources row is intentionally NOT rendered (AE-11).
 *
 * AI action buttons (Suggest/Explain/Fix) are disabled placeholders (AE-12).
 */

import { Lightbulb, Loader2, MessageSquare, Wand2, X } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { ExplanationPanel } from './ExplanationPanel';
import { SuggestExpressionInline } from './SuggestExpressionInline';
import { useExplainRule } from '../hooks/use-explain-rule';
import type { ExplainRuleState } from '../hooks/use-explain-rule';
import { useSuggestExpression } from '../hooks/use-suggest-expression';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainBuilderShellProps {
  /** Full dot-path of the selected target field. */
  readonly targetPath: string;
  /** JSON Schema type of the selected target field (e.g. "string", "number"). */
  readonly targetType: string;
  /** Whether the target field is required. */
  readonly isRequired: boolean;
  /** Current generated DSL expression string. */
  readonly expression: string;
  /** Current evaluated result value. Pass null when no source data is loaded. */
  readonly result: unknown | null;
  /** Whether the result is currently being evaluated. */
  readonly isEvaluating: boolean;
  /** Whether source data is available for live result evaluation. */
  readonly sourceDataAvailable: boolean;
  /** Whether the target field currently has a mapping. Controls Clear button visibility. */
  readonly isMapped: boolean;
  /** Whether the panel is in Builder mode (true) or Editor mode (false). */
  readonly isBuilderMode: boolean;
  /** Fires when the Builder/Editor toggle is clicked. */
  readonly onToggleMode: () => void;
  /** Fires when the user clicks Clear mapping. */
  readonly onClearMapping: () => void;
  /** Fires when the user clicks the expression to switch to Editor mode. */
  readonly onExpressionClick: () => void;
  /**
   * Optional: parsed source schema for suggest-expression source context.
   * When provided, enables the Suggest button to include source field context.
   */
  readonly parsedSourceSchema?: ParsedSchema | null;
  /**
   * Optional: called when the user accepts a suggested expression.
   * When not provided, the Suggest button is still shown but Accept is a no-op.
   */
  readonly onExpressionAccept?: (expression: string) => void;
  /** Builder content rendered in the scrollable content area. */
  readonly children: ReactNode;
  /** Whether to render header and AI bars inside shell. */
  readonly showChrome?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Type badge — small pill showing the target field's JSON Schema type.
 */
function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-zinc-700 text-zinc-300"
      data-testid="chain-shell-type-badge"
    >
      {type}
    </span>
  );
}

/**
 * Required/Optional tag.
 */
function RequiredTag({ isRequired }: { isRequired: boolean }) {
  return isRequired ? (
    <span
      className="text-[10px] font-medium text-red-400"
      data-testid="chain-shell-required-tag"
    >
      required
    </span>
  ) : (
    <span
      className="text-[10px] font-medium text-zinc-500"
      data-testid="chain-shell-optional-tag"
    >
      optional
    </span>
  );
}

/**
 * Builder / Editor mode toggle.
 */
function ModeToggle({
  isBuilderMode,
  onToggle,
}: {
  isBuilderMode: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="inline-flex rounded-md border border-zinc-700 overflow-hidden text-xs"
      role="group"
      aria-label="Editor mode toggle"
      data-testid="chain-shell-mode-toggle"
    >
      <button
        type="button"
        onClick={isBuilderMode ? undefined : onToggle}
        disabled={isBuilderMode}
        className={[
          'px-2.5 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          isBuilderMode
            ? 'bg-blue-600 text-white cursor-default'
            : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
        ].join(' ')}
        aria-pressed={isBuilderMode}
        data-testid="chain-shell-toggle-builder"
      >
        Builder
      </button>
      <button
        type="button"
        onClick={isBuilderMode ? onToggle : undefined}
        disabled={!isBuilderMode}
        className={[
          'px-2.5 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          !isBuilderMode
            ? 'bg-blue-600 text-white cursor-default'
            : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
        ].join(' ')}
        aria-pressed={!isBuilderMode}
        data-testid="chain-shell-toggle-editor"
      >
        Editor
      </button>
    </div>
  );
}

/**
 * AI action bar — Suggest, Explain, Fix (Suggest/Fix disabled placeholders), plus Clear.
 */
function AiActionBar({
  isMapped,
  onClearMapping,
  expression,
  explainState,
  onExplain,
  onSuggestClick,
  isSuggestActive,
}: {
  isMapped: boolean;
  onClearMapping: () => void;
  expression: string;
  explainState: ExplainRuleState;
  onExplain: () => void;
  onSuggestClick: () => void;
  isSuggestActive: boolean;
}) {
  const isExplainDisabled = !expression.trim() || explainState.status === 'loading';
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-800"
      data-testid="chain-shell-ai-bar"
    >
      {/* AI buttons — Suggest enabled, Fix disabled placeholder */}
      <button
        type="button"
        onClick={onSuggestClick}
        title="Generate a DSL expression from natural language"
        aria-label="Suggest expression"
        className={[
          'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          isSuggestActive
            ? 'text-blue-300 bg-zinc-700 cursor-pointer'
            : 'text-zinc-400 bg-zinc-800 hover:text-blue-300 hover:bg-zinc-700 cursor-pointer',
        ].join(' ')}
        data-testid="chain-shell-ai-suggest"
      >
        <Wand2 className="h-3 w-3" aria-hidden="true" />
        Suggest
      </button>
      <button
        type="button"
        disabled={isExplainDisabled}
        aria-disabled={isExplainDisabled}
        title={expression.trim() ? 'Explain this expression using AI' : 'No expression to explain'}
        aria-label={expression.trim() ? 'Explain this expression using AI' : 'Explain — No expression to explain'}
        onClick={isExplainDisabled ? undefined : onExplain}
        className={[
          'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          isExplainDisabled
            ? 'text-zinc-600 bg-zinc-800 cursor-not-allowed select-none'
            : 'text-zinc-400 bg-zinc-800 hover:text-blue-300 hover:bg-zinc-700 cursor-pointer',
        ].join(' ')}
        data-testid="chain-shell-ai-explain"
      >
        {explainState.status === 'loading' ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : (
          <MessageSquare className="h-3 w-3" aria-hidden="true" />
        )}
        {explainState.status === 'loading' ? 'Explaining…' : 'Explain'}
      </button>
      <button
        type="button"
        disabled
        title="AI expression fix — available in a future release"
        aria-label="Fix expression (coming soon)"
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-600 bg-zinc-800 cursor-not-allowed select-none"
        data-testid="chain-shell-ai-fix"
      >
        <Lightbulb className="h-3 w-3" aria-hidden="true" />
        Fix
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Clear button — only shown when target has a mapping */}
      {isMapped && (
        <button
          type="button"
          onClick={onClearMapping}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          aria-label="Clear mapping"
          data-testid="chain-shell-clear-btn"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Clear
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source context formatting (for SuggestExpression)
// ---------------------------------------------------------------------------

function formatSourceContext(parsedSourceSchema: ParsedSchema | null | undefined): string {
  if (!parsedSourceSchema?.nodes) return '';
  const lines: string[] = [];
  function walk(nodes: SchemaTreeNode[]) {
    for (const node of nodes) {
      if (lines.length >= 200) return;
      if (node.children && node.children.length > 0) {
        walk(node.children);
      } else {
        lines.push(`- ${node.path} (${node.type})`);
      }
    }
  }
  walk(parsedSourceSchema.nodes);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * ChainBuilderShell — structural container for the redesigned Builder panel.
 *
 * Renders the header, AI bar, pinned Expression + Result sections, and a
 * scrollable content area for the entry-point-specific builder content.
 *
 * Children render in the scrollable content area below the pinned sections.
 */
export function ChainBuilderShell({
  targetPath,
  targetType,
  isRequired,
  expression,
  result,
  isEvaluating: _isEvaluating,
  sourceDataAvailable,
  isMapped,
  isBuilderMode,
  onToggleMode,
  onClearMapping,
  onExpressionClick,
  parsedSourceSchema,
  onExpressionAccept,
  children,
  showChrome = true,
}: ChainBuilderShellProps) {
  const { state: explainState, explain, dismiss: dismissExplain } = useExplainRule();

  // Reset explanation when the target field or expression changes (AE-09)
  useEffect(() => {
    dismissExplain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPath]);

  const handleExplain = () => {
    if (expression.trim()) {
      explain({ targetPath, expression });
    }
  };

  // FS-042: Suggest Expression hook
  const {
    state: suggestState,
    openInput: openSuggestInput,
    generate: generateSuggestion,
    dismiss: dismissSuggest,
    reset: resetSuggest,
  } = useSuggestExpression();

  // Reset suggestion panel when the target field changes
  useEffect(() => {
    resetSuggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPath]);

  return (
    <div
      className="flex flex-col h-full min-w-[300px] bg-zinc-900 text-zinc-100"
      data-testid="chain-builder-shell"
    >
      {showChrome && (
        <>
          {/* ── Header row ─────────────────────────────────────────────────── */}
          <div
            className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 flex-shrink-0"
            data-testid="chain-shell-header"
          >
            <TypeBadge type={targetType} />
            <span
              className="flex-1 truncate font-mono text-xs text-zinc-200 min-w-0"
              title={targetPath}
              data-testid="chain-shell-target-path"
            >
              {targetPath}
            </span>
            <RequiredTag isRequired={isRequired} />
            <ModeToggle isBuilderMode={isBuilderMode} onToggle={onToggleMode} />
          </div>

          {/* ── AI action bar ──────────────────────────────────────────────── */}
          <AiActionBar
            isMapped={isMapped}
            onClearMapping={onClearMapping}
            expression={expression}
            explainState={explainState}
            onExplain={handleExplain}
            onSuggestClick={openSuggestInput}
            isSuggestActive={suggestState.status === 'inputting' || suggestState.status === 'loading'}
          />

          {/* ── Inline explanation panel ────────────────────────────────────── */}
          {(explainState.status === 'success' || explainState.status === 'error') && (
            <div className="px-3 pb-2">
              <ExplanationPanel
                state={explainState}
                onDismiss={dismissExplain}
                onRetry={handleExplain}
              />
            </div>
          )}

          {/* ── Inline suggest expression panel (FS-042) ────────────────────── */}
          {suggestState.status !== 'idle' && (
            <div className="px-3 pb-2">
              <SuggestExpressionInline
                state={suggestState}
                targetPath={targetPath}
                targetType={targetType}
                onGenerate={(instruction) => {
                  generateSuggestion({
                    instruction,
                    targetPath,
                    targetType,
                    sourceContext: formatSourceContext(parsedSourceSchema),
                  });
                }}
                onAccept={(expr) => {
                  onExpressionAccept?.(expr);
                  dismissSuggest();
                }}
                onDismiss={dismissSuggest}
              />
            </div>
          )}
        </>
      )}

      {/* ── Scrollable content area ─────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto min-h-0"
        data-testid="chain-shell-content"
      >
        {children}
      </div>
    </div>
  );
}
