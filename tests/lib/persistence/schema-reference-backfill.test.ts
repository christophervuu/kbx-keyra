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
  return import('../../../src/lib/persistence/schema-reference-backfill.js');
}

describe('persistence schema-reference-backfill', () => {
  beforeEach(() => {
    vi.resetModules();
    dynamoSendMock.mockReset();
  });

  it('backfillMappingSchemaPins is dry-run idempotent and reports updated candidates', async () => {
    dynamoSendMock.mockResolvedValueOnce({
      Items: [
        {
          mappingId: 'map-1',
          enrichmentSources: [
            {
              alias: 'customerProfile',
              schemaId: 'schema-enrich',
              schemaVersion: 2,
              schemaVersionId: 'sv-enrich-2',
              contentHash: 'hash-enrich-2',
            },
          ],
        },
      ],
    });

    const mod = await importModule();
    const first = await mod.backfillMappingSchemaPins({ dryRun: true });

    expect(first.table).toBe('mappings');
    expect(first.scanned).toBe(1);
    expect(first.updated).toBe(1);
    expect(first.skipped).toBe(0);
    expect(first.failures).toEqual([]);

    dynamoSendMock.mockResolvedValueOnce({
      Items: [
        {
          mappingId: 'map-1',
          enrichmentSources: [
            {
              alias: 'customerProfile',
              schemaId: 'schema-enrich',
              schemaVersion: 2,
              schemaVersionId: 'sv-enrich-2',
              contentHash: 'hash-enrich-2',
            },
          ],
        },
      ],
    });

    const second = await mod.backfillMappingSchemaPins({ dryRun: true });
    expect(second).toEqual(first);
  });

  it('backfillDeploymentSchemaBundles updates only rows with legacy schemaRefs payload', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({
        Items: [
          {
            mappingId: 'map-1',
            environmentDeployedAt: 'DEV#2026-07-06T00:00:00.000Z',
            schemaRefs: [
              {
                role: 'source',
                schemaId: 'schema-source',
                schemaVersion: 1,
                schemaVersionId: 'sv-source-1',
                contentHash: 'hash-source-1',
                contentS3Key: 'schemas/schema-source/versions/v1.json',
              },
            ],
          },
          {
            mappingId: 'map-2',
            environmentDeployedAt: 'DEV#2026-07-06T00:01:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({});

    const mod = await importModule();
    const report = await mod.backfillDeploymentSchemaBundles();

    expect(report.table).toBe('deployments');
    expect(report.scanned).toBe(2);
    expect(report.updated).toBe(1);
    expect(report.skipped).toBe(1);
    expect(report.failures).toEqual([]);

    const updateCommand = dynamoSendMock.mock.calls[1]?.[0] as {
      input: {
        TableName: string;
        Key: { mappingId: string; environmentDeployedAt: string };
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };
    expect(updateCommand.input.TableName).toBe('keyra-deployments');
    expect(updateCommand.input.Key).toEqual({
      mappingId: 'map-1',
      environmentDeployedAt: 'DEV#2026-07-06T00:00:00.000Z',
    });
    expect(updateCommand.input.ExpressionAttributeValues[':schemaRefs']).toEqual([
      {
        role: 'source',
        schemaId: 'schema-source',
        schemaVersion: 1,
        schemaVersionId: 'sv-source-1',
        contentHash: 'hash-source-1',
        contentS3Key: 'schemas/schema-source/versions/v1.json',
      },
    ]);
  });

  it('runSchemaReferenceBackfill returns mapping and deployment reports in order', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [] });

    const mod = await importModule();
    const reports = await mod.runSchemaReferenceBackfill({ dryRun: true });

    expect(reports).toHaveLength(2);
    expect(reports[0]?.table).toBe('mappings');
    expect(reports[1]?.table).toBe('deployments');
  });
});
