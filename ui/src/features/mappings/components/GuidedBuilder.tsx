/**
 * GuidedBuilder — Step-by-step guided DSL expression builder.
 *
 * Orchestrates a 4-step flow:
 *  Step 1: Source field selection (SourceFieldPicker) or static value
 *  Step 2: Transform function picker (TransformPicker)
 *  Step 3: Argument configuration (ArgumentConfigurator)
 *  Step 4: Preview / DSL generation (ExpressionPreviewStep)
 *
 * Shortcuts:
 *  - Direct Copy: one field selected, no transform → `source("path")`
 *  - Static Value: `static("val")`, `static(123)`, `static(true)`, `static(null)`
 *
 * Exposes a ref (`GuidedBuilderRef`) with `insertSourceField(path)` so that
 * Panel 1 (Schema Tree) can inject a field path into Step 1. T-11 wires this.
 */

import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';

import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import { parse, defaultRegistry } from '@/lib/engine';
import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';
import type { BuilderArgument, BuilderState, ObjectTemplateField } from '../lib/expression-generator';
import { generateExpression, makeSourceArg, makeObjectTemplateArg, makeNestedArg } from '../lib/expression-generator';
import { ArgumentConfigurator } from './ArgumentConfigurator';
import { ArrayContextBanner } from './ArrayContextBanner';
import { BuilderStepIndicator } from './BuilderStepIndicator';
import { ConditionBuilder } from './ConditionBuilder';
import { ExpressionPreviewStep } from './ExpressionPreviewStep';
import { ObjectTemplateBuilder } from './ObjectTemplateBuilder';
import { SourceFieldPicker } from './SourceFieldPicker';
import type { StaticValueType } from './SourceFieldPicker';
import { TransformPicker } from './TransformPicker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Walk ParsedSchema.nodes tree and find the node whose path === target. */
function findNodeByPath(schema: ParsedSchema, targetPath: string): SchemaTreeNode | null {
  function search(nodes: SchemaTreeNode[]): SchemaTreeNode | null {
    for (const node of nodes) {
      if (node.path === targetPath) return node;
      if (node.children.length > 0) {
        const found = search(node.children);
        if (found) return found;
      }
    }
    return null;
  }
  return search(schema.nodes);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GuidedBuilderRef {
  /**
   * Inject a source field path from an external source (e.g. Panel 1 schema tree click).
   * Adds the path to the selected fields on Step 1 if not already present.
   */
  insertSourceField: (path: string) => void;
  /**
   * Select a transform function programmatically (e.g. from FunctionReferencePanel insert).
   * Advances to Step 3 (argument configuration) with the named function selected.
   */
  selectFunction: (functionName: string) => void;
}

export interface GuidedBuilderProps {
  readonly expression: string;
  readonly onExpressionChange: (expr: string) => void;
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_LABELS = ['Source', 'Transform', 'Arguments', 'Preview'];
const TOTAL_STEPS = 4;

// ---------------------------------------------------------------------------
// Expression builders (pure functions)
// ---------------------------------------------------------------------------

/**
 * Build a static() expression from a literal value and its type.
 * Empty value for string/number produces a sensible default.
 */
export function buildStaticExpression(value: string, type: StaticValueType): string {
  switch (type) {
    case 'null':
      return 'static(null)';
    case 'boolean':
      return `static(${value === 'false' ? 'false' : 'true'})`;
    case 'number': {
      const n = value.trim() === '' ? '0' : value.trim();
      return `static(${n})`;
    }
    case 'string': {
      const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `static("${escaped}")`;
    }
  }
}

/** Build a direct-copy source() expression from a single field path. */
export function buildSourceExpression(path: string): string {
  return `source("${path}")`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Guided DSL expression builder with step-by-step navigation.
 * Exposes `insertSourceField` via ref for Panel 1 integration (T-11).
 */
export const GuidedBuilder = forwardRef<GuidedBuilderRef, GuidedBuilderProps>(
  function GuidedBuilder({ expression: _expression, onExpressionChange, parsedSourceSchema, className }, ref) {
    // Builder local state — not persisted to rule state until committed
    const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
    const [selectedSourceFields, setSelectedSourceFields] = useState<string[]>([]);
    const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
    const [argumentValues, setArgumentValues] = useState<readonly BuilderArgument[]>([]);
    const [staticMode, setStaticMode] = useState(false);
    const [staticValue, setStaticValue] = useState('');
    const [staticType, setStaticType] = useState<StaticValueType>('string');

    // Array context state (only relevant when selectedFunction is map/filter)
    const [mapTemplateFields, setMapTemplateFields] = useState<readonly ObjectTemplateField[]>([]);
    const [filterCondition, setFilterCondition] = useState<BuilderState | null>(null);

    // -----------------------------------------------------------------------
    // Derived: array context detection
    // -----------------------------------------------------------------------

    /** The first selected source field path (the array field). */
    const firstField = selectedSourceFields[0] ?? null;

    /** The schema node for the first selected field — null if not found or no schema. */
    const arrayItemSchema = useMemo<SchemaTreeNode | null>(() => {
      if (!firstField || !parsedSourceSchema) return null;
      const node = findNodeByPath(parsedSourceSchema, firstField);
      if (!node) return null;
      return node.isArray || node.type === 'array' ? node : null;
    }, [firstField, parsedSourceSchema]);

    const isArrayField = arrayItemSchema !== null;
    const isArrayContext =
      isArrayField &&
      (selectedFunction === 'map' || selectedFunction === 'filter');

    // -----------------------------------------------------------------------
    // Derived: generated expression for Step 3 → Step 4
    // -----------------------------------------------------------------------
    const generatedExpression = useMemo<string>(() => {
      if (!selectedFunction) return '';

      // Array context: map() or filter()
      if (isArrayContext && firstField) {
        const sourceArg = makeSourceArg(firstField);
        if (selectedFunction === 'map') {
          return generateExpression({
            functionName: 'map',
            arguments: [sourceArg, makeObjectTemplateArg(mapTemplateFields)],
          });
        }
        if (selectedFunction === 'filter' && filterCondition) {
          return generateExpression({
            functionName: 'filter',
            arguments: [sourceArg, makeNestedArg(filterCondition)],
          });
        }
        // filter without condition yet — produce partial (invalid)
        if (selectedFunction === 'filter') {
          return generateExpression({
            functionName: 'filter',
            arguments: [sourceArg],
          });
        }
      }

      return generateExpression({ functionName: selectedFunction, arguments: argumentValues });
    }, [selectedFunction, argumentValues, isArrayContext, firstField, mapTemplateFields, filterCondition]);

    const parseResult = useMemo(() => {
      if (!generatedExpression) return null;
      return parse(generatedExpression, defaultRegistry);
    }, [generatedExpression]);

    const previewValid = parseResult?.success ?? false;
    const previewError = !previewValid && parseResult
      ? (parseResult.diagnostics[0]?.message ?? 'Syntax error')
      : undefined;

    // -----------------------------------------------------------------------
    // Imperative handle (for T-11 Panel 1 wiring)
    // -----------------------------------------------------------------------
    useImperativeHandle(ref, () => ({
      insertSourceField(path: string) {
        setSelectedSourceFields((prev) =>
          prev.includes(path) ? prev : [...prev, path],
        );
        // Ensure the builder is on step 1 to show the inserted field
        if (currentStep !== 1) setCurrentStep(1);
      },
      selectFunction(functionName: string) {
        handleFunctionSelect(functionName);
      },
    }));

    // -----------------------------------------------------------------------
    // Field selection handlers
    // -----------------------------------------------------------------------
    const handleFieldSelect = useCallback((path: string) => {
      setSelectedSourceFields((prev) =>
        prev.includes(path) ? prev : [...prev, path],
      );
    }, []);

    const handleFieldRemove = useCallback((path: string) => {
      setSelectedSourceFields((prev) => prev.filter((p) => p !== path));
    }, []);

    // -----------------------------------------------------------------------
    // Static mode handlers
    // -----------------------------------------------------------------------
    const handleStaticModeChange = useCallback((mode: boolean) => {
      setStaticMode(mode);
      if (mode) {
        // Entering static mode — clear field selection
        setSelectedSourceFields([]);
      }
    }, []);

    // -----------------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------------
    const handleBack = useCallback(() => {
      setCurrentStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : 1));
    }, []);

    const handleStepClick = useCallback((step: number) => {
      if (step >= 1 && step <= 4 && step < currentStep) {
        setCurrentStep(step as 1 | 2 | 3 | 4);
      }
    }, [currentStep]);

    // -----------------------------------------------------------------------
    // Commit shortcuts
    // -----------------------------------------------------------------------

    /** Direct Copy: single field → source("path"), no transform needed */
    const handleDirectCopy = useCallback(() => {
      if (selectedSourceFields.length === 1) {
        const expr = buildSourceExpression(selectedSourceFields[0]);
        onExpressionChange(expr);
      }
    }, [selectedSourceFields, onExpressionChange]);

    /** Static Value commit */
    const handleStaticCommit = useCallback(() => {
      const expr = buildStaticExpression(staticValue, staticType);
      onExpressionChange(expr);
    }, [staticValue, staticType, onExpressionChange]);

    /** Advance to Step 2 (transform picker) */
    const handleChooseTransform = useCallback(() => {
      setCurrentStep(2);
      setSelectedFunction(null);
    }, []);

    /** Step 2: function selected → advance to Step 3 (argument configuration) */
    const handleFunctionSelect = useCallback((name: string) => {
      setSelectedFunction(name);
      setArgumentValues([]);
      setMapTemplateFields([]);
      setFilterCondition(null);
      setCurrentStep(3);
    }, []);

    /** Step 3: args changed */
    const handleArgsChange = useCallback((values: BuilderArgument[]) => {
      setArgumentValues(values);
    }, []);

    /** Step 3 → Step 4: advance to preview */
    const handleAdvanceToPreview = useCallback(() => {
      setCurrentStep(4);
    }, []);

    /** Step 4: commit generated expression */
    const handleUseExpression = useCallback(() => {
      if (previewValid && generatedExpression) {
        onExpressionChange(generatedExpression);
      }
    }, [previewValid, generatedExpression, onExpressionChange]);

    // -----------------------------------------------------------------------
    // Derived state
    // -----------------------------------------------------------------------
    const canDirectCopy = selectedSourceFields.length === 1 && !staticMode;
    const canCommitStatic =
      staticMode && (staticType === 'null' || staticType === 'boolean' || staticValue.trim() !== '');

    // Resolve parameter metadata for selected function
    const functionEntry = useMemo(
      () => DSL_FUNCTION_CATALOG.find((e) => e.name === selectedFunction) ?? null,
      [selectedFunction],
    );

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    return (
      <div
        className={['flex flex-col gap-4 h-full', className ?? ''].filter(Boolean).join(' ')}
        data-testid="guided-builder"
      >
        {/* Step indicator */}
        <BuilderStepIndicator
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
          stepLabels={STEP_LABELS}
          onStepClick={handleStepClick}
        />

        {/* Step content */}
        <div className="flex-1 overflow-y-auto">
          {currentStep === 1 && (
            <div data-testid="step-1">
              <SourceFieldPicker
                parsedSourceSchema={parsedSourceSchema}
                selectedFields={selectedSourceFields}
                onFieldSelect={handleFieldSelect}
                onFieldRemove={handleFieldRemove}
                staticMode={staticMode}
                onStaticModeChange={handleStaticModeChange}
                staticValue={staticValue}
                staticType={staticType}
                onStaticValueChange={setStaticValue}
                onStaticTypeChange={setStaticType}
              />
            </div>
          )}

          {currentStep === 2 && (
            <div data-testid="step-2">
              <TransformPicker
                selectedSourceFields={selectedSourceFields}
                onFunctionSelect={handleFunctionSelect}
                catalog={DSL_FUNCTION_CATALOG}
              />
            </div>
          )}

          {currentStep === 3 && (
            <div data-testid="step-3">
              {selectedFunction !== null && functionEntry !== null ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs text-zinc-500 uppercase tracking-wide">
                      Configure arguments for
                    </span>
                    <span className="text-sm font-mono text-blue-300 font-medium">
                      {selectedFunction}()
                    </span>
                  </div>

                  {/* Array context mode — map() with object template */}
                  {isArrayContext && selectedFunction === 'map' && firstField && (
                    <>
                      <ArrayContextBanner functionName="map" sourceField={firstField} />
                      <ObjectTemplateBuilder
                        fields={mapTemplateFields}
                        onChange={setMapTemplateFields}
                        parsedSourceSchema={parsedSourceSchema}
                        arrayItemSchema={arrayItemSchema}
                      />
                    </>
                  )}

                  {/* Array context mode — filter() with condition */}
                  {isArrayContext && selectedFunction === 'filter' && firstField && (
                    <>
                      <ArrayContextBanner functionName="filter" sourceField={firstField} />
                      <ConditionBuilder
                        condition={filterCondition}
                        onChange={setFilterCondition}
                        parsedSourceSchema={parsedSourceSchema}
                        arrayItemSchema={arrayItemSchema}
                      />
                    </>
                  )}

                  {/* Standard argument configurator (non-array context, or non-map/filter) */}
                  {!isArrayContext && (
                    <ArgumentConfigurator
                      functionName={selectedFunction}
                      parameters={functionEntry.parameters}
                      values={argumentValues}
                      onChange={handleArgsChange}
                      parsedSourceSchema={parsedSourceSchema}
                      nestingLevel={0}
                    />
                  )}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 italic p-4">
                  No function selected. Go back to Step 2.
                </p>
              )}
            </div>
          )}

          {currentStep === 4 && (
            <div data-testid="step-4">
              <ExpressionPreviewStep
                expression={generatedExpression}
                isValid={previewValid}
                validationError={previewError}
                onUseExpression={handleUseExpression}
              />
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-700 shrink-0">
          {/* Back button */}
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 1}
            className="px-3 py-1.5 text-sm text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            ← Back
          </button>

          {/* Primary actions on step 1 */}
          {currentStep === 1 && (
            <div className="flex items-center gap-2">
              {staticMode ? (
                <button
                  type="button"
                  onClick={handleStaticCommit}
                  disabled={!canCommitStatic}
                  className="px-3 py-1.5 text-sm rounded font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  Use Static Value
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleDirectCopy}
                    disabled={!canDirectCopy}
                    aria-label="Direct copy — use selected field without transform"
                    className="px-3 py-1.5 text-sm rounded font-medium bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                  >
                    Direct Copy
                  </button>
                  <button
                    type="button"
                    onClick={handleChooseTransform}
                    disabled={selectedSourceFields.length === 0}
                    className="px-3 py-1.5 text-sm rounded font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    Choose Transform →
                  </button>
                </>
              )}
            </div>
          )}

          {/* Step 3 → advance to preview */}
          {currentStep === 3 && (
            <button
              type="button"
              onClick={handleAdvanceToPreview}
              disabled={selectedFunction === null}
              className="px-3 py-1.5 text-sm rounded font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              Preview →
            </button>
          )}
        </div>
      </div>
    );
  },
);
