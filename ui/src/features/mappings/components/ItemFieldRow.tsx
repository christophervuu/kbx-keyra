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

import { ChevronDown, ChevronRight, Check, Circle, AlertCircle, Database, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type { ItemFieldMapping, CrossArrayLookupState } from '../lib/array-builder-state';
import { createEmptyCrossArrayLookup } from '../lib/array-builder-state';
import { CrossArrayLookupEditor, summarizeLookup } from './CrossArrayLookupEditor';
import type { ArrayValidationEntry } from '../lib/array-validation';
import type { ParsedSchema, SchemaNodeType } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ItemFieldScope = 'item' | 'source' | 'static';

/** Top-level logic type for a field row. */
export type ItemFieldLogicType = 'item' | 'source' | 'static' | 'crossArrayLookup';

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

function expressionSummary(mapping: ItemFieldMapping): string {
  if (mapping.kind === 'empty') return '';
  if (mapping.kind === 'crossArrayLookup') return summarizeLookup(mapping.lookupState);
  const { chainState } = mapping;
  if (chainState.source.kind === 'none') return '';
  if (chainState.source.kind === 'static') {
    const v = chainState.source.value;
    if (v.type === 'null') return 'null';
    if (v.type === 'boolean') return String(v.value);
    return String((v as { value: unknown }).value ?? '');
  }
  // field source — path is the full DSL expression (item("x") or source("x"))
  return chainState.source.path;
}

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
  return scopeFromMapping(mapping);
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

/**
 * Generates the DSL expression for a given scope + field/value.
 * Uses internal path prefixes to track scope in ChainState.source.path.
 */
function buildExpression(scope: ItemFieldScope, fieldOrValue: string): string {
  switch (scope) {
    case 'item':
      return fieldOrValue ? `item("${fieldOrValue}")` : '';
    case 'source':
      return fieldOrValue ? `source("${fieldOrValue}")` : '';
    case 'static':
      return fieldOrValue ? `static("${fieldOrValue}")` : '';
  }
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

const LOGIC_TYPE_OPTIONS: { value: ItemFieldLogicType; label: string; isHelper?: boolean }[] = [
  { value: 'item', label: 'Item field' },
  { value: 'source', label: 'Root source' },
  { value: 'static', label: 'Static' },
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
        {LOGIC_TYPE_OPTIONS.map(({ value, label, isHelper }) => (
          <button
            key={value}
            type="button"
            aria-pressed={logicType === value}
            data-testid={`logic-type-btn-${value}`}
            onClick={() => { onChange(value); }}
            className={[
              'inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
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
  // Derive scope for chain-based logic types
  const scope: ItemFieldScope = logicType === 'crossArrayLookup' ? 'item' : logicType;
  const [selectedField, setSelectedField] = useState<string>(() => fieldPathFromMapping(mapping));
  const [staticValue, setStaticValue] = useState<string>(() => staticValueFromMapping(mapping));

  const sourcePaths = useMemo(
    () => parsedSourceSchema ? flattenSchemaPaths(parsedSourceSchema).map((e) => e.path) : [],
    [parsedSourceSchema],
  );

  const summary = expressionSummary(mapping);
  const isMapped = mapping.kind !== 'empty';
  const typeBadgeClass = TYPE_BADGE_CLASSES[fieldType] ?? 'bg-slate-700 text-slate-400';

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleLogicTypeChange(newType: ItemFieldLogicType) {
    setLogicType(newType);
    setSelectedField('');
    setStaticValue('');
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

  function handleFieldSelect(field: string) {
    setSelectedField(field);
    onMappingChange(fieldPath, buildMapping(fieldPath, scope, field));
  }

  function handleStaticChange(value: string) {
    setStaticValue(value);
    onMappingChange(fieldPath, buildMapping(fieldPath, scope, value));
  }

  function handleLookupChange(lookupState: CrossArrayLookupState) {
    onMappingChange(fieldPath, {
      kind: 'crossArrayLookup',
      targetFieldPath: fieldPath,
      lookupState,
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const fieldOptions = scope === 'item' ? [...itemFieldPaths] : sourcePaths;

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

        {/* Expression summary when collapsed */}
        {!isExpanded && isMapped && (
          <span
            data-testid={`item-field-summary-${fieldPath}`}
            className="ml-1 max-w-[120px] truncate font-mono text-[10px] text-slate-400"
            title={summary}
          >
            {summary}
          </span>
        )}
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
            /* Item / Source field picker */
            <div className="space-y-1">
              <label
                htmlFor={`field-select-${fieldPath}`}
                className="block text-[10px] font-medium uppercase tracking-wide text-slate-500"
              >
                {scope === 'item' ? 'Item field' : 'Source field'}
              </label>
              {fieldOptions.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  {scope === 'item'
                    ? 'No item fields available. Configure source array first.'
                    : 'Load a source schema to see available fields.'}
                </p>
              ) : (
                <div
                  role="listbox"
                  aria-label={scope === 'item' ? 'Item fields' : 'Source fields'}
                  data-testid={`field-listbox-${fieldPath}`}
                  className="max-h-36 overflow-y-auto rounded border border-slate-700 bg-slate-800/60 p-1"
                >
                  {fieldOptions.map((path) => (
                    <button
                      key={path}
                      type="button"
                      role="option"
                      aria-selected={path === selectedField}
                      data-testid={`field-option-${fieldPath}-${path}`}
                      onClick={() => { handleFieldSelect(path); }}
                      className={[
                        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                        path === selectedField
                          ? 'bg-blue-950/50 text-blue-300 ring-1 ring-inset ring-blue-700/60'
                          : 'text-slate-300 hover:bg-slate-700/60 hover:text-slate-100',
                      ].join(' ')}
                    >
                      <Database
                        size={10}
                        aria-hidden="true"
                        className={path === selectedField ? 'text-blue-400 shrink-0' : 'text-slate-500 shrink-0'}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono">{path}</span>
                      {path === selectedField && (
                        <Check size={10} className="shrink-0 text-blue-400" aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Generated expression preview (chain-based only) */}
          {isMapped && logicType !== 'crossArrayLookup' && (
            <div className="rounded border border-slate-700 bg-slate-900/60 px-2.5 py-1.5">
              <span className="block text-[9px] font-medium uppercase tracking-wide text-slate-600 mb-0.5">
                Expression
              </span>
              <span
                data-testid={`item-field-expression-${fieldPath}`}
                className="font-mono text-[11px] text-green-300"
              >
                {buildExpression(
                  scope,
                  scope === 'static' ? staticValue : selectedField,
                )}
              </span>
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
