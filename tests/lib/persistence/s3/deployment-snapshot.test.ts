import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  return import('../../../../src/lib/persistence/s3/deployment-snapshot.js');
}

function makeConfig(): MappingConfig {
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
  };
}

describe('persistence s3/deployment-snapshot', () => {
  beforeEach(() => {
    vi.resetModules();
    s3SendMock.mockReset();
  });

  it('put stores snapshot at deployment key and returns key', async () => {
    s3SendMock.mockResolvedValue({});
    const mod = await importModule();

    const key = await mod.put('mapping-1', 'DEV', '2026-06-01T00:00:00.000Z', makeConfig());

    expect(key).toBe('deployments/mapping-1/DEV/2026-06-01T00:00:00.000Z.json');

    const command = s3SendMock.mock.calls[0]?.[0] as {
      input: { Bucket: string; Key: string; ContentType: string; Body: string };
    };

    expect(command.input.Bucket).toBe('keyra-storage');
    expect(command.input.Key).toBe('deployments/mapping-1/DEV/2026-06-01T00:00:00.000Z.json');
    expect(command.input.ContentType).toBe('application/json');
    const payload = JSON.parse(command.input.Body);
    expect(payload.config).toEqual(makeConfig());
    expect(payload.metadata).toEqual({});
  });

  it('put stores snapshot metadata when provided', async () => {
    s3SendMock.mockResolvedValue({});
    const mod = await importModule();

    await mod.put('mapping-1', 'DEV', '2026-06-01T00:00:00.000Z', makeConfig(), {
      cdmSchemaTraceability: [
        {
          schemaId: 'schema-1',
          schemaName: 'CDM Schema',
          referenceRole: 'source',
          repo: 'KBXT/KBX-Canonicals',
          path: 'JSONSchemas/CommonDataModels/Order.json',
          commitSha: 'abc123',
        },
      ],
    });

    const command = s3SendMock.mock.calls[0]?.[0] as {
      input: { Body: string };
    };

    const payload = JSON.parse(command.input.Body);
    expect(payload.metadata.cdmSchemaTraceability).toEqual([
      {
        schemaId: 'schema-1',
        schemaName: 'CDM Schema',
        referenceRole: 'source',
        repo: 'KBXT/KBX-Canonicals',
        path: 'JSONSchemas/CommonDataModels/Order.json',
        commitSha: 'abc123',
      },
    ]);
  });

  it('exports deploymentSnapshot object with expected operations', async () => {
    const mod = await importModule();

    expect(mod.deploymentSnapshot.put).toBe(mod.put);
    expect(mod.deploymentSnapshot.putRuntimeSnapshot).toBe(mod.putRuntimeSnapshot);
  });

  it('putRuntimeSnapshot writes runtime snapshot when object is missing', async () => {
    s3SendMock
      .mockRejectedValueOnce({ name: 'NotFound', $metadata: { httpStatusCode: 404 } })
      .mockResolvedValueOnce({});

    const mod = await importModule();

    const result = await mod.putRuntimeSnapshot({
      mappingId: 'mapping-1',
      snapshotId: 'snapshot-1',
      payload: { config: makeConfig() },
      contentHash: 'abc123',
    });

    expect(result).toEqual({
      key: 'runtime/snapshots/mapping-1/snapshot-1.json',
      status: 'created',
    });

    const putCommand = s3SendMock.mock.calls[1]?.[0] as {
      input: { Bucket: string; Key: string; ContentType: string; Body: string };
    };

    expect(putCommand.input.Bucket).toBe('keyra-storage');
    expect(putCommand.input.Key).toBe('runtime/snapshots/mapping-1/snapshot-1.json');
    expect(putCommand.input.ContentType).toBe('application/json');
  });

  it('putRuntimeSnapshot returns idempotent when existing object hash matches', async () => {
    s3SendMock.mockResolvedValueOnce({ ETag: '"abc123"' });

    const mod = await importModule();

    const result = await mod.putRuntimeSnapshot({
      mappingId: 'mapping-1',
      snapshotId: 'snapshot-1',
      payload: { config: makeConfig() },
      contentHash: 'abc123',
    });

    expect(result).toEqual({
      key: 'runtime/snapshots/mapping-1/snapshot-1.json',
      status: 'idempotent',
    });

    expect(s3SendMock).toHaveBeenCalledTimes(1);
  });

  it('putRuntimeSnapshot throws RuntimeSnapshotHashMismatchError on hash mismatch', async () => {
    s3SendMock.mockResolvedValueOnce({ ETag: '"different"' });

    const mod = await importModule();

    await expect(
      mod.putRuntimeSnapshot({
        mappingId: 'mapping-1',
        snapshotId: 'snapshot-1',
        payload: { config: makeConfig() },
        contentHash: 'abc123',
      }),
    ).rejects.toMatchObject({
      name: 'RuntimeSnapshotHashMismatchError',
    });
  });

  it('verifyRuntimeSnapshotReadHash reads and validates mappingConfig hash', async () => {
    const config = makeConfig();
    const payload = {
      mappingConfig: config,
    };

    s3SendMock.mockResolvedValueOnce({
      Body: {
        transformToString: vi.fn().mockResolvedValue(JSON.stringify(payload)),
      },
    });

    const { computeConfigHash } = await import('../../../../src/lib/persistence/hash.js');
    const expectedHash = await computeConfigHash(config);

    const mod = await importModule();
    const result = await mod.verifyRuntimeSnapshotReadHash({
      mappingId: 'mapping-1',
      snapshotId: 'snapshot-1',
      expectedContentHash: expectedHash,
    });

    expect(result.key).toBe('runtime/snapshots/mapping-1/snapshot-1.json');
    expect(result.payload).toEqual(payload);
  });

  it('verifyRuntimeSnapshotReadHash throws RuntimeSnapshotUnreadableError when hash mismatches', async () => {
    s3SendMock.mockResolvedValueOnce({
      Body: {
        transformToString: vi.fn().mockResolvedValue(
          JSON.stringify({
            mappingConfig: makeConfig(),
          }),
        ),
      },
    });

    const mod = await importModule();

    await expect(
      mod.verifyRuntimeSnapshotReadHash({
        mappingId: 'mapping-1',
        snapshotId: 'snapshot-1',
        expectedContentHash: 'different-hash',
      }),
    ).rejects.toMatchObject({
      name: 'RuntimeSnapshotUnreadableError',
    });
  });

  it('verifyRuntimeSnapshotReadHash validates bundle artifact hash when bundle payload is present', async () => {
    const { buildDeploymentArtifactBundle } = await import('../../../../src/lib/deployment/artifact-bundle.js');

    const bundle = buildDeploymentArtifactBundle({
      mappingId: 'mapping-1',
      sourceType: 'version',
      sourceNumber: 1,
      mappingConfig: makeConfig(),
    });

    s3SendMock.mockResolvedValueOnce({
      Body: {
        transformToString: vi.fn().mockResolvedValue(JSON.stringify(bundle)),
      },
    });

    const mod = await importModule();
    const result = await mod.verifyRuntimeSnapshotReadHash({
      mappingId: 'mapping-1',
      snapshotId: 'snapshot-1',
      expectedContentHash: bundle.artifactHash,
    });

    expect(result.payload).toEqual(bundle);
  });
});
