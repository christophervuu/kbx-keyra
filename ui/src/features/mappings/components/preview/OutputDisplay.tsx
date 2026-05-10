import { useEffect, useRef } from 'react';
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
    /("(?:[^"\\]|\\.)*")(?=\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([\[\]{},:])|(\s+)/g;

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
// Recursive JSON renderer with path tracking
// ---------------------------------------------------------------------------

interface JsonNodeProps {
  value: unknown;
  /** Dot-separated path to this node, e.g. "Order.Header.DocumentType" */
  path: string;
  indent: number;
  /** Whether this is the last item in an array/object (controls trailing comma). */
  isLast: boolean;
  highlightPath: string | null | undefined;
  onPathClick: ((path: string) => void) | undefined;
  /** Ref callback — called with the element when this node is the highlighted one. */
  onHighlightRef: (el: HTMLSpanElement | null) => void;
}

const INDENT_SIZE = 2;

function indentStr(level: number): string {
  return ' '.repeat(level * INDENT_SIZE);
}

/** Render a scalar value (string, number, boolean, null) as a colored span. */
function ScalarValue({ value }: { value: unknown }) {
  if (value === null) {
    return <span className="text-gray-400">null</span>;
  }
  if (typeof value === 'string') {
    return <span className="text-green-400">{JSON.stringify(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-amber-400">{String(value)}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="text-purple-400">{String(value)}</span>;
  }
  return <span className="text-zinc-400">{String(value)}</span>;
}

function JsonNode({
  value,
  path,
  indent,
  isLast,
  highlightPath,
  onPathClick,
  onHighlightRef,
}: JsonNodeProps) {
  const isHighlighted = highlightPath != null && highlightPath !== '' && path === highlightPath;
  const trailing = isLast ? '' : ',';

  // Object
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <>
        <span className="text-zinc-400">{'{'}</span>
        {'\n'}
        {entries.map(([k, v], i) => {
          const childPath = path === '' ? k : `${path}.${k}`;
          const childIsLast = i === entries.length - 1;
          const childHighlighted =
            highlightPath != null && highlightPath !== '' && childPath === highlightPath;

          const keyEl = onPathClick ? (
            <button
              type="button"
              onClick={() => onPathClick(childPath)}
              className="text-blue-400 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              data-testid={`output-key-${childPath}`}
              aria-label={`Select path ${childPath}`}
            >
              {JSON.stringify(k)}:
            </button>
          ) : (
            <span className="text-blue-400" data-testid={`output-key-${childPath}`}>
              {JSON.stringify(k)}:
            </span>
          );

          return (
            <span
              key={k}
              ref={childHighlighted ? onHighlightRef : undefined}
              className={[
                'block',
                childHighlighted
                  ? 'rounded bg-blue-500/20 ring-1 ring-blue-500/40'
                  : '',
              ].join(' ')}
              data-testid={childHighlighted ? `output-highlighted` : undefined}
            >
              {indentStr(indent + 1)}
              {keyEl}
              {' '}
              <JsonNode
                value={v}
                path={childPath}
                indent={indent + 1}
                isLast={childIsLast}
                highlightPath={highlightPath}
                onPathClick={onPathClick}
                onHighlightRef={onHighlightRef}
              />
              {childIsLast ? '' : ','}
              {'\n'}
            </span>
          );
        })}
        {indentStr(indent)}
        <span className="text-zinc-400">{'}'}</span>
        {trailing}
      </>
    );
  }

  // Array
  if (Array.isArray(value)) {
    return (
      <>
        <span className="text-zinc-400">{'['}</span>
        {'\n'}
        {value.map((item, i) => {
          const childPath = `${path}[${i}]`;
          const childIsLast = i === value.length - 1;
          return (
            <span key={i} className="block">
              {indentStr(indent + 1)}
              <JsonNode
                value={item}
                path={childPath}
                indent={indent + 1}
                isLast={childIsLast}
                highlightPath={highlightPath}
                onPathClick={onPathClick}
                onHighlightRef={onHighlightRef}
              />
              {childIsLast ? '' : ','}
              {'\n'}
            </span>
          );
        })}
        {indentStr(indent)}
        <span className="text-zinc-400">{']'}</span>
        {trailing}
      </>
    );
  }

  // Scalar — path-level highlight wraps the scalar when this node itself is highlighted
  if (isHighlighted) {
    return (
      <span
        ref={onHighlightRef}
        className="rounded bg-blue-500/20 ring-1 ring-blue-500/40"
        data-testid="output-highlighted"
      >
        <ScalarValue value={value} />
        {trailing}
      </span>
    );
  }

  return (
    <>
      <ScalarValue value={value} />
      {trailing}
    </>
  );
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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Output tab content for the Preview Panel.
 *
 * Renders formatted, syntax-colored JSON for successful execution results.
 * Supports:
 * - Path-based highlighting via `highlightPath` prop (FS-036)
 * - Click-to-select keys via `onPathClick` prop (FS-036)
 * - Auto-scroll to highlighted element when `highlightPath` changes
 */
export function OutputDisplay({ state, highlightPath, onPathClick }: OutputDisplayProps) {
  const highlightRef = useRef<HTMLSpanElement | null>(null);

  // Auto-scroll when highlightPath changes
  useEffect(() => {
    if (highlightPath && highlightRef.current) {
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
  const { output } = state.result;

  // For non-object/non-array output, fall back to the flat tokenizer (preserves
  // existing behavior for primitive top-level values).
  const isStructured =
    output !== null && typeof output === 'object';

  if (!isStructured) {
    const jsonString = JSON.stringify(output, null, 2);
    const tokens = tokenizeJson(jsonString);
    return (
      <div className="h-full overflow-auto p-3" data-testid="output-success">
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

  return (
    <div className="h-full overflow-auto p-3" data-testid="output-success">
      <pre className="whitespace-pre font-mono text-xs" aria-label="Execution output">
        <JsonNode
          value={output}
          path=""
          indent={0}
          isLast={true}
          highlightPath={highlightPath}
          onPathClick={onPathClick}
          onHighlightRef={handleHighlightRef}
        />
        {'\n'}
      </pre>
    </div>
  );
}
