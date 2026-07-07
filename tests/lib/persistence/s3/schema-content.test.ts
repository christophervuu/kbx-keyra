import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { s3SendMock } = vi.hoisted(() => ({
  s3SendMock: vi.fn(),
}));

vi.mock('../../../../src/lib/persistence/clients.js', () => ({
  s3Client: {
    send: s3SendMock,
  },
}));

async function importModule() {
  return import('../../../../src/lib/persistence/s3/schema-content.js');
}

describe('persistence s3/schema-content', () => {
  beforeEach(() => {
    vi.resetModules();
    s3SendMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('putOriginal stores json with application/json content-type', async () => {
    s3SendMock.mockResolvedValue({});
    const mod = await importModule();

    await mod.putOriginal('schema-1', '{"type":"object"}', 'json');

    const command = s3SendMock.mock.calls[0]?.[0] as {
      input: { Bucket: string; Key: string; Body: string; ContentType: string };
    };
    expect(command.input).toEqual({
      Bucket: 'keyra-storage',
      Key: 'schemas/schema-1/original.json',
      Body: '{"type":"object"}',
      ContentType: 'application/json',
    });
  });

  it('putOriginal stores xsd with application/xml content-type', async () => {
    s3SendMock.mockResolvedValue({});
    const mod = await importModule();

    await mod.putOriginal('schema-1', '<xsd:schema/>', 'xsd');

    const command = s3SendMock.mock.calls[0]?.[0] as {
      input: { Key: string; ContentType: string };
    };
    expect(command.input.Key).toBe('schemas/schema-1/original.xsd');
    expect(command.input.ContentType).toBe('application/xml');
  });

  it('putProcessed stores json content at processed key', async () => {
    s3SendMock.mockResolvedValue({});
    const mod = await importModule();

    await mod.putProcessed('schema-1', { nodes: [{ path: 'Order.Id' }], fieldCount: 1 });

    const command = s3SendMock.mock.calls[0]?.[0] as {
      input: { Key: string; ContentType: string; Body: string };
    };
    expect(command.input.Key).toBe('schemas/schema-1/content.json');
    expect(command.input.ContentType).toBe('application/json');
    expect(command.input.Body).toBe(JSON.stringify({ nodes: [{ path: 'Order.Id' }], fieldCount: 1 }));
  });

  it('get retrieves and parses processed JSON, returns null on NoSuchKey', async () => {
    const mod = await importModule();

    s3SendMock.mockResolvedValueOnce({
      Body: {
        transformToString: vi.fn().mockResolvedValue('{"fieldCount":1}'),
      },
    });

    const found = await mod.get('schema-1');
    expect(found).toEqual({ fieldCount: 1 });

    s3SendMock.mockRejectedValueOnce({ name: 'NoSuchKey' });
    const missing = await mod.get('schema-1');
    expect(missing).toBeNull();
  });

  it('getOriginal returns raw string and null on NoSuchKey', async () => {
    const mod = await importModule();

    s3SendMock.mockResolvedValueOnce({
      Body: {
        transformToString: vi.fn().mockResolvedValue('<xsd:schema/>'),
      },
    });
    const found = await mod.getOriginal('schema-1', 'xsd');
    expect(found).toBe('<xsd:schema/>');

    s3SendMock.mockRejectedValueOnce({ Code: 'NoSuchKey' });
    const missing = await mod.getOriginal('schema-1', 'json');
    expect(missing).toBeNull();
  });

  it('putDraftRevision and getDraftRevision store and retrieve draft revision content', async () => {
    const mod = await importModule();

    s3SendMock.mockResolvedValueOnce({});
    const key = await mod.putDraftRevision('schema-1', 3, { type: 'object', properties: { id: { type: 'string' } } });
    expect(key).toBe('schemas/schema-1/drafts/r3.json');

    const putCommand = s3SendMock.mock.calls[0]?.[0] as {
      input: { Key: string; ContentType: string };
    };
    expect(putCommand.input.Key).toBe('schemas/schema-1/drafts/r3.json');
    expect(putCommand.input.ContentType).toBe('application/json');

    s3SendMock.mockResolvedValueOnce({
      Body: {
        transformToString: vi.fn().mockResolvedValue('{"type":"object"}'),
      },
    });

    const loaded = await mod.getDraftRevision('schema-1', 3);
    expect(loaded).toEqual({ type: 'object' });
  });

  it('putVersion and getVersion store and retrieve immutable version content', async () => {
    const mod = await importModule();

    s3SendMock.mockResolvedValueOnce({});
    const key = await mod.putVersion('schema-1', 4, { type: 'object', title: 'Order' });
    expect(key).toBe('schemas/schema-1/versions/v4.json');

    const putCommand = s3SendMock.mock.calls[0]?.[0] as {
      input: { Key: string; ContentType: string };
    };
    expect(putCommand.input.Key).toBe('schemas/schema-1/versions/v4.json');
    expect(putCommand.input.ContentType).toBe('application/json');

    s3SendMock.mockResolvedValueOnce({
      Body: {
        transformToString: vi.fn().mockResolvedValue('{"title":"Order"}'),
      },
    });

    const loaded = await mod.getVersion('schema-1', 4);
    expect(loaded).toEqual({ title: 'Order' });
  });

  it('delete removes original(json/xsd) and processed objects in one call', async () => {
    s3SendMock.mockResolvedValue({});
    const mod = await importModule();

    await mod.delete('schema-1');

    const command = s3SendMock.mock.calls[0]?.[0] as {
      input: {
        Bucket: string;
        Delete: {
          Objects: Array<{ Key: string }>;
        };
      };
    };

    expect(command.input.Bucket).toBe('keyra-storage');
    expect(command.input.Delete.Objects).toEqual([
      { Key: 'schemas/schema-1/original.json' },
      { Key: 'schemas/schema-1/original.xsd' },
      { Key: 'schemas/schema-1/content.json' },
    ]);
  });

  it('exports schemaContent object with expected operations', async () => {
    const mod = await importModule();

    expect(mod.schemaContent.putOriginal).toBe(mod.putOriginal);
    expect(mod.schemaContent.putProcessed).toBe(mod.putProcessed);
    expect(mod.schemaContent.putDraftRevision).toBe(mod.putDraftRevision);
    expect(mod.schemaContent.putVersion).toBe(mod.putVersion);
    expect(mod.schemaContent.get).toBe(mod.get);
    expect(mod.schemaContent.getDraftRevision).toBe(mod.getDraftRevision);
    expect(mod.schemaContent.getOriginal).toBe(mod.getOriginal);
    expect(mod.schemaContent.getVersion).toBe(mod.getVersion);
    expect(mod.schemaContent.delete).toBe(mod.delete);
  });
});
