import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { validateMapping } from '@/lib/engine';
import type { CoverageResult, Diagnostic, ValidationResult } from '@/lib/engine';
import type { MappingConfig } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationSummary {
  readonly total: number;
  readonly valid: number;
  readonly warnings: number;
  readonly errors: number;
}

export interface EngineValidationState {
  /** Full validation result from the engine, or null if not yet validated */
  readonly result: ValidationResult | null;
  /** True while a validation call is pending (during debounce window) */
  readonly isValidating: boolean;
  /** Error message if validation threw unexpectedly */
  readonly error: string | null;
  /** Get diagnostics for a specific rule by index */
  readonly diagnosticsForRule: (ruleIndex: number) => readonly Diagnostic[];
  /** Coverage percentage (0-100), or 0 if coverage unavailable */
  readonly coveragePercent: number;
  /** Aggregated summary counts */
  readonly summary: ValidationSummary;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;

const EMPTY_DIAGNOSTICS: readonly Diagnostic[] = [];

const EMPTY_SUMMARY: ValidationSummary = {
  total: 0,
  valid: 0,
  warnings: 0,
  errors: 0,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Debounced hook that validates a MappingConfig against source and target schemas
 * using the mapping engine's validate() function.
 *
 * Validation is skipped when:
 * - config is null
 * - sourceSchema is null
 * - targetSchema is null
 *
 * The hook debounces validation calls by 300ms after the last input change
 * to avoid excessive engine calls during rapid editing.
 *
 * @param config - UI MappingConfig or null if not yet loaded
 * @param sourceSchema - Raw JSON Schema object (or XSD string) or null if unavailable
 * @param targetSchema - Raw JSON Schema object (or XSD string) or null if unavailable
 */
export function useEngineValidation(
  config: MappingConfig | null,
  sourceSchema: unknown | null,
  targetSchema: unknown | null,
): EngineValidationState {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trigger debounced validation when inputs change
  useEffect(() => {
    // Clear any pending debounce
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // If inputs are not ready, clear state immediately
    if (config === null || sourceSchema === null || targetSchema === null) {
      setResult(null); // eslint-disable-line react-hooks/set-state-in-effect
      setIsValidating(false);
      setError(null);
      return;
    }

    // Mark as validating during debounce window
    setIsValidating(true);

    // Schedule validation after debounce
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      try {
        const validationResult = validateMapping(config, sourceSchema, targetSchema);
        setResult(validationResult);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Validation failed \u2014 internal error',
        );
        setResult(null);
      } finally {
        setIsValidating(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [config, sourceSchema, targetSchema]);

  // Compute per-rule diagnostic lookup function
  const diagnosticsForRule = useCallback(
    (ruleIndex: number): readonly Diagnostic[] => {
      if (result === null) {
        return EMPTY_DIAGNOSTICS;
      }
      return result.diagnostics.filter((d) => d.ruleIndex === ruleIndex);
    },
    [result],
  );

  // Compute coverage percentage
  const coveragePercent = useMemo<number>(() => {
    if (result?.coverage === undefined) {
      return 0;
    }
    return result.coverage.percentage;
  }, [result]);

  // Compute summary
  const summary = useMemo<ValidationSummary>(() => {
    if (config === null) {
      return EMPTY_SUMMARY;
    }

    const total = config.rules.length;

    if (result === null) {
      return { total, valid: total, warnings: 0, errors: 0 };
    }

    // Count rules with errors and warnings
    const rulesWithErrors = new Set<number>();
    const rulesWithWarnings = new Set<number>();

    for (const diagnostic of result.diagnostics) {
      if (diagnostic.ruleIndex !== undefined) {
        if (diagnostic.severity === 'error') {
          rulesWithErrors.add(diagnostic.ruleIndex);
        } else if (diagnostic.severity === 'warning') {
          rulesWithWarnings.add(diagnostic.ruleIndex);
        }
      }
    }

    // A rule with both error and warning counts as error only
    const errors = rulesWithErrors.size;
    const warningsOnly = new Set(
      [...rulesWithWarnings].filter((idx) => !rulesWithErrors.has(idx)),
    );
    const warnings = warningsOnly.size;
    const valid = total - errors - warnings;

    return { total, valid, warnings, errors };
  }, [config, result]);

  return {
    result,
    isValidating,
    error,
    diagnosticsForRule,
    coveragePercent,
    summary,
  };
}

// Re-export types for consumer convenience
export type { ValidationResult, Diagnostic, CoverageResult };
