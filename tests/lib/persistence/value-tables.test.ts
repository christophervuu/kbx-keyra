import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateValueTableInput,
  MappingConfig,
  MappingItem,
  ProjectValueTableRevisionRow,
  ValueTableItem,
  ValueTableRevisionItem,
} from '../../../src/lib/persistence/types.js';

const { dynamoSendMock, putRowsMock, getRowsMock, getMappingConfigMock } = vi.hoisted(() => ({
  dynamoSendMock: vi.fn(),
  putRowsMock: vi.fn(),
  getRowsMock: vi.fn(),
  getMappingConfigMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/clients.js', () => ({
  dynamoClient: {
    send: dynamoSendMock,
  },
}));

vi.mock('../../../src/lib/persistence/s3/value-table-revisions.js', () => ({
  putValueTableRevisionRows: putRowsMock,
  getValueTableRevisionRows: getRowsMock,
}));

vi.mock('../../../src/lib/persistence/s3/mapping-config.js', () => ({
  getMappingConfig: getMappingConfigMock,
}));

async function importModule() {
  return import('../../../src/lib/persistence/value-tables.js');
}

function makeRows(): readonly ProjectValueTableRevisionRow[] {
  return [
    { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
    { id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETED' },
  ];
}

function makeCreateInput(): CreateValueTableInput {
  return {
    projectId: 'p-1',
    key: 'order-status',
    name: 'Order Status',
    sideA: { key: 'oms', label: 'OMS', type: 'string' },
    sideB: { key: 'cdm', label: 'CDM', type: 'string' },
    rows: makeRows(),
    createdBy: 'tester',
  };
}

function makeTableItem(overrides: Partial<ValueTableItem> = {}): ValueTableItem {
  return {
    valueTableId: 'vt-1',
    projectId: 'p-1',
    key: 'order-status',
    name: 'Order Status',
    sideA: { key: 'oms', label: 'OMS', type: 'string' },
    sideB: { key: 'cdm', label: 'CDM', type: 'string' },
    currentRevision: 1,
    currentRowCount: 2,
    status: 'active',
    createdAt: '2026-06-20T00:00:00.000Z',
    createdBy: 'tester',
    updatedAt: '2026-06-20T00:00:00.000Z',
    updatedBy: 'tester',
    ...overrides,
  };
}

function makeRevisionItem(overrides: Partial<ValueTableRevisionItem> = {}): ValueTableRevisionItem {
  return {
    valueTableId: 'vt-1',
    revision: 1,
    sideA: { key: 'oms', label: 'OMS', type: 'string' },
    sideB: { key: 'cdm', label: 'CDM', type: 'string' },
    rowCount: 2,
    directionSupport: { aToB: true, bToA: true },
    rowsS3Key: 'value-tables/vt-1/revisions/r1.json',
    contentHash: 'hash',
    createdAt: '2026-06-20T00:00:00.000Z',
    createdBy: 'tester',
    ...overrides,
  };
}

describe('persistence value-tables', () => {
  beforeEach(() => {
    vi.resetModules();
    dynamoSendMock.mockReset();
    putRowsMock.mockReset();
    getRowsMock.mockReset();
    getMappingConfigMock.mockReset();

    putRowsMock.mockResolvedValue('value-tables/vt-1/revisions/r1.json');
    getRowsMock.mockResolvedValue(makeRows());
    getMappingConfigMock.mockResolvedValue({ rules: [] } satisfies MappingConfig);

    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('vt-1'),
      subtle: {
        digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('create stores table metadata and immutable revision rows', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const mod = await importModule();
    const created = await mod.create(makeCreateInput());

    expect(created).toEqual(expect.objectContaining({
      id: 'vt-1',
      projectId: 'p-1',
      key: 'order-status',
      currentRevision: 1,
      status: 'active',
    }));
    expect(putRowsMock).toHaveBeenCalledWith('vt-1', 1, makeRows());
    expect(dynamoSendMock).toHaveBeenCalledTimes(3);
  });

  it('createRevision appends immutable revision and updates table pointer', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({ Item: makeTableItem({ currentRevision: 1 }) })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: makeRevisionItem({ revision: 2, rowsS3Key: 'value-tables/vt-1/revisions/r2.json' }) });

    putRowsMock.mockResolvedValueOnce('value-tables/vt-1/revisions/r2.json');
    getRowsMock.mockResolvedValueOnce(makeRows());

    const mod = await importModule();
    const revision = await mod.createRevision({
      valueTableId: 'vt-1',
      expectedCurrentRevision: 1,
      sideA: { key: 'oms', label: 'OMS', type: 'string' },
      sideB: { key: 'cdm', label: 'CDM', type: 'string' },
      rows: makeRows(),
      createdBy: 'tester',
    });

    expect(revision.revision).toBe(2);
    expect(putRowsMock).toHaveBeenCalledWith('vt-1', 2, makeRows());
    expect(dynamoSendMock).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        ConditionExpression: '#currentRevision = :expectedRevision',
      }),
    }));
  });

  it('listUsage derives references from mapping configs', async () => {
    const mappings: MappingItem[] = [
      {
        mappingId: 'm-1',
        projectId: 'p-1',
        name: 'Mapping One',
        revision: 3,
        latestVersion: null,
        configHash: 'hash',
        status: 'ready',
        ruleCount: 1,
        coverage: 100,
        configS3Key: 'mappings/m-1/config.json',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      },
    ];

    dynamoSendMock
      .mockResolvedValueOnce({ Item: makeTableItem({ currentRevision: 2 }) })
      .mockResolvedValueOnce({ Items: mappings })
      .mockResolvedValueOnce({ Item: makeRevisionItem({ revision: 2, directionSupport: { aToB: true, bToA: false } }) });

    getMappingConfigMock.mockResolvedValueOnce({
      rules: [
        {
          valueTableRef: {
            scope: 'project',
            valueTableId: 'vt-1',
            tableKey: 'order-status',
            revision: 1,
            inputSideKey: 'oms',
            outputSideKey: 'cdm',
            inputType: 'string',
            outputType: 'string',
            resolvedEntries: [],
          },
        },
      ],
    } satisfies MappingConfig);

    const mod = await importModule();
    const usage = await mod.listUsage('vt-1');

    expect(usage).toHaveLength(1);
    expect(usage[0]).toEqual(expect.objectContaining({
      mappingId: 'm-1',
      pinnedRevision: 1,
      latestRevision: 2,
      newerRevisionAvailable: true,
      direction: 'a_to_b',
      latestDirectionSupported: true,
    }));
  });

  it('resolveReference returns pinned project ref and resolved entries', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({ Items: [makeTableItem({ currentRevision: 2 })] })
      .mockResolvedValueOnce({ Item: makeRevisionItem({ revision: 2 }) });
    getRowsMock.mockResolvedValueOnce(makeRows());

    const mod = await importModule();
    const resolved = await mod.resolveReference({
      projectId: 'p-1',
      tableKey: 'order-status',
      revision: 2,
      inputSideKey: 'oms',
      outputSideKey: 'cdm',
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.ref).toEqual(expect.objectContaining({
      scope: 'project',
      valueTableId: 'vt-1',
      revision: 2,
      inputSideKey: 'oms',
      outputSideKey: 'cdm',
    }));
    expect(resolved?.ref.resolvedEntries).toHaveLength(2);
  });
});
