import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { JsonOutputView } from './JsonOutputView';
import { resolveOutputRenderMode } from '../../lib/output-render-limits';
import { buildRenderableOutput } from '../../lib/renderable-output';

import type { PreviewExecutionState } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// JSON Syntax Tokenizer (preserved for non-object/array scalar rendering)
// ---------------------------------------------------------------------------

type JsonToken =
  | { kind: 'key'; text: string }
  | { kind: 'string'; text: string }
  | { kind: 'number'; text: string }
  | { kind: 'boolean'; text: string }
  | { kind: 'null'; text: string }
  | { kind: 'punctuation'; text: string }
  | { kind: 'whitespace'; text: string };

/**
 * Tokenize `JSON.stringify(value, null, 2)` output into typed tokens for
 * syntax coloring. The regex pattern matches predictable stringify output.
 */
function tokenizeJson(json: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  const pattern =
    /("(?:[^"\\]|\\.)*")(?=\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([[\]{},:])|(\s+)/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(json)) !== null) {
    const [, key, str, num, bool, nil, punct] = match;
    if (key !== undefined) {
      tokens.push({ kind: 'key', text: key + ':' });
      pattern.lastIndex = match.index + key.length + 1;
    } else if (str !== undefined) {
      tokens.push({ kind: 'string', text: str });
    } else if (num !== undefined) {
      tokens.push({ kind: 'number', text: num });
    } else if (bool !== undefined) {
      tokens.push({ kind: 'boolean', text: bool });
    } else if (nil !== undefined) {
      tokens.push({ kind: 'null', text: nil });
    } else if (punct !== undefined) {
      tokens.push({ kind: 'punctuation', text: punct });
    } else {
      tokens.push({ kind: 'whitespace', text: match[0] });
    }
  }

  return tokens;
}

function tokenColor(kind: JsonToken['kind']): string {
  switch (kind) {
    case 'key':
      return 'text-blue-400';
    case 'string':
      return 'text-green-400';
    case 'number':
      return 'text-amber-400';
    case 'boolean':
      return 'text-purple-400';
    case 'null':
      return 'text-gray-400';
    case 'punctuation':
      return 'text-zinc-400';
    case 'whitespace':
      return '';
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OutputDisplayProps {
  state: PreviewExecutionState;
  /** When set, the key-value pair at this dot-separated path is highlighted. */
  highlightPath?: string | null;
  /** When provided, clicking a key fires this callback with the key's path. */
  onPathClick?: (path: string) => void;
  /** Optional keyboard handler for output path key activation parity. */
  onPathKeyDown?: (path: string, event: KeyboardEvent<HTMLButtonElement>) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Output tab content for the Preview Panel.
 *
   * Renders output states and copy interaction in a shared wrapper.
   * Delegates JSON tree rendering/search/highlight interactions to JsonOutputView.
   * Supports:
   * - Path-based highlighting via `highlightPath` prop (FS-036)
   * - Click-to-select keys via `onPathClick` prop (FS-036)
   * - Auto-scroll to highlighted element when `highlightPath` changes
 */
export function OutputDisplay({ state, highlightPath, onPathClick, onPathKeyDown }: OutputDisplayProps) {
  const highlightRef = useRef<HTMLSpanElement | null>(null);
  type CopyState = 'idle' | 'copied' | 'failed';
  const [copyState, setCopyState] = useState<CopyState>('idle');

  // Auto-scroll when highlightPath changes
  useEffect(() => {
    if (highlightPath && highlightRef.current && typeof highlightRef.current.scrollIntoView === 'function') {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightPath]);

  const handleHighlightRef = (el: HTMLSpanElement | null) => {
    highlightRef.current = el;
  };

  if (state.status === 'idle') {
    return (
      <div
        className="flex h-full items-center justify-center p-4"
        data-testid="output-idle"
      >
        <p className="text-xs text-zinc-500">Run a mapping to see output</p>
      </div>
    );
  }

  if (state.status === 'executing') {
    return (
      <div
        className="flex h-full items-center justify-center p-4"
        data-testid="output-executing"
      >
        <p className="text-xs text-zinc-500">Executing…</p>
      </div>
    );
  }

  if (state.status === 'timeout') {
    return (
      <div className="p-3" data-testid="output-timeout">
        <p className="text-xs text-amber-400">
          Execution timed out — consider reducing rule count or simplifying expressions
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="p-3" data-testid="output-error">
        <p className="text-xs text-red-400">Execution failed: {state.error}</p>
      </div>
    );
  }

  // status === 'success'
  const renderableOutput = buildRenderableOutput(state.result.output);
  const { serializedText: outputText } = renderableOutput;
  const renderMode = resolveOutputRenderMode(renderableOutput);

  function handleCopy() {
    navigator.clipboard.writeText(outputText).then(
      () => {
        setCopyState('copied');
        setTimeout(() => setCopyState('idle'), 1500);
      },
      () => {
        setCopyState('failed');
        setTimeout(() => setCopyState('idle'), 1500);
      },
    );
  }

  const copyLabel =
    copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy';

  // For non-object/non-array output, fall back to the flat tokenizer (preserves
  // existing behavior for primitive top-level values).
  const isStructured =
    renderableOutput.value !== null && typeof renderableOutput.value === 'object';

  if (!isStructured) {
    const jsonString = outputText;
    const tokens = tokenizeJson(jsonString);
    return (
      <div className="h-full overflow-auto p-3" data-testid="output-success">
        <div className="mb-2 flex items-center justify-end">
          <button
            type="button"
            onClick={handleCopy}
            data-testid="output-copy-button"
            aria-label="Copy output payload"
            className="text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          >
            {copyLabel}
          </button>
        </div>
        <pre className="whitespace-pre font-mono text-xs" aria-label="Execution output">
          {tokens.length > 0
            ? tokens.map((tok, i) =>
                tok.kind === 'whitespace' ? (
                  tok.text
                ) : (
                  <span key={i} className={tokenColor(tok.kind)}>
                    {tok.text}
                  </span>
                ),
              )
            : jsonString}
        </pre>
      </div>
    );
  }

  if (renderMode === 'fallback') {
    return (
      <div className="h-full overflow-auto p-3" data-testid="output-success">
        <div className="mb-2 flex items-center justify-end">
          <button
            type="button"
            onClick={handleCopy}
            data-testid="output-copy-button"
            aria-label="Copy output payload"
            className="text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          >
            {copyLabel}
          </button>
        </div>
        <div
          className="rounded border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-200"
          data-testid="output-fallback-mode"
          role="status"
        >
          Output is too large for full inline rendering. Copy the full payload or open Test Lab for deeper inspection.
        </div>
      </div>
    );
  }

  if (renderMode === 'limited') {
    const previewText = outputText.length > 12000 ? `${outputText.slice(0, 12000)}\n…` : outputText;
    return (
      <div className="h-full overflow-auto p-3" data-testid="output-success">
        <div className="mb-2 flex items-center justify-end">
          <button
            type="button"
            onClick={handleCopy}
            data-testid="output-copy-button"
            aria-label="Copy output payload"
            className="text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          >
            {copyLabel}
          </button>
        </div>
        <div
          className="mb-2 rounded border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300"
          data-testid="output-limited-mode"
          role="status"
        >
          Output is large. Showing a reduced inline preview to keep the editor responsive.
        </div>
        <pre className="whitespace-pre font-mono text-xs" aria-label="Execution output">
          {previewText}
        </pre>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-3" data-testid="output-success">
      <div className="mb-2 flex items-center justify-end">
        <button
          type="button"
          onClick={handleCopy}
          data-testid="output-copy-button"
          aria-label="Copy output payload"
          className="text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          {copyLabel}
        </button>
      </div>
      <JsonOutputView
        renderableOutput={renderableOutput}
        highlightPath={highlightPath}
        onPathClick={onPathClick}
        onPathKeyDown={onPathKeyDown}
        onHighlightRef={handleHighlightRef}
      />
    </div>
  );
}
