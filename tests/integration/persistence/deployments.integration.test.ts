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

describe.skipIf(!RUN_INTEGRATION)('persistence integration - deployments', () => {
  let deployments: typeof import('../../../src/lib/persistence/deployments.js');

  beforeAll(async () => {
    await assertLocalServicesAvailable();
    applyPersistenceTestEnvironment();
    await createTables();
    await createBucket();

    vi.resetModules();
    deployments = await import('../../../src/lib/persistence/deployments.js');
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

  it('create/getCurrent/listHistory flow with per-environment current pointers', async () => {
    const mappingId = 'mapping-deployment-integration';

    const baseConfig = {
      id: mappingId,
      projectId: 'project-1',
      name: 'Deployment Mapping',
      version: 1,
      engineVersion: '1.0.0',
      config: {},
      rules: [{ target: 'A', type: 'string' as const, expression: 'source("a")' }],
    };

    const dev = await deployments.create({
      mappingId,
      environment: 'DEV',
      sourceType: 'revision',
      sourceNumber: 5,
      deployedBy: 'tester',
      config: baseConfig,
    });

    const preprod = await deployments.create({
      mappingId,
      environment: 'PREPROD',
      sourceType: 'version',
      sourceNumber: 2,
      deployedBy: 'tester',
      config: {
        ...baseConfig,
        version: 2,
      },
    });

    expect(dev.environment).toBe('DEV');
    expect(preprod.environment).toBe('PREPROD');

    const currentDev = await deployments.getCurrent(mappingId, 'DEV');
    const currentPreprod = await deployments.getCurrent(mappingId, 'PREPROD');
    const currentProd = await deployments.getCurrent(mappingId, 'PROD');

    expect(currentDev?.sourceType).toBe('revision');
    expect(currentDev?.sourceNumber).toBe(5);
    expect(currentPreprod?.sourceType).toBe('version');
    expect(currentPreprod?.sourceNumber).toBe(2);
    expect(currentProd).toBeNull();

    const all = await deployments.getCurrentAll(mappingId);
    expect(all.DEV?.sourceNumber).toBe(5);
    expect(all.PREPROD?.sourceNumber).toBe(2);
    expect(all.PROD).toBeNull();

    const historyAll = await deployments.listHistory(mappingId);
    expect(historyAll.length).toBe(2);

    const historyDev = await deployments.listHistory(mappingId, 'DEV');
    expect(historyDev.length).toBe(1);
    expect(historyDev[0]?.environment).toBe('DEV');

    const historyPreprod = await deployments.listHistory(mappingId, 'PREPROD', 1);
    expect(historyPreprod.length).toBe(1);
    expect(historyPreprod[0]?.environment).toBe('PREPROD');
  }, 45_000);
});
