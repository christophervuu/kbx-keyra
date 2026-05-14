/**
 * ValueEntryEditor.tsx — FS-043 T-05
 *
 * Single value entry editor for Build from Values mode.
 *
 * Renders either:
 *   - Object entry: per-field collapsible logic rows (ItemFieldRow parity)
 *   - Primitive entry: single source/static input
 *
 * Each field value can be:
 *   - sourceField: source("path") reference
 *   - static: literal value (string/number/boolean/null)
 *   - expression: legacy raw DSL value (read-only compatibility path)
 *   - empty: not yet configured
 */

import { useCallback, useMemo, useState } from 'react';

import { ItemFieldRow } from './ItemFieldRow';
import type { ValueEntry, ValueEntryFieldValue } from '../lib/array-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import { generateChainExpression } from '../lib/chain-expression-generator';
import { generateCrossArrayLookup } from '../lib/array-expression-generator';
import type { ItemFieldMapping } from '../lib/array-builder-state';
import type { SchemaNodeType } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValueEntryEditorProps {
  readonly entry: ValueEntry;
  readonly entryIndex: number;
  /** Target item fields for object entries. Empty for primitive entries. */
  readonly targetItemFields: readonly { name: string; type?: SchemaNodeType; isRequired?: boolean }[];
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly onChange: (entry: ValueEntry) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FieldValueKind = 'sourceField' | 'static' | 'expression' | 'empty';

function getFieldValueKind(value: ValueEntryFieldValue): FieldValueKind {
  return value.kind;
}

function getFieldValueText(value: ValueEntryFieldValue): string {
  switch (value.kind) {
    case 'sourceField': return value.path;
    case 'static':
      if (value.value.type === 'null') return 'null';
      if (value.value.type === 'boolean') return String(value.value.value);
      return String((value.value as { value: unknown }).value ?? '');
    case 'expression': return value.dsl;
    case 'empty': return '';
  }
}

function makeFieldValue(kind: FieldValueKind, text: string): ValueEntryFieldValue {
  switch (kind) {
    case 'sourceField':
      return { kind: 'sourceField', path: text };
    case 'static': {
      // Infer type from text
      if (text === 'null') return { kind: 'static', value: { type: 'null' } };
      if (text === 'true') return { kind: 'static', value: { type: 'boolean', value: true } };
      if (text === 'false') return { kind: 'static', value: { type: 'boolean', value: false } };
      const num = Number(text);
      if (text.trim() !== '' && isFinite(num)) {
        return { kind: 'static', value: { type: 'number', value: num } };
      }
      return { kind: 'static', value: { type: 'string', value: text } };
    }
    case 'expression':
      return { kind: 'expression', dsl: text };
    case 'empty':
      return { kind: 'empty' };
  }
}

function normalizeScopedSourceCalls(expression: string): string {
  return expression
    .replace(/source\("__item__:(.*?)"\)/g, 'item("$1")')
    .replace(/source\("__source__:(.*?)"\)/g, 'source("$1")');
}

function toItemFieldMapping(fieldPath: string, value: ValueEntryFieldValue): ItemFieldMapping {
  switch (value.kind) {
    case 'empty':
      return { kind: 'empty', targetFieldPath: fieldPath };
    case 'sourceField':
      return {
        kind: 'chain',
        targetFieldPath: fieldPath,
        chainState: {
          source: { kind: 'field', path: `__source__:${value.path}` },
          steps: [],
        },
      };
    case 'static':
      return {
        kind: 'chain',
        targetFieldPath: fieldPath,
        chainState: {
          source: { kind: 'static', value: value.value },
          steps: [],
        },
      };
    case 'expression':
      return { kind: 'expression', targetFieldPath: fieldPath, dsl: value.dsl };
  }
}

function toValueEntryFieldValue(mapping: ItemFieldMapping): ValueEntryFieldValue {
  if (mapping.kind === 'empty') return { kind: 'empty' };
  if (mapping.kind === 'expression') return { kind: 'expression', dsl: mapping.dsl };
  if (mapping.kind === 'crossArrayLookup') {
    return { kind: 'expression', dsl: generateCrossArrayLookup(mapping.lookupState) };
  }

  const source = mapping.chainState.source;
  const chainStateWithLogic = mapping.chainState as { logicSteps?: unknown[] };
  if (Array.isArray(chainStateWithLogic.logicSteps) && chainStateWithLogic.logicSteps.length > 0) {
    return {
      kind: 'expression',
      dsl: normalizeScopedSourceCalls(generateChainExpression(mapping.chainState)),
    };
  }
  if (source.kind === 'static') {
    return { kind: 'static', value: source.value };
  }
  if (source.kind === 'field') {
    if (source.path.startsWith('__source__:')) {
      return { kind: 'sourceField', path: source.path.slice('__source__:'.length) };
    }
    if (source.path.startsWith('__item__:')) {
      return { kind: 'sourceField', path: source.path.slice('__item__:'.length) };
    }
    return { kind: 'sourceField', path: source.path };
  }
  return { kind: 'empty' };
}

function getInputAriaLabel(kind: FieldValueKind, label: string): string {
  if (kind === 'sourceField') return `Source field for ${label}`;
  if (kind === 'expression') return `Expression for ${label}`;
  return `Static value for ${label}`;
}

function getInputPlaceholder(kind: FieldValueKind): string {
  if (kind === 'expression') return 'DSL expression…';
  return 'e.g. active';
}

// ---------------------------------------------------------------------------
// Sub-component: FieldValueInput
// ---------------------------------------------------------------------------

function FieldValueInput({
  label,
  value,
  parsedSourceSchema,
  onChange,
  testIdSuffix,
}: {
  label: string;
  value: ValueEntryFieldValue;
  parsedSourceSchema: ParsedSchema | null;
  onChange: (value: ValueEntryFieldValue) => void;
  testIdSuffix: string;
}) {
  const kind = getFieldValueKind(value);
  const text = getFieldValueText(value);

  const sourcePaths = parsedSourceSchema
    ? flattenSchemaPaths(parsedSourceSchema).map((e) => e.path)
    : [];

  const KINDS: FieldValueKind[] = ['sourceField', 'static'];
  const KIND_LABELS: Record<FieldValueKind, string> = {
    sourceField: 'Source',
    static: 'Static',
    expression: 'Expr',
    empty: 'Empty',
  };

  function handleKindChange(newKind: FieldValueKind) {
    onChange(makeFieldValue(newKind, ''));
  }

  function handleTextChange(newText: string) {
    onChange(makeFieldValue(kind === 'empty' ? 'static' : kind, newText));
  }

  const showLegacyExpressionEditor = kind === 'expression';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="block text-[10px] font-medium text-slate-400 truncate max-w-[120px]" title={label}>
          {label}
        </label>
        <div
          role="group"
          aria-label={`Value kind for ${label}`}
          className="inline-flex overflow-hidden rounded border border-slate-700"
        >
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              data-testid={`value-kind-${k}-${testIdSuffix}`}
              onClick={() => { handleKindChange(k); }}
              className={[
                'px-1.5 py-0.5 text-[9px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
                kind === k
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300',
              ].join(' ')}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={false}
            aria-disabled="true"
            data-testid={`value-kind-external-${testIdSuffix}`}
            title="External - available later"
            className={[
              'cursor-not-allowed px-1.5 py-0.5 text-[9px] font-medium opacity-60',
              'bg-slate-800 text-slate-500',
            ].join(' ')}
          >
            External
          </button>
        </div>
      </div>

      {kind === 'sourceField' ? (
        <select
          value={text}
          aria-label={`Source field for ${label}`}
          data-testid={`value-source-${testIdSuffix}`}
          onChange={(e) => { onChange({ kind: 'sourceField', path: e.target.value }); }}
          className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select source field…</option>
          {sourcePaths.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      ) : (
        <>
          {showLegacyExpressionEditor && (
            <p
              data-testid={`value-expression-legacy-note-${testIdSuffix}`}
              className="text-[10px] text-amber-400"
            >
              Legacy expression value. Switch to Source or Static to update.
            </p>
          )}
          <input
            type="text"
            value={text}
            placeholder={getInputPlaceholder(kind)}
            aria-label={getInputAriaLabel(kind, label)}
            data-testid={`value-text-${testIdSuffix}`}
            onChange={(e) => { handleTextChange(e.target.value); }}
            className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ValueEntryEditor({
  entry,
  entryIndex,
  targetItemFields,
  parsedSourceSchema,
  onChange,
  className = '',
}: ValueEntryEditorProps) {
  const [expandedFieldPath, setExpandedFieldPath] = useState<string | null>(null);

  const handlePrimitiveChange = useCallback(
    (value: ValueEntryFieldValue) => {
      onChange({ kind: 'primitive', value });
    },
    [onChange],
  );

  const handleObjectFieldChange = useCallback(
    (fieldName: string, value: ValueEntryFieldValue) => {
      if (entry.kind !== 'object') return;
      onChange({
        kind: 'object',
        fields: { ...entry.fields, [fieldName]: value },
      });
    },
    [entry, onChange],
  );

  if (entry.kind === 'primitive') {
    return (
      <div
        data-testid={`value-entry-editor-${entryIndex}`}
        className={className}
      >
        <FieldValueInput
          label="Value"
          value={entry.value}
          parsedSourceSchema={parsedSourceSchema}
          onChange={handlePrimitiveChange}
          testIdSuffix={`${entryIndex}-value`}
        />
      </div>
    );
  }

  // Object entry
  const fields = useMemo(() => {
    if (targetItemFields.length > 0) {
      return targetItemFields;
    }
    return Object.keys(entry.fields).map((name) => ({ name }));
  }, [targetItemFields, entry.fields]);

  const sourceFieldPaths = useMemo(
    () => parsedSourceSchema ? flattenSchemaPaths(parsedSourceSchema).map((entryPath) => entryPath.path) : [],
    [parsedSourceSchema],
  );

  return (
    <div
      data-testid={`value-entry-editor-${entryIndex}`}
      className={['space-y-2', className].filter(Boolean).join(' ')}
    >
      {fields.map((field) => {
        const fieldName = field.name;
        const fieldPath = `entry-${entryIndex}.${fieldName}`;
        const value = entry.fields[fieldName] ?? { kind: 'empty' as const };
        const mapping = toItemFieldMapping(fieldPath, value);

        return (
          <ItemFieldRow
            key={fieldPath}
            fieldName={fieldName}
            fieldPath={fieldPath}
            fieldType={field.type ?? 'string'}
            isRequired={field.isRequired ?? false}
            isExpanded={expandedFieldPath === fieldPath}
            mapping={mapping}
            parsedSourceSchema={parsedSourceSchema}
            itemFieldPaths={sourceFieldPaths}
            onToggleExpand={(path) => {
              setExpandedFieldPath((prev) => (prev === path ? null : path));
            }}
            onMappingChange={(_path, nextMapping) => {
              handleObjectFieldChange(fieldName, toValueEntryFieldValue(nextMapping));
            }}
          />
        );
      })}
      {fields.length === 0 && (
        <p className="text-xs text-slate-500">
          No fields defined. Add target item fields to configure this entry.
        </p>
      )}
    </div>
  );
}
