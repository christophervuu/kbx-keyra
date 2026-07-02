import { describe, expect, it } from 'vitest';

import { execute, type MappingConfig } from '../../src/engine/index.js';

function createMinimalConfig(overrides?: Partial<MappingConfig>): MappingConfig {
  return {
    name: 'Minimal Mapping',
    version: 1,
    engineVersion: '1.1.0',
    sourceSchemaRef: {
      schemaId: 'source-schema',
      type: 'local',
    },
    targetSchemaRef: {
      schemaId: 'target-schema',
      type: 'local',
    },
    config: {
      unmappedTargets: 'omit',
      nullSubtrees: [],
      constants: {},
      externalSources: [],
      ...(overrides?.config ?? {}),
    },
    rules: overrides?.rules ?? [],
    ...overrides,
  };
}

describe('execute', () => {
  it('AE-00: empty rules return empty output and stats', () => {
    const result = execute(createMinimalConfig(), {}, {}, {});

    expect(result.output).toEqual({});
    expect(result.diagnostics).toEqual([]);
    expect(result.trace).toBeUndefined();
    expect(result.stats).toBeDefined();
    expect(result.stats?.rulesEvaluated).toBe(0);
    expect(result.stats?.rulesSucceeded).toBe(0);
    expect(result.stats?.rulesFailed).toBe(0);
    expect(result.stats?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns an empty trace when trace option is enabled', () => {
    const result = execute(createMinimalConfig(), {}, {}, {}, { trace: true });

    expect(result.output).toEqual({});
    expect(result.diagnostics).toEqual([]);
    expect(result.trace).toEqual([]);
    expect(result.stats).toBeDefined();
    expect(result.stats?.rulesEvaluated).toBe(0);
    expect(result.stats?.rulesSucceeded).toBe(0);
    expect(result.stats?.rulesFailed).toBe(0);
    expect(result.stats?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('AE-01: executes a single rule and maps source data to target path', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'OrderType',
          type: 'string',
          expression: 'source("type")',
        },
      ],
    });

    const result = execute(config, { type: 'PO' }, {}, {});

    expect(result.output).toEqual({
      OrderType: 'PO',
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.stats?.rulesEvaluated).toBe(1);
    expect(result.stats?.rulesSucceeded).toBe(1);
    expect(result.stats?.rulesFailed).toBe(0);
  });

  it('AE-02: executes multiple rules and creates nested target objects from dot-notation paths', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'Order.Header.DocType',
          type: 'string',
          expression: 'source("header.docType")',
        },
        {
          target: 'Order.Header.Date',
          type: 'string',
          expression: 'source("header.date")',
        },
      ],
    });

    const result = execute(
      config,
      {
        header: {
          docType: 'PO',
          date: '2026-01-01',
        },
      },
      {},
      {},
    );

    expect(result.output).toEqual({
      Order: {
        Header: {
          DocType: 'PO',
          Date: '2026-01-01',
        },
      },
    });
  });

  it('AE-03: applies last-write-wins for duplicate target paths', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'Status',
          type: 'string',
          expression: 'static("draft")',
        },
        {
          target: 'Status',
          type: 'string',
          expression: 'static("final")',
        },
      ],
    });

    const result = execute(config, {}, {}, {});

    expect(result.output).toEqual({
      Status: 'final',
    });
  });

  it('AE-04: continues execution when one rule has invalid syntax', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'Good',
          type: 'string',
          expression: 'static("ok")',
        },
        {
          target: 'Bad',
          type: 'string',
          expression: 'invalid!!!syntax',
        },
        {
          target: 'AlsoGood',
          type: 'string',
          expression: 'static("fine")',
        },
      ],
    });

    const result = execute(config, {}, {}, {});

    expect(result.output).toEqual({
      Good: 'ok',
      Bad: null,
      AlsoGood: 'fine',
    });
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'KEYRA-E001' &&
          diagnostic.ruleIndex === 1 &&
          diagnostic.targetPath === 'Bad' &&
          diagnostic.expression === 'invalid!!!syntax',
      ),
    ).toBe(true);
    expect(result.stats?.rulesEvaluated).toBe(3);
    expect(result.stats?.rulesSucceeded).toBe(2);
    expect(result.stats?.rulesFailed).toBe(1);
  });

  it('AE-05: continues execution after runtime evaluation error', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'A',
          type: 'number',
          expression: 'divide(10, 0)',
        },
        {
          target: 'B',
          type: 'string',
          expression: 'static("ok")',
        },
      ],
    });

    const result = execute(config, {}, {}, {});

    expect(result.output).toEqual({
      A: null,
      B: 'ok',
    });
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E050')).toBe(true);
    expect(result.stats?.rulesEvaluated).toBe(2);
    expect(result.stats?.rulesSucceeded).toBe(1);
    expect(result.stats?.rulesFailed).toBe(1);
  });

  it('AE-11: resolves external values from options.externalSources', () => {
    const config = createMinimalConfig({
      config: {
        unmappedTargets: 'omit',
        nullSubtrees: [],
        constants: {},
        externalSources: ['exchangeRate'],
      },
      rules: [
        {
          target: 'Rate',
          type: 'number',
          expression: 'external("exchangeRate")',
        },
      ],
    });

    const result = execute(config, {}, {}, {}, { externalSources: { exchangeRate: 1.25 } });

    expect(result.output).toEqual({ Rate: 1.25 });
    expect(result.diagnostics).toEqual([]);
  });

  it('AE-12: emits E012 warning when external source is missing', () => {
    const config = createMinimalConfig({
      config: {
        unmappedTargets: 'omit',
        nullSubtrees: [],
        constants: {},
        externalSources: ['missing'],
      },
      rules: [
        {
          target: 'Rate',
          type: 'number',
          expression: 'external("missing")',
        },
      ],
    });

    const result = execute(config, {}, {}, {}, { externalSources: {} });

    expect(result.output).toEqual({ Rate: null });
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E012')).toBe(true);
    expect(result.stats?.rulesSucceeded).toBe(1);
    expect(result.stats?.rulesFailed).toBe(0);
  });

  it('resolves enrichment field via get(external("alias"), "path")', () => {
    const config = createMinimalConfig({
      config: {
        unmappedTargets: 'omit',
        nullSubtrees: [],
        constants: {},
        externalSources: ['customerProfile'],
      },
      rules: [
        {
          target: 'CustomerTier',
          type: 'string',
          expression: 'get(external("customerProfile"), "membership.tier")',
        },
      ],
    });

    const result = execute(config, {}, {}, {}, {
      externalSources: {
        customerProfile: {
          membership: {
            tier: 'gold',
          },
        },
      },
    });

    expect(result.output).toEqual({ CustomerTier: 'gold' });
    expect(result.diagnostics).toEqual([]);
  });

  it('evaluates mixed source() + external() expression deterministically', () => {
    const config = createMinimalConfig({
      config: {
        unmappedTargets: 'omit',
        nullSubtrees: [],
        constants: {},
        externalSources: ['customerProfile'],
      },
      rules: [
        {
          target: 'CompositeKey',
          type: 'string',
          expression:
            'concat(cast(source("invoiceId"), "string"), "-", cast(get(external("customerProfile"), "customerId"), "string"))',
        },
      ],
    });

    const result = execute(
      config,
      { invoiceId: 42 },
      {},
      {},
      { externalSources: { customerProfile: { customerId: 'cust-99' } } },
    );

    expect(result.output).toEqual({ CompositeKey: '42-cust-99' });
    expect(result.diagnostics).toEqual([]);
  });

  it('get(external("alias"), path) returns null and E012 when alias payload is missing', () => {
    const config = createMinimalConfig({
      config: {
        unmappedTargets: 'omit',
        nullSubtrees: [],
        constants: {},
        externalSources: ['customerProfile'],
      },
      rules: [
        {
          target: 'CustomerTier',
          type: 'string',
          expression: 'get(external("customerProfile"), "membership.tier")',
        },
      ],
    });

    const result = execute(config, {}, {}, {}, { externalSources: {} });

    expect(result.output).toEqual({ CustomerTier: null });
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E012')).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E018')).toBe(false);
  });

  it('AE-13: resolves constants from config', () => {
    const config = createMinimalConfig({
      config: {
        unmappedTargets: 'omit',
        nullSubtrees: [],
        constants: { VERSION: '2.0' },
        externalSources: [],
      },
      rules: [
        {
          target: 'Ver',
          type: 'string',
          expression: 'constant("VERSION")',
        },
      ],
    });

    const result = execute(config, {}, {}, {});

    expect(result.output).toEqual({ Ver: '2.0' });
    expect(result.diagnostics).toEqual([]);
  });

  it('AE-14: evaluates repeated expression strings for multiple targets', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'A',
          type: 'string',
          expression: 'static("same")',
        },
        {
          target: 'B',
          type: 'string',
          expression: 'static("same")',
        },
      ],
    });

    const result = execute(config, {}, {}, {});

    expect(result.output).toEqual({
      A: 'same',
      B: 'same',
    });
  });

  it('AE-15: does not mutate sourceData or config inputs', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'Status',
          type: 'string',
          expression: 'source("status")',
        },
      ],
    });

    const sourceData = {
      status: 'draft',
      nested: {
        value: 1,
      },
    };

    const sourceSnapshot = structuredClone(sourceData);
    const configSnapshot = structuredClone(config);

    const result = execute(config, sourceData, {}, {});

    expect(result.output).toEqual({
      Status: 'draft',
    });
    expect(sourceData).toEqual(sourceSnapshot);
    expect(config).toEqual(configSnapshot);
  });

  it('keeps rule output value when diagnostics are warning-only', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'Category',
          type: 'string',
          expression: 'valueMap(source("channel"), { "web": "WEB" }, "UNKNOWN")',
        },
      ],
    });

    const result = execute(config, { channel: 'mobile' }, {}, {});

    expect(result.output).toEqual({
      Category: 'UNKNOWN',
    });
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-W003')).toBe(true);
    expect(result.stats?.rulesSucceeded).toBe(1);
    expect(result.stats?.rulesFailed).toBe(0);
  });

  it('supports ignore-case valueMap fixtures consistently at execute boundary', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'Ascii',
          type: 'string',
          expression: 'valueMap(source("ascii"), { "confirmed": "ascii-ok" }, "missing", "ignore-case")',
        },
        {
          target: 'Accented',
          type: 'string',
          expression: 'valueMap(source("accented"), { "äpfel": "accented-ok" }, "missing", "ignore-case")',
        },
        {
          target: 'TurkishDotted',
          type: 'string',
          expression: 'valueMap(source("turkishDotted"), { "i̇": "turkish-i-dot" }, "missing", "ignore-case")',
        },
        {
          target: 'TurkishDotless',
          type: 'string',
          expression: 'valueMap(source("turkishDotless"), { "ı": "dotless" }, "missing", "ignore-case")',
        },
        {
          target: 'SharpS',
          type: 'string',
          expression: 'valueMap(source("sharpS"), { "straße": "eszett" }, "missing", "ignore-case")',
        },
      ],
    });

    const result = execute(
      config,
      {
        ascii: 'CONFIRMED',
        accented: 'ÄPFEL',
        turkishDotted: 'İ',
        turkishDotless: 'I',
        sharpS: 'STRASSE',
      },
      {},
      {},
    );

    expect(result.output).toEqual({
      Ascii: 'ascii-ok',
      Accented: 'accented-ok',
      TurkishDotted: 'turkish-i-dot',
      TurkishDotless: 'missing',
      SharpS: 'missing',
    });
  });

  it('records one trace entry per rule when trace mode is enabled', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'A',
          type: 'string',
          expression: 'static("x")',
        },
        {
          target: 'B',
          type: 'string',
          expression: 'static("y")',
        },
      ],
    });

    const sourceData = { value: 1 };
    const result = execute(config, sourceData, {}, {}, { trace: true });

    expect(result.trace).toBeDefined();
    expect(result.trace).toHaveLength(2);
    expect(result.trace?.[0]).toMatchObject({
      ruleIndex: 0,
      targetPath: 'A',
      expression: 'static("x")',
      outputValue: 'x',
      inputValue: sourceData,
    });
    expect(result.trace?.[1]).toMatchObject({
      ruleIndex: 1,
      targetPath: 'B',
      expression: 'static("y")',
      outputValue: 'y',
      inputValue: sourceData,
    });
  });

  it('aborts with output null when validateBeforeExecute finds errors', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'output.name',
          type: 'string',
          expression: 'source("missing.path")',
        },
      ],
    });

    const sourceSchema = {
      type: 'object',
      properties: {
        existing: {
          type: 'string',
        },
      },
    };

    const targetSchema = {
      type: 'object',
      properties: {
        output: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    };

    const result = execute(config, {}, sourceSchema, targetSchema, {
      validateBeforeExecute: true,
      trace: true,
    });

    expect(result.output).toBeNull();
    expect(result.trace).toBeUndefined();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E030')).toBe(true);
    expect(result.stats?.rulesEvaluated).toBe(0);
    expect(result.stats?.rulesSucceeded).toBe(0);
    expect(result.stats?.rulesFailed).toBe(0);
    expect(result.stats?.durationMs).toBeGreaterThanOrEqual(0);
  });
});
