import type { DiagnosticSeverity } from '../types/index.js';

interface DiagnosticCodeDefinition {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly messageTemplate: string;
}

export const DIAGNOSTIC_CODES = {
  'KEYRA-E001': {
    code: 'KEYRA-E001',
    severity: 'error',
    messageTemplate: 'Invalid syntax: {detail}',
  },
  'KEYRA-E002': {
    code: 'KEYRA-E002',
    severity: 'error',
    messageTemplate: 'Unknown function: `{name}`',
  },
  'KEYRA-E003': {
    code: 'KEYRA-E003',
    severity: 'error',
    messageTemplate:
      'Wrong number of arguments for `{name}`: expected {expected}, got {actual}',
  },
  'KEYRA-E004': {
    code: 'KEYRA-E004',
    severity: 'error',
    messageTemplate: 'Expression exceeds maximum nesting depth ({depth})',
  },
  'KEYRA-E005': {
    code: 'KEYRA-E005',
    severity: 'error',
    messageTemplate:
      'Type mismatch in `{function}`: expected `{expected}`, got `{actual}` for argument `{argName}`',
  },
  'KEYRA-E010': {
    code: 'KEYRA-E010',
    severity: 'error',
    messageTemplate: '`item()` used outside array context',
  },
  'KEYRA-E011': {
    code: 'KEYRA-E011',
    severity: 'error',
    messageTemplate: 'Undefined constant: `{name}`',
  },
  'KEYRA-E012': {
    code: 'KEYRA-E012',
    severity: 'warning',
    messageTemplate: 'External source not available: `{name}`',
  },
  'KEYRA-E013': {
    code: 'KEYRA-E013',
    severity: 'error',
    messageTemplate: '`parent()` used outside nested array context',
  },
  'KEYRA-E015': {
    code: 'KEYRA-E015',
    severity: 'error',
    messageTemplate: '`map()` template must be an object literal or an expression',
  },
  'KEYRA-E016': {
    code: 'KEYRA-E016',
    severity: 'warning',
    messageTemplate: '`filter()` produced empty array — all elements filtered out',
  },
  'KEYRA-E017': {
    code: 'KEYRA-E017',
    severity: 'error',
    messageTemplate: '`filter()`/`find()` condition must evaluate to a boolean',
  },
  'KEYRA-E018': {
    code: 'KEYRA-E018',
    severity: 'error',
    messageTemplate: '`get()` first argument must be an object, got `{type}`',
  },
  'KEYRA-E019': {
    code: 'KEYRA-E019',
    severity: 'warning',
    messageTemplate: '`find()` matched no elements — returning null',
  },
  'KEYRA-E020': {
    code: 'KEYRA-E020',
    severity: 'error',
    messageTemplate: 'Unsupported cast: `{fromType}` → `{toType}`',
  },
  'KEYRA-E021': {
    code: 'KEYRA-E021',
    severity: 'error',
    messageTemplate:
      'Unknown target type: `{targetType}`. Expected "string", "number", or "boolean"',
  },
  'KEYRA-E030': {
    code: 'KEYRA-E030',
    severity: 'error',
    messageTemplate: 'Source path not found in schema: `{path}`',
  },
  'KEYRA-E031': {
    code: 'KEYRA-E031',
    severity: 'error',
    messageTemplate: 'Target path not found in schema: `{path}`',
  },
  'KEYRA-E040': {
    code: 'KEYRA-E040',
    severity: 'error',
    messageTemplate:
      'Date parse failed: value `"{value}"` does not match format `"{format}"`',
  },
  'KEYRA-E050': {
    code: 'KEYRA-E050',
    severity: 'error',
    messageTemplate: 'Division by zero',
  },
  'KEYRA-E060': {
    code: 'KEYRA-E060',
    severity: 'error',
    messageTemplate: '`valueMap` mappings argument must be an object literal',
  },
  'KEYRA-W001': {
    code: 'KEYRA-W001',
    severity: 'warning',
    messageTemplate: 'Null propagation: `{function}` received null argument `{argName}`',
  },
  'KEYRA-W002': {
    code: 'KEYRA-W002',
    severity: 'warning',
    messageTemplate: 'Source path resolved to null at runtime: `{path}`',
  },
  'KEYRA-W003': {
    code: 'KEYRA-W003',
    severity: 'warning',
    messageTemplate: '`valueMap` no match for value `"{value}"` — returning fallback',
  },
  'KEYRA-W004': {
    code: 'KEYRA-W004',
    severity: 'warning',
    messageTemplate: 'Array index out of bounds: index `{index}`, array length `{length}`',
  },
  'KEYRA-W005': {
    code: 'KEYRA-W005',
    severity: 'warning',
    messageTemplate:
      'Required target field `{path}` has no mapping rule — defaulting to null',
  },
  'KEYRA-W006': {
    code: 'KEYRA-W006',
    severity: 'warning',
    messageTemplate: 'Duplicate target path: `{path}` is mapped by rules at indices {indices}',
  },
} as const satisfies Record<string, DiagnosticCodeDefinition>;

export type DiagnosticCode = keyof typeof DIAGNOSTIC_CODES;
