import { describe, expect, it } from 'vitest';
import { explainDiagnostic } from './failure-explainer';
import type { Diagnostic, TraceEntry } from '@keyra/engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiag(overrides: Partial<Diagnostic>): Diagnostic {
  return {
    code: 'KEYRA-E000',
    severity: 'error',
    message: 'Generic error',
    ...overrides,
  } as Diagnostic;
}

function makeTrace(overrides: Partial<TraceEntry> = {}): TraceEntry {
  return {
    ruleIndex: 0,
    targetPath: 'output.value',
    expression: 'source.field',
    inputValue: {},
    outputValue: 'some-value',
    ...overrides,
  } as TraceEntry;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('explainDiagnostic', () => {
  // -------------------------------------------------------------------------
  // Pattern 1: Null output with source resolution failure
  // -------------------------------------------------------------------------

  it('returns null-output-with-source explanation when outputValue is null and message mentions source', () => {
    const diag = makeDiag({ message: "Path 'source.missing' not found" });
    const trace = makeTrace({ outputValue: null });

    const result = explainDiagnostic(diag, trace);

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('source path resolved to no value');
    expect(result!.suggestion).toContain('default()');
  });

  it('returns null-output-with-source explanation when code contains SOURCE and outputValue is null', () => {
    const diag = makeDiag({ code: 'KEYRA-SOURCE-001', message: 'Field not found' });
    const trace = makeTrace({ outputValue: null });

    const result = explainDiagnostic(diag, trace);

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('source path resolved to no value');
  });

  // -------------------------------------------------------------------------
  // Pattern 2: Type mismatch
  // -------------------------------------------------------------------------

  it('returns type mismatch explanation when code contains TYPE_MISMATCH', () => {
    const diag = makeDiag({ code: 'KEYRA-TYPE_MISMATCH-001', message: 'Expected string, got number' });

    const result = explainDiagnostic(diag);

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('different type');
    expect(result!.suggestion).toContain('cast()');
  });

  it('returns type mismatch explanation when message contains "type mismatch"', () => {
    const diag = makeDiag({ message: 'Type mismatch: expected boolean' });

    const result = explainDiagnostic(diag);

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('different type');
  });

  // -------------------------------------------------------------------------
  // Pattern 3: Missing source path
  // -------------------------------------------------------------------------

  it('returns missing source path explanation when message mentions source not found', () => {
    const diag = makeDiag({ message: "source field 'firstName' not found in input" });

    const result = explainDiagnostic(diag);

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('source path referenced');
    expect(result!.suggestion).toContain('source()');
  });

  it('returns missing source path explanation when code contains PATH', () => {
    const diag = makeDiag({ code: 'KEYRA-PATH-NOT-FOUND', message: 'Path resolution failed' });

    const result = explainDiagnostic(diag);

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('source path referenced');
  });

  // -------------------------------------------------------------------------
  // Pattern 4: Unresolved function
  // -------------------------------------------------------------------------

  it('returns unresolved function explanation when message contains "unknown function"', () => {
    const diag = makeDiag({ message: 'Unknown function: toUppercase' });

    const result = explainDiagnostic(diag);

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('not recognized by the DSL');
    expect(result!.suggestion).toContain('DSL function reference');
  });

  it('returns unresolved function explanation when code contains FUNC', () => {
    const diag = makeDiag({ code: 'KEYRA-FUNC-UNKNOWN', message: 'Function not found' });

    const result = explainDiagnostic(diag);

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('not recognized by the DSL');
  });

  // -------------------------------------------------------------------------
  // Pattern 5: General null output
  // -------------------------------------------------------------------------

  it('returns general null output explanation when outputValue is null with no specific pattern', () => {
    const diag = makeDiag({ code: 'KEYRA-E999', message: 'Evaluation produced no value' });
    const trace = makeTrace({ outputValue: null });

    const result = explainDiagnostic(diag, trace);

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('evaluated to null');
    expect(result!.suggestion).toContain('test data');
  });

  // -------------------------------------------------------------------------
  // Pattern 6: No match
  // -------------------------------------------------------------------------

  it('returns null when no pattern matches', () => {
    const diag = makeDiag({ code: 'KEYRA-E000', message: 'Generic unrecognized error' });

    const result = explainDiagnostic(diag);

    expect(result).toBeNull();
  });

  it('returns null when no pattern matches and traceEntry has non-null output', () => {
    const diag = makeDiag({ code: 'KEYRA-E000', message: 'Some other error' });
    const trace = makeTrace({ outputValue: 'Alice' });

    const result = explainDiagnostic(diag, trace);

    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('works without traceEntry for non-trace-dependent patterns', () => {
    const diag = makeDiag({ message: 'Unknown function: myFunc' });

    // Should not throw
    const result = explainDiagnostic(diag, undefined);

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('not recognized by the DSL');
  });

  it('code-based match takes precedence over message-based match', () => {
    // Code says TYPE, message says "unknown function" — code wins
    const diag = makeDiag({
      code: 'KEYRA-TYPE_MISMATCH-001',
      message: 'Unknown function: cast',
    });

    const result = explainDiagnostic(diag);

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('different type');
  });
});
