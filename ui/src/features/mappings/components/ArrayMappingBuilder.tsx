/**
 * ArrayMappingBuilder — 4-step guided workflow for array target field authoring.
 *
 * Step 1: Choose source collection
 * Step 2: Select mapping pattern
 * Step 3: Map item fields (drag-and-drop or click-to-pair)
 * Step 4: Preview generated expression + Save
 *
 * "Advanced/Custom" pattern in Step 2 bypasses Steps 3-4 and opens raw DSL editor.
 * Nested array banner shown when the target array is nested inside another array.
 */

import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useState } from 'react';

import { BuilderStepIndicator } from './BuilderStepIndicator';
import { RawDslEditor } from './RawDslEditor';
import { useArrayBuilder } from '../hooks/use-array-builder';
import type { ArrayPattern, FieldMapping } from '../lib/array-expression-generator';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArrayMappingBuilderProps {
  /** Full dot-path of the target array field */
  targetArrayPath: string;
  /** Parsed source schema for source array selection */
  parsedSourceSchema: ParsedSchema | null;
  /** Parsed target schema for item field display */
  parsedTargetSchema: ParsedSchema | null;
  /** Whether this array is nested inside another array */
  isNestedArray?: boolean;
  /** Path of the parent array (for nested array banner) */
  parentArrayPath?: string;
  /** Fired when user saves the mapping */
  onSave: (targetPath: string, expression: string) => void;
  /** Fired when user clicks the parent array link in the nested banner */
  onSelectParentArray?: (parentPath: string) => void;
  /** Optional className */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_LABELS = ['Source', 'Pattern', 'Fields', 'Preview'];

const PATTERN_OPTIONS: { value: ArrayPattern; label: string; description: string }[] = [
  { value: '1:1 map', label: '1:1 Map', description: 'Map each source item to a target item' },
  { value: 'filter-then-map', label: 'Filter then Map', description: 'Filter source items, then map each' },
  { value: 'merge-arrays', label: 'Merge Arrays', description: 'Combine multiple source arrays into one' },
  { value: 'build-from-scalars', label: 'Build from Scalars', description: 'Construct array from individual source fields' },
  { value: 'advanced', label: 'Advanced / Custom', description: 'Write raw DSL expression directly' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getArrayNodes(schema: ParsedSchema | null): SchemaTreeNode[] {
  if (!schema) return [];
  return schema.nodes.filter((n) => n.type === 'array');
}

function getScalarChildren(schema: ParsedSchema | null, arrayPath: string): SchemaTreeNode[] {
  if (!schema) return [];
  return schema.nodes.filter(
    (n) =>
      n.parentPath === arrayPath &&
      n.type !== 'object' &&
      n.type !== 'array',
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Source Collection
// ---------------------------------------------------------------------------

function Step1SourceCollection({
  parsedSourceSchema,
  selectedPath,
  onSelect,
}: {
  parsedSourceSchema: ParsedSchema | null;
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const arrays = getArrayNodes(parsedSourceSchema);

  return (
    <div data-testid="step-1-source">
      <p className="mb-3 text-xs text-slate-400">
        Select the source array to map from:
      </p>
      {arrays.length === 0 ? (
        <p className="text-xs text-slate-500" data-testid="no-source-arrays">
          No array fields found in source schema
        </p>
      ) : (
        <ul role="list" className="flex flex-col gap-1">
          {arrays.map((node) => (
            <li key={node.path}>
              <button
                type="button"
                data-testid={`source-array-${node.path}`}
                aria-pressed={selectedPath === node.path}
                onClick={() => onSelect(node.path)}
                className={[
                  'w-full rounded border px-3 py-2 text-left text-xs font-mono transition-colors',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                  selectedPath === node.path
                    ? 'border-blue-500/60 bg-blue-900/20 text-blue-300'
                    : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-600 hover:bg-slate-700/40',
                ].join(' ')}
              >
                {node.path}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Pattern Selection
// ---------------------------------------------------------------------------

function Step2PatternSelection({
  selectedPattern,
  onSelect,
}: {
  selectedPattern: ArrayPattern;
  onSelect: (pattern: ArrayPattern) => void;
}) {
  return (
    <div data-testid="step-2-pattern">
      <p className="mb-3 text-xs text-slate-400">Choose a mapping pattern:</p>
      <div className="flex flex-col gap-2">
        {PATTERN_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            data-testid={`pattern-${opt.value}`}
            aria-pressed={selectedPattern === opt.value}
            onClick={() => onSelect(opt.value)}
            className={[
              'rounded border px-3 py-2 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              selectedPattern === opt.value
                ? 'border-blue-500/60 bg-blue-900/20'
                : 'border-slate-700 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-700/40',
            ].join(' ')}
          >
            <div className="text-xs font-medium text-slate-200">{opt.label}</div>
            <div className="mt-0.5 text-[10px] text-slate-500">{opt.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Item Field Mapping
// ---------------------------------------------------------------------------

function Step3FieldMapping({
  targetArrayPath,
  parsedSourceSchema,
  parsedTargetSchema,
  fieldMappings,
  onAddMapping,
  onRemoveMapping,
}: {
  targetArrayPath: string;
  parsedSourceSchema: ParsedSchema | null;
  parsedTargetSchema: ParsedSchema | null;
  fieldMappings: FieldMapping[];
  onAddMapping: (mapping: FieldMapping) => void;
  onRemoveMapping: (index: number) => void;
}) {
  const [draggedSource, setDraggedSource] = useState<string | null>(null);

  // Get scalar children of the source array and target array
  const sourceItems = getScalarChildren(parsedSourceSchema, fieldMappings.length > 0 ? '' : '');
  // Use all non-object/array nodes from source as potential item fields
  const sourceFields = parsedSourceSchema
    ? parsedSourceSchema.nodes.filter((n) => n.type !== 'object' && n.type !== 'array')
    : [];
  const targetFields = getScalarChildren(parsedTargetSchema, targetArrayPath);

  const mappedTargetFields = new Set(fieldMappings.map((m) => m.targetField));

  return (
    <div data-testid="step-3-fields">
      <p className="mb-3 text-xs text-slate-400">
        Drag source fields onto target fields to create mappings. Nested arrays must be mapped separately.
      </p>

      <div className="flex gap-3">
        {/* Source fields */}
        <div className="flex-1">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Source Fields
          </div>
          <ul role="list" className="flex flex-col gap-1" data-testid="source-fields-list">
            {sourceFields.map((node) => (
              <li
                key={node.path}
                draggable
                data-testid={`source-field-${node.path}`}
                onDragStart={() => setDraggedSource(node.fieldName)}
                onDragEnd={() => setDraggedSource(null)}
                className="cursor-grab rounded border border-slate-700 bg-slate-800/40 px-2 py-1 font-mono text-xs text-slate-300 hover:border-slate-600 active:cursor-grabbing"
              >
                {node.fieldName}
              </li>
            ))}
            {sourceFields.length === 0 && (
              <li className="text-xs text-slate-500">No source fields available</li>
            )}
          </ul>
        </div>

        {/* Target fields */}
        <div className="flex-1">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Target Fields
          </div>
          <ul role="list" className="flex flex-col gap-1" data-testid="target-fields-list">
            {targetFields.map((node) => {
              const isMapped = mappedTargetFields.has(node.fieldName);
              const mapping = fieldMappings.find((m) => m.targetField === node.fieldName);
              return (
                <li
                  key={node.path}
                  data-testid={`target-field-${node.path}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggedSource && !isMapped) {
                      onAddMapping({ targetField: node.fieldName, sourceField: draggedSource });
                      setDraggedSource(null);
                    }
                  }}
                  className={[
                    'flex items-center justify-between rounded border px-2 py-1 font-mono text-xs',
                    isMapped
                      ? 'border-green-700/50 bg-green-950/20 text-green-300'
                      : 'border-slate-700 bg-slate-800/40 text-slate-400',
                  ].join(' ')}
                >
                  <span>{node.fieldName}</span>
                  {isMapped && mapping && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      ← {mapping.sourceField}
                      <button
                        type="button"
                        aria-label={`Remove mapping for ${node.fieldName}`}
                        data-testid={`remove-mapping-${node.fieldName}`}
                        onClick={() => {
                          const idx = fieldMappings.findIndex(
                            (m) => m.targetField === node.fieldName,
                          );
                          if (idx !== -1) onRemoveMapping(idx);
                        }}
                        className="ml-1 rounded p-0.5 text-slate-500 hover:bg-slate-700 hover:text-red-400"
                      >
                        <X size={10} aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
            {targetFields.length === 0 && (
              <li className="text-xs text-slate-500">No target item fields found</li>
            )}
          </ul>
        </div>
      </div>

      {/* Mapped pairs summary */}
      {fieldMappings.length > 0 && (
        <div className="mt-3" data-testid="mapped-pairs">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Mapped Pairs ({fieldMappings.length})
          </div>
          <ul className="flex flex-col gap-1">
            {fieldMappings.map((m, i) => (
              <li
                key={i}
                data-testid={`mapped-pair-${i}`}
                className="flex items-center gap-2 rounded border border-slate-700 bg-slate-800/40 px-2 py-1 text-xs"
              >
                <span className="font-mono text-slate-400">{m.sourceField}</span>
                <span className="text-slate-600">→</span>
                <span className="font-mono text-slate-300">{m.targetField}</span>
                <button
                  type="button"
                  aria-label={`Remove mapping ${i}`}
                  data-testid={`remove-pair-${i}`}
                  onClick={() => onRemoveMapping(i)}
                  className="ml-auto rounded p-0.5 text-slate-500 hover:bg-slate-700 hover:text-red-400"
                >
                  <X size={10} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Preview
// ---------------------------------------------------------------------------

function Step4Preview({ expression }: { expression: string }) {
  return (
    <div data-testid="step-4-preview">
      <p className="mb-2 text-xs text-slate-400">Generated DSL expression:</p>
      <pre
        data-testid="generated-expression"
        className="overflow-x-auto rounded border border-slate-700 bg-slate-800/60 p-3 font-mono text-xs text-slate-200"
      >
        {expression || <em className="text-slate-500">No expression generated</em>}
      </pre>
      <p className="mt-3 text-xs text-slate-500">
        Review the expression above. Click Save to apply this mapping.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * ArrayMappingBuilder — 4-step guided workflow for array target fields.
 */
export function ArrayMappingBuilder({
  targetArrayPath,
  parsedSourceSchema,
  parsedTargetSchema,
  isNestedArray = false,
  parentArrayPath,
  onSave,
  onSelectParentArray,
  className = '',
}: ArrayMappingBuilderProps) {
  const builder = useArrayBuilder();
  const {
    currentStep,
    state,
    generatedExpression,
    goNext,
    goBack,
    goToStep,
    setSourceArrayPath,
    setPattern,
    addFieldMapping,
    removeFieldMapping,
    setRawExpression,
    canGoNext,
  } = builder;

  const isAdvanced = state.pattern === 'advanced';
  // Advanced pattern: step 2 → step 4 (skip step 3)
  const visibleSteps = isAdvanced ? [1, 2, 4] : [1, 2, 3, 4];
  const totalSteps = 4;

  return (
    <div
      data-testid="array-mapping-builder"
      className={`flex flex-col overflow-hidden ${className}`}
    >
      {/* Nested array banner */}
      {isNestedArray && parentArrayPath && (
        <div
          data-testid="nested-array-banner"
          className="shrink-0 border-b border-amber-800/40 bg-amber-950/30 px-4 py-2"
        >
          <p className="text-xs text-amber-300">
            This array is nested inside{' '}
            <button
              type="button"
              data-testid="parent-array-link"
              onClick={() => onSelectParentArray?.(parentArrayPath)}
              className="underline hover:text-amber-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
            >
              {parentArrayPath}
            </button>
            . The outer array mapping must be configured first.
          </p>
        </div>
      )}

      {/* Step indicator */}
      <div className="shrink-0 border-b border-slate-700 px-4 py-3">
        <BuilderStepIndicator
          currentStep={currentStep}
          totalSteps={totalSteps}
          stepLabels={STEP_LABELS}
          onStepClick={(step) => {
            if (step < currentStep) goToStep(step as 1 | 2 | 3 | 4);
          }}
        />
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {currentStep === 1 && (
          <Step1SourceCollection
            parsedSourceSchema={parsedSourceSchema}
            selectedPath={state.sourceArrayPath}
            onSelect={setSourceArrayPath}
          />
        )}

        {currentStep === 2 && (
          <Step2PatternSelection
            selectedPattern={state.pattern}
            onSelect={setPattern}
          />
        )}

        {currentStep === 3 && !isAdvanced && (
          <Step3FieldMapping
            targetArrayPath={targetArrayPath}
            parsedSourceSchema={parsedSourceSchema}
            parsedTargetSchema={parsedTargetSchema}
            fieldMappings={state.fieldMappings}
            onAddMapping={addFieldMapping}
            onRemoveMapping={removeFieldMapping}
          />
        )}

        {currentStep === 4 && isAdvanced && (
          <div data-testid="advanced-raw-editor">
            <p className="mb-2 text-xs text-slate-400">Enter your array DSL expression:</p>
            <RawDslEditor
              value={state.rawExpression}
              onChange={setRawExpression}
              placeholder="map(source(&quot;items&quot;), item(&quot;&quot;))"
              className="w-full"
            />
          </div>
        )}

        {currentStep === 4 && !isAdvanced && (
          <Step4Preview expression={generatedExpression} />
        )}
      </div>

      {/* Navigation */}
      <div className="shrink-0 border-t border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            data-testid="btn-back"
            onClick={goBack}
            disabled={currentStep === 1}
            className={[
              'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              currentStep === 1
                ? 'cursor-not-allowed text-slate-600'
                : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200',
            ].join(' ')}
          >
            <ArrowLeft size={12} aria-hidden="true" />
            Back
          </button>

          {currentStep < 4 ? (
            <button
              type="button"
              data-testid="btn-next"
              onClick={goNext}
              disabled={!canGoNext}
              className={[
                'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                canGoNext
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'cursor-not-allowed bg-slate-700 text-slate-500',
              ].join(' ')}
            >
              Next
              <ArrowRight size={12} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              data-testid="btn-save"
              onClick={() => onSave(targetArrayPath, generatedExpression || state.rawExpression)}
              disabled={!generatedExpression && !state.rawExpression}
              className={[
                'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                generatedExpression || state.rawExpression
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'cursor-not-allowed bg-slate-700 text-slate-500',
              ].join(' ')}
            >
              <Check size={12} aria-hidden="true" />
              Save mapping
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
