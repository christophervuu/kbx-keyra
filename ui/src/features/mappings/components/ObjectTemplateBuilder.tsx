/**
 * ObjectTemplateBuilder
 *
 * Key-value pair editor for building DSL object template expressions.
 * Used in Step 3 of GuidedBuilder when the selected transform is map() and
 * the source field is an array type.
 *
 * Generates arguments of kind `object-template` via makeObjectTemplateArg().
 *
 * Each value slot is an ArgumentSlot configured in array context so the user
 * can reference array element fields via item("path").
 */

import { useCallback, useId } from 'react';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';
import type { ArrayContext } from './ArgumentSlot';
import { ArgumentSlot } from './ArgumentSlot';
import type { BuilderArgument, ObjectTemplateField } from '../lib/expression-generator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ObjectTemplateBuilderProps {
  /** Current list of key-value pairs. */
  readonly fields: readonly ObjectTemplateField[];
  /** Called whenever any field key or value changes. */
  readonly onChange: (fields: readonly ObjectTemplateField[]) => void;
  readonly parsedSourceSchema: ParsedSchema | null;
  /** The array node from the source schema — its children are element fields. */
  readonly arrayItemSchema: SchemaTreeNode | null;
}

// ---------------------------------------------------------------------------
// Stable synthetic FunctionCatalogParameter for value ArgumentSlot
// ---------------------------------------------------------------------------

const VALUE_PARAMETER = {
  name: 'value',
  type: 'any' as const,
  required: true,
  variadic: false,
  description: 'Template field value',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ObjectTemplateBuilder({
  fields,
  onChange,
  parsedSourceSchema,
  arrayItemSchema,
}: ObjectTemplateBuilderProps) {
  const baseId = useId();

  const arrayContext: ArrayContext = {
    inArrayContext: true,
    arrayItemSchema,
  };

  // -----------------------------------------------------------------------
  // Mutation helpers
  // -----------------------------------------------------------------------

  const handleKeyChange = useCallback(
    (index: number, key: string) => {
      onChange(
        fields.map((f, i) => (i === index ? { ...f, key } : f)),
      );
    },
    [fields, onChange],
  );

  const handleValueChange = useCallback(
    (index: number, value: BuilderArgument) => {
      onChange(
        fields.map((f, i) => (i === index ? { ...f, value } : f)),
      );
    },
    [fields, onChange],
  );

  const handleAddField = useCallback(() => {
    onChange([...fields, { key: '', value: { kind: 'literal', value: '' } }]);
  }, [fields, onChange]);

  const handleRemoveField = useCallback(
    (index: number) => {
      onChange(fields.filter((_, i) => i !== index));
    },
    [fields, onChange],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3" data-testid="object-template-builder">
      {fields.length === 0 && (
        <p className="text-sm text-zinc-500 italic px-1">
          No fields yet. Click "Add field" to start building the template.
        </p>
      )}

      {fields.map((field, index) => {
        const rowId = `${baseId}-field-${index}`;
        return (
          <div
            key={rowId}
            data-testid={`template-field-${index}`}
            className="flex flex-col gap-2 rounded border border-zinc-700 bg-zinc-900/40 p-3"
          >
            {/* Key input */}
            <div className="flex items-center gap-2">
              <label
                htmlFor={`${rowId}-key`}
                className="shrink-0 text-xs text-zinc-400 font-mono w-8"
              >
                key
              </label>
              <input
                id={`${rowId}-key`}
                type="text"
                value={field.key}
                placeholder="target field name"
                aria-label={`Template field ${index + 1} key`}
                onChange={(e) => { handleKeyChange(index, e.target.value); }}
                className="flex-1 px-2 py-1 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => { handleRemoveField(index); }}
                aria-label={`Remove field ${index + 1}`}
                className="shrink-0 text-xs text-zinc-500 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400 rounded px-1"
              >
                ✕
              </button>
            </div>

            {/* Value ArgumentSlot */}
            <div className="pl-10">
              <ArgumentSlot
                parameter={VALUE_PARAMETER}
                value={field.value}
                onChange={(v) => { handleValueChange(index, v); }}
                parsedSourceSchema={parsedSourceSchema}
                arrayContext={arrayContext}
                nestingLevel={0}
              />
            </div>
          </div>
        );
      })}

      {/* Add field button */}
      <button
        type="button"
        onClick={handleAddField}
        className="self-start rounded border border-dashed border-zinc-600 px-3 py-1.5 text-sm text-zinc-400 hover:border-blue-500 hover:text-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
      >
        + Add field
      </button>
    </div>
  );
}
