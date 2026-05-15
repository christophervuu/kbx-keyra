import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  applyPersistenceTestEnvironment,
  assertLocalServicesAvailable,
  clearBucket,
  clearTablesData,
  createBucket,
  createTables,
  deleteBucket,
  deleteTables,
} from './setup.js';

const RUN_INTEGRATION = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.RUN_PERSISTENCE_INTEGRATION === '1';

describe.skipIf(!RUN_INTEGRATION)('persistence integration - mappings', () => {
  let mappings: typeof import('../../../src/lib/persistence/mappings.js');

  beforeAll(async () => {
    await assertLocalServicesAvailable();
    applyPersistenceTestEnvironment();
    await createTables();
    await createBucket();

    vi.resetModules();
    mappings = await import('../../../src/lib/persistence/mappings.js');
  });

  afterEach(async () => {
    await clearTablesData();
    await clearBucket();
  });

  afterAll(async () => {
    await clearBucket();
    await deleteTables();
    await deleteBucket();
  });

  it('create → get → listByProject → update(version++) → duplicate → delete', async () => {
    const created = await mappings.create({
      projectId: 'project-1',
      name: 'Invoice Mapping',
      config: {
        id: 'temp',
        projectId: 'project-1',
        name: 'Invoice Mapping',
        version: 1,
        engineVersion: '1.0.0',
        config: {},
        rules: [],
      },
    });

    const fetched = await mappings.get(created.mappingId);
    expect(fetched?.mappingId).toBe(created.mappingId);

    const byProject = await mappings.listByProject('project-1');
    expect(byProject.some((item) => item.mappingId === created.mappingId)).toBe(true);

    const updated = await mappings.update(
      created.mappingId,
      {
        status: 'ready',
        ruleCount: 1,
        coverage: 100,
      },
      {
        id: created.mappingId,
        projectId: 'project-1',
        name: 'Invoice Mapping',
        version: 2,
        engineVersion: '1.0.0',
        config: {},
        rules: [{ target: 'Invoice.Id', type: 'string', expression: 'source("id")' }],
      },
    );
    expect(updated.version).toBe(2);

    const duplicated = await mappings.duplicate(created.mappingId, 'Invoice Mapping Copy');
    expect(duplicated.mappingId).not.toBe(created.mappingId);
    expect(duplicated.version).toBe(1);
    expect(duplicated.name).toBe('Invoice Mapping Copy');

    await mappings.delete(created.mappingId);
    const afterDelete = await mappings.get(created.mappingId);
    expect(afterDelete).toBeNull();
  });
});
