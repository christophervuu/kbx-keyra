/**
 * ArgumentForm — renders a function's parameter slots from DSL catalog metadata
 * for the FS-029 Source Card expression builder (T-03).
 *
 * Responsibilities:
 *   - Looks up the function in DSL_FUNCTION_CATALOG to get parameter definitions.
 *   - Renders one ParameterValueInput per slot (FS-053 T-04).
 *   - Resolves PARAMETER_HINTS for Options mode via parameterHintToOptions.
 *   - For filter/find condition parameters, renders ConditionRowEditor directly
 *     (forceConditionEditor carve-out — not routed through ParameterValueInput).
 *   - For variadic functions, renders a [+ Add value] button to append slots.
 *   - Emits the full updated ArgumentSlot[] on every change.
 *
 * Usage:
 *   <ArgumentForm
 *     functionName="concat"
 *     slots={slots}
 *     onSlotsChange={setSlots}
 *   />
 */

import { Plus } from 'lucide-react';
import { useCallback } from 'react';

import { ParameterValueInput, parameterHintToOptions } from './ParameterValueInput';
import { ArgumentSlotInput } from './ArgumentSlotInput';
import type { SchemaPathEntry } from '../lib/autocomplete-utils';
import type { ArgumentSlot } from '../lib/expression-builder-state';
import { makeExpressionSlot, makeSourceSlot, makeLiteralSlot } from '../lib/expression-builder-state';

import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import type { FunctionCatalogEntry, FunctionCatalogParameter } from '@/lib/data/dsl-functions';
import { getParameterHint } from '@/lib/data/parameter-hints';
import type { ParameterOptions } from './ParameterValueInput';

// Re-export for consumers that previously imported from here
export type { ParameterOptions };

type PreferredInputMode = 'source' | 'literal';

interface ParameterPresentation {
  readonly label: string;
  readonly description?: string;
  readonly defaultInputMode?: PreferredInputMode;
}

type ParameterPresentationRegistry = Readonly<
  Record<string, Readonly<Record<string, ParameterPresentation>>>
>;

const PARAMETER_PRESENTATION: ParameterPresentationRegistry = {
  concat: {
    value: { label: 'Text value', description: 'First text value to combine.', defaultInputMode: 'source' },
    rest: { label: 'More text', description: 'Additional text values to append.', defaultInputMode: 'source' },
  },
  substring: {
    value: { label: 'Text', description: 'Text to slice.', defaultInputMode: 'source' },
    start: { label: 'Start position', description: '0-based index where extraction starts.' },
    end: { label: 'End position', description: 'Optional 0-based index where extraction stops (exclusive).' },
  },
  upper: {
    value: { label: 'Text to convert', defaultInputMode: 'source' },
  },
  lower: {
    value: { label: 'Text to convert', defaultInputMode: 'source' },
  },
  trim: {
    value: { label: 'Text to trim', defaultInputMode: 'source' },
  },
  replace: {
    value: { label: 'Text to search in', defaultInputMode: 'source' },
    search: { label: 'Find this text', description: 'Text to find in the source value.' },
    replacement: { label: 'Replace with', description: 'Text to use as replacement.' },
  },
  replaceAll: {
    value: { label: 'Text to search in', defaultInputMode: 'source' },
    search: { label: 'Find all occurrences of', description: 'Text to find in the source value.' },
    replacement: { label: 'Replace each with', description: 'Text to use as replacement.' },
  },
  contains: {
    haystack: { label: 'Text to search in', defaultInputMode: 'source' },
    needle: { label: 'Text to look for' },
  },
  length: {
    value: { label: 'Text', defaultInputMode: 'source' },
  },
  formatDate: {
    value: {
      label: 'Date field',
      description: 'Date value from your source data.',
      defaultInputMode: 'source',
    },
    inputFormat: {
      label: 'Current date standard',
      description: 'How the date currently looks in your source data.',
      defaultInputMode: 'literal',
    },
    outputFormat: {
      label: 'Output date format',
      description: 'How you want the final date to be written.',
      defaultInputMode: 'literal',
    },
  },
  add: {
    a: { label: 'First number', defaultInputMode: 'source' },
    b: { label: 'Add this amount' },
  },
  subtract: {
    a: { label: 'Starting value', defaultInputMode: 'source' },
    b: { label: 'Subtract this amount' },
  },
  multiply: {
    a: { label: 'First number', defaultInputMode: 'source' },
    b: { label: 'Multiply by' },
  },
  divide: {
    a: { label: 'Numerator', defaultInputMode: 'source' },
    b: { label: 'Divide by' },
  },
  round: {
    value: { label: 'Number to round', defaultInputMode: 'source' },
    decimals: { label: 'Decimal places', description: 'Number of digits after the decimal point.' },
  },
  abs: {
    value: { label: 'Number', defaultInputMode: 'source' },
  },
  if: {
    condition: { label: 'Condition', defaultInputMode: 'source' },
    then: { label: 'Value when true', defaultInputMode: 'source' },
    else: { label: 'Value when false', defaultInputMode: 'source' },
  },
  eq: {
    a: { label: 'Value', defaultInputMode: 'source' },
    b: { label: 'Must equal' },
  },
  neq: {
    a: { label: 'Value', defaultInputMode: 'source' },
    b: { label: 'Must not equal' },
  },
  gt: {
    a: { label: 'Value', defaultInputMode: 'source' },
    b: { label: 'Must be greater than' },
  },
  gte: {
    a: { label: 'Value', defaultInputMode: 'source' },
    b: { label: 'Must be at least' },
  },
  lt: {
    a: { label: 'Value', defaultInputMode: 'source' },
    b: { label: 'Must be less than' },
  },
  lte: {
    a: { label: 'Value', defaultInputMode: 'source' },
    b: { label: 'Must be no more than' },
  },
  and: {
    a: { label: 'First condition', defaultInputMode: 'source' },
    b: { label: 'Second condition', defaultInputMode: 'source' },
  },
  or: {
    a: { label: 'First condition', defaultInputMode: 'source' },
    b: { label: 'Second condition', defaultInputMode: 'source' },
  },
  not: {
    a: { label: 'Condition to flip', defaultInputMode: 'source' },
  },
  valueMap: {
    value: { label: 'Input value', defaultInputMode: 'source' },
    mappings: { label: 'Value map', description: 'Lookup object with from-to values.' },
    fallback: { label: 'Default value', description: 'Used when no map match is found.' },
  },
  map: {
    array: { label: 'Array field', defaultInputMode: 'source' },
    templateOrExpression: {
      label: 'Transform each item to',
      description: 'Expression or template used for each array item.',
      defaultInputMode: 'source',
    },
  },
  filter: {
    array: { label: 'Array field', defaultInputMode: 'source' },
    condition: { label: 'Keep items where', defaultInputMode: 'source' },
  },
  find: {
    array: { label: 'Array field', defaultInputMode: 'source' },
    condition: { label: 'Find first item where', defaultInputMode: 'source' },
  },
  array: {
    value: { label: 'First value', defaultInputMode: 'source' },
    rest: { label: 'More values', defaultInputMode: 'source' },
  },
  merge: {
    array: { label: 'First array', defaultInputMode: 'source' },
    rest: { label: 'More arrays', defaultInputMode: 'source' },
  },
  flatten: {
    array: { label: 'Nested array', defaultInputMode: 'source' },
  },
  first: {
    array: { label: 'Array field', defaultInputMode: 'source' },
  },
  nth: {
    array: { label: 'Array field', defaultInputMode: 'source' },
    index: { label: 'Position', description: '0-based position in the array.' },
  },
  join: {
    array: { label: 'Array field', defaultInputMode: 'source' },
    separator: { label: 'Separator text' },
  },
  count: {
    array: { label: 'Array field', defaultInputMode: 'source' },
  },
  get: {
    object: { label: 'Object', defaultInputMode: 'source' },
    path: { label: 'Field path', description: 'Dot path inside the object (for example: address.city).' },
  },
  default: {
    value: { label: 'Value', defaultInputMode: 'source' },
    fallback: { label: 'Use this if empty' },
  },
  coalesce: {
    value: { label: 'First option', defaultInputMode: 'source' },
    rest: { label: 'Backup options', defaultInputMode: 'source' },
  },
  isNull: {
    value: { label: 'Value to check', defaultInputMode: 'source' },
  },
  cast: {
    value: { label: 'Value to convert', defaultInputMode: 'source' },
    targetType: { label: 'Convert to type' },
  },
};

function humanizeParameterName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function getParameterPresentation(functionName: string, parameterName: string): ParameterPresentation {
  const defined = PARAMETER_PRESENTATION[functionName]?.[parameterName];
  if (defined !== undefined) return defined;
  return { label: humanizeParameterName(parameterName) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a ParameterOptions for a given (functionName, parameterName) pair
 * using the PARAMETER_HINTS registry. Returns undefined when no hint exists.
 */
function resolveOptions(functionName: string, paramName: string): ParameterOptions | undefined {
  const hint = getParameterHint(functionName, paramName);
  if (!hint) return undefined;
  return parameterHintToOptions(hint);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArgumentFormProps {
  /** The DSL function name to render slots for. */
  readonly functionName: string;
  /** Current argument slots. */
  readonly slots: readonly ArgumentSlot[];
  /**
   * Number of leading function parameters to treat as implicit and hide.
   * Used by SourceCard transforms where arg1 is the card source path.
   */
  readonly parameterOffset?: number;
  /** Fires whenever any slot changes. */
  readonly onSlotsChange: (slots: ArgumentSlot[]) => void;
  /** Source field options shown when a slot is in source mode. */
  readonly sourceOptions?: readonly SchemaPathEntry[];
  /** Optional explicit array path context for filter/find condition arguments. */
  readonly conditionArrayPathOverride?: string;
  /** Hide function name/description header when parent already renders it. */
  readonly hideFunctionHeader?: boolean;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the catalog parameter definition for a given slot index.
 * For variadic functions, slots beyond the fixed params all map to the
 * variadic parameter definition.
 */
function getParamForSlot(
  entry: FunctionCatalogEntry,
  slotIndex: number,
  parameterOffset = 0,
): FunctionCatalogParameter | undefined {
  const params = entry.parameters;
  const paramIndex = slotIndex + parameterOffset;
  if (paramIndex < params.length) return params[paramIndex];
  // Variadic: last param covers all extra slots
  const last = params[params.length - 1];
  if (last?.variadic) return last;
  return undefined;
}

/**
 * Creates a default empty slot for a given parameter definition.
 * Source mode for any-typed params, literal mode for string/number params.
 */
function makeDefaultSlot(functionName: string, param: FunctionCatalogParameter): ArgumentSlot {
  const presentation = getParameterPresentation(functionName, param.name);
  if (presentation.defaultInputMode === 'source') return makeSourceSlot('');
  if (presentation.defaultInputMode === 'literal') return makeLiteralSlot('');

  if ((functionName === 'filter' || functionName === 'find') && param.name === 'condition') {
    return makeExpressionSlot({
      functionName: 'eq',
      slots: [
        makeExpressionSlot({
          functionName: 'item',
          slots: [makeLiteralSlot('')],
        }),
        makeLiteralSlot(''),
      ],
    });
  }

  if (param.type === 'string' || param.type === 'number') {
    return makeLiteralSlot('');
  }
  return makeSourceSlot('');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders all argument slots for a DSL function, driven by catalog metadata.
 */
export function ArgumentForm({
  functionName,
  slots,
  parameterOffset = 0,
  onSlotsChange,
  sourceOptions,
  conditionArrayPathOverride,
  hideFunctionHeader = false,
  className,
}: ArgumentFormProps) {
  const entry = DSL_FUNCTION_CATALOG.find((e) => e.name === functionName);

  const computeEffectiveSlots = useCallback((): ArgumentSlot[] => {
    if (!entry) return [...slots];

    const visibleParams = entry.parameters.slice(parameterOffset);
    const requiredCount = visibleParams.filter((p) => p.required && !p.variadic).length;
    const fixedParamCount = visibleParams.filter((p) => !p.variadic).length;
    // For SourceCard transform-step forms (parameterOffset > 0), include optional
    // fixed params so users can configure values like round(..., decimals).
    const minimumCount = parameterOffset > 0 ? fixedParamCount : requiredCount;
    const effective: ArgumentSlot[] = [...slots];

    while (effective.length < minimumCount) {
      const param = getParamForSlot(entry, effective.length, parameterOffset);
      effective.push(param ? makeDefaultSlot(functionName, param) : makeSourceSlot(''));
    }

    return effective;
  }, [entry, functionName, parameterOffset, slots]);

  // -------------------------------------------------------------------------
  // Slot change handlers
  // -------------------------------------------------------------------------

  const handleSlotChange = useCallback(
    (index: number, updated: ArgumentSlot) => {
      const next = computeEffectiveSlots().map((s, i) => (i === index ? updated : s));
      onSlotsChange(next);
    },
    [computeEffectiveSlots, onSlotsChange],
  );

  const handleAddVariadicSlot = useCallback(() => {
    if (!entry) return;
    const variadicParam = entry.parameters.slice(parameterOffset).find((p) => p.variadic);
    if (!variadicParam) return;
    onSlotsChange([...slots, makeDefaultSlot(functionName, variadicParam)]);
  }, [entry, slots, onSlotsChange, functionName, parameterOffset]);

  const handleRemoveSlot = useCallback(
    (index: number) => {
      onSlotsChange(computeEffectiveSlots().filter((_, i) => i !== index));
    },
    [computeEffectiveSlots, onSlotsChange],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!entry) {
    return (
      <div
        className={['text-xs text-zinc-500 italic', className ?? ''].filter(Boolean).join(' ')}
        data-testid="argument-form-unknown-function"
      >
        Unknown function: {functionName}
      </div>
    );
  }

  const hasVariadic = entry.parameters.slice(parameterOffset).some((p) => p.variadic);
  // Ensure we always render at least the required slots.
  const effectiveSlots = computeEffectiveSlots();
  const isFilterConditionFunction = functionName === 'filter' || functionName === 'find';
  const conditionArrayPath =
    conditionArrayPathOverride
    ?? (
      isFilterConditionFunction && effectiveSlots[0]?.mode === 'source'
        ? effectiveSlots[0].path
        : ''
    );

  return (
    <div
      className={['space-y-2', className ?? ''].filter(Boolean).join(' ')}
      data-testid={`argument-form-${functionName}`}
    >
      {!hideFunctionHeader && (
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-mono font-semibold text-blue-300"
            data-testid="argument-form-function-name"
          >
            {functionName}
          </span>
          <span className="text-xs text-zinc-500">
            {entry.description}
          </span>
        </div>
      )}

      {/* Slot list */}
      <div className="space-y-2" data-testid="argument-form-slots">
        {effectiveSlots.map((slot, index) => {
          const param = getParamForSlot(entry, index, parameterOffset);
          if (!param) return null;

          const presentation = getParameterPresentation(functionName, param.name);
          const isVariadicExtra = index >= entry.parameters.length;
          const canRemove = hasVariadic && isVariadicExtra;
          const forceConditionEditor = isFilterConditionFunction && param.name === 'condition';

          // forceConditionEditor carve-out: filter/find condition parameter uses
          // ConditionRowEditor via ArgumentSlotInput — not routed through ParameterValueInput.
          if (forceConditionEditor) {
            return (
              <ArgumentSlotInput
                key={index}
                slotIndex={index}
                slot={slot}
                parameter={param}
                displayName={presentation.label}
                description={presentation.description}
                sourceOptions={sourceOptions}
                forceConditionEditor
                conditionArrayPath={conditionArrayPath}
                onSlotChange={(updated) => { handleSlotChange(index, updated); }}
                onRemove={canRemove ? () => { handleRemoveSlot(index); } : undefined}
                exampleHint={entry.example}
              />
            );
          }

          const options = resolveOptions(functionName, param.name);

          return (
            <ParameterValueInput
              key={index}
              slot={slot}
              parameter={param}
              label={presentation.label}
              description={presentation.description}
              options={options}
              sourceOptions={sourceOptions}
              onSlotChange={(updated) => { handleSlotChange(index, updated); }}
              onRemove={canRemove ? () => { handleRemoveSlot(index); } : undefined}
              placeholder={entry.example}
              testIdPrefix={`argument-slot-input-${index}`}
            />
          );
        })}
      </div>

      {/* Variadic [+ Add value] button */}
      {hasVariadic && (
        <button
          type="button"
          onClick={handleAddVariadicSlot}
          className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded px-2 py-1 border border-dashed border-blue-800 hover:border-blue-600 transition-colors"
          data-testid="argument-form-add-value"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          Add value
        </button>
      )}
    </div>
  );
}
