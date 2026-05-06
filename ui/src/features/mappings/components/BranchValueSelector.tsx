/**
 * BranchValueSelector — selector for then/else branch values in the
 * ConditionalModeBuilder (FS-023 T-05).
 *
 * Options:
 *  - Static value: text input
 *  - Source field: single-field picker
 *  - Build expression: inline Source + Transform mini-builder (T-03)
 *  - (else only) Else-if condition: renders nested ConditionalModeBuilder
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { InlinePipelineBuilder } from './InlinePipelineBuilder';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type { BranchValue, ConditionalModeState, ValueModeState } from '../lib/expression-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BranchValueSelectorProps {
  readonly branch: BranchValue;
  readonly onBranchChange: (branch: BranchValue) => void;
  readonly parsedSourceSchema: ParsedSchema | null;
  /** Only true for the else branch — enables "Else-if condition" option */
  readonly allowElseIf?: boolean;
  /** Current else-if nesting depth (0 = top level) */
  readonly elseIfDepth?: number;
  readonly testIdPrefix: string;
  /** Injected to avoid circular import — pass ConditionalModeBuilder component */
  readonly ConditionalModeBuilderComponent?: React.ComponentType<{
    state: ConditionalModeState;
    onStateChange: (s: ConditionalModeState) => void;
    parsedSourceSchema: ParsedSchema | null;
    depth: number;
  }>;
}

type BranchKind = 'static' | 'source' | 'pipeline' | 'conditional';

const MAX_ELSE_IF_DEPTH = 5;

const EMPTY_PIPELINE_STATE: ValueModeState = { mode: 'value', inputType: 'source', sources: [], transforms: [] };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BranchValueSelector({
  branch,
  onBranchChange,
  parsedSourceSchema,
  allowElseIf = false,
  elseIfDepth = 0,
  testIdPrefix,
  ConditionalModeBuilderComponent,
}: BranchValueSelectorProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const allPaths = useMemo(() => {
    if (!parsedSourceSchema) return [];
    return flattenSchemaPaths(parsedSourceSchema);
  }, [parsedSourceSchema]);

  const suggestions = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return allPaths.filter((p) => q === '' || p.path.toLowerCase().includes(q)).slice(0, 30);
  }, [allPaths, searchQuery]);

  const currentKind: BranchKind =
    branch.kind === 'conditional' ? 'conditional' :
    branch.kind === 'pipeline' ? 'pipeline' :
    branch.kind === 'source' ? 'source' : 'static';

  const handleKindChange = useCallback(
    (kind: BranchKind) => {
      if (kind === 'static') {
        onBranchChange({ kind: 'static', value: '' });
      } else if (kind === 'source') {
        onBranchChange({ kind: 'source', value: '' });
      } else if (kind === 'pipeline') {
        onBranchChange({ kind: 'pipeline', state: EMPTY_PIPELINE_STATE });
      } else if (kind === 'conditional') {
        onBranchChange({
          kind: 'conditional',
          value: {
            mode: 'conditional',
            condition: { operator: 'and', conditions: [] },
            thenBranch: { kind: 'static', value: '' },
            elseBranch: { kind: 'static', value: '' },
          },
        });
      }
    },
    [onBranchChange],
  );

  const handleStaticValueChange = useCallback(
    (value: string) => {
      onBranchChange({ kind: 'static', value });
    },
    [onBranchChange],
  );

  const handleSourceSelect = useCallback(
    (path: string) => {
      onBranchChange({ kind: 'source', value: path });
      setSearchQuery('');
      setShowSuggestions(false);
    },
    [onBranchChange],
  );

  const handlePipelineChange = useCallback(
    (pipelineState: ValueModeState) => {
      onBranchChange({ kind: 'pipeline', state: pipelineState });
    },
    [onBranchChange],
  );

  const handleNestedStateChange = useCallback(
    (nested: ConditionalModeState) => {
      onBranchChange({ kind: 'conditional', value: nested });
    },
    [onBranchChange],
  );

  const atDepthCap = allowElseIf && elseIfDepth >= MAX_ELSE_IF_DEPTH;

  return (
    <div className="space-y-2" data-testid={testIdPrefix}>
      {/* Kind selector */}
      <div className="flex rounded border border-zinc-700 overflow-hidden w-fit text-xs">
        <button
          type="button"
          onClick={() => { handleKindChange('static'); }}
          className={[
            'px-2.5 py-1 focus:outline-none',
            currentKind === 'static' ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
          ].join(' ')}
          aria-pressed={currentKind === 'static'}
          data-testid={`${testIdPrefix}-kind-static`}
        >
          Static
        </button>
        <button
          type="button"
          onClick={() => { handleKindChange('source'); }}
          className={[
            'px-2.5 py-1 focus:outline-none',
            currentKind === 'source' ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
          ].join(' ')}
          aria-pressed={currentKind === 'source'}
          data-testid={`${testIdPrefix}-kind-source`}
        >
          Field
        </button>
        <button
          type="button"
          onClick={() => { handleKindChange('pipeline'); }}
          className={[
            'px-2.5 py-1 focus:outline-none',
            currentKind === 'pipeline' ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
          ].join(' ')}
          aria-pressed={currentKind === 'pipeline'}
          data-testid={`${testIdPrefix}-kind-pipeline`}
        >
          Build expression
        </button>
        {allowElseIf && !atDepthCap && (
          <button
            type="button"
            onClick={() => { handleKindChange('conditional'); }}
            className={[
              'px-2.5 py-1 focus:outline-none',
              currentKind === 'conditional' ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
            ].join(' ')}
            aria-pressed={currentKind === 'conditional'}
            data-testid={`${testIdPrefix}-kind-elseif`}
          >
            Else-if
          </button>
        )}
      </div>

      {/* Depth cap message */}
      {atDepthCap && (
        <p
          className="text-xs text-amber-400 italic"
          data-testid={`${testIdPrefix}-depth-cap`}
        >
          For more than 5 conditions, consider using a Value Map or switch to Editor mode.
        </p>
      )}

      {/* Static value input */}
      {currentKind === 'static' && (
        <input
          type="text"
          value={branch.kind === 'static' ? branch.value : ''}
          onChange={(e) => { handleStaticValueChange(e.target.value); }}
          placeholder="Enter value…"
          aria-label="Branch static value"
          className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          data-testid={`${testIdPrefix}-static-input`}
        />
      )}

      {/* Source field picker */}
      {currentKind === 'source' && (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={branch.kind === 'source' ? branch.value : searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
              if (branch.kind === 'source') onBranchChange({ kind: 'source', value: e.target.value });
            }}
            onFocus={() => { setShowSuggestions(true); }}
            onBlur={() => { setTimeout(() => { setShowSuggestions(false); }, 150); }}
            placeholder="Search fields…"
            aria-label="Branch source field"
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-sm font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            data-testid={`${testIdPrefix}-source-input`}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-full mt-0.5 z-30 bg-zinc-800 border border-zinc-600 rounded shadow-lg max-h-36 overflow-y-auto"
            >
              {suggestions.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); }}
                    onClick={() => { handleSourceSelect(entry.path); }}
                    className="w-full text-left px-2 py-1 text-xs font-mono text-zinc-100 hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none"
                    data-testid={`${testIdPrefix}-source-suggestion-${entry.path}`}
                  >
                    {entry.path}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Inline pipeline mini-builder (T-03) */}
      {currentKind === 'pipeline' && (
        <InlinePipelineBuilder
          state={branch.kind === 'pipeline' ? branch.state : EMPTY_PIPELINE_STATE}
          onChange={handlePipelineChange}
          parsedSourceSchema={parsedSourceSchema}
          testIdPrefix={`${testIdPrefix}-pipeline`}
        />
      )}

      {/* Nested else-if conditional */}
      {currentKind === 'conditional' && ConditionalModeBuilderComponent && branch.kind === 'conditional' && (
        <div className="pl-3 border-l-2 border-blue-700/50">
          <ConditionalModeBuilderComponent
            state={branch.value as ConditionalModeState}
            onStateChange={handleNestedStateChange}
            parsedSourceSchema={parsedSourceSchema}
            depth={elseIfDepth + 1}
          />
        </div>
      )}
    </div>
  );
}
