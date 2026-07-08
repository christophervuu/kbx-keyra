import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dynamoSendMock } = vi.hoisted(() => ({
  dynamoSendMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/clients.js', () => ({
  dynamoClient: {
    send: dynamoSendMock,
  },
}));

async function importModule() {
  return import('../../../src/lib/persistence/deployment-summaries.js');
}

describe('persistence deployment-summaries', () => {
  beforeEach(() => {
    vi.resetModules();
    dynamoSendMock.mockReset();
  });

  it('initialize writes baseline never-deployed projection row', async () => {
    dynamoSendMock.mockResolvedValue({});

    const mod = await importModule();
    const item = await mod.initialize({
      mappingId: 'map-1',
      projectId: 'proj-1',
      mappingName: 'Mapping 1',
    });

    expect(item.mappingId).toBe('map-1');
    expect(item.globalPartition).toBe('GLOBAL');
    expect(item.devFreshness).toBe('NOT_DEPLOYED');
    expect(item.preprodFreshness).toBe('NOT_DEPLOYED');
    expect(item.prodFreshness).toBe('NOT_DEPLOYED');

    const put = dynamoSendMock.mock.calls[0]?.[0] as { input: { TableName: string } };
    expect(put.input.TableName).toBe('integrations-keyra-deployment-summaries');
  });

  it('upsert promotes freshness and attention state on failed operation', async () => {
    const existing = {
      mappingId: 'map-1',
      globalPartition: 'GLOBAL',
      projectId: 'proj-1',
      projectName: '',
      mappingName: 'Mapping 1',
      latestVersion: 3,
      latestVersionCreatedAt: '2026-07-07T00:00:00.000Z',
      devActiveArtifactId: 'artifact-1',
      devActiveVersion: 2,
      devFreshness: 'CURRENT',
      devLastOperationStatus: null,
      preprodActiveArtifactId: null,
      preprodActiveVersion: null,
      preprodFreshness: 'NOT_DEPLOYED',
      preprodLastOperationStatus: null,
      prodActiveArtifactId: null,
      prodActiveVersion: null,
      prodFreshness: 'NOT_DEPLOYED',
      prodLastOperationStatus: null,
      promotionState: 'NOT_APPLICABLE',
      attentionState: 'OK',
      activeOperationId: null,
      lastActivityAt: '2026-07-07T00:00:00.000Z',
      lastActorId: 'development:system',
      updatedAt: '2026-07-07T00:00:00.000Z',
    } as const;

    dynamoSendMock
      .mockResolvedValueOnce({ Item: existing })
      .mockResolvedValueOnce({});

    const mod = await importModule();
    const updated = await mod.upsert({
      mappingId: 'map-1',
      projectId: 'proj-1',
      mappingName: 'Mapping 1',
      environmentStates: {
        DEV: {
          lastOperationStatus: 'FAILED',
        },
      },
      operationStatus: 'FAILED',
      activeOperationId: null,
    });

    expect(updated.devFreshness).toBe('STALE');
    expect(updated.devLastOperationStatus).toBe('FAILED');
    expect(updated.attentionState).toBe('NEEDS_ATTENTION');
  });

  it('remove deletes projection by mapping id', async () => {
    dynamoSendMock.mockResolvedValue({});

    const mod = await importModule();
    await mod.remove('map-1');

    const del = dynamoSendMock.mock.calls[0]?.[0] as {
      input: { TableName: string; Key: { mappingId: string } };
    };
    expect(del.input.TableName).toBe('integrations-keyra-deployment-summaries');
    expect(del.input.Key.mappingId).toBe('map-1');
  });
});
