import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { useEngineValidation } from './use-engine-validation';

import type { MappingConfig } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const createMockConfig = (ruleCount = 3): MappingConfig => ({
  id: 'mapping-1',
  projectId: 'project-1',
  name: 'Test Mapping',
  version: 1,
  engineVersion: '1.0.0',
  sourceSchemaRef: { schemaId: 'source-1', type: 'local' },
  targetSchemaRef: { schemaId: 'target-1', type: 'local' },
  config: {
    unmappedTargets: 'omit',
    constants: {},
    externalSources: [],
    nullSubtrees: [],
  },
  rules: Array.from({ length: ruleCount }, (_, i) => ({
    target: `field${i}`,
    type: 'string' as const,
    expression: `source("src${i}")`,
  })),
});

const createSimpleSchema = () => ({
  type: 'object',
  properties: {
    src0: { type: 'string' },
    src1: { type: 'string' },
    src2: { type: 'string' },
  },
});

const createTargetSchema = () => ({
  type: 'object',
  properties: {
    field0: { type: 'string' },
    field1: { type: 'string' },
    field2: { type: 'string' },
  },
  required: ['field0', 'field1', 'field2'],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEngineValidation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null result when config is null', () => {
    const { result } = renderHook(() =>
      useEngineValidation(null, createSimpleSchema(), createTargetSchema()),
    );

    expect(result.current.result).toBeNull();
    expect(result.current.isValidating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.coveragePercent).toBe(0);
    expect(result.current.summary).toEqual({
      total: 0,
      valid: 0,
      warnings: 0,
      errors: 0,
    });
  });

  it('returns null result when sourceSchema is null', () => {
    const { result } = renderHook(() =>
      useEngineValidation(createMockConfig(), null, createTargetSchema()),
    );

    expect(result.current.result).toBeNull();
    expect(result.current.isValidating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('returns null result when targetSchema is null', () => {
    const { result } = renderHook(() =>
      useEngineValidation(createMockConfig(), createSimpleSchema(), null),
    );

    expect(result.current.result).toBeNull();
    expect(result.current.isValidating).toBe(false);
  });

  it('marks isValidating true during debounce window', () => {
    const config = createMockConfig();
    const sourceSchema = createSimpleSchema();
    const targetSchema = createTargetSchema();

    const { result } = renderHook(() =>
      useEngineValidation(config, sourceSchema, targetSchema),
    );

    // During debounce window, isValidating should be true
    expect(result.current.isValidating).toBe(true);
    expect(result.current.result).toBeNull();
  });

  it('debounces: produces result after 300ms', async () => {
    const config = createMockConfig();
    const sourceSchema = createSimpleSchema();
    const targetSchema = createTargetSchema();

    const { result } = renderHook(() =>
      useEngineValidation(config, sourceSchema, targetSchema),
    );

    // Before debounce fires
    expect(result.current.result).toBeNull();
    expect(result.current.isValidating).toBe(true);

    // After debounce fires
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.result).not.toBeNull();
    expect(result.current.isValidating).toBe(false);
    expect(result.current.result?.valid).toBeDefined();
    expect(result.current.result?.diagnostics).toBeDefined();
  });

  it('debounces: rapid config changes result in single validate call', async () => {
    const config1 = createMockConfig(2);
    const config2 = createMockConfig(3);
    const config3 = createMockConfig(4);
    const sourceSchema = createSimpleSchema();
    const targetSchema = createTargetSchema();

    // Start with config1
    const { result, rerender } = renderHook(
      ({ config }) => useEngineValidation(config, sourceSchema, targetSchema),
      { initialProps: { config: config1 } },
    );

    // Advance 100ms — still debouncing
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Change to config2
    rerender({ config: config2 });

    // Advance 100ms — still debouncing from config2 change
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Change to config3
    rerender({ config: config3 });

    // Only 100ms from config3 — not yet validated
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.result).toBeNull();

    // Complete debounce from config3 (200ms more from last change)
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Now validation has run with config3 (4 rules)
    expect(result.current.result).not.toBeNull();
    expect(result.current.isValidating).toBe(false);
    expect(result.current.summary.total).toBe(4);
  });

  it('returns diagnostics filtered by ruleIndex', async () => {
    // Use a config with an invalid source path to generate a diagnostic
    const config: MappingConfig = {
      ...createMockConfig(2),
      rules: [
        { target: 'field0', type: 'string', expression: 'source("valid")' },
        { target: 'field1', type: 'string', expression: 'source("nonExistent")' },
      ],
    };

    const sourceSchema = {
      type: 'object',
      properties: {
        valid: { type: 'string' },
      },
    };
    const targetSchema = createTargetSchema();

    const { result } = renderHook(() =>
      useEngineValidation(config, sourceSchema, targetSchema),
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Rule 0 should have fewer/no errors (valid path)
    const rule0Diagnostics = result.current.diagnosticsForRule(0);
    // Rule 1 should have an error (nonExistent path)
    const rule1Diagnostics = result.current.diagnosticsForRule(1);

    // nonExistent should produce KEYRA-E030
    const hasE030 = rule1Diagnostics.some((d) => d.code === 'KEYRA-E030');
    expect(hasE030).toBe(true);

    // Rule 0 should not have E030 for nonExistent
    const rule0HasE030 = rule0Diagnostics.some(
      (d) => d.code === 'KEYRA-E030' && d.expression === 'source("nonExistent")',
    );
    expect(rule0HasE030).toBe(false);
  });

  it('computes summary correctly with errors and warnings', async () => {
    // Config with a rule that will produce an error (invalid source path)
    const config: MappingConfig = {
      ...createMockConfig(3),
      rules: [
        { target: 'field0', type: 'string', expression: 'source("src0")' },
        { target: 'field1', type: 'string', expression: 'source("invalid_path")' },
        { target: 'field0', type: 'string', expression: 'source("src2")' }, // duplicate target → warning
      ],
    };

    const sourceSchema = createSimpleSchema();
    const targetSchema = createTargetSchema();

    const { result } = renderHook(() =>
      useEngineValidation(config, sourceSchema, targetSchema),
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // We should have diagnostics
    expect(result.current.result).not.toBeNull();
    expect(result.current.summary.total).toBe(3);
    // At least one error (invalid source path on rule 1)
    expect(result.current.summary.errors).toBeGreaterThanOrEqual(1);
  });

  it('computes coveragePercent from result', async () => {
    const config = createMockConfig(3);
    const sourceSchema = createSimpleSchema();
    const targetSchema = createTargetSchema();

    const { result } = renderHook(() =>
      useEngineValidation(config, sourceSchema, targetSchema),
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Coverage should be defined (target schema has required fields)
    expect(result.current.coveragePercent).toBeGreaterThanOrEqual(0);
    expect(result.current.coveragePercent).toBeLessThanOrEqual(100);
  });

  it('handles engine error gracefully without throwing', async () => {
    // Pass an invalid config structure that might cause the engine to error
    // The engine's validate wraps errors internally, but let's test with a config
    // that exercises our adapter with edge cases
    const config: MappingConfig = {
      id: 'test',
      projectId: 'test',
      name: 'Test',
      version: 1,
      engineVersion: '1.0.0',
      sourceSchemaRef: { schemaId: 's1', type: 'local' },
      targetSchemaRef: { schemaId: 't1', type: 'local' },
      config: {},
      rules: [
        { target: 'a', type: 'string', expression: 'source("x")' },
      ],
    };

    // Even with minimal schemas, it should not throw
    const { result } = renderHook(() =>
      useEngineValidation(config, { type: 'object' }, { type: 'object' }),
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Should produce a result or an error, but never throw to the component
    expect(result.current.error).toBeNull();
    expect(result.current.result).not.toBeNull();
  });

  it('clears result when config becomes null', async () => {
    const config = createMockConfig();
    const sourceSchema = createSimpleSchema();
    const targetSchema = createTargetSchema();

    const { result, rerender } = renderHook(
      ({ cfg }) => useEngineValidation(cfg, sourceSchema, targetSchema),
      { initialProps: { cfg: config as MappingConfig | null } },
    );

    // Let validation complete
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.result).not.toBeNull();

    // Set config to null
    rerender({ cfg: null });

    expect(result.current.result).toBeNull();
    expect(result.current.isValidating).toBe(false);
    expect(result.current.summary.total).toBe(0);
  });

  it('returns empty diagnostics array for non-existent rule index', async () => {
    const config = createMockConfig(2);
    const sourceSchema = createSimpleSchema();
    const targetSchema = createTargetSchema();

    const { result } = renderHook(() =>
      useEngineValidation(config, sourceSchema, targetSchema),
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Rule index 99 doesn't exist — should return empty array
    const diagnostics = result.current.diagnosticsForRule(99);
    expect(diagnostics).toHaveLength(0);
  });

  it('handles config with description field on rules', async () => {
    const config: MappingConfig = {
      ...createMockConfig(1),
      rules: [
        {
          target: 'field0',
          type: 'string',
          expression: 'source("src0")',
          description: 'Copy source field 0',
        },
      ],
    };
    const sourceSchema = createSimpleSchema();
    const targetSchema = createTargetSchema();

    const { result } = renderHook(() =>
      useEngineValidation(config, sourceSchema, targetSchema),
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Should not error — description is passed through to engine
    expect(result.current.error).toBeNull();
    expect(result.current.result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration smoke test
// ---------------------------------------------------------------------------

describe('engine integration smoke test', () => {
  it('imports validate from lib/engine and returns ValidationResult', async () => {
    const { validateMapping: validateFn } = await import('@/lib/engine');

    const config: MappingConfig = {
      name: 'Smoke Test',
      version: 1,
      engineVersion: '1.0.0',
      sourceSchemaRef: { schemaId: 's', type: 'local' },
      targetSchemaRef: { schemaId: 't', type: 'local' },
      config: { unmappedTargets: 'omit' },
      rules: [
        { target: 'output', type: 'string', expression: 'static("hello")' },
      ],
    };

    const sourceSchema = { type: 'object', properties: {} };
    const targetSchema = {
      type: 'object',
      properties: { output: { type: 'string' } },
    };

    const result = validateFn(config, sourceSchema, targetSchema);

    expect(result).toBeDefined();
    expect(result.valid).toBeDefined();
    expect(result.diagnostics).toBeDefined();
    expect(Array.isArray(result.diagnostics)).toBe(true);
  });
});
