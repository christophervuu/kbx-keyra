import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateSchemaMetadataInput, SchemaMetadataItem } from '../../../src/lib/persistence/types.js';

const { sendMock, randomUuidMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  randomUuidMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/clients.js', () => ({
  dynamoClient: {
    send: sendMock,
  },
}));

async function importModule() {
  return import('../../../src/lib/persistence/schema-metadata.js');
}

function makeCreateInput(overrides: Partial<CreateSchemaMetadataInput> = {}): CreateSchemaMetadataInput {
  return {
    name: 'Order Schema',
    format: 'json-schema',
    fieldCount: 0,
    origin: 'local',
    source: {
      type: 'upload',
    },
    ...overrides,
  };
}

function makeItem(overrides: Partial<SchemaMetadataItem> = {}): SchemaMetadataItem {
  return {
    schemaId: 'schema-1',
    name: 'Order Schema',
    format: 'json-schema',
    fieldCount: 25,
    origin: 'uploaded',
    status: 'ready',
    syncStatus: 'not-synced',
    source: { type: 'upload' },
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('persistence schema-metadata', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    randomUuidMock.mockReset();
    randomUuidMock.mockReturnValue('schema-created-1');
    vi.stubGlobal('crypto', {
      randomUUID: () => randomUuidMock(),
    } satisfies Pick<Crypto, 'randomUUID'>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('create generates UUID, sets defaults, and writes PutCommand', async () => {
    sendMock.mockResolvedValue({});
    const mod = await importModule();

    const result = await mod.create(makeCreateInput());

    expect(result.schemaId).toBe('schema-created-1');
    expect(result.status).toBe('ingesting');
    expect(result.origin).toBe('uploaded');
    expect(result.scope).toBeUndefined();
    expect(result.reviewState).toBe('not_required');
    expect(result.syncStatus).toBe('not-synced');
    expect(result.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(result.updatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);

    const putCommand = sendMock.mock.calls[0]?.[0] as {
      input: { TableName: string; Item: SchemaMetadataItem };
    };
    expect(putCommand.input.TableName).toBe('keyra-schema-metadata');
    expect(putCommand.input.Item).toEqual(result);
  });

  it('create respects explicit status and syncStatus when provided', async () => {
    sendMock.mockResolvedValue({});
    const mod = await importModule();

    const result = await mod.create(
      makeCreateInput({
        status: 'ready',
        syncStatus: 'synced',
      }),
    );

    expect(result.status).toBe('ready');
    expect(result.syncStatus).toBe('synced');
  });

  it('create sets inferred schemas to unreviewed by default and stores sample payload metadata fields', async () => {
    sendMock.mockResolvedValue({});
    const mod = await importModule();

    const result = await mod.create(
      makeCreateInput({
        inferred: true,
        samplePayloadCount: 1,
        samplePayloads: [
          {
            sampleId: 'sample-1',
            schemaId: 'schema-created-1',
            name: 'Initial upload',
            dataFormat: 'json',
            contentRef: 'schemas/schema-created-1/samples/sample-1/payload.json',
            usedForInference: true,
            source: 'initial_upload',
            createdAt: '2026-06-08T00:00:00.000Z',
          },
        ],
      }),
    );

    expect(result.reviewState).toBe('unreviewed');
    expect(result.samplePayloadCount).toBe(1);
    expect(result.samplePayloads?.[0]?.usedForInference).toBe(true);
  });

  it('create projects sourceRepoId when github source includes repoId', async () => {
    sendMock.mockResolvedValue({});
    const mod = await importModule();

    const result = await mod.create(
      makeCreateInput({
        origin: 'cdm',
        source: {
          type: 'github',
          repo: 'KBXT/KBX-Canonicals',
          repoId: 1052821334,
          branch: 'main',
          path: 'JSONSchemas/CommonDataModels/Patient.json',
          commitSha: 'abc123',
        },
      }),
    );

    expect(result.source).toEqual({
      type: 'github',
      repo: 'KBXT/KBX-Canonicals',
      repoId: 1052821334,
      branch: 'main',
      path: 'JSONSchemas/CommonDataModels/Patient.json',
      commitSha: 'abc123',
    });
    expect(result.sourceRepoId).toBe(1052821334);
  });

  it('create accepts canonical FS-076 sync statuses and legacy statuses', async () => {
    sendMock.mockResolvedValue({});
    const mod = await importModule();

    const canonical = await mod.create(
      makeCreateInput({
        syncStatus: 'update-available',
      }),
    );
    const failure = await mod.create(
      makeCreateInput({
        syncStatus: 'sync-failed',
      }),
    );
    const legacy = await mod.create(
      makeCreateInput({
        syncStatus: 'local-changes',
      }),
    );

    expect(canonical.syncStatus).toBe('update-available');
    expect(failure.syncStatus).toBe('sync-failed');
    expect(legacy.syncStatus).toBe('local-changes');
  });

  it('get returns item or null', async () => {
    const mod = await importModule();
    sendMock.mockResolvedValueOnce({ Item: makeItem() });
    sendMock.mockResolvedValueOnce({ Item: undefined });

    const found = await mod.get('schema-1');
    const missing = await mod.get('missing');

    expect(found?.schemaId).toBe('schema-1');
    expect(missing).toBeNull();
  });

  it('list returns all scan results', async () => {
    const mod = await importModule();
    sendMock.mockResolvedValue({
      Items: [makeItem({ schemaId: 'schema-1' }), makeItem({ schemaId: 'schema-2' })],
    });

    const result = await mod.list();

    expect(result).toHaveLength(2);
    const scanCommand = sendMock.mock.calls[0]?.[0] as { input: { TableName: string } };
    expect(scanCommand.input).toEqual({ TableName: 'keyra-schema-metadata' });
  });

  it('updateStatus updates status + optional fieldCount and always updatedAt', async () => {
    const mod = await importModule();

    sendMock.mockResolvedValueOnce({ Attributes: makeItem({ status: 'error', fieldCount: 0 }) });
    const updated = await mod.updateStatus('schema-1', 'error');
    expect(updated.status).toBe('error');

    const commandWithoutCount = sendMock.mock.calls[0]?.[0] as {
      input: {
        UpdateExpression: string;
        ExpressionAttributeNames: Record<string, string>;
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };
    expect(commandWithoutCount.input.UpdateExpression).toContain('#status = :status');
    expect(commandWithoutCount.input.UpdateExpression).toContain('#updatedAt = :updatedAt');
    expect(commandWithoutCount.input.UpdateExpression).not.toContain('#fieldCount = :fieldCount');

    sendMock.mockResolvedValueOnce({ Attributes: makeItem({ status: 'ready', fieldCount: 123 }) });
    const updatedWithCount = await mod.updateStatus('schema-1', 'ready', 123);
    expect(updatedWithCount.fieldCount).toBe(123);

    const commandWithCount = sendMock.mock.calls[1]?.[0] as {
      input: {
        UpdateExpression: string;
        ExpressionAttributeNames: Record<string, string>;
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };
    expect(commandWithCount.input.UpdateExpression).toContain('#fieldCount = :fieldCount');
    expect(commandWithCount.input.ExpressionAttributeNames['#fieldCount']).toBe('fieldCount');
    expect(commandWithCount.input.ExpressionAttributeValues[':fieldCount']).toBe(123);
  });

  it('delete sends DeleteCommand and is idempotent', async () => {
    sendMock.mockResolvedValue({});
    const mod = await importModule();

    await expect(mod.delete('missing-schema')).resolves.toBeUndefined();

    const deleteCommand = sendMock.mock.calls[0]?.[0] as {
      input: { TableName: string; Key: { schemaId: string } };
    };
    expect(deleteCommand.input).toEqual({
      TableName: 'keyra-schema-metadata',
      Key: {
        schemaId: 'missing-schema',
      },
    });
  });

  it('exports schemaMetadata object with expected operations', async () => {
    const mod = await importModule();

    expect(mod.schemaMetadata.aggregateReviewIssues).toBe(mod.aggregateReviewIssues);
    expect(mod.schemaMetadata.create).toBe(mod.create);
    expect(mod.schemaMetadata.get).toBe(mod.get);
    expect(mod.schemaMetadata.list).toBe(mod.list);
    expect(mod.schemaMetadata.markReviewed).toBe(mod.markReviewed);
    expect(mod.schemaMetadata.updateStatus).toBe(mod.updateStatus);
    expect(mod.schemaMetadata.delete).toBe(mod.delete);
  });

  it('aggregateReviewIssues produces deterministic non-blocking issue summary', async () => {
    const mod = await importModule();

    const summary = mod.aggregateReviewIssues({
      inferred: true,
      inferenceIssueCounts: {
        low_sample_evidence: 2,
        type_ambiguity_conflict: 1,
        optionality_uncertainty: 3,
        empty_shape_unknown: 0,
        field_name_quality: 0,
        missing_description: 4,
      },
    });

    expect(summary.reviewState).toBe('unreviewed');
    expect(summary.totalIssues).toBe(10);
    expect(summary.blockingIssueCount).toBe(0);
    expect(summary.hasBlockingIssues).toBe(false);
    expect(summary.reviewIssues).toEqual([
      { code: 'low_sample_evidence', count: 2, blocking: false },
      { code: 'type_ambiguity_conflict', count: 1, blocking: false },
      { code: 'optionality_uncertainty', count: 3, blocking: false },
      { code: 'missing_description', count: 4, blocking: false },
    ]);
  });

  it('markReviewed sets reviewState/reviewedAt and keeps status ready for non-error schemas', async () => {
    const mod = await importModule();
    sendMock.mockResolvedValueOnce({
      Item: makeItem({
        schemaId: 'schema-1',
        inferred: true,
        reviewState: 'unreviewed',
        status: 'ready',
        inferenceIssueCounts: {
          low_sample_evidence: 1,
          optionality_uncertainty: 2,
        },
      }),
    });
    sendMock.mockResolvedValueOnce({
      Attributes: makeItem({
        schemaId: 'schema-1',
        inferred: true,
        reviewState: 'reviewed',
        status: 'ready',
      }),
    });

    const result = await mod.markReviewed('schema-1');

    expect(result.reviewState).toBe('reviewed');
    expect(result.status).toBe('ready');

    const updateCommand = sendMock.mock.calls[1]?.[0] as {
      input: {
        UpdateExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };

    expect(updateCommand.input.UpdateExpression).toContain('#reviewState = :reviewState');
    expect(updateCommand.input.UpdateExpression).toContain('#reviewedAt = :reviewedAt');
    expect(updateCommand.input.ExpressionAttributeValues[':reviewState']).toBe('reviewed');
    expect(updateCommand.input.ExpressionAttributeValues[':status']).toBe('ready');
  });

  it('markReviewed preserves error status for blocking error schemas', async () => {
    const mod = await importModule();
    sendMock.mockResolvedValueOnce({
      Item: makeItem({
        schemaId: 'schema-err',
        inferred: true,
        reviewState: 'unreviewed',
        status: 'error',
      }),
    });
    sendMock.mockResolvedValueOnce({
      Attributes: makeItem({
        schemaId: 'schema-err',
        inferred: true,
        reviewState: 'reviewed',
        status: 'error',
      }),
    });

    const result = await mod.markReviewed('schema-err');

    expect(result.reviewState).toBe('reviewed');
    expect(result.status).toBe('error');

    const updateCommand = sendMock.mock.calls[1]?.[0] as {
      input: { ExpressionAttributeValues: Record<string, unknown> };
    };
    expect(updateCommand.input.ExpressionAttributeValues[':status']).toBe('error');
  });
});
