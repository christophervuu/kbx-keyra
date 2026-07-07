import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchemaDraftItem } from '../../../src/lib/persistence/types.js';

const { dynamoSendMock, putDraftRevisionMock } = vi.hoisted(() => ({
  dynamoSendMock: vi.fn(),
  putDraftRevisionMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/clients.js', () => ({
  dynamoClient: {
    send: dynamoSendMock,
  },
}));

vi.mock('../../../src/lib/persistence/s3/schema-content.js', () => ({
  schemaContent: {
    putDraftRevision: putDraftRevisionMock,
  },
}));

async function importModule() {
  return import('../../../src/lib/persistence/schema-drafts.js');
}

function makeDraft(overrides: Partial<SchemaDraftItem> = {}): SchemaDraftItem {
  return {
    schemaId: 'schema-1',
    revision: 1,
    basedOnVersion: null,
    contentHash: 'a'.repeat(64),
    contentS3Key: 'schemas/schema-1/drafts/r1.json',
    createdAt: '2026-07-06T00:00:00.000Z',
    createdBy: 'user-1',
    updatedAt: '2026-07-06T00:00:00.000Z',
    updatedBy: 'user-1',
    ...overrides,
  };
}

describe('persistence schema-drafts', () => {
  beforeEach(() => {
    vi.resetModules();
    dynamoSendMock.mockReset();
    putDraftRevisionMock.mockReset();
  });

  it('save returns noChange when hash equals current draft', async () => {
    const { computeStableJsonSha256 } = await import('../../../src/lib/persistence/hash.js');
    const unchangedContent = { type: 'object' };
    dynamoSendMock.mockResolvedValueOnce({ Items: [makeDraft({ contentHash: computeStableJsonSha256(unchangedContent) })] });

    const mod = await importModule();

    const result = await mod.save('schema-1', {
      content: unchangedContent,
      updatedBy: 'user-2',
    });

    expect(result.noChange).toBe(true);
    expect(result.item.revision).toBe(1);
    expect(putDraftRevisionMock).not.toHaveBeenCalled();
  });

  it('save creates next revision when content changes', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({ Items: [makeDraft({ revision: 2, contentHash: 'a'.repeat(64), basedOnVersion: 1 })] })
      .mockResolvedValueOnce({});
    putDraftRevisionMock.mockResolvedValueOnce('schemas/schema-1/drafts/r3.json');

    const mod = await importModule();

    const result = await mod.save('schema-1', {
      content: { type: 'object', title: 'Order' },
      updatedBy: 'user-3',
    });

    expect(result.noChange).toBe(false);
    expect(result.item.revision).toBe(3);
    expect(result.item.basedOnVersion).toBe(1);
    expect(result.item.contentS3Key).toBe('schemas/schema-1/drafts/r3.json');
  });

  it('save enforces expectedRevision OCC', async () => {
    dynamoSendMock.mockResolvedValueOnce({ Items: [makeDraft({ revision: 4 })] });

    const mod = await importModule();

    await expect(
      mod.save('schema-1', {
        content: { type: 'object' },
        expectedRevision: 3,
        updatedBy: 'user-4',
      }),
    ).rejects.toThrow(/revision conflict/i);
  });
});
