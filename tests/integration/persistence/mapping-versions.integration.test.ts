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

describe.skipIf(!RUN_INTEGRATION)('persistence integration - mapping versions', () => {
  let mappingVersions: typeof import('../../../src/lib/persistence/mapping-versions.js');

  beforeAll(async () => {
    await assertLocalServicesAvailable();
    applyPersistenceTestEnvironment();
    await createTables();
    await createBucket();

    vi.resetModules();
    mappingVersions = await import('../../../src/lib/persistence/mapping-versions.js');
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

  it('create/list/get version milestones with revision pointer', async () => {
    const mappingId = 'mapping-version-integration';

    for (let revisionNumber = 1; revisionNumber <= 3; revisionNumber += 1) {
      await mappingVersions.create(mappingId, {
        revisionNumber,
        createdBy: 'tester',
      });
    }

    const firstList = await mappingVersions.list(mappingId);
    expect(firstList.map((item) => item.version)).toEqual([3, 2, 1]);
    expect(firstList.map((item) => item.revisionNumber)).toEqual([3, 2, 1]);

    const specific = await mappingVersions.get(mappingId, 2);
    expect(specific?.version).toBe(2);
    expect(specific?.revisionNumber).toBe(2);
  }, 45_000);
});
