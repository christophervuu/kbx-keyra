import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectValueTableRevisionRow } from '../../../../src/lib/persistence/types.js';

const { s3SendMock } = vi.hoisted(() => ({
  s3SendMock: vi.fn(),
}));

vi.mock('../../../../src/lib/persistence/clients.js', () => ({
  s3Client: {
    send: s3SendMock,
  },
}));

async function importModule() {
  return import('../../../../src/lib/persistence/s3/value-table-revisions.js');
}

function rows(): readonly ProjectValueTableRevisionRow[] {
  return [
    { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
    { id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETED' },
  ];
}

describe('persistence s3/value-table-revisions', () => {
  beforeEach(() => {
    vi.resetModules();
    s3SendMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('put stores rows payload to canonical S3 key', async () => {
    s3SendMock.mockResolvedValue({});
    const mod = await importModule();

    const key = await mod.put('vt-1', 2, rows());

    expect(key).toBe('value-tables/vt-1/revisions/r2.json');
    const command = s3SendMock.mock.calls[0]?.[0] as {
      input: { Bucket: string; Key: string; Body: string; ContentType: string };
    };
    expect(command.input.Bucket).toBe('keyra-storage');
    expect(command.input.Key).toBe('value-tables/vt-1/revisions/r2.json');
    expect(command.input.ContentType).toBe('application/json');
    expect(command.input.Body).toBe(JSON.stringify({ rows: rows() }));
  });

  it('get retrieves rows and returns null for missing key', async () => {
    const mod = await importModule();

    s3SendMock.mockResolvedValueOnce({
      Body: {
        transformToString: vi.fn().mockResolvedValue(JSON.stringify({ rows: rows() })),
      },
    });
    const found = await mod.get('vt-1', 2);
    expect(found).toEqual(rows());

    s3SendMock.mockRejectedValueOnce({ name: 'NoSuchKey' });
    const missing = await mod.get('vt-1', 7);
    expect(missing).toBeNull();
  });

  it('delete removes revision rows object', async () => {
    s3SendMock.mockResolvedValue({});
    const mod = await importModule();

    await mod.delete('vt-1', 2);

    const command = s3SendMock.mock.calls[0]?.[0] as {
      input: { Bucket: string; Key: string };
    };
    expect(command.input).toEqual({
      Bucket: 'keyra-storage',
      Key: 'value-tables/vt-1/revisions/r2.json',
    });
  });

  it('exports named operation aliases', async () => {
    const mod = await importModule();

    expect(mod.putValueTableRevisionRows).toBe(mod.put);
    expect(mod.getValueTableRevisionRows).toBe(mod.get);
    expect(mod.deleteValueTableRevisionRows).toBe(mod.delete);
  });
});
