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

describe.skipIf(!RUN_INTEGRATION)('persistence integration - projects', () => {
  let projects: typeof import('../../../src/lib/persistence/projects.js');

  beforeAll(async () => {
    await assertLocalServicesAvailable();
    applyPersistenceTestEnvironment();
    await createTables();
    await createBucket();

    vi.resetModules();
    projects = await import('../../../src/lib/persistence/projects.js');
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

  it('full CRUD cycle: create → get → list → update → delete', async () => {
    const created = await projects.create({
      name: 'Project Integration',
      description: 'Integration test project',
      slug: 'project-integration',
      schemaRefs: [],
      tags: ['integration'],
    });

    expect(created.projectId).toBeTruthy();

    const found = await projects.get(created.projectId);
    expect(found?.projectId).toBe(created.projectId);

    const listed = await projects.list();
    expect(listed.some((item) => item.projectId === created.projectId)).toBe(true);

    const updated = await projects.update(created.projectId, {
      name: 'Project Integration Updated',
      description: 'Updated description',
    });
    expect(updated.name).toBe('Project Integration Updated');
    expect(updated.updatedAt).not.toBe(created.updatedAt);

    await projects.delete(created.projectId);
    const afterDelete = await projects.get(created.projectId);
    expect(afterDelete).toBeNull();
  });
});
