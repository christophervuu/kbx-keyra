import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchemaNodeItem } from '../../../src/lib/persistence/types.js';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/clients.js', () => ({
  dynamoClient: {
    send: sendMock,
  },
}));

async function importModule() {
  return import('../../../src/lib/persistence/schema-nodes.js');
}

function createNodes(count: number, schemaId = 'schema-1'): SchemaNodeItem[] {
  return Array.from({ length: count }, (_, index) => ({
    schemaId,
    path: `Order.field${index + 1}`,
    fieldName: `field${index + 1}`,
    type: 'string',
    description: `Description ${index + 1}`,
    depth: 1,
    isArray: false,
    isRequired: false,
    parentPath: 'Order',
    childCount: 0,
    subtreeFieldCount: 1,
    embeddingText: `Order.field${index + 1} | field${index + 1}`,
  }));
}

describe('persistence schema-nodes', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('batchWrite with < 25 items sends one BatchWriteCommand', async () => {
    sendMock.mockResolvedValue({ UnprocessedItems: {} });
    const mod = await importModule();

    const promise = mod.batchWrite('schema-1', createNodes(10));
    await vi.runAllTimersAsync();
    await promise;

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0]?.[0] as {
      input: { RequestItems: Record<string, unknown[]> };
    };
    expect(command.input.RequestItems['keyra-schema-nodes']).toHaveLength(10);
  });

  it('batchWrite with 75 items sends 3 batch calls', async () => {
    sendMock.mockResolvedValue({ UnprocessedItems: {} });
    const mod = await importModule();

    const promise = mod.batchWrite('schema-1', createNodes(75));
    await vi.runAllTimersAsync();
    await promise;

    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it('batchWrite retries unprocessed items with exponential backoff', async () => {
    const oneNode = createNodes(1)[0]!;
    sendMock
      .mockResolvedValueOnce({
        UnprocessedItems: {
          'keyra-schema-nodes': [{ PutRequest: { Item: oneNode } }],
        },
      })
      .mockResolvedValueOnce({
        UnprocessedItems: {
          'keyra-schema-nodes': [{ PutRequest: { Item: oneNode } }],
        },
      })
      .mockResolvedValueOnce({ UnprocessedItems: {} });

    const mod = await importModule();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const promise = mod.batchWrite('schema-1', [oneNode]);
    await vi.runAllTimersAsync();
    await promise;

    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);
  });

  it('batchWrite throws descriptive error after retry exhaustion', async () => {
    const oneNode = createNodes(1)[0]!;
    sendMock.mockResolvedValue({
      UnprocessedItems: {
        'keyra-schema-nodes': [{ PutRequest: { Item: oneNode } }],
      },
    });
    const mod = await importModule();

    const promise = mod.batchWrite('schema-1', [oneNode]);
    const rejection = expect(promise).rejects.toThrow(/retry exhaustion/i);
    await vi.runAllTimersAsync();
    await rejection;
    expect(sendMock).toHaveBeenCalledTimes(4);
  });

  it('listBySchema uses Query and handles pagination', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: createNodes(2),
        LastEvaluatedKey: { schemaId: 'schema-1', path: 'Order.field2' },
      })
      .mockResolvedValueOnce({
        Items: createNodes(1).map((node) => ({ ...node, path: 'Order.field3', fieldName: 'field3' })),
        LastEvaluatedKey: undefined,
      });
    const mod = await importModule();

    const result = await mod.listBySchema('schema-1');

    expect(result).toHaveLength(3);
    const firstCommand = sendMock.mock.calls[0]?.[0] as {
      input: { KeyConditionExpression: string; ExpressionAttributeValues: Record<string, unknown> };
    };
    expect(firstCommand.input.KeyConditionExpression).toBe('schemaId = :sid');
    expect(firstCommand.input.ExpressionAttributeValues[':sid']).toBe('schema-1');
  });

  it('queryContains applies filter expression and enforces limit', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: createNodes(2),
        LastEvaluatedKey: { schemaId: 'schema-1', path: 'Order.field2' },
      })
      .mockResolvedValueOnce({
        Items: createNodes(2).map((node, index) => ({
          ...node,
          path: `Order.extra${index + 1}`,
          fieldName: `extra${index + 1}`,
        })),
        LastEvaluatedKey: undefined,
      });
    const mod = await importModule();

    const result = await mod.queryContains('schema-1', 'field', 3);

    expect(result).toHaveLength(3);
    const firstCommand = sendMock.mock.calls[0]?.[0] as {
      input: {
        FilterExpression: string;
        Limit: number;
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };
    expect(firstCommand.input.FilterExpression).toBe('contains(#path, :q) OR contains(#fieldName, :q)');
    expect(firstCommand.input.Limit).toBe(3);
    expect(firstCommand.input.ExpressionAttributeValues[':q']).toBe('field');
  });

  it('queryContains backfills missing retrieval fields in-memory for legacy nodes', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        {
          schemaId: 'schema-1',
          path: 'Order.LegacyCode',
          fieldName: 'LegacyCode',
          type: 'string',
          depth: 1,
          isArray: false,
          isRequired: false,
          parentPath: 'Order',
          childCount: 0,
          subtreeFieldCount: 1,
          embeddingText: '',
        },
      ],
      LastEvaluatedKey: undefined,
    });

    const mod = await importModule();
    const result = await mod.queryContains('schema-1', 'legacy', 10);

    expect(result).toHaveLength(1);
    expect(result[0]?.embeddingText).toBe('Order.LegacyCode | LegacyCode (string)');
    expect(Array.isArray(result[0]?.embedding)).toBe(true);
    expect((result[0]?.embedding ?? []).length).toBeGreaterThan(0);
  });

  it('backfillRetrievalFields is safe to rerun and deterministic', async () => {
    sendMock
      // first run listBySchema query
      .mockResolvedValueOnce({
        Items: [
          {
            schemaId: 'schema-1',
            path: 'Order.LegacyA',
            fieldName: 'LegacyA',
            type: 'string',
            depth: 1,
            isArray: false,
            isRequired: false,
            parentPath: 'Order',
            childCount: 0,
            subtreeFieldCount: 1,
            embeddingText: '',
          },
        ],
        LastEvaluatedKey: undefined,
      })
      // first run batchWrite success
      .mockResolvedValueOnce({ UnprocessedItems: {} })
      // second run listBySchema query
      .mockResolvedValueOnce({
        Items: [
          {
            schemaId: 'schema-1',
            path: 'Order.LegacyA',
            fieldName: 'LegacyA',
            type: 'string',
            depth: 1,
            isArray: false,
            isRequired: false,
            parentPath: 'Order',
            childCount: 0,
            subtreeFieldCount: 1,
            embeddingText: '',
          },
        ],
        LastEvaluatedKey: undefined,
      })
      // second run batchWrite success
      .mockResolvedValueOnce({ UnprocessedItems: {} });

    const mod = await importModule();
    const first = await mod.backfillRetrievalFields('schema-1');
    const second = await mod.backfillRetrievalFields('schema-1');

    expect(first).toEqual({ scanned: 1, written: 1 });
    expect(second).toEqual({ scanned: 1, written: 1 });
    expect(sendMock).toHaveBeenCalledTimes(4);
  });

  it('deleteBySchema performs query + batched deletes', async () => {
    const items = createNodes(30).map((node) => ({ schemaId: node.schemaId, path: node.path }));
    sendMock
      .mockResolvedValueOnce({ Items: items, LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ UnprocessedItems: {} })
      .mockResolvedValueOnce({ UnprocessedItems: {} });
    const mod = await importModule();

    const promise = mod.deleteBySchema('schema-1');
    await vi.runAllTimersAsync();
    await promise;

    expect(sendMock).toHaveBeenCalledTimes(3);

    const firstDeleteBatch = sendMock.mock.calls[1]?.[0] as {
      input: { RequestItems: Record<string, unknown[]> };
    };
    const secondDeleteBatch = sendMock.mock.calls[2]?.[0] as {
      input: { RequestItems: Record<string, unknown[]> };
    };
    expect(firstDeleteBatch.input.RequestItems['keyra-schema-nodes']).toHaveLength(25);
    expect(secondDeleteBatch.input.RequestItems['keyra-schema-nodes']).toHaveLength(5);
  });

  it('writes and queries schema node identity sidecar records', async () => {
    sendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Items: [
          {
            schemaId: 'IDENTITY#version-1',
            path: '',
            schemaVersionId: 'version-1',
            fieldId: 'fid-root',
            jsonPointer: '',
          },
          {
            schemaId: 'IDENTITY#version-1',
            path: '/properties/id',
            schemaVersionId: 'version-1',
            fieldId: 'fid-id',
            jsonPointer: '/properties/id',
            parentFieldId: 'fid-root',
          },
        ],
      });

    const mod = await importModule();
    await mod.putSchemaNodeIdentity({
      schemaVersionId: 'version-1',
      fieldId: 'fid-root',
      jsonPointer: '',
    });

    const identities = await mod.listSchemaNodeIdentities('version-1');
    expect(identities).toHaveLength(2);
    expect(identities[1]).toEqual({
      schemaVersionId: 'version-1',
      fieldId: 'fid-id',
      jsonPointer: '/properties/id',
      parentFieldId: 'fid-root',
    });
  });

  it('batch writes identity sidecar records with schemaVersion partition', async () => {
    sendMock.mockResolvedValue({ UnprocessedItems: {} });
    const mod = await importModule();

    await mod.batchWriteSchemaNodeIdentities('version-2', [
      {
        schemaVersionId: 'ignored-by-call',
        fieldId: 'fid-root',
        jsonPointer: '',
      },
      {
        schemaVersionId: 'ignored-by-call',
        fieldId: 'fid-id',
        jsonPointer: '/properties/id',
        parentFieldId: 'fid-root',
      },
    ]);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0]?.[0] as {
      input: { RequestItems: Record<string, Array<{ PutRequest: { Item: Record<string, unknown> } }>> };
    };
    const items = command.input.RequestItems['keyra-schema-nodes'].map((entry) => entry.PutRequest.Item);
    expect(items[0]?.schemaId).toBe('IDENTITY#version-2');
    expect(items[1]?.schemaVersionId).toBe('version-2');
  });

  it('gets single schema node identity by schemaVersionId + pointer', async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        schemaId: 'IDENTITY#version-3',
        path: '/properties/code',
        schemaVersionId: 'version-3',
        fieldId: 'fid-code',
        jsonPointer: '/properties/code',
      },
    });

    const mod = await importModule();
    const found = await mod.getSchemaNodeIdentity('version-3', '/properties/code');

    expect(found).toEqual({
      schemaVersionId: 'version-3',
      fieldId: 'fid-code',
      jsonPointer: '/properties/code',
    });
  });
});
