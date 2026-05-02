/**
 * ArgumentSlot — single argument input for the guided DSL builder (Step 3).
 *
 * Renders one argument slot for a function parameter. Three input modes:
 *  - "source"   → mini source-field picker (text input + dropdown suggestions)
 *  - "literal"  → type-appropriate input (text, number, boolean checkbox, enum select)
 *  - "function" → inline NestedFunctionBuilder (accordion-style)
 *
 * The "function" mode option is suppressed at nestingLevel >= 1 to prevent
 * unlimited recursion in the builder UI (deeper nesting → use raw editor).
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import type { FunctionCatalogParameter } from '@/lib/data/dsl-functions';
import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type { BuilderArgument, BuilderState } from '../lib/expression-generator';
// NestedFunctionBuilder is imported lazily via forward-ref to avoid circular deps.
// We use a prop instead: `renderNestedBuilder` injected by ArgumentConfigurator.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Array context info passed down from GuidedBuilder when a map()/filter()
 * expression is being built around an array-typed source field.
 */
export interface ArrayContext {
  /** True when builder is inside a map() or filter() over an array field. */
  readonly inArrayContext: boolean;
  /**
   * The SchemaTreeNode for the array field itself.
   * Its `.children` are the fields of each array element.
   */
  readonly arrayItemSchema: SchemaTreeNode | null;
}

export interface ArgumentSlotProps {
  readonly parameter: FunctionCatalogParameter;
  readonly value: BuilderArgument | undefined;
  readonly onChange: (value: BuilderArgument) => void;
  readonly onRemove?: () => void;
  readonly parsedSourceSchema: ParsedSchema | null;
  /** Pre-computed list of enum options for this parameter (e.g. cast targetType). */
  readonly enumOptions?: readonly string[];
  /**
   * Current nesting depth.
   * 0 = top-level ArgumentConfigurator.
   * 1 = inside NestedFunctionBuilder.
   * At depth >= 1, "function" mode is hidden.
   */
  readonly nestingLevel?: number;
  /**
   * Render prop for the nested function builder.
   * Injected by ArgumentConfigurator so we avoid a circular import.
   */
  readonly renderNestedBuilder?: (props: {
    onStateChange: (state: BuilderState | null) => void;
    currentState: BuilderState | null;
  }) => React.ReactNode;
  /**
   * Array context — when set and `inArrayContext` is true, the mini source
   * picker shows item()/source() sections so the user can reference array
   * element fields via item("path").
   */
  readonly arrayContext?: ArrayContext;
}

type InputMode = 'source' | 'literal' | 'function';

// ---------------------------------------------------------------------------
// Mini source-field picker (internal, no pills, no static mode)
// ---------------------------------------------------------------------------

type SourceSection = 'item' | 'source';

interface MiniSourcePickerProps {
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly value: string;
  readonly onChange: (path: string) => void;
  readonly arrayContext?: ArrayContext;
  readonly onKindChange?: (kind: 'source' | 'item') => void;
  readonly currentKind?: 'source' | 'item';
}

function MiniSourcePicker({
  parsedSourceSchema,
  value,
  onChange,
  arrayContext,
  onKindChange,
  currentKind = 'source',
}: MiniSourcePickerProps) {
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SourceSection>(
    arrayContext?.inArrayContext ? (currentKind === 'item' ? 'item' : 'source') : 'source',
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Build flat path lists for the active section
  const sourcePaths = useMemo(
    () => (parsedSourceSchema ? flattenSchemaPaths(parsedSourceSchema) : []),
    [parsedSourceSchema],
  );

  const itemPaths = useMemo(() => {
    if (!arrayContext?.inArrayContext || !arrayContext.arrayItemSchema) return [];
    const arrayNode = arrayContext.arrayItemSchema;
    const prefix = arrayNode.path ? `${arrayNode.path}.` : '';
    return arrayNode.children.map((child) => ({
      path: prefix ? child.path.startsWith(prefix) ? child.path.slice(prefix.length) : child.path : child.path,
      type: child.type,
    }));
  }, [arrayContext]);

  const activePaths = activeSection === 'item' ? itemPaths : sourcePaths;

  const suggestions = useMemo(() => {
    const q = inputValue.toLowerCase();
    return activePaths.filter((e) => e.path.toLowerCase().includes(q)).slice(0, 20);
  }, [activePaths, inputValue]);

  const handleSelect = useCallback(
    (path: string) => {
      setInputValue(path);
      onChange(path);
      onKindChange?.(activeSection === 'item' ? 'item' : 'source');
      setOpen(false);
    },
    [onChange, onKindChange, activeSection],
  );

  const handleSectionChange = useCallback((section: SourceSection) => {
    setActiveSection(section);
    setInputValue('');
    setOpen(true);
    inputRef.current?.focus();
  }, []);

  const showSectionToggle = arrayContext?.inArrayContext === true;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Section toggle (only in array context) */}
      {showSectionToggle && (
        <div
          role="group"
          aria-label="Field source section"
          className="inline-flex rounded border border-zinc-700 overflow-hidden text-xs self-start"
        >
          <button
            type="button"
            role="radio"
            aria-checked={activeSection === 'item'}
            onClick={() => { handleSectionChange('item'); }}
            className={[
              'px-2 py-0.5 font-mono transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              activeSection === 'item'
                ? 'bg-indigo-700 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
            ].join(' ')}
          >
            item()
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={activeSection === 'source'}
            onClick={() => { handleSectionChange('source'); }}
            className={[
              'px-2 py-0.5 font-mono transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              activeSection === 'source'
                ? 'bg-blue-700 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
            ].join(' ')}
          >
            source()
          </button>
        </div>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          placeholder={
            parsedSourceSchema === null
              ? 'No schema loaded'
              : activeSection === 'item'
              ? 'Search element field…'
              : 'Search field path…'
          }
          disabled={parsedSourceSchema === null && activeSection === 'source'}
          aria-label={activeSection === 'item' ? 'Array element field path' : 'Source field path'}
          className="w-full px-2 py-1 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          onChange={(e) => {
            setInputValue(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => { setOpen(true); }}
          onBlur={() => { setTimeout(() => { setOpen(false); }, 150); }}
        />
        {open && suggestions.length > 0 && (
          <ul
            role="listbox"
            aria-label={activeSection === 'item' ? 'Element field suggestions' : 'Field path suggestions'}
            className="absolute z-50 left-0 top-full mt-0.5 w-full max-h-40 overflow-y-auto bg-zinc-800 border border-zinc-600 rounded shadow-lg text-sm"
          >
            {suggestions.map((entry) => (
              <li
                key={entry.path}
                role="option"
                aria-selected={entry.path === value}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(entry.path); }}
                className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-zinc-700 text-zinc-100"
              >
                {activeSection === 'item' && (
                  <span className="text-xs text-indigo-400 font-mono">item</span>
                )}
                <span className="font-mono text-xs text-zinc-400">{entry.type}</span>
                <span className="font-mono">{entry.path}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArgumentSlot({
  parameter,
  value,
  onChange,
  onRemove,
  parsedSourceSchema,
  enumOptions,
  nestingLevel = 0,
  renderNestedBuilder,
  arrayContext,
}: ArgumentSlotProps) {
  // Derive initial mode from current value
  const initialMode = useMemo<InputMode>(() => {
    if (!value) return 'source';
    if (value.kind === 'source' || value.kind === 'item' || value.kind === 'parent') return 'source';
    if (value.kind === 'nested-function') return 'function';
    return 'literal';
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally only on mount

  const [mode, setMode] = useState<InputMode>(initialMode);

  // Track the item/source kind for source mode (relevant in array context)
  const [sourceKind, setSourceKind] = useState<'source' | 'item'>(() => {
    if (value?.kind === 'item') return 'item';
    return 'source';
  });

  // Track internal literal text value for controlled inputs
  const [literalText, setLiteralText] = useState<string>(() => {
    if (value?.kind === 'literal' && value.value !== null && typeof value.value !== 'boolean') {
      return String(value.value);
    }
    return '';
  });

  // Current source path (used in source mode)
  const [sourcePath, setSourcePath] = useState<string>(() => {
    if (value?.kind === 'source' || value?.kind === 'item' || value?.kind === 'parent') {
      return value.value;
    }
    return '';
  });

  // Enum selection (starts from current value or first option)
  const [enumValue, setEnumValue] = useState<string>(() => {
    if (value?.kind === 'literal' && typeof value.value === 'string') return value.value;
    return enumOptions?.[0] ?? '';
  });

  // Boolean toggle
  const [boolValue, setBoolValue] = useState<boolean>(() => {
    if (value?.kind === 'literal' && typeof value.value === 'boolean') return value.value;
    return false;
  });

  // Nested builder state
  const [nestedState, setNestedState] = useState<BuilderState | null>(() =>
    value?.kind === 'nested-function' ? value.value : null,
  );

  // -----------------------------------------------------------------------
  // Mode switch — emit a sensible default value for the new mode
  // -----------------------------------------------------------------------
  const handleModeChange = useCallback(
    (newMode: InputMode) => {
      setMode(newMode);
      if (newMode === 'source') {
        if (sourcePath) {
          onChange(sourceKind === 'item'
            ? { kind: 'item', value: sourcePath }
            : { kind: 'source', value: sourcePath });
        }
      } else if (newMode === 'literal') {
        if (enumOptions && enumOptions.length > 0) {
          onChange({ kind: 'literal', value: enumValue || enumOptions[0] });
        } else if (parameter.type === 'boolean') {
          onChange({ kind: 'literal', value: boolValue });
        } else if (parameter.type === 'number') {
          const n = parseFloat(literalText);
          onChange({ kind: 'literal', value: isNaN(n) ? 0 : n });
        } else {
          onChange({ kind: 'literal', value: literalText });
        }
      } else if (newMode === 'function') {
        if (nestedState) onChange({ kind: 'nested-function', value: nestedState });
      }
    },
    [sourcePath, sourceKind, enumOptions, enumValue, parameter.type, boolValue, literalText, nestedState, onChange],
  );

  // -----------------------------------------------------------------------
  // Handlers for each mode
  // -----------------------------------------------------------------------
  const handleSourceChange = useCallback(
    (path: string) => {
      setSourcePath(path);
      onChange(sourceKind === 'item'
        ? { kind: 'item', value: path }
        : { kind: 'source', value: path });
    },
    [onChange, sourceKind],
  );

  const handleKindChange = useCallback(
    (kind: 'source' | 'item') => {
      setSourceKind(kind);
      if (sourcePath) {
        onChange(kind === 'item'
          ? { kind: 'item', value: sourcePath }
          : { kind: 'source', value: sourcePath });
      }
    },
    [onChange, sourcePath],
  );

  const handleLiteralTextChange = useCallback(
    (text: string) => {
      setLiteralText(text);
      onChange({ kind: 'literal', value: text });
    },
    [onChange],
  );

  const handleLiteralNumberChange = useCallback(
    (text: string) => {
      setLiteralText(text);
      const n = parseFloat(text);
      onChange({ kind: 'literal', value: isNaN(n) ? 0 : n });
    },
    [onChange],
  );

  const handleBoolChange = useCallback(
    (checked: boolean) => {
      setBoolValue(checked);
      onChange({ kind: 'literal', value: checked });
    },
    [onChange],
  );

  const handleEnumChange = useCallback(
    (val: string) => {
      setEnumValue(val);
      onChange({ kind: 'literal', value: val });
    },
    [onChange],
  );

  const handleNestedStateChange = useCallback(
    (state: BuilderState | null) => {
      setNestedState(state);
      if (state) onChange({ kind: 'nested-function', value: state });
    },
    [onChange],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const isOptional = !parameter.required;
  const showFunctionMode = nestingLevel < 1 && renderNestedBuilder !== undefined;

  return (
    <div
      className="border border-zinc-700 rounded p-3 flex flex-col gap-2"
      data-testid={`argument-slot-${parameter.name}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-zinc-200">{parameter.name}</span>
          <span className="text-xs text-zinc-500 font-mono">{parameter.type}</span>
          {parameter.required ? (
            <span className="text-xs text-red-400" aria-label="required">*</span>
          ) : (
            <span className="text-xs text-zinc-500">(optional)</span>
          )}
          {parameter.variadic && (
            <span className="text-xs text-purple-400 ml-1">variadic</span>
          )}
        </div>
        {(isOptional || onRemove) && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${parameter.name} argument`}
            className="text-xs text-zinc-500 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded px-1"
          >
            ✕
          </button>
        )}
      </div>

      {/* Mode toggle */}
      <div
        role="group"
        aria-label={`Input mode for ${parameter.name}`}
        className="inline-flex rounded border border-zinc-700 overflow-hidden text-xs"
      >
        {(['source', 'literal'] as InputMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => { handleModeChange(m); }}
            className={[
              'px-2 py-0.5 font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 capitalize',
              mode === m ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
            ].join(' ')}
          >
            {m}
          </button>
        ))}
        {showFunctionMode && (
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'function'}
            onClick={() => { handleModeChange('function'); }}
            className={[
              'px-2 py-0.5 font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              mode === 'function' ? 'bg-blue-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
            ].join(' ')}
          >
            Function
          </button>
        )}
      </div>

      {/* Input based on mode */}
      {mode === 'source' && (
        <MiniSourcePicker
          parsedSourceSchema={parsedSourceSchema}
          value={sourcePath}
          onChange={handleSourceChange}
          arrayContext={arrayContext}
          currentKind={sourceKind}
          onKindChange={handleKindChange}
        />
      )}

      {mode === 'literal' && enumOptions && enumOptions.length > 0 && (
        <select
          value={enumValue}
          aria-label={`${parameter.name} value`}
          onChange={(e) => { handleEnumChange(e.target.value); }}
          className="w-full px-2 py-1 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 focus:outline-none focus:border-blue-500"
        >
          {enumOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {mode === 'literal' && (!enumOptions || enumOptions.length === 0) && parameter.type === 'boolean' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={boolValue}
            aria-label={`${parameter.name} boolean value`}
            onChange={(e) => { handleBoolChange(e.target.checked); }}
            className="accent-blue-500 w-4 h-4"
          />
          <span className="text-sm text-zinc-300">{boolValue ? 'true' : 'false'}</span>
        </label>
      )}

      {mode === 'literal' && (!enumOptions || enumOptions.length === 0) && parameter.type === 'number' && (
        <input
          type="number"
          value={literalText}
          aria-label={`${parameter.name} number value`}
          placeholder="0"
          onChange={(e) => { handleLiteralNumberChange(e.target.value); }}
          className="w-full px-2 py-1 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
        />
      )}

      {mode === 'literal' && (!enumOptions || enumOptions.length === 0) && parameter.type !== 'boolean' && parameter.type !== 'number' && (
        <input
          type="text"
          value={literalText}
          aria-label={`${parameter.name} value`}
          placeholder={parameter.type === 'any' ? 'Value…' : `${parameter.type} value…`}
          onChange={(e) => { handleLiteralTextChange(e.target.value); }}
          className="w-full px-2 py-1 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
        />
      )}

      {mode === 'function' && renderNestedBuilder && (
        <div className="border border-zinc-700 rounded bg-zinc-900/50 p-2">
          {renderNestedBuilder({
            onStateChange: handleNestedStateChange,
            currentState: nestedState,
          })}
        </div>
      )}
    </div>
  );
}
