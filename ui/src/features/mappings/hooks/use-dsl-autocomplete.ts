/**
 * `useDslAutocomplete` — context-aware autocomplete hook for the raw DSL editor.
 *
 * Computes autocomplete context from the current expression and cursor position,
 * generates filtered suggestions, and manages dropdown open/close + keyboard navigation state.
 *
 * Responsibilities:
 * - Detect context (source-path / constant / external / function) on cursor/expression change
 * - Build suggestion list appropriate to the context
 * - Expose open/close, selectNext/selectPrev, confirm actions
 * - `confirm()` returns the text to insert and the expression range to replace;
 *   the caller (RawDslEditor) performs the actual insertion via its imperative ref
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import type { AutocompleteItem } from '@/lib/data/dsl-functions';
import type { ParsedSchema } from '@/lib/types/domain';

import {
  detectAutocompleteContext,
  filterSuggestions,
  flattenSchemaPaths,
} from '../lib/autocomplete-utils';
import type { AutocompleteContext } from '../lib/autocomplete-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfirmResult {
  /** Text to insert in place of the replaced range */
  readonly insertText: string;
  /** Start offset in expression to replace (inclusive) */
  readonly insertStart: number;
  /** End offset in expression to replace (exclusive) */
  readonly insertEnd: number;
}

export interface UseDslAutocompleteOptions {
  readonly expression: string;
  readonly cursorPosition: number;
  /** Source schema for field path suggestions; null when no schema is loaded */
  readonly parsedSourceSchema: ParsedSchema | null;
  /** Constant names from mapping config options */
  readonly constants?: readonly string[];
  /** External source names from mapping config options */
  readonly externalSources?: readonly string[];
}

export interface UseDslAutocompleteResult {
  readonly isOpen: boolean;
  readonly suggestions: AutocompleteItem[];
  readonly selectedIndex: number;
  readonly context: AutocompleteContext;
  /** Explicitly open the dropdown (e.g. on Ctrl+Space) */
  readonly open: () => void;
  /** Close the dropdown without committing */
  readonly close: () => void;
  /** Move selection down one item (wraps) */
  readonly selectNext: () => void;
  /** Move selection up one item (wraps) */
  readonly selectPrev: () => void;
  /**
   * Confirm the currently selected suggestion.
   * Returns the range+text to insert, or null if nothing is selected / dropdown closed.
   * Closes the dropdown as a side effect.
   */
  readonly confirm: () => ConfirmResult | null;
}

// ---------------------------------------------------------------------------
// Suggestion builders
// ---------------------------------------------------------------------------

function buildFunctionSuggestions(): AutocompleteItem[] {
  return DSL_FUNCTION_CATALOG.map((entry) => ({
    label: entry.name,
    insertText: `${entry.name}()`,
    detail: `${entry.category} (${entry.parameterCount} ${
      typeof entry.parameterCount === 'number' && entry.parameterCount === 1 ? 'arg' : 'args'
    })`,
    kind: 'function' as const,
  }));
}

function buildSourcePathSuggestions(schema: ParsedSchema | null): AutocompleteItem[] {
  if (schema === null) return [];
  return flattenSchemaPaths(schema).map((entry) => ({
    label: entry.path,
    insertText: entry.path,
    detail: entry.type,
    kind: 'field' as const,
  }));
}

function buildConstantSuggestions(constants: readonly string[]): AutocompleteItem[] {
  return constants.map((name) => ({
    label: name,
    insertText: name,
    detail: 'constant',
    kind: 'constant' as const,
  }));
}

function buildExternalSuggestions(externalSources: readonly string[]): AutocompleteItem[] {
  return externalSources.map((name) => ({
    label: name,
    insertText: name,
    detail: 'external source',
    kind: 'external' as const,
  }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDslAutocomplete({
  expression,
  cursorPosition,
  parsedSourceSchema,
  constants = [],
  externalSources = [],
}: UseDslAutocompleteOptions): UseDslAutocompleteResult {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Recompute context whenever expression or cursor changes
  const context = useMemo(
    () => detectAutocompleteContext(expression, cursorPosition),
    [expression, cursorPosition],
  );

  // Build unfiltered suggestion pool for the current context kind
  const suggestionPool = useMemo((): AutocompleteItem[] => {
    switch (context.kind) {
      case 'source-path':
        return buildSourcePathSuggestions(parsedSourceSchema);
      case 'constant':
        return buildConstantSuggestions(constants);
      case 'external':
        return buildExternalSuggestions(externalSources);
      case 'function':
        return buildFunctionSuggestions();
      case 'none':
        return [];
    }
  }, [context.kind, parsedSourceSchema, constants, externalSources]);

  // Apply prefix filtering
  const suggestions = useMemo(
    () => filterSuggestions(suggestionPool, context.prefix),
    [suggestionPool, context.prefix],
  );

  // When context/suggestions change, reset selection and auto-open if there
  // are relevant suggestions (contextual auto-trigger on typing)
  useEffect(() => {
    setSelectedIndex(0);
    if (context.kind !== 'none' && suggestions.length > 0) {
      // Auto-open when context is meaningful and there are matches
      setIsOpen(true);
    } else {
      // Close when there are no suggestions or context is none
      setIsOpen(false);
    }
  }, [context.kind, suggestions.length]);

  const open = useCallback(() => {
    if (suggestions.length > 0) {
      setIsOpen(true);
      setSelectedIndex(0);
    }
  }, [suggestions.length]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const selectNext = useCallback(() => {
    setSelectedIndex((prev) => (suggestions.length === 0 ? 0 : (prev + 1) % suggestions.length));
  }, [suggestions.length]);

  const selectPrev = useCallback(() => {
    setSelectedIndex((prev) =>
      suggestions.length === 0 ? 0 : (prev - 1 + suggestions.length) % suggestions.length,
    );
  }, [suggestions.length]);

  const confirm = useCallback((): ConfirmResult | null => {
    if (!isOpen || suggestions.length === 0) return null;
    const item = suggestions[selectedIndex];
    if (item === undefined) return null;

    // For string-context kinds (source-path, constant, external),
    // append a closing quote after the inserted value.
    const needsClosingQuote =
      context.kind === 'source-path' ||
      context.kind === 'constant' ||
      context.kind === 'external';

    const insertText = needsClosingQuote ? `${item.insertText}"` : item.insertText;

    setIsOpen(false);
    return {
      insertText,
      insertStart: context.insertStart,
      insertEnd: context.insertEnd,
    };
  }, [isOpen, suggestions, selectedIndex, context]);

  return {
    isOpen,
    suggestions,
    selectedIndex,
    context,
    open,
    close,
    selectNext,
    selectPrev,
    confirm,
  };
}
