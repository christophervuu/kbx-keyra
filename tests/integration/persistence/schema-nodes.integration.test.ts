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

type SchemaNodeItem = import('../../../src/lib/persistence/types.js').SchemaNodeItem;

function createNodes(count: number, schemaId: string): SchemaNodeItem[] {
  return Array.from({ length: count }, (_, index) => ({
    schemaId,
    path: `Order.Address.Field${index + 1}`,
    fieldName: `Field${index + 1}`,
    type: index % 2 === 0 ? 'string' : 'number',
    description: `Node ${index + 1}`,
    depth: 2,
    isArray: false,
    isRequired: false,
    parentPath: 'Order.Address',
    childCount: 0,
    subtreeFieldCount: 1,
    embeddingText: `Order.Address.Field${index + 1}`,
  }));
}

describe.skipIf(!RUN_INTEGRATION)('persistence integration - schema nodes', () => {
  let schemaNodes: typeof import('../../../src/lib/persistence/schema-nodes.js');

  beforeAll(async () => {
    await assertLocalServicesAvailable();
    applyPersistenceTestEnvironment();
    await createTables();
    await createBucket();

    vi.resetModules();
    schemaNodes = await import('../../../src/lib/persistence/schema-nodes.js');
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

  it('batchWrite 75 → listBySchema 75 → queryContains → deleteBySchema → empty list', async () => {
    const schemaId = 'schema-nodes-1';
    const nodes = createNodes(75, schemaId);

    await schemaNodes.batchWrite(schemaId, nodes);

    const listed = await schemaNodes.listBySchema(schemaId);
    expect(listed).toHaveLength(75);

    const contains = await schemaNodes.queryContains(schemaId, 'Field1', 50);
    expect(contains.length).toBeGreaterThan(0);
    expect(contains.some((item) => item.path.includes('Field1') || item.fieldName.includes('Field1'))).toBe(true);

    await schemaNodes.deleteBySchema(schemaId);

    const afterDelete = await schemaNodes.listBySchema(schemaId);
    expect(afterDelete).toEqual([]);
  });
});
