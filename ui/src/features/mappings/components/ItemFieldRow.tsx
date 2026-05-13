/**
 * ItemFieldRow.tsx — FS-043 T-07 / T-09 / T-11
 *
 * Single item field row within the item template layer.
 *
 * Collapsed state:
 *   - Target field name + type badge + required indicator
 *   - Status dot: unmapped (gray), mapped (green), error (red), incomplete (muted)
 *   - One-line expression summary
 *
 * Expanded state:
 *   - Logic type selector: Item field | Root source | Static | Cross-array Lookup
 *   - Field picker / static input / CrossArrayLookupEditor depending on selection
 *   - Generates: item("field"), source("field"), static literal, or lookup DSL
 *   - Validation message when error or incomplete
 *
 * Design decision: does NOT reuse ChainBuilder for the source entry because
 * the chain decomposer only handles source() references. Instead, this
 * component owns the scope-aware source selection and generates the correct
 * DSL expression directly.
 */

import { ChevronDown, ChevronRight, Check, Circle, AlertCircle, Database, Search, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { CrossArrayLookupEditor } from './CrossArrayLookupEditor';
import { LogicStepList } from './LogicStepList';
import type { ItemFieldMapping, CrossArrayLookupState } from '../lib/array-builder-state';
import { createEmptyCrossArrayLookup } from '../lib/array-builder-state';
import type { ArrayValidationEntry } from '../lib/array-validation';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type { SchemaPathEntry } from '../lib/autocomplete-utils';
import {
  createEmptyChainState,
  createEmptyConditionStep,
  createEmptyTransformStep,
  createEmptyValueMapStep,
} from '../lib/chain-builder-state';
import type { ChainBuilderState, LogicStep } from '../lib/chain-builder-state';
import { generateExpressionFromChain } from '../lib/chain-expression-generator';

import type { ParsedSchema, SchemaNodeType } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ItemFieldScope = 'item' | 'source' | 'static';

/** Top-level logic type for a field row. */
export type ItemFieldLogicType = 'source' | 'static' | 'external' | 'expression' | 'crossArrayLookup';

export interface ItemFieldRowProps {
  /** Target field name (leaf, e.g. "id", "name"). */
  readonly fieldName: string;
  /** Full dot-path of the target field (e.g. "orders[].id"). */
  readonly fieldPath: string;
  /** JSON Schema type of the target field. */
  readonly fieldType: SchemaNodeType;
  /** Whether the target field is required. */
  readonly isRequired: boolean;
  /** Whether this row is currently expanded. */
  readonly isExpanded: boolean;
  /** Current field mapping state. */
  readonly mapping: ItemFieldMapping;
  /** Parsed source schema — used for source field picker. */
  readonly parsedSourceSchema: ParsedSchema | null;
  /**
   * Item-level field paths from the source array item schema.
   * Used when scope is 'item'.
   */
  readonly itemFieldPaths: readonly string[];
  /** Whether parent scope is available (nested array context — T-10). */
  readonly hasParentScope?: boolean;
  /**
   * T-11: Validation entries for this field.
   * Drives the status indicator (incomplete = muted, error = red).
   */
  readonly validationEntries?: readonly ArrayValidationEntry[];
  /** Fires when the user expands/collapses this row. */
  readonly onToggleExpand: (fieldPath: string) => void;
  /** Fires when the mapping changes. */
  readonly onMappingChange: (fieldPath: string, mapping: ItemFieldMapping) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scopeFromMapping(mapping: ItemFieldMapping): ItemFieldScope {
  if (mapping.kind !== 'chain') return 'item';
  const { source } = mapping.chainState;
  if (source.kind === 'static') return 'static';
  if (source.kind === 'field') {
    // Distinguish item() vs source() by the path prefix convention:
    // We store the full DSL call as the path for item/source disambiguation.
    // item refs are stored as `item:fieldPath`, source refs as `source:fieldPath`.
    if (source.path.startsWith('__item__:')) return 'item';
    if (source.path.startsWith('__source__:')) return 'source';
    // Legacy / unknown — default to item
    return 'item';
  }
  return 'item';
}

function logicTypeFromMapping(mapping: ItemFieldMapping): ItemFieldLogicType {
  if (mapping.kind === 'crossArrayLookup') return 'crossArrayLookup';
  if (mapping.kind === 'expression') return 'expression';
  const scope = scopeFromMapping(mapping);
  return scope === 'static' ? 'static' : 'source';
}

function fieldPathFromMapping(mapping: ItemFieldMapping): string {
  if (mapping.kind !== 'chain') return '';
  const { source } = mapping.chainState;
  if (source.kind !== 'field') return '';
  if (source.path.startsWith('__item__:')) return source.path.slice('__item__:'.length);
  if (source.path.startsWith('__source__:')) return source.path.slice('__source__:'.length);
  return source.path;
}

function staticValueFromMapping(mapping: ItemFieldMapping): string {
  if (mapping.kind !== 'chain') return '';
  const { source } = mapping.chainState;
  if (source.kind !== 'static') return '';
  const v = source.value;
  if (v.type === 'null') return 'null';
  if (v.type === 'boolean') return String(v.value);
  return String((v as { value: unknown }).value ?? '');
}

function expressionDslFromMapping(mapping: ItemFieldMapping): string {
  if (mapping.kind !== 'expression') return '';
  return mapping.dsl;
}

function sourceScopeFromMapping(mapping: ItemFieldMapping): Exclude<ItemFieldScope, 'static'> {
  if (mapping.kind !== 'chain') return 'item';
  const { source } = mapping.chainState;
  if (source.kind !== 'field') return 'item';
  if (source.path.startsWith('__source__:')) return 'source';
  return 'item';
}

function toMappingPrefix(scope: Exclude<ItemFieldScope, 'static'>): string {
  return scope === 'item' ? '__item__:' : '__source__:';
}

type UnifiedSourceOption = {
  readonly path: string;
  readonly scope: Exclude<ItemFieldScope, 'static'>;
};

function buildUnifiedSourceOptions(
  itemPaths: readonly string[],
  sourcePaths: readonly string[],
): UnifiedSourceOption[] {
  const results: UnifiedSourceOption[] = [];
  const seen = new Set<string>();

  for (const path of itemPaths) {
    if (!path.trim()) continue;
    const key = `item:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ path, scope: 'item' });
  }

  for (const path of sourcePaths) {
    if (!path.trim()) continue;
    const key = `source:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ path, scope: 'source' });
  }

  return results;
}

function normalizeScopedSourceCalls(expression: string): string {
  return expression
    .replace(/source\("__item__:(.*?)"\)/g, 'item("$1")')
    .replace(/source\("__source__:(.*?)"\)/g, 'source("$1")');
}

/**
 * Builds an ItemFieldMapping from scope + field/value selection.
 * Uses a path prefix convention to preserve scope in ChainState.source.
 */
function buildMapping(
  fieldPath: string,
  scope: ItemFieldScope,
  fieldOrValue: string,
): ItemFieldMapping {
  if (!fieldOrValue.trim()) {
    return { kind: 'empty', targetFieldPath: fieldPath };
  }
  if (scope === 'static') {
    return {
      kind: 'chain',
      targetFieldPath: fieldPath,
      chainState: {
        source: {
          kind: 'static',
          value: { type: 'string', value: fieldOrValue },
        },
        steps: [],
      },
    };
  }
  // item or source — store with prefix so we can recover scope later
  const prefix = scope === 'item' ? '__item__:' : '__source__:';
  return {
    kind: 'chain',
    targetFieldPath: fieldPath,
    chainState: {
      source: { kind: 'field', path: `${prefix}${fieldOrValue}` },
      steps: [],
    },
  };
}

const TYPE_BADGE_CLASSES: Partial<Record<SchemaNodeType, string>> = {
  string: 'bg-sky-900/50 text-sky-300',
  number: 'bg-violet-900/50 text-violet-300',
  boolean: 'bg-amber-900/50 text-amber-300',
  object: 'bg-slate-700 text-slate-300',
  array: 'bg-amber-900/50 text-amber-300',
};

// ---------------------------------------------------------------------------
// Sub-component: StatusDot
// ---------------------------------------------------------------------------

function StatusDot({
  mapping,
  validationEntries = [],
}: {
  mapping: ItemFieldMapping;
  validationEntries?: readonly ArrayValidationEntry[];
}) {
  const hasError = validationEntries.some((e) => e.severity === 'error');
  const hasIncomplete = validationEntries.some((e) => e.severity === 'incomplete');

  if (hasError) {
    return (
      <AlertCircle
        size={10}
        className="shrink-0 text-red-400"
        aria-label="Validation error"
      />
    );
  }
  if (mapping.kind === 'empty') {
    if (hasIncomplete) {
      return <Circle size={10} className="shrink-0 text-slate-500" aria-label="Incomplete — required field not mapped" />;
    }
    return <Circle size={10} className="shrink-0 text-slate-600" aria-label="Unmapped" />;
  }
  return <Check size={10} className="shrink-0 text-green-400" aria-label="Mapped" />;
}

// ---------------------------------------------------------------------------
// Sub-component: LogicTypeSelector
// ---------------------------------------------------------------------------

const LOGIC_TYPE_OPTIONS: { value: ItemFieldLogicType; label: string; isHelper?: boolean; disabled?: boolean; tooltip?: string }[] = [
  { value: 'source', label: 'Source' },
  { value: 'static', label: 'Static' },
  {
    value: 'external',
    label: 'External',
    disabled: true,
    tooltip: 'External data sources - available in a future release',
  },
  { value: 'expression', label: 'Function expression' },
  { value: 'crossArrayLookup', label: 'Cross-array Lookup', isHelper: true },
];

function LogicTypeSelector({
  logicType,
  onChange,
}: {
  logicType: ItemFieldLogicType;
  onChange: (type: ItemFieldLogicType) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
        Logic type
      </span>
      <div
        role="group"
        aria-label="Logic type"
        className="flex flex-wrap gap-1"
      >
        {LOGIC_TYPE_OPTIONS.map(({ value, label, isHelper, disabled, tooltip }) => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-pressed={logicType === value}
            data-testid={`logic-type-btn-${value}`}
            title={tooltip}
            onClick={() => { onChange(value); }}
            className={[
              'inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              disabled ? 'cursor-not-allowed opacity-50' : '',
              logicType === value
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
            ].join(' ')}
          >
            {value === 'crossArrayLookup' && (
              <Search size={9} aria-hidden="true" className="shrink-0" />
            )}
            {label}
            {isHelper && logicType !== value && (
              <span className="rounded bg-violet-900/40 px-1 py-0.5 text-[8px] text-violet-400">
                helper
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ItemFieldRow({
  fieldName,
  fieldPath,
  fieldType,
  isRequired,
  isExpanded,
  mapping,
  parsedSourceSchema,
  itemFieldPaths,
  hasParentScope = false,
  validationEntries = [],
  onToggleExpand,
  onMappingChange,
  className = '',
}: ItemFieldRowProps) {
  const [logicType, setLogicType] = useState<ItemFieldLogicType>(() => logicTypeFromMapping(mapping));
  const [selectedSourceScope, setSelectedSourceScope] = useState<Exclude<ItemFieldScope, 'static'>>(
    () => sourceScopeFromMapping(mapping),
  );
  // Derive scope for chain-based logic types
  const scope: ItemFieldScope = logicType === 'static' ? 'static' : selectedSourceScope;
  const [selectedField, setSelectedField] = useState<string>(() => fieldPathFromMapping(mapping));
  const [staticValue, setStaticValue] = useState<string>(() => staticValueFromMapping(mapping));
  const [expressionDsl, setExpressionDsl] = useState<string>(() => expressionDslFromMapping(mapping));
  const [showAddLogicPicker, setShowAddLogicPicker] = useState(false);
  const [logicChainState, setLogicChainState] = useState<ChainBuilderState>(() => {
    const state = createEmptyChainState();
    if (mapping.kind === 'chain' && mapping.chainState.source.kind === 'field') {
      return {
        ...state,
        entryType: 'source',
        sourcePath: mapping.chainState.source.path,
      };
    }
    if (mapping.kind === 'chain' && mapping.chainState.source.kind === 'static') {
      return {
        ...state,
        entryType: 'static',
        staticValue: mapping.chainState.source.value,
      };
    }
    return state;
  });
  const [sourceSearch, setSourceSearch] = useState<string>(() => fieldPathFromMapping(mapping));
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const sourceInputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const sourcePaths = useMemo(
    () => parsedSourceSchema ? flattenSchemaPaths(parsedSourceSchema).map((e) => e.path) : [],
    [parsedSourceSchema],
  );

  const unifiedSourceOptions = useMemo(
    () => buildUnifiedSourceOptions(itemFieldPaths, sourcePaths),
    [itemFieldPaths, sourcePaths],
  );

  const filteredSourceOptions = useMemo(() => {
    const query = sourceSearch.trim().toLowerCase();
    if (!query) return unifiedSourceOptions;
    return unifiedSourceOptions.filter((option) => option.path.toLowerCase().includes(query));
  }, [sourceSearch, unifiedSourceOptions]);

  const typeBadgeClass = TYPE_BADGE_CLASSES[fieldType] ?? 'bg-slate-700 text-slate-400';

  const logicSourceOptions = useMemo<SchemaPathEntry[]>(() => {
    return unifiedSourceOptions.map((option) => ({
      path: `${toMappingPrefix(option.scope)}${option.path}`,
      type: 'string',
    }));
  }, [unifiedSourceOptions]);

  useEffect(() => {
    if (!showSourceDropdown) return;

    const updatePosition = () => {
      const input = sourceInputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showSourceDropdown]);

  useEffect(() => {
    if (!showSourceDropdown) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (sourceInputRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setShowSourceDropdown(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSourceDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showSourceDropdown]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleLogicTypeChange(newType: ItemFieldLogicType) {
    if (newType === 'external') {
      return;
    }
    setLogicType(newType);
    setSelectedField('');
    setStaticValue('');
    setExpressionDsl('');
    setShowAddLogicPicker(false);
    setShowSourceDropdown(false);
    if (newType === 'crossArrayLookup') {
      onMappingChange(fieldPath, {
        kind: 'crossArrayLookup',
        targetFieldPath: fieldPath,
        lookupState: createEmptyCrossArrayLookup(fieldPath),
      });
    } else {
      onMappingChange(fieldPath, { kind: 'empty', targetFieldPath: fieldPath });
    }
  }

  function handleFieldSelect(option: UnifiedSourceOption) {
    setSelectedField(option.path);
    setSourceSearch(option.path);
    setSelectedSourceScope(option.scope);
    setShowSourceDropdown(false);
    setLogicChainState((prev) => ({
      ...prev,
      entryType: 'source',
      sourcePath: `${toMappingPrefix(option.scope)}${option.path}`,
    }));
    onMappingChange(fieldPath, {
      kind: 'chain',
      targetFieldPath: fieldPath,
      chainState: {
        source: { kind: 'field', path: `${toMappingPrefix(option.scope)}${option.path}` },
        steps: [],
      },
    });
  }

  function handleStaticChange(value: string) {
    setStaticValue(value);
    setLogicChainState((prev) => ({
      ...prev,
      entryType: 'static',
      staticValue: { type: 'string', value },
    }));
    onMappingChange(fieldPath, buildMapping(fieldPath, scope, value));
  }

  function handleLookupChange(lookupState: CrossArrayLookupState) {
    onMappingChange(fieldPath, {
      kind: 'crossArrayLookup',
      targetFieldPath: fieldPath,
      lookupState,
    });
  }

  function handleExpressionChange(value: string) {
    setExpressionDsl(value);
    if (!value.trim()) {
      onMappingChange(fieldPath, { kind: 'empty', targetFieldPath: fieldPath });
      return;
    }
    onMappingChange(fieldPath, {
      kind: 'expression',
      targetFieldPath: fieldPath,
      dsl: value,
    });
  }

  function handleAddLogic(kind: 'transform' | 'condition' | 'valueMap') {
    const newStep: LogicStep =
      kind === 'transform'
        ? createEmptyTransformStep()
        : kind === 'condition'
          ? createEmptyConditionStep()
          : createEmptyValueMapStep();

    setLogicChainState((prev) => {
      const baseState: ChainBuilderState = {
        ...prev,
        entryType: logicType === 'static' ? 'static' : 'source',
        sourcePath:
          logicType === 'static'
            ? prev.sourcePath
            : `${toMappingPrefix(selectedSourceScope)}${selectedField}`,
        staticValue:
          logicType === 'static'
            ? { type: 'string', value: staticValue }
            : prev.staticValue,
      };

      const updated: ChainBuilderState = {
        ...baseState,
        logicSteps: [...baseState.logicSteps, newStep],
        expandedStepIndex: baseState.logicSteps.length,
      };

      const generated = normalizeScopedSourceCalls(generateExpressionFromChain(updated));
      if (generated.trim()) {
        setLogicType('expression');
        setExpressionDsl(generated);
        onMappingChange(fieldPath, {
          kind: 'expression',
          targetFieldPath: fieldPath,
          dsl: generated,
        });
      }

      return updated;
    });

    setShowAddLogicPicker(false);
  }

  function handleLogicStepChange(index: number, step: LogicStep) {
    setLogicChainState((prev) => {
      const updated: ChainBuilderState = {
        ...prev,
        logicSteps: prev.logicSteps.map((s, i) => (i === index ? step : s)),
      };
      const generated = normalizeScopedSourceCalls(generateExpressionFromChain(updated));
      setLogicType('expression');
      setExpressionDsl(generated);
      onMappingChange(fieldPath, {
        kind: 'expression',
        targetFieldPath: fieldPath,
        dsl: generated,
      });
      return updated;
    });
  }

  function handleLogicStepRemove(index: number) {
    setLogicChainState((prev) => {
      const updatedSteps = prev.logicSteps.filter((_, i) => i !== index);
      const updated: ChainBuilderState = {
        ...prev,
        logicSteps: updatedSteps,
        expandedStepIndex:
          prev.expandedStepIndex === index
            ? null
            : prev.expandedStepIndex !== null && prev.expandedStepIndex > index
              ? prev.expandedStepIndex - 1
              : prev.expandedStepIndex,
      };

      if (updatedSteps.length === 0) {
        const restoredScope = logicType === 'static' ? 'static' : selectedSourceScope;
        const restoredValue = logicType === 'static' ? staticValue : selectedField;
        const restoredMapping = buildMapping(fieldPath, restoredScope, restoredValue);
        onMappingChange(fieldPath, restoredMapping);
        if (restoredMapping.kind === 'chain') {
          setLogicType(restoredScope === 'static' ? 'static' : 'source');
        }
      } else {
        const generated = normalizeScopedSourceCalls(generateExpressionFromChain(updated));
        setLogicType('expression');
        setExpressionDsl(generated);
        onMappingChange(fieldPath, {
          kind: 'expression',
          targetFieldPath: fieldPath,
          dsl: generated,
        });
      }

      return updated;
    });
  }

  function handleExpandedStepIndexChange(index: number | null) {
    setLogicChainState((prev) => ({ ...prev, expandedStepIndex: index }));
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const canShowAddLogic =
    (logicType === 'source' && selectedField.trim().length > 0)
    || (logicType === 'static' && staticValue.trim().length > 0)
    || (logicType === 'expression' && expressionDsl.trim().length > 0);

  // Current lookup state (if applicable)
  const currentLookupState: CrossArrayLookupState =
    mapping.kind === 'crossArrayLookup'
      ? mapping.lookupState
      : createEmptyCrossArrayLookup(fieldPath);

  return (
    <div
      data-testid={`item-field-row-${fieldPath}`}
      className={[
        'rounded-lg border transition-colors',
        isExpanded ? 'border-slate-600 bg-slate-800/60' : 'border-slate-700 bg-slate-800/30',
        className,
      ].filter(Boolean).join(' ')}
    >
      {/* Row header */}
      <button
        type="button"
        data-testid={`item-field-toggle-${fieldPath}`}
        aria-expanded={isExpanded}
        aria-controls={`item-field-body-${fieldPath}`}
        onClick={() => { onToggleExpand(fieldPath); }}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded-lg"
      >
        {/* Expand/collapse chevron */}
        {isExpanded ? (
          <ChevronDown size={11} aria-hidden="true" className="shrink-0 text-slate-400" />
        ) : (
          <ChevronRight size={11} aria-hidden="true" className="shrink-0 text-slate-400" />
        )}

        {/* Status dot */}
        <StatusDot mapping={mapping} validationEntries={validationEntries} />

        {/* Field name */}
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200">
          {fieldName}
          {isRequired && (
            <span className="ml-0.5 text-red-400" aria-label="required">*</span>
          )}
        </span>

        {/* Type badge */}
        <span
          className={[
            'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium',
            typeBadgeClass,
          ].join(' ')}
        >
          {fieldType}
        </span>

      </button>

      {/* Expanded body */}
      {isExpanded && (
        <div
          id={`item-field-body-${fieldPath}`}
          className="space-y-3 border-t border-slate-700 px-3 pb-3 pt-3"
        >
          {/* Logic type selector */}
          <LogicTypeSelector logicType={logicType} onChange={handleLogicTypeChange} />

          {/* Cross-array lookup editor */}
          {logicType === 'crossArrayLookup' ? (
            <CrossArrayLookupEditor
              lookupState={currentLookupState}
              parsedSourceSchema={parsedSourceSchema}
              itemFieldPaths={[...itemFieldPaths]}
              hasParentScope={hasParentScope}
              onChange={handleLookupChange}
            />
          ) : logicType === 'expression' ? (
            <div className="space-y-1">
              <label
                htmlFor={`expression-input-${fieldPath}`}
                className="block text-[10px] font-medium uppercase tracking-wide text-slate-500"
              >
                Expression
              </label>
              <textarea
                id={`expression-input-${fieldPath}`}
                value={expressionDsl}
                placeholder='e.g. gt(item("discountAmount"), 0)'
                data-testid={`expression-input-${fieldPath}`}
                onChange={(e) => { handleExpressionChange(e.target.value); }}
                className="min-h-[64px] w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ) : scope === 'static' ? (
            /* Static value input */
            <div className="space-y-1">
              <label
                htmlFor={`static-input-${fieldPath}`}
                className="block text-[10px] font-medium uppercase tracking-wide text-slate-500"
              >
                Value
              </label>
              <input
                id={`static-input-${fieldPath}`}
                type="text"
                value={staticValue}
                placeholder='e.g. "active" or 42'
                data-testid={`static-input-${fieldPath}`}
                onChange={(e) => { handleStaticChange(e.target.value); }}
                className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ) : (
            /* Unified source field picker */
            <div className="space-y-1">
              <label
                htmlFor={`field-select-${fieldPath}`}
                className="block text-[10px] font-medium uppercase tracking-wide text-slate-500"
              >
                Source field
              </label>
              <input
                ref={sourceInputRef}
                type="text"
                value={sourceSearch}
                onFocus={() => { setShowSourceDropdown(true); }}
                onClick={() => { setShowSourceDropdown(true); }}
                onChange={(e) => {
                  setSourceSearch(e.target.value);
                  setShowSourceDropdown(true);
                }}
                placeholder="Search fields"
                data-testid={`field-search-${fieldPath}`}
                className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {showSourceDropdown && dropdownPosition !== null && createPortal(
                <div
                  ref={dropdownRef}
                  role="listbox"
                  aria-label="Source fields"
                  data-testid={`field-listbox-${fieldPath}`}
                  className="fixed z-[1000] max-h-56 overflow-y-auto rounded border border-slate-700 bg-slate-800 p-1 shadow-xl"
                  style={{
                    top: `${dropdownPosition.top}px`,
                    left: `${dropdownPosition.left}px`,
                    width: `${dropdownPosition.width}px`,
                  }}
                >
                  {filteredSourceOptions.length === 0 ? (
                    <p className="px-2 py-1.5 text-[11px] text-slate-500">No fields match your search.</p>
                  ) : (
                    filteredSourceOptions.map((option) => {
                      const normalizedValue = `${toMappingPrefix(option.scope)}${option.path}`;
                      const normalizedSelected = `${toMappingPrefix(selectedSourceScope)}${selectedField}`;
                      const isSelected = normalizedValue === normalizedSelected;
                      return (
                        <button
                          key={`${option.scope}:${option.path}`}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          data-testid={`field-option-${fieldPath}-${option.scope}-${option.path}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => { handleFieldSelect(option); }}
                          className={[
                            'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                            isSelected
                              ? 'bg-blue-950/50 text-blue-300 ring-1 ring-inset ring-blue-700/60'
                              : 'text-slate-300 hover:bg-slate-700/60 hover:text-slate-100',
                          ].join(' ')}
                        >
                          <Database
                            size={10}
                            aria-hidden="true"
                            className={isSelected ? 'text-blue-400 shrink-0' : 'text-slate-500 shrink-0'}
                          />
                          <span className="min-w-0 flex-1 truncate font-mono">{option.path}</span>
                          {option.scope === 'item' && (
                            <span className="shrink-0 rounded bg-blue-950/50 px-1.5 py-0.5 text-[9px] font-medium text-blue-300">
                              item
                            </span>
                          )}
                          {isSelected && (
                            <Check size={10} className="shrink-0 text-blue-400" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>,
                document.body,
              )}
            </div>
          )}

          {canShowAddLogic && logicType !== 'crossArrayLookup' && (
            <div className="space-y-2">
              {logicChainState.logicSteps.length === 0 && !showAddLogicPicker && (
                <button
                  type="button"
                  onClick={() => { setShowAddLogicPicker(true); }}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-slate-700 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                  data-testid={`item-field-add-logic-${fieldPath}`}
                >
                  <Plus size={11} aria-hidden="true" />
                  Add logic
                </button>
              )}
              {(logicChainState.logicSteps.length > 0 || showAddLogicPicker) && (
                <LogicStepList
                  steps={logicChainState.logicSteps}
                  expandedStepIndex={logicChainState.expandedStepIndex}
                  onExpandedStepIndexChange={handleExpandedStepIndexChange}
                  onStepChange={handleLogicStepChange}
                  onRemoveStep={handleLogicStepRemove}
                  onAddStep={handleAddLogic}
                  forcePickerOpen={showAddLogicPicker}
                  onPickerOpenChange={setShowAddLogicPicker}
                  sourceOptions={logicSourceOptions}
                  currentValueLabel={selectedField || 'current value'}
                />
              )}
            </div>
          )}
          {/* T-11: Validation messages */}
          {validationEntries.length > 0 && (
            <div className="space-y-1">
              {validationEntries.map((ve, i) => (
                <div
                  key={i}
                  data-testid={`validation-msg-${fieldPath}-${ve.severity}`}
                  className={[
                    'flex items-start gap-1.5 rounded px-2 py-1.5 text-[10px]',
                    ve.severity === 'error'
                      ? 'bg-red-950/40 text-red-400'
                      : ve.severity === 'warning'
                        ? 'bg-amber-950/40 text-amber-400'
                        : 'bg-slate-800/60 text-slate-500',
                  ].join(' ')}
                >
                  {ve.severity === 'error' ? (
                    <AlertCircle size={10} aria-hidden="true" className="mt-0.5 shrink-0" />
                  ) : (
                    <Circle size={10} aria-hidden="true" className="mt-0.5 shrink-0" />
                  )}
                  <span>{ve.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
