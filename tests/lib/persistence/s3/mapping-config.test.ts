import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MappingConfig } from '../../../../src/lib/persistence/types.js';

const { s3SendMock } = vi.hoisted(() => ({
  s3SendMock: vi.fn(),
}));

vi.mock('../../../../src/lib/persistence/clients.js', () => ({
  s3Client: {
    send: s3SendMock,
  },
}));

async function importModule() {
  return import('../../../../src/lib/persistence/s3/mapping-config.js');
}

function makeConfig(overrides: Partial<MappingConfig> = {}): MappingConfig {
  return {
    id: 'mapping-1',
    projectId: 'project-1',
    name: 'Mapping 1',
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
    config: {},
    rules: [],
    ...overrides,
  };
}

describe('persistence s3/mapping-config', () => {
  beforeEach(() => {
    vi.resetModules();
    s3SendMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('put stores full MappingConfig as JSON at expected key', async () => {
    s3SendMock.mockResolvedValue({});
    const mod = await importModule();
    const config = makeConfig();

    await mod.put('mapping-1', config);

    const command = s3SendMock.mock.calls[0]?.[0] as {
      input: { Bucket: string; Key: string; Body: string; ContentType: string };
    };
    expect(command.input.Bucket).toBe('keyra-storage');
    expect(command.input.Key).toBe('mappings/mapping-1/config.json');
    expect(command.input.ContentType).toBe('application/json');
    expect(command.input.Body).toBe(JSON.stringify(config));
  });

  it('get retrieves and parses config, returns null on NoSuchKey', async () => {
    const mod = await importModule();

    s3SendMock.mockResolvedValueOnce({
      Body: {
        transformToString: vi.fn().mockResolvedValue(JSON.stringify(makeConfig({ version: 5, name: 'v5' }))),
      },
    });
    const found = await mod.get('mapping-1');
    expect(found?.version).toBe(5);
    expect(found?.name).toBe('v5');

    s3SendMock.mockRejectedValueOnce({ name: 'NoSuchKey' });
    const missing = await mod.get('missing');
    expect(missing).toBeNull();
  });

  it('delete sends DeleteObject and is idempotent', async () => {
    s3SendMock.mockResolvedValue({});
    const mod = await importModule();

    await expect(mod.delete('mapping-1')).resolves.toBeUndefined();

    const command = s3SendMock.mock.calls[0]?.[0] as {
      input: { Bucket: string; Key: string };
    };
    expect(command.input).toEqual({
      Bucket: 'keyra-storage',
      Key: 'mappings/mapping-1/config.json',
    });
  });

  it('exports mappingConfig object with expected operations', async () => {
    const mod = await importModule();

    expect(mod.mappingConfig.put).toBe(mod.put);
    expect(mod.mappingConfig.get).toBe(mod.get);
    expect(mod.mappingConfig.delete).toBe(mod.delete);
  });

  it('exports named operation aliases', async () => {
    const mod = await importModule();

    expect(mod.putMappingConfig).toBe(mod.put);
    expect(mod.getMappingConfig).toBe(mod.get);
    expect(mod.deleteMappingConfig).toBe(mod.delete);
  });
});
