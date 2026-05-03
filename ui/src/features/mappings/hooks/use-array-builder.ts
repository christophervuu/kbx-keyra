import { useCallback, useState } from 'react';

import { generateArrayExpression } from '../lib/array-expression-generator';
import type { ArrayBuilderState, ArrayPattern, FieldMapping } from '../lib/array-expression-generator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArrayBuilderStep = 1 | 2 | 3 | 4;

export interface UseArrayBuilderResult {
  currentStep: ArrayBuilderStep;
  state: ArrayBuilderState;
  generatedExpression: string;
  /** Navigate to next step (if valid) */
  goNext: () => void;
  /** Navigate to previous step */
  goBack: () => void;
  /** Navigate to a specific step (only completed steps) */
  goToStep: (step: ArrayBuilderStep) => void;
  /** Set the source array path (Step 1) */
  setSourceArrayPath: (path: string) => void;
  /** Set the mapping pattern (Step 2) */
  setPattern: (pattern: ArrayPattern) => void;
  /** Add a field mapping (Step 3) */
  addFieldMapping: (mapping: FieldMapping) => void;
  /** Remove a field mapping by index (Step 3) */
  removeFieldMapping: (index: number) => void;
  /** Set raw expression (advanced mode) */
  setRawExpression: (expr: string) => void;
  /** Add an additional source path (merge-arrays pattern) */
  addAdditionalSource: (path: string) => void;
  /** Remove an additional source path by index */
  removeAdditionalSource: (index: number) => void;
  /** Whether Next is enabled for the current step */
  canGoNext: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const INITIAL_STATE: ArrayBuilderState = {
  sourceArrayPath: '',
  pattern: '1:1 map',
  fieldMappings: [],
  rawExpression: '',
  additionalSourcePaths: [],
};

export function useArrayBuilder(): UseArrayBuilderResult {
  const [currentStep, setCurrentStep] = useState<ArrayBuilderStep>(1);
  const [state, setState] = useState<ArrayBuilderState>(INITIAL_STATE);

  const generatedExpression = generateArrayExpression(state);

  // Step 2 is skipped (goes straight to Step 4) when pattern === 'advanced'
  const effectiveNextStep = useCallback(
    (step: ArrayBuilderStep): ArrayBuilderStep => {
      if (step === 2 && state.pattern === 'advanced') return 4;
      return Math.min(step + 1, 4) as ArrayBuilderStep;
    },
    [state.pattern],
  );

  const canGoNext: boolean = (() => {
    switch (currentStep) {
      case 1:
        return state.sourceArrayPath.trim().length > 0;
      case 2:
        return true; // pattern always has a default
      case 3:
        return state.pattern === 'advanced'
          ? state.rawExpression.trim().length > 0
          : true;
      case 4:
        return generatedExpression.trim().length > 0;
      default:
        return false;
    }
  })();

  const goNext = useCallback(() => {
    if (!canGoNext) return;
    setCurrentStep((s) => effectiveNextStep(s));
  }, [canGoNext, effectiveNextStep]);

  const goBack = useCallback(() => {
    setCurrentStep((s) => {
      if (s <= 1) return 1;
      // If we jumped from 2 to 4 (advanced), go back to 2
      if (s === 4 && state.pattern === 'advanced') return 2;
      return (s - 1) as ArrayBuilderStep;
    });
  }, [state.pattern]);

  const goToStep = useCallback((step: ArrayBuilderStep) => {
    setCurrentStep(step);
  }, []);

  const setSourceArrayPath = useCallback((path: string) => {
    setState((s) => ({ ...s, sourceArrayPath: path }));
  }, []);

  const setPattern = useCallback((pattern: ArrayPattern) => {
    setState((s) => ({ ...s, pattern }));
  }, []);

  const addFieldMapping = useCallback((mapping: FieldMapping) => {
    setState((s) => ({ ...s, fieldMappings: [...s.fieldMappings, mapping] }));
  }, []);

  const removeFieldMapping = useCallback((index: number) => {
    setState((s) => ({
      ...s,
      fieldMappings: s.fieldMappings.filter((_, i) => i !== index),
    }));
  }, []);

  const setRawExpression = useCallback((expr: string) => {
    setState((s) => ({ ...s, rawExpression: expr }));
  }, []);

  const addAdditionalSource = useCallback((path: string) => {
    setState((s) => ({
      ...s,
      additionalSourcePaths: [...s.additionalSourcePaths, path],
    }));
  }, []);

  const removeAdditionalSource = useCallback((index: number) => {
    setState((s) => ({
      ...s,
      additionalSourcePaths: s.additionalSourcePaths.filter((_, i) => i !== index),
    }));
  }, []);

  return {
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
    addAdditionalSource,
    removeAdditionalSource,
    canGoNext,
  };
}
