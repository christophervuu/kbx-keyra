import { afterAll, describe, expect, it } from 'vitest';

import { fixtureProjectInput } from './helpers/fixtures.js';
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

describe.skipIf(!RUN_PERSISTENCE_INTEGRATION)('FS-061 T-02 project persistence across sessions', () => {
  registerHarnessLifecycle();

  afterAll(async () => {
    await teardownHarness();
  });

  it('Create in Session A, Get in Session B returns full metadata', async () => {
    const sessionA = createFreshSession();
    const created = await sessionA.projects.create(fixtureProjectInput);

    const sessionB = createFreshSession();
    const loaded = await sessionB.projects.get(created.projectId);

    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(created);

    const project = loaded as NonNullable<typeof loaded>;
    expect(project.projectId).toBeTypeOf('string');
    expect(project.name).toBe(fixtureProjectInput.name);
    expect(project.description).toBe(fixtureProjectInput.description);
    expect(project.slug).toBe(fixtureProjectInput.slug);
    expect(project.schemaRefs).toEqual(fixtureProjectInput.schemaRefs);
    expect(project.tags).toEqual(fixtureProjectInput.tags);
    expectIso(project.createdAt);
    expectIso(project.updatedAt);
    expect(Date.parse(project.createdAt)).toBeLessThanOrEqual(Date.parse(project.updatedAt));
  });

  it('Create in Session A, List in Session B returns all projects with metadata', async () => {
    const sessionA = createFreshSession();
    const createdA = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Cross Session Project A',
      slug: 'cross-session-project-a',
    });
    const createdB = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Cross Session Project B',
      slug: 'cross-session-project-b',
    });
    const createdC = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Cross Session Project C',
      slug: 'cross-session-project-c',
    });

    const sessionB = createFreshSession();
    const listed = await sessionB.projects.list();

    expect(listed).toHaveLength(3);
    const byId = new Map(listed.map((item) => [item.projectId, item]));

    expect(byId.get(createdA.projectId)).toEqual(createdA);
    expect(byId.get(createdB.projectId)).toEqual(createdB);
    expect(byId.get(createdC.projectId)).toEqual(createdC);

    for (const item of listed) {
      expect(item.schemaRefs).not.toBeNull();
      expect(item.tags).not.toBeNull();
      expectIso(item.createdAt);
      expectIso(item.updatedAt);
    }
  });

  it('Update in Session A, Get in Session B returns updated fields and timestamp semantics', async () => {
    const sessionA = createFreshSession();
    const created = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Before Update Name',
      description: 'Before update description',
      slug: 'before-update-slug',
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });

    const updated = await sessionA.projects.update(created.projectId, {
      name: 'After Update Name',
      description: 'After update description',
    });

    const sessionB = createFreshSession();
    const loaded = await sessionB.projects.get(created.projectId);

    expect(loaded).not.toBeNull();
    const project = loaded as NonNullable<typeof loaded>;

    expect(project).toEqual(updated);
    expect(project.name).toBe('After Update Name');
    expect(project.description).toBe('After update description');
    expect(project.slug).toBe(created.slug);
    expect(project.schemaRefs).toEqual(created.schemaRefs);
    expect(project.tags).toEqual(created.tags);
    expect(project.createdAt).toBe(created.createdAt);
    expect(Date.parse(project.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
  });

  it('Delete in Session A, Get in Session B returns null (not found)', async () => {
    const sessionA = createFreshSession();
    const created = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Project To Delete',
      slug: 'project-to-delete',
    });

    await sessionA.projects.delete(created.projectId);

    const sessionB = createFreshSession();
    const loaded = await sessionB.projects.get(created.projectId);

    expect(loaded).toBeNull();
  });

  it('Schema refs and tags round-trip with order and optional fields intact', async () => {
    const sessionA = createFreshSession();
    const created = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Project With Ordered Refs And Tags',
      slug: 'project-with-ordered-refs-and-tags',
      schemaRefs: [
        {
          schemaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          type: 'github',
          commitSha: 'feedbeef',
        },
        {
          schemaId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          type: 'local',
        },
      ],
      tags: ['alpha', 'beta', 'gamma'],
    });

    const sessionB = createFreshSession();
    const loaded = await sessionB.projects.get(created.projectId);

    expect(loaded).not.toBeNull();
    const project = loaded as NonNullable<typeof loaded>;

    expect(project.schemaRefs).toEqual([
      {
        schemaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        type: 'github',
        commitSha: 'feedbeef',
      },
      {
        schemaId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        type: 'local',
      },
    ]);
    expect(project.tags).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('Empty schemaRefs and tags persist as empty arrays (not null/undefined)', async () => {
    const sessionA = createFreshSession();
    const created = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Project With Empty Arrays',
      slug: 'project-with-empty-arrays',
      schemaRefs: [],
      tags: [],
    });

    const sessionB = createFreshSession();
    const loaded = await sessionB.projects.get(created.projectId);

    expect(loaded).not.toBeNull();
    const project = loaded as NonNullable<typeof loaded>;
    expect(Array.isArray(project.schemaRefs)).toBe(true);
    expect(Array.isArray(project.tags)).toBe(true);
    expect(project.schemaRefs).toEqual([]);
    expect(project.tags).toEqual([]);
  });
});
