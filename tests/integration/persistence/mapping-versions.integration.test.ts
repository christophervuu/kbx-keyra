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

  it('save/list/get/getConfig flow and prune to <= 50 versions', async () => {
    const mappingId = 'mapping-version-integration';

    for (let version = 1; version <= 3; version += 1) {
      await mappingVersions.save(mappingId, {
        version,
        savedBy: 'tester',
        ruleCount: version,
        config: {
          id: mappingId,
          projectId: 'project-1',
          name: 'Versioned Mapping',
          version,
          engineVersion: '1.0.0',
          config: {},
          rules: [],
        },
      });
    }

    const firstList = await mappingVersions.list(mappingId);
    expect(firstList.map((item) => item.version)).toEqual([3, 2, 1]);

    const specific = await mappingVersions.get(mappingId, 2);
    expect(specific?.version).toBe(2);

    const config = await mappingVersions.getConfig(mappingId, 2);
    expect(config?.version).toBe(2);

    for (let version = 4; version <= 51; version += 1) {
      await mappingVersions.save(mappingId, {
        version,
        savedBy: 'tester',
        ruleCount: version,
        config: {
          id: mappingId,
          projectId: 'project-1',
          name: 'Versioned Mapping',
          version,
          engineVersion: '1.0.0',
          config: {},
          rules: [],
        },
      });
    }

    const afterPrune = await mappingVersions.list(mappingId);
    expect(afterPrune.length).toBeLessThanOrEqual(50);
    expect(afterPrune[0]?.version).toBe(51);
  }, 45_000);
});
