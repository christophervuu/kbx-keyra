/**
 * source-card-expression-generator.ts
 *
 * Generates valid DSL expression strings from the FS-029 SourceCardValueModeState
 * tree model (T-07).
 *
 * Entry point:
 *   generateExpressionFromSourceCardState(state) → string | null
 *
 * Returns null for incomplete/invalid states (PendingConnector, required slots
 * empty). Returns a valid DSL string for all complete states.
 *
 * State → DSL mapping:
 *   DirectCopy              → source("path")
 *   SourceWithTransform     → stepN(…step1(source("path"), arg2)…, argN)
 *   FunctionCall            → fn(slot1, slot2, ...)
 *   PendingConnector        → null  (incomplete)
 *
 * Slot resolution:
 *   source (no transform)   → source("path")
 *   source + transform      → chain of stepN(…step1(source("path"))…)
 *   literal                 → quoted string, bare number, bare boolean
 *   expression              → recursive generation of nested ArgumentFormNode
 */

import type {
  ArgumentFormNode,
  ArgumentSlot,
  InlineTransform,
  SourceCardValueModeState,
} from './expression-builder-state';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escapes and double-quotes a string for DSL output.
 * Handles backslash and double-quote escaping.
 */
function quoteString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Converts a raw literal string value to its DSL representation.
 *
 * Heuristic type detection:
 *   - "true" / "false" → bare boolean
 *   - parseable finite number → bare number
 *   - everything else → quoted string
 *
 * This matches the engine's literal parsing behaviour for argument slots.
 */
function literalToDsl(value: string): string {
  if (value === 'true' || value === 'false') return value;
  // Preserve whitespace literals (e.g. " ") as strings instead of coercing to 0.
  const trimmed = value.trim();
  const asNumber = Number(trimmed);
  if (trimmed !== '' && isFinite(asNumber)) return String(asNumber);
  return quoteString(value);
}

/**
 * Generates the DSL for a single ArgumentSlot.
 * Returns null if the slot is incomplete (empty source path, empty required literal).
 */
function generateSlot(slot: ArgumentSlot): string | null {
  switch (slot.mode) {
    case 'source': {
      const sourceExpr = `source(${quoteString(slot.path)})`;
      if (slot.transform !== undefined) {
        return generateInlineTransform(slot.path, slot.transform);
      }
      return sourceExpr;
    }
    case 'literal': {
      // Empty literal is allowed (e.g. empty string separator in concat)
      return literalToDsl(slot.value);
    }
    case 'expression': {
      return generateArgumentFormNode(slot.node);
    }
  }
}

/**
 * Generates the DSL for an inline transform chain applied to a source.
 *
 * Iterates through `transform.steps` sequentially, each step wrapping the
 * previous expression as its implicit first argument.
 *
 * Single step:  upper(source("firstName"))
 * Multi-step:   round(multiply(divide(source("x"), source("y")), 100), 2)
 *
 * Returns null if steps is empty or any argument slot fails to generate.
 */
function generateInlineTransform(sourcePath: string, transform: InlineTransform): string | null {
  if (transform.steps.length === 0) return null;

  let expression = `source(${quoteString(sourcePath)})`;

  for (const step of transform.steps) {
    const extraArgs: string[] = [];
    for (const arg of step.args) {
      const generated = generateSlot(arg);
      if (generated === null) return null;
      extraArgs.push(generated);
    }
    expression = `${step.functionName}(${[expression, ...extraArgs].join(', ')})`;
  }

  return expression;
}

/**
 * Generates the DSL for an ArgumentFormNode (a function call with slots).
 * Returns null if any slot fails to generate.
 */
function generateArgumentFormNode(node: ArgumentFormNode): string | null {
  const argStrings: string[] = [];

  for (const slot of node.slots) {
    const generated = generateSlot(slot);
    if (generated === null) return null;
    argStrings.push(generated);
  }

  return `${node.functionName}(${argStrings.join(', ')})`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a DSL expression string from a SourceCardValueModeState.
 *
 * Returns null for:
 *   - PendingConnector (no combining function selected yet)
 *   - Any state with an incomplete/unresolvable slot
 *
 * @pure — no side effects, deterministic output for a given input.
 */
export function generateExpressionFromSourceCardState(
  state: SourceCardValueModeState,
): string | null {
  switch (state.variant) {
    case 'directCopy': {
      if (state.sourcePath === '') return null;
      return `source(${quoteString(state.sourcePath)})`;
    }

    case 'sourceWithTransform': {
      if (state.sourcePath === '') return null;
      return generateInlineTransform(state.sourcePath, state.transform);
    }

    case 'functionCall': {
      return generateArgumentFormNode(state.node);
    }

    case 'pendingConnector': {
      // Incomplete — no combining function selected
      return null;
    }
  }
}
