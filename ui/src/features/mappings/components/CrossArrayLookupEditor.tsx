/**
 * CrossArrayLookupEditor.tsx — FS-043 T-09
 *
 * Guided form for configuring cross-array lookup expressions.
 *
 * Generates:
 *   default(get(find(source("lookupArray"), eq(item("matchField"), parent("compareField"))), "returnField"), fallback)
 *   — or without fallback:
 *   get(find(source("lookupArray"), eq(item("matchField"), parent("compareField"))), "returnField")
 *
 * DSL scope rules (per spec):
 *   - Inside find(), item() refers to the lookup candidate element.
 *   - The enclosing map()'s current element is accessed via parent().
 *   - compareScope: 'parent' → parent("compareField"), 'item' → item("compareField")
 *     (In a single-level map, the outer item is parent(); in nested context, same rule applies.)
 *
 * Form steps:
 *   1. Lookup array — root-level array fields from source schema
 *   2. Match field — field from the lookup array's item schema
 *   3. Compare against — current item field (parent scope) or item field (item scope)
 *   4. Return field — field from the lookup array's item schema
 *   5. Default fallback — optional static value
 */

import { useMemo } from 'react';
import { ArrowRight, Search } from 'lucide-react';

import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type { CrossArrayLookupState } from '../lib/array-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrossArrayLookupEditorProps {
  readonly lookupState: CrossArrayLookupState;
  /** Parsed source schema — for lookup array and field pickers. */
  readonly parsedSourceSchema: ParsedSchema | null;
  /**
   * Item-level field paths from the enclosing map's source array.
   * Used for the "compare against" picker (parent scope).
   */
  readonly itemFieldPaths: readonly string[];
  /** Whether parent scope is available (always true for single-level map). */
  readonly hasParentScope?: boolean;
  readonly onChange: (state: CrossArrayLookupState) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns root-level array paths from the source schema. */
function getArrayPaths(schema: ParsedSchema | null): string[] {
  if (!schema) return [];
  return flattenSchemaPaths(schema)
    .filter((e) => e.type === 'array')
    .map((e) => e.path);
}

/**
 * Derives item-level field names for a given array path.
 * E.g. for "taxLines", returns ["lineRef", "taxAmount", ...].
 */
function getArrayItemFields(schema: ParsedSchema | null, arrayPath: string): string[] {
  if (!schema || !arrayPath) return [];
  const prefix = arrayPath + '.';
  return flattenSchemaPaths(schema)
    .map((e) => e.path)
    .filter((p) => p.startsWith(prefix))
    .map((p) => p.slice(prefix.length))
    .filter((p) => !p.includes('.')); // leaf fields only
}

/** Generates a human-readable summary of the lookup configuration. */
export function summarizeLookup(state: CrossArrayLookupState): string {
  if (!state.lookupArrayPath || !state.returnField) return 'Cross-array lookup (incomplete)';
  const compareRef =
    state.compareScope === 'parent'
      ? `parent("${state.compareField}")`
      : `item("${state.compareField}")`;
  const matchRef = state.matchField ? `item("${state.matchField}") = ${compareRef}` : '…';
  const fallbackStr = state.fallback
    ? `, default: ${state.fallback.type === 'null' ? 'null' : String((state.fallback as { value: unknown }).value ?? '')}`
    : '';
  return `${state.returnField} from ${state.lookupArrayPath} where ${matchRef}${fallbackStr}`;
}

// ---------------------------------------------------------------------------
// Sub-component: FieldSelect
// ---------------------------------------------------------------------------

function FieldSelect({
  id,
  label,
  value,
  options,
  placeholder,
  onChange,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <select
        id={id}
        value={value}
        data-testid={testId}
        onChange={(e) => { onChange(e.target.value); }}
        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 font-mono text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CrossArrayLookupEditor({
  lookupState,
  parsedSourceSchema,
  itemFieldPaths,
  hasParentScope = true,
  onChange,
  className = '',
}: CrossArrayLookupEditorProps) {
  const arrayPaths = useMemo(() => getArrayPaths(parsedSourceSchema), [parsedSourceSchema]);

  const lookupItemFields = useMemo(
    () => getArrayItemFields(parsedSourceSchema, lookupState.lookupArrayPath),
    [parsedSourceSchema, lookupState.lookupArrayPath],
  );

  // Fallback value as string for the input
  const fallbackStr = lookupState.fallback
    ? lookupState.fallback.type === 'null'
      ? 'null'
      : String((lookupState.fallback as { value: unknown }).value ?? '')
    : '';

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleLookupArrayChange(path: string) {
    onChange({
      ...lookupState,
      lookupArrayPath: path,
      matchField: '',
      returnField: '',
    });
  }

  function handleMatchFieldChange(field: string) {
    onChange({ ...lookupState, matchField: field });
  }

  function handleCompareScopeChange(scope: 'item' | 'parent') {
    onChange({ ...lookupState, compareScope: scope, compareField: '' });
  }

  function handleCompareFieldChange(field: string) {
    onChange({ ...lookupState, compareField: field });
  }

  function handleReturnFieldChange(field: string) {
    onChange({ ...lookupState, returnField: field });
  }

  function handleFallbackChange(value: string) {
    if (!value.trim()) {
      onChange({ ...lookupState, fallback: undefined });
      return;
    }
    if (value === 'null') {
      onChange({ ...lookupState, fallback: { type: 'null' } });
      return;
    }
    if (value === 'true') {
      onChange({ ...lookupState, fallback: { type: 'boolean', value: true } });
      return;
    }
    if (value === 'false') {
      onChange({ ...lookupState, fallback: { type: 'boolean', value: false } });
      return;
    }
    const num = Number(value);
    if (value.trim() !== '' && isFinite(num)) {
      onChange({ ...lookupState, fallback: { type: 'number', value: num } });
      return;
    }
    onChange({ ...lookupState, fallback: { type: 'string', value } });
  }

  // Compare field options depend on scope
  const compareFieldOptions =
    lookupState.compareScope === 'parent' ? [...itemFieldPaths] : lookupItemFields;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isComplete =
    lookupState.lookupArrayPath.trim() &&
    lookupState.matchField.trim() &&
    lookupState.compareField.trim() &&
    lookupState.returnField.trim();

  return (
    <div
      data-testid="cross-array-lookup-editor"
      className={['space-y-3', className].filter(Boolean).join(' ')}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Search size={12} aria-hidden="true" className="shrink-0 text-violet-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Cross-array lookup
        </span>
        <span className="ml-auto rounded bg-violet-900/40 px-1.5 py-0.5 text-[9px] font-medium text-violet-300">
          helper
        </span>
      </div>

      {/* Step 1: Lookup array */}
      <FieldSelect
        id="lookup-array"
        label="1. Lookup array"
        value={lookupState.lookupArrayPath}
        options={arrayPaths}
        placeholder="Select array to search…"
        onChange={handleLookupArrayChange}
        testId="lookup-array-select"
      />

      {/* Step 2: Match field (from lookup array) */}
      <FieldSelect
        id="match-field"
        label="2. Match field (in lookup array)"
        value={lookupState.matchField}
        options={lookupItemFields}
        placeholder={lookupState.lookupArrayPath ? 'Select field to match on…' : 'Select lookup array first'}
        onChange={handleMatchFieldChange}
        testId="match-field-select"
      />

      {/* Step 3: Compare against */}
      <div className="space-y-1.5">
        <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
          3. Compare against
        </span>

        {/* Scope toggle */}
        <div
          role="group"
          aria-label="Compare scope"
          className="inline-flex overflow-hidden rounded border border-slate-700"
        >
          <button
            type="button"
            aria-pressed={lookupState.compareScope === 'parent'}
            data-testid="compare-scope-parent"
            onClick={() => { handleCompareScopeChange('parent'); }}
            className={[
              'px-2 py-1 text-[10px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
              lookupState.compareScope === 'parent'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300',
            ].join(' ')}
          >
            Current item (parent)
          </button>
          <button
            type="button"
            aria-pressed={lookupState.compareScope === 'item'}
            data-testid="compare-scope-item"
            onClick={() => { handleCompareScopeChange('item'); }}
            className={[
              'px-2 py-1 text-[10px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
              lookupState.compareScope === 'item'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300',
            ].join(' ')}
          >
            Lookup item (item)
          </button>
        </div>

        <p className="text-[10px] text-slate-600">
          {lookupState.compareScope === 'parent'
            ? 'Uses parent("field") — the enclosing map\'s current element'
            : 'Uses item("field") — the lookup array\'s current element'}
        </p>

        <FieldSelect
          id="compare-field"
          label=""
          value={lookupState.compareField}
          options={compareFieldOptions}
          placeholder="Select field to compare…"
          onChange={handleCompareFieldChange}
          testId="compare-field-select"
        />
      </div>

      {/* Step 4: Return field */}
      <FieldSelect
        id="return-field"
        label="4. Return field (from lookup array)"
        value={lookupState.returnField}
        options={lookupItemFields}
        placeholder={lookupState.lookupArrayPath ? 'Select field to return…' : 'Select lookup array first'}
        onChange={handleReturnFieldChange}
        testId="return-field-select"
      />

      {/* Step 5: Default fallback (optional) */}
      <div className="space-y-1">
        <label
          htmlFor="lookup-fallback"
          className="block text-[10px] font-medium uppercase tracking-wide text-slate-500"
        >
          5. Default fallback{' '}
          <span className="normal-case text-slate-600">(optional)</span>
        </label>
        <input
          id="lookup-fallback"
          type="text"
          value={fallbackStr}
          placeholder='e.g. 0, "unknown", null'
          data-testid="lookup-fallback-input"
          onChange={(e) => { handleFallbackChange(e.target.value); }}
          className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Expression preview */}
      {isComplete && (
        <div className="rounded border border-slate-700 bg-slate-900/60 px-2.5 py-2 space-y-1">
          <div className="flex items-center gap-1.5">
            <ArrowRight size={10} aria-hidden="true" className="shrink-0 text-violet-400" />
            <span className="text-[9px] font-medium uppercase tracking-wide text-slate-600">
              Generated expression
            </span>
          </div>
          <p className="font-mono text-[10px] text-violet-300 break-all">
            {lookupState.fallback !== undefined
              ? `default(get(find(source("${lookupState.lookupArrayPath}"), eq(item("${lookupState.matchField}"), ${lookupState.compareScope === 'parent' ? 'parent' : 'item'}("${lookupState.compareField}"))), "${lookupState.returnField}"), …)`
              : `get(find(source("${lookupState.lookupArrayPath}"), eq(item("${lookupState.matchField}"), ${lookupState.compareScope === 'parent' ? 'parent' : 'item'}("${lookupState.compareField}"))), "${lookupState.returnField}")`}
          </p>
        </div>
      )}

      {/* Summary */}
      <p
        data-testid="lookup-summary"
        className="text-[11px] text-slate-500 italic"
      >
        {summarizeLookup(lookupState)}
      </p>
    </div>
  );
}
