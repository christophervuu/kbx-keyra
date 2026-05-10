/**
 * ValueMapStepEditor.tsx — FS-039 T-09
 *
 * Full value map step editor for the chain-based Builder.
 *
 * Implements: AE-10, AE-22, AE-23
 *
 * Structure:
 *   - Mapping rows: each row has an input value (string) and an output chain
 *   - [+ Add Mapping] button to add new rows
 *   - Remove button on individual rows
 *   - Default case: always present, cannot be removed, has its own output chain
 *
 * The value map implicitly operates on the current chain value — no separate
 * source selector is needed (it maps from whatever the previous step produced).
 *
 * Structural validity: complete when default has a source set AND all rows
 * have a non-empty input value.
 *
 * This is a NEW component. ValueMapModeBuilder.tsx is NOT modified.
 */

import { useCallback } from 'react';
import { Plus, X } from 'lucide-react';

import { createEmptyChain } from '../lib/chain-builder-state';
import type {
  FS039ValueMapStep,
  FS039ValueMapEntry,
  ChainState,
} from '../lib/chain-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValueMapStepEditorProps {
  /** The value map step being edited. */
  readonly step: FS039ValueMapStep;
  /** Zero-based index of this step in the parent chain. */
  readonly stepIndex: number;
  /** Called when the step state changes. */
  readonly onChange: (updated: FS039ValueMapStep) => void;
  /** Parsed source schema for field suggestions in output chains. */
  readonly parsedSourceSchema?: ParsedSchema | null;
  /** Optional className for the root element. */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// BranchChainEditor — minimal output chain editor (field or static value)
// ---------------------------------------------------------------------------

interface BranchChainEditorProps {
  readonly chain: ChainState;
  readonly onChange: (updated: ChainState) => void;
  readonly parsedSourceSchema?: ParsedSchema | null;
  readonly label: string;
  readonly testIdPrefix: string;
}

function BranchChainEditor({
  chain,
  onChange,
  parsedSourceSchema,
  label,
  testIdPrefix,
}: BranchChainEditorProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const allPaths = parsedSourceSchema
    ? flattenSchemaPaths(parsedSourceSchema).map((e) => e.path)
    : [];
  const isField = chain.source.kind === 'field';
  const isStatic = chain.source.kind === 'static';

  const fieldValue = isField ? chain.source.path : '';
  const staticValue =
    isStatic && chain.source.value.type !== 'null'
      ? String((chain.source.value as { value: string | number | boolean }).value ?? '')
      : '';

  const [searchQuery, setSearchQuery] = useState('');
  const suggestions = allPaths
    .filter((p) => searchQuery === '' || p.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice(0, 30);

  function handleKindToggle(kind: 'field' | 'static') {
    if (kind === 'field') {
      onChange({ ...chain, source: { kind: 'field', path: '' } });
    } else {
      onChange({ ...chain, source: { kind: 'static', value: { type: 'string', value: '' } } });
    }
    setSearchQuery('');
  }

  return (
    <div className="space-y-1" data-testid={testIdPrefix}>
      {/* Kind toggle */}
      <div
        className="flex rounded border border-zinc-700 overflow-hidden w-fit text-xs"
        role="group"
        aria-label={`${label} output type`}
      >
        <button
          type="button"
          onClick={() => { handleKindToggle('field'); }}
          aria-pressed={isField}
          className={[
            'px-2 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
            isField ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
          ].join(' ')}
          data-testid={`${testIdPrefix}-kind-field`}
        >
          Field
        </button>
        <button
          type="button"
          onClick={() => { handleKindToggle('static'); }}
          aria-pressed={isStatic}
          className={[
            'px-2 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
            isStatic ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
          ].join(' ')}
          data-testid={`${testIdPrefix}-kind-static`}
        >
          Value
        </button>
      </div>

      {/* Field input */}
      {isField && (
        <div className="relative">
          <input
            type="text"
            value={fieldValue}
            onChange={(e) => {
              onChange({ ...chain, source: { kind: 'field', path: e.target.value } });
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => { setShowSuggestions(true); }}
            onBlur={() => { setTimeout(() => { setShowSuggestions(false); }, 150); }}
            placeholder="Search fields…"
            aria-label={`${label} output field`}
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            data-testid={`${testIdPrefix}-field-input`}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-full mt-0.5 z-30 bg-zinc-800 border border-zinc-600 rounded shadow-lg max-h-36 overflow-y-auto"
            >
              {suggestions.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); }}
                    onClick={() => {
                      onChange({ ...chain, source: { kind: 'field', path } });
                      setSearchQuery('');
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-2 py-1 text-xs font-mono text-zinc-100 hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none"
                    data-testid={`${testIdPrefix}-suggestion-${path}`}
                  >
                    {path}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Static value input */}
      {isStatic && (
        <input
          type="text"
          value={staticValue}
          onChange={(e) => {
            onChange({
              ...chain,
              source: { kind: 'static', value: { type: 'string', value: e.target.value } },
            });
          }}
          placeholder="Enter value…"
          aria-label={`${label} output value`}
          className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          data-testid={`${testIdPrefix}-static-input`}
        />
      )}

      {/* Empty state */}
      {!isField && !isStatic && (
        <p className="text-xs text-zinc-600 italic">Select an output for this case.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MappingRowEditor — a single when→output row
// ---------------------------------------------------------------------------

interface MappingRowEditorProps {
  readonly entry: FS039ValueMapEntry;
  readonly rowIndex: number;
  readonly onChange: (updated: FS039ValueMapEntry) => void;
  readonly onRemove: () => void;
  readonly parsedSourceSchema?: ParsedSchema | null;
}

function MappingRowEditor({
  entry,
  rowIndex,
  onChange,
  onRemove,
  parsedSourceSchema,
}: MappingRowEditorProps) {
  return (
    <div
      className="space-y-2 rounded-lg border border-zinc-700/60 bg-zinc-900/40 p-3"
      data-testid={`valuemap-row-${rowIndex}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          When
        </span>
        <input
          type="text"
          value={entry.whenValue}
          onChange={(e) => { onChange({ ...entry, whenValue: e.target.value }); }}
          placeholder="Input value…"
          aria-label={`Mapping row ${rowIndex + 1} input value`}
          className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          data-testid={`valuemap-row-${rowIndex}-when`}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove mapping row ${rowIndex + 1}`}
          className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-red-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 transition-colors"
          data-testid={`valuemap-row-${rowIndex}-remove`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">
          Map to
        </span>
        <BranchChainEditor
          chain={entry.outputChain}
          onChange={(outputChain) => { onChange({ ...entry, outputChain }); }}
          parsedSourceSchema={parsedSourceSchema}
          label={`Row ${rowIndex + 1} output`}
          testIdPrefix={`valuemap-row-${rowIndex}-output`}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component: ValueMapStepEditor
// ---------------------------------------------------------------------------

/**
 * ValueMapStepEditor — full value map step editor for the chain-based Builder.
 *
 * Renders mapping rows (when → map to) and a required default case.
 * The default case cannot be removed.
 */
export function ValueMapStepEditor({
  step,
  stepIndex,
  onChange,
  parsedSourceSchema,
  className = '',
}: ValueMapStepEditorProps) {
  const handleRowChange = useCallback(
    (rowIndex: number, updated: FS039ValueMapEntry) => {
      const mappings = step.mappings.map((m, i) => (i === rowIndex ? updated : m));
      onChange({ ...step, mappings });
    },
    [step, onChange],
  );

  const handleAddRow = useCallback(() => {
    const newEntry: FS039ValueMapEntry = { whenValue: '', outputChain: createEmptyChain() };
    onChange({ ...step, mappings: [...step.mappings, newEntry] });
  }, [step, onChange]);

  const handleRemoveRow = useCallback(
    (rowIndex: number) => {
      onChange({ ...step, mappings: step.mappings.filter((_, i) => i !== rowIndex) });
    },
    [step, onChange],
  );

  const handleDefaultChange = useCallback(
    (defaultValue: ChainState) => {
      onChange({ ...step, defaultValue });
    },
    [step, onChange],
  );

  return (
    <div
      className={['space-y-3', className].filter(Boolean).join(' ')}
      data-testid={`valuemap-step-editor-${stepIndex}`}
    >
      {/* Mapping rows */}
      {step.mappings.map((entry, rowIndex) => (
        <MappingRowEditor
          key={rowIndex}
          entry={entry}
          rowIndex={rowIndex}
          onChange={(updated) => { handleRowChange(rowIndex, updated); }}
          onRemove={() => { handleRemoveRow(rowIndex); }}
          parsedSourceSchema={parsedSourceSchema}
        />
      ))}

      {/* Add Mapping button */}
      <button
        type="button"
        onClick={handleAddRow}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-purple-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-500 rounded px-1 transition-colors"
        data-testid={`valuemap-step-editor-${stepIndex}-add-row`}
      >
        <Plus className="h-3 w-3" aria-hidden="true" />
        Add Mapping
      </button>

      {/* Default case — always present, cannot be removed */}
      <div
        className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 p-3 space-y-2"
        data-testid={`valuemap-step-editor-${stepIndex}-default`}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Default
          </span>
          <span className="text-[10px] text-zinc-600">(required — cannot be removed)</span>
        </div>
        <BranchChainEditor
          chain={step.defaultValue}
          onChange={handleDefaultChange}
          parsedSourceSchema={parsedSourceSchema}
          label="Default output"
          testIdPrefix={`valuemap-step-editor-${stepIndex}-default-output`}
        />
      </div>
    </div>
  );
}
