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

describe.skipIf(!RUN_INTEGRATION)('persistence integration - s3 content helpers', () => {
  let schemaContent: typeof import('../../../src/lib/persistence/s3/schema-content.js');
  let mappingConfig: typeof import('../../../src/lib/persistence/s3/mapping-config.js');

  beforeAll(async () => {
    await assertLocalServicesAvailable();
    applyPersistenceTestEnvironment();
    await createTables();
    await createBucket();

    vi.resetModules();
    schemaContent = await import('../../../src/lib/persistence/s3/schema-content.js');
    mappingConfig = await import('../../../src/lib/persistence/s3/mapping-config.js');
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

  it('schema content put/get/getOriginal/delete flow', async () => {
    const schemaId = 'schema-content-1';
    await schemaContent.putOriginal(schemaId, '{"type":"object"}', 'json');
    await schemaContent.putProcessed(schemaId, { type: 'object', properties: { id: { type: 'string' } } });

    const processed = await schemaContent.get(schemaId);
    const original = await schemaContent.getOriginal(schemaId, 'json');

    expect(processed).toMatchObject({ type: 'object' });
    expect(original).toBe('{"type":"object"}');

    await schemaContent.delete(schemaId);
    const afterDelete = await schemaContent.get(schemaId);
    expect(afterDelete).toBeNull();
  });

  it('mapping config put/get/delete flow', async () => {
    const mappingId = 'mapping-config-1';
    await mappingConfig.put(mappingId, {
      id: mappingId,
      projectId: 'project-1',
      name: 'S3 Mapping',
      version: 1,
      engineVersion: '1.0.0',
      config: {},
      rules: [],
    });

    const found = await mappingConfig.get(mappingId);
    expect(found?.name).toBe('S3 Mapping');

    await mappingConfig.delete(mappingId);
    const missing = await mappingConfig.get(mappingId);
    expect(missing).toBeNull();
  });
});
