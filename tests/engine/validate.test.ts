import { describe, expect, it } from 'vitest';

import { validate, type MappingConfig } from '../../src/engine/index.js';

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

describe('validate', () => {
  it('is importable from engine index and returns a placeholder valid result', () => {
    const result = validate(createMinimalConfig(), {}, {});

    expect(result).toEqual({
      valid: true,
      diagnostics: [],
    });
  });
});
