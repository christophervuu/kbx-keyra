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

describe.skipIf(!RUN_INTEGRATION)('persistence integration - mapping revisions', () => {
  let mappingRevisions: typeof import('../../../src/lib/persistence/mapping-revisions.js');
  let mappingVersions: typeof import('../../../src/lib/persistence/mapping-versions.js');

  beforeAll(async () => {
    await assertLocalServicesAvailable();
    applyPersistenceTestEnvironment();
    await createTables();
    await createBucket();

    vi.resetModules();
    mappingRevisions = await import('../../../src/lib/persistence/mapping-revisions.js');
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

  it('save/list/get/getConfig flow and prune unversioned revisions beyond 50', async () => {
    const mappingId = 'mapping-revision-integration';

    for (let revision = 1; revision <= 3; revision += 1) {
      await mappingRevisions.save(mappingId, {
        savedBy: 'tester',
        ruleCount: revision,
        config: {
          id: mappingId,
          projectId: 'project-1',
          name: `Revisioned Mapping ${revision}`,
          version: revision,
          engineVersion: '1.0.0',
          config: {},
          rules: [{ target: `f${revision}`, type: 'string', expression: `source("f${revision}")` }],
        },
      });
    }

    const firstList = await mappingRevisions.list(mappingId);
    expect(firstList.map((item) => item.revision)).toEqual([3, 2, 1]);

    const specific = await mappingRevisions.get(mappingId, 2);
    expect(specific?.revision).toBe(2);

    const config = await mappingRevisions.getConfig(mappingId, 2);
    expect(config?.version).toBe(2);

    // Protect revision 1 via version reference
    await mappingVersions.create(mappingId, {
      revisionNumber: 1,
      createdBy: 'tester',
    });

    for (let revision = 4; revision <= 55; revision += 1) {
      await mappingRevisions.save(mappingId, {
        savedBy: 'tester',
        ruleCount: revision,
        config: {
          id: mappingId,
          projectId: 'project-1',
          name: `Revisioned Mapping ${revision}`,
          version: revision,
          engineVersion: '1.0.0',
          config: {},
          rules: [{ target: `f${revision}`, type: 'string', expression: `source("f${revision}")` }],
        },
      });
    }

    const afterPrune = await mappingRevisions.list(mappingId);
    const revisionNumbers = afterPrune.map((item) => item.revision);

    // Keep 50 unversioned + protected referenced revision 1
    expect(afterPrune.length).toBe(51);
    expect(revisionNumbers).toContain(1);
    expect(revisionNumbers).not.toContain(2);
    expect(afterPrune[0]?.revision).toBe(55);
  }, 60_000);

  it('save no-ops when config unchanged', async () => {
    const mappingId = 'mapping-revision-noop';
    const config = {
      id: mappingId,
      projectId: 'project-1',
      name: 'No-op Revision',
      version: 1,
      engineVersion: '1.0.0',
      config: {},
      rules: [{ target: 'a', type: 'string' as const, expression: 'source("a")' }],
    };

    const first = await mappingRevisions.save(mappingId, {
      savedBy: 'tester',
      ruleCount: 1,
      config,
    });

    const second = await mappingRevisions.save(mappingId, {
      savedBy: 'tester',
      ruleCount: 1,
      config,
    });

    expect(first.noChange).toBe(false);
    expect(second.noChange).toBe(true);
    expect(second.item.revision).toBe(first.item.revision);
  });
});
