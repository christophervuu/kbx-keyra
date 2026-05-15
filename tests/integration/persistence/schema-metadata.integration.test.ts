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

describe.skipIf(!RUN_INTEGRATION)('persistence integration - schema metadata', () => {
  let schemaMetadata: typeof import('../../../src/lib/persistence/schema-metadata.js');

  beforeAll(async () => {
    await assertLocalServicesAvailable();
    applyPersistenceTestEnvironment();
    await createTables();
    await createBucket();

    vi.resetModules();
    schemaMetadata = await import('../../../src/lib/persistence/schema-metadata.js');
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

  it('create → get → list → updateStatus → delete', async () => {
    const created = await schemaMetadata.create({
      name: 'Order Schema',
      format: 'json-schema',
      fieldCount: 0,
      origin: 'local',
      scope: 'project',
      source: { type: 'upload' },
    });

    expect(created.status).toBe('ingesting');

    const fetched = await schemaMetadata.get(created.schemaId);
    expect(fetched?.schemaId).toBe(created.schemaId);

    const listed = await schemaMetadata.list();
    expect(listed.some((item) => item.schemaId === created.schemaId)).toBe(true);

    const updated = await schemaMetadata.updateStatus(created.schemaId, 'ready', 42);
    expect(updated.status).toBe('ready');
    expect(updated.fieldCount).toBe(42);

    await schemaMetadata.delete(created.schemaId);
    const afterDelete = await schemaMetadata.get(created.schemaId);
    expect(afterDelete).toBeNull();
  });
});
