import type { PreviewExecutionState } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// JSON Syntax Tokenizer
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
  // Pattern breakdown (applied repeatedly):
  //  1. "key":        — object key (string before colon)
  //  2. "string val"  — string value
  //  3. -?[0-9.e+E-]+ — number
  //  4. true|false    — boolean
  //  5. null          — null
  //  6. [{}\[\],:]    — structural punctuation
  //  7. \s+           — whitespace (discarded)
  const pattern =
    /("(?:[^"\\]|\\.)*")(?=\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([\[\]{},:])|(\s+)/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(json)) !== null) {
    const [, key, str, num, bool, nil, punct] = match;
    if (key !== undefined) {
      tokens.push({ kind: 'key', text: key + ':' });
      pattern.lastIndex = match.index + key.length + 1; // skip the colon
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
      // whitespace group (index 7) — preserve for formatting
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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Output tab content for the Preview Panel.
 *
 * Renders formatted, syntax-colored JSON for successful execution results.
 * Shows appropriate empty/error/timeout messages for all other states.
 */
export function OutputDisplay({ state }: OutputDisplayProps) {
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
  const jsonString = JSON.stringify(state.result.output, null, 2);
  const tokens = tokenizeJson(jsonString);

  return (
    <div
      className="h-full overflow-auto p-3"
      data-testid="output-success"
    >
      <pre
        className="font-mono text-xs whitespace-pre"
        aria-label="Execution output"
      >
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
