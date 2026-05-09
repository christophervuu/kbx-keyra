/**
 * PARAMETER_HINTS registry — maps (functionName, parameterName) pairs to
 * contextual hint configurations for the FS-029 Argument Form.
 *
 * Format token suggestions are derived from the engine's exported
 * SUPPORTED_FORMAT_TOKENS and FORMAT_PRESETS so the UI stays in sync with
 * what the engine actually supports.
 *
 * Consumed by: ArgumentForm.tsx (T-03), replacing PARAMETER_HINTS_STUB.
 */

import { FORMAT_PRESETS, SUPPORTED_FORMAT_TOKENS } from '@keyra/engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A strict enum hint — the user must pick one of the provided options.
 * Renders as a <select> dropdown with no freeform input.
 */
export interface EnumParameterHint {
  readonly type: 'enum';
  readonly options: readonly string[];
}

/**
 * A token hint — the user can pick from token presets or type a custom format.
 * Renders as a <select> dropdown (presets) with an optional freeform fallback.
 */
export interface TokenParameterHint {
  readonly type: 'tokens';
  /** Individual format tokens (e.g. YYYY, MM, DD, ISO8601). */
  readonly tokens: readonly string[];
  /** Common format compositions offered as quick-pick presets. */
  readonly presets: readonly string[];
  /** Whether the user can also type a freeform value. Defaults to true. */
  readonly allowFreeform?: boolean;
}

export type ParameterHint = EnumParameterHint | TokenParameterHint;

/**
 * Registry shape: functionName → parameterName → ParameterHint.
 */
export type ParameterHintsRegistry = Readonly<Record<string, Readonly<Record<string, ParameterHint>>>>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Central registry of parameter hints for DSL functions.
 * Add new entries here when a function parameter has known values or
 * token-based suggestions.
 */
export const PARAMETER_HINTS: ParameterHintsRegistry = {
  formatDate: {
    inputFormat: {
      type: 'tokens',
      tokens: SUPPORTED_FORMAT_TOKENS,
      presets: FORMAT_PRESETS,
      allowFreeform: true,
    },
    outputFormat: {
      type: 'tokens',
      tokens: SUPPORTED_FORMAT_TOKENS,
      presets: FORMAT_PRESETS,
      allowFreeform: true,
    },
  },
  cast: {
    targetType: {
      type: 'enum',
      options: ['string', 'number', 'boolean'],
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the ParameterHint for a given (functionName, parameterName) pair,
 * or undefined if no hint is registered.
 */
export function getParameterHint(
  functionName: string,
  parameterName: string,
): ParameterHint | undefined {
  return PARAMETER_HINTS[functionName]?.[parameterName];
}

/**
 * Converts a ParameterHint to the SlotHint shape expected by ArgumentSlotInput.
 * For token hints, the presets are used as the dropdown options.
 */
export function hintToSlotOptions(hint: ParameterHint): readonly string[] {
  if (hint.type === 'enum') return hint.options;
  return hint.presets;
}
