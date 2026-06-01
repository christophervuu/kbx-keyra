import { afterAll, describe, expect, it } from 'vitest';

import {
  fixtureMappingConfig,
  fixtureProjectInput,
} from './helpers/fixtures.js';
import {
  registerHarnessLifecycle,
  teardownHarness,
} from './helpers/full-stack.js';
import { createFreshSession } from './helpers/session.js';

const RUN_PERSISTENCE_INTEGRATION =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.RUN_PERSISTENCE_INTEGRATION === '1';

function buildConfig(name: string, version: number, ruleCount: number) {
  return {
    ...fixtureMappingConfig,
    name,
    version,
    rules: fixtureMappingConfig.rules.slice(0, ruleCount),
  };
}

describe.skipIf(!RUN_PERSISTENCE_INTEGRATION)('FS-061 T-03 mapping/version persistence across sessions', () => {
  registerHarnessLifecycle();

  afterAll(async () => {
    await teardownHarness();
  });

  it('Create mapping in Session A, Get in Session B returns metadata and persisted S3 config', async () => {
    const sessionA = createFreshSession();
    const project = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Mapping Parent Project A',
      slug: 'mapping-parent-project-a',
    });

    const config = buildConfig('Mapping Create/Get Fixture', 1, 3);
    const created = await sessionA.mappings.create({
      projectId: project.projectId,
      name: config.name,
      sourceSchemaId: fixtureMappingConfig.sourceSchemaRef?.schemaId,
      targetSchemaId: fixtureMappingConfig.targetSchemaRef?.schemaId,
      status: 'ready',
      ruleCount: config.rules.length,
      coverage: 75,
      config,
    });

    const sessionB = createFreshSession();
    const loaded = await sessionB.mappings.get(created.mappingId);
    expect(loaded).not.toBeNull();

    const mapping = loaded as NonNullable<typeof loaded>;
    expect(mapping).toEqual(created);
    expect(mapping.configS3Key).toBe(`mappings/${mapping.mappingId}/config.json`);

    const s3Config = await sessionB.mappings.getConfigByKey(mapping.configS3Key);
    expect(s3Config).toEqual({
      ...config,
      id: mapping.mappingId,
      projectId: project.projectId,
      name: config.name,
      version: 1,
    });
  });

  it('Update mapping in Session A, Get in Session B shows incremented version and updated S3 config', async () => {
    const sessionA = createFreshSession();
    const project = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Mapping Parent Project B',
      slug: 'mapping-parent-project-b',
    });

    const initialConfig = buildConfig('Mapping Before Update', 1, 2);
    const created = await sessionA.mappings.create({
      projectId: project.projectId,
      name: initialConfig.name,
      sourceSchemaId: fixtureMappingConfig.sourceSchemaRef?.schemaId,
      targetSchemaId: fixtureMappingConfig.targetSchemaRef?.schemaId,
      status: 'ready',
      ruleCount: initialConfig.rules.length,
      coverage: 50,
      config: initialConfig,
    });

    const updatedConfig = buildConfig('Mapping After Update', 2, 3);
    const updated = await sessionA.mappings.update(
      created.mappingId,
      {
        name: 'Mapping After Update',
        ruleCount: updatedConfig.rules.length,
        coverage: 90,
        status: 'ready',
      },
      updatedConfig,
    );

    expect(updated.version).toBe((created.version ?? 0) + 1);

    const sessionB = createFreshSession();
    const loaded = await sessionB.mappings.get(created.mappingId);
    expect(loaded).not.toBeNull();

    const mapping = loaded as NonNullable<typeof loaded>;
    expect(mapping.version).toBe(2);
    expect(mapping.name).toBe('Mapping After Update');
    expect(mapping.ruleCount).toBe(3);

    const s3Config = await sessionB.mappings.getConfigByKey(mapping.configS3Key);
    expect(s3Config).toEqual({
      ...updatedConfig,
      id: mapping.mappingId,
      projectId: project.projectId,
      name: 'Mapping After Update',
      version: 2,
    });
  });

  it('List mappings by project in Session B returns all project-scoped mappings', async () => {
    const sessionA = createFreshSession();
    const projectA = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'List Parent A',
      slug: 'list-parent-a',
    });
    const projectB = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'List Parent B',
      slug: 'list-parent-b',
    });

    const mappingOne = await sessionA.mappings.create({
      projectId: projectA.projectId,
      name: 'List Mapping One',
      sourceSchemaId: fixtureMappingConfig.sourceSchemaRef?.schemaId,
      targetSchemaId: fixtureMappingConfig.targetSchemaRef?.schemaId,
      status: 'draft',
      ruleCount: 0,
      coverage: 0,
      config: buildConfig('List Mapping One', 1, 0),
    });
    const mappingTwo = await sessionA.mappings.create({
      projectId: projectA.projectId,
      name: 'List Mapping Two',
      sourceSchemaId: fixtureMappingConfig.sourceSchemaRef?.schemaId,
      targetSchemaId: fixtureMappingConfig.targetSchemaRef?.schemaId,
      status: 'ready',
      ruleCount: 2,
      coverage: 66,
      config: buildConfig('List Mapping Two', 1, 2),
    });
    await sessionA.mappings.create({
      projectId: projectB.projectId,
      name: 'Other Project Mapping',
      sourceSchemaId: fixtureMappingConfig.sourceSchemaRef?.schemaId,
      targetSchemaId: fixtureMappingConfig.targetSchemaRef?.schemaId,
      status: 'ready',
      ruleCount: 1,
      coverage: 100,
      config: buildConfig('Other Project Mapping', 1, 1),
    });

    const sessionB = createFreshSession();
    const listed = await sessionB.mappings.listByProject(projectA.projectId);
    expect(listed).toHaveLength(2);
    expect(listed.every((entry) => entry.projectId === projectA.projectId)).toBe(true);

    const ids = listed.map((entry) => entry.mappingId);
    expect(ids).toContain(mappingOne.mappingId);
    expect(ids).toContain(mappingTwo.mappingId);
  });

  it('Delete mapping in Session A, Get in Session B returns null and S3 config is removed', async () => {
    const sessionA = createFreshSession();
    const project = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Delete Parent',
      slug: 'delete-parent',
    });

    const created = await sessionA.mappings.create({
      projectId: project.projectId,
      name: 'Mapping To Delete',
      sourceSchemaId: fixtureMappingConfig.sourceSchemaRef?.schemaId,
      targetSchemaId: fixtureMappingConfig.targetSchemaRef?.schemaId,
      status: 'ready',
      ruleCount: 2,
      coverage: 70,
      config: buildConfig('Mapping To Delete', 1, 2),
    });

    await sessionA.mappings.delete(created.mappingId);

    const sessionB = createFreshSession();
    const loaded = await sessionB.mappings.get(created.mappingId);
    expect(loaded).toBeNull();

    const s3Config = await sessionB.mappings.getConfigByKey(created.configS3Key);
    expect(s3Config).toBeNull();
  });

  it('Save version 1 in Session A, retrieve in Session B with exact snapshot', async () => {
    const sessionA = createFreshSession();
    const project = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Version Parent A',
      slug: 'version-parent-a',
    });

    const mapping = await sessionA.mappings.create({
      projectId: project.projectId,
      name: 'Versioned Mapping',
      sourceSchemaId: fixtureMappingConfig.sourceSchemaRef?.schemaId,
      targetSchemaId: fixtureMappingConfig.targetSchemaRef?.schemaId,
      status: 'ready',
      ruleCount: 2,
      coverage: 50,
      config: buildConfig('Versioned Mapping', 1, 2),
    });

    const snapshotV1 = buildConfig('Version Snapshot 1', 1, 2);
    await sessionA.mappingVersions.save(mapping.mappingId, {
      version: 1,
      savedBy: 'integration-user',
      ruleCount: snapshotV1.rules.length,
      config: snapshotV1,
    });

    const sessionB = createFreshSession();
    const versionMeta = await sessionB.mappingVersions.get(mapping.mappingId, 1);
    expect(versionMeta).not.toBeNull();

    const version = versionMeta as NonNullable<typeof versionMeta>;
    expect(version.configS3Key).toBe(`mappings/${mapping.mappingId}/versions/v1.json`);
    expect(Number.isNaN(Date.parse(version.savedAt ?? version.createdAt))).toBe(false);

    const config = await sessionB.mappingVersions.getConfig(mapping.mappingId, 1);
    expect(config).toEqual({
      ...snapshotV1,
      id: mapping.mappingId,
      version: 1,
    });
  });

  it('Save versions 1 and 2; Session B retrieves each exact snapshot (no conflation)', async () => {
    const sessionA = createFreshSession();
    const project = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Version Parent B',
      slug: 'version-parent-b',
    });

    const mapping = await sessionA.mappings.create({
      projectId: project.projectId,
      name: 'Two-Version Mapping',
      sourceSchemaId: fixtureMappingConfig.sourceSchemaRef?.schemaId,
      targetSchemaId: fixtureMappingConfig.targetSchemaRef?.schemaId,
      status: 'ready',
      ruleCount: 2,
      coverage: 50,
      config: buildConfig('Two-Version Mapping', 1, 2),
    });

    const snapshotV1 = buildConfig('Snapshot V1', 1, 2);
    const snapshotV2 = buildConfig('Snapshot V2', 2, 3);

    await sessionA.mappingVersions.save(mapping.mappingId, {
      version: 1,
      savedBy: 'integration-user',
      ruleCount: snapshotV1.rules.length,
      config: snapshotV1,
    });
    await sessionA.mappingVersions.save(mapping.mappingId, {
      version: 2,
      savedBy: 'integration-user',
      ruleCount: snapshotV2.rules.length,
      config: snapshotV2,
    });

    const sessionB = createFreshSession();
    const v1 = await sessionB.mappingVersions.getConfig(mapping.mappingId, 1);
    const v2 = await sessionB.mappingVersions.getConfig(mapping.mappingId, 2);

    expect(v1).toEqual({ ...snapshotV1, id: mapping.mappingId, version: 1 });
    expect(v2).toEqual({ ...snapshotV2, id: mapping.mappingId, version: 2 });
    expect(v1?.rules).toHaveLength(2);
    expect(v2?.rules).toHaveLength(3);
  });

  it('Session B lists versions in descending order with valid metadata', async () => {
    const sessionA = createFreshSession();
    const project = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Version Parent C',
      slug: 'version-parent-c',
    });

    const mapping = await sessionA.mappings.create({
      projectId: project.projectId,
      name: 'Descending Version Mapping',
      sourceSchemaId: fixtureMappingConfig.sourceSchemaRef?.schemaId,
      targetSchemaId: fixtureMappingConfig.targetSchemaRef?.schemaId,
      status: 'ready',
      ruleCount: 1,
      coverage: 20,
      config: buildConfig('Descending Version Mapping', 1, 1),
    });

    await sessionA.mappingVersions.save(mapping.mappingId, {
      version: 1,
      savedBy: 'integration-user',
      ruleCount: 1,
      config: buildConfig('Desc V1', 1, 1),
    });
    await sessionA.mappingVersions.save(mapping.mappingId, {
      version: 2,
      savedBy: 'integration-user',
      ruleCount: 2,
      config: buildConfig('Desc V2', 2, 2),
    });
    await sessionA.mappingVersions.save(mapping.mappingId, {
      version: 3,
      savedBy: 'integration-user',
      ruleCount: 3,
      config: buildConfig('Desc V3', 3, 3),
    });

    const sessionB = createFreshSession();
    const versions = await sessionB.mappingVersions.list(mapping.mappingId);

    expect(versions.map((entry) => entry.version)).toEqual([3, 2, 1]);
    for (const entry of versions) {
      expect(Number.isNaN(Date.parse(entry.savedAt ?? entry.createdAt))).toBe(false);
      expect((entry.ruleCount ?? 0)).toBeGreaterThan(0);
      expect(entry.configS3Key ?? `mappings/${mapping.mappingId}/versions/v${entry.version}.json`).toBe(
        `mappings/${mapping.mappingId}/versions/v${entry.version}.json`,
      );
    }
  });

  it('Saved version snapshots stay isolated from later current mapping updates', async () => {
    const sessionA = createFreshSession();
    const project = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Version Isolation Parent',
      slug: 'version-isolation-parent',
    });

    const mapping = await sessionA.mappings.create({
      projectId: project.projectId,
      name: 'Version Isolation Mapping',
      sourceSchemaId: fixtureMappingConfig.sourceSchemaRef?.schemaId,
      targetSchemaId: fixtureMappingConfig.targetSchemaRef?.schemaId,
      status: 'ready',
      ruleCount: 2,
      coverage: 50,
      config: buildConfig('Version Isolation Mapping', 1, 2),
    });

    const snapshotV1 = buildConfig('Isolation Snapshot V1', 1, 2);
    const snapshotV2 = buildConfig('Isolation Snapshot V2', 2, 3);

    await sessionA.mappingVersions.save(mapping.mappingId, {
      version: 1,
      savedBy: 'integration-user',
      ruleCount: snapshotV1.rules.length,
      config: snapshotV1,
    });
    await sessionA.mappingVersions.save(mapping.mappingId, {
      version: 2,
      savedBy: 'integration-user',
      ruleCount: snapshotV2.rules.length,
      config: snapshotV2,
    });

    // Mutate current mapping config after saving historical snapshots.
    await sessionA.mappings.update(
      mapping.mappingId,
      {
        name: 'Version Isolation Mapping (Current Updated)',
        ruleCount: 1,
        coverage: 10,
      },
      buildConfig('Current Config After Snapshots', 3, 1),
    );

    const sessionB = createFreshSession();
    const v1 = await sessionB.mappingVersions.getConfig(mapping.mappingId, 1);
    const v2 = await sessionB.mappingVersions.getConfig(mapping.mappingId, 2);

    expect(v1).toEqual({ ...snapshotV1, id: mapping.mappingId, version: 1 });
    expect(v2).toEqual({ ...snapshotV2, id: mapping.mappingId, version: 2 });

    const current = await sessionB.mappings.get(mapping.mappingId);
    expect(current?.version).toBe(2);
    const currentConfig = current
      ? await sessionB.mappings.getConfigByKey(current.configS3Key)
      : null;
    expect(currentConfig?.name).toBe('Version Isolation Mapping (Current Updated)');
    expect(currentConfig?.rules).toHaveLength(1);
  });
});
