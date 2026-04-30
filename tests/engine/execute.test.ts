import { describe, expect, it } from 'vitest';

import { execute, type MappingConfig } from '../../src/engine/index.js';

function createMinimalConfig(): MappingConfig {
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
    },
    rules: [],
  };
}

describe('execute', () => {
  it('is importable from engine index and returns a placeholder execution result', () => {
    const result = execute(createMinimalConfig(), {}, {}, {});

    expect(result).toEqual({
      output: {},
      diagnostics: [],
      trace: undefined,
    });
  });

  it('returns an empty trace when trace option is enabled', () => {
    const result = execute(createMinimalConfig(), {}, {}, {}, { trace: true });

    expect(result).toEqual({
      output: {},
      diagnostics: [],
      trace: [],
    });
  });
});
