import { afterAll, describe, expect, it } from 'vitest';

import {
  fixtureSchemaContent,
  fixtureSchemaMetadataInput,
} from './helpers/fixtures.js';
import {
  registerHarnessLifecycle,
  teardownHarness,
} from './helpers/full-stack.js';
import { createFreshSession } from './helpers/session.js';

const RUN_PERSISTENCE_INTEGRATION =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.RUN_PERSISTENCE_INTEGRATION === '1';

function expectIso(value: string): void {
  expect(typeof value).toBe('string');
  expect(Number.isNaN(Date.parse(value))).toBe(false);
}

describe.skipIf(!RUN_PERSISTENCE_INTEGRATION)('FS-061 T-04 schema metadata/content persistence across sessions', () => {
  registerHarnessLifecycle();

  afterAll(async () => {
    await teardownHarness();
  });

  it('Create metadata in Session A, Get in Session B returns all metadata fields', async () => {
    const sessionA = createFreshSession();
    const created = await sessionA.schemaMetadata.create(fixtureSchemaMetadataInput);

    const sessionB = createFreshSession();
    const loaded = await sessionB.schemaMetadata.get(created.schemaId);

    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(created);

    const metadata = loaded as NonNullable<typeof loaded>;
    expect(metadata.name).toBe(fixtureSchemaMetadataInput.name);
    expect(metadata.format).toBe(fixtureSchemaMetadataInput.format);
    expect(metadata.fieldCount).toBe(fixtureSchemaMetadataInput.fieldCount);
    expect(metadata.origin).toBe(fixtureSchemaMetadataInput.origin);
    expect(metadata.status).toBe(fixtureSchemaMetadataInput.status);
    expect(metadata.scope).toBe(fixtureSchemaMetadataInput.scope);
    expect(metadata.description).toBe(fixtureSchemaMetadataInput.description);
    expect(metadata.inferred).toBe(fixtureSchemaMetadataInput.inferred);
    expect(metadata.syncStatus).toBe(fixtureSchemaMetadataInput.syncStatus);
    expect(metadata.source).toEqual(fixtureSchemaMetadataInput.source);
    expectIso(metadata.createdAt);
    expectIso(metadata.updatedAt);
  });

  it('Store JSON schema content in Session A, retrieve in Session B with deep equality', async () => {
    const sessionA = createFreshSession();
    const metadata = await sessionA.schemaMetadata.create({
      ...fixtureSchemaMetadataInput,
      name: 'Schema Content Roundtrip',
    });

    await sessionA.s3.schemaContent.putProcessed(metadata.schemaId, fixtureSchemaContent);

    const sessionB = createFreshSession();
    const loadedContent = await sessionB.s3.schemaContent.get(metadata.schemaId);
    expect(loadedContent).toEqual(fixtureSchemaContent);
  });

  it('Combined metadata + content in A can be fully rehydrated in B', async () => {
    const sessionA = createFreshSession();
    const metadata = await sessionA.schemaMetadata.create({
      ...fixtureSchemaMetadataInput,
      name: 'Combined Rehydration Schema',
      fieldCount: 25,
      status: 'ready',
      scope: 'global',
      inferred: true,
      syncStatus: 'local-changes',
    });

    const content = {
      ...fixtureSchemaContent,
      properties: {
        ...fixtureSchemaContent.properties,
        customerId: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
      required: [...fixtureSchemaContent.required, 'customerId'],
    };

    await sessionA.s3.schemaContent.putProcessed(metadata.schemaId, content);

    const sessionB = createFreshSession();
    const loadedMetadata = await sessionB.schemaMetadata.get(metadata.schemaId);
    const loadedContent = await sessionB.s3.schemaContent.get(metadata.schemaId);

    expect(loadedMetadata).toEqual(metadata);
    expect(loadedContent).toEqual(content);
  });

  it('List schemas in Session B returns all persisted metadata records', async () => {
    const sessionA = createFreshSession();
    const one = await sessionA.schemaMetadata.create({
      ...fixtureSchemaMetadataInput,
      name: 'List Schema One',
      status: 'ingesting',
    });
    const two = await sessionA.schemaMetadata.create({
      ...fixtureSchemaMetadataInput,
      name: 'List Schema Two',
      status: 'ready',
      scope: 'project',
    });
    const three = await sessionA.schemaMetadata.create({
      ...fixtureSchemaMetadataInput,
      name: 'List Schema Three',
      status: 'error',
      inferred: true,
    });

    const sessionB = createFreshSession();
    const listed = await sessionB.schemaMetadata.list();

    expect(listed).toHaveLength(3);
    const byId = new Map(listed.map((item) => [item.schemaId, item]));
    expect(byId.get(one.schemaId)).toEqual(one);
    expect(byId.get(two.schemaId)).toEqual(two);
    expect(byId.get(three.schemaId)).toEqual(three);
  });

  it('Delete metadata/content in Session A, Session B cannot load either', async () => {
    const sessionA = createFreshSession();
    const metadata = await sessionA.schemaMetadata.create({
      ...fixtureSchemaMetadataInput,
      name: 'Delete Schema Fixture',
    });

    await sessionA.s3.schemaContent.putProcessed(metadata.schemaId, fixtureSchemaContent);
    await sessionA.schemaMetadata.delete(metadata.schemaId);
    await sessionA.s3.schemaContent.delete(metadata.schemaId);

    const sessionB = createFreshSession();
    const loadedMetadata = await sessionB.schemaMetadata.get(metadata.schemaId);
    const loadedContent = await sessionB.s3.schemaContent.get(metadata.schemaId);

    expect(loadedMetadata).toBeNull();
    expect(loadedContent).toBeNull();
  });

  it('Source map with optional commitSha persists exactly', async () => {
    const sessionA = createFreshSession();
    const created = await sessionA.schemaMetadata.create({
      ...fixtureSchemaMetadataInput,
      source: {
        type: 'github',
        repo: 'org/repo',
        branch: 'main',
        path: '/schemas/order.json',
        commitSha: 'abc123',
      },
    });

    const sessionB = createFreshSession();
    const loaded = await sessionB.schemaMetadata.get(created.schemaId);

    expect(loaded?.source).toEqual({
      type: 'github',
      repo: 'org/repo',
      branch: 'main',
      path: '/schemas/order.json',
      commitSha: 'abc123',
    });
  });

  it('Boolean and enum fields remain type-correct and exact', async () => {
    const sessionA = createFreshSession();
    const created = await sessionA.schemaMetadata.create({
      ...fixtureSchemaMetadataInput,
      inferred: true,
      format: 'xsd',
      scope: 'project',
      status: 'ready',
      origin: 'published',
      syncStatus: 'not-synced',
      source: { type: 'upload' },
    });

    const sessionB = createFreshSession();
    const loaded = await sessionB.schemaMetadata.get(created.schemaId);
    expect(loaded).not.toBeNull();

    const metadata = loaded as NonNullable<typeof loaded>;
    expect(typeof metadata.inferred).toBe('boolean');
    expect(metadata.inferred).toBe(true);
    expect(metadata.format).toBe('xsd');
    expect(metadata.scope).toBe('project');
    expect(metadata.status).toBe('ready');
    expect(metadata.origin).toBe('published');
    expect(metadata.syncStatus).toBe('not-synced');
    expect(metadata.source).toEqual({ type: 'upload' });
  });

  it('Large (>100KB) schema content round-trips through S3 helpers', async () => {
    const sessionA = createFreshSession();
    const metadata = await sessionA.schemaMetadata.create({
      ...fixtureSchemaMetadataInput,
      name: 'Large Schema Content Fixture',
    });

    const largeContent = {
      ...fixtureSchemaContent,
      definitions: {
        largePayload: {
          type: 'string',
          description: 'x'.repeat(120_000),
        },
      },
    };

    await sessionA.s3.schemaContent.putProcessed(metadata.schemaId, largeContent);

    const sessionB = createFreshSession();
    const loaded = await sessionB.s3.schemaContent.get(metadata.schemaId);

    expect(loaded).toEqual(largeContent);
  });
});
