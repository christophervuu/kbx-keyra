import { describe, expect, it } from 'vitest';

import { getChainOutputType, getCompatibleChainableTransforms } from './transform-chain-utils';
import type { TransformChainStep } from './expression-builder-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function step(functionName: string): TransformChainStep {
  return { functionName, args: [] };
}

// ---------------------------------------------------------------------------
// getChainOutputType
// ---------------------------------------------------------------------------

describe('getChainOutputType', () => {
  it('returns "any" when steps are empty and no sourceType is given', () => {
    expect(getChainOutputType([])).toBe('any');
  });

  it('returns sourceType when steps are empty and sourceType is provided', () => {
    expect(getChainOutputType([], 'number')).toBe('number');
    expect(getChainOutputType([], 'string')).toBe('string');
  });

  it('returns "number" when last step is divide', () => {
    expect(getChainOutputType([step('divide')])).toBe('number');
  });

  it('returns "number" when last step is multiply (after upper)', () => {
    expect(getChainOutputType([step('upper'), step('multiply')])).toBe('number');
  });

  it('returns "string" when last step is upper', () => {
    expect(getChainOutputType([step('upper')])).toBe('string');
  });

  it('returns "string" when last step is lower', () => {
    expect(getChainOutputType([step('lower')])).toBe('string');
  });

  it('returns "string" when last step is trim', () => {
    expect(getChainOutputType([step('trim')])).toBe('string');
  });

  it('returns "number" when last step is round', () => {
    expect(getChainOutputType([step('round')])).toBe('number');
  });

  it('returns "any" when last step is an unknown function', () => {
    expect(getChainOutputType([step('nonExistentFn')])).toBe('any');
  });

  it('ignores sourceType when steps are non-empty', () => {
    // sourceType is "string" but last step is divide → number
    expect(getChainOutputType([step('divide')], 'string')).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// getCompatibleChainableTransforms
// ---------------------------------------------------------------------------

describe('getCompatibleChainableTransforms', () => {
  it('returns all chainable transforms when outputType is "any"', () => {
    const all = getCompatibleChainableTransforms('any');
    const names = all.map((e) => e.name);
    // Should include both string and number chainable transforms
    expect(names).toContain('upper');
    expect(names).toContain('lower');
    expect(names).toContain('trim');
    expect(names).toContain('multiply');
    expect(names).toContain('round');
    expect(names).toContain('abs');
    // Should not include non-chainable functions
    expect(names).not.toContain('concat');
    expect(names).not.toContain('if');
    expect(names).not.toContain('source');
  });

  it('includes number-compatible transforms and excludes string-only ones when outputType is "number"', () => {
    const result = getCompatibleChainableTransforms('number');
    const names = result.map((e) => e.name);
    // Number-accepting chainable transforms
    expect(names).toContain('multiply');
    expect(names).toContain('round');
    expect(names).toContain('abs');
    // String-only transforms must be excluded
    expect(names).not.toContain('upper');
    expect(names).not.toContain('lower');
    expect(names).not.toContain('trim');
  });

  it('includes string-compatible transforms and excludes number-only ones when outputType is "string"', () => {
    const result = getCompatibleChainableTransforms('string');
    const names = result.map((e) => e.name);
    // String-accepting chainable transforms
    expect(names).toContain('upper');
    expect(names).toContain('lower');
    expect(names).toContain('trim');
    // Number-only transforms must be excluded
    expect(names).not.toContain('round');
    expect(names).not.toContain('abs');
  });

  it('returns only chainable transforms (never non-chainable functions)', () => {
    const result = getCompatibleChainableTransforms('any');
    const names = result.map((e) => e.name);
    // Non-chainable functions must never appear
    expect(names).not.toContain('concat');
    expect(names).not.toContain('if');
    expect(names).not.toContain('eq');
    expect(names).not.toContain('valueMap');
  });

  it('returns an empty array when outputType has no compatible chainable transforms', () => {
    // "boolean" is not accepted by any chainable transform's first param
    const result = getCompatibleChainableTransforms('boolean');
    expect(result.length).toBe(0);
  });
});
