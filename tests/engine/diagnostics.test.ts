import { describe, expect, it } from 'vitest';

import {
  DIAGNOSTIC_CODES,
  formatDiagnosticMessage,
  type DiagnosticCode,
} from '../../src/engine/index.js';

describe('diagnostic codes', () => {
  it('includes all expected diagnostic codes with expected count', () => {
    const codes = Object.keys(DIAGNOSTIC_CODES);

    expect(codes).toHaveLength(34);
    expect(codes).toContain('KEYRA-E001');
    expect(codes).toContain('KEYRA-E060');
    expect(codes).toContain('KEYRA-E067');
    expect(codes).toContain('KEYRA-W005');
    expect(codes).toContain('KEYRA-W006');
  });

  it('includes value-table diagnostics registry coverage for FS-096', () => {
    expect(DIAGNOSTIC_CODES['KEYRA-E060'].messageTemplate).toContain('valueMap');
    expect(DIAGNOSTIC_CODES['KEYRA-E061'].messageTemplate).toContain('table key');
    expect(DIAGNOSTIC_CODES['KEYRA-E062'].messageTemplate).toContain('resolved entries');
    expect(DIAGNOSTIC_CODES['KEYRA-E063'].messageTemplate).toContain('must differ');
    expect(DIAGNOSTIC_CODES['KEYRA-E064'].messageTemplate).toContain('side/type mismatch');
    expect(DIAGNOSTIC_CODES['KEYRA-E065'].messageTemplate).toContain('duplicate input value');
    expect(DIAGNOSTIC_CODES['KEYRA-E066'].messageTemplate).toContain('fallbackValue');
    expect(DIAGNOSTIC_CODES['KEYRA-E067'].messageTemplate).toContain('fallback type mismatch');
    expect(DIAGNOSTIC_CODES['KEYRA-W003'].messageTemplate).toContain('no match');
  });

  it('uses warning severity for E012, E016, and E019', () => {
    expect(DIAGNOSTIC_CODES['KEYRA-E012'].severity).toBe('warning');
    expect(DIAGNOSTIC_CODES['KEYRA-E016'].severity).toBe('warning');
    expect(DIAGNOSTIC_CODES['KEYRA-E019'].severity).toBe('warning');
  });

  it('formats templates with interpolation', () => {
    const message = formatDiagnosticMessage('KEYRA-E002', { name: 'fooBar' });

    expect(message).toBe('Unknown function: `fooBar`');
  });

  it('keeps placeholders when params are missing', () => {
    const message = formatDiagnosticMessage('KEYRA-E003', {
      name: 'concat',
      expected: '2',
    });

    expect(message).toBe(
      'Wrong number of arguments for `concat`: expected 2, got {actual}',
    );
  });

  it('enforces DiagnosticCode as a literal union at compile time', () => {
    const validCode: DiagnosticCode = 'KEYRA-E001';

    expect(validCode).toBe('KEYRA-E001');

    // @ts-expect-error - arbitrary strings are not valid DiagnosticCode values.
    const invalidCode: DiagnosticCode = 'KEYRA-XYZ';

    expect(invalidCode).toBe('KEYRA-XYZ');
  });
});
