import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MappingVersionItem } from '../../../src/lib/persistence/types.js';

const { dynamoSendMock } = vi.hoisted(() => ({
  dynamoSendMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/clients.js', () => ({
  dynamoClient: {
    send: dynamoSendMock,
  },
  s3Client: {
    send: vi.fn(),
  },
}));

async function importModule() {
  return import('../../../src/lib/persistence/mapping-versions.js');
}

function makeVersionItem(overrides: Partial<MappingVersionItem> = {}): MappingVersionItem {
  return {
    mappingId: 'mapping-1',
    version: 1,
    revisionNumber: 1,
    createdAt: '2026-06-01T00:00:00.000Z',
    createdBy: 'user-1',
    ...overrides,
  };
}

describe('persistence mapping-versions', () => {
  beforeEach(() => {
    vi.resetModules();
    dynamoSendMock.mockReset();
  });

  it('create writes milestone version with revision pointer', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({ Items: [makeVersionItem({ version: 2 })] })
      .mockResolvedValueOnce({});

    const mod = await importModule();
    const result = await mod.create('mapping-1', {
      revisionNumber: 5,
      createdBy: 'user-123',
    });

    expect(result.version).toBe(3);
    expect(result.revisionNumber).toBe(5);
    expect(result.createdBy).toBe('user-123');

    const putCommand = dynamoSendMock.mock.calls[1]?.[0] as {
      input: { TableName: string; Item: MappingVersionItem };
    };
    expect(putCommand.input.TableName).toBe('keyra-mapping-versions');
    expect(putCommand.input.Item).toMatchObject({
      mappingId: 'mapping-1',
      version: 3,
      revisionNumber: 5,
      createdBy: 'user-123',
    });
  });

  it('list queries descending by version', async () => {
    dynamoSendMock.mockResolvedValue({
      Items: [makeVersionItem({ version: 3 }), makeVersionItem({ version: 2 }), makeVersionItem({ version: 1 })],
    });

    const mod = await importModule();
    const result = await mod.list('mapping-1');

    expect(result.map((item) => item.version)).toEqual([3, 2, 1]);
  });

  it('get returns item or null', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({ Item: makeVersionItem({ version: 7 }) });
    dynamoSendMock.mockResolvedValueOnce({ Item: undefined });

    const found = await mod.get('mapping-1', 7);
    const missing = await mod.get('mapping-1', 999);

    expect(found?.version).toBe(7);
    expect(missing).toBeNull();
  });

  it('exports mappingVersions object with expected operations', async () => {
    const mod = await importModule();

    expect(mod.mappingVersions.create).toBe(mod.create);
    expect(mod.mappingVersions.list).toBe(mod.list);
    expect(mod.mappingVersions.get).toBe(mod.get);
  });
});
