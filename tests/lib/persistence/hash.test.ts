import { describe, expect, it } from 'vitest';

import { computeConfigHash } from '../../../src/lib/persistence/hash.js';
import type { MappingConfig } from '../../../src/lib/persistence/types.js';

function makeConfig(overrides: Partial<MappingConfig> = {}): MappingConfig {
  return {
    id: 'mapping-1',
    projectId: 'project-1',
    name: 'Mapping',
    version: 1,
    engineVersion: '1.0.0',
    sourceSchemaRef: {
      schemaId: 'source-1',
      type: 'local',
    },
    targetSchemaRef: {
      schemaId: 'target-1',
      type: 'local',
    },
    config: {
      constants: {
        b: 2,
        a: 1,
      },
    },
    rules: [
      { target: 'a', type: 'string', expression: 'source("a")' },
    ],
    ...overrides,
  };
}

describe('persistence hash', () => {
  it('computeConfigHash is deterministic for same config', async () => {
    const config = makeConfig();

    const first = await computeConfigHash(config);
    const second = await computeConfigHash(config);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('computeConfigHash is stable across object key ordering', async () => {
    const configA = makeConfig({
      config: {
        constants: {
          b: 2,
          a: 1,
        },
      },
    });

    const configB = makeConfig({
      config: {
        constants: {
          a: 1,
          b: 2,
        },
      },
    });

    const hashA = await computeConfigHash(configA);
    const hashB = await computeConfigHash(configB);

    expect(hashA).toBe(hashB);
  });

  it('computeConfigHash changes when config changes', async () => {
    const a = makeConfig({ name: 'A' });
    const b = makeConfig({ name: 'B' });

    const hashA = await computeConfigHash(a);
    const hashB = await computeConfigHash(b);

    expect(hashA).not.toBe(hashB);
  });
});
