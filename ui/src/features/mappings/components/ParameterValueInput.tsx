/**
 * ParameterValueInput — FS-053 T-01 / T-02
 *
 * Intent-based parameter value input for function argument slots in the
 * Mapping Editor. Replaces the implementation-oriented mode model of
 * `ArgumentSlotInput` (source/literal/expression) with a user-facing model:
 *
 *   Primary modes (segmented toggle):
 *     - Source  — pick a field path from the source schema
 *     - Static  — enter a fixed value
 *     - Options — select from predefined values (when hint exists)
 *     - Item    — pick from array item fields (when isItemContext=true)
 *     - External — disabled/coming-soon chip
 *
 *   Secondary mode (inline link below toggle):
 *     - "Use advanced expression" → opens TransformFunctionPicker
 *
 * Emits the same `ArgumentSlot` shapes as `ArgumentSlotInput` for full
 * backward compatibility with all consumers.
 *
 * T-02 additions:
 *   - `resolveParameterOptions` helper (PARAMETER_HINTS → ParameterOptions)
 *   - Chip list rendering for options.values.length ≤ 6
 *   - Searchable dropdown (listbox) for options.values.length > 6
 *   - Strict enum: hides Source/Static from toggle (allowCustom === false)
 *   - Custom value indicator when current literal is not in options list
 *
 * Empty string handling refinements are deferred to T-03.
 */

import { useCallback, useContext, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { SourceFieldOptionRow } from './SourceFieldOptionRow';
import type { SchemaPathEntry } from '../lib/autocomplete-utils';
import { resolveFieldTestValue } from '../lib/source-field-display';
import { PreviewContext } from '../context/preview-context';
import type { ArgumentSlot } from '../lib/expression-builder-state';
import {
  makeExpressionSlot,
  makeSourceSlot,
  makeLiteralSlot,
} from '../lib/expression-builder-state';
import type { FunctionCatalogParameter } from '@/lib/data/dsl-functions';
import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import type { ParameterHint } from '@/lib/data/parameter-hints';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Predefined options for a parameter (derived from PARAMETER_HINTS).
 */
export interface ParameterOptions {
  /** Ordered list of predefined values. */
  readonly values: readonly string[];
  /** Whether custom/freeform values are also allowed. */
  readonly allowCustom: boolean;
  /** Display style: 'chips' for small sets, 'dropdown' for larger sets. */
  readonly display: 'chips' | 'dropdown';
}

export interface ParameterValueInputProps {
  /** Current slot value (same ArgumentSlot shape as today). */
  readonly slot: ArgumentSlot;
  /** Parameter catalog definition. */
  readonly parameter: FunctionCatalogParameter;
  /** User-facing label. */
  readonly label: string;
  /** Optional description text. */
  readonly description?: string;
  /** Predefined options for this parameter (from PARAMETER_HINTS). */
  readonly options?: ParameterOptions;
  /** Source field suggestions. */
  readonly sourceOptions?: readonly SchemaPathEntry[];
  /** Whether this parameter is in an array/item context. */
  readonly isItemContext?: boolean;
  /** Array path for item-context field filtering. */
  readonly arrayPath?: string;
  /** Whether to show the External chip (disabled/coming-soon). Defaults to true. */
  readonly showExternal?: boolean;
  /** Fires when the slot value changes. */
  readonly onSlotChange: (updated: ArgumentSlot) => void;
  /** Optional: fires when this slot should be removed (variadic). */
  readonly onRemove?: () => void;
  /** Placeholder/example text. */
  readonly placeholder?: string;
  /** Optional prefix for deterministic nested test IDs. */
  readonly testIdPrefix?: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type PrimaryMode = 'source' | 'item' | 'static' | 'options' | 'expression';

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Converts a `ParameterHint` to the `ParameterOptions` shape expected by
 * `ParameterValueInput`. Determines chip vs dropdown display based on count.
 *
 * - enum hint  → allowCustom: false, values = hint.options
 * - tokens hint → allowCustom: hint.allowFreeform ?? true, values = hint.presets
 */
export function parameterHintToOptions(hint: ParameterHint): ParameterOptions {
  if (hint.type === 'enum') {
    return {
      values: hint.options,
      allowCustom: false,
      display: hint.options.length <= 6 ? 'chips' : 'dropdown',
    };
  }
  // tokens
  return {
    values: hint.presets,
    allowCustom: hint.allowFreeform ?? true,
    display: hint.presets.length <= 6 ? 'chips' : 'dropdown',
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Serializes an ArgumentSlot to a plain text expression string.
 * Used to pre-fill the advanced expression textarea.
 */
function serializeSlotToText(slot: ArgumentSlot): string {
  if (slot.mode === 'literal') return slot.value;
  if (slot.mode === 'source') return slot.path === '' ? '' : `source("${slot.path}")`;
  // expression slot
  return slot.node.functionName + '(…)';
}

/**
 * Derive the initial primary mode from the incoming slot.
 * Expression slots are treated as 'expression' mode.
 * Source slots → 'source' (or 'item' if isItemContext).
 * Literal slots → 'options' if value is in options list, else 'static'.
 */
function deriveInitialMode(
  slot: ArgumentSlot,
  isItemContext: boolean,
  options: ParameterOptions | undefined,
): PrimaryMode {
  if (slot.mode === 'expression') {
    if (slot.node.functionName === 'item') {
      return isItemContext ? 'item' : 'source';
    }
    return 'expression';
  }
  if (slot.mode === 'source') {
    return isItemContext ? 'item' : 'source';
  }
  // literal
  if (options !== undefined && options.values.includes(slot.value)) {
    return 'options';
  }
  // strict enum with no matching value — still start in options
  if (options !== undefined && !options.allowCustom) {
    return 'options';
  }
  return 'static';
}

// ---------------------------------------------------------------------------
// Sub-component: OptionsChipList
// ---------------------------------------------------------------------------

interface OptionsChipListProps {
  readonly values: readonly string[];
  readonly selected: string;
  readonly onSelect: (value: string) => void;
  readonly testIdPrefix: string;
}

function OptionsChipList({ values, selected, onSelect, testIdPrefix }: OptionsChipListProps) {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="listbox"
      aria-label="Preset options"
      data-testid={`${testIdPrefix}-chips`}
    >
      {values.map((v) => (
        <button
          key={v}
          type="button"
          role="option"
          aria-selected={selected === v}
          onClick={() => { onSelect(v); }}
          className={[
            'rounded-md border px-2.5 py-1.5 text-xs cursor-pointer transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400',
            selected === v
              ? 'bg-blue-700 border-blue-600 text-white'
              : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600',
          ].join(' ')}
          data-testid={`${testIdPrefix}-chip-${v}`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: OptionsDropdown
// ---------------------------------------------------------------------------

interface OptionsDropdownProps {
  readonly values: readonly string[];
  readonly selected: string;
  readonly onSelect: (value: string) => void;
  readonly label: string;
  readonly testIdPrefix: string;
}

function OptionsDropdown({ values, selected, onSelect, label, testIdPrefix }: OptionsDropdownProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () =>
      query === ''
        ? values
        : values.filter((v) => v.toLowerCase().includes(query.toLowerCase())),
    [values, query],
  );

  return (
    <div className="space-y-1" data-testid={`${testIdPrefix}-dropdown`}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); }}
        placeholder="Search options…"
        aria-label={`Search ${label} options`}
        className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
        data-testid={`${testIdPrefix}-dropdown-search`}
      />
      <div
        role="listbox"
        aria-label={`${label} options`}
        className="max-h-40 overflow-y-auto rounded border border-zinc-700 bg-zinc-900"
        data-testid={`${testIdPrefix}-dropdown-list`}
      >
        {filtered.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-zinc-500 italic">No matching options</p>
        ) : (
          filtered.map((v) => (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={selected === v}
              onClick={() => { onSelect(v); }}
              className={[
                'flex w-full items-center px-2 py-1.5 text-xs text-left transition-colors focus:outline-none',
                selected === v
                  ? 'bg-blue-700/30 text-blue-200'
                  : 'text-zinc-300 hover:bg-zinc-800',
              ].join(' ')}
              data-testid={`${testIdPrefix}-dropdown-option-${v}`}
            >
              {v}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Intent-based parameter value input for a single function argument slot.
 *
 * Renders a segmented mode toggle (Source/Static/Options/External) with
 * Expression demoted to an inline secondary link below the toggle.
 */
export function ParameterValueInput({
  slot,
  parameter,
  label,
  description,
  options,
  sourceOptions,
  isItemContext = false,
  arrayPath = '',
  showExternal = true,
  onSlotChange,
  onRemove,
  placeholder,
  testIdPrefix = 'pvi',
}: ParameterValueInputProps) {
  // -------------------------------------------------------------------------
  // Derived initial state
  // -------------------------------------------------------------------------

  const initialMode = deriveInitialMode(slot, isItemContext, options);

  // -------------------------------------------------------------------------
  // Local state
  // -------------------------------------------------------------------------

  const [currentMode, setCurrentMode] = useState<PrimaryMode>(initialMode);

  // Preserve per-mode values so switching modes doesn't lose entered data
  const [sourcePath, setSourcePath] = useState<string>(() =>
    slot.mode === 'source' ? slot.path : '',
  );

  // Separate custom static value from options selection (AE-12)
  const [literalValue, setLiteralValue] = useState<string>(() =>
    slot.mode === 'literal' ? slot.value : '',
  );

  // Interaction state for empty string handling (AE-07 / AE-08 / T-03).
  // Set to true on first focus of the Static mode input.
  // Distinguishes "user hasn't touched this yet" from "user deliberately left it empty".
  const [hasInteracted, setHasInteracted] = useState<boolean>(() =>
    // If the slot already has a value, treat it as already interacted
    slot.mode === 'literal' && slot.value !== '',
  );

  const [selectedOption, setSelectedOption] = useState<string>(() => {
    if (slot.mode === 'literal' && options !== undefined) {
      // If current value is in options list, use it; otherwise fall back to first option
      return options.values.includes(slot.value) ? slot.value : (options.values[0] ?? '');
    }
    return options?.values[0] ?? '';
  });

  const [itemPath, setItemPath] = useState<string>(() => {
    if (slot.mode === 'expression' && slot.node.functionName === 'item') {
      const pathSlot = slot.node.slots[0];
      return pathSlot?.mode === 'literal' ? pathSlot.value : '';
    }
    return '';
  });

  // Expression mode state
  const [expressionText, setExpressionText] = useState<string>(() =>
    serializeSlotToText(slot),
  );
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);

  // Preview context for test data
  const previewCtx = useContext(PreviewContext);
  const sourceData = previewCtx?.sourceData ?? null;

  // -------------------------------------------------------------------------
  // Derived: custom value detection (AE-10)
  // -------------------------------------------------------------------------

  // A "custom" value is a literal that is not in the options list
  const isCustomValue =
    options !== undefined &&
    slot.mode === 'literal' &&
    slot.value !== '' &&
    !options.values.includes(slot.value);

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  const isEmpty =
    (currentMode === 'source' && sourcePath === '') ||
    (currentMode === 'item' && itemPath === '') ||
    (currentMode === 'static' && literalValue === '') ||
    (currentMode === 'options' && selectedOption === '');

  // Show amber "Required" badge only when the user has NOT yet interacted with
  // the Static input (unmet state). Once they focus+blur (hasInteracted=true),
  // the badge is replaced by softer helper text (AE-08).
  const showValidationWarning =
    parameter.required &&
    isEmpty &&
    currentMode !== 'expression' &&
    !(currentMode === 'static' && hasInteracted);

  // -------------------------------------------------------------------------
  // Toggle visibility rules (T-02)
  // -------------------------------------------------------------------------

  // Strict enum: only Options shown (no Source, no Static, no Item)
  const isStrictEnum = options !== undefined && !options.allowCustom;

  const showSourceMode = !isItemContext && !isStrictEnum;
  const showItemMode = isItemContext && !isStrictEnum;
  const showStaticMode = !isStrictEnum;
  const showOptionsMode = options !== undefined;

  // -------------------------------------------------------------------------
  // Mode toggle handler
  // -------------------------------------------------------------------------

  const handleModeChange = useCallback(
    (newMode: PrimaryMode) => {
      setCurrentMode(newMode);
      if (newMode === 'source') {
        onSlotChange(makeSourceSlot(sourcePath));
      } else if (newMode === 'item') {
        onSlotChange(
          makeExpressionSlot({ functionName: 'item', slots: [makeLiteralSlot(itemPath)] }),
        );
      } else if (newMode === 'static') {
        onSlotChange(makeLiteralSlot(literalValue));
      } else if (newMode === 'options') {
        onSlotChange(makeLiteralSlot(selectedOption));
      }
      // 'expression' is not reachable via primary toggle — handled by inline link
    },
    [sourcePath, literalValue, selectedOption, itemPath, onSlotChange],
  );

  // -------------------------------------------------------------------------
  // Source mode handlers
  // -------------------------------------------------------------------------

  const handleSourcePathChange = useCallback(
    (path: string) => {
      setSourcePath(path);
      onSlotChange(makeSourceSlot(path));
    },
    [onSlotChange],
  );

  // -------------------------------------------------------------------------
  // Item mode handlers
  // -------------------------------------------------------------------------

  const handleItemPathChange = useCallback(
    (path: string) => {
      setItemPath(path);
      onSlotChange(
        makeExpressionSlot({ functionName: 'item', slots: [makeLiteralSlot(path)] }),
      );
    },
    [onSlotChange],
  );

  // -------------------------------------------------------------------------
  // Static mode handlers
  // -------------------------------------------------------------------------

  const handleLiteralChange = useCallback(
    (value: string) => {
      setLiteralValue(value);
      setHasInteracted(true);
      onSlotChange(makeLiteralSlot(value));
    },
    [onSlotChange],
  );

  const handleLiteralBlur = useCallback(() => {
    setHasInteracted(true);
  }, []);

  // -------------------------------------------------------------------------
  // Options mode handlers
  // -------------------------------------------------------------------------

  const handleOptionSelect = useCallback(
    (value: string) => {
      setSelectedOption(value);
      onSlotChange(makeLiteralSlot(value));
    },
    [onSlotChange],
  );

  // -------------------------------------------------------------------------
  // Expression mode handlers
  // -------------------------------------------------------------------------

  const handleExpressionLinkClick = useCallback(() => {
    const text = serializeSlotToText(slot);
    setExpressionText(text);
    setCurrentMode('expression');
    onSlotChange(makeLiteralSlot(text));
  }, [slot, onSlotChange]);

  const handleExpressionTextChange = useCallback((text: string) => {
    setExpressionText(text);
    onSlotChange(makeLiteralSlot(text));
  }, [onSlotChange]);

  const handleBackToSimple = useCallback(() => {
    const fallbackMode: PrimaryMode = isItemContext ? 'item' : 'source';
    setCurrentMode(fallbackMode);
    if (fallbackMode === 'item') {
      onSlotChange(
        makeExpressionSlot({ functionName: 'item', slots: [makeLiteralSlot(itemPath)] }),
      );
    } else {
      onSlotChange(makeSourceSlot(sourcePath));
    }
  }, [isItemContext, sourcePath, itemPath, onSlotChange]);

  // -------------------------------------------------------------------------
  // Source/item field filtering
  // -------------------------------------------------------------------------

  const filteredSourceOptions = (sourceOptions ?? []).filter((opt) => {
    const q = sourcePath.toLowerCase();
    return q === '' || opt.path.toLowerCase().includes(q);
  });

  const filteredItemOptions = (sourceOptions ?? []).filter((opt) => {
    const q = itemPath.toLowerCase();
    if (arrayPath !== '') {
      const normalizedArrayPath = arrayPath.startsWith('__item__:')
        ? arrayPath.slice('__item__:'.length)
        : arrayPath.startsWith('__source__:')
          ? arrayPath.slice('__source__:'.length)
          : arrayPath;
      const prefix = `${normalizedArrayPath}.`;
      const rawPath = opt.path.startsWith('__item__:')
        ? opt.path.slice('__item__:'.length)
        : opt.path.startsWith('__source__:')
          ? opt.path.slice('__source__:'.length)
          : opt.path;
      if (!rawPath.startsWith(prefix)) return false;
    }
    return q === '' || opt.path.toLowerCase().includes(q);
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const testId = testIdPrefix;

  return (
    <div
      className={[
        'rounded-md border p-3 space-y-2',
        showValidationWarning
          ? 'border-amber-700/60 bg-amber-950/20'
          : 'border-zinc-700 bg-zinc-800/40',
      ].join(' ')}
      data-testid={testId}
    >
      {/* Header: label + type badge + required indicator + optional remove */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-semibold text-zinc-200"
          data-testid={`${testId}-label`}
        >
          {label}
        </span>
        <span
          className="text-xs font-mono text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-700/60"
          data-testid={`${testId}-type-badge`}
        >
          {parameter.type}
        </span>
        {parameter.required && (
          <span
            className="text-xs text-amber-400"
            aria-label="required"
            data-testid={`${testId}-required`}
          >
            *
          </span>
        )}
        {!parameter.required && (
          <span className="text-xs text-zinc-600" data-testid={`${testId}-optional`}>
            optional
          </span>
        )}
        {showValidationWarning && (
          <span
            className="text-xs text-amber-400 ml-auto"
            role="alert"
            aria-live="polite"
            data-testid={`${testId}-validation-warning`}
          >
            Required
          </span>
        )}
        {onRemove !== undefined && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove argument ${parameter.name}`}
            className="ml-auto text-zinc-500 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded p-0.5"
            data-testid={`${testId}-remove`}
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Description */}
      {description !== undefined && description !== '' && (
        <p
          className="text-[11px] text-zinc-400"
          data-testid={`${testId}-description`}
        >
          {description}
        </p>
      )}

      {/* Primary mode toggle — not shown when in expression mode */}
      {currentMode !== 'expression' && (
        <div className="space-y-1.5">
          <div
            role="group"
            aria-label={`Input mode for ${label}`}
            className="inline-flex rounded border border-zinc-700 overflow-hidden text-xs"
            data-testid={`${testId}-mode-toggle`}
          >
            {/* Source mode button */}
            {showSourceMode && (
              <button
                type="button"
                role="radio"
                aria-checked={currentMode === 'source'}
                onClick={() => { handleModeChange('source'); }}
                className={[
                  'px-2.5 py-1 font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                  currentMode === 'source'
                    ? 'bg-blue-700 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
                ].join(' ')}
                data-testid={`${testId}-mode-source`}
              >
                Source
              </button>
            )}

            {/* Item mode button (replaces Source in array context) */}
            {showItemMode && (
              <button
                type="button"
                role="radio"
                aria-checked={currentMode === 'item'}
                onClick={() => { handleModeChange('item'); }}
                className={[
                  'px-2.5 py-1 font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                  currentMode === 'item'
                    ? 'bg-blue-700 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
                ].join(' ')}
                data-testid={`${testId}-mode-item`}
              >
                Item
              </button>
            )}

            {/* Static mode button */}
            {showStaticMode && (
              <button
                type="button"
                role="radio"
                aria-checked={currentMode === 'static'}
                onClick={() => { handleModeChange('static'); }}
                className={[
                  'px-2.5 py-1 font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                  currentMode === 'static'
                    ? 'bg-blue-700 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
                ].join(' ')}
                data-testid={`${testId}-mode-static`}
              >
                Static
              </button>
            )}

            {/* Options mode button (only when hint exists) */}
            {showOptionsMode && (
              <button
                type="button"
                role="radio"
                aria-checked={currentMode === 'options'}
                onClick={() => { handleModeChange('options'); }}
                className={[
                  'px-2.5 py-1 font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                  currentMode === 'options'
                    ? 'bg-blue-700 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
                ].join(' ')}
                data-testid={`${testId}-mode-options`}
              >
                Options
              </button>
            )}

            {/* External chip — disabled/coming-soon */}
            {showExternal !== false && (
              <span
                role="radio"
                aria-checked={false}
                aria-disabled="true"
                title="External data sources — available in a future release"
                className="px-2.5 py-1 font-medium bg-zinc-800 text-zinc-600 opacity-50 cursor-not-allowed select-none"
                data-testid={`${testId}-mode-external`}
              >
                External
              </span>
            )}
          </div>

          {/* "Use advanced expression" inline secondary link */}
          <div>
            <button
              type="button"
              onClick={handleExpressionLinkClick}
              className="text-[11px] text-zinc-500 hover:text-blue-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
              data-testid={`${testId}-expression-link`}
            >
              Use advanced expression
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Source mode content                                                  */}
      {/* ------------------------------------------------------------------ */}
      {currentMode === 'source' && (
        <div className="relative" data-testid={`${testId}-source-content`}>
          <input
            type="text"
            value={sourcePath}
            onChange={(e) => {
              handleSourcePathChange(e.target.value);
              setSourcePickerOpen(true);
            }}
            onFocus={() => { setSourcePickerOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSourcePickerOpen(false);
              if (e.key === 'ArrowDown') setSourcePickerOpen(true);
            }}
            placeholder={placeholder ?? 'Field path…'}
            aria-label={`${label} source field path`}
            aria-expanded={sourcePickerOpen && filteredSourceOptions.length > 0}
            aria-controls={`${testId}-source-options`}
            role="combobox"
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            data-testid={`${testId}-source-input`}
          />

          {sourcePickerOpen && filteredSourceOptions.length > 0 && (
            <div
              id={`${testId}-source-options`}
              role="listbox"
              className="absolute left-0 right-0 top-full mt-1 z-30 max-h-44 overflow-y-auto rounded border border-zinc-600 bg-zinc-900 p-1 shadow-xl"
              data-testid={`${testId}-source-suggestions`}
            >
              {filteredSourceOptions.slice(0, 50).map((opt) => (
                <button
                  key={opt.path}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); }}
                  onClick={() => {
                    handleSourcePathChange(opt.path);
                    setSourcePickerOpen(false);
                  }}
                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none"
                  data-testid={`${testId}-source-option-${opt.path}`}
                >
                  <SourceFieldOptionRow
                    path={opt.path}
                    type={opt.type}
                    testValue={resolveFieldTestValue(sourceData, opt.path)}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Item mode content                                                    */}
      {/* ------------------------------------------------------------------ */}
      {currentMode === 'item' && (
        <div className="relative" data-testid={`${testId}-item-content`}>
          <input
            type="text"
            value={itemPath}
            onChange={(e) => {
              handleItemPathChange(e.target.value);
              setItemPickerOpen(true);
            }}
            onFocus={() => { setItemPickerOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setItemPickerOpen(false);
              if (e.key === 'ArrowDown') setItemPickerOpen(true);
            }}
            placeholder={placeholder ?? 'Item field path…'}
            aria-label={`${label} item field path`}
            aria-expanded={itemPickerOpen && filteredItemOptions.length > 0}
            aria-controls={`${testId}-item-options`}
            role="combobox"
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            data-testid={`${testId}-item-input`}
          />

          {itemPickerOpen && filteredItemOptions.length > 0 && (
            <div
              id={`${testId}-item-options`}
              role="listbox"
              className="absolute left-0 right-0 top-full mt-1 z-30 max-h-44 overflow-y-auto rounded border border-zinc-600 bg-zinc-900 p-1 shadow-xl"
              data-testid={`${testId}-item-suggestions`}
            >
              {filteredItemOptions.slice(0, 50).map((opt) => (
                <button
                  key={opt.path}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); }}
                  onClick={() => {
                    handleItemPathChange(opt.path);
                    setItemPickerOpen(false);
                  }}
                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none"
                  data-testid={`${testId}-item-option-${opt.path}`}
                >
                  <SourceFieldOptionRow
                    path={opt.path}
                    type={opt.type}
                    testValue={resolveFieldTestValue(sourceData, opt.path)}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Static mode content                                                  */}
      {/* ------------------------------------------------------------------ */}
      {currentMode === 'static' && (
        <div data-testid={`${testId}-static-content`}>
          <input
            type="text"
            value={literalValue}
            onChange={(e) => { handleLiteralChange(e.target.value); }}
            onBlur={handleLiteralBlur}
            placeholder={
              placeholder ??
              (parameter.type === 'number'
                ? 'Enter a number…'
                : parameter.required
                  ? 'Enter a value…'
                  : 'Leave empty for blank value')
            }
            aria-label={`${label} value`}
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            data-testid={`${testId}-static-input`}
          />

          {/* Optional empty: subtle hint that empty = blank string (AE-07) */}
          {!parameter.required && literalValue === '' && (
            <p className="mt-1 text-[11px] text-zinc-500" data-testid={`${testId}-empty-hint`}>
              Empty = blank text (empty string)
            </p>
          )}

          {/* Required + interacted + empty: softer helper text instead of amber badge (AE-08) */}
          {parameter.required && hasInteracted && literalValue === '' && (
            <p
              className="mt-1 text-[11px] text-zinc-400"
              data-testid={`${testId}-intentional-blank-hint`}
            >
              Leave blank to use an empty string
            </p>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Options mode content                                                 */}
      {/* ------------------------------------------------------------------ */}
      {currentMode === 'options' && options !== undefined && (
        <div className="space-y-2" data-testid={`${testId}-options-content`}>
          {/* Custom value indicator (AE-10) */}
          {isCustomValue && (
            <div
              className="flex items-center gap-2 rounded bg-zinc-700/40 border border-zinc-600 px-2 py-1.5"
              data-testid={`${testId}-custom-value-indicator`}
            >
              <span className="text-[11px] text-zinc-400">
                Custom:
              </span>
              <span
                className="text-[11px] font-mono text-zinc-200 flex-1 truncate"
                data-testid={`${testId}-custom-value-text`}
              >
                {slot.mode === 'literal' ? slot.value : ''}
              </span>
              <button
                type="button"
                onClick={() => { handleOptionSelect(options.values[0] ?? ''); }}
                className="text-[11px] text-blue-400 hover:text-blue-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded shrink-0"
                data-testid={`${testId}-use-preset`}
              >
                Use a preset instead
              </button>
            </div>
          )}

          {/* Chip list (≤ 6 values) */}
          {options.display === 'chips' && (
            <OptionsChipList
              values={options.values}
              selected={selectedOption}
              onSelect={handleOptionSelect}
              testIdPrefix={testId}
            />
          )}

          {/* Searchable dropdown (> 6 values) */}
          {options.display === 'dropdown' && (
            <OptionsDropdown
              values={options.values}
              selected={selectedOption}
              onSelect={handleOptionSelect}
              label={label}
              testIdPrefix={testId}
            />
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Expression mode content                                              */}
      {/* ------------------------------------------------------------------ */}
      {currentMode === 'expression' && (
        <div className="space-y-1.5" data-testid={`${testId}-expression-content`}>
          <textarea
            value={expressionText}
            onChange={(e) => { handleExpressionTextChange(e.target.value); }}
            placeholder="Enter expression…"
            aria-label={`${label} expression`}
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 resize-none"
            data-testid={`${testId}-expression-input`}
          />
          <button
            type="button"
            onClick={handleBackToSimple}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded px-1.5 py-0.5 border border-dashed border-zinc-700 hover:border-zinc-500"
            data-testid={`${testId}-back-to-simple`}
          >
            Back to simple input
          </button>
        </div>
      )}
    </div>
  );
}
