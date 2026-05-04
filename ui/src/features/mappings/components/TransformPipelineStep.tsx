/**
 * TransformPipelineStep — a single step card in the transform pipeline
 * for the UnifiedExpressionBuilder (FS-023 T-04).
 *
 * Shows:
 *  - Step number badge
 *  - Function name
 *  - Auto-wired first parameter (read-only, shows what feeds this step)
 *  - Dynamic additional parameter inputs derived from DSL_FUNCTION_CATALOG
 *  - Up/Down reorder buttons
 *  - Remove button
 */

import { useCallback } from 'react';
import { ChevronUp, ChevronDown, X, Lock } from 'lucide-react';

import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import type { TransformStep, TransformParameterValue } from '../lib/expression-builder-state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransformPipelineStepProps {
  readonly stepIndex: number;
  readonly transform: TransformStep;
  /** What feeds this step — e.g. 'source("email")' or 'output of step 1' */
  readonly inputDescription: string;
  readonly onUpdate: (updated: TransformStep) => void;
  readonly onRemove: () => void;
  readonly onMoveUp?: () => void;
  readonly onMoveDown?: () => void;
  readonly isFirst: boolean;
  readonly isLast: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getParamInputType(paramType: string): 'text' | 'number' | 'checkbox' {
  if (paramType === 'number') return 'number';
  if (paramType === 'boolean') return 'checkbox';
  return 'text';
}

function parseParamValue(raw: string, paramType: string): TransformParameterValue['value'] {
  if (paramType === 'number') {
    const n = parseFloat(raw);
    return isNaN(n) ? 0 : n;
  }
  if (paramType === 'boolean') return raw === 'true';
  return raw;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A single transform step card in the pipeline.
 */
export function TransformPipelineStep({
  stepIndex,
  transform,
  inputDescription,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: TransformPipelineStepProps) {
  const catalogEntry = DSL_FUNCTION_CATALOG.find((e) => e.name === transform.functionName);
  // Additional parameters = catalog params after index 0 (index 0 is auto-wired)
  const additionalParamDefs = catalogEntry ? catalogEntry.parameters.slice(1) : [];

  const handleParamChange = useCallback(
    (paramName: string, rawValue: string, paramType: string) => {
      const value = parseParamValue(rawValue, paramType);
      const existingIndex = transform.parameters.findIndex((p) => p.name === paramName);
      let newParams: TransformParameterValue[];
      if (existingIndex >= 0) {
        newParams = transform.parameters.map((p, i) =>
          i === existingIndex ? { ...p, value } : p,
        );
      } else {
        newParams = [
          ...transform.parameters,
          { name: paramName, value, type: paramType },
        ];
      }
      onUpdate({ ...transform, parameters: newParams });
    },
    [transform, onUpdate],
  );

  const handleAddVariadicParam = useCallback(() => {
    // For variadic params, add another entry with the variadic param's name + index
    const variadicDef = additionalParamDefs.find((p) => p.variadic);
    if (!variadicDef) return;
    const existingVariadic = transform.parameters.filter((p) =>
      p.name.startsWith(variadicDef.name),
    );
    const newName = `${variadicDef.name}${existingVariadic.length + 1}`;
    onUpdate({
      ...transform,
      parameters: [
        ...transform.parameters,
        { name: newName, value: '', type: variadicDef.type },
      ],
    });
  }, [additionalParamDefs, transform, onUpdate]);

  const hasVariadic = additionalParamDefs.some((p) => p.variadic);

  return (
    <div
      className="rounded-md border border-zinc-700 bg-zinc-800/60 p-3 space-y-3"
      data-testid={`transform-step-${stepIndex}`}
    >
      {/* Header row: step badge + function name + reorder + remove */}
      <div className="flex items-center gap-2">
        {/* Step number badge */}
        <span
          className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-700 text-white text-xs font-bold flex items-center justify-center"
          aria-label={`Step ${stepIndex + 1}`}
        >
          {stepIndex + 1}
        </span>

        {/* Function name */}
        <span className="font-mono text-sm font-semibold text-blue-300 flex-1">
          {transform.functionName}
        </span>

        {/* Reorder buttons */}
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label={`Move step ${stepIndex + 1} up`}
          className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
          data-testid={`transform-step-move-up-${stepIndex}`}
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label={`Move step ${stepIndex + 1} down`}
          className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
          data-testid={`transform-step-move-down-${stepIndex}`}
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        {/* Remove button */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove step ${stepIndex + 1}: ${transform.functionName}`}
          className="p-1 rounded text-zinc-400 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
          data-testid={`transform-step-remove-${stepIndex}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Auto-wired first parameter (read-only) */}
      <div className="space-y-1">
        <label className="text-xs text-zinc-500 flex items-center gap-1">
          <Lock className="h-3 w-3" aria-hidden="true" />
          {catalogEntry?.parameters[0]?.name ?? 'value'}
          <span className="text-zinc-600 ml-1">(auto-wired)</span>
        </label>
        <div
          className="w-full bg-zinc-900/60 border border-zinc-700 rounded px-3 py-1.5 text-xs font-mono text-zinc-500 italic cursor-not-allowed"
          aria-label={`Auto-wired input: ${inputDescription}`}
          data-testid={`transform-step-autowired-${stepIndex}`}
        >
          {inputDescription}
        </div>
      </div>

      {/* Additional parameter inputs */}
      {additionalParamDefs.map((paramDef) => {
        if (paramDef.variadic) return null; // handled separately below
        const existing = transform.parameters.find((p) => p.name === paramDef.name);
        const rawValue =
          existing !== undefined
            ? paramDef.type === 'boolean'
              ? String(existing.value)
              : String(existing.value ?? '')
            : paramDef.type === 'boolean'
              ? 'false'
              : '';
        const inputType = getParamInputType(paramDef.type);

        return (
          <div key={paramDef.name} className="space-y-1">
            <label
              htmlFor={`param-${stepIndex}-${paramDef.name}`}
              className="text-xs text-zinc-400 flex items-center gap-1"
            >
              {paramDef.name}
              <span className="text-xs font-mono text-zinc-600">({paramDef.type})</span>
              {paramDef.required ? (
                <span className="text-red-400 ml-0.5" aria-label="required">*</span>
              ) : (
                <span className="text-zinc-600 ml-0.5">(optional)</span>
              )}
            </label>
            {inputType === 'checkbox' ? (
              <select
                id={`param-${stepIndex}-${paramDef.name}`}
                value={rawValue}
                onChange={(e) => { handleParamChange(paramDef.name, e.target.value, paramDef.type); }}
                aria-label={`${paramDef.name} parameter`}
                className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                data-testid={`transform-step-param-${paramDef.name}`}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                id={`param-${stepIndex}-${paramDef.name}`}
                type={inputType}
                value={rawValue}
                onChange={(e) => { handleParamChange(paramDef.name, e.target.value, paramDef.type); }}
                aria-label={`${paramDef.name} parameter`}
                placeholder={paramDef.type === 'number' ? '0' : `Enter ${paramDef.name}…`}
                className="w-full bg-zinc-800 border border-zinc-600 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
                data-testid={`transform-step-param-${paramDef.name}`}
              />
            )}
          </div>
        );
      })}

      {/* Variadic additional params (e.g. concat's rest args) */}
      {hasVariadic && (() => {
        const variadicDef = additionalParamDefs.find((p) => p.variadic)!;
        const variadicParams = transform.parameters.filter((p) =>
          p.name.startsWith(variadicDef.name),
        );
        return (
          <div className="space-y-2">
            {variadicParams.map((param, vi) => (
              <div key={param.name} className="space-y-1">
                <label
                  htmlFor={`param-${stepIndex}-${param.name}`}
                  className="text-xs text-zinc-400"
                >
                  {variadicDef.name} {vi + 1}
                  <span className="text-xs font-mono text-zinc-600 ml-1">({variadicDef.type})</span>
                </label>
                <input
                  id={`param-${stepIndex}-${param.name}`}
                  type="text"
                  value={String(param.value ?? '')}
                  onChange={(e) => { handleParamChange(param.name, e.target.value, variadicDef.type); }}
                  aria-label={`${variadicDef.name} ${vi + 1} parameter`}
                  placeholder={`Enter ${variadicDef.name}…`}
                  className="w-full bg-zinc-800 border border-zinc-600 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
                  data-testid={`transform-step-param-${param.name}`}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddVariadicParam}
              className="text-xs text-blue-400 hover:text-blue-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
              data-testid={`transform-step-add-variadic-${stepIndex}`}
            >
              + Add argument
            </button>
          </div>
        );
      })()}
    </div>
  );
}
